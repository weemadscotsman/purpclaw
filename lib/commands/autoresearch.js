'use strict';

/**
 * purpclaw autoresearch — local LLM optimization loop (CLI)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Karpathy's AutoResearch pattern, wired into PURPCLAW. See
 * E:/training/program.md for the spec and
 * lib/autoresearch-orchestrator.js for the loop implementation.
 *
 *   purpclaw autoresearch status              — current baseline + recent results
 *   purpclaw autoresearch run-once           — one iteration
 *   purpclaw autoresearch loop [N]           — run N iterations (or until STOP)
 *   purpclaw autoresearch reset              — wipe results, revert to baseline
 *   purpclaw autoresearch prepare             — run prepare.py (data + metric)
 *   purpclaw autoresearch queue              — list the curated hypothesis queue
 *   purpclaw autoresearch stop               — write STOP marker (loop exits)
 *   purpclaw autoresearch resume             — clear STOP/PAUSE markers
 *   purpclaw autoresearch logs [N]           — tail the autoresearch.log
 *
 * Stop the loop at any time by writing the file `E:/training/STOP`
 * (one-byte file, content doesn't matter).
 */

const { spawnSync, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const TRAINING_DIR = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';
const ORCH         = path.join(TRAINING_DIR, 'lib', 'autoresearch-orchestrator.js');
const RESULTS_TSV  = path.join(TRAINING_DIR, 'results.tsv');
const STATUS_FILE  = path.join(TRAINING_DIR, 'autoresearch.status.json');
const STOP_MARKER  = path.join(TRAINING_DIR, 'STOP');
const PAUSE_MARKER = path.join(TRAINING_DIR, 'PAUSE');
const LOG_FILE     = path.join(TRAINING_DIR, 'autoresearch.log');

function call(args) {
  const r = spawnSync(process.execPath, [ORCH, ...args], { encoding: 'utf-8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status || 0;
}

async function run(args, ctx) {
  const { C, col } = ctx;
  const sub = (args[0] || 'status').toLowerCase();
  console.log('');
  console.log(`  ${col(C.bold || C.white, '🧬  PURPCLAW AUTORESEARCH')}  ${col(C.gray, '· local LLM optimization loop')}`);
  console.log(`  ${col(C.gray, '  baseDir:')}  ${col(C.white, TRAINING_DIR)}`);
  console.log('');

  if (sub === 'status')           return call(['status']);
  if (sub === 'run-once' || sub === 'iter') return call(['run-once']);
  if (sub === 'loop' || sub === 'start') {
    const n = parseInt(args[1] || '0', 10);
    return call(['loop', String(n)]);
  }
  if (sub === 'reset')            return call(['reset']);
  if (sub === 'prepare' || sub === 'data') {
    const r = spawnSync('python', [path.join(TRAINING_DIR, 'prepare.py')], { encoding: 'utf-8' });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    return r.status || 0;
  }
  if (sub === 'queue' || sub === 'hypotheses') {
    const md = fs.existsSync(path.join(TRAINING_DIR, 'program.md')) ? fs.readFileSync(path.join(TRAINING_DIR, 'program.md'), 'utf-8') : '';
    const m = md.match(/## Active Hypotheses Queue[\s\S]*?```([\s\S]*?)```/);
    if (!m) {
      console.log(col(C.gray, '  no hypothesis queue found in program.md'));
      return 0;
    }
    console.log(col(C.cyan, '  curated queue (in order):'));
    console.log('  ' + m[1].split('\n').filter(l => l.trim()).join('\n  '));
    return 0;
  }
  if (sub === 'stop') {
    fs.writeFileSync(STOP_MARKER, `stopped at ${new Date().toISOString()}\n`);
    console.log(col(C.yellow, `  ✓ wrote ${STOP_MARKER} — loop will exit on next check\n`));
    return 0;
  }
  if (sub === 'resume') {
    for (const f of [STOP_MARKER, PAUSE_MARKER]) {
      try { fs.unlinkSync(f); console.log(col(C.green, `  ✓ cleared ${f}`)); } catch {}
    }
    console.log('');
    return 0;
  }
  if (sub === 'logs' || sub === 'log' || sub === 'tail') {
    if (!fs.existsSync(LOG_FILE)) { console.log(col(C.gray, '  no logs yet')); return 0; }
    const lines = parseInt(args[1] || '40', 10);
    const data = fs.readFileSync(LOG_FILE, 'utf-8').split('\n');
    console.log('  ' + data.slice(-lines).join('\n  '));
    return 0;
  }
  // Help
  console.log(col(C.cyan, '  usage:'));
  console.log('    purpclaw autoresearch status');
  console.log('    purpclaw autoresearch run-once');
  console.log('    purpclaw autoresearch loop [N]');
  console.log('    purpclaw autoresearch prepare          — tokenize + split + val metric');
  console.log('    purpclaw autoresearch queue             — show curated hypothesis queue');
  console.log('    purpclaw autoresearch reset             — wipe results.tsv + git reset');
  console.log('    purpclaw autoresearch stop              — write STOP marker');
  console.log('    purpclaw autoresearch resume            — clear STOP/PAUSE markers');
  console.log('    purpclaw autoresearch logs [N=40]       — tail the log file\n');
  return 0;
}

module.exports = { run };
