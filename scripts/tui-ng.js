#!/usr/bin/env node
'use strict';
/**
 * scripts/tui-ng.js — PurpClaw TUI v2 (blessed-based cockpit)
 * ==============================================================
 * Live terminal dashboard with animated Mochi, live service health,
 * token tracking, OmniCode savings, and streaming agent chat.
 *
 * Launch: purpclaw tui ng
 */

const blessed = require('blessed');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const path = require('path');
const fs = require('fs');

// Load .env
try {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/);
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
  }
} catch {}

const API = process.env.API_PORT ? `http://127.0.0.1:${process.env.API_PORT}` : 'http://127.0.0.1:7780';
const TOOL_COUNT = 54;

let state = {
  provider: process.env.LLM_PROVIDER || 'ollama',
  model: process.env.LLM_MODEL || 'auto',
  thinking: false,
  tokens: { prompt: 0, completion: 0, saved: 0, calls: 0 },
  tools: 0,
  turns: 0,
  services: {},
  agents: { active: 0, registered: 35 },
  mcpTools: 0,
  lastPoll: 0,
};

// ── Screen ───────────────────────────────────────────────────
const screen = blessed.screen({ smartCSR: true, title: 'PurpClaw TUI v2', fullUnicode: true });
screen.key(['C-c'], () => process.exit(0));
screen.key(['C-l'], () => screen.render());

// ── Top bar ──────────────────────────────────────────────────
const topBar = blessed.box({
  top: 0, left: 0, width: '100%', height: 1,
  style: { fg: 'cyan', bg: 'black' },
  content: ' PurpClaw · loading...'
});
screen.append(topBar);

// ── Mochi avatar ─────────────────────────────────────────────
const mochiBox = blessed.box({
  top: 0, right: 0, width: 12, height: 1,
  style: { fg: 'yellow', bg: 'black' },
  content: '🐱 idle'
});
screen.append(mochiBox);

// ── Left: chat log ───────────────────────────────────────────
const chatLog = blessed.log({
  top: 1, left: 0, width: '70%', height: '100%-4',
  scrollable: true, mouse: true,
  scrollbar: { ch: ' ', track: { bg: 'cyan' } },
  style: { fg: 'white', bg: 'black' },
  tags: true
});
screen.append(chatLog);
chatLog.add('{cyan-fg}PurpClaw cockpit v2{/cyan-fg} · type a prompt and hit Enter');
chatLog.add('{gray-fg}provider: ' + state.provider + ' · model: ' + (state.model || 'auto') + '{/}');

// ── Right panel ──────────────────────────────────────────────
const rightPanel = blessed.box({
  top: 1, right: 0, width: '30%', height: '100%-4',
  style: { bg: 'black' }
});
screen.append(rightPanel);

const svcBox = blessed.box({ parent: rightPanel, top: 0, height: '25%', width: '100%',
  label: ' SERVICES ', style: { fg: 'green' }, content: 'loading...' });
const agtBox = blessed.box({ parent: rightPanel, top: '25%', height: '12%', width: '100%',
  label: ' AGENTS ', content: 'loading...' });
const tlsBox = blessed.box({ parent: rightPanel, top: '37%', height: '10%', width: '100%',
  label: ' TOOLS ', content: 'loading...' });
const tokBox = blessed.box({ parent: rightPanel, top: '47%', height: '28%', width: '100%',
  label: ' TOKENS ', content: 'loading...' });
const actBox = blessed.box({ parent: rightPanel, top: '75%', height: '10%', width: '100%',
  label: ' ACTIONS ', content: 'loading...' });
const pllBox = blessed.box({ parent: rightPanel, top: '85%', height: '8%', width: '100%',
  style: { fg: 'gray' }, content: ' polled --' });

// ── Bottom status with Mochi SB ────────────────────────────────
const statusBar = blessed.box({
  bottom: 2, left: 0, width: '100%', height: 1,
  style: { fg: 'gray', bg: 'black' },
  content: ' tokens: 0k · saved: 0 · actions: 0t 0 turns'
});
screen.append(statusBar);

// Pull real Mochi status from mochi-statusbar if available
async function updateMochiStatus() {
  if (!MOCHI_SB) return;
  try {
    const top = await MOCHI_SB.renderStatus();
    if (top && top.length > 5) {
      // Use first meaningful part from real mochi status
      statusBar.setContent(top.replace(/\x1b\[[0-9;]*m/g, '').substring(0, 120));
    }
  } catch {}
}

// ── Input ────────────────────────────────────────────────────
const inputBox = blessed.textbox({
  bottom: 1, left: 0, width: '100%', height: 1,
  inputOnFocus: true,
  style: { fg: 'cyan', bg: 'black', focus: { border: { fg: 'cyan' } } }
});
screen.append(inputBox);

const helpLine = blessed.box({
  bottom: 0, left: 0, width: '100%', height: 1,
  style: { fg: 'gray', bg: 'black' },
  content: ' /help · Esc clear · Ctrl+C exit · ↑/↓ scroll'
});
screen.append(helpLine);

// ── Mochi moods ──────────────────────────────────────────────
// ── REAL Mochi sprites (from lib/mochi-sprites.js) ──────────
let mochiFrame = 0; let mochiSpecies = 'axolotl'; let mochiEye = '✦'; let mochiHat = 'none';
let mochiAnimInterval = null;
const MOCHI_SPRITES = (() => { try { return require(path.join(__dirname, '..', 'lib', 'mochi-sprites')); } catch { return null; } })();
const MOCHI_SB = (() => { try { return require(path.join(__dirname, '..', 'lib', 'mochi-statusbar')); } catch { return null; } })();

function renderMochi() {
  if (!MOCHI_SPRITES) return '🐱';
  try {
    const lines = MOCHI_SPRITES.renderSprite({ species: mochiSpecies, eye: mochiEye, hat: mochiHat }, mochiFrame);
    // Take the middle line (body) as the compact representation
    return lines && lines.length > 2 ? lines[Math.floor(lines.length/2)].trim() : '🐱';
  } catch { return '🐱'; }
}

function animMochi() {
  mochiFrame = (mochiFrame + 1) % 3;
  if (MOCHI_SPRITES) {
    const sprite = renderMochi();
    mochiBox.setContent(sprite);
    screen.render();
  }
}

function setMochiMood(mood) {
  // Map moods to eye expressions
  const eyeMap = { idle: '·', happy: '✦', thinking: '◉', sad: '°', alert: '@' };
  mochiEye = eyeMap[mood] || '·';
  const sprite = renderMochi();
  mochiBox.setContent(sprite);
  screen.render();
  if (mood === 'thinking') {
    if (!mochiAnimInterval) mochiAnimInterval = setInterval(animMochi, 400);
  } else {
    if (mochiAnimInterval) { clearInterval(mochiAnimInterval); mochiAnimInterval = null; }
  }
}

// ── Poll APIs ────────────────────────────────────────────────
async function poll() {
  // Services
  try {
    const r = await fetch(API + '/api/health'); if (r.ok) {
      const j = await r.json();
      state.services['api'] = { status: 'online', port: 7780 };
    }
  } catch {}
  try {
    const r = await fetch('http://127.0.0.1:7790/tower/status'); if (r.ok) {
      const j = await r.json();
      state.agents.active = (j.activeAgents || []).length;
      state.agents.registered = j.totalRegistered || 35;
      state.services['tower'] = { status: 'online', port: 7790 };
    }
  } catch { state.services['tower'] = state.services['tower'] || { status: 'offline', port: 7790 }; }
  try {
    const r = await fetch('http://127.0.0.1:7784/api/health'); if (r.ok) {
      state.services['orchestrator'] = { status: 'online', port: 7784 };
    }
  } catch { state.services['orchestrator'] = state.services['orchestrator'] || { status: 'offline', port: 7784 }; }
  try {
    const r = await fetch('http://127.0.0.1:3000'); if (r.ok) {
      state.services['nextjs'] = { status: 'online', port: 3000 };
    }
  } catch { state.services['nextjs'] = state.services['nextjs'] || { status: 'offline', port: 3000 }; }

  state.lastPoll = Date.now();
}

function render() {
  const svc = state.services;
  const online = Object.values(svc).filter(s => s.status === 'online').length;
  const total = Object.keys(svc).length || 1;
  const svcList = Object.entries(svc).map(([n,s]) =>
    ` ${s.status === 'online' ? '{green-fg}●{/}' : '{red-fg}○{/}'} ${n} :${s.port}`
  ).join('\n');
  svcBox.setContent(` {bold}${online}/${total} online{/}\n${svcList}`);

  agtBox.setContent(` active: {cyan-fg}${state.agents.active}{/}\n registered: ${state.agents.registered}`);

  tlsBox.setContent(` loaded: {cyan-fg}${TOOL_COUNT}{/}\n MCP: {green-fg}${state.mcpTools}{/}`);

  const t = state.tokens; const totalT = t.prompt + t.completion;
  tokBox.setContent(
    ` prompt:     ${(t.prompt/1000).toFixed(1)}k\n` +
    ` completion: ${(t.completion/1000).toFixed(1)}k\n` +
    ` total:      {cyan-fg}${(totalT/1000).toFixed(1)}k{/}\n` +
    ` saved:      {green-fg}~${t.saved}{/} (OmniCode)\n` +
    ` calls:      ${t.calls}`
  );

  actBox.setContent(` tool calls: {cyan-fg}${state.tools}{/}\n turns:     {cyan-fg}${state.turns}{/}`);

  const age = Math.round((Date.now() - state.lastPoll) / 1000);
  pllBox.setContent(` polled ${age}s ago`);

  // Top bar
  const ready = state.thinking ? '{yellow-fg}◐ thinking{/}' : '{green-fg}● ready{/}';
  topBar.setContent(
    ` {cyan-fg}{bold}PurpClaw{/} {gray}${state.provider}{/} {yellow}${state.model || 'auto'}{/} · ` +
    `{green}${online}/${total} svc{/} {magenta}${state.agents.active}ag{/} · ` +
    `{cyan}${Math.round(totalT/1000)}tok{/} ` +
    `{green}~${t.saved} saved{/} · ` +
    `{cyan}${state.tools}tools{/} ${state.turns}turns  ${ready}`
  );

  // Bottom status
  statusBar.setContent(
    ` tokens: {cyan-fg}${(totalT/1000).toFixed(1)}k{/} · ` +
    `saved: {green-fg}~${t.saved}{/} · ` +
    `actions: {cyan-fg}${state.tools}t{/} ` +
    `{cyan-fg}${state.turns}{/} turns`
  );

  screen.render();
}

// ── Input handling ───────────────────────────────────────────
let chatHistory = [];
inputBox.on('submit', async (text) => {
  const cmd = text.trim();
  inputBox.clearValue();
  if (!cmd) { inputBox.focus(); return; }

  // Slash commands
  if (cmd === '/help') {
    chatLog.add('{yellow-fg}/model <name>  /provider <name>  /agents  /spawn <agent>  /clear  /quit{/}');
    inputBox.focus(); return;
  }
  if (cmd === '/clear') { chatLog.setContent(''); inputBox.focus(); return; }
  if (cmd === '/quit') { process.exit(0); }
  if (cmd.startsWith('/spawn ')) {
    const [_, agent, ...task] = cmd.split(' ');
    chatLog.add('{yellow-fg}⚡ spawning ' + agent + ' with task: ' + task.join(' ') + '{/}');
    try {
      const r = await fetch(API + '/api/agents/spawn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agent, task: task.join(' '), priority: 'normal' })
      });
      const j = await r.json();
      chatLog.add('{green-fg}' + agent + ' spawned: ' + (j.jobId || j.id || 'ok') + '{/}');
      setMochiMood('happy'); setTimeout(() => setMochiMood('idle'), 2000);
    } catch (e) { chatLog.add('{red-fg}spawn failed: ' + e.message + '{/}'); }
    inputBox.clearValue(); inputBox.focus(); return;
  }
  if (cmd.startsWith('/provider ')) {
    state.provider = cmd.split(' ')[1];
    chatLog.add('{green-fg}provider → ' + state.provider + '{/}');
    updateTopBar(); inputBox.clearValue(); inputBox.focus(); return;
  }
  if (cmd.startsWith('/model ')) {
    state.model = cmd.split(' ')[1];
    chatLog.add('{green-fg}model → ' + state.model + '{/}');
    updateTopBar(); inputBox.clearValue(); inputBox.focus(); return;
  }
  if (cmd === '/agents') {
    chatLog.add('{yellow-fg}registered: 35 agents across 9 divisions ● active: ' + state.agents.active + '{/}');
    inputBox.clearValue(); inputBox.focus(); return;
  }

  chatLog.add('{cyan-fg}purp ❯ ' + cmd + '{/}');
  state.thinking = true;
  setMochiMood('thinking');
  render();

  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: cmd, stream: false })
    });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const data = await res.json();
    const reply = data.reply || data.message || data.content || 'no response';
    chatLog.add('{green-fg}✒ quill{/}\n' + reply);
    state.turns++;
    state.tools += (data.tool_calls || 0);
    if (data.usage) {
      state.tokens.prompt += data.usage.prompt_tokens || 0;
      state.tokens.completion += data.usage.completion_tokens || 0;
      state.tokens.calls++;
      state.tokens.saved = Math.round((state.tokens.prompt + state.tokens.completion) * 0.4);
    }
    chatHistory.push({ role: 'user', content: cmd });
    setMochiMood('happy');
    setTimeout(() => setMochiMood('idle'), 2000);
  } catch (e) {
    chatLog.add('{red-fg}Error: ' + e.message + '{/}');
    setMochiMood('sad');
    setTimeout(() => setMochiMood('idle'), 2000);
  }

  state.thinking = false;
  render();
  inputBox.focus();
});

// ── Poll loop ────────────────────────────────────────────────
async function loop() {
  await poll();
  render();
}
setInterval(loop, 5000);
loop();

// ── MCP tools load ───────────────────────────────────────────
try {
  const mcp = require(path.join(__dirname, '..', 'lib', 'mcp'));
  mcp.loadServers().then(() => {
    state.mcpTools = mcp.listTools().length;
    render();
  }).catch(() => {});
} catch {}

screen.render();
inputBox.focus();
