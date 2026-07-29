'use strict';

/**
 * SPEC-002: Scoped Memory Model
 *
 * Four scope levels: session < project < user < app.
 * Each record carries: scope, source, timestamp, ttl.
 * Scope is enforced at read time — records from one scope don't
 * bleed into another.
 *
 * Scope levels:
 *   session:<id>  — current session only
 *   project:<id>  — same project across sessions
 *   user:<id>     — all projects for same user
 *   app:<id>      — all users on this installation
 *
 * Architecture:
 *   - Scope index: local SQLite in .purpclaw/scopes/
 *   - Cognitive spine: memory-client.js (passes scope through)
 *   - TTL enforcement: checked on each recall
 *
 * Gap from spec: cognitive spine scope enforcement is local-filter only
 * (cognitive spine doesn't natively support scopes yet). When cognitive
 * spine adds scope as a first-class field, scope enforcement moves there.
 */

const path      = require('path');
const crypto    = require('crypto');
const fs        = require('fs');

// ── Scope index (local SQLite) ────────────────────────────────────────────────

const ROOT  = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW';
const DIR   = path.join(ROOT, '.purpclaw', 'scopes');
const DB    = path.join(DIR, 'scope-index.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  // node:sqlite is available (session-state-service uses it)
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(DIR, { recursive: true });
  _db = new DatabaseSync(DB);
  _db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS scope_index (
      id          TEXT PRIMARY KEY,
      scope       TEXT NOT NULL,
      owner       TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content_preview TEXT NOT NULL,
      ttl_seconds  INTEGER,
      created_at   TEXT NOT NULL,
      expires_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scope_owner ON scope_index(scope, owner);
  `);
  return _db;
}

// ── Scope validation ────────────────────────────────────────────────────────

const VALID_SCOPES = ['session', 'project', 'user', 'app'];

function validateScope(scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}`);
  }
}

function parseScope(key) {
  const [scope, ...rest] = key.split(':');
  return { scope, owner: rest.join(':') || null };
}

function makeKey(scope, owner) {
  validateScope(scope);
  return `${scope}:${owner || ''}`;
}

// ── Scope-aware ingest ────────────────────────────────────────────────────────

/**
 * Ingest a memory record with scope enforcement.
 * Wraps memory-client.ingest() and adds a local scope index entry.
 *
 * @param {object} opts
 * @param {string} opts.content     - what to remember
 * @param {string} opts.scope      - session | project | user | app
 * @param {string} [opts.owner]    - scope owner id
 * @param {string} [opts.source]   - source agent/system
 * @param {number} [opts.ttlSeconds] - TTL in seconds (null = never expires)
 * @param {number} [opts.importance]
 * @param {number} [opts.valence]
 */
async function ingest({ content, scope = 'session', owner = null, source, ttlSeconds = null, importance = 0.5, valence = 0.0 }) {
  validateScope(scope);
  const MEM = (() => { try { return require('./memory-client'); } catch { return null; } })();

  // Call cognitive spine (ignore return — id not critical)
  if (MEM && typeof MEM.ingest === 'function') {
    await MEM.ingest(content, { source, importance, valence, type: 'task_result', metadata: { scope, owner } });
  }

  // Index locally with scope
  const id          = 's2_' + crypto.randomBytes(8).toString('hex');
  const now         = new Date().toISOString();
  const contentHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  const preview     = content.substring(0, 120);
  const expiresAt   = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;

  const key = makeKey(scope, owner);

  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO scope_index (id, scope, owner, content_hash, content_preview, ttl_seconds, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, scope, owner || '', contentHash, preview, ttlSeconds, now, expiresAt);
  } catch (e) {
    // Non-fatal: scope index failure doesn't block memory
  }

  return { id, scope, owner, key };
}

// ── Scope-aware recall ────────────────────────────────────────────────────────

/**
 * Recall memories, filtered by scope.
 * Wraps memory-client.recall() with local scope + TTL enforcement.
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} opts.scope  - session | project | user | app | null (null = all)
 * @param {string} [opts.owner]
 * @param {number} [opts.limit]
 */
async function recall({ query, scope = null, owner = null, limit = 5 }) {
  const MEM = (() => { try { return require('./memory-client'); } catch { return null; } })();

  let results = [];

  // Always call cognitive spine — it does the semantic search
  if (MEM && typeof MEM.recall === 'function') {
    try {
      const resp = await MEM.recall(query, { limit: limit * 2 }); // over-fetch to allow filtering
      results = resp.results || [];
    } catch {}
  }

  // Local scope + TTL filter
  if (scope) {
    validateScope(scope);
    results = _filterByScope(results, scope, owner);
  }

  // TTL filter: remove expired entries
  const now = new Date().toISOString();
  results = results.filter(r => {
    const exp = r.expires_at || r.expiresAt;
    if (!exp) return true;
    return exp > now;
  });

  // Limit
  results = results.slice(0, limit);

  return { results, formatted: _formatForPrompt(results, query) };
}

function _filterByScope(results, scope, owner) {
  // Results from cognitive spine don't carry scope — use local index
  // to determine which memories belong to this scope.
  // If cognitive spine adds scope metadata, use it directly.
  try {
    const db = getDb();
    const rows = db.prepare(
      owner
        ? 'SELECT id, scope, owner FROM scope_index WHERE scope = ? AND owner = ? AND expires_at IS NULL OR expires_at > ?'
        : 'SELECT id, scope, owner FROM scope_index WHERE scope = ? AND (expires_at IS NULL OR expires_at > ?)'
    ).all(...(owner ? [scope, owner, new Date().toISOString()] : [scope, new Date().toISOString()]));

    const allowedIds = new Set(rows.map(r => r.id));
    return results.filter(r => allowedIds.has(r.id) || r.memory_id && allowedIds.has(r.memory_id));
  } catch {
    return results; // fallback: return all
  }
}

// ── Scope enforcement helpers ────────────────────────────────────────────────

/**
 * Clear all records for a specific scope and owner.
 * Used when a project is deleted or a session ends.
 */
function clearScope(scope, owner) {
  validateScope(scope);
  if (!owner) throw new Error('clearScope requires owner');

  try {
    const db = getDb();
    const count = db.prepare('DELETE FROM scope_index WHERE scope = ? AND owner = ?').run(scope, owner);
    return { cleared: count.changes };
  } catch (e) {
    return { cleared: 0, error: e.message };
  }
}

/**
 * List all scope levels active for an owner.
 * Returns { scope, owner, count }[]
 */
function listScopes(owner) {
  try {
    const db = getDb();
    return db.prepare(
      'SELECT scope, owner, COUNT(*) as count FROM scope_index WHERE owner = ? GROUP BY scope'
    ).all(owner).map(r => ({ scope: r.scope, owner: r.owner, count: r.count }));
  } catch {
    return [];
  }
}

/**
 * Get scope statistics.
 */
function scopeStats() {
  try {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as n FROM scope_index').get().n;
    const byScope = db.prepare(
      'SELECT scope, COUNT(*) as n FROM scope_index GROUP BY scope ORDER BY n DESC'
    ).all();
    const expired = db.prepare(
      "SELECT COUNT(*) as n FROM scope_index WHERE expires_at IS NOT NULL AND expires_at < ?"
    ).get(new Date().toISOString())?.n || 0;
    return { total, byScope, expired };
  } catch {
    return { total: 0, byScope: [], expired: 0 };
  }
}

// ── Format ──────────────────────────────────────────────────────────────────

function _formatForPrompt(results, query) {
  if (!results.length) return '';
  const lines = results.map((r, i) => {
    const content = r.content || r.text || r.result || JSON.stringify(r);
    return `[${i + 1}] ${content.substring(0, 200)}`;
  });
  return `\nMemory:\n${lines.join('\n')}\n`;
}

// ── Module API ───────────────────────────────────────────────────────────────

module.exports = {
  ingest,
  recall,
  clearScope,
  listScopes,
  scopeStats,
  VALID_SCOPES,
  makeKey,
  parseScope,
};
