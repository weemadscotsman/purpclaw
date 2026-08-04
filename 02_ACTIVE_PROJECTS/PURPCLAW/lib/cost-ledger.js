'use strict';

/**
 * cost-ledger — per-task token + spend accounting.
 *
 * spend-gate.js already tracks daily/monthly totals for the kill-switch; this
 * is the per-TASK view Claude Code shows: "this task cost you $X, N tokens".
 * Records one JSONL row per LLM call and rolls up by taskId. Pricing reuses
 * spend-gate's costPer1K table so there's one source of truth for rates.
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG, pocketDir } = require('./spend-gate');

const LOG = path.join(pocketDir(), 'cost-ledger.jsonl');
const RATES = DEFAULT_CONFIG.costPer1K;

function estimateCost(provider, inputTokens = 0, outputTokens = 0) {
  const rate = RATES[String(provider || '').toLowerCase()] ?? RATES.default;
  return ((Number(inputTokens) + Number(outputTokens)) / 1000) * rate;
}

/** Record one LLM call against a task. Returns the row (with computed cost). */
function record({ taskId = 'ad-hoc', provider = 'default', model = null, inputTokens = 0, outputTokens = 0 } = {}) {
  const cost = estimateCost(provider, inputTokens, outputTokens);
  const row = {
    taskId, provider, model,
    inputTokens: Number(inputTokens) || 0,
    outputTokens: Number(outputTokens) || 0,
    cost: Number(cost.toFixed(6)),
    ts: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify(row) + '\n', 'utf8');
  return row;
}

function readRows() {
  try {
    return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/** Summary for one task, or every task if taskId omitted. */
function summary(taskId = null) {
  const rows = readRows().filter(r => !taskId || r.taskId === taskId);
  const byTask = {};
  for (const r of rows) {
    const t = (byTask[r.taskId] ||= { taskId: r.taskId, calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
    t.calls++; t.inputTokens += r.inputTokens; t.outputTokens += r.outputTokens; t.cost += r.cost;
  }
  const tasks = Object.values(byTask).map(t => ({ ...t, cost: Number(t.cost.toFixed(4)) }))
    .sort((a, b) => b.cost - a.cost);
  const total = tasks.reduce((n, t) => n + t.cost, 0);
  return { tasks, totalCost: Number(total.toFixed(4)), totalCalls: rows.length };
}

module.exports = { record, summary, estimateCost, LOG };

// self-check: node lib/cost-ledger.js
if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  // isolate: point pocketDir's log at a temp file by monkeypatching LOG isn't
  // trivial (const), so just assert math on estimateCost + a real round-trip.
  assert.strictEqual(estimateCost('openai', 1000, 1000), 0.06, 'openai 2k tokens @0.03/1k = 0.06');
  assert.strictEqual(estimateCost('ollama', 5000, 5000), 0, 'ollama is free');
  const before = summary().totalCalls;
  const r = record({ taskId: `selfcheck-${Date.now()}`, provider: 'gemini', inputTokens: 2000, outputTokens: 0 });
  assert.strictEqual(r.cost, 0.002, 'gemini 2k @0.001/1k = 0.002');
  const s = summary(r.taskId);
  assert.strictEqual(s.tasks.length, 1, 'one task in filtered summary');
  assert.strictEqual(s.tasks[0].calls, 1);
  assert.ok(summary().totalCalls > before, 'append increased total');
  console.log('cost-ledger: OK', JSON.stringify({ tmp: os.tmpdir() ? 'ok' : 'na', total: s.totalCost }));
}
