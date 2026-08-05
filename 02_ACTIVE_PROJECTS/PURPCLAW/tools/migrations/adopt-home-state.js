#!/usr/bin/env node
'use strict';
/**
 * Adopt the state left behind in ~/.purpclaw by the project-confinement change.
 *
 *   node tools/migrations/adopt-home-state.js           dry run
 *   node tools/migrations/adopt-home-state.js --apply
 *
 * Until state was confined to the project, most of the runtime read and wrote
 * C:\Users\<user>\.purpclaw while sessions lived in <project>/.purpclaw. After
 * the confinement, everything points at the project — which orphans whatever
 * only ever existed in the home copy: 43 sessions, credentials, checkpoints,
 * adapters and config.
 *
 * COPY, never move. If this migration is wrong, the original is untouched and
 * the operator can point PURP_DATA_DIR back at it. Existing project files are
 * never overwritten: the project copy is the newer authority.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOME = path.join(os.homedir(), '.purpclaw');
const DEST = path.join(ROOT, '.purpclaw');
const APPLY = process.argv.includes('--apply');

if (!fs.existsSync(HOME)) {
  console.log(`nothing to adopt: ${HOME} does not exist`);
  process.exit(0);
}

const copied = [];
const skipped = [];

function walk(relDir) {
  const src = path.join(HOME, relDir);
  let ents;
  try { ents = fs.readdirSync(src, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const rel = path.join(relDir, e.name);
    const from = path.join(HOME, rel);
    const to = path.join(DEST, rel);
    if (e.isDirectory()) { walk(rel); continue; }
    // Symlinks and other non-regular entries are not adopted. The skills hub
    // keeps a quarantine folder containing a deliberately hostile symlink for
    // its own security tests; copying it EPERM'd and aborted the whole run.
    // Copying a link into a new tree would also silently re-point it.
    if (!e.isFile()) { skipped.push(rel + ' (not a regular file)'); continue; }
    if (fs.existsSync(to)) { skipped.push(rel); continue; }
    copied.push({ rel, bytes: (() => { try { return fs.statSync(from).size; } catch { return 0; } })() });
    if (APPLY) {
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      } catch (err) {
        // One unreadable file must not abandon the other 227.
        skipped.push(`${rel} (${err.code || err.message})`);
        copied.pop();
      }
    }
  }
}
walk('.');

const total = copied.reduce((n, c) => n + c.bytes, 0);
console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply)'}`);
console.log(`source: ${HOME}`);
console.log(`dest:   ${DEST}\n`);
console.log(`adopt:  ${copied.length} file(s), ${(total / 1048576).toFixed(2)} MB`);

const byTop = copied.reduce((a, c) => {
  const top = c.rel.split(path.sep).filter(p => p !== '.')[0] || '(root)';
  a[top] = (a[top] || 0) + 1; return a;
}, {});
for (const [k, v] of Object.entries(byTop).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(v).padStart(4)}  ${k}`);
}
console.log(`\nkept (project copy already exists, treated as newer): ${skipped.length}`);

if (APPLY) {
  console.log('\nThe home copy is untouched. Once the project copy is confirmed good,');
  console.log(`delete ${HOME} by hand — this tool will not remove operator data.`);
}
