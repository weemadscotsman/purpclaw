'use strict';

const path = require('path');

function printText(report, ctx) {
  const { C, col } = ctx;
  const c = (color, value) => col ? col(color, value) : value;
  console.log('');
  console.log(c(C.bold + C.cyan, 'PURPCLAW SURFACE CAPABILITIES'));
  console.log(c(C.gray, 'One shared job catalog for CLI, TUI, and web UI.'));
  console.log('');
  for (const item of report.capabilities) {
    console.log(`${c(C.green, item.id.padEnd(16))} ${c(C.bold, item.label)}`);
    console.log(`  ${c(C.gray, item.reason)}`);
    console.log(`  CLI: ${item.cli.join('  |  ')}`);
    console.log(`  TUI: ${item.tui.join('  |  ')}`);
    console.log(`  Web: ${item.web.route} (${item.web.mode}) -> ${item.web.api}`);
    console.log(`  Setup: ${item.setup.join(', ')}`);
    console.log('');
  }
}

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const catalog = require(path.join(PURP_DIR, 'lib', 'surface-capabilities.js'));
  const json = args.includes('--json');
  const verify = args.includes('--verify') || args.includes('--check');
  const id = args.find(arg => !arg.startsWith('--'));
  const report = id
    ? { ...catalog.paritySummary(), capabilities: [catalog.findCapability(id)].filter(Boolean) }
    : catalog.paritySummary();

  if (verify) {
    const validation = catalog.validateCapabilityCatalog(report.capabilities);
    const verification = { ok: validation.ok, schema: 'purpclaw.surface-capabilities.verify.v1', validation };
    if (json) {
      console.log(JSON.stringify(verification, null, 2));
    } else if (validation.ok) {
      console.log(`Surface capability catalog verified: ${validation.checked} capabilities cover CLI, TUI, web, setup, and API metadata.`);
    } else {
      console.log('Surface capability catalog verification failed:');
      for (const failure of validation.failures) console.log(`- ${failure}`);
    }
    if (!validation.ok) process.exitCode = 1;
    return verification;
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }
  printText(report, ctx);
  return report;
}

module.exports = { run };
