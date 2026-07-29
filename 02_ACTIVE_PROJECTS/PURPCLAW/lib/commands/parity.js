'use strict';

/**
 * purpclaw parity — surface-capability audit command
 * ===================================================
 *
 * Reports which surfaces can invoke which actions for each capability.
 * Per the rule: "If CLI can do it, every surface must at least see it."
 *
 *   purpclaw parity                       # full report
 *   purpclaw parity auto-evolve          # one capability
 *   purpclaw parity auto-evolve --json   # JSON
 *   purpclaw parity auto-research        # one capability
 *   purpclaw parity auto-research --json
 *   purpclaw parity timeline             # one capability
 *
 * The capability contract lives in registry/surface-capabilities.json
 * (written by the batch that introduced the shared action layer).
 * This command never mutates anything.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CAPS_FILE = path.join(ROOT, 'registry', 'surface-capabilities.json');

function loadCaps() {
  try {
    if (!fs.existsSync(CAPS_FILE)) return null;
    return JSON.parse(fs.readFileSync(CAPS_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Compute a flat status table from the capability contract.
 * @param {object} caps - parsed surface-capabilities.json
 * @returns {object} { capabilities, totals, red_boxes, missing_actions }
 */
function auditCaps(caps) {
  if (!caps) {
    return { ok: false, error: 'registry/surface-capabilities.json missing' };
  }
  const out = {
    capabilities: {},
    totals: { capabilities: 0, actions: 0, wired: 0, total: 0 },
    red_boxes: [],
    missing_actions: [],
  };
  for (const [capName, cap] of Object.entries(caps.capabilities || {})) {
    const surfaces = ['cli', 'tui', 'web', 'mobile'];
    const surfaceStatus = {};
    for (const s of surfaces) {
      const wired = cap[s] === true;
      surfaceStatus[s] = wired ? 'wired' : 'NOT_WIRED';
    }
    const actionDetails = {};
    for (const [actionName, actionCaps] of Object.entries(cap.actions || {})) {
      out.totals.total += 1;
      const actionSurfaces = {};
      for (const s of surfaces) {
        const a = actionCaps[s];
        actionSurfaces[s] = a === true;
        if (a === true) out.totals.wired += 1;
      }
      actionDetails[actionName] = actionSurfaces;
      // Red box: if CLI can do it but no other surface can
      if (actionSurfaces.cli) {
        const otherWired = ['tui', 'web', 'mobile'].some(s => actionSurfaces[s]);
        if (!otherWired) {
          out.red_boxes.push({
            capability: capName,
            action: actionName,
            issue: 'CLI can invoke, no other surface can',
          });
        }
      }
    }
    out.capabilities[capName] = {
      surface_overall: surfaceStatus,
      actions: actionDetails,
    };
    out.totals.capabilities += 1;
    out.totals.actions += Object.keys(cap.actions || {}).length;
  }
  return out;
}

function printHuman(report) {
  if (!report.ok && report.error) {
    console.log('PARITY AUDIT: ERROR');
    console.log('  ' + report.error);
    return;
  }
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║  PURPCLAW Surface-Capability Parity Audit  ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  for (const [capName, cap] of Object.entries(report.capabilities)) {
    console.log(`  ${capName.toUpperCase()}`);
    for (const s of ['cli', 'tui', 'web', 'mobile']) {
      const status = cap.surface_overall[s];
      const icon = status === 'wired' ? '✓' : '✗';
      console.log(`    [${icon}] ${s.padEnd(8)} ${status}`);
    }
    console.log('    Actions:');
    for (const [actionName, actionSurfaces] of Object.entries(cap.actions)) {
      const tags = ['cli', 'tui', 'web', 'mobile']
        .map(s => `${s}=${actionSurfaces[s] ? '✓' : '✗'}`)
        .join(' ');
      console.log(`      ${actionName.padEnd(12)} ${tags}`);
    }
    console.log('');
  }
  console.log(`  TOTALS: ${report.totals.wired} surface-actions wired out of ${report.totals.total * 4} (action × surface) possible`);
  console.log(`  Unique action coverage: ${report.totals.total - report.red_boxes.length}/${report.totals.total} actions have at least one surface wired (besides CLI)`);
  console.log(`  RED BOXES (CLI can do, no other surface can): ${report.red_boxes.length}`);
  for (const rb of report.red_boxes.slice(0, 5)) {
    console.log(`    - ${rb.capability}.${rb.action}`);
  }
  console.log('');
}

function help() {
  return `purpclaw parity — surface capability audit

Usage:
  purpclaw parity                       # full report (human-readable)
  purpclaw parity auto-evolve            # one capability
  purpclaw parity auto-evolve --json     # JSON
  purpclaw parity auto-research          # one capability
  purpclaw parity auto-research --json
  purpclaw parity timeline               # one capability
  purpclaw parity timeline --json

Reports which surfaces (CLI, TUI, Web, Mobile) can invoke which actions
for each capability, per registry/surface-capabilities.json. Read-only.
`;
}

async function run(args = [], ctx = {}) {
  // Strip --json before parsing subcommand
  const allArgs = Array.isArray(args) ? args : [];
  const asJson = allArgs.includes('--json');
  const cleanArgs = allArgs.filter(a => a !== '--json');
  const [subRaw, ...rest] = cleanArgs;
  const sub = (subRaw || 'all').toLowerCase();
  const caps = loadCaps();

  // Normalize: accept both kebab-case (CLI) and snake_case (registry)
  const capName = sub ? sub.replace(/-/g, '_') : 'all';

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(help());
    return { ok: true };
  }
  if (!caps) {
    if (asJson) console.log(JSON.stringify({ ok: false, error: 'caps missing' }, null, 2));
    else console.log('PARITY AUDIT: registry/surface-capabilities.json missing');
    return { ok: false };
  }
  const report = auditCaps(caps);
  if (capName !== 'all') {
    const single = report.capabilities[capName];
    if (!single) {
      const err = { ok: false, error: `unknown capability: ${sub}` };
      if (asJson) console.log(JSON.stringify(err, null, 2));
      else console.log(`PARITY AUDIT: unknown capability: ${sub}`);
      return err;
    }
    const filtered = {
      ok: true,
      capabilities: { [capName]: single },
      totals: { capabilities: 1, actions: Object.keys(single.actions).length, wired: 0, total: 0 },
      red_boxes: report.red_boxes.filter(r => r.capability === capName),
    };
    // Recompute totals for the subset
    for (const actionSurfaces of Object.values(single.actions)) {
      filtered.totals.total += 1;
      for (const s of ['cli', 'tui', 'web', 'mobile']) {
        if (actionSurfaces[s]) filtered.totals.wired += 1;
      }
    }
    if (asJson) console.log(JSON.stringify(filtered, null, 2));
    else {
      console.log('');
      console.log(`  ${capName.toUpperCase()} — ${Object.keys(single.actions).length} actions`);
      for (const [actionName, actionSurfaces] of Object.entries(single.actions)) {
        const tags = ['cli', 'tui', 'web', 'mobile']
          .map(s => `${s}=${actionSurfaces[s] ? '✓' : '✗'}`)
          .join(' ');
        console.log(`    ${actionName.padEnd(12)} ${tags}`);
      }
      console.log('');
      console.log(`  Wired: ${filtered.totals.wired} surface-actions / ${filtered.totals.total * 4} possible`);
      console.log(`  Red boxes: ${filtered.red_boxes.length}`);
    }
    return filtered;
  }
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  return report;
}

module.exports = { run, auditCaps, loadCaps };

if (require.main === module) {
  run(process.argv.slice(2), { PURP_DIR: ROOT }).catch(e => { console.error(e); process.exit(2); });
}