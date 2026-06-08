'use strict';

/**
 * SCHEDULER RUNNER — PURPCLAW
 * ===========================
 *
 * Loads jobs from the calendar, schedules each via setTimeout, fires them
 * on time. Hot-reloads the calendar every 30s so live edits take effect.
 *
 * Each fired job:
 *   1. Updates the calendar (last_fired, last_status)
 *   2. Executes the action (exec / chat / speak / http / noop)
 *   3. Logs the result
 *   4. Re-schedules itself for the next fire
 *
 * Usage:
 *   node lib/scheduler/runner.js
 *   PORT=7801 node lib/scheduler/runner.js
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor = null;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

const calendar = require('./calendar.js');
const PORT = parseInt(process.env.PORT || '7801', 10);
const PURPCLAW_API = process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780';
const TTS_GATEWAY = process.env.TTS_GATEWAY_URL || 'http://127.0.0.1:7799';

const log = (...args) => {
  const line = `[scheduler ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

// ── action executors ─────────────────────────────────────────────────────

function httpRequest(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request({
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: options.headers || {},
      timeout: options.timeoutMs || 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode || 0, text });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runAction(action, job) {
  const k = action.kind || 'exec';
  if (k === 'noop') {
    log(`[${job.id}] noop fired`);
    return { ok: true };
  }
  if (k === 'exec') {
    return new Promise((resolve) => {
      const child = spawn(action.command, action.args || [], {
        cwd: action.cwd || ROOT,
        env: { ...process.env, ...(action.env || {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let out = '', err = '';
      child.stdout.on('data', (c) => { out += c.toString('utf8').slice(-2000); });
      child.stderr.on('data', (c) => { err += c.toString('utf8').slice(-2000); });
      const timer = setTimeout(() => child.kill('SIGTERM'), action.timeoutMs || 30 * 60 * 1000);
      child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          code,
          out: out.slice(-500),
          err: err.slice(-500),
        });
      });
    });
  }
  if (k === 'chat') {
    const body = JSON.stringify({ message: action.message, spawnAgents: true });
    const r = await httpRequest(`${PURPCLAW_API}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeoutMs: 60000,
    }, body);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, response: r.text.slice(0, 200) };
  }
  if (k === 'speak') {
    const body = JSON.stringify({ text: action.text, voice: action.voice });
    const r = await httpRequest(`${TTS_GATEWAY}/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeoutMs: 180000,
    }, body);
    return { ok: r.status >= 200 && r.status < 300, status: r.status };
  }
  if (k === 'http') {
    const body = action.body ? (typeof action.body === 'string' ? action.body : JSON.stringify(action.body)) : null;
    const r = await httpRequest(action.url, {
      method: action.method || 'GET',
      headers: action.headers || (body ? { 'content-type': 'application/json' } : {}),
      timeoutMs: action.timeoutMs || 30000,
    }, body);
    return { ok: r.status >= 200 && r.status < 300, status: r.status };
  }
  return { ok: false, error: `unknown action kind: ${k}` };
}

// ── schedule management ──────────────────────────────────────────────────

const timers = new Map(); // jobId -> Timeout

function cancelAll() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

function scheduleJob(job) {
  if (timers.has(job.id)) {
    clearTimeout(timers.get(job.id));
    timers.delete(job.id);
  }
  if (!job.enabled) return;
  if (!job.schedule_cron) {
    log(`[${job.id}] no cron schedule (parse failed for "${job.schedule}")`);
    return;
  }
  const next = calendar.nextFire(job.schedule_cron);
  if (!next) {
    log(`[${job.id}] no next fire time found`);
    return;
  }
  const ms = Math.max(0, next.getTime() - Date.now());
  log(`[${job.id}] next fire ${next.toISOString()} (in ${Math.round(ms / 1000)}s)`);
  const t = setTimeout(async () => {
    const startedAt = new Date().toISOString();
    log(`[${job.id}] FIRED`);
    const result = await runAction(job.action, job);
    const patch = {
      last_fired: startedAt,
      last_status: result.ok ? 'ok' : 'failed',
      last_error: result.ok ? null : (result.error || `exit ${result.code || '?'}`),
    };
    calendar.update(job.id, patch);
    // Re-schedule
    const fresh = calendar.get(job.id);
    if (fresh) scheduleJob(fresh);
  }, ms);
  // Don't keep the event loop alive just for the timer
  if (t.unref) t.unref();
  timers.set(job.id, t);
}

function rescheduleAll() {
  cancelAll();
  const jobs = calendar.list();
  for (const j of jobs) scheduleJob(j);
  log(`scheduled ${jobs.length} job(s) (${jobs.filter((j) => j.enabled).length} enabled)`);
}

// Hot-reload every 30s
setInterval(rescheduleAll, 30_000).unref();

// ── HTTP control surface ─────────────────────────────────────────────────

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/health' && req.method === 'GET') {
    const jobs = calendar.list();
    return sendJson(res, 200, {
      status: 'ok',
      jobs_total: jobs.length,
      jobs_enabled: jobs.filter((j) => j.enabled).length,
      timers_active: timers.size,
      port: PORT,
      pid: process.pid,
      uptime: process.uptime(),
    });
  }
  if (url.pathname === '/jobs' && req.method === 'GET') {
    return sendJson(res, 200, { jobs: calendar.list() });
  }
  if (url.pathname === '/jobs' && req.method === 'POST') {
    const body = await readBody(req);
    const j = calendar.add(body);
    scheduleJob(j);
    return sendJson(res, 201, j);
  }
  if (url.pathname.startsWith('/jobs/') && req.method === 'DELETE') {
    const id = url.pathname.split('/')[2];
    calendar.remove(id);
    if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); }
    return sendJson(res, 200, { ok: true });
  }
  if (url.pathname === '/reload' && req.method === 'POST') {
    rescheduleAll();
    return sendJson(res, 200, { ok: true });
  }
  if (url.pathname === '/version' && req.method === 'GET') {
    return sendJson(res, 200, { name: 'purpclaw-scheduler', version: '0.1.0' });
  }
  sendJson(res, 404, { error: 'not found' });
});

calendar.ensureCalendar();
rescheduleAll();
server.listen(PORT, '127.0.0.1', () => {
  log(`/health listening on :${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => {
    log(`${sig} → exit`);
    cancelAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

module.exports = { server, runAction, rescheduleAll };
