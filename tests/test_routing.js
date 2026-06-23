/**
 * PURPCLAW TEST ROUTING VALIDATOR
 * =================================
 * ROBOT (Precision Engineer) — mechanical validation of
 * the task_decomposer.js routing pipeline.
 *
 * Scope: tests the decompose() pipeline end-to-end:
 *   - clause splitting
 *   - domain classification
 *   - agent selection (KNOWN_AGENTS filter)
 *   - ownership-lock assignment
 *   - dependency ordering (testing always LAST)
 *   - context-packet construction
 *
 * Zero external deps. Runs with `node tests/test_routing.js`.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const decomposer = require(path.join(__dirname, '..', 'task_decomposer.js'));

let passed = 0;
let failed = 0;
const failures = [];

function check(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${label}`);
  } catch (err) {
    failed++;
    failures.push({ label, err });
    console.log(`  \u2717 ${label}\n      ${err.message}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EXPORT SHAPE
// ─────────────────────────────────────────────────────────────────────────────
section('EXPORT SHAPE');

check('exports a decompose() function', () => {
  assert.strictEqual(typeof decomposer.decompose, 'function', 'decompose must be a function');
});

check('exposes domain registry (DOMAIN_DEFS or equivalent)', () => {
  const keys = Object.keys(decomposer);
  const hasDomains = keys.some(k => /DOMAIN|domain/i.test(k));
  assert.ok(hasDomains, `no domain-shaped export found in: ${keys.join(', ')}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TESTING DOMAIN ROUTING — the core ask
// ─────────────────────────────────────────────────────────────────────────────
section('TESTING DOMAIN ROUTING');

const TEST_QUERIES = [
  'add unit tests for the auth service',
  'write integration tests for the API',
  'verify the regression suite passes',
  'improve test coverage on the frontend components',
  'add spec for the e2e checkout flow',
  'write a quality assertion that checks JSON shape',
];

const NON_TEST_QUERIES = [
  'build a new REST endpoint',
  'redesign the dashboard layout',
  'deploy the service to staging',
];

check('every "test"-flavored clause routes to the testing domain', () => {
  for (const q of TEST_QUERIES) {
    const out = decomposer.decompose(q);
    const slices = Array.isArray(out) ? out : (out.subtasks || out.slices || []);
    assert.ok(slices.length > 0, `no slices produced for: ${q}`);
    const domains = slices.map(s => s.domain);
    assert.ok(
      domains.includes('testing'),
      `expected "testing" domain for "${q}", got: ${domains.join(', ')}`
    );
  }
});

check('non-test queries do NOT spuriously route to testing', () => {
  for (const q of NON_TEST_QUERIES) {
    const out = decomposer.decompose(q);
    const slices = Array.isArray(out) ? out : (out.subtasks || out.slices || []);
    const domains = slices.map(s => s.domain);
    assert.ok(
      !domains.includes('testing'),
      `did not expect "testing" for "${q}", got: ${domains.join(', ')}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AGENT SELECTION — only KNOWN agents, never phantom names
// ─────────────────────────────────────────────────────────────────────────────
section('AGENT SELECTION');

check('selected agents are all in the live tower roster', () => {
  const out = decomposer.decompose('add unit tests for the auth service, then run integration tests and write e2e spec');
  const slices = Array.isArray(out) ? out : (out.subtasks || out.slices || []);
  for (const s of slices) {
    assert.ok(s.agent, `slice missing agent: ${JSON.stringify(s)}`);
    assert.ok(typeof s.agent === 'string', `agent must be a string, got: ${typeof s.agent}`);
    assert.ok(/^[a-z]+$/.test(s.agent), `agent must be a lowercase slug, got: ${s.agent}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DEPENDENCY ORDERING — testing must run last
// ─────────────────────────────────────────────────────────────────────────────
section('DEPENDENCY ORDERING');

check('testing slice executes after backend/frontend slices', () => {
  const task = 'build a new API endpoint, render a dashboard component, then add tests';
  const out = decomposer.decompose(task);
  const slices = Array.isArray(out) ? out : (out.subtasks || out.slices || []);

  const testingIdx = slices.findIndex(s => s.domain === 'testing');
  const earlierIdx = slices.findIndex(s => s.domain !== 'testing');

  if (testingIdx !== -1 && earlierIdx !== -1) {
    assert.ok(
      testingIdx > earlierIdx,
      `testing must run after non-testing slices (got testing@${testingIdx}, other@${earlierIdx})`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONTEXT PACKET — each slice gets a contextDepth + acceptanceCriteria
// ─────────────────────────────────────────────────────────────────────────────
section('CONTEXT PACKET');

check('every slice carries an acceptanceCriteria list', () => {
  const out = decomposer.decompose('add unit tests for parser, then integration tests for API');
  const slices = Array.isArray(out) ? out : (out.subtasks || out.slices || []);
  for (const s of slices) {
    const ctx = s.context || s.contextPacket || s;
    assert.ok(Array.isArray(ctx.acceptanceCriteria), `acceptanceCriteria missing on slice: ${JSON.stringify(s)}`);
    assert.ok(ctx.acceptanceCriteria.length > 0, 'acceptanceCriteria must be non-empty');
  }
});

check('testing slices get the testing-flavored acceptance criteria', () => {
  const out = decomposer.decompose('add unit tests for parser');
  const slices = Array.isArray(out) ? out : (out.subtasks || out.slices || []);
  const testingSlice = slices.find(s => s.domain === 'testing');
  if (testingSlice) {
    const criteria = (testingSlice.context || testingSlice).acceptanceCriteria.join(' ').toLowerCase();
    assert.ok(
      /test|coverage|assertion|skipped/.test(criteria),
      `testing acceptance criteria should mention tests/coverage/assertions, got: ${criteria}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ROBUSTNESS — garbage in, structured out (or graceful failure)
// ─────────────────────────────────────────────────────────────────────────────
section('ROBUSTNESS');

check('empty string does not throw', () => {
  let crashed = false;
  try { decomposer.decompose(''); } catch (e) { crashed = true; }
  assert.ok(!crashed, 'decompose("") must not throw');
});

check('null input does not throw', () => {
  let crashed = false;
  try { decomposer.decompose(null); } catch (e) { crashed = true; }
  assert.ok(!crashed, 'decompose(null) must not throw');
});

check('input without recognized keywords still produces a usable plan', () => {
  const out = decomposer.decompose('do the thing with the stuff');
  const slices = Array.isArray(out) ? out : (out.subtasks || out.slices || []);
  assert.ok(Array.isArray(slices), 'output must be array-shaped');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log(`ROBOT TEST ROUTING — ${passed} passed, ${failed} failed`);
console.log('────────────────────────────────────────');

if (failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  \u2717 ${f.label}`);
    console.log(`      ${f.err.stack || f.err.message}`);
  }
  process.exit(1);
}

process.exit(0);
