'use strict';

/**
 * SPEC-008: Model-Per-Phase Routing
 *
 * Different phases of a task need different models.
 * Planning = slow + deep. Execution = fast + cheap.
 * Verification = careful + exhaustive.
 *
 * The routing table is explicit, operator-controlled, and probeable.
 * Defaults mirror the spec: planning=openai/o4-mini, execution=minimax/MiniMax-M3.
 */

const ROUTING_TABLE_ENV = 'PURPCLAW_PHASE_ROUTING';

// ── Default routing table ────────────────────────────────────────────────────

const DEFAULT_TABLE = {
  planning:     { provider: 'openai',    model: 'o4-mini',        cost_budget: 0.50 },
  execution:    { provider: 'minimax',   model: 'MiniMax-M3',      cost_budget: 0.05 },
  verification: { provider: 'openai',    model: 'o4-mini',        cost_budget: 0.20 },
  reflection:   { provider: 'anthropic', model: 'claude-sonnet-4', cost_budget: 0.10 },
  fallback:     { provider: 'minimax',   model: 'MiniMax-M3' },
};

const DEFAULT_MAX_COST = 5.00;

// sessionId → { provider, model }  (set by priority-steer via setOverride)
const _sessionOverrides = new Map();

/**
 * Retrieve the queued model override for a session, if any.
 * Used by agent-loop to honour a priority-steer model-swap before a turn starts.
 * @param {string} sessionId
 * @returns {{ provider, model } | null}
 */
function getOverride(sessionId) {
  return _sessionOverrides.get(sessionId) || null;
}

/**
 * Queue a model override for a session (set by priority-steer interrupt).
 * @param {string} sessionId
 * @param {{ provider, model } | null} modelConfig - null to clear
 */
function setOverride(sessionId, modelConfig) {
  if (!modelConfig) { _sessionOverrides.delete(sessionId); return; }
  _sessionOverrides.set(sessionId, modelConfig);
}

// ── Cost tracking ────────────────────────────────────────────────────────────

// taskId → { phase → { cost, calls, promptTokens, completionTokens } }
const _taskCosts = new Map();

function _task(taskId) {
  if (!_taskCosts.has(taskId)) {
    _taskCosts.set(taskId, {});
  }
  return _taskCosts.get(taskId);
}

// ── Routing table ───────────────────────────────────────────────────────────

let _table = _loadTable();

function _loadTable() {
  try {
    if (process.env[ROUTING_TABLE_ENV]) {
      return JSON.parse(process.env[ROUTING_TABLE_ENV]);
    }
  } catch {}
  return { ...DEFAULT_TABLE, phases: { ...DEFAULT_TABLE } };
}

function _mergePhases(t) {
  // Support both flat { planning, execution } and nested { phases: { planning } }
  if (t.phases) return { ...t.phases, fallback: t.fallback || DEFAULT_TABLE.fallback, max_cost_per_task: t.max_cost_per_task };
  return t;
}

function getTable() {
  return _table;
}

function setTable(t) {
  _table = _mergePhases(t);
}

// ── Model resolution ─────────────────────────────────────────────────────────

/**
 * Get model config for a phase.
 * @param {string} phase - planning | execution | verification | reflection
 * @param {object} context - optional { taskId, override }
 * @returns {{ provider, model, cost_budget, phase }}
 */
function getModel(phase, context = {}) {
  const { taskId, override } = context;
  const t = _table;

  // Per-task override takes precedence
  if (override) return { ...override, phase };

  const phaseConfig = t[phase];
  if (!phaseConfig) {
    // Fall back to default if phase not in table
    const def = DEFAULT_TABLE[phase];
    if (def) return { ...def, phase };
    // Last resort: fallback
    return { ...t.fallback || DEFAULT_TABLE.fallback, phase };
  }

  // Check if phase budget is exhausted → use fallback
  if (taskId && phaseConfig.cost_budget) {
    const phaseCost = (_task(taskId)[phase] || {}).total || 0;
    if (phaseCost >= phaseConfig.cost_budget) {
      return { ...t.fallback || DEFAULT_TABLE.fallback, phase, routed_via: 'budget_exhausted' };
    }
  }

  return { ...phaseConfig, phase };
}

// ── Override ─────────────────────────────────────────────────────────────────

/**
 * Override routing for a specific phase within a task.
 * @param {string} phase
 * @param {{ provider, model, cost_budget }} config
 * @param {string} taskId - optional, for cost tracking
 */
function override(phase, config, taskId = null) {
  const entry = { ...config };
  if (taskId) {
    // Seed cost tracking for this phase
    if (!_taskCosts.has(taskId)) _taskCosts.set(taskId, {});
    if (!_taskCosts.get(taskId)[phase]) {
      _taskCosts.get(taskId)[phase] = { cost: 0, calls: 0, promptTokens: 0, completionTokens: 0, total: 0 };
    }
  }
  return getModel(phase, { override: entry });
}

// ── Cost tracking ────────────────────────────────────────────────────────────

/**
 * Record a call cost for a phase within a task.
 * @param {string} taskId
 * @param {string} phase
 * @param {{ cost, promptTokens, completionTokens }} usage
 */
function recordCost(taskId, phase, usage = {}) {
  const t = _task(taskId);
  if (!t[phase]) {
    t[phase] = { cost: 0, calls: 0, promptTokens: 0, completionTokens: 0, total: 0 };
  }
  const s = t[phase];
  s.cost += usage.cost || 0;
  s.promptTokens += usage.promptTokens || 0;
  s.completionTokens += usage.completionTokens || 0;
  s.total = s.cost; // alias
  s.calls = (s.calls || 0) + 1;
}

/**
 * Get cost report for a task.
 * @param {string} taskId
 * @returns {{ phase → { cost, calls, promptTokens, completionTokens }, total }}
 */
function costReport(taskId) {
  const t = _task(taskId);
  const report = {};
  let grandTotal = 0;
  for (const [phase, data] of Object.entries(t)) {
    report[phase] = { ...data };
    grandTotal += data.cost || 0;
  }
  return { phases: report, total: grandTotal };
}

/**
 * Clear cost tracking for a task.
 */
function clearTask(taskId) {
  _taskCosts.delete(taskId);
}

// ── Phase detection ──────────────────────────────────────────────────────────

const PHASE_KEYWORDS = {
  planning:     ['plan', 'design', 'architect', 'strategy', 'approach', 'outline', 'structure'],
  execution:    ['implement', 'write', 'build', 'create', 'make', 'add', 'fix', 'refactor', 'run'],
  verification: ['test', 'verify', 'check', 'validate', 'audit', 'review', 'ensure', 'assert'],
  reflection:   ['reflect', 'improve', 'optimize', 'score', 'analyze', 'learn', 'think about'],
};

/**
 * Auto-detect phase from a prompt.
 * Returns the most likely phase, or 'execution' as default.
 */
function detectPhase(prompt) {
  if (!prompt) return 'execution';
  const lower = prompt.toLowerCase();
  let bestPhase = 'execution';
  let bestScore = 0;
  for (const [phase, keywords] of Object.entries(PHASE_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    } else if (score === bestScore && score > 0) {
      // Tie-break: verification > execution > planning > reflection
      const order = ['reflection', 'planning', 'execution', 'verification'];
      if (order.indexOf(phase) > order.indexOf(bestPhase)) {
        bestPhase = phase;
      }
    }
  }
  return bestPhase;
}

// ── Module API ───────────────────────────────────────────────────────────────

module.exports = {
  getModel,
  override,
  recordCost,
  costReport,
  clearTask,
  detectPhase,
  getTable,
  setTable,
  getOverride,
  setOverride,
  DEFAULT_TABLE,
  DEFAULT_MAX_COST,
};
