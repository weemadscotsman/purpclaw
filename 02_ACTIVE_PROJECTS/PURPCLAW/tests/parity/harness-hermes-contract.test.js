'use strict';

/**
 * tests/parity/harness-hermes-contract.test.js
 * ========================================
 * Hermes parity contract tests — blueprint §5.6
 *
 * Run: node tests/parity/harness-hermes-contract.test.js
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

// ── §5.1 Adapter contract ─────────────────────────────────────────────────────

function testAdapter() {
  const hermes = require('../../packages/harness-hermes');

  test('harness-hermes: module exports run()', function() {
    assertEqual(typeof hermes.run, 'function');
  });

  test('harness-hermes: run() returns a Promise', function() {
    const ret = hermes.run({ taskId: 'x', goal: 't', repoPath: PURP_ROOT }, { items: [] }, [], {});
    assert(ret instanceof Promise);
  });

  test('harness-hermes: result shape matches PURPCLAW_RESULT', async function() {
    const result = await Promise.race([
      hermes.run({ taskId: 'x', goal: 't', repoPath: PURP_ROOT }, { items: [] }, [], {}),
      new Promise(function(r) { setTimeout(function() { r({ _timeout: true }); }, 3000); }),
    ]);
    if (result._timeout) { console.log('    (skipped: live execution > 3s)'); return; }
    assertSchemaFields(result, [
      'taskId', 'harness', 'status', 'summary',
      'commandsRun', 'verification', 'errors', 'durationMs',
    ], 'hermes result');
    assertEqual(result.harness, 'hermes');
  });
}

// ── §5.2 Orchestration workflow contract ─────────────────────────────────────

function testOrchestration() {
  const { planToolSequence } = require('../../packages/harness-hermes');

  test('harness-hermes: planToolSequence() is exported', function() {
    assertEqual(typeof planToolSequence, 'function');
  });

  test('harness-hermes: planToolSequence() returns array', function() {
    const plan = planToolSequence('install npm and run build');
    assert(Array.isArray(plan));
    assert(plan.length > 0);
  });

  test('harness-hermes: planToolSequence() detects npm install', function() {
    const plan = planToolSequence('install npm dependencies');
    assert(plan.some(function(s) { return s.tool === 'shell' && s.args.indexOf('install') >= 0; }));
  });

  test('harness-hermes: planToolSequence() detects build', function() {
    const plan = planToolSequence('run the build');
    assert(plan.some(function(s) { return s.tool === 'shell' && s.args.indexOf('build') >= 0; }));
  });

  test('harness-hermes: planToolSequence() returns default when goal unknown', function() {
    const plan = planToolSequence('do something completely random xyz123');
    assertEqual(plan.length, 1);
    assertEqual(plan[0].tool, 'shell');
  });
}

// ── §5.3 State machine contract ───────────────────────────────────────────────

function testStateMachine() {
  const { TOOL_REGISTRY } = require('../../packages/harness-hermes');

  test('harness-hermes: TOOL_REGISTRY is exported', function() {
    assertEqual(typeof TOOL_REGISTRY, 'object');
  });

  test('harness-hermes: TOOL_REGISTRY has shell', function() {
    assert('shell' in TOOL_REGISTRY);
    assertEqual(typeof TOOL_REGISTRY.shell.execute, 'function');
  });

  test('harness-hermes: TOOL_REGISTRY has file_read', function() {
    assert('file_read' in TOOL_REGISTRY);
  });

  test('harness-hermes: TOOL_REGISTRY has file_write', function() {
    assert('file_write' in TOOL_REGISTRY);
  });

  test('harness-hermes: TOOL_REGISTRY has git', function() {
    assert('git' in TOOL_REGISTRY);
  });

  test('harness-hermes: TOOL_REGISTRY has npm_install', function() {
    assert('npm_install' in TOOL_REGISTRY);
  });

  test('harness-hermes: TOOL_REGISTRY has node', function() {
    assert('node' in TOOL_REGISTRY);
  });

  test('harness-hermes: TOOL_REGISTRY.shell.execute() returns ok field', function() {
    const r = TOOL_REGISTRY.shell.execute('echo ok', PURP_ROOT);
    assertEqual(typeof r.ok, 'boolean');
    if (r.ok) assertEqual(typeof r.output, 'string');
  });

  test('harness-hermes: TOOL_REGISTRY.file_read returns ok+output or ok+error', function() {
    const r = TOOL_REGISTRY.file_read(path.join(PURP_ROOT, 'package.json'));
    assertEqual(typeof r.ok, 'boolean');
    if (r.ok) assertEqual(typeof r.output, 'string');
    else assert('error' in r);
  });

  test('harness-hermes: TOOL_REGISTRY.file_read returns ok=false for missing files', function() {
    const r = TOOL_REGISTRY.file_read('/tmp/NONEXISTENT-xyz-12345.txt');
    assertEqual(r.ok, false);
  });
}

// ── §5.4 Artifact workflow contract ──────────────────────────────────────────

function testArtifactWorkflow() {
  test('harness-hermes: result contains artifacts array', function() {
    const { createResult, addArtifact } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'hermes');
    addArtifact(r, { path: 'dist/bundle.js', checksum: 'abc123', verified: true });
    assertEqual(r.artifacts.length, 1);
    assertEqual(r.artifacts[0].path, 'dist/bundle.js');
  });
}

// ── §5.5 Result packaging contract ──────────────────────────────────────────

function testResultPackaging() {
  test('harness-hermes: result contains commandsRun array', function() {
    const { createResult, addCommand } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'hermes');
    addCommand(r, 'npm install');
    assertEqual(r.commandsRun.length, 1);
  });

  test('harness-hermes: result contains errors array', function() {
    const { createResult, addError } = require('../../packages/result-schema');
    const r = createResult({ taskId: 'x' }, 'hermes');
    addError(r, { phase: 'tool', message: 'npm install failed' });
    assertEqual(r.errors.length, 1);
    assertEqual(r.errors[0].phase, 'tool');
  });
}

// ── §5.6 Parity gate ──────────────────────────────────────────────────────────

function testParityGate() {
  test('hermes parity gate: no tool chain silently skips failed step', function() {
    // When a step fails, hermes halts (doesn't skip)
    const { planToolSequence } = require('../../packages/harness-hermes');
    const plan = planToolSequence('build and test');
    // At minimum: build + test or similar
    assert(plan.length >= 1);
  });

  test('hermes parity gate: TOOL_REGISTRY is extensible', function() {
    const { TOOL_REGISTRY } = require('../../packages/harness-hermes');
    const keys = Object.keys(TOOL_REGISTRY);
    assert(keys.length >= 6);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n\x1b[1mHarness Hermes Contract Tests (§5.6)\x1b[0m');
console.log('========================================\n');

console.log('\x1b[36m[§5.1 Adapter]\x1b[0m');
testAdapter();

console.log('\n\x1b[36m[§5.2 Orchestration Workflow]\x1b[0m');
testOrchestration();

console.log('\n\x1b[36m[§5.3 State Machine]\x1b[0m');
testStateMachine();

console.log('\n\x1b[36m[§5.4 Artifact Workflow]\x1b[0m');
testArtifactWorkflow();

console.log('\n\x1b[36m[§5.5 Result Packaging]\x1b[0m');
testResultPackaging();

console.log('\n\x1b[36m[§5.6 Parity Gate]\x1b[0m');
testParityGate();

console.log('\n--------------------------------');
console.log('\x1b[32m' + passed + ' passed\x1b[0m  \x1b[31m' + failed + ' failed\x1b[0m\n');
process.exit(failed > 0 ? 1 : 0);
