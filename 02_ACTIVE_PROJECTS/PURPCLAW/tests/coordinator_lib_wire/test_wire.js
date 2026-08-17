'use strict';

/**
 * tests/coordinator_lib_wire/test_wire.js
 *
 * Certifies that the 5 lib/ dependencies (context-packet, llm-provider,
 * self-context, memory-client, cognitive-client) + the 2 swarm-local helpers
 * (task_decomposer, agent_routing_matrix, agent_score) all load cleanly from
 * the coordinator's location, and that the coordinator boots end-to-end
 * without "module is missing" errors.
 *
 * Real node:test, no mocks for module resolution. The require()s ARE the
 * production requires.
 *
 * Run from project root: `node --test tests/coordinator_lib_wire/test_wire.js`
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'lib');
const SWARM = path.join(ROOT, 'services', 'swarm');

function libRequire(name) {
  return require(path.join(LIB, name));
}

test('T01: lib/context-packet.js resolves and exports a non-null API', () => {
  const m = libRequire('context-packet.js');
  assert.ok(m, 'context-packet is null');
  assert.ok(typeof m.write === 'function', 'missing write()');
  assert.ok(typeof m.read === 'function', 'missing read()');
  assert.ok(typeof m.readAll === 'function', 'missing readAll()');
  assert.ok(typeof m.synthesize === 'function', 'missing synthesize()');
});

test('T02: lib/llm-provider.js resolves and exposes a chat surface', () => {
  const m = libRequire('llm-provider.js');
  assert.ok(m, 'llm-provider is null');
  assert.ok(typeof m.chat === 'function', 'missing chat()');
  assert.ok(typeof m.streamChat === 'function', 'missing streamChat()');
  assert.ok(typeof m.complete === 'function', 'missing complete()');
  assert.ok(m.PROVIDERS, 'missing PROVIDERS registry');
});

test('T03: lib/self-context.js resolves and builds self-context', () => {
  const m = libRequire('self-context.js');
  assert.ok(m, 'self-context is null');
  assert.ok(typeof m.buildSelfContext === 'function', 'missing buildSelfContext()');
  assert.ok(typeof m.buildSelfContextAsync === 'function', 'missing buildSelfContextAsync()');
});

test('T04: lib/memory-client.js resolves and exposes memory surface', () => {
  const m = libRequire('memory-client.js');
  assert.ok(m, 'memory-client is null');
  assert.ok(typeof m.recall === 'function', 'missing recall()');
  assert.ok(typeof m.ingest === 'function', 'missing ingest()');
  assert.ok(typeof m.isOnline === 'function', 'missing isOnline()');
});

test('T05: lib/cognitive-client.js resolves and exposes facts + diagnostics', () => {
  const m = libRequire('cognitive-client.js');
  assert.ok(m, 'cognitive-client is null');
  assert.ok(typeof m.assertFact === 'function', 'missing assertFact()');
  assert.ok(typeof m.retractFact === 'function', 'missing retractFact()');
  assert.ok(typeof m.queryFacts === 'function', 'missing queryFacts()');
  assert.ok(typeof m.diagnose === 'function', 'missing diagnose()');
});

test('T06: each module exports a non-null object (no empty stubs)', () => {
  // Per-module minimum exports. self-context legitimately has 2.
  const expected = {
    'context-packet.js': 6,    // write, read, readAll, readHandoff, formatHandoff, synthesize, init, hasOutput
    'llm-provider.js':   6,    // chat, streamChat, swarm, complete, getProviderInfo, listProviders, PROVIDERS, chatOpenAI
    'self-context.js':   2,    // buildSelfContext, buildSelfContextAsync (small but real)
    'memory-client.js':  6,    // recall, ingest, react, getContext, getLiftedFacts, isOnline, stats, formatForPrompt
    'cognitive-client.js': 6, // diagnose, diagnoseAgent, reportEvent, formatFindings, assertFact, retractFact, queryFacts, checkConstraint
  };
  for (const [f, min] of Object.entries(expected)) {
    const m = libRequire(f);
    assert.ok(m, `${f} exported null/undefined`);
    assert.equal(typeof m, 'object', `${f} not an object`);
    const keys = Object.keys(m);
    assert.ok(keys.length >= min, `${f} only has ${keys.length} exports, expected >= ${min}; suspicious: ${keys.join(',')}`);
  }
});

test('T07: services/swarm/coordinator.js loads without throwing', () => {
  // Capture console.error/warn/log to spot the "unavailable" lines
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  console.log = (...a) => logs.push(['log', a.join(' ')]);
  console.error = (...a) => logs.push(['err', a.join(' ')]);
  console.warn = (...a) => logs.push(['warn', a.join(' ')]);
  let coordinator;
  try {
    coordinator = require(path.join(SWARM, 'coordinator.js'));
  } catch (e) {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
    throw e;
  }
  console.log = origLog;
  console.error = origErr;
  console.warn = origWarn;
  assert.ok(coordinator, 'coordinator is null');
  // Check the expected exports
  assert.ok(typeof coordinator.coordinateMission === 'function', 'missing coordinateMission()');
  assert.ok(typeof coordinator.startMission === 'function', 'missing startMission()');
  // The "loaded" log lines should all be present
  const allLog = logs.map(l => l[1]).join('\n');
  for (const expected of [
    'Task decomposer loaded',
    'Context packet engine loaded',
    'LLM provider layer loaded',
    'Self-context loaded',
    'Memory client loaded',
    'Cognitive client loaded',
  ]) {
    assert.ok(allLog.includes(expected), `missing log: "${expected}". got: ${allLog.slice(0, 500)}`);
  }
  // The "unavailable" log lines should NOT be present
  for (const unwanted of [
    'context-packet.js unavailable',
    'llm-provider.js unavailable',
    'self-context.js unavailable',
    'memory-client.js unavailable',
    'cognitive-client.js unavailable',
    'cognitive-client.js unavailable — cognitive services disabled',
  ]) {
    assert.ok(!allLog.includes(unwanted), `unexpected log: "${unwanted}"`);
  }
});

test('T08: services/swarm/task_decomposer.js still loads (regression check)', () => {
  const m = libRequire; // sanity
  const td = require(path.join(SWARM, 'task_decomposer.js'));
  assert.ok(td, 'task_decomposer is null');
  assert.ok(typeof td.decomposeTask === 'function', 'missing decomposeTask()');
  assert.ok(typeof td.isComplexTask === 'function', 'missing isComplexTask()');
});

test('T09: services/swarm/agent_score.js still loads (regression check)', () => {
  const a = require(path.join(SWARM, 'agent_score.js'));
  assert.ok(a, 'agent_score is null');
});

test('T10: full coordinator boot smoke — exports all expected mission surface', () => {
  const coordinator = require(path.join(SWARM, 'coordinator.js'));
  const expected = ['coordinateMission', 'startMission', 'listMissions', 'getMission', 'abortMission'];
  for (const k of expected) {
    assert.equal(typeof coordinator[k], 'function', `missing or wrong type for ${k}`);
  }
  // createCoordinatorServer should be there
  assert.equal(typeof coordinator.createCoordinatorServer, 'function', 'missing createCoordinatorServer()');
});
