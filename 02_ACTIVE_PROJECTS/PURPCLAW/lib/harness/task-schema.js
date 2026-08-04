'use strict';

/**
 * PURPCLAW_TASK — Unified Task Schema
 * ====================================
 * One schema every harness entry point must accept.
 * One schema every harness output stage must produce.
 *
 * Replaces:
 *   - lib/job-contract.js  JOB_TYPES (8 hardcoded keyword buckets)
 *   - orchestrator.js      AGENT_BY_INTENT (27 intent keys, keyword-scraped)
 *   - agent_score.js       historical scoring (runs AFTER routing — too late)
 *
 * Parity spine contract (Eddie Cannon 2026-08-04):
 *   USER → INTAKE → ROUTER → TASK NORMALISER → CONTEXT SPINE → EXECUTION MODE
 *   → WORK LOOP → VERIFICATION → PACKAGING → MEMORY/AUDIT → PRESENTATION
 *
 * Stage 1 deliverable: this file + parity test.
 * Stage 2 deliverable: context spine wired to .files + .constraints fields.
 * Stage 3 deliverable: PURPCLAW_RESULT at lib/harness/result-schema.js.
 */

// ── Harness modes ────────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const HARNESS_MODE = Object.freeze({
  CODEX:   'codex',    // repo surgery, patches, diffs, TDD, tight-scope edits
  CLAUDE:  'claude',   // deep reasoning, long-context, system design, spec repair
  HERMES:  'hermes',   // tool orchestration, multi-step execution, UI wiring
  MINIMAX: 'minimax',  // fast generation, creative bursts, UI buildout, transforms
  AUTO:    'auto',     // router selects mode from task fields — default
});

const HARNESS_MODES = Object.values(HARNESS_MODE);

// ── Priority levels ───────────────────────────────────────────────────────────

/** @type {Record<string, number>} */
const PRIORITY = Object.freeze({
  CRITICAL: 1,
  HIGH:     2,
  NORMAL:   3,
  LOW:      4,
});

// ── Task schema ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PurpClawTask
 * Canonical shape per PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT §0.
 *
 * Field names MUST match the blueprint contract exactly — harness-mode
 * implementations downstream destructure by these names without aliasing.
 *
 * @property {string}           taskId        Unique id — auto-generated if omitted
 * @property {string}           projectId     Project/repo identifier (null if unknown)
 * @property {string}           goal          What the user wants (raw or normalised)  [required]
 * @property {string}           [repoPath]   Repo root or directory the task operates on
 * @property {string[]}         [knownFiles]  Files known to be relevant
 * @property {string[]}         [constraints] Non-functional requirements, limits, style rules
 * @property {string[]}         [requiredOutputs] What a successful result contains
 * @property {string[]}         [acceptanceCriteria] How to verify success (executable criteria)
 * @property {number}           [priority=3]   1=CRITICAL 2=HIGH 3=NORMAL 4=LOW
 * @property {string}           [preferredHarness] Preferred harness (codex|claude|hermes|minimax|auto)
 * @property {string}           [fallbackHarness]  Fallback harness if preferred unavailable
 * @property {string}           [routeIntent]  Operational intent (build|fix|research|design|...)
 * @property {string[]}         [preferredAgents]  Named agents to prefer (agent names)
 * @property {Object}           [context]      Arbitrary context baggage from caller
 */

// ── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['goal'];
const OPTIONAL_WITH_DEFAULTS = {
  priority:            PRIORITY.NORMAL,
  preferredHarness:    HARNESS_MODE.AUTO,
  fallbackHarness:     null,
  projectId:           null,
  repoPath:            null,
  knownFiles:          null,
  constraints:         null,
  requiredOutputs:     null,
  acceptanceCriteria:  null,
};

/**
 * Validate a task object.
 * @param {Partial<PurpClawTask>} raw
 * @returns {{ ok: boolean, task: PurpClawTask, errors: string[] }}
 */
function validateTask(raw) {
  const errors = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, task: null, errors: ['task must be a plain object'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!raw[field] || String(raw[field]).trim() === '') {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (raw.preferredHarness && !HARNESS_MODES.includes(raw.preferredHarness)) {
    errors.push(`invalid preferredHarness: '${raw.preferredHarness}' — must be one of: ${HARNESS_MODES.join('|')}`);
  }

  if (raw.priority != null && !(raw.priority in PRIORITY)) {
    errors.push(`invalid priority: '${raw.priority}' — must be one of: ${Object.keys(PRIORITY).join('|')}`);
  }

  if (raw.routeIntent && typeof raw.routeIntent !== 'string') {
    errors.push('routeIntent must be a string');
  }

  if (raw.knownFiles && !Array.isArray(raw.knownFiles)) {
    errors.push('knownFiles must be an array');
  }

  if (raw.preferredAgents && !Array.isArray(raw.preferredAgents)) {
    errors.push('preferredAgents must be an array');
  }

  if (errors.length > 0) {
    return { ok: false, task: null, errors };
  }

  /** @type {PurpClawTask} */
  const task = {
    taskId:             raw.taskId             || `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    goal:               String(raw.goal || '').trim(),
    projectId:          raw.projectId          || null,
    repoPath:           raw.repoPath           || null,
    knownFiles:         raw.knownFiles         || null,
    constraints:        raw.constraints        || null,
    requiredOutputs:    raw.requiredOutputs    || null,
    acceptanceCriteria: raw.acceptanceCriteria || null,
    priority:           PRIORITY[raw.priority] || OPTIONAL_WITH_DEFAULTS.priority,
    preferredHarness:   raw.preferredHarness  || OPTIONAL_WITH_DEFAULTS.preferredHarness,
    fallbackHarness:    raw.fallbackHarness   || OPTIONAL_WITH_DEFAULTS.fallbackHarness,
    routeIntent:        raw.routeIntent        || null,
    preferredAgents:    raw.preferredAgents    || null,
    context:            raw.context            || null,
  };

  return { ok: true, task, errors: [] };
}

// ── Mode selector ─────────────────────────────────────────────────────────────

/** @type {Record<string, string[]>} */
const MODE_KEYWORDS = {
  [HARNESS_MODE.CODEX]: [
    'fix', 'patch', 'diff', 'refactor', 'test', 'build', 'wire', 'connect',
    'component', 'api route', 'endpoint', 'hook', 'middleware', 'tdd',
    'write test', 'add test', 'bug', 'error', 'crash', 'broken',
  ],
  [HARNESS_MODE.CLAUDE]: [
    'design', 'architecture', 'plan', 'analyse', 'analyze', 'system',
    'research', 'spec', 'document', 'compare', 'evaluate', 'audit',
    'assess', 'investigate', 'deep', 'understand', 'explain',
  ],
  [HARNESS_MODE.HERMES]: [
    'deploy', 'run', 'execute', 'orchestrate', 'pipeline', 'workflow',
    'automate', 'script', 'batch', 'schedule', 'trigger', 'invoke',
    'connect', 'integrate', 'setup', 'configure',
  ],
  [HARNESS_MODE.MINIMAX]: [
    'generate', 'create', 'build UI', 'design page', 'make a', 'component',
    'transform', 'rewrite', 'convert', 'migrate', 'style', 'theme',
    'mockup', 'prototype', 'sketch',
  ],
};

/**
 * Auto-select harness mode from task goal text.
 * Falls back to AUTO (engine picks best available).
 * @param {string} goal
 * @returns {string}
 */
function selectHarnessMode(goal) {
  const lower = goal.toLowerCase();
  let bestMode = HARNESS_MODE.AUTO;
  let bestScore = 0;

  for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMode = mode;
    }
  }

  return bestMode;
}

/**
 * Normalise a raw task (string goal or object) into a validated PurpClawTask.
 * Used at every harness entry point.
 * @param {string | Partial<PurpClawTask>} raw
 * @returns {{ ok: boolean, task: PurpClawTask|null, errors: string[] }}
 */
function normaliseTask(raw) {
  // Raw string goal
  if (typeof raw === 'string') {
    return normaliseTask({ goal: raw });
  }

  const validated = validateTask(raw);
  if (!validated.ok) return validated;

  // Auto-fill preferredHarness if AUTO
  if (validated.task.preferredHarness === HARNESS_MODE.AUTO) {
    validated.task.preferredHarness = selectHarnessMode(validated.task.goal);
  }

  return validated;
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  HARNESS_MODE,
  HARNESS_MODES,
  PRIORITY,
  PurpClawTask: null, // JSDoc only
  validateTask,
  normaliseTask,
  selectHarnessMode,
};
