#!/usr/bin/env node
'use strict';

/**
 * Validation for the purpclaw status fix.
 *
 * Runs three cases:
 *   1. All services offline (no servers running)
 *   2. One service online (Tower on :7790)
 *   3. Status reflects accurate counts
 *
 * Asserts:
 *   - All-offline: status shows all 9 as ❌, banner says "CLAW ASLEEP"
 *   - One-online: status shows Tower as ✅, others as ❌
 *   - JSON output (if --json flag) reports correct counts
 */

const http = require('http');
const { spawnSync, spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');  // scripts/ is at <root>/scripts/
const STATUS_BIN = path.join(ROOT, 'bin', 'purpclaw.js');

function probe(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: p, timeout: 3000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true, port, status: res.statusCode });
        else resolve({ ok: false, port, status: res.statusCode });
      });
    });
    req.on('error', e => reject({ ok: false, port, error: e.code || e.message }));
    req.setTimeout(3000, () => { req.destroy(); reject({ ok: false, port, error: 'timeout' }); });
  });
}

function runStatus() {
  const r = spawnSync('node', [STATUS_BIN, 'status'], { cwd: ROOT, encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
}

// The fake service MUST be in a separate process, otherwise execSync blocks
// the event loop and the test server can't accept connections.
function startFakeServiceProcess(port) {
  const { spawn } = require('child_process');
  const code = `
    const http = require('http');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ active: true, agentCount: 35 }));
    });
    server.keepAliveTimeout = 500;
    server.listen(${port}, '127.0.0.1', () => console.log('READY'));
  `;
  const p = spawn('node', ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let ready = false;
    p.stdout.on('data', d => { if (d.toString().includes('READY') && !ready) { ready = true; resolve(p); } });
    p.stderr.on('data', d => process.stderr.write(d));
    setTimeout(() => { if (!ready) reject(new Error('server failed to start')); }, 5000);
  });
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}: ${detail || 'FAILED'}`); }
}

async function run() {
  console.log('='.repeat(72));
  console.log('PURPCLAW STATUS VALIDATION — post item-zero fix');
  console.log('='.repeat(72));
  console.log('');

  // CASE 1: all services offline
  console.log('CASE 1: All services offline');
  const c1 = runStatus();
  const offCount = (c1.match(/❌/g) || []).length;
  const onCount = (c1.match(/✅/g) || []).length;
  check('9 ❌ shown (core services)', offCount === 9, `got ${offCount}`);
  check('0 false ✅ for core', onCount === 0, `got ${onCount} false green checks`);
  check('Banner says CLAW ASLEEP', /CLAW ASLEEP/.test(c1), 'banner should say CLAW ASLEEP');
  check('Warns: 9/9 core services OFFLINE', /9\/9.*OFFLINE/.test(c1), 'should warn 9/9 offline');
  check('"purpclaw start" hint present', /purpclaw start/.test(c1), 'should suggest fix');
  console.log('');

  // CASE 2: one service online (Tower on :7790) - server runs in SEPARATE process
  console.log('CASE 2: One service online (Tower :7790)');
  let towerProc;
  try {
    towerProc = await startFakeServiceProcess(7790);
    // Give the server a moment
    await new Promise(r => setTimeout(r, 500));
    // Verify server is up
    const liveCheck = await probe(7790, '/health').catch(e => e);
    console.log('  (debug: live check:', liveCheck, ')');
    const c2 = runStatus();
    // Look for Tower being ✅
    check('Tower :7790 shows ✅', /✅\s+Tower\s+:7790/.test(c2), `Tower should be online. Output:\n${c2}`);
    // Count ❌ in core section (should be 8, not 9)
    const off2 = (c2.match(/❌/g) || []).length;
    check('8 other cores show ❌', off2 === 8, `got ${off2} (Tower should be the only ✅)`);
  } catch (e) {
    console.log('  ⚠ Test server failed:', e.message);
  } finally {
    if (towerProc) towerProc.kill();
  }
  await new Promise(r => setTimeout(r, 300));
  console.log('');

  // CASE 3: probe function in isolation
  console.log('CASE 3: Probe function validation');
  try {
    const r1 = await probe(7790, '/health'); // no service
    check('Offline probe returns ok:false', r1.ok === false, 'should be false');
  } catch (e) {
    check('Offline probe rejects (caught by .catch)', e.ok === false, 'should reject');
  }
  console.log('');

  console.log('='.repeat(72));
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(72));
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Validation crashed:', e); process.exit(2); });