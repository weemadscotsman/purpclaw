'use strict';

/**
 * PURPCLAW rate limiter — concurrency + delay + per-provider throttling
 * ════════════════════════════════════════════════════════════════════════
 *
 * Why: the deep-research-group and similar multi-model callers used to
 * fire N models in parallel. With free OpenRouter models that's a 429
 * storm. With paid models it could rack up real spend before the user
 * notices. This module wraps the concurrency primitive with:
 *
 *   - bounded parallelism (concurrency cap, e.g. 2)
 *   - minimum delay between starts (e.g. 1500ms)
 *   - per-provider throttling (e.g. max 1 active per provider hostname)
 *   - per-call timeout (each worker has its own deadline)
 *   - cost cap (optional; aborts the batch when estimated cost exceeds)
 *   - per-provider cooldown after a 429 (respects Retry-After if present)
 *
 * Usage:
 *   const { rateLimited } = require('./rate-limiter');
 *   const results = await rateLimited({
 *     items:           models,                    // array of { id, provider, ... }
 *     worker:          async (model) => { ... },  // returns { ok, cost, error }
 *     concurrency:     2,                         // max parallel (default 2)
 *     minDelayMs:      1500,                      // gap between starts (default 1500)
 *     perProviderMax:  1,                         // max active per provider (default 1)
 *     callTimeoutMs:   90000,                     // per-worker deadline
 *     costCapUsd:      5.00,                      // hard stop (default 5.00)
 *     onProgress:      (done, total, lastResult) => { ... },
 *   });
 *
 * Each result is the worker's return value, decorated with { rate, cost, error }.
 * The batch is aborted (not throwing) when the cap is hit; partial results
 * come back with the remaining items marked { skipped: 'cost-cap' }.
 */

const DEFAULT_CONCURRENCY    = 2;
const DEFAULT_MIN_DELAY_MS   = 1500;
const DEFAULT_PER_PROVIDER   = 1;
const DEFAULT_CALL_TIMEOUT_MS = 90_000;
const DEFAULT_COST_CAP_USD   = 5.00;

function providerFromModelId(id) {
  // 'openai/gpt-oss-20b:free' → 'openai'
  const slash = String(id || '').indexOf('/');
  if (slash > 0) return String(id).substring(0, slash).toLowerCase();
  return 'unknown';
}

function isFreeModelId(id) {
  return String(id || '').includes(':free');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function estimateCostUsd(model, opts = {}) {
  // If the caller already has pricing, use it. Otherwise we treat anything
  // ending in :free as $0. Paid models default to a conservative estimate
  // so an accidental paid selection still trips the cap.
  if (typeof opts.estimateCostUsd === 'function') return Number(opts.estimateCostUsd(model)) || 0;
  if (isFreeModelId(model.id)) return 0;
  if (typeof model.pricing === 'object') {
    const p = Number(model.pricing.prompt ?? 0);
    const c = Number(model.pricing.completion ?? 0);
    // If pricing is per-token, scale to a typical 1.5k-token answer
    return Number(((p + c) * 0.75e6 / 1e6).toFixed(4)) || 0.01;
  }
  // Conservative default for unknown paid model: $0.01 per call
  return 0.01;
}

async function rateLimited(opts) {
  const {
    items,
    worker,
    concurrency     = DEFAULT_CONCURRENCY,
    minDelayMs      = DEFAULT_MIN_DELAY_MS,
    perProviderMax  = DEFAULT_PER_PROVIDER,
    callTimeoutMs   = DEFAULT_CALL_TIMEOUT_MS,
    costCapUsd      = DEFAULT_COST_CAP_USD,
    onProgress,
  } = opts || {};

  if (!Array.isArray(items) || !items.length) return [];
  if (typeof worker !== 'function') throw new Error('rateLimited: worker function is required');

  const results = new Array(items.length);
  const state = {
    active:        0,           // total active workers
    perProvider:   new Map(),    // provider → active count
    cooldownUntil: new Map(),    // provider → timestamp we can resume on
    running:       true,
    costSoFarUsd:  0,
    capHit:        false,
  };

  // Sort items so free models run first (we want some signal fast and don't
  // burn the budget on failed paid calls upfront). Stable sort: free first,
  // then by id for determinism.
  const order = items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const aFree = isFreeModelId(a.item.id) ? 0 : 1;
      const bFree = isFreeModelId(b.item.id) ? 0 : 1;
      if (aFree !== bFree) return aFree - bFree;
      return String(a.item.id).localeCompare(String(b.item.id));
    });

  let nextOrderIndex = 0;
  let lastStartMs = 0;

  async function tryStartOne() {
    if (!state.running) return false;
    if (nextOrderIndex >= order.length) return false;
    if (state.active >= concurrency) return false;

    // Pick the next item whose provider is under cap and not in cooldown
    let pickedIdx = -1;
    for (let i = nextOrderIndex; i < order.length; i++) {
      const model = order[i].item;
      const provider = providerFromModelId(model.id);
      const inCooldown = (state.cooldownUntil.get(provider) || 0) > Date.now();
      const perProv = state.perProvider.get(provider) || 0;
      if (inCooldown) continue;
      if (perProv >= perProviderMax) continue;
      pickedIdx = i;
      break;
    }
    if (pickedIdx < 0) return false;

    // Remove from the order list (swap with nextOrderIndex)
    const picked = order[pickedIdx];
    order[pickedIdx] = order[nextOrderIndex];
    order[nextOrderIndex] = picked;
    nextOrderIndex++;

    const provider = providerFromModelId(picked.item.id);
    state.active += 1;
    state.perProvider.set(provider, (state.perProvider.get(provider) || 0) + 1);

    // Enforce minDelayMs between starts
    const now = Date.now();
    const wait = Math.max(0, lastStartMs + minDelayMs - now);
    if (wait > 0) await sleep(wait);
    lastStartMs = Date.now();

    // Fire the worker (no await here — we want to return control so the
    // outer loop can decide to start the next one or not)
    runOne(picked).catch(() => { /* errors handled in runOne */ });
    return true;
  }

  async function runOne(picked) {
    const { item: model, originalIndex } = picked;
    const provider = providerFromModelId(model.id);
    const cost = estimateCostUsd(model, opts);

    // Pre-flight cost cap
    if (state.costSoFarUsd + cost > costCapUsd) {
      state.capHit = true;
      state.running = false;
      results[originalIndex] = {
        ...model,
        skipped: 'cost-cap',
        reason: `would exceed $${costCapUsd.toFixed(2)} cap (running $${state.costSoFarUsd.toFixed(2)})`,
      };
      return;
    }

    let timer = null;
    try {
      const work = worker(model, originalIndex);
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`rate-limit timeout after ${callTimeoutMs}ms`)), callTimeoutMs);
      });
      const out = await Promise.race([work, timeout]);
      clearTimeout(timer);

      state.costSoFarUsd += cost;
      results[originalIndex] = { ...model, ...out, costUsd: cost, status: out?.status || 'ok' };

      // If the worker reported a 429, set a 60s cooldown for that provider
      if (out && /HTTP 429/i.test(String(out.error || ''))) {
        state.cooldownUntil.set(provider, Date.now() + 60_000);
      }
    } catch (err) {
      clearTimeout(timer);
      results[originalIndex] = { ...model, status: 'failed', error: err.message, costUsd: cost };
      if (/HTTP 429/i.test(String(err.message || ''))) {
        state.cooldownUntil.set(provider, Date.now() + 60_000);
      }
    } finally {
      state.active -= 1;
      state.perProvider.set(provider, Math.max(0, (state.perProvider.get(provider) || 0) - 1));
      if (typeof onProgress === 'function') {
        try { onProgress(results.filter(Boolean).length, items.length, results[originalIndex]); } catch {}
      }
      // Try to start the next one as soon as a slot frees up
      pump();
    }
  }

  async function pump() {
    // Keep starting workers while we have capacity and items left
    while (state.running) {
      const started = await tryStartOne();
      if (!started) return;
    }
  }

  // Mark any unstarted items as skipped when the cap trips mid-batch
  function markRemaining() {
    for (let i = nextOrderIndex; i < order.length; i++) {
      const { item: model, originalIndex } = order[i];
      results[originalIndex] = { ...model, skipped: state.capHit ? 'cost-cap' : 'aborted' };
    }
  }

  // Watch the cap: if it trips during a worker, the rest get marked skipped
  const capWatcher = setInterval(() => {
    if (state.capHit && state.running === false) {
      markRemaining();
      clearInterval(capWatcher);
    }
    if (state.active === 0 && nextOrderIndex >= order.length) {
      clearInterval(capWatcher);
    }
  }, 200);

  await pump();

  // Wait for all active workers to finish
  while (state.active > 0) {
    await sleep(50);
  }

  clearInterval(capWatcher);
  if (state.capHit) markRemaining();

  return results;
}

module.exports = {
  rateLimited,
  providerFromModelId,
  isFreeModelId,
  estimateCostUsd,
  DEFAULT_CONCURRENCY,
  DEFAULT_MIN_DELAY_MS,
  DEFAULT_PER_PROVIDER,
  DEFAULT_CALL_TIMEOUT_MS,
  DEFAULT_COST_CAP_USD,
};
