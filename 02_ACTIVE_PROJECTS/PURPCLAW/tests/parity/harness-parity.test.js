'use strict';

/**
 * tests/parity/harness-parity.test.js
 * ===================================
 * Parity tests for all 4 harness modes + harness-core.
 * Tests the 8-stage contract: intake, route, context, plan, execute, verify, package, audit.
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §3.6, §4.6, §5.6, §6.6
 *
 * Run: node tests/parity/harness-parity.test.js
 */

const assert = require('assert');
const path   = require('path');

const PURP_ROOT = path.resolve(__dirname, '..', '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (err) {
    failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    \x1b[33m' + err.message + '\x1b[0m');
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assertSchemaFields(obj, fields, label) {
  for (const field of fields) {
    if (!(field in obj)) {
      throw new Error(label + ' missing field: ' + field);
    }
  }
}

// ── Stage 0: Schema contracts ────────────────────────────────────────────────

function testTaskSchema() {
  // Use the new packages/task-schema which has normaliseTask
  const { validateTask, normaliseTask, HARNESSES } = require('../../packages/task-schema');

  test('task-schema: rejects empty input', function() {
    const r = normaliseTask(null);
    assertEqual(r.ok, false);
  });

  test('task-schema: accepts valid task', function() {
    const r = normaliseTask({ taskId: 'test-001', goal: 'Fix the bug in the parser' });
    assertEqual(r.ok, true);
    assertEqual(r.task.taskId, 'test-001');
  });

  test('task-schema: accepts full blueprint field names', function() {
    const r = normaliseTask({
      taskId: 'test-002',
      goal: 'Build a new component',
      projectId: 'my-project',
      repoPath: '/tmp/test',
      knownFiles: ['app/Button.tsx'],
      constraints: ['no external deps'],
      requiredOutputs: ['app/Button.tsx'],
      acceptanceCriteria: ['builds without errors'],
      preferredHarness: 'minimax',
      fallbackHarness: 'codex',
      priority: 2,
    });
    assertEqual(r.ok, true);
    assertEqual(r.task.preferredHarness, 'minimax');
    assertEqual(r.task.priority, 2);
  });

  test('task-schema: rejects invalid preferredHarness', function() {
    const r = normaliseTask({ taskId: 'test-003', goal: 'Do something', preferredHarness: 'invalid' });
    assertEqual(r.ok, false);
  });

  test('task-schema: rejects goal shorter than 3 chars', function() {
    const r = normaliseTask({ taskId: 't', goal: 'ab' });
    assertEqual(r.ok, false);
  });

  test('task-schema: HARNESSES contains all 4 harness names', function() {
    assert(HARNESSES.indexOf('codex') >= 0);
    assert(HARNESSES.indexOf('claude') >= 0);
    assert(HARNESSES.indexOf('hermes') >= 0);
    assert(HARNESSES.indexOf('minimax') >= 0);
  });
}

function testResultSchema() {
  const {
    createResult, pass, partial, block, fail,
    addFileRead, addFileChanged, addCommand,
    addArtifact, addVerification, addError, validateResult,
    STATUSES, HARNESSES,
  } = require('../../packages/result-schema');

  const mockTask = { taskId: 'tsk_test', projectId: 'test-proj' };

  test('result-schema: createResult initialises all required fields', function() {
    const r = createResult(mockTask, 'codex');
    assertSchemaFields(r, [
      'taskId', 'projectId', 'harness', 'status', 'summary',
      'filesRead', 'filesChanged', 'commandsRun', 'artifacts',
      'verification', 'errors', 'nextAction', 'durationMs', 'schema',
    ], 'result');
    assertEqual(r.status, 'blocked');
    assertEqual(r.harness, 'codex');
  });

  test('result-schema: pass() sets status=passed', function() {
    const r = createResult(mockTask, 'codex');
    pass(r, 'All good');
    assertEqual(r.status, 'passed');
    assertEqual(r.summary, 'All good');
  });

  test('result-schema: partial() sets status=partial', function() {
    const r = createResult(mockTask, 'claude');
    partial(r, 'Some done');
    assertEqual(r.status, 'partial');
  });

  test('result-schema: block() sets status=blocked + nextAction', function() {
    const r = createResult(mockTask, 'hermes');
    block(r, 'Missing deps', 'Run npm install first');
    assertEqual(r.status, 'blocked');
    assertEqual(r.nextAction, 'Run npm install first');
  });

  test('result-schema: fail() sets status=failed + nextAction', function() {
    const r = createResult(mockTask, 'minimax');
    fail(r, 'All retries exhausted', 'Review errors');
    assertEqual(r.status, 'failed');
    assertEqual(r.nextAction, 'Review errors');
  });

  test('result-schema: addVerification records entry', function() {
    const r = createResult(mockTask, 'codex');
    addVerification(r, { criterion: 'build', passed: true, evidence: 'exit code 0' });
    assertEqual(r.verification.length, 1);
    assertEqual(r.verification[0].passed, true);
  });

  test('result-schema: addFileChanged deduplicates', function() {
    const r = createResult(mockTask, 'codex');
    addFileChanged(r, 'lib/foo.js');
    addFileChanged(r, 'lib/foo.js');
    assertEqual(r.filesChanged.length, 1);
  });

  test('result-schema: addError records error with phase', function() {
    const r = createResult(mockTask, 'claude');
    addError(r, { phase: 'intake', message: 'file not found', stack: 'at line 1' });
    assertEqual(r.errors.length, 1);
    assertEqual(r.errors[0].phase, 'intake');
  });

  test('result-schema: validateResult throws on bad status', function() {
    const r = createResult(mockTask, 'codex');
    r.status = 'bad_status';
    let threw = false;
    try { validateResult(r); } catch (e) { threw = true; }
    assert(threw === true, 'validateResult should throw on invalid status');
  });

  test('result-schema: all STATUSES present', function() {
    assert(STATUSES.indexOf('passed') >= 0);
    assert(STATUSES.indexOf('partial') >= 0);
    assert(STATUSES.indexOf('blocked') >= 0);
    assert(STATUSES.indexOf('failed') >= 0);
  });

  test('result-schema: all HARNESSES present', function() {
    assert(HARNESSES.indexOf('codex') >= 0);
    assert(HARNESSES.indexOf('claude') >= 0);
    assert(HARNESSES.indexOf('hermes') >= 0);
    assert(HARNESSES.indexOf('minimax') >= 0);
  });
}

// ── Stage 3: Context spine ────────────────────────────────────────────────────

function testContextSpine() {
  const {
    provenance, readFile, searchFiles,
    loadTruthDocs, loadGitHistory,
    assembleContext, renderForLLM,
  } = require('../../packages/context-spine');

  test('context-spine: provenance() attaches all required fields', function() {
    const item = provenance('file', 'test.md', 'hello world', { path: '/tmp/test.md' });
    assertEqual(item.source, 'file');
    assertEqual(item.label, 'test.md');
    assertEqual(item.data, 'hello world');
    assertEqual(item.confidence, 'high');
    assertEqual(item.path, '/tmp/test.md');
  });

  test('context-spine: readFile() returns null for missing files', function() {
    const item = readFile('/tmp/does-not-exist-xyz-12345.txt');
    assertEqual(item, null);
  });

  test('context-spine: readFile() works for existing files', function() {
    const pkgPath = path.join(PURP_ROOT, 'package.json');
    const item = readFile(pkgPath);
    assert(item !== null);
    assertEqual(typeof item.data, 'string');
    assert(item.data.length > 0);
  });

  test('context-spine: searchFiles() finds package.json', function() {
    const results = searchFiles(PURP_ROOT, 'package.json', 5);
    assert(results.length > 0);
    assert(results.some(function(f) { return f.indexOf('package.json') >= 0; }));
  });

  test('context-spine: assembleContext() returns array + totalChars', function() {
    const task = { goal: 'test', repoPath: PURP_ROOT };
    const ctx = assembleContext(task);
    assert(Array.isArray(ctx.items));
    assertEqual(typeof ctx.totalChars, 'number');
    assert(ctx.items.length > 0);
    for (const item of ctx.items) {
      assert('source' in item, 'item missing source');
      assert('timestamp' in item, 'item missing timestamp');
    }
  });

  test('context-spine: renderForLLM() produces non-empty string', function() {
    const items = [provenance('file', 'test.txt', 'content', { path: '/tmp/test.txt' })];
    const rendered = renderForLLM(items);
    assertEqual(typeof rendered, 'string');
    assert(rendered.length > 0, 'rendered string should not be empty');
    assert(rendered.indexOf('test.txt') >= 0, 'should contain label');
  });
}

// ── Stage 4: Verification core ────────────────────────────────────────────────

function testVerificationCore() {
  const { runGates, availableGates, gateInfo } = require('../../packages/verification-core');

  test('verification-core: availableGates() returns array with required gates', function() {
    const gates = availableGates();
    assert(Array.isArray(gates));
    assert(gates.indexOf('lint') >= 0);
    assert(gates.indexOf('build') >= 0);
    assert(gates.indexOf('test') >= 0);
    assert(gates.indexOf('artifact-exists') >= 0);
    assert(gates.indexOf('acceptance-criteria') >= 0);
  });

  test('verification-core: gateInfo() returns metadata', function() {
    const info = gateInfo('lint');
    assert(info !== null);
    assertEqual(info.name, 'lint');
  });

  test('verification-core: gateInfo() returns null for unknown gate', function() {
    assertEqual(gateInfo('nonexistent_gate_xyz'), null);
  });

  test('verification-core: runGates([]) returns ok=true', function() {
    const r = runGates(PURP_ROOT, []);
    assertEqual(r.ok, true);
  });

  test('verification-core: runGates([artifact-exists]) fails for missing file', function() {
    const r = runGates(PURP_ROOT, ['artifact-exists'], { artifacts: ['DOES-NOT-EXIST-xyz.txt'] });
    assertEqual(r.ok, false);
    assertEqual(r.results[0].gate, 'artifact-exists');
  });

  test('verification-core: runGates([artifact-exists]) passes for existing file', function() {
    const r = runGates(PURP_ROOT, ['artifact-exists'], { artifacts: ['package.json'] });
    assertEqual(r.ok, true);
  });

  test('verification-core: runGates([acceptance-criteria]) records criteria', function() {
    const r = runGates(PURP_ROOT, ['acceptance-criteria'], { acceptanceCriteria: ['foo', 'bar'] });
    assertEqual(r.ok, true);
    assertEqual(r.results[0].results.length, 2);
  });
}

// ── Stage 5: Memory audit ─────────────────────────────────────────────────────

function testMemoryAudit() {
  const {
    startTask, logStep, logFileRead, logFileChanged,
    logCommand, logVerification, logError,
    finishTask, lastSuccessfulStep, getRecordChain,
    getAuditStats,
  } = require('../../packages/memory-audit');

  const mockTask = {
    taskId: 'tsk_parity_test',
    projectId: 'parity-test',
    goal: 'Parity test run',
    repoPath: PURP_ROOT,
  };

  test('memory-audit: startTask() creates record with all required fields', function() {
    const rec = startTask(mockTask, 'codex');
    assert('id' in rec);
    assertEqual(rec.taskId, 'tsk_parity_test');
    assertEqual(rec.harness, 'codex');
    assertEqual(rec.status, 'running');
    assert(Array.isArray(rec.steps));
    assert(Array.isArray(rec.filesRead));
    assert(Array.isArray(rec.filesChanged));
    assert(Array.isArray(rec.errors));
    assert(Array.isArray(rec.toolCalls));
  });

  test('memory-audit: logStep() appends to steps array', function() {
    const rec = startTask({ taskId: 'tsk_audit_2', projectId: 'parity-test', goal: 't', repoPath: PURP_ROOT }, 'claude');
    logStep(rec.id, { stepId: 'step1', name: 'read', status: 'ok', output: 'done' });
    const reloaded = getRecordChain('tsk_audit_2').find(function(r) { return r.id === rec.id; });
    assertEqual(reloaded.steps.length, 1);
    assertEqual(reloaded.steps[0].status, 'ok');
  });

  test('memory-audit: lastSuccessfulStep() returns last ok step', function() {
    const rec = startTask({ taskId: 'tsk_audit_3', projectId: 'parity-test', goal: 't', repoPath: PURP_ROOT }, 'hermes');
    logStep(rec.id, { stepId: 's1', name: 'a', status: 'ok' });
    logStep(rec.id, { stepId: 's2', name: 'b', status: 'error' });
    logStep(rec.id, { stepId: 's3', name: 'c', status: 'ok' });
    const last = lastSuccessfulStep(rec.id);
    assertEqual(last.stepId, 's3');
  });

  test('memory-audit: finishTask() updates status and summary', function() {
    const rec = startTask({ taskId: 'tsk_audit_4', projectId: 'parity-test', goal: 't', repoPath: PURP_ROOT }, 'minimax');
    finishTask(rec.id, 'passed', 'All good');
    const reloaded = getRecordChain('tsk_audit_4').find(function(r) { return r.id === rec.id; });
    assertEqual(reloaded.status, 'passed');
    assertEqual(reloaded.summary, 'All good');
    assert(reloaded.completedAt !== null);
  });

  test('memory-audit: getAuditStats() returns valid stats object', function() {
    const stats = getAuditStats();
    assertEqual(typeof stats.total, 'number');
    assertEqual(typeof stats.byStatus, 'object');
    assertEqual(typeof stats.byHarness, 'object');
  });
}

// ── Stage 5-8: Individual harness adapters ────────────────────────────────────

function testHarnessAdapters() {
  const codex   = require('../../packages/harness-codex');
  const claude  = require('../../packages/harness-claude');
  const hermes  = require('../../packages/harness-hermes');
  const minimax = require('../../packages/harness-minimax');

  const mockTask = {
    taskId: 'tsk_harness_test',
    projectId: 'harness-test',
    goal: 'Verify harness parity',
    repoPath: PURP_ROOT,
    knownFiles: ['package.json'],
  };

  // Cap each run at 5 seconds to avoid hanging on live I/O
  function withTimeout(promiseFn, ms) {
    return Promise.race([
      promiseFn(),
      new Promise(function(resolve) { setTimeout(function() { resolve({ _timeout: true }); }, ms); }),
    ]);
  }

  test('harness-codex: run() returns correct result shape', async function() {
    const result = await withTimeout(function() { return codex.run(mockTask, { items: [] }, [], {}); }, 5000);
    assert(result._timeout !== true, 'harness-codex timed out');
    assertSchemaFields(result, [
      'taskId', 'projectId', 'harness', 'status', 'summary',
      'filesRead', 'filesChanged', 'commandsRun',
      'verification', 'errors', 'durationMs',
    ], 'codex result');
    assertEqual(result.harness, 'codex');
  });

  test('harness-claude: run() returns correct result shape', async function() {
    const result = await withTimeout(function() { return claude.run(mockTask, { items: [] }, [], {}); }, 5000);
    assert(result._timeout !== true, 'harness-claude timed out');
    assertSchemaFields(result, [
      'taskId', 'harness', 'status', 'summary', 'verification', 'durationMs',
    ], 'claude result');
    assertEqual(result.harness, 'claude');
  });

  test('harness-hermes: run() returns correct result shape', async function() {
    const result = await withTimeout(function() { return hermes.run(mockTask, { items: [] }, [], {}); }, 5000);
    assert(result._timeout !== true, 'harness-hermes timed out');
    assertSchemaFields(result, [
      'taskId', 'harness', 'status', 'summary',
      'commandsRun', 'verification', 'errors', 'durationMs',
    ], 'hermes result');
    assertEqual(result.harness, 'hermes');
  });

  test('harness-minimax: run() returns correct result shape', async function() {
    const result = await withTimeout(function() { return minimax.run(mockTask, { items: [] }, [], {}); }, 5000);
    assert(result._timeout !== true, 'harness-minimax timed out');
    assertSchemaFields(result, [
      'taskId', 'harness', 'status', 'summary',
      'filesChanged', 'artifacts', 'verification', 'durationMs',
    ], 'minimax result');
    assertEqual(result.harness, 'minimax');
  });
}

// ── Hermes tool registry ───────────────────────────────────────────────────────

function testHermesToolRegistry() {
  const { TOOL_REGISTRY, planToolSequence } = require('../../packages/harness-hermes');

  test('hermes: TOOL_REGISTRY has required tools', function() {
    assert('shell' in TOOL_REGISTRY);
    assert('file_read' in TOOL_REGISTRY);
    assert('file_write' in TOOL_REGISTRY);
    assert('git' in TOOL_REGISTRY);
    assert('npm_install' in TOOL_REGISTRY);
    assert('node' in TOOL_REGISTRY);
  });

  test('hermes: planToolSequence() returns array', function() {
    const plan = planToolSequence('install npm dependencies and run build');
    assert(Array.isArray(plan));
    assert(plan.length > 0);
  });

  test('hermes: planToolSequence() returns default on unknown goal', function() {
    const plan = planToolSequence('do something completely unknown');
    assert(Array.isArray(plan));
    assertEqual(plan.length, 1);
  });
}

// ── MiniMax design tokens ─────────────────────────────────────────────────────

function testMiniMaxTokens() {
  const { loadDesignTokens } = require('../../packages/harness-minimax');
  const result = loadDesignTokens(PURP_ROOT);
  assert(result !== null && typeof result === 'object');
  assert('tokens' in result);
  assert('source' in result);
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n\x1b[1mPURPCLAW Harness Parity Tests\x1b[0m');
console.log('================================\n');

console.log('\x1b[36m[Task Schema §2.1]\x1b[0m');
testTaskSchema();

console.log('\n\x1b[36m[Result Schema §2.2]\x1b[0m');
testResultSchema();

console.log('\n\x1b[36m[Context Spine §2.3]\x1b[0m');
testContextSpine();

console.log('\n\x1b[36m[Verification Core §2.4]\x1b[0m');
testVerificationCore();

console.log('\n\x1b[36m[Memory Audit §2.5]\x1b[0m');
testMemoryAudit();

console.log('\n\x1b[36m[Individual Harnesses §3-6]\x1b[0m');
testHarnessAdapters();

console.log('\n\x1b[36m[Hermes Tooling §5]\x1b[0m');
testHermesToolRegistry();

console.log('\n\x1b[36m[MiniMax Design Tokens §6]\x1b[0m');
testMiniMaxTokens();

console.log('\n--------------------------------');
console.log('\x1b[32m' + passed + ' passed\x1b[0m  \x1b[31m' + failed + ' failed\x1b[0m\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32mAll parity tests passed.\x1b[0m\n');
  process.exit(0);
}
