'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '0.1.0-omnicode-first';
const DEFAULT_IGNORES = [
  'node_modules', '.next', '.claude', '.git', 'dist', 'build', 'coverage',
  '.donors', 'STRESS',
];
// Directory names excluded at ANY depth — not just the repo root. Without
// this, nested deps and build output (omnicode-platform/.../dist,
// puzzle-stream/node_modules, sub-project /.next, Python venvs, etc.) leaked
// into the scan and inflated the file count with code nobody authored.
// Deps are installed separately and are not part of the codebase — skip them.
const DEFAULT_EXCLUDE_SEGMENTS = [
  'node_modules', '.next', '_next', 'dist', 'build', 'out', 'coverage',
  '.git', '.cache', '.turbo', '.vercel', '.parcel-cache', 'vendor',
  '__pycache__', '.venv', 'venv', 'site-packages', '.pytest_cache',
  '.mypy_cache', '.omnicode', 'agent_work', '.donors',
];

const FILE_KINDS = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
  '.mjs': 'esm', '.cjs': 'cjs', '.json': 'json', '.html': 'html',
  '.css': 'css', '.scss': 'scss', '.md': 'markdown', '.py': 'python',
  '.sh': 'shell', '.bat': 'batch', '.ps1': 'powershell', '.mdx': 'mdx',
};

const IMPORT_RE = /(?:import\s+(?:[^'"]+from\s+)?|require\s*\(\s*|import\s*\(\s*|export\s+(?:[^'"]+from\s+))['"]([^'"]+)['"]/g;
const ROUTE_EXPORT_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/gi;
const FETCH_RE = /(?:fetch|apiProxyUrl|api)\s*\(\s*['"`]([^'"`]+?)['"`]\s*[,)]/g;

const GOD_FILE_LINE_THRESHOLD = 600;
const GOD_FILE_EXPORT_THRESHOLD = 20;

function kindOf(name) {
  const m = name.toLowerCase().match(/\.[^./]+$/);
  return m ? (FILE_KINDS[m[0]] || ('other:' + m[0].slice(1))) : 'unknown';
}

function listFiles(root, ignores) {
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (ignores.some(p => rel === p || rel.startsWith(p + '/'))) continue;
      if (DEFAULT_EXCLUDE_SEGMENTS.some(s => rel.split('/').includes(s))) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        let lineCount = 0;
        if (/\.(ts|tsx|js|jsx|mjs|cjs|py|sh|md|mdx|html|css|scss)$/i.test(entry.name)) {
          try { lineCount = fs.readFileSync(full, 'utf8').split('\n').length; } catch {}
        }
        out.push({ path: rel, kind: kindOf(entry.name), bytes: stat.size, lines: lineCount, mtime: stat.mtimeMs });
      }
    }
  }
  walk(root);
  return out;
}

function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }

function resolveImport(fromFile, toSpec, root) {
  if (!toSpec || !toSpec.startsWith('.')) return null;
  const fromDir = path.dirname(path.join(root, fromFile));
  const candidate = path.resolve(fromDir, toSpec);
  const tries = [
    candidate,
    candidate + '.ts', candidate + '.tsx', candidate + '.js', candidate + '.jsx',
    candidate + '.mjs', candidate + '.cjs', candidate + '.json',
    path.join(candidate, 'index.ts'), path.join(candidate, 'index.tsx'),
    path.join(candidate, 'index.js'), path.join(candidate, 'index.json'),
  ];
  for (const t of tries) {
    if (fs.existsSync(t) && fs.statSync(t).isFile()) {
      return path.relative(root, t).replace(/\\/g, '/');
    }
  }
  return null;
}

function extractImports(files, root) {
  const out = [];
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f.path)) continue;
    const text = readText(path.join(root, f.path));
    if (!text) continue;
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(text)) !== null) {
      out.push({
        from: f.path, spec: m[1],
        resolved: resolveImport(f.path, m[1], root),
        kind: m[1].startsWith('.') ? 'relative' : (m[1].startsWith('@/') ? 'alias' : 'external'),
      });
    }
  }
  return out;
}

function extractRoutes(files, root) {
  const out = [];
  for (const f of files) {
    if (!f.path.startsWith('app/api/') || !f.path.endsWith('/route.ts')) continue;
    const text = readText(path.join(root, f.path));
    ROUTE_EXPORT_RE.lastIndex = 0;
    const methods = [];
    let m;
    while ((m = ROUTE_EXPORT_RE.exec(text)) !== null) methods.push(m[1].toUpperCase());
    const urlPath = '/' + f.path.replace(/^app\/api/, '').replace(/\/route\.ts$/, '').replace(/\[([^\]]+)\]/g, ':$1').replace(/\/index$/, '');
    out.push({ file: f.path, urlPath, methods, hasDynamicExport: /export const dynamic\s*=/.test(text), hasRuntime: /export const runtime\s*=/.test(text) });
  }
  return out;
}

function extractStaticAssets(root) {
  const out = [];
  const pubDir = path.join(root, 'public');
  if (!fs.existsSync(pubDir)) return out;
  function walk(dir, prefix) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, prefix + '/' + e.name);
      else if (e.isFile()) {
        let stat; try { stat = fs.statSync(full); } catch { continue; }
        out.push({ urlPath: (prefix + '/' + e.name).replace(/\\/g, '/'), file: path.relative(root, full).replace(/\\/g, '/'), kind: kindOf(e.name), bytes: stat.size });
      }
    }
  }
  walk(pubDir, '');
  return out;
}

function extractServices(root) {
  const out = [];
  const portsFile = path.join(root, 'lib', 'runtime', 'ports.js');
  if (fs.existsSync(portsFile)) {
    const text = readText(portsFile);
    const re = /\{\s*id:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"],\s*port:\s*PORTS\.([A-Z_0-9]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) out.push({ id: m[1], name: m[2], portSymbol: m[3], declaredIn: 'lib/runtime/ports.js' });
  }
  const eco = path.join(root, 'ecosystem.config.js');
  if (fs.existsSync(eco)) {
    const text = readText(eco);
    const re = /name:\s*['"]([^'"]+)['"],\s*script:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!out.find(s => s.id === m[1])) out.push({ id: m[1], name: m[1], script: m[2], declaredIn: 'ecosystem.config.js' });
    }
  }
  return out;
}

function extractFeatureCandidates(files, root) {
  const out = [];
  const pageRe = /^(app\/.+?)\/page\.tsx$/;
  for (const f of files) {
    const m = pageRe.exec(f.path);
    if (!m) continue;
    const dir = m[1];
    const id = dir.split('/').pop();
    const candidates = { pages: [f.path], routes: [], components: [], agents: [] };
    const route = dir + '/route.ts';
    if (files.find(x => x.path === route)) candidates.routes.push(route);
    const compFile = 'app/components/' + id + '.tsx';
    if (files.find(x => x.path === compFile)) candidates.components.push(compFile);
    if (id) {
      try {
        const tower = readText(path.join(root, 'agent_tower.js'));
        if (tower.includes("'" + id + "'")) candidates.agents.push('agent_tower');
        const unified = readText(path.join(root, 'unified_api.js'));
        if (unified.includes("'" + id + "'")) candidates.agents.push('unified_api');
      } catch {}
    }
    out.push({ id, dir, candidates });
  }
  return out;
}

function detectBrokenLinks(imports) {
  return imports.filter(i => i.kind === 'relative' && i.resolved === null).map(i => ({ from: i.from, toSpecifier: i.spec, reason: 'relative import not resolvable' }));
}

function detectMissingRoutes(files, routes, root) {
  const known = new Set(routes.map(r => r.urlPath));
  const out = [];
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx)$/.test(f.path)) continue;
    const text = readText(path.join(root, f.path));
    if (!text) continue;
    FETCH_RE.lastIndex = 0;
    let m;
    while ((m = FETCH_RE.exec(text)) !== null) {
      const url = m[1];
      if (!url.includes('/api/') && !url.startsWith('/api/')) continue;
      const p = url.split('?')[0].split('#')[0];
      if ([...known].some(r => r === p || r.startsWith(p + '/') || p.startsWith(r.split('/[')[0]))) continue;
      out.push({ file: f.path, url: p });
    }
  }
  const seen = new Set();
  return out.filter(x => { const k = x.file + '::' + x.url; if (seen.has(k)) return false; seen.add(k); return true; });
}

function detectGodFiles(files) {
  return files.filter(f => f.lines >= GOD_FILE_LINE_THRESHOLD).sort((a, b) => b.lines - a.lines).slice(0, 25).map(f => ({ path: f.path, lines: f.lines, threshold: GOD_FILE_LINE_THRESHOLD }));
}

function detectCycles(imports) {
  const adj = new Map();
  for (const i of imports) {
    if (i.kind === 'external' || !i.resolved) continue;
    if (!adj.has(i.from)) adj.set(i.from, new Set());
    adj.get(i.from).add(i.resolved);
  }
  let idx = 0;
  const stack = [], onStack = new Set();
  const index = new Map(), lowlink = new Map();
  const cycles = [];
  function strongconnect(v) {
    index.set(v, idx); lowlink.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    const succs = adj.get(v) || new Set();
    for (const w of succs) {
      if (!index.has(w)) { strongconnect(w); lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w))); }
      else if (onStack.has(w)) lowlink.set(v, Math.min(lowlink.get(v), index.get(w)));
    }
    if (lowlink.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) cycles.push(comp);
    }
  }
  for (const v of adj.keys()) if (!index.has(v)) strongconnect(v);
  return cycles.map(c => c.sort());
}

function detectDeadLike(files, imports) {
  const inbound = new Map();
  for (const f of files) {
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(f.path)) inbound.set(f.path, 0);
  }
  for (const i of imports) { if (i.resolved && inbound.has(i.resolved)) inbound.set(i.resolved, inbound.get(i.resolved) + 1); }
  const exempt = (p) => /^(app\/page\.tsx|app\/layout\.tsx|next\.config|tsconfig|package\.json|README|AGENT\.md|LOOP\.md|ecosystem\.config)/i.test(p);
  return files.filter(f => /\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(f.path) && (inbound.get(f.path) || 0) === 0 && !exempt(f.path)).map(f => ({ path: f.path, kind: f.kind, lines: f.lines, reason: 'zero inbound references among .ts/.tsx/.js (not classified as dead)' }));
}

function hashOf(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

function printHeadline(snap, elapsedMs, source) {
  console.log('OMNI-SURGEON Phase One — Repo Truth Scanner');
  console.log('  source:  ' + source);
  console.log('  repo:    ' + snap.repoRoot);
  console.log('  hash:    ' + (snap.contentHash || '(n/a)'));
  console.log('  elapsed: ' + elapsedMs + 'ms');
  console.log('  ──────');
  if (snap.scanStats) {
    for (const k of Object.keys(snap.scanStats)) {
      console.log('  ' + k.padEnd(15) + ' ' + snap.scanStats[k]);
    }
  }
}

function runInhouseWalker(root, outPath, t0) {
  const files = listFiles(root, DEFAULT_IGNORES);
  const imports = extractImports(files, root);
  const routes = extractRoutes(files, root);
  const staticAssets = extractStaticAssets(root);
  const services = extractServices(root);
  const features = extractFeatureCandidates(files, root);
  const brokenLinks = detectBrokenLinks(imports);
  const missingRoutes = detectMissingRoutes(files, routes, root);
  const godFiles = detectGodFiles(files);
  const cycles = detectCycles(imports);
  const deadLike = detectDeadLike(files, imports);
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repoRoot: path.resolve(root),
    scanStats: {
      files: files.length, imports: imports.length, routes: routes.length,
      staticAssets: staticAssets.length, services: services.length, features: features.length,
      brokenLinks: brokenLinks.length, missingRoutes: missingRoutes.length,
      godFiles: godFiles.length, cycles: cycles.length, deadLike: deadLike.length,
      elapsedMs: Date.now() - t0,
    },
    files, imports, routes, staticAssets, services, features,
    brokenLinks, missingRoutes, godFiles, cycles, deadLike,
    readme: {
      doctrine: 'Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed.',
      cycle: 'OMNI-SURGEON Phase One (Cycle 8)',
      source: 'in-house walker (OMNICODE unavailable or --no-omnicode set)',
    },
  };
  snapshot.contentHash = hashOf(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    scanStats: snapshot.scanStats,
    files: files.map(f => ({ p: f.path, l: f.lines })),
    routes: routes.map(r => ({ p: r.urlPath, m: r.methods.sort() })),
  }));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  const logPath = path.join(path.dirname(outPath), 'truth-scan.jsonl');
  const line = JSON.stringify({ at: snapshot.generatedAt, hash: snapshot.contentHash, stats: snapshot.scanStats, source: 'in-house' }) + '\n';
  try { fs.appendFileSync(logPath, line); } catch { /* ignore */ }
  printHeadline(snapshot, Date.now() - t0, 'in-house');
}

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let outPath = null;
  // Default to the in-house walker. The OMNICODE backend returns a valid file
  // count but BROKEN analysis (imports/services/features near-zero, empty data
  // arrays) — verified: in-house finds 2249 imports / 52 services / 18
  // features where OMNICODE reports 3 / 0 / 0. Until the omnicode-adapter
  // mapping is fixed, in-house is the trustworthy default. Opt back in with
  // --omnicode once the backend extraction is repaired.
  let useOmnicode = process.argv.includes('--omnicode');
  let noFallback = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i+1]) { root = path.resolve(args[i+1]); i++; }
    else if (args[i] === '--out' && args[i+1]) { outPath = path.resolve(args[i+1]); i++; }
    else if (args[i] === '--no-omnicode') { useOmnicode = false; }
    else if (args[i] === '--no-fallback') { noFallback = true; }
  }
  if (!outPath) outPath = path.join(root, 'agent_work', 'omni', 'truth-snapshot.json');
  const t0 = Date.now();
  if (useOmnicode) {
    try {
      const { createOmnicodeClient } = require('./omnicode-adapter');
      const client = createOmnicodeClient();
      Promise.resolve(client.available()).then(async (ok) => {
        if (!ok) {
          if (noFallback) { console.error('OMNICODE unavailable, --no-fallback set; aborting.'); process.exit(2); }
          console.log('OMNICODE unavailable, falling back to in-house walker.');
          return runInhouseWalker(root, outPath, t0);
        }
        console.log('OMNICODE available — using it as repo truth backend.');
        const snap = await client.truthSnapshot(root, { useFallback: !noFallback });
        if (snap.degraded) {
          console.log('OMNICODE returned degraded snapshot:', snap.reason);
          if (noFallback) { process.exit(2); }
          return runInhouseWalker(root, outPath, t0);
        }
        // Sanity-gate the backend's ANALYSIS, not just availability. The
        // OMNICODE backend has been observed returning a valid file count but
        // near-empty extraction (imports:3, services:0, features:0) for a large
        // JS repo where the in-house walker finds thousands. That garbage made
        // the OMNI truth-scan untrustworthy. Validate, don't trust: if the
        // analysis is implausibly empty, fall back to the in-house walker.
        // The backend stores real data in top-level arrays (snap.files/imports/
        // services) and sometimes leaves scanStats all-zero — so count the
        // arrays, falling back to scanStats only if the arrays are absent.
        const _st = snap.scanStats || snap.stats || {};
        const _len = (arr, statKey) => Array.isArray(arr) ? arr.length : (_st[statKey] || 0);
        const _files = _len(snap.files, 'files');
        const _imports = _len(snap.imports, 'imports');
        const _services = _len(snap.services, 'services');
        const _implausible = (_files > 100) &&
          ((_imports < 20) || (_services === 0 && fs.existsSync(path.join(root, 'ecosystem.config.js'))));
        if (_implausible) {
          console.log(`OMNICODE backend analysis implausible (files=${_files}, imports=${_imports}, services=${_services}) — falling back to in-house walker.`);
          if (noFallback) { process.exit(2); }
          return runInhouseWalker(root, outPath, t0);
        }
        snap.schemaVersion = SCHEMA_VERSION;
        const elapsed = Date.now() - t0;
        snap.scanStats = snap.scanStats || {};
        snap.scanStats.elapsedMs = elapsed;
        snap.contentHash = hashOf(JSON.stringify(snap.omnicodeOutputs || snap));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(snap, null, 2));
        printHeadline(snap, elapsed, 'omnicode');
        await client.close();
        const logPath = path.join(path.dirname(outPath), 'truth-scan.jsonl');
        const line = JSON.stringify({ at: snap.generatedAt, hash: snap.contentHash, stats: snap.scanStats, source: 'omnicode' }) + '\n';
        try { fs.appendFileSync(logPath, line); } catch { /* ignore */ }
      }).catch((e) => {
        if (noFallback) { console.error('OMNICODE truthSnapshot failed:', e.message); process.exit(2); }
        console.log('OMNICODE truthSnapshot failed:', e.message, '— falling back to in-house walker.');
        runInhouseWalker(root, outPath, t0);
      });
      // Safety net: force-exit after the IIFE settles so the event loop
      // does not hang on the closed stdio streams of the OMNICODE child.
      setTimeout(() => { try { process.exit(0); } catch (_) {} }, 5000);
      return;
      // is fully reaped AND the JSON is written, force-exit to avoid
      // the event loop hanging on the closed stdio streams.
      // We schedule this after a generous delay to let the IIFE
      // settle naturally first.
      setTimeout(() => { try { process.exit(0); } catch (_) {} }, 5000);
      return;
    } catch (e) {
      if (noFallback) { console.error('OMNICODE adapter init failed:', e.message); process.exit(2); }
      console.log('OMNICODE adapter init failed:', e.message, '— falling back to in-house walker.');
    }
  }
  return runInhouseWalker(root, outPath, t0);
}
if (require.main === module) main();
module.exports = { main, listFiles, extractImports, extractRoutes, extractStaticAssets, extractServices, extractFeatureCandidates, detectBrokenLinks, detectMissingRoutes, detectGodFiles, detectCycles, detectDeadLike, hashOf, SCHEMA_VERSION };
