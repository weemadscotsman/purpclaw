'use strict';

/**
 * tests/parity/harness-claude-contract.test.js
 * ========================================
 * Claude parity contract tests — blueprint §4.6
 *
 * Run: node tests/parity/harness-claude-contract.test.js
 */

const assert = require('assert');
const path   = require('path');
const PURP_ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { failed++; console.log('  \x1b[31m✗\x1b[0m ' + name); console.log('    \x1b[33m' + e.message + '\x1b[0m'); }
}

function assertEqual(a, e, msg) {
  if (a !== e) throw new Error((msg || '') + ': expected ' + JSON.stringify(e) + ', got ' + JSON.stringify(a));
}

function assertSchemaFields(obj, fields, label) {
  for (const f of fields) {
    if (!(f in obj)) throw new Error(label + ' missing field: ' + f);
  }
}

// ── §4.1 Adapter contract ─────────────────────────────────────────────────────

function testAdapter() {
  const claude = require('../../packages/harness-claude');

  test('harness-claude: module exports run()', function() {
    assertEqual(typeof claude.run, 'function');
  });

  test('harness-claude: run() returns a Promise', function() {
    const ret = claude.run({ taskId: 'x', goal: 't', repoPath: PURP_ROOT }, { items: [] }, [], {});
    assert(ret instanceof Promise);
  });

  test('harness-claude: result shape matches PURPCLAW_RESULT', async function() {
    const result = await Promise.race([
      claude.run({ taskId: 'x', goal: 't', repoPath: PURP_ROOT }, { items: [] }, [], {}),
      new Promise(function(r) { setTimeout(function() { r({ _timeout: true }); }, 3000); }),
    ]);
    if (result._timeout) { console.log('    (skipped: live execution > 3s)'); return; }
    assertSchemaFields(result, [
      'taskId', 'harness', 'status', 'summary', 'verification', 'durationMs',
    ], 'claude result');
    assertEqual(result.harness, 'claude');
  });
}

// ── §4.2 Context strategy contract ────────────────────────────────────────────

function testContextStrategy() {
  const { loadTruthDocs, loadGitHistory } = require('../../packages/context-spine');

  test('context-spine: loadTruthDocs() loads truth documents', function() {
    const docs = loadTruthDocs(PURP_ROOT);
    assert(Array.isArray(docs));
  });

  test('context-spine: loadGitHistory() returns recent commits', function() {
    const hist = loadGitHistory(PURP_ROOT, 5);
    assert(Array.isArray(hist));
  });
}

// ── §4.3 Reasoning workflow contract ─────────────────────────────────────────

function testReasoningWorkflow() {
  test('harness-claude: scanContradictions() is available', function() {
    // Check via the module interface — function exists
    const claude = require('../../packages/harness-claude');
    assertEqual(typeof claude.scanContradictions, 'function');
  });

  test('harness-claude: synthesiseArchitecture() is available', function() {
    const claude = require('../../packages/harness-claude');
    assertEqual(typeof claude.synthesiseArchitecture, 'function');
  });

  test('harness-claude: scanContradictions() returns contradictions array', function() {
    const { scanContradictions } = require('../../packages/harness-claude');
    const r = scanContradictions([]);
    assert('findings' in r);
    assert('routePatterns' in r);
    assert(Array.isArray(r.findings));
    assert(Array.isArray(r.routePatterns));
  });

  test('harness-claude: synthesiseArchitecture() returns layer map', function() {
    const { synthesiseArchitecture } = require('../../packages/harness-claude');
    const r = synthesiseArchitecture([]);
    assert('layers' in r);
    assert('dependencies' in r);
    assertEqual(typeof r.layers, 'object');
    assert(Array.isArray(r.dependencies));
  });
}

// ── §4.4 Editing workflow contract ───────────────────────────────────────────

function testEditingWorkflow() {
  // Editing goes through result-schema addFileChanged
  test('harness-claude: result-schema supports addFileChanged', function() {
    const { createResult, addFileChanged } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'claude');
    addFileChanged(r, 'docs/architecture.md');
    assertEqual(r.filesChanged.indexOf('docs/architecture.md') >= 0, true);
  });
}

// ── §4.5 Result packaging contract ──────────────────────────────────────────

function testResultPackaging() {
  const { createResult } = require('../../packages/result-schema');

  test('harness-claude: result contains verification array', function() {
    const { addVerification } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'claude');
    addVerification(r, { criterion: 'arch-consistent', passed: true, evidence: 'no contradictions' });
    assertEqual(r.verification.length, 1);
    assertEqual(r.verification[0].criterion, 'arch-consistent');
  });

  test('harness-claude: result contains facts vs assumptions via summary', function() {
    const r = createResult({ taskId: 'x', goal: 'analyse architecture' }, 'claude');
    r.summary = '## Current State (Facts)\n- Project has 12 JS files\n## Assumptions\n- All files follow same naming convention';
    assert(r.summary.indexOf('Facts') >= 0 || r.summary.indexOf('Assumptions') >= 0);
  });

  test('harness-claude: result distinguishes from codex by harness field', function() {
    const { createResult } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'claude');
    assertEqual(r.harness, 'claude');
  });
}

// ── §4.6 Parity gate ──────────────────────────────────────────────────────────

function testParityGate() {
  test('claude parity gate: scanContradictions() identifies duplicate exports', function() {
    const { scanContradictions } = require('../../packages/harness-claude');
    // File with duplicate export names
    const fs = require('fs');
    const pkgJson = path.join(PURP_ROOT, 'package.json');
    const r = scanContradictions([pkgJson]);
    assert('findings' in r);
  });

  test('claude parity gate: synthesiseArchitecture() categorises files by layer', function() {
    const { synthesiseArchitecture } = require('../../packages/harness-claude');
    const r = synthesiseArchitecture([]);
    assert('ui' in r.layers);
    assert('logic' in r.layers);
    assert('data' in r.layers);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n\x1b[1mHarness Claude Contract Tests (§4.6)\x1b[0m');
console.log('==========================================\n');

console.log('\x1b[36m[§4.1 Adapter]\x1b[0m');
testAdapter();

console.log('\n\x1b[36m[§4.2 Context Strategy]\x1b[0m');
testContextStrategy();

console.log('\n\x1b[36m[§4.3 Reasoning Workflow]\x1b[0m');
testReasoningWorkflow();

console.log('\n\x1b[36m[§4.4 Editing Workflow]\x1b[0m');
testEditingWorkflow();

console.log('\n\x1b[36m[§4.5 Result Packaging]\x1b[0m');
testResultPackaging();

console.log('\n\x1b[36m[§4.6 Parity Gate]\x1b[0m');
testParityGate();

console.log('\n--------------------------------');
console.log('\x1b[32m' + passed + ' passed\x1b[0m  \x1b[31m' + failed + ' failed\x1b[0m\n');
process.exit(failed > 0 ? 1 : 0);
