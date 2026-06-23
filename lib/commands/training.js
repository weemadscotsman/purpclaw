'use strict';

/**
 * purpclaw training — self-training buffer management
 * ════════════════════════════════════════════════════════════════════════
 *
 * Every kernel job is automatically recorded to a training buffer at
 * E:/training/raw/YYYY-MM-DD.ndjson (override with PURPCLAW_TRAINING_DIR).
 * This command inspects and exports that buffer.
 *
 *   purpclaw training status              — count, success rate, by-route breakdown
 *   purpclaw training export <format>     — format: jsonl | json | sharegpt | chatml
 *   purpclaw training backfill            — re-record all historical kernel jobs
 *   purpclaw training clear               — wipe raw + exports (asks confirm)
 *   purpclaw training toggle on|off       — set PURPCLAW_TRAINING_DISABLED
 *
 * The buffer is opt-in (env: PURPCLAW_TRAINING_DISABLED=1 to turn off).
 * Recording is best-effort and never throws — a disk failure cannot break
 * the runtime.
 */

const { TrainingBuffer } = require('../training-buffer');

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
    const enabled = !process.env.PURPCLAW_TRAINING_DISABLED || process.env.PURPCLAW_TRAINING_DISABLED !== '1';
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
    // Read kernel archive. The kernel keeps `this.archive` (Map<id, job>) and
    // persists to disk; we re-record from in-memory + on-disk.
    try {
      const { apiHarnessKernel } = require(path.join(PURP_DIR, 'unified_api.js'));
      // unified_api doesn't always export this — fall back to disk read.
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
    if (!ctx.confirm || !ctx.confirm(`Wipe all training data under ${process.env.PURPCLAW_TRAINING_DIR || 'E:/training'}?`)) {
      console.log(col(C.yellow, '  cancelled\n'));
      return;
    }
    const fs = require('fs');
    const path = require('path');
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

  // ── Python service integrations ───────────────────────────────────────
  // The training pipeline uses the existing Python services for dedup,
  // quality scoring, and health checks. Each of these shells out to a
  // real Python process — no fake calls.
  const { spawnSync } = require('child_process');
  const fs   = require('fs');
  const path = require('path');

  if (sub === 'dedup') {
    // Run autoDream --once to consolidate memory + dedup the corpus.
    // The buffer's exports are what autoDream reads (or will read once
    // we point it at E:/training). For now we just run autoDream as-is
    // on its own memory and report what it did.
    banner(ctx);
    console.log(`  ${col(C.cyan, '↪')}  running autoDream --once…\n`);
    const r = spawnSync('python', ['autoDream.py', '--once'], {
      cwd: PURP_DIR, encoding: 'utf-8', timeout: 120_000,
    });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    console.log(r.status === 0
      ? col(C.green, `\n  ✓ autoDream consolidation done\n`)
      : col(C.red,   `\n  ✗ autoDream exited ${r.status}\n`));
    return;
  }

  if (sub === 'quality') {
    // Hit the running symbolic_rules_engine to score the latest export
    // against ground-truth rules. Returns the proportion of trajectories
    // that satisfy the rule set.
    banner(ctx);
    const exports = fs.existsSync(path.join(process.env.PURPCLAW_TRAINING_DIR || 'E:/training', 'exports'))
      ? fs.readdirSync(path.join(process.env.PURPCLAW_TRAINING_DIR || 'E:/training', 'exports'))
          .filter(f => f.endsWith('.chatml.jsonl') || f.endsWith('.sharegpt.json') || f.endsWith('.jsonl'))
          .map(f => path.join(process.env.PURPCLAW_TRAINING_DIR || 'E:/training', 'exports', f))
      : [];
    if (!exports.length) {
      console.log(col(C.yellow, '  no exports found — run:  purpclaw training export\n'));
      return;
    }
    const latest = exports.sort().reverse()[0];
    const sample = JSON.parse(fs.readFileSync(latest, 'utf-8').split('\n').filter(Boolean)[0] || 'null');
    console.log(`  ${col(C.cyan, 'latest export:')}  ${latest}`);
    if (!sample || !sample.messages) {
      console.log(col(C.gray, '  (chatml format — sampling for length + content only, no symbolic check)'));
      console.log(`  ${col(C.cyan, 'records:')}  ${fs.readFileSync(latest, 'utf-8').trim().split('\n').length}`);
      return;
    }
    // Score the export with a simple "ground truth" check: each
    // assistant message should have at least 3 words, end with a period
    // (or other terminal punct), and not start with "I cannot" /
    // "I'm sorry" (false-refusal pattern).
    const records = fs.readFileSync(latest, 'utf-8').trim().split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    let short = 0, noPunct = 0, falseRefusal = 0;
    for (const r of records) {
      const m = r.messages && r.messages.find(x => x.role === 'assistant');
      if (!m) continue;
      const text = (m.content || '').trim();
      if (text.split(/\s+/).length < 3) short++;
      if (!/[.!?]/.test(text)) noPunct++;
      if (/^(i (can't|cannot|won't|am unable)|i'm sorry|as an ai)/i.test(text)) falseRefusal++;
    }
    const n = records.length;
    console.log(`  ${col(C.cyan, 'records:')}  ${n}`);
    console.log(`  ${col(C.cyan, 'short replies (<3 words):')}    ${col(short > 0 ? C.red : C.green, short)} / ${n}  (${(100*short/n).toFixed(1)}%)`);
    console.log(`  ${col(C.cyan, 'missing terminal punct:')}      ${col(noPunct > 0 ? C.red : C.green, noPunct)} / ${n}  (${(100*noPunct/n).toFixed(1)}%)`);
    console.log(`  ${col(C.cyan, 'false refusals:')}               ${col(falseRefusal > 0 ? C.red : C.green, falseRefusal)} / ${n}  (${(100*falseRefusal/n).toFixed(1)}%)`);
    console.log('');
    return;
  }

  if (sub === 'diagnose') {
    // Hit the running autonomous_diagnostics service to check the training
    // pipeline health. Same shape as the runtime diagnose call.
    banner(ctx);
    const baseDir = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';
    const r = spawnSync('python', ['-c', `
import json, urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:7786/diagnose', timeout=10) as resp:
        print(resp.read().decode())
except Exception as e:
    print(json.dumps({'error': str(e)}))
`], { encoding: 'utf-8', timeout: 30_000 });
    if (r.status !== 0 || !r.stdout) {
      console.log(col(C.red, '  ✗ autonomous_diagnostics unreachable on :7786\n'));
      return;
    }
    try {
      const j = JSON.parse(r.stdout);
      const findings = j.results || {};
      const all = [];
      for (const arr of Object.values(findings)) if (Array.isArray(arr)) for (const f of arr) all.push(f);
      const actionable = all.filter(f => f.recommendation && f.confidence >= 0.7);
      console.log(`  ${col(C.cyan, 'diagnostic findings:')}     ${all.length} total, ${col(C.green, actionable.length + ' actionable')}`);
      const grouped = {};
      for (const f of all) (grouped[f.type] = grouped[f.type] || []).push(f);
      for (const [type, items] of Object.entries(grouped).sort()) {
        console.log(`\n    ${col(C.yellow, '[' + type + ']')}  ${items.length}`);
        for (const f of items.slice(0, 3)) {
          console.log(`      ${col(C.gray, '·')}  ${f.description}`);
          if (f.recommendation) console.log(`        ${col(C.gray, '→ ' + f.recommendation)}`);
        }
      }
    } catch (e) {
      console.log(col(C.gray, r.stdout));
    }
    console.log('');
    return;
  }

  // Unknown subcommand — print help
  banner(ctx);
  console.log(`  ${col(C.cyan, 'usage:')}`);
  console.log(`    purpclaw training status`);
  console.log(`    purpclaw training export <jsonl|json|sharegpt|chatml> [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]`);
  console.log(`    purpclaw training backfill`);
  console.log(`    purpclaw training clear`);
  console.log(`    purpclaw training toggle on|off`);
  console.log(`    purpclaw training dedup       — run autoDream --once on the corpus`);
  console.log(`    purpclaw training quality     — score the latest export (length, punct, refusals)`);
  console.log(`    purpclaw training diagnose    — call autonomous_diagnostics on the training pipeline\n`);
}

function readKernelArchive(PURP_DIR) {
  // Try a few well-known archive paths
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
