'use strict';

/**
 * PARITY/hooks/engine.js
 *
 * OpenClaude-style Hooks runtime. PURPCLAW already has lib/hooks-runtime.js
 * for in-process events; this adapter exposes OC's 7-event contract over it:
 *
 *   1. UserPromptSubmit   — before sending user input to model
 *   2. PreToolUse         — before any tool executes
 *   3. PostToolUse        — after any tool returns
 *   4. Stop               — when the agent decides to halt
 *   5. SubagentStop       — when a spawned subagent halts
 *   6. SessionStart       — beginning of a session
 *   7. SessionEnd         — end of a session
 *
 * Hooks are matched against settings/hooks/*.kiro.hook (already present in repo)
 * PLUS any directory a config file points to. We resolve, validate, and emit.
 *
 * IMPORTANT: this engine is purely ADDITIVE. It calls lib/hooks-runtime.js but
 * never modifies it. Failure to dispatch is logged and never blocks the main loop.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOKS_DIR = path.join(ROOT, 'hooks');
const SETTINGS_HOOKS_DIR = path.join(ROOT, 'settings', 'hooks');

const OC_EVENTS = Object.freeze([
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
]);

let _ownRuntime = null;
try {
  _ownRuntime = require(path.join(ROOT, 'lib', 'hooks-runtime.js'));
} catch (_) {
  _ownRuntime = null;
}

// LIFECYCLE bus — single source of truth for all lifecycle events.
// PARITY_HOOKS emits → LIFECYCLE.fire() so both bus types receive every event.
let LIFECYCLE = null;
try {
  LIFECYCLE = require(path.join(ROOT, 'lib', 'hooks', 'lifecycle-bus.js'));
} catch (_) {
  LIFECYCLE = null;
}

/**
 * List hook files in a directory. Symlink-safe (no follow).
 *   filter: optional function(filename) -> boolean
 */
function listHookFiles(dir, filter) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  return entries
    .filter((e) => e.isFile() || e.isSymbolicLink())
    .map((e) => e.name)
    .filter((n) => n.endsWith('.hook'))
    .filter((n) => (filter ? filter(n) : true))
    .map((n) => path.join(dir, n));
}

/**
 * Parse a .kiro.hook file body. Supports TWO formats:
 *
 * Format 1 — JSON (actual format in hooks/*.kiro.hook):
 *   { when: { type: "preToolUse" }, then: { type: "runCommand", command: "..." } }
 *   { when: { type: "agentStop" }, then: { type: "askAgent", prompt: "..." } }
 *
 * Format 2 — Comment format (OC spec):
 *   # event: PreToolUse
 *   # match: tool == "Bash"
 *   # command: <shell-or-node-script>
 *
 * kiro when.type → OC event mapping:
 *   preToolUse   → PreToolUse
 *   postToolUse  → PostToolUse
 *   agentStop    → Stop        (fires when agent halts)
 *   SubagentStop → SubagentStop
 *   sessionStart → SessionStart
 *   sessionEnd   → SessionEnd
 *   userTriggered→ (manual only — do not auto-fire)
 *   fileEdited   → (no OC equivalent — skipped)
 *   fileCreated  → (no OC equivalent — skipped)
 */
function parseHookFile(filePath) {
  let body = '';
  try {
    body = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }

  const trimmed = body.trim();

  // Format 1: JSON (detected by leading '{')
  if (trimmed.startsWith('{')) {
    let obj;
    try { obj = JSON.parse(trimmed); } catch (_) { return null; }
    if (!obj || !obj.when || !obj.then) return null;
    const when = obj.when;
    const then = obj.then;

    // Map kiro event type → OC event
    // userTriggered hooks are loaded but NOT auto-fired (emit() skips them)
    const typeMap = {
      'pretooluse':   'PreToolUse',
      'posttooluse':  'PostToolUse',
      'precompact':   'PreCompact',
      'postcompact':  'PostCompact',
      'userpromptsubmit': 'UserPromptSubmit',
      'agentstop':    'Stop',
      'subagentstop': 'SubagentStop',
      'error':        'Error',
      'sessionstart': 'SessionStart',
      'sessionend':   'SessionEnd',
      'usertriggered': '__USER_TRIGGERED__', // loaded but skipped in emit()
    };
    const ocEvent = typeMap[(when.type || '').toLowerCase()];
    if (!ocEvent) return null;

    // Extract match condition from when.patterns if present
    const match = Array.isArray(when.patterns)
      ? when.patterns.join(',')
      : null;

    // then.type → action
    const thenType = (then.type || '').toLowerCase();
    if (thenType === 'runcommand') {
      return {
        file: filePath,
        event: ocEvent,
        match,
        command: then.command || null,
        actionType: 'runCommand',
        enabled: obj.enabled !== false,
      };
    } else if (thenType === 'askagent') {
      // askAgent requires cognitive spine — record for future wiring
      return {
        file: filePath,
        event: ocEvent,
        match,
        command: null,
        actionType: 'askAgent',
        prompt: then.prompt || null,
        enabled: obj.enabled !== false,
      };
    }
    return null;
  }

  // Format 2: Comment format (OC spec)
  const out = { file: filePath, event: null, match: null, command: null };
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('#')) continue;
    const m = line.match(/^#\s*([A-Za-z]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (k === 'event') out.event = v;
    else if (k === 'match') out.match = v;
    else if (k === 'command') out.command = v;
  }
  if (!out.event) return null;
  // Allow OC_EVENTS + userTriggered (manual-only, not auto-fired)
  if (!OC_EVENTS.includes(out.event) && out.event !== 'userTriggered') return null;
  if (!out.command) return null;
  return { ...out, actionType: 'runCommand', userTriggered: out.event === 'userTriggered' };
}

/**
 * Load all hooks, dedup by {event,command}. Read-only file ops.
 */
function loadAll() {
  const out = [];
  for (const dir of [HOOKS_DIR, SETTINGS_HOOKS_DIR]) {
    for (const file of listHookFiles(dir)) {
      const parsed = parseHookFile(file);
      if (!parsed) continue;
      out.push(parsed);
    }
  }
  // Dedup by event + command + actionType (+ prompt for askAgent hooks which are content-distinct).
  // Two askAgent hooks on same event with different prompts are both legitimate.
  const seen = new Set();
  return out.filter((h) => {
    const keyPrompt = h.actionType === 'askAgent' ? (h.prompt || '').slice(0, 60) : '';
    const k = `${h.event}|${h.command}|${h.actionType}|${keyPrompt}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Evaluate a matcher expression against a context.
 * Supports OC matchers: tool == "Bash", tool == "Edit", name == "filename"
 * Returns true if the hook should fire for the given ctx.
 */
function evaluateMatcher(matcher, ctx) {
  if (!matcher) return true;
  const tool = ctx.tool || '';
  const toolMatch = matcher.match(/tool\s*==\s*"([^"]+)"/);
  if (toolMatch) return tool === toolMatch[1];
  // Glob-style fallback: tool name contains the match string
  return tool.includes(matcher) || matcher.includes(tool);
}

/**
 * Filter hooks for a specific event + optional matcher string (e.g. tool == "Bash").
 */
function hooksFor(event, matcher) {
  const all = loadAll();

  // Merge plugin-registered hooks from plugin-manager if available.
  // Plugins register via pluginManager.registerHook(event, handler, options).
  // These participate in the same match/dispatch as file-based hooks.
  let pluginHooks = [];
  try {
    const pm = require(path.join(ROOT, 'lib', 'plugin-manager.js'));
    // pm.hooks is a Map<event, [{plugin, handler, priority, matcher}]>
    if (pm.hooks instanceof Map) {
      const eventHooks = pm.hooks.get(event) || [];
      pluginHooks = eventHooks.map((h) => ({
        event,
        actionType: 'runCommand',
        command: null,
        plugin:    h.plugin,
        priority:  h.priority || 50,
        matcher:   h.matcher  || null,
        _handler:  h.handler,
      }));
    }
  } catch (_) { /* plugin-manager not available */ }

  const combined = [...all, ...pluginHooks];

  return combined.filter((h) => {
    if (h.event !== event && h.event !== '__USER_TRIGGERED__') return false;
    return evaluateMatcher(matcher || null, { tool: matcher || '' });
  });
}

/**
 * Emit hooks of a given event. Non-blocking wrapper around the existing
 * lib/hooks-runtime.js emit() if available, else no-op (never throws).
 *
 *   event: one of OC_EVENTS
 *   ctx:   { tool?, input?, output?, sessionId?, userPrompt? }
 *
 * Returns: array of { hook, ok, error? }
 */
function emit(event, ctx = {}) {
  if (!OC_EVENTS.includes(event)) {
    return [{ hook: null, ok: false, error: `unknown event ${event}` }];
  }
  // userTriggered hooks are manual-only — skip auto-firing
  const list = hooksFor(event, ctx.tool).filter((h) => h.event !== '__USER_TRIGGERED__');
  const results = [];

  for (const h of list) {
    // askAgent hooks — fire into cognitive spine instead of spawning a process
    if (h.actionType === 'askAgent') {
      // Wire to cognitive spine via memory-client when available
      const payload = {
        event,
        sessionId: ctx.sessionId || 'parity-default',
        tool: ctx.tool || null,
        input: ctx.input || null,
        output: ctx.output || null,
        userPrompt: h.prompt || null,
        hookFile: h.file,
      };
      try {
        const mem = require(path.join(ROOT, 'lib', 'memory-client.js'));
        if (mem && typeof mem.ingest === 'function') {
          mem.ingest({ type: 'hook', content: h.prompt || '', metadata: payload }).catch(() => {});
        }
      } catch (_) { /* cognitive spine not available */ }
      results.push({
        hook: h,
        ok: true,
        actionType: 'askAgent',
        note: 'fired to cognitive spine (no command)',
      });
      continue;
    }

    // runCommand hooks — spawn the command
    if (!h.command) {
      results.push({ hook: h, ok: false, error: 'no command to run' });
      continue;
    }

    try {
      const payload = {
        event,
        sessionId: ctx.sessionId || 'parity-default',
        tool: ctx.tool || null,
        input: ctx.input || null,
        output: ctx.output || null,
        userPrompt: ctx.userPrompt || null,
      };
      const env = Object.assign({}, process.env, {
        PURPCLAW_HOOK_EVENT: event,
        PURPCLAW_HOOK_PAYLOAD: JSON.stringify(payload),
      });

      const cp = require('child_process');
      const child = cp.spawn(h.command, {
        env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr.on('data', (b) => { stderr += b.toString(); });
      child.on('error', (e) => {
        results.push({ hook: h, ok: false, error: e.message });
      });
      child.on('close', (code) => {
        results.push({
          hook: h,
          ok: code === 0,
          code,
          stderr: stderr.trim().slice(0, 500) || undefined,
        });
      });
    } catch (err) {
      results.push({ hook: h, ok: false, error: err.message });
    }
  }

  // Delegate to the canonical LIFECYCLE bus so all hook events land in one place.
  // PARITY_HOOKS emits → LIFECYCLE.fire() → both bus types receive.
  if (LIFECYCLE && typeof LIFECYCLE.emit === 'function') {
    try {
      LIFECYCLE.emit(event, ctx);
    } catch (_) { /* swallow — never block */ }
  }

  return results;
}

/**
 * Public read-only inspector for the orchestrator / settings UI.
 */
function listEvents() {
  return [...OC_EVENTS];
}

function listAll() {
  return loadAll().map((h) => ({
    event: h.event === '__USER_TRIGGERED__' ? 'userTriggered' : h.event,
    match: h.match || '*',
    command: h.command || null,
    file: h.file,
    actionType: h.actionType || (h.command ? 'runCommand' : 'unknown'),
    prompt: h.prompt || null,
    userTriggered: h.event === '__USER_TRIGGERED__' || h.userTriggered === true || false,
  }));
}

module.exports = {
  events: OC_EVENTS,
  emit,
  hooksFor,
  loadAll,
  listEvents,
  listAll,
};
