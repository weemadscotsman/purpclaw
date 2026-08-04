#!/usr/bin/env node
/**
 * scripts/tui-capture.js — Capture TUI render output as text for visual comparison.
 * Run: node scripts/tui-capture.js > tui_capture.txt
 */
'use strict';
const path = require('path');
const fs   = require('fs');

const PURP_DIR = path.resolve(__dirname, '..');

// Minimal env loader
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
  bgPurple: ESC + '[48;5;53m',
};
const col = (c, s) => c + s + C.reset;
const fit = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[mH]/g, '');
const at = (r, c) => ESC + '[' + r + ';' + c + 'H';

let activeTab = 0;
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

const bxTop = W => col(C.magenta, '╭' + '─'.repeat(W - 2) + '╮');
const bxBot = W => col(C.magenta, '╰' + '─'.repeat(W - 2) + '╯');
const bxMid = W => col(C.magenta, '├' + '─'.repeat(W - 2) + '┤');
const bxLine = () => col(C.magenta, '│');

// Strip ANSI and pad to width for display
function renderLine(line) {
  const raw = stripAnsi(line);
  // Remove CSI codes for display
  return line.replace(/\x1b\[[0-9;]*[mH]/g, '').replace(/\x1b\[\?25[hl]/g, '');
}

const W = 140;
const H = 50;
const RN = H - 1;
const R1 = 9;

const out = [];

// Border
out.push(at(1, 1) + bxTop(W));
out.push(at(RN, 1) + bxBot(W));
for (let r = 2; r < RN; r++) {
  out.push(at(r, 1) + bxLine());
  out.push(at(r, W) + bxLine());
}

// ── Header ─────────────────────────────────────────────────────────────────
out.push(at(1, 1) + bxTop(W));

const coreOk = 0, coreTotal = 9;
const coreStatusOk = coreOk === coreTotal;
const statusDot = coreStatusOk ? col(C.green, '●') : (coreOk > coreTotal / 2 ? col(C.yellow, '◐') : col(C.red, '○'));
const agents = '?';
const now = new Date().toLocaleTimeString('en-GB');

const left = '  ' + col(C.magenta + C.bold, 'PURPCLAW') + '  ' + statusDot + '  ' +
             col(C.green, String(coreOk)) + ' ' + col(C.gray, 'UP') + '  ' +
             col(C.white, String(agents)) + ' ' + col(C.gray, 'active') + '  ' +
             col(C.gray, '·') + '  ' +
             col(C.white, '32/32') + ' ' + col(C.gray, 'agents') + '  ' +
             col(C.gray, '·') + '  ' +
             col(C.white, '118') + ' ' + col(C.gray, 'tools');
const right = col(C.magenta + C.bold, 'OMNICOCKPIT') + '  ' + col(C.white, now);
const leftLen = stripAnsi(left).length;
const rightLen = stripAnsi(right).length;
const pad = Math.max(1, W - 2 - leftLen - rightLen);
out.push(at(2, 2) + left + ' '.repeat(pad) + right);

out.push(at(3, 2) + col(C.gray, 'One Mission / Many Lenses') + '  ·  ' + col(C.gray, 'OS v0.3') + '  ·  ' + col(C.green, 'ONLINE'));

let tabBar = '  ';
TABS.forEach((tab, i) => {
  const active = i === activeTab;
  const content = ' ' + tab.key + ':' + tab.label + ' ';
  tabBar += active ? col(C.bgPurple + C.white + C.bold, content) : col(C.gray, content);
});
out.push(at(4, 2) + fit(tabBar, W - 4));

const sectionNames = [
  'Help', 'Mission Control', 'Agent Tower / Swarm', 'OMNI Truth Checks',
  'Memory Spine', 'Self Evolution', 'Awaken Control', 'Services', 'Mochi Chorus',
  'Settings / Sovereign Controls',
];
const sectionTitle = sectionNames[activeTab] || 'Mission Control';
const modeLabel = 'DEGRADED';
const modeColor = C.yellow;
out.push(at(5, 2) + col(C.cyan + C.bold, sectionTitle));
out.push(at(5, W - 1 - modeLabel.length) + col(modeColor, '[' + modeLabel + ']'));
out.push(at(6, 2) + col(C.hotpink, '◈') + '  ' + col(C.white + C.bold, 'MOCHI // COMPANION') + '  ' + col(C.green, '●') + '  ' + col(C.green, 'ONLINE'));
const crumbs = 'MISSION CONTROL  ●  COMMAND ROOM  ●  MOCHI // COMPANION';
const crumbLen = stripAnsi(crumbs).length;
out.push(at(6, Math.max(2, W - 2 - crumbLen)) + col(C.gray, crumbs));
out.push(at(7, 1) + bxMid(W));

// ── Footer ──────────────────────────────────────────────────────────────────
const metrics = [
  [C.gray, 'AGENTS'], [C.green, '27'],
  [C.gray, 'TRUTH SCORE'], [C.green, '93.7%'],
  [C.gray, 'SYSTEM STRESS'], [C.yellow, '18%'],
  [C.gray, 'HEIST LOOT (24H)'], [C.white, '1.24 TB'],
  [C.gray, 'RELIABILITY'], [C.green, '99.986%'],
  [C.gray, 'MEMORY UTILIZATION'], [C.cyan, '62%'],
  [C.gray, 'CHORUS HARMONY'], [C.green, '87%'],
];
let metricStr = '  ';
for (let i = 0; i < metrics.length; i += 2) {
  metricStr += metrics[i][0] + metrics[i][1] + '  ' + metrics[i+1][1] + '    ';
}
out.push(at(RN - 2, 2) + fit(metricStr, W - 4));

const hints = '  ' + col(C.gray, '1-8:tab  ') + col(C.gray, 'arrows:nav  ') +
              col(C.gray, 'r:refresh  ') + col(C.gray, 'p:pause  ') +
              col(C.gray, 'q:quit') + '               ' +
              col(C.cyan, 'PURPCLAW TUI v0.5.0') + '     ' +
              col(C.green, 'Built for Sovereignty.');
out.push(at(RN - 1, 2) + fit(hints, W - 4));

// ── Sidebar ─────────────────────────────────────────────────────────────────
out.push(at(R1, 2) + col(C.magenta + C.bold, '  NAVIGATION'));
out.push(at(R1 + 1, 2) + col(C.gray, '  ' + '─'.repeat(22)));
let r = R1 + 2;
const navItems = [
  { key: 'F1', label: 'Help', active: activeTab === 0 },
  { key: 'F2', label: 'Mission', active: activeTab === 1 },
  { key: 'F3', label: 'Agents', active: activeTab === 2 },
  { key: 'F4', label: 'Omni', active: activeTab === 3 },
  { key: 'F5', label: 'Memory', active: activeTab === 4 },
  { key: 'F6', label: 'Evolution', active: activeTab === 5 },
  { key: 'F7', label: 'Awaken', active: activeTab === 6 },
  { key: 'F8', label: 'Services', active: activeTab === 7 },
  { key: 'F9', label: 'Mochi', active: activeTab === 8 },
  { key: 'F10', label: 'Settings', active: activeTab === 9 },
];
for (const item of navItems) {
  const marker = item.active ? col(C.cyan, '▶') : ' ';
  const keyCol = item.active ? C.white + C.bold : C.gray;
  const lblCol = item.active ? C.white : C.gray;
  out.push(at(r, 2) + col(C.magenta, ' ' + marker) + '  ' + col(keyCol, fit(item.key, 4)) + ' ' + col(lblCol, fit(item.label, 16)));
  r++;
}
out.push(at(r, 2) + col(C.gray, '  ' + '─'.repeat(22)));

// ── Content area (Mission tab — activeTab=0) ──────────────────────────────────
const PW = Math.floor((W - 30) / 2);
const leftC = 28;
const midC = leftC + PW + 4;

let lr = R1;
// AWAKEN CONTROL
out.push(at(lr, leftC) + col(C.cyan + C.bold, 'AWAKEN CONTROL')); lr++;
out.push(at(lr, leftC) + col(C.yellow, 'STATE: STANDBY')); lr += 2;
out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Full system activation.')); lr++;
out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'All guardians to ready.')); lr += 2;
out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Systems purring.')); lr++;
out.push(at(lr, leftC) + col(C.green, '●') + '  ' + col(C.gray, 'Agents hungry.')); lr += 2;
out.push(at(lr, leftC) + col(C.cyan + C.bold, "What's the plan, boss?")); lr += 2;
out.push(at(lr, leftC) + col(C.white, '[T]') + '  ' + col(C.gray, 'Talk to Mochi')); lr += 2;
out.push(at(lr, leftC) + col(C.white + C.bold, '[SPACE]') + '  ' + col(C.green, 'AWAKEN NOW')); lr += 2;
out.push(at(lr, leftC) + col(C.cyan + C.bold, 'OPERATION')); lr++;
out.push(at(lr, leftC) + col(C.white + C.bold, 'PURPLE DAWN')); lr += 2;
out.push(at(lr, leftC) + col(C.cyan + C.bold, 'DIRECTIVE')); lr++;
out.push(at(lr, leftC) + col(C.gray, 'Expand truth. Extract signal.')); lr++;
out.push(at(lr, leftC) + col(C.gray, 'Protect sovereignty.')); lr++;
out.push(at(lr, leftC) + col(C.cyan, 'Focus:') + '  ' + col(C.white, 'Build + Defend + Evolve')); lr += 2;
out.push(at(lr, leftC) + col(C.cyan + C.bold, 'COMPANION CHORUS HARMONY')); lr++;
out.push(at(lr, leftC) + col(C.green + C.bold, '87%')); lr++;
out.push(at(lr, leftC) + col(C.gray, "It's watching."));

// Right column
let mr = R1;
out.push(at(mr, midC) + col(C.cyan + C.bold, 'COGNITIVE CORE')); mr++;
out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.green, 'ACTIVE') + '  ' + col(C.green, 'HIGH INTEGRITY') + '  ' + col(C.gray, 'NOMINAL')); mr++;
out.push(at(mr, midC) + col(C.cyan, '● ACQUIRED') + '  ' + col(C.green, 'EXCELLENT') + '  ' + col(C.gray, 'of Cognitive Spine')); mr += 2;
out.push(at(mr, midC) + col(C.cyan + C.bold, 'SERVICE RADAR')); mr++;
out.push(at(mr, midC) + col(C.green, '0') + '/' + col(C.white, String(coreTotal)) + '  CORE UP'); mr++;
out.push(at(mr, midC) + col(C.yellow, '0') + '/' + col(C.white, '3') + '  OPTIONAL UP'); mr += 2;
out.push(at(mr, midC) + col(C.cyan + C.bold, 'PROVIDERS & MODELS')); mr++;
out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.gray, '3 providers online  +  3 from last hour')); mr += 2;
out.push(at(mr, midC) + col(C.cyan + C.bold, 'ROUTING & ACCESS')); mr++;
out.push(at(mr, midC) + col(C.green, '●') + '  ' + col(C.gray, '12 services')); mr += 2;
out.push(at(mr, midC) + col(C.cyan + C.bold, 'CORE SERVICES')); mr++;
const coreKeys = ['unified-api', 'agent-tower', 'eventbus', 'state-store', 'orchestrator', 'gatekeeper'];
for (const k of coreKeys) {
  out.push(at(mr, midC) + col(C.red, '○') + '  ' + col(C.gray, fit(k, 16)) + '  ' + col(C.gray, ':?')); mr++;
}
out.push(at(mr, midC) + col(C.gray, 'OPTIONAL')); mr++;
const optKeys = ['pool', 'metrics', 'vision'];
for (const k of optKeys) {
  out.push(at(mr, midC) + col(C.gray, '○') + '  ' + col(C.gray, fit(k, 16)) + '  ' + col(C.gray, ':?')); mr++;
}

// Print all output
for (const line of out) {
  process.stdout.write(renderLine(line) + '\n');
}
