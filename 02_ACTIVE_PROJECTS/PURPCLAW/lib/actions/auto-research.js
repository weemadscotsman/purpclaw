'use strict';

/**
 * PURPCLAW Shared Action Layer — Auto-Research
 * ==============================================
 *
 * One source of truth for the auto-research capability. Every surface
 * (CLI, TUI, Web UI, Mobile Web) calls into here. No surface duplicates
 * the orchestration logic — that was the bug in the previous Frankensteined
 * version where CLI, TUI, and Web each had their own copy of the loop logic.
 *
 * The CLI command (lib/commands/autoresearch.js) and the Web API route
 * (app/api/evolution/status/route.ts) are thin shells that call these adapters.
 * The TUI and Mobile Web UI will be added in the same way.
 *
 * Capability contract (registry/surface-capabilities.json):
 *   auto_research:
 *     cli: true
 *     tui: false  (not wired yet — added by this batch)
 *     web: true
 *     mobile: false  (not wired yet — added by this batch)
 *
 *   If any capability flag is false, the action is still callable but the
 *   adapter returns a structured "unavailable" response so surfaces can
 *   show the right UI state (greyed button, "coming soon" tooltip, etc.)
 *   rather than failing.
 *
 * The downstream loop is implemented in E:/training/lib/autoresearch-orchestrator.js
 * (per the handoff). This adapter is a thin local wrapper that invokes the
 * orchestrator as a subprocess and parses its stdout. It does NOT re-implement
 * the loop — that would be the second-engine antipattern the Monster
 * Ledger explicitly forbids.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TRAINING_DIR = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';
const ORCH_PATH = path.join(TRAINING_DIR, 'lib', 'autoresearch-orchestrator.js');

const ACTIONS = {
  status: { command: 'status', description: 'current baseline + recent results' },
  runOnce: { command: 'run-once', description: 'one iteration' },
  loop: { command: 'loop', description: 'continuous loop (Ctrl-C to stop)' },
  reset: { command: 'reset', description: 'wipe results, revert to baseline' },
  prepare: { command: 'prepare', description: 'run prepare.py (data + metric)' },
  queue: { command: 'queue', description: 'list the curated hypothesis queue' },
  stop: { command: 'stop', description: 'write STOP marker (loop exits)' },
  resume: { command: 'resume', description: 'clear STOP/PAUSE markers' },
  logs: { command: 'logs', description: 'tail the autoresearch.log' },
};

/**
 * Run an autoresearch action.
 * @param {string} action - one of the keys of ACTIONS
 * @param {object} options - { surface, json }
 * @returns {object} { ok, action, surface, output, error?, unavailable? }
 */
function run(action, options = {}) {
  const surface = options.surface || 'cli';
  const def = ACTIONS[action];
  if (!def) {
    return { ok: false, action, surface, error: `unknown action: ${action}` };
  }

  // Surface capability check (read from registry/surface-capabilities.json).
  // The contract says which surfaces can call which actions; missing
  // capability = structured unavailable response, NOT an error.
  const caps = loadCapabilities();
  const cap = (caps.capabilities || caps)['auto_research'] || {};
  if (cap[surface] === false || cap.actions?.[action]?.[surface] === false) {
    return {
      ok: true, action, surface,
      unavailable: true,
      reason: `auto_research.${action} not wired for surface=${surface}`,
      hint: 'see docs/audit/AUTO_RESEARCH_EVOLVE_PARITY_2026-06-29.md',
    };
  }

  // Call the real orchestrator. We do NOT re-implement the loop.
  // spawnSync is fine here because each autoresearch action is
  // meant to be invoked once and return; the loop action is a
  // backgrounded process (handled by orchestrator internally).
  try {
    const r = spawnSync(process.execPath, [ORCH_PATH, def.command], {
      cwd: TRAINING_DIR,
      encoding: 'utf8',
      timeout: options.timeoutMs || 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      ok: r.status === 0,
      action, surface,
      status: r.status,
      output: (r.stdout || '').trim(),
      error: r.status !== 0 ? (r.stderr || '').trim() : null,
    };
  } catch (e) {
    return { ok: false, action, surface, error: e.message };
  }
}

function listActions() {
  return Object.entries(ACTIONS).map(([k, v]) => ({
    key: k,
    command: v.command,
    description: v.description,
  }));
}

function loadCapabilities() {
  try {
    const p = path.join(__dirname, '..', '..', 'registry', 'surface-capabilities.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { /* fall through */ }
  return {};
}

module.exports = { run, listActions, ACTIONS };
