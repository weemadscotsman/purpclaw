'use strict';
/**
 * lib/exec-policy.js — Codex CLI execpolicy parity + PURPCLAW approval queue.
 *
 * Codex execpolicy format: `~/.codex/policy.toml` or workspace `.codex/policy.toml`
 * with [allow] command patterns, [deny] command patterns, [network] rules.
 *
 * Storage: .purpclaw/policy.toml (or PURPCLAW_POLICY_FILE env var).
 *
 * TOML format:
 *   [allow]
 *   pattern = "git *"
 *   pattern = "npm install *"
 *
 *   [deny]
 *   pattern = "rm -rf /*"
 *
 *   [network]
 *   deny = ["tcp://api.github.com:443", "tcp://*:22"]
 *   allow = ["tcp://api.github.com:443"]
 *
 * Pattern syntax: fnmatch-style glob (no regex).
 * Network syntax: protocol://host:port (glob on host and port).
 *
 * ── PURPCLAW approval queue integration ────────────────────────────────────────
 * When a command matches DANGEROUS_PATTERNS in approval-queue.js, execution
 * is BLOCKED until the user approves via the gateway REST API or CLI.
 * YOLO mode (PURPCLAW_YOLO_MODE=1) bypasses all approvals.
 */

const fs = require('fs');
const path = require('path');

// ── Lazy imports (avoid circular) ───────────────────────────────────────────────
let _approvalQueue = null;
function approvalQueue() {
  if (!_approvalQueue) {
    try {
      _approvalQueue = require('./approval-queue');
    } catch {
      _approvalQueue = {
        detectDangerousCommand: () => ({ isDangerous: false }),
        requestApprovalAndWait: async () => ({ approved: true, approvalId: null, message: null }),
      };
    }
  }
  return _approvalQueue;
}

// ── Approval integration helper ─────────────────────────────────────────────────

/**
 * Check + block on dangerous command approval.
 * Returns the same shape as check() with an additional `approval` field.
 */
async function checkWithApproval(command, networkTarget, sessionKey) {
  const aq = approvalQueue();

  // Detect dangerous command
  const detection = aq.detectDangerousCommand(command);
  if (!detection.isDangerous) {
    return null; // No approval needed — caller uses normal result
  }

  // Request approval (blocks until resolved or timeout)
  const approvalResult = await aq.requestApprovalAndWait(
    sessionKey || aq.getCurrentSessionKey(),
    'terminal',
    command,
    detection.description
  );

  if (!approvalResult.approved) {
    return {
      allowed: false,
      matched: detection.pattern,
      source: 'approval',
      message: approvalResult.message,
      approvalId: approvalResult.approvalId,
    };
  }

  return {
    allowed: true,
    matched: detection.pattern,
    source: 'approval',
    approvalId: approvalResult.approvalId,
  };
}

// ── State dir ──────────────────────────────────────────────────────────────────

const POLICY_FILE = process.env.PURPCLAW_POLICY_FILE
  || path.join(STATE_DIR(), 'policy.toml');

function STATE_DIR() {
  const env = process.env.PURPCLAW_STATE_DIR;
  if (env) return env;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return home ? path.join(home, '.purpclaw') : path.join(process.cwd(), '.purpclaw');
}

const VERSION = '1.2.0';

// ── fnmatch glob matching ──────────────────────────────────────────────────────
function fnmatch(pattern, str) {
  const re = new RegExp('^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$');
  return re.test(str);
}

// ── TOML parser (minimal, handles the policy.toml format) ────────────────────
function parseTOML(raw) {
  const out = { allow: [], deny: [], network: { allow: [], deny: [] } };
  let section = null;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].trim();
    // Strip inline comments
    const commentIdx = l.indexOf('#');
    if (commentIdx >= 0) l = l.slice(0, commentIdx).trim();
    if (!l) continue;
    const sm = l.match(/^\[(allow|deny|network)\]$/);
    if (sm) { section = sm[1]; continue; }
    if (!section) continue;
    // pattern = "..."
    const pm = l.match(/^pattern\s*=\s*"?"([^"]*)"?\s*$/);
    if (pm) {
      if (section === 'allow') out.allow.push(pm[1].trim());
      else if (section === 'deny') out.deny.push(pm[1].trim());
      continue;
    }
    // deny = ["..."] or allow = ["..."] in [network] section
    const na = l.match(/^(allow|deny)\s*=\s*\[(.*)\]\s*$/);
    if (na && section === 'network') {
      const vals = na[2].match(/"([^"]*)"/g) || [];
      for (const v of vals) out.network[na[1]].push(v.replace(/"/g, '').trim());
      continue;
    }
    // shorthand: deny = "tcp://..." (single value, no array)
    const ns = l.match(/^(allow|deny)\s*=\s*"?"([^"]*)"?\s*$/);
    if (ns && section === 'network') {
      out.network[ns[1]].push(ns[2].trim());
    }
  }
  return out;
}

function serializeTOML(p) {
  let out = '# purpclaw execpolicy v1.2\n\n';
  out += '[allow]\n';
  if (!p.allow.length) out += '# (empty — all commands require explicit allow)\n';
  for (const x of p.allow) out += `pattern = "${x}"\n`;
  out += '\n[deny]\n';
  if (!p.deny.length) out += '# (empty)\n';
  for (const x of p.deny) out += `pattern = "${x}"\n`;
  out += '\n[network]\n';
  if (!p.network.allow.length && !p.network.deny.length) {
    out += '# (empty — network rules not configured)\n';
  }
  if (p.network.allow.length) {
    out += 'allow = [' + p.network.allow.map(v => `"${v}"`).join(', ') + ']\n';
  }
  if (p.network.deny.length) {
    out += 'deny = [' + p.network.deny.map(v => `"${v}"`).join(', ') + ']\n';
  }
  return out;
}

function load() {
  try {
    const raw = fs.readFileSync(POLICY_FILE, 'utf-8');
    return parseTOML(raw);
  } catch { return { allow: [], deny: [], network: { allow: [], deny: [] } }; }
}

function save(p) {
  try { fs.mkdirSync(path.dirname(POLICY_FILE), { recursive: true }); } catch {}
  fs.writeFileSync(POLICY_FILE, serializeTOML(p), 'utf-8');
}

// ── Command policy check ─────────────────────────────────────────────────────
function checkCommand(command) {
  const p = load();
  // Deny wins over allow.
  for (const pat of p.deny) if (fnmatch(pat, command)) return { allowed: false, matched: pat, source: 'deny' };
  for (const pat of p.allow) if (fnmatch(pat, command)) return { allowed: true, matched: pat, source: 'allow' };
  return { allowed: null, matched: null, source: 'no-policy' };
}

// ── Network policy check ─────────────────────────────────────────────────────
// Network target format: "tcp://host:port", "http://host:port", "udp://host:port"
// Globs: "tcp://*.github.com:443", "tcp://*:*"
function parseNetworkTarget(target) {
  const m = target.match(/^([^:]+):\/\/([^:]+):(\d+|\*)$/);
  if (!m) return null;
  return { protocol: m[1], host: m[2], port: m[3] };
}

function checkNetwork(target) {
  const p = load();
  const parsed = parseNetworkTarget(target);
  if (!parsed) return { allowed: null, matched: null, source: 'parse-error' };

  // Deny check
  for (const rule of p.network.deny) {
    const r = parseNetworkTarget(rule);
    if (!r) continue;
    if (r.protocol !== parsed.protocol && r.protocol !== '*') continue;
    if (!fnmatch(r.host, parsed.host)) continue;
    if (r.port !== '*' && r.port !== parsed.port) continue;
    return { allowed: false, matched: rule, source: 'network-deny' };
  }
  // Allow check
  for (const rule of p.network.allow) {
    const r = parseNetworkTarget(rule);
    if (!r) continue;
    if (r.protocol !== parsed.protocol && r.protocol !== '*') continue;
    if (!fnmatch(r.host, parsed.host)) continue;
    if (r.port !== '*' && r.port !== parsed.port) continue;
    return { allowed: true, matched: rule, source: 'network-allow' };
  }
  return { allowed: null, matched: null, source: 'no-network-policy' };
}

// ── Combined async check (command + dangerous approval + optional network) ──────
/**
 * @param {string} command
 * @param {string|null} networkTarget
 * @param {{ sessionKey?: string }} [opts]
 * @returns {Promise<{allowed: boolean|null, matched: string|null, source: string, approvalId?: string|null, message?: string|null}>}
 */
async function check(command, networkTarget, opts = {}) {
  const sessionKey = opts.sessionKey || (approvalQueue().getCurrentSessionKey ? approvalQueue().getCurrentSessionKey() : undefined);

  // 1. TOML policy deny/allow
  const cmdResult = checkCommand(command);
  if (cmdResult.allowed === false) return cmdResult;

  // 2. Dangerous command approval (BLOCKS until resolved)
  const approvalResult = await checkWithApproval(command, networkTarget, sessionKey);
  if (approvalResult !== null) {
    return approvalResult;
  }

  // 3. Network check
  if (networkTarget) {
    const netResult = checkNetwork(networkTarget);
    if (netResult.allowed === false) return netResult;
  }

  // 4. TOML allow (null = no policy, let it pass)
  return cmdResult;
}

// ── Sync combined check (for non-async callers — skips approval gate) ──────────
function checkSync(command, networkTarget) {
  const cmdResult = checkCommand(command);
  if (cmdResult.allowed === false) return cmdResult;
  if (networkTarget) {
    const netResult = checkNetwork(networkTarget);
    if (netResult.allowed === false) return netResult;
  }
  return cmdResult;
}

// ── Mutations ─────────────────────────────────────────────────────────────────
function allow(pattern)  { const p = load(); if (!p.allow.includes(pattern)) p.allow.push(pattern); save(p); return p; }
function deny(pattern)   { const p = load(); if (!p.deny.includes(pattern))  p.deny.push(pattern);  save(p); return p; }
function remove(pattern) { const p = load(); p.allow = p.allow.filter(x => x !== pattern); p.deny = p.deny.filter(x => x !== pattern); save(p); return p; }
function list() { return load(); }

/**
 * Amend the policy interactively or via flags.
 * Flags:
 *   --add-allow <pattern>
 *   --add-deny <pattern>
 *   --remove-allow <index|pattern>
 *   --remove-deny <index|pattern>
 *   --list (show current policy)
 * With no flags: interactive readline loop.
 *
 * Returns { ok, message, policy }
 */
function amend(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const p = load();

  // Non-interactive modes
  if (args.includes('--list')) {
    return { ok: true, message: 'current policy', policy: p };
  }

  let changed = false;

  // --add-allow
  const aaIdx = args.indexOf('--add-allow');
  if (aaIdx !== -1 && args[aaIdx + 1]) {
    const pat = args[aaIdx + 1];
    if (!p.allow.includes(pat)) { p.allow.push(pat); changed = true; }
    save(p);
    return { ok: true, message: `added allow: ${pat}`, policy: p };
  }

  // --add-deny
  const adIdx = args.indexOf('--add-deny');
  if (adIdx !== -1 && args[adIdx + 1]) {
    const pat = args[adIdx + 1];
    if (!p.deny.includes(pat)) { p.deny.push(pat); changed = true; }
    save(p);
    return { ok: true, message: `added deny: ${pat}`, policy: p };
  }

  // --remove-allow
  const raIdx = args.indexOf('--remove-allow');
  if (raIdx !== -1 && args[raIdx + 1]) {
    const target = args[raIdx + 1];
    const num = parseInt(target, 10);
    let removed = false;
    if (!isNaN(num) && num >= 0 && num < p.allow.length) {
      removed = p.allow.splice(num, 1)[0];
    } else {
      removed = p.allow.splice(p.allow.indexOf(target), 1)[0] || target;
    }
    if (removed) { save(p); }
    return { ok: true, message: `removed allow: ${removed}`, policy: p };
  }

  // --remove-deny
  const rdIdx = args.indexOf('--remove-deny');
  if (rdIdx !== -1 && args[rdIdx + 1]) {
    const target = args[rdIdx + 1];
    const num = parseInt(target, 10);
    let removed = false;
    if (!isNaN(num) && num >= 0 && num < p.deny.length) {
      removed = p.deny.splice(num, 1)[0];
    } else {
      removed = p.deny.splice(p.deny.indexOf(target), 1)[0] || target;
    }
    if (removed) { save(p); }
    return { ok: true, message: `removed deny: ${removed}`, policy: p };
  }

  // No flags: return policy for interactive caller to handle
  return { ok: true, message: 'interactive', policy: p };
}

function networkAllow(target) { const p = load(); if (!p.network.allow.includes(target)) p.network.allow.push(target); save(p); return p; }
function networkDeny(target)  { const p = load(); if (!p.network.deny.includes(target))  p.network.deny.push(target);  save(p); return p; }
function networkRemove(target) {
  const p = load();
  p.network.allow = p.network.allow.filter(x => x !== target);
  p.network.deny  = p.network.deny.filter(x => x !== target);
  save(p);
  return p;
}

// ── File watcher (for --watch mode) ─────────────────────────────────────────────
const watchers = new Map(); // POLICY_FILE → { watcher, callbacks[] }

function watch(callback) {
  if (watchers.has(POLICY_FILE)) {
    watchers.get(POLICY_FILE).callbacks.push(callback);
    return;
  }
  try {
    const dir = path.dirname(POLICY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const watcher = fs.watch(POLICY_FILE, (eventType) => {
      if (eventType === 'change') {
        for (const cb of watchers.get(POLICY_FILE).callbacks) {
          try { cb(); } catch {}
        }
      }
    });
    watchers.set(POLICY_FILE, { watcher, callbacks: [callback] });
  } catch {
    // Watch not supported — ignore
  }
}

function unwatch() {
  if (watchers.has(POLICY_FILE)) {
    watchers.get(POLICY_FILE).watcher.close();
    watchers.delete(POLICY_FILE);
  }
}

module.exports = {
  check, checkCommand, checkNetwork, checkSync,
  allow, deny, remove, list, amend,
  networkAllow, networkDeny, networkRemove,
  networkList: () => load().network,
  load, save, parseTOML, serializeTOML, fnmatch,
  watch, unwatch,
  VERSION, POLICY_FILE,
};
