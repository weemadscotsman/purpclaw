/**
 * tests/cowork-overlay.smoke.js
 * Smoke tests for cowork-overlay.js
 * Run: node tests/cowork-overlay.smoke.js
 * NOTE: Start the overlay first with: node lib/cowork-overlay.js start
 */

'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 7791;
const ROOT = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW';
const STATE_FILE = path.join(ROOT, '.purpclaw', '.cowork_state.json');
const OVERLAY_SCRIPT = path.join(ROOT, 'lib', 'cowork-overlay.js');

function test(name, fn) {
  return fn().then(() => console.log('  PASS', name))
    .catch(e => console.log('  FAIL', name, '—', e.message));
}

function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: pathname }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(5000);
  });
}

function httpPost(pathname, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(5000);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('\n=== cowork-overlay smoke tests ===\n');

  // ── Test 1: State file persists ──────────────────────────────────────────
  await test('state persists activeAgent to disk', async () => {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      activeAgent: 'test-agent', currentTask: 'smoke', mode: 'watching',
      uptime: Date.now(), proactiveAlerts: [], recentDecisions: [],
    }));
    const s = await httpGet('/state');
    if (s.status !== 200) throw new Error('server unreachable');
    const body = JSON.parse(s.body);
    if (body.activeAgent !== 'test-agent') throw new Error('got ' + body.activeAgent);
  });

  // ── Test 2: Server responds ──────────────────────────────────────────────
  await test('server responds on port 7791', async () => {
    const s = await httpGet('/state');
    if (s.status !== 200) throw new Error('expected 200, got ' + s.status);
  });

  // ── Test 3: /state has required fields ───────────────────────────────────
  await test('/state returns required fields', async () => {
    const s = await httpGet('/state');
    const body = JSON.parse(s.body);
    for (const f of ['activeAgent', 'mode', 'uptime', 'proactiveAlerts']) {
      if (!(f in body)) throw new Error('missing: ' + f);
    }
  });

  // ── Test 4: /push adds alert ───────────────────────────────────────────
  await test('/push adds alert to proactiveAlerts', async () => {
    const before = JSON.parse((await httpGet('/state')).body);
    await httpPost('/push', { msg: 'smoke test alert', type: 'info' });
    const after = JSON.parse((await httpGet('/state')).body);
    if (after.proactiveAlerts.length <= before.proactiveAlerts.length) {
      throw new Error('alert not added');
    }
  });

  // ── Test 5: /push truncates long messages ────────────────────────────
  await test('/push caps messages at 200 chars', async () => {
    await httpPost('/push', { msg: 'B'.repeat(300), type: 'info' });
    const body = JSON.parse((await httpGet('/state')).body);
    const last = body.proactiveAlerts[0];
    if (last.msg.length > 200) throw new Error('expected <=200, got ' + last.msg.length);
  });

  // ── Test 5b: /track sets agent+task ───────────────────────────────────
  await test('/track sets activeAgent and currentTask', async () => {
    await httpPost('/track', { agent: 'test-agent', task: 'smoke test', type: 'start' });
    const body = JSON.parse((await httpGet('/state')).body);
    if (body.activeAgent !== 'test-agent') throw new Error('agent mismatch: ' + body.activeAgent);
    if (body.currentTask !== 'smoke test') throw new Error('task mismatch: ' + body.currentTask);
  });

  // ── Test 5c: /track stop clears ────────────────────────────────────────
  await test('/track stop clears agent and task', async () => {
    await httpPost('/track', { type: 'stop' });
    const body = JSON.parse((await httpGet('/state')).body);
    if (body.activeAgent !== 'idle') throw new Error('expected idle, got: ' + body.activeAgent);
    if (body.currentTask !== '') throw new Error('expected empty, got: ' + body.currentTask);
  });

  // ── Test 6: /close terminates ─────────────────────────────────────
  await test('/close stops server', async () => {
    await httpPost('/close', {});
    await new Promise(r => setTimeout(r, 2000));
    let ok = false;
    try { await httpGet('/state'); ok = true; } catch {}
    if (ok) throw new Error('server still running');
  });

  // ── Test 7: status CLI ───────────────────────────────────────────────────
  await test('status CLI outputs JSON', async () => {
    const out = await new Promise(resolve => {
      const p = spawn(process.execPath, [OVERLAY_SCRIPT, 'status'], { cwd: ROOT });
      let d = '';
      p.stdout.on('data', c => d += c);
      p.on('close', () => resolve(d));
    });
    const j = JSON.parse(out);
    if (!j.activeAgent !== undefined && typeof j.mode !== 'string') {
      throw new Error('expected JSON with activeAgent/mode');
    }
  });

  // ── Test 8: watch CLI captures screen ───────────────────────────────────
  await test('watch CLI captures without crash', async () => {
    const out = await new Promise(resolve => {
      const p = spawn(process.execPath, [OVERLAY_SCRIPT, 'watch'], { cwd: ROOT });
      let d = '';
      p.stdout.on('data', c => d += c);
      p.stderr.on('data', c => d += c);
      setTimeout(() => { try { p.kill(); } catch {} resolve(d); }, 10000);
    });
    if (/Error|Exception/.test(out)) throw new Error(out.substring(0, 120));
  });

  console.log('\n=== done ===\n');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
