'use strict';

/**
 * purpclaw stats — administration analytics from the event ledger.
 *
 *   purpclaw stats                  # summary: tools, sessions, permissions, compaction
 *   purpclaw stats tools            # tool success/failure rates
 *   purpclaw stats sessions        # session count, messages, duration
 *   purpclaw stats permissions     # approval requests and decisions
 *   purpclaw stats compaction      # context compression events
 *   purpclaw stats --json          # machine-readable output
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const DB_PATH = process.env.PURPCLAW_SESSION_DB || path.join(path.resolve(__dirname, '..', '..'), '.purpclaw', 'state.db');
let _DB = null;
function getDB() {
  if (!_DB) {
    const { mkdirSync } = require('node:fs');
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _DB = new DatabaseSync(DB_PATH);
    _DB.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`);
  }
  return _DB;
}
const DB = { prepare: (sql) => getDB().prepare(sql) };

const TOOL_TYPES = ['tool.start', 'tool.complete', 'tool_error', 'tool_warn'];
const SESSION_TYPES = ['session.started', 'session.ended', 'message.complete'];
const PERM_TYPES  = ['approval.request', 'approval.granted', 'approval.denied', 'approval.timeout'];
const COMPACT_TYPES = ['context.compressed'];

function query(sql, params = []) {
  try {
    return DB.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

function toolStats() {
  const rows = query(`
    SELECT type, COUNT(*) as count
    FROM agent_events
    WHERE type IN (?, ?, ?, ?)
    GROUP BY type
  `, TOOL_TYPES);

  const map = Object.fromEntries(rows.map(r => [r.type, r.count]));
  const start  = map['tool.start']       || 0;
  const done   = map['tool.complete']    || 0;
  const err    = map['tool_error']       || 0;
  const warn   = map['tool_warn']        || 0;
  const total  = start || done || err;
  const okRate = total ? Math.round(((done - err - warn) / total) * 100) : 0;

  return { start, done, err, warn, total, okRate };
}

function sessionStats() {
  const rows = query(`
    SELECT type, COUNT(*) as count, MAX(created_at) as last
    FROM agent_events
    WHERE type IN (?, ?, ?)
    GROUP BY type
  `, SESSION_TYPES);

  const map = Object.fromEntries(rows.map(r => [r.type, r.count]));
  return {
    sessions:  map['session.started'] || 0,
    ended:     map['session.ended']   || 0,
    messages:  map['message.complete'] || 0,
  };
}

function permissionStats() {
  const rows = query(`
    SELECT type, COUNT(*) as count
    FROM agent_events
    WHERE type IN (?, ?, ?, ?)
    GROUP BY type
  `, PERM_TYPES);

  const map = Object.fromEntries(rows.map(r => [r.type, r.count]));
  const requested = map['approval.request'] || 0;
  const granted   = map['approval.granted'] || 0;
  const denied    = map['approval.denied']  || 0;
  const timedOut  = map['approval.timeout'] || 0;
  const grantedRate = requested ? Math.round((granted / requested) * 100) : 0;
  return { requested, granted, denied, timedOut, grantedRate };
}

function compactionStats() {
  const rows = query(`
    SELECT COUNT(*) as count FROM agent_events WHERE type = ?
  `, ['context.compressed']);

  const compact = rows[0]?.count || 0;

  // Sum compressed original vs result counts from payload
  const compactRows = query(`
    SELECT payload FROM agent_events WHERE type = ?
  `, ['context.compressed']);

  let totalOriginal = 0, totalCompressed = 0;
  for (const row of compactRows) {
    try {
      const p = JSON.parse(row.payload);
      totalOriginal  += Number(p.originalCount) || 0;
      totalCompressed += Number(p.compressedCount) || 0;
    } catch {}
  }

  const ratio = totalOriginal ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;
  return { events: compact, totalOriginal, totalCompressed, ratio };
}

function sessionDuration() {
  // Approximate: latest event time minus earliest
  const rows = query(`SELECT MIN(created_at) as first, MAX(created_at) as last FROM agent_events`);
  if (!rows[0]?.first) return { span: null };
  const ms = new Date(rows[0].last) - new Date(rows[0].first);
  const hours = Math.floor(ms / 3.6e6);
  const mins  = Math.floor((ms % 3.6e6) / 60000);
  return { span: `${hours}h ${mins}m`, ms };
}

function printSummary(ctx) {
  const { C, col } = ctx;
  const t  = toolStats();
  const s  = sessionStats();
  const p  = permissionStats();
  const c  = compactionStats();
  const d  = sessionDuration();

  console.log(`\n  ${col(C.bold || C.white, 'PURPCLAW STATS')}  ${col(C.gray, '· administration analytics')}\n`);
  console.log(`  ${col(C.cyan, 'tools')}`);
  console.log(`    called:      ${col(C.white, String(t.start).padStart(6))}`);
  console.log(`    ok:          ${col(C.green, String(t.done).padStart(6))}`);
  console.log(`    error:       ${col(C.red,   String(t.err).padStart(6))}`);
  console.log(`    warn:        ${col(C.yellow, String(t.warn).padStart(6))}`);
  console.log(`    success:     ${col(t.okRate >= 80 ? C.green : t.okRate >= 50 ? C.yellow : C.red, t.okRate + '%')}`);
  console.log(`\n  ${col(C.cyan, 'sessions')}`);
  console.log(`    started:     ${col(C.white, String(s.sessions).padStart(6))}`);
  console.log(`    ended:       ${col(C.white, String(s.ended).padStart(6))}`);
  console.log(`    messages:    ${col(C.white, String(s.messages).padStart(6))}`);
  if (d.span) console.log(`    span:        ${col(C.gray, d.span)}`);
  console.log(`\n  ${col(C.cyan, 'permissions')}`);
  console.log(`    requested:   ${col(C.white, String(p.requested).padStart(6))}`);
  console.log(`    granted:     ${col(C.green, String(p.granted).padStart(6))}  ${p.grantedRate}%`);
  console.log(`    denied:      ${col(C.red,   String(p.denied).padStart(6))}`);
  console.log(`    timed-out:   ${col(C.yellow, String(p.timedOut).padStart(6))}`);
  console.log(`\n  ${col(C.cyan, 'compaction')}`);
  console.log(`    events:      ${col(C.white, String(c.events).padStart(6))}`);
  if (c.totalOriginal) {
    console.log(`    original:    ${col(C.white, String(c.totalOriginal).padStart(6))} msgs`);
    console.log(`    compressed:  ${col(C.white, String(c.totalCompressed).padStart(6))} msgs  -${col(C.green, c.ratio + '%')}`);
  }
  console.log('');
}

function printTools(ctx) {
  const { C, col } = ctx;
  const t = toolStats();
  console.log(`\n  ${col(C.bold || C.white, 'TOOL STATS')}\n`);
  console.log(`  ${col(C.cyan, 'start:     ')}${col(C.white, t.start)}`);
  console.log(`  ${col(C.cyan, 'complete:  ')}${col(C.green, t.done)}`);
  console.log(`  ${col(C.cyan, 'errors:    ')}${col(C.red,   t.err)}`);
  console.log(`  ${col(C.cyan, 'warnings:  ')}${col(C.yellow, t.warn)}`);
  console.log(`  ${col(C.cyan, 'ok rate:   ')}${t.okRate}%\n`);
}

function printPermissions(ctx) {
  const { C, col } = ctx;
  const p = permissionStats();
  console.log(`\n  ${col(C.bold || C.white, 'PERMISSION EVENTS')}\n`);
  console.log(`  ${col(C.cyan, 'requested:  ')}${col(C.white, p.requested)}`);
  console.log(`  ${col(C.cyan, 'granted:   ')}${col(C.green, p.granted)}  ${p.grantedRate}%`);
  console.log(`  ${col(C.cyan, 'denied:    ')}${col(C.red,   p.denied)}`);
  console.log(`  ${col(C.cyan, 'timeout:   ')}${col(C.yellow, p.timedOut)}\n`);
}

function printCompaction(ctx) {
  const { C, col } = ctx;
  const c = compactionStats();
  console.log(`\n  ${col(C.bold || C.white, 'COMPACTION')}\n`);
  console.log(`  ${col(C.cyan, 'events:       ')}${col(C.white, c.events)}`);
  if (c.totalOriginal) {
    console.log(`  ${col(C.cyan, 'original msgs:')} ${col(C.white, c.totalOriginal)}`);
    console.log(`  ${col(C.cyan, 'after msgs:   ')} ${col(C.white, c.totalCompressed)}  -${col(C.green, c.ratio + '%')}`);
  }
  console.log('');
}

function run(args, ctx) {
  const { col, C } = ctx;
  const sub = (args[0] || 'summary').toLowerCase();
  const json = args.includes('--json');

  const data = {
    tools:       toolStats(),
    sessions:    sessionStats(),
    permissions: permissionStats(),
    compaction:  compactionStats(),
    duration:    sessionDuration(),
  };

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  switch (sub) {
    case 'tools':       return printTools(ctx);
    case 'permissions': return printPermissions(ctx);
    case 'compaction':  return printCompaction(ctx);
    default:            return printSummary(ctx);
  }
}

module.exports = { run };
