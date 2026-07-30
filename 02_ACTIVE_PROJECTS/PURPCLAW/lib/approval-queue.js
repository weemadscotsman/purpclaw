'use strict';
/**
 * lib/approval-queue.js — PURPCLAW Human-in-the-Loop Approval System
 *
 * Detects dangerous commands, manages a persistent approval queue with atomic
 * JSON writes, integrates with exec-policy, and exposes a REST API via the gateway.
 *
 * Reference: hermes-agent/tools/approval.py (Python, 4081 lines)
 *
 * Storage:
 *   ~/.purpclaw/approvals/.queue.json   — pending/resolved approval queue
 *   ~/.purpclaw/approvals/allowlist.json — persistent pattern allowlist
 *
 * Approval record:
 *   { id, sessionKey, tool, command, description, pattern, status,
 *     createdAt, resolvedAt, resolution, resolvedBy }
 *
 * Status: pending | approved | denied | expired
 *
 * YOLO mode: PURPCLAW_YOLO_MODE=1 skips all approvals
 * Auto-expiry: 5 minutes
 * async_hooks for session-key isolation in async context
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const async_hooks = require('async_hooks');
const { URL } = require('url');

// ── State dir & paths ─────────────────────────────────────────────────────────

function STATE_DIR() {
  const env = process.env.PURPCLAW_STATE_DIR;
  if (env) return env;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return home ? path.join(home, '.purpclaw') : path.join(process.cwd(), '.purpclaw');
}

const APPROVALS_DIR = () => path.join(STATE_DIR(), 'approvals');
const QUEUE_FILE   = () => path.join(APPROVALS_DIR(), '.queue.json');
const ALLOWLIST_FILE = () => path.join(APPROVALS_DIR(), 'allowlist.json');

const AUTO_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// ── YOLO mode (frozen at module load — cannot be flipped mid-process by a skill) ──

const _YOLO_MODE_FROZEN = (() => {
  const val = process.env.PURPCLAW_YOLO_MODE;
  return val === '1' || val === 'true';
})();

// ── async_hooks session-key isolation ───────────────────────────────────────────

/** @type {async_hooks.AsyncLocalStorage<string>} */
const _sessionKeyStore = new async_hooks.AsyncLocalStorage();

/**
 * Bind a session key to the current async context.
 * @returns {async_hooks.AsyncLocalStorage} token-like handle (use with run/forget)
 */
function setCurrentSessionKey(sessionKey) {
  return _sessionKeyStore.enterWith(sessionKey || 'default');
}

/**
 * Get the active session key from async local storage, falling back to
 * process env or 'default'.
 */
function getCurrentSessionKey() {
  const stored = _sessionKeyStore.getStore();
  if (stored) return stored;
  return process.env.PURPCLAW_SESSION_KEY || 'default';
}

/**
 * Run a callback in a specific session key context.
 */
function withSessionKey(sessionKey, fn) {
  return _sessionKeyStore.run(sessionKey, fn);
}

// ── DANGEROUS PATTERNS ─────────────────────────────────────────────────────────

/**
 * Dangerous pattern entries: [regexString, description]
 * Ported from hermes-agent/tools/approval.py DANGEROUS_PATTERNS / HARDLINE_PATTERNS
 * Subset of the most critical patterns for the PURPCLAW context.
 */
const DANGEROUS_PATTERNS = [
  // Hardline (unconditional block, even in YOLO)
  [':\\(\\)\\s*\\{\\s*:\\s*\\|\\s*:\\s*&\\s*\\}\\s*;\\s*:', 'fork bomb'],
  [/shutdown|reboot|halt|poweroff/i, 'system shutdown/reboot'],
  [/init\s+[06]/i, 'init 0/6 (shutdown/reboot)'],
  [/\bkill\s+-9\s+-1\b/, 'kill all processes'],
  [/\bmkfs(\.\w+)?\b/, 'format filesystem (mkfs)'],
  [/\bdd\b.*\bof=\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)/i, 'dd to raw block device'],
  [/>\s*\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)/i, 'redirect to raw block device'],

  // Dangerous filesystem operations
  [/\brm\s+(-[^\s]*\s+)*\//, 'delete in root path'],
  [/\brm\s+-[^\s]*r/i, 'recursive delete'],
  [/\brm\s+--recursive\b/i, 'recursive delete (long flag)'],
  [/\brm\s+-[^\s]*\s+\//, 'recursive delete from root'],

  // chmod dangerous
  [/\bchmod\s+(-[^\s]*\s+)*(777|666|o\+rwx)/i, 'world-writable permissions (777/666)'],
  [/\bchmod\s+--recursive\b.*(777|666|o\+rwx)/i, 'recursive world-writable (long flag)'],
  [/\bchown\s+(-[^\s]*)?R\s+root/i, 'recursive chown to root'],
  [/\bchown\s+--recur[a-z]*\b.*root/i, 'recursive chown to root (long flag)'],

  // System config writes
  [/>\s*\/etc\//, 'overwrite system config via redirection'],
  [/\btee\b.*\/etc\//i, 'overwrite system config via tee'],
  [/>\s*\/private\/etc\//i, 'overwrite macOS system config'],
  [/\bcp\b.*\s\/etc\//i, 'copy file into /etc/'],
  [/\bmv\b.*\s\/etc\//i, 'move file into /etc/'],

  // SSH / credential theft
  [/\.ssh\//, 'SSH directory access'],
  [/authorized_keys/, 'SSH authorized_keys manipulation'],
  [/\.ssh\/authorized_keys/, 'SSH authorized_keys file'],
  [/\.netrc/, 'netrc credential file'],
  [/\.pgpass/, 'PostgreSQL password file'],
  [/\.npmrc/, 'npm credentials'],
  [/\.pypirc/, 'PyPI credentials'],

  // Hermes / security-sensitive files
  [/\.hermes\/\.env/, 'Hermes .env file access'],
  [/\.hermes\/config\.yaml/i, 'Hermes config file'],
  [/(?:~|\$home|\$\{home\})\/\.hermes\/\.env/, 'Hermes .env via home path'],
  [/\.env(?:\.\w+)+/, 'project .env file'],

  // Shell execution
  [/\bcurl\b.*\|\s*(?:[\/\w]*\/)?(?:ba)?sh/i, 'pipe remote content to shell'],
  [/\bwget\b.*\|\s*(?:[\/\w]*\/)?(?:ba)?sh/i, 'pipe remote content to shell'],
  [/\beval\b.*\$\(/, 'eval with command substitution'],
  [/\bsource\b.*\$\(/, 'source with command substitution'],
  [/\.\s*\$\(/, 'dot-source with command substitution'],
  [/\bbash\s+<<\s*['"]?\w+['"]?/i, 'shell heredoc execution'],
  [/\bexec\b/i, 'exec (replace shell process)'],

  // SQL destructive
  [/\bDROP\s+(TABLE|DATABASE)\b/i, 'SQL DROP'],
  [/\bDELETE\s+FROM\b(?![^\n]*\bWHERE\b)/i, 'SQL DELETE without WHERE'],
  [/\bTRUNCATE\s+TABLE\b/i, 'SQL TRUNCATE'],

  // Process destruction
  [/\bpkill\s+-9\b/i, 'force kill processes (pkill -9)'],
  [/\bkillall\s+(-[^\s]*\s+)*-(9|KILL|SIGKILL)\b/i, 'force kill processes (killall -KILL)'],
  [/\bkillall\s+(-[^\s]*\s+)*-r\b/i, 'kill processes by regex (killall -r)'],

  // Docker / container lifecycle
  [/\bdocker\s+compose\s+(restart|stop|kill|down)\b/i, 'docker compose lifecycle'],
  [/\bdocker\s+(restart|stop|kill)\b/i, 'docker lifecycle'],

  // Gateway self-protection
  [/\bhermes\s+.*gateway\s+(stop|restart)\b/i, 'stop/restart hermes gateway'],
  [/\bhermes\s+update\b/i, 'hermes update (restarts gateway)'],
  [/\b(pkill|killall)\b.*\b(hermes|gateway)\b/i, 'kill hermes/gateway process'],

  // Git destructive
  [/\bgit\s+reset\s+--h/i, 'git reset --hard'],
  [/\bgit\s+push\b.*--forc/i, 'git force push'],
  [/\bgit\s+push\b.*\s+-f\b/, 'git force push (short flag)'],
  [/\bgit\s+clean\s+-[^\s]*f/i, 'git clean with force'],
  [/\bgit\s+branch\s+-D\b/i, 'git branch force delete'],

  // Sudo with privilege escalation flags
  [/\bsudo\b[^;|&`\n]*?\s+(-s\b|--st[a-z]*\b|-a\b|--a[a-z]*\b)/i, 'sudo with privilege flag (stdin/askpass/shell)'],
  [/\bsudo\b[^;|&`\n]*?\s+-[a-z]*s[a-z]*\b/i, 'sudo with combined-flag privilege escalation'],
  [/\bsudo\s+-S\b/i, 'sudo stdin password (sudo -S)'],

  // In-place file edits on sensitive paths
  [/\bsed\s+-[^\s]*i\b.*\/\.ssh\//i, 'in-place edit of SSH directory'],
  [/\bsed\s+-[^\s]*i\b.*\/\.hermes\//i, 'in-place edit of Hermes directory'],
  [/\bsed\s+-[^\s]*i\b.*\/(?:etc|private\/etc)\//i, 'in-place edit of system config'],
  [/\bperl\b.*-[^\s]*i\b.*\/\.ssh\//i, 'perl in-place edit of SSH directory'],
  [/\bruby\b.*-[^\s]*i\b.*\/\.ssh\//i, 'ruby in-place edit of SSH directory'],

  // xargs with destructive commands
  [/\bxargs\b.*\brm\b/, 'xargs with rm'],
  [/\bfind\b.*-exec(?:dir)?\s+\/?rm\b/i, 'find -exec/-execdir rm'],
  [/\bfind\b.*-delete\b/i, 'find -delete'],

  // Systemd / service management
  [/\bsystemctl\s+(-[^\s]+\s+)*(stop|restart|disable|mask)\b/i, 'stop/restart system service'],
  [/\bsystemctl\s+(poweroff|reboot|halt|kexec)\b/i, 'systemctl poweroff/reboot'],
  [/\btelinit\s+[06]\b/i, 'telinit 0/6 (shutdown/reboot)'],

  // Launchctl (macOS)
  [/\blaunchctl\s+(stop|kickstart|bootout|unload|kill|disable|remove)\b.*\b(hermes|ai\.hermes)\b/i, 'launchctl hermes service control'],

  // Network to sensitive targets
  [/nc\s+.*-e\s*/, 'netcat arbitrary command execution'],
  [/ncat\s+.*-e\s*/, 'ncat arbitrary command execution'],
  [/\bopenssl\s+rand\b.*base64.*\|\s*(ba)?sh/i, 'openssl piped to shell'],

  // User sudoers / system security
  [/\/etc\/sudoers/, 'sudoers file modification'],
  [/\/etc\/passwd/, 'password file modification'],
  [/\/etc\/group/, 'group file modification'],
];

// Compile patterns for performance
const DANGEROUS_PATTERNS_COMPILED = DANGEROUS_PATTERNS.map(([pattern, description]) => {
  if (pattern instanceof RegExp) {
    return { pattern, description };
  }
  return { pattern: new RegExp(pattern, 'i'), description };
});

// ── Command normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a command string before pattern matching.
 * Handles shell quoting, ANSI escapes, variable expansions, etc.
 */
function _normalizeCommand(command) {
  if (!command || typeof command !== 'string') return '';

  let cmd = command
    // Strip ANSI escape sequences (basic)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Strip null bytes
    .replace(/\x00/g, '')
    // Collapse line continuations
    .replace(/\\\r?\n/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  return cmd;
}

/**
 * Pattern-match a normalised command against compiled dangerous patterns.
 * Returns {isDangerous, pattern, description} or {isDangerous: false}.
 */
function _matchPattern(command) {
  const normalised = _normalizeCommand(command);
  if (!normalised) return { isDangerous: false };

  const lower = normalised.toLowerCase();

  for (const { pattern, description } of DANGEROUS_PATTERNS_COMPILED) {
    try {
      if (pattern.test(lower) || pattern.test(normalised)) {
        return { isDangerous: true, pattern: description, description };
      }
    } catch {
      // Invalid regex — skip
    }
  }

  return { isDangerous: false };
}

// ── Public detection API ────────────────────────────────────────────────────────

/**
 * Detect whether a command is dangerous.
 * @param {string} command
 * @returns {{ isDangerous: boolean, pattern: string|null, description: string|null }}
 */
function detectDangerousCommand(command) {
  if (!command || typeof command !== 'string') {
    return { isDangerous: false, pattern: null, description: null };
  }

  // Basic length sanity check
  if (command.length > 128_000) {
    return { isDangerous: true, pattern: 'command parser limit exceeded', description: 'command parser limit exceeded' };
  }

  const result = _matchPattern(command);
  if (!result.isDangerous) {
    return { isDangerous: false, pattern: null, description: null };
  }

  return {
    isDangerous: true,
    pattern: result.pattern,
    description: result.description,
  };
}

// ── Atomic JSON file helpers ───────────────────────────────────────────────────

function _ensureDir() {
  const dir = APPROVALS_DIR();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read the approval queue, creating it as empty if absent.
 * @returns {{ approvals: ApprovalRecord[] }}
 */
function _readQueue() {
  _ensureDir();
  try {
    const raw = fs.readFileSync(QUEUE_FILE(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { approvals: [] };
  }
}

/**
 * Write the queue atomically using a temp file + rename.
 * @param {{ approvals: ApprovalRecord[] }} data
 */
function _writeQueue(data) {
  _ensureDir();
  const tmp = QUEUE_FILE() + '.tmp.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, QUEUE_FILE());
}

/**
 * Read the allowlist, creating it as empty if absent.
 * @returns {{ entries: string[] }}
 */
function _readAllowlist() {
  _ensureDir();
  try {
    const raw = fs.readFileSync(ALLOWLIST_FILE(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { entries: [] };
  }
}

/**
 * Write the allowlist atomically.
 * @param {{ entries: string[] }} data
 */
function _writeAllowlist(data) {
  _ensureDir();
  const tmp = ALLOWLIST_FILE() + '.tmp.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, ALLOWLIST_FILE());
}

// ── Approval queue state ───────────────────────────────────────────────────────

/** @type {Map<string, { event: EventEmitter, data: object }>} */
const _pendingEvents = new Map();

/** Workflow resume callbacks: approvalId → (resolution: 'approved'|'denied') => void */
const _workflowResumeCallbacks = new Map();

/**
 * Register a callback to be called when an approval resolves.
 * The callback receives (approvalId, resolution) and should resume the
 * associated workflow run.
 * @param {string} approvalId
 * @param {function} cb (resolution: string) => void
 */
function onWorkflowApprovalResolved(approvalId, cb) {
  _workflowResumeCallbacks.set(approvalId, cb);
}

/** Remove a previously registered callback. */
function clearWorkflowApprovalResolved(approvalId) {
  _workflowResumeCallbacks.delete(approvalId);
}

const { EventEmitter } = require('events');

// ── Approval record factory ────────────────────────────────────────────────────

/**
 * @typedef {Object} ApprovalRecord
 * @property {string} id
 * @property {string} sessionKey
 * @property {string} tool
 * @property {string} command
 * @property {string} description
 * @property {string} pattern
 * @property {'pending'|'approved'|'denied'|'expired'} status
 * @property {number} createdAt
 * @property {number|null} resolvedAt
 * @property {string|null} resolution  'once'|'session'|'always'|'deny'|null
 * @property {string|null} resolvedBy
 */

/**
 * Generate a short unique approval ID.
 */
function _newId() {
  return 'apr_' + crypto.randomBytes(8).toString('hex');
}

// ── Core queue operations ──────────────────────────────────────────────────────

/**
 * Request approval for a dangerous command.
 * @param {string} sessionKey
 * @param {string} tool
 * @param {string} command
 * @param {string} description
 * @returns {Promise<string>} approvalId
 */
async function requestApproval(sessionKey, tool, command, description) {
  if (_YOLO_MODE_FROZEN) {
    return 'yolo_bypass';
  }

  const detection = detectDangerousCommand(command);
  if (!detection.isDangerous) {
    return 'auto_approved';
  }

  const id = _newId();
  const record = {
    id,
    sessionKey: sessionKey || getCurrentSessionKey(),
    tool: tool || 'terminal',
    command,
    description: description || detection.description,
    pattern: detection.pattern,
    status: 'pending',
    createdAt: Date.now(),
    resolvedAt: null,
    resolution: null,
    resolvedBy: null,
  };

  // Create an event emitter for this approval so resolvers can wake waiters
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // no limit
  _pendingEvents.set(id, { emitter, record });

  // Persist to queue
  const queue = _readQueue();
  queue.approvals.push(record);
  _writeQueue(queue);

  // Auto-expire after 5 minutes
  setTimeout(() => {
    const existing = _pendingEvents.get(id);
    if (existing) {
      // Mark as expired
      const q = _readQueue();
      const idx = q.approvals.findIndex(a => a.id === id && a.status === 'pending');
      if (idx !== -1) {
        q.approvals[idx].status = 'expired';
        q.approvals[idx].resolvedAt = Date.now();
        q.approvals[idx].resolution = 'expire';
        _writeQueue(q);
      }
      existing.emitter.emit('expired');
      _pendingEvents.delete(id);
    }
  }, AUTO_EXPIRY_MS);

  return id;
}

/**
 * Resolve a pending approval.
 * @param {string} approvalId
 * @param {'approved'|'denied'|'once'|'session'|'always'|'deny'} resolution
 * @param {string} [resolvedBy]
 * @returns {Promise<boolean>} true if resolved, false if not found
 */
async function resolveApproval(approvalId, resolution, resolvedBy) {
  // Handle yolo / auto-approve shortcuts
  if (approvalId === 'yolo_bypass' || approvalId === 'auto_approved') {
    return true;
  }

  const normalizedResolution = {
    approved: 'approved',
    once: 'approved',
    session: 'approved',
    always: 'approved',
    denied: 'denied',
    deny: 'denied',
  }[resolution] || 'denied';

  const queue = _readQueue();
  const idx = queue.approvals.findIndex(a => a.id === approvalId && a.status === 'pending');

  if (idx === -1) return false;

  queue.approvals[idx].status = normalizedResolution === 'approved' ? 'approved' : 'denied';
  queue.approvals[idx].resolvedAt = Date.now();
  queue.approvals[idx].resolution = resolution;
  queue.approvals[idx].resolvedBy = resolvedBy || null;
  _writeQueue(queue);

  // Wake up any waiter
  const pending = _pendingEvents.get(approvalId);
  if (pending) {
    pending.emitter.emit(normalizedResolution === 'approved' ? 'approved' : 'denied', { resolution, resolvedBy });
    _pendingEvents.delete(approvalId);
  }

  // Bridge to workflow resume if a callback was registered
  const resumeCb = _workflowResumeCallbacks.get(approvalId);
  if (resumeCb) {
    _workflowResumeCallbacks.delete(approvalId);
    // Call async without blocking — fire and forget
    Promise.resolve().then(() => {
      try { resumeCb(approvalId, normalizedResolution); } catch (err) { /* swallow */ }
    });
  }

  // Persist to allowlist if 'always'
  if (resolution === 'always' && normalizedResolution === 'approved') {
    const record = queue.approvals[idx];
    const allowlist = _readAllowlist();
    if (!allowlist.entries.includes(record.pattern)) {
      allowlist.entries.push(record.pattern);
      _writeAllowlist(allowlist);
    }
  }

  // Persist to session allowlist if 'session' or 'always'
  if ((resolution === 'session' || resolution === 'always') && normalizedResolution === 'approved') {
    _sessionAllowAdd(record.sessionKey, record.pattern);
  }

  return true;
}

/**
 * Wait for an approval to be resolved.
 * @param {string} approvalId
 * @param {number} timeoutMs
 * @returns {Promise<{resolution: string, resolvedBy: string|null}|null>} null if expired/timeout
 */
function _waitForApproval(approvalId, timeoutMs = AUTO_EXPIRY_MS) {
  return new Promise((resolve) => {
    const pending = _pendingEvents.get(approvalId);
    if (!pending) {
      // Check if already resolved in queue
      const queue = _readQueue();
      const record = queue.approvals.find(a => a.id === approvalId);
      if (record && record.status !== 'pending') {
        resolve({ resolution: record.resolution, resolvedBy: record.resolvedBy });
        return;
      }
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      _pendingEvents.delete(approvalId);
      resolve(null);
    }, timeoutMs);

    pending.emitter.once('approved', ({ resolution, resolvedBy }) => {
      clearTimeout(timer);
      resolve({ resolution, resolvedBy });
    });
    pending.emitter.once('denied', ({ resolution, resolvedBy }) => {
      clearTimeout(timer);
      resolve({ resolution, resolvedBy });
    });
    pending.emitter.once('expired', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * Check if there is a pending approval for a session.
 * @param {string} sessionKey
 * @returns {Promise<ApprovalRecord|null>}
 */
async function checkPendingApproval(sessionKey) {
  const queue = _readQueue();
  const now = Date.now();

  // Clean up expired entries while we're at it
  let dirty = false;
  for (const approval of queue.approvals) {
    if (
      approval.status === 'pending' &&
      now - approval.createdAt > AUTO_EXPIRY_MS
    ) {
      approval.status = 'expired';
      approval.resolvedAt = now;
      approval.resolution = 'expire';
      dirty = true;
    }
  }
  if (dirty) {
    _writeQueue(queue);
  }

  const key = sessionKey || getCurrentSessionKey();
  return queue.approvals.find(a => a.sessionKey === key && a.status === 'pending') || null;
}

/**
 * Check if a command for a session is approved (via allowlist or session cache).
 * @param {string} sessionKey
 * @param {string} tool
 * @param {string} command
 * @returns {Promise<boolean>}
 */
async function isApproved(sessionKey, tool, command) {
  if (_YOLO_MODE_FROZEN) return true;

  const key = sessionKey || getCurrentSessionKey();
  const detection = detectDangerousCommand(command);
  if (!detection.isDangerous) return true;

  // Check allowlist
  const allowlist = _readAllowlist();
  if (allowlist.entries.includes(detection.pattern)) return true;

  // Check session cache
  if (_sessionAllowHas(key, detection.pattern)) return true;

  return false;
}

/**
 * Request approval and BLOCK until resolved (for exec-policy integration).
 * @param {string} sessionKey
 * @param {string} tool
 * @param {string} command
 * @param {string} description
 * @returns {Promise<{approved: boolean, approvalId: string|null, message: string|null}>}
 */
async function requestApprovalAndWait(sessionKey, tool, command, description) {
  if (_YOLO_MODE_FROZEN) {
    return { approved: true, approvalId: null, message: null };
  }

  const detection = detectDangerousCommand(command);
  if (!detection.isDangerous) {
    return { approved: true, approvalId: null, message: null };
  }

  // Check allowlist / session cache before requesting
  if (await isApproved(sessionKey, tool, command)) {
    return { approved: true, approvalId: null, message: null };
  }

  const key = sessionKey || getCurrentSessionKey();
  const approvalId = await requestApproval(key, tool, command, description || detection.description);

  // Handle yolo / auto-approve shortcuts
  if (approvalId === 'yolo_bypass' || approvalId === 'auto_approved') {
    return { approved: true, approvalId, message: null };
  }

  // Block waiting for resolution
  const result = await _waitForApproval(approvalId, AUTO_EXPIRY_MS);

  if (!result) {
    return {
      approved: false,
      approvalId,
      message: `Approval request timed out (5 min). Command: ${command.substring(0, 100)}...`,
    };
  }

  if (result.resolution === 'denied' || result.resolution === 'deny') {
    return {
      approved: false,
      approvalId,
      message: `Command denied by user. Do not retry.`,
    };
  }

  return { approved: true, approvalId, message: null };
}

// ── Session allowlist (in-memory, per-session) ────────────────────────────────

/** @type {Map<string, Set<string>>} */
const _sessionAllowlist = new Map();

function _sessionAllowAdd(sessionKey, pattern) {
  if (!sessionKey) return;
  if (!_sessionAllowlist.has(sessionKey)) {
    _sessionAllowlist.set(sessionKey, new Set());
  }
  _sessionAllowlist.get(sessionKey).add(pattern);
}

function _sessionAllowHas(sessionKey, pattern) {
  if (!sessionKey) return false;
  const set = _sessionAllowlist.get(sessionKey);
  return set ? set.has(pattern) : false;
}

/**
 * Clear session allowlist (call when session ends).
 */
function clearSession(sessionKey) {
  _sessionAllowlist.delete(sessionKey || getCurrentSessionKey());
}

// ── Allowlist management ────────────────────────────────────────────────────────

function getAllowlistEntries() {
  return _readAllowlist().entries;
}

function addAllowlistEntry(pattern) {
  const allowlist = _readAllowlist();
  if (!allowlist.entries.includes(pattern)) {
    allowlist.entries.push(pattern);
    _writeAllowlist(allowlist);
  }
  return allowlist.entries;
}

function removeAllowlistEntry(pattern) {
  const allowlist = _readAllowlist();
  allowlist.entries = allowlist.entries.filter(e => e !== pattern);
  _writeAllowlist(allowlist);
  return allowlist.entries;
}

// ── Queue introspection ─────────────────────────────────────────────────────────

/**
 * List all approvals (optionally filtered).
 * @param {{ status?: string, sessionKey?: string, limit?: number }} opts
 * @returns {ApprovalRecord[]}
 */
function listApprovals(opts = {}) {
  const queue = _readQueue();
  let results = queue.approvals;

  if (opts.status) {
    results = results.filter(a => a.status === opts.status);
  }
  if (opts.sessionKey) {
    results = results.filter(a => a.sessionKey === opts.sessionKey);
  }

  // Sort by createdAt descending (newest first)
  results = [...results].sort((a, b) => b.createdAt - a.createdAt);

  if (opts.limit) {
    results = results.slice(0, opts.limit);
  }

  return results;
}

/**
 * Get a single approval by ID.
 * @param {string} id
 * @returns {ApprovalRecord|null}
 */
function getApproval(id) {
  const queue = _readQueue();
  return queue.approvals.find(a => a.id === id) || null;
}

/**
 * Get all pending approvals.
 * @returns {ApprovalRecord[]}
 */
function getPendingApprovals() {
  return listApprovals({ status: 'pending' });
}

/**
 * Clear resolved/expired entries older than cutoffMs.
 * @param {number} cutoffMs
 */
function clearOldApprovals(cutoffMs = 24 * 60 * 60 * 1000) {
  const queue = _readQueue();
  const cutoff = Date.now() - cutoffMs;
  queue.approvals = queue.approvals.filter(
    a => a.status === 'pending' || a.createdAt > cutoff
  );
  _writeQueue(queue);
}

// ── Gateway REST integration ────────────────────────────────────────────────────

/**
 * Express-style handler factory for the gateway server.
 * Returns { handler: Function } compatible with the gateway's route registration.
 *
 * Adds routes:
 *   GET  /approvals          — list pending approvals
 *   GET  /approvals/:id      — get one approval
 *   POST /approvals/:id/resolve — resolve an approval
 *   GET  /approvals/allowlist  — get allowlist entries
 *   POST /approvals/allowlist  — add to allowlist
 *   DELETE /approvals/allowlist/:pattern — remove from allowlist
 */
function createApprovalHandler() {
  return {
    async handle(method, pathname, body, query) {
      const url = new URL(pathname, 'http://localhost');

      // GET /approvals — list pending
      if (method === 'GET' && url.pathname === '/approvals') {
        const pending = getPendingApprovals();
        return {
          status: 200,
          body: { ok: true, approvals: pending, count: pending.length },
        };
      }

      // GET /approvals/allowlist
      if (method === 'GET' && url.pathname === '/approvals/allowlist') {
        return {
          status: 200,
          body: { ok: true, entries: getAllowlistEntries() },
        };
      }

      // POST /approvals/allowlist — add entry
      if (method === 'POST' && url.pathname === '/approvals/allowlist') {
        const { pattern } = body || {};
        if (!pattern) {
          return { status: 400, body: { error: 'pattern required' } };
        }
        const entries = addAllowlistEntry(pattern);
        return { status: 200, body: { ok: true, entries } };
      }

      // DELETE /approvals/allowlist/:pattern
      if (method === 'DELETE') {
        const m = url.pathname.match(/^\/approvals\/allowlist\/(.+)$/);
        if (m) {
          const pattern = decodeURIComponent(m[1]);
          const entries = removeAllowlistEntry(pattern);
          return { status: 200, body: { ok: true, entries } };
        }
      }

      // GET /approvals/:id
      const getMatch = pathname.match(/^\/approvals\/([^/]+)$/);
      if (method === 'GET' && getMatch) {
        const id = getMatch[1];
        const approval = getApproval(id);
        if (!approval) {
          return { status: 404, body: { error: 'approval not found' } };
        }
        return { status: 200, body: { ok: true, approval } };
      }

      // POST /approvals/:id/resolve
      const resolveMatch = pathname.match(/^\/approvals\/([^/]+)\/resolve$/);
      if (method === 'POST' && resolveMatch) {
        const id = resolveMatch[1];
        const { resolution, resolvedBy } = body || {};
        if (!resolution) {
          return { status: 400, body: { error: 'resolution required' } };
        }
        const ok = await resolveApproval(id, resolution, resolvedBy);
        if (!ok) {
          return { status: 404, body: { error: 'approval not found or already resolved' } };
        }
        return { status: 200, body: { ok: true, approvalId: id, resolution } };
      }

      return { status: 404, body: { error: 'not found' } };
    },
  };
}

// ── Module exports ─────────────────────────────────────────────────────────────

module.exports = {
  // Detection
  detectDangerousCommand,

  // Queue operations
  requestApproval,
  requestApprovalAndWait,
  resolveApproval,
  checkPendingApproval,
  isApproved,
  clearSession,

  // Introspection
  listApprovals,
  getApproval,
  getPendingApprovals,
  getAllowlistEntries,
  addAllowlistEntry,
  removeAllowlistEntry,
  clearOldApprovals,

  // async_hooks
  setCurrentSessionKey,
  getCurrentSessionKey,
  withSessionKey,

  // Gateway handler factory
  createApprovalHandler,

  // Workflow bridge
  onWorkflowApprovalResolved,
  clearWorkflowApprovalResolved,

  // Constants
  DANGEROUS_PATTERNS,
  AUTO_EXPIRY_MS,
  QUEUE_FILE,
  ALLOWLIST_FILE,
  APPROVALS_DIR,
};
