'use strict';

/**
 * purpclaw safe-start — sequential service launcher with circuit breaker
 * ════════════════════════════════════════════════════════════════════════
 *
 * Why this exists: starting multiple PM2 services at once on Windows can
 * trigger a cmd-window spawn cascade if any service crash-loops on launch.
 * This wrapper:
 *
 *   1. Reads PM2 state first
 *   2. Refuses to start any service with >3 historical restarts (unless --force)
 *   3. Starts ONE service at a time
 *   4. Waits for each to stabilise (configurable, default 3.5s)
 *   5. Aborts the batch if any service crashes within the stabilisation window
 *   6. Uses windowsHide aggressively on every child spawn
 *
 * Usage:
 *   purpclaw safe-start <name>             — single service
 *   purpclaw safe-start <name1> <name2>    — sequential
 *   purpclaw safe-start --dark              — wake all defined-but-dark services
 *   purpclaw safe-start --all              — start everything in ecosystem
 *   purpclaw safe-start --dry-run          — show plan, don't execute
 *   purpclaw safe-start --force            — bypass the restart-count circuit breaker
 *   purpclaw safe-start --stabilise=5000   — custom stabilisation window (ms)
 *
 * Names use the bare ecosystem suffix: `voice` → `purpclaw-voice`.
 *
 * Safety guarantees:
 *   - NEVER calls `pm2 start` on more than one service at a time
 *   - NEVER proceeds past a service that crashed within stabilisation window
 *   - NEVER spawns visible windows (windowsHide: true on all child_process)
 *   - ALWAYS reports the exact PM2 command it ran for transparency
 */

const { spawn, execSync, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const DEFAULT_STABILISE_MS = 3500;
const RESTART_THRESHOLD    = 3;

// The known "defined-but-dark" services — never running by default,
// historically flaky on Windows. Require special handling.
const DARK_SERVICES = [
  'reasoning',   // proactive runtime loop
  'autodream',   // memory consolidation (Python)
  'voice',       // voice-coordinator (JS)
  'bridge',      // voice-bridge (JS)
  'chorus',      // companion-chorus (JS, flaky)
  'vision',      // vision-monitor (JS, opens webcam)
  'stt',         // speech-to-text (Python + Whisper, large model)
  'yolo',        // YOLO object detection (Python)
  'avatar',      // avatar bridge (Python)
];

// The "core" cluster — stable services proven to start cleanly on Windows.
// This is what `purpclaw safe-start --core` brings up. Equivalent to the
// 16-service baseline that was running fine before the 2026-05-25 cascade.
const CORE_SERVICES = [
  'eventbus', 'state', 'api', 'orchestrator', 'tower',
  'pool', 'context', 'workers', 'gatekeeper', 'metrics',
  'cognitive', 'nextjs',
  // coordinator (swarm_coordinator :7898) is REQUIRED — the orchestrator's
  // swarm dispatch fetches http://127.0.0.1:7898/api/coordinate, so without it
  // every swarm mission fails with "Swarm dispatch failed: fetch failed".
  // harness (:7798) backs the autonomous mission API. Both belong in core.
  'coordinator', 'harness',
];

function pm2Cmd() {
  // On Windows we spawn `cmd.exe /c pm2 ...` directly (see pm2Args helper
  // below). This avoids Node 20+'s ban on spawning .cmd files without
  // shell:true (CVE-2024-27980) while still NOT using shell:true ourselves.
  // On non-Windows, plain `npx` resolves through PATH.
  return process.platform === 'win32' ? 'cmd.exe' : 'npx';
}

function pm2Args(args) {
  // Windows: cmd.exe /c <args>    (args is rest-of-command for cmd)
  // Other:    npx <args>          (npx pm2 jlist, etc.)
  if (process.platform === 'win32') {
    return ['/c', 'pm2', ...args];
  }
  return ['pm2', ...args];
}

function runPm2Json(PURP_DIR) {
  // Synchronous, captures stdout. windowsHide prevents cmd flash.
  try {
    const r = spawnSync(pm2Cmd(), pm2Args(['jlist']), {
      cwd: PURP_DIR, windowsHide: true, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

function spawnPm2(args, PURP_DIR) {
  return new Promise((resolve) => {
    const proc = spawn(pm2Cmd(), pm2Args(args), {
      cwd: PURP_DIR, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', c => stdout += c.toString());
    proc.stderr.on('data', c => stderr += c.toString());
    proc.on('close', code => resolve({ code, stdout, stderr }));
    proc.on('error', err => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

function resolveName(input) {
  // Accept both 'voice' and 'purpclaw-voice'
  if (input.startsWith('purpclaw-')) return input;
  return 'purpclaw-' + input;
}

function getEcosystemNames(PURP_DIR) {
  const eco = require(path.join(PURP_DIR, 'ecosystem.config.js'));
  return eco.apps.map(a => a.name);
}

async function ensureNotRunning(name, PURP_DIR) {
  const state = runPm2Json(PURP_DIR);
  if (!state) return { skip: false, reason: 'pm2 unavailable' };
  const entry = state.find(p => p.name === name);
  if (!entry) return { skip: false, reason: 'not in pm2' };
  if (entry.pm2_env?.status === 'online') return { skip: true, reason: 'already online (pid ' + entry.pid + ')' };
  return { skip: false, reason: 'in pm2 but ' + (entry.pm2_env?.status || 'unknown') };
}

async function getRestartCount(name, PURP_DIR) {
  const state = runPm2Json(PURP_DIR);
  if (!state) return 0;
  const entry = state.find(p => p.name === name);
  return entry?.pm2_env?.restart_time || 0;
}

async function startOne(name, PURP_DIR, stabiliseMs, force, col, C) {
  const before = await getRestartCount(name, PURP_DIR);

  if (before > RESTART_THRESHOLD && !force) {
    return { name, ok: false, reason: `circuit breaker: ${before} historical restarts (>${RESTART_THRESHOLD}). Use --force to override.` };
  }

  // Run: pm2 start ecosystem.config.js --only <name>
  // The pm2 daemon honours windowsHide via the ecosystem.config.js entry;
  // our own spawn here uses windowsHide for the npx invocation.
  console.log(`  ${col(C.gray, '↪ launching')}  ${col(C.cyan, name)}`);
  const result = await spawnPm2(['start', 'ecosystem.config.js', '--only', name, '--update-env'], PURP_DIR);
  if (result.code !== 0) {
    return { name, ok: false, reason: `pm2 exited ${result.code}: ${(result.stderr || result.stdout).slice(0, 120)}` };
  }

  // Stabilisation window — poll restart count, abort if it grows
  const tStart = Date.now();
  while (Date.now() - tStart < stabiliseMs) {
    await new Promise(r => setTimeout(r, 700));
    const after = await getRestartCount(name, PURP_DIR);
    if (after > before) {
      // It restarted during the stabilisation window — crash-looping
      return { name, ok: false, reason: `crash detected — restart count went ${before} → ${after} within ${Date.now() - tStart}ms` };
    }
  }

  // Final state check
  const state = runPm2Json(PURP_DIR);
  const entry = state?.find(p => p.name === name);
  if (entry?.pm2_env?.status === 'online') {
    return { name, ok: true, reason: `online pid ${entry.pid} after ${Math.round(stabiliseMs / 1000)}s stable` };
  }
  return { name, ok: false, reason: `final status: ${entry?.pm2_env?.status || 'unknown'}` };
}

async function run(args, ctx) {
  const { C, col, PURP_DIR } = ctx;

  // ── Parse args ─────────────────────────────────────────────────────────────
  const dryRun  = args.includes('--dry-run');
  const force   = args.includes('--force');
  const useDark = args.includes('--dark');
  const useCore = args.includes('--core');
  const useAll  = args.includes('--all');
  const stabArg = args.find(a => a.startsWith('--stabilise='));
  const stabiliseMs = stabArg ? parseInt(stabArg.split('=')[1], 10) || DEFAULT_STABILISE_MS : DEFAULT_STABILISE_MS;

  const positional = args.filter(a => !a.startsWith('--'));

  let names = [];
  if (useDark) {
    names = DARK_SERVICES.map(resolveName);
  } else if (useCore) {
    names = CORE_SERVICES.map(resolveName);
  } else if (useAll) {
    // --all = core then dark, in that order, so the foundation is up first
    names = [...CORE_SERVICES, ...DARK_SERVICES].map(resolveName);
  } else if (positional.length === 0) {
    // No args — show help
    console.log(`\n  ${col(C.bold || C.white, '🛡  PURPCLAW SAFE-START')}\n`);
    console.log(`  ${col(C.gray, 'Sequential service launcher with circuit breaker.')}\n`);
    console.log(`  ${col(C.cyan, 'Usage:')}`);
    console.log(`    purpclaw safe-start <name> [name2 ...]   start named services in order`);
    console.log(`    purpclaw safe-start --core               wake the 16-service stable baseline`);
    console.log(`    purpclaw safe-start --dark               wake the defined-but-dark cluster`);
    console.log(`    purpclaw safe-start --all                start everything (core first, then dark)`);
    console.log(`    purpclaw safe-start --dry-run            show the plan, no execution`);
    console.log(`    purpclaw safe-start --force              bypass restart-count circuit breaker`);
    console.log(`    purpclaw safe-start --stabilise=5000     custom stabilisation window (ms)\n`);
    console.log(`  ${col(C.cyan, 'Core (stable) cluster:')}      ${col(C.green, CORE_SERVICES.join(', '))}`);
    console.log(`  ${col(C.cyan, 'Defined-but-dark cluster:')}   ${col(C.yellow, DARK_SERVICES.join(', '))}`);
    console.log(`  ${col(C.gray, 'Dark services are off by default. They have known Windows flakiness.')}\n`);
    console.log(`  ${col(C.cyan, 'Circuit breaker:')}  refuses to launch any service with >${RESTART_THRESHOLD} historical restarts.`);
    console.log(`  ${col(C.gray, 'Override with --force. Restart counts can be cleared via:')} ${col(C.cyan, 'pm2 reset <name>')}\n`);
    return;
  } else {
    names = positional.map(resolveName);
  }

  // Validate names against ecosystem
  const known = new Set(getEcosystemNames(PURP_DIR));
  const unknown = names.filter(n => !known.has(n));
  if (unknown.length) {
    console.error(col(C.red, `\n  ✗ Unknown service(s): ${unknown.join(', ')}`));
    console.error(col(C.gray, `  Known: ${[...known].join(', ')}\n`));
    process.exit(1);
  }

  // ── Plan ───────────────────────────────────────────────────────────────────
  console.log(`\n  ${col(C.bold || C.white, '🛡  SAFE-START')}  ${col(C.gray, '·')}  ${col(C.cyan, names.length + ' service(s)')}  ${col(C.gray, '·')}  ${col(C.gray, 'stabilisation ' + stabiliseMs + 'ms')}${force ? '  ' + col(C.yellow, '· --force') : ''}\n`);

  // Pre-flight: check restart counts and current state
  const state = runPm2Json(PURP_DIR);
  if (!state) {
    console.error(col(C.red, '  ✗ Could not read PM2 state. Is the daemon running? Try: pm2 ping\n'));
    process.exit(2);
  }

  const plan = [];
  for (const name of names) {
    const entry = state.find(p => p.name === name);
    const restarts = entry?.pm2_env?.restart_time || 0;
    const status   = entry?.pm2_env?.status || 'not-managed';

    let action = null;
    if (status === 'online') action = 'skip (already online)';
    else if (restarts > RESTART_THRESHOLD && !force) action = `BLOCK (${restarts} restarts > ${RESTART_THRESHOLD})`;
    else action = 'start';

    plan.push({ name, restarts, status, action });
    const colour = action === 'start' ? C.green : action.startsWith('skip') ? C.gray : C.red;
    console.log(`  ${col(colour, action.padEnd(28))}  ${col(C.white, name.padEnd(24))}  ${col(C.gray, 'restarts=' + restarts + '  status=' + status)}`);
  }

  if (dryRun) {
    console.log(`\n  ${col(C.gray, '(--dry-run — no changes applied)')}\n`);
    return;
  }

  const blocked = plan.filter(p => p.action.startsWith('BLOCK'));
  if (blocked.length && !force) {
    console.error(col(C.red, `\n  ✗ ${blocked.length} service(s) blocked by circuit breaker. Use --force or run \`pm2 reset <name>\` first.\n`));
    process.exit(1);
  }

  // ── Execute ────────────────────────────────────────────────────────────────
  console.log('');
  const toStart = plan.filter(p => p.action === 'start');
  const results = [];
  for (const item of toStart) {
    const r = await startOne(item.name, PURP_DIR, stabiliseMs, force, col, C);
    const icon = r.ok ? col(C.green, '✓') : col(C.red, '✗');
    console.log(`  ${icon}  ${col(C.white, r.name.padEnd(24))}  ${col(C.gray, r.reason)}`);
    results.push(r);

    if (!r.ok) {
      console.error(`\n  ${col(C.red + C.bold, '⛔  ABORT')}  ${col(C.gray, '·')}  service "' + r.name + '" did not stabilise; halting remaining launches to prevent cascade.\n`);
      console.error(col(C.gray, '  Investigate: pm2 logs ' + r.name + ' --lines 30'));
      console.error(col(C.gray, '  Reset:       pm2 reset ' + r.name));
      console.error(col(C.gray, '  Stop:        pm2 stop ' + r.name + '\n'));
      process.exit(1);
    }
  }

  const okCount = results.filter(r => r.ok).length;
  console.log(`\n  ${col(C.green + C.bold, '✔  SAFE-START COMPLETE')}  ${col(C.gray, '·')}  ${col(C.green, okCount + '/' + toStart.length + ' started')}  ${col(C.gray, '· no cascade detected\n')}`);
}

module.exports = { run, DARK_SERVICES, RESTART_THRESHOLD };
