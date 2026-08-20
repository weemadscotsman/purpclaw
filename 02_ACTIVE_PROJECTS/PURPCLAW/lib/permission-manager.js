'use strict';

/**
 * lib/permission-manager.js — Canonical permission evaluator for PURPCLAW.
 *
 * One file, one evaluation path. All surfaces (CLI, HTTP, MCP, subagent)
 * MUST route tool calls through here. No surface may call raw shell exec
 * or bypass this evaluator.
 *
 * Policy tiers (6 required by P0-B):
 *   trusted            — full workspace read/write; governance defers for shell/net/destructive
 *   workspace-write    — workspace read+write; shell/network/destructive blocked
 *   workspace-read-only— workspace read-only; all mutations blocked
 *   sandboxed          — sandboxed execution only (node/python/shell in temp dir)
 *   deny-by-default    — everything blocked unless explicitly allow-listed
 *   unattended-safe-mode — autonomous/background-safe; no destructive/mutating ops
 *
 * Each tier's `evaluate(tool)` returns:
 *   { action: 'allow' | 'deny' | 'ask' | 'defer',
 *     profile: string,
 *     explicit: boolean }
 *
 * The optional `canExecute(tool, context)` function bundles evaluation
 * with a profile + operator-context into a single go/no-go boolean
 * so callers don't have to re-evaluate the same inputs every time.
 *
 * Usage in surfaces:
 *   const PERMS = require('./permission-manager');
 *
 *   // Basic evaluation
 *   const result = PERMS.evaluate('shell', { profile: 'standard' });
 *   if (result.action === 'deny') return { ok: false, error: 'denied' };
 *
 *   // Bundled check
 *   const allowed = PERMS.canExecute('write', {
 *     profile: 'standard',
 *     operatorInitiated: false,
 *   });
 *   if (!allowed) return { ok: false, error: 'permission denied' };
 *
 *   // List all profiles
 *   const profiles = PERMS.list();
 */

const BUILTINS = Object.freeze({
  // ── Existing profiles ────────────────────────────────────────────────────────
  plan: {
    description: 'Read-only planning and inspection',
    allow: ['read', 'list', 'glob', 'search', 'repo.map', 'event.list', 'event.replay',
      'attachment.get', 'attachment.list', 'artifact.get', 'artifact.list', 'mcp.resources', 'mcp.prompts'],
    deny: ['*'],
  },
  standard: {
    description: 'Read automatically; ask before mutation or execution',
    allow: ['read', 'list', 'glob', 'search', 'repo.map', 'event.list', 'event.replay',
      'attachment.get', 'attachment.list', 'artifact.get', 'artifact.list'],
    ask: ['*'],
  },
  trusted: {
    description: 'Allow workspace reads and edits; retain governance for shell/network/destructive actions',
    allow: ['read', 'list', 'glob', 'search', 'write', 'edit', 'repo.map',
      'attachment.*', 'artifact.*'],
    defer: ['*'],
  },
  autonomous: {
    description: 'Fail closed for unattended runs unless explicitly allowed',
    allow: ['read', 'list', 'glob', 'search', 'repo.map'],
    ask: ['*'],
  },
  dangerous: {
    description: 'Allow all tools without permission prompts',
    allow: ['*'],
  },

  // ── New P0-B policy tiers ──────────────────────────────────────────────────
  'workspace-write': {
    description: 'Workspace read and write; shell, network, and destructive operations blocked',
    allow: ['read', 'list', 'glob', 'search', 'write', 'edit', 'mkdir', 'copy', 'move',
      'repo.map', 'attachment.*', 'artifact.*'],
    deny: ['shell', 'bash', 'terminal', 'execute', 'npm_install', 'pip_install', 'choco',
      'taskkill', 'svc_start', 'svc_stop', 'svc_restart', 'shutdown', 'restart',
      'delete', 'symlink', 'power', 'traceroute', 'portscan', 'curl', 'wget',
      'reg_read', 'reg_write', 'reg_delete', '*_mcp', 'mcp__*', 'mcp.*',
      'win_powershell', 'win_registry', 'win_process', 'win_filesystem'],
  },
  'workspace-read-only': {
    description: 'Read-only access to workspace; all mutations blocked',
    // These are the REGISTERED tool names. The list previously used 'list',
    // 'glob' and 'search', which no tool is called, so Read Only refused ls,
    // find, grep, tree, code-search, web-fetch and curl — every one of them a
    // pure read. Read Only means "read anything, change nothing", including
    // reading websites and searching the machine.
    allow: ['read', 'ls', 'find', 'grep', 'tree', 'du', 'code-search', 'repo.map',
      'event.list', 'event.replay',
      'attachment.get', 'attachment.list', 'artifact.get', 'artifact.list',
      // web-fetch only: `curl` accepts arbitrary methods and `git` can commit,
      // so neither belongs on a read-only rung. Both stay available from
      // Review upward, which is where mutation is meant to happen.
      'web-fetch', 'news', 'weather', 'csv_analyze',
      'cpu', 'memory', 'memory_check', 'disk', 'uptime', 'osinfo', 'env', 'sensors',
      'drives', 'whoami', 'hosts', 'systeminfo', 'window_list', 'resolution',
      'tasklist', 'top', 'svc_list', 'clipboard_read',
      'netstat', 'ping', 'dns', 'ifconfig', 'traceroute',
      'stm', 'neo_ledger', 'chaos_status'],
    deny: ['write', 'edit', 'delete', 'mkdir', 'copy', 'move', 'symlink', 'touch',
      'npm_install', 'pip_install', 'choco', 'taskkill', 'svc_start', 'svc_stop',
      'svc_restart', 'shutdown', 'restart', 'lock', 'browser_open', 'clipboard_write',
      // traceroute is a pure read and lives in `allow` above; leaving it here
      // too meant deny silently won and the allow entry was dead.
      'notify', 'portscan', 'curl', 'wget', '*_mcp', 'mcp__*', 'mcp.*',
      'win_powershell', 'win_registry', 'win_process', 'win_filesystem', 'win_*',
      'shell', 'bash', 'terminal', 'execute',
      // Catch-all. A read-only tier defined by a blocklist is not read-only:
      // any tool the list forgot (write_file, fs_write, edit_file, …) fell
      // through to 'ask', and operator-initiated calls treat 'ask' as yes.
      // Explicit entries in `allow` still win — they are matched before this.
      '*'],
  },
  sandboxed: {
    description: 'Only sandboxed execution (temp dir, stripped env, no filesystem outside sandbox)',
    allow: ['read', 'list', 'glob', 'search', 'sandbox_node', 'sandbox_python', 'sandbox_shell',
      'sandbox_run', 'cpu', 'memory', 'uptime', 'osinfo', 'drives'],
    deny: ['write', 'edit', 'delete', 'shell', 'bash', 'terminal', 'execute',
      'npm_install', 'pip_install', 'choco', 'taskkill', 'svc_*', 'shutdown', 'restart',
      'lock', 'browser_open', 'clipboard_write', 'notify', 'curl', 'wget', 'traceroute',
      '*_mcp', 'mcp__*', 'mcp.*', 'win_*', 'reg_*', 'read_file', 'write_file',
      'read_directory', 'find', 'du', 'tree'],
  },
  'deny-by-default': {
    description: 'Deny everything unless explicitly allow-listed — zero-trust baseline',
    allow: [],
    deny: ['*'],
  },
  'unattended-safe-mode': {
    description: 'Safe for autonomous/background runs; destructive and mutating ops deferred for approval',
    allow: ['read', 'list', 'glob', 'search', 'repo.map', 'event.list', 'event.replay',
      'artifact.get', 'artifact.list', 'attachment.get', 'attachment.list', 'cpu', 'memory',
      'disk', 'uptime', 'osinfo', 'drives', 'whoami', 'window_list', 'netstat', 'ping'],
    ask: ['write', 'edit', 'delete', 'mkdir', 'copy', 'move', 'symlink', 'touch',
      'npm_install', 'pip_install', 'choco', 'taskkill', 'svc_*', 'shutdown', 'restart',
      'lock', 'browser_open', 'browser_screenshot', 'clipboard_read', 'clipboard_write',
      'notify', 'env', 'sensors', 'tree', 'du', 'find', 'ls', 'systeminfo',
      'hosts', 'dns', 'ifconfig', 'traceroute', 'portscan', 'curl', 'wget',
      '*_mcp', 'mcp__*', 'mcp.*', 'win_*', 'reg_*'],
    deny: ['shell', 'bash', 'terminal', 'execute', 'win_powershell', 'win_registry',
      'win_process', 'win_filesystem', 'sandbox_*'],
  },
});

// ── Pattern matching ──────────────────────────────────────────────────────────

/**
 * Match a glob-like pattern against a value.
 * Supports: * (any chars), ? (single char), ** (any path segment).
 */
function match(pattern, value) {
  if (pattern === '*') return true;
  // Escape regex metacharacters first, then expand glob * to .*
  const regex = new RegExp(
    '^' +
    pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\x00GLOBSTAR\x00')   // protect **
      .replace(/\*/g, '.*')                    // glob * → regex .*
      .replace('\x00GLOBSTAR\x00', '.*')       // ** → .*
      .replace(/\?/g, '.') +
    '$',
    'i'
  );
  return regex.test(value);
}

/**
 * Evaluate a tool against a permission profile.
 * @param {string} profile — profile name or an inline profile object
 * @param {string} tool — tool name to evaluate
 * @returns {{ action: 'allow' | 'deny' | 'ask' | 'defer', profile: string, explicit: boolean }}
 */
function evaluate(profile, tool) {
  const config = typeof profile === 'string' ? (BUILTINS[profile] || BUILTINS.standard) : profile;

  // Priority order: deny → allow → ask → defer
  for (const action of ['deny', 'allow', 'ask', 'defer']) {
    const patterns = config[action] || [];
    // First pass: exact wildcard match (explicit: true)
    for (const pattern of patterns) {
      if (pattern !== '*' && match(pattern, tool)) {
        return { action, profile: config.name || profile, explicit: true };
      }
    }
  }

  // Second pass: wildcard-only entries
  for (const action of ['deny', 'allow', 'ask', 'defer']) {
    const patterns = config[action] || [];
    for (const pattern of patterns) {
      if (pattern === '*') return { action, profile: config.name || profile, explicit: false };
    }
  }

  // Default: ask
  return { action: 'ask', profile: config.name || profile, explicit: false };
}

/**
 * Bundled permission + operator-context check.
 * Returns true if the tool may execute without further approval.
 *
 * @param {string} tool — tool name
 * @param {{ profile?: string, operatorInitiated?: boolean }} context
 * @returns {boolean}
 */
function canExecute(tool, context = {}) {
  const profile = context.profile || 'standard';
  const result = evaluate(profile, tool);

  if (result.action === 'allow') return true;
  if (result.action === 'deny') return false;

  // 'ask' or 'defer' — check if operator-initiated bypass applies
  if (result.action === 'ask' || result.action === 'defer') {
    // Operator-typed commands bypass ask/defer in non-paranoid mode
    if (context.operatorInitiated === true) return true;
  }

  return false;
}

/**
 * Check if a tool is allow-listed (no prompt needed) in a given profile.
 */
function isAllowed(tool, profile) {
  const r = evaluate(profile, tool);
  return r.action === 'allow';
}

/**
 * Check if a tool requires approval in a given profile.
 */
function requiresApproval(tool, profile) {
  const r = evaluate(profile, tool);
  return r.action === 'ask' || r.action === 'defer';
}

/**
 * List all available permission profiles.
 * @returns {Array<{name: string, description: string, allow: string[], deny: string[], ask: string[], defer: string[]}>}
 */
function list() {
  return Object.entries(BUILTINS).map(([name, value]) => ({ name, ...value }));
}

/**
 * Get a specific profile by name.
 */
function getProfile(name) {
  return BUILTINS[name] || null;
}

module.exports = {
  evaluate,
  canExecute,
  isAllowed,
  requiresApproval,
  list,
  getProfile,
  match,
  BUILTINS,
};
