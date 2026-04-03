'use strict';

const path = require('path');

function boolText(v, C, col) {
  return v ? col(C.green, 'online') : col(C.red, 'offline');
}

async function run(args, ctx) {
  const { PURP_DIR, C, col, banner, sectionHead } = ctx;
  const cog = require(path.join(PURP_DIR, 'lib', 'cognitive-client.js'));
  const sub = (args[0] || 'status').toLowerCase();
  const wantJson = args.includes('--json');

  if (sub === 'smoke') {
    const status = await cog.getServiceStatus();
    const pattern = await cog.liftPattern('purpclaw_cognition_smoke', 'cli', 0.99, { ts: new Date().toISOString() });
    const query = await cog.queryNeuro('pattern_detected', 5);
    const rules = await cog.assertFact('tool_surface_verified', ['cognition', 'cli'], 'purpclaw-cli');
    const out = { status, pattern, query, rules };
    if (wantJson) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    banner();
    sectionHead('  COGNITION SMOKE');
    console.log(`  modal        : ${boolText(status.modal, C, col)}`);
    console.log(`  diagnostics  : ${boolText(status.diagnostics, C, col)}`);
    console.log(`  rules        : ${boolText(status.rules, C, col)}`);
    console.log(`  neuro bridge : ${boolText(status.neuro, C, col)}`);
    console.log(`  lift pattern : ${pattern ? col(C.green, 'ok') : col(C.yellow, 'skipped')}`);
    console.log(`  rules assert : ${rules ? col(C.green, 'ok') : col(C.yellow, 'skipped')}`);
    console.log('');
    return;
  }

  const status = await cog.getServiceStatus();
  const neuroStats = await cog.getNeuroStats();
  const out = { status, neuroStats };
  if (wantJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  banner();
  sectionHead('  COGNITION STATUS');
  console.log(`  modal logic      : ${boolText(status.modal, C, col)}  :${cog.PORTS.modal}`);
  console.log(`  diagnostics      : ${boolText(status.diagnostics, C, col)}  :${cog.PORTS.diagnostics}`);
  console.log(`  symbolic rules   : ${boolText(status.rules, C, col)}  :${cog.PORTS.rules}`);
  console.log(`  neuro-symbolic   : ${boolText(status.neuro, C, col)}  :${cog.PORTS.neuro}`);
  if (neuroStats) {
    console.log('');
    console.log(col(C.gray, `  neuro stats: ${JSON.stringify(neuroStats).slice(0, 300)}`));
  }
  console.log('');
  console.log(col(C.gray, '  Use: purpclaw cognition smoke'));
}

module.exports = { run };
