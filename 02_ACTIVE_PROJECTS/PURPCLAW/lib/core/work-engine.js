'use strict';
/**
 * lib/core/work-engine.js — Unified PURPCLAW Session & Work Engine
 * ==============================================================
 *
 * One shared engine for session + chat work. All surfaces (CLI, TUI, Web)
 * call this. No surface gets its own session store or execution path.
 *
 * Session storage: ~/.purpclaw/sessions/<id>.json
 * Session index:   ~/.purpclaw/sessions/_index.json
 *
 * Usage:
 *   const work = require('./lib/core/work-engine');
 *
 *   // Session management
 *   const session = work.createSession({ title, provider, model });
 *   const sessions = work.listSessions(50);
 *   const loaded = work.loadSession(id);
 *   work.saveSession(id, messages);
 *   work.deleteSession(id);
 *
 *   // Chat with session persistence
 *   for await (const ev of work.chat({ sessionId, prompt, provider, model })) {
 *     if (ev.type === 'token')    process.stdout.write(ev.content);
 *     if (ev.type === 'done')     console.error(`\nDone: ${ev.turns} turns`);
 *   }
 *
 *   // History
 *   const history = work.getHistory(sessionId);
 */

const path = require('path');
const os   = require('os');

// ── Load dotenv ──────────────────────────────────────────────────────
try { require('dotenv').config(); } catch (_) {}

// ── Session Store ─────────────────────────────────────────────────────
// session-store.js is the spine/compatibility adapter (appendTurn/getHistory/save/load only).
// session-repository.js is the canonical store (createSession/loadSession/saveSession/listSessions).
const SESSION_STORE_PATH = path.join(__dirname, '..', 'session-repository.js');
let _store = null;
function store() {
  if (!_store) _store = require(SESSION_STORE_PATH);
  return _store;
}

// ── Agent Loop ────────────────────────────────────────────────────────
let _agentLoop = null;
function agentLoop() {
  if (!_agentLoop) _agentLoop = require('../agent-loop.js');
  return _agentLoop;
}

// ── Current session tracking ────────────────────────────────────────────
const CURRENT_FILE = path.join(os.homedir(), '.purpclaw', 'sessions', '_current.json');

function ensureDir() {
  const dir = path.dirname(CURRENT_FILE);
  const { execSync } = require('child_process');
  try { require('fs').mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function getCurrentSessionId() {
  try {
    ensureDir();
    const { sessionId } = JSON.parse(require('fs').readFileSync(CURRENT_FILE, 'utf8'));
    return sessionId || null;
  } catch (_) { return null; }
}

function setCurrentSessionId(sessionId) {
  try {
    ensureDir();
    require('fs').writeFileSync(CURRENT_FILE, JSON.stringify({ sessionId, updatedAt: new Date().toISOString() }), 'utf8');
  } catch (_) {}
}

// ── Session Management ────────────────────────────────────────────────

/**
 * Create a new session.
 * @param {Object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.provider]
 * @param {string} [opts.model]
 * @returns {Object} session object
 */
function createSession(opts = {}) {
  const s = store().createSession(opts.title || 'New Chat', opts.provider || '', opts.model || '');
  setCurrentSessionId(s.id);
  return s;
}

/**
 * Load a session by ID.
 * @param {string} id
 * @returns {Object|null}
 */
function loadSession(id) {
  return store().loadSession(id);
}

/**
 * Save a session's messages.
 * @param {string} id
 * @param {Array} messages
 * @param {Object} [opts]
 */
function saveSession(id, messages, opts = {}) {
  if (!id) return;
  return store().saveSession(id, messages, opts);
}

/**
 * List all sessions.
 * @param {number} [limit]
 * @returns {Array}
 */
function listSessions(limit = 50) {
  return store().listSessions(limit);
}

/**
 * Delete a session.
 * @param {string} id
 * @returns {Object}
 */
function deleteSession(id) {
  const result = store().deleteSession(id);
  // Clear current if it was this session
  if (getCurrentSessionId() === id) {
    try { require('fs').unlinkSync(CURRENT_FILE); } catch (_) {}
  }
  return result;
}

/**
 * Rename a session.
 * @param {string} id
 * @param {string} newTitle
 * @returns {Object}
 */
function renameSession(id, newTitle) {
  return store().renameSession(id, newTitle);
}

/**
 * Branch/fork a session.
 * @param {string} id
 * @param {Object} [opts]
 * @returns {Object} new session
 */
function branchSession(id, opts) {
  return store().branchSession(id, opts);
}

/**
 * Close a session.
 * @param {string} id
 * @param {string} [reason]
 * @returns {Object}
 */
function closeSession(id, reason) {
  return store().closeSession(id, reason);
}

/**
 * Archive a session.
 * @param {string} id
 * @param {string} [reason]
 * @returns {Object} {ok, error, sessionId, archived_at}
 */
function archiveSession(id, reason) {
  return store().archiveSession(id, reason);
}

/**
 * Unarchive a session.
 * @param {string} id
 * @returns {Object} {ok, error, sessionId}
 */
function unarchiveSession(id) {
  return store().unarchiveSession(id);
}

/**
 * Search sessions.
 * @param {string} query
 * @param {number} [limit]
 * @returns {Array}
 */
function searchSessions(query, limit) {
  return store().searchSessions(query, limit);
}

/**
 * Get session history (lightweight).
 * Uses spine/session-store for the compact turn history.
 * @param {string} sessionId
 * @returns {Array} [{role, content, ts}]
 */
function getHistory(sessionId) {
  if (!sessionId) return [];
  try {
    const spine = require('../spine/session-store');
    return spine.getHistory(sessionId);
  } catch (_) {
    // Fallback: load full session and extract messages
    const s = loadSession(sessionId);
    if (s && s.messages) {
      return s.messages.map(m => ({ role: m.role, content: m.content, ts: m.ts || Date.now() }));
    }
    return [];
  }
}

/**
 * Append a turn to session history.
 * @param {string} sessionId
 * @param {string} role  'user'|'assistant'|'tool'
 * @param {string} content
 */
function appendTurn(sessionId, role, content) {
  if (!sessionId) return;
  try {
    const spine = require('../spine/session-store');
    spine.appendTurn(sessionId, role, content);
  } catch (_) {}
}

// ── Chat Execution ────────────────────────────────────────────────────

/**
 * Chat with full session persistence.
 *
 * Wraps agent-loop's runAgent() with:
 * - Session history injection (recent turns prepended to prompt context)
 * - Auto-save after each assistant turn
 * - Streaming events forwarded to caller
 *
 * @param {Object} opts
 * @param {string}   [opts.sessionId]   — session to use/create
 * @param {string}   opts.prompt        — user message
 * @param {string}   [opts.provider]
 * @param {string}   [opts.model]
 * @param {Array}    [opts.history]      — override history (default: from session)
 * @param {Object}   [opts.opts]        — passed to runAgent (maxTurns, etc.)
 * @returns {AsyncGenerator}
 *
 * Events:
 *   { type: 'token',      content: string }
 *   { type: 'turn',       turn: number, maxTurns: number }
 *   { type: 'tool-call',  tool: string, args: Object }
 *   { type: 'tool-result', ok: boolean, content?: string, error?: string }
 *   { type: 'done',       turns: number, tokens: number, toolCalls: number }
 *   { type: 'error',     error: string }
 */
async function* chat({ sessionId, prompt, provider, model, history: optHistory, opts: runOpts = {} }) {
  const { runAgent } = agentLoop();

  // Resolve or create session
  let sid = sessionId || getCurrentSessionId();
  if (!sid) {
    const s = createSession({ provider, model, title: prompt ? prompt.substring(0, 60) : 'Chat' });
    sid = s.id;
  }

  // Load history
  const hist = optHistory || getHistory(sid);

  // Append user turn immediately
  appendTurn(sid, 'user', prompt);

  // Buffer for session saving
  const assistantBuffer = { content: '' };
  let toolCalls = 0;
  let turnCount = 0;

  // Route: if no model specified, use model-router
  let _model = model;
  let _provider = provider;
  if (!_model) {
    try {
      const router = require('../model-router');
      const routed = router.route(prompt);
      _model = routed.model;
      _provider = routed.provider;
    } catch (_) {
      _provider = provider || process.env.LLM_PROVIDER || 'minimax';
      _model = model || process.env.LLM_MODEL || null;
    }
  }

  try {
    for await (const ev of runAgent({
      prompt,
      history: hist,
      model: _model,
      provider: _provider,
      opts: { maxTurns: runOpts.maxTurns || 10, ...runOpts },
    })) {
      // Forward every event
      yield ev;

      // Track
      if (ev.type === 'token') {
        assistantBuffer.content += ev.content;
      } else if (ev.type === 'turn') {
        turnCount = ev.turn;
      } else if (ev.type === 'tool-call') {
        toolCalls++;
      } else if (ev.type === 'done') {
        // Persist assistant turn
        if (assistantBuffer.content) {
          appendTurn(sid, 'assistant', assistantBuffer.content);
          assistantBuffer.content = '';
        }
        // Also save full session
        try {
          const session = loadSession(sid);
          if (session && session.messages) {
            saveSession(sid, session.messages, { provider: _provider, model: _model });
          }
        } catch (_) {}
      } else if (ev.type === 'error') {
        // Log but don't crash
      }
    }
  } catch (err) {
    yield { type: 'error', error: err.message };
  }

  // Update current session
  setCurrentSessionId(sid);
}

/**
 * Quick one-shot chat without session persistence.
 * @param {string} prompt
 * @param {Object} [opts]
 */
async function* complete(prompt, opts = {}) {
  yield* chat({ prompt, sessionId: null, ...opts });
}

// ── Exports ───────────────────────────────────────────────────────────

module.exports = {
  // Session
  createSession,
  loadSession,
  saveSession,
  listSessions,
  deleteSession,
  renameSession,
  branchSession,
  closeSession,
  archiveSession,
  unarchiveSession,
  searchSessions,
  getHistory,
  appendTurn,

  // Chat
  chat,
  complete,

  // Current session
  getCurrentSessionId,
  setCurrentSessionId,
};
