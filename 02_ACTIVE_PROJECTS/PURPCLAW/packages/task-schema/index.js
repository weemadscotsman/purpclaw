'use strict';

/**
 * packages/task-schema — Shared Task Input Schema
 * ================================================
 * Canonical shape every harness adapter must accept.
 * Rejects invalid tasks early with specific error messages.
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §2.1
 *
 * Task shape:
 * {
 *   taskId:    string  — unique per run
 *   projectId: string  — project scope
 *   goal:      string  — what to accomplish
 *   repoPath:  string? — path to codebase (default: cwd)
 *   knownFiles:string[]?— files agent should read first
 *   constraints:string[]?— forbidden actions
 *   requiredOutputs:string[]?— files/artifacts that must exist
 *   acceptanceCriteria:string[]?— explicit pass conditions
 *   preferredHarness:string?— 'codex'|'claude'|'hermes'|'minimax'|'auto'
 *   fallbackHarness:string?  — harness to use if preferred unavailable
 *   priority:  number?  — 1=critical 2=high 3=normal 4=low (default:3)
 * }
 */

const PURPOSE = 'PURPCLAW_TASK_SCHEMA_v1';

const PRIORITIES = { 1: 'critical', 2: 'high', 3: 'normal', 4: 'low' };
const HARNESSES = ['codex', 'claude', 'hermes', 'minimax', 'auto'];

/**
 * Validate + normalise a raw task object.
 * Throws with specific messages; never returns null.
 */
function validateTask(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${PURPOSE} | task must be an object, got: ${typeof raw}`);
  }

  const errors = [];

  // Required fields
  if (!raw.taskId || typeof raw.taskId !== 'string') {
    errors.push(`taskId required (string), got: ${JSON.stringify(raw.taskId)}`);
  } else if (!/^[\w-]+$/.test(raw.taskId)) {
    errors.push(`taskId must be alphanumeric+hyphen+underscore, got: ${raw.taskId}`);
  }

  if (!raw.goal || typeof raw.goal !== 'string') {
    errors.push(`goal required (string), got: ${JSON.stringify(raw.goal)}`);
  } else if (raw.goal.trim().length < 3) {
    errors.push(`goal too short (min 3 chars): ${raw.goal}`);
  }

  // Optional fields with type checks
  if (raw.repoPath !== undefined && typeof raw.repoPath !== 'string') {
    errors.push(`repoPath must be string, got: ${typeof raw.repoPath}`);
  }

  if (raw.knownFiles !== undefined && !Array.isArray(raw.knownFiles)) {
    errors.push(`knownFiles must be array, got: ${typeof raw.knownFiles}`);
  }

  if (raw.constraints !== undefined && !Array.isArray(raw.constraints)) {
    errors.push(`constraints must be array, got: ${typeof raw.constraints}`);
  }

  if (raw.requiredOutputs !== undefined && !Array.isArray(raw.requiredOutputs)) {
    errors.push(`requiredOutputs must be array, got: ${typeof raw.requiredOutputs}`);
  }

  if (raw.acceptanceCriteria !== undefined && !Array.isArray(raw.acceptanceCriteria)) {
    errors.push(`acceptanceCriteria must be array, got: ${typeof raw.acceptanceCriteria}`);
  }

  if (raw.preferredHarness !== undefined && !HARNESSES.includes(raw.preferredHarness)) {
    errors.push(`preferredHarness must be one of ${HARNESSES.join(',')}, got: ${raw.preferredHarness}`);
  }

  if (raw.fallbackHarness != null && !HARNESSES.includes(raw.fallbackHarness)) {
    errors.push(`fallbackHarness must be one of ${HARNESSES.join(',')}, got: ${raw.fallbackHarness}`);
  }

  if (raw.priority !== undefined) {
    if (!PRIORITIES[raw.priority]) {
      errors.push(`priority must be 1|2|3|4, got: ${raw.priority}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`${PURPOSE} | VALIDATION_FAILED:\n  ${errors.join('\n  ')}`);
  }

  return normaliseTask(raw);
}

/**
 * Fill defaults on a valid task.
 */
function normaliseTask(raw) {
  return {
    taskId:           raw.taskId,
    projectId:        raw.projectId       || null,
    goal:             raw.goal.trim(),
    repoPath:         raw.repoPath        || process.cwd(),
    knownFiles:       raw.knownFiles       || [],
    constraints:      raw.constraints      || [],
    requiredOutputs:  raw.requiredOutputs  || [],
    acceptanceCriteria: raw.acceptanceCriteria || [],
    preferredHarness: raw.preferredHarness || 'auto',
    fallbackHarness:  raw.fallbackHarness || null,
    priority:         raw.priority        || 3,
    createdAt:       raw.createdAt        || new Date().toISOString(),
    schema:          PURPOSE,
  };
}

/**
 * Check if a harness name is valid.
 */
function isValidHarness(name) {
  return HARNESSES.includes(name);
}

module.exports = {
  PURPOSE,
  HARNESSES,
  PRIORITIES,
  validateTask,
  normaliseTask,
  isValidHarness,
};
