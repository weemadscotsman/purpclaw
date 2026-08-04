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
// Companion — pet lives here, no enforcement
let companion;
try { companion = require(path.join(PURP_DIR, 'lib', 'core', 'companion')).getCompanion(); } catch { companion = null; }
const API_PORT  = process.env.API_PORT || 7780;
const SESSIONS_DIR = path.join(PURP_DIR, '.purpclaw', 'sessions');
const CURRENT_FILE = path.join(SESSIONS_DIR, '_current.json');

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

// ── Session helpers ─────────────────────────────────────────────────────
function loadCurrentSessionId() {
  try { return JSON.parse(require('fs').readFileSync(CURRENT_FILE, 'utf8')).sessionId || null; } catch { return null; }
}

function setCurrentSessionId(sid) {
  try { require('fs').writeFileSync(CURRENT_FILE, JSON.stringify({ sessionId: sid, updatedAt: new Date().toISOString() }), 'utf8'); } catch {}
}

// ── State ────────────────────────────────────────────────────────────
const state = {
  sessionId : loadCurrentSessionId(),
  sessionTitle: '',
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
  mcpCount : 0,
  lastPoll : 0,
  // Token stats
  tokens   : { prompt: 0, completion: 0, calls: 0, saved: 0 },
  actions  : { tools: 0, turns: 0 },
  // v2.1 — pulse: live stack heartbeat
  pulse    : [],
  // v2.1 — companion pet
  pet      : { pet: '(◕ᴥ◕)', mood: 'idle', thought: null, message: null },
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

    // v2.1 — Pulse: live stack heartbeat (last 5 findings)
    new Promise(res2 => {
      http.get(`http://127.0.0.1:${API_PORT}/api/pulse/notifications?limit=5`, { timeout: 2000 }, resp2 => {
        let d2 = ''; resp2.on('data', c => d2 += c);
        resp2.on('end', () => { try { const j2 = JSON.parse(d2); state.pulse = j2.notifications || []; } catch {} res2(); });
      }).on('error', () => res2());
    });

    setTimeout(() => { try { redraw(); } catch {} }, 2000);
  } catch {}

  state.lastPoll = Date.now();

  // Tick the companion pet
  if (companion) {
    try {
      companion.tick();
      const ps = companion.status();
      state.pet = { pet: ps.pet, mood: ps.mood, thought: ps.thought, message: ps.message };
    } catch {}
  }
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
  const p = `${C.cyan}${BOLD}purpclaw${CRESET}`;
  const prov = `${C.dim}${state.provider}${CRESET}`;
  const mdl = state.model ? `${C.yellow}${state.model}${CRESET}` : `${C.yellow}auto${CRESET}`;
  const s = `${svcColor}${state.services.online}/${state.services.total} svc${CRESET}`;
  const a = `${C.magenta}${state.agents.active}ag${CRESET}`;
  const m = `${C.green}${state.mcpCount}mcp${CRESET}`;
  // Token line
  const total = state.tokens.prompt + state.tokens.completion;
  const tok = total > 0 ? `${C.cyan}${(total/1000).toFixed(1)}k tok${CRESET}` : `${C.dim}0 tok${CRESET}`;
  const saved = state.tokens.saved > 0 ? `${C.green}~${state.tokens.saved} saved${CRESET}` : '';
  const acts = `${C.blue}${state.actions.tools}tools${CRESET} ${C.blue}${state.actions.turns}turns${CRESET}`;
  // Show session in status bar if one is active
  const sess = state.sessionId ? `${C.cyan}${state.sessionId.slice(0, 12)}…${CRESET}` : '';
  const left = `${p} ${prov} ${mdl}${sess ? ' · session:' + sess : ''} · ${s} ${a} ${m} · ${tok} ${saved} · ${acts}`;
  // Companion pet in the right slot — fun reactions, not enforcement
  let right;
  if (state.busy) {
    right = `${C.yellow}◐ thinking…${CRESET}`;
  } else if (state.pet.message) {
    right = `${C.green}${state.pet.pet}${CRESET} ${C.dim}${state.pet.message.slice(0, 40)}${CRESET}`;
  } else if (state.pet.thought) {
    right = `${C.green}${state.pet.pet}${CRESET} ${C.dim}${state.pet.thought.slice(0, 40)}${CRESET}`;
  } else {
    right = `${C.green}${state.pet.pet}${CRESET} ${C.green}●${CRESET}`;
  }
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

  // Pulse: live stack heartbeat (last few)
  lines.push(hdr('── PULSE ──'));
  if (!state.pulse || state.pulse.length === 0) {
    lines.push(`  ${C.dim}(no findings yet)${CRESET}`);
  } else {
    for (const n of state.pulse.slice(0, 3)) {
      const sev = n.severity === 'error' ? C.red : n.severity === 'warn' ? C.yellow : C.green;
      const title = (n.title || 'finding').length > w - 4 ? (n.title || 'finding').substring(0, w - 7) + '…' : (n.title || 'finding');
      lines.push(`  ${sev}●${CRESET} ${title}`);
    }
  }
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
  lines.push(val('MCP', state.mcpCount));
  lines.push('');

  // Token stats
  const t = state.tokens;
  const total = t.prompt + t.completion;
  if (total > 0) {
    lines.push(hdr('── TOKENS ──'));
    lines.push(val('prompt', `${(t.prompt/1000).toFixed(1)}k`));
    lines.push(val('completion', `${(t.completion/1000).toFixed(1)}k`));
    lines.push(val('total', `${(total/1000).toFixed(1)}k`));
    if (t.saved > 0) lines.push(val('saved', `~${t.saved} (OmniCode)`));
    lines.push(val('calls', t.calls));
    lines.push('');
  }

  // Actions
  if (state.actions.tools > 0 || state.actions.turns > 0) {
    lines.push(hdr('── ACTIONS ──'));
    lines.push(val('tool calls', state.actions.tools));
    lines.push(val('turns', state.actions.turns));
    lines.push('');
  }

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
  const t = state.tokens;
  const total = t.prompt + t.completion;
  const tokens = total > 0 ? `tokens: ${(total/1000).toFixed(1)}k` : '0 tok';
  const saved = t.saved > 0 ? ` · saved: ${t.saved}` : '';
  const acts = `actions: ${state.actions.tools}t · ${state.actions.turns} turns`;
  const left = `${C.dim}/help${CRESET} cmds  ${C.dim}·${CRESET}  ${C.dim}Esc${CRESET} clear  ${C.dim}·${CRESET}  ${C.dim}Ctrl+C${CRESET} exit  ${C.dim}·${CRESET}  ${C.dim}↑/↓${CRESET} scroll  ${C.dim}·${CRESET}  ${C.dim}Ctrl+L${CRESET} redraw  ${C.dim}·${CRESET}  ${C.dim}p${CRESET} pet stats`;
  const right = `${C.cyan}${tokens}${saved}${CRESET}  ${C.dim}·${CRESET}  ${C.blue}${acts}${CRESET}`;
  const pad = Math.max(1, state.width - visibleLen(left) - visibleLen(right) - 2);
  return CLEAR_LINE + ' ' + left + ' '.repeat(pad) + right + ' ';
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
  // Pet shortcut: 'p' shows pet stats inline
  if (key === 'p' && !state.busy) {
    if (companion) {
      const s = companion.statsString();
      state.messages.push({ role: 'meta', content: `\x1b[35m${s}\x1b[0m` });
    }
    redraw();
    return;
  }
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

  if (process.env.PURPCLAW_LEGACY_TUI !== '1') {
    try {
      let chars=0,toolCalls=0;
      const gateway=require(path.join(PURP_DIR,'lib','gateway-singleton')).getGateway({cwd:PURP_DIR});
      const delta=ev=>{if(state.sessionId&&ev.session_id!==state.sessionId)return;let last=state.messages[state.messages.length-1];if(!last||last.role!=='assistant'){last={role:'assistant',content:'',meta:''};state.messages.push(last);}last.content+=ev.delta||'';chars+=(ev.delta||'').length;if(chars%32<(ev.delta||'').length)redraw();};
      const start=ev=>{if(!state.sessionId||ev.session_id===state.sessionId){state.messages.push({role:'tool',tool:ev.tool,args:ev.arguments});toolCalls++;redraw();}};
      const done=ev=>{if(!state.sessionId||ev.session_id===state.sessionId){state.messages.push({role:'tool-result',ok:ev.ok,preview:ev.result||ev.error});redraw();}};
      gateway.on('message.delta',delta);gateway.on('tool.start',start);gateway.on('tool.complete',done);
      try{const result=await gateway.submit({prompt:text,session_id:state.sessionId||undefined,max_turns:10,platform:'tui',operator_initiated:true});state.sessionId=result.session_id;setCurrentSessionId(state.sessionId);state.messages.push({role:'meta',content:`done in ${result.turns||1} turn(s), ${chars} chars, ${toolCalls} tool(s)`});state.tokens.completion+=chars;state.tokens.calls++;state.actions.tools+=toolCalls;state.actions.turns=Math.max(state.actions.turns,result.turns||1);state.history=require(path.join(PURP_DIR,'lib','session-repository')).loadSession(state.sessionId)?.messages||[];}finally{gateway.off('message.delta',delta);gateway.off('tool.start',start);gateway.off('tool.complete',done);}
    } catch(e){state.messages.push({role:'meta',content:`error: ${e.message}`});}
    finally{state.busy=false;redraw();}
    return;
  }

  try {
    let tokens = 0, toolCalls = 0, turnCount = 0;
    // Use work-engine for session persistence + unified execution path
    const work = require(path.join(PURP_DIR, 'lib', 'core', 'work-engine'));
    // Resolve model routing (same router as web UI)
    let _model = state.model, _provider = state.provider;
    if (!_model) {
      try { const r = require(path.join(PURP_DIR, 'lib', 'model-router.js')).route(text); _model = r.model; _provider = r.provider; } catch { /* router optional */ }
    }
    // work.chat() handles session creation, history loading, and auto-save
    for await (const ev of work.chat({ sessionId: state.sessionId, prompt: text, history: state.history, model: _model, provider: _provider, opts: { maxTurns: 10 } })) {
      if (ev.type === 'token') {
        let last = state.messages[state.messages.length - 1];
        if (!last || last.role !== 'assistant') { last = { role: 'assistant', content: '', meta: '' }; state.messages.push(last); }
        last.content += ev.content;
        tokens += ev.content.length;
        if (tokens % 32 < ev.content.length) redraw();
      } else if (ev.type === 'turn') {
        turnCount = ev.turn;
        if (ev.turn > 1) state.messages.push({ role: 'meta', content: `─── turn ${ev.turn}/${ev.maxTurns} ───` });
        redraw();
      } else if (ev.type === 'tool-call') {
        state.messages.push({ role: 'tool', tool: ev.tool, args: ev.args }); toolCalls++; redraw();
      } else if (ev.type === 'tool-result') {
        state.messages.push({ role: 'tool-result', ok: ev.ok, preview: ev.content || ev.error }); redraw();
      } else if (ev.type === 'done') {
        state.messages.push({ role: 'meta', content: `─── done in ${ev.turns} turn(s), ${tokens} tokens, ${toolCalls} tool(s) ───` });
        // Update stats
        state.tokens.completion += tokens;
        state.tokens.calls++;
        state.actions.tools += toolCalls;
        state.actions.turns = Math.max(state.actions.turns, turnCount || ev.turns);
        // Estimate saved tokens from OmniCode MCP (each MCP call saves ~2k tokens vs file read)
        const mcpCalls = toolCalls > 0 ? Math.round(toolCalls * 0.3) : 0;
        state.tokens.saved += mcpCalls * 2000;
        // Sync session ID back from work-engine (it may have created a new session)
        try {
          const work = require(path.join(PURP_DIR, 'lib', 'core', 'work-engine'));
          state.sessionId = work.getCurrentSessionId();
          // Reload history so subsequent turns have full context
          state.history = work.getHistory(state.sessionId);
        } catch (_) {}
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
// Load MCP count — OmniCode is always loaded on startup
try {
  const mcp = require(path.join(PURP_DIR, 'lib', 'mcp'));
  mcp.loadServers().then(() => { state.mcpCount = mcp.listTools().length; redraw(); }).catch(() => {});
} catch {};
process.stdout.write(CLEAR);
pollStatus();
state.messages.push({ role: 'meta', content: `${C.cyan}purpclaw cockpit${CRESET}  ${C.dim}·${CRESET}  ${C.green}interactive agent chat${CRESET}\n  type a prompt and hit ${BOLD}Enter${CRESET}  ·  help for commands  ·  ${BOLD}Esc${CRESET} to clear  ·  ${BOLD}Ctrl+C${CRESET} to exit` });
state.messages.push({ role: 'meta', content: `  ${C.dim}provider: ${state.provider}${state.model ? ' · model: ' + state.model : ''}${CRESET}` });
// Load existing session history if a session is active
if (state.sessionId) {
  try {
    const sessions = require(path.join(PURP_DIR, 'lib', 'session-repository'));
    const loaded = sessions.loadSession(state.sessionId);
    state.history = loaded ? loaded.messages : [];
    state.sessionTitle = loaded ? loaded.title : state.sessionId;
    if (state.history.length > 0) {
      state.messages.push({ role: 'meta', content: `${C.dim}resuming session: ${state.sessionId} (${state.history.length} turns)${CRESET}` });
    }
  } catch (_) {}
}
redraw();
