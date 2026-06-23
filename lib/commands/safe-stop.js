'use strict';

/**
 * purpclaw safe-stop — sequential service shutdown
 * ══════════════════════════════════════════════════
 *
 * Inverse of safe-start. Stops services one at a time with windowsHide:true
 * on every PM2 invocation so shutdown doesn't trigger the cmd-window cascade
 * either.
 *
 * Usage:
 *   purpclaw safe-stop <name> [name2 ...]    sequential
 *   purpclaw safe-stop --dark                 put all defined-but-dark services to sleep
 *   purpclaw safe-stop --delete <name>        stop AND remove from PM2 (no autorestart)
 *   purpclaw safe-stop --dry-run              show plan, no execution
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const { DARK_SERVICES } = require('./safe-start.js');

function pm2Cmd() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function runPm2Json(PURP_DIR) {
  try {
    const r = spawnSync(pm2Cmd(), ['pm2', 'jlist'], {
      cwd: PURP_DIR, windowsHide: true, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

function spawnPm2(args, PURP_DIR) {
  return new Promise((resolve) => {
    const proc = spawn(pm2Cmd(), ['pm2', ...args], {
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
  return input.startsWith('purpclaw-') ? input : 'purpclaw-' + input;
}

async function run(args, ctx) {
  const { C, col, PURP_DIR } = ctx;

  const dryRun  = args.includes('--dry-run');
  const useDark = args.includes('--dark');
  const doDelete = args.includes('--delete');

  const positional = args.filter(a => !a.startsWith('--'));

  let names = [];
  if (useDark) {
    names = DARK_SERVICES.map(resolveName);
  } else if (positional.length === 0) {
    console.log(`\n  ${col(C.bold || C.white, '🛑  PURPCLAW SAFE-STOP')}\n`);
    console.log(`  ${col(C.cyan, 'Usage:')}`);
    console.log(`    purpclaw safe-stop <name> [name2 ...]   stop named services in order`);
    console.log(`    purpclaw safe-stop --dark                put the dark cluster back to sleep`);
    console.log(`    purpclaw safe-stop --delete <name>       stop AND remove from PM2 supervision`);
    console.log(`    purpclaw safe-stop --dry-run             show plan, no execution\n`);
    return;
  } else {
    names = positional.map(resolveName);
  }

  const state = runPm2Json(PURP_DIR);
  if (!state) {
    console.error(col(C.red, '\n  ✗ Could not read PM2 state.\n'));
    process.exit(2);
  }

  console.log(`\n  ${col(C.bold || C.white, '🛑  SAFE-STOP')}  ${col(C.gray, '·')}  ${col(C.cyan, names.length + ' service(s)')}  ${doDelete ? col(C.yellow, '· --delete (remove from PM2)') : ''}\n`);

  for (const name of names) {
    const entry = state.find(p => p.name === name);
    if (!entry) {
      console.log(`  ${col(C.gray, '·')}  ${col(C.white, name.padEnd(24))}  ${col(C.gray, 'not in PM2 list — skipped')}`);
      continue;
    }
    const status = entry.pm2_env?.status;
    if (status !== 'online') {
      console.log(`  ${col(C.gray, '·')}  ${col(C.white, name.padEnd(24))}  ${col(C.gray, 'already ' + status + ' — skipped')}`);
      continue;
    }

    if (dryRun) {
      console.log(`  ${col(C.yellow, '↪')}  ${col(C.white, name.padEnd(24))}  ${col(C.gray, doDelete ? 'would stop + delete' : 'would stop')}`);
      continue;
    }

    const action = doDelete ? 'delete' : 'stop';
    const result = await spawnPm2([action, name], PURP_DIR);
    const ok = result.code === 0;
    console.log(`  ${ok ? col(C.green, '✓') : col(C.red, '✗')}  ${col(C.white, name.padEnd(24))}  ${col(C.gray, ok ? (action + 'ped pid ' + entry.pid) : ('failed: ' + (result.stderr || result.stdout).slice(0, 60)))}`);

    // Brief pause between actions to avoid PM2 daemon contention
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n  ${col(C.green, '✔')}  ${col(C.gray, 'shutdown sequence complete\n')}`);
}

module.exports = { run };
