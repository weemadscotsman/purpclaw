'use strict';

/**
 * training.js — the `your-cli training` command.
 *
 * Copy to your stack's `lib/commands/training.js` and wire into the
 * CLI dispatcher:
 *
 *   case 'training':
 *   case 'train':     return loadCmd('training').run(args, sharedCtx());
 *
 * Subcommands:
 *   status              — count, success rate, by-route breakdown
 *   export <format>     — jsonl | json | sharegpt | chatml
 *   backfill            — re-record all historical kernel jobs
 *   clear               — wipe raw + exports (asks confirm)
 *   toggle on|off       — set PURPCLAW_TRAINING_DISABLED
 *
 * The buffer is opt-in. PURPCLAW_TRAINING_DISABLED=1 in .env turns it off.
 */

const { TrainingBuffer } = require('../training-buffer');
const path = require('path');

function banner(ctx) {
  const { C, col } = ctx;
  console.log(`\n  ${col(C.bold || C.white, '📒  PURPCLAW TRAINING')}  ${col(C.gray, '· self-training buffer management')}\n`);
}

async function run(args, ctx) {
  const { C, col, PURP_DIR } = ctx;
  const sub = (args[0] || 'status').toLowerCase();
  const rest = args.slice(1);
  const buffer = new TrainingBuffer();

  if (sub === 'status' || sub === 'stats') {
    banner(ctx);
    const s = buffer.summary();
    const enabled = process.env.PURPCLAW_TRAINING_DISABLED !== '1';
    console.log(`  ${col(C.cyan, 'enabled:')}  ${enabled ? col(C.green, 'yes') : col(C.yellow, 'no (PURPCLAW_TRAINING_DISABLED=1)')}`);
    console.log(`  ${col(C.cyan, 'baseDir:')}  ${col(C.white, process.env.PURPCLAW_TRAINING_DIR || 'E:/training')}`);
    console.log(`  ${col(C.cyan, 'total:   ')}  ${col(C.white, s.total)} ${col(C.gray, 'trajectories')}`);
    console.log(`  ${col(C.cyan, 'success: ')}  ${col(C.green, s.success)}`);
    console.log(`  ${col(C.cyan, 'failed:  ')}  ${col(C.red,   s.failed)}`);
    console.log(`  ${col(C.cyan, 'partial: ')}  ${col(C.yellow, s.partial)}`);
    console.log(`  ${col(C.cyan, 'avgReward:')}  ${col(C.white, s.avgReward.toFixed(3))}`);
    if (Object.keys(s.byRoute).length) {
      console.log(`\n  ${col(C.gray, 'by route:')}`);
      for (const [route, v] of Object.entries(s.byRoute).sort((a, b) => b[1].total - a[1].total)) {
        const rate = v.total ? Math.round((v.success / v.total) * 100) : 0;
        console.log(`    ${col(C.cyan, route.padEnd(24))} ${col(C.white, String(v.total).padStart(4))}  ${col(C.green, String(v.success).padStart(3))}  ${col(C.red, String(v.failed).padStart(3))}  ${col(C.gray, rate + '%')}`);
      }
    }
    if (Object.keys(s.bySkill).length) {
      console.log(`\n  ${col(C.gray, 'by skill tag:')}`);
      for (const [skill, n] of Object.entries(s.bySkill).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`    ${col(C.cyan, skill.padEnd(24))} ${col(C.white, n)}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'export') {
    banner(ctx);
    const format = rest.find(a => !a.startsWith('--')) || 'chatml';
    const since = (rest.find(a => a.startsWith('--since=')) || '').split('=')[1];
    const until = (rest.find(a => a.startsWith('--until=')) || '').split('=')[1];
    const result = buffer.export({ format, since, until });
    if (result.error) {
      console.error(col(C.red, `  ✗ export failed: ${result.error}\n`));
      process.exitCode = 1;
      return;
    }
    console.log(`  ${col(C.green, '✓')}  ${col(C.cyan, 'exported ' + result.count + ' trajectories')}  ${col(C.gray, '→ ' + result.file)}`);
    console.log(`  ${col(C.gray, 'format:')}  ${col(C.white, result.format)}\n`);
    return;
  }

  if (sub === 'backfill') {
    banner(ctx);
    console.log(`  ${col(C.cyan, '↪')}  reading all jobs from kernel archive…\n`);
    try {
      const jobs = readKernelArchive(PURP_DIR);
      const results = buffer.recordMany(jobs);
      const recorded = results.filter(r => r.recorded).length;
      console.log(`  ${col(C.green, '✓')}  ${col(C.cyan, 'backfill: ' + recorded + '/' + jobs.length + ' recorded')}\n`);
    } catch (e) {
      console.error(col(C.red, `  ✗ backfill failed: ${e.message}\n`));
      process.exitCode = 1;
    }
    return;
  }

  if (sub === 'clear') {
    banner(ctx);
    if (ctx.confirm && !ctx.confirm(`Wipe all training data under ${process.env.PURPCLAW_TRAINING_DIR || 'E:/training'}?`)) {
      console.log(col(C.yellow, '  cancelled\n'));
      return;
    }
    const fs = require('fs');
    for (const sub of ['raw', 'exports', 'stats.json']) {
      const p = path.join(process.env.PURPCLAW_TRAINING_DIR || 'E:/training', sub);
      try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
    console.log(col(C.green, '  ✓ training buffer wiped\n'));
    return;
  }

  if (sub === 'toggle') {
    banner(ctx);
    const state = (rest[0] || '').toLowerCase();
    if (!['on', 'off'].includes(state)) {
      console.log(col(C.red, '  usage: purpclaw training toggle on|off\n'));
      process.exitCode = 1;
      return;
    }
    const env = state === 'off' ? '1' : '0';
    console.log(`  ${col(C.cyan, '↪')}  set PURPCLAW_TRAINING_DISABLED=${env} in .env, then restart the API.`);
    console.log(`  ${col(C.gray, '(this command does not edit .env — it just prints the line to add)')}\n`);
    return;
  }

  banner(ctx);
  console.log(`  ${col(C.cyan, 'usage:')}`);
  console.log(`    purpclaw training status`);
  console.log(`    purpclaw training export <jsonl|json|sharegpt|chatml> [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]`);
  console.log(`    purpclaw training backfill`);
  console.log(`    purpclaw training clear`);
  console.log(`    purpclaw training toggle on|off\n`);
}

function readKernelArchive(PURP_DIR) {
  const fs = require('fs');
  const path = require('path');
  const candidates = [
    path.join(PURP_DIR, 'logs', 'kernel-archive.json'),
    path.join(PURP_DIR, 'agent_work', 'kernel-archive.json'),
    path.join(PURP_DIR, '.kernel-archive.json'),
  ];
  for (const c of candidates) {
    try {
      const raw = fs.readFileSync(c, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    } catch {}
  }
  return [];
}

module.exports = { run };
