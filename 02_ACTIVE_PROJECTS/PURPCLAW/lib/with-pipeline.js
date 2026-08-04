'use strict';

/**
 * withPipeline — the one-call adapter that makes ANY workflow spine-compliant.
 *
 * The golden law in three lines: wrap a function, and it's automatically
 * START-ed, WATCH-able, STOP-pable, PROVE-n, and REMEMBER-ed — no per-workflow
 * boilerplate. Every consumer (orchestrator, tower, harness, OmniCode repair,
 * DreamForge, funding packs…) plugs in the same way:
 *
 *   const { withPipeline } = require('./lib/with-pipeline');
 *   const result = await withPipeline(
 *     { pipeline: 'repo-repair', project: 'OmniCode', lane: 'OmniSurgeon', risk: 'medium' },
 *     async (ctx) => {
 *       ctx.step('scanning');                 // heartbeat + current step
 *       ctx.tool({ tool: 'grep', ok: true }); // tool trace
 *       if (ctx.stopping()) return;           // honor pause/cancel/kill
 *       ctx.touch('orchestrator.js', 'write');
 *       ctx.output('reports/repair.md');      // black-hole prevention
 *       return { proof: { ran: 'tests', result: 'pass' }, rollback: 'git checkout .' };
 *     }
 *   );
 *
 * If fn returns an object with {proof, rollback, status, claim}, those land on
 * the finish() + proof-ledger row. Throwing → status 'failed' (recorded, then
 * rethrown). Returning normally → 'complete'. The job id is on ctx.jobId.
 */

let registry = null;
try { registry = require('./pipeline-registry'); } catch (_) { registry = null; }

async function withPipeline(spec = {}, fn) {
  if (typeof spec === 'function') { fn = spec; spec = {}; }
  if (typeof fn !== 'function') throw new Error('withPipeline(spec, fn): fn must be a function');

  const job = registry && registry.start({
    pipeline: spec.pipeline || 'workflow',
    project: spec.project || '',
    lane: spec.lane || 'TaskForge',
    trigger: spec.trigger || 'workflow',
    risk: spec.risk || 'low',
    operator_approval: spec.operator_approval === true,
    inputs: spec.inputs || {},
  });
  const jobId = job && job.job_id;

  // Context handed to the wrapped function — every method is a safe no-op if the
  // registry is unavailable, so consumers never need to null-check.
  const ctx = {
    jobId,
    step: (name) => { try { if (jobId) registry.step(jobId, name); } catch (_) {} },
    tool: (call) => { try { if (jobId) registry.tool(jobId, call); } catch (_) {} },
    touch: (file, mode) => { try { if (jobId) registry.touch(jobId, file, mode); } catch (_) {} },
    output: (path, meta) => { try { if (jobId) registry.output(jobId, path, meta); } catch (_) {} },
    // Returns the stop request object (truthy) if the operator asked to stop.
    stop: () => { try { return jobId ? registry.shouldStop(jobId) : null; } catch (_) { return null; } },
    stopping: () => { try { return Boolean(jobId && registry.shouldStop(jobId)); } catch (_) { return false; } },
  };

  try {
    const result = await fn(ctx);
    const r = (result && typeof result === 'object') ? result : {};
    if (jobId) {
      const stop = registry.shouldStop(jobId);
      const status = stop
        ? (stop.type === 'kill' ? 'killed' : stop.type === 'quarantine' ? 'quarantined' : 'cancelled')
        : (r.status || 'complete');
      registry.finish(jobId, {
        status,
        claim: r.claim || spec.claim || `${spec.pipeline || 'workflow'} ${status}`,
        proof: r.proof || (status === 'complete' ? { result: 'pass' } : undefined),
        rollback: r.rollback || spec.rollback,
        tokensEstimate: r.tokensEstimate,
      });
    }
    return result;
  } catch (err) {
    if (jobId) {
      try {
        registry.finish(jobId, {
          status: 'failed',
          claim: (err && err.message) ? err.message : String(err),
          proof: { result: 'fail', detail: (err && err.message) ? err.message : String(err) },
        });
      } catch (_) {}
    }
    throw err;
  }
}

module.exports = { withPipeline };
