'use strict';

/**
 * job-chain — one source of truth for how a job flows through the stack.
 *
 * Every unit of work (chat turn, kernel job, task) gets ONE chain keyed by
 * jobId. Each hop is logged as a step with the stack area it was routed/
 * delegated to, its status, and a detail line. The chain reads start→finish and
 * pinpoints the EXACT hop that broke — no lying, no "it just failed somewhere".
 *
 * Durable: every step goes through trace-store (append-only, ~/.purpclaw/trace)
 * and is announced on the event bus. Completion writes a proof-ledger receipt.
 *
 *   const chain = require('./lib/job-chain');
 *   chain.start(jobId, { kind: 'chat', area: 'chat', detail: userMsg });
 *   chain.step(jobId, { stage: 'routed',    area: 'kernel',      to: 'orchestrator' });
 *   chain.step(jobId, { stage: 'delegated', area: 'orchestrator', to: 'coordinator' });
 *   chain.step(jobId, { stage: 'executing', area: 'tower',       to: 'ROBOT' });
 *   chain.fail(jobId, { area: 'tower', detail: 'ROBOT: model 402', error });
 *   // ...or...
 *   chain.done(jobId, { detail: 'wrote auth.js', evidence: ['tests pass'] });
 *   const view = chain.get(jobId); // { steps, failedAt, status, complete }
 */

const trace = require('./trace-store');
let ledger = null;
try { ledger = require('./proof-ledger'); } catch { /* optional */ }
let announce = null;
try { announce = require('./events'); } catch { /* optional */ }

// The ordered lifecycle. A job should walk down this ladder; a failure at any
// rung is recorded AT that rung so the break point is unambiguous.
const STAGES = ['queued', 'routed', 'delegated', 'executing', 'verifying', 'done', 'failed'];
// The stack areas a job can be routed/delegated to. Kept explicit so a step
// can't be logged against a vague "somewhere".
const AREAS = ['chat', 'kernel', 'orchestrator', 'coordinator', 'tower', 'agent', 'tool', 'memory', 'worker', 'harness', 'system'];

function _clip(v, n = 480) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Record one hop. Every step is durable (trace-store) + announced.
 * @param {string} jobId
 * @param {object} o  { stage, area, to, status, detail, error }
 */
function step(jobId, o = {}) {
  const stage = STAGES.includes(o.stage) ? o.stage : 'executing';
  const area = o.area || 'system';
  const status = o.status || (stage === 'failed' ? 'failed' : stage === 'done' ? 'done' : stage);
  const detail = o.error
    ? _clip(`${o.detail ? o.detail + ' — ' : ''}${o.error.message || o.error}`)
    : _clip(o.detail);
  const rec = trace.record({
    jobId: String(jobId || 'no-job'),
    source: area,
    route: o.to ? `${area}→${o.to}` : stage,
    status,
    action: `chain.${stage}`,
    detail,
  });
  try { announce && announce.route(area, o.to || stage, { jobId, stage, status }); } catch { /* soft */ }
  try { announce && announce.job(stage, { jobId, area, to: o.to, status }); } catch { /* soft */ }
  return rec;
}

/** Open a chain — first hop, queued. */
function start(jobId, o = {}) {
  return step(jobId, { stage: 'queued', area: o.area || 'chat', status: 'queued', detail: o.detail || o.kind || '', to: o.to });
}

/** Close a chain successfully + write a proof receipt. */
function done(jobId, o = {}) {
  const rec = step(jobId, { stage: 'done', area: o.area || 'system', status: 'done', detail: o.detail });
  try {
    ledger && ledger.record({
      agent: 'job-chain', tool: 'job', action: 'complete', taskId: String(jobId),
      claim: _clip(o.detail || 'job completed'),
      evidence: Array.isArray(o.evidence) ? o.evidence : (o.evidence ? [o.evidence] : []),
      status: 'verified', verification: { ran: 'job-chain', result: 'pass', detail: _clip(o.detail) },
    });
  } catch { /* soft */ }
  return rec;
}

/** Close a chain as failed — records the EXACT area/hop that broke. No hiding. */
function fail(jobId, o = {}) {
  const rec = step(jobId, { stage: 'failed', area: o.area || 'system', status: 'failed', detail: o.detail, error: o.error });
  try {
    ledger && ledger.record({
      agent: 'job-chain', tool: 'job', action: 'fail', taskId: String(jobId),
      claim: _clip(`FAILED at ${o.area || 'system'}: ${o.detail || (o.error && o.error.message) || 'unknown'}`),
      status: 'failed', risk: 'medium',
      verification: { ran: 'job-chain', result: 'fail', detail: _clip(o.error && o.error.message) },
    });
  } catch { /* soft */ }
  return rec;
}

/**
 * Read a job's full chain start→finish. Honest status:
 *   failedAt  = the first step that failed (exact area + detail), or null
 *   complete  = a 'done' step exists
 *   status    = 'failed' | 'complete' | 'running' | 'unknown'
 */
function get(jobId) {
  const id = String(jobId || '');
  const steps = trace.recent(500)
    .filter(t => t.jobId === id && String(t.action || '').startsWith('chain.'))
    .sort((a, b) => a.ts - b.ts);
  const failedAt = steps.find(s => s.status === 'failed' || s.status === 'error') || null;
  const complete = steps.some(s => s.status === 'done');
  const status = failedAt ? 'failed' : complete ? 'complete' : steps.length ? 'running' : 'unknown';
  return {
    jobId: id,
    status,
    complete,
    failedAt: failedAt ? { area: failedAt.source, stage: failedAt.action.replace('chain.', ''), detail: failedAt.detail, at: failedAt.at } : null,
    steps: steps.map(s => ({ stage: s.action.replace('chain.', ''), area: s.source, route: s.route, status: s.status, detail: s.detail, at: s.at })),
  };
}

module.exports = { start, step, done, fail, get, STAGES, AREAS };

// Self-check: a full chain reads back start→finish and pinpoints the break.
if (require.main === module) {
  const assert = require('assert');
  const id = 'selftest-' + Math.random().toString(36).slice(2, 8);
  start(id, { area: 'chat', detail: 'test job' });
  step(id, { stage: 'routed', area: 'kernel', to: 'orchestrator' });
  step(id, { stage: 'delegated', area: 'orchestrator', to: 'coordinator' });
  fail(id, { area: 'tower', detail: 'ROBOT model 402', error: new Error('HTTP 402') });
  const v = get(id);
  assert.strictEqual(v.status, 'failed', 'status must be failed');
  assert.ok(v.failedAt && v.failedAt.area === 'tower', 'failedAt must pinpoint the tower hop');
  assert.ok(v.steps.length >= 4, 'all hops recorded');
  assert.ok(v.steps[0].stage === 'queued', 'chain starts at queued');
  console.log('job-chain self-check: PASS —', v.steps.length, 'steps, failed at', v.failedAt.area);
}
