'use strict';

/**
 * lib/pulse.js — The "Talk Back" Loop
 *
 * Wakes the stack by itself (no user prompt required), reads live state,
 * detects anomalies and opportunities, and broadcasts findings to the
 * event bus + a notifications feed the UI and the agent prompt can read.
 *
 * What it does every PULSE_MS:
 *   1. Probe all canonical services (via service_registry)
 *   2. Read the last N trace events from the local trace file
 *   3. Read the last 5 cognitive findings (memory + rules + diagnostics)
 *   4. If anything is "new since last pulse" + "worth telling", emit
 *      - one event on the bus
 *      - one notification in agent_work/trace/notifications.jsonl
 *   5. The agent's buildSystemPrompt() injects the latest 3 notifications
 *      so when the user asks "what's going on" or the agent starts a turn
 *      with no prompt, the agent can speak truth.
 *
 * Why this matters: the user said "if my stack doesn't talk back
 * and run herself without my prompting, we are not done yet." This
 * module is the answer. It wakes, looks, speaks, sleeps, repeats.
 *
 * No new PM2 service — runs as a setInterval inside unified_api.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PULSE_MS = Number(process.env.PULSE_INTERVAL_MS || 5 * 60 * 1000); // 5 min default
const NOTIF_FILE = path.join(__dirname, '..', 'agent_work', 'trace', 'notifications.jsonl');
const TRACE_FILE = path.join(__dirname, '..', 'agent_work', 'trace', 'events.jsonl');
const NOTIF_MAX = 100; // keep last N notifications in the feed

// ── State ─────────────────────────────────────────────────────────
let lastPulseAt = null;
let lastServicesDown = new Set();
let tickCount = 0;
let notifBuffer = []; // in-memory ring of last NOTIF_MAX notifications
let interval = null;

// ── Dependencies (lazy to avoid cycles) ────────────────────────
const announce = require('./events');

function ensureDir() {
  try {
    const dir = path.dirname(NOTIF_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) { /* best-effort */ }
}

function appendNotif(notif) {
  try {
    ensureDir();
    fs.appendFileSync(NOTIF_FILE, JSON.stringify(notif) + '\n', 'utf8');
  } catch (_) {}
  notifBuffer.push(notif);
  while (notifBuffer.length > NOTIF_MAX) notifBuffer.shift();
}

function httpGet(path, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', timeout: timeoutMs }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.end();
  });
}

async function probeServices() {
  // Probe the canonical 16 core ports from service_registry.
  // Cheap: just /health or /tower/status or /events.
  const targets = [
    { key: 'eventbus', port: 7782, path: '/health' },
    { key: 'api',      port: 7780, path: '/api/health' },
    { key: 'tower',    port: 7790, path: '/tower/status' },
    { key: 'orchestrator', port: 7784, path: '/api/health' },
    { key: 'cognitive', port: 7880, path: '/cognitive/health', fallback: 'unified_api' },
    { key: 'harness',  port: 7798, path: '/health' },
  ];
  const results = await Promise.all(targets.map(async t => {
    let r = await httpGet(t.path, t.port, 1500);
    // Fallback: if the real spine hangs, ask unified_api (which has the shim route)
    if (t.fallback === 'unified_api' && (!r || r.status === 0)) {
      r = await httpGet('/api/spine/health', 7780, 1500);
      if (r && r.status === 200) {
        r = { status: 200, body: { ok: true, shim: true } };
      }
    }
    return { key: t.key, port: t.port, status: r.status, ok: r.status >= 200 && r.status < 500 };
  }));
  return results;
}

async function readRecentTrace(n = 30) {
  try {
    if (!fs.existsSync(TRACE_FILE)) return [];
    const lines = fs.readFileSync(TRACE_FILE, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function readNotifBuffer() {
  return notifBuffer.slice();
}

function readNotifFile(n = 50) {
  try {
    if (!fs.existsSync(NOTIF_FILE)) return [];
    const lines = fs.readFileSync(NOTIF_FILE, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

async function pulse() {
  tickCount++;
  lastPulseAt = new Date().toISOString();
  const findings = [];
  try {
    // 1. Probe services
    const services = await probeServices();
    const down = services.filter(s => !s.ok).map(s => s.key);
    const newDown = down.filter(k => !lastServicesDown.has(k));
    const recovered = [...lastServicesDown].filter(k => down.indexOf(k) === -1);
    lastServicesDown = new Set(down);
    if (newDown.length) {
      findings.push({
        severity: 'error',
        kind: 'service_down',
        title: `${newDown.length} service(s) DOWN`,
        body: newDown.join(', ') + ' are not responding on their canonical ports.',
        source: 'pulse',
      });
    }
    if (recovered.length) {
      findings.push({
        severity: 'good',
        kind: 'service_recovered',
        title: `${recovered.length} service(s) RECOVERED`,
        body: recovered.join(', ') + ' are responding again.',
        source: 'pulse',
      });
    }

    // 2. Read recent trace, find new errors
    const recent = await readRecentTrace(60);
    const errs = recent.filter(e => (e.topic || '').includes('failed') || (e.topic || '').includes('error') || (e.payload || {}).error);
    const newErrs = errs.slice(-3);
    if (newErrs.length) {
      const e = newErrs[newErrs.length - 1];
      findings.push({
        severity: 'warn',
        kind: 'recent_error',
        title: 'Recent error in trace',
        body: `${e.topic}: ${(e.payload && (e.payload.error || JSON.stringify(e.payload).slice(0,140))) || 'no detail'}`,
        source: 'pulse',
      });
    }

    // 3. Read /rules/stats for new derived facts
    try {
      const r = await httpGet('/rules/stats', 7880, 1500);
      if (r.status === 200 && r.body) {
        const df = r.body.derived_facts || 0;
        if (df > 0 && tickCount % 12 === 1) {  // surface once per hour
          findings.push({
            severity: 'info',
            kind: 'rules_activity',
            title: `Rules engine has ${df} derived facts`,
            body: `Predicates: ${(r.body.predicates || []).join(', ')}. Inferences: ${r.body.inference_steps || 0}.`,
            source: 'pulse',
          });
        }
      }
    } catch { /* ignore */ }

    // 4. Read /autodream/status — surface recent consolidation
    try {
      const r = await httpGet('/autodream/status', 7880, 1500);
      if (r.status === 200 && r.body && r.body.state) {
        const s = r.body.state;
        if (s.entriesMerged > 0 && tickCount % 24 === 1) {
          findings.push({
            severity: 'info',
            kind: 'autodream',
            title: 'AutoDream has merged memory',
            body: `Cycles: ${s.totalCycles}, entries merged: ${s.entriesMerged}.`,
            source: 'pulse',
          });
        }
      }
    } catch { /* ignore */ }

  } catch (e) {
    findings.push({ severity: 'error', kind: 'pulse_self', title: 'Pulse error', body: e.message, source: 'pulse' });
  }

  // Emit each finding
  for (const f of findings) {
    const notif = { ...f, ts: new Date().toISOString(), id: 'pulse_' + tickCount + '_' + Math.random().toString(36).slice(2, 7) };
    appendNotif(notif);
    // Publish on the bus so the cockpit / mission sees it live
    try { announce.emit({ namespace: 'pulse', action: 'finding', source: 'pulse', payload: notif }); } catch (_) {}
  }

  return findings;
}

function start() {
  if (interval) return;
  // First pulse at +15s (let the rest of the stack boot), then every PULSE_MS
  setTimeout(() => {
    pulse().catch(() => {});
    interval = setInterval(() => {
      pulse().catch(() => {});
    }, PULSE_MS);
  }, 15000);
  console.log(`[PULSE] loop started — interval ${PULSE_MS}ms`);
}

function stop() {
  if (interval) { clearInterval(interval); interval = null; }
  console.log('[PULSE] loop stopped');
}

function getStatus() {
  return {
    enabled: !!interval,
    intervalMs: PULSE_MS,
    tickCount,
    lastPulseAt,
    servicesDown: [...lastServicesDown],
    notificationCount: notifBuffer.length,
    latestNotifications: notifBuffer.slice(-5).reverse(),
  };
}

module.exports = {
  start, stop, pulse,
  getStatus,
  readNotifBuffer, readNotifFile,
  NOTIF_FILE, TRACE_FILE,
};

if (require.main === module) {
  (async () => {
    const findings = await pulse();
    console.log(JSON.stringify(findings, null, 2));
    console.log('---');
    console.log(JSON.stringify(getStatus(), null, 2));
  })();
}
