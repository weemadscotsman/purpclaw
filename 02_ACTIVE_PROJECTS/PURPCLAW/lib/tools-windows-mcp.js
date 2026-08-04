'use strict';

/**
 * lib/tools-windows-mcp.js — NATIVE, GATED bridge to the vendored Windows-MCP
 * server (CursorTouch/Windows-MCP, vendor/windows-mcp). Exposes every
 * Windows-MCP ability as a first-class PURPCLAW tool `win_<name>`, so every
 * surface (CLI/WebUI/TUI/swarm) sees it through the one tool registry — not
 * bolted on via mcp.json, but wired in with the safety spine.
 *
 * SAFETY MODEL (this is the whole point):
 *   - The Windows-MCP server is NOT launched at boot. It is spawned LAZILY,
 *     only when an armed `win_*` tool is actually called. Nothing runs while idle.
 *   - Every call passes the `computerUse` mode gate (off|observe|assist|autonomous),
 *     same gate as the gui_* tools. mode=off → blocked, never spawns.
 *   - Three danger tiers:
 *       observe    : Snapshot, Screenshot, Clipboard(get) read-only screen state
 *       assist     : Click/Type/Move/Scroll/Shortcut/App/MultiSelect/… (needs assist+approval or autonomous)
 *       destructive: PowerShell, Registry, Process(kill), FileSystem(write/delete) —
 *                    require autonomous mode + approved:true + env WINMCP_DESTRUCTIVE=1.
 *   - `gui_stop` (the kill switch) tears down the Windows-MCP connection via shutdown().
 */

const path = require('path');
const cu = require('./runtime/computer-use'); // mode() + MODE_LEVEL gate

const UV = process.env.UV_BIN || 'C:/Users/Admin/AppData/Local/hermes/bin/uv.exe';
const VENDOR = process.env.WINMCP_DIR
  || path.resolve(__dirname, '..', 'vendor', 'windows-mcp');
const DESTRUCTIVE_ENABLED = process.env.WINMCP_DESTRUCTIVE === '1';

// name → { win: <Windows-MCP tool name>, tier, desc }
const TOOLS = [
  // ── observe (read-only) ──
  { win: 'Snapshot',     tier: 'observe', desc: 'Capture full desktop state: focused/open windows + interactive UI elements (buttons, fields, links) WITH coordinates + scrollable areas. The richest "eyes" — call first to understand the screen before acting. Args: {use_vision, use_annotation, use_ui_tree, display, use_dom}.' },
  { win: 'Screenshot',   tier: 'observe', desc: 'Capture a screenshot image of the screen. Args: {}.' },
  { win: 'Clipboard',    tier: 'observe', desc: 'Read/write clipboard. mode="get" (read, observe) or mode="set" (write text). Args: {mode, text}.' },
  { win: 'Scrape',       tier: 'observe', desc: 'Fetch/extract a web page (HTTP or active-tab DOM). Args: {url, query, use_dom, use_sampling}.' },
  // ── assist (input / app control — needs assist+approval or autonomous) ──
  { win: 'App',          tier: 'assist', desc: 'Launch / resize / switch windows. Args: {mode:"launch"|"resize"|"switch", name, ...}.' },
  { win: 'Click',        tier: 'assist', desc: 'Click at [x,y] or a UI element label/id. Args: {loc:[x,y] | label, button, clicks}.' },
  { win: 'Type',         tier: 'assist', desc: 'Type text at [x,y] or a label. Args: {loc|label, text, clear, press_enter, caret_position}.' },
  { win: 'Scroll',       tier: 'assist', desc: 'Scroll vertical/horizontal. Args: {direction, wheel_times, loc}.' },
  { win: 'Move',         tier: 'assist', desc: 'Move the mouse to [x,y]. Args: {loc:[x,y]}.' },
  { win: 'Shortcut',     tier: 'assist', desc: 'Send a key combo (e.g. "ctrl+c", "alt+tab", "win+r"). Args: {shortcut}.' },
  { win: 'Wait',         tier: 'observe', desc: 'Wait N seconds for UI to settle. Args: {duration}.' },
  { win: 'WaitFor',      tier: 'observe', desc: 'Wait until a condition/element appears. Args: {...}.' },
  { win: 'MultiSelect',  tier: 'assist', desc: 'Select multiple items (ctrl-click) or multi-click. Args: {locs|labels, press_ctrl}.' },
  { win: 'MultiEdit',    tier: 'assist', desc: 'Type into multiple fields. Args: {locs:[[x,y,text]] | labels:[[label,text]]}.' },
  { win: 'Notification', tier: 'assist', desc: 'Send a Windows toast notification. Args: {title, message}.' },
  // ── destructive (autonomous + approved + WINMCP_DESTRUCTIVE=1) ──
  { win: 'PowerShell',   tier: 'destructive', desc: '⚠ Run an arbitrary PowerShell command — full system access. Args: {command}.' },
  { win: 'Registry',     tier: 'destructive', desc: '⚠ Read/write/delete Windows registry. Args: {mode, path, name, value}.' },
  { win: 'Process',      tier: 'destructive', desc: '⚠ List or KILL processes. Args: {mode:"list"|"kill", pid|name}.' },
  { win: 'FileSystem',   tier: 'destructive', desc: '⚠ Read/write/copy/move/delete files. Args: {mode, path, ...}. (read-only modes still pass through the destructive gate for safety.)' },
];

// ── Lazy connection to the vendored Windows-MCP server ───────────────────────
let _client = null, _transport = null, _connecting = null;

async function ensureClient() {
  if (_client) return _client;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command: UV,
      args: ['run', '--directory', VENDOR, 'windows-mcp', 'serve', '--transport', 'stdio'],
    });
    const client = new Client({ name: 'purpclaw-winmcp', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    _client = client; _transport = transport;
    return client;
  })().catch((e) => { _connecting = null; throw e; });
  return _connecting;
}

/** Kill switch hook: tear down the Windows-MCP connection + child process. */
function shutdown() {
  try { _transport && _transport.close(); } catch { /* best effort */ }
  _client = null; _transport = null; _connecting = null;
  return { stopped: true };
}

// ── Gate ─────────────────────────────────────────────────────────────────────
function gate(tier, approved) {
  const mode = cu.mode();                     // off | observe | assist | autonomous
  const L = cu.MODE_LEVEL;
  if (tier === 'observe') {
    if (L[mode] < L.observe) return `computer-use mode ${mode} does not allow win observe; set computerUse.mode >= observe`;
    return null;
  }
  if (tier === 'assist') {
    if (L[mode] < L.assist) return `computer-use mode ${mode} does not allow win action; requires assist`;
    if (mode !== 'autonomous' && !approved) return `win action requires approval unless computerUse mode is autonomous`;
    return null;
  }
  // destructive
  if (!DESTRUCTIVE_ENABLED) return `destructive win tool disabled; set WINMCP_DESTRUCTIVE=1 to enable`;
  if (mode !== 'autonomous') return `destructive win tool requires computerUse mode=autonomous`;
  if (!approved) return `destructive win tool requires approved:true`;
  return null;
}

async function callWin(winName, tier, input) {
  const blocked = gate(tier, input && input.approved === true);
  if (blocked) return { ok: false, content: blocked };
  try {
    const client = await ensureClient();
    const args = { ...(input || {}) }; delete args.approved;
    const res = await client.callTool({ name: winName, arguments: args });
    const text = Array.isArray(res?.content)
      ? res.content.map((c) => c.text || JSON.stringify(c)).join('\n')
      : JSON.stringify(res);
    return { ok: !res?.isError, content: (text || '').slice(0, 8000) };
  } catch (e) {
    return { ok: false, content: `win_${winName} failed: ${e.message}` };
  }
}

function registerAll(registry) {
  for (const t of TOOLS) {
    registry.register({
      name: `win_${t.win.toLowerCase()}`,
      description: `[Windows-MCP · ${t.tier}] ${t.desc}`,
      inputSchema: { type: 'object', properties: { approved: { type: 'boolean', description: 'required for assist (unless autonomous) and destructive tiers' } }, additionalProperties: true },
      execute: (input) => callWin(t.win, t.tier, input || {}),
    });
  }
  return { count: TOOLS.length, names: TOOLS.map((t) => `win_${t.win.toLowerCase()}`) };
}

module.exports = { registerAll, shutdown, TOOLS, ensureClient };
