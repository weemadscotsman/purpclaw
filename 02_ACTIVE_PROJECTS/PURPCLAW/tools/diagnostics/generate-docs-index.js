#!/usr/bin/env node
'use strict';
/**
 * Generate docs/DOCS_INDEX.md from the filesystem.
 *
 *   node tools/diagnostics/generate-docs-index.js
 *
 * Canonical Documentation Contract §5/§6: DOCS_INDEX is generated, never
 * maintained by hand, and records each file's tier. Six documents were
 * competing to be the index; hand-maintenance is why none of them agreed.
 *
 * Tier comes from path, so a document cannot claim an authority its location
 * contradicts.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const rel = p => path.relative(DOCS, p).replace(/\\/g, '/');

const TIERS = [
  { match: /^archive\//, tier: 4, name: 'Archive', authority: 'none', retrieval: 'excluded by default' },
  { match: /^evidence\//, tier: 3, name: 'Evidence', authority: 'proves one run only', retrieval: 'on request' },
  { match: /^campaigns\//, tier: 2, name: 'Campaign control', authority: 'inside its campaign only', retrieval: 'while campaign open' },
  { match: /^parity\//, tier: 2, name: 'Parity', authority: 'CANONICAL_PARITY_PRIORITY.md only', retrieval: 'active' },
  { match: /^(spec|subsystems|design|experimental|persona-forge|reference|research)\//, tier: 2, name: 'Active spec', authority: 'its own feature', retrieval: 'active' },
  { match: /^(generated|benchmark|artifacts|runtime)\//, tier: 3, name: 'Evidence', authority: 'proves one run only', retrieval: 'on request' },
  { match: /^(shipped|handoff)\//, tier: 4, name: 'Archive', authority: 'none', retrieval: 'excluded by default' },
  { match: /^(operations|architecture|security|releases|runbooks)\//, tier: 1, name: 'Operator control', authority: 'its own domain', retrieval: 'active' },
  { match: /^[^/]+$/, tier: 1, name: 'Root control', authority: 'its own domain', retrieval: 'active' },
];
const tierFor = r => TIERS.find(t => t.match.test(r)) || { tier: 5, name: 'Unclassified', authority: 'none — needs a tier', retrieval: 'excluded' };

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o); else if (/\.md$/i.test(e.name)) o.push(p);
  }
  return o;
}

const files = walk(DOCS).filter(f => path.basename(f) !== 'DOCS_INDEX.md');
const rows = files.map(f => {
  const r = rel(f);
  const t = tierFor(r);
  return { r, ...t, bytes: fs.statSync(f).size, mtime: fs.statSync(f).mtime.toISOString().slice(0, 10) };
}).sort((a, b) => a.tier - b.tier || a.r.localeCompare(b.r));

const counts = rows.reduce((a, x) => { a[x.name] = (a[x.name] || 0) + 1; return a; }, {});
const stamp = new Date().toISOString().slice(0, 10);

let md = `---
doc_id: purpclaw.docs-index
class: generated-evidence
authority: file catalogue and tier assignment
status: current
owner: tools/diagnostics/generate-docs-index.js
last_verified: generated
verification_source:
  - node tools/diagnostics/generate-docs-index.js
supersedes: []
superseded_by: null
---

# Documentation index

**Generated ${stamp}. Do not edit by hand — rerun the generator.**

Tier is derived from path, so a document cannot claim authority its location
contradicts. Six documents previously competed to be this index; that is what
hand-maintenance produces.

| tier | meaning | files |
|---|---|---|
${Object.entries(counts).sort().map(([k, v]) => {
  const t = rows.find(r => r.name === k);
  return `| ${t.tier} — ${k} | ${t.authority} | ${v} |`;
}).join('\n')}

Total: **${rows.length}** markdown files.

`;

let current = null;
for (const r of rows) {
  if (r.name !== current) {
    current = r.name;
    md += `\n## Tier ${r.tier} — ${r.name}\n\nAuthority: ${r.authority}. Default retrieval: ${r.retrieval}.\n\n`;
    md += '| document | size | last change |\n|---|---|---|\n';
  }
  md += `| [\`${r.r}\`](${r.r}) | ${r.bytes} | ${r.mtime} |\n`;
}

fs.writeFileSync(path.join(DOCS, 'DOCS_INDEX.md'), md);
console.log(`docs/DOCS_INDEX.md generated — ${rows.length} files`);
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${String(v).padStart(4)}  ${k}`);
const unclassified = rows.filter(r => r.tier === 5);
if (unclassified.length) {
  console.log(`\n${unclassified.length} unclassified — these need a tier:`);
  for (const r of unclassified.slice(0, 15)) console.log(`  ${r.r}`);
}
