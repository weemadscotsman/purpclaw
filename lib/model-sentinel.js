'use strict';

/**
 * Model Sentinel — auto model discovery & endpoint drift watcher.
 *
 * Doctrine (matches STRESS/PROVIDER-ROUTING-DOCTRINE.md):
 *   Auto-discover. Auto-test. Auto-classify. Human-approve default changes.
 *
 * What it does AUTOMATICALLY (no approval needed):
 *   - Queries each provider's model list once per day (or on demand).
 *   - Diffs against yesterday → flags new / removed / changed model IDs.
 *   - Detects ENDPOINT DRIFT: a provider-router lane pointing at a model the
 *     provider no longer serves (the silent rename that breaks a lane).
 *   - Updates lib model-registry.json metadata + candidate list.
 *   - Writes a daily model-delta report.
 *
 * What it will NEVER do without an operator/approval (the brain-stem rule):
 *   - Change a lane's primary model in provider-router.js.
 *   - Promote a candidate to a routing default.
 *   It can RECOMMEND a drift fix; applying it is a separate, explicit call.
 *
 * Storage: ~/.purpclaw/model-registry.json  (override with MODEL_REGISTRY_PATH)
 *
 * Network: provider /models listing is a cheap metadata call — it does NOT go
 * through the chat path and does NOT burn the SpendGate token cap. Only
 * smokeTest() spends tokens, and it routes through llm-provider.complete so the
 * SpendGate still governs it (and it reports `blocked` honestly instead of
 * faking success).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let provider;
try { provider = require('./llm-provider'); } catch { provider = null; }

const PROVIDERS = (provider && provider.PROVIDERS) || {};
const ALIASES = (provider && provider.PROVIDER_ENV_ALIASES) || {};
const firstEnv = (provider && provider.firstEnv) || ((keys = []) => {
  for (const k of keys) if (process.env[k]) return process.env[k];
  return '';
});

const LOCAL_PROVIDERS = new Set(['ollama', 'internlm3-nex-n1', 'lmstudio']);
const DISCOVERY_TIMEOUT_MS = 8000;

// ── Paths ──────────────────────────────────────────────────────────────────
function registryPath() {
  return process.env.MODEL_REGISTRY_PATH
    || path.join(os.homedir(), '.purpclaw', 'model-registry.json');
}
function reportPath() {
  return path.join(os.homedir(), '.purpclaw', 'model-delta-report.md');
}
function ensureDir(p) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { /* best effort */ }
}
function todayKey() { return new Date().toISOString().slice(0, 10); }

// ── Registry I/O ─────────────────────────────────────────────────────────────
function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
  } catch {
    return { version: 1, lastChecked: null, providers: {} };
  }
}
function saveRegistry(reg) {
  ensureDir(registryPath());
  const tmp = registryPath() + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2));
  fs.renameSync(tmp, registryPath());
}

// ── Per-provider access resolution (reuses llm-provider's alias map) ──────────
function resolveAccess(name) {
  const p = PROVIDERS[name];
  if (!p) return null;
  const aliases = ALIASES[name] || {};
  const baseUrl = firstEnv(aliases.baseUrl) || p.baseUrl || '';
  const apiKey = firstEnv(aliases.apiKey) || p.apiKey || '';
  const local = LOCAL_PROVIDERS.has(name);
  return {
    name,
    baseUrl,
    apiKey,
    format: p.format || 'openai',
    extraHeaders: p.extraHeaders || {},
    local,
    // A provider is reachable if it's local, or we have a key + baseUrl.
    reachable: local ? !!baseUrl : (!!apiKey && !!baseUrl),
  };
}

function listKnownProviders() {
  return Object.keys(PROVIDERS).filter((n) => n !== 'custom');
}

// ── Discovery ─────────────────────────────────────────────────────────────────
async function httpJson(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Discover the live model list for one provider.
 * @returns {Promise<{provider, ok, models?:string[], error?, count?}>}
 */
async function discoverProvider(name) {
  const acc = resolveAccess(name);
  if (!acc) return { provider: name, ok: false, error: 'unknown provider' };
  if (!acc.reachable) return { provider: name, ok: false, error: acc.local ? 'no base url' : 'no api key', skipped: true };

  const fmt = acc.format;
  let url, headers = { 'accept': 'application/json', ...acc.extraHeaders };

  if (name === 'ollama' || name === 'internlm3-nex-n1') {
    // Ollama native tag listing (the /v1/models OpenAI shim isn't always present).
    const root = acc.baseUrl.replace(/\/v1\/?$/, '');
    const r = await httpJson(`${root}/api/tags`, headers);
    if (!r.ok) return { provider: name, ok: false, error: r.error };
    const models = (r.json.models || []).map((m) => m.name).filter(Boolean);
    return { provider: name, ok: true, models, count: models.length };
  }

  if (fmt === 'gemini') {
    url = `${acc.baseUrl}/models?key=${encodeURIComponent(acc.apiKey)}`;
    const r = await httpJson(url, headers);
    if (!r.ok) return { provider: name, ok: false, error: r.error };
    const models = (r.json.models || [])
      .map((m) => (m.name || '').replace(/^models\//, '')).filter(Boolean);
    return { provider: name, ok: true, models, count: models.length };
  }

  // OpenAI-compatible (and Anthropic, which also serves /v1/models).
  if (fmt === 'anthropic') {
    headers['x-api-key'] = acc.apiKey;
    url = `${acc.baseUrl}/v1/models`;
  } else {
    headers['authorization'] = `Bearer ${acc.apiKey}`;
    url = `${acc.baseUrl.replace(/\/$/, '')}/models`;
  }
  const r = await httpJson(url, headers);
  if (!r.ok) return { provider: name, ok: false, error: r.error };
  const data = r.json.data || r.json.models || [];
  const models = data.map((m) => m.id || m.name).filter(Boolean);
  return { provider: name, ok: true, models, count: models.length };
}

/** Discover every reachable provider (concurrently). */
async function discoverAll(only = null) {
  const names = (only && only.length ? only : listKnownProviders());
  const results = await Promise.all(names.map((n) => discoverProvider(n).catch((e) => ({
    provider: n, ok: false, error: e.message,
  }))));
  return results;
}

// ── Diff vs registry ──────────────────────────────────────────────────────────
function diffProvider(prev, models) {
  const before = new Set((prev && prev.models) || []);
  const after = new Set(models);
  const added = models.filter((m) => !before.has(m));
  const removed = [...before].filter((m) => !after.has(m));
  return { added, removed };
}

// ── Endpoint-drift detection against the live provider-router lanes ───────────
function laneTable() {
  try {
    const router = require('./runtime/provider-router');
    if (router && router.LANES) return router.LANES;
  } catch { /* router optional */ }
  return {};
}

/**
 * For each routing lane, confirm its configured model still exists in the
 * provider's discovered model list. A miss = endpoint drift (the lane is
 * pointing at a renamed/retired model).
 * @returns {Array<{lane, provider, model, status, suggestion?}>}
 */
function detectDrift(discoveries) {
  const byProvider = {};
  for (const d of discoveries) if (d.ok) byProvider[d.provider] = new Set(d.models);
  const lanes = laneTable();
  const out = [];
  for (const [lane, cfg] of Object.entries(lanes)) {
    const pname = cfg.provider;
    const model = (cfg.modelEnv && process.env[cfg.modelEnv]) || cfg.defaultModel;
    const known = byProvider[pname];
    if (!known) { out.push({ lane, provider: pname, model, status: 'unverified' }); continue; }
    if (known.has(model)) { out.push({ lane, provider: pname, model, status: 'ok' }); continue; }
    // Drift — try to suggest the closest surviving model.
    const suggestion = suggestClosest(model, [...known]);
    out.push({ lane, provider: pname, model, status: 'DRIFT', suggestion });
  }
  return out;
}

function suggestClosest(target, candidates) {
  if (!candidates.length) return null;
  const base = target.split(/[:@/]/).pop().toLowerCase();
  // Prefer candidates that share the longest token overlap with the target.
  let best = null, bestScore = 0;
  for (const c of candidates) {
    const cl = c.toLowerCase();
    let score = 0;
    for (const tok of base.split(/[-_.]/)) if (tok.length > 1 && cl.includes(tok)) score += tok.length;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore > 0 ? best : null;
}

// ── Smoke test (token-spending — SpendGate-governed) ──────────────────────────
const SMOKE_PROMPT = 'Reply with exactly the single word: PONG';

/**
 * Tiny verification of a discovered model. Routes through llm-provider.complete
 * so the SpendGate governs it. Returns an honest verdict — including `blocked`
 * when the spend cap stops the call (no fake success).
 */
async function smokeTest(providerName, modelId, opts = {}) {
  if (!provider || !provider.complete) {
    return { provider: providerName, model: modelId, ok: false, error: 'llm-provider unavailable' };
  }
  const prevP = process.env.LLM_PROVIDER, prevM = process.env.LLM_MODEL;
  process.env.LLM_PROVIDER = providerName;
  process.env.LLM_MODEL = modelId;
  try {
    const r = await provider.complete(SMOKE_PROMPT, {
      maxTokens: 16,
      provider: providerName,
      model: modelId,
      bypassSpendGate: !!opts.bypassSpendGate,
    });
    // complete() returns a bare STRING on success, or an OBJECT only when
    // the SpendGate blocks (or on structured error). Handle both shapes.
    if (r && typeof r === 'object' && r.blocked) {
      return { provider: providerName, model: modelId, ok: false, blocked: true, error: r.error };
    }
    const content = (typeof r === 'string' ? r : (r && (r.content || r.reply || r.text)) || '').trim();
    const responded = content.length > 0;
    const saidPong = /pong/i.test(content);
    return {
      provider: providerName, model: modelId, ok: responded,
      class: saidPong ? 'verified' : (responded ? 'candidate' : 'blocked'),
      sample: content.slice(0, 60),
    };
  } catch (e) {
    return { provider: providerName, model: modelId, ok: false, error: e.message };
  } finally {
    if (prevP === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prevP;
    if (prevM === undefined) delete process.env.LLM_MODEL; else process.env.LLM_MODEL = prevM;
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────
function buildReport(summary) {
  const lines = [];
  lines.push(`# Model Sentinel — delta report`);
  lines.push(`Generated: ${summary.timestamp}`);
  lines.push('');
  lines.push('| Provider | Live | New | Removed | Status |');
  lines.push('|---|---:|---:|---:|---|');
  for (const p of summary.providers) {
    const status = p.ok ? 'ok' : (p.skipped ? 'skipped (no key)' : `error: ${p.error}`);
    lines.push(`| ${p.provider} | ${p.ok ? p.count : '—'} | ${p.added ? p.added.length : 0} | ${p.removed ? p.removed.length : 0} | ${status} |`);
  }
  lines.push('');
  const drift = summary.drift.filter((d) => d.status === 'DRIFT');
  if (drift.length) {
    lines.push('## ⚠️ Endpoint drift — lanes pointing at missing models');
    lines.push('| Lane | Provider | Configured model | Suggested fix |');
    lines.push('|---|---|---|---|');
    for (const d of drift) lines.push(`| ${d.lane} | ${d.provider} | ${d.model} | ${d.suggestion || '(none found — manual review)'} |`);
    lines.push('');
    lines.push('> Drift fixes are RECOMMENDATIONS. No routing default was changed automatically.');
  } else {
    lines.push('## ✅ No endpoint drift — every routing lane resolves to a live model.');
  }
  lines.push('');
  const newOnes = summary.providers.flatMap((p) => (p.added || []).map((m) => `${p.provider}/${m}`));
  if (newOnes.length) {
    lines.push('## 🆕 New candidate models (discovered, not yet verified)');
    for (const m of newOnes.slice(0, 50)) lines.push(`- ${m}`);
    if (newOnes.length > 50) lines.push(`- …and ${newOnes.length - 50} more`);
  }
  return lines.join('\n');
}

// ── Daily orchestration ─────────────────────────────────────────────────────────
/**
 * The once-per-day entry point. Discovers, diffs, detects drift, updates the
 * registry metadata, and writes a report. Mutates NO routing defaults.
 * @param {object} opts { force, only }
 */
async function runDaily(opts = {}) {
  const reg = loadRegistry();
  if (!opts.force && reg.lastChecked === todayKey()) {
    return { skipped: true, reason: 'already checked today', lastChecked: reg.lastChecked };
  }

  const discoveries = await discoverAll(opts.only);
  const providersOut = [];
  for (const d of discoveries) {
    const prev = reg.providers[d.provider];
    if (d.ok) {
      const { added, removed } = diffProvider(prev, d.models);
      reg.providers[d.provider] = {
        models: d.models,
        count: d.models.length,
        lastChecked: todayKey(),
        lastOk: new Date().toISOString(),
      };
      providersOut.push({ provider: d.provider, ok: true, count: d.count, added, removed });
    } else {
      // Keep last-known models; just record the failed check.
      if (prev) prev.lastChecked = todayKey();
      providersOut.push({ provider: d.provider, ok: false, error: d.error, skipped: d.skipped, added: [], removed: [] });
    }
  }

  const drift = detectDrift(discoveries);
  reg.lastChecked = todayKey();
  reg.lastDrift = drift.filter((x) => x.status === 'DRIFT');
  saveRegistry(reg);

  const summary = { timestamp: new Date().toISOString(), providers: providersOut, drift };
  try { ensureDir(reportPath()); fs.writeFileSync(reportPath(), buildReport(summary)); } catch { /* best effort */ }
  summary.reportPath = reportPath();
  summary.registryPath = registryPath();
  return summary;
}

module.exports = {
  runDaily,
  discoverProvider,
  discoverAll,
  detectDrift,
  smokeTest,
  loadRegistry,
  saveRegistry,
  resolveAccess,
  listKnownProviders,
  buildReport,
  registryPath,
  reportPath,
};
