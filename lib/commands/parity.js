'use strict';

const path = require('path');

async function run(args, ctx) {
  const { C, col, PURP_DIR } = ctx;
  const parity = require(path.join(PURP_DIR, 'lib', 'feature-parity.js'));
  const json = args.includes('--json');
  const probeHealth = args.includes('--health') || args.includes('--probe');
  const report = await parity.evaluate(PURP_DIR, { probeHealth });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const c = (color, value) => col(color, value);
  const stateIcon = (state) => {
    if (state === 'live') return c(C.green, 'LIVE');
    if (state === 'partial') return c(C.yellow, 'PARTIAL');
    return c(C.red, 'GAP');
  };

  console.log('');
  console.log(c(C.bold + C.cyan, 'PURPCLAW FEATURE PARITY'));
  console.log(c(C.gray, `Target: resident agent that grows with the operator and routes through one governed runtime.`));
  console.log(c(C.gray, `Mode: ${probeHealth ? 'registered surfaces + live health probes' : 'registered surfaces'}\n`));

  console.log(`  ${c(C.green, String(report.totals.live).padStart(2))} live  ${c(C.yellow, String(report.totals.partial).padStart(2))} partial  ${c(C.red, String(report.totals.missing).padStart(2))} missing  ${c(C.gray, `of ${report.totals.total} feature groups`)}`);
  console.log(`  ${c(C.green, String(report.totals.checks.live).padStart(2))} live checks  ${c(C.yellow, String(report.totals.checks.partial).padStart(2))} partial checks  ${c(C.red, String(report.totals.checks.missing).padStart(2))} missing checks  ${c(C.gray, `of ${report.totals.checks.total} total checks`)}\n`);

  for (const section of report.sections) {
    console.log(`${stateIcon(section.state).padEnd(16)} ${c(C.bold, section.name)}`);
    console.log(`  ${c(C.gray, section.required)}`);
    for (const check of section.checks) {
      const marker = check.state === 'live' ? c(C.green, '+')
        : check.state === 'partial' ? c(C.yellow, '~')
        : c(C.red, '-');
      console.log(`    ${marker} ${check.label}: ${c(C.gray, check.detail || '')}`);
    }
    console.log('');
  }

  console.log(c(C.gray, 'Commands: purpclaw parity --json | purpclaw parity --health'));
  console.log('');
}

module.exports = { run };
