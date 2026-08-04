'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../paths');
const retention = require('../memory-retention');
const { privacyMetadata } = require('./privacy-policy');

const TELEMETRY_FILE = path.join(PROJECT_ROOT, 'agent_work', 'telemetry', 'pipeline.jsonl');
const MAX_BYTES = 10 * 1024 * 1024;
let traceStore = null;

function rotateIfNeeded() {
  try {
    if (fs.statSync(TELEMETRY_FILE).size < MAX_BYTES) return;
    const rotated = TELEMETRY_FILE.replace(/\.jsonl$/, `-${Date.now()}.jsonl`);
    fs.renameSync(TELEMETRY_FILE, rotated);
  } catch {}
}

function record(event) {
  const entry = {
    at: new Date().toISOString(),
    pid: process.pid,
    privacy: privacyMetadata(),
    ...event,
  };
  fs.mkdirSync(path.dirname(TELEMETRY_FILE), { recursive: true });
  rotateIfNeeded();
  fs.appendFileSync(TELEMETRY_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  try {
    if (!traceStore) traceStore = require('../trace-store');
    traceStore.record({
      source: entry.service || entry.component || entry.source || 'telemetry',
      action: entry.event || entry.action || entry.stage || 'telemetry',
      status: entry.status || entry.level || 'info',
      detail: entry.message || entry.detail || entry.error || '',
      route: entry.route || '',
      sessionId: entry.sessionId || '',
      jobId: entry.jobId || entry.workflowId || '',
    });
  } catch {}
  try {
    retention.remember('telemetry_event', [
      `[telemetry] ${entry.service || entry.component || entry.source || 'unknown'} ${entry.event || entry.action || entry.stage || 'event'}`,
      `status=${entry.status || entry.level || 'info'} pid=${entry.pid}`,
      entry.workflowId ? `workflow=${entry.workflowId}` : '',
      entry.sessionId ? `session=${entry.sessionId}` : '',
      entry.message || entry.detail || entry.error || '',
    ].filter(Boolean).join('\n'), {
      key: `telemetry:${entry.at}:${entry.pid}:${entry.service || entry.component || 'unknown'}:${entry.event || entry.action || entry.stage || 'event'}`,
      source: `telemetry.${entry.service || entry.component || entry.source || 'unknown'}`,
      type: 'telemetry_event',
      importance: entry.status === 'error' || entry.level === 'error' ? 0.75 : 0.4,
      valence: entry.status === 'error' || entry.level === 'error' ? -0.4 : 0,
      metadata: { ...entry, telemetryFile: TELEMETRY_FILE },
    });
  } catch {}
  return entry;
}

function read(limit = 200, filter = {}) {
  let lines = [];
  try {
    lines = fs.readFileSync(TELEMETRY_FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
  const entries = lines.slice(-Math.max(limit * 4, limit)).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  return entries.filter(entry => {
    if (filter.workflowId && entry.workflowId !== filter.workflowId) return false;
    if (filter.service && entry.service !== filter.service) return false;
    if (filter.status && entry.status !== filter.status) return false;
    return true;
  }).slice(-limit);
}

function summarize(limit = 500) {
  const entries = read(limit);
  const counts = {};
  for (const entry of entries) {
    const key = `${entry.component || entry.service || 'unknown'}:${entry.status || entry.stage || entry.event || 'event'}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    file: TELEMETRY_FILE,
    entries: entries.length,
    counts,
    latest: entries.slice(-25),
  };
}

module.exports = { TELEMETRY_FILE, record, read, summarize };
