'use strict';

/**
 * runAgentRouted — the buttery wrapper around lib/agent-loop's runAgent.
 *
 * ONE place that does auto model routing + graceful NIM fallback, so every
 * surface (web SSE, web JSON, CLI `ask`, TUI) behaves identically:
 *   1. If no explicit model, classify the prompt → pick a lane (model-router).
 *   2. Walk the lane's NIM fallback chain. Switch models ONLY before the first
 *      token/tool has streamed (you can't rewrite a stream mid-flight), so a
 *      rate-limited primary (e.g. DeepSeek V4 Pro 429) glides to a sibling
 *      instead of hard-failing. Once output flows, a failure surfaces honestly.
 *
 * Yields everything runAgent yields, PLUS a `{ type: 'route', ... }` event each
 * time a model is selected (initial + each fallback hop) so UIs can show it.
 */

const { runAgent } = require('./agent-loop');
let routerMod = null;
try { routerMod = require('./model-router'); } catch (_) { routerMod = null; }
let registry = null;
try { registry = require('./pipeline-registry'); } catch (_) { registry = null; }

// Registry calls must NEVER break chat — every one is guarded.
const _safe = (fn) => { try { return fn(); } catch (_) { return null; } };

async function* runAgentRouted({ prompt, history = [], model, provider, lane, autoRoute = true, opts = {} }) {
  // v2.1 — DIRECT_CHAT / HYBRID_TASK gates via Usage Governor
  let _governor = null;
  try { _governor = require('./usage-governor'); } catch { _governor = null; }

  // DIRECT_CHAT: casual chat MUST be one model call, no swarm/agent fan-out
  if (_governor && _governor.guardDirectChat(prompt, opts)) {
    opts = { ...opts, singleCall: true, noFanout: true, role: 'chat_coordinator' };
    if (opts.onRoute) _safe(() => opts.onRoute({ route: 'DIRECT_CHAT', reason: 'casual chat' }));
  } else if (_governor) {
    // HYBRID_TASK: cap delegation per role budget
    const plan = _governor.guardHybridTask(prompt, { role: opts.role || 'builder_code_repair' });
    opts = { ...opts, maxParallel: plan.maxParallel, summariseFirst: plan.summariseFirst, role: plan.role };
    if (opts.onRoute) _safe(() => opts.onRoute({ route: 'HYBRID_TASK', plan }));
  }

  let routed = null;
  if (routerMod && (autoRoute || lane || model)) {
    try { routed = routerMod.route(prompt, { lane, model, provider }); } catch (_) { routed = null; }
  }

  // v2.1 — Per-hop provider: when a provider 429s, switch to the NEXT provider
  // (not just the next model on the same dead provider). This is the fix for
  // "MiniMax 429 → try next model on MiniMax → still 429 → stall forever."
  const chain = routed ? [routed.model, ...(routed.fallbacks || [])] : [model];
  const useProvider0 = routed ? routed.provider : provider;
  // Build a per-hop provider list: primary provider for hop 0, then NIM for hops 1+.
  // This means: MiniMax platform first, then NVIDIA NIM for fallbacks.
  function providerForHop(ci) {
    if (ci === 0) return useProvider0;
    // Hops 1+: use NIM (nvidia) with the NIM model ids from the chain.
    // If the chain model is a NIM id (contains '/'), use nvidia.
    const m = chain[ci] || '';
    if (m.includes('/')) return 'nvidia';
    return useProvider0;
  }

  // ── Phase 1 (Call): register this run so it's watchable + stoppable. ──────
  const job = registry && _safe(() => registry.start({
    pipeline: opts.pipeline || 'chat',
    project: opts.project || 'PURPCLAW',
    lane: (routed && routed.agent) || lane || 'TaskForge',
    trigger: opts.trigger || 'chat',
    risk: opts.risk || 'low',
    operator_approval: opts.operator_approval === true,
    inputs: { prompt: String(prompt || '').slice(0, 280) },
  }));
  const jobId = job && job.job_id;
  if (jobId) yield { type: 'job', job_id: jobId, lane: job.lane, project: job.project };

  let streamedAny = false;
  let lastErr = null;
  let toolCount = 0;

  try {
    for (let ci = 0; ci < chain.length; ci++) {
      const tryModel = chain[ci];
      if (jobId) _safe(() => registry.step(jobId, ci > 0 ? `fallback → ${tryModel}` : `running ${tryModel}`));
      yield {
        type: 'route',
        lane: routed ? routed.lane : null,
        model: tryModel,
        provider: providerForHop(ci),
        agent: routed ? routed.agent : null,
        label: routed ? routed.label : null,
        fallback: ci > 0,
        reason: ci > 0 ? `glided past ${String(lastErr).slice(0, 50)}` : (routed ? routed.reason : 'global default'),
      };

      try {
        for await (const ev of runAgent({ prompt, history, model: tryModel, provider: providerForHop(ci), opts })) {
          // ── Phase 4 (Stop): honor an operator stop request mid-run. ──────
          if (jobId) {
            const stop = _safe(() => registry.shouldStop(jobId));
            if (stop) {
              const term = stop.type === 'kill' ? 'killed' : (stop.type === 'quarantine' ? 'quarantined' : 'cancelled');
              _safe(() => registry.finish(jobId, { status: term, claim: `stopped (${stop.type}) at ${ev.type}`, tokensEstimate: toolCount * 200 }));
              yield { type: 'stopped', job_id: jobId, stopType: stop.type, reason: stop.reason };
              return;
            }
          }

          if (ev.type === 'token' || ev.type === 'tool-call') streamedAny = true;
          if (ev.type === 'tool-call' && jobId) { toolCount++; _safe(() => registry.tool(jobId, { tool: ev.tool, ok: true })); }
          if (ev.type === 'tool-result' && jobId && ev.tool) _safe(() => registry.tool(jobId, { tool: ev.tool, ok: ev.ok !== false, detail: 'result' }));

          // A pre-stream error event is a switch signal; once streaming it's terminal.
          if (ev.type === 'error' && !streamedAny && ci < chain.length - 1) {
            lastErr = ev.error || 'error';
            break; // try next model in the chain
          }
          // Finish BEFORE yielding 'done' — the consumer breaks on 'done', which
          // abandons this generator at the yield point, so any finish() placed
          // after the yield would never run (job stuck 'running' forever).
          if (ev.type === 'done') {
            if (jobId) _safe(() => registry.finish(jobId, { status: 'complete', claim: 'chat turn complete', proof: { result: 'pass', detail: `${ev.turns || 1} turn(s)` }, tokensEstimate: toolCount * 200 }));
            yield ev;
            return;
          }
          yield ev;
        }
        if (lastErr && !streamedAny && ci < chain.length - 1) continue;
        // Stream ended without an explicit 'done' — still a clean finish.
        if (jobId) _safe(() => registry.finish(jobId, { status: 'complete', claim: 'stream ended', proof: { result: 'pass' } }));
        return;
      } catch (err) {
        lastErr = (err && err.message) ? err.message : String(err);
        if (streamedAny || ci === chain.length - 1) {
          if (jobId) _safe(() => registry.finish(jobId, { status: 'failed', claim: lastErr, proof: { result: 'fail', detail: lastErr } }));
          throw err;
        }
        // else: glide to next model
      }
    }
  } catch (outer) {
    if (jobId) _safe(() => registry.finish(jobId, { status: 'failed', claim: String(outer && outer.message || outer) }));
    throw outer;
  }
}

module.exports = { runAgentRouted };
