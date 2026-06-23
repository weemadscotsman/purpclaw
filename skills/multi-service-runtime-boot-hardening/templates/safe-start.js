// safe-start.js — sequential PM2 launcher with circuit breaker
//
// Copy this file to your stack's `lib/commands/safe-start.js` (or
// equivalent) and wire it into your CLI dispatcher. The shape:
//
//   purpclaw safe-start                    # bring up the default boot
//   purpclaw safe-start <name>             # bring up one service
//   purpclaw safe-start --core             # the proven-stable subset
//   purpclaw safe-start --with-ui          # also bring up the Next.js UIs
//   purpclaw safe-start --force            # bypass the restart-count breaker
//   purpclaw safe-start --stabilise=5000  # custom per-service wait window
//
// Required PM2 env / runtime:
//   - `pm2` installed and daemon running (`pm2 ping` returns pong)
//   - An ecosystem file in the stack root: `ecosystem.config.js`
//   - `pythonw.exe` (or your windowless Python) for all PM2 services
//   - `BROWSER=none` on any Next.js service
//
// On the "no cascade" guarantee: we abort the batch on the first
// crash-loop, and we refuse to launch any service with >3 historical
// restarts. Both rules are bypassed with --force.

'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const DEFAULT_STABILISE_MS = 3500;
const RESTART_THRESHOLD    = 3;

function pm2Cmd() { return process.platform === 'win32' ? 'npx.cmd' : 'npx'; }

function runPm2Json(cwd) {
  try {
    const r = spawnSync(pm2Cmd(), ['pm2', 'jlist'], {
      cwd, windowsHide: true, encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

function getEcosystemNames(cwd) {
  const eco = require(path.join(cwd, 'ecosystem.config.js'));
  return eco.apps.map(a => a.name);
}

function resolveName(input) {
  return input.startsWith('purpclaw-') ? input : 'purpclaw-' + input;
}

async function getRestartCount(name, cwd) {
  const state = runPm2Json(cwd);
  if (!state) return 0;
  const entry = state.find(p => p.name === name);
  return entry?.pm2_env?.restart_time || 0;
}

async function startOne(name, cwd, stabiliseMs, force) {
  const before = await getRestartCount(name, cwd);

  if (before > RESTART_THRESHOLD && !force) {
    return { name, ok: false, reason: `circuit breaker: ${before} historical restarts (>${RESTART_THRESHOLD}). Use --force to override.` };
  }

  const proc = spawn(pm2Cmd(),
    ['pm2', 'start', 'ecosystem.config.js', '--only', name, '--update-env'],
    { cwd, windowsHide: true, shell: process.platform === 'win32', stdio: 'inherit' });

  await new Promise((resolve) => {
    proc.on('close', code => resolve(code));
    proc.on('error', () => resolve(-1));
  });

  // Stabilization window — poll restart count, abort if it grows
  const tStart = Date.now();
  while (Date.now() - tStart < stabiliseMs) {
    await new Promise(r => setTimeout(r, 700));
    const after = await getRestartCount(name, cwd);
    if (after > before) {
      return { name, ok: false, reason: `crash detected — restart count went ${before} → ${after} within ${Date.now() - tStart}ms` };
    }
  }

  const state = runPm2Json(cwd);
  const entry = state?.find(p => p.name === name);
  if (entry?.pm2_env?.status === 'online') {
    return { name, ok: true, reason: `online pid ${entry.pid} after ${Math.round(stabiliseMs / 1000)}s stable` };
  }
  return { name, ok: false, reason: `final status: ${entry?.pm2_env?.status || 'unknown'}` };
}

async function run(args, ctx) {
  const { PURP_DIR, C, col } = ctx;

  const force      = args.includes('--force');
  const useCore    = args.includes('--core');
  const withUi     = args.includes('--with-ui');
  const noUi       = args.includes('--no-ui');
  const stabArg    = args.find(a => a.startsWith('--stabilise='));
  const stabiliseMs = stabArg ? parseInt(stabArg.split('=')[1], 10) || DEFAULT_STABILISE_MS : DEFAULT_STABILISE_MS;
  const positional = args.filter(a => !a.startsWith('--'));

  // Subset selection
  let names = [];
  if (positional.length) {
    names = positional.map(resolveName);
  } else if (useCore) {
    // TODO: list your core services here
    names = ['purpclaw-eventbus', 'purpclaw-state', 'purpclaw-api', 'purpclaw-tower'];
  } else {
    // Default: every service in the ecosystem, EXCEPT UI services
    // (which are opt-in via --with-ui or `your-cli open <ui>`)
    const all = getEcosystemNames(PURP_DIR);
    const uiNames = ['nextjs', 'no-spaghett']; // TODO: your UI service suffixes
    names = (withUi ? all : all.filter(n => !uiNames.includes(n.replace(/^.*-/, ''))));
  }

  // Plan + pre-flight
  console.log(`\n  safe-start: ${names.length} service(s) · stabilization ${stabiliseMs}ms${force ? ' · --force' : ''}\n`);
  const state = runPm2Json(PURP_DIR);
  if (!state) {
    console.error(col(C.red, '  ✗ PM2 daemon not responding. Try: pm2 ping\n'));
    process.exit(2);
  }

  const plan = names.map(name => {
    const entry = state.find(p => p.name === name);
    return {
      name,
      restarts: entry?.pm2_env?.restart_time || 0,
      status:   entry?.pm2_env?.status || 'not-managed',
    };
  });
  for (const p of plan) {
    let action;
    if (p.status === 'online')                            action = 'skip (already online)';
    else if (p.restarts > RESTART_THRESHOLD && !force)    action = `BLOCK (${p.restarts} restarts > ${RESTART_THRESHOLD})`;
    else                                                   action = 'start';
    console.log(`  ${action.padEnd(28)}  ${p.name.padEnd(24)}  restarts=${p.restarts}  status=${p.status}`);
  }

  const blocked = plan.filter(p => p.restarts > RESTART_THRESHOLD && !force);
  if (blocked.length) {
    console.error(col(C.red, `  ✗ ${blocked.length} service(s) blocked. Use --force or 'pm2 reset <name>'.\n`));
    process.exit(1);
  }

  // Execute sequentially
  console.log('');
  const toStart = plan.filter(p => p.status !== 'online');
  let okCount = 0;
  for (const item of toStart) {
    const r = await startOne(item.name, PURP_DIR, stabiliseMs, force);
    console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name.padEnd(24)}  ${r.reason}`);
    if (!r.ok) {
      console.error(col(C.red, `\n  ⛔ ABORT  · service "${r.name}" did not stabilize; halting remaining launches.\n`));
      console.error(`  Investigate: pm2 logs ${r.name} --lines 30`);
      console.error(`  Reset:       pm2 reset ${r.name}`);
      console.error(`  Stop:        pm2 stop ${r.name}\n`);
      process.exit(1);
    }
    okCount += 1;
  }

  console.log(`\n  ✔ SAFE-START COMPLETE  ·  ${okCount}/${toStart.length} started  · no cascade detected\n`);
}

module.exports = { run, DEFAULT_STABILISE_MS, RESTART_THRESHOLD };
