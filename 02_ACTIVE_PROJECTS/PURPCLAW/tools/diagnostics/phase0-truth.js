#!/usr/bin/env node
'use strict';
// PHASE 0 — establish current truth. READ ONLY.
// Classifies every blueprint requirement as VERIFIED WORKING / PRESENT BUT
// DISCONNECTED / PARTIAL / MISSING / LEGACY DUPLICATE, by loading things rather
// than by reading documentation about them.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT);

const out = [];
const line = s => out.push(s);

function probe(label, relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return { label, state: 'MISSING', detail: relPath };
  let mod, err;
  try { mod = require(abs); } catch (e) { err = String(e.message).split('\n')[0]; }
  if (err) return { label, state: 'PARTIAL', detail: 'exists but fails to load: ' + err };
  const keys = Object.keys(mod || {});
  if (!keys.length) return { label, state: 'PARTIAL', detail: 'loads but exports nothing' };
  return { label, state: 'LOADS', detail: keys.slice(0, 8).join(', '), keys };
}

const CORE = [
  ['packages/task-schema', 'packages/task-schema'],
  ['packages/result-schema', 'packages/result-schema'],
  ['packages/context-spine', 'packages/context-spine'],
  ['packages/verification-core', 'packages/verification-core'],
  ['packages/memory-audit', 'packages/memory-audit'],
  ['packages/harness-core', 'packages/harness-core'],
  ['packages/router', 'packages/router'],
  ['packages/memory', 'packages/memory'],
  ['packages/harness-codex', 'packages/harness-codex'],
  ['packages/harness-claude', 'packages/harness-claude'],
  ['packages/harness-hermes', 'packages/harness-hermes'],
  ['packages/harness-minimax', 'packages/harness-minimax'],
];

line('=== SHARED CORE ===');
const results = [];
for (const [label, p] of CORE) {
  const r = probe(label, p);
  results.push(r);
  line(`  ${r.state.padEnd(8)} ${label.padEnd(30)} ${r.detail}`);
}

// Is the shared core actually consumed, or present-but-disconnected?
line('');
line('=== IS THE SHARED CORE WIRED? (who requires each package) ===');
const SCAN = ['lib', 'bin', 'services', 'apps', 'packages'];
const files = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'dist', 'build'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(js|cjs|mjs)$/.test(e.name)) files.push(p);
  }
})(ROOT);
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (e.isFile() && /\.js$/.test(e.name)) files.push(path.join(ROOT, e.name));
}
const src = new Map();
for (const f of files) { try { src.set(f, fs.readFileSync(f, 'utf8')); } catch {} }

for (const [label, p] of CORE) {
  const name = path.basename(p);
  const consumers = [];
  for (const [f, text] of src) {
    const r = path.relative(ROOT, f).replace(/\\/g, '/');
    if (r.startsWith(`packages/${name}/`)) continue;   // itself
    if (new RegExp(`require\\([^)]*packages/${name}|@purpclaw/${name}`).test(text)) consumers.push(r);
  }
  const outside = consumers.filter(c => !c.startsWith('packages/'));
  line(`  ${String(consumers.length).padStart(3)} consumers (${outside.length} outside packages/)  ${label}`);
  if (consumers.length) line(`        ${consumers.slice(0, 4).join(', ')}`);
}

// Surfaces
line('');
line('=== SURFACES ===');
const SURFACES = [
  ['CLI', 'bin/purpclaw.js'],
  ['API', 'unified_api.js'],
  ['TUI cmd', 'lib/commands/tui.js'],
  ['Web (next)', 'apps/web'],
  ['Desktop', 'apps/desktop'],
];
for (const [label, p] of SURFACES) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { line(`  MISSING  ${label.padEnd(12)} ${p}`); continue; }
  const st = fs.statSync(abs);
  const n = st.isDirectory() ? fs.readdirSync(abs).length : st.size;
  line(`  EXISTS   ${label.padEnd(12)} ${p}  ${st.isDirectory() ? n + ' entries' : n + ' bytes'}`);
}

// Which surfaces exist as CLI commands?
const cmdDir = path.join(ROOT, 'lib/commands');
const cmds = fs.existsSync(cmdDir) ? fs.readdirSync(cmdDir).filter(f => f.endsWith('.js')).map(f => f.replace('.js', '')) : [];
line(`  lib/commands/: ${cmds.length} commands`);
for (const want of ['tui', 'web', 'ask', 'serve', 'dashboard', 'ui']) {
  line(`      ${want.padEnd(10)} ${cmds.includes(want) ? 'present' : 'ABSENT'}`);
}

console.log(out.join('\n'));
fs.mkdirSync(path.join(ROOT, 'var/reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'var/reports/phase0-truth.txt'), out.join('\n') + '\n');
