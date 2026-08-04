#!/usr/bin/env node
/**
 * scripts/tui.js — PURPCLAW Terminal UI
 * Launched by:  purpclaw tui
 * Keys:  1-8 / arrows / Tab = switch tabs  |  r = refresh  |  p = pause  |  q = quit
 */

'use strict';

const http     = require('http');
const path     = require('path');
const fs       = require('fs');
const readline = require('readline');

const PURP_DIR = path.resolve(__dirname, '..');
const LIFECYCLE = require('../lib/lifecycle-actions');
let inputLocked = false;
const VOICE    = (() => { try { return require(path.join(PURP_DIR, 'lib', 'voice-client.js')); } catch { return null; } })();

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
  } catch {}
})();

const P = {
  api       : parseInt(process.env.API_PORT          || '7780',  10),
  eventbus  : parseInt(process.env.EVENTBUS_PORT     || '7782',  10),
  state     : parseInt(process.env.STATE_PORT        || '7783',  10),
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

const ESC = '';

const C = {
  reset    : ESC + '[0m',
  bold     : ESC + '[1m',
  dim      : ESC + '[2m',
  // Standard 16-color (base — mintty maps these per its theme)
  cyan     : ESC + '[36m',    // dark cyan text (#006666 → renders as bright cyan in mintty)
  green    : ESC + '[32m',    // dark green  (#006400)
  yellow   : ESC + '[33m',
  red      : ESC + '[31m',
  blue     : ESC + '[34m',
  magenta  : ESC + '[35m',    // dark magenta (#540054 → renders as bright magenta in mintty)
  white    : ESC + '[37m',    // dark white  (#AAAAAA)
  gray     : ESC + '[90m',    // bright gray (#AAAAAA)
  // 256-color accurate codes (when terminal supports 256-color)
  // Title bar: RGB(63,33,93) ≈ 256-color 60
  titleBar : ESC + '[38;5;60m',
  // Section labels: RGB(162,91,221) ≈ 256-color 140
  section  : ESC + '[38;5;140m',
  // Values / active items: RGB(177,72,198) ≈ 256-color 133
  value    : ESC + '[38;5;133m',
  // Status ok: RGB(0,138,0) ≈ 256-color 64
  statusOk : ESC + '[38;5;64m',
  // Border (dark purple): RGB(84,0,128) ≈ 256-color 92
  border   : ESC + '[38;5;92m',
  // Hot / accent: RGB(205,40,162) ≈ 256-color 205
  hot      : ESC + '[38;5;205m',
  hotpink  : ESC + '[38;5;205m',
  orange   : ESC + '[38;5;214m',
  teal     : ESC + '[38;5;43m',
  violet   : ESC + '[38;5;141m',
  // Tab active background: dark purple (#3F215D)
  bgPurple : ESC + '[48;5;54m',
  // Bright variants
  brightCyan   : ESC + '[96m',
  brightGreen  : ESC + '[92m',
  brightYellow : ESC + '[93m',
  brightRed    : ESC + '[91m',
  brightMagenta: ESC + '[95m',
  brightWhite  : ESC + '[97m',
};

const col       = (c, s) => c + s + C.reset;
const fit       = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const fitc      = (s, n) => String(s == null ? '' : s).padStart(n).slice(-n);
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[mH]/g, '');

const at        = (r, c) => ESC + '[' + r + ';' + c + 'H';
const clrScreen = ESC + '[2J' + ESC + '[H';
const hideCur   = ESC + '[?25l';
const showCur   = ESC + '[?25h';

const sz = () => ({ W: process.stdout.columns || 120, H: process.stdout.rows || 40 });

function hGet(port, pathname, timeout) {
  timeout = timeout || 2000;
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'GET' }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d || null); } });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function ping(port, path_) {
  const r = await hGet(port, path_ || '/health', 1500);
  return r !== null && r !== undefined;
}

let activeTab  = 0;
let paused     = false;
let tick_      = 0;
let lastData   = null;
let eventLog   = [];
const MAX_LOG  = 200;

const TABS = [
  { key: 'F1', label: 'Help' },
  { key: 'F2', label: 'Mission' },
  { key: 'F3', label: 'Agents' },
  { key: 'F4', label: 'Omni' },
  { key: 'F5', label: 'Memory' },
  { key: 'F6', label: 'Evolution' },
  { key: 'F7', label: 'Awaken' },
  { key: 'F8', label: 'Services' },
  { key: 'F9', label: 'Mochi' },
  { key: 'F10', label: 'Settings' },
];

function addLog(ts, type, msg) {
  eventLog.push({ ts, type: fit(String(type), 14), msg: String(msg) });
  if (eventLog.length > MAX_LOG) eventLog.shift();
}

async function fetchAll() {
  const [okApi, okTower, okBus, okState, okOrch, okGK, okPool, okMet, okVis,
         orchStat, towerStat, poolStats, workflows, ctxStats] =
    await Promise.all([
      ping(P.api,        '/api/health'),
      ping(P.tower,      '/tower/status'),
      ping(P.eventbus,   '/health'),
      ping(P.state,      '/health'),
      ping(P.orch,       '/api/health'),
      ping(P.gatekeeper, '/health'),
      ping(P.pool,       '/health'),
      ping(P.metrics,    '/health'),
      ping(P.vision,     '/health'),
      hGet(P.orch,  '/api/status',    3000),
      hGet(P.tower, '/api/status',    3000),
      hGet(P.pool,  '/pool/stats',    3000),
      hGet(P.orch,  '/api/workflows', 3000),
      hGet(P.ctx,   '/context/stats', 1500),
    ]);

  const svcs = {
    'unified-api' : { ok: okApi,   port: P.api,       group: 'core' },
    'agent-tower' : { ok: okTower, port: P.tower,     group: 'core' },
    'eventbus'    : { ok: okBus,   port: P.eventbus,  group: 'core' },
    'state-store' : { ok: okState, port: P.state,     group: 'core' },
    'orchestrator': { ok: okOrch,  port: P.orch,      group: 'core' },
    'gatekeeper'  : { ok: okGK,    port: P.gatekeeper,group: 'core' },
    'pool'        : { ok: okPool,  port: P.pool,      group: 'optional' },
    'metrics'     : { ok: okMet,   port: P.metrics,   group: 'optional' },
    'vision'      : { ok: okVis,   port: P.vision,    group: 'optional' },
  };
  const core     = Object.values(svcs).filter(s => s.group === 'core');
  const coreOk   = core.filter(s => s.ok).length;
  const allSvcs  = Object.values(svcs);
  const allOk    = allSvcs.filter(s => s.ok).length;
  return { svcs, coreOk, coreTotal: core.length, allOk, allTotal: allSvcs.length,
           orchStat, towerStat, poolStats, workflows, ctxStats };
}

const bxTop = W => col(C.violet, '╭' + '─'.repeat(W - 2) + '╮');
const bxBot = W => col(C.violet, '╰' + '─'.repeat(W - 2) + '╯');
const bxMid = W => col(C.violet, '├' + '─'.repeat(W - 2) + '┤');
// bxLine: purple fill behind the vertical border so the box interior shows purple
const bxLine= () => col(C.bgPurple, '│');
// bgLine: full-width purple fill for section interiors
const bgLine= (W, c) => col(C.bgPurple, ' ');

function dot(ok) { return ok ? col(C.green, '●') : col(C.red, '○'); }

function drawHeader(out, W, data) {
  out.push(at(1, 1) + bxTop(W));

  const { coreOk, coreTotal, towerStat } = data;
  const coreStatusOk = coreOk === coreTotal;
  const statusDot   = coreStatusOk ? col(C.green, '●') : (coreOk > coreTotal / 2 ? col(C.yellow, '◐') : col(C.red, '○'));
  const agents      = (towerStat && Array.isArray(towerStat.activeAgents)) ? towerStat.activeAgents.length : '?';
  const now         = new Date().toLocaleTimeString('en-GB');

  const left  = '  ' + col(C.violet, 'PURPCLAW') + '  ' +
                 col(C.green, '●') + '  ' +
                 col(C.green, String(coreOk) + '/' + String(coreTotal)) + ' ' + col(C.gray, 'UP') + '  ' +
                 col(C.gray, '|  ') +
                 col(C.violet, String(agents)) + ' ' + col(C.gray, 'ACTIVE') + '  ' +
                 col(C.gray, '|  ') +
                 col(C.brightWhite, '32/32') + ' ' + col(C.gray, 'agents') + '  ' +
                 col(C.gray, '|  ') +
                 col(C.brightWhite, '118') + ' ' + col(C.gray, 'tools');
  const right = col(C.violet, 'OMNICOCKPIT') + '  ' + col(C.brightWhite, now);
  const leftLen  = stripAnsi(left).length;
  const rightLen = stripAnsi(right).length;
  const pad      = Math.max(1, W - 2 - leftLen - rightLen);
  out.push(at(2, 2) + left + ' '.repeat(pad) + right);

  out.push(at(3, 2) + col(C.gray, 'PURPCLAW TUI') + '  ' + col(C.gray, '·') + '  ' + col(C.gray, 'One Mission / Many Lenses'));

  let tabBar = '  ';
  TABS.forEach((tab, i) => {
    const active  = i === activeTab;
    const content = ' ' + tab.key + ':' + tab.label + ' ';
    tabBar += active ? col(C.bgPurple + C.white + C.bold, content) : col(C.gray, content);
  });
  out.push(at(4, 2) + fit(tabBar, W - 4));

  const sectionNames = [
    'Help',
    'Mission Control',
    'Agent Tower / Swarm',
    'OMNI Truth Checks',
    'Memory Spine',
    'Self Evolution',
    'Awaken Control',
    'Services',
    'Mochi Chorus',
    'Settings / Sovereign Controls',
  ];
  const sectionTitle = sectionNames[activeTab] || 'Mission Control';
  const modeLabel    = coreStatusOk ? 'OPERATIONAL' : 'DEGRADED';
  const modeColor    = coreStatusOk ? C.green : C.yellow;
  out.push(at(5, 2) + col(C.violet, sectionTitle));
  out.push(at(5, W - 1 - modeLabel.length) + col(modeColor, '[' + modeLabel + ']'));

  out.push(at(6, 2) + col(C.hotpink, '◈') + '  ' + col(C.brightWhite, 'MOCHI // COMPANION') + '  ' +
                   col(C.red, '●') + '  ' + col(C.red, 'OFFLINE'));
  const crumbs   = 'MISSION CONTROL  ●  COMMAND ROOM  ●  MOCHI // COMPANION';
  const crumbLen = stripAnsi(crumbs).length;
  out.push(at(6, Math.max(2, W - 2 - crumbLen)) + col(C.gray, crumbs));

  out.push(at(7, 1) + bxMid(W));
}

function drawFooter(out, W, H) {
  const RN = H - 1;
  // Stats bar: row RN-2 (matches mockup "STATS BAR")
  // Footer bar: row RN-1 (metrics + hints on same line)
  const metrics = [
    [C.gray,  'AGENTS'],              [C.green,  '27'],
    [C.gray,  'TRUTH SCORE'],         [C.green,  '93.7%'],
    [C.gray,  'SYSTEM STRESS'],       [C.yellow, '18%'],
    [C.gray,  'HEIST LOOT (24H)'],    [C.white,  '1.24 TB'],
    [C.gray,  'RELIABILITY'],         [C.green,  '99.986%'],
    [C.gray,  'MEMORY UTILIZATION'],  [C.cyan,   '62%'],
    [C.gray,  'CHORUS HARMONY'],      [C.green,  '87%'],
  ];
  let metricStr = '  ';
  for (let i = 0; i < metrics.length; i += 2) {
    metricStr += metrics[i][0] + metrics[i][1] + '  ' + metrics[i+1][1] + '    ';
  }
  out.push(at(RN - 2, 2) + fit(metricStr, W - 4));

  // Status bar: row RN-1
  const hints = '  ' +
    col(C.gray, '1-8:tab  ') +
    col(C.gray, 'arrows:nav  ') +
    col(C.gray, 'r:refresh  ') +
    col(C.gray, 'p:pause  ') +
    col(C.gray, 'q:quit') +
    '               ' +
    col(C.violet, 'PURPCLAW TUI v0.5.0') +
    '     ' +
    col(C.green, 'Built for Sovereignty.');
  out.push(at(RN - 1, 2) + fit(hints, W - 4));
}

function drawSidebar(out, R1, RN) {
  const SW = 26;
  out.push(at(R1, 2) + col(C.violet, '  NAVIGATION'));
  out.push(at(R1 + 1, 2) + col(C.gray, '  ' + '─'.repeat(SW - 4)));
  let r = R1 + 2;
  const navItems = [
    { key: 'F1', label: 'Help',             active: activeTab === 0 },
    { key: 'F2', label: 'Mission',          active: activeTab === 1 },
    { key: 'F3', label: 'Agents',           active: activeTab === 2 },
    { key: 'F4', label: 'Omni',             active: activeTab === 3 },
    { key: 'F5', label: 'Memory',           active: activeTab === 4 },
    { key: 'F6', label: 'Evolution',         active: activeTab === 5 },
    { key: 'F7', label: 'Awaken',           active: activeTab === 6 },
    { key: 'F8', label: 'Services',         active: activeTab === 7 },
    { key: 'F9', label: 'Mochi',            active: activeTab === 8 },
    { key: 'F10', label: 'Settings',        active: activeTab === 9 },
  ];
  for (const item of navItems) {
    const marker = item.active ? col(C.violet, '▶') : ' ';
    const keyCol  = item.active ? C.brightWhite : C.gray;
    const lblCol  = item.active ? C.brightWhite : C.gray;
    out.push(at(r, 2) + col(C.violet, ' ' + marker) + '  ' + col(keyCol, fit(item.key, 4)) + ' ' + col(lblCol, fit(item.label, 16)));
    r++;
  }
  out.push(at(r, 2) + col(C.violet, '  ' + '─'.repeat(SW - 4)));
}

function drawOverview(out, R1, RN, W, data) {
  const { svcs, coreOk, coreTotal, towerStat, poolStats } = data;
  const PW    = Math.floor((W - 30) / 2);
  const leftC = 28;
  const midC  = leftC + PW + 4;

  let lr = R1;
  // AWAKEN CONTROL section (top-left)
  out.push(at(lr, leftC) + col(C.violet, 'AWAKEN CONTROL'));
  lr++;
  out.push(at(lr, leftC) + col(C.yellow, 'STATE: STANDBY'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Full system activation.'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'All guardians to ready.'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Systems purring.'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Agents hungry.'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.violet, "What's the plan, boss?"));
  lr += 2;
  out.push(at(lr, leftC) + col(C.white, '[T]') + '  ' + col(C.gray, 'Talk to Mochi'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.green, '[SPACE]') + '  ' + col(C.green, 'AWAKEN NOW'));
  lr += 2;

  // Operation details
  out.push(at(lr, leftC) + col(C.violet, 'OPERATION'));
  lr++;
  out.push(at(lr, leftC) + col(C.brightWhite, 'PURPLE DAWN'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.violet, 'DIRECTIVE'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Expand truth. Extract signal.'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Protect sovereignty.'));
  lr++;
  out.push(at(lr, leftC) + col(C.violet, 'Focus:') + '  ' + col(C.white, 'Build + Defend + Evolve'));
  lr += 2;

  // Companion Chorus
  out.push(at(lr, leftC) + col(C.violet, 'COMPANION CHORUS HARMONY'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '87%'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, "It's watching."));

  let mr = R1;
  out.push(at(mr, midC) + col(C.violet, 'COGNITIVE CORE'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.green, 'ACTIVE') + '  ' + col(C.green, 'HIGH INTEGRITY') + '  ' + col(C.gray, 'NOMINAL'));
  mr++;
  out.push(at(mr, midC) + col(C.violet, '● ACQUIRED') + '  ' + col(C.green, 'EXCELLENT') + '  ' + col(C.gray, 'of Cognitive Spine'));
  mr += 2;

  out.push(at(mr, midC) + col(C.violet, 'SERVICE RADAR'));
  mr++;
  const coreKeys = ['unified-api', 'agent-tower', 'eventbus', 'state-store', 'orchestrator', 'gatekeeper'];
  const coreUp   = coreKeys.filter(k => svcs[k]?.ok).length;
  out.push(at(mr, midC) + col(C.green, String(coreUp)) + '/' + col(C.white, String(coreTotal)) + '  CORE UP');
  mr++;
  const optKeys = ['pool', 'metrics', 'vision'];
  const optUp   = optKeys.filter(k => svcs[k]?.ok).length;
  out.push(at(mr, midC) + col(optUp === optKeys.length ? C.green : C.yellow, String(optUp)) + '/' + col(C.white, String(optKeys.length)) + '  OPTIONAL UP');
  mr++;

  out.push(at(mr, midC) + col(C.violet, 'PROVIDERS & MODELS'));
  mr++;
  const providersReady = data?.whoami?.systems?.providers?.count ?? data?.providers?.configured ?? 0;
  out.push(at(mr, midC) + col(providersReady ? C.green : C.yellow, '●') + '  ' + col(C.gray, `${providersReady} providers configured live`));
  mr += 2;

  out.push(at(mr, midC) + col(C.violet, 'ROUTING & ACCESS'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.gray, '12 services'));
  mr += 2;

  out.push(at(mr, midC) + col(C.violet, 'CORE SERVICES'));
  mr++;
  for (const k of coreKeys) {
    if (mr >= RN) break;
    const s = svcs[k] || { ok: false, port: '?' };
    out.push(at(mr, midC) + (s.ok ? col(C.green, '●') : col(C.red, '○')) + '  ' +
                     col(s.ok ? C.white : C.gray, fit(k, 16)) + '  ' + col(C.gray, ':' + s.port));
    mr++;
  }
  mr++;
  out.push(at(mr, midC) + col(C.gray, 'OPTIONAL'));
  mr++;
  for (const k of optKeys) {
    if (mr >= RN) break;
    const s = svcs[k] || { ok: false, port: '?' };
    out.push(at(mr, midC) + (s.ok ? col(C.green, '●') : col(C.gray, '○')) + '  ' +
                     col(C.gray, fit(k, 16)) + '  ' + col(C.gray, ':' + s.port));
    mr++;
  }
}
function drawAgentSwarm(out, R1, RN, W, data) {
  const { svcs, coreOk, coreTotal, orchStat } = data;
  const PW    = Math.floor((W - 30) / 2);
  const leftC = 28;
  const midC  = leftC + PW + 4;

  let lr = R1;

  // ── AWAKEN CONTROL ─────────────────────────────────────────────────────────
  out.push(at(lr, leftC) + col(C.violet, 'AWAKEN CONTROL'));
  lr++;
  out.push(at(lr, leftC) + col(C.yellow, 'STATE: STANDBY'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Full system activation.'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'All guardians to ready.'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Systems purring.'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Agents hungry.'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.violet, "What's the plan, boss?"));
  lr += 2;
  out.push(at(lr, leftC) + col(C.white, '[T]') + '  ' + col(C.gray, 'Talk to Mochi'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.green, '[SPACE]') + '  ' + col(C.green, 'AWAKEN NOW'));
  lr += 2;

  // Operation details
  out.push(at(lr, leftC) + col(C.violet, 'OPERATION'));
  lr++;
  out.push(at(lr, leftC) + col(C.brightWhite, 'PURPLE DAWN'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.violet, 'DIRECTIVE'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Expand truth. Extract signal.'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Protect sovereignty.'));
  lr++;
  out.push(at(lr, leftC) + col(C.violet, 'Focus:') + '  ' + col(C.white, 'Build + Defend + Evolve'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.violet, 'COMPANION CHORUS HARMONY'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '87%'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, "It's watching."));

  // ── Right column ─────────────────────────────────────────────────────────
  let mr = R1;

  // COGNITIVE CORE
  out.push(at(mr, midC) + col(C.violet, 'COGNITIVE CORE'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.green, 'ACTIVE') + '  ' + col(C.green, 'HIGH INTEGRITY') + '  ' + col(C.gray, 'NOMINAL'));
  mr++;
  out.push(at(mr, midC) + col(C.violet, '● ACQUIRED') + '  ' + col(C.green, 'EXCELLENT') + '  ' + col(C.gray, 'of Cognitive Spine'));
  mr++;

  // SERVICE RADAR
  out.push(at(mr, midC) + col(C.violet, 'SERVICE RADAR'));
  mr++;
  const coreKeys = ['unified-api', 'agent-tower', 'eventbus', 'state-store', 'orchestrator', 'gatekeeper'];
  out.push(at(mr, midC) + col(C.green, String(coreOk)) + '/' + col(C.white, String(coreTotal)) + '  CORE UP');
  mr++;
  const optKeys = ['pool', 'metrics', 'vision'];
  const optUp   = optKeys.filter(k => svcs[k]?.ok).length;
  out.push(at(mr, midC) + col(optUp === optKeys.length ? C.green : C.yellow, String(optUp)) + '/' + col(C.white, String(optKeys.length)) + '  OPTIONAL UP');
  mr++;

  // PROVIDERS & MODELS
  out.push(at(mr, midC) + col(C.violet, 'PROVIDERS & MODELS'));
  mr++;
  const providersReady = data?.whoami?.systems?.providers?.count ?? data?.providers?.configured ?? 0;
  out.push(at(mr, midC) + col(providersReady ? C.green : C.yellow, '●') + '  ' + col(C.gray, `${providersReady} providers configured live`));
  mr++;

  // ROUTING & ACCESS
  out.push(at(mr, midC) + col(C.violet, 'ROUTING & ACCESS'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.gray, '12 services'));
  mr++;

  // CORE SERVICES
  out.push(at(mr, midC) + col(C.violet, 'CORE SERVICES'));
  mr++;
  for (const k of coreKeys) {
    if (mr >= RN) break;
    const s = svcs[k] || { ok: false, port: '?' };
    out.push(at(mr, midC) + (s.ok ? col(C.green, '●') : col(C.red, '○')) + '  ' +
                     col(s.ok ? C.white : C.gray, fit(k, 16)) + '  ' + col(C.gray, ':' + s.port));
    mr++;
  }
  out.push(at(mr, midC) + col(C.gray, 'OPTIONAL'));
  mr++;
  for (const k of optKeys) {
    if (mr >= RN) break;
    const s = svcs[k] || { ok: false, port: '?' };
    out.push(at(mr, midC) + (s.ok ? col(C.green, '●') : col(C.gray, '○')) + '  ' +
                     col(C.gray, fit(k, 16)) + '  ' + col(C.gray, ':' + s.port));
    mr++;
  }
}

function drawOmniTruth(out, R1, RN, W) {
  const PW    = Math.floor((W - 30) / 2);
  const leftC = 28;
  const midC  = leftC + PW + 4;

  let lr = R1;
  out.push(at(lr, leftC) + col(C.violet, 'OMNI TRUTH CARDS') + '  ' + col(C.gray, 'Live integrity evaluation'));
  lr += 2;

  const cards = [
    ['SOURCE VALIDITY',    '95%',  C.green, 'High confidence'],
    ['DATA PROVENANCE',   '91%',  C.green, 'Verified'],
    ['CONTEXT ALIGNMENT', '94%',  C.green, 'Aligned'],
    ['BIAS DETECTION',   '12%',  C.yellow, 'Low'],
    ['SYNTHESIS QUALITY', '92%',  C.green, 'Excellent'],
  ];
  let cardStr = '  ';
  for (const [label, val, c, sub] of cards) {
    cardStr += col(c, '[' + val + ']') + '  ' + col(C.gray, label) + ' ' + col(C.dim, sub) + '    ';
  }
  out.push(at(lr, leftC) + cardStr);
  lr += 2;

  out.push(at(lr, leftC) + col(C.violet, 'TRUTH INTEGRITY'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '93.7%') + '  ' + col(C.green, '● HIGH INTEGRITY'));
  lr += 2;

  out.push(at(lr, leftC) + col(C.violet, 'OMNI TRUTH CHECKS') + '  ' + col(C.gray, 'Live integrity evaluation'));
  lr += 2;

  let mr = R1;
  out.push(at(mr, midC) + col(C.violet, 'MODULES'));
  mr++;
  out.push(at(mr, midC) + col(C.white, '27') + ' ' + col(C.gray, 'loaded  ·  3 evolving'));
  mr += 2;
  out.push(at(mr, midC) + col(C.violet, 'AUTO-RESEARCH'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '● ON'));
  mr += 2;
  out.push(at(mr, midC) + col(C.violet, 'AUTO-EVOLVE'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '● ON'));
  mr += 2;
  out.push(at(mr, midC) + col(C.violet, 'RELIABILITY LEDGER'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '99.986%'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '● STABLE'));
  mr += 2;
  out.push(at(mr, midC) + col(C.violet, 'DUCK OBSERVER'));
  mr++;
  out.push(at(mr, midC) + col(C.yellow, '● WATCHING'));
  mr += 2;
  out.push(at(mr, midC) + col(C.violet, 'SYSTEM CLIMATE'));
  mr++;
  out.push(at(mr, midC) + col(C.green, '● STABLE'));
}

function drawStudio(out, R1, RN, W) {
  const PW    = Math.floor((W - 30) / 2);
  const leftC = 28;
  const midC  = leftC + PW + 4;

  let lr = R1;
  out.push(at(lr, leftC) + col(C.violet, 'STUDIO'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Creative workspace & generation pipeline'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.violet, 'COUNCIL'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Governance & decision routing'));
  lr += 2;
  out.push(at(lr, leftC) + col(C.violet, 'SOUL'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Identity, memory & continuous self-model'));
  lr += 2;

  let mr = R1;
  out.push(at(mr, midC) + col(C.magenta + C.bold, 'ACTIVE PERSONAS'));
  mr += 2;
  for (const p of ['DREAMFORGE', 'HERMES', 'PURPCLAW']) {
    if (mr >= RN) break;
    out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.white, p));
    mr++;
  }
  mr++;
  out.push(at(mr, midC) + col(C.magenta + C.bold, 'TRUTH ARCHIVE'));
  mr += 2;
  out.push(at(mr, midC) + col(C.gray, 'Preserved counterfactuals: 17'));
  mr++;
  out.push(at(mr, midC) + col(C.gray, 'Emotional priority map: ACTIVE'));
}

function drawTimeline(out, R1, RN, W) {
  out.push(at(R1, 28) + col(C.violet, 'EVENT TIMELINE') + '  ' + col(C.gray, eventLog.length + ' events captured'));
  let r = R1 + 2;
  const groups = {};
  for (const e of eventLog) {
    const bucket = e.ts.slice(0, 8);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(e);
  }
  for (const [time, events] of Object.entries(groups).slice(-40)) {
    if (r >= RN) break;
    out.push(at(r, 28) + col(C.magenta + C.bold, time));
    r++;
    for (const e of events.slice(-3)) {
      if (r >= RN) break;
      const typeC = e.type.includes('complete') ? C.green : e.type.includes('fail') ? C.red : C.gray;
      out.push(at(r, 30) + col(typeC, fit(e.type, 14)) + '  ' + col(C.dim, fit(e.msg, W - 50)));
      r++;
    }
  }
  if (!eventLog.length) out.push(at(R1, 28) + col(C.gray, 'No events yet.'));
}

function drawMemoryTab(out, R1, RN, W) {
  const PW    = Math.floor((W - 30) / 2);
  const leftC = 28;
  const midC  = leftC + PW + 4;

  let lr = R1;
  out.push(at(lr, leftC) + col(C.violet, 'MEMORY MATRIX'));
  lr++;
  out.push(at(lr, leftC) + col(C.green, '● ONLINE') + '  ' + col(C.gray, ':' + P.memory));
  lr += 2;
  out.push(at(lr, leftC) + col(C.gray, 'Stored Memories:') + '  ' + col(C.white, '2,391'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Symbols Lifted:') + '  ' + col(C.violet, '847'));
  lr++;
  out.push(at(lr, leftC) + col(C.gray, 'Memory Util:') + '  ' + col(C.violet, '62%'));
  lr += 2;

  let mr = R1;
  out.push(at(mr, midC) + col(C.magenta + C.bold, 'COMMANDS'));
  mr += 2;
  for (const [cmd, desc] of [
    ['purpclaw memory <query>',         'recall'],
    ['purpclaw memory ingest "<text>"', 'store'],
    ['purpclaw memory stats',           'stats'],
    ['purpclaw dream',                  'consolidate'],
  ]) {
    if (mr >= RN) break;
    out.push(at(mr, midC) + col(C.violet, fit(cmd, 30)) + '  ' + col(C.gray, desc));
    mr++;
  }
}

function drawModeCommand(out, R1, RN, W) {
  out.push(at(R1, 28) + col(C.violet, 'COMMAND CONSOLE'));
  let r = R1 + 2;
  for (const line of [
    '  [/mission]  Launch a new mission',
    '  [/agent]    Spawn an agent',
    '  [/heist]    Start a heist run',
    '  [/truth]    Run truth checks',
    '  [/evolve]   Trigger evolution',
    '  [/help]     Show all commands',
  ]) {
    out.push(at(r, 28) + col(C.gray, line));
    r++;
  }
  r += 2;
  out.push(at(r, 28) + col(C.violet, 'RECENT ACTIONS [YOU]'));
  r++;
  const cmds = eventLog.filter(e => e.type.includes('command') || e.type.includes('ask'));
  for (const e of cmds.slice(-8)) {
    if (r >= RN) break;
    out.push(at(r, 28) + col(C.gray, fit(e.ts, 8)) + '  ' + col(C.violet, fit(e.msg, W - 50)));
    r++;
  }
}

function drawSettings(out, R1, RN, W, data) {
  const { coreOk, coreTotal, allOk, allTotal, poolStats } = data;
  out.push(at(R1, 28) + col(C.violet, 'SYSTEM SETTINGS'));
  let r = R1 + 2;
  out.push(at(r, 28) + col(C.violet, 'CORE SERVICES'));
  r++;
  out.push(at(r, 28) + col(coreOk === coreTotal ? C.green : C.yellow, coreOk + '/' + coreTotal + ' UP'));
  r += 2;
  out.push(at(r, 28) + col(C.violet, 'OPTIONAL SERVICES'));
  r++;
  out.push(at(r, 28) + col(C.white, (allOk - coreOk) + '/' + (allTotal - coreTotal) + ' UP'));
  r += 2;
  out.push(at(r, 28) + col(C.violet, 'POOL'));
  r++;
  out.push(at(r, 28) + col(C.white, 'Skills: ' + (poolStats && poolStats.skillsCount != null ? poolStats.skillsCount : '?')));
  out.push(at(r + 1, 28) + col(C.white, 'Agents: ' + (poolStats && poolStats.agentsCount != null ? poolStats.agentsCount : '?')));
}

async function render() {
  tick_++;
  const { W, H } = sz();
  if (W < 80 || H < 20) {
    process.stdout.write(clrScreen);
    console.log('Terminal too small (need 80x20).');
    return;
  }

  const out = [clrScreen + hideCur];

  try { lastData = await fetchAll(); } catch {}
  const data = lastData || { svcs: {}, coreOk: 0, coreTotal: 6, allOk: 0, allTotal: 9,
                              orchStat: null, towerStat: null, poolStats: null, workflows: [], ctxStats: null };

  const RN = H - 1;

  const R1 = 9; // row 9 = starts after header (rows 1-8)

  out.push(at(1, 1) + bxTop(W));
  out.push(at(RN, 1) + bxBot(W));
  for (let r = 2; r < RN; r++) {
    out.push(at(r, 1) + bxLine());
    out.push(at(r, W) + bxLine());
  }

  drawHeader(out, W, data);
  drawFooter(out, W, H);
  drawSidebar(out, R1, RN);

  for (let r = R1; r < RN - 1; r++) {
    out.push(at(r, 28) + col(C.bgPurple, ' '.repeat(W - 28)));
  }

  switch (activeTab) {
    case 0: drawOverview(out, R1, RN, W, data);     break;
    case 1: drawAgentSwarm(out, R1, RN, W, data);   break;
    case 2: drawOmniTruth(out, R1, RN, W);           break;
    case 3: drawStudio(out, R1, RN, W);              break;
    case 4: drawTimeline(out, R1, RN, W);             break;
    case 5: drawMemoryTab(out, R1, RN, W);            break;
    case 6: drawModeCommand(out, R1, RN, W);          break;
    case 7: drawSettings(out, R1, RN, W, data);       break;
    default: out.push(at(R1, 28) + col(C.gray, 'Coming soon...')); break;
  }

  process.stdout.write(out.join(''));
}

async function promptLifecycleAction() {
  if (inputLocked) return;
  inputLocked = true;
  paused = true;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write(showCur + '\n\n  LIFECYCLE ACTION\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));
  try {
    const available = LIFECYCLE.list();
    for (const cap of available) console.log(`  ${cap.capability}: ${cap.actions.map(a => a.key).join(', ')}`);
    const capability = String(await ask('\n  Capability: ')).trim();
    const action = String(await ask('  Action: ')).trim();
    const raw = String(await ask('  Options JSON [{}]: ')).trim();
    let options = {};
    if (raw) options = JSON.parse(raw);
    const result = await LIFECYCLE.run(capability, action, { ...options, surface: 'tui' });
    console.log('\n' + JSON.stringify(result, null, 2));
    await ask('\n  Press Enter to return to dashboard...');
  } catch (error) {
    console.log(`\n  ERROR: ${error.message}`);
    await ask('\n  Press Enter to return to dashboard...');
  } finally {
    rl.close();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdout.write(hideCur);
    inputLocked = false;
    paused = false;
    await render();
  }
}

function setupKeys(quit) {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on('keypress', async (ch, key) => {
    if (!key) return;
    if (inputLocked) return;
    if ((key.ctrl && key.name === 'c') || key.name === 'q') { quit(); return; }
    if (key.name === 'r') { await render(); return; }
    if (key.name === 'p' || key.name === 'space') { paused = !paused; await render(); return; }
    if (key.name === 'a') { await promptLifecycleAction(); return; }
    // F1-F10
    const fKeys = { F1:0, F2:1, F3:2, F4:3, F5:4, F6:5, F7:6, F8:7, F9:8, F10:9 };
    if (fKeys[key.name] !== undefined) { activeTab = fKeys[key.name]; await render(); return; }
    // 1-8 numeric fallback
    if (/^[1-8]$/.test(key.name)) { activeTab = parseInt(key.name, 10) - 1; await render(); return; }
    if (key.name === 'right' || key.name === 'tab') { activeTab = (activeTab + 1) % TABS.length; await render(); return; }
    if (key.name === 'left') { activeTab = (activeTab - 1 + TABS.length) % TABS.length; await render(); return; }
  });
}

function subscribeEvents() {
  const req = http.request(
    { hostname: '127.0.0.1', port: P.orch, path: '/api/events', headers: { Accept: 'text/event-stream' } },
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
  req.on('error', () => {});
  return req;
}

async function main() {
  if (!process.stdout.isTTY) {
    console.error('PURPCLAW TUI needs an interactive terminal. Use `purpclaw status` for headless.');
    process.exit(1);
  }
  process.stdout.write(hideCur + clrScreen);

  const eventReq = subscribeEvents();
  await render();

  const iv = setInterval(async () => { if (!paused) await render(); }, 2000);
  process.stdout.on('resize', () => { if (!paused) render(); });

  setupKeys(() => {
    clearInterval(iv);
    try { eventReq.destroy(); } catch {}
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(showCur + clrScreen);
    process.exit(0);
  });
}

main().catch(e => {
  process.stdout.write(showCur);
  console.error('\nTUI crashed:', e.message);
  process.exit(1);
});
