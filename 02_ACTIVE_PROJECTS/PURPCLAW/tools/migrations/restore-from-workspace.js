#!/usr/bin/env node
'use strict';
/**
 * Incident recovery: restore modules lost in the 2026-08-04 re-org from the
 * pre-incident copy at E:\PURPCLAW_WORKSPACE\purpclaw.
 *
 * That tree is a git repo whose HEAD is "BASELINE: pre-canonical-filesystem-
 * migration" and whose lib/ holds 521 .js files against the canonical tree's
 * 189, with original June/July mtimes. It is the migration workspace, taken
 * before the destructive move.
 *
 * Two rules, both deliberate:
 *
 *  1. ADDITIVE ONLY. A file that exists in the canonical tree is never
 *     overwritten — the canonical tree has had real work land on it since the
 *     loss (recovered services, runtime fixes, packages/), and the workspace
 *     copy is older. Pass --force-list to overwrite a named file, and only
 *     with a reason.
 *
 *  2. DEMAND-DRIVEN, TO FIXPOINT. Only modules something actually requires get
 *     restored, then the graph is rescanned, because restored files bring
 *     their own requires. Copying all 332 extra files would re-import exactly
 *     the sprawl this migration exists to remove.
 *
 * Dry run by default. Pass --apply to write.
 */

const fs = require('fs');
const path = require('path');

const CANON = path.resolve(__dirname, '..', '..');
const SOURCE = process.env.RECOVERY_SOURCE || 'E:/PURPCLAW_WORKSPACE/purpclaw';
const APPLY = process.argv.includes('--apply');
// Files the canonical tree holds only as a reconstruction; the original wins.
const FORCE = new Set((process.argv.find(a => a.startsWith('--force-list=')) || '').split('=')[1]?.split(',').filter(Boolean) || []);

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  'vendor', '.worktrees', '.versioning', '.audit', 'public', 'packages', 'apps']);
const SCAN_DIRS = ['lib', 'bin', 'services', 'scripts', 'parity', 'podcast_studio'];

function walk(root, dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, p, out);
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function sourceFiles() {
  const out = [];
  for (const d of SCAN_DIRS) walk(CANON, path.join(CANON, d), out);
  for (const e of fs.readdirSync(CANON, { withFileTypes: true })) {
    if (e.isFile() && /\.(js|cjs|mjs)$/.test(e.name)) out.push(path.join(CANON, e.name));
  }
  return out;
}

function resolves(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, base + '.js', base + '.cjs', base + '.mjs',
    path.join(base, 'index.js'), path.join(base, 'index.cjs'), path.join(base, 'index.mjs')]) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

const RE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Every unresolved local import in the canonical tree right now. */
function unresolved() {
  const missing = new Map();   // absolute expected path -> Set(referrer)
  for (const f of sourceFiles()) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    RE.lastIndex = 0;
    let m;
    while ((m = RE.exec(text))) {
      if (resolves(f, m[1])) continue;
      const expected = path.resolve(path.dirname(f), m[1]);
      if (!missing.has(expected)) missing.set(expected, new Set());
      missing.get(expected).add(path.relative(CANON, f).replace(/\\/g, '/'));
    }
  }
  return missing;
}

/** Which concrete file in SOURCE satisfies an expected path. */
function candidateFor(expectedAbs) {
  const r = path.relative(CANON, expectedAbs).replace(/\\/g, '/');
  for (const suffix of ['.js', '.cjs', '.mjs', '/index.js', '/index.cjs', '']) {
    const c = path.join(SOURCE, r + suffix);
    try { if (fs.statSync(c).isFile()) return { src: c, dest: path.join(CANON, r + suffix) }; }
    catch { /* next */ }
  }
  return null;
}

const restored = [];
const stillMissing = new Map();
let round = 0;

while (round++ < 20) {
  const missing = unresolved();
  let progress = 0;
  stillMissing.clear();

  for (const [expected, refs] of missing) {
    const cand = candidateFor(expected);
    if (!cand) { stillMissing.set(path.relative(CANON, expected).replace(/\\/g, '/'), [...refs]); continue; }
    const destRel = path.relative(CANON, cand.dest).replace(/\\/g, '/');
    if (fs.existsSync(cand.dest) && !FORCE.has(destRel)) {
      stillMissing.set(destRel, [...refs]);
      continue;
    }
    const size = fs.statSync(cand.src).size;
    restored.push({ file: destRel, bytes: size, from: cand.src, refs: refs.size, round });
    if (APPLY) {
      fs.mkdirSync(path.dirname(cand.dest), { recursive: true });
      fs.copyFileSync(cand.src, cand.dest);
    }
    progress++;
  }
  if (!progress) break;
  if (!APPLY) break;   // dry run cannot converge — nothing was written
}

console.log(`source: ${SOURCE}`);
console.log(`mode:   ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}`);
console.log(`rounds: ${round}`);
console.log(`\nrestorable/restored: ${restored.length}`);
for (const r of restored.sort((a, b) => b.refs - a.refs).slice(0, 40)) {
  console.log(`  ${String(r.refs).padStart(3)} refs  ${r.file.padEnd(46)} ${r.bytes} bytes`);
}
if (restored.length > 40) console.log(`  ... ${restored.length - 40} more`);

console.log(`\nstill missing (no candidate in source): ${stillMissing.size}`);
for (const [f, refs] of [...stillMissing].sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
  console.log(`  ${String(refs.length).padStart(3)} refs  ${f.padEnd(46)} <- ${refs.slice(0, 2).join(', ')}`);
}

fs.writeFileSync(path.join(CANON, 'data/migrations/recovery-log.json'),
  JSON.stringify({ source: SOURCE, applied: APPLY, rounds: round, restored, stillMissing: Object.fromEntries(stillMissing) }, null, 2) + '\n');
console.log('\nwrote data/migrations/recovery-log.json');
