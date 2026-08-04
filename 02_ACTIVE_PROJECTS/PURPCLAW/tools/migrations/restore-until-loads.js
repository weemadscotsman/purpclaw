#!/usr/bin/env node
'use strict';
/**
 * Restore-until-it-loads.
 *
 * Static scanning found 136 of the modules lost in the re-org, but it kept
 * missing whole classes of import:
 *   - ESM dynamic import()          lib/checkpoint-manager.mjs
 *   - computed require paths        require(path.join(__dirname,'..','lib','agent-sync'))
 *   - requires inside doc comments  produced phantom "lib/lib/..." targets
 *
 * Chasing those with a better regex is a losing game. Node already knows
 * exactly which module is missing and says so in MODULE_NOT_FOUND. So: run the
 * entrypoint, read the error, restore that one file from the pre-incident
 * workspace, run again. Repeat until it loads or the file cannot be found.
 *
 * Additive only — never overwrites a file the canonical tree already has.
 *
 *   node tools/migrations/restore-until-loads.js bin/purpclaw.js --version
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CANON = path.resolve(__dirname, '..', '..');
const SOURCE = process.env.RECOVERY_SOURCE || 'E:/PURPCLAW_WORKSPACE/purpclaw';
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || '150', 10);

const argv = process.argv.slice(2);
if (!argv.length) {
  console.error('usage: restore-until-loads.js <entrypoint> [args...]');
  process.exit(2);
}

const restored = [];
const unfound = [];

function findInSource(absMissing) {
  const r = path.relative(CANON, absMissing).replace(/\\/g, '/');
  // Node reports the path without an extension when the specifier had none.
  for (const suffix of ['', '.js', '.cjs', '.mjs', '.json', '/index.js', '/index.mjs']) {
    const c = path.join(SOURCE, r + suffix);
    try { if (fs.statSync(c).isFile()) return { src: c, dest: path.join(CANON, r + suffix) }; }
    catch { /* next */ }
  }
  return null;
}

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const run = spawnSync(process.execPath, argv, { cwd: CANON, encoding: 'utf8', timeout: 120000 });
  const output = (run.stderr || '') + (run.stdout || '');

  if (run.status === 0) {
    console.log(`\nLOADS CLEANLY after ${restored.length} restore(s).`);
    break;
  }

  const m = /Cannot find module '([^']+)'/.exec(output);
  if (!m) {
    console.log(`\nStopped: exit ${run.status}, but not a missing-module error.`);
    console.log(output.split('\n').slice(0, 12).join('\n'));
    break;
  }

  const spec = m[1];
  if (!path.isAbsolute(spec)) {
    // Bare specifier — an npm package, not something this tool restores.
    console.log(`\nStopped: missing npm package '${spec}' — run npm install, not this tool.`);
    break;
  }

  const cand = findInSource(spec);
  const relSpec = path.relative(CANON, spec).replace(/\\/g, '/');
  if (!cand) {
    console.log(`  [${round}] NOT IN SOURCE  ${relSpec}`);
    unfound.push(relSpec);
    break;
  }
  if (fs.existsSync(cand.dest)) {
    console.log(`  [${round}] already present, cannot resolve: ${relSpec} — stopping to avoid a loop.`);
    break;
  }

  fs.mkdirSync(path.dirname(cand.dest), { recursive: true });
  fs.copyFileSync(cand.src, cand.dest);
  const bytes = fs.statSync(cand.dest).size;
  const destRel = path.relative(CANON, cand.dest).replace(/\\/g, '/');
  console.log(`  [${round}] restored ${destRel} (${bytes} bytes)`);
  restored.push({ file: destRel, bytes });
}

console.log(`\nrestored: ${restored.length}`);
if (unfound.length) console.log(`not in source: ${unfound.join(', ')}`);

const logPath = path.join(CANON, 'data/migrations/recovery-log-runtime.json');
fs.writeFileSync(logPath, JSON.stringify({ source: SOURCE, entrypoint: argv, restored, unfound }, null, 2) + '\n');
console.log(`wrote ${path.relative(CANON, logPath).replace(/\\/g, '/')}`);
