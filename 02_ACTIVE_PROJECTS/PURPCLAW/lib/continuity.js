'use strict';

/**
 * SPEC-007: Continuity and Recovery
 *
 * Session state survives agent crashes, model timeouts, and operator
 * disconnection. Snapshots are taken at turn boundaries.
 *
 * Storage: .purpclaw/continuity/{sessionId}/{snapshotId}/snapshot.json
 * Each snapshot is a subdirectory. LATEST is a pointer file.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW';
const DIR  = path.join(ROOT, '.purpclaw', 'continuity');

function sessionDir(sessionId) {
  return path.join(DIR, sessionId);
}

function safeMkdir(sessionId) {
  fs.mkdirSync(sessionDir(sessionId), { recursive: true });
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Capture current agent-loop state at a turn boundary.
 *
 * @param {object} state
 * @param {string} state.sessionId
 * @param {number} state.turn
 * @param {string} state.goal
 * @param {Array}  state.messages
 * @param {Array}  [state.pendingCalls]
 * @param {object} [state.memoryScope]
 * @param {string} [state.checkpointId]
 * @param {object} [state.metadata]
 * @returns {{ id, sessionId, turn, pendingCount, createdAt }}
 */
function snapshot(state) {
  const {
    sessionId, turn, goal, messages,
    pendingCalls = [], memoryScope = {},
    checkpointId = null, metadata = {},
  } = state;
  if (!sessionId) throw new Error('snapshot() requires sessionId');

  safeMkdir(sessionId);
  const id = `snapshot-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const dir = path.join(sessionDir(sessionId), id);
  fs.mkdirSync(dir, { recursive: true });

  const createdAt = new Date().toISOString();

  // snapshot.json — full state
  fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify({
    id, sessionId, turn, goal, checkpointId,
    pendingCalls,
    memoryScope,
    metadata,
    // Store only role+content to keep snapshot small
    messages: (messages || []).map(m => ({ role: m.role, content: m.content })),
    timestamp: createdAt,
  }, null, 2));

  // meta.json — lightweight index
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    id, sessionId, turn,
    goal: goal?.substring(0, 120) || '',
    pendingCount: pendingCalls.length,
    messageCount: (messages || []).length,
    timestamp: createdAt,
  }, null, 2));

  // LATEST pointer for fast resume
  fs.writeFileSync(path.join(sessionDir(sessionId), 'LATEST'), id);

  return { id, sessionId, turn, pendingCount: pendingCalls.length, createdAt };
}

// ── Resume ───────────────────────────────────────────────────────────────────

/**
 * Load the latest snapshot for a session.
 * Returns null if no snapshot exists.
 */
function getLatest(sessionId) {
  try {
    const latestFile = path.join(sessionDir(sessionId), 'LATEST');
    if (!fs.existsSync(latestFile)) return null;
    const id = fs.readFileSync(latestFile, 'utf8').trim();
    return JSON.parse(fs.readFileSync(path.join(sessionDir(sessionId), id, 'snapshot.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Load a specific snapshot by ID.
 */
function getSnapshot(sessionId, snapshotId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionDir(sessionId), snapshotId, 'snapshot.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * List all snapshots for a session, newest first.
 * Only counts actual snapshot subdirectories (not loose files like LATEST).
 */
function list(sessionId) {
  try {
    return fs.readdirSync(sessionDir(sessionId))
      .filter(n => {
        if (!n.startsWith('snapshot-')) return false;
        try { return fs.statSync(path.join(sessionDir(sessionId), n)).isDirectory(); }
        catch { return false; }
      })
      .map(id => {
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(sessionDir(sessionId), id, 'meta.json'), 'utf8'));
          return { id, ...meta };
        } catch {
          return { id };
        }
      })
      .sort((a, b) => b.id.localeCompare(a.id));
  } catch {
    return [];
  }
}

// ── Continuity Health ────────────────────────────────────────────────────────

/**
 * Check whether a session has continuity coverage.
 * Returns { lastTurn, lastCheckpoint, memoryIntact, snapshotCount, healthy }
 */
function health(sessionId) {
  const snapshots = list(sessionId);
  const latest = snapshots[0] || null;
  const lastTurn = latest ? latest.turn : null;

  let lastCheckpoint = null;
  try {
    const CHECKPOINT = (() => { try { return require('./checkpoint-manager'); } catch { return null; } })();
    if (CHECKPOINT) {
      const all = CHECKPOINT.list ? CHECKPOINT.list() : [];
      lastCheckpoint = all[0] ? all[0].id : null;
    }
  } catch {}

  let memoryIntact = true;
  try {
    const MEMORY = (() => { try { return require('./memory-client'); } catch { return null; } })();
    if (MEMORY && typeof MEMORY.recall === 'function') {
      MEMORY.recall('continuity check', { limit: 1 });
    }
  } catch { memoryIntact = false; }

  return {
    sessionId,
    lastTurn,
    lastCheckpoint,
    memoryIntact,
    snapshotCount: snapshots.length,
    healthy: lastTurn !== null,
    latestSnapshot: latest
      ? { id: latest.id, turn: latest.turn, createdAt: latest.timestamp }
      : null,
  };
}

// ── Resume Context Builder ───────────────────────────────────────────────────

/**
 * Build a resume context from a snapshot.
 * Returns { resumeFrom, messages, turn, goal, checkpointId, pendingCalls }
 */
function buildResumeContext(snap) {
  if (!snap) return { resumeFrom: 'cold', messages: [], turn: 0, goal: '', checkpointId: null, pendingCalls: [] };
  return {
    resumeFrom: 'snapshot',
    messages:    snap.messages || [],
    turn:        snap.turn || 0,
    goal:        snap.goal || '',
    checkpointId: snap.checkpointId || null,
    pendingCalls: snap.pendingCalls || [],
    memoryScope:  snap.memoryScope || {},
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Remove all snapshots for a session.
 */
function clearSession(sessionId) {
  try {
    const dir = sessionDir(sessionId);
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        for (const f of fs.readdirSync(full)) fs.unlinkSync(path.join(full, f));
        fs.rmdirSync(full);
      } else {
        fs.unlinkSync(full);
      }
    }
  } catch {}
}

module.exports = { snapshot, getLatest, getSnapshot, list, health, buildResumeContext, clearSession, DIR };
