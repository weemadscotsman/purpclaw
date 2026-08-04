'use strict';

/**
 * services/router — Cross-Harness Router
 * =====================================
 * Routes tasks to the correct harness based on:
 *   1. preferredHarness field on task
 *   2. Auto-detection from goal keywords (§7 routing rules)
 *   3. Multi-harness sequences (§7 multi-harness sequences)
 *
 * Routing rules (from §7):
 *   Codex  → precise repo surgery, TDD, patch, debugging, build repair
 *   Claude → architecture analysis, contradiction detection, large-context, migration
 *   Hermes → multi-tool workflows, artifact generation, shell+browser+file, retry-heavy
 *   MiniMax → rapid UI/component, style-preserving frontend, screenshot-driven builds
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §7
 */

const fs   = require('fs');
const path = require('path');

// ── Keyword routing table (§7) ────────────────────────────────────────────────

const ROUTES = {
  codex: [
    /\bfix\b/i, /\bbug\b/i, /\brepair\b/i, /\brecover\b/i,
    /\brefacto\w*\b/i, /\bpatch\b/i, /\btdd\b/i,
    /\btest[\s-]driven\b/i, /\bbuild\s+repair\b/i,
    /\bedit\b.*\bfile\b/i, /\breplace\b.*\bin\b/i,
    /\bimplement\b.*\bfeature\b/i,
  ],
  claude: [
    /\barchitect\w*\b/i, /\bcontradiction\b/i, /\bSpec.*mismatch\b/i,
    /\bmigrat\w*\b/i, /\bupgrade\b/i,
    /\banalyse\b/i, /\banalyze\b/i, /\baudit\b/i,
    /\blarge[\s-]context\b/i, /\bmulti[\s-]folder\b/i,
    /\brefacto\w*\b.*\bplan\b/i, /\bdocument\w*\b/i,
  ],
  hermes: [
    /\bmulti[\s-]tool\b/i, /\bartifact\b/i, /\bgenerate\b.*\bartifact\b/i,
    /\bshell\b.*\bbrowser\b/i, /\bbrowser\b.*\bshell\b/i,
    /\borchestrat\w*\b/i, /\bworkflow\b/i,
    /\bretry\b/i, /\bfallback\b/i,
    /\bcrawl\b/i, /\bwebscrape\b/i,
  ],
  minimax: [
    /\bui\b|\bu\/i\b|\bcomponent\b/i, /\brestyle\b/i,
    /\bscreenshot\b/i, /\bvisual\b/i, /\bfrontend\b/i,
    /\bmodal\b|\bbutton\b|\bcard\b|\bwidget\b/i,
    /\btailwind\b.*\bcomponent\b/i, /\breact\b.*\bcomponent\b/i,
    /\bdesign[\s-]token\b/i, /\bstyle[\s-]preserv\w*\b/i,
  ],
};

// Multi-harness sequences (§7)
const SEQUENCES = {
  'architecture-to-implementation': ['claude', 'codex', 'verification-core'],
  'ui-rebuild':                    ['claude', 'minimax', 'codex', 'verification-core'],
  'artifact-heavy':                ['claude', 'hermes', 'codex', 'verification-core'],
  'full-repo-modernisation':       ['claude', 'codex', 'minimax', 'hermes', 'verification-core'],
};

/**
 * Auto-detect which harness to use based on goal text.
 */
function autoDetect(goal) {
  const scores = { codex: 0, claude: 0, hermes: 0, minimax: 0 };
  const lower = goal.toLowerCase();
  for (const [harness, patterns] of Object.entries(ROUTES)) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) scores[harness]++;
    }
  }
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return winner[1] > 0 ? winner[0] : 'codex';  // default to codex
}

/**
 * Route a task to the correct harness name.
 */
function route(task) {
  const preferred = task.preferredHarness;

  // §7: Use preferred harness if valid
  if (preferred && preferred !== 'auto') {
    return { harness: preferred, method: 'preferred', reason: `preferredHarness=${preferred}` };
  }

  // §7: Auto-detect
  const detected = autoDetect(task.goal);
  return { harness: detected, method: 'auto-detect', reason: `keyword match: ${detected}` };
}

/**
 * Route a multi-harness sequence.
 */
function routeSequence(sequenceName) {
  const steps = SEQUENCES[sequenceName];
  if (!steps) return null;
  return { sequence: sequenceName, steps };
}

/**
 * Get the harness module for a given harness name.
 * Tries local path first, then @purpclaw packages.
 */
function loadHarness(name) {
  const localPaths = [
    `./harness-${name}`,
    `../packages/harness-${name}`,
    `../../packages/harness-${name}`,
  ];
  for (const p of localPaths) {
    try { return require(p); } catch (e) { /* ignore */ }
  }
  try { return require(`@purpclaw/harness-${name}`); } catch (e) { /* ignore */ }
  return null;
}

/**
 * Check which harnesses are available (modules loadable).
 */
function availableHarnesses() {
  return ['codex', 'claude', 'hermes', 'minimax']
    .map(h => ({ name: h, available: !!loadHarness(h) }));
}

/**
 * CLI rendering helper — returns a one-line status for any result.
 */
function renderResultLine(result) {
  const icons = { passed: '✅', partial: '⚠️', blocked: '🚫', failed: '❌' };
  const icon = icons[result.status] || '?';
  const files = result.filesChanged?.length || 0;
  const errs  = result.errors?.length   || 0;
  const ms    = result.durationMs        || 0;
  return `${icon} [${result.harness}] ${result.status.toUpperCase().padEnd(8)} | ` +
         `${result.summary?.slice(0, 60) || ''} | chg:${files} err:${errs} | ${ms}ms`;
}

module.exports = {
  ROUTES, SEQUENCES,
  autoDetect, route, routeSequence,
  loadHarness, availableHarnesses,
  renderResultLine,
};
