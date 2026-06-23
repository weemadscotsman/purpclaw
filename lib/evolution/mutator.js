'use strict';

/**
 * lib/evolution/mutator.js
 * ═════════════════════════
 * Auto-mutation engine. Reads PURPCLAW's own evidence trail
 * (benchmark history, score-deltas, harness lessons, Karen tickets) and
 * proposes config changes to make the next cycle perform better.
 *
 * What it can mutate (safely, with gates):
 *   • Gate strictness    — drop / soften a verification gate that has >GATE_FP_THRESHOLD
 *                          false-positive rate against successful-deliverable subtasks.
 *   • Karen thresholds   — adjust karenEscalateAfterFailures if escalations cluster
 *                          on subtasks that DO eventually succeed.
 *   • Intent keywords    — when subtasks consistently misclassify, propose new
 *                          keyword for JOB_TYPES.
 *   • Agent demotion     — flag agents that have failed N+ consecutive runs as
 *                          "cold" and propose dropping them from default rosters.
 *   • Planner hints      — promote successful lesson fragments into a global
 *                          "operator preferences" file the planner prepends.
 *
 * Risk tiers:
 *   LOW    — additive, reversible  (e.g. add keyword, append planner hint).
 *   MEDIUM — config tweak with measurable rollback (e.g. soften a gate).
 *   HIGH   — code structural change (e.g. delete an archetype). Never auto-applied;
 *            queued for gatekeeper.
 *
 * All proposals are logged to agent_work/evolution/proposed.jsonl.
 * Applied mutations are logged to agent_work/evolution/applied.jsonl.
 * Each LOW-risk mutation is auto-applied if --auto is set; MEDIUM is dry-run by default;
 * HIGH is always operator-gated.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EVO_DIR = path.join(ROOT, 'agent_work', 'evolution');
const PROPOSED_LOG = path.join(EVO_DIR, 'proposed.jsonl');
const APPLIED_LOG  = path.join(EVO_DIR, 'applied.jsonl');
const PREFS_FILE   = path.join(EVO_DIR, 'planner-preferences.md');

const BENCH_HISTORY = path.join(ROOT, 'agent_work', 'benchmark', 'history.jsonl');
const SCORE_DELTAS  = path.join(ROOT, 'agent_work', 'recursive', 'score-deltas.jsonl');

// Tuning knobs (the mutator itself can propose changing these later)
const GATE_FP_THRESHOLD          = 0.5;   // gate fires false on >=50% of subtasks → propose soften
const KAREN_OVER_FIRE_THRESHOLD  = 0.6;   // karen fires on >=60% of subtasks → propose threshold raise
const AGENT_COLD_FAILURES        = 5;     // N+ consecutive failures → cold
const MIN_HISTORY_FOR_PASS       = 1;     // need at least one bench run to mutate
const PROPOSAL_COOLDOWN_MS       = 30 * 60 * 1000; // don't re-propose same mutation within 30 min

const now = () => Date.now();
const ensureDir = d => { try { fs.mkdirSync(d, { recursive: true }); } catch {} };

function readJsonl(filePath, limit = 500) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const txt = fs.readFileSync(filePath, 'utf8').trim();
    if (!txt) return [];
    const lines = txt.split('\n').slice(-limit);
    return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function appendJsonl(filePath, row) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(row) + '\n');
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Evidence gatherers ───────────────────────────────────────────────────────

function gatherEvidence() {
  const benchmarks = readJsonl(BENCH_HISTORY, 30);
  const deltas     = readJsonl(SCORE_DELTAS, 1000);
  // Look in BOTH places: standalone harness jobs + benchmark-run artifacts.
  const dirs = [
    path.join(ROOT, 'agent_work', 'harness'),
    path.join(ROOT, 'agent_work', 'benchmark', 'runs'),
  ];
  let jobs = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).slice(-80);
      const loaded = files.map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
      jobs.push(...loaded);
    } catch {}
  }
  // Most recent first; cap to 80
  jobs.sort((a, b) => (b.startedAt || b.finishedAt || 0) - (a.startedAt || a.finishedAt || 0));
  jobs = jobs.slice(0, 80);
  return { benchmarks, deltas, jobs };
}

// ─── Pattern detectors ───────────────────────────────────────────────────────

/**
 * Gate false-positive detector: across recent jobs, for each gate, what % of
 * subtasks where it ran got FAILED, but the deliverable itself was non-empty
 * and Karen didn't ultimately ticket it? Those are gate-driven false negatives.
 */
function detectGateFalsePositives(jobs) {
  const stats = {};                       // gate → { fired, falsePositive }
  for (const job of jobs) {
    for (const s of (job.plan || [])) {
      const gates = s.gateResult?.results || [];
      const hasOutput = (s.output || '').trim().length > 100;
      const acceptedDespiteGate = s.state === 'accepted' || (s.verdict === 'ACCEPTED');
      for (const g of gates) {
        if (!stats[g.gate]) stats[g.gate] = { fired: 0, falsePositive: 0 };
        stats[g.gate].fired++;
        // False positive: gate said no, but output was substantial AND eventually accepted
        if (!g.ok && hasOutput && acceptedDespiteGate) stats[g.gate].falsePositive++;
        // Also: gate said no, output was substantial, was challenged not rejected (recoverable)
        if (!g.ok && hasOutput && s.verdict === 'CHALLENGED') stats[g.gate].falsePositive++;
      }
    }
  }
  const proposals = [];
  for (const [gate, s] of Object.entries(stats)) {
    if (s.fired < 4) continue;            // need enough samples
    const rate = s.falsePositive / s.fired;
    if (rate >= GATE_FP_THRESHOLD) {
      proposals.push({
        kind: 'soften_gate',
        risk: 'medium',
        target: gate,
        evidence: { fired: s.fired, falsePositive: s.falsePositive, rate: rate.toFixed(2) },
        reason: `Gate "${gate}" has FP rate ${(rate * 100).toFixed(0)}% over ${s.fired} subtask runs. Recommend reducing to advisory (warn-only) or tightening its trigger.`,
        suggestedDiff: { file: 'lib/job-contract.js', section: `JOB_TYPES → remove "${gate}" from default gates for low-risk intents` },
      });
    }
  }
  return proposals;
}

/**
 * Karen over-fire detector: when escalations cluster on a small set of agents
 * or intents, propose raising karenEscalateAfterFailures specifically for them.
 */
function detectKarenOverfire(jobs) {
  let totalSubtasks = 0;
  let karenSubtasks = 0;
  const byIntent = {};
  for (const job of jobs) {
    for (const s of (job.plan || [])) {
      totalSubtasks++;
      const ks = (s.karenEscalations || []).length;
      if (ks > 0) {
        karenSubtasks++;
        const intent = s.contract?.routeIntent || 'unknown';
        byIntent[intent] = (byIntent[intent] || 0) + ks;
      }
    }
  }
  const proposals = [];
  if (totalSubtasks > 8 && karenSubtasks / totalSubtasks >= KAREN_OVER_FIRE_THRESHOLD) {
    proposals.push({
      kind: 'raise_karen_threshold',
      risk: 'low',
      target: 'karenEscalateAfterFailures',
      evidence: { totalSubtasks, karenSubtasks, rate: (karenSubtasks / totalSubtasks).toFixed(2), byIntent },
      reason: `Karen escalating on ${((karenSubtasks / totalSubtasks) * 100).toFixed(0)}% of subtasks (${karenSubtasks}/${totalSubtasks}). She's a backstop, not a referee. Raise threshold from 2 → 3.`,
      suggestedDiff: { file: 'lib/harness/engine.js', section: 'DEFAULTS.karenEscalateAfterFailures: 2 → 3' },
    });
  }
  return proposals;
}

/**
 * Cold agent detector: agents with N+ consecutive failures across recent jobs.
 */
function detectColdAgents(jobs, deltas) {
  const consecutive = {};   // agent → streak of failures
  // Walk score-delta log newest-last
  const ordered = [...deltas].sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const d of ordered) {
    const agent = String(d.agent || '').toLowerCase();
    if (!agent) continue;
    if (!consecutive[agent]) consecutive[agent] = { streak: 0, lastReset: 0 };
    if (d.success) consecutive[agent].streak = 0;
    else consecutive[agent].streak++;
  }
  const proposals = [];
  for (const [agent, s] of Object.entries(consecutive)) {
    if (s.streak >= AGENT_COLD_FAILURES) {
      proposals.push({
        kind: 'demote_cold_agent',
        risk: 'low',
        target: agent,
        evidence: { consecutiveFailures: s.streak },
        reason: `Agent "${agent}" has ${s.streak} consecutive failed outcomes. Recommend dropping from default preferredAgents until a warm-up pass succeeds.`,
        suggestedDiff: { file: 'agent_work/evolution/cold-agents.json', section: `add "${agent}"` },
      });
    }
  }
  return proposals;
}

/**
 * Planner-hint accumulator: when subtasks succeed, harvest their reasoning
 * fragments as a global preferences file the planner prepends next run.
 */
function detectAcceptedLessons(jobs) {
  const proposals = [];
  const fragments = [];
  for (const job of jobs.slice(-10)) {
    for (const s of (job.plan || [])) {
      if (s.state !== 'accepted') continue;
      const intent = s.contract?.routeIntent || 'general';
      const desc = (s.description || '').slice(0, 80);
      const reason = (s.verdictReason || '').slice(0, 80);
      if (desc) fragments.push({ intent, desc, reason, at: job.startedAt || now() });
    }
  }
  if (fragments.length >= 3) {
    proposals.push({
      kind: 'append_planner_hint',
      risk: 'low',
      target: PREFS_FILE,
      evidence: { count: fragments.length, sample: fragments.slice(-3) },
      reason: `${fragments.length} successful subtasks since last evolution pass. Crystallise their pattern into a planner preferences file so future runs front-load what works.`,
      suggestedDiff: { file: PREFS_FILE, action: 'append', count: fragments.length },
      fragments,
    });
  }
  return proposals;
}

/**
 * Benchmark trend detector: did the last cycle regress?
 */
function detectRegression(benchmarks) {
  if (benchmarks.length < 2) return [];
  const last = benchmarks[benchmarks.length - 1];
  const prev = benchmarks[benchmarks.length - 2];
  const acceptDelta = (last.aggregate.acceptRate || 0) - (prev.aggregate.acceptRate || 0);
  const karenDelta  = (last.aggregate.avgKaren   || 0) - (prev.aggregate.avgKaren   || 0);
  if (acceptDelta < -0.05 || karenDelta > 0.5) {
    return [{
      kind: 'regression_warning',
      risk: 'low',
      target: 'benchmark',
      evidence: { acceptDelta: acceptDelta.toFixed(3), karenDelta: karenDelta.toFixed(2), last: last.label, prev: prev.label },
      reason: `Regression detected vs prior benchmark: accept Δ=${(acceptDelta * 100).toFixed(1)}%, karen Δ=${karenDelta.toFixed(2)}. Investigate before next cycle.`,
      suggestedDiff: { file: 'agent_work/evolution/regression-alerts.jsonl', action: 'log' },
    }];
  }
  return [];
}

// ─── Apply mutations ─────────────────────────────────────────────────────────

function appendPlannerPreferences(fragments) {
  ensureDir(path.dirname(PREFS_FILE));
  const header = `\n## Evolution pass — ${new Date().toISOString()}\n\nObserved successful patterns:\n`;
  const lines = fragments.slice(-12).map(f => `- (${f.intent}) ${f.desc}${f.reason ? ` → ${f.reason}` : ''}`);
  const block = header + lines.join('\n') + '\n';
  fs.appendFileSync(PREFS_FILE, block);
  return { appended: lines.length };
}

function writeColdAgentsList(name) {
  const file = path.join(EVO_DIR, 'cold-agents.json');
  ensureDir(path.dirname(file));
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!list.includes(name)) list.push(name);
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
  return { coldAgents: list };
}

function applyMutation(proposal) {
  switch (proposal.kind) {
    case 'append_planner_hint':
      return { applied: true, result: appendPlannerPreferences(proposal.fragments || []) };
    case 'demote_cold_agent':
      return { applied: true, result: writeColdAgentsList(proposal.target) };
    case 'regression_warning':
      appendJsonl(path.join(EVO_DIR, 'regression-alerts.jsonl'), { at: now(), evidence: proposal.evidence });
      return { applied: true, result: { logged: true } };
    case 'raise_karen_threshold':
    case 'soften_gate':
      // Medium risk — write a queued proposal but do NOT touch source files.
      return { applied: false, queued: true, result: { queuedFor: 'operator-review' } };
    default:
      return { applied: false, queued: false, result: { error: 'unknown_kind' } };
  }
}

// ─── Top-level pass ──────────────────────────────────────────────────────────

function runPass({ auto = false } = {}) {
  const evidence = gatherEvidence();

  if (evidence.benchmarks.length < MIN_HISTORY_FOR_PASS && evidence.jobs.length === 0) {
    return { ok: false, reason: 'no-evidence-yet', proposals: [], applied: [], queued: [] };
  }

  const proposals = [
    ...detectGateFalsePositives(evidence.jobs),
    ...detectKarenOverfire(evidence.jobs),
    ...detectColdAgents(evidence.jobs, evidence.deltas),
    ...detectAcceptedLessons(evidence.jobs),
    ...detectRegression(evidence.benchmarks),
  ].map(p => ({ id: makeId('mut'), proposedAt: now(), ...p }));

  ensureDir(EVO_DIR);
  for (const p of proposals) appendJsonl(PROPOSED_LOG, p);

  const applied = [];
  const queued  = [];
  for (const p of proposals) {
    if (p.risk === 'low' && auto) {
      const result = applyMutation(p);
      const entry = { ...p, appliedAt: now(), ...result };
      appendJsonl(APPLIED_LOG, entry);
      if (result.applied) applied.push(entry);
      else queued.push(entry);
    } else {
      queued.push(p);
    }
  }

  return {
    ok: true,
    evidenceSummary: {
      benchmarks: evidence.benchmarks.length,
      deltas: evidence.deltas.length,
      jobs: evidence.jobs.length,
    },
    proposals,
    applied,
    queued,
    auto,
  };
}

function readApplied(limit = 30) {
  return readJsonl(APPLIED_LOG, limit).reverse();
}

function readProposed(limit = 30) {
  return readJsonl(PROPOSED_LOG, limit).reverse();
}

function approveProposal(id, { applyNow = true } = {}) {
  const proposed = readJsonl(PROPOSED_LOG, 500);
  const target = proposed.find(p => p.id === id);
  if (!target) return { ok: false, error: 'proposal-not-found', id };
  if (!applyNow) return { ok: true, queued: true, target };
  const result = applyMutation(target);
  appendJsonl(APPLIED_LOG, { ...target, appliedAt: now(), via: 'operator-approval', ...result });
  return { ok: true, applied: true, target, result };
}

function rejectProposal(id, reason = 'operator-rejected') {
  appendJsonl(APPLIED_LOG, { id, rejectedAt: now(), via: 'operator-rejection', reason });
  return { ok: true, rejected: true, id };
}

module.exports = {
  runPass,
  readApplied,
  readProposed,
  approveProposal,
  rejectProposal,
  PROPOSED_LOG,
  APPLIED_LOG,
  PREFS_FILE,
};
