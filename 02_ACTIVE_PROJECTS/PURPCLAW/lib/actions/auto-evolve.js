'use strict';

/**
 * PURPCLAW Shared Action Layer — Auto-Evolve
 * ===========================================
 *
 * One source of truth for the auto-evolve capability. Every surface
 * (CLI, TUI, Web UI, Mobile Web) calls into here. The CLI command
 * (lib/commands/evolve.js) and the Web API route are thin shells.
 *
 * Capability contract (registry/surface-capabilities.json):
 *   auto_evolve:
 *     cli: true
 *     tui: false  (not wired yet — added by this batch)
 *     web: partial
 *     mobile: false  (not wired yet — added by this batch)
 *
 * The evolve engine is `lib/evolution/mutator.js` (real, in-repo, no
 * subprocess). The skill-forge engine is `lib/evolution/skill-forge.js`.
 * This adapter is a thin local wrapper, not a second engine.
 */

const path = require('path');
const fs = require('fs');

// Next bundles API routes under .next/server; __dirname then points at the
// bundle, not the PURPCLAW checkout. All native surfaces execute from root.
const ROOT = process.env.PURPCLAW_ROOT || process.cwd();
const MUTATOR = require('../evolution/mutator');
const FORGE = require('../evolution/skill-forge');

const ACTIONS = {
  pass: { fn: (opts) => MUTATOR.runPass(opts || {}), description: 'Run a mutation pass over recent evidence' },
  forge: { fn: () => FORGE.runForgePass(), description: 'Detect taxonomy gaps; propose new JOB_TYPES + archetypes' },
  status: { fn: () => ({ proposed: MUTATOR.readProposed(30), applied: MUTATOR.readApplied(30), forged: FORGE.listForged({}) }), description: 'List pending + applied mutations' },
  approve: { fn: (opts) => MUTATOR.approveProposal(opts && opts.id), description: 'Apply a queued mutation by id' },
  reject: { fn: (opts) => MUTATOR.rejectProposal(opts && opts.id, opts && opts.reason), description: 'Reject a queued mutation' },
  history: { fn: (opts) => MUTATOR.readApplied(Number(opts?.limit || 20)), description: 'Show last 20 applied mutations' },
  regressions: { fn: () => MUTATOR.readApplied(100).filter(x => x.type === 'regression' || x.regression || x.applied === false), description: 'Show recent regression alerts' },
};

function run(action, options = {}) {
  const surface = options.surface || 'cli';
  const def = ACTIONS[action];
  if (!def) {
    return { ok: false, action, surface, error: `unknown action: ${action}` };
  }

  const caps = loadCapabilities();
  const cap = (caps.capabilities || caps)['auto_evolve'] || {};
  if (cap[surface] === false || cap.actions?.[action]?.[surface] === false) {
    return {
      ok: true, action, surface,
      unavailable: true,
      reason: `auto_evolve.${action} not wired for surface=${surface}`,
      hint: 'see docs/audit/AUTO_RESEARCH_EVOLVE_PARITY_2026-06-29.md',
    };
  }

  try {
    const result = def.fn(options);
    return { ok: true, action, surface, result };
  } catch (e) {
    return { ok: false, action, surface, error: e.message };
  }
}

function listActions() {
  return Object.entries(ACTIONS).map(([k, v]) => ({
    key: k,
    description: v.description,
  }));
}

function loadCapabilities() {
  try {
    const p = path.join(ROOT, 'registry', 'surface-capabilities.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { /* fall through */ }
  return {};
}

module.exports = { run, listActions, ACTIONS };
