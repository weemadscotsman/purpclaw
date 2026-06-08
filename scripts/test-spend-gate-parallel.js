'use strict';
/**
 * test-spend-gate-parallel.js — Stress test SpendGate
 * Launches 50 concurrent agent calls, verifies:
 *   - No double-spend on daily cap
 *   - Rate limit kicks in after 30 req/min
 *   - All concurrent calls get a clear ALLOW/DENY
 *   - State file isn't corrupted by concurrent writes
 */
const { SpendGate } = require('../lib/spend-gate');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), 'spend-stress-' + Date.now());
fs.rmSync(TEST_DIR, { recursive: true, force: true });
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.POCKET_DIR = TEST_DIR;

async function main() {
  console.log('🧪 SpendGate parallel test');
  console.log('===========================\n');

  // ── Test 1: Daily cap is respected under concurrency ──
  const gate = new SpendGate();
  gate.configure({ dailyTokenCap: 1000, maxRequestsPerMinute: 1000, perRequestCap: 1000 });

  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push((async () => {
      const r = await gate.check({ agent: 'test', provider: 'ollama', estimatedTokens: 100 });
      if (r.allow) {
        // Adjust by actual: here we record 100 total (matches the 100 estimated)
        await gate.record('test', 'ollama', 50, 50, null, { reserved: r.estimatedTokens });
      }
      return r;
    })());
  }
  const results = await Promise.all(promises);
  const allowed = results.filter(r => r.allow).length;
  const denied = results.filter(r => !r.allow).length;
  console.log(`  50 parallel calls: ${allowed} allowed, ${denied} denied`);
  const status1 = gate.getStatus();
  console.log(`  Daily tokens: ${status1.dailyTokens} (cap=1000)`);
  if (status1.dailyTokens > 1000) {
    console.log('  ❌ FAIL: daily cap exceeded');
    process.exit(1);
  }
  console.log('  ✅ Daily cap respected\n');

  // ── Test 2: Rate limit under burst ──
  const gate2 = new SpendGate();
  gate2.configure({ maxRequestsPerMinute: 5, dailyTokenCap: 1000000, perRequestCap: 1000 });
  let allowed2 = 0, denied2 = 0;
  for (let i = 0; i < 10; i++) {
    const r = await gate2.check({ agent: 'test', provider: 'ollama', estimatedTokens: 100 });
    if (r.allow) { allowed2++; await gate2.record('test', 'ollama', 50, 50, null, { reserved: r.estimatedTokens }); }
    else denied2++;
  }
  console.log(`  Rate limit 5/min, 10 burst calls (with record): ${allowed2} allowed, ${denied2} denied`);
  if (allowed2 > 5) {
    console.log('  ❌ FAIL: rate limit not enforced');
    process.exit(1);
  }
  console.log('  ✅ Rate limit enforced\n');

  // ── Test 3: Per-agent cap ──
  const gate3 = new SpendGate();
  gate3.configure({
    dailyTokenCap: 1000000,
    perRequestCap: 1000,
    perAgentCaps: { duck: { dailyTokens: 200, dailyRequests: 100 } },
  });
  let duckAllowed = 0, duckDenied = 0;
  for (let i = 0; i < 10; i++) {
    const r = await gate3.check({ agent: 'duck', provider: 'ollama', estimatedTokens: 50 });
    if (r.allow) { duckAllowed++; await gate3.record('duck', 'ollama', 25, 25, null, { reserved: r.estimatedTokens }); }
    else duckDenied++;
  }
  console.log(`  Duck cap 200 tokens, 10x50 calls: ${duckAllowed} allowed, ${duckDenied} denied`);
  if (duckAllowed > 4) {
    console.log('  ❌ FAIL: per-agent cap not enforced');
    process.exit(1);
  }
  console.log('  ✅ Per-agent cap enforced\n');

  // ── Test 4: Per-provider cap ──
  const gate4 = new SpendGate();
  gate4.configure({
    dailyTokenCap: 1000000,
    perRequestCap: 1000,
    providerCaps: { openai: { dailyTokens: 100 } },
  });
  let openaiAllowed = 0;
  for (let i = 0; i < 5; i++) {
    const r = await gate4.check({ agent: 'test', provider: 'openai', estimatedTokens: 50 });
    if (r.allow) { openaiAllowed++; await gate4.record('test', 'openai', 25, 25, null, { reserved: r.estimatedTokens }); }
  }
  console.log(`  OpenAI cap 100 tokens, 5x50 calls: ${openaiAllowed} allowed (expect ≤2)`);
  if (openaiAllowed > 2) {
    console.log('  ❌ FAIL: per-provider cap not enforced');
    process.exit(1);
  }
  console.log('  ✅ Per-provider cap enforced\n');

  // ── Test 5: Concurrent record totals exactly equal calls * per-call ──
  // Use a fresh dir to avoid state pollution from other tests
  const sg5Dir = path.join(os.tmpdir(), 'spend-stress-5-' + Date.now());
  fs.rmSync(sg5Dir, { recursive: true, force: true });
  fs.mkdirSync(sg5Dir, { recursive: true });
  process.env.POCKET_DIR = sg5Dir;
  const gate5 = new SpendGate();
  gate5.configure({ dailyTokenCap: 1000000, perRequestCap: 1000 });
  const writes = [];
  for (let i = 0; i < 100; i++) {
    writes.push(gate5.record('concurrent', 'ollama', 10, 10, null, { reserved: 0 }));
  }
  await Promise.all(writes);
  // Re-load with the same dir to confirm persisted state matches in-memory
  const fresh = new SpendGate();
  const final = fresh.getStatus();
  // 100 calls × (10 input + 10 output) = 2000 tokens total
  console.log(`  100 concurrent records: state shows ${final.dailyTokens} tokens (expected 2000)`);
  if (final.dailyTokens !== 2000) {
    console.log(`  ❌ FAIL: expected 2000, got ${final.dailyTokens}`);
    process.exit(1);
  }
  console.log('  ✅ Atomic record — no lost updates\n');

  // ── Test 6: Per-request cap ──
  const gate6 = new SpendGate();
  gate6.configure({ perRequestCap: 100 });
  const big = await gate6.check({ agent: 'test', provider: 'ollama', estimatedTokens: 500 });
  if (big.allow) {
    console.log('  ❌ FAIL: per-request cap not enforced');
    process.exit(1);
  }
  console.log('  ✅ Per-request cap (100) blocks 500-token request\n');

  // ── Test 7: Day rollover mid-stream ──
  const gate7 = new SpendGate();
  gate7.configure({ dailyTokenCap: 1000, perRequestCap: 1000 });
  const r7init = await gate7.check({ agent: 'day', provider: 'ollama', estimatedTokens: 100 });
  if (r7init.allow) await gate7.record('day', 'ollama', 100, 100, null, { reserved: r7init.estimatedTokens });
  console.log(`  Pre-rollover dailyTokens: ${gate7.getStatus().dailyTokens}`);
  // Force the state to look like yesterday
  gate7.state.day = '2020-01-01';
  // Now check should reset
  const r7 = await gate7.check({ agent: 'day', provider: 'ollama', estimatedTokens: 500 });
  if (!r7.allow) {
    console.log('  ❌ FAIL: day rollover did not reset');
    process.exit(1);
  }
  console.log('  ✅ Day rollover mid-stream resets counters\n');

  // ── Test 8: Reserve-and-refund pattern (estimated high, actual low) ──
  // Fresh dir to avoid state pollution
  const sg8Dir = path.join(os.tmpdir(), 'spend-stress-8-' + Date.now());
  fs.rmSync(sg8Dir, { recursive: true, force: true });
  fs.mkdirSync(sg8Dir, { recursive: true });
  process.env.POCKET_DIR = sg8Dir;
  const gate8 = new SpendGate();
  gate8.configure({ dailyTokenCap: 1000, perRequestCap: 1000 });
  const r8a = await gate8.check({ agent: 'refund', provider: 'ollama', estimatedTokens: 500 });
  if (!r8a.allow) throw new Error('FAIL: should allow 500');
  // Actual was only 100 — refund the 400 difference
  const r8b = await gate8.record('refund', 'ollama', 50, 50, null, { reserved: r8a.estimatedTokens });
  if (gate8.getStatus().dailyTokens !== 100) {
    console.log(`  ❌ FAIL: expected 100 after refund, got ${gate8.getStatus().dailyTokens}`);
    process.exit(1);
  }
  console.log('  ✅ Refund delta works (500 reserved, 100 actual, balance=100)\n');

  console.log('======================');
  console.log('All SpendGate stress tests passed ✅');
  // Cleanup
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
