#!/usr/bin/env node
'use strict';

/**
 * PURPCLAW Harness Benchmark Runner
 * Runs canonical complex productivity goals through Unified API's in-process
 * harness in live mode, then records pass@1/pass@3, retries, lesson
 * writes, score updates, and duration. This is the proof loop for model
 * self-improvement: repeat the same work, compare the metrics, watch routing
 * and memory get better or regress.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GOALS_FILE = process.env.HARNESS_BENCHMARK_GOALS || path.join(ROOT, 'eval', 'harness-goals.json');
const RESULTS_DIR = path.join(ROOT, 'eval', 'results');
const RUNS_DIR = path.join(RESULTS_DIR, 'runs');
const LEDGER_FILE = path.join(ROOT, 'agent_work', 'harness_benchmark.jsonl');
const API_BASE = process.env.PURPCLAW_API_BASE || 'http://127.0.0.1:7780';
const TIMEOUT_MS = Number(process.env.HARNESS_BENCHMARK_TIMEOUT_MS || 600000);

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(filePath, row) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}

function compact(value, max = 240) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

async function fetchJson(url, init = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${url}`);
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function gradeMission(goal, mission) {
  const subtasks = Array.isArray(mission?.subtasks) ? mission.subtasks : [];
  const completed = subtasks.filter(s => s.status === 'completed').length;
  const domains = new Set(subtasks.map(s => s.domain).filter(Boolean));
  const requiredDomains = goal.requiredDomains || [];
  const missingDomains = requiredDomains.filter(domain => !domains.has(domain));
  const metrics = mission?.metrics || mission?.synthesis?.metrics || {};
  const statusOk = mission?.status === 'completed';
  const subtaskOk = subtasks.length >= (goal.minSubtasks || 1);
  const domainOk = missingDomains.length === 0;
  const completedOk = completed === subtasks.length && completed > 0;
  const lessonsOk = (metrics.memoryLessons || mission?.lessons?.length || 0) >= completed;
  const scoreOk = (metrics.agentScoreRecords || 0) >= completed;

  return {
    passed: Boolean(statusOk && subtaskOk && completedOk && lessonsOk && scoreOk),
    checks: {
      statusOk,
      subtaskOk,
      domainOk,
      completedOk,
      lessonsOk,
      scoreOk,
    },
    missingDomains,
    completed,
    total: subtasks.length,
  };
}

async function runGoal(goal, index) {
  const startedAt = Date.now();
  const start = await fetchJson(`${API_BASE}/api/harness/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      task: goal.task,
      intent: 'complex-productivity-harness',
      options: {
        executionMode: 'live',
        source: 'harness-benchmark',
        benchmarkId: goal.id,
      },
    }),
  });

  const missionId = start?.mission?.missionId || start?.missionId;
  if (!missionId) throw new Error(`No missionId returned for ${goal.id}`);

  let mission = start.mission;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const snapshot = await fetchJson(`${API_BASE}/api/harness/missions/${encodeURIComponent(missionId)}`, {}, 20000);
    mission = snapshot.mission || snapshot;
    if (['completed', 'failed', 'aborted'].includes(mission.status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const durationMs = Date.now() - startedAt;
  const grade = gradeMission(goal, mission);
  const metrics = mission?.metrics || mission?.synthesis?.metrics || {};
  return {
    id: goal.id,
    index,
    task: goal.task,
    missionId,
    status: mission?.status || 'unknown',
    passed: grade.passed,
    grade,
    metrics: {
      durationMs,
      harnessDurationMs: metrics.durationMs || 0,
      subtasks: mission?.subtasks?.length || 0,
      completedSubtasks: metrics.completedSubtasks || grade.completed || 0,
      failedSubtasks: metrics.failedSubtasks || 0,
      retries: metrics.retries || 0,
      passAt1: metrics.passAt1 || 0,
      passAt3: metrics.passAt3 || 0,
      memoryLessons: metrics.memoryLessons || mission?.lessons?.length || 0,
      agentScoreRecords: metrics.agentScoreRecords || 0,
      towerCalls: metrics.towerCalls || 0,
    },
    domains: Array.from(new Set((mission?.subtasks || []).map(s => s.domain).filter(Boolean))),
    agents: Array.from(new Set((mission?.subtasks || []).map(s => s.agent).filter(Boolean))),
  };
}

function summarize(run) {
  const total = run.results.length;
  const passed = run.results.filter(r => r.passed).length;
  const totalSubtasks = run.results.reduce((sum, r) => sum + r.metrics.subtasks, 0);
  const completedSubtasks = run.results.reduce((sum, r) => sum + r.metrics.completedSubtasks, 0);
  const retries = run.results.reduce((sum, r) => sum + r.metrics.retries, 0);
  const passAt1 = run.results.reduce((sum, r) => sum + r.metrics.passAt1, 0);
  const passAt3 = run.results.reduce((sum, r) => sum + r.metrics.passAt3, 0);
  const memoryLessons = run.results.reduce((sum, r) => sum + r.metrics.memoryLessons, 0);
  const agentScoreRecords = run.results.reduce((sum, r) => sum + r.metrics.agentScoreRecords, 0);
  const durationMs = run.results.reduce((sum, r) => sum + r.metrics.durationMs, 0);

  return {
    totalGoals: total,
    passedGoals: passed,
    failedGoals: total - passed,
    completionRate: total ? Number((passed / total).toFixed(4)) : 0,
    totalSubtasks,
    completedSubtasks,
    subtaskCompletionRate: totalSubtasks ? Number((completedSubtasks / totalSubtasks).toFixed(4)) : 0,
    retries,
    passAt1,
    passAt3,
    passAt1Rate: totalSubtasks ? Number((passAt1 / totalSubtasks).toFixed(4)) : 0,
    passAt3Rate: totalSubtasks ? Number((passAt3 / totalSubtasks).toFixed(4)) : 0,
    memoryLessons,
    agentScoreRecords,
    durationMs,
    avgGoalDurationMs: total ? Math.round(durationMs / total) : 0,
  };
}

async function main() {
  const suite = readJson(GOALS_FILE, null);
  if (!suite?.goals?.length) throw new Error(`No goals found in ${GOALS_FILE}`);

  const limit = Number(process.env.HARNESS_BENCHMARK_LIMIT || suite.goals.length);
  const run = {
    id: `hbench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    suite: suite.name || 'harness',
    suiteVersion: suite.version || 1,
    apiBase: API_BASE,
    mode: 'live',
    startedAt: new Date().toISOString(),
    results: [],
    summary: null,
    status: 'running',
  };

  const goals = suite.goals.slice(0, Math.max(1, limit));
  for (let i = 0; i < goals.length; i++) {
    try {
      run.results.push(await runGoal(goals[i], i + 1));
    } catch (error) {
      run.results.push({
        id: goals[i].id,
        index: i + 1,
        task: goals[i].task,
        status: 'failed',
        passed: false,
        error: compact(error.message, 500),
        errorData: error.data || null,
        metrics: { durationMs: 0, subtasks: 0, completedSubtasks: 0, failedSubtasks: 1, retries: 0, passAt1: 0, passAt3: 0, memoryLessons: 0, agentScoreRecords: 0 },
      });
    }
  }

  run.finishedAt = new Date().toISOString();
  run.summary = summarize(run);
  run.status = run.summary.failedGoals === 0 ? 'passed' : 'failed';

  ensureDir(RUNS_DIR);
  const outPath = path.join(RUNS_DIR, `${run.id}.json`);
  const latestPath = path.join(RESULTS_DIR, 'harness-benchmark-latest.json');
  fs.writeFileSync(outPath, JSON.stringify(run, null, 2), 'utf8');
  fs.writeFileSync(latestPath, JSON.stringify(run, null, 2), 'utf8');
  appendJsonl(LEDGER_FILE, {
    id: run.id,
    timestamp: run.finishedAt,
    status: run.status,
    summary: run.summary,
    resultPath: outPath,
  });

  console.log(JSON.stringify({
    status: run.status,
    id: run.id,
    summary: run.summary,
    resultPath: outPath,
    latestPath,
  }, null, 2));

  process.exit(run.status === 'passed' ? 0 : 1);
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'error', error: error.message }, null, 2));
  process.exit(2);
});
