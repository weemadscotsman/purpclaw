'use strict';

/**
 * packages/memory-audit — Resumable Task Records + Lineage
 * ======================================================
 * One record written per harness run. Supports resume from last
 * successful step, task lineage, and retry tracking.
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §2.5
 *
 * Responsibilities:
 *   - Write one task record per run
 *   - Record all tool calls
 *   - Record files changed
 *   - Record verification outcomes
 *   - Record failed attempts
 *   - Record final disposition
 *   - Support resume from last successful step
 *   - Support task lineage and retries
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Paths ───────────────────────────────────────────────────────────────────

const AUDIT_DIR = path.join(__dirname, '..', '..', '.harness-audit');
const LINEAGE_FILE = path.join(AUDIT_DIR, 'lineage.jsonl');

// Ensure audit dir exists
function ensureAuditDir() {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

// ── Record creation ────────────────────────────────────────────────────────

/**
 * Create a new task record. Writes to disk immediately.
 * @param {Object} task  — PurpClawTask
 * @param {string} harness
 * @returns {TaskRecord}
 */
function startTask(task, harness) {
  ensureAuditDir();
  const now = new Date().toISOString();

  const record = {
    id:          `rec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    taskId:      task.taskId,
    projectId:   task.projectId || null,
    harness,
    status:      'running',
    startedAt:   now,
    completedAt: null,
    steps:       [],
    filesRead:   [],
    filesChanged:[],
    commandsRun: [],
    artifacts:   [],
    verificationResults: [],
    errors:      [],
    toolCalls:   [],
    lineage: {
      parentTaskId: null,
      parentRecordId: null,
      attemptIndex: 0,
    },
    taskSnapshot: {
      goal:              task.goal,
      repoPath:          task.repoPath       || null,
      knownFiles:        task.knownFiles     || null,
      constraints:       task.constraints    || null,
      requiredOutputs:   task.requiredOutputs || null,
      acceptanceCriteria:task.acceptanceCriteria || null,
      preferredHarness:  task.preferredHarness || null,
    },
  };

  _writeRecord(record);
  return record;
}

/**
 * Log a tool call against an active record.
 * @param {string} recordId
 * @param {Object} toolCall  — { tool, input, output, durationMs, ok }
 */
function logToolCall(recordId, toolCall) {
  const rec = _loadRecord(recordId);
  if (!rec) return;
  rec.toolCalls.push({
    ...toolCall,
    at: new Date().toISOString(),
  });
  _writeRecord(rec);
}

/**
 * Log a step completion.
 * @param {string} recordId
 * @param {Object} step  — { stepId, name, status, output?, error?, durationMs }
 */
function logStep(recordId, step) {
  const rec = _loadRecord(recordId);
  if (!rec) return;
  rec.steps.push({
    ...step,
    at: new Date().toISOString(),
  });
  _writeRecord(rec);
}

/**
 * Record a file read.
 * @param {string} recordId
 * @param {string} filePath
 */
function logFileRead(recordId, filePath) {
  const rec = _loadRecord(recordId);
  if (!rec) return;
  if (!rec.filesRead.includes(filePath)) {
    rec.filesRead.push(filePath);
  }
  _writeRecord(rec);
}

/**
 * Record a file changed.
 * @param {string} recordId
 * @param {string} filePath
 */
function logFileChanged(recordId, filePath) {
  const rec = _loadRecord(recordId);
  if (!rec) return;
  if (!rec.filesChanged.includes(filePath)) {
    rec.filesChanged.push(filePath);
  }
  _writeRecord(rec);
}

/**
 * Record a command run.
 * @param {string} recordId
 * @param {string} cmd
 */
function logCommand(recordId, cmd) {
  const rec = _loadRecord(recordId);
  if (!rec) return;
  if (!rec.commandsRun.includes(cmd)) {
    rec.commandsRun.push(cmd);
  }
  _writeRecord(rec);
}

/**
 * Record a verification result.
 * @param {string} recordId
 * @param {Object} result  — { criterion, passed, evidence }
 */
function logVerification(recordId, result) {
  const rec = _loadRecord(recordId);
  if (!rec) return;
  rec.verificationResults.push({
    ...result,
    at: new Date().toISOString(),
  });
  _writeRecord(rec);
}

/**
 * Record an error.
 * @param {string} recordId
 * @param {string} phase
 * @param {string} message
 * @param {string} [stack]
 */
function logError(recordId, phase, message, stack) {
  const rec = _loadRecord(recordId);
  if (!rec) return;
  rec.errors.push({ phase, message, stack: stack || null, at: new Date().toISOString() });
  _writeRecord(rec);
}

/**
 * Mark a task record as complete.
 * @param {string} recordId
 * @param {string} status   — 'passed'|'partial'|'blocked'|'failed'
 * @param {string} summary
 */
function finishTask(recordId, status, summary) {
  const rec = _loadRecord(recordId);
  if (!rec) return null;
  rec.status      = status;
  rec.summary     = summary;
  rec.completedAt = new Date().toISOString();
  _writeRecord(rec);

  // Append lineage to LINEAGE_FILE
  _writeLineage(rec);

  return rec;
}

// ── Resume support ─────────────────────────────────────────────────────────

/**
 * Find the last successful step in an interrupted record.
 * @param {string} recordId
 * @returns {Object|null}  — last step with status === 'ok'
 */
function lastSuccessfulStep(recordId) {
  const rec = _loadRecord(recordId);
  if (!rec) return null;
  for (let i = rec.steps.length - 1; i >= 0; i--) {
    if (rec.steps[i].status === 'ok') {
      return rec.steps[i];
    }
  }
  return null;
}

/**
 * List all records for a taskId (retries / lineage chain).
 * @param {string} taskId
 * @returns {TaskRecord[]}
 */
function getRecordChain(taskId) {
  ensureAuditDir();
  const records = [];
  try {
    const files = fs.readdirSync(AUDIT_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, file), 'utf8'));
        if (rec.taskId === taskId) records.push(rec);
      } catch { /* skip corrupt */ }
    }
  } catch { /* dir doesn't exist yet */ }
  return records.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/**
 * Load a record by ID.
 * @param {string} recordId
 * @returns {TaskRecord|null}
 */
function _loadRecord(recordId) {
  ensureAuditDir();
  const filePath = path.join(AUDIT_DIR, `${recordId}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Persist a record to disk.
 * @param {TaskRecord} record
 */
function _writeRecord(record) {
  ensureAuditDir();
  const filePath = path.join(AUDIT_DIR, `${record.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
}

/**
 * Write a one-line lineage summary to the JSONL lineage file.
 * @param {TaskRecord} record
 */
function _writeLineage(record) {
  ensureAuditDir();
  const summary = {
    id:           record.id,
    taskId:       record.taskId,
    harness:      record.harness,
    status:       record.status,
    parentTaskId: record.lineage?.parentTaskId || null,
    startedAt:    record.startedAt,
    completedAt:  record.completedAt,
    durationMs:   record.completedAt && record.startedAt
      ? new Date(record.completedAt) - new Date(record.startedAt)
      : null,
    stepsCount:   record.steps.length,
    errorsCount:  record.errors.length,
  };
  fs.appendFileSync(LINEAGE_FILE, JSON.stringify(summary) + '\n', 'utf8');
}

// ── Registry queries ─────────────────────────────────────────────────────────

/**
 * Get all audit records for a project.
 * @param {string} projectId
 * @param {number} [limit=20]
 * @returns {TaskRecord[]}
 */
function getRecordsForProject(projectId, limit = 20) {
  ensureAuditDir();
  const records = [];
  try {
    const files = fs.readdirSync(AUDIT_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(-100)) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, file), 'utf8'));
        if (rec.projectId === projectId) records.push(rec);
      } catch { /* skip */ }
    }
  } catch { /* dir doesn't exist */ }
  return records
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/**
 * Get audit summary stats.
 * @returns {{ total: number, byStatus: Object, byHarness: Object }}
 */
function getAuditStats() {
  ensureAuditDir();
  const stats = { total: 0, byStatus: {}, byHarness: {} };
  try {
    const files = fs.readdirSync(AUDIT_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, file), 'utf8'));
        stats.total++;
        stats.byStatus[rec.status] = (stats.byStatus[rec.status] || 0) + 1;
        stats.byHarness[rec.harness] = (stats.byHarness[rec.harness] || 0) + 1;
      } catch { /* skip */ }
    }
  } catch { /* empty */ }
  return stats;
}

// ── Exports ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TaskRecord
 * @property {string}   id
 * @property {string}   taskId
 * @property {string}   harness
 * @property {string}   status
 * @property {string}   startedAt
 * @property {string}   completedAt
 * @property {Step[]}   steps
 * @property {string[]} filesRead
 * @property {string[]} filesChanged
 * @property {string[]} commandsRun
 * @property {Object[]} artifacts
 * @property {Object[]} verificationResults
 * @property {Object[]} errors
 * @property {Object[]} toolCalls
 * @property {Object}   lineage
 * @property {Object}   taskSnapshot
 */

/**
 * @typedef {Object} Step
 * @property {string}   stepId
 * @property {string}   name
 * @property {string}   status  — 'ok'|'error'|'skipped'
 * @property {string}   [output]
 * @property {string}   [error]
 * @property {number}   [durationMs]
 * @property {string}   at
 */

module.exports = {
  startTask,
  logToolCall,
  logStep,
  logFileRead,
  logFileChanged,
  logCommand,
  logVerification,
  logError,
  finishTask,
  lastSuccessfulStep,
  getRecordChain,
  getRecordsForProject,
  getAuditStats,
};
