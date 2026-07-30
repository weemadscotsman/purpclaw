'use strict';

/**
 * lib/commands/hooks.js
 * purpclaw hooks — list, add, run, enable, disable kiro hooks
 *
 * Codex parity: codex hooks CLI
 * Hook event types: PreToolUse, PostToolUse, PreCompact, PostCompact,
 *   SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop,
 *   PermissionRequest, Stop
 *
 * Hook file format: JSON { name, version, enabled, description, when: {type, patterns?}, then: {type, ...} }
 * Wire: parity/hooks/engine.js — parseHookFile() handles kiro format
 */

const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..', '..', 'hooks');
const SETTINGS_HOOKS_DIR = path.join(__dirname, '..', '..', 'settings', 'hooks');
const OC_EVENTS = Object.freeze([
  'PreToolUse', 'PostToolUse', 'PreCompact', 'PostCompact',
  'SessionStart', 'SessionEnd', 'UserPromptSubmit',
  'SubagentStart', 'SubagentStop', 'PermissionRequest', 'Stop',
]);

const OC_EVENTS_WITH_MATCHERS = Object.freeze([
  'PreToolUse', 'PostToolUse', 'PreCompact', 'PostCompact',
  'SessionStart', 'SessionEnd', 'SubagentStart', 'SubagentStop',
]);

// kiro when.type → OC event mapping
const TYPE_MAP = {
  'pretooluse': 'PreToolUse',
  'posttooluse': 'PostToolUse',
  'precompact': 'PreCompact',
  'postcompact': 'PostCompact',
  'sessionstart': 'SessionStart',
  'sessionend': 'SessionEnd',
  'userpromptsubmit': 'UserPromptSubmit',
  'subagentstart': 'SubagentStart',
  'subagentstop': 'SubagentStop',
  'permissionrequest': 'PermissionRequest',
  'agentstop': 'Stop',
};

function hookFiles(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return []; }
  return entries
    .filter(e => e.isFile() || e.isSymbolicLink())
    .map(e => e.name)
    .filter(n => n.endsWith('.kiro.hook') || n.endsWith('.hook'))
    .map(n => path.join(dir, n));
}

function readHook(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (raw.startsWith('{')) {
      return JSON.parse(raw);
    }
    // Comment format: # event: PreToolUse / # command: ...
    const obj = { name: path.basename(filePath), enabled: true };
    for (const line of raw.split('\n')) {
      const m = line.match(/^#\s*(\w+)\s*:\s*(.*)$/);
      if (!m) continue;
      const [, k, v] = m;
      if (k === 'event') obj.when = { type: v };
      else if (k === 'command') obj.then = { type: 'runCommand', command: v };
      else if (k === 'match') obj.match = v;
    }
    return obj;
  } catch { return null; }
}

function allHooks() {
  const out = [];
  const seen = new Set();
  for (const dir of [HOOKS_DIR, SETTINGS_HOOKS_DIR]) {
    for (const f of hookFiles(dir)) {
      const h = readHook(f);
      if (!h) continue;
      const ocEvent = h.when && h.when.type
        ? (TYPE_MAP[h.when.type.toLowerCase()] || h.when.type)
        : null;
      const key = `${h.name}|${ocEvent || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: h.name,
        file: f,
        enabled: h.enabled !== false,
        event: ocEvent,
        match: h.when?.patterns || null,
        action: h.then?.type || null,
        prompt: h.then?.prompt || null,
        command: h.then?.command || null,
        description: h.description || '',
      });
    }
  }
  return out;
}

function listHooks(json) {
  const hooks = allHooks();
  if (!hooks.length) {
    return json ? [] : 'No hooks registered.\nPlace hook files in hooks/*.kiro.hook or settings/hooks/*.kiro.hook';
  }
  if (json) {
    return JSON.stringify({ hooks, events: OC_EVENTS }, null, 2);
  }
  const lines = [`PURPCLAW HOOKS  (${hooks.length} registered)`, ''];
  lines.push(`Supported events: ${OC_EVENTS.join(', ')}`);
  lines.push(`Match-capable events: ${OC_EVENTS_WITH_MATCHERS.join(', ')}`);
  lines.push('');
  for (const h of hooks) {
    const status = h.enabled ? 'ON ' : 'OFF';
    lines.push(`  [${status}] ${h.name}`);
    lines.push(`    event:   ${h.event || 'unknown'}`);
    if (h.match) lines.push(`    match:   ${h.match.join(', ')}`);
    if (h.description) lines.push(`    desc:    ${h.description}`);
    if (h.action) lines.push(`    action:  ${h.action}`);
    if (h.command) lines.push(`    command: ${h.command}`);
    if (h.prompt) lines.push(`    prompt:  ${h.prompt.slice(0, 80)}…`);
    lines.push(`    file:    ${path.relative(HOOKS_DIR, h.file) || h.file}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

function addHook(srcPath, json) {
  const src = path.resolve(srcPath);
  if (!fs.existsSync(src)) {
    return json
      ? JSON.stringify({ ok: false, error: `source file not found: ${src}` })
      : `error: source file not found: ${src}`;
  }
  const h = readHook(src);
  if (!h || !h.name) {
    return json
      ? JSON.stringify({ ok: false, error: 'invalid hook file — could not parse name' })
      : `error: invalid hook file: ${src}`;
  }
  const dest = path.join(HOOKS_DIR, h.name + '.kiro.hook');
  try {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.copyFileSync(src, dest);
    const result = { ok: true, name: h.name, file: dest };
    return json ? JSON.stringify(result, null, 2) : `✓ hook '${h.name}' added → ${dest}`;
  } catch (e) {
    return json
      ? JSON.stringify({ ok: false, error: e.message })
      : `error: ${e.message}`;
  }
}

function enableHook(name, enabled, json) {
  const hooks = allHooks();
  const h = hooks.find(x => x.name === name);
  if (!h) {
    return json
      ? JSON.stringify({ ok: false, error: `hook not found: ${name}` })
      : `error: hook not found: ${name}`;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(h.file, 'utf-8'));
    raw.enabled = enabled;
    fs.writeFileSync(h.file, JSON.stringify(raw, null, 2), 'utf-8');
    const result = { ok: true, name, enabled };
    return json ? JSON.stringify(result, null, 2) : `✓ hook '${name}' ${enabled ? 'enabled' : 'disabled'}`;
  } catch (e) {
    return json
      ? JSON.stringify({ ok: false, error: e.message })
      : `error: ${e.message}`;
  }
}

async function runHook(name, ctx, json) {
  // Dynamically require parity/hooks/engine to avoid circular deps
  let engine;
  try {
    engine = require(path.join(__dirname, '..', '..', 'parity', 'hooks', 'engine.js'));
  } catch {
    return json
      ? JSON.stringify({ ok: false, error: 'parity/hooks/engine.js not found' })
      : 'error: parity/hooks/engine.js not found';
  }
  const hooks = allHooks();
  const h = hooks.find(x => x.name === name);
  if (!h) {
    return json
      ? JSON.stringify({ ok: false, error: `hook not found: ${name}` })
      : `error: hook not found: ${name}`;
  }
  if (!h.event) {
    return json
      ? JSON.stringify({ ok: false, error: `hook ${name} has no event type` })
      : `error: hook ${name} has no event type — cannot emit`;
  }
  if (!h.enabled) {
    return json
      ? JSON.stringify({ ok: false, error: `hook '${name}' is disabled` })
      : `error: hook '${name}' is disabled — enable first`;
  }
  const results = engine.emit(h.event, ctx || {});
  const out = { ok: true, hook: name, event: h.event, results };
  return json ? JSON.stringify(out, null, 2) : `✓ emitted '${name}' (${h.event}) → ${results.length} handler(s)\n${results.map(r => `  ${r.ok ? '✓' : '✗'} ${r.hook?.command || r.hook?.actionType || '?'} [${r.code ?? r.error ?? 'ok'}]`).join('\n')}`;
}

async function run(args, ctx = {}) {
  const sub = (args[0] || 'list').toLowerCase();
  const rest = args.slice(1);
  const json = args.includes('--json') || args.includes('--json-output');
  const cleanArgs = args.filter(a => !a.startsWith('--'));

  if (sub === 'list' || sub === 'ls') {
    const out = listHooks(json);
    if (out) console.log(out);
    return;
  }
  if (sub === 'add') {
    const src = cleanArgs[1];
    if (!src) {
      console.log('usage: purpclaw hooks add <hook-file.kiro.hook> [--json]');
      return 1;
    }
    const out = addHook(src, json);
    console.log(out);
    return;
  }
  if (sub === 'enable') {
    const name = cleanArgs[1];
    if (!name) { console.log('usage: purpclaw hooks enable <name> [--json]'); return 1; }
    console.log(enableHook(name, true, json));
    return;
  }
  if (sub === 'disable') {
    const name = cleanArgs[1];
    if (!name) { console.log('usage: purpclaw hooks disable <name> [--json]'); return 1; }
    console.log(enableHook(name, false, json));
    return;
  }
  if (sub === 'run') {
    const name = cleanArgs[1];
    if (!name) { console.log('usage: purpclaw hooks run <name> [--json]'); return 1; }
    const out = await runHook(name, { sessionId: process.env.PURPCLAW_SESSION_ID }, json);
    console.log(out);
    return;
  }
  if (sub === 'events' || sub === 'event') {
    if (json) {
      console.log(JSON.stringify({ events: OC_EVENTS, matchers: OC_EVENTS_WITH_MATCHERS }, null, 2));
    } else {
      console.log('Hook events:');
      for (const e of OC_EVENTS) {
        const has = OC_EVENTS_WITH_MATCHERS.includes(e) ? ' (matcher)' : '';
        console.log(`  ${e}${has}`);
      }
    }
    return;
  }

  // Help / unknown
  console.log(`purpclaw hooks — Codex-style hook management
  purpclaw hooks list                      list all hooks
  purpclaw hooks add <file>                add a hook file
  purpclaw hooks run <name>                fire a hook by name
  purpclaw hooks enable <name>            enable a hook
  purpclaw hooks disable <name>           disable a hook
  purpclaw hooks events                    list supported hook events
  purpclaw hooks --json                   JSON output (append to any subcommand)
`);
}

module.exports = { run };
