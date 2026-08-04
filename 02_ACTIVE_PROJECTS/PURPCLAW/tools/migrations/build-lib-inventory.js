#!/usr/bin/env node
'use strict';
// Phase 0 of the canonical filesystem migration: inventory + ownership.
//
// READ ONLY. Writes only to data/migrations/ and docs/architecture/.
//
// Produces:
//   data/migrations/lib-classification.json  one record per lib/ file
//   data/migrations/import-graph.json        forward + reverse edges, repo-wide
//   data/migrations/path-crosswalk.json      source -> destination
//   docs/architecture/FILESYSTEM_MIGRATION_MANIFEST.md
//
// The reverse graph is built across the WHOLE repo, not just lib/. A lib file
// with no importers inside lib/ is not dead if bin/purpclaw.js requires it,
// and the previous generator's empty importedBy arrays were exactly that bug.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

const SCAN_DIRS = ['lib', 'bin', 'services', 'packages', 'apps', 'scripts', 'parity', 'podcast_studio'];
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  'vendor', '.worktrees', '.versioning', '.audit', 'public']);

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const allFiles = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), allFiles);
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (e.isFile() && /\.(js|cjs|mjs)$/.test(e.name)) allFiles.push(path.join(ROOT, e.name));
}

const src = new Map();
for (const f of allFiles) { try { src.set(f, fs.readFileSync(f, 'utf8')); } catch { /* unreadable */ } }

function resolveLocal(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, base + '.js', base + '.cjs', base + '.mjs',
    path.join(base, 'index.js'), path.join(base, 'index.cjs'), path.join(base, 'index.mjs')]) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* next candidate */ }
  }
  return null;
}

// --- forward edges -----------------------------------------------------------
const RE_REQ = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const RE_IMP = /\bfrom\s+['"]([^'"]+)['"]/g;

const forward = new Map();   // file -> {local:[resolved], bare:[], unresolved:[spec]}
for (const [f, text] of src) {
  const local = new Set(), bare = new Set(), unresolved = new Set();
  for (const re of [RE_REQ, RE_IMP]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[1];
      if (!spec.startsWith('.')) { bare.add(spec); continue; }
      const r = resolveLocal(f, spec);
      if (r) local.add(r); else unresolved.add(spec);
    }
  }
  forward.set(f, { local: [...local], bare: [...bare], unresolved: [...unresolved] });
}

// --- reverse edges -----------------------------------------------------------
const reverse = new Map();
for (const [f, edges] of forward) {
  for (const t of edges.local) {
    if (!reverse.has(t)) reverse.set(t, new Set());
    reverse.get(t).add(f);
  }
}

// --- runtime owners: which PM2 service transitively reaches each file --------
const owners = new Map();   // file -> Set(pm2 names)
let ecosystemApps = [];
try {
  const eco = require(path.join(ROOT, 'ecosystem.config.js'));
  ecosystemApps = (eco.apps || []).map(a => ({ name: a.name, script: a.script }));
} catch (e) {
  console.error('[warn] ecosystem.config.js unreadable: ' + e.message);
}
for (const app of ecosystemApps) {
  if (!app.script) continue;
  const entry = path.resolve(ROOT, app.script);
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (!owners.has(cur)) owners.set(cur, new Set());
    owners.get(cur).add(app.name);
    for (const t of (forward.get(cur)?.local || [])) stack.push(t);
  }
}
// The CLI is an entrypoint too, even though PM2 never launches it.
{
  const cli = path.join(ROOT, 'bin', 'purpclaw.js');
  if (src.has(cli)) {
    const seen = new Set(); const stack = [cli];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (!owners.has(cur)) owners.set(cur, new Set());
      owners.get(cur).add('cli');
      for (const t of (forward.get(cur)?.local || [])) stack.push(t);
    }
  }
}

// --- state ownership ---------------------------------------------------------
// A file "owns" state if it names a concrete persistence target. Literal paths
// only: a variable holding a path tells us nothing without evaluating it, and
// evaluating untrusted repo code to build an inventory is a bad trade.
const RE_STATE = /['"`]([^'"`\s]*\.(?:json|jsonl|db|sqlite|sqlite3|ndjson|log))['"`]/g;
const RE_WRITES = /fs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)|DatabaseSync\(/;
function stateOwnedFor(text) {
  if (!RE_WRITES.test(text)) return [];
  const found = new Set();
  RE_STATE.lastIndex = 0;
  let m;
  while ((m = RE_STATE.exec(text))) {
    const p = m[1];
    if (p.includes('node_modules') || p.startsWith('http')) continue;
    found.add(p);
  }
  return [...found].slice(0, 12);
}

// --- classification ----------------------------------------------------------
const RULES = [
  // Test files first: a test named routing-decisions.test.js is a test, not routing.
  [/__tests__|test-helper|fixture|\.test\.js$|\.spec\.js$/, 'test-helper'],
  [/^lib\/memory|memory-|cognitive|recall|spine\//, 'memory'],
  [/^lib\/session|session-/, 'session'],
  [/permission|governance|guardrail|path-security|approval/, 'tool-runtime'],
  [/^lib\/tool-runtime|^lib\/tools\/|^lib\/tools-/, 'tool-implementation'],
  [/^lib\/tools\.js$/, 'tool-runtime'],
  [/provider|llm-|model-registry|anthropic|openai|ollama|minimax/, 'provider'],
  [/router|routing|steering|dispatch/, 'routing'],
  [/orchestrat|pipeline|workflow|job-|swarm|queue|scheduler/, 'orchestration'],
  [/^lib\/harness|harness-/, 'harness'],
  [/council|organisation|organization|crew|team|agent-registry|delegation/, 'organisation'],
  [/studio|ecology|podcast|mochi|buddy|remotion|media/, 'studio'],
  [/^lib\/commands\//, 'service-adapter'],
  [/-client\.js$|-adapter\.js$|gateway/, 'service-adapter'],
  [/__tests__|test-helper|fixture|\.test\.js$|\.spec\.js$/, 'test-helper'],
  [/legacy|deprecated|-old|-v1\.js$/, 'legacy'],
  [/^lib\/generated\/|\.generated\./, 'generated'],
  [/agent-loop|agent-gateway|agent-router|runtime\//, 'core-runtime'],
];
const DEST = {
  memory: 'packages/memory', session: 'packages/core/session',
  'tool-runtime': 'packages/tools/runtime', 'tool-implementation': 'packages/tools',
  provider: 'packages/core/providers', routing: 'packages/core/routing',
  orchestration: 'packages/core/orchestration', harness: 'packages/harness-core',
  organisation: 'packages/core/organisation', studio: 'packages/studio',
  'service-adapter': 'packages/core/adapters', 'core-runtime': 'packages/core/runtime',
  compatibility: 'packages/core/compat', 'test-helper': 'tests/fixtures',
  legacy: 'docs/archive', generated: 'var/artifacts', unknown: 'var/quarantine',
};

function classify(relPath, text) {
  // A file whose whole body is a re-export is a wrapper, whatever it is named.
  if (/^\s*(?:'use strict';\s*)?module\.exports\s*=\s*require\([^)]+\);\s*$/m.test(text)
      && text.replace(/\s|\/\/.*$/gm, '').length < 160) return 'compatibility';
  for (const [re, cls] of RULES) if (re.test(relPath)) return cls;
  return 'unknown';
}

// --- build records -----------------------------------------------------------
const libFiles = allFiles.filter(f => rel(f).startsWith('lib/')).sort();
const records = {};
let unresolvedTotal = 0;

for (const f of libFiles) {
  const r = rel(f);
  const text = src.get(f) || '';
  const edges = forward.get(f) || { local: [], bare: [], unresolved: [] };
  const importedBy = [...(reverse.get(f) || [])].map(rel).sort();
  const cls = classify(r, text);
  const own = [...(owners.get(f) || [])].sort();
  const state = stateOwnedFor(text);
  unresolvedTotal += edges.unresolved.length;

  // bin/purpclaw.js:6104 resolves `lib/commands/<name>.js` from the argv at
  // call time. A static import graph cannot see that edge, so every command
  // module would otherwise look orphaned. Reachability here is structural, not
  // inferred.
  const dynamicCli = /^lib\/commands\/[^/]+\.js$/.test(r);
  if (dynamicCli) own.push('cli(dynamic)');

  const evidence = [];
  evidence.push(`${importedBy.length} static importer(s) repo-wide`);
  if (dynamicCli) evidence.push('CLI command module — loaded dynamically at bin/purpclaw.js:6104, invisible to static analysis');
  if (own.length) evidence.push(`reached from: ${own.join(', ')}`);
  else evidence.push('not reachable from any PM2 entrypoint or the CLI');
  if (edges.unresolved.length) evidence.push(`BROKEN: unresolved requires -> ${edges.unresolved.join(', ')}`);
  if (state.length) evidence.push(`writes: ${state.join(', ')}`);

  // Status is reachability, not classification confidence. A file can be
  // classification:"unknown" (the heuristic did not recognise it) and still be
  // unambiguously live — lib/child-registry.js has 11 importers.
  let status = 'live';
  if (edges.unresolved.length) status = 'broken';
  else if (cls === 'compatibility') status = 'stub';
  else if (cls === 'legacy') status = 'legacy';
  else if (cls === 'test-helper') status = 'test-helper';
  else if (!importedBy.length && !own.length) status = 'orphan';

  // Risk is fan-in plus breakage plus state ownership: moving a file that 20
  // modules import and that owns a database is not the same job as moving a
  // leaf helper.
  let risk = 'low';
  if (importedBy.length >= 3 || state.length) risk = 'medium';
  if (importedBy.length >= 8 || own.length >= 2) risk = 'high';
  if (edges.unresolved.length && (own.length || importedBy.length >= 3)) risk = 'critical';

  const BATCH = { memory: '1-memory-sessions', session: '1-memory-sessions',
    'tool-runtime': '2-permissions-tools', 'tool-implementation': '8-utilities-tools',
    provider: '3-providers-routing', routing: '3-providers-routing',
    orchestration: '4-orchestration-pipeline', harness: '5-harness',
    organisation: '6-organisation-council', studio: '7-studio-ecology',
    'core-runtime': '2-permissions-tools', 'service-adapter': '8-utilities-tools',
    compatibility: '9-compatibility', legacy: '9-compatibility',
    'test-helper': '9-compatibility', generated: '9-compatibility', unknown: '9-compatibility' };

  records[r] = {
    source: r,
    destination: `${DEST[cls]}/${path.basename(r)}`,
    classification: cls,
    entrypoint: /^#!/.test(text) || ecosystemApps.some(a => a.script && path.resolve(ROOT, a.script) === f),
    importedBy,
    imports: edges.local.map(rel).sort(),
    stateOwned: state,
    runtimeOwner: own.length ? own.join('+') : null,
    migrationBatch: BATCH[cls],
    risk,
    status,
    evidence,
  };
}

// --- duplicate detection: same basename already living under packages/ -------
const pkgByBase = new Map();
for (const f of allFiles) {
  const r = rel(f);
  if (!r.startsWith('packages/')) continue;
  const b = path.basename(r);
  if (!pkgByBase.has(b)) pkgByBase.set(b, []);
  pkgByBase.get(b).push(r);
}
let duplicates = 0;
for (const [r, rec] of Object.entries(records)) {
  const twins = pkgByBase.get(path.basename(r));
  if (!twins) continue;
  duplicates++;
  rec.evidence.push(`possible duplicate of ${twins.join(', ')} — compare before choosing a winner, do NOT assume packages/ wins`);
  if (rec.status === 'live') rec.status = 'duplicate';
}

// --- outputs -----------------------------------------------------------------
const OUT = path.join(ROOT, 'data', 'migrations');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'docs', 'architecture'), { recursive: true });

const write = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
write(path.join(OUT, 'lib-classification.json'), records);

const graph = {};
for (const [f, edges] of forward) {
  graph[rel(f)] = {
    imports: edges.local.map(rel).sort(),
    importedBy: [...(reverse.get(f) || [])].map(rel).sort(),
    external: edges.bare.sort(),
    unresolved: edges.unresolved.sort(),
  };
}
write(path.join(OUT, 'import-graph.json'), graph);

const crosswalk = {};
for (const [r, rec] of Object.entries(records)) crosswalk[r] = rec.destination;
write(path.join(OUT, 'path-crosswalk.json'), crosswalk);

// --- blockers ----------------------------------------------------------------
const brokenTargets = new Map();
for (const [f, edges] of forward) {
  for (const spec of edges.unresolved) {
    const key = rel(path.resolve(path.dirname(f), spec));
    if (!brokenTargets.has(key)) brokenTargets.set(key, new Set());
    brokenTargets.get(key).add(rel(f));
  }
}
const blockers = [...brokenTargets.entries()]
  .map(([t, refs]) => ({ target: t, refs: [...refs].sort() }))
  .sort((a, b) => b.refs.length - a.refs.length);
write(path.join(OUT, 'unresolved-imports.json'), blockers);

const byClass = {};
const byStatus = {};
for (const rec of Object.values(records)) {
  byClass[rec.classification] = (byClass[rec.classification] || 0) + 1;
  byStatus[rec.status] = (byStatus[rec.status] || 0) + 1;
}

const stamp = process.env.MIGRATION_STAMP || 'see git log';
const md = `# Filesystem Migration Manifest

Generated by \`tools/migrations/build-lib-inventory.js\`. Do not hand-edit —
regenerate. Baseline tag: \`pre-canonical-filesystem-migration\`.
Generated: ${stamp}

## Scope

| metric | value |
|---|---|
| source files scanned repo-wide | ${allFiles.length} |
| \`lib/\` files classified | ${libFiles.length} |
| unresolved local imports (repo-wide) | ${unresolvedTotal} |
| distinct missing modules | ${blockers.length} |
| possible packages/ duplicates | ${duplicates} |

## Migration readiness

${blockers.length
  ? `**NOT READY.** ${blockers.length} import targets do not resolve. Moving files\nwhile the graph is broken copies the damage into \`packages/\` and makes it look\nintentional. Phase 3 is blocked until this reaches zero or every survivor is a\ndeliberate, recorded stub.`
  : 'Import graph resolves cleanly. Phase 3 may proceed batch by batch.'}

## Classification

| classification | files |
|---|---|
${Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Status

| status | files |
|---|---|
${Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Missing modules, by fan-in

Every row is a hard or soft import target that does not exist on disk.

| refs | missing target | first referenced by |
|---|---|---|
${blockers.slice(0, 60).map(b => `| ${b.refs.length} | \`${b.target}\` | ${b.refs.slice(0, 2).map(r => `\`${r}\``).join(', ')} |`).join('\n')}
${blockers.length > 60 ? `\n_${blockers.length - 60} further targets omitted; see \`data/migrations/unresolved-imports.json\` for the complete list._` : ''}

## Batches

Order is fixed by the migration contract. A batch may not start until the
previous one has zero remaining callers of its compatibility wrappers.

| batch | files |
|---|---|
${Object.entries(Object.values(records).reduce((a, r) => { a[r.migrationBatch] = (a[r.migrationBatch] || 0) + 1; return a; }, {})).sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Rules this manifest encodes

- \`importedBy\` is repo-wide, not \`lib/\`-local. A file with no \`lib/\` importer is
  not dead if \`bin/purpclaw.js\` requires it.
- \`runtimeOwner\` is derived by walking the real import graph out from each
  \`ecosystem.config.js\` script plus the CLI — not from naming.
- A \`duplicate\` status means a same-named file exists under \`packages/\`. It does
  **not** mean the \`packages/\` copy wins. Compare implementations and prove which
  one the running process loads.
- \`stateOwned\` lists literal persistence paths only. A path built from variables
  is invisible here; check by hand before moving anything marked \`high\` risk.
`;
fs.writeFileSync(path.join(ROOT, 'docs', 'architecture', 'FILESYSTEM_MIGRATION_MANIFEST.md'), md);

console.log(`scanned ${allFiles.length} files, classified ${libFiles.length} lib files`);
console.log(`unresolved imports: ${unresolvedTotal} across ${blockers.length} missing modules`);
console.log(`duplicates vs packages/: ${duplicates}`);
console.log('status:', JSON.stringify(byStatus));
console.log('wrote data/migrations/{lib-classification,import-graph,path-crosswalk,unresolved-imports}.json');
console.log('wrote docs/architecture/FILESYSTEM_MIGRATION_MANIFEST.md');
