#!/usr/bin/env node
'use strict';
/**
 * docs/ audit. READ ONLY — reports, deletes nothing.
 *
 *   node tools/diagnostics/audit-docs.js            summary
 *   node tools/diagnostics/audit-docs.js --full     every finding
 *
 * Checks, in rough order of how much money they save:
 *   exact duplicates            same sha256, different path
 *   dead code references        doc names a file/dir that no longer exists
 *   broken internal links       [x](./y.md) where y.md is gone
 *   stale translations          localised copy older than its English source
 *   staleness                   age by mtime and by last commit
 *   non-doc payload             zips, .pyc, binaries living in docs/
 *   orphans                     not linked from any other doc
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const FULL = process.argv.includes('--full');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

const LOCALES = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'pt-BR', 'tr', 'es', 'fr', 'de', 'ru'];

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const files = walk(DOCS);
const md = files.filter(f => f.endsWith('.md'));

// ---------------------------------------------------------------- git dates
let gitDates = new Map();
try {
  // One call, not one per file: 1238 git invocations takes minutes on Windows.
  const out = execFileSync('git', ['log', '--name-only', '--format=%x00%ct', '--', 'docs'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let ts = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('\0')) { ts = parseInt(line.slice(1), 10) || ts; continue; }
    const f = line.trim();
    if (!f) continue;
    const key = f.replace(/^02_ACTIVE_PROJECTS\/PURPCLAW\//, '');
    if (!gitDates.has(key)) gitDates.set(key, ts);   // log is newest-first
  }
} catch (e) {
  console.error('[warn] git log failed: ' + e.message);
}

const DAY = 86400e3;
const now = Date.now();
const ageDays = f => Math.floor((now - fs.statSync(f).mtimeMs) / DAY);
function commitAgeDays(f) {
  const ts = gitDates.get(rel(f));
  return ts ? Math.floor((now - ts * 1000) / DAY) : null;
}

// ------------------------------------------------------------- duplicates
const byHash = new Map();
for (const f of files) {
  let buf;
  try { buf = fs.readFileSync(f); } catch { continue; }
  if (!buf.length) continue;
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(f);
}
const dupes = [...byHash.values()].filter(g => g.length > 1)
  .sort((a, b) => fs.statSync(b[0]).size - fs.statSync(a[0]).size);
const dupeWasted = dupes.reduce((n, g) => n + fs.statSync(g[0]).size * (g.length - 1), 0);

// --------------------------------------------------- dead code references
// Only paths that look like real repo paths, so prose is not mistaken for one.
const RE_PATH = /(?:^|[\s(`'"[])((?:lib|bin|packages|services|apps|scripts|tools|parity|tests)\/[A-Za-z0-9_@./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|json))/g;
const RE_SERVICE = /\b([a-z_]+(?:_service|_api|_gateway|_tower|_coordinator|_aggregator|_eventbus|_state))\.js\b/g;
const deadRefs = new Map();     // doc -> Set(missing path)
const exists = p => { try { return fs.existsSync(path.join(ROOT, p)); } catch { return false; } };

for (const f of md) {
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const missing = new Set();
  for (const re of [RE_PATH, RE_SERVICE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const p = m[1];
      if (p.includes('node_modules') || p.includes('*')) continue;
      if (!exists(p) && !exists(path.posix.join('docs', p))) missing.add(p);
    }
  }
  if (missing.size) deadRefs.set(f, missing);
}

// ------------------------------------------------------- broken md links
const RE_LINK = /\[[^\]]*\]\(([^)#\s]+\.md)[^)]*\)/g;
const brokenLinks = new Map();
const linkedTo = new Set();
for (const f of md) {
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  RE_LINK.lastIndex = 0;
  let m;
  const bad = new Set();
  while ((m = RE_LINK.exec(text))) {
    const target = m[1];
    if (/^https?:/.test(target)) continue;
    const abs = path.resolve(path.dirname(f), target);
    if (fs.existsSync(abs)) linkedTo.add(abs);
    else bad.add(target);
  }
  if (bad.size) brokenLinks.set(f, bad);
}

// ---------------------------------------------------- translation drift
const drift = [];
for (const f of md) {
  const r = rel(f);
  const loc = LOCALES.find(l => r.startsWith(`docs/${l}/`));
  if (!loc) continue;
  const source = path.join(DOCS, r.slice(`docs/${loc}/`.length));
  if (!fs.existsSync(source)) { drift.push({ f, source: null, lag: null }); continue; }
  const lag = Math.floor((fs.statSync(source).mtimeMs - fs.statSync(f).mtimeMs) / DAY);
  if (lag > 7) drift.push({ f, source, lag });
}

// ------------------------------------------------------- non-doc payload
const DOC_EXT = new Set(['.md', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp']);
const payload = files.filter(f => !DOC_EXT.has(path.extname(f).toLowerCase()))
  .map(f => ({ f, size: fs.statSync(f).size }))
  .sort((a, b) => b.size - a.size);
const payloadBytes = payload.reduce((n, p) => n + p.size, 0);

// -------------------------------------------------------------- orphans
const orphans = md.filter(f => !linkedTo.has(f));

// ------------------------------------------------------------ staleness
const staleBuckets = { '<30d': 0, '30-90d': 0, '90-180d': 0, '>180d': 0 };
for (const f of md) {
  const a = ageDays(f);
  if (a < 30) staleBuckets['<30d']++;
  else if (a < 90) staleBuckets['30-90d']++;
  else if (a < 180) staleBuckets['90-180d']++;
  else staleBuckets['>180d']++;
}

// ---------------------------------------------------------------- report
const mb = n => (n / 1048576).toFixed(2) + ' MB';
const show = (list, n) => FULL ? list : list.slice(0, n);

console.log('=== docs/ audit ===\n');
console.log(`files            ${files.length}   (${md.length} markdown)`);
console.log(`size             ${mb(files.reduce((n, f) => n + fs.statSync(f).size, 0))}`);
const locFiles = md.filter(f => LOCALES.some(l => rel(f).startsWith(`docs/${l}/`)));
console.log(`translations     ${locFiles.length}  (${Math.round(locFiles.length / md.length * 100)}% of all markdown)`);

console.log(`\n--- exact duplicates: ${dupes.length} group(s), ${mb(dupeWasted)} wasted ---`);
for (const g of show(dupes, 12)) {
  console.log(`  ${fs.statSync(g[0]).size} bytes x${g.length}`);
  for (const f of g) console.log(`      ${rel(f)}`);
}
if (!FULL && dupes.length > 12) console.log(`  ... ${dupes.length - 12} more groups`);

console.log(`\n--- docs referencing files that no longer exist: ${deadRefs.size} ---`);
const drSorted = [...deadRefs.entries()].sort((a, b) => b[1].size - a[1].size);
for (const [f, miss] of show(drSorted, 15)) {
  console.log(`  ${String(miss.size).padStart(3)} dead  ${rel(f)}`);
  console.log(`             ${[...miss].slice(0, 4).join(', ')}${miss.size > 4 ? ' ...' : ''}`);
}
if (!FULL && drSorted.length > 15) console.log(`  ... ${drSorted.length - 15} more docs`);

console.log(`\n--- broken markdown links: ${brokenLinks.size} doc(s) ---`);
for (const [f, bad] of show([...brokenLinks.entries()], 12)) {
  console.log(`  ${rel(f)}  ->  ${[...bad].slice(0, 3).join(', ')}`);
}

console.log(`\n--- stale translations: ${drift.length} ---`);
const noSource = drift.filter(d => !d.source);
console.log(`  translated file whose English source is gone: ${noSource.length}`);
console.log(`  translated file older than its source:        ${drift.length - noSource.length}`);
for (const d of show(drift.filter(d => d.lag), 8)) {
  console.log(`      ${d.lag}d behind  ${rel(d.f)}`);
}

console.log(`\n--- non-doc payload in docs/: ${payload.length} file(s), ${mb(payloadBytes)} ---`);
for (const p of show(payload, 10)) console.log(`  ${String(p.size).padStart(9)}  ${rel(p.f)}`);

console.log(`\n--- markdown age (mtime) ---`);
for (const [k, v] of Object.entries(staleBuckets)) console.log(`  ${k.padEnd(10)} ${v}`);

console.log(`\n--- orphans (not linked from any doc): ${orphans.length} ---`);
for (const f of show(orphans.filter(f => !LOCALES.some(l => rel(f).startsWith(`docs/${l}/`))), 15)) {
  const a = commitAgeDays(f);
  console.log(`  ${rel(f).padEnd(56)} mtime ${ageDays(f)}d${a === null ? '  never committed' : `  last commit ${a}d`}`);
}

const outPath = path.join(ROOT, 'var/reports/docs-audit.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  generated: new Date().toISOString(),
  totals: { files: files.length, markdown: md.length, translations: locFiles.length },
  duplicates: dupes.map(g => g.map(rel)),
  deadRefs: Object.fromEntries([...deadRefs].map(([f, s]) => [rel(f), [...s]])),
  brokenLinks: Object.fromEntries([...brokenLinks].map(([f, s]) => [rel(f), [...s]])),
  staleTranslations: drift.map(d => ({ file: rel(d.f), source: d.source ? rel(d.source) : null, lagDays: d.lag })),
  payload: payload.map(p => ({ file: rel(p.f), size: p.size })),
  orphans: orphans.map(rel),
}, null, 2) + '\n');
console.log(`\nfull findings -> var/reports/docs-audit.json`);
