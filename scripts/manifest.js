#!/usr/bin/env node
'use strict';

/**
 * manifest.js — PURPCLAW change-tracking / versioning.
 *
 * Fingerprints every source file (sha1 + size + mtime) and, on each run,
 * reports exactly what is NEW, CHANGED, or DELETED since the last stamp — with
 * timestamps — then bumps a monotonic build number and appends a dated entry
 * to the change ledger. Answers "what's new, what changed, and when" without
 * relying on the (mis-rooted) git repo.
 *
 *   node scripts/manifest.js stamp   # (default) diff, record, bump build, append ledger
 *   node scripts/manifest.js diff    # show changes since last stamp, write nothing
 *   node scripts/manifest.js status  # print current version / build / last stamp
 *
 * State lives in .versioning/ :
 *   manifest.json     — path -> { hash, size, mtime }
 *   version.json      — { semver, build, last_stamp, files }
 *   CHANGE_LEDGER.md  — append-only human log of every stamp
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const VDIR = path.join(ROOT, '.versioning');
const MANIFEST = path.join(VDIR, 'manifest.json');
const VERSION = path.join(VDIR, 'version.json');
const LEDGER = path.join(VDIR, 'CHANGE_LEDGER.md');

// What counts as a tracked source file.
const INCLUDE_DIRS = ['lib', 'app', 'bin', 'scripts', 'docs', 'skills', 'agents', 'rules', 'contexts', 'config'];
const INCLUDE_ROOT_EXT = ['.js', '.ts', '.tsx', '.py', '.json', '.md', '.css'];
const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', '.git', '.trash', '.tmp', '.archive', 'archive',
  'agent_work', '_scratch', 'vendor', '__pycache__', '.versioning', 'PURPCLAW',
  '.claude', 'build', 'logs', 'reports',
]);
const EXCLUDE_FILE = /\.(map|lock|log)$/i;
const MAX_BYTES = 2 * 1024 * 1024; // skip hashing files larger than 2MB

function nowISO() { return new Date().toISOString(); }

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env.example') {
      if (EXCLUDE_DIRS.has(e.name)) continue;
    }
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full, out); continue; }
    if (EXCLUDE_FILE.test(e.name)) continue;
    const ext = path.extname(e.name).toLowerCase();
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    const top = rel.split('/')[0];
    const isTrackedDir = INCLUDE_DIRS.includes(top);
    const isRootFile = !rel.includes('/') && INCLUDE_ROOT_EXT.includes(ext);
    if (!isTrackedDir && !isRootFile) continue;
    if (isTrackedDir && !['.js', '.ts', '.tsx', '.py', '.json', '.md', '.css', '.sh', '.mjs'].includes(ext)) continue;
    out.push({ rel, full });
  }
}

function hashFile(full, size) {
  if (size > MAX_BYTES) return `big:${size}`;
  try { return crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex').slice(0, 16); }
  catch { return 'unreadable'; }
}

function scan() {
  const files = [];
  for (const d of INCLUDE_DIRS) walk(path.join(ROOT, d), files);
  walk(ROOT, files); // root-level files (filtered to root ext)
  const manifest = {};
  const seen = new Set();
  for (const { rel, full } of files) {
    if (seen.has(rel)) continue;
    seen.add(rel);
    let st; try { st = fs.statSync(full); } catch { continue; }
    manifest[rel] = { hash: hashFile(full, st.size), size: st.size, mtime: st.mtime.toISOString() };
  }
  return manifest;
}

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }

function diffManifests(prev, next) {
  const added = [], changed = [], removed = [];
  for (const rel of Object.keys(next)) {
    if (!prev[rel]) added.push(rel);
    else if (prev[rel].hash !== next[rel].hash) changed.push(rel);
  }
  for (const rel of Object.keys(prev)) if (!next[rel]) removed.push(rel);
  added.sort(); changed.sort(); removed.sort();
  return { added, changed, removed };
}

function printDiff(d, next) {
  const n = (a) => a.length;
  console.log(`\nTracked files: ${Object.keys(next).length}`);
  console.log(`  NEW:     ${n(d.added)}`);
  console.log(`  CHANGED: ${n(d.changed)}`);
  console.log(`  DELETED: ${n(d.removed)}`);
  const show = (label, arr) => {
    if (!arr.length) return;
    console.log(`\n${label}:`);
    for (const f of arr.slice(0, 60)) console.log(`  ${f}${next[f] ? '  (' + next[f].mtime + ')' : ''}`);
    if (arr.length > 60) console.log(`  … and ${arr.length - 60} more`);
  };
  show('NEW', d.added); show('CHANGED', d.changed); show('DELETED', d.removed);
}

function main() {
  const mode = process.argv[2] || 'stamp';
  fs.mkdirSync(VDIR, { recursive: true });
  const ver = loadJSON(VERSION, { semver: loadJSON(path.join(ROOT, 'package.json'), {}).version || '0.0.0', build: 0, last_stamp: null, files: 0 });

  if (mode === 'status') {
    console.log(`PURPCLAW v${ver.semver}  build #${ver.build}`);
    console.log(`last stamp: ${ver.last_stamp || '(never)'}  ·  tracked files: ${ver.files}`);
    return;
  }

  const prev = loadJSON(MANIFEST, {});
  const next = scan();
  const d = diffManifests(prev, next);
  printDiff(d, next);

  if (mode === 'diff') { console.log('\n(diff only — nothing written)'); return; }

  // stamp: only bump/record if something actually changed (or first run)
  const changedCount = d.added.length + d.changed.length + d.removed.length;
  if (changedCount === 0 && ver.last_stamp) {
    console.log('\nNo changes since last stamp — build not bumped.');
    return;
  }
  const stamp = nowISO();
  const semver = loadJSON(path.join(ROOT, 'package.json'), {}).version || ver.semver;
  const newVer = { semver, build: (ver.build || 0) + 1, last_stamp: stamp, files: Object.keys(next).length };
  fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 0) + '\n');
  fs.writeFileSync(VERSION, JSON.stringify(newVer, null, 2) + '\n');

  // Append ledger entry
  const head = fs.existsSync(LEDGER) ? '' : `# PURPCLAW Change Ledger\n\n> Auto-generated by scripts/manifest.js. Every stamp = one build. Newest first below the header.\n`;
  const entry =
    `\n## build #${newVer.build} — v${semver} — ${stamp}\n` +
    `NEW ${d.added.length} · CHANGED ${d.changed.length} · DELETED ${d.removed.length} · tracked ${newVer.files}\n` +
    (d.added.length ? `- new: ${d.added.slice(0, 25).join(', ')}${d.added.length > 25 ? ` … +${d.added.length - 25}` : ''}\n` : '') +
    (d.changed.length ? `- changed: ${d.changed.slice(0, 25).join(', ')}${d.changed.length > 25 ? ` … +${d.changed.length - 25}` : ''}\n` : '') +
    (d.removed.length ? `- deleted: ${d.removed.slice(0, 25).join(', ')}${d.removed.length > 25 ? ` … +${d.removed.length - 25}` : ''}\n` : '');
  if (head) fs.writeFileSync(LEDGER, head);
  fs.appendFileSync(LEDGER, entry);

  console.log(`\n✓ stamped build #${newVer.build} (v${semver}) at ${stamp} — ledger: .versioning/CHANGE_LEDGER.md`);
}

if (require.main === module) main();
module.exports = { scan, diffManifests };
