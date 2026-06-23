'use strict';

/**
 * lib/recursive/agent-scores.js
 * ═══════════════════════════════
 * Thin adapter over PURPCLAW's canonical `agent_score.js` — does NOT introduce
 * a second store. Everything reads/writes the one true `agent_score.json`.
 *
 * Purpose: give the harness loop a clean API to (1) re-rank preferredAgents
 * by historical success before dispatch, and (2) write outcomes back after
 * each subtask, all without duplicating state.
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const SCORE_MODULE = path.join(ROOT, 'agent_score.js');
const DELTA_LOG = path.join(ROOT, 'agent_work', 'recursive', 'score-deltas.jsonl');

// Lazy-load so this file works even if agent_score.js is missing during scaffolding
let _scoreApi = null;
function api() {
  if (_scoreApi) return _scoreApi;
  try {
    _scoreApi = require(SCORE_MODULE);
  } catch (e) {
    console.warn('[agent-scores] canonical agent_score.js not loadable:', e.message);
    _scoreApi = null;
  }
  return _scoreApi;
}

const now = () => Date.now();

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function appendDelta(entry) {
  try {
    ensureDir(path.dirname(DELTA_LOG));
    fs.appendFileSync(DELTA_LOG, JSON.stringify(entry) + '\n');
  } catch {}
}

// ─── Public API for the harness ──────────────────────────────────────────────

/**
 * Rank a list of candidate agent names for a given intent (domain).
 * Falls back to original order if no scoring history exists.
 *
 * Returns: [{ name, score, attempts, successes }] sorted best-first.
 */
function rankByScore(agentNames, intent) {
  if (!Array.isArray(agentNames) || agentNames.length === 0) return [];
  const a = api();
  if (!a || typeof a.getAgentsForIntent !== 'function') {
    return agentNames.map(name => ({ name, score: 50, attempts: 0, successes: 0 }));
  }

  // Pull intent leaderboard, then re-order our subset by it
  const ranked = a.getAgentsForIntent(intent, 50); // [{agent, attempts, successes, successRate, avgDuration, score}, ...]
  const rankMap = new Map(ranked.map(r => [r.agent.toLowerCase(), r]));

  const result = agentNames.map((name, idx) => {
    const key = String(name).toLowerCase();
    const r = rankMap.get(key);
    if (r) {
      return { name, score: r.score, attempts: r.attempts, successes: r.successes, originalIdx: idx };
    }
    // No history → middle score, preserve original order tiebreaker
    return { name, score: 50, attempts: 0, successes: 0, originalIdx: idx };
  });

  result.sort((x, y) => (y.score - x.score) || (x.originalIdx - y.originalIdx));
  return result;
}

/**
 * Reorder preferredAgents list by score for a given intent.
 * Returns a new array (does not mutate input).
 */
function biasAgentsByScore(preferredAgents, intent) {
  const ranked = rankByScore(preferredAgents, intent);
  return ranked.map(r => r.name);
}

/**
 * Map harness verdict → canonical agent_score record.
 *
 * verdict ∈ ACCEPTED | CHALLENGED | REJECTED | FAILED
 *
 * Mapping:
 *   ACCEPTED   → success=true,  bugIntroduced=false
 *   CHALLENGED → success=false, bugIntroduced=false  (partial — counts as failure for routing)
 *   REJECTED   → success=false, bugIntroduced=true   (hallucinated/off-topic = quality bug)
 *   FAILED     → success=false, bugIntroduced=false
 */
function recordOutcome({ agent, verdict, intent, durationMs, jobId, subtaskId, reason }) {
  if (!agent || !verdict) return null;
  const a = api();
  if (!a || typeof a.recordTask !== 'function') return null;

  const v = String(verdict).toUpperCase();
  const success = v === 'ACCEPTED';
  const bugIntroduced = v === 'REJECTED';
  const duration = Math.max(0, Number(durationMs) || 0);
  const intentKey = String(intent || 'unknown').toLowerCase();

  const before = a.getAgentScore ? a.getAgentScore(agent) : null;
  a.recordTask(agent, intentKey, success, duration, { bugIntroduced });
  const after = a.getAgentScore ? a.getAgentScore(agent) : null;

  const entry = {
    at: now(),
    agent: String(agent).toLowerCase(),
    verdict: v,
    intent: intentKey,
    success,
    bugIntroduced,
    durationMs: duration,
    jobId, subtaskId, reason,
    scoreBefore: before,
    scoreAfter: after,
    scoreDelta: (before != null && after != null) ? (after - before) : null,
  };
  appendDelta(entry);
  return entry;
}

/**
 * Top N agents overall. Used by Mission Control self-evolution lens.
 */
function topAgents(n = 8) {
  const a = api();
  if (!a || typeof a.getAgentLeaderboard !== 'function') return [];
  return a.getAgentLeaderboard().slice(0, n);
}

/**
 * Per-intent top agents — used to feed planner with "who's best at this kind of work".
 */
function topAgentsForIntent(intent, n = 5) {
  const a = api();
  if (!a || typeof a.getAgentsForIntent !== 'function') return [];
  return a.getAgentsForIntent(intent, n);
}

/**
 * Tail of recent learning deltas — last N rows from the jsonl log.
 */
function recentDeltas(n = 30) {
  try {
    if (!fs.existsSync(DELTA_LOG)) return [];
    const lines = fs.readFileSync(DELTA_LOG, 'utf8').trim().split('\n');
    const rows = lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return rows.reverse();
  } catch {
    return [];
  }
}

module.exports = {
  rankByScore,
  biasAgentsByScore,
  recordOutcome,
  topAgents,
  topAgentsForIntent,
  recentDeltas,
  DELTA_LOG,
};
