'use strict';

/**
 * test-runtime-certification.js
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * Tests for lib/runtime-certification.js â€” the 17-gate runtime
 * certification harness per PURPCLAW_EPHEMERAL_RUNTIME_SPEC.md.
 *
 * The harness is a live measurement tool, not a checklist. Tests
 * assert the structural properties of the gates and the contract
 * surface they expose.
 */

const assert = require('assert');
const cert = require('../../lib/runtime-certification');

let pass = 0, fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    fail++;
    console.log(`  \u2717 ${name}\n      ${e.message}`);
  }
}

(async () => {
  console.log('\n  â”€â”€ runtime-certification (31 gates) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n');

  // â”€â”€ module surface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await test('exports certify() async function', () => {
    assert.strictEqual(typeof cert.certify, 'function');
  });

  await test('exports format() function', () => {
    assert.strictEqual(typeof cert.format, 'function');
  });

  await test('exports 31 gates (17 runtime + 12 steering + 2 cryosleep)', () => {
    assert.strictEqual(cert.GATES.length, 31, `expected 31 gates, got ${cert.GATES.length}`);
  });

  await test('every gate has a unique name', () => {
    const names = cert.GATES.map(g => g.name);
    const uniq = new Set(names);
    assert.strictEqual(uniq.size, names.length, 'gate names must be unique');
  });

  await test('every gate has a description and probe', () => {
    for (const g of cert.GATES) {
      assert.strictEqual(typeof g.name, 'string');
      assert.strictEqual(typeof g.description, 'string');
      assert.ok(g.description.length > 5);
      assert.strictEqual(typeof g.probe, 'function');
    }
  });

  // â”€â”€ all 17 gates are present by name â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const expectedGates = [
    'CORE_SINGLETON',
    'IDLE_CPU_BASELINE',
    'IDLE_RAM_BASELINE',
    'GPU_RELEASE',
    'LAZY_WORKER_START',
    'LAZY_WORKER_REUSE',
    'LAZY_WORKER_TEARDOWN',
    'NO_PROCESS_LEAKS',
    'MEMORY_GATEWAY_SINGLE_PATH',
    'SEVEN_LAYER_SCOPED_RECALL',
    'MEMORY_WRITEBACK_DURABLE',
    'CHECKPOINT_RESUME',
    'NINE_PILLAR_SELECTIVE_ACTIVATION',
    'NATIVE_PRIORITY',
    'MCP_FALLBACK_ONLY',
    'VERIFICATION_INTEGRITY',
    'PROVIDER_INDEPENDENCE',
    'STEERING_CAPSULE_PRESENT',
    'STEERING_PRECEDENCE',
    'STEERING_SCOPE_ISOLATION',
    'STEERING_CONFLICT_DETECTION',
    'STEERING_CONFLICT_RESOLUTION',
    'STEERING_CONTEXT_SURVIVAL',
    'STEERING_PROVIDER_INDEPENDENCE',
    'STEERING_TOOL_ENFORCEMENT',
    'STEERING_WORKER_ENFORCEMENT',
    'STEERING_VERIFICATION_ENFORCEMENT',
    'STEERING_MEMORY_SUBORDINATION',
    'STEERING_LINEAGE_COMPLETE',
    'CRYOSLEEP_SLEEP',
    'CRYOSLEEP_WAKE',
  ];
  await test('all 31 expected gate names are registered', () => {
    const have = new Set(cert.GATES.map(g => g.name));
    for (const n of expectedGates) {
      assert.ok(have.has(n), `missing gate: ${n}`);
    }
  });

  // â”€â”€ live measurement helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await test('readRssBytes: returns a positive number', () => {
    const b = cert.readRssBytes();
    assert.ok(typeof b === 'number');
    assert.ok(b > 1024, 'RSS should be > 1KB');
  });

  await test('measureIdleCpu: returns 0â€“100 number after window', async () => {
    const pct = await cert.measureIdleCpu(50);
    assert.ok(typeof pct === 'number');
    assert.ok(pct >= 0 && pct <= 100, `expected 0â€“100, got ${pct}`);
  });

  await test('probeSupervisorPillars: returns inventory snapshot', () => {
    const s = cert.probeSupervisorPillars();
    assert.strictEqual(s.ok, true);
    assert.ok(s.totalPillars > 0);
  });

  await test('probeMemoryGateway: returns gateway candidates', () => {
    const m = cert.probeMemoryGateway();
    assert.ok(typeof m.candidateCount === 'number');
    assert.ok(Array.isArray(m.found));
    assert.strictEqual(typeof m.sevenLayerSpecPresent, 'boolean');
  });

  // â”€â”€ run certify() and check the verdict structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await test('certify() returns structured result with 31 gate results', async () => {
    const r = await cert.certify();
    assert.ok(r.verdict);
    assert.ok(['CERTIFIED', 'CERTIFIED_WITH_WARNINGS', 'FAILED'].includes(r.verdict));
    assert.strictEqual(r.gates.length, 31);
    assert.ok(r.baseline);
    assert.ok(r.baseline.rssMb > 0);
    assert.ok(r.measuredAt);
  });

  await test('certify() counts match the gates', async () => {
    const r = await cert.certify();
    const sum = r.counts.pass + r.counts.warn + r.counts.fail;
    assert.strictEqual(sum, r.counts.total);
  });

  await test('certify() verdict is FAILED when more than 3 gates fail', async () => {
    const r = await cert.certify();
    if (r.counts.fail > 3) {
      assert.strictEqual(r.verdict, 'FAILED');
    } else {
      assert.notStrictEqual(r.verdict, 'FAILED');
    }
  });

  // â”€â”€ spot-check specific gates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await test('SEVEN_LAYER_SCOPED_RECALL: spec lists all 7 layers', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'SEVEN_LAYER_SCOPED_RECALL');
    assert.ok(g);
    assert.ok(['pass', 'warn', 'fail'].includes(g.status));
    // The spec we shipped DOES list all 7 â€” this is a build-time check.
    // Resolve from the repo root, not cwd — this test must pass regardless of
    // where the runner is invoked from.
    const spec = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'PURPCLAW_EPHEMERAL_RUNTIME_SPEC.md'), 'utf8');
    for (const layer of ['Episodic', 'Semantic', 'Procedural', 'Symbolic', 'Temporal', 'Counterfactual', 'Affective']) {
      assert.ok(spec.includes(layer), `${layer} missing from spec`);
    }
  });

  await test('LAZY_WORKER_START: trivial chat does not wake heavy pillars', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'LAZY_WORKER_START');
    assert.strictEqual(g.status, 'pass', 'LAZY_WORKER_START must pass â€” supervisor is correctly configured');
  });

  await test('NINE_PILLAR_SELECTIVE_ACTIVATION: plan has both spawn + dormant lists, no overlap', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'NINE_PILLAR_SELECTIVE_ACTIVATION');
    assert.strictEqual(g.status, 'pass');
    assert.strictEqual(g.evidence.overlap.length, 0);
  });

  await test('MCP_FALLBACK_ONLY: manifest declares MCP as fallback', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'MCP_FALLBACK_ONLY');
    assert.strictEqual(g.status, 'pass');
  });

  await test('NATIVE_PRIORITY: router exists + manifest has priority law', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'NATIVE_PRIORITY');
    assert.strictEqual(g.status, 'pass');
  });

  await test('VERIFICATION_INTEGRITY: contract mandates observable postconditions', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'VERIFICATION_INTEGRITY');
    assert.strictEqual(g.status, 'pass');
  });

  await test('PROVIDER_INDEPENDENCE: parliament has cross-family + soul-rpg decoupled', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'PROVIDER_INDEPENDENCE');
    assert.strictEqual(g.status, 'pass');
  });

  await test('CHECKPOINT_RESUME: forge loop or checkpoint-manager exists', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'CHECKPOINT_RESUME');
    assert.strictEqual(g.status, 'pass');
  });

  // â”€â”€ format() output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await test('format() renders the verdict + per-gate status', () => {
    const fakeResult = {
      verdict: 'CERTIFIED',
      counts: { pass: 17, warn: 0, fail: 0, total: 17 },
      gates: [{
        name: 'TEST_GATE',
        description: 'a test gate',
        status: 'pass',
        evidence: { x: 1, y: 'two' },
      }],
      baseline: { rssMb: 42, cpuCount: 8, platform: 'linux', nodeVersion: 'v20' },
      measuredAt: '2026-08-16T00:00:00.000Z',
    };
    const out = cert.format(fakeResult);
    assert.match(out, /TEST_GATE/);
    assert.match(out, /CERTIFIED/);
    assert.match(out, /17 pass/);
  });

  // â”€â”€ live measurement: NO_PROCESS_LEAKS runs the supervisor 5x â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await test('NO_PROCESS_LEAKS: 5 supervisor runs do not leak this process', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'NO_PROCESS_LEAKS');
    assert.ok(g);
    assert.ok(g.evidence);
    assert.strictEqual(typeof g.evidence.delta, 'number');
    // Delta should be small (the supervisor itself is the test process)
    assert.ok(g.evidence.delta <= 3, `unexpected process growth: ${g.evidence.delta}`);
  });

  // â”€â”€ design law: idle system returns to minimal footprint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await test('IDLE_RAM_BASELINE: RSS at most 200MB (the budget from spec)', async () => {
    const r = await cert.certify();
    const g = r.gates.find(x => x.name === 'IDLE_RAM_BASELINE');
    assert.ok(['pass', 'warn'].includes(g.status), 'idle RSS should not exceed budget');
  });

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
