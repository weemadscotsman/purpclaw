'use strict';

/**
 * output-vault — PURPCLAW's global artifact shelf.
 *
 * Proof Ledger says IT HAPPENED. The Vault stores WHAT HAPPENED — every
 * meaningful output saved, hashed, linked to its job/lane/proof, and reusable.
 * So good work stops vanishing into chat dust.
 *
 * Every spine output auto-registers here (pipeline-registry.output() calls
 * vault.register()), so OMNI reports, gate verdicts, agent logs, pipeline
 * artifacts, and LoRA adapters all land on one shelf with one schema.
 *
 *   const vault = require('./lib/output-vault');
 *   vault.register({ job_id, project:'OmniCode', lane:'OMNI', type:'report',
 *                    path:'agent_work/outputs/omni/scan.md', summary:'truth scan' });
 *   vault.byJob(job_id); vault.list({ lane:'OMNI' }); vault.approve(id);
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'agent_work', 'outputs');
const INDEX = path.join(ROOT, 'index.jsonl');
const MAX_MEMORY = 5000;

const STATUS = new Set(['draft', 'verified', 'approved', 'rejected', 'archived']);
const TYPES = new Set(['report', 'patch', 'adapter', 'doc', 'log', 'eval', 'config', 'dataset', 'note', 'verdict', 'artifact']);
// Lane → subfolder (the user's folder layout). Falls back to 'reports'.
const LANE_DIR = {
  OMNI: 'omni', 'BASI Watchdog': 'gatekeeper', gatekeeper: 'gatekeeper',
  'Training Forge': 'lora', lora: 'lora',
  pipelines: 'pipelines', reports: 'reports',
};

const mem = [];

function ensure() {
  fs.mkdirSync(ROOT, { recursive: true });
  for (const d of ['omni', 'gatekeeper', 'lora', 'agents', 'pipelines', 'reports', 'rejected']) {
    try { fs.mkdirSync(path.join(ROOT, d), { recursive: true }); } catch (_) {}
  }
}
function clip(v, n = 300) { if (v == null) return ''; const t = typeof v === 'string' ? v : JSON.stringify(v); return t.length > n ? t.slice(0, n) + '…' : t; }
function pick(set, v, fb) { const x = String(v || '').toLowerCase(); return set.has(x) ? x : fb; }

// Hash a real file (first 256KB is plenty for integrity); non-file tokens get none.
function hashOf(p) {
  try {
    if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return '';
    const buf = fs.readFileSync(p).subarray(0, 256 * 1024);
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  } catch (_) { return ''; }
}

function isFilePath(p) {
  try { return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isFile(); } catch (_) { return false; }
}

function persist(rec) {
  try { ensure(); fs.appendFileSync(INDEX, JSON.stringify(rec) + '\n', 'utf8'); } catch (_) {}
}

/** Register an artifact. Idempotent-ish: same job_id+path updates in memory. */
function register(a = {}) {
  const p = a.path || '';
  const fileBacked = isFilePath(p);
  const rec = {
    artifact_id: a.artifact_id || `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    job_id: clip(a.job_id || '', 96),
    project: clip(a.project || '', 80),
    lane: clip(a.lane || 'reports', 48),
    type: pick(TYPES, a.type, fileBacked ? 'artifact' : 'note'),
    path: clip(p, 400),
    summary: clip(a.summary || '', 300),
    status: pick(STATUS, a.status, 'draft'),
    hash: fileBacked ? hashOf(p) : '',
    bytes: fileBacked ? (() => { try { return fs.statSync(p).size; } catch (_) { return 0; } })() : 0,
    created_at: a.created_at || new Date().toISOString(),
    proof_id: clip(a.proof_id || '', 96),
    rollback_path: clip(a.rollback_path || '', 300),
    file_backed: fileBacked,
  };
  mem.push(rec);
  while (mem.length > MAX_MEMORY) mem.shift();
  persist(rec);
  return rec;
}

function readAll() {
  const rows = [];
  try {
    for (const line of fs.readFileSync(INDEX, 'utf8').split(/\r?\n/).filter(Boolean)) {
      try { rows.push(JSON.parse(line)); } catch (_) {}
    }
  } catch (_) {}
  // last-write-wins per artifact_id (approve/archive update by re-appending)
  const byId = new Map();
  for (const r of [...rows, ...mem]) byId.set(r.artifact_id, r);
  return Array.from(byId.values()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function list(filter = {}, limit = 200) {
  let rows = readAll();
  for (const k of ['project', 'lane', 'type', 'status', 'job_id']) {
    if (filter[k]) rows = rows.filter(r => String(r[k]).toLowerCase() === String(filter[k]).toLowerCase());
  }
  return rows.slice(-Math.max(1, Math.min(Number(limit) || 200, MAX_MEMORY)));
}
function get(id) { return readAll().find(r => r.artifact_id === id) || null; }
function byJob(jobId) { return readAll().filter(r => r.job_id === jobId); }

// Status transitions re-append a new record (append-only history).
function _setStatus(id, status, extra = {}) {
  const cur = get(id);
  if (!cur) return null;
  const next = { ...cur, ...extra, status, updated_at: new Date().toISOString() };
  mem.push(next); persist(next);
  return next;
}
function approve(id, by) { return _setStatus(id, 'approved', { approved_by: clip(by || 'operator', 48) }); }
function reject(id, reason) { return _setStatus(id, 'rejected', { reject_reason: clip(reason || '', 200) }); }
function archive(id) { return _setStatus(id, 'archived'); }

function stats() {
  const rows = readAll();
  const out = { total: rows.length, byLane: {}, byType: {}, byStatus: {}, fileBacked: 0, totalBytes: 0 };
  for (const r of rows) {
    out.byLane[r.lane] = (out.byLane[r.lane] || 0) + 1;
    out.byType[r.type] = (out.byType[r.type] || 0) + 1;
    out.byStatus[r.status] = (out.byStatus[r.status] || 0) + 1;
    if (r.file_backed) { out.fileBacked++; out.totalBytes += r.bytes || 0; }
  }
  return out;
}

/** Resolve the canonical folder for a lane (for consumers saving new files). */
function laneDir(lane) {
  ensure();
  return path.join(ROOT, LANE_DIR[lane] || LANE_DIR[String(lane).toLowerCase()] || 'reports');
}

module.exports = { register, list, get, byJob, approve, reject, archive, stats, laneDir, ROOT, INDEX, STATUS, TYPES };
