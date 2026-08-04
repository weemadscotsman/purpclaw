'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const STATE_DIR = process.env.PURPCLAW_STATE_DIR || path.join(ROOT, '.purpclaw');
const DB_PATH = process.env.PURPCLAW_SESSION_DB || path.join(STATE_DIR, 'state.db');
const LEGACY_DIR = path.join(STATE_DIR, 'sessions');

fs.mkdirSync(STATE_DIR, { recursive: true });
// PURPCLAW_SESSION_DB can point outside STATE_DIR (tests, alternate profiles).
// Creating STATE_DIR alone then leaves the real target dir missing and sqlite
// fails with the unhelpful "unable to open database file".
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'cli',
    profile TEXT NOT NULL DEFAULT 'default',
    parent_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ended_at TEXT,
    end_reason TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    archived_reason TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status TEXT,
    error TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(session_id, ordinal)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, ordinal);
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, role UNINDEXED, session_id UNINDEXED, content='messages', content_rowid='id');
  CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content, role, session_id) VALUES (new.id, new.content, new.role, new.session_id);
  END;
  CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, role, session_id) VALUES ('delete', old.id, old.content, old.role, old.session_id);
  END;
  CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, role, session_id) VALUES ('delete', old.id, old.content, old.role, old.session_id);
    INSERT INTO messages_fts(rowid, content, role, session_id) VALUES (new.id, new.content, new.role, new.session_id);
  END;
`);

function generateId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(title = 'New Chat', provider = '', model = '', opts = {}) {
  const now = new Date().toISOString();
  const session = {
    id: opts.id || generateId(), title: title || 'New Chat', provider, model,
    source: opts.source || 'cli', profile: opts.profile || 'default',
    parentId: opts.parentId || null, createdAt: opts.createdAt || now,
    updatedAt: opts.updatedAt || now, messages: [], messageCount: 0,
  };
  db.prepare(`INSERT OR IGNORE INTO sessions
    (id,title,provider,model,source,profile,parent_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(session.id, session.title, provider || '', model || '', session.source, session.profile, session.parentId, session.createdAt, session.updatedAt);
  return session;
}

function saveSession(id, messages, opts = {}) {
  let session = loadSession(id);
  if (!session) session = createSession(opts.title || 'Untitled', opts.provider, opts.model, { id, source: opts.source, profile: opts.profile, parentId: opts.parentId });
  const now = new Date().toISOString();
  let title = opts.title || session.title;
  if (!title || title === 'New Chat' || title === 'Untitled') {
    const first = messages.find(message => message.role === 'user');
    title = first ? String(first.content).replace(/\s+/g, ' ').slice(0, 60) : 'Untitled';
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE sessions SET title=?,provider=?,model=?,updated_at=? WHERE id=?')
      .run(title, opts.provider || session.provider || '', opts.model || session.model || '', now, id);
    db.prepare('DELETE FROM messages WHERE session_id=?').run(id);
    const insert = db.prepare(`INSERT INTO messages
      (session_id,ordinal,role,content,status,error,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)`);
    messages.forEach((message, ordinal) => {
      const metadata = { ...message };
      delete metadata.role; delete metadata.content; delete metadata.status; delete metadata.error; delete metadata.ts;
      insert.run(id, ordinal, message.role, String(message.content || ''), message.status || null, message.error || null,
        Object.keys(metadata).length ? JSON.stringify(metadata) : null, message.ts || now);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return loadSession(id);
}

function loadSession(id) {
  if (!id) return null;
  // node:sqlite refuses to bind anything that is not a string, number, bigint,
  // Buffer or null, and reports it as a bare ERR_INVALID_STATE naming neither
  // the parameter nor the caller. Callers pass a whole session object here by
  // mistake often enough — saveSession(session, …) instead of
  // saveSession(session.id, …) — that the opaque driver error is worth
  // replacing with one that says what went wrong.
  if (typeof id !== 'string') {
    throw new TypeError(
      `session id must be a string, got ${id === null ? 'null' : Array.isArray(id) ? 'array' : typeof id}`
      + (id && typeof id === 'object' && typeof id.id === 'string'
        ? ` — did you mean to pass the .id property ("${id.id}")?` : ''),
    );
  }
  const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!row) return null;
  const messages = db.prepare('SELECT * FROM messages WHERE session_id=? ORDER BY ordinal').all(id).map(row => {
    let metadata = {};
    try { metadata = row.metadata ? JSON.parse(row.metadata) : {}; } catch {}
    return { role: row.role, content: row.content, ...(row.status ? { status: row.status } : {}), ...(row.error ? { error: row.error } : {}), ...metadata, ts: row.created_at };
  });
  return {
    id: row.id, title: row.title, provider: row.provider, model: row.model,
    source: row.source, profile: row.profile, parentId: row.parent_id,
    createdAt: row.created_at, updatedAt: row.updated_at, endedAt: row.ended_at,
    endReason: row.end_reason, messageCount: messages.length, messages,
    archived: Boolean(row.archived), archivedAt: row.archived_at, archivedReason: row.archived_reason,
  };
}

function listSessions(limit = 50, opts = {}) {
  const clauses = ['archived=0'], values = [];
  if (opts.profile) { clauses.push('profile=?'); values.push(opts.profile); }
  if (opts.source) { clauses.push('source=?'); values.push(opts.source); }
  if (opts.includeArchived) { clauses[0] = '1=1'; }
  const where = `WHERE ${clauses.join(' AND ')}`;
  values.push(Math.max(1, Math.min(Number(limit) || 50, 500)));
  return db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id) message_count FROM sessions s ${where} ORDER BY updated_at DESC LIMIT ?`).all(...values).map(row => ({
    id: row.id, title: row.title, provider: row.provider, model: row.model,
    source: row.source, profile: row.profile, parentId: row.parent_id,
    createdAt: row.created_at, updatedAt: row.updated_at, messageCount: row.message_count,
    archived: Boolean(row.archived), archivedAt: row.archived_at,
  }));
}

function searchSessions(query, opts = {}) {
  const limit = Math.max(1, Math.min(Number(opts.limit) || 20, 100));
  const ftsQuery = String(query || '').trim().split(/\s+/).filter(Boolean)
    .map(token => `"${token.replace(/"/g, '""')}"`).join(' AND ');
  if (!ftsQuery) return [];
  const archivedFilter = opts.includeArchived ? '' : 'AND s.archived=0';
  return db.prepare(`SELECT f.session_id, f.role, snippet(messages_fts,0,'>>>','<<<','…',20) snippet,
    s.title, s.updated_at updatedAt FROM messages_fts f JOIN sessions s ON s.id=f.session_id
    WHERE messages_fts MATCH ? ${archivedFilter} ORDER BY rank LIMIT ?`).all(ftsQuery, limit);
}

function branchSession(id, opts = {}) {
  const parent = loadSession(id);
  if (!parent) return null;
  const child = createSession(opts.title || `${parent.title} branch`, parent.provider, parent.model, {
    source: parent.source, profile: parent.profile, parentId: parent.id,
  });
  const through = Number.isInteger(opts.through) ? Math.max(0, opts.through) : parent.messages.length;
  return saveSession(child.id, parent.messages.slice(0, through), { title: child.title, provider: child.provider, model: child.model });
}

function closeSession(id, reason = 'closed') {
  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET ended_at=?,end_reason=?,updated_at=? WHERE id=?').run(now, reason, now, id);
  return loadSession(id);
}

function deleteSession(id) {
  if (!id) return { deleted: false, id };
  const session = loadSession(id);
  if (!session) return { deleted: false, id };
  // Close first (preserves audit trail in DB), then remove
  if (!session.endedAt) {
    closeSession(id, 'deleted');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM messages WHERE session_id=?').run(id);
    db.prepare('DELETE FROM sessions WHERE id=?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { deleted: true, id, title: session.title, messageCount: session.messageCount };
}

function renameSession(id, newTitle) {
  if (!id || !newTitle) return null;
  const session = loadSession(id);
  if (!session) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET title=?,updated_at=? WHERE id=?').run(newTitle, now, id);
  return loadSession(id);
}

function archiveSession(id, reason = '') {
  if (!id) return { ok: false, error: 'no session id' };
  const session = loadSession(id);
  if (!session) return { ok: false, error: `Session '${id}' not found` };
  if (session.archived) return { ok: false, error: `Session '${id}' is already archived` };
  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET archived=1,archived_at=?,archived_reason=?,updated_at=? WHERE id=?').run(now, reason, now, id);
  return { ok: true, sessionId: id, archived_at: now };
}

function unarchiveSession(id) {
  if (!id) return { ok: false, error: 'no session id' };
  const session = loadSession(id);
  if (!session) return { ok: false, error: `Session '${id}' not found` };
  if (!session.archived) return { ok: false, error: `Session '${id}' is not archived` };
  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET archived=0,archived_at=NULL,archived_reason=NULL,updated_at=? WHERE id=?').run(now, id);
  return { ok: true, sessionId: id };
}

function migrateLegacy() {
  if (!fs.existsSync(LEGACY_DIR)) return { imported: 0 };
  let imported = 0;
  for (const file of fs.readdirSync(LEGACY_DIR).filter(name => /^session-.*\.json$/.test(name))) {
    try {
      const legacy = JSON.parse(fs.readFileSync(path.join(LEGACY_DIR, file), 'utf8'));
      if (!legacy.id || loadSession(legacy.id)) continue;
      createSession(legacy.title, legacy.provider, legacy.model, { id: legacy.id, createdAt: legacy.createdAt, updatedAt: legacy.updatedAt, source: 'legacy-json' });
      saveSession(legacy.id, legacy.messages || [], { title: legacy.title, provider: legacy.provider, model: legacy.model });
      imported++;
    } catch {}
  }
  return { imported };
}

const migration = migrateLegacy();

// Add archived columns to existing sessions table (no-op on new installs)
try {
  db.prepare('SELECT archived FROM sessions LIMIT 1').get();
} catch (_) {
  db.exec(`ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE sessions ADD COLUMN archived_at TEXT`);
  db.exec(`ALTER TABLE sessions ADD COLUMN archived_reason TEXT`);
}

module.exports = { createSession, saveSession, loadSession, listSessions, searchSessions, branchSession, closeSession, deleteSession, renameSession, archiveSession, unarchiveSession, generateId, migrateLegacy, migration, DB_PATH };
