#!/usr/bin/env node
'use strict';
/**
 * scripts/tui-ask.js — PURPCLAW ask-mode TUI
 * =============================================
 * A full-screen terminal UI for the open-source coding-agent CLI.
 * Live chat with the LLM: streaming tokens, tool calls, slash
 * commands. No external deps.
 *
 * Launch:  purpclaw tui ask
 *
 * Layout (top to bottom):
 *   1. Status bar   (provider · model · tools · mcp)
 *   2. Chat log     (user prompts, agent text, tool calls/results)
 *   3. Input box    (multi-line, Enter=submit, Shift+Enter=newline)
 *   4. Help line    (slash commands + keybindings)
 *
 * Keybindings:
 *   Enter          Submit prompt
 *   Shift+Enter    Newline (multiline input)
 *   Esc            Clear chat history
 *   Ctrl+L         Clear screen / redraw
 *   Ctrl+C         Exit
 *   Up/Down        Scroll chat log
 *   /              Slash command (auto-detect on submit)
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// Load .env
try {
  const lines = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split(/\r?\n/);
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

const PURP_DIR  = path.resolve(__dirname, '..');
const askModule = require(path.join(PURP_DIR, 'lib', 'commands', 'ask.js'));

// ── ANSI helpers ────────────────────────────────────────────────────────────
const ESC = '\x1b';
const CSI = (n) => `${ESC}[${n}`;
const CLEAR     = CSI('2J');
const CLEAR_LINE = CSI('2K');
const HIDE_CURSOR = CSI('?25l');
const SHOW_CURSOR = CSI('?25h');
const ALT_SCREEN = CSI('?1049h');
const EXIT_ALT   = CSI('?1049l');
const HOME = CSI('H');
const SAVE_CURSOR    = CSI('s');
const RESTORE_CURSOR = CSI('u');
const RESET = CSI('0m');
const DIM   = CSI('2m');
const BOLD  = CSI('1m');
const REVERSE = CSI('7m');
const FG_CYAN    = CSI('36m');
const FG_GREEN   = CSI('32m');
const FG_YELLOW  = CSI('33m');
const FG_RED     = CSI('31m');
const FG_MAGENTA = CSI('35m');
const FG_BLUE    = CSI('34m');
const FG_GRAY    = CSI('90m');
const FG_WHITE   = CSI('97m');

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
const visibleLen = (s) => stripAnsi(s).length;

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  provider : process.env.LLM_PROVIDER || 'ollama',
  model    : process.env.LLM_MODEL    || null,
  history  : [],          // agent-loop history
  messages : [],          // displayed messages
  input    : '',
  inputCursor : 0,        // column in input (single-line for now)
  scroll   : 0,           // 0 = bottom
  width    : 80,
  height   : 24,
  busy     : false,
  exit     : false,
  inputHistory : [],      // last N prompts submitted
  historyIndex : -1,      // -1 = current input, 0 = most recent
  savedCurrentInput : '', // save current input when starting navigation
};

// ── TTY setup ────────────────────────────────────────────────────────────────
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

function onResize() {
  state.width  = process.stdout.columns || 80;
  state.height = process.stdout.rows    || 24;
  redraw();
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderStatusBar() {
  const tools = (() => { try { return require(path.join(PURP_DIR, 'lib', 'tools')).list(); } catch { return []; } })();
  const mcp   = (() => { try { return require(path.join(PURP_DIR, 'lib', 'mcp')).listServers().length; } catch { return 0; } })();
  const provider = `${FG_CYAN}${BOLD}purpclaw tui${RESET}  ${FG_GRAY}·${RESET}  ${FG_GREEN}${state.provider}${RESET}`;
  const model = state.model ? `${FG_YELLOW}${state.model}${RESET}` : `${FG_YELLOW}auto${RESET}`;
  const tools_str = `${FG_GRAY}tools:${RESET} ${tools.length}${mcp ? ` ${FG_MAGENTA}+${mcp} mcp${RESET}` : ''}`;
  const right = state.busy ? `${FG_YELLOW}◐ thinking…${RESET}` : `${FG_GREEN}● ready${RESET}`;
  const left = `${provider}  ${FG_GRAY}·${RESET}  model: ${model}  ${FG_GRAY}·${RESET}  ${tools_str}`;
  const padding = Math.max(1, state.width - visibleLen(left) - visibleLen(right) - 2);
  return CLEAR_LINE + ' ' + left + ' '.repeat(padding) + right + ' ';
}

function wrapText(text, width) {
  // Word-wrap that respects ANSI codes.
  const result = [];
  for (const rawLine of text.split('\n')) {
    let cur = '';
    let curLen = 0;
    const tokens = rawLine.split(/(\s+)/);
    for (const tok of tokens) {
      const tlen = visibleLen(tok);
      if (curLen + tlen > width - 2 && cur) {
        result.push(cur);
        cur = tok.trimStart();
        curLen = visibleLen(cur);
      } else {
        cur += tok;
        curLen += tlen;
      }
    }
    if (cur || result.length === 0) result.push(cur);
  }
  return result;
}

function renderChat() {
  const lines = [];
  // Each message gets a header + wrapped body
  for (const msg of state.messages) {
    if (msg.role === 'user') {
      lines.push(`${FG_CYAN}${BOLD}purp ❯${RESET} ${FG_WHITE}${msg.content}${RESET}`);
    } else if (msg.role === 'assistant') {
      lines.push(`${FG_GREEN}${BOLD}✒ quill${RESET} ${FG_GRAY}${msg.meta || ''}${RESET}`);
      const wrapped = wrapText(msg.content, state.width);
      for (const w of wrapped) lines.push('  ' + w);
    } else if (msg.role === 'tool') {
      lines.push(`${FG_MAGENTA}  ⚡ ${msg.tool}${RESET} ${FG_GRAY}${JSON.stringify(msg.args).slice(0, 80)}${RESET}`);
    } else if (msg.role === 'tool-result') {
      const ok = msg.ok ? `${FG_GREEN}← ok${RESET}` : `${FG_RED}← error${RESET}`;
      const preview = (msg.preview || '').replace(/\n/g, ' ').slice(0, 100);
      lines.push(`${FG_GRAY}  ${ok} ${preview}${RESET}`);
    } else if (msg.role === 'meta') {
      lines.push(`${FG_GRAY}  ${msg.content}${RESET}`);
    } else if (msg.role === 'slash') {
      lines.push(`${FG_YELLOW}${BOLD}  ${msg.content}${RESET}`);
    }
    lines.push(''); // blank line between messages
  }
  return lines;
}

function renderInput() {
  const lines = [];
  // Separator
  lines.push(`${FG_GRAY}${'─'.repeat(state.width)}${RESET}`);
  // Input box: show cursor
  const prompt = `${FG_CYAN}${BOLD}❯${RESET} `;
  const cursor = `${REVERSE} ${RESET}`;
  const inputText = state.input;
  const before = inputText.slice(0, state.inputCursor);
  const atCursor = inputText.slice(state.inputCursor, state.inputCursor + 1) || ' ';
  const after = inputText.slice(state.inputCursor + 1);
  lines.push(prompt + before + `${REVERSE}${atCursor}${RESET}` + after);
  return lines;
}

function renderHelpBar() {
  return CLEAR_LINE + ' ' + `${FG_GRAY}/help${RESET} commands  ${FG_GRAY}·${RESET}  ${FG_GRAY}Esc${RESET} clear  ${FG_GRAY}·${RESET}  ${FG_GRAY}Ctrl+C${RESET} exit  ${FG_GRAY}·${RESET}  ${FG_GRAY}↑/↓${RESET} history  ${FG_GRAY}·${RESET}  ${FG_GRAY}PgUp/PgDn${RESET} scroll`;
}

function redraw() {
  // Layout: status (1) + chat (height-3) + input (1) + help (1)
  const chatHeight = state.height - 3;
  const all = renderChat();
  const visible = all.slice(Math.max(0, all.length - chatHeight - state.scroll), all.length - state.scroll);

  let out = HOME;
  // Status line
  out += renderStatusBar() + '\n';
  // Chat lines
  for (let i = 0; i < chatHeight; i++) {
    out += (visible[i] || CLEAR_LINE) + '\n';
  }
  // Input + help
  out += renderInput()[0] + '\n';
  out += renderHelpBar();
  process.stdout.write(out);
}

let inputBuffer = '';
let escTimeout = null;

function onKey(chunk) {
  if (state.exit) return;
  
  if (escTimeout) {
    clearTimeout(escTimeout);
    escTimeout = null;
  }

  inputBuffer += chunk.toString('utf-8');

  // If it starts with ESC, we must wait to see if it is a lone ESC or part of a sequence
  if (inputBuffer.startsWith('\x1b')) {
    if (inputBuffer === '\x1b') {
      escTimeout = setTimeout(() => {
        escTimeout = null;
        inputBuffer = '';
        // Real Esc key press behavior: clear screen/history
        state.history = [];
        state.messages = [];
        state.scroll = 0;
        redraw();
      }, 50);
      return;
    }
    
    // Check if it's a complete CSI sequence (ends with a letter or '~')
    const match = inputBuffer.match(/^\x1b\[[0-9;]*[a-zA-Z~]/);
    if (match) {
      const seq = match[0];
      inputBuffer = inputBuffer.slice(seq.length);
      handleKeySequence(seq);
      return;
    }

    // Guard against invalid/incomplete escape sequences bloating the buffer
    if (inputBuffer.length > 10) {
      inputBuffer = '';
    }
    return;
  }

  // Regular input bytes
  const seq = inputBuffer;
  inputBuffer = '';
  // Process characters individually if multiple arrived, except if they are special control codes
  if (seq.length > 1 && !seq.startsWith('\x1b')) {
    for (const char of seq) {
      handleKeySequence(char);
    }
  } else {
    handleKeySequence(seq);
  }
}

function handleKeySequence(key) {
  // Ctrl+C → exit
  if (key === '\x03') { cleanup(); return; }
  // Ctrl+L → redraw
  if (key === '\x0c') { process.stdout.write(CLEAR); redraw(); return; }

  // Arrow keys & scrolling
  if (key === '\x1b[A') {
    // Up arrow → input history navigation
    if (state.inputHistory && state.inputHistory.length > 0) {
      if (state.historyIndex === -1) {
        state.savedCurrentInput = state.input;
      }
      state.historyIndex = Math.min(state.historyIndex + 1, state.inputHistory.length - 1);
      state.input = state.inputHistory[state.inputHistory.length - 1 - state.historyIndex];
      state.inputCursor = state.input.length;
      redraw();
    } else {
      state.scroll = Math.max(0, state.scroll + 3);
      redraw();
    }
    return;
  }
  if (key === '\x1b[B') {
    // Down arrow → input history navigation
    if (state.inputHistory && state.historyIndex > -1) {
      state.historyIndex--;
      if (state.historyIndex === -1) {
        state.input = state.savedCurrentInput;
      } else {
        state.input = state.inputHistory[state.inputHistory.length - 1 - state.historyIndex];
      }
      state.inputCursor = state.input.length;
      redraw();
    } else {
      state.scroll = Math.max(0, state.scroll - 3);
      redraw();
    }
    return;
  }
  if (key === '\x1b[C') { /* right */ return; }
  if (key === '\x1b[D') { /* left */ return; }

  // PageUp / PageDown
  if (key === '\x1b[5~') { state.scroll = Math.max(0, state.scroll + 3); redraw(); return; }
  if (key === '\x1b[6~') { state.scroll = Math.max(0, state.scroll - 3); redraw(); return; }

  // Enter → submit
  if (key === '\r' || key === '\n') {
    submitInput();
    return;
  }
  // Backspace
  if (key === '\x7f' || key === '\b') {
    if (state.inputCursor > 0) {
      state.input = state.input.slice(0, state.inputCursor - 1) + state.input.slice(state.inputCursor);
      state.inputCursor--;
      redraw();
    }
    return;
  }
  // Ctrl+U → clear input
  if (key === '\x15') { state.input = ''; state.inputCursor = 0; redraw(); return; }
  // Ctrl+A → home
  if (key === '\x01') { state.inputCursor = 0; redraw(); return; }
  // Ctrl+E → end
  if (key === '\x05') { state.inputCursor = state.input.length; redraw(); return; }
  // Regular character
  if (key.length === 1 && key >= ' ' && key <= '~') {
    state.input = state.input.slice(0, state.inputCursor) + key + state.input.slice(state.inputCursor);
    state.inputCursor++;
    redraw();
  }
}

async function submitInput() {
  const text = state.input.trim();
  state.input = '';
  state.inputCursor = 0;
  state.historyIndex = -1; // reset navigation index on submit
  if (!text) { redraw(); return; }
  
  // Save to input history (max 50, avoiding adjacent duplicates)
  if (!state.inputHistory) state.inputHistory = [];
  if (state.inputHistory.length === 0 || state.inputHistory[state.inputHistory.length - 1] !== text) {
    state.inputHistory.push(text);
    if (state.inputHistory.length > 50) {
      state.inputHistory.shift();
    }
  }

  if (state.busy) { redraw(); return; }

  // Slash command short-circuit. Accept both `/foo` and `foo` (the
  // latter for shells like git-bash that mung a leading slash into
  // a file path).
  const m = text.match(/^[\/]?([a-z][a-z0-9_-]*)/);
  if (m && askModule.SLASH_COMMANDS['/' + m[1]]) {
    const cmd = askModule.SLASH_COMMANDS['/' + m[1]];
    const args = text.slice(m[0].length).trim();
    const out = await cmd.run(args, state);
    state.messages.push({ role: 'slash', content: `${'/' + m[1]}: ${out || '(ok)'}` });
    redraw();
    return;
  }

  // Push user message
  state.messages.push({ role: 'user', content: text });
  state.busy = true;
  redraw();

  try {
    let tokens = 0;
    let toolCalls = 0;
    const ctx = { provider: state.provider, model: state.model, history: state.history, maxTurns: 10 };
    const { runAgent } = require(path.join(PURP_DIR, 'lib', 'agent-loop.js'));
    for await (const ev of runAgent({ prompt: text, history: state.history, model: state.model, provider: state.provider, opts: { maxTurns: 10 } })) {
      if (ev.type === 'token') {
        // Append to the last assistant message or create one
        let last = state.messages[state.messages.length - 1];
        if (!last || last.role !== 'assistant') {
          last = { role: 'assistant', content: '', meta: '' };
          state.messages.push(last);
        }
        last.content += ev.content;
        tokens += ev.content.length;
        // Throttle redraws to every 32 tokens for perf
        if (tokens % 32 < ev.content.length) redraw();
      } else if (ev.type === 'turn') {
        if (ev.turn > 1) {
          state.messages.push({ role: 'meta', content: `─── turn ${ev.turn}/${ev.maxTurns} ───` });
        }
        redraw();
      } else if (ev.type === 'tool-call') {
        state.messages.push({ role: 'tool', tool: ev.tool, args: ev.args });
        toolCalls++;
        redraw();
      } else if (ev.type === 'tool-result') {
        state.messages.push({ role: 'tool-result', ok: ev.ok, preview: ev.content || ev.error });
        redraw();
      } else if (ev.type === 'done') {
        state.messages.push({
          role: 'meta',
          content: `─── done in ${ev.turns} turn(s), ${tokens} tokens streamed, ${toolCalls} tool call(s) ───`,
        });
        redraw();
      } else if (ev.type === 'error') {
        state.messages.push({ role: 'meta', content: `error: ${ev.error}` });
        redraw();
      }
    }
    // Update the agent's history with the final messages
    state.history = state.history.concat([{ role: 'user', content: text }]);
  } catch (e) {
    state.messages.push({ role: 'meta', content: `error: ${e.message}` });
  } finally {
    state.busy = false;
    redraw();
  }
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
process.stdout.write(CLEAR);
redraw();

// Welcome message
state.messages.push({
  role: 'meta',
  content: `${FG_CYAN}purpclaw tui ask${RESET}  ${FG_GRAY}·${RESET}  ${FG_GREEN}interactive agent chat${RESET}\n  type a prompt and hit ${BOLD}Enter${RESET}  ·  ${BOLD}/help${RESET} for commands  ·  ${BOLD}Esc${RESET} to clear  ·  ${BOLD}Ctrl+C${RESET} to exit`,
});
state.messages.push({ role: 'meta', content: `  ${FG_GRAY}provider: ${state.provider}${state.model ? ` · model: ${state.model}` : ''}${RESET}` });
redraw();
