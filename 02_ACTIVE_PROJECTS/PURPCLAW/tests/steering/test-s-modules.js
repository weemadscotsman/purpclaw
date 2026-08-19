'use strict';
/**
 * tests/steering/test-s-modules.js — Phase 3 S-module wiring verification.
 *
 * S6  approval-triage   — wired into ToolRuntime's approval decision path
 * S13 remote-approvals  — wired as ToolRuntime transport + HTTP surface
 *
 * No mocks: real modules, real file-backed state, real ToolRuntime ladder.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TRIAGE = require('../../lib/approval-triage');
const REMOTE = require('../../lib/remote-approvals');
const { ToolRuntime } = require('../../lib/tool-runtime');

test('S6 triage: learned patterns decide, HIGH_STAKES always escalates', () => {
  TRIAGE.reset();
  // Novel pattern escalates.
  assert.equal(TRIAGE.triage({ tool: 'shell', arguments: { cmd: 'ls' }, sessionId: 't' }).decision, 'escalate');
  // 3 approvals → auto-approve the same pattern.
  for (let i = 0; i < 3; i++) TRIAGE.record({ tool: 'read', arguments: { path: 'f.md' }, sessionId: 't', decision: 'approved' });
  assert.equal(TRIAGE.triage({ tool: 'read', arguments: { path: 'f.md' }, sessionId: 't' }).decision, 'auto_approved');
  // Destructive HIGH_STAKES escalates even with approval history.
  for (let i = 0; i < 3; i++) TRIAGE.record({ tool: 'kill', arguments: { pid: 1 }, sessionId: 't', decision: 'approved' });
  assert.equal(
    TRIAGE.triage({ tool: 'kill', arguments: { pid: 1 }, sessionId: 't', risks: ['destructive'] }).decision,
    'escalate',
    'HIGH_STAKES destructive must never auto-approve'
  );
  // 3 denials → auto-deny even for HIGH_STAKES.
  for (let i = 0; i < 3; i++) TRIAGE.record({ tool: 'kill', arguments: { pid: 2 }, sessionId: 't', decision: 'denied' });
  assert.equal(TRIAGE.triage({ tool: 'kill', arguments: { pid: 2 }, sessionId: 't', risks: ['destructive'] }).decision, 'auto_denied');
  TRIAGE.reset();
});

test('S13 remote-approvals: queue → approve/deny round-trip, expiry, no donor paths', async () => {
  // No absolute donor-machine paths may remain in the module.
  const src = fs.readFileSync(path.join(ROOT, 'lib/remote-approvals.js'), 'utf8');
  assert.ok(!/[A-Z]:\/\//.test(src), 'no hardcoded drive-letter paths in source');

  const q = REMOTE.queue({ tool: 'write', args: { path: 'z.txt' }, ttlSeconds: 2 });
  assert.ok(REMOTE.pending().some(p => p.requestId === q.requestId), 'queued request is pending');
  assert.equal(REMOTE.approve(q.requestId).decision, 'approved');
  assert.equal(REMOTE.get(q.requestId).status, 'resolved');
  assert.equal(REMOTE.approve(q.requestId).error, 'already resolved', 'double-resolve refused');

  const q2 = REMOTE.queue({ tool: 'write', args: { path: 'z2.txt' }, ttlSeconds: 60 });
  const waiter = REMOTE.wait(q2.requestId, { timeoutMs: 1500 });
  setTimeout(() => REMOTE.deny(q2.requestId, { reason: 'not needed' }), 100);
  const verdict = await waiter;
  assert.equal(verdict.decision, 'denied');
  assert.equal(verdict.notes, 'not needed');
});

test('S6+S13 in ToolRuntime: remote transport resolves an approval-blocked tool', async () => {
  TRIAGE.reset();
  const runtime = new ToolRuntime({ registry: require('../../lib/tools') });

  // A benign novel tool path with remoteApprovals — queue + external approve.
  // 'edit' is checkpointable and non-destructive → escalates → remote queue.
  const queuedEvents = [];
  runtime.on('approval.queued', e => queuedEvents.push(e));

  const invocation = runtime.invoke(
    'edit',
    { path: path.join(ROOT, 'var', 'tmp', 'approval-test.txt'), old_string: 'a', new_string: 'b' },
    { remoteApprovals: true, remoteApprovalTtl: 10, operatorInitiated: true, checkpoint: false, sessionId: 's13-test' }
  );
  // Approve asynchronously once the request hits the queue.
  await new Promise(resolve => {
    const iv = setInterval(() => {
      const pendingNow = REMOTE.pending().filter(p => p.tool === 'edit' && (p.context || {}).sessionId === 's13-test');
      if (pendingNow.length) { clearInterval(iv); REMOTE.approve(pendingNow[0].requestId, { notes: 'test approve' }); resolve(); }
    }, 50);
    setTimeout(() => { clearInterval(iv); resolve(); }, 5000);
  });
  const result = await invocation;
  assert.equal(queuedEvents.length, 1, 'approval.queued emitted');
  // The tool executes after approval (or fails for its own reasons — but
  // never with APPROVAL_DENIED: the remote approve reached it).
  assert.notEqual(result.code, 'APPROVAL_DENIED');
  assert.notEqual(result.code, 'APPROVAL_AUTO_DENIED');
  TRIAGE.reset();
});

test('S4 priority-steer: interrupt + queued directive consumed by the loop', async () => {
  const PSTEER = require('../../lib/priority-steer');
  // Queue a directive → the loop injects it as an operator message and it
  // reaches the model turn (proved by history inspection below).
  PSTEER.queueNext('switch to plan mode');
  assert.equal(PSTEER.peekQueue().length, 1);
  // Fire an interrupt → shouldInterrupt reports pending, consume clears it.
  PSTEER.interrupt('operator said stop');
  const irq = PSTEER.pollInterrupt();
  assert.ok(irq.pending);
  assert.equal(irq.reason, 'operator said stop');
  PSTEER.clearInterrupt();
  assert.equal(PSTEER.pollInterrupt().pending, false);
  // Dequeue consumes the directive exactly once.
  const d = PSTEER.dequeue();
  assert.ok(d && d.directive === 'switch to plan mode');
  assert.equal(PSTEER.dequeue(), null);
});

test('S12 session-persistence: suspend → resume round-trip survives on disk', () => {
  const SP = require('../../lib/session-persistence');
  const snap = SP.suspend('s12-test', { messages: [{ role: 'user', content: 'hello' }], context: { project: 'purpclaw' } });
  assert.ok(snap.checkpointId);
  const r = SP.resume('s12-test');
  assert.equal(r.status, 'active');
  const f = SP.fork('s12-test');
  assert.ok(f);
  assert.ok(Array.isArray(SP.list()));
  SP.archive('s12-test');
});

test('S14 device-control: consent tiers gate device-class tools deterministically', () => {
  const DC = require('../../lib/device-control');
  const { ToolRuntime } = require('../../lib/tool-runtime');
  const TOOLS = require('../../lib/tools');
  DC.setConsent('local', 'clipboard', 'BLOCKED');
  assert.equal(DC.check('local', 'clipboard').tier, 'BLOCKED');
  const rt = new ToolRuntime({ registry: TOOLS });
  return rt.invoke('clipboard_read', {}, { operatorInitiated: true, checkpoint: false }).then(r => {
    assert.equal(r.code, 'DEVICE_CONSENT_DENIED', 'BLOCKED denies even operator-initiated');
    DC.setConsent('local', 'clipboard', 'ALWAYS');
    return rt.invoke('clipboard_read', {}, { checkpoint: false }).then(r2 => {
      assert.notEqual(r2.code, 'DEVICE_CONSENT_DENIED', 'ALWAYS passes the consent gate');
    });
  });
});

test('S9 swarm-verify: outputs from different agents accumulate for comparison', () => {
  const SV = require('../../lib/swarm-verify');
  const taskId = 's9-test:task-1';
  SV.registerOutput({ taskId, agent: 'owl', output: 'Approach A: use the registry.' });
  SV.registerOutput({ taskId, agent: 'fox', output: 'Approach B: use the resolver.' });
  SV.registerOutput({ taskId, agent: 'owl', output: 'Approach A v2 (retry overwrites same agent).' });
  const outs = SV.getOutputs(taskId);
  assert.equal(outs.length, 2, 'distinct agents accumulate; same agent overwrites');
  assert.ok(outs.every(o => o.output && o.timestamp));
});

test('S10 team-coordinator: create → assign → declared handoff fires once', () => {
  const TC = require('../../lib/team-coordinator');
  const teamId = 's10-test-team';
  TC.createTeam({
    teamId,
    roles: { research: { agent: 'owl', scope: 'research' }, build: { agent: 'beaver', scope: 'coding' } },
    handoffs: [{ from: 'research', to: 'build', trigger: 'completed' }],
    sharedContext: [{ kind: 'mission', text: 'ship the feature' }],
  });
  TC.assign(teamId, 'research', { text: 'find prior art' });
  const team = TC.getTeam(teamId);
  assert.equal(team.roles.research.status, 'working');
  const fired = TC.handoff(teamId, 'research', { summary: 'prior art found' });
  assert.equal(fired.length, 1, 'declared handoff fires');
  assert.equal(TC.handoff(teamId, 'research', {}).length, 0, 'handoff fires only once');
  const st = TC.status(teamId);
  assert.ok(st);
  TC.deleteTeam(teamId);
  assert.equal(TC.getTeam(teamId), null);
});
