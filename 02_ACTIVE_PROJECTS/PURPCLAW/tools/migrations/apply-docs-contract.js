#!/usr/bin/env node
'use strict';
/**
 * Apply the Canonical Documentation Contract to docs/.
 *
 *   node tools/migrations/apply-docs-contract.js           dry run
 *   node tools/migrations/apply-docs-contract.js --apply   execute
 *
 * Contract: var/tmp/claude/docs-triage-batch-01/PURPCLAW_CANONICAL_DOCS_CONTRACT.md
 * That triage covered 20 of 143 files by hand. This applies the same tiering to
 * everything, so the remaining files stop being classified by whoever opens
 * them first.
 *
 * The problem it names is authority collision, not age: many documents claim
 * CANONICAL / CURRENT / CONSTITUTION for different dates and incompatible
 * states. The fix is structural — evidence and archive leave the active tree,
 * so a document's tier is visible from its path.
 *
 *   Tier 1  root operator controls      stay put
 *   Tier 2  docs/spec, docs/parity,
 *           docs/campaigns/<name>       active scoped authority
 *   Tier 3  docs/evidence/<date>        immutable, proves one run
 *   Tier 4  docs/archive                excluded from default retrieval
 *
 * Nothing is deleted. Contract section 6 permits deletion only for exact
 * duplicates and reproducible artefacts, after proof and backup.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const APPLY = process.argv.includes('--apply');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

// Tier 1. The contract keeps the root spine small; these keep their authority
// and their place.
const ROOT_CONTROLS = new Set(['README.md', 'AGENT.md', 'AGENTS.md', 'ARCHITECTURE.md',
  'QUICKSTART.md', 'STATUS.md', 'DOCS_INDEX.md', 'RELEASE_CHECKLIST.md', 'SECURITY.md',
  'CHANGELOG.md', 'Router.md', 'CONTRIBUTING.md', 'INSTALL.md', 'FIRST_RUN.md',
  'TROUBLESHOOTING.md', 'INDEX.md']);

// Already-tiered trees. Leave them where they are.
const ALREADY_TIERED = [/^docs\/(spec|parity|campaigns|evidence|archive|subsystems|operations|architecture|security|product|releases)\//];

// Tier 4 — no authority. Recaps, superseded plans, old roadmaps.
const ARCHIVE_PATTERNS = [
  /RECAP/i, /WHATS_NEXT/i, /WHAT_S_NEXT/i, /MONSTER_LAUNCH_LEDGER/i, /CONSTITUTION/i,
  /SUPERSEDED/i, /_OLD\b/i, /DEPRECATED/i, /PLAN_TO_FULL_WORKING/i,
  /CONSOLIDATION[-_]PLAN/i, /UI_REORG_PROPOSAL/i, /NEXT_FEATURES/i,
  /DOC_UPDATE_PATCH_PLAN/i, /OVERWRITE_MANIFEST/i, /THERE_WERE_TEN/i,
];
// docs/legacy is Tier 4 by definition; fold it in rather than leaving a second
// archive concept alive.
const LEGACY_TREE = /^docs\/legacy\//;

// Tier 3 — evidence. Proves one run, tree or commit. Never defines future scope.
const EVIDENCE_PATTERNS = [
  /AUDIT/i, /_MAP\.md$/i, /INVENTORY/i, /CROSS_REFERENCE/i, /PROOF/i,
  /EVIDENCE/i, /RECONCILIATION/i, /GAP_ANALYSIS/i, /_REPORT/i, /FINDINGS/i,
  /BEHAVIOR_STUDY/i, /CLAIM_AUDIT/i, /LOOP_PROOF/i, /MANIFEST/i, /LEDGER\.json$/i,
];

// Tier 2 — campaign control. Authority only inside its own campaign.
const CAMPAIGN_PATTERNS = [
  [/GAUNTLET/i, 'wave1'],
  [/MULTI_CLI/i, 'wave1'],
];

const DATE_IN_NAME = /(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function dateFor(file) {
  const m = DATE_IN_NAME.exec(path.basename(file));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // No date in the name: use mtime. An evidence file must carry a capture date;
  // guessing from content is worse than recording when we found it.
  return fs.statSync(file).mtime.toISOString().slice(0, 10);
}

const plan = [];
for (const f of walk(DOCS)) {
  const r = rel(f);
  const base = path.basename(f);
  if (!/\.(md|json|csv|yaml|yml)$/i.test(base)) continue;

  const inLegacy = LEGACY_TREE.test(r);
  if (!inLegacy && ALREADY_TIERED.some(re => re.test(r))) continue;
  if (r.split('/').length === 2 && ROOT_CONTROLS.has(base)) continue;

  const campaign = CAMPAIGN_PATTERNS.find(([re]) => re.test(base));
  if (campaign) {
    plan.push({ from: f, to: path.join(DOCS, 'campaigns', campaign[1], base), tier: 'campaign-control' });
    continue;
  }
  if (inLegacy || ARCHIVE_PATTERNS.some(re => re.test(base))) {
    const sub = inLegacy ? r.slice('docs/legacy/'.length) : base;
    plan.push({ from: f, to: path.join(DOCS, 'archive', inLegacy ? 'legacy' : '', sub), tier: 'archive' });
    continue;
  }
  if (EVIDENCE_PATTERNS.some(re => re.test(base))) {
    plan.push({ from: f, to: path.join(DOCS, 'evidence', dateFor(f), base), tier: 'generated-evidence' });
  }
}

const byTier = plan.reduce((a, p) => { (a[p.tier] = a[p.tier] || []).push(p); return a; }, {});
console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply)'}\n`);
for (const [tier, items] of Object.entries(byTier)) {
  console.log(`${tier}: ${items.length}`);
  for (const p of items.slice(0, 6)) console.log(`   ${rel(p.from)}  ->  ${rel(p.to)}`);
  if (items.length > 6) console.log(`   ... ${items.length - 6} more`);
  console.log('');
}
const untouched = walk(DOCS).filter(f => /\.md$/i.test(f)).length - plan.filter(p => /\.md$/i.test(p.from)).length;
console.log(`markdown left in the active tree: ${untouched}`);

if (!APPLY) { console.log('\nnothing written.'); process.exit(0); }

let moved = 0;
for (const p of plan) {
  fs.mkdirSync(path.dirname(p.to), { recursive: true });
  if (fs.existsSync(p.to)) { console.error(`  skip (exists): ${rel(p.to)}`); continue; }
  fs.renameSync(p.from, p.to);
  moved++;
}
(function prune(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(dir, e.name));
  try { if (dir !== DOCS && !fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { /* not empty */ }
})(DOCS);

console.log(`\nmoved ${moved}`);
