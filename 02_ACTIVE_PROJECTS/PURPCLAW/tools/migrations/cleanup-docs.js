#!/usr/bin/env node
'use strict';
/**
 * docs/ cleanup, steps 1-4 of docs/operations/DOCS_AUDIT_2026-08-04.md.
 *
 *   node tools/migrations/cleanup-docs.js           dry run
 *   node tools/migrations/cleanup-docs.js --apply   execute
 *
 * Only 94 of 1239 files under docs/ are tracked by git, so `git checkout` will
 * not undo this. The safety net is var/artifacts/incident-2026-08-04/
 * BASELINE_SOURCE_BACKUP/docs (1242 files), taken before any of this ran, and
 * the script refuses to --apply if that backup is missing.
 *
 * DELETE is reserved for things that are provably regenerable or are a copy of
 * something already present. Everything else MOVES. Third-party licensed
 * content is never deleted.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const APPLY = process.argv.includes('--apply');
const BACKUP = path.join(ROOT, 'var/artifacts/incident-2026-08-04/BASELINE_SOURCE_BACKUP/docs');

const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
const plan = { delete: [], move: [] };

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const size = p => { try { return fs.statSync(p).size; } catch { return 0; } };
const all = walk(DOCS);

// -- step 1: build artifacts and the self-copy -------------------------------
// docs.zip is a zip of docs/ inside docs/. .pyc/__pycache__/tsbuildinfo are
// compiler output. Nothing here is authored and nothing is unrecoverable.
for (const f of all) {
  const r = rel(f);
  if (r === 'docs/docs.zip'
    || /(^|\/)__pycache__\//.test(r)
    || /\.pyc$/.test(r)
    || /\.tsbuildinfo$/.test(r)) {
    plan.delete.push({ file: f, why: r === 'docs/docs.zip' ? 'zip of docs/ inside docs/' : 'compiler output' });
  }
}

// -- step 2: another project's documentation --------------------------------
const LOCALES = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'pt-BR', 'tr'];
const ECC_ROOT = path.join(ROOT, 'research/references/everything-claude-code');
const ECC_ENGLISH = [
  'docs/legacy/SELECTIVE-INSTALL-ARCHITECTURE.md',
  'docs/legacy/SKILL-DEVELOPMENT-GUIDE.md',
  'docs/legacy/MEGA-PLAN-REPO-PROMPTS-2026-03-12.md',
  'docs/legacy/PR-QUEUE-TRIAGE-2026-03-13.md',
  'docs/business/metrics-and-sponsorship.md',
  'docs/business/social-launch-copy.md',
];
for (const f of all) {
  const r = rel(f);
  const loc = LOCALES.find(l => r.startsWith(`docs/${l}/`));
  if (loc) {
    plan.move.push({ from: f, to: path.join(ECC_ROOT, r.slice('docs/'.length)), why: `ECC locale tree (${loc})` });
  } else if (ECC_ENGLISH.includes(r)) {
    plan.move.push({ from: f, to: path.join(ECC_ROOT, 'en', path.basename(r)), why: 'ECC English doc' });
  }
}

// -- step 3: generated maps presenting themselves as current state ----------
const GENERATED_MAPS = ['docs/ARCHITECTURE_MAP.md', 'docs/STACK_MAP.md',
  'docs/ROUTE_INDEX.md', 'docs/DOC_CATALOG.md'];
for (const r of GENERATED_MAPS) {
  const f = path.join(ROOT, r);
  if (fs.existsSync(f)) {
    plan.move.push({ from: f, to: path.join(ROOT, 'var/reports/stale-generated', path.basename(r)), why: 'generated artifact, stale — not authored docs' });
  }
}

// -- step 4: generated inventories and source snapshots ---------------------
const SRC_EXT = new Set(['.tsx', '.jsx', '.ts', '.html', '.css', '.py', '.js', '.cjs', '.mjs']);
const DATA_EXT = new Set(['.csv', '.json', '.yaml', '.yml', '.log', '.txt', '.zip']);

/**
 * Extension is a bad proxy for "generated". Three cases where it lies, all of
 * them found by listing the bucket before applying rather than after:
 *
 *  - docs/subsystems/ and docs/spec/ hold *authored* contracts and schemas that
 *    happen to be .json/.yaml — liveforge.contracts.json and
 *    spinebus.subsystem.yaml are source of truth, not output.
 *  - docs/parity/ evidence JSON is paired with the parity docs the authority
 *    gate enforces; splitting the pair breaks the pairing.
 *  - docs/legacy/ and docs/archive/ are already a curated quarantine. Scattering
 *    their contents by file type destroys the curation and gains nothing —
 *    archive policy is step 6, not this step.
 */
const KEEP_IN_PLACE = [
  /^docs\/subsystems\//,
  /^docs\/spec\//,
  /^docs\/parity\//,
  /^docs\/legacy\//,
  /^docs\/archive\//,
];

const moving = new Set(plan.move.map(m => m.from));
const deleting = new Set(plan.delete.map(d => d.file));
for (const f of all) {
  if (moving.has(f) || deleting.has(f)) continue;
  const r = rel(f);
  if (KEEP_IN_PLACE.some(re => re.test(r))) continue;
  const ext = path.extname(f).toLowerCase();
  if (SRC_EXT.has(ext)) {
    plan.move.push({ from: f, to: path.join(ROOT, 'research/experiments/from-docs', r.slice('docs/'.length)), why: 'source file, not documentation' });
  } else if (DATA_EXT.has(ext)) {
    plan.move.push({ from: f, to: path.join(ROOT, 'var/reports/from-docs', r.slice('docs/'.length)), why: 'generated data, not documentation' });
  }
}

// -- report ------------------------------------------------------------------
const delBytes = plan.delete.reduce((n, d) => n + size(d.file), 0);
const movBytes = plan.move.reduce((n, m) => n + size(m.from), 0);
const mb = n => (n / 1048576).toFixed(2) + ' MB';

console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply)'}\n`);
console.log(`DELETE  ${plan.delete.length} file(s), ${mb(delBytes)}`);
for (const d of plan.delete.slice(0, 8)) console.log(`   ${String(size(d.file)).padStart(9)}  ${rel(d.file)}   (${d.why})`);
if (plan.delete.length > 8) console.log(`   ... ${plan.delete.length - 8} more`);

const byWhy = new Map();
for (const m of plan.move) {
  if (!byWhy.has(m.why)) byWhy.set(m.why, { n: 0, bytes: 0 });
  const e = byWhy.get(m.why); e.n++; e.bytes += size(m.from);
}
console.log(`\nMOVE    ${plan.move.length} file(s), ${mb(movBytes)}`);
for (const [why, e] of [...byWhy].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`   ${String(e.n).padStart(4)}  ${mb(e.bytes).padStart(9)}  ${why}`);
}

if (!APPLY) {
  console.log('\nnothing written. re-run with --apply');
  process.exit(0);
}

if (!fs.existsSync(BACKUP)) {
  console.error(`\nREFUSING TO APPLY: backup not found at ${rel(BACKUP)}`);
  console.error('Only 94 of 1239 docs files are tracked by git; without that backup this is not reversible.');
  process.exit(1);
}

let moved = 0, removed = 0;
for (const m of plan.move) {
  fs.mkdirSync(path.dirname(m.to), { recursive: true });
  if (fs.existsSync(m.to)) { console.error(`  skip (target exists): ${rel(m.to)}`); continue; }
  fs.renameSync(m.from, m.to);
  moved++;
}
for (const d of plan.delete) { fs.rmSync(d.file, { force: true }); removed++; }

// Prune directories the moves emptied. Files only ever left, never arrived.
function prune(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) if (e.isDirectory()) prune(path.join(dir, e.name));
  try { if (!fs.readdirSync(dir).length && dir !== DOCS) fs.rmdirSync(dir); } catch { /* not empty */ }
}
prune(DOCS);

// Provenance note, so the next agent does not "helpfully" reintegrate it.
fs.mkdirSync(ECC_ROOT, { recursive: true });
fs.writeFileSync(path.join(ECC_ROOT, 'PROVENANCE.md'),
  `# everything-claude-code — vendored reference\n\n`
  + `Source: https://github.com/affaan-m/everything-claude-code (MIT)\n\n`
  + `This is **not PurpClaw documentation**. It arrived in \`docs/\` and made up 65% of\n`
  + `it: 712 localised files across zh-CN, zh-TW, ja-JP, ko-KR, pt-BR and tr, plus six\n`
  + `English documents. None of the 718 mentions PurpClaw.\n\n`
  + `Moved here ${new Date().toISOString().slice(0, 10)} so it stops being indexed,\n`
  + `searched and maintained as if it were ours. Kept rather than deleted because it is\n`
  + `third-party licensed content and is legitimate reference material.\n\n`
  + `Do not move it back into \`docs/\`.\n`);

console.log(`\nmoved ${moved}, deleted ${removed}`);
const after = walk(DOCS);
console.log(`docs/ now: ${after.length} files, ${mb(after.reduce((n, f) => n + size(f), 0))}`);
