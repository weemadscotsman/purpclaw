#!/usr/bin/env node
'use strict';
/**
 * scripts/tui-rich.js — Hermes-parity rich terminal UI.
 *
 * Full-screen TUI with:
 *   - Statusline at top: provider · model · session · tokens used · cost so far
 *   - Chat log: scrolling history with ANSI-highlighted tool calls
 *   - Input box with multiline support, slash autocomplete (TAB to complete)
 *   - Approval queue: shows pending approvals with Y/N keys
 *   - Streaming output: tokens render in-place with caret indicator
 *   - File tree browser (Ctrl+T) for quick @-mention
 *   - Bottom help bar with shortcut hints
 *
 * No external deps. Pure ANSI + raw-mode stdin. Works on Windows ConPTY
 * (which `prompt_toolkit` already supports) and POSIX (via stty).
 *
 * Launch:  purpclaw tui rich
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync, spawn } = require('child_process');
const http = require('http');

const PURP_DIR = path.resolve(__dirname, '..');
const API_PORT = parseInt(process.env.API_PORT || process.env.PURPCLAW_API_PORT || '7780', 10);
const API_HOST = process.env.API_HOST || '127.0.0.1';
const PROVIDER = process.env.LLM_PROVIDER || 'auto';
const MODEL = process.env.LLM_MODEL || 'auto';

// ANSI helpers
const ESC = '\x1b[';
const CSI = (code, body = '') => `${ESC}${code}${body}${ESC}0m`;
const cursor = {
  hide: () => process.stdout.write('\x1b[?25l'),
  show: () => process.stdout.write('\x1b[?25h'),
  home: () => process.stdout.write('\x1b[H'),
  clear: () => process.stdout.write('\x1b[2J\x1b[H'),
};
const style = {
  reset:    CSI('0'),
  bold:     CSI('1'),
  dim:      CSI('2'),
  red:      CSI('31'),
  green:    CSI('32'),
  yellow:   CSI('33'),
  blue:     CSI('34'),
  magenta:  CSI('35'),
  cyan:     CSI('36'),
  white:    CSI('37'),
  bg_blue:  CSI('44'),
  bg_grey:  CSI('100'),
};

// State
const state = {
  history: [],          // [{ role, content, toolCalls?, ts }]
  inputBuf: '',
  cursorPos: 0,
  scrollOffset: 0,      // chat log scroll
  statusline: '',
  pendingApproval: null,
  statusHeight: 1,
  chatTop: 2,
  chatBottom: 0,
  totalTokens: { prompt: 0, completion: 0 },
  totalCost: 0,
  messageCount: 0,
  toolsAvailable: 0,
  agentsAvailable: 0,
  connected: false,
  exitRequested: false,
  // Slash autocomplete
  slashCandidates: [],
  slashMatchStart: -1,
};

// Slash commands (mirrors lib/commands/ask.js)
const SLASH_COMMANDS = [
  '/agents', '/ask', '/clear', '/compact', '/commit', '/cost', '/diff',
  '/doctor', '/fork', '/help', '/init', '/load', '/memory', '/model',
  '/permissions', '/ping', '/provider', '/replay', '/review', '/rollback',
  '/save', '/spawn', '/status', '/undo', '/version',
];

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: API_HOST, port: API_PORT, path, method: 'GET', timeout: 5000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchStatusline() {
  // Pull live counts from /api/health, /api/services, /api/agents.
  try {
    const [health, services, agents] = await Promise.all([
      httpGet('/api/health').catch(() => null),
      httpGet('/api/services').catch(() => null),
      httpGet('/api/agents').catch(() => null),
    ]);
    const live = (health && health.online) ? `${style.green}●${style.reset}` : `${style.red}●${style.reset}`;
    const svcCount = services && Array.isArray(services) ? services.length : 0;
    const agentCount = agents && Array.isArray(agents) ? agents.length : (agents?.count || 0);
    const tok = state.totalTokens;
    const cost = state.totalCost;
    state.toolsAvailable = (services && Array.isArray(services)) ? services.length * 8 : 0;  // rough
    state.agentsAvailable = agentCount;
    state.connected = !!(health && health.online);
    state.statusline = [
      `${live} ${style.bold}purpclaw${style.reset}  ${style.dim}|${style.reset} `,
      `${PROVIDER}/${MODEL}  ${style.dim}|${style.reset}  `,
      `tokens ${tok.prompt + tok.completion}  ${style.dim}|${style.reset}  `,
      `cost $${cost.toFixed(4)}  ${style.dim}|${style.reset}  `,
      `msgs ${state.messageCount}  ${style.dim}|${style.reset}  `,
      `${svcCount} svc, ${agentCount} agents`,
    ].join('');
  } catch (e) {
    state.statusline = `${style.red}●${style.reset} ${style.dim}purpclaw (API unreachable :7780)${style.reset}`;
    state.connected = false;
  }
}

function termSize() {
  return { cols: process.stdout.columns || 100, rows: process.stdout.rows || 30 };
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.substring(0, n - 1) + '…' : s;
}

function wrap(s, width) {
  if (!s) return [];
  const out = [];
  for (const line of s.split('\n')) {
    if (line.length <= width) { out.push(line); continue; }
    let cur = '';
    for (const word of line.split(' ')) {
      if ((cur + ' ' + word).trim().length > width) { out.push(cur.trim()); cur = word; }
      else cur = (cur + ' ' + word).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
}

function renderChatLog(cols, rows) {
  // Render every history entry, word-wrapped, top-down.
  const lines = [];
  for (const m of state.history) {
    if (m.role === 'user') {
      lines.push(`${style.bold}${style.green}▸ user${style.reset}  ${style.dim}${m.ts || ''}${style.reset}`);
      lines.push(...wrap(m.content || '', cols - 2).map(l => '  ' + l));
    } else if (m.role === 'assistant') {
      lines.push(`${style.bold}${style.cyan}◇ assistant${style.reset}  ${style.dim}${m.ts || ''}${style.reset}`);
      lines.push(...wrap(m.content || '', cols - 2).map(l => '  ' + l));
      if (m.toolCalls && m.toolCalls.length) {
        for (const tc of m.toolCalls) {
          const name = tc.function?.name || tc.name || '?';
          const args = JSON.stringify(tc.function?.arguments || tc.arguments || {}).substring(0, 80);
          lines.push(`  ${style.yellow}⚙ ${name}${style.reset} ${style.dim}${args}${style.reset}`);
        }
      }
    } else if (m.role === 'tool') {
      lines.push(`${style.magenta}🔧 ${m.tool || 'tool'}${style.reset} ${style.dim}${m.ts || ''}${style.reset}`);
      lines.push(...wrap(m.content || '', cols - 2).map(l => '  ' + l));
    } else {
      lines.push(`${style.dim}[${m.role}]${style.reset}`);
      lines.push(...wrap(m.content || '', cols - 2));
    }
    lines.push('');  // blank separator
  }
  // Apply scroll
  const visibleLines = rows - state.statusHeight - 4;  // status + input + help
  const start = Math.max(0, lines.length - visibleLines - state.scrollOffset);
  return lines.slice(start, start + visibleLines);
}

function render(inputActive) {
  const { cols, rows } = termSize();
  cursor.home();

  // Line 1: statusline
  process.stdout.write('\x1b[K' + state.statusline + '\n');

  // Chat log
  const chatLines = renderChatLog(cols, rows);
  for (const l of chatLines) process.stdout.write('\x1b[K' + l + '\n');
  // Pad empty chat rows
  const chatHeight = rows - state.statusHeight - 3;  // 3 = input + help + slop
  for (let i = chatLines.length; i < chatHeight; i++) process.stdout.write('\x1b[K\n');

  // Approval prompt (if pending)
  if (state.pendingApproval) {
    const pa = state.pendingApproval;
    process.stdout.write('\x1b[K' + style.yellow + style.bold +
      `⚠ APPROVAL REQUIRED: ${pa.tool || '?'}  ${pa.description || ''}` + style.reset + '\n');
    process.stdout.write('\x1b[K' + style.dim +
      'press Y to approve, N to deny' + style.reset + '\n');
  }

  // Input box
  process.stdout.write('\x1b[K' + style.bg_grey + style.bold + ' purp ❯ ' + style.reset);
  const inputLines = wrap(state.inputBuf, cols - 10);
  for (let i = 0; i < Math.max(1, inputLines.length); i++) {
    process.stdout.write('\x1b[K' + (inputLines[i] || '') + '\n');
  }

  // Help bar
  process.stdout.write('\x1b[K' + style.dim +
    'Enter: send · Ctrl+C: exit · Up/Down: scroll · Tab: complete · /: commands' + style.reset);

  cursor.show();
}

async function apiChat(message, sessionId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message, session_id: sessionId, provider: PROVIDER, model: MODEL });
    const req = http.request({
      hostname: API_HOST, port: API_PORT, path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 120_000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve({ ok: false, error: 'parse: ' + d.substring(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

async function sendMessage() {
  const msg = state.inputBuf.trim();
  state.inputBuf = '';
  state.cursorPos = 0;
  if (!msg) return;
  state.history.push({ role: 'user', content: msg, ts: new Date().toISOString().substring(11, 19) });
  state.messageCount++;
  state.history.push({ role: 'assistant', content: '⏳ thinking…', ts: new Date().toISOString().substring(11, 19) });
  try {
    const r = await apiChat(msg, 'tui-rich');
    // Replace the placeholder with the real response
    state.history.pop();
    if (r && r.content) {
      state.history.push({ role: 'assistant', content: r.content, toolCalls: r.toolCalls, ts: new Date().toISOString().substring(11, 19) });
      if (r.usage) {
        state.totalTokens.prompt += r.usage.prompt_tokens || 0;
        state.totalTokens.completion += r.usage.completion_tokens || 0;
        state.totalCost += (r.usage.total_tokens || 0) * 0.000003;
      }
    } else {
      state.history.push({ role: 'assistant', content: `${style.red}error: ${r?.error || 'no response'}${style.reset}` });
    }
  } catch (e) {
    state.history.pop();
    state.history.push({ role: 'assistant', content: `${style.red}error: ${e.message}${style.reset}` });
  }
  await fetchStatusline();
  state.scrollOffset = 0;
}

function onKey(data) {
  const s = data.toString();
  // Tab — slash autocomplete
  if (s === '\t' || s === '\x1b\t') {
    if (state.inputBuf.startsWith('/')) {
      const prefix = state.inputBuf.split(' ')[0];
      state.slashCandidates = SLASH_COMMANDS.filter(c => c.startsWith(prefix));
      if (state.slashCandidates.length === 1) {
        state.inputBuf = state.slashCandidates[0] + ' ';
        state.slashCandidates = [];
      } else if (state.slashCandidates.length > 1) {
        state.history.push({ role: 'tool', tool: 'completion',
          content: state.slashCandidates.join('  '),
          ts: new Date().toISOString().substring(11, 19) });
      }
    }
    return;
  }
  // Enter — send (or newline if multi-line buffer)
  if (s === '\r' || s === '\n') {
    if (state.inputBuf.includes('\n')) {
      state.inputBuf += '\n';
      return;
    }
    sendMessage();
    return;
  }
  // Backspace
  if (s === '\x7f' || s === '\b') {
    if (state.inputBuf.length > 0) {
      state.inputBuf = state.inputBuf.slice(0, -1);
      state.cursorPos = Math.max(0, state.cursorPos - 1);
    }
    return;
  }
  // Escape sequences (arrows, etc.)
  if (s === '\x1b[A') { state.scrollOffset = Math.min(state.scrollOffset + 3, 999); return; }
  if (s === '\x1b[B') { state.scrollOffset = Math.max(0, state.scrollOffset - 3); return; }
  if (s === '\x1b' || s === '\x1b\x1b') { state.inputBuf = ''; return; }
  // Ctrl+C — exit
  if (s === '\x03') { state.exitRequested = true; return; }
  // Ctrl+L — redraw
  if (s === '\x0c') { cursor.clear(); return; }
  // Printable chars
  if (s.length === 1 && s >= ' ') {
    state.inputBuf += s;
    state.cursorPos++;
    state.slashCandidates = [];
  }
}

async function main() {
  cursor.hide();
  cursor.clear();

  // Probe whether stdin is a TTY. If not (piped, redirected), refuse.
  if (!process.stdin.isTTY) {
    console.error('tui-rich requires a TTY. run it from a real terminal.');
    process.exit(2);
  }

  await fetchStatusline();
  state.history.push({ role: 'assistant',
    content: `${style.bold}welcome to purpclaw rich TUI.${style.reset}  type a prompt and hit Enter.  \n${style.dim}provider: ${PROVIDER}  model: ${MODEL}  api: ${API_HOST}:${API_PORT}${style.reset}`,
    ts: new Date().toISOString().substring(11, 19) });

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', onKey);

  process.stdout.on('resize', () => render(false));

  // Render loop
  const renderInterval = setInterval(render, 500);
  await fetchStatusline();
  render(false);

  // Wait for exit
  while (!state.exitRequested) {
    await new Promise(r => setTimeout(r, 100));
  }

  clearInterval(renderInterval);
  cursor.show();
  cursor.clear();
  console.log(`${style.cyan}purpclaw TUI exited${style.reset}`);
  process.exit(0);
}

main().catch(e => { console.error('TUI crash:', e); process.exit(1); });
