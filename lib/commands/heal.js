'use strict';

/**
 * purpclaw heal — guided stack recovery
 * ══════════════════════════════════════
 * After a crash, reboot, or "I have no idea what state this is in" moment,
 * this walks the operator through the safe recovery ritual.
 *
 * Steps:
 *   1. Check PM2 daemon — is it alive?
 *   2. Read PM2 state and identify which services are down
 *   3. Run doctor to detect orphans + crash loops
 *   4. Show the safe-start command needed to recover
 *   5. (Optional, with --execute) actually run safe-start --core
 *
 * Crucially: heal NEVER multi-spawns. It only ever calls `pm2 jlist` (read)
 * and shows commands. With --execute it delegates to safe-start, which has
 * its own circuit breaker + stabilisation watch.
 *
 * Usage:
 *   purpclaw heal              — diagnose, print recovery plan, don't execute
 *   purpclaw heal --execute    — run the recovery plan (delegates to safe-start)
 */

const { spawnSync } = require('child_process');
const path = require('path');

function pm2Cmd() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function jlist(PURP_DIR) {
  try {
    const r = spawnSync(pm2Cmd(), ['pm2', 'jlist'], {
      cwd: PURP_DIR, windowsHide: true, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

const CORE_NAMES = [
  'purpclaw-eventbus', 'purpclaw-state', 'purpclaw-api', 'purpclaw-orchestrator',
  'purpclaw-tower', 'purpclaw-pool', 'purpclaw-context', 'purpclaw-workers',
  'purpclaw-gatekeeper', 'purpclaw-metrics', 'purpclaw-memory', 'purpclaw-modal',
  'purpclaw-bridge-ns', 'purpclaw-rules', 'purpclaw-diagnostics', 'purpclaw-nextjs',
];

async function run(args, ctx) {
  const { C, col, PURP_DIR, sectionHead, banner } = ctx;
  const execute = args.includes('--execute') || args.includes('-x');

  banner();
  sectionHead('  🩹  STACK RECOVERY (HEAL)');

  // ── Step 1: PM2 daemon liveness ────────────────────────────────────────────
  console.log(`\n  ${col(C.cyan, 'Step 1')}  PM2 daemon check`);
  const state = jlist(PURP_DIR);
  if (!state) {
    console.log(`  ${col(C.red, '✗')}  PM2 daemon is not responding.`);
    console.log(col(C.gray, '     Try:  ') + col(C.cyan, 'npx pm2 ping') + col(C.gray, '   or  ') + col(C.cyan, 'npx pm2 resurrect'));
    console.log(col(C.gray, '     If that fails, the daemon may need to be restarted manually.\n'));
    process.exit(2);
  }
  console.log(`  ${col(C.green, '✓')}  PM2 daemon alive (${state.length} services in registry)`);

  // ── Step 2: Identify gaps ──────────────────────────────────────────────────
  console.log(`\n  ${col(C.cyan, 'Step 2')}  Core-service inventory`);
  const missing = [];      // core services not in pm2 list at all
  const stopped = [];      // in pm2 but stopped/errored
  const restartLoops = []; // online but with high restart count
  const online   = [];

  for (const name of CORE_NAMES) {
    const entry = state.find(p => p.name === name);
    if (!entry) {
      missing.push(name);
    } else {
      const status = entry.pm2_env?.status;
      const restarts = entry.pm2_env?.restart_time || 0;
      if (status === 'online') {
        if (restarts > 50) restartLoops.push({ name, restarts });
        else online.push(name);
      } else {
        stopped.push({ name, status });
      }
    }
  }

  console.log(`     ${col(C.green,  online.length     + ' online')}  ·  ${col(C.yellow, stopped.length + ' stopped')}  ·  ${col(C.red, missing.length + ' missing')}  ·  ${col(C.yellow, restartLoops.length + ' with restart history')}`);
  if (missing.length)      console.log(`     ${col(C.gray, 'missing:  ')} ${col(C.red,    missing.join(', '))}`);
  if (stopped.length)      console.log(`     ${col(C.gray, 'stopped:  ')} ${col(C.yellow, stopped.map(s => s.name).join(', '))}`);
  if (restartLoops.length) console.log(`     ${col(C.gray, 'restart history: ')} ${col(C.yellow, restartLoops.map(s => s.name + '(' + s.restarts + ')').join(', '))}`);

  // ── Step 3: Build the recovery plan ────────────────────────────────────────
  console.log(`\n  ${col(C.cyan, 'Step 3')}  Recovery plan`);
  const toStart = [...missing, ...stopped.map(s => s.name)].map(n => n.replace('purpclaw-', ''));
  const toReset = restartLoops.map(s => s.name);

  if (toStart.length === 0 && toReset.length === 0) {
    console.log(`  ${col(C.green, '✓')}  Nothing to recover. Core stack is healthy.`);
    console.log(col(C.gray, '     Verify end-to-end: ') + col(C.cyan, 'purpclaw smoke') + '\n');
    return;
  }

  if (toReset.length) {
    console.log(`     ${col(C.gray, '1. Reset crash-loop counters on services with restart history:')}`);
    console.log(`        ${col(C.cyan, 'npx pm2 reset ' + toReset.join(' '))}`);
  }
  if (toStart.length) {
    console.log(`     ${col(C.gray, (toReset.length ? '2.' : '1.') + ' Bring missing/stopped core services up safely:')}`);
    console.log(`        ${col(C.cyan, 'purpclaw safe-start ' + toStart.join(' '))}`);
    console.log(`     ${col(C.gray, (toReset.length ? '3.' : '2.') + ' Or, if many are down, just relaunch the full core:')}`);
    console.log(`        ${col(C.cyan, 'purpclaw safe-start --core')}`);
  }
  console.log(`     ${col(C.gray, 'Final: verify everything is talking to everything:')}`);
  console.log(`        ${col(C.cyan, 'purpclaw smoke')}`);

  // ── Step 4: Execute (if --execute) ─────────────────────────────────────────
  if (execute) {
    console.log(`\n  ${col(C.cyan, 'Step 4')}  ${col(C.yellow + C.bold, 'EXECUTING')} (--execute mode)\n`);

    // Delegate to safe-start, never raw pm2 — preserves the cascade guard
    const safeStart = require('./safe-start.js');
    const args = [];
    if (toStart.length > 0) {
      // Pass the explicit list; safe-start handles each one-at-a-time
      for (const n of toStart) args.push(n);
    }
    if (args.length === 0) {
      console.log(col(C.green, '  ✓ No services to start; recovery is just a smoke verification.\n'));
    } else {
      await safeStart.run(args, ctx);
    }
  } else {
    console.log(`\n  ${col(C.gray, 'Re-run with')} ${col(C.cyan, 'purpclaw heal --execute')} ${col(C.gray, 'to apply the plan above.')}\n`);
  }
}

module.exports = { run };
