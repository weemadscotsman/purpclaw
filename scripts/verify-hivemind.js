#!/usr/bin/env node
'use strict';

/**
 * verify-hivemind.js — CI gate for the PURPCLAW Hivemind cognitive loop.
 *
 * Runs the standard loop test + the rank-1 doctrine proof, parses the JSON
 * reports, and exits non-zero on any regression. Designed for CI to call:
 *
 *   npm run verify:hivemind         # standard loop only (rank-2 synthetic)
 *   npm run verify:hivemind:rank1   # + rank-1 doctrine proof
 *
 * Exit codes:
 *   0  all checks pass
 *   1  at least one check failed
 *   2  test itself crashed (e.g. crash, missing module)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROOT_FROM_SCRIPTS = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const wantRank1 = args.includes('--rank=1');

let totalPass = 0, totalFail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    totalPass++;
    console.log(`  ✓ ${name}`);
  } else {
    totalFail++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}: ${detail || 'FAILED'}`);
  }
}

function runTest(label, testPath, requiredKeys) {
  console.log('');
  console.log(`─── ${label} ───`);
  console.log(`Running: ${testPath}`);

  // Run the test as a subprocess so the gate is hermetic.
  const { execFileSync } = require('child_process');
  let stdout;
  try {
    stdout = execFileSync('node', [testPath], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 600000,  // 10 min max
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    console.log(`  ✗ Test crashed: ${e.message.slice(0, 200)}`);
    totalFail++;
    failures.push({ name: label, detail: 'Test crashed: ' + e.message.slice(0, 200) });
    return null;
  }

  // Find the report JSON
  const reportPath = path.join(ROOT, 'lib', 'reports',
    label === 'rank1' ? 'hivemind-loop-test-rank1.json' : 'hivemind-loop-test.json');

  if (!fs.existsSync(reportPath)) {
    console.log(`  ✗ Report not found: ${reportPath}`);
    totalFail++;
    failures.push({ name: label, detail: 'Report not found' });
    return null;
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  for (const key of requiredKeys) {
    const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), report);
    check(`${label}.${key} = ${JSON.stringify(val)}`, val === true, `expected true, got ${JSON.stringify(val)}`);
  }

  return report;
}

console.log('=================================================');
console.log('PURPCLAW HIVEMIND CI GATE');
console.log('=================================================');

// Standard loop test
const standardReport = runTest('standard', path.join(ROOT, 'lib', 'hivemind-test.js'), [
  'loop_closes',
  'avoidance_loop_closes',
]);

if (standardReport) {
  check('standard.skill_loader_hits == 3/3',
    (standardReport.skill_loader_round_trip || []).filter(r => r.found_via_loader).length === 3,
    `got ${(standardReport.skill_loader_round_trip || []).filter(r => r.found_via_loader).length}/3`
  );
  check('standard.AntiSkill pattern hits == 3/3',
    (standardReport.antiskill_loader_round_trip || []).filter(r => r.pattern_retrievable).length === 3,
    `got ${(standardReport.antiskill_loader_round_trip || []).filter(r => r.pattern_retrievable).length}/3`
  );
  check('standard.AntiSkill per-trace >= 12/15',
    (standardReport.antiskill_per_trace_hits || 0) >= 12,
    `got ${standardReport.antiskill_per_trace_hits || 0}/15`
  );
  check('standard.failures.length == 0',
    (standardReport.failures || []).length === 0,
    `${(standardReport.failures || []).length} failures recorded`
  );
}

// Optional rank-1 doctrine proof
if (wantRank1) {
  const rank1Report = runTest('rank1', path.join(ROOT, 'lib', 'hivemind-test-rank1.js'), [
    'rank1_loop_closes',
    'doctrine_promotion_works',
    'doctrine_gate_holds',
    'weak_gated',
  ]);

  if (rank1Report) {
    check('rank1.doctrines_promoted >= 1',
      (rank1Report.doctrines_promoted || 0) >= 1,
      `got ${rank1Report.doctrines_promoted || 0}`
    );
  }
}

console.log('');
console.log('=================================================');
console.log(`RESULT: ${totalPass} passed, ${totalFail} failed`);
if (failures.length > 0) {
  console.log('FAILURES:');
  for (const f of failures) {
    console.log(`  - [${f.name}] ${f.detail || ''}`);
  }
}
console.log('=================================================');

process.exit(totalFail > 0 ? 1 : 0);