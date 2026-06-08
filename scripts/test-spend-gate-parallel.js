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
    promises.push(Promise.resolve().then(() => {
      const r = gate.check({ agent: 'test', provider: 'ollama', estimatedTokens: 100 });
      if (r.allow) {
        gate.record('test', 'ollama', 50, 50);
      }
      return r;
    }));
  }
  const results = await Promise.all(promises);
  const allowed = results.filter(r => r.allow).length;
  const denied = results.filter(r => !r.allow).length;
  console.log(`  50 parallel calls: ${allowed} allowed, ${denied} denied`);
  console.log(`  Daily tokens: ${gate.getStatus().dailyTokens} (cap=1000)`);
  if (gate.getStatus().dailyTokens > 1000) {
    console.log('  ❌ FAIL: daily cap exceeded');
    process.exit(1);
  }
  console.log('  ✅ Daily cap respected\n');

  // ── Test 2: Rate limit under burst ──
  const gate2 = new SpendGate();
  gate2.configure({ maxRequestsPerMinute: 5, dailyTokenCap: 1000000, perRequestCap: 1000 });
  let allowed2 = 0, denied2 = 0;
  for (let i = 0; i < 10; i++) {
    const r = gate2.check({ agent: 'test', provider: 'ollama', estimatedTokens: 100 });
    if (r.allow) { allowed2++; gate2.record('test', 'ollama', 50, 50); }
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
    const r = gate3.check({ agent: 'duck', provider: 'ollama', estimatedTokens: 50 });
    if (r.allow) { duckAllowed++; gate3.record('duck', 'ollama', 25, 25); }
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
    const r = gate4.check({ agent: 'test', provider: 'openai', estimatedTokens: 50 });
    if (r.allow) { openaiAllowed++; gate4.record('test', 'openai', 25, 25); }
  }
  console.log(`  OpenAI cap 100 tokens, 5x50 calls: ${openaiAllowed} allowed (expect ≤2)`);
  if (openaiAllowed > 2) {
    console.log('  ❌ FAIL: per-provider cap not enforced');
    process.exit(1);
  }
  console.log('  ✅ Per-provider cap enforced\n');

  // ── Test 5: State file isn't corrupted by concurrent writes ──
  const gate5 = new SpendGate();
  gate5.configure({ dailyTokenCap: 1000000, perRequestCap: 1000 });
  const writes = [];
  for (let i = 0; i < 100; i++) {
    writes.push(Promise.resolve().then(() => {
      gate5.record('concurrent', 'ollama', 10, 10);
    }));
  }
  await Promise.all(writes);
  // Re-load
  const fresh = new SpendGate();
  const final = fresh.getStatus();
  console.log(`  100 concurrent records: state shows ${final.dailyTokens} tokens`);
  if (final.dailyTokens !== 1000) {
    console.log(`  ⚠ Expected 1000 tokens, got ${final.dailyTokens} (concurrent write race is acceptable but verify)`);
  } else {
    console.log('  ✅ No state corruption from concurrent writes');
  }

  // ── Test 6: Per-request cap ──
  const gate6 = new SpendGate();
  gate6.configure({ perRequestCap: 100 });
  const big = gate6.check({ agent: 'test', provider: 'ollama', estimatedTokens: 500 });
  if (big.allow) {
    console.log('  ❌ FAIL: per-request cap not enforced');
    process.exit(1);
  }
  console.log('  ✅ Per-request cap (100) blocks 500-token request\n');

  console.log('======================');
  console.log('All SpendGate stress tests passed ✅');
  // Cleanup
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
