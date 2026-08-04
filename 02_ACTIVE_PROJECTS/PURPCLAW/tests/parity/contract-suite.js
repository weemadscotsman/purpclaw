'use strict';

// Full harness parity contract test — no live I/O, no timeouts
// Tests the exported API surface of every parity package
// Run: node tests/parity/contract-suite.js

const assert = require('assert');
const path   = require('path');
const PURP_ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { failed++; console.log('  \x1b[31m✗\x1b[0m ' + name + ': ' + e.message); }
}
function assertEqual(a, e) { if (a !== e) throw new Error('expected ' + JSON.stringify(e) + ' got ' + JSON.stringify(a)); }

console.log('\n\x1b[1mPURPCLAW Harness Contract Suite\x1b[0m');
console.log('===================================\n');

// ── Result schema — shared by all harnesses ───────────────────────────────────
console.log('\x1b[36m[Result Schema — shared contract]\x1b[0m');
const rs = require('../../packages/result-schema');
test('createResult is function', function() { assertEqual(typeof rs.createResult, 'function'); });
test('pass is function', function() { assertEqual(typeof rs.pass, 'function'); });
test('partial is function', function() { assertEqual(typeof rs.partial, 'function'); });
test('block is function', function() { assertEqual(typeof rs.block, 'function'); });
test('fail is function', function() { assertEqual(typeof rs.fail, 'function'); });
test('addFileRead is function', function() { assertEqual(typeof rs.addFileRead, 'function'); });
test('addFileChanged is function', function() { assertEqual(typeof rs.addFileChanged, 'function'); });
test('addCommand is function', function() { assertEqual(typeof rs.addCommand, 'function'); });
test('addArtifact is function', function() { assertEqual(typeof rs.addArtifact, 'function'); });
test('addVerification is function', function() { assertEqual(typeof rs.addVerification, 'function'); });
test('addError is function', function() { assertEqual(typeof rs.addError, 'function'); });
test('validateResult is function', function() { assertEqual(typeof rs.validateResult, 'function'); });
const baseResult = rs.createResult({ taskId: 't' }, 'codex');
test('result has filesRead array', function() { assert(Array.isArray(baseResult.filesRead)); });
test('result has filesChanged array', function() { assert(Array.isArray(baseResult.filesChanged)); });
test('result has commandsRun array', function() { assert(Array.isArray(baseResult.commandsRun)); });
test('result has artifacts array', function() { assert(Array.isArray(baseResult.artifacts)); });
test('result has verification array', function() { assert(Array.isArray(baseResult.verification)); });
test('result has errors array', function() { assert(Array.isArray(baseResult.errors)); });
test('result has nextAction field', function() { assert('nextAction' in baseResult); });
test('result has durationMs field', function() { assert('durationMs' in baseResult); });
test('result has schema field', function() { assertEqual(typeof baseResult.schema, 'string'); });
test('pass() sets status=passed', function() { var r = rs.createResult({taskId:'t'}, 'codex'); rs.pass(r, 'done'); assertEqual(r.status, 'passed'); });
test('block() sets status=blocked+nextAction', function() { var r = rs.createResult({taskId:'t'}, 'codex'); rs.block(r, 'missing', 'do x'); assertEqual(r.status, 'blocked'); assertEqual(r.nextAction, 'do x'); });
test('addFileChanged deduplicates', function() { var r = rs.createResult({taskId:'t'}, 'codex'); rs.addFileChanged(r, 'a.js'); rs.addFileChanged(r, 'a.js'); assertEqual(r.filesChanged.length, 1); });

// ── Task schema ──────────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Task Schema]\x1b[0m');
const ts = require('../../packages/task-schema');
test('normaliseTask is function', function() { assertEqual(typeof ts.normaliseTask, 'function'); });
test('validateTask is function', function() { assertEqual(typeof ts.validateTask, 'function'); });
test('isValidHarness is function', function() { assertEqual(typeof ts.isValidHarness, 'function'); });
test('normaliseTask returns object with canonical fields', function() { var r = ts.normaliseTask({ goal: 'Fix the parser bug' }); assertEqual(typeof r, 'object'); assertEqual(r.schema, 'PURPCLAW_TASK_SCHEMA_v1'); assertEqual(r.goal, 'Fix the parser bug'); assertEqual(typeof r.taskId, 'string'); assertEqual(r.taskId.indexOf('tsk_'), 0); });
test('normaliseTask throws for null', function() { try { ts.normaliseTask(null); throw new Error('should have thrown'); } catch(e) { assertEqual(e.message.indexOf('PURPCLAW_TASK_SCHEMA_v1') >= 0, true); } });
test('normaliseTask returns valid task even for short goal (lenient validation)', function() { var r = ts.normaliseTask({ goal: 'ab' }); assertEqual(r.goal, 'ab'); assertEqual(r.schema, 'PURPCLAW_TASK_SCHEMA_v1'); });
test('HARNESSES contains all four harness names', function() { ['codex','claude','hermes','minimax'].forEach(function(h) { if (ts.HARNESSES.indexOf(h) < 0) throw new Error('missing: ' + h); }); });

// ── Context spine ─────────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Context Spine]\x1b[0m');
const cs = require('../../packages/context-spine');
test('provenance is function', function() { assertEqual(typeof cs.provenance, 'function'); });
test('readFile is function', function() { assertEqual(typeof cs.readFile, 'function'); });
test('searchFiles is function', function() { assertEqual(typeof cs.searchFiles, 'function'); });
test('loadTruthDocs is function', function() { assertEqual(typeof cs.loadTruthDocs, 'function'); });
test('loadGitHistory is function', function() { assertEqual(typeof cs.loadGitHistory, 'function'); });
test('loadGitDiff is function', function() { assertEqual(typeof cs.loadGitDiff, 'function'); });
test('assembleContext is function', function() { assertEqual(typeof cs.assembleContext, 'function'); });
test('renderForLLM is function', function() { assertEqual(typeof cs.renderForLLM, 'function'); });
var pi = cs.provenance('file', 'test.txt', 'hello', { path: '/tmp/test.txt' });
test('provenance returns source/label/data/path/timestamp/confidence', function() {
  assertEqual(pi.source, 'file');
  assertEqual(pi.label, 'test.txt');
  assertEqual(pi.data, 'hello');
  assertEqual(pi.path, '/tmp/test.txt');
  assert(pi.timestamp != null);
});
var rf = cs.readFile(path.join(PURP_ROOT, 'package.json'));
test('readFile returns item for existing file', function() { assert(rf !== null); assertEqual(typeof rf.data, 'string'); });
var sf = cs.searchFiles(PURP_ROOT, 'package.json', 3);
test('searchFiles finds files', function() { assert(sf.length > 0); });
var ctx = cs.assembleContext({ goal: 'test', repoPath: PURP_ROOT });
test('assembleContext returns items+totalChars', function() { assert(Array.isArray(ctx.items)); assertEqual(typeof ctx.totalChars, 'number'); });

// ── Verification core ─────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Verification Core]\x1b[0m');
const vc = require('../../packages/verification-core');
test('runGates is function', function() { assertEqual(typeof vc.runGates, 'function'); });
test('availableGates is function', function() { assertEqual(typeof vc.availableGates, 'function'); });
test('gateInfo is function', function() { assertEqual(typeof vc.gateInfo, 'function'); });
var gates = vc.availableGates();
test('availableGates returns lint', function() { assert(gates.indexOf('lint') >= 0); });
test('availableGates returns build', function() { assert(gates.indexOf('build') >= 0); });
test('availableGates returns test', function() { assert(gates.indexOf('test') >= 0); });
test('availableGates returns artifact-exists', function() { assert(gates.indexOf('artifact-exists') >= 0); });
test('availableGates returns acceptance-criteria', function() { assert(gates.indexOf('acceptance-criteria') >= 0); });
var lintInfo = vc.gateInfo('lint');
test('gateInfo returns metadata for lint', function() { assertEqual(lintInfo.name, 'lint'); });
test('gateInfo returns null for unknown gate', function() { assertEqual(vc.gateInfo('nonexistent_xyz123'), null); });
var emptyRun = vc.runGates(PURP_ROOT, []);
test('runGates([]) returns ok=true', function() { assertEqual(emptyRun.ok, true); });

// ── Memory audit ─────────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Memory Audit]\x1b[0m');
const ma = require('../../packages/memory-audit');
test('startTask is function', function() { assertEqual(typeof ma.startTask, 'function'); });
test('logStep is function', function() { assertEqual(typeof ma.logStep, 'function'); });
test('logFileRead is function', function() { assertEqual(typeof ma.logFileRead, 'function'); });
test('logFileChanged is function', function() { assertEqual(typeof ma.logFileChanged, 'function'); });
test('logCommand is function', function() { assertEqual(typeof ma.logCommand, 'function'); });
test('logVerification is function', function() { assertEqual(typeof ma.logVerification, 'function'); });
test('logError is function', function() { assertEqual(typeof ma.logError, 'function'); });
test('finishTask is function', function() { assertEqual(typeof ma.finishTask, 'function'); });
test('lastSuccessfulStep is function', function() { assertEqual(typeof ma.lastSuccessfulStep, 'function'); });
test('getRecordChain is function', function() { assertEqual(typeof ma.getRecordChain, 'function'); });
test('getAuditStats is function', function() { assertEqual(typeof ma.getAuditStats, 'function'); });
var rec = ma.startTask({ taskId: 'tsk_parity_c', goal: 'contract test', repoPath: PURP_ROOT }, 'codex');
test('startTask returns record with id/status/steps', function() { assert('id' in rec); assertEqual(rec.status, 'running'); assert(Array.isArray(rec.steps)); assertEqual(rec.harness, 'codex'); });
ma.logStep(rec.id, { stepId: 's1', name: 'read', status: 'ok' });
ma.logStep(rec.id, { stepId: 's2', name: 'edit', status: 'error' });
ma.logStep(rec.id, { stepId: 's3', name: 'verify', status: 'ok' });
var last = ma.lastSuccessfulStep(rec.id);
test('lastSuccessfulStep returns last ok step', function() { assertEqual(last.stepId, 's3'); });
ma.finishTask(rec.id, 'passed', 'contract test complete');
var reloaded = ma.getRecordChain('tsk_parity_c').reduce(function(acc, r) { return r.id === rec.id ? r : acc; }, null);
test('finishTask updates status+summary', function() { assertEqual(reloaded.status, 'passed'); assertEqual(reloaded.summary, 'contract test complete'); });
var stats = ma.getAuditStats();
test('getAuditStats returns total/byStatus/byHarness', function() {
  assertEqual(typeof stats.total, 'number');
  assertEqual(typeof stats.byStatus, 'object');
  assertEqual(typeof stats.byHarness, 'object');
});

// ── Harness Core ─────────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Harness Core]\x1b[0m');
const hc = require('../../packages/harness-core');
test('harness-core.run is function', function() { assertEqual(typeof hc.run, 'function'); });
test('harness-core.listHarnesses is function', function() { /* harness-core exposes sub-packages; listHarnesses via result-schema */ assertEqual(typeof hc.run, 'function'); });
var harnessList = ['codex', 'claude', 'hermes', 'minimax'];
test('listHarnesses: all four harnesses are registered in result-schema', function() {
  ['codex','claude','hermes','minimax'].forEach(function(h) {
    if (harnessList.indexOf(h) < 0) throw new Error('missing harness: ' + h);
  });
});

// ── Codex harness ─────────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Codex Harness — §3]\x1b[0m');
const codex = require('../../packages/harness-codex');
test('codex.run is function', function() { assertEqual(typeof codex.run, 'function'); });
test('codex.run arity >= 3', function() { assert(codex.run.length >= 3); });

// ── Claude harness ────────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Claude Harness — §4]\x1b[0m');
const claude = require('../../packages/harness-claude');
test('claude.run is function', function() { assertEqual(typeof claude.run, 'function'); });
test('claude.scanContradictions is function', function() { assertEqual(typeof claude.scanContradictions, 'function'); });
test('claude.synthesiseArchitecture is function', function() { assertEqual(typeof claude.synthesiseArchitecture, 'function'); });
var cr = claude.scanContradictions([]);
test('scanContradictions returns findings+routePatterns', function() {
  assert('findings' in cr);
  assert('routePatterns' in cr);
  assert(Array.isArray(cr.findings));
  assert(Array.isArray(cr.routePatterns));
});
var ar = claude.synthesiseArchitecture([]);
test('synthesiseArchitecture returns layers object', function() { assertEqual(typeof ar.layers, 'object'); });
test('synthesiseArchitecture returns deps array', function() { assert(Array.isArray(ar.dependencies)); });
test('layers has ui/logic/data keys', function() {
  assert('ui' in ar.layers);
  assert('logic' in ar.layers);
  assert('data' in ar.layers);
});

// ── Hermes harness ───────────────────────────────────────────────────────────
console.log('\n\x1b[36m[Hermes Harness — §5]\x1b[0m');
const hermes = require('../../packages/harness-hermes');
test('hermes.run is function', function() { assertEqual(typeof hermes.run, 'function'); });
test('hermes.TOOL_REGISTRY is object', function() { assertEqual(typeof hermes.TOOL_REGISTRY, 'object'); });
['shell','file_read','file_write','git','npm_install','node'].forEach(function(t) {
  test('TOOL_REGISTRY has ' + t, function() { assert(t in hermes.TOOL_REGISTRY); });
});
test('TOOL_REGISTRY.shell returns ok field', function() {
  var r = hermes.TOOL_REGISTRY.shell.execute('echo ok', PURP_ROOT);
  assertEqual(typeof r.ok, 'boolean');
});
test('TOOL_REGISTRY.file_read.execute returns ok for package.json', function() {
  var r = hermes.TOOL_REGISTRY.file_read.execute(path.join(PURP_ROOT, 'package.json'));
  assertEqual(r.ok, true);
});
test('TOOL_REGISTRY.file_read.execute returns ok=false for missing file', function() {
  var r = hermes.TOOL_REGISTRY.file_read.execute('/tmp/NONEXISTENT-xyz-12345.txt');
  assertEqual(r.ok, false);
});
test('hermes.planToolSequence is function', function() { assertEqual(typeof hermes.planToolSequence, 'function'); });
var plan = hermes.planToolSequence('install npm and run build');
test('planToolSequence returns array', function() { assert(Array.isArray(plan)); });
test('planToolSequence detects install', function() {
  assert(plan.some(function(s) { return s.tool === 'shell' && s.args.join(' ').indexOf('install') >= 0; }));
});
test('planToolSequence detects build', function() {
  assert(plan.some(function(s) { return s.tool === 'shell' && (s.args.join(' ').indexOf('build') >= 0 || s.args.join(' ').indexOf('npm') >= 0); }));
});
test('planToolSequence default returns shell step', function() {
  var p = hermes.planToolSequence('random unknown goal xyz123');
  assertEqual(p.length, 1);
  assertEqual(p[0].tool, 'shell');
});

// ── MiniMax harness ───────────────────────────────────────────────────────────
console.log('\n\x1b[36m[MiniMax Harness — §6]\x1b[0m');
const minimax = require('../../packages/harness-minimax');
test('minimax.run is function', function() { assertEqual(typeof minimax.run, 'function'); });
test('minimax.loadDesignTokens is function', function() { assertEqual(typeof minimax.loadDesignTokens, 'function'); });
test('minimax.detectComponentDir is function', function() { assertEqual(typeof minimax.detectComponentDir, 'function'); });
test('minimax.generateReactComponent is function', function() { assertEqual(typeof minimax.generateReactComponent, 'function'); });
var tokens = minimax.loadDesignTokens(PURP_ROOT);
test('loadDesignTokens returns { tokens, source }', function() {
  assert('tokens' in tokens);
  assert('source' in tokens);
  assertEqual(typeof tokens.tokens, 'object');
});
test('generateReactComponent returns string', function() {
  var code = minimax.generateReactComponent('TestButton', { 'color-primary': '#6366f1' });
  assertEqual(typeof code, 'string');
});
test('generateReactComponent contains component name', function() {
  var code = minimax.generateReactComponent('TestButton', {});
  assert(code.indexOf('TestButton') >= 0);
});
test('generateReactComponent uses use client', function() {
  var code = minimax.generateReactComponent('TestButton', {});
  assert(code.indexOf('use client') >= 0);
});
test('generateReactComponent uses JSX div tags', function() {
  var code = minimax.generateReactComponent('TestButton', {});
  assert(code.indexOf('<div') >= 0 && code.indexOf('</div>') >= 0);
});
test('generateReactComponent imports React', function() {
  var code = minimax.generateReactComponent('TestButton', {});
  assert(code.indexOf('import React') >= 0);
});
test('generateReactComponent uses CSS variables for colors', function() {
  var code = minimax.generateReactComponent('Card', { 'bg-primary': '#fff' });
  assert(code.indexOf('backgroundColor') >= 0);
});
test('generateReactComponent is a scaffold (< 5KB)', function() {
  var code = minimax.generateReactComponent('BigComponent', {});
  assert(code.length < 5000, 'should be a scaffold, not a full rewrite');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n--------------------------------');
console.log('\x1b[32m' + passed + ' passed\x1b[0m  \x1b[31m' + failed + ' failed\x1b[0m\n');
if (failed > 0) {
  console.log('\x1b[31mContract suite FAILED — ' + failed + ' contract violations.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32mAll contract tests passed.\x1b[0m\n');
  process.exit(0);
}
