'use strict';

/**
 * packages/index.js — Parity package registry
 * ===========================================
 * One place that knows about all harnesses and shared packages.
 * Used by CLI, TUI, Web, and the main engine to discover capabilities.
 */

const path = require('path');
const fs   = require('fs');

function tryRequire(p) {
  try { return require(p); } catch { return null; }
}

// ── Shared packages ────────────────────────────────────────────────────────────

const SHARED = {
  'task-schema':       tryRequire('./task-schema'),
  'result-schema':    tryRequire('./result-schema'),
  'context-spine':    tryRequire('./context-spine'),
  'verification-core': tryRequire('./verification-core'),
  'memory-audit':     tryRequire('./memory-audit'),
};

// ── Harness registry ───────────────────────────────────────────────────────────

const HARNESSES = {
  codex:   tryRequire('./harness-codex'),
  claude:  tryRequire('./harness-claude'),   // Stage 4
  hermes:  tryRequire('./harness-hermes'),   // Stage 5
  minimax: tryRequire('./harness-minimax'),  // Stage 6
};

/** Available harness names */
function availableHarnesses() {
  return Object.entries(HARNESSES).filter(([, m]) => m !== null).map(([k]) => k);
}

/** Get harness by name */
function getHarness(name) {
  return HARNESSES[name] || null;
}

/** Check if a harness is available */
function hasHarness(name) {
  return HARNESSES[name] !== null;
}

/** Get shared package */
function getShared(name) {
  return SHARED[name] || null;
}

// ── Parity status ─────────────────────────────────────────────────────────────

function parityStatus() {
  const root = path.resolve(__dirname, '..'); // PURPCLAW root
  const requiredShared = ['task-schema', 'result-schema', 'context-spine', 'verification-core', 'memory-audit'];
  const requiredHarnesses = ['codex', 'claude', 'hermes', 'minimax'];

  const sharedOk = requiredShared.map(name => ({ name, ok: SHARED[name] !== null }));
  const harnessOk = requiredHarnesses.map(name => ({ name, ok: HARNESSES[name] !== null }));

  const sharedDone = sharedOk.filter(s => s.ok).length;
  const harnessDone = harnessOk.filter(h => h.ok).length;

  return {
    phase:   harnessDone === 0 ? 3 : harnessDone < 4 ? 3 + harnessDone : 7,
    shared:  { total: requiredShared.length, done: sharedDone, items: sharedOk },
    harness: { total: requiredHarnesses.length, done: harnessDone, items: harnessOk },
    gateA:   sharedDone === requiredShared.length,          // Contract parity
    gateB:   SHARED['context-spine'] !== null,             // Context parity
    gateC:   HARNESSES.codex !== null,                    // Execution parity
    gateD:   SHARED['verification-core'] !== null,        // Verification parity
    gateE:   fs.existsSync(path.join(root, 'app', 'api', 'harness', 'parity', 'route.ts')),  // Presentation parity
    gateF:   SHARED['memory-audit'] !== null,             // Audit parity
  };
}

module.exports = {
  SHARED,
  HARNESSES,
  availableHarnesses,
  getHarness,
  hasHarness,
  getShared,
  parityStatus,
};
