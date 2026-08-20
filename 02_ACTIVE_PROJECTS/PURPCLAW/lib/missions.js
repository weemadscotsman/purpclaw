'use strict';
/**
 * lib/missions.js — durable record of what PurpClaw actually did.
 *
 * Missions lived only in an in-process Map, so a restart erased the operating
 * history entirely — an awkward property for a system with a seven-layer memory
 * spine. Each completed turn is appended here as one JSONL line.
 *
 * This is a LEDGER, not a second source of truth: it records what happened
 * (envelope, tool calls, approvals, déjà vu matches, result), and never
 * duplicates state that a registry already owns. Agent rosters, tool
 * definitions and memory atoms stay where they live; a mission only references
 * them.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const FILE = path.join(DATA, 'missions.jsonl');
const MAX = Number(process.env.PURPCLAW_MISSIONS_MAX || 5000);

function readAll() {
  try {
    return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/**
 * Append one completed mission. Never throws: losing a history entry must not
 * fail the turn that produced it.
 */
function record(m = {}) {
  const seq = Array.isArray(m.toolCalls) ? m.toolCalls : [];
  const failed = seq.filter(s => s && s.ok === false);
  const rec = {
    missionId: 'ms_' + crypto.randomUUID(),
    sessionId: m.sessionId || null,
    createdAt: m.startedAt || new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: m.durationMs ?? null,
    // 'partial' is honest when some tools failed but the turn still answered —
    // calling that success is how a system starts lying to itself.
    status: m.status || (m.error ? 'failed' : failed.length ? 'partial' : 'complete'),
    prompt: String(m.prompt || '').slice(0, 1000),
    envelope: m.envelope || null,
    project: (m.envelope && m.envelope.workspace) || null,
    model: m.model || null,
    provider: m.provider || null,
    toolCalls: seq.map(s => ({ tool: s.tool, ok: s.ok, err: s.err || null })),
    approvals: Array.isArray(m.approvals) ? m.approvals : [],
    dejavu: m.dejavu || null,
    memoryWrites: m.memoryWrites ?? 0,
    result: String(m.result || '').slice(0, 2000),
    error: m.error ? String(m.error).slice(0, 500) : null,
  };
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify(rec) + '\n', 'utf8');
    const all = readAll();
    if (all.length > MAX) {
      fs.writeFileSync(FILE, all.slice(-MAX).map(r => JSON.stringify(r)).join('\n') + '\n');
    }
  } catch { /* history is best-effort; the turn already succeeded */ }
  return rec;
}

function list({ limit = 50, status = null, project = null, session = null } = {}) {
  let rows = readAll();
  if (status)  rows = rows.filter(r => r.status === status);
  if (project) rows = rows.filter(r => r.project === project);
  if (session) rows = rows.filter(r => r.sessionId === session);
  rows.reverse();                                   // newest first
  const all = readAll();
  return {
    ok: true,
    count: rows.length,
    totals: {
      all: all.length,
      complete: all.filter(r => r.status === 'complete').length,
      partial:  all.filter(r => r.status === 'partial').length,
      failed:   all.filter(r => r.status === 'failed').length,
      toolCalls: all.reduce((s, r) => s + (r.toolCalls || []).length, 0),
      approvals: all.reduce((s, r) => s + (r.approvals || []).length, 0),
    },
    missions: rows.slice(0, limit),
  };
}

function get(missionId) {
  return readAll().find(r => r.missionId === missionId) || null;
}

module.exports = { record, list, get, FILE };
