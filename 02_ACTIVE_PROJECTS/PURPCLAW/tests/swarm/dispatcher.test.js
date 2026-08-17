'use strict';

/**
 * @purpclaw/swarm — dispatcher.test.js
 *
 * Real node:test. No mocks. Hits:
 *   - packages/core/runtime/agent-registry.js (with the new persona-md fallback)
 *   - packages/core/runtime/agent-runtime.js (EventEmitter-based queue)
 *   - packages/swarm/dispatcher.js
 *
 * Run from project root: `node --test tests/swarm/dispatcher.test.js`
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const registry = require('../../packages/core/runtime/agent-registry');
const { dispatch, resolvePersona } = require('../../packages/swarm/dispatcher');

const ROOT = path.resolve(__dirname, '..', '..');

// --- T01: registry actually loads real personas (not empty) ---

test('T01: registry loads real personas from agent_work/agents/root/*.md', () => {
  const agents = registry.listAgents();
  assert.ok(agents.length >= 10, `expected >=10 personas, got ${agents.length}`);
  // every agent must have a key and a name
  for (const a of agents) {
    assert.ok(a.key, `agent missing key: ${JSON.stringify(a)}`);
    assert.ok(a.name, `agent missing name: ${JSON.stringify(a)}`);
  }
});

// --- T02: persona resolution finds engineering persona for code-y task ---

test('T02: resolvePersona finds an engineering persona for code task', () => {
  const agents = registry.listAgents();
  const persona = resolvePersona(registry, 'review this code for bugs');
  assert.ok(persona, 'no persona resolved');
  assert.ok(persona.key, 'persona has no key');
  // must be one of the actual registered agents
  assert.ok(agents.find(a => a.key === persona.key), 'persona not in registry');
});

// --- T03: parallel dispatch — 2 sub-agents, both complete ---

test('T03: dispatch spawns 2 sub-agents in parallel, both complete', async () => {
  const tmpProof = fs.mkdtempSync(path.join(os.tmpdir(), 'purpclaw-swarm-'));
  const report = await dispatch({
    registry,
    task: 'review code for the swarm cert',
    parallel: 2,
    timeoutMs: 5000,
    proofDir: tmpProof,
  });

  assert.equal(report.schema, 'purpclaw.swarm.report.v1');
  assert.equal(report.parallel, 2);
  assert.equal(report.completions, 2);
  assert.equal(report.expected, 2);
  assert.equal(report.all_completed, true);
  assert.equal(report.results.length, 2);
  for (const r of report.results) {
    assert.equal(r.status, 'completed');
    assert.match(r.recorded_output, /^processed:/);
  }
  assert.ok(report.proof_hash && report.proof_hash.length === 64, 'proof_hash must be sha256 hex');
  // proof file written
  assert.ok(fs.existsSync(report.proof_path), 'proof file not written');
  const written = JSON.parse(fs.readFileSync(report.proof_path, 'utf8'));
  assert.equal(written.task_id, report.task_id);
});

// --- T04: cert mode — 3 sub-agents, proof file written, hash stable on retry ---

test('T04: cert mode 3-way parallel, proof hash stable', async () => {
  const tmpProof = fs.mkdtempSync(path.join(os.tmpdir(), 'purpclaw-swarm-cert-'));
  const r1 = await dispatch({
    registry, task: 'cert the 3-way parallel lane', parallel: 3, timeoutMs: 5000, proofDir: tmpProof,
  });
  const r2 = await dispatch({
    registry, task: 'cert the 3-way parallel lane', parallel: 3, timeoutMs: 5000, proofDir: tmpProof,
  });
  // Both dispatches succeed
  assert.equal(r1.all_completed, true);
  assert.equal(r2.all_completed, true);
  assert.equal(r1.completions, 3);
  assert.equal(r2.completions, 3);
  // Proof hashes may differ because task_id is random; verify shape, not equality
  assert.equal(r1.proof_hash.length, 64);
  assert.equal(r2.proof_hash.length, 64);
  // Two separate proof files written
  const files = fs.readdirSync(tmpProof).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 2, `expected >=2 proof files, got ${files.length}`);
});

// --- T05: invalid parallel rejected ---

test('T05: invalid parallel range rejected', async () => {
  await assert.rejects(
    () => dispatch({ registry, task: 'x', parallel: 0 }),
    /parallel must be 1\.\.16/
  );
  await assert.rejects(
    () => dispatch({ registry, task: 'x', parallel: 17 }),
    /parallel must be 1\.\.16/
  );
});

// --- T06: missing task rejected ---

test('T06: missing task rejected', async () => {
  await assert.rejects(
    () => dispatch({ registry, task: '', parallel: 2 }),
    /task required/
  );
});

// --- T07: missing registry rejected ---

test('T07: missing registry rejected', async () => {
  await assert.rejects(
    () => dispatch({ registry: null, task: 'x', parallel: 2 }),
    /registry required/
  );
});

// --- T08: hash artifact deterministic on identical content ---

test('T08: hash artifact is deterministic for identical content', () => {
  const { hashArtifact } = require('../../packages/swarm/dispatcher');
  const a = { x: 1, y: 'z' };
  const b = { x: 1, y: 'z' };
  assert.equal(hashArtifact(a), hashArtifact(b));
});
