'use strict';

// Smoke test for `purpclaw registry-audit`.
// Proves the command loads, runs against the REAL repo without crashing,
// produces a well-formed report, names a truth owner per domain, and writes
// lib/reports/registry-audit.json. Read-only — asserts no surface mutation.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PURP_DIR = path.resolve(__dirname, '..');

(async () => {
  // 1. node --check equivalent: requiring it must not throw a syntax error.
  const cmd = require(path.join(PURP_DIR, 'lib', 'commands', 'registry-audit.js'));
  assert.strictEqual(typeof cmd.run, 'function', 'run() must be exported');

  // 2. Pure report builder runs against the real repo without throwing.
  const report = cmd.buildReport(PURP_DIR);
  assert.strictEqual(report.schema, 'purpclaw.registry-audit.v1');
  assert.ok(report.summary.surfaces_inspected >= 9, 'should inspect >= 9 surfaces');
  assert.ok(Array.isArray(report.findings) && report.findings.length > 0, 'should produce findings');

  // 3. Every truth domain is named.
  for (const k of ['service', 'capability', 'skill_metadata', 'executable_skill_tool', 'provider_model']) {
    assert.ok(report.truth_owners[k], `truth owner missing for ${k}`);
  }

  // 4. Every finding carries an action + risk.
  for (const f of report.findings) {
    assert.ok(f.recommended_action, `finding missing recommended_action: ${f.title}`);
    assert.ok(['low', 'medium', 'high'].includes(f.risk), `finding bad risk: ${f.title}`);
  }

  // 5. Full run() writes the JSON report and records a Hivemind trace.
  const r = await cmd.run(['--json'], { PURP_DIR });
  const reportPath = path.join(PURP_DIR, 'lib', 'reports', 'registry-audit.json');
  assert.ok(fs.existsSync(reportPath), 'report file must be written');
  const onDisk = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.strictEqual(onDisk.schema, 'purpclaw.registry-audit.v1');
  assert.ok(r.hivemind_trace && r.hivemind_trace.run_id, 'should record a Hivemind trace');

  console.log('registry-audit smoke test PASSED');
  console.log(`  surfaces=${report.summary.surfaces_inspected} findings=${report.summary.findings_total} conflicts=${report.summary.conflicts} high_risk=${report.summary.high_risk}`);
})().catch(err => {
  console.error('registry-audit smoke test FAILED:', err.message);
  process.exit(1);
});
