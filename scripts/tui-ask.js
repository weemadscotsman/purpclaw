#!/usr/bin/env node
'use strict';
/**
 * scripts/tui-ask.js — PurpClaw Terminal UI (unified cockpit + chat)
 * =====================================================================
 * Full-screen TUI: chat with the agent + live system status panels.
 * No external deps. Pure ANSI. One window, everything visible.
 *
 * Launch:  purpclaw tui ask
 *
 * Layout (top to bottom):
 *   1. Status bar     (provider · model · services online · agents active)
 *   2a. Chat log      (user prompts, agent text, tool calls/results) [70%]
 *   2b. Info panel    (services, agents, events, tools) [30% side-by-side]
 *   3. Input box      (Enter=submit, Esc=clear, Ctrl+C=exit)
 *   4. Help bar       (shortcuts)
 *
 * Keybindings:
 *   Enter          Submit prompt
 *   Esc            Clear chat history
 *   Ctrl+L         Redraw screen
 *   Ctrl+C         Exit
 *   Up/Down        Scroll chat log
 *   /              Slash command
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

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

const PURP_DIR  = path.resolve(__dirname, '..');
const API_PORT  = process.env.API_PORT || 7780;

// ── ANSI helpers ────────────────────────────────────────────────────
const ESC = '\x1b';
const CSI = (n) => `${ESC}[${n}`;
const CLEAR      = CSI('2J');
const CLEAR_LINE = CSI('2K');
const CLEAR_EOL  = CSI('0K');
const HIDE_CURSOR = CSI('?25l');
const SHOW_CURSOR = CSI('?25h');
const ALT_SCREEN  = CSI('?1049h');
const EXIT_ALT    = CSI('?1049l');
const HOME = CSI('H');
const POS = (r, c) => CSI(`${r};${c}H`);
const RESET = CSI('0m');
const BOLD  = CSI('1m');
const DIM   = CSI('2m');
const REVERSE = CSI('7m');

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
const visibleLen = (s) => stripAnsi(s).length;

// ── Color helpers (inline ANSI — no globals) ─────────────────────────
const FG = (code) => `\x1b[${code}m`;
const BG = (code) => `\x1b[${code}m`;
const CYAN   = FG(36);  const GREEN  = FG(32);  const YELLOW = FG(33);
const RED    = FG(31);  const MAGENTA= FG(35);  const BLUE   = FG(34);
const GRAY   = FG(90);  const WHITE  = FG(97);  const CRESET = RESET;
const C = { cyan: CYAN, green: GREEN, yellow: YELLOW, red: RED, magenta: MAGENTA, blue: BLUE, gray: GRAY, white: WHITE, reset: CRESET, bold: BOLD, dim: DIM };

// ── State ────────────────────────────────────────────────────────────
const state = {
  provider : process.env.LLM_PROVIDER || 'ollama',
  model    : process.env.LLM_MODEL    || null,
  history  : [],
  messages : [],
  input    : '',
  scroll   : 0,
  width    : 80,
  height   : 24,
  busy     : false,
  exit     : false,
  // Live status (polled)
  services : { online: 0, total: 0, names: [] },
  agents   : { active: 0, registered: 0 },
  events   : [],
  toolCount: 0,
  lastPoll : 0,
};

// ── Live status poller ───────────────────────────────────────────────
function pollStatus() {
  try {
    // PM2 services
    const pm2 = execSync('pm2 jlist 2>nul', { timeout: 3000, windowsHide: true, stdio: ['ignore','pipe','pipe'] }).toString();
    try {
      const list = JSON.parse(pm2);
      state.services.online = list.filter(s => s.pm2_env?.status === 'online').length;
      state.services.total  = list.length;
      state.services.names  = list.map(s => s.name).filter(Boolean);
    } catch {}
  } catch {}

  try {
    // Agent tower
    const http = require('http');
    const r = new Promise(res => {
      http.get(`http://127.0.0.1:${API_PORT}/tower/status`, { timeout: 2000 }, resp => {
        let d = ''; resp.on('data', c => d += c);
        resp.on('end', () => {
          try { const j = JSON.parse(d); state.agents.active = j.activeAgents?.length || 0; state.agents.registered = j.registeredAgents?.length || 0; } catch {}
          res();
        });
      }).on('error', () => res());
    });
    setTimeout(() => rl, 2000);
  } catch {}

  state.lastPoll = Date.now();
}

// ── TTY setup ────────────────────────────────────────────────────────
if (!process.stdin.isTTY) {
  console.error('tui-ask requires a TTY. Try: purpclaw ask "..." instead.');
  process.exit(2);
}
process.stdout.write(ALT_SCREEN + HIDE_CURSOR);
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', onKey);
process.stdout.on('resize', onResize);
onResize();
pollStatus();
setInterval(pollStatus, 5000);

function onResize() {
  state.width  = process.stdout.columns || 80;
  state.height = process.stdout.rows    || 24;
  redraw();
}

// ── Rendering ──────────────────────────────────────────────────────

function renderStatusBar() {
  const svcColor = state.services.online > 0 ? C.green : C.red;
  const p = `${C.cyan}${BOLD}purpclaw${CRESET} ${C.dim}·${CRESET} ${C.yellow}${state.provider}${CRESET}`;
  const m = state.model ? `${C.yellow}${state.model}${CRESET}` : `auto`;
  const s = `${svcColor}${state.services.online}/${state.services.total} services${CRESET}`;
  const a = `${C.magenta}${state.agents.active} active · ${state.agents.registered} registered${CRESET}`;
  const t = `${C.blue}${state.toolCount} tools${CRESET}`;
  const left = `${p}  ${C.dim}·${CRESET}  model: ${m}  ${C.dim}·${CRESET}  ${s}  ${C.dim}·${CRESET}  ${a}  ${C.dim}·${CRESET}  ${t}`;
  const right = state.busy ? `${C.yellow}◐ thinking…${CRESET}` : `${C.green}● ready${CRESET}`;
  const pad = Math.max(1, state.width - visibleLen(left) - visibleLen(right) - 2);
  return CLEAR_LINE + ' ' + left + ' '.repeat(pad) + right + ' ';
}

function wrapText(text, width) {
  const result = [];
  for (const rawLine of text.split('\n')) {
    let cur = '', curLen = 0;
    const tokens = rawLine.split(/(\s+)/);
    for (const tok of tokens) {
      const tlen = visibleLen(tok);
      if (curLen + tlen > width - 1 && cur) { result.push(cur); cur = tok.trimStart(); curLen = visibleLen(cur); }
      else { cur += tok; curLen += tlen; }
    }
    if (cur || result.length === 0) result.push(cur);
  }
  return result;
}

function renderChatLines() {
  const lines = [];
  for (const msg of state.messages) {
    if (msg.role === 'user') {
      lines.push(CLEAR_LINE + `${C.cyan}${BOLD}purp ❯${CRESET} ${msg.content}`);
    } else if (msg.role === 'assistant') {
      lines.push(CLEAR_LINE + `${C.green}${BOLD}✒ quill${CRESET} ${C.dim}${msg.meta || ''}${CRESET}`);
      const wrapped = wrapText(msg.content, state.width * 0.7);
      for (const w of wrapped) lines.push('  ' + w);
    } else if (msg.role === 'tool') {
      lines.push(CLEAR_LINE + `${C.magenta}  ⚡ ${msg.tool}${CRESET} ${C.dim}${JSON.stringify(msg.args).slice(0, 60)}${CRESET}`);
    } else if (msg.role === 'tool-result') {
      const ok = msg.ok ? `${C.green}← ok${CRESET}` : `${C.red}← error${CRESET}`;
      const preview = (msg.preview || '').replace(/\n/g, '\\n').slice(0, 80);
      lines.push(CLEAR_LINE + `${C.dim}  ${ok} ${preview}${CRESET}`);
    } else if (msg.role === 'meta') {
      lines.push(CLEAR_LINE + `${C.dim}  ${msg.content}${CRESET}`);
    } else if (msg.role === 'slash') {
      lines.push(CLEAR_LINE + `${C.yellow}${BOLD}  ${msg.content}${CRESET}`);
    }
    lines.push(CLEAR_LINE);
  }
  return lines;
}

function renderInfoPanel(availableHeight) {
  const x = Math.floor(state.width * 0.7);
  const w = state.width - x;
  const lines = [];

  const hdr = (s) => `${C.bold}${C.yellow}${s}${CRESET}`;
  const val = (k, v) => `  ${C.dim}${k}:${CRESET} ${v}`;

  // Services
  lines.push(hdr('── SERVICES ──'));
  lines.push(val('online', `${state.services.online}/${state.services.total}`));
  const svcNames = state.services.names.slice(0, 6);
  for (const n of svcNames) {
    const truncated = n.length > w - 4 ? n.substring(0, w - 7) + '…' : n;
    lines.push(`  ${C.green}●${CRESET} ${truncated}`);
  }
  lines.push('');

  // Agents
  lines.push(hdr('── AGENTS ──'));
  lines.push(val('active', state.agents.active));
  lines.push(val('registered', state.agents.registered));
  lines.push('');

  // Events (last few)
  lines.push(hdr('── RECENT ──'));
  if (state.events.length === 0) {
    lines.push(`  ${C.dim}(none yet)${CRESET}`);
  } else {
    for (const ev of state.events.slice(-3)) {
      const truncated = ev.length > w - 4 ? ev.substring(0, w - 7) + '…' : ev;
      lines.push(`  ${truncated}`);
    }
  }
  lines.push('');

  // Tools
  lines.push(hdr('── TOOLS ──'));
  lines.push(val('loaded', state.toolCount));
  lines.push('');

  // Poll age
  const age = Math.round((Date.now() - state.lastPoll) / 1000);
  lines.push(`${C.dim}  polled ${age}s ago${CRESET}`);

  // Truncate to available height
  return lines.slice(0, availableHeight);
}

function renderInput() {
  const lines = [];
  lines.push(CLEAR_LINE + `${C.dim}${'─'.repeat(Math.floor(state.width * 0.7))}${CRESET}`);
  const prompt = `${C.cyan}${BOLD}❯${CRESET} `;
  const inputText = state.input;
  const before = inputText.slice(0, state.input.length);
  const cursor = inputText.length > 0 ? '' : REVERSE + ' ' + CRESET;
  lines.push(CLEAR_LINE + prompt + before + cursor);
  return lines;
}

function renderHelpBar() {
  const h = `${C.dim}/help${CRESET} cmds  ${C.dim}·${CRESET}  ${C.dim}Esc${CRESET} clear  ${C.dim}·${CRESET}  ${C.dim}Ctrl+C${CRESET} exit  ${C.dim}·${CRESET}  ${C.dim}↑/↓${CRESET} scroll  ${C.dim}·${CRESET}  ${C.dim}Ctrl+L${CRESET} redraw`;
  return CLEAR_LINE + ' ' + h;
}

function redraw() {
  const panelWidth = Math.floor(state.width * 0.3);
  const chatHeight = state.height - 4; // minus status, input, help
  const infoHeight = chatHeight;

  // Chat
  const all = renderChatLines();
  const visible = all.slice(Math.max(0, all.length - chatHeight - state.scroll), all.length - state.scroll);

  // Info panel
  const info = renderInfoPanel(infoHeight);

  let out = HOME;

  // Row 1: Status bar
  out += renderStatusBar() + '\n';

  // Rows 2 to height-3: Chat + Info panel side by side
  const chatCharsPerLine = Math.floor(state.width * 0.7);
  for (let i = 0; i < chatHeight; i++) {
    const chatLine = (visible[i] || CLEAR_LINE).substring(0, chatCharsPerLine);
    const infoLine = (info[i] || CLEAR_LINE);
    // Pad chat line to fill 70% width
    const chatPadded = (chatLine + CLEAR_EOL).substring(0, chatCharsPerLine);
    out += chatPadded + infoLine + CLEAR_EOL + '\n';
  }

  // Input
  const inputLines = renderInput();
  for (const il of inputLines) {
    out += il + '\n';
  }

  // Help bar
  out += renderHelpBar();

  process.stdout.write(out);
}

// ── Input handling ──────────────────────────────────────────────────
function onKey(chunk) {
  if (state.exit) return;
  const key = chunk.toString('utf-8');
  if (key === '\x03') { cleanup(); return; }
  if (key === '\x0c') { process.stdout.write(CLEAR); redraw(); return; }
  if (key === '\x1b') { state.history = []; state.messages = []; state.scroll = 0; redraw(); return; }
  if (key === '\x1b[A') { state.scroll = Math.max(0, state.scroll + 3); redraw(); return; }
  if (key === '\x1b[B') { state.scroll = Math.max(0, state.scroll - 3); redraw(); return; }
  if (key === '\r' || key === '\n') { submitInput(); return; }
  if (key === '\x7f' || key === '\b') { if (state.input.length > 0) state.input = state.input.slice(0, -1); redraw(); return; }
  if (key === '\x15') { state.input = ''; redraw(); return; }
  if (key.length === 1 && key >= ' ' && key <= '~') { state.input += key; redraw(); }
}

async function submitInput() {
  const text = state.input.trim();
  state.input = '';
  if (!text || state.busy) { redraw(); return; }

  // Slash command short-circuit
  try {
    const askModule = require(path.join(PURP_DIR, 'lib', 'commands', 'ask'));
    const m = text.match(/^[\/]?([a-z][a-z0-9_-]*)/);
    if (m && askModule.SLASH_COMMANDS['/' + m[1]]) {
      const cmd = askModule.SLASH_COMMANDS['/' + m[1]];
      const out = await cmd.run(text.slice(m[0].length).trim(), state);
      state.messages.push({ role: 'slash', content: '/' + m[1] + ': ' + (out || '(ok)') });
      redraw();
      return;
    }
  } catch {}

  state.messages.push({ role: 'user', content: text });
  state.busy = true;
  redraw();

  try {
    let tokens = 0, toolCalls = 0;
    const { runAgent } = require(path.join(PURP_DIR, 'lib', 'agent-loop.js'));
    for await (const ev of runAgent({ prompt: text, history: state.history, model: state.model, provider: state.provider, opts: { maxTurns: 10 } })) {
      if (ev.type === 'token') {
        let last = state.messages[state.messages.length - 1];
        if (!last || last.role !== 'assistant') { last = { role: 'assistant', content: '', meta: '' }; state.messages.push(last); }
        last.content += ev.content;
        tokens += ev.content.length;
        if (tokens % 32 < ev.content.length) redraw();
      } else if (ev.type === 'turn') {
        if (ev.turn > 1) state.messages.push({ role: 'meta', content: `─── turn ${ev.turn}/${ev.maxTurns} ───` });
        redraw();
      } else if (ev.type === 'tool-call') {
        state.messages.push({ role: 'tool', tool: ev.tool, args: ev.args }); toolCalls++; redraw();
      } else if (ev.type === 'tool-result') {
        state.messages.push({ role: 'tool-result', ok: ev.ok, preview: ev.content || ev.error }); redraw();
      } else if (ev.type === 'done') {
        state.messages.push({ role: 'meta', content: `─── done in ${ev.turns} turn(s), ${tokens} tokens, ${toolCalls} tool(s) ───` });
        redraw();
      } else if (ev.type === 'error') {
        state.messages.push({ role: 'meta', content: `error: ${ev.error}` }); redraw();
      }
    }
    state.history.push({ role: 'user', content: text });
  } catch (e) { state.messages.push({ role: 'meta', content: `error: ${e.message}` }); }
  finally { state.busy = false; redraw(); }
}

function cleanup() {
  state.exit = true;
  process.stdout.write(EXIT_ALT + SHOW_CURSOR);
  process.stdin.setRawMode(false);
  process.stdin.removeAllListeners('data');
  process.stdin.pause();
  process.exit(0);
}

// First render
state.toolCount = (() => { try { return require(path.join(PURP_DIR, 'lib', 'tools')).list().length; } catch { return 0; } })();
process.stdout.write(CLEAR);
pollStatus();
state.messages.push({ role: 'meta', content: `${C.cyan}purpclaw cockpit${CRESET}  ${C.dim}·${CRESET}  ${C.green}interactive agent chat${CRESET}\n  type a prompt and hit ${BOLD}Enter${CRESET}  ·  help for commands  ·  ${BOLD}Esc${CRESET} to clear  ·  ${BOLD}Ctrl+C${CRESET} to exit` });
state.messages.push({ role: 'meta', content: `  ${C.dim}provider: ${state.provider}${state.model ? ' · model: ' + state.model : ''}${CRESET}` });
redraw();
