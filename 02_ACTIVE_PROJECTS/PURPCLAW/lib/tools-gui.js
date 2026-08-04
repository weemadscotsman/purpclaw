'use strict';

/**
 * lib/tools-gui.js — desktop GUI control as native PURPCLAW agent tools.
 *
 * Wraps lib/runtime/computer-use.js (Win32 SetCursorPos / mouse_event / SendKeys
 * + screen capture) so PURPCLAW's own agent brain gets eyes + hands — the same
 * "run my PC" capability that was previously only exposed outward to xiaozhi.
 *
 * SAFETY: every action goes through computer-use.execute(), which enforces the
 * `computerUse.enabled` + `computerUse.mode` (off | observe | assist | autonomous)
 * settings gate. So registering these tools is safe — the OS-control ones
 * (move/click/type/hotkey) THROW unless the operator has set assist+approval or
 * autonomous mode. The "big red button" is `computerUse.mode = autonomous`.
 *
 *   observe : gui_screenshot, gui_windows, gui_status   (see only)
 *   assist  : gui_move, gui_click, gui_type, gui_hotkey, gui_notify (act)
 */

const cu = require('./runtime/computer-use');

// ── Read-only vision reader: screenshot → VLM → structured understanding ──────
// Eyes→Brain. No mouse, no clicking — just "what's on screen + where + what next".
// Uses a vision model (default free NVIDIA nemotron VLM); override via env.
const VISION_PROVIDER = process.env.VISION_PROVIDER || 'nvidia';
const VISION_MODEL = process.env.VISION_MODEL || 'nvidia/nemotron-nano-12b-v2-vl';

const SEE_PROMPT = (w, h) => `You are PURPCLAW's screen reader. The attached image is the user's screen, ${w}x${h} pixels (0,0 = top-left). Analyze it and reply with ONLY a JSON object (no prose, no code fence) with these exact keys:
{
  "summary": "1-2 sentence description of what is on screen",
  "activeWindow": "the app/window that appears focused",
  "visibleText": ["key visible button/menu/label text", ...],
  "targets": [{"label":"button or element name","x":<int px>,"y":<int px>}, ...],
  "confidence": <0.0-1.0>,
  "recommendedAction": "the single next click/type/drag a human would do (describe, do NOT perform)",
  "risk": "safe" | "uncertain" | "blocked"
}
Coordinates must be pixel positions in THIS image. If the screen is unclear, set confidence low and recommendedAction to "wait/observe".`;

async function seeScreen(idx) {
  const screen = require('./screen-look');
  const cap = await screen.captureScreen(idx).catch((e) => ({ error: e.message }));
  if (!cap || cap.error || !cap.base64) return { ok: false, content: `screen capture failed: ${(cap && cap.error) || 'no image'}` };
  let llm;
  try { llm = require('./llm-provider'); } catch { return { ok: false, content: 'llm-provider unavailable' }; }
  const content = [
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cap.base64}`, detail: 'high' } },
    { type: 'text', text: SEE_PROMPT(cap.width, cap.height) },
  ];
  try {
    const resp = await llm.chat([{ role: 'user', content }], {
      provider: VISION_PROVIDER, model: VISION_MODEL, maxTokens: 800, temperature: 0.1, bypassSpendGate: false,
    });
    if (resp && resp.blocked) return { ok: false, content: `vision blocked: ${resp.error}` };
    const raw = (resp && resp.content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* model returned prose */ }
    return {
      ok: true,
      content: JSON.stringify({
        imageSize: { width: cap.width, height: cap.height },
        model: VISION_MODEL,
        reading: parsed || raw,
      }),
    };
  } catch (e) {
    return { ok: false, content: `vision read failed: ${e.message}` };
  }
}

// Run a computer-use action and shape it to the registry's {ok, content} contract.
async function run(action, args) {
  try {
    const result = await cu.execute(action, args, { approved: args && args.approved === true });
    return { ok: true, content: typeof result === 'string' ? result : JSON.stringify(result) };
  } catch (e) {
    // Gate rejections land here too (e.g. "mode observe does not allow click").
    return { ok: false, content: e.message };
  }
}

function registerAll(registry) {
  // ── OBSERVE (eyes) ──────────────────────────────────────────────
  registry.register({
    name: 'gui_screenshot',
    description: 'Capture the screen so the agent can see the desktop. Set vision:true to also get a VLM description. Requires computerUse mode >= observe.',
    inputSchema: { type: 'object', properties: { screen: { type: 'number', default: 1 }, vision: { type: 'boolean', default: false } } },
    execute: (args) => run('screenshot', args || {}),
  });
  registry.register({
    name: 'gui_windows',
    description: 'List open windows (id, process, title) — for finding/targeting an app window. Requires computerUse mode >= observe.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => run('windows', {}),
  });
  registry.register({
    name: 'gui_status',
    description: 'Report the current computer-use mode (off/observe/assist/autonomous) and session.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => run('status', {}),
  });
  registry.register({
    name: 'gui_see',
    description: 'READ-ONLY screen reader: capture the screen and run a vision model (VLM) over it. Returns structured JSON — summary, activeWindow, visibleText, clickable targets with pixel coords, confidence, recommendedAction (described, NOT performed), and a risk flag. No mouse/keyboard action. The eyes+brain for planning the next click.',
    inputSchema: { type: 'object', properties: { screen: { type: 'number', default: 1 } } },
    execute: (args) => seeScreen((args && args.screen) || 1),
  });

  // ── ASSIST (hands) — gated: need assist+approval or autonomous ───
  registry.register({
    name: 'gui_move',
    description: 'Move the mouse cursor to absolute screen coordinates (x, y). Requires computerUse mode assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, approved: { type: 'boolean' } }, required: ['x', 'y'] },
    execute: (args) => run('move', args || {}),
  });
  registry.register({
    name: 'gui_click',
    description: 'Click at absolute screen coordinates (x, y). button: "left" (default) or "right". Used for point-and-click / select. Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string', enum: ['left', 'right'], default: 'left' }, approved: { type: 'boolean' } }, required: ['x', 'y'] },
    execute: (args) => run('click', args || {}),
  });
  registry.register({
    name: 'gui_type',
    description: 'Type text at the current focus via SendKeys. Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, approved: { type: 'boolean' } }, required: ['text'] },
    execute: (args) => run('type', args || {}),
  });
  registry.register({
    name: 'gui_hotkey',
    description: 'Send a key combination via SendKeys syntax (e.g. "^s" for Ctrl+S, "%{F4}" for Alt+F4, "{ENTER}"). Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { keys: { type: 'string' }, approved: { type: 'boolean' } }, required: ['keys'] },
    execute: (args) => run('hotkey', args || {}),
  });
  registry.register({
    name: 'gui_double_click',
    description: 'Double-click at absolute screen coordinates (x, y). Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, approved: { type: 'boolean' } }, required: ['x', 'y'] },
    execute: (args) => run('double_click', args || {}),
  });
  registry.register({
    name: 'gui_drag',
    description: 'Press at (x,y), drag to (x2,y2), release — for box-selecting units or drag-and-drop. button "left" (default) or "right". Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' }, button: { type: 'string', enum: ['left', 'right'], default: 'left' }, approved: { type: 'boolean' } }, required: ['x', 'y', 'x2', 'y2'] },
    execute: (args) => run('drag', args || {}),
  });
  registry.register({
    name: 'gui_scroll',
    description: 'Scroll the mouse wheel. amount > 0 scrolls up, < 0 scrolls down (in notches). Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { amount: { type: 'number' }, approved: { type: 'boolean' } }, required: ['amount'] },
    execute: (args) => run('scroll', args || {}),
  });
  registry.register({
    name: 'gui_focus',
    description: 'Bring a window to the foreground by title substring or process id (pid). Ensures clicks land on the right app (e.g. the game window). Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, pid: { type: 'number' }, approved: { type: 'boolean' } } },
    execute: (args) => run('focus', args || {}),
  });
  registry.register({
    name: 'gui_notify',
    description: 'Show a desktop notification dialog (title, message). Requires assist+approval or autonomous.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, message: { type: 'string' }, approved: { type: 'boolean' } } },
    execute: (args) => run('notify', args || {}),
  });

  // ── KILL SWITCH — always works, can only make things safer ───────
  registry.register({
    name: 'gui_stop',
    description: 'EMERGENCY STOP: instantly disable all desktop control (sets computerUse mode = off). Always available regardless of mode. The kill switch.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => run('stop', {}),
  });
}

module.exports = { registerAll };
