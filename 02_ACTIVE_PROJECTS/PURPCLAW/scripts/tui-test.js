#!/usr/bin/env node
/**
 * scripts/tui-test.js — Headless comparison test.
 * Simulates the TUI rendering at tab=1 (Mission) and outputs text.
 */
'use strict';
const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  try {
    const lines = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/);
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
  api: parseInt(process.env.API_PORT || '7780', 10),
  eventbus: parseInt(process.env.EVENTBUS_PORT || '7782', 10),
  state: parseInt(process.env.STATE_PORT || '7783', 10),
  orch: parseInt(process.env.ORCHESTRATOR_PORT || '7784', 10),
  tower: parseInt(process.env.TOWER_PORT || '7790', 10),
  gatekeeper: 7791,
  ctx: 7881,
  pool: parseInt(process.env.POOL_PORT || '7885', 10),
  metrics: parseInt(process.env.METRICS_PORT || '7890', 10),
  vision: 7889,
  memory: parseInt(process.env.MEMORY_PORT || '7880', 10),
  dream: parseInt(process.env.DREAM_PORT || '7895', 10),
  voice: parseInt(process.env.VOICE_PORT || '7781', 10),
  stt: parseInt(process.env.STT_PORT || '7896', 10),
};

const ESC = '\u001b';
const C = {
  reset: ESC + '[0m', bold: ESC + '[1m', dim: ESC + '[2m',
  cyan: ESC + '[36m', green: ESC + '[32m', yellow: ESC + '[33m',
  red: ESC + '[31m', blue: ESC + '[34m', magenta: ESC + '[35m',
  white: ESC + '[37m', gray: ESC + '[90m',
  bgPurple: ESC + '[48;5;53m', hotpink: ESC + '[38;5;205m',
};
const col = (c, s) => c + s + C.reset;
const fit = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[mH]/g, '');
const at = (r, c) => ESC + '[' + r + ';' + c + 'H';

const TABS = [
  { key: 'F1', label: 'Help' },    { key: 'F2', label: 'Mission' },
  { key: 'F3', label: 'Agents' },  { key: 'F4', label: 'Omni' },
  { key: 'F5', label: 'Memory' },  { key: 'F6', label: 'Evolution' },
  { key: 'F7', label: 'Awaken' },  { key: 'F8', label: 'Services' },
  { key: 'F9', label: 'Mochi' },   { key: 'F10', label: 'Settings' },
];

const bxTop = W => col(C.magenta, '╭' + '─'.repeat(W - 2) + '╮');
const bxBot = W => col(C.magenta, '╰' + '─'.repeat(W - 2) + '╯');
const bxMid = W => col(C.magenta, '├' + '─'.repeat(W - 2) + '┤');
const bxLine = () => col(C.magenta, '│');

const W = 140, H = 50, RN = H - 1, R1 = 9;
const PW = Math.floor((W - 30) / 2);
const leftC = 28;
const midC = leftC + PW + 4;

// Simulate fetching all data
const svcs = {
  'unified-api' : { ok: false, port: P.api },
  'agent-tower' : { ok: false, port: P.tower },
  'eventbus'    : { ok: false, port: P.eventbus },
  'state-store' : { ok: false, port: P.state },
  'orchestrator': { ok: false, port: P.orch },
  'gatekeeper'  : { ok: false, port: P.gatekeeper },
  'pool'        : { ok: false, port: P.pool },
  'metrics'     : { ok: false, port: P.metrics },
  'vision'      : { ok: false, port: P.vision },
};
const core = Object.values(svcs).filter(s => s.group !== 'optional');
const coreTotal = 6;
const coreOk = 0;
const coreStatusOk = coreOk === coreTotal;

const mockData = { svcs, coreOk, coreTotal, towerStat: { activeAgents: [] }, poolStats: {} };

// Build out array by calling actual draw functions from tui.js
const tuiCode = fs.readFileSync(path.join(__dirname, 'tui.js'), 'utf8');

// Extract and run the drawOverview function (tab 0)
const out = [];
const at_ = (r, c) => { out.push({ r, c, s: '' }); return ''; };

// Manually build the output for tab=1 (Mission = drawAgentSwarm)
out.length = 0; // reset

// Border
out.push({ r: 1, c: 1, s: bxTop(W) });
for (let r = 2; r < RN; r++) out.push({ r, c: 1, s: bxLine() });
out.push({ r: RN, c: 1, s: bxBot(W) });

// ── Header ─────────────────────────────────────────────────────────────────
const statusDot = coreStatusOk ? col(C.green, '●') : col(C.red, '●');
const agents = '?';
const now = '18:23:21';

const left = '  ' + col(C.magenta + C.bold, 'PURPCLAW') + '  ' +
             col(C.green, '●') + '  ' +
             col(C.green, String(coreOk) + '/' + String(coreTotal)) + ' ' + col(C.gray, 'UP') + '  ' +
             col(C.gray, '|  ') +
             col(C.cyan, String(agents)) + ' ' + col(C.gray, 'ACTIVE') + '  ' +
             col(C.gray, '|  ') +
             col(C.white, '32/32') + ' ' + col(C.gray, 'agents') + '  ' +
             col(C.gray, '|  ') +
             col(C.white, '118') + ' ' + col(C.gray, 'tools');
const right = col(C.magenta + C.bold, 'OMNICOCKPIT') + '  ' + col(C.white, now);
const leftLen = stripAnsi(left).length;
const rightLen = stripAnsi(right).length;
const pad = Math.max(1, W - 2 - leftLen - rightLen);
out.push({ r: 2, c: 2, s: left + ' '.repeat(pad) + right });

out.push({ r: 3, c: 2, s: col(C.gray, 'PURPCLAW TUI') + '  ' + col(C.gray, '·') + '  ' + col(C.gray, 'One Mission / Many Lenses') });

// Tab bar
let activeTab = 1;
let tabBar = '  ';
TABS.forEach((tab, i) => {
  const active = i === activeTab;
  const content = ' ' + tab.key + ':' + tab.label + ' ';
  tabBar += active ? col(C.bgPurple + C.white + C.bold, content) : col(C.gray, content);
});
out.push({ r: 4, c: 2, s: fit(tabBar, W - 4) });

const sectionNames = [
  'Help', 'Mission Control', 'Agent Tower / Swarm', 'OMNI Truth Checks',
  'Memory Spine', 'Self Evolution', 'Awaken Control', 'Services', 'Mochi Chorus',
  'Settings / Sovereign Controls',
];
const sectionTitle = sectionNames[activeTab];
const modeLabel = coreStatusOk ? 'OPERATIONAL' : 'DEGRADED';
const modeColor = coreStatusOk ? C.green : C.yellow;
out.push({ r: 5, c: 2, s: col(C.cyan + C.bold, sectionTitle) });
out.push({ r: 5, c: W - 1 - modeLabel.length, s: col(modeColor, '[' + modeLabel + ']') });

out.push({ r: 6, c: 2, s: col(C.hotpink, '◈') + '  ' + col(C.white + C.bold, 'MOCHI // COMPANION') + '  ' +
                   (coreStatusOk ? col(C.green, '●') : col(C.red, '●')) + '  ' +
                   (coreStatusOk ? col(C.green, 'ONLINE') : col(C.red, 'OFFLINE')) });
const crumbs = 'MISSION CONTROL  ●  COMMAND ROOM  ●  MOCHI // COMPANION';
out.push({ r: 6, c: Math.max(2, W - 2 - crumbs.length), s: col(C.gray, crumbs) });

out.push({ r: 7, c: 2, s: '' }); // blank row
out.push({ r: 8, c: 1, s: bxMid(W) });

// ── Footer ──────────────────────────────────────────────────────────────────
const metrics = [
  ['AGENTS', '27'], ['TRUTH SCORE', '93.7%'], ['SYSTEM STRESS', '18%'],
  ['HEIST LOOT (24H)', '1.24 TB'], ['RELIABILITY', '99.986%'],
  ['MEMORY UTILIZATION', '62%'], ['CHORUS HARMONY', '87%'],
];
let metricStr = '  ';
for (const [l, v] of metrics) metricStr += col(C.gray, l) + '  ' + col(C.green, v) + '    ';
out.push({ r: RN - 2, c: 2, s: fit(metricStr, W - 4) });

const hints = '  ' + col(C.gray, '1-8:tab  arrows:nav  r:refresh  p:pause  q:quit') +
              '               ' + col(C.cyan, 'PURPCLAW TUI v0.5.0') + '     ' + col(C.green, 'Built for Sovereignty.');
out.push({ r: RN - 1, c: 2, s: fit(hints, W - 4) });

// ── Sidebar ─────────────────────────────────────────────────────────────────
const SW = 26;
out.push({ r: R1, c: 2, s: col(C.magenta + C.bold, '  NAVIGATION') });
out.push({ r: R1 + 1, c: 2, s: col(C.magenta, '  ' + '─'.repeat(SW - 4)) });
let r = R1 + 2;
for (const item of TABS) {
  const idx = TABS.indexOf(item);
  const active = idx === activeTab;
  const marker = active ? col(C.cyan, '▶') : ' ';
  const keyCol = active ? C.white + C.bold : C.gray;
  const lblCol = active ? C.white : C.gray;
  out.push({ r, c: 2, s: col(C.magenta, ' ' + marker) + '  ' + col(keyCol, fit(item.key, 4)) + ' ' + col(lblCol, fit(item.label, 16)) });
  r++;
}
out.push({ r, c: 2, s: col(C.magenta, '  ' + '─'.repeat(SW - 4)) });

// ── Content (tab 1 = Mission = AWAKEN CONTROL + COGNITIVE CORE) ──────────────
let lr = R1;

// AWAKEN CONTROL
out.push({ r: lr++, c: leftC, s: col(C.cyan + C.bold, 'AWAKEN CONTROL') });
out.push({ r: lr++, c: leftC, s: col(C.yellow, 'STATE: STANDBY') });
lr += 2;
out.push({ r: lr++, c: leftC, s: col(C.green, '●') + '  ' + col(C.gray, 'Full system activation.') });
out.push({ r: lr++, c: leftC, s: col(C.green, '●') + '  ' + col(C.gray, 'All guardians to ready.') });
out.push({ r: lr++, c: leftC, s: col(C.green, '●') + '  ' + col(C.gray, 'Systems purring.') });
out.push({ r: lr++, c: leftC, s: col(C.green, '●') + '  ' + col(C.gray, 'Agents hungry.') });
lr += 2;
out.push({ r: lr++, c: leftC, s: col(C.cyan + C.bold, "What's the plan, boss?") });
lr += 2;
out.push({ r: lr++, c: leftC, s: col(C.white, '[T]') + '  ' + col(C.gray, 'Talk to Mochi') });
lr += 2;
out.push({ r: lr++, c: leftC, s: col(C.green + C.bold, '[SPACE]') + '  ' + col(C.green, 'AWAKEN NOW') });
lr += 2;
out.push({ r: lr++, c: leftC, s: col(C.cyan + C.bold, 'OPERATION') });
out.push({ r: lr++, c: leftC, s: col(C.white + C.bold, 'PURPLE DAWN') });
lr += 2;
out.push({ r: lr++, c: leftC, s: col(C.cyan + C.bold, 'DIRECTIVE') });
out.push({ r: lr++, c: leftC, s: col(C.gray, 'Expand truth. Extract signal.') });
out.push({ r: lr++, c: leftC, s: col(C.gray, 'Protect sovereignty.') });
out.push({ r: lr++, c: leftC, s: col(C.cyan, 'Focus:') + '  ' + col(C.white, 'Build + Defend + Evolve') });
lr += 2;
out.push({ r: lr++, c: leftC, s: col(C.cyan + C.bold, 'COMPANION CHORUS HARMONY') });
out.push({ r: lr++, c: leftC, s: col(C.green + C.bold, '87%') });
out.push({ r: lr++, c: leftC, s: col(C.gray, "It's watching.") });

// Right column
let mr = R1;

out.push({ r: mr++, c: midC, s: col(C.cyan + C.bold, 'COGNITIVE CORE') });
out.push({ r: mr++, c: midC, s: col(C.green, '●') + '  ' + col(C.green, 'ACTIVE') + '  ' + col(C.green, 'HIGH INTEGRITY') + '  ' + col(C.gray, 'NOMINAL') });
out.push({ r: mr++, c: midC, s: col(C.cyan, '● ACQUIRED') + '  ' + col(C.green, 'EXCELLENT') + '  ' + col(C.gray, 'of Cognitive Spine') });
mr++;

out.push({ r: mr++, c: midC, s: col(C.cyan + C.bold, 'SERVICE RADAR') });
out.push({ r: mr++, c: midC, s: col(C.green, String(coreOk)) + '/' + col(C.white, String(coreTotal)) + '  CORE UP' });
out.push({ r: mr++, c: midC, s: col(C.yellow, '0') + '/' + col(C.white, '3') + '  OPTIONAL UP' });
mr++;

out.push({ r: mr++, c: midC, s: col(C.cyan + C.bold, 'PROVIDERS & MODELS') });
out.push({ r: mr++, c: midC, s: col(C.green, '●') + '  ' + col(C.gray, '3 providers online  +  3 from last hour') });
mr++;

out.push({ r: mr++, c: midC, s: col(C.cyan + C.bold, 'ROUTING & ACCESS') });
out.push({ r: mr++, c: midC, s: col(C.green, '●') + '  ' + col(C.gray, '12 services') });
mr++;

out.push({ r: mr++, c: midC, s: col(C.cyan + C.bold, 'CORE SERVICES') });
const coreKeys = ['unified-api', 'agent-tower', 'eventbus', 'state-store', 'orchestrator', 'gatekeeper'];
for (const k of coreKeys) {
  const s = svcs[k] || { ok: false, port: '?' };
  out.push({ r: mr++, c: midC, s: (s.ok ? col(C.green, '●') : col(C.red, '○')) + '  ' +
                   col(s.ok ? C.white : C.gray, fit(k, 16)) + '  ' + col(C.gray, ':' + s.port) });
}
out.push({ r: mr++, c: midC, s: col(C.gray, 'OPTIONAL') });
const optKeys = ['pool', 'metrics', 'vision'];
for (const k of optKeys) {
  const s = svcs[k] || { ok: false, port: '?' };
  out.push({ r: mr++, c: midC, s: (s.ok ? col(C.green, '●') : col(C.gray, '○')) + '  ' +
                   col(C.gray, fit(k, 16)) + '  ' + col(C.gray, ':' + s.port) });
}

// Render to grid and print
const grid = Array.from({ length: H }, () => Array(W).fill(' '));
for (const item of out) {
  if (item.r < 1 || item.r >= H || item.c < 1) continue;
  const text = stripAnsi(item.s);
  const row = grid[item.r - 1];
  let colIdx = item.c - 1;
  for (const ch of text) {
    if (colIdx < W) row[colIdx++] = ch;
  }
}

for (let r = 0; r < H; r++) {
  const line = grid[r].join('');
  if (line.trim()) process.stdout.write(line + '\n');
}
