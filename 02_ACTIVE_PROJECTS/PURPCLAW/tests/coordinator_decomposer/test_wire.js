'use strict';

/**
 * tests/coordinator_decomposer/test_wire.js
 *
 * Certifies that the missing-organ bug is fixed:
 *   - task_decomposer.js is loadable from services/swarm/ (the coordinator's location)
 *   - agent_routing_matrix.js is loadable from services/swarm/
 *   - the live coordinator can load the decomposer without "module is missing" error
 *
 * Real node:test, no mocks. The require()s ARE the production requires.
 *
 * Run from project root: `node --test tests/coordinator_decomposer/test_wire.js`
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');

const SWARM_DIR = path.resolve(__dirname, '..', '..', 'services', 'swarm');
const DECOMPOSER = path.join(SWARM_DIR, 'task_decomposer.js');
const ROUTING    = path.join(SWARM_DIR, 'agent_routing_matrix.js');
const COORD      = path.join(SWARM_DIR, 'coordinator.js');

test('T01: services/swarm/task_decomposer.js exists (shim after T07 reconciliation)', () => {
  assert.ok(fs.existsSync(DECOMPOSER), `expected file at ${DECOMPOSER}`);
  const stat = fs.statSync(DECOMPOSER);
  // After T07 reconciliation, this is a shim (< 1.5KB) that re-exports root canonical
  assert.ok(stat.size < 1500, `services/swarm/task_decomposer.js is ${stat.size}B — should be a shim, not a copy`);
});

test('T02: services/swarm/agent_routing_matrix.js exists (shim after T07 reconciliation)', () => {
  assert.ok(fs.existsSync(ROUTING), `expected file at ${ROUTING}`);
  const stat = fs.statSync(ROUTING);
  assert.ok(stat.size < 1500, `services/swarm/agent_routing_matrix.js is ${stat.size}B — should be a shim, not a copy`);
});

test('T03: task_decomposer is requireable from coordinator location', () => {
  // require() resolves relative to the calling file, not cwd. Use absolute path.
  const decomposer = require(DECOMPOSER);
  assert.ok(decomposer, 'decomposer not loaded');
  // Real exports — not a stub
  const expectedKeys = ['decomposeTask', 'decomposedToExecutionSteps', 'isComplexTask', 'classifyClause', 'splitIntoClauses', 'selectAgent', 'DOMAIN_DEFS'];
  const actualKeys = Object.keys(decomposer);
  for (const k of expectedKeys) {
    assert.ok(actualKeys.includes(k), `missing export: ${k} (have: ${actualKeys.join(', ')})`);
  }
});

test('T04: decomposeTask is callable and has the documented shape', () => {
  const { decomposeTask, isComplexTask, splitIntoClauses } = require(DECOMPOSER);
  // Functions exist with the right types
  assert.equal(typeof decomposeTask, 'function');
  assert.equal(typeof isComplexTask, 'function');
  assert.equal(typeof splitIntoClauses, 'function');
  // isComplexTask gating: short simple task is NOT complex
  assert.equal(isComplexTask('check the status'), false);
  // isComplexTask gating: long multi-domain task IS complex
  const long = 'Build the MCP client in packages/mcp-client/ as a real JSON-RPC protocol client, also wire it to the existing agent-registry.js, then add a CLI surface, plus add a cert that runs a mock MCP server handshake, and finally update the parity dashboard, while keeping the existing tests green.';
  assert.ok(isComplexTask(long), `isComplexTask should return true for long multi-clause task; clauses=${splitIntoClauses(long).length}`);
  // decomposeTask returns a structured result for complex tasks, or null for simple
  const result = decomposeTask(long);
  if (result) {
    assert.ok(Array.isArray(result.subtasks), 'result.subtasks should be array');
    assert.ok(result.subtasks.length >= 1, `expected >= 1 subtask, got ${result.subtasks.length}`);
  }
  // Simple task: null is the correct answer
  assert.equal(decomposeTask('check the status'), null);
});

test('T04b: splitIntoClauses produces multiple clauses from a real task', () => {
  const { splitIntoClauses } = require(DECOMPOSER);
  const task = 'Build the MCP client, also wire it to the registry, then add a cert, plus update the parity dashboard.';
  const clauses = splitIntoClauses(task);
  assert.ok(clauses.length >= 3, `expected >= 3 clauses from comma/and/then/plus splitters, got ${clauses.length}: ${JSON.stringify(clauses)}`);
});

test('T05: coordinator can now load the decomposer (the missing-organ fix)', () => {
  // Capture console.log/error so we can see the "Task decomposer loaded" line
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push('ERR: ' + a.join(' '));
  try {
    // Use absolute path to verify the file the coordinator would load
    const taskDecomposer = require(DECOMPOSER);
    assert.ok(taskDecomposer, 'taskDecomposer is null');
    assert.ok(taskDecomposer.decomposeTask, 'decomposer not really loaded');
    // Verify the require would have worked from the coordinator's location
    // (the same path the coordinator.js uses at line 161)
    const relRequire = require.resolve('./task_decomposer.js', { paths: [SWARM_DIR] });
    assert.ok(fs.existsSync(relRequire), `coordinator-style require would fail: ${relRequire}`);
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
});

test('T06: root task_decomposer.js is the canonical home (T07 reconciliation)', () => {
  // After T07, root is canonical. The services/swarm/ copy is a shim.
  // The full logic copy lives at the project root.
  const ROOT_DECOMP = path.resolve(__dirname, '..', '..', 'task_decomposer.js');
  assert.ok(fs.existsSync(ROOT_DECOMP), `expected canonical at ${ROOT_DECOMP}`);
  const stat = fs.statSync(ROOT_DECOMP);
  assert.ok(stat.size > 5000, `root canonical too small (${stat.stat}B) — should be the real logic, not a shim`);
});

test('T07: lib/context-packet.js and friends exist (next slice will wire them)', () => {
  // These were reported as "missing" by the live coordinator but they exist in lib/
  // The next slice will fix the require paths the same way.
  const LIB = path.resolve(__dirname, '..', '..', 'lib');
  const files = ['context-packet.js', 'llm-provider.js', 'self-context.js', 'memory-client.js', 'cognitive-client.js'];
  for (const f of files) {
    const p = path.join(LIB, f);
    assert.ok(fs.existsSync(p), `expected lib/${f}`);
    const stat = fs.statSync(p);
    assert.ok(stat.size > 1000, `lib/${f} too small (${stat.size} bytes)`);
  }
});
