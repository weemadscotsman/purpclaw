'use strict';

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const NL = require('./scheduler/nl-cron');

const DB = process.env.PURPCLAW_SESSION_DB || path.join(path.resolve(__dirname, '..'), '.purpclaw', 'state.db');
require('fs').mkdirSync(path.dirname(DB), { recursive: true });
const db = new DatabaseSync(DB);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS cron_jobs(
  id TEXT PRIMARY KEY,name TEXT NOT NULL,schedule TEXT NOT NULL,prompt TEXT NOT NULL,
  profile TEXT NOT NULL,status TEXT NOT NULL,delivery TEXT,skills TEXT,next_run TEXT,
  last_run TEXT,last_status TEXT,last_result TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);`);

function parse(row) {
  return row ? { ...row, delivery: row.delivery ? JSON.parse(row.delivery) : null, skills: row.skills ? JSON.parse(row.skills) : [] } : null;
}
function list(profile) { return db.prepare(`SELECT * FROM cron_jobs ${profile ? 'WHERE profile=?' : ''} ORDER BY created_at DESC`).all(...(profile ? [profile] : [])).map(parse); }
function get(id) { return parse(db.prepare('SELECT * FROM cron_jobs WHERE id=?').get(id)); }

function fieldMatches(field, value, min, max) {
  return field.split(',').some(part => {
    const [range, stepRaw] = part.split('/');
    const step = Math.max(1, Number(stepRaw || 1));
    if (range === '*') return (value - min) % step === 0;
    const [aRaw, bRaw] = range.split('-');
    const a = Number(aRaw), b = bRaw == null ? a : Number(bRaw);
    return Number.isInteger(a) && Number.isInteger(b) && a >= min && b <= max && value >= a && value <= b && (value - a) % step === 0;
  });
}
function matches(schedule, date) {
  const [minute, hour, day, month, weekday] = schedule.trim().split(/\s+/);
  return fieldMatches(minute, date.getMinutes(), 0, 59)
    && fieldMatches(hour, date.getHours(), 0, 23)
    && fieldMatches(day, date.getDate(), 1, 31)
    && fieldMatches(month, date.getMonth() + 1, 1, 12)
    && fieldMatches(weekday, date.getDay(), 0, 7);
}
function nextRun(schedule, from = new Date()) {
  const cursor = new Date(from); cursor.setSeconds(0, 0); cursor.setMinutes(cursor.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++, cursor.setMinutes(cursor.getMinutes() + 1)) {
    if (matches(schedule, cursor)) return cursor.toISOString();
  }
  throw new Error(`schedule has no run within one year: ${schedule}`);
}
function normalizeSchedule(value) {
  if (/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(value || '')) return value.trim();
  const natural = NL.parse(value || '');
  if (!natural.ok) throw new Error(natural.reason);
  return natural.cron;
}
function add(params = {}) {
  if (!String(params.prompt || '').trim()) throw new Error('cron prompt is required');
  const schedule = normalizeSchedule(params.schedule);
  const now = new Date().toISOString(), id = `cron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO cron_jobs VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?)').run(
    id, params.name || params.prompt.slice(0, 60), schedule, params.prompt, params.profile || 'default',
    'enabled', params.delivery ? JSON.stringify(params.delivery) : null, JSON.stringify(params.skills || []), nextRun(schedule), now, now,
  );
  return get(id);
}
function remove(id) { return db.prepare('DELETE FROM cron_jobs WHERE id=?').run(id).changes > 0; }
function updateRun(id, status, result) {
  const job = get(id); if (!job) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE cron_jobs SET status=?,next_run=?,last_run=?,last_status=?,last_result=?,updated_at=? WHERE id=?').run(
    'enabled', nextRun(job.schedule, new Date()), now, status, String(result || '').slice(0, 100000), now, id,
  );
  return get(id);
}
function claim(id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const changed = db.prepare("UPDATE cron_jobs SET status='running',updated_at=? WHERE id=? AND status='enabled' AND next_run<=?").run(new Date().toISOString(), id, new Date().toISOString()).changes;
    db.exec('COMMIT'); return changed > 0;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function recoverStale(maxAgeMs = 15 * 60_000) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  return db.prepare("UPDATE cron_jobs SET status='enabled',last_status='interrupted',updated_at=? WHERE status='running' AND updated_at<?").run(new Date().toISOString(), cutoff).changes;
}
async function run(id, options = {}) {
  const job = get(id); if (!job) throw new Error(`cron job not found: ${id}`);
  const { AgentGateway } = require('./agent-gateway');
  const gateway = new AgentGateway({ provider: options.provider, model: options.model, cwd: options.cwd, profile: job.profile });
  try {
    const result = await gateway.submit({ prompt: job.prompt, max_turns: options.maxTurns || 10, platform: 'cron', operator_initiated: false });
    updateRun(id, 'completed', result.message);
    if (options.deliver) await options.deliver(job.delivery, result);
    return { job: get(id), result };
  } catch (error) { updateRun(id, 'failed', error.message); throw error; }
}
class CronScheduler {
  constructor(options = {}) { this.intervalMs = options.intervalMs || 30_000; this.runOptions = options.runOptions || {}; this.timer = null; this.running = new Set(); }
  start() { if (this.timer) return this; recoverStale(); this.timer = setInterval(() => this.tick(), this.intervalMs); this.timer.unref?.(); this.tick(); return this; }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async tick(now = new Date()) {
    const due = db.prepare("SELECT id FROM cron_jobs WHERE status='enabled' AND next_run<=? ORDER BY next_run LIMIT 25").all(now.toISOString());
    await Promise.all(due.map(async ({ id }) => {
      if (this.running.has(id) || !claim(id)) return;
      this.running.add(id);
      try { await run(id, this.runOptions); } catch { /* outcome persisted by run() */ } finally { this.running.delete(id); }
    }));
    return due.length;
  }
}

module.exports = { add, get, list, remove, run, updateRun, nextRun, matches, claim, recoverStale, CronScheduler, DB };
