'use strict';
/**
 * lib/session-store.js — Persistent Chat Session Storage
 * ════════════════════════════════════════════════════════
 *
 * Every chat session auto-saved. Browse, load, delete, switch.
 * Like Claude, ChatGPT, Hermes — but local. Your conversations
 * live on your drive, not someone else's server.
 *
 * Storage: ~/.purpclaw/sessions/<id>.json
 * Index:    ~/.purpclaw/sessions/_index.json
 *
 * Schema per session:
 *   {
 *     id: string,          // unique session ID (timestamp-based)
 *     title: string,       // first user message or "Untitled"
 *     createdAt: ISO,      // when the session started
 *     updatedAt: ISO,      // last message timestamp
 *     messageCount: number,
 *     messages: [          // full conversation history
 *       { role: 'user'|'assistant'|'tool', content: string, ... }
 *     ],
 *     provider: string,    // e.g. 'deepseek', 'openai'
 *     model: string,       // e.g. 'deepseek-v4-pro'
 *   }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.purpclaw', 'sessions');
const INDEX_FILE = path.join(SESSIONS_DIR, '_index.json');

// ── Ensure directories ──────────────────────────────────────────────────
function ensure() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ── Generate session ID ─────────────────────────────────────────────────
function generateId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `session-${ts}-${rand}`;
}

// ── Index ───────────────────────────────────────────────────────────────
function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch { return { sessions: {} }; }
}

function saveIndex(idx) {
  ensure();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2), 'utf8');
}

// ── Create session ──────────────────────────────────────────────────────
function createSession(title, provider, model) {
  ensure();
  const id = generateId();
  const session = {
    id,
    title: title || 'New Chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    messages: [],
    provider: provider || '',
    model: model || '',
  };

  const file = path.join(SESSIONS_DIR, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf8');

  // Update index
  const idx = loadIndex();
  idx.sessions[id] = {
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: 0,
    provider: session.provider,
    model: session.model,
  };
  saveIndex(idx);

  return session;
}

// ── Auto-save session ───────────────────────────────────────────────────
function saveSession(id, messages, opts = {}) {
  if (!id) return null;
  ensure();

  const file = path.join(SESSIONS_DIR, `${id}.json`);
  let session;

  // Read existing or create
  try {
    session = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    session = createSession(opts.title || 'Untitled', opts.provider, opts.model);
  }

  session.id = id;
  session.messages = messages;
  session.messageCount = messages.length;
  session.updatedAt = new Date().toISOString();

  // Auto-title from first user message
  if (!session.title || session.title === 'New Chat' || session.title === 'Untitled') {
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser) {
      const title = firstUser.content.substring(0, 60).replace(/\n/g, ' ');
      session.title = title || 'Untitled';
    }
  }

  if (opts.provider) session.provider = opts.provider;
  if (opts.model) session.model = opts.model;

  fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf8');

  // Update index
  const idx = loadIndex();
  idx.sessions[id] = {
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    provider: session.provider,
    model: session.model,
  };
  saveIndex(idx);

  return session;
}

// ── Load session ────────────────────────────────────────────────────────
function loadSession(id) {
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

// ── List sessions ───────────────────────────────────────────────────────
function listSessions(limit = 50) {
  const idx = loadIndex();
  const sessions = [];
  for (const [id, meta] of Object.entries(idx.sessions)) {
    sessions.push({ id, ...meta });
  }
  // Sort by updatedAt descending
  sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return sessions.slice(0, limit);
}

// ── Delete session ──────────────────────────────────────────────────────
function deleteSession(id) {
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  const idx = loadIndex();
  delete idx.sessions[id];
  saveIndex(idx);

  return { deleted: true, id };
}

// ── Rename session ──────────────────────────────────────────────────────
function renameSession(id, newTitle) {
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;

  const session = JSON.parse(fs.readFileSync(file, 'utf8'));
  session.title = newTitle;
  fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf8');

  const idx = loadIndex();
  if (idx.sessions[id]) idx.sessions[id].title = newTitle;
  saveIndex(idx);

  return session;
}

// ── Get file path (for serving to external tools) ───────────────────────
function getPath(id) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

module.exports = {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  renameSession,
  getPath,
  SESSIONS_DIR,
  generateId,
};
