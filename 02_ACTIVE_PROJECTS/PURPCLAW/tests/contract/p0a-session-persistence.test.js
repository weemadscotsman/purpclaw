'use strict';
/**
 * P0-A — runtime boot and session persistence.
 *
 *   node tests/contract/p0a-session-persistence.test.js
 *
 * Acceptance, per the gauntlet definition:
 *   create -> persist -> kill -> restart -> resume -> branch
 * plus a forced DB-init failure that must be fatal or explicitly degraded,
 * never silent.
 *
 * "kill -> restart" is a real child process, not a module cache reset. A
 * session that survives `delete require.cache` proves nothing about surviving
 * a crash; only a second process reading the same file does.
 *
 * Runs against a scratch database via PURPCLAW_SESSION_DB so it never touches
 * the operator's real .purpclaw/state.db.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'var', 'tmp', 'p0a-' + process.pid);
fs.mkdirSync(SCRATCH, { recursive: true });
const DB = path.join(SCRATCH, 'state.db');

function child(script) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PURPCLAW_SESSION_DB: DB },
  }).trim();
}

const REPO = `require(${JSON.stringify(path.join(ROOT, 'lib', 'session-repository.js'))})`;
let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
};

console.log('P0-A session persistence\n');

// 1 — create and persist, in process A.
const created = child(`
  const S = ${REPO};
  const s = S.createSession('p0a acceptance', 'minimax', 'test-model');
  S.saveSession(s.id, [
    { role: 'user', content: 'first message' },
    { role: 'assistant', content: 'first reply' },
  ]);
  process.stdout.write(s.id);
`);
check('create + persist returns a session id', () => {
  assert.ok(/^session-\d+-[a-z0-9]+$/.test(created), `unexpected id: ${created}`);
});
check('database file exists on disk after write', () => {
  assert.ok(fs.existsSync(DB), `no db at ${DB}`);
});

// 2 — kill and restart: a *separate* process must see the same data.
const reloaded = JSON.parse(child(`
  const S = ${REPO};
  const s = S.loadSession(${JSON.stringify(created)});
  process.stdout.write(JSON.stringify({
    found: !!s, count: s && s.messages.length,
    first: s && s.messages[0] && s.messages[0].content,
    title: s && s.title, provider: s && s.provider,
  }));
`));
check('survives process restart', () => assert.strictEqual(reloaded.found, true));
check('all messages survive', () => assert.strictEqual(reloaded.count, 2));
check('message content survives', () => assert.strictEqual(reloaded.first, 'first message'));
// An explicit title must survive; the first-user-message fallback only applies
// when the title is still a placeholder ('New Chat' / 'Untitled').
check('explicit title is preserved, not overwritten by message text',
  () => assert.strictEqual(reloaded.title, 'p0a acceptance'));
check('provider survives', () => assert.strictEqual(reloaded.provider, 'minimax'));

// 3 — resume: append in a third process, verify in a fourth.
const resumed = JSON.parse(child(`
  const S = ${REPO};
  const s = S.loadSession(${JSON.stringify(created)});
  S.saveSession(s.id, [...s.messages, { role: 'user', content: 'resumed message' }]);
  const back = S.loadSession(s.id);
  process.stdout.write(JSON.stringify({ count: back.messages.length, last: back.messages[2].content }));
`));
check('resume appends and persists', () => assert.strictEqual(resumed.count, 3));
check('resumed content correct', () => assert.strictEqual(resumed.last, 'resumed message'));

// 4 — branch.
const branched = JSON.parse(child(`
  const S = ${REPO};
  const b = S.branchSession(${JSON.stringify(created)});
  const loaded = S.loadSession(b.id);
  process.stdout.write(JSON.stringify({
    id: b.id, parentId: loaded.parentId, count: loaded.messages.length,
    distinct: b.id !== ${JSON.stringify(created)},
  }));
`));
check('branch creates a distinct session', () => assert.strictEqual(branched.distinct, true));
check('branch records its parent', () => assert.strictEqual(branched.parentId, created));
check('branch carries history forward', () => assert.ok(branched.count >= 3, `got ${branched.count}`));

// 5 — forced DB-init failure must be loud, never silent.
// Point the DB at a path that cannot be opened: an existing *directory*.
const blocked = path.join(SCRATCH, 'not-a-db');
fs.mkdirSync(blocked, { recursive: true });
check('DB-init failure is fatal or explicitly degraded, never silent', () => {
  let out = '';
  let threw = false;
  try {
    out = execFileSync(process.execPath, ['-e', `${REPO}; process.stdout.write('LOADED_SILENTLY')`], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PURPCLAW_SESSION_DB: blocked },
    });
  } catch (e) {
    threw = true;
    out = String(e.stderr || e.stdout || e.message);
  }
  assert.ok(threw, 'module loaded without error against an unopenable database — silent failure');
  assert.ok(!out.includes('LOADED_SILENTLY'), 'module reported success against an unopenable database');
  assert.ok(/sqlite|database|SQLITE|unable to open/i.test(out),
    `failure surfaced but does not name the database as the cause:\n${out.slice(0, 300)}`);
});

// 6 — a bad session id must fail clearly, not with an opaque driver error.
check('non-string session id fails clearly', () => {
  let msg = '';
  try {
    execFileSync(process.execPath, ['-e', `${REPO}.loadSession({ id: 'oops' })`], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PURPCLAW_SESSION_DB: DB },
    });
  } catch (e) { msg = String(e.stderr || e.message); }
  assert.ok(msg, 'passing an object as a session id silently succeeded');
  assert.ok(!/ERR_INVALID_STATE/.test(msg),
    'surfaces the raw node:sqlite ERR_INVALID_STATE instead of naming the bad argument');
  assert.ok(/session id must be a string/.test(msg),
    `error does not name the problem:\n${msg.slice(0, 200)}`);
});

// 7 — the placeholder-title fallback still works when no title was given.
const fallback = JSON.parse(child(`
  const S = ${REPO};
  const s = S.createSession('New Chat', 'minimax', 'test-model');
  S.saveSession(s.id, [{ role: 'user', content: 'derive the title from me' }]);
  process.stdout.write(JSON.stringify({ title: S.loadSession(s.id).title }));
`));
check('placeholder title falls back to first user message',
  () => assert.strictEqual(fallback.title, 'derive the title from me'));

// cleanup
try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { /* windows lock */ }

console.log(`\n${failures ? `P0-A FAILED (${failures})` : 'P0-A PASSED'}`);
process.exit(failures ? 1 : 0);
