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
const STATUSES = ['passed', 'partial', 'blocked', 'failed', 'stopped'];
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
 * Derive final status + summary from accumulated evidence.
 * Respects explicit status decisions already set by the harness.
 *
 * Rules (in priority order):
 *   1. Fatal errors  → 'failed' regardless of evidence
 *   2. Explicit status already set (pass/partial/block/fail called) → keep it
 *   3. No work done  → 'blocked', summary explains why
 *   4. Unverified changes → 'partial' (work done but not proven)
 *   5. All verifications passed → 'passed'
 *   6. Any verification failed → 'partial'
 *   7. Skipped verifications → not treated as proof (→ partial)
 */
function finalize(result) {
  // Rule 1: fatal errors always win
  const fatal = result.errors.filter(e => e.fatal);
  if (fatal.length > 0) {
    result.status = 'failed';
    result.summary = `Fatal error: ${fatal[0].message}`;
    result.completedAt = new Date().toISOString();
    return result;
  }

  // Rule 2: if harness already made an explicit call, keep it
  // (pass/partial/block/fail all set completedAt — if it's set, harness decided)
  if (result.completedAt) return result;

  const hasWork     = result.filesRead.length > 0 || result.filesChanged.length > 0 || result.commandsRun.length > 0;
  const verifs      = result.verification || [];
  const passed      = verifs.filter(v => v.passed === true);
  const failed      = verifs.filter(v => v.passed === false);
  const skipped     = verifs.filter(v => v.passed == null);
  const allPassed   = verifs.length > 0 && verifs.length === passed.length;
  const hasFailure  = failed.length > 0;
  const hasChanges  = result.filesChanged.length > 0 || result.commandsRun.length > 0;

  // Rule 3: no work at all
  if (!hasWork) {
    result.status = 'blocked';
    result.summary = result.summary || 'Nothing was done — no files read, changed, or commands run.';
    result.completedAt = new Date().toISOString();
    return result;
  }

  // Rule 4: work but no verifications at all → partial
  if (verifs.length === 0 && hasChanges) {
    result.status = 'partial';
    result.summary = result.summary || 'Work was done but no verifications were recorded — unproven.';
    result.completedAt = new Date().toISOString();
    return result;
  }

  // Rule 5: all verifications passed
  if (allPassed) {
    result.status = 'passed';
    result.summary = result.summary || 'All verification criteria passed.';
    result.completedAt = new Date().toISOString();
    return result;
  }

  // Rule 6: any failure → partial
  if (hasFailure) {
    result.status = 'partial';
    const failedNames = failed.map(v => v.criterion).join(', ');
    result.summary = result.summary || `Verification failed: ${failedNames}.`;
    result.completedAt = new Date().toISOString();
    return result;
  }

  // Rule 7: only skipped verifications → partial (nothing proven)
  if (skipped.length > 0 && passed.length === 0) {
    result.status = 'partial';
    result.summary = result.summary || 'Verification was skipped — nothing was proven.';
    result.completedAt = new Date().toISOString();
    return result;
  }

  // Default: partial
  result.status = 'partial';
  result.summary = result.summary || 'Work in progress — some criteria not yet met.';
  result.completedAt = new Date().toISOString();
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
  addFileRead,
  addFileChanged,
  addCommand,
  addArtifact,
  addVerification,
  addError,
  finalize,
  validateResult,
  summaryLine,
};
