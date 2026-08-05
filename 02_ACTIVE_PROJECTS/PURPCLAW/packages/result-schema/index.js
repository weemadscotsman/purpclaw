'use strict';

/**
 * packages/result-schema — Shared Result Output Schema
 * ====================================================
 * Canonical shape every harness adapter must return.
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §2.2
 *
 * Result shape:
 * {
 *   taskId:           string
 *   projectId:        string
 *   harness:          'codex'|'claude'|'hermes'|'minimax'
 *   status:           'passed'|'partial'|'blocked'|'failed'
 *   summary:           string
 *   filesRead:         string[]
 *   filesChanged:      string[]
 *   commandsRun:       string[]
 *   artifacts:        {path, checksum, verified}[]
 *   verification:     {criterion, passed, evidence}[]
 *   errors:           {phase, message, stack?}[]
 *   nextAction:       string
 *   durationMs:       number
 *   tokensUsed?:      number
 *   costUsd?:         number
 * }
 */

const PURPOSE = 'PURPCLAW_RESULT_SCHEMA_v1';
const STATUSES = ['passed', 'partial', 'blocked', 'failed'];
const HARNESSES = ['codex', 'claude', 'hermes', 'minimax'];

/**
 * Create an empty result shell from a task + harness name.
 * All fields are initialised to safe defaults.
 */
function createResult(task, harness) {
  if (!HARNESSES.includes(harness)) {
    throw new Error(`${PURPOSE} | unknown harness: ${harness}`);
  }
  return {
    taskId:           task.taskId,
    projectId:        task.projectId || null,
    harness,
    status:           'blocked',   // assume blocked until proven passed
    summary:          '',
    filesRead:        [],
    filesChanged:     [],
    commandsRun:      [],
    artifacts:        [],
    verification:     [],
    errors:           [],
    nextAction:       '',
    durationMs:      0,
    tokensUsed:       null,
    costUsd:          null,
    completedAt:     null,
    schema:          PURPOSE,
  };
}

/**
 * Mark a result as passed.
 */
function pass(result, summary) {
  result.status = 'passed';
  result.summary = summary || 'Task completed successfully.';
  result.completedAt = new Date().toISOString();
  return result;
}

/**
 * Mark a result as partial (some but not all criteria met).
 */
function partial(result, summary) {
  result.status = 'partial';
  result.summary = summary || 'Task partially completed.';
  result.completedAt = new Date().toISOString();
  return result;
}

/**
 * Mark a result as blocked (cannot proceed).
 */
function block(result, reason, nextAction) {
  result.status = 'blocked';
  result.summary = reason || 'Task is blocked.';
  result.nextAction = nextAction || 'Resolve blocker before continuing.';
  result.completedAt = new Date().toISOString();
  return result;
}

/**
 * Mark a result as failed.
 */
function fail(result, reason, nextAction) {
  result.status = 'failed';
  result.summary = reason || 'Task failed after all retries.';
  result.nextAction = nextAction || 'Review errors and retry.';
  result.completedAt = new Date().toISOString();
  return result;
}

/**
 * Derive status from the evidence the harness actually collected.
 *
 * Every harness got this wrong, in one of two directions:
 *
 *   harness-claude          called pass() unconditionally, so a run that loaded
 *                           zero files still reported PASSED — "analysis
 *                           complete" having analysed nothing.
 *   codex/hermes/minimax    never set a status at all, so they kept
 *                           createResult's 'blocked' default and could never
 *                           report success no matter how much work they did.
 *
 * Fake green on one, fake red on three. Both come from status being set by hand
 * somewhere far from the evidence. This derives it from the receipts instead,
 * so the two cannot drift:
 *
 *   fatal error recorded                       -> failed
 *   nothing read, changed, or run              -> blocked   (did no work)
 *   a verification criterion failed            -> partial   (work done, unproven)
 *   work done, no verification at all          -> partial   (unverified is not passed)
 *   work done and every verification passed    -> passed
 *
 * A harness may still call pass/partial/block/fail directly when it knows
 * better; finalize() only fills in a status nobody set.
 */
function finalize(result, opts = {}) {
  if (opts.force !== true && result.completedAt) return result;   // already decided

  const read = result.filesRead.length;
  const changed = result.filesChanged.length;
  const ran = result.commandsRun.length;
  const didWork = read + changed + ran > 0;

  const checks = result.verification || [];
  // passed === null means "skipped", which is neither proof nor failure.
  const attempted = checks.filter(v => v.passed === true || v.passed === false);
  const failedChecks = attempted.filter(v => v.passed === false);

  const fatal = (result.errors || []).some(e => e.fatal === true || e.severity === 'fatal');

  if (fatal) {
    return fail(result, result.summary || 'Harness reported a fatal error.',
      'Review result.errors.');
  }
  if (!didWork) {
    return block(result,
      result.summary || 'No files were read or changed and no commands were run — nothing was done.',
      'Check the repository path and that the goal names something that exists.');
  }
  if (failedChecks.length) {
    return partial(result,
      `${changed} file(s) changed, ${ran} command(s) run, `
      + `${failedChecks.length} of ${attempted.length} verification checks failed.`);
  }
  if (attempted.length === 0) {
    return partial(result,
      `${read} file(s) read, ${changed} changed, ${ran} command(s) run — no verification ran, `
      + 'so the change is unproven.');
  }
  return pass(result,
    `${read} file(s) read, ${changed} changed, ${ran} command(s) run, `
    + `${attempted.length} verification check(s) passed.`);
}

/**
 * Record a file read.
 */
function addFileRead(result, filePath) {
  if (!result.filesRead.includes(filePath)) {
    result.filesRead.push(filePath);
  }
}

/**
 * Record a file changed.
 */
function addFileChanged(result, filePath) {
  if (!result.filesChanged.includes(filePath)) {
    result.filesChanged.push(filePath);
  }
}

/**
 * Record a command run.
 */
function addCommand(result, cmd) {
  if (!result.commandsRun.includes(cmd)) {
    result.commandsRun.push(cmd);
  }
}

/**
 * Add an artifact.
 */
function addArtifact(result, { path: artifactPath, checksum, verified }) {
  result.artifacts.push({
    path: artifactPath,
    checksum: checksum || null,
    verified: verified || false,
  });
}

/**
 * Add a verification entry.
 */
function addVerification(result, { criterion, passed, evidence }) {
  result.verification.push({
    criterion,
    passed: !!passed,
    evidence: evidence || null,
  });
}

/**
 * Add an error entry.
 */
function addError(result, { phase, message, stack }) {
  result.errors.push({
    phase: phase || 'unknown',
    message,
    stack: stack || null,
  });
}

/**
 * Validate a result object before returning it.
 */
function validateResult(result) {
  const errors = [];
  if (!result.taskId) errors.push('taskId required');
  if (!HARNESSES.includes(result.harness)) errors.push(`harness must be one of ${HARNESSES.join(',')}`);
  if (!STATUSES.includes(result.status)) errors.push(`status must be one of ${STATUSES.join(',')}`);
  if (typeof result.summary !== 'string') errors.push('summary must be string');
  if (!Array.isArray(result.filesRead)) errors.push('filesRead must be array');
  if (!Array.isArray(result.filesChanged)) errors.push('filesChanged must be array');
  if (!Array.isArray(result.commandsRun)) errors.push('commandsRun must be array');
  if (!Array.isArray(result.artifacts)) errors.push('artifacts must be array');
  if (!Array.isArray(result.verification)) errors.push('verification must be array');
  if (!Array.isArray(result.errors)) errors.push('errors must be array');
  if (errors.length > 0) {
    throw new Error(`${PURPOSE} | INVALID_RESULT:\n  ${errors.join('\n  ')}`);
  }
  return result;
}

/**
 * Print a human-readable summary line.
 */
function summaryLine(result) {
  const icons = { passed: '✅', partial: '⚠️', blocked: '🚫', failed: '❌' };
  const icon = icons[result.status] || '?';
  return `${icon} [${result.harness}] ${result.status.toUpperCase()} | ${result.summary} | read:${result.filesRead.length} chg:${result.filesChanged.length} err:${result.errors.length} | ${result.durationMs}ms`;
}

module.exports = {
  PURPOSE,
  STATUSES,
  HARNESSES,
  createResult,
  pass,
  partial,
  block,
  fail,
  finalize,
  addFileRead,
  addFileChanged,
  addCommand,
  addArtifact,
  addVerification,
  addError,
  validateResult,
  summaryLine,
};
