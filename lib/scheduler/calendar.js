'use strict';

/**
 * SCHEDULER CALENDAR — PURPCLAW
 * =============================
 *
 * JSON file-backed job store. Hot-reload on every read so live edits
 * are picked up without restart.
 *
 * Job shape:
 *   {
 *     id:           'autodream-nightly',
 *     name:         'AutoDream nightly consolidation',
 *     schedule:     'every morning at 3am',         // NL or raw cron
 *     action:       { kind: 'exec', command: 'python', args: ['autoDream.py'] },
 *     enabled:      true,
 *     next_fire:    null,                           // set by runner
 *     last_fired:   null,
 *     last_status:  null,                           // 'ok' | 'failed' | 'pending'
 *     last_error:   null,
 *     created_at:   '2026-06-04T...',
 *     updated_at:   '2026-06-04T...',
 *   }
 *
 * Action kinds:
 *   - { kind: 'exec',   command, args, cwd?, env? }   → spawn process
 *   - { kind: 'chat',   message, channel?, source? }   → POST /api/chat
 *   - { kind: 'speak',  text, voice? }                 → POST TTS gateway
 *   - { kind: 'http',   method, url, body?, headers? } → direct HTTP
 *   - { kind: 'noop' }                                 → mark fired (testing)
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { parse: parseCron, describe: describeCron } = require('./nl-cron.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CALENDAR_PATH = path.join(ROOT, 'agent_work', 'cron-jobs.json');
const DEFAULT_JOBS = [
  {
    id: 'autodream-nightly',
    name: 'AutoDream nightly memory consolidation',
    schedule: 'every morning at 3am',
    action: { kind: 'exec', command: 'python', args: ['autoDream.py'], cwd: ROOT },
    enabled: true,
  },
  {
    id: 'diagnostics-hourly',
    name: 'Autonomous diagnostics sweep',
    schedule: 'every hour',
    action: { kind: 'exec', command: 'python', args: ['autonomous_diagnostics.py'], cwd: ROOT },
    enabled: true,
  },
  {
    id: 'skill-forge-weekly',
    name: 'Skill forge — auto-generate new skills',
    schedule: 'every sunday at 4am',
    action: { kind: 'exec', command: 'node', args: ['lib/evolution/skill-forge.js'], cwd: ROOT },
    enabled: true,
  },
  {
    id: 'evolution-mutator-weekly',
    name: 'Evolution mutator — code evolution pass',
    schedule: 'every wednesday at 3am',
    action: { kind: 'exec', command: 'node', args: ['lib/evolution/mutator.js'], cwd: ROOT },
    enabled: true,
  },
  {
    id: 'tts-keepalive-5min',
    name: 'Runtime health snapshot — every 5 min',
    schedule: 'every 5 minutes',
    action: { kind: 'exec', command: 'node', args: ['bin/purpclaw.js', 'grow', 'pulse'], cwd: ROOT },
    enabled: true,
  },
];

function ensureCalendar() {
  const dir = path.dirname(CALENDAR_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CALENDAR_PATH)) {
    const now = new Date().toISOString();
    const seeded = DEFAULT_JOBS.map((j) => {
      const r = parseCron(j.schedule);
      return {
        ...j,
        schedule_cron: r.ok ? r.cron : null,
        created_at: now,
        updated_at: now,
        last_fired: null,
        last_status: null,
        last_error: null,
      };
    });
    fs.writeFileSync(CALENDAR_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  return null;
}

function load() {
  ensureCalendar();
  try {
    return JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function save(jobs) {
  ensureCalendar();
  fs.writeFileSync(CALENDAR_PATH, JSON.stringify(jobs, null, 2));
  return jobs;
}

function list() {
  return load();
}

function get(id) {
  return load().find((j) => j.id === id) || null;
}

function add(spec) {
  const jobs = load();
  const id = spec.id || (spec.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const r = parseCron(spec.schedule);
  const cron = r.ok ? r.cron : null;
  const job = {
    id,
    name: spec.name || id,
    schedule: spec.schedule,
    schedule_cron: cron,
    action: spec.action || { kind: 'noop' },
    enabled: spec.enabled !== false,
    created_at: now,
    updated_at: now,
    last_fired: null,
    last_status: null,
    last_error: null,
  };
  jobs.push(job);
  save(jobs);
  return job;
}

function update(id, patch) {
  const jobs = load();
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return null;
  if (patch.schedule) {
    const r = parseCron(patch.schedule);
    jobs[i].schedule_cron = r.ok ? r.cron : null;
  }
  Object.assign(jobs[i], patch, { id, updated_at: new Date().toISOString() });
  save(jobs);
  return jobs[i];
}

function remove(id) {
  const jobs = load();
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return false;
  jobs.splice(i, 1);
  save(jobs);
  return true;
}

function enable(id, enabled = true) {
  return update(id, { enabled });
}

// Convert 5-field cron to next fire time (from `from` Date or now).
function nextFire(cron, from = new Date()) {
  if (!cron) return null;
  const [mi, hr, dom, mon, dow] = cron.split(/\s+/);
  // Align to the NEXT whole minute (since we always start with sub-ms precision)
  const fromMs = from.getTime();
  const aligned = fromMs - (fromMs % 60_000) + 60_000;
  const maxIter = 366 * 24 * 60;
  for (let i = 0; i < maxIter; i++) {
    const t = new Date(aligned + i * 60_000);
    if (!matchField(mi, t.getMinutes())) continue;
    if (!matchField(hr, t.getHours())) continue;
    if (!matchField(dom, t.getDate())) continue;
    if (!matchField(mon, t.getMonth() + 1)) continue;
    if (!matchField(dow, t.getDay())) continue;
    return t;
  }
  return null;
}

function matchField(field, value) {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      if (value >= a && value <= b) return true;
    } else if (parseInt(part, 10) === value) {
      return true;
    }
  }
  return false;
}

module.exports = {
  CALENDAR_PATH,
  ensureCalendar,
  load,
  save,
  list,
  get,
  add,
  update,
  remove,
  enable,
  nextFire,
  DEFAULT_JOBS,
};

// ── CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const show = (j) => {
    const next = j.schedule_cron ? nextFire(j.schedule_cron)?.toISOString() : null;
    return `${j.id.padEnd(28)} ${(j.enabled ? '●' : '○')} ${j.schedule.padEnd(36)} next=${next || '?'} last=${j.last_fired || 'never'} ${j.last_status || ''}`.trim();
  };
  if (cmd === 'list' || !cmd) {
    const jobs = list();
    console.log(`${jobs.length} job(s):`);
    for (const j of jobs) console.log('  ' + show(j));
  } else if (cmd === 'add') {
    const schedule = args[1];
    const name = args[2] || ('job-' + Date.now());
    const actionJson = args.slice(3).join(' ');
    let action = { kind: 'noop' };
    if (actionJson) { try { action = JSON.parse(actionJson); } catch (e) { action = { kind: 'exec', command: 'node', args: actionJson.split(' ') }; } }
    const j = add({ name, schedule, action });
    console.log('added:', show(j));
  } else if (cmd === 'remove' || cmd === 'rm') {
    const id = args[1];
    const ok = remove(id);
    console.log(ok ? 'removed' : 'not found');
  } else if (cmd === 'enable' || cmd === 'disable') {
    const id = args[1];
    const j = enable(id, cmd === 'enable');
    console.log(j ? show(j) : 'not found');
  } else if (cmd === 'show') {
    const id = args[1];
    const j = get(id);
    if (j) console.log(JSON.stringify(j, null, 2));
    else console.log('not found');
  } else {
    console.log('usage: cli.js [list|add|remove|enable|disable|show] [...]');
  }
}
