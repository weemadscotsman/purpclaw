'use strict';
/**
 * Phase E — trained LoRA candidate → eval → gatekeeper → activate.
 *
 * A freshly trained adapter is a CANDIDATE, never the live model. This module
 * is the missing handshake: it evaluates the candidate (lora-eval.py), runs it
 * past the gatekeeper for an audit/governance verdict, and only then — and only
 * with the right authority — flips the live LLM_MODEL.
 *
 * Governance (matches the project's gate doctrine):
 *   - autonomous self-evolution  → candidate left PENDING operator approval.
 *                                   It is NEVER auto-activated.
 *   - operator-initiated/approved → eval-pass + gate-ok → activated.
 *
 * Nothing activates without (a) a passing eval AND (b) an explicit approval.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// Eval runs on the E: CUDA venv (per the no-C:-drive rule); fall back to base.
const VENV_PY = 'E:/purpclaw-venv/Scripts/python.exe';
const PY_BIN = process.env.LORA_PYTHON || (fs.existsSync(VENV_PY) ? VENV_PY : (process.env.PYTHON_BIN || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe'));
const ROOT = path.join(__dirname, '..', '..');
const STORE_DIR = path.join(os.homedir(), '.purpclaw', 'adapters');
const CANDIDATES = path.join(STORE_DIR, 'candidates.jsonl'); // append-only audit trail
const ACTIVE = path.join(STORE_DIR, 'active.json');          // currently live adapter

let reg = null;        try { reg = require('../pipeline-registry'); } catch {}
let gatekeeper = null; try { gatekeeper = require('../../gatekeeper'); } catch {}
let proof = null;      try { proof = require('../proof-ledger'); } catch {}

function ensure() { fs.mkdirSync(STORE_DIR, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }

// ── Step 1: evaluate the candidate (health gate) ──────────────────────────────
function evaluate(mergedDir, opts = {}) {
  ensure();
  const r = spawnSync(PY_BIN, [
    path.join(ROOT, 'scripts', 'lora-eval.py'),
    '--merged', mergedDir,
    '--min-score', String(opts.minScore || 0.6),
  ], { encoding: 'utf8', windowsHide: true, timeout: opts.timeoutMs || 600000 });

  let verdict = null;
  try {
    const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
    verdict = JSON.parse(line);
  } catch {}
  if (!verdict) {
    verdict = {
      pass: false, score: 0,
      error: 'eval produced no parseable verdict',
      blocked: r.status === 3 ? 'no-cuda' : undefined,
      stderr: (r.stderr || '').slice(-400),
    };
  }
  verdict.exit = r.status;
  return verdict;
}

// ── Step 2: gatekeeper review (audit + governance verdict) ────────────────────
function review(candidate, evalResult) {
  try {
    if (gatekeeper && gatekeeper.validateChange) {
      return gatekeeper.validateChange({
        id: `adapter-${candidate.name}`,
        message: `activate LoRA candidate ${candidate.name} (eval score ${evalResult.score})`,
        files: candidate.mergedDir ? [{ path: candidate.mergedDir, type: 'directory' }] : [],
      });
    }
  } catch (e) {
    return { canMerge: false, blockedReason: 'gatekeeper error: ' + e.message, issues: [], riskLevel: 'unknown' };
  }
  return { canMerge: true, riskLevel: 'low', issues: [] };
}

// ── Step 3: activate (flip live model). HARD-GATED. ───────────────────────────
function activate(candidate, { evalResult, gateReport, operatorInitiated, approvedBy } = {}) {
  if (!evalResult || !evalResult.pass) throw new Error('refuse-activate: eval did not pass');
  if (!operatorInitiated && !approvedBy) throw new Error('refuse-activate: autonomous activation requires operator approval');
  if (gateReport && gateReport.canMerge === false) throw new Error('refuse-activate: gatekeeper blocked — ' + (gateReport.blockedReason || 'blocked'));

  setEnvModel(candidate.name);
  const rec = { ...candidate, activatedAt: nowIso(), approvedBy: approvedBy || 'operator', evalScore: evalResult.score };
  ensure();
  fs.writeFileSync(ACTIVE, JSON.stringify(rec, null, 2));
  if (proof) try {
    proof.record({
      agent: 'adapter-gate', action: 'model.activate', taskId: candidate.name, status: 'verified',
      claim: `activated ${candidate.name} (eval ${evalResult.score})`,
      evidence: [`eval:${evalResult.score}`, `approver:${rec.approvedBy}`],
    });
  } catch {}
  return rec;
}

function setEnvModel(name) {
  const envPath = path.join(ROOT, '.env');
  let txt = ''; try { txt = fs.readFileSync(envPath, 'utf8'); } catch {}
  const line = `LLM_MODEL=${name}`;
  txt = /^LLM_MODEL=.*/m.test(txt) ? txt.replace(/^LLM_MODEL=.*/m, line) : (txt.trimEnd() + '\n' + line + '\n');
  fs.writeFileSync(envPath, txt);
}

// ── Candidate ledger ──────────────────────────────────────────────────────────
function recordCandidate(candidate) {
  ensure();
  const rec = { ...candidate, recordedAt: nowIso(), state: candidate.state || 'pending' };
  fs.appendFileSync(CANDIDATES, JSON.stringify(rec) + '\n');
  return rec;
}
function listCandidates() {
  ensure();
  try {
    return fs.readFileSync(CANDIDATES, 'utf8').trim().split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function listPending() {
  const latest = new Map();
  for (const c of listCandidates()) latest.set(c.name, c); // last write wins
  return [...latest.values()].filter(c => c.state === 'pending');
}
function getActive() { try { return JSON.parse(fs.readFileSync(ACTIVE, 'utf8')); } catch { return null; } }

// ── Phase E orchestration: eval → review → (activate | pending) ───────────────
function runPhaseE(candidate, { operatorInitiated = false, jobId } = {}) {
  const evalResult = evaluate(candidate.mergedDir || candidate.name, {});
  if (reg && jobId) try { reg.step(jobId, evalResult.pass ? 'eval_passed' : (evalResult.blocked ? 'eval_blocked' : 'eval_failed')); } catch {}

  if (evalResult.blocked === 'no-cuda') {
    recordCandidate({ ...candidate, state: 'pending', eval: evalResult });
    return { state: 'paused', reason: 'no-cuda', evalResult };
  }
  if (!evalResult.pass) {
    recordCandidate({ ...candidate, state: 'rejected', eval: evalResult });
    return { state: 'rejected', evalResult };
  }

  const gateReport = review(candidate, evalResult);
  // Governance: autonomous never auto-activates — it waits for the operator.
  if (!operatorInitiated) {
    recordCandidate({ ...candidate, state: 'pending', eval: evalResult, gate: { canMerge: gateReport.canMerge, risk: gateReport.riskLevel } });
    return { state: 'pending_approval', evalResult, gateReport };
  }
  const rec = activate(candidate, { evalResult, gateReport, operatorInitiated: true });
  recordCandidate({ ...candidate, state: 'active', eval: evalResult });
  return { state: 'activated', record: rec, evalResult, gateReport };
}

// ── Operator approval — the missing handshake the user asked for ──────────────
function approve(name, { approvedBy = 'operator' } = {}) {
  const pend = listPending().find(c => c.name === name) || listCandidates().reverse().find(c => c.name === name);
  if (!pend) throw new Error('no such candidate: ' + name);
  const evalResult = (pend.eval && pend.eval.pass) ? pend.eval : evaluate(pend.mergedDir || pend.name, {});
  if (!evalResult.pass) throw new Error('cannot approve: candidate fails eval (score ' + evalResult.score + ')');
  const gateReport = review(pend, evalResult);
  const rec = activate(pend, { evalResult, gateReport, approvedBy });
  recordCandidate({ ...pend, state: 'active' });
  return { state: 'activated', record: rec, evalResult };
}

module.exports = {
  evaluate, review, activate, setEnvModel,
  recordCandidate, listCandidates, listPending, getActive,
  runPhaseE, approve,
};
