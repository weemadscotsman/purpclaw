'use strict';

const PURP_PATHS = require('./paths');
/**
 * lib/session-store.js — Session Lifecycle + Recovery
 * Port of Hermes gateway/session.py + gateway/run.py restart recovery
 *
 * Key features:
 * - resume_pending: sessions mid-turn survive restarts, auto-resume on next access
 * - stuck-loop detection: 3+ consecutive restarts → hard suspend
 * - expiry_finalized: no double-finalization across restarts
 * - clean_shutdown marker: clean exits skip recovery entirely
 * - Agent LRU cache: 128 entries, 1h idle TTL, preserves prompt cache
 * - SessionStore: sessions.json metadata + SQLite transcripts
 *
 * Storage:
 *   PURP_DIR/sessions/sessions.json   — session_key → SessionEntry (metadata)
 *   PURP_DIR/sessions/state.db        — SQLite: transcripts, message history
 *   PURP_DIR/sessions/.clean_shutdown — written on graceful exit
 *   PURP_DIR/sessions/restart_counts.json — stuck-loop counter per session
 */

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const PURP_DIR = process.env.PURP_DIR
  || path.join(PURP_PATHS.DATA_ROOT);
const SESSIONS_DIR = path.join(PURP_DIR, 'sessions');
const CLEAN_SHUTDOWN_FILE = path.join(SESSIONS_DIR, '.clean_shutdown');
const RESTART_COUNTS_FILE = path.join(SESSIONS_DIR, 'restart_counts.json');

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ── Clean Shutdown Marker ─────────────────────────────────────────────────────

/**
 * Write clean shutdown marker. Call on graceful exit.
 * On next startup, presence of this file means skip suspend_recently_active().
 */
function writeCleanShutdown() {
  ensureDir();
  fs.writeFileSync(CLEAN_SHUTDOWN_FILE, JSON.stringify({
    pid: process.pid,
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
  }));
}

/**
 * Remove clean shutdown marker. Called on startup if marker exists
 * (signals prior clean exit — now consumed).
 */
function consumeCleanShutdown() {
  try {
    if (fs.existsSync(CLEAN_SHUTDOWN_FILE)) fs.unlinkSync(CLEAN_SHUTDOWN_FILE);
  } catch (e) { console.error(`[WARN] session-store: consumeCleanShutdown failed: ${e && e.message}`); }
}

/**
 * Returns true if last exit was clean (marker file exists).
 */
function wasCleanShutdown() {
  return fs.existsSync(CLEAN_SHUTDOWN_FILE);
}

// ── Restart Counts (Stuck-Loop Detection) ────────────────────────────────────

/**
 * Hermes pattern: if a session was active across 3+ consecutive restarts,
 * auto-suspend it so the user gets a clean slate.
 */
const MAX_RESTARTS_BEFORE_SUSPEND = 3;

function loadRestartCounts() {
  try {
    return JSON.parse(fs.readFileSync(RESTART_COUNTS_FILE, 'utf8'));
  } catch (e) { console.error(`[WARN] session-store: could not load restart counts: ${e && e.message} — starting fresh`); return {}; }
}

function saveRestartCounts(counts) {
  ensureDir();
  fs.writeFileSync(RESTART_COUNTS_FILE, JSON.stringify(counts, null, 2));
}

function incrementRestartCount(sessionKey) {
  const counts = loadRestartCounts();
  counts[sessionKey] = (counts[sessionKey] || 0) + 1;
  saveRestartCounts(counts);
  return counts[sessionKey];
}

function clearRestartCount(sessionKey) {
  const counts = loadRestartCounts();
  delete counts[sessionKey];
  saveRestartCounts(counts);
}

function getRestartCount(sessionKey) {
  return loadRestartCounts()[sessionKey] || 0;
}

// ── Session Entry ─────────────────────────────────────────────────────────────

/**
 * SessionEntry — per-session metadata record
 * Fields mirror Hermes gateway/session.py SessionEntry
 */
function makeSessionEntry(sessionKey, sessionId, source = {}) {
  return {
    session_key: sessionKey,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // Source origin
    platform: source.platform || null,
    chat_type: source.chat_type || 'dm',

    // Token accounting
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0.0,

    // State machine flags (Hermes pattern)
    was_auto_reset: false,
    auto_reset_reason: null,
    reset_had_activity: false,
    is_fresh_reset: false,
    expiry_finalized: false,
    suspended: false,
    resume_pending: false,
    resume_reason: null,
    last_resume_marked_at: null,
  };
}

// ── Session Store ────────────────────────────────────────────────────────────

let _entries = null;

function loadEntries() {
  if (_entries !== null) return _entries;
  ensureDir();
  try {
    _entries = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, 'sessions.json'), 'utf8'));
  } catch (e) {
    console.error(`[CRITICAL] session-store: could not load sessions.json (${e && e.message}) — starting with empty session state. All prior sessions will be invisible until the file is repaired.`);
    _entries = {};
  }
  return _entries;
}

function saveEntries() {
  ensureDir();
  const tmp = path.join(SESSIONS_DIR, `sessions.json.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, JSON.stringify(_entries, null, 2));
  fs.renameSync(tmp, path.join(SESSIONS_DIR, 'sessions.json'));
}

function buildSessionKey(source) {
  // Format: agent:main:{platform}:{chat_type}[:{chat_id}][:{thread_id}]
  const parts = ['agent', 'main', source.platform || 'local', source.chat_type || 'dm'];
  if (source.chat_id)  parts.push(source.chat_id);
  if (source.thread_id) parts.push(source.thread_id);
  return parts.join(':');
}

function sessionExists(sessionKey) {
  return sessionKey in loadEntries();
}

// ── Core Operations ───────────────────────────────────────────────────────────

/**
 * Get or create session. Mirrors Hermes get_or_create_session():
 * Priority: suspended(True) > resume_pending(True) > policy expiry > existing > fresh
 *
 * @param {object} source  - {platform, chat_id, thread_id, guild_id, user_id, chat_type}
 * @param {boolean} forceNew - force new session (like /new)
 * @returns {{ entry, isNew, isResume, isSuspended }}
 */
function getOrCreateSession(source, forceNew = false) {
  const entries = loadEntries();
  const sessionKey = buildSessionKey(source);
  const now = new Date().toISOString();

  // Suspended → always force new (hard wipe)
  if (!forceNew && entries[sessionKey]?.suspended) {
    const old = entries[sessionKey];
    clearRestartCount(sessionKey);
    const entry = makeSessionEntry(sessionKey, _newSessionId(), source);
    entry.was_auto_reset = true;
    entry.auto_reset_reason = 'suspended';
    entry.reset_had_activity = old.total_tokens > 0;
    entries[sessionKey] = entry;
    saveEntries();
    return { entry, isNew: true, isResume: false, isSuspended: true };
  }

  // Resume pending → preserve session_id (soft recovery)
  if (!forceNew && entries[sessionKey]?.resume_pending) {
    entries[sessionKey].updated_at = now;
    saveEntries();
    return { entry: entries[sessionKey], isNew: false, isResume: true, isSuspended: false };
  }

  // Policy expiry check (idle: 24h, daily: 4am)
  if (!forceNew && entries[sessionKey]) {
    const expiry = _checkExpiry(entries[sessionKey]);
    if (expiry) {
      const old = entries[sessionKey];
      clearRestartCount(sessionKey);
      const entry = makeSessionEntry(sessionKey, _newSessionId(), source);
      entry.was_auto_reset = true;
      entry.auto_reset_reason = expiry; // 'idle' | 'daily'
      entry.reset_had_activity = old.total_tokens > 0;
      entries[sessionKey] = entry;
      saveEntries();
      return { entry, isNew: true, isResume: false, isSuspended: false };
    }
  }

  // Existing session — bump updated_at
  if (entries[sessionKey] && !forceNew) {
    entries[sessionKey].updated_at = now;
    saveEntries();
    return { entry: entries[sessionKey], isNew: false, isResume: false, isSuspended: false };
  }

  // Fresh session
  clearRestartCount(sessionKey);
  const entry = makeSessionEntry(sessionKey, _newSessionId(), source);
  entries[sessionKey] = entry;
  saveEntries();
  return { entry, isNew: true, isResume: false, isSuspended: false };
}

/**
 * Explicit reset (/new or /reset). Creates new session_id, sets is_fresh_reset.
 */
function resetSession(sessionKey, source = {}) {
  const entries = loadEntries();
  clearRestartCount(sessionKey);
  const entry = makeSessionEntry(sessionKey, _newSessionId(), source);
  entry.is_fresh_reset = true;
  entries[sessionKey] = entry;
  saveEntries();
  return entry;
}

/**
 * Hard wipe — sets suspended=True. Next getOrCreate forces new session.
 */
function suspendSession(sessionKey) {
  const entries = loadEntries();
  if (!entries[sessionKey]) return;
  entries[sessionKey].suspended = true;
  entries[sessionKey].updated_at = new Date().toISOString();
  saveEntries();
}

/**
 * Mark session as resume_pending (crash/drain recovery).
 * Will NOT override suspended=True.
 * @param {string} sessionKey
 * @param {string} reason - 'restart_timeout' | 'shutdown_timeout' | 'restart_interrupted'
 */
function markResumePending(sessionKey, reason) {
  const entries = loadEntries();
  if (!entries[sessionKey]) return;
  if (entries[sessionKey].suspended) return; // hard wipe takes priority
  entries[sessionKey].resume_pending = true;
  entries[sessionKey].resume_reason = reason;
  entries[sessionKey].last_resume_marked_at = new Date().toISOString();
  entries[sessionKey].updated_at = new Date().toISOString();
  saveEntries();
}

/**
 * Clear resume_pending after successful resumed turn.
 * Called from gateway after runConversation() returns a real response.
 */
function clearResumePending(sessionKey) {
  const entries = loadEntries();
  if (!entries[sessionKey]) return;
  entries[sessionKey].resume_pending = false;
  entries[sessionKey].resume_reason = null;
  entries[sessionKey].updated_at = new Date().toISOString();
  saveEntries();
}

/**
 * Get all sessions that are resume_pending.
 */
function getResumePendingSessions() {
  const entries = loadEntries();
  return Object.entries(entries)
    .filter(([_, e]) => e.resume_pending)
    .map(([key, e]) => ({ key, ...e }));
}

/**
 * Update arbitrary session fields (e.g. interrupt_requested).
 */
function updateSession(sessionKey, patch) {
  const entries = loadEntries();
  if (!entries[sessionKey]) return false;
  entries[sessionKey] = { ...entries[sessionKey], ...patch, updated_at: new Date().toISOString() };
  saveEntries();
  return true;
}

/**
 * Check if interrupt has been requested for a session.
 * Called at each turn boundary in agent-loop.
 */
function consumeInterrupt(sessionKey) {
  const entries = loadEntries();
  if (!entries[sessionKey]) return false;
  const interrupt = !!entries[sessionKey].interrupt_requested;
  if (interrupt) {
    entries[sessionKey].interrupt_requested = false;
    saveEntries();
  }
  return interrupt;
}

/**
 * Suspend recently active sessions on crash recovery (no clean shutdown).
 * Marks sessions updated within last `maxAgeMs` as resume_pending.
 */
function suspendRecentlyActive(maxAgeMs = 120_000) {
  const entries = loadEntries();
  const cutoff = Date.now() - maxAgeMs;
  const reasons = { restart_interrupted: true };
  let marked = 0;

  for (const [sessionKey, entry] of Object.entries(entries)) {
    if (entry.suspended) continue;
    if (entry.resume_pending) continue;
    const updated = new Date(entry.updated_at).getTime();
    if (updated >= cutoff) {
      const restartCount = incrementRestartCount(sessionKey);
      if (restartCount >= MAX_RESTARTS_BEFORE_SUSPEND) {
        entry.suspended = true;
        entry.updated_at = new Date().toISOString();
        console.log(`[session-store] stuck-loop suspend: ${sessionKey} (${restartCount} restarts)`);
      } else {
        entry.resume_pending = true;
        entry.resume_reason = 'restart_interrupted';
        entry.last_resume_marked_at = new Date().toISOString();
      }
      marked++;
    }
  }

  if (marked > 0) saveEntries();
  return marked;
}

/**
 * Mark session as expiry_finalized — prevents double-finalization across restarts.
 */
function markExpiryFinalized(sessionKey) {
  const entries = loadEntries();
  if (!entries[sessionKey]) return;
  entries[sessionKey].expiry_finalized = true;
  entries[sessionKey].updated_at = new Date().toISOString();
  saveEntries();
}

/**
 * Update token accounting after a turn.
 */
function recordTokens(sessionKey, inputTokens, outputTokens, costUsd = 0) {
  const entries = loadEntries();
  if (!entries[sessionKey]) return;
  const e = entries[sessionKey];
  e.input_tokens += inputTokens;
  e.output_tokens += outputTokens;
  e.total_tokens = e.input_tokens + e.output_tokens;
  e.estimated_cost_usd += costUsd;
  e.updated_at = new Date().toISOString();
  saveEntries();
}

// ── Policy Helpers ────────────────────────────────────────────────────────────

/**
 * Check if session has expired based on policy.
 * Returns null (not expired) or 'idle' or 'daily'.
 */
function _checkExpiry(entry) {
  const IDLE_MINUTES = 1440; // 24h
  const DAILY_HOUR = 4;     // 4 AM local

  const now = new Date();
  const updated = new Date(entry.updated_at);

  // Idle check
  const idleDeadline = updated.getTime() + IDLE_MINUTES * 60_000;
  if (now.getTime() > idleDeadline) return 'idle';

  // Daily check
  const todayReset = new Date(now);
  todayReset.setHours(DAILY_HOUR, 0, 0, 0);
  if (now.getHours() < DAILY_HOUR) todayReset.setDate(todayReset.getDate() - 1);
  if (updated < todayReset) return 'daily';

  return null;
}

// ── Session ID Generator ─────────────────────────────────────────────────────

function _newSessionId() {
  const d = new Date();
  const datePart = d.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  const hex = crypto.randomBytes(4).toString('hex');
  return `${datePart}_${hex}`;
}

// ── Agent LRU Cache ──────────────────────────────────────────────────────────

const AGENT_CACHE_MAX_SIZE = 128;
const AGENT_CACHE_IDLE_TTL_MS = 3_600_000; // 1h

const _agentCache = new Map(); // sessionKey → { agent, lastAccess }

function getCachedAgent(sessionKey) {
  const entry = _agentCache.get(sessionKey);
  if (!entry) return null;
  // Check idle TTL
  if (Date.now() - entry.lastAccess > AGENT_CACHE_IDLE_TTL_MS) {
    _agentCache.delete(sessionKey);
    return null;
  }
  // Move to end (most recently used)
  _agentCache.delete(sessionKey);
  entry.lastAccess = Date.now();
  _agentCache.set(sessionKey, entry);
  return entry.agent;
}

function setCachedAgent(sessionKey, agent) {
  // Evict LRU if at capacity
  while (_agentCache.size >= AGENT_CACHE_MAX_SIZE) {
    const firstKey = _agentCache.keys().next().value;
    _agentCache.delete(firstKey);
  }
  _agentCache.set(sessionKey, { agent, lastAccess: Date.now() });
}

/**
 * Evict cached agent (called on session expiry).
 */
function evictCachedAgent(sessionKey) {
  _agentCache.delete(sessionKey);
}

/**
 * Sweep all idle agents beyond TTL.
 */
function sweepIdleAgents() {
  const now = Date.now();
  for (const [sessionKey, entry] of _agentCache) {
    if (now - entry.lastAccess > AGENT_CACHE_IDLE_TTL_MS) {
      _agentCache.delete(sessionKey);
    }
  }
}

// ── Startup Recovery ──────────────────────────────────────────────────────────

/**
 * Call on startup. If no clean shutdown marker → crash recovery path.
 * Marks recently-active sessions as resume_pending, handles stuck-loop.
 */
function startupRecovery() {
  if (wasCleanShutdown()) {
    consumeCleanShutdown();
    return { mode: 'clean', marked: 0 };
  }
  consumeCleanShutdown();
  const marked = suspendRecentlyActive();
  return { mode: 'crash-recovery', marked };
}

// ── Expiry Watcher (background, runs every 5min) ─────────────────────────────

const EXPIRY_INTERVAL_MS = 300_000; // 5 min

let _expiryTimer = null;
let _expiryHandlers = []; // [{fn, sessionKey}] registered hooks

/**
 * Register a hook to call when session expires.
 */
function onSessionExpire(fn) {
  _expiryHandlers.push(fn);
}

/**
 * Run one expiry pass. Call this every 5 minutes.
 * Returns sessions that were finalized.
 */
function runExpiryPass() {
  const entries = loadEntries();
  const finalized = [];
  const now = new Date().toISOString();

  for (const [sessionKey, entry] of Object.entries(entries)) {
    if (entry.expiry_finalized) continue;
    const expiry = _checkExpiry(entry);
    if (!expiry) continue;

    // Invoke hooks
    for (const fn of _expiryHandlers) {
      try { fn(sessionKey, entry, expiry); } catch {}
    }

    entry.expiry_finalized = true;
    entry.updated_at = now;
    finalized.push(sessionKey);
    evictCachedAgent(sessionKey);
  }

  if (finalized.length > 0) saveEntries();

  // Sweep idle agents
  sweepIdleAgents();

  return finalized;
}

/**
 * Start background expiry watcher (every 5 min).
 * Returns stop function.
 */
function startExpiryWatcher() {
  if (_expiryTimer) return () => {};
  const tick = () => {
    runExpiryPass();
    _expiryTimer = setTimeout(tick, EXPIRY_INTERVAL_MS);
  };
  _expiryTimer = setTimeout(tick, EXPIRY_INTERVAL_MS);
  return () => { clearTimeout(_expiryTimer); _expiryTimer = null; };
}

// ── CLI Commands ─────────────────────────────────────────────────────────────

function listSessions() {
  const entries = loadEntries();
  return Object.entries(entries).map(([key, e]) => ({
    session_key: key,
    session_id: e.session_id,
    platform: e.platform,
    total_tokens: e.total_tokens,
    updated_at: e.updated_at,
    suspended: e.suspended,
    resume_pending: e.resume_pending,
    is_fresh_reset: e.is_fresh_reset,
  }));
}

function showSession(sessionKey) {
  const entries = loadEntries();
  return entries[sessionKey] || null;
}

// ── Module Init ──────────────────────────────────────────────────────────────

// Auto-init on require: run crash recovery
startupRecovery();

module.exports = {
  // Core
  getOrCreateSession,
  resetSession,
  suspendSession,
  markResumePending,
  clearResumePending,
  markExpiryFinalized,
  recordTokens,

  // Startup
  startupRecovery,
  writeCleanShutdown,
  wasCleanShutdown,
  suspendRecentlyActive,

  // Agent cache
  getCachedAgent,
  setCachedAgent,
  evictCachedAgent,
  sweepIdleAgents,

  // Expiry
  runExpiryPass,
  startExpiryWatcher,
  onSessionExpire,

  // Helpers
  buildSessionKey,
  sessionExists,
  listSessions,
  showSession,
  makeSessionEntry,
  ensureDir,
  SESSIONS_DIR,

  // Interrupt
  getResumePendingSessions,
  updateSession,
  consumeInterrupt,
};
