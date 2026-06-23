'use strict';

/**
 * lib/harness/benchmark.js
 * ═════════════════════════
 * Proof-of-improvement loop. Runs N canonical goals through the harness,
 * captures (accept-rate, avg iterations, avg subtasks, agent leaderboard delta,
 * Thringlet colony mood shift, wall-clock duration) and writes one row to
 * agent_work/benchmark/history.jsonl.
 *
 * Prints the latest run vs the last 5 historical rows so the operator can
 * SEE the recursive loop making the system better (or not) week over week.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { createHarness } = require('./engine');

const ROOT = path.resolve(__dirname, '..', '..');
const HISTORY_FILE = path.join(ROOT, 'agent_work', 'benchmark', 'history.jsonl');
const RUN_DIR = path.join(ROOT, 'agent_work', 'benchmark', 'runs');

const HARNESS_PORT = parseInt(process.env.HARNESS_PORT || '7798', 10);
const THRINGLET_PORT = parseInt(process.env.THRINGLET_BRIDGE_PORT || '7799', 10);

// Canonical benchmark suite — diverse enough that learning matters across runs
const CANONICAL_GOALS = [
  {
    id: 'audit-stack',
    intent: 'operations',
    goal: 'Audit the PURPCLAW stack: list which services are reachable, the top 3 risks to a clean end-to-end demo, and one mitigation each.',
  },
  {
    id: 'plan-feature',
    intent: 'architecture',
    goal: 'Plan how to add a "kill switch" feature to the harness that lets the operator halt all active jobs from one command. List files to touch, sequence of changes, and verification checks.',
  },
  {
    id: 'test-coverage',
    intent: 'testing',
    goal: 'Identify the 3 PURPCLAW modules with the weakest test coverage and propose a minimal Jest spec for each.',
  },
  {
    id: 'security-review',
    intent: 'security',
    goal: 'Review lib/harness/engine.js for any input-validation or injection risks. Report findings with file:line citations and severity.',
  },
  {
    id: 'doc-summary',
    intent: 'writing',
    goal: 'Summarize what PURPCLAW does in 5 bullets aimed at a senior engineer who has never seen the codebase. Cite three concrete files that prove each claim.',
  },
];

function now() { return Date.now(); }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function getJSON(port, urlPath, timeoutMs = 4000) {
  return new Promise(resolve => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: timeoutMs,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, data: JSON.parse(d || '{}') }); }
        catch { resolve({ ok: false, raw: d }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.end();
  });
}

async function captureColonyMood() {
  const r = await getJSON(THRINGLET_PORT, '/thringlets/colony-mood', 2000);
  return r.ok ? r.data : null;
}

async function captureAgentLeaderboard() {
  try {
    const a = require('../../agent_score.js');
    return a.getAgentLeaderboard ? a.getAgentLeaderboard().slice(0, 10) : [];
  } catch { return []; }
}

function summarizeJob(job) {
  const total = (job.plan || []).length;
  const accepted = (job.plan || []).filter(s => s.state === 'accepted').length;
  const failed = (job.plan || []).filter(s => ['failed', 'rejected'].includes(s.state)).length;
  const challenged = (job.log || []).filter(l => l.level === 'verdict' && /CHALLENGED/.test(l.message)).length;
  const karenEscalations = (job.plan || [])
    .reduce((sum, s) => sum + ((s.karenEscalations || []).length), 0);
  return {
    jobId: job.id,
    state: job.state,
    totalSubtasks: total,
    accepted,
    failed,
    acceptRate: total > 0 ? accepted / total : 0,
    challenged,
    karenEscalations,
    iterations: job.iteration || 0,
    toolsUsed: job.toolsUsed || 0,
    usedFallbackPlanner: !!job.usedFallbackPlanner,
    durationMs: (job.finishedAt || now()) - (job.startedAt || now()),
  };
}

async function runOnce(goalSpec, { maxIter = 12, retries = 1, log = () => {} } = {}) {
  const start = now();
  log(`▶ ${goalSpec.id}  intent=${goalSpec.intent}  goal=${goalSpec.goal.slice(0, 80)}…`);

  const harness = createHarness({ maxIterations: maxIter, maxRetriesPerSubtask: retries });
  let logCount = 0;
  harness.on('log', () => logCount++);

  let job = null;
  try {
    job = await harness.run(goalSpec.goal);
  } catch (e) {
    log(`  ✗ harness threw: ${e.message}`);
    return {
      ...goalSpec,
      summary: { state: 'failed', totalSubtasks: 0, accepted: 0, failed: 0, acceptRate: 0, challenged: 0, karenEscalations: 0, iterations: 0, toolsUsed: 0, usedFallbackPlanner: false, durationMs: now() - start },
      error: e.message,
    };
  }

  // Save raw job artifact for forensics
  try {
    ensureDir(RUN_DIR);
    fs.writeFileSync(path.join(RUN_DIR, `${job.id}.json`), JSON.stringify(job, null, 2));
  } catch {}

  const summary = summarizeJob(job);
  log(`  ${summary.state === 'done' ? '✓' : '✗'} ${summary.accepted}/${summary.totalSubtasks} accepted  iters=${summary.iterations}  karen=${summary.karenEscalations}  ${Math.round(summary.durationMs / 1000)}s`);
  return { ...goalSpec, summary };
}

function readHistory(n = 10) {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n');
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function appendHistory(row) {
  ensureDir(path.dirname(HISTORY_FILE));
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(row) + '\n');
}

function diffAgentBoards(before = [], after = []) {
  const beforeMap = new Map(before.map(a => [a.agent, a.score]));
  const changes = [];
  for (const row of after) {
    const prev = beforeMap.get(row.agent);
    if (prev != null && prev !== row.score) {
      changes.push({ agent: row.agent, before: prev, after: row.score, delta: row.score - prev });
    } else if (prev == null) {
      changes.push({ agent: row.agent, before: null, after: row.score, delta: 'new' });
    }
  }
  changes.sort((a, b) => {
    if (a.delta === 'new' && b.delta === 'new') return 0;
    if (a.delta === 'new') return -1;
    if (b.delta === 'new') return 1;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });
  return changes.slice(0, 10);
}

// ─── Public ────────────────────────────────────────────────────────────────────

async function runBenchmark({ goals = CANONICAL_GOALS, maxIter = 12, retries = 1, label = 'benchmark', log = () => {} } = {}) {
  const startedAt = now();
  const colonyBefore = await captureColonyMood();
  const boardBefore = await captureAgentLeaderboard();

  log(`\n═══ BENCHMARK: ${label}  ·  ${goals.length} goals  ·  ${new Date().toLocaleString()} ═══`);

  const results = [];
  for (const g of goals) {
    const r = await runOnce(g, { maxIter, retries, log });
    results.push(r);
  }

  const colonyAfter = await captureColonyMood();
  const boardAfter = await captureAgentLeaderboard();
  const boardDelta = diffAgentBoards(boardBefore, boardAfter);

  const aggregate = results.reduce((acc, r) => {
    acc.totalGoals++;
    acc.totalSubtasks   += r.summary.totalSubtasks;
    acc.totalAccepted   += r.summary.accepted;
    acc.totalFailed     += r.summary.failed;
    acc.totalIterations += r.summary.iterations;
    acc.totalKaren      += r.summary.karenEscalations;
    acc.totalDurationMs += r.summary.durationMs;
    acc.totalChallenged += r.summary.challenged;
    if (r.summary.state === 'done') acc.completed++;
    if (r.summary.usedFallbackPlanner) acc.fallbacks++;
    return acc;
  }, {
    totalGoals: 0, completed: 0, totalSubtasks: 0, totalAccepted: 0,
    totalFailed: 0, totalIterations: 0, totalKaren: 0, totalDurationMs: 0,
    totalChallenged: 0, fallbacks: 0,
  });
  aggregate.acceptRate = aggregate.totalSubtasks > 0 ? aggregate.totalAccepted / aggregate.totalSubtasks : 0;
  aggregate.avgIterations = aggregate.totalGoals > 0 ? aggregate.totalIterations / aggregate.totalGoals : 0;
  aggregate.avgKaren = aggregate.totalGoals > 0 ? aggregate.totalKaren / aggregate.totalGoals : 0;
  aggregate.avgDurationSec = aggregate.totalGoals > 0 ? aggregate.totalDurationMs / 1000 / aggregate.totalGoals : 0;

  const row = {
    label,
    startedAt,
    finishedAt: now(),
    goalCount: goals.length,
    aggregate,
    perGoal: results.map(r => ({ id: r.id, intent: r.intent, ...r.summary, error: r.error || null })),
    colonyBefore, colonyAfter,
    boardDelta,
  };
  appendHistory(row);

  // ── Auto-trigger evolution pass if this run regressed ──────────────────────
  // The system tries to fix itself between cycles. Only LOW-risk mutations
  // are auto-applied; everything else is queued for operator review.
  try {
    const history = readHistory(5);
    let shouldEvolve = false;
    let evolveReason = '';
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      const acceptDelta = (last.aggregate.acceptRate || 0) - (prev.aggregate.acceptRate || 0);
      const karenDelta  = (last.aggregate.avgKaren   || 0) - (prev.aggregate.avgKaren   || 0);
      if (acceptDelta < -0.05) { shouldEvolve = true; evolveReason = `accept-rate regressed ${(acceptDelta * 100).toFixed(1)}%`; }
      else if (karenDelta > 0.5) { shouldEvolve = true; evolveReason = `karen-rate spiked +${karenDelta.toFixed(2)}/goal`; }
      else if (last.aggregate.acceptRate < 0.3) { shouldEvolve = true; evolveReason = `accept-rate still low (${(last.aggregate.acceptRate * 100).toFixed(1)}%)`; }
    }
    if (shouldEvolve) {
      const mutator = require('../evolution/mutator');
      const passResult = mutator.runPass({ auto: true });
      row.autoEvolution = {
        triggeredBy: evolveReason,
        proposals: passResult.proposals?.length || 0,
        applied:   passResult.applied?.length || 0,
        queued:    passResult.queued?.length || 0,
      };
    }
  } catch (e) {
    row.autoEvolution = { error: e.message };
  }

  return row;
}

function formatRow(row) {
  const a = row.aggregate;
  return {
    when: new Date(row.startedAt).toLocaleString(),
    completed: `${a.completed}/${row.goalCount}`,
    accept: `${(a.acceptRate * 100).toFixed(1)}%`,
    avgIter: a.avgIterations.toFixed(1),
    avgKaren: a.avgKaren.toFixed(2),
    avgDur: `${a.avgDurationSec.toFixed(1)}s`,
    fallbacks: a.fallbacks,
  };
}

function printTrend(latest, history) {
  const lines = [];
  lines.push('');
  lines.push('═══ TREND  (latest vs prior runs) ═══');
  lines.push('');
  lines.push('  when                    completed  accept   iter  karen  duration  fallbacks');
  for (const row of history.slice(-6)) {
    const f = formatRow(row);
    const marker = row.startedAt === latest.startedAt ? '◆' : ' ';
    lines.push(`  ${marker} ${f.when.padEnd(22)} ${f.completed.padEnd(10)} ${f.accept.padEnd(8)} ${f.avgIter.padEnd(5)} ${f.avgKaren.padEnd(6)} ${f.avgDur.padEnd(9)} ${f.fallbacks}`);
  }
  lines.push('');
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const dA = latest.aggregate.acceptRate - prev.aggregate.acceptRate;
    const dI = latest.aggregate.avgIterations - prev.aggregate.avgIterations;
    const dK = latest.aggregate.avgKaren - prev.aggregate.avgKaren;
    const fmt = (n, suffix = '', flipGood = false) => {
      const good = flipGood ? n < 0 : n > 0;
      const sign = n >= 0 ? '+' : '';
      return `${good ? '✓' : (n === 0 ? '·' : '✗')} ${sign}${n.toFixed(2)}${suffix}`;
    };
    lines.push(`  Δ vs prior:  accept=${fmt(dA * 100, '%')}   iter=${fmt(dI, '', true)}   karen=${fmt(dK, '', true)}`);
  }
  if (latest.boardDelta && latest.boardDelta.length) {
    lines.push('');
    lines.push('  Agent leaderboard movement (top 6):');
    for (const d of latest.boardDelta.slice(0, 6)) {
      const delta = d.delta === 'new' ? '(new)' : `${d.delta >= 0 ? '+' : ''}${d.delta}`;
      lines.push(`    ${d.agent.padEnd(14)} ${String(d.before ?? 'new').padEnd(5)} → ${String(d.after).padEnd(5)}  ${delta}`);
    }
  }
  if (latest.colonyBefore && latest.colonyAfter) {
    lines.push('');
    lines.push(`  Thringlet colony: ${latest.colonyBefore.dominant} → ${latest.colonyAfter.dominant}   (goblins: ${latest.colonyBefore.goblinCount ?? 0} → ${latest.colonyAfter.goblinCount ?? 0})`);
  }
  return lines.join('\n');
}

module.exports = {
  runBenchmark,
  readHistory,
  CANONICAL_GOALS,
  HISTORY_FILE,
  formatRow,
  printTrend,
  summarizeJob,
};
