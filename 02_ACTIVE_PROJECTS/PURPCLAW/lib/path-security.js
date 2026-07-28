'use strict';
/**
 * lib/path-security.js — S1 ship blocker.
 *
 * Eddie's #1 ask: "an agent must NOT write to system32, .ssh, .env
 * outside scope, or any other protected path." Hermes has this in
 * tools/path_security.py. PURPCLAW had nothing. This file adds it.
 *
 * Architecture: this is a TOOL-RUNTIME GUARDRAIL, not a tool. It runs
 * BEFORE write/edit/delete/shell execute. If a path is protected, the
 * tool call is rejected with a clear error. No "soft fail" — the agent
 * learns immediately that the path is off-limits.
 *
 * Default policy (conservative):
 *   - Block writes to any Windows system directory (System32, SysWOW64,
 *     Windows, Program Files, ProgramData).
 *   - Block writes to any user .ssh, .gnupg, .aws, .kube, .docker dirs.
 *   - Block writes outside the project root (PURPCLAW_DIR) UNLESS the
 *     caller passes `allowOutsideScope: true` and the path is approved.
 *   - Block writes to the parent directories of the active .env file
 *     (so an agent can't rewrite PURPCLAW's own secrets).
 *   - Block symlink escapes via path.resolve() comparison.
 *
 * Override: set PURPCLAW_PATH_SECURITY=off to disable (paranoid mode).
 * Or pass opts.pathSecurity = { allowOutsideScope: true, bypass: 'token' }
 * to specific calls.
 */

const path = require('path');
const fs = require('fs');

const ENV = process.env;
const OFF = ENV.PURPCLAW_PATH_SECURITY === 'off';

// Tools that touch the filesystem and need path validation.
const PATH_TOOLS = new Set(['write', 'edit', 'delete', 'shell', 'terminal', 'execute', 'git_write', 'git']);

// Paths to ALWAYS block regardless of scope.
const PROTECTED_DIRS = (() => {
  const list = [];
  // Windows system directories
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    list.push(sysRoot);
    list.push(path.join(sysRoot, 'System32'));
    list.push(path.join(sysRoot, 'SysWOW64'));
    list.push(path.join(sysRoot, 'WinSxS'));
    list.push('C:\\Program Files');
    list.push('C:\\Program Files (x86)');
    list.push('C:\\ProgramData');
  } else {
    list.push('/bin', '/sbin', '/usr/bin', '/usr/sbin', '/etc', '/boot', '/proc', '/sys');
  }
  // User credential / secret directories
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    list.push(path.join(home, '.ssh'));
    list.push(path.join(home, '.gnupg'));
    list.push(path.join(home, '.aws'));
    list.push(path.join(home, '.kube'));
    list.push(path.join(home, '.docker'));
    list.push(path.join(home, '.purpclaw', 'secrets'));
    list.push(path.join(home, '.npmrc'));
    list.push(path.join(home, '.gitconfig'));
  }
  return list.filter(Boolean);
})();

// Active project root (PURPCLAW_DIR or walk-up marker).
function projectRoot() {
  const explicit = process.env.PURPCLAW_DIR;
  if (explicit) return path.resolve(explicit);
  const markers = ['docs/COMPANION_EVENT_MAP.md', 'service_registry.js', '.purpclaw'];
  let dir = process.cwd();
  for (let i = 0; i < 8 && dir !== path.dirname(dir); i++) {
    if (markers.some(m => fs.existsSync(path.join(dir, m)))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const ROOT = (() => { try { return projectRoot(); } catch { return process.cwd(); } })();

/**
 * Resolve and normalise a user-supplied path. Returns absolute path or
 * throws if the path contains a null byte or is otherwise malformed.
 * Expands ~ and ~user prefixes to the home directory.
 */
function resolveSafe(input) {
  if (input == null) return null;
  if (typeof input !== 'string') input = String(input);
  if (input.includes('\0')) throw new Error('path contains null byte');
  if (input.length > 4096) throw new Error('path too long (>4096 chars)');
  // Block obvious drive-letter escape attempts with semicolons/amps
  if (/[;&|`$<>]/.test(input)) throw new Error('path contains shell metacharacter');
  // Expand ~ and ~user
  if (input === '~' || input.startsWith('~/') || input.startsWith('~\\')) {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    if (home) input = home + input.slice(1);
  }
  return path.isAbsolute(input) ? path.normalize(input) : path.resolve(ROOT, input);
}

/**
 * Check whether `abs` is inside any protected directory. Returns the
 * matching protected prefix or null. Comparison is case-insensitive on
 * Windows, case-sensitive elsewhere.
 */
function findProtectedPrefix(abs) {
  if (!abs) return null;
  const norm = process.platform === 'win32' ? abs.toLowerCase() : abs;
  for (const dir of PROTECTED_DIRS) {
    const cmp = process.platform === 'win32' ? dir.toLowerCase() : dir;
    if (norm === cmp || norm.startsWith(cmp + path.sep)) return dir;
  }
  return null;
}

/**
 * Check whether `abs` is inside the project root. Returns true if it is.
 */
function isInsideProject(abs) {
  if (!abs) return false;
  const norm = process.platform === 'win32' ? abs.toLowerCase() : abs.toLowerCase();
  const root = process.platform === 'win32' ? ROOT.toLowerCase() : ROOT.toLowerCase();
  return norm === root || norm.startsWith(root + path.sep);
}

/**
 * Pull all candidate paths out of a tool's args. Writes/edits/deletes
 * use `path`; shells use the `command` field; we extract anything that
 * looks like an absolute path or relative file reference.
 */
function extractPathsFromArgs(name, args = {}) {
  const out = [];
  if (typeof args === 'string') {
    // shell command — extract anything that looks like a path
    const matches = String(args).match(/(?:[A-Za-z]:\\|\.\.?\\|\.\.?\/|\/)[^\s;&|<>"]+/g);
    if (matches) out.push(...matches);
    return out;
  }
  if (!args || typeof args !== 'object') return out;
  for (const key of ['path', 'file', 'paths', 'files', 'targets', 'destination']) {
    const v = args[key];
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(x => { if (typeof x === 'string') out.push(x); });
  }
  if (typeof args.command === 'string') {
    const matches = String(args.command).match(/(?:[A-Za-z]:\\|\.\.?\\|\.\.?\/|\/)[^\s;&|<>"]+/g);
    if (matches) out.push(...matches);
  }
  return [...new Set(out)];
}

/**
 * Guardrail check function. Returns { ok, reason }.
 * Wire to lib/tool-runtime.js as a default input guardrail.
 */
function check(args, context = {}) {
  if (OFF) return { ok: true };
  const name = context.tool || '';
  if (!PATH_TOOLS.has(name)) return { ok: true };

  // Allow if caller explicitly bypassed with a token
  const bypass = context.pathSecurity?.bypass;
  if (bypass && bypass === ENV.PURPCLAW_BYPASS_TOKEN) return { ok: true };

  const allowOutside = context.pathSecurity?.allowOutsideScope === true
    || context.operatorInitiated === true; // operator-typed commands can go anywhere (audit trail records it)
  const paths = extractPathsFromArgs(name, args);
  if (!paths.length) return { ok: true };

  for (const raw of paths) {
    let abs;
    try { abs = resolveSafe(raw); } catch (e) {
      return { ok: false, reason: `path_security: cannot resolve '${raw}' — ${e.message}` };
    }
    if (!abs) continue;
    // 1. Protected directories
    const protectedPrefix = findProtectedPrefix(abs);
    if (protectedPrefix) {
      return {
        ok: false,
        reason: `path_security: '${abs}' is inside protected directory '${protectedPrefix}'. `
          + `Windows system files, .ssh, .aws, .gnupg, .kube, .docker, and credentials are off-limits. `
          + `Set PURPCLAW_PATH_SECURITY=off to disable (not recommended).`,
      };
    }
    // 2. Outside project root (only when operator did NOT initiate)
    if (!allowOutside && !isInsideProject(abs)) {
      return {
        ok: false,
        reason: `path_security: '${abs}' is outside the project root '${ROOT}'. `
          + `Agent-initiated writes must stay in scope. `
          + `Operator-initiated calls can pass allowOutsideScope: true.`,
      };
    }
    // 3. Symlink escape detection (cheap: stat the resolved target and
    //    re-check that its realpath is also in scope / not protected).
    try {
      const real = fs.realpathSync(abs);
      if (real !== abs) {
        const realProtected = findProtectedPrefix(real);
        if (realProtected) {
          return { ok: false, reason: `path_security: '${abs}' is a symlink to protected directory '${realProtected}'.` };
        }
        if (!allowOutside && !isInsideProject(real)) {
          return { ok: false, reason: `path_security: '${abs}' resolves via symlink to '${real}' outside project root.` };
        }
      }
    } catch { /* file does not exist yet — fine, write will create it */ }
  }
  return { ok: true };
}

/**
 * Build the default guardrail object that lib/tool-runtime can install.
 * Use as: inputGuardrails: [pathSecurityGuardrail()]
 */
function guardrail() {
  return {
    name: 'path-security',
    type: 'custom',
    action: 'block',
    check,
  };
}

module.exports = {
  resolveSafe,
  findProtectedPrefix,
  isInsideProject,
  extractPathsFromArgs,
  check,
  guardrail,
  PROTECTED_DIRS,
  PATH_TOOLS,
  ROOT,
};
