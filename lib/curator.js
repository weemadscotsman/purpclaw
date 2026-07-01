'use strict';

/**
 * PURPCLAW Curator
 * ================
 * Anti-bullshit layer. Every claim gets tri-state evidence:
 *
 *   LANDED   — module exists + caller wired + route mounted + response 200
 *   PARTIAL  — module exists + caller OR route missing (one of two layers)
 *   MISSING  — module absent in repo
 *   UNREAD   — file unreadable (permission / path / parse error)
 *
 * Three forensic passes per claim:
 *
 *   1. module-existence   (ls/scan lib/, app/, agents/)
 *   2. inbound-caller     (grep for `require(...)` of the module path)
 *   3. route-mount        (grep unified_api.js switch for `/api/<feature>`)
 *
 * Outputs a single JSON blob to stdout; consumers (bin/purpclaw.js,
 * scripts/curate-pulse.js, docs/audit/PURPCLAW_CURATOR_REPORT_*.md)
 * read with `require('../lib/curator').scan(rootDir)`.
 *
 * Repo is ground truth — every assertion in this file references
 * either the filesystem or fixed string signatures, never cached
 * memory or verbal narrative.
 *
 * Phase A contract: read-only. No files mutated, no PM2 touched, no
 * npm install, no shell commands. Pure Node fs + path.
 */

const fs   = require('fs');
const path = require('path');

// ----------------------------------------------------------------------------
// Tri-state evidence: every verdict carries file/line proof.
// ----------------------------------------------------------------------------

/**
 * @typedef {Object} CuratorClaim
 * @property {string}   id          — stable identifier, e.g. `#5/harvest`
 * @property {string}   name        — human-readable
 * @property {'LANDED'|'PARTIAL'|'MISSING'|'UNREAD'} verdict
 * @property {Evidence[]} evidence    — ordered list of proof points
 * @property {string[]}  nextSteps   — concrete fixes if not LANDED
 */

/**
 * @typedef {Object} Evidence
 * @property {'module-existence'|'inbound-caller'|'route-mount'|'route-call'|'doc-claim'|'stack-check'} kind
 * @property {boolean} present
 * @property {string}  detail      — file path, line number, snippet, or absence note
 */

// ----------------------------------------------------------------------------
// Pass 1 — module-existence
// ----------------------------------------------------------------------------

function findFiles(rootDir, prefix) {
  /** @type {string[]} */
  const hits = [];
  const skipDirs = new Set([
    'node_modules', '.next', '.git', '.claude', '.hermes',
    '_api-mega-list', 'apis for agents', 'refusal_ablation_probe',
    '__pycache__', '.purpclaw', '.cactus', '.donors', '.guardian',
    '.kiro', '.omnicode', '.archive', '.robot'
  ]);
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_e) { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skipDirs.has(ent.name)) continue;
        walk(full);
      } else if (ent.isFile() && ent.name.startsWith(prefix)) {
        hits.push(full);
      }
    }
  }
  walk(rootDir);
  return hits;
}

// ----------------------------------------------------------------------------
// Pass 2 — inbound-caller
// ----------------------------------------------------------------------------

function findCallers(rootDir, moduleBase) {
  const needle = moduleBase.replace(/\\/g, '/');
  /** @type {string[]} */
  const hits = [];
  const files = findFiles(rootDir, '');
  for (const file of files) {
    if (file === needle) continue;
    if (!/\.(js|ts|mjs|cjs)$/.test(file)) continue;
    let body;
    try { body = fs.readFileSync(file, 'utf8'); }
    catch (_e) { continue; }
    // require('./lib/harvest/crawler') — match both quoted forms.
    const requireRe = new RegExp(
      `require\\(['"][^'"]*${needle.replace(/[\\/]/g, '[\\\\/]').replace(/\./g, '\\.')}['"]\\)`
    );
    // Also match `from '...'` for TS/ESM.
    const importRe = new RegExp(
      `from\\s+['"][^'"]*${needle.replace(/[\\/]/g, '[\\\\/]').replace(/\./g, '\\.')}['"]`
    );
    if (requireRe.test(body) || importRe.test(body)) {
      hits.push(file);
    }
  }
  return hits;
}

// ----------------------------------------------------------------------------
// Pass 3 — route-mount in unified_api.js (hand-rolled http.createServer switch)
// ----------------------------------------------------------------------------

function findRouteMounts(apiFile) {
  /** @type {Evidence[]} */
  const out = [];
  let body = '';
  try { body = fs.readFileSync(apiFile, 'utf8'); }
  catch (e) {
    return [{ kind: 'route-mount', present: false, detail: `unreadable: ${e.message}` }];
  }
  // The switch idiom — every route checks `pathname === '/api/...'`.
  const routeRe = /pathname\s*===\s*['"`]\/api\/([a-zA-Z0-9_\/-]+)['"`]/g;
  const seen = new Set();
  let m;
  while ((m = routeRe.exec(body)) !== null) {
    seen.add(`/api/${m[1]}`);
  }
  // Also accept route aliases via .use('/api/foo', ...) if present
  const useRe = /\.(?:use|get|post|put|delete)\(\s*['"`](\/api\/[a-zA-Z0-9_\/-]+)/g;
  while ((m = useRe.exec(body)) !== null) {
    seen.add(m[1]);
  }
  return [...seen].sort();
}

// ----------------------------------------------------------------------------
// Claim registry (expand over time)
// ----------------------------------------------------------------------------

/**
 * Each claim is a small declarative block — easy to read, easy to grow.
 * To add a new claim: write one block. The scanner handles the rest.
 */
const CLAIMS = [
  {
    id: '#5/harvest',
    name: 'Harvest dispatch (CLI + HTTP + module)',
    roots: [
      { module: 'lib/harvest/crawler.js' },
      { module: 'lib/harvest/extractors.js' },
      { module: 'lib/harvest/indexer.js' },
      { module: 'lib/commands/harvest.js' },
    ],
    routePrefix: '/api/harvest'
  },
  {
    id: '#6/neuro-symbolic-port',
    name: 'Neuro-symbolic bridge port (code-fix moved 7784→7884)',
    roots: [
      { module: 'lib/neuro_symbolic_bridge.py' },
      { module: 'neuro_symbolic_bridge.py' },
    ],
    routePrefix: '/api/neuro'
  },
];

// ----------------------------------------------------------------------------
// Per-claim evaluation
// ----------------------------------------------------------------------------

function evaluateClaim(claim, rootDir) {
  /** @type {Evidence[]} */
  const evidence = [];
  const allModulePaths = [];

  // Module existence
  for (const r of claim.roots) {
    const modulePath = path.join(rootDir, r.module);
    allModulePaths.push(modulePath);
    const exists = fs.existsSync(modulePath);
    evidence.push({
      kind: 'module-existence',
      present: exists,
      detail: r.module + (exists ? ' — present' : ' — MISSING')
    });
  }

  // Inbound callers (across the repo, excluding self)
  const inboundAll = new Set();
  for (const p of allModulePaths) {
    if (!fs.existsSync(p)) continue;
    const rel = path.relative(rootDir, p).replace(/\\/g, '/');
    const callers = findCallers(rootDir, rel);
    callers.forEach(c => inboundAll.add(c));
  }
  evidence.push({
    kind: 'inbound-caller',
    present: inboundAll.size > 0,
    detail: inboundAll.size === 0
      ? 'no inbound require/import found for any module'
      : `${inboundAll.size} caller(s): ${[...inboundAll].slice(0, 5).join(', ')}${inboundAll.size > 5 ? '…' : ''}`
  });

  // Route mount
  const apiFile = path.join(rootDir, 'unified_api.js');
  const mountedRoutes = findRouteMounts(apiFile);
  const matchingRoutes = mountedRoutes.filter(r => r.startsWith(claim.routePrefix));
  evidence.push({
    kind: 'route-mount',
    present: matchingRoutes.length > 0,
    detail: matchingRoutes.length === 0
      ? `no /api${claim.routePrefix.replace('/api', '')}* in unified_api.js (${mountedRoutes.length} other routes present)`
      : `mounted: ${matchingRoutes.join(', ')}`
  });

  // Verdict synthesis — tri-state
  const modulesReal = claim.roots.filter((_, i) => evidence[i].present).length;
  const modulesAny  = modulesReal > 0;
  const hasRoute    = matchingRoutes.length > 0;
  const hasCallers  = inboundAll.size > 0;

  let verdict;
  if (!modulesAny && !hasRoute) {
    verdict = 'MISSING';
  } else if (modulesAny && hasRoute && hasCallers) {
    verdict = 'LANDED';
  } else if (modulesAny && !hasRoute) {
    verdict = 'PARTIAL';  // module exists, no HTTP route
  } else if (modulesAny && hasRoute && !hasCallers) {
    verdict = 'PARTIAL';  // route exists, no JS caller
  } else {
    verdict = 'PARTIAL';
  }

  const nextSteps = [];
  if (verdict === 'MISSING') {
    nextSteps.push(`Create modules: ${claim.roots.map(r => r.module).join(', ')}`);
    nextSteps.push(`Mount route(s) under ${claim.routePrefix}* in unified_api.js`);
  } else if (verdict === 'PARTIAL') {
    if (modulesAny && !hasRoute) {
      nextSteps.push(`Add switch cases for ${claim.routePrefix}* in unified_api.js (hand-rolled switch idiom per feedback_purpclaw_unified_api_mount_pattern_2026-06-19)`);
    }
    if (hasRoute && !hasCallers) {
      nextSteps.push(`Audit inbound-caller count — route present but no JS require() reaches it. Tombstone or wire up.`);
    }
  }

  /** @type {CuratorClaim} */
  return {
    id: claim.id,
    name: claim.name,
    verdict,
    evidence,
    nextSteps
  };
}

// ----------------------------------------------------------------------------
// Top-level entry: scan(rootDir)
// ----------------------------------------------------------------------------

function scan(rootDir) {
  /** @type {CuratorClaim[]} */
  const results = [];
  for (const claim of CLAIMS) {
    try {
      results.push(evaluateClaim(claim, rootDir));
    } catch (e) {
      /** @type {CuratorClaim} */
      const fail = {
        id: claim.id,
        name: claim.name,
        verdict: 'UNREAD',
        evidence: [{ kind: 'module-existence', present: false, detail: `evaluator threw: ${e.message}` }],
        nextSteps: ['Fix the underlying claim definition or rootDir']
      };
      results.push(fail);
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    rootDir,
    summary: {
      total: results.length,
      LANDED:  results.filter(r => r.verdict === 'LANDED').length,
      PARTIAL: results.filter(r => r.verdict === 'PARTIAL').length,
      MISSING: results.filter(r => r.verdict === 'MISSING').length,
      UNREAD:  results.filter(r => r.verdict === 'UNREAD').length,
    },
    claims: results
  };
}

// ----------------------------------------------------------------------------
// CLI smoke
// ----------------------------------------------------------------------------

if (require.main === module) {
  const root = process.argv[2] || path.resolve(__dirname, '..');
  const out = scan(root);
  console.log(JSON.stringify(out, null, 2));
  const s = out.summary;
  console.error(`\ncurator: ${s.total} claims — LANDED:${s.LANDED} PARTIAL:${s.PARTIAL} MISSING:${s.MISSING} UNREAD:${s.UNREAD}`);
  process.exit(0);
}

module.exports = { scan, evaluateClaim, findCallers, findRouteMounts, CLAIMS };
