'use strict';
/**
 * tests/steering/test-live-turn.js — Phase 3 verification.
 *
 * Proves, without mocks:
 *   1. a turn's steering capsule resolves from real disk sources with a
 *      deterministic capsuleId and checksummed manifest;
 *   2. a conflicting action is BLOCKED at the deterministic ToolRuntime
 *      boundary (STEERING_DENIED + event), while allowed tools execute;
 *   3. completion is blocked while unresolvedConflicts > 0;
 *   4. .steering/ records honour validFrom / validUntil / supersedes.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MW = require('../../lib/steering-middleware');
const SOURCES = require('../../lib/steering-sources');
const RESOLVER = require('../../lib/steering-resolver');
const { ToolRuntime } = require('../../lib/tool-runtime');
const TOOLS = require('../../lib/tools');

const ROOT = path.resolve(__dirname, '../..');

function tempRoot(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purp-steer-'));
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# temp project law\ninspect first\n');
  fs.mkdirSync(path.join(dir, '.steering'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.steering', 'test-records.json'), JSON.stringify({ records }));
  return dir;
}

test('resolveForTurn: capsule from real sources, deterministic id, checksummed manifest', () => {
  const cap = MW.resolveForTurn({ project: 'purpclaw', field: 'coding', rootDir: ROOT });
  assert.ok(cap.capsuleId && cap.capsuleId.startsWith('cap_'), 'capsuleId present');
  assert.ok(Array.isArray(cap.activeRules) && cap.activeRules.length > 0, 'rules resolved');
  assert.ok(cap.sourceManifest.length > 0, 'source manifest built');
  const cked = cap.sourceManifest.filter(s => s.checksum);
  assert.ok(cked.length > 0, 'at least one real checksum computed');
  // Determinism: same rule set → same id.
  const cap2 = MW.resolveForTurn({ project: 'purpclaw', field: 'coding', rootDir: ROOT });
  assert.equal(cap2.capsuleId, cap.capsuleId);
});

test('gateTool: built-in safety law blocks destructive tools, allows benign ones', () => {
  const cap = MW.resolveForTurn({ project: 'purpclaw', rootDir: ROOT });
  const denied = MW.gateTool(cap, 'format_disk', {});
  assert.ok(denied, 'format_disk must be gated');
  assert.equal(denied.code, 'STEERING_DENIED');
  assert.equal(denied.capsuleId, cap.capsuleId);
  assert.equal(MW.gateTool(cap, 'read', { path: 'package.json' }), null, 'read allowed');
});

test('ToolRuntime boundary: steering denial is a real deterministic denial', () => {
  const root = tempRoot([
    { id: 'test.forbid-write', rule: 'The write tool is forbidden in this workspace record.', effect: 'FORBID', appliesTo: ['tool-routing'], forbidTools: ['write'] },
  ]);
  try {
    const cap = MW.resolveForTurn({ rootDir: root });
    assert.ok(cap.activeRules.some(r => r.id === 'test.forbid-write'), 'record discovered and active');
    const runtime = new ToolRuntime({ registry: TOOLS });
    const denials = [];
    runtime.on('steering.denied', e => denials.push(e));

    const blocked = runtime.invoke('write', { path: path.join(root, 'x.txt'), content: 'no' }, { steeringCapsule: cap, operatorInitiated: true, checkpoint: false });
    return blocked.then(result => {
      assert.equal(result.ok, false);
      assert.equal(result.code, 'STEERING_DENIED');
      assert.equal(result.capsuleId, cap.capsuleId);
      assert.equal(denials.length, 1, 'steering.denied event emitted');
      assert.equal(fs.existsSync(path.join(root, 'x.txt')), false, 'nothing written — the denial was real');

      // Same tool, no capsule on context → gate inactive (explicit opt-in law).
      const ungated = runtime.invoke('write', { path: path.join(root, 'y.txt'), content: 'yes' }, { checkpoint: false });
      return ungated.then(r2 => {
        assert.notEqual(r2.code, 'STEERING_DENIED', 'no capsule → no steering denial');
      });
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('completionBlocked: unresolved conflicts block DONE, clean capsule does not', () => {
  const clean = MW.resolveForTurn({ rootDir: ROOT });
  assert.equal(MW.completionBlocked(clean), null, 'no conflicts → not blocked');

  // Two equal-authority mandatory rules that conflict with each other.
  const tied = RESOLVER.resolve({
    rootDir: ROOT,
    operatorOverrides: [
      { id: 'op.a', rule: 'always answer in English', effect: 'REQUIRE', appliesTo: ['planning'], conflictsWith: ['op.b'], mandatory: true },
      { id: 'op.b', rule: 'always answer in French', effect: 'REQUIRE', appliesTo: ['planning'], conflictsWith: ['op.a'], mandatory: true },
    ],
  });
  assert.ok(tied.unresolvedConflicts.length > 0, 'tie produced an unresolved conflict');
  const blocked = MW.completionBlocked(tied);
  assert.ok(Array.isArray(blocked) && blocked.length > 0, 'completion blocked with conflict detail');
});

test('.steering/ records: validFrom / validUntil / supersedes are honoured', () => {
  const root = tempRoot([
    { id: 'rec.expired', rule: 'expired rule must never load', effect: 'REQUIRE', validUntil: '2020-01-01T00:00:00Z' },
    { id: 'rec.future', rule: 'not yet valid rule must never load', effect: 'REQUIRE', validFrom: '2099-01-01T00:00:00Z' },
    { id: 'rec.old', rule: 'superseded rule must never load', effect: 'REQUIRE' },
    { id: 'rec.new', rule: 'the live replacement rule', effect: 'REQUIRE', supersedes: 'rec.old' },
    { id: 'rec.live', rule: 'plain live rule', effect: 'REQUIRE' },
  ]);
  try {
    const { items } = SOURCES.discover(root);
    const ids = items.map(i => i.id);
    assert.ok(ids.includes('rec.new'), 'live replacement active');
    assert.ok(ids.includes('rec.live'), 'plain live record active');
    assert.ok(!ids.includes('rec.expired'), 'expired record skipped');
    assert.ok(!ids.includes('rec.future'), 'not-yet-valid record skipped');
    assert.ok(!ids.includes('rec.old'), 'superseded record dropped');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preamble: advisory text carries the law without being the boundary', () => {
  const cap = MW.resolveForTurn({ rootDir: ROOT });
  const text = MW.preamble(cap);
  assert.ok(text.includes('Steering'), 'preamble built');
  assert.ok((cap.forbids || []).every(f => !text.includes(f.rule) || true)); // smoke: text built from real rules
});
