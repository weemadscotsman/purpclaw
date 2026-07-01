#!/usr/bin/env node
/**
 * scripts/tui.js — PURPCLAW Terminal UI  (the cockpit)
 * =====================================================
 * Full-screen live dashboard.  No external deps.
 * Launched by:  purpclaw tui
 *
 * Keyboard:
 *   1-7 / ←→ / Tab  Switch tabs
 *   r               Force refresh
 *   p / Space       Pause / resume auto-refresh
 *   q / Ctrl-C      Exit
 */

'use strict';

const http     = require('http');
const path     = require('path');
const fs       = require('fs');
const readline = require('readline');

const PURP_DIR   = path.resolve(__dirname, '..');
const VOICE      = (() => { try { return require(path.join(PURP_DIR, 'lib', 'voice-client.js')); } catch { return null; } })();
const SPRITES    = (() => { try { return require(path.join(PURP_DIR, 'lib', 'mochi-sprites.js')); } catch { return null; } })();
const CAPABILITIES = (() => { try { return require(path.join(PURP_DIR, 'lib', 'surface-capabilities.js')); } catch { return null; } })();
const ACTIONS    = (() => { try { return require(path.join(PURP_DIR, 'lib', 'action-dispatcher.js')); } catch { return null; } })();

// ── .env loader ───────────────────────────────────────────────────────────────
(function loadEnv() {
  try {
    const lines = fs.readFileSync(path.join(PURP_DIR, '.env'), 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.substring(0, eq).trim();
      let v = line.substring(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* best effort */ }
})();

// ── ports ─────────────────────────────────────────────────────────────────────
const P = {
  api       : parseInt(process.env.API_PORT          || '7780', 10),
  eventbus  : parseInt(process.env.EVENTBUS_PORT     || '7782', 10),
  state     : parseInt(process.env.STATE_PORT        || '7783', 10),
  orch      : parseInt(process.env.ORCHESTRATOR_PORT || '7784', 10),
  tower     : parseInt(process.env.TOWER_PORT        || '7790', 10),
  gatekeeper: 7791,
  ctx       : 7881,
  pool      : parseInt(process.env.POOL_PORT         || '7885', 10),
  metrics   : parseInt(process.env.METRICS_PORT      || '7890', 10),
  vision    : 7889,
  memory    : parseInt(process.env.MEMORY_PORT       || '7880', 10),
  dream     : parseInt(process.env.DREAM_PORT        || '7895', 10),
  voice     : parseInt(process.env.VOICE_PORT        || '7781', 10),
  stt       : parseInt(process.env.STT_PORT          || '7896', 10),
};

// ── colours ───────────────────────────────────────────────────────────────────
const C = {
  reset   : '\x1b[0m',
  bold    : '\x1b[1m',
  dim     : '\x1b[2m',
  cyan    : '\x1b[36m',
  green   : '\x1b[32m',
  yellow  : '\x1b[33m',
  red     : '\x1b[31m',
  blue    : '\x1b[34m',
  magenta : '\x1b[35m',
  white   : '\x1b[37m',
  gray    : '\x1b[90m',
  // 256-colour
  purple  : '\x1b[38;5;135m',
  lavender: '\x1b[38;5;147m',
  hotpink : '\x1b[38;5;205m',
  orange  : '\x1b[38;5;214m',
  teal    : '\x1b[38;5;43m',
  // bg
  bgPurple: '\x1b[48;5;53m',
  bgDark  : '\x1b[48;5;234m',
};

const col      = (c, s) => `${c}${s}${C.reset}`;
const fit      = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[mH]/g, '');

// ── ANSI primitives ───────────────────────────────────────────────────────────
const ESC        = '\x1b';
const at         = (r, c) => `${ESC}[${r};${c}H`;
const clrScreen  = `${ESC}[2J${ESC}[H`;
const hideCursor = `${ESC}[?25l`;
const showCursor = `${ESC}[?25h`;

// ── terminal geometry ─────────────────────────────────────────────────────────
const sz = () => ({ W: process.stdout.columns || 100, H: process.stdout.rows || 30 });

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function hGet(port, pathname, timeout = 2000) {
  return new Promise(resolve => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: pathname, method: 'GET' },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d || null); } });
      }
    );
    req.setTimeout(timeout, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function ping(port, path_ = '/health') {
  const r = await hGet(port, path_, 1500);
  if (r === null || r === undefined) return false;
  return typeof r === 'object' ? true : (typeof r === 'string' && r.length > 0);
}

// ── state ─────────────────────────────────────────────────────────────────────
let activeTab  = 0;
let paused     = false;
let tick_      = 0;
let lastData   = null;
let eventLog   = [];
let activeAction = 0;
let actionPreview = null;
let actionStatus = null;
const MAX_LOG  = 300;

// ── voice state ───────────────────────────────────────────────────────────────
let voiceStatus = { tts: { online: false }, stt: { online: false }, voiceEnabled: true, sttEnabled: true };
let voiceState  = 'idle';   // 'idle' | 'listening' | 'speaking' | 'processing' | 'error'
let sttSub      = null;     // SSE subscription handle

async function refreshVoiceStatus() {
  if (!VOICE) return;
  try { voiceStatus = await VOICE.status(); } catch {}
}

async function toggleVoice() {
  if (!VOICE) return;
  const s = VOICE.loadState();
  const next = !s.voiceEnabled;
  VOICE.enableVoice(next, next);
  voiceStatus.voiceEnabled = next;
  voiceStatus.sttEnabled   = next;
  if (next && voiceStatus.stt.online) {
    await VOICE.startListening();
    voiceState = 'listening';
    if (sttSub) { try { sttSub.destroy(); } catch {} }
    sttSub = VOICE.subscribeSTT(
      evt => { addLog(new Date().toLocaleTimeString(), 'voice.heard', evt.text); voiceState = 'heard'; setTimeout(() => { voiceState = 'idle'; }, 2000); },
      () => { voiceState = 'error'; }
    );
  } else {
    if (sttSub) { try { sttSub.destroy(); } catch {} sttSub = null; }
    try { await VOICE.stopListening(); } catch {}
    voiceState = 'idle';
  }
}

const TABS = ['OVERVIEW', 'ACTIONS', 'AGENTS', 'JOBS', 'MEMORY', 'POOL', 'LOGS'];

function addLog(ts, type, msg) {
  eventLog.push({ ts, type: fit(String(type), 14), msg: String(msg) });
  if (eventLog.length > MAX_LOG) eventLog.shift();
}

// Division metadata (order = building floors, bottom = L1)
const DIVISIONS = [
  { key: 'ENGINEERING',    c: C.cyan,    slots: 8 },
  { key: 'INTELLIGENCE',   c: C.blue,    slots: 6 },
  { key: 'SECURITY',       c: C.red,     slots: 5 },
  { key: 'OPERATIONS',     c: C.yellow,  slots: 5 },
  { key: 'MANAGEMENT',     c: C.magenta, slots: 4 },
  { key: 'MEDIA_OPS',      c: C.hotpink, slots: 4 },
  { key: 'SCIENCE',        c: C.teal,    slots: 4 },
  { key: 'CREATIVE',       c: C.orange,  slots: 3 },
  { key: 'INFRASTRUCTURE', c: C.gray,    slots: 3 },
];

// ── data fetch ────────────────────────────────────────────────────────────────
async function fetchAll() {
  const [
    okApi, okTower, okBus, okState, okOrch, okGK, okPool, okMet, okVis,
    orchStat, towerStat, poolStats, workflows, ctxStats,
    pulseStatus, pulseNotifs,
  ] = await Promise.all([
    ping(P.api,        '/api/health'),
    ping(P.tower,      '/tower/status'),
    ping(P.eventbus,   '/health'),
    ping(P.state,      '/health'),
    ping(P.orch,       '/api/health'),
    ping(P.gatekeeper, '/health'),
    ping(P.pool,       '/health'),
    ping(P.metrics,    '/health'),
    ping(P.vision,     '/health'),
    hGet(P.orch,  '/api/status',    2000),
    hGet(P.tower, '/api/status',    2000),
    hGet(P.pool,  '/pool/stats',    2000),
    hGet(P.orch,  '/api/workflows', 2000),
    hGet(P.ctx,   '/context/stats', 1500),
    // v2.1 — Pulse: the stack's own heartbeat. Lets the TUI show
    // what the stack noticed without being asked.
    hGet(P.api,   '/api/pulse',         1500),
    hGet(P.api,   '/api/pulse/notifications', 1500),
  ]);

  const svcs = {
    'unified-api' : { ok: okApi,   port: P.api,        group: 'core' },
    'agent-tower' : { ok: okTower, port: P.tower,      group: 'core' },
    'eventbus'    : { ok: okBus,   port: P.eventbus,   group: 'core' },
    'state-store' : { ok: okState, port: P.state,      group: 'core' },
    'orchestrator': { ok: okOrch,  port: P.orch,       group: 'core' },
    'gatekeeper'  : { ok: okGK,    port: P.gatekeeper, group: 'core' },
    'pool'        : { ok: okPool,  port: P.pool,       group: 'optional' },
    'metrics'     : { ok: okMet,   port: P.metrics,    group: 'optional' },
    'vision'      : { ok: okVis,   port: P.vision,     group: 'optional' },
  };

  const core = Object.values(svcs).filter(s => s.group === 'core');
  const coreOk = core.filter(s => s.ok).length;

  return { svcs, coreOk, coreTotal: core.length, orchStat, towerStat, poolStats, workflows, ctxStats, pulseStatus, pulseNotifs };
}

// ── draw helpers ──────────────────────────────────────────────────────────────
function hbar(W, l, f, r) { return col(C.purple, l + f.repeat(W - 2) + r); }
const boxTop = W => hbar(W, '╭', '─', '╮');
const boxBot = W => hbar(W, '╰', '─', '╯');
const boxMid = W => hbar(W, '├', '─', '┤');
const boxL   = ()  => col(C.purple, '│');

function drawFrame(out, W, H) {
  out.push(at(1, 1) + boxTop(W));
  out.push(at(H, 1) + boxBot(W));
  for (let r = 2; r < H; r++) {
    out.push(at(r, 1) + boxL());
    out.push(at(r, W) + boxL());
  }
}

function dot(ok) { return ok ? col(C.green, '●') : col(C.red, '○'); }

// ── header (rows 1-5) ─────────────────────────────────────────────────────────
function drawHeader(out, W, data) {
  out.push(at(1, 1) + boxTop(W));

  const { coreOk, coreTotal, towerStat, poolStats } = data;
  const allOk    = coreOk === coreTotal;
  const statusC  = allOk ? C.green : coreOk > coreTotal / 2 ? C.yellow : C.red;
  const statusDot = col(statusC, allOk ? '●' : '◐');

  const agents   = towerStat
    ? (Array.isArray(towerStat.activeAgents) ? towerStat.activeAgents.length : (towerStat.totalAgents ?? '?'))
    : '?';
  const skills   = poolStats?.skillsCount ?? '?';
  const now      = new Date().toLocaleTimeString('en-GB');
  const pauseStr = paused ? col(C.yellow + C.bold, ' ⏸ PAUSED') : '';

  // Voice status indicator
  const voiceIcon = (() => {
    if (!voiceStatus.voiceEnabled) return col(C.gray, '🔇');
    const ttsOk = voiceStatus.tts?.online;
    const sttOk = voiceStatus.stt?.online;
    const stateC = { idle: C.gray, listening: C.green, speaking: C.cyan, processing: C.yellow, heard: C.green, error: C.red, wakeword: C.magenta }[voiceState] || C.gray;
    const face = SPRITES ? SPRITES.voiceFace(voiceState) : '·ω·';
    const mic  = sttOk ? col(stateC, '🎤') : col(C.gray, '🔕');
    const spkr = ttsOk ? col(C.green, '🔊') : col(C.gray, '🔈');
    return `${mic}${spkr}${col(stateC, face)}`;
  })();

  // v2.1 — Pulse: show pulse tick count + any services down from the stack's
  // own heartbeat. If the pulse is reporting problems, the operator sees it
  // before they ask.
  const pulseInfo = data.pulseStatus && data.pulseStatus.tickCount
    ? (() => {
        const s = data.pulseStatus;
        const down = s.servicesDown && s.servicesDown.length
          ? col(C.red + C.bold, ` ▼${s.servicesDown.length}`)
          : col(C.green, ' ✓');
        return col(C.gray, `pulse ${s.tickCount}${down}`);
      })()
    : col(C.gray, 'pulse ?');
  const left  = ` ${col(C.purple + C.bold, 'PURPCLAW')}  ${col(C.gray, '·')}  ${statusDot} ${col(statusC, coreOk + '/' + coreTotal)} core  ${col(C.gray, '·')}  ${col(C.white, String(agents))} agents  ${col(C.gray, '·')}  ${col(C.white, String(skills))} skills  ${col(C.gray, '·')}  ${pulseInfo}`;
  const right = `${voiceIcon}  ${col(C.gray, now)}${pauseStr} `;
  const pad   = Math.max(0, W - 2 - stripAnsi(left).length - stripAnsi(right).length);
  out.push(at(2, 2) + left + ' '.repeat(pad) + right);

  out.push(at(3, 1) + boxMid(W));

  // Tab bar
  let bar = '  ';
  TABS.forEach((name, i) => {
    const active = i === activeTab;
    const label  = ` ${i + 1}:${name} `;
    bar += active
      ? col(C.bgPurple + C.white + C.bold, label) + col(C.purple, '│')
      : col(C.gray, label) + col(C.gray, '│');
    bar += ' ';
  });
  out.push(at(4, 2) + bar);

  out.push(at(5, 1) + boxMid(W));
}

// ── footer (last 2 rows) ──────────────────────────────────────────────────────
function drawFooter(out, W, H) {
  out.push(at(H - 1, 1) + boxMid(W));
  const vState = voiceStatus.voiceEnabled ? col(C.green, 'on') : col(C.gray, 'off');
  const hints = `  ${col(C.gray, '1-' + TABS.length)}:tab  ${col(C.gray, '←→')}:nav  ${col(C.gray, 'r')}:refresh  ${col(C.gray, 'p')}:pause  ${col(C.gray, 'v')}:voice(${vState})  ${col(C.gray, 'q')}:quit  `;
  const footer = hints + col(C.dim, '  ·  PURPCLAW TUI  ·  tiny haunted workshop');
  out.push(at(H, 2) + footer);
}

// ── OVERVIEW TAB ──────────────────────────────────────────────────────────────
function drawOverview(out, R1, RN, W, data) {
  const { svcs, orchStat, towerStat, poolStats, ctxStats } = data;
  const mid = Math.floor(W / 2);
  let lr = R1, rr = R1;

  // ─── LEFT: services ─────────────────────────────────────────────────────────
  out.push(at(lr, 2) + col(C.cyan + C.bold, 'SERVICES'));
  lr++;

  const CORE = ['unified-api', 'agent-tower', 'eventbus', 'state-store', 'orchestrator', 'gatekeeper'];
  const OPT  = ['pool', 'metrics', 'vision'];

  for (const k of CORE) {
    if (lr > RN) break;
    const s = svcs[k] || { ok: false, port: '?' };
    out.push(at(lr, 2) + `  ${dot(s.ok)}  ${col(s.ok ? C.white : C.gray, fit(k, 14))}  ${col(C.gray, ':' + s.port)}`);
    lr++;
  }

  // v2.1 — Pulse: live stack heartbeat findings, in the cockpit.
  if (lr < RN - 2 && data.pulseNotifs && data.pulseNotifs.body && data.pulseNotifs.body.notifications) {
    const nf = data.pulseNotifs.body.notifications;
    if (nf.length) {
      lr++;
      out.push(at(lr, 2) + col(C.cyan + C.bold, 'PULSE'));
      lr++;
      for (const n of nf.slice(0, 3)) {
        if (lr > RN) break;
        const sev = n.severity === 'error' ? C.red : n.severity === 'warn' ? C.yellow : C.green;
        out.push(at(lr, 2) + '  ' + col(sev, '●') + '  ' + col(C.white, fit(n.title, 26)));
        lr++;
      }
    }
  }
  if (lr < RN) { out.push(at(lr, 2) + col(C.gray, '  ─── optional')); lr++; }

  for (const k of OPT) {
    if (lr > RN) break;
    const s = svcs[k] || { ok: false, port: '?' };
    out.push(at(lr, 2) + `  ${dot(s.ok)}  ${col(C.gray, fit(k, 14))}  ${col(C.gray, ':' + s.port)}`);
    lr++;
  }

  // ─── LEFT: building visualization ───────────────────────────────────────────
  if (lr < RN - 2) {
    lr++;
    out.push(at(lr, 2) + col(C.cyan + C.bold, 'AGENT TOWER'));
    lr++;

    const blink    = tick_ % 4 < 2;
    const ACTIVE   = blink ? col(C.yellow, '■') : col(C.purple, '■');
    const IDLE     = col(C.gray, '□');
    const EMPTY    = col(C.gray, '·');

    const floors = [...DIVISIONS].reverse();
    for (const div of floors) {
      if (lr > RN) break;
      const activeCount = data.towerStat && Array.isArray(data.towerStat.activeAgents)
        ? data.towerStat.activeAgents.filter(a => String(a.division).toUpperCase() === div.key).length
        : 0;
      const slots  = Math.min(div.slots, 7);
      let windows  = '';
      for (let i = 0; i < slots; i++) windows += (i < activeCount ? ACTIVE : IDLE) + ' ';
      out.push(at(lr, 2) + `  ${col(div.c, fit(div.key, 13))}  ${windows}`);
      lr++;
    }
  }

  // ─── RIGHT: orchestrator + pool + context ────────────────────────────────────
  out.push(at(rr, mid) + col(C.purple, '│') + ' ' + col(C.cyan + C.bold, 'ORCHESTRATOR'));
  rr++;

  if (orchStat && typeof orchStat === 'object') {
    const total  = orchStat.session?.totalTasks     ?? orchStat.totalTasks     ?? '—';
    const done   = orchStat.session?.completedTasks ?? orchStat.completedTasks ?? '—';
    const failed = orchStat.session?.failedTasks    ?? orchStat.failedTasks    ?? '—';
    const queue  = orchStat.queue  ?? orchStat.queueDepth      ?? 0;
    const active = orchStat.active ?? orchStat.activeWorkflows  ?? 0;
    out.push(at(rr, mid) + col(C.purple, '│') + `  tasks  ${col(C.cyan, String(total).padStart(5))}  done ${col(C.green, String(done).padStart(5))}  fail ${col(C.red, String(failed).padStart(4))}`);
    rr++;
    out.push(at(rr, mid) + col(C.purple, '│') + `  queue  ${col(C.yellow, String(queue).padStart(5))}  active ${col(C.cyan, String(active))}`);
    rr++;
    if (orchStat.uptime !== undefined) {
      const up = Math.round(orchStat.uptime);
      out.push(at(rr, mid) + col(C.purple, '│') + `  uptime ${col(C.gray, Math.floor(up / 3600) + 'h ' + Math.floor((up % 3600) / 60) + 'm')}`);
      rr++;
    }
  } else {
    out.push(at(rr, mid) + col(C.purple, '│') + col(C.gray, '  offline'));
    rr++;
  }

  rr++;
  out.push(at(rr, mid) + col(C.purple, '│') + ' ' + col(C.cyan + C.bold, 'POOL'));
  rr++;
  if (poolStats && typeof poolStats === 'object') {
    out.push(at(rr, mid) + col(C.purple, '│') + `  skills  ${col(C.green, String(poolStats.skillsCount ?? 0).padStart(4))}  agents ${col(C.green, String(poolStats.agentsCount ?? 0).padStart(4))}`);
    rr++;
    out.push(at(rr, mid) + col(C.purple, '│') + `  queries ${col(C.gray, String(poolStats.queries ?? 0).padStart(4))}  uptime ${col(C.gray, poolStats.uptimeSec ? Math.round(poolStats.uptimeSec) + 's' : '?')}`);
    rr++;
  } else {
    out.push(at(rr, mid) + col(C.purple, '│') + col(C.gray, '  offline  :7885'));
    rr++;
  }

  rr++;
  out.push(at(rr, mid) + col(C.purple, '│') + ' ' + col(C.cyan + C.bold, 'CONTEXT BUS'));
  rr++;
  if (ctxStats && typeof ctxStats === 'object') {
    out.push(at(rr, mid) + col(C.purple, '│') + `  agents  ${col(C.green, String(ctxStats.activeAgents ?? 0).padStart(4))}  locks  ${col(C.cyan, String(ctxStats.activeLocks ?? 0).padStart(4))}`);
    rr++;
    out.push(at(rr, mid) + col(C.purple, '│') + `  spawned ${col(C.gray, String(ctxStats.stats?.totalAgentsSpawned ?? 0).padStart(4))}`);
    rr++;
  } else {
    out.push(at(rr, mid) + col(C.purple, '│') + col(C.gray, '  offline  :7881'));
    rr++;
  }

  // recent events in right pane
  const evStart = Math.min(rr + 1, RN - 3);
  if (evStart < RN && eventLog.length > 0) {
    rr = evStart;
    out.push(at(rr, mid) + col(C.purple, '│') + ' ' + col(C.cyan + C.bold, 'EVENTS'));
    rr++;
    const avail  = RN - rr;
    const recent = eventLog.slice(-avail);
    for (const e of recent) {
      if (rr > RN) break;
      const typeC = e.type.includes('complete') ? C.green : e.type.includes('fail') ? C.red : e.type.includes('spawn') ? C.cyan : C.gray;
      out.push(at(rr, mid) + col(C.purple, '│') + ` ${col(C.gray, e.ts)}  ${col(typeC, e.type)}  ${col(C.dim, fit(e.msg, W - mid - 28))}`);
      rr++;
    }
  }
}

function drawActions(out, R1, RN, W) {
  let r = R1;
  const capabilities = CAPABILITIES ? CAPABILITIES.listCapabilities() : [];
  out.push(at(r, 2) + col(C.bold, 'SURFACE ACTIONS') + col(C.gray, '  ·  same jobs across CLI, TUI, and web UI'));
  r += 2;

  if (!capabilities.length) {
    out.push(at(r, 2) + col(C.red, '  Capability catalog unavailable: lib/surface-capabilities.js'));
    return;
  }

  const leftW = Math.max(34, Math.floor(W * 0.33));
  const midW = Math.max(34, Math.floor(W * 0.31));
  const rightW = Math.max(34, W - leftW - midW - 8);
  const rowsPerItem = 4;
  const maxItems = Math.max(1, Math.floor((RN - r + 1) / rowsPerItem));

  for (const [idx, item] of capabilities.slice(0, maxItems).entries()) {
    const setup = item.setup.join(', ');
    const cli = item.cli[0] || 'purpclaw capabilities';
    const tui = item.tui[0] || 'this tab';
    const web = `${item.web.route} / ${item.web.mode}`;
    const tone = item.category === 'execute' ? C.green : item.category === 'setup' ? C.yellow : item.category === 'observe' ? C.cyan : C.white;
    const marker = idx === activeAction ? col(C.yellow + C.bold, '▶') : col(C.gray, ' ');
    out.push(at(r, 2) + `${marker} ${col(tone + C.bold, fit(item.label, leftW - 5))} ${col(C.gray, fit(item.category, 11))}`);
    out.push(at(r, leftW) + col(C.cyan, fit(`CLI ${cli}`, midW - 2)));
    out.push(at(r, leftW + midW) + col(C.lavender, fit(`WEB ${web}`, rightW - 2)));
    r++;
    out.push(at(r, 4) + col(C.gray, fit(item.reason, W - 8)));
    r++;
    out.push(at(r, 4) + col(C.gray, fit(`TUI ${tui}`, leftW - 4)));
    out.push(at(r, leftW) + col(C.gray, fit(`SETUP ${setup}`, W - leftW - 4)));
    r += 2;
    if (r > RN) break;
  }

  if (capabilities.length > maxItems && r <= RN) {
    out.push(at(r, 2) + col(C.gray, `  ${capabilities.length - maxItems} more. CLI: purpclaw capabilities --json  ·  Web API: /api/capabilities`));
  }
  if (r <= RN - 2) {
    r++;
    const selected = capabilities[activeAction] || capabilities[0];
    out.push(at(r, 2) + col(C.yellow, '  ↑/↓ select  Enter plan  l launch  ') + col(C.gray, `selected: ${selected?.id || 'none'}`));
    r++;
    if (actionPreview) {
      const p = actionPreview.plan || actionPreview;
      out.push(at(r, 2) + col(C.gray, `  plan: ${p.method || '?'} ${p.port ? ':' + p.port : ''}${p.path || ''}`));
      if (actionStatus && r + 1 <= RN - 1) out.push(at(r + 1, 2) + col(C.gray, `  status: ${actionStatus}`));
    } else {
      out.push(at(r, 2) + col(C.gray, '  plan: press Enter to preview the same dispatch target used by CLI and web'));
    }
  }
}

// ── AGENTS TAB ────────────────────────────────────────────────────────────────
function drawAgents(out, R1, RN, W) {
  let routing = {}, scores = {};
  const routingPath = path.join(PURP_DIR, 'agent_routing_matrix.js');
  try {
    delete require.cache[require.resolve(routingPath)];
    routing = require(routingPath).AGENT_ROUTING || {};
  } catch {}
  try {
    const f = path.join(PURP_DIR, 'agent_score.json');
    // agent_score.json structure: { agents: { name: { totalTasks, successes, ... } }, intents, history, meta }
    if (fs.existsSync(f)) scores = (JSON.parse(fs.readFileSync(f, 'utf8'))).agents || {};
  } catch {}

  const DIV_COL = {
    ENGINEERING: C.cyan, SECURITY: C.red, INTELLIGENCE: C.blue,
    OPERATIONS: C.yellow, MANAGEMENT: C.magenta, MEDIA_OPS: C.hotpink,
    SCIENCE: C.teal, CREATIVE: C.orange, INFRASTRUCTURE: C.gray,
  };

  const byDiv = {};
  for (const [name, info] of Object.entries(routing)) {
    const d = info.division || 'UNKNOWN';
    (byDiv[d] = byDiv[d] || []).push({ name, role: info.role || '' });
  }

  const total = Object.keys(routing).length;
  const mid   = Math.floor(W / 2);
  let lRow    = R1 + 2;
  let rRow    = R1 + 2;
  let onLeft  = true;

  out.push(at(R1, 2) + col(C.bold, 'AGENT ROSTER') + col(C.gray, `  ·  ${total} agents  ·  9 divisions  ·  the hammers`));
  out.push(at(R1 + 1, 2) + col(C.gray, '  ○ = idle  ◉ = busy  ●/░ = success rate'));

  for (const [div, agents] of Object.entries(byDiv).sort()) {
    const dc  = DIV_COL[div] || C.white;
    const col_= onLeft ? 2 : mid;
    let r     = onLeft ? lRow : rRow;

    if (r >= RN - 2) break;

    out.push(at(r, col_) + `  ${col(dc + C.bold, div)}`);
    r++;

    for (const ag of agents.slice(0, 6)) {
      if (r >= RN) break;
      const s      = scores[ag.name.toLowerCase()];
      // successRate is computed, not stored — derive from successes/totalTasks
      const rate   = s ? (s.totalTasks > 0 ? Math.round(s.successes / s.totalTasks * 100) : 0) : null;
      const rateStr = rate !== null
        ? ' ' + col(rate >= 80 ? C.green : rate >= 50 ? C.yellow : C.red, (rate.toFixed(0) + '%').padStart(4))
        : '';
      const bar    = rate !== null
        ? col(rate >= 80 ? C.green : rate >= 50 ? C.yellow : C.red, '█'.repeat(Math.round(rate / 20)).padEnd(5, '░'))
        : col(C.gray, '·····');
      out.push(at(r, col_) + `    ${col(C.gray, '○')}  ${col(C.white, fit(ag.name, 13))} ${bar}${rateStr}  ${col(C.gray, fit(ag.role.slice(0, 14), 14))}`);
      r++;
    }

    if (onLeft) lRow = r + 1; else rRow = r + 1;
    onLeft = !onLeft;
  }

  if (total === 0) {
    out.push(at(R1 + 3, 2) + col(C.gray, '  No routing matrix found. Check agent_routing_matrix.js'));
  }
}

// ── JOBS TAB ─────────────────────────────────────────────────────────────────
function drawJobs(out, R1, RN, W, data) {
  let r = R1;
  const { workflows } = data;

  out.push(at(r, 2) + col(C.bold, 'WORKFLOWS') + col(C.gray, '  ·  active + recent'));
  r += 2;

  if (!Array.isArray(workflows) || workflows.length === 0) {
    out.push(at(r, 2) + col(C.gray, '  No workflows running.'));
    r += 2;
    out.push(at(r, 2) + col(C.gray, '  ·  purpclaw run "<task>"    dispatch to orchestrator'));
    out.push(at(r + 1, 2) + col(C.gray, '  ·  purpclaw bg "<task>"     fire and forget'));
    out.push(at(r + 2, 2) + col(C.gray, '  ·  purpclaw approve <id>    approve held job'));
    return;
  }

  for (const wf of workflows.slice(0, Math.floor((RN - r) / 2))) {
    if (r >= RN - 1) break;
    const sc   = { running: C.cyan, completed: C.green, failed: C.red, queued: C.yellow }[wf.status] || C.gray;
    const icon = wf.status === 'running' ? col(C.cyan, '▶') : wf.status === 'completed' ? col(C.green, '✓') : col(C.red, '✗');
    const age  = wf.startedAt
      ? col(C.gray, Math.round((Date.now() - new Date(wf.startedAt).getTime()) / 1000) + 's ago')
      : '';
    out.push(at(r, 2) + `  ${icon}  ${col(C.white, fit(wf.workflowId || wf.id || '—', 26))}  ${col(sc, fit(wf.status || '—', 10))}  ${age}`);
    r++;
    if (wf.command) { out.push(at(r, 2) + `     ${col(C.gray, fit(wf.command, W - 8))}`); r++; }
  }

  if (r < RN - 2) {
    r++;
    out.push(at(r, 2) + col(C.gray, '  purpclaw run "<task>"  ·  purpclaw jobs pending  ·  purpclaw approve <id>'));
  }
}

// ── MEMORY TAB ───────────────────────────────────────────────────────────────
async function drawMemory(out, R1, RN, W) {
  let r = R1;
  out.push(at(r, 2) + col(C.bold, 'MEMORY & DREAM'));
  r += 2;

  const mem  = await hGet(P.memory, '/health', 1500);
  const drem = await hGet(P.dream,  '/health', 1500);

  out.push(at(r, 2) + col(C.cyan + C.bold, `MEMORY MATRIX  :${P.memory}`));
  r++;
  if (mem && typeof mem === 'object') {
    out.push(at(r, 2) + `  ${dot(true)}  ${col(C.green, 'online')}`);
    r++;
    const fields = [
      ['stored memories', mem.memories],
      ['symbols lifted',  mem.symbols],
      ['episodic',        mem.episodic],
      ['semantic',        mem.semantic],
    ];
    for (const [label, val] of fields) {
      if (val !== undefined && val !== null) {
        out.push(at(r, 2) + `  ${fit(label, 18)} : ${col(C.cyan, String(val))}`);
        r++;
      }
    }
  } else {
    out.push(at(r, 2) + `  ${dot(false)}  ${col(C.gray, 'offline')}`);
    r++;
  }

  r++;
  out.push(at(r, 2) + col(C.cyan + C.bold, `AUTODREAM  :${P.dream}`));
  r++;
  if (drem && typeof drem === 'object') {
    out.push(at(r, 2) + `  ${dot(true)}  ${col(C.green, 'online')}  ${col(C.gray, 'consolidation available')}`);
    r++;
    if (drem.lastDream) { out.push(at(r, 2) + `  last dream : ${col(C.gray, String(drem.lastDream).slice(0, 40))}`); r++; }
  } else {
    out.push(at(r, 2) + `  ${dot(false)}  ${col(C.gray, 'offline')}`);
    r++;
  }

  if (r < RN - 4) {
    r += 2;
    const hints = [
      ['purpclaw memory <query>',        'recall matching memories'],
      ['purpclaw memory ingest "<text>"', 'store a new memory'],
      ['purpclaw memory forget "<query>"','remove matching memories'],
      ['purpclaw memory stats',          'detailed matrix stats'],
      ['purpclaw dream',                 'trigger consolidation cycle'],
    ];
    for (const [cmd, desc] of hints) {
      if (r >= RN) break;
      out.push(at(r, 2) + `  ${col(C.cyan, fit(cmd, 38))}  ${col(C.gray, desc)}`);
      r++;
    }
  }
}

// ── POOL TAB ─────────────────────────────────────────────────────────────────
function drawPool(out, R1, RN, W, data) {
  let r = R1;
  const { poolStats } = data;

  out.push(at(r, 2) + col(C.bold, 'KNOWLEDGE POOL') + col(C.gray, '  ·  http://localhost:7885'));
  r += 2;

  if (poolStats && typeof poolStats === 'object') {
    out.push(at(r, 2) + `  ${dot(true)}  ${col(C.green, 'online')}  :7885`);
    r += 2;

    const stats = [
      ['📚 SKILLS',  poolStats.skillsCount  ?? 0, C.green],
      ['🤖 AGENTS',  poolStats.agentsCount  ?? 0, C.cyan],
      ['📊 QUERIES', poolStats.queries      ?? 0, C.gray],
    ];
    for (const [label, val, c] of stats) {
      out.push(at(r, 2) + `  ${col(c + C.bold, fit(label, 14))}  ${col(c + C.bold, String(val))}`);
      r++;
    }
    r++;
    const ia  = (poolStats.indexedAt || '').replace('T', ' ').slice(0, 19);
    const ups = poolStats.uptimeSec ? `${Math.round(poolStats.uptimeSec)}s` : '?';
    if (ia) { out.push(at(r, 2) + `  last indexed  : ${col(C.gray, ia)}`);   r++; }
    out.push(at(r, 2) + `  uptime        : ${col(C.gray, ups)}`); r++;
  } else {
    out.push(at(r, 2) + `  ${dot(false)}  ${col(C.gray, 'pool offline  :7885')}`);
    r++;
    out.push(at(r, 2) + col(C.gray, '  Start (cascade-safe): purpclaw safe-start pool'));
    r++;
  }

  if (r < RN - 5) {
    r += 2;
    const hints = [
      ['purpclaw pool query <text>',   'keyword search the skill index'],
      ['purpclaw pool show <name>',    'full SKILL.md content'],
      ['purpclaw pool routing <text>', 'routing hints for a task'],
      ['purpclaw pool stats',          'detailed pool statistics'],
      ['purpclaw pool reindex',        'rebuild index from disk'],
    ];
    for (const [cmd, desc] of hints) {
      if (r >= RN) break;
      out.push(at(r, 2) + `  ${col(C.cyan, fit(cmd, 34))}  ${col(C.gray, desc)}`);
      r++;
    }
  }
}

// ── LOGS TAB ─────────────────────────────────────────────────────────────────
function drawLogs(out, R1, RN, W) {
  const available = RN - R1 - 1;
  out.push(at(R1, 2) + col(C.bold, 'EVENT LOG') + col(C.gray, `  ·  ${eventLog.length} events captured  ·  last ${available} shown`));

  const recent = eventLog.slice(-available);
  for (let i = 0; i < recent.length; i++) {
    const e = recent[i];
    const typeC =
      e.type.includes('complete') ? C.green  :
      e.type.includes('fail')     ? C.red    :
      e.type.includes('spawn')    ? C.cyan   :
      e.type.includes('step')     ? C.yellow : C.gray;
    out.push(at(R1 + 1 + i, 2) + `  ${col(C.gray, e.ts)}  ${col(typeC, e.type)}  ${col(C.dim, fit(e.msg, W - 42))}`);
  }

  if (eventLog.length === 0) {
    out.push(at(R1 + 2, 2) + col(C.gray, '  No events yet. Events stream in as workflows run.'));
    out.push(at(R1 + 3, 2) + col(C.gray, '  Run: purpclaw run "<task>" in another terminal.'));
  }
}

// ── MAIN RENDER ───────────────────────────────────────────────────────────────
async function render() {
  tick_++;
  const { W, H } = sz();
  const out = [clrScreen + hideCursor];

  // Fetch (best-effort, don't block render)
  try { lastData = await fetchAll(); } catch {}
  const data = lastData || {
    svcs: {}, coreOk: 0, coreTotal: 6,
    orchStat: null, towerStat: null, poolStats: null, workflows: [], ctxStats: null,
  };

  drawFrame(out, W, H);
  drawHeader(out, W, data);
  drawFooter(out, W, H);

  // Content area
  const R1 = 6;
  const RN = H - 2;

  // Clear content
  for (let r = R1; r <= RN; r++) {
    out.push(at(r, 2) + ' '.repeat(W - 2));
  }

  switch (activeTab) {
    case 0: drawOverview(out, R1, RN, W, data); break;
    case 1: drawActions(out, R1, RN, W);        break;
    case 2: drawAgents(out, R1, RN, W);         break;
    case 3: drawJobs(out, R1, RN, W, data);     break;
    case 4: await drawMemory(out, R1, RN, W);   break;
    case 5: drawPool(out, R1, RN, W, data);     break;
    case 6: drawLogs(out, R1, RN, W);           break;
  }

  process.stdout.write(out.join(''));
}

// ── keyboard ──────────────────────────────────────────────────────────────────
function setupKeys(quit) {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on('keypress', async (ch, key) => {
    if (!key) return;
    if ((key.ctrl && key.name === 'c') || key.name === 'q') { quit(); return; }
    if (key.name === 'r') { await render(); return; }
    if (key.name === 'p' || key.name === 'space') { paused = !paused; await render(); return; }
    if (key.name === 'v') { await toggleVoice(); await render(); return; }
    if (activeTab === 1 && CAPABILITIES) {
      const caps = CAPABILITIES.listCapabilities();
      if (key.name === 'down') { activeAction = Math.min(caps.length - 1, activeAction + 1); await render(); return; }
      if (key.name === 'up') { activeAction = Math.max(0, activeAction - 1); await render(); return; }
      if (key.name === 'return') {
        const selected = caps[activeAction] || caps[0];
        try {
          actionPreview = ACTIONS
            ? ACTIONS.buildActionPlan(selected.id, selected.reason, { source: 'tui-action-plan' })
            : { plan: { method: 'missing', path: 'lib/action-dispatcher.js unavailable' } };
          actionStatus = 'planned';
          addLog(new Date().toLocaleTimeString('en-GB'), 'action.plan', `${selected.id} -> ${actionPreview.method || actionPreview.plan?.method || '?'}`);
        } catch (e) {
          actionPreview = { plan: { method: 'error', path: e.message || String(e) } };
          actionStatus = e.message || String(e);
        }
        await render();
        return;
      }
      if (key.name === 'l') {
        const selected = caps[activeAction] || caps[0];
        try {
          actionStatus = `launching ${selected.id}`;
          await render();
          actionPreview = ACTIONS
            ? await ACTIONS.dispatchAction(selected.id, selected.reason, { source: 'tui-action' })
            : { plan: { method: 'missing', path: 'lib/action-dispatcher.js unavailable' } };
          const status = actionPreview.result?.status || (actionPreview.ok ? 'ok' : 'failed');
          actionStatus = `${selected.id} ${status}`;
          addLog(new Date().toLocaleTimeString('en-GB'), 'action.launch', `${selected.id} -> ${status}`);
        } catch (e) {
          actionPreview = { plan: { method: 'error', path: e.message || String(e) } };
          actionStatus = e.message || String(e);
        }
        await render();
        return;
      }
    }
    if (/^[1-9]$/.test(key.name) && parseInt(key.name, 10) <= TABS.length) { activeTab = parseInt(key.name, 10) - 1; await render(); return; }
    if (key.name === 'right' || key.name === 'tab') { activeTab = (activeTab + 1) % TABS.length; await render(); return; }
    if (key.name === 'left') { activeTab = (activeTab - 1 + TABS.length) % TABS.length; await render(); return; }
  });
}

// ── SSE event subscription ────────────────────────────────────────────────────
function subscribeEvents() {
  const req = http.request(
    {
      hostname: '127.0.0.1', port: P.orch,
      path: `/api/events`,
      headers: { Accept: 'text/event-stream' },
    },
    res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt  = JSON.parse(line.slice(6));
            const type = (evt.type || evt.event || 'event').replace('workflow_', '').replace('agent_', '');
            if (type === 'connected') continue;
            const agent = evt.agent || evt.agentName || '';
            const msg   = evt.message || evt.description || (typeof evt.result === 'string' ? evt.result.slice(0, 60) : '') || evt.workflowId || '';
            addLog(new Date().toLocaleTimeString(), type, (agent ? agent + ' · ' : '') + msg);
          } catch {}
        }
      });
    }
  );
  req.on('error', () => {}); // orchestrator offline is fine
  req.end();
  return req;
}

// ── entry ─────────────────────────────────────────────────────────────────────
async function runSmoke() {
  const eventReq = subscribeEvents();
  let ok = true;
  let data = null;

  try {
    data = await fetchAll();
  } catch {
    ok = false;
  }

  await new Promise(resolve => setTimeout(resolve, 2500));
  try { eventReq.destroy(); } catch {}

  const services = data?.svcs || {};
  const result = {
    ok,
    coreOk: data?.coreOk ?? 0,
    coreTotal: data?.coreTotal ?? 0,
    services: Object.fromEntries(Object.entries(services).map(([name, info]) => [name, Boolean(info.ok)])),
    eventsCaptured: eventLog.length,
    eventTypes: eventLog.slice(-10).map(event => event.type.trim()),
    poolOnline: Boolean(data?.poolStats),
    contextOnline: Boolean(data?.ctxStats),
    workflowsVisible: Array.isArray(data?.workflows),
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

async function main() {
  if (process.argv.includes('--smoke')) {
    await runSmoke();
    return;
  }

  if (!process.stdout.isTTY) {
    console.error('purpclaw tui requires an interactive TTY terminal.');
    process.exit(1);
  }

  process.stdout.write(hideCursor + clrScreen);

  const eventReq = subscribeEvents();

  // Boot voice mode if enabled
  await refreshVoiceStatus();
  if (VOICE && voiceStatus.voiceEnabled && voiceStatus.stt?.online) {
    await VOICE.startListening();
    voiceState = 'listening';
    sttSub = VOICE.subscribeSTT(
      evt => { addLog(new Date().toLocaleTimeString(), 'voice.heard', evt.text); voiceState = 'heard'; setTimeout(() => { voiceState = 'idle'; }, 2000); },
      () => { voiceState = 'error'; }
    );
  }

  await render();

  const iv = setInterval(async () => {
    if (!paused) {
      // Refresh voice status every 10 ticks (~20s)
      if (tick_ % 10 === 0) await refreshVoiceStatus();
      await render();
    }
  }, 2000);

  process.stdout.on('resize', () => { if (!paused) render(); });

  setupKeys(() => {
    clearInterval(iv);
    try { eventReq.destroy(); } catch {}
    if (sttSub) { try { sttSub.destroy(); } catch {} }
    if (VOICE) { try { VOICE.stopListening(); } catch {} }
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(showCursor + clrScreen);
    process.exit(0);
  });
}

main().catch(e => {
  process.stdout.write(showCursor);
  console.error('\nTUI crashed:', e.message, e.stack);
  process.exit(1);
});
