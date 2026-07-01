'use strict';

/**
 * lib/awaken/awaken-events.js
 * Append-only event stream for the AWAKEN module.
 * Writes to agent_work/awaken/events.jsonl
 *
 * Fully standalone — does not require the main events.js bus.
 */

const fs   = require('fs');
const path = require('path');

const EVENTS_DIR = path.join(__dirname, '..', '..', 'agent_work', 'awaken');
const EVENTS_FILE = path.join(EVENTS_DIR, 'events.jsonl');

function ensureDir() {
  try { fs.mkdirSync(EVENTS_DIR, { recursive: true }); } catch (_) {}
}

function write(event) {
  const record = {
    ...event,
    ts: new Date().toISOString(),
  };
  const line = JSON.stringify(record);
  ensureDir();
  try {
    fs.appendFileSync(EVENTS_FILE, line + '\n');
  } catch (e) {
    console.error('[awaken-events] write failed:', e.message);
  }
  return record;
}

// ── Event helpers ─────────────────────────────────────────────────────────────

const PHASES = {
  ARM:         'arm',
  WAKE:       'wake',
  SCAN:       'scan',
  SELF_RUN:   'self_run',
  REPORT:     'report',
  COMPLETE:   'complete',
  ABORT:      'abort',
  ERROR:      'error',
};

const BADGES = {
  clean:       '🟢',
  warning:     '🟡',
  error:       '🔴',
  unknown:     '⚫',
  suspicious:  '🦆',
  liar:        '🔴',
  drift:       '🟡',
};

function emit(runId, phase, type, data = {}) {
  return write({ runId, phase, type, ...data });
}

function emitPreflight(runId, check, ok, detail) {
  return emit(runId, PHASES.ARM, 'preflight_check', { check, ok, detail });
}

function emitAwakening(runId, component, state) {
  return emit(runId, PHASES.WAKE, 'component_wake', { component, state });
}

function emitScanItem(runId, category, item, badge) {
  return emit(runId, PHASES.SCAN, 'scan_item', { category, item, badge });
}

function emitAction(runId, action, risk, status, detail) {
  return emit(runId, PHASES.SELF_RUN, 'action', { action, risk, status, detail });
}

function emitApprovalNeeded(runId, action, risk, detail) {
  return emit(runId, PHASES.SELF_RUN, 'approval_needed', { action, risk, detail });
}

function emitCompanionReaction(runId, companion, reaction) {
  return emit(runId, PHASES.SELF_RUN, 'companion_reaction', { companion, reaction });
}

function emitReport(runId, badge, summary, metrics) {
  return emit(runId, PHASES.REPORT, 'report', { badge, summary, metrics });
}

function emitComplete(runId, result) {
  return emit(runId, PHASES.COMPLETE, 'complete', { result });
}

function emitAbort(runId, reason) {
  return emit(runId, PHASES.ABORT, 'abort', { reason });
}

function emitError(runId, error) {
  return emit(runId, PHASES.ERROR, 'error', { error: String(error) });
}

function getRecent(count = 20) {
  ensureDir();
  try {
    const lines = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-count).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

function getRuns(runId = null) {
  ensureDir();
  try {
    const lines = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const records = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (runId) return records.filter(r => r.runId === runId);
    // group by runId
    const byRun = {};
    for (const r of records) {
      if (!byRun[r.runId]) byRun[r.runId] = [];
      byRun[r.runId].push(r);
    }
    return byRun;
  } catch {
    return {};
  }
}

module.exports = {
  PHASES,
  BADGES,
  emit,
  emitPreflight,
  emitAwakening,
  emitScanItem,
  emitAction,
  emitApprovalNeeded,
  emitCompanionReaction,
  emitReport,
  emitComplete,
  emitAbort,
  emitError,
  getRecent,
  getRuns,
};
