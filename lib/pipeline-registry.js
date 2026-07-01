'use strict';

/**
 * pipeline-registry — the unified PURPCLAW pipeline spine.
 *
 * The One Rule: no pipeline exists without a call/stop/log/output/proof path.
 * This is the single place every run is recorded, watched, stopped, and health-
 * scanned — so kernel jobs, orchestrator workflows, harness missions, and new
 * pipelines all share ONE contract instead of being agent soup.
 *
 *   call → route → run → watch → stop → log → verify → repair → archive
 *
 * Lifecycle:
 *   const job = reg.start({ pipeline:'build-leak-trace', project:'PURPCLAW',
 *                           lane:'OmniSurgeon', trigger:'cli', risk:'medium',
 *                           inputs:{ target:'orchestrator.js' } });
 *   reg.step(job.job_id, 'scanning ports');
 *   reg.tool(job.job_id, { tool:'grep', ok:true });
 *   reg.touch(job.job_id, 'orchestrator.js', 'write');
 *   if (reg.shouldStop(job.job_id)) { ...honor it... }
 *   reg.output(job.job_id, 'reports/leak-trace.md');
 *   reg.finish(job.job_id, { status:'complete',
 *     proof:{ ran:'curl :7784/api/system/health', result:'pass' },
 *     rollback:'git checkout orchestrator.js' });
 *
 * Durable (jsonl + .bak), append-only history, zero heavy deps. Writes a
 * proof-ledger row on finish so the evidence trail is automatic.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

let proofLedger = null;
try { proofLedger = require('./proof-ledger'); } catch (_) { proofLedger = null; }

const DIR = path.join(os.homedir(), '.purpclaw', 'pipelines');
const FILE = path.join(DIR, 'jobs.jsonl');
const BAK = `${FILE}.bak`;
const MAX_MEMORY = 2000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Health timing (ms). A "running" job that hasn't beaten its heartbeat is
// hiding (then dying). Tunable via env for slow boxes.
const HIDE_MS = Number(process.env.PURPCLAW_JOB_HIDE_MS || 90_000);     // 90s no beat → hiding
const DIE_MS = Number(process.env.PURPCLAW_JOB_DIE_MS || 300_000);      // 5m no beat → dead
const LOOP_REPEAT = Number(process.env.PURPCLAW_JOB_LOOP_REPEAT || 6);  // same step Nx → looping
const SEEK_TOOLS = Number(process.env.PURPCLAW_JOB_SEEK_TOOLS || 25);   // tool calls, no output → seeking

const STATUS = new Set(['queued', 'running', 'paused', 'complete', 'failed', 'cancelled', 'killed', 'quarantined', 'rolled-back']);
const RISK = new Set(['none', 'low', 'medium', 'high', 'critical']);
const STOP_TYPES = new Set(['pause', 'cancel', 'kill', 'quarantine', 'rollback']);

const bus = new EventEmitter();
bus.setMaxListeners(200);

const jobs = new Map();       // job_id -> live record
const stopReq = new Map();    // job_id -> { type, at, reason }

function ensure() { fs.mkdirSync(DIR, { recursive: true }); }
function now() { return Date.now(); }
function nowIso() { return new Date().toISOString(); }
function clip(v, n = 300) { if (v == null) return ''; const t = typeof v === 'string' ? v : JSON.stringify(v); return t.length > n ? `${t.slice(0, n)}…` : t; }
function pick(set, v, fb) { const x = String(v || '').toLowerCase(); return set.has(x) ? x : fb; }

function persist(job) {
  try {
    ensure();
    fs.appendFileSync(FILE, `${JSON.stringify(job)}\n`, 'utf8');
    const st = fs.statSync(FILE);
    if (st.size > MAX_FILE_BYTES) {
      fs.copyFileSync(FILE, BAK);
      const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean).slice(-MAX_MEMORY);
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, `${lines.join('\n')}\n`, 'utf8');
      fs.renameSync(tmp, FILE);
    }
  } catch {}
}

/** Phase 1 — Call: register a new run. Returns the live job record. */
function start(spec = {}) {
  const id = spec.job_id || `job-${now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    job_id: id,
    pipeline_name: clip(spec.pipeline || spec.pipeline_name || 'pipeline', 96),
    project: clip(spec.project || '', 80),
    lane: clip(spec.lane || 'TaskForge', 48),
    trigger: clip(spec.trigger || 'manual', 32),
    status: 'running',
    current_step: clip(spec.current_step || 'starting', 160),
    started_at: nowIso(),
    ended_at: null,
    last_beat: now(),
    inputs: spec.inputs || {},
    outputs: [],
    tools_used: [],
    files_touched: [],
    step_log: [],
    proof: null,
    rollback: clip(spec.rollback || '', 300),
    risk: pick(RISK, spec.risk, 'low'),
    operator_approval: spec.operator_approval === true,
    pid: spec.pid || process.pid,
  };
  jobs.set(id, job);
  while (jobs.size > MAX_MEMORY) jobs.delete(jobs.keys().next().value);
  persist(job);
  bus.emit('job', { kind: 'start', job });
  return job;
}

function beat(id) { const j = jobs.get(id); if (j) j.last_beat = now(); return j; }

/** Phase 3 (watch): advance the current step (also a heartbeat). */
function step(id, name) {
  const j = jobs.get(id); if (!j) return null;
  j.current_step = clip(name, 160);
  j.step_log.push({ at: now(), name: j.current_step });
  if (j.step_log.length > 200) j.step_log.shift();
  j.last_beat = now();
  bus.emit('job', { kind: 'step', job_id: id, step: j.current_step });
  return j;
}

/** Phase 5 — Tool trace. */
function tool(id, call) {
  const j = jobs.get(id); if (!j) return null;
  j.tools_used.push({ at: now(), tool: clip(call?.tool || call, 96), ok: call?.ok !== false, detail: clip(call?.detail || '', 160) });
  if (j.tools_used.length > 500) j.tools_used.shift();
  j.last_beat = now();
  return j;
}

function touch(id, file, mode = 'write') {
  const j = jobs.get(id); if (!j) return null;
  j.files_touched.push({ at: now(), file: clip(file, 240), mode });
  if (j.files_touched.length > 500) j.files_touched.shift();
  j.last_beat = now();
  return j;
}

/** Phase 6 — Output path (Black-Hole prevention: a finished job MUST have one). */
function output(id, outPath, meta = {}) {
  const j = jobs.get(id); if (!j) return null;
  j.outputs.push({ at: now(), path: clip(outPath, 300), ...meta });
  j.last_beat = now();
  // ── Output Vault: auto-shelve every spine output, linked to its job/lane. ──
  // Proof Ledger = "it happened"; Vault = "what happened" (durable artifact).
  try {
    require('./output-vault').register({
      job_id: id, project: j.project, lane: j.lane,
      type: meta.kind || undefined, path: outPath,
      summary: meta.summary || j.current_step || j.pipeline_name,
    });
  } catch (_) { /* vault optional */ }
  return j;
}

/** Phase 4 — Stop: request a stop. Runners poll shouldStop() and honor it. */
function requestStop(id, type = 'cancel', reason = '') {
  const t = pick(STOP_TYPES, type, 'cancel');
  stopReq.set(id, { type: t, at: now(), reason: clip(reason, 160) });
  const j = jobs.get(id);
  if (j) {
    if (t === 'pause') j.status = 'paused';
    else if (t === 'quarantine') j.status = 'quarantined';
    // cancel/kill/rollback are honored by the runner via shouldStop(); we mark
    // intent but let finish() set the terminal status so output/rollback record.
    // NB: do NOT touch last_beat here — a stop request is operator action, not
    // job liveness; resetting it would hide a 'die' on an already-dead job.
  }
  bus.emit('job', { kind: 'stop-request', job_id: id, type: t });
  return { job_id: id, ...stopReq.get(id) };
}

/** Runner-side: is a stop pending? Returns the request or null. */
function shouldStop(id) { return stopReq.get(id) || null; }
function clearStop(id) { stopReq.delete(id); }

/** Phase 2,8 — terminal. Writes a proof-ledger row automatically. */
function finish(id, result = {}) {
  const j = jobs.get(id); if (!j) return null;
  j.status = pick(STATUS, result.status, 'complete');
  j.ended_at = nowIso();
  j.last_beat = now();
  if (result.proof) j.proof = { ran: clip(result.proof.ran, 240), result: clip(result.proof.result || 'unknown', 24), detail: clip(result.proof.detail, 300) };
  if (result.rollback) j.rollback = clip(result.rollback, 300);
  stopReq.delete(id);
  persist(j);
  bus.emit('job', { kind: 'finish', job: j });

  // Log path → proof ledger (evidence trail is automatic).
  if (proofLedger) {
    try {
      proofLedger.record({
        agent: j.lane, tool: j.pipeline_name, project: j.project, taskId: j.job_id,
        risk: j.risk, action: 'pipeline', status: j.status === 'complete' ? 'verified' : (j.status === 'failed' ? 'failed' : j.status),
        claim: result.claim || j.current_step,
        evidence: (j.tools_used || []).slice(-10).map(t => `${t.tool}:${t.ok ? 'ok' : 'fail'}`),
        filesTouched: (j.files_touched || []).map(f => f.file),
        verification: j.proof || { result: 'unknown' },
        rollback: j.rollback,
        proofLink: (j.outputs[0] && j.outputs[0].path) || '',
        tokensEstimate: result.tokensEstimate,
      });
    } catch {}
  }
  return j;
}

// Read jobs persisted by OTHER processes (orchestrator, tower, CLI, …) from the
// jsonl so the health board is unified across the whole stack, not per-process.
// In-memory wins for any job_id we own (live heartbeat); disk fills the rest.
function _diskJobs() {
  const byId = new Map();
  for (const file of [BAK, FILE]) {
    let lines = [];
    try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); } catch { continue; }
    for (const line of lines) { try { const r = JSON.parse(line); if (r && r.job_id) { r._disk = true; byId.set(r.job_id, r); } } catch {} }
  }
  for (const id of jobs.keys()) byId.delete(id); // in-memory is authoritative
  return byId;
}

/** All live + recent jobs across the whole stack (in-memory + persisted). */
function list(filter = {}) {
  let rows = [...Array.from(jobs.values()), ...Array.from(_diskJobs().values())];
  for (const k of ['project', 'lane', 'status', 'pipeline_name']) {
    if (filter[k]) rows = rows.filter(r => String(r[k]).toLowerCase() === String(filter[k]).toLowerCase());
  }
  return rows.sort((a, b) => (b.last_beat || 0) - (a.last_beat || 0));
}
function get(id) { return jobs.get(id) || null; }

/**
 * Phase 7 — Health scanner. Classifies every job and flags failure modes:
 * leak / seek / hide / die / loop / fake-green / black-hole / drift.
 * Returns { jobs:[{job_id, light, flags[]}], summary:{green,amber,red,purple} }.
 */
function _classify(j, trustHeartbeat) {
  const t = now();
  const flags = [];
  const sinceBeat = t - (j.last_beat || t);

  // loop: same step repeated too many times in a row
  if (Array.isArray(j.step_log) && j.step_log.length >= LOOP_REPEAT) {
    const tail = j.step_log.slice(-LOOP_REPEAT).map(s => s.name);
    if (new Set(tail).size === 1) flags.push('loop');
  }
  // heartbeat-based flags only for in-process jobs (we can't trust another
  // process's last_beat — it only updates on its own start/finish persist).
  if (j.status === 'running' && trustHeartbeat) {
    if (sinceBeat > DIE_MS) flags.push('die');
    else if (sinceBeat > HIDE_MS) flags.push('hide');
    if ((j.tools_used || []).length >= SEEK_TOOLS && (j.outputs || []).length === 0) flags.push('seek');
  } else if (j.status === 'running' && !trustHeartbeat && sinceBeat > DIE_MS * 6) {
    // Disk (cross-process) jobs can't beat live, but a 'running' disk job whose
    // last persist was >30m ago is a zombie — its process died without finish().
    // Flag it died so it reads red/died, not a perpetual amber 'running' (the
    // "leaky drawer" that left 36 fake-running jobs on the board). Threshold is
    // generous so genuinely long runs (e.g. a LoRA train) aren't false-killed.
    flags.push('die');
  }
  if (j.status === 'complete' && (!j.proof || j.proof.result !== 'pass')) flags.push('fake-green');
  if (j.status === 'complete' && (j.outputs || []).length === 0) flags.push('black-hole');

  let light;
  if (j.status === 'quarantined') light = 'purple';
  else if (['failed', 'killed', 'cancelled'].includes(j.status) || flags.includes('die') || flags.includes('fake-green')) light = 'red';
  else if (j.status === 'complete' && flags.length === 0) light = 'green';
  else light = 'amber';
  return { job_id: j.job_id, pipeline_name: j.pipeline_name, project: j.project, lane: j.lane, status: j.status, current_step: j.current_step, since_beat_ms: sinceBeat, light, flags, source: j._disk ? 'disk' : 'live' };
}

function health() {
  const out = { jobs: [], summary: { green: 0, amber: 0, red: 0, purple: 0 } };
  for (const j of jobs.values()) { const c = _classify(j, true); out.summary[c.light]++; out.jobs.push(c); }
  for (const j of _diskJobs().values()) { const c = _classify(j, false); out.summary[c.light]++; out.jobs.push(c); }
  return out;
}

function subscribe(listener) { bus.on('job', listener); return () => bus.off('job', listener); }

module.exports = {
  start, step, tool, touch, output, beat,
  requestStop, shouldStop, clearStop, finish,
  list, get, health, subscribe,
  STATUS, RISK, STOP_TYPES, FILE,
};
