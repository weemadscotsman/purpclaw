'use strict';

/**
 * lib/self-evolution-loop.js — Auto-research loop
 * Fires every 30 min: ingest new data, update memory matrix, self-evaluate.
 * ══════════════════════════════════════════════════════════════════════
 *
 * Status: checked by awaken-preflight via sel.status().running
 * Self-eval data: agent_work/self-eval.json
 * References: lib/self-context.js (auto-research every 30 min, ingest to memory matrix)
 *
 * This is the engine that makes PURPCLAW learn from idle time.
 */

const fs = require('fs');
const path = require('path');

const PURP_DIR = (() => {
  try {
    // Try to resolve relative to this file's location
    const up = __dirname;
    // Walk up to project root
    let dir = up;
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(dir, 'ecosystem.config.js'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Fallback: use process.cwd or environment
    return process.env.PURP_DIR || process.cwd();
  } catch { return process.env.PURP_DIR || process.cwd(); }
})();

const SELF_EVAL_FILE = path.join(PURP_DIR, 'agent_work', 'self-eval.json');
const AUTO_EVAL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ── State ─────────────────────────────────────────────────────────────────────

let _running = false;
let _lastRun = null;
let _intervalHandle = null;
let _runCount = 0;
let _findings = [];

/**
 * Load self-evaluation data from disk.
 * @returns {object}
 */
function loadSelfEval() {
  try {
    if (fs.existsSync(SELF_EVAL_FILE)) {
      return JSON.parse(fs.readFileSync(SELF_EVAL_FILE, 'utf-8'));
    }
  } catch {}
  return { runs: [], scores: {}, findings: [], lastRun: null };
}

/**
 * Save self-evaluation data to disk.
 * @param {object} data
 */
function saveSelfEval(data) {
  try {
    const dir = path.dirname(SELF_EVAL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SELF_EVAL_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[self-evolution-loop] saveSelfEval failed:', e && e.message);
  }
}

// ── Core evaluation logic ─────────────────────────────────────────────────────

/**
 * Run one self-evaluation cycle.
 * @param {object} [context] - Optional context { memories, sessions, skills }
 * @returns {object} evaluation result
 */
async function runCycle(context = {}) {
  const start = Date.now();
  const cycleId = `eval-${Date.now()}`;

  try {
    // Load current self-eval state
    const selfEval = loadSelfEval();

    // Collect recent activity
    const { MEMORY, FEEDBACK } = loadDependencies();
    const memories = MEMORY ? await safeCall(MEMORY, 'query', ['recent', { limit: 50 }]) : [];
    const feedback = FEEDBACK ? await safeCall(FEEDBACK, 'getRecent', [20]) : [];
    const skills = listSkills();

    // Score dimensions
    const scores = {
      toolAccuracy: computeToolAccuracy(selfEval),
      sessionPersistence: computeSessionPersistence(selfEval),
      memoryQuality: computeMemoryQuality(memories),
      feedbackIntegration: computeFeedbackIntegration(feedback),
      skillCoverage: computeSkillCoverage(skills),
      timestamp: new Date().toISOString(),
    };

    // Generate findings
    const findings = generateFindings(scores, { memories, feedback, skills });

    // Record this run
    const run = {
      cycleId,
      at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      scores,
      findings,
      context: {
        memoriesCount: Array.isArray(memories) ? memories.length : 0,
        feedbackCount: Array.isArray(feedback) ? feedback.length : 0,
        skillsCount: skills.length,
      },
    };

    // Update stored state
    selfEval.runs = [...(selfEval.runs || []), run].slice(-100); // keep last 100
    selfEval.scores = scores;
    selfEval.findings = findings;
    selfEval.lastRun = run.at;
    saveSelfEval(selfEval);

    _lastRun = run.at;
    _runCount++;
    _findings = findings;

    return { ok: true, cycleId, scores, findings, duration_ms: run.duration_ms };
  } catch (e) {
    console.error('[self-evolution-loop] runCycle error:', e && e.message);
    return { ok: false, cycleId, error: e && e.message };
  }
}

// ── Score computation helpers ──────────────────────────────────────────────────

function computeToolAccuracy(selfEval) {
  const runs = selfEval.runs || [];
  const recent = runs.slice(-20);
  if (!recent.length) return 0.5;
  const toolErrors = recent.filter(r => r.error).length;
  return Math.max(0, 1 - toolErrors / recent.length);
}

function computeSessionPersistence(selfEval) {
  const runs = selfEval.runs || [];
  const recent = runs.slice(-20);
  if (!recent.length) return 0.5;
  const sessionsWithContext = recent.filter(r => r.context && r.context.sessionId);
  return sessionsWithContext.length / recent.length;
}

function computeMemoryQuality(memories) {
  if (!Array.isArray(memories) || !memories.length) return 0.3;
  const withScore = memories.filter(m => m.score != null);
  if (!withScore.length) return 0.5;
  return withScore.reduce((s, m) => s + m.score, 0) / withScore.length;
}

function computeFeedbackIntegration(feedback) {
  if (!Array.isArray(feedback) || !feedback.length) return 0.3;
  const positive = feedback.filter(f => f.sentiment === 'positive' || f.rating >= 4);
  return positive.length / feedback.length;
}

function computeSkillCoverage(skills) {
  if (!skills.length) return 0.1;
  const criticalSkills = ['ask', 'run', 'stats', 'cost', 'permissions', 'init', 'eval', 'apply-diff', 'init-project', 'review'];
  const covered = criticalSkills.filter(s => skills.includes(s));
  return covered.length / criticalSkills.length;
}

function generateFindings(scores, context) {
  const findings = [];
  const { skills } = context;

  if (scores.toolAccuracy < 0.8) findings.push({ type: 'score_drop', dimension: 'toolAccuracy', value: scores.toolAccuracy, message: `Tool accuracy at ${(scores.toolAccuracy * 100).toFixed(0)}% — below 80% threshold` });
  if (scores.memoryQuality < 0.5) findings.push({ type: 'score_drop', dimension: 'memoryQuality', value: scores.memoryQuality, message: `Memory quality at ${(scores.memoryQuality * 100).toFixed(0)}% — needs more high-signal ingest` });
  if (scores.feedbackIntegration < 0.5) findings.push({ type: 'score_drop', dimension: 'feedbackIntegration', value: scores.feedbackIntegration, message: `Feedback integration at ${(scores.feedbackIntegration * 100).toFixed(0)}% — negative/neutral feedback not addressed` });
  if (scores.skillCoverage < 0.8) findings.push({ type: 'gap', dimension: 'skillCoverage', value: scores.skillCoverage, missing: ['ask', 'run', 'stats', 'eval'].filter(s => !skills.includes(s)), message: `Skill coverage at ${(scores.skillCoverage * 100).toFixed(0)}% — core skills missing` });
  if (scores.sessionPersistence < 0.9) findings.push({ type: 'score_drop', dimension: 'sessionPersistence', value: scores.sessionPersistence, message: `Session persistence at ${(scores.sessionPersistence * 100).toFixed(0)}% — sessions not surviving restarts` });

  return findings;
}

// ── Skill registry scan ───────────────────────────────────────────────────────

function listSkills() {
  try {
    const skillsDir = path.join(PURP_DIR, 'skills');
    if (!fs.existsSync(skillsDir)) return [];
    return fs.readdirSync(skillsDir)
      .filter(f => f.endsWith('.md') || fs.statSync(path.join(skillsDir, f)).isDirectory())
      .map(f => f.replace(/\.md$/, ''));
  } catch { return []; }
}

// ── Dependency loader (graceful) ───────────────────────────────────────────────

function loadDependencies() {
  let MEMORY = null, FEEDBACK = null;
  try { MEMORY = require('./memory-client'); } catch {}
  try { FEEDBACK = require('./user-feedback'); } catch {}
  return { MEMORY, FEEDBACK };
}

async function safeCall(obj, method, args = []) {
  if (!obj || typeof obj[method] !== 'function') return null;
  try { return await obj[method](...args); } catch { return null; }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Start the auto-research loop.
 * @param {object} [options]
 * @param {number} [options.intervalMs] - Override the 30-min default
 * @returns {{ ok: boolean, started: boolean, intervalMs: number }}
 */
function start(options = {}) {
  if (_running) return { ok: true, started: false, reason: 'already running', intervalMs: AUTO_EVAL_INTERVAL_MS };

  const interval = options.intervalMs || AUTO_EVAL_INTERVAL_MS;

  // Fire immediately on start
  runCycle().catch(e => console.error('[self-evolution-loop] initial cycle error:', e && e.message));

  _intervalHandle = setInterval(() => {
    runCycle().catch(e => console.error('[self-evolution-loop] cycle error:', e && e.message));
  }, interval);

  _running = true;

  return { ok: true, started: true, intervalMs: interval };
}

/**
 * Stop the auto-research loop.
 */
function stop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
  _running = false;
  return { ok: true, stopped: true };
}

/**
 * @returns {{ running: boolean, lastRun: string|null, runCount: number, findings: array }}
 */
function status() {
  return {
    running: _running,
    lastRun: _lastRun,
    runCount: _runCount,
    findings: _findings,
  };
}

/** Reset all state */
function reset() {
  stop();
  _lastRun = null;
  _runCount = 0;
  _findings = [];
  return { ok: true, reset: true };
}

module.exports = { start, stop, status, reset, runCycle };
