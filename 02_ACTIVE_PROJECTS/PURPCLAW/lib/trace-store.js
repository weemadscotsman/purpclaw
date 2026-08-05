'use strict';

const PURP_PATHS = require('./paths');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const retention = require('./memory-retention');

const TRACE_DIR = path.join(PURP_PATHS.DATA_ROOT, 'trace');
const TRACE_FILE = path.join(TRACE_DIR, 'recent.jsonl');
const MAX_MEMORY = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const bus = new EventEmitter();
bus.setMaxListeners(100);

const memory = [];

function ensure() {
  fs.mkdirSync(TRACE_DIR, { recursive: true });
}

function safeString(value, max = 280) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function normalize(entry = {}) {
  const at = entry.at || new Date().toISOString();
  const source = safeString(entry.source || 'ui', 64) || 'ui';
  const action = safeString(entry.action || entry.type || 'event', 96) || 'event';
  return {
    id: entry.id || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    ts: Date.parse(at) || Date.now(),
    source,
    route: safeString(entry.route || '', 96),
    sessionId: safeString(entry.sessionId || '', 96),
    jobId: safeString(entry.jobId || '', 96),
    status: safeString(entry.status || 'info', 32) || 'info',
    action,
    detail: safeString(entry.detail || entry.message || '', 500),
  };
}

function trimFile() {
  try {
    const stat = fs.statSync(TRACE_FILE);
    if (stat.size <= MAX_FILE_BYTES) return;
    const lines = fs.readFileSync(TRACE_FILE, 'utf8').split(/\r?\n/).filter(Boolean).slice(-MAX_MEMORY);
    fs.writeFileSync(TRACE_FILE, `${lines.join('\n')}\n`, 'utf8');
  } catch {}
}

function record(entry) {
  const normalized = normalize(entry);
  memory.push(normalized);
  while (memory.length > MAX_MEMORY) memory.shift();
  try {
    ensure();
    fs.appendFileSync(TRACE_FILE, `${JSON.stringify(normalized)}\n`, 'utf8');
    trimFile();
  } catch {}
  retention.rememberTrace(normalized);
  bus.emit('trace', normalized);
  return normalized;
}

function recent(limit = 200) {
  const capped = Math.max(1, Math.min(Number(limit) || 200, MAX_MEMORY));
  const fromFile = [];
  try {
    const lines = fs.readFileSync(TRACE_FILE, 'utf8').split(/\r?\n/).filter(Boolean).slice(-capped);
    for (const line of lines) {
      try { fromFile.push(JSON.parse(line)); } catch {}
    }
  } catch {}
  const merged = [...fromFile, ...memory];
  const byId = new Map();
  for (const item of merged) byId.set(item.id, item);
  return Array.from(byId.values()).sort((a, b) => a.ts - b.ts).slice(-capped);
}

function subscribe(listener) {
  bus.on('trace', listener);
  return () => bus.off('trace', listener);
}

module.exports = { record, recent, subscribe };
