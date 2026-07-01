'use strict';

/**
 * lib/spine/session-store.js — lightweight chat session store.
 * In-memory keyed by sessionId. Recent messages retained for context.
 * Optionally JSON-backed to ~/.purpclaw/sessions/ for durability.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_TURNS = 12;            // 6 user + 6 assistant turns
const PURP_HOME = process.env.PURPCLAW_HOME ||
  path.join(os.homedir(), '.purpclaw', 'sessions');

function ensureDir() {
  try { fs.mkdirSync(PURP_HOME, { recursive: true }); } catch (_) {}
}

function fileFor(sessionId) {
  if (!sessionId) return null;
  // Sanitize: only [a-zA-Z0-9_-] allowed
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  if (!safe) return null;
  return path.join(PURP_HOME, safe + '.json');
}

function load(sessionId) {
  const f = fileFor(sessionId);
  if (!f || !fs.existsSync(f)) return { turns: [] };
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) { return { turns: [] }; }
}

function save(sessionId, state) {
  const f = fileFor(sessionId);
  if (!f) return;
  ensureDir();
  try {
    fs.writeFileSync(f, JSON.stringify(state), 'utf8');
  } catch (_) { /* best effort */ }
}

function appendTurn(sessionId, role, content) {
  if (!sessionId) return;
  const state = load(sessionId);
  if (!state || typeof state !== 'object') return;
  if (!Array.isArray(state.turns)) state.turns = [];
  state.turns.push({ role, content, ts: Date.now() });
  // Trim to MAX_TURNS
  if (state.turns.length > MAX_TURNS) {
    state.turns = state.turns.slice(-MAX_TURNS);
  }
  save(sessionId, state);
}

function getHistory(sessionId) {
  if (!sessionId) return [];
  return load(sessionId).turns || [];
}

module.exports = { appendTurn, getHistory, load, save, MAX_TURNS };
