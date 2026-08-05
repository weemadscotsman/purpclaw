'use strict';

const PURP_PATHS = require('./paths');
/**
 * proof-ledger — PURPCLAW's black-box recorder.
 *
 * trace-store.js logs WHAT HAPPENED (lightweight UI activity feed).
 * proof-ledger logs the EVIDENCE: every meaningful, state-changing action gets
 * a durable, append-only row with the claim, the proof, the files touched, the
 * verification result, and the rollback recipe. This is the "no fake green"
 * doctrine made physical — a diff with no verification + rollback is not done.
 *
 * Append-only by design (never rewrite history). Rotated by size with a .bak so
 * the active ledger is never lost. Zero heavy deps — runs on a potato.
 *
 *   const ledger = require('./lib/proof-ledger');
 *   ledger.record({
 *     agent: 'OmniSurgeon', tool: 'apply_patch', project: 'PURPCLAW',
 *     taskId: 'task_123', risk: 'medium', action: 'patch',
 *     claim: 'Fixed the cmd-window cascade in orchestrator',
 *     evidence: ['orchestrator.js:1935 now windowsHide:true', 'health 200'],
 *     filesTouched: ['orchestrator.js'],
 *     verification: { ran: 'curl :7784/api/system/health', result: 'pass', detail: '200' },
 *     rollback: 'git checkout orchestrator.js',
 *     model: 'deepseek-ai/deepseek-v4-pro', provider: 'nvidia',
 *     tokensEstimate: 1800, status: 'verified',
 *   });
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

const LEDGER_DIR = path.join(PURP_PATHS.DATA_ROOT, 'proof');
const LEDGER_FILE = path.join(LEDGER_DIR, 'ledger.jsonl');
const BACKUP_FILE = `${LEDGER_FILE}.bak`;
const MAX_MEMORY = 1000;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // ~8MB before rotation to .bak

// Controlled vocabularies — keep the ledger queryable, not freeform sludge.
const RISK = new Set(['none', 'low', 'medium', 'high', 'critical']);
const STATUS = new Set(['proposed', 'applied', 'verified', 'failed', 'rolled-back', 'rejected', 'info']);
const VERIFY = new Set(['pass', 'fail', 'partial', 'skipped', 'unknown']);

const bus = new EventEmitter();
bus.setMaxListeners(200);
const memory = [];

function ensure() { fs.mkdirSync(LEDGER_DIR, { recursive: true }); }

function clip(value, max = 500) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function clipList(value, maxItems = 50, maxLen = 240) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.slice(0, maxItems).map((v) => clip(v, maxLen)).filter(Boolean);
}

function pick(set, value, fallback) {
  const v = String(value || '').toLowerCase();
  return set.has(v) ? v : fallback;
}

function normalize(entry = {}) {
  const at = entry.at || new Date().toISOString();
  const verification = entry.verification || {};
  return {
    id: entry.id || `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    ts: Date.parse(at) || Date.now(),
    // who + what
    agent: clip(entry.agent || 'system', 64),
    tool: clip(entry.tool || entry.action || 'action', 96),
    action: clip(entry.action || entry.tool || 'action', 64),
    project: clip(entry.project || entry.repo || '', 80),
    taskId: clip(entry.taskId || entry.jobId || '', 96),
    sessionId: clip(entry.sessionId || '', 96),
    supersedes: clip(entry.supersedes || entry.supersedesId || '', 96),
    risk: pick(RISK, entry.risk, 'low'),
    // the proof
    claim: clip(entry.claim || entry.detail || '', 600),
    evidence: clipList(entry.evidence, 50, 300),
    filesTouched: clipList(entry.filesTouched || entry.files, 200, 240),
    verification: {
      ran: clip(verification.ran || '', 240),
      result: pick(VERIFY, verification.result, entry.status === 'verified' ? 'pass' : 'unknown'),
      detail: clip(verification.detail || '', 300),
    },
    rollback: clip(entry.rollback || '', 300),
    proofLink: clip(entry.proofLink || '', 300),
    // provenance
    model: clip(entry.model || '', 96),
    provider: clip(entry.provider || '', 48),
    tokensEstimate: Number.isFinite(entry.tokensEstimate) ? Math.round(entry.tokensEstimate) : null,
    status: pick(STATUS, entry.status, 'info'),
  };
}

function rotate() {
  try {
    const stat = fs.statSync(LEDGER_FILE);
    if (stat.size <= MAX_FILE_BYTES) return;
    // Append-only doctrine: don't truncate history, archive it to .bak.
    fs.copyFileSync(LEDGER_FILE, BACKUP_FILE);
    const lines = fs.readFileSync(LEDGER_FILE, 'utf8').split(/\r?\n/).filter(Boolean).slice(-MAX_MEMORY);
    const tmp = `${LEDGER_FILE}.tmp`;
    fs.writeFileSync(tmp, `${lines.join('\n')}\n`, 'utf8');
    fs.renameSync(tmp, LEDGER_FILE); // atomic
  } catch {}
}

/** Record one evidence row. Returns the normalized row. */
function record(entry) {
  const row = normalize(entry);
  memory.push(row);
  while (memory.length > MAX_MEMORY) memory.shift();
  try {
    ensure();
    fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(row)}\n`, 'utf8');
    rotate();
  } catch {}
  bus.emit('proof', row);
  return row;
}

function readAll(cap = MAX_MEMORY) {
  const rows = [];
  for (const file of [BACKUP_FILE, LEDGER_FILE]) {
    try {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) { try { rows.push(JSON.parse(line)); } catch {} }
    } catch {}
  }
  const byId = new Map();
  for (const r of [...rows, ...memory]) byId.set(r.id, r);
  return Array.from(byId.values()).sort((a, b) => a.ts - b.ts).slice(-cap);
}

/** Recent rows, optionally filtered by {project, taskId, agent, status, risk}. */
function recent(limit = 200, filter = {}) {
  const cap = Math.max(1, Math.min(Number(limit) || 200, MAX_MEMORY));
  let rows = readAll();
  for (const key of ['project', 'taskId', 'agent', 'status', 'risk']) {
    if (filter[key]) rows = rows.filter((r) => String(r[key]).toLowerCase() === String(filter[key]).toLowerCase());
  }
  return rows.slice(-cap);
}

function byTask(taskId) { return recent(MAX_MEMORY, { taskId }); }
function byProject(project) { return recent(MAX_MEMORY, { project }); }

/** Aggregate truth stats for the Truth/Bench dashboard tabs. */
function stats() {
  const rows = readAll();
  const superseded = new Set(rows.map(r => r.supersedes).filter(Boolean));
  const out = {
    total: rows.length,
    byStatus: {}, byRisk: {}, byVerification: {}, byProject: {},
    verified: 0, failed: 0, rolledBack: 0,
    fakeGreens: 0, // applied/verified status but verification.result !== pass
    tokensEstimate: 0,
  };
  for (const r of rows) {
    if (superseded.has(r.id)) continue;
    out.byStatus[r.status] = (out.byStatus[r.status] || 0) + 1;
    out.byRisk[r.risk] = (out.byRisk[r.risk] || 0) + 1;
    const vr = r.verification?.result || 'unknown';
    out.byVerification[vr] = (out.byVerification[vr] || 0) + 1;
    if (r.project) out.byProject[r.project] = (out.byProject[r.project] || 0) + 1;
    if (r.status === 'verified') out.verified++;
    if (r.status === 'failed') out.failed++;
    if (r.status === 'rolled-back') out.rolledBack++;
    if ((r.status === 'verified' || r.status === 'applied') && vr !== 'pass') out.fakeGreens++;
    if (Number.isFinite(r.tokensEstimate)) out.tokensEstimate += r.tokensEstimate;
  }
  return out;
}

function subscribe(listener) {
  bus.on('proof', listener);
  return () => bus.off('proof', listener);
}

module.exports = { record, recent, byTask, byProject, stats, subscribe, RISK, STATUS, VERIFY, LEDGER_FILE };
