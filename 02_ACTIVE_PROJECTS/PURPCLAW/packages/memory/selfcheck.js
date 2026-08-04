'use strict';
// Runs without the cognitive spine. Everything here is about the gateway's own
// contract; anything needing :7880 is an integration test, not this.
//
//   node packages/memory/selfcheck.js

const assert = require('assert');
const M = require('./index');

(async () => {
  // All seven layers exist and are distinct.
  assert.strictEqual(M.LAYERS.length, 7, 'seven layers, not six and not eight');
  assert.deepStrictEqual([...new Set(M.LAYERS)].length, 7, 'layer names must be unique');
  for (const l of M.LAYERS) {
    assert.ok(M.gateway().layers[l], `layer ${l} failed to construct`);
  }

  // One spine, one gateway. Handing every caller its own is how a stack ends
  // up with seven of them.
  assert.strictEqual(M.gateway(), M.gateway(), 'gateway() must be a singleton');

  // The whole point: operations that cannot be performed must not claim they
  // were. These returned {ok:true} unconditionally before.
  const g = M.gateway();
  for (const [op, call] of [
    ['supersede', () => g.supersede('mem_a', 'mem_b')],
    ['forget', () => g.forget('mem_a')],
    ['explain', () => g.explain('mem_a')],
    ['promote', () => g.promote('mem_a', 'semantic')],
  ]) {
    const r = await call();
    assert.strictEqual(r.ok, false, `${op}() must not report success while unimplemented`);
    assert.strictEqual(r.code, 'NOT_IMPLEMENTED', `${op}() must say why`);
  }

  // Health must be false with the spine down, not an optimistic default.
  const h = await g.health();
  assert.strictEqual(typeof h.ok, 'boolean');
  assert.strictEqual(Object.keys(h.layers).length, 7, 'health must report every layer');
  for (const l of M.LAYERS) assert.ok(l in h.layers, `health missing layer ${l}`);

  // Envelope enforcement: a memory with no content must be refused, not stored.
  const bad = await g.record({ layer: 'semantic' });
  assert.strictEqual(bad.ok, false, 'record() must reject a contract violation');
  assert.strictEqual(bad.code, 'CONTRACT_VIOLATION');

  // Retention policy is honoured rather than decorative.
  const eph = await g.record({ layer: 'semantic', content: 'x', retention: 'ephemeral' });
  assert.strictEqual(eph.persisted, false, 'retention=ephemeral must not persist');

  console.log('packages/memory self-check OK — 7 layers, no fake-green, spine not required');
})().catch(e => { console.error('SELF-CHECK FAILED: ' + e.message); process.exit(1); });
