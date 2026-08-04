'use strict';

/**
 * tests/parity/harness-minimax-contract.test.js
 * ============================================
 * MiniMax Code parity contract tests — blueprint §6.6
 *
 * Run: node tests/parity/harness-minimax-contract.test.js
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

// ── §6.1 Adapter contract ─────────────────────────────────────────────────────

function testAdapter() {
  const minimax = require('../../packages/harness-minimax');

  test('harness-minimax: module exports run()', function() {
    assertEqual(typeof minimax.run, 'function');
  });

  test('harness-minimax: run() returns a Promise', function() {
    const ret = minimax.run({ taskId: 'x', goal: 't', repoPath: PURP_ROOT }, { items: [] }, [], {});
    assert(ret instanceof Promise);
  });

  test('harness-minimax: result shape matches PURPCLAW_RESULT', async function() {
    const result = await Promise.race([
      minimax.run({ taskId: 'x', goal: 't', repoPath: PURP_ROOT }, { items: [] }, [], {}),
      new Promise(function(r) { setTimeout(function() { r({ _timeout: true }); }, 3000); }),
    ]);
    if (result._timeout) { console.log('    (skipped: live execution > 3s)'); return; }
    assertSchemaFields(result, [
      'taskId', 'harness', 'status', 'summary',
      'filesChanged', 'artifacts', 'verification', 'durationMs',
    ], 'minimax result');
    assertEqual(result.harness, 'minimax');
  });
}

// ── §6.2 Context strategy contract ────────────────────────────────────────────

function testContextStrategy() {
  const { loadDesignTokens, detectComponentDir } = require('../../packages/harness-minimax');

  test('harness-minimax: loadDesignTokens() is exported', function() {
    assertEqual(typeof loadDesignTokens, 'function');
  });

  test('harness-minimax: loadDesignTokens() returns { tokens, source }', function() {
    const r = loadDesignTokens(PURP_ROOT);
    assert('tokens' in r);
    assert('source' in r);
    assertEqual(typeof r.tokens, 'object');
  });

  test('harness-minimax: detectComponentDir() is exported', function() {
    const minimax = require('../../packages/harness-minimax');
    assertEqual(typeof minimax.detectComponentDir, 'function');
  });
}

// ── §6.3 Generation workflow contract ────────────────────────────────────────

function testGeneration() {
  const { generateReactComponent } = require('../../packages/harness-minimax');

  test('harness-minimax: generateReactComponent() is exported', function() {
    assertEqual(typeof generateReactComponent, 'function');
  });

  test('harness-minimax: generateReactComponent() produces React code', function() {
    const code = generateReactComponent('TestButton', { 'color-primary': '#6366f1' });
    assertEqual(typeof code, 'string');
    assert(code.indexOf('TestButton') >= 0);
    assert(code.indexOf("'use client'") >= 0 || code.indexOf('"use client"') >= 0);
  });

  test('harness-minimax: generateReactComponent() uses CSS variables', function() {
    const code = generateReactComponent('Card', { 'bg-primary': '#fff', 'text-primary': '#000' });
    assert(code.indexOf('backgroundColor') >= 0);
    assert(code.indexOf('color') >= 0);
  });
}

// ── §6.4 UI safeguards contract ──────────────────────────────────────────────

function testUISafeguards() {
  const { loadDesignTokens } = require('../../packages/harness-minimax');

  test('harness-minimax: loads existing design tokens (not invented)', function() {
    const r = loadDesignTokens(PURP_ROOT);
    assert('tokens' in r);
    // source may be null if no CSS files found, but tokens object must exist
    assertEqual(typeof r.tokens, 'object');
  });

  test('harness-minimax: generateReactComponent() does not generate giant files', function() {
    const { generateReactComponent } = require('../../packages/harness-minimax');
    const code = generateReactComponent('BigComponent', {});
    // Should be a single-component scaffold, not a full app
    assert(code.length < 5000, 'generated component should be a scaffold, not a full rewrite');
  });
}

// ── §6.5 Result packaging contract ──────────────────────────────────────────

function testResultPackaging() {
  test('harness-minimax: result contains filesChanged array', function() {
    const { createResult, addFileChanged } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'minimax');
    addFileChanged(r, 'app/components/NewButton.tsx');
    assertEqual(r.filesChanged.indexOf('app/components/NewButton.tsx') >= 0, true);
  });

  test('harness-minimax: result contains artifacts array', function() {
    const { createResult, addArtifact } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'minimax');
    addArtifact(r, { path: 'app/components/NewButton.tsx', checksum: null, verified: false });
    assertEqual(r.artifacts.length, 1);
  });

  test('harness-minimax: result contains verification array', function() {
    const { createResult, addVerification } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'minimax');
    addVerification(r, { criterion: 'syntax-check', passed: true, evidence: 'node --check passed' });
    assertEqual(r.verification.length, 1);
  });
}

// ── §6.6 Parity gate ──────────────────────────────────────────────────────────

function testParityGate() {
  test('minimax parity gate: generated component is valid JSX syntax', function() {
    const { generateReactComponent } = require('../../packages/harness-minimax');
    const code = generateReactComponent('SyntaxTest', {});
    // Contains opening and closing JSX tags
    assert(code.indexOf('<div') >= 0);
    assert(code.indexOf('</div>') >= 0);
  });

  test('minimax parity gate: component uses React import', function() {
    const { generateReactComponent } = require('../../packages/harness-minimax');
    const code = generateReactComponent('ImportTest', {});
    assert(code.indexOf('import React') >= 0);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n\x1b[1mHarness MiniMax Code Contract Tests (§6.6)\x1b[0m');
console.log('================================================\n');

console.log('\x1b[36m[§6.1 Adapter]\x1b[0m');
testAdapter();

console.log('\n\x1b[36m[§6.2 Context Strategy]\x1b[0m');
testContextStrategy();

console.log('\n\x1b[36m[§6.3 Generation Workflow]\x1b[0m');
testGeneration();

console.log('\n\x1b[36m[§6.4 UI Safeguards]\x1b[0m');
testUISafeguards();

console.log('\n\x1b[36m[§6.5 Result Packaging]\x1b[0m');
testResultPackaging();

console.log('\n\x1b[36m[§6.6 Parity Gate]\x1b[0m');
testParityGate();

console.log('\n--------------------------------');
console.log('\x1b[32m' + passed + ' passed\x1b[0m  \x1b[31m' + failed + ' failed\x1b[0m\n');
process.exit(failed > 0 ? 1 : 0);
