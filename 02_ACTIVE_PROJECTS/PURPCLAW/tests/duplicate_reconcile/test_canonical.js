'use strict';

/**
 * tests/duplicate_reconcile/test_canonical.js — T07.
 *
 * Certifies that the duplicate reconciliation of task_decomposer.js and
 * agent_routing_matrix.js is real:
 *   - Both files resolve from root (canonical)
 *   - Both files resolve from services/swarm/ (shims)
 *   - The shim and the canonical resolve to the same module instance
 *   - The coordinator still boots with all 7 dependencies loaded
 *   - No second logic copy remains
 *   - Old require paths still work
 *
 * Real node:test, no mocks. Require()s are the production requires.
 *
 * Run from project root: `node --test tests/duplicate_reconcile/test_canonical.js`
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');

const ROOT  = path.resolve(__dirname, '..', '..');
const SWARM = path.join(ROOT, 'services', 'swarm');

test('T01: task_decomposer.js resolves from root (canonical)', () => {
  const td = require(path.join(ROOT, 'task_decomposer.js'));
  assert.ok(td, 'task_decomposer is null');
  assert.ok(typeof td.decomposeTask === 'function', 'missing decomposeTask()');
});

test('T02: agent_routing_matrix.js resolves from root (canonical)', () => {
  const r = require(path.join(ROOT, 'agent_routing_matrix.js'));
  assert.ok(r, 'routing matrix is null');
  // root has AGENT_ROUTING export
  assert.ok(r.AGENT_ROUTING || r.modelForAgent || Object.keys(r).length > 0, 'expected real exports');
});

test('T03: services/swarm/task_decomposer.js (shim) resolves', () => {
  const td = require(path.join(SWARM, 'task_decomposer.js'));
  assert.ok(td, 'shim returned null');
  assert.ok(typeof td.decomposeTask === 'function', 'shim missing decomposeTask');
});

test('T04: services/swarm/agent_routing_matrix.js (shim) resolves', () => {
  const r = require(path.join(SWARM, 'agent_routing_matrix.js'));
  assert.ok(r, 'shim returned null');
  // should expose at least the same export keys as the root
  const rootR = require(path.join(ROOT, 'agent_routing_matrix.js'));
  assert.deepEqual(Object.keys(r).sort(), Object.keys(rootR).sort(), 'shim and root have different keys');
});

test('T05: root and shim resolve to the same canonical module instance', () => {
  // Two requires from different paths must return the same cached module
  // (the shim is module.exports = require(...), so the cached root wins)
  const rootTD = require(path.join(ROOT, 'task_decomposer.js'));
  const swarmTD = require(path.join(SWARM, 'task_decomposer.js'));
  assert.strictEqual(rootTD, swarmTD, 'task_decomposer root !== swarm (shim should re-export)');

  const rootR = require(path.join(ROOT, 'agent_routing_matrix.js'));
  const swarmR = require(path.join(SWARM, 'agent_routing_matrix.js'));
  assert.strictEqual(rootR, swarmR, 'agent_routing_matrix root !== swarm (shim should re-export)');
});

test('T06: no second logic copy — services/swarm files are shims, not logic', () => {
  // A logic copy would be > 5KB. A shim is < 1KB.
  const swarmTD = path.join(SWARM, 'task_decomposer.js');
  const swarmR  = path.join(SWARM, 'agent_routing_matrix.js');
  const tdSize = fs.statSync(swarmTD).size;
  const rSize  = fs.statSync(swarmR).size;
  assert.ok(tdSize < 1500, `services/swarm/task_decomposer.js is ${tdSize}B — should be a small shim, not a copy`);
  assert.ok(rSize  < 1500, `services/swarm/agent_routing_matrix.js is ${rSize}B — should be a small shim, not a copy`);
  // Both should contain the marker comment "SHIM"
  assert.match(fs.readFileSync(swarmTD, 'utf8'), /SHIM/i, 'task_decomposer shim missing SHIM marker');
  assert.match(fs.readFileSync(swarmR,  'utf8'), /SHIM/i, 'routing_matrix shim missing SHIM marker');
});

test('T07: coordinator still boots with all 7 dependencies loaded (no regression)', () => {
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push('ERR: ' + a.join(' '));
  let coordinator;
  try {
    coordinator = require(path.join(SWARM, 'coordinator.js'));
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  assert.ok(coordinator, 'coordinator is null');
  for (const expected of [
    'Task decomposer loaded',
    'Agent score registry loaded',
    'Context packet engine loaded',
    'LLM provider layer loaded',
    'Self-context loaded',
    'Memory client loaded',
    'Cognitive client loaded',
  ]) {
    assert.ok(logs.some(l => l.includes(expected)), `missing log: ${expected}`);
  }
});

test('T08: old require paths from root swarm_coordinator.js still work (no consumers broken)', () => {
  // The root swarm_coordinator.js does require('./task_decomposer.js').
  // The root task_decomposer.js is the original canonical and is still at root.
  // This test asserts the original require pattern from the root coordinator works.
  //
  // We don't actually start the root coordinator (it would try to bind port 7898),
  // we just verify the requires it would do work.
  const td = require(path.join(ROOT, 'task_decomposer.js'));
  const r  = require(path.join(ROOT, 'agent_routing_matrix.js'));
  assert.ok(td, 'root task_decomposer not loadable for root swarm_coordinator');
  assert.ok(r,  'root agent_routing_matrix not loadable for root swarm_coordinator');
  // And the swarm-side require patterns still work
  const tdS = require(path.join(SWARM, 'task_decomposer.js'));
  const rS  = require(path.join(SWARM, 'agent_routing_matrix.js'));
  assert.ok(tdS, 'shim task_decomposer not loadable for services/swarm/coordinator');
  assert.ok(rS,  'shim routing_matrix not loadable for services/swarm/coordinator');
  // And the canonical requirement is shared (not duplicated)
  assert.strictEqual(td, tdS, 'root and shim task_decomposer are not the same instance');
  assert.strictEqual(r,  rS,  'root and shim routing_matrix are not the same instance');
});
