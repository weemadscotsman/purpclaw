'use strict';
/**
 * A harness may not report a status its evidence does not support.
 *
 *   node tests/contract/harness-honest-status.test.js
 *
 * This is the difference between a coding agent you can trust and one that
 * prints a green tick. Both failure directions were live:
 *
 *   harness-claude        called pass() unconditionally — PASSED after reading
 *                         zero files ("analysis complete", having analysed
 *                         nothing).
 *   codex/hermes/minimax  never set a status, so they kept createResult's
 *                         'blocked' default and could never report success no
 *                         matter how much work they did.
 */

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const R = require(path.join(ROOT, 'packages', 'result-schema'));

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
};

const task = { taskId: 'honest-status-probe', goal: 'probe' };
const fresh = () => R.createResult(task, 'codex');

console.log('harness honest status\n');

check('a fresh result is blocked, not passed', () => {
  assert.strictEqual(fresh().status, 'blocked', 'default must assume nothing was proven');
});

check('no work at all cannot be passed', () => {
  const r = R.finalize(fresh());
  assert.strictEqual(r.status, 'blocked', `got ${r.status}`);
  assert.ok(/nothing was done|no files/i.test(r.summary), `summary does not say why: ${r.summary}`);
});

check('work with no verification is partial, never passed', () => {
  const r = fresh();
  R.addFileRead(r, 'lib/paths.js');
  R.addFileChanged(r, 'lib/paths.js');
  R.finalize(r);
  assert.strictEqual(r.status, 'partial', `unverified work reported as ${r.status}`);
  assert.ok(/unproven/i.test(r.summary), `summary does not flag it unproven: ${r.summary}`);
});

check('a failed verification downgrades to partial', () => {
  const r = fresh();
  R.addFileChanged(r, 'lib/paths.js');
  R.addVerification(r, { criterion: 'build', passed: true, evidence: 'ok' });
  R.addVerification(r, { criterion: 'test', passed: false, evidence: 'boom' });
  R.finalize(r);
  assert.strictEqual(r.status, 'partial', `got ${r.status}`);
});

check('work plus passing verification is passed', () => {
  const r = fresh();
  R.addFileChanged(r, 'lib/paths.js');
  R.addCommand(r, 'npm test');
  R.addVerification(r, { criterion: 'test', passed: true, evidence: 'ok' });
  R.finalize(r);
  assert.strictEqual(r.status, 'passed', `got ${r.status}: ${r.summary}`);
});

check('skipped verification does not count as proof', () => {
  const r = fresh();
  R.addFileChanged(r, 'lib/paths.js');
  R.addVerification(r, { criterion: 'build', passed: null, evidence: 'skipped' });
  R.finalize(r);
  assert.strictEqual(r.status, 'partial',
    `a skipped check was treated as proof (got ${r.status})`);
});

check('a fatal error fails regardless of work done', () => {
  const r = fresh();
  R.addFileChanged(r, 'lib/paths.js');
  R.addVerification(r, { criterion: 'test', passed: true, evidence: 'ok' });
  r.errors.push({ type: 'harness-error', message: 'exploded', fatal: true });
  R.finalize(r);
  assert.strictEqual(r.status, 'failed', `got ${r.status}`);
});

check('finalize does not overwrite a status the harness already decided', () => {
  const r = fresh();
  R.block(r, 'deliberate blocker', 'fix it');
  R.addFileChanged(r, 'lib/paths.js');
  R.addVerification(r, { criterion: 'test', passed: true, evidence: 'ok' });
  R.finalize(r);
  assert.strictEqual(r.status, 'blocked', 'finalize clobbered an explicit decision');
  assert.strictEqual(r.summary, 'deliberate blocker');
});

// Every harness must actually route through the deriving path.
const fs = require('fs');
for (const h of ['codex', 'hermes', 'minimax']) {
  check(`harness-${h} derives its status`, () => {
    const src = fs.readFileSync(path.join(ROOT, 'packages', `harness-${h}`, 'index.js'), 'utf8');
    assert.ok(/finalize\(result\)/.test(src),
      `harness-${h} never sets a status, so it returns 'blocked' forever`);
  });
}
check('harness-claude refuses to pass with no context', () => {
  const src = fs.readFileSync(path.join(ROOT, 'packages', 'harness-claude', 'index.js'), 'utf8');
  assert.ok(/items\.length === 0/.test(src),
    'harness-claude still calls pass() unconditionally');
});
check('harness-claude records what it read', () => {
  const src = fs.readFileSync(path.join(ROOT, 'packages', 'harness-claude', 'index.js'), 'utf8');
  assert.ok(/filesRead\.push/.test(src),
    'harness-claude reads files but never reports them, so it prints "Files read: 0"');
});

console.log(`\n${failures ? `HARNESS HONEST STATUS FAILED (${failures})` : 'HARNESS HONEST STATUS PASSED'}`);
process.exit(failures ? 1 : 0);
