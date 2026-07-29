'use strict';
/**
 * lib/repo-mapper.js
 *
 * PageRank-inspired structural repo mapper.
 * Builds a ranked map of the project by crawling the file tree and scoring
 * files by their connectivity (how many other files reference them).
 *
 * Supports:
 *   REPO_MAP=1 env flag         — auto-enable injection
 *   REPO_MAP_TOKENS=2048        — token budget (default 2048)
 *   --repo-map / --no-repo-map  — CLI flags (parsed upstream)
 *
 * Output format (markdown):
 *   ## Repo Map (top-N files by connectivity)
 *   ### Core
 *   [file paths ranked by reference count]
 *   ### Config
 *   ...
 */

const fs   = require('fs');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────
const TOKEN_BUDGET = parseInt(process.env.REPO_MAP_TOKENS || '2048', 10);

// Extensions to scan for references (source files)
const SCAN_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx',
  '.py', '.rs', '.go', '.java', '.rb', '.php', '.cs', '.swift',
  '.vue', '.svelte', '.css', '.scss', '.less',
  '.html', '.htm', '.xml', '.yaml', '.yml', '.toml', '.json',
  '.md', '.mdx', '.txt', '.sh', '.bash', '.zsh', '.ps1',
  '.h', '.hpp', '.cpp', '.c', '.h', '.hxx',
]);

// Directories to always exclude
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', 'target', 'coverage', '.nyc_output',
  '.parcel-cache', '.next', '.nuxt', '.vite', '.webpack',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  'vendor', 'packages', '.pnpm-store', '.yarn-cache',
  '.DS_Store', 'Thumbs.db',
]);

// Files to always exclude from map
const EXCLUDE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock',
  'bun.lockb', 'Gemfile.lock', 'Cargo.lock', 'composer.lock',
  '.npmrc', '.yarnrc', '.nvmrc', '.python-version',
  '.env', '.env.local', '.env.development', '.env.production',
  '.gitignore', '.gitattributes', '.editorconfig',
]);

// ── File reference scoring ──────────────────────────────────────────────────────

/**
 * Get all import/require/using statements from a file.
 * Returns a Set of file paths (absolute or relative) that this file references.
 */
function getReferences(filePath, content) {
  const refs = new Set();
  const ext = path.extname(filePath).toLowerCase();
  const dir  = path.dirname(filePath);
  const lines = content.split('\n');

  for (const line of lines) {
    // Strip comments
    const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');

    if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx'].includes(ext)) {
      // import x from 'path'  or  require('path')  or  import('path')
      const matches = stripped.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
      for (const m of matches) refs.add(m[1]);
      const requires = stripped.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const m of requires) refs.add(m[1]);
      const dynamic = stripped.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const m of dynamic) refs.add(m[1]);
    }

    if (['.py'].includes(ext)) {
      const pyImports = stripped.matchAll(/^(?:from|import)\s+([^\s;]+)/gm);
      for (const m of pyImports) refs.add(m[1]);
    }

    if (['.go'].includes(ext)) {
      const goImports = stripped.matchAll(/import\s+(?:\(\s*)?["']([^"']+)["']\s*\)?/g);
      for (const m of goImports) refs.add(m[1]);
    }

    if (['.rs'].includes(ext)) {
      const rustMod = stripped.matchAll(/mod\s+(\w+)/g);
      for (const m of rustMod) refs.add(m[1]);
      const rustUse = stripped.matchAll(/use\s+([^;]+);/g);
      for (const m of rustUse) refs.add(m[1]);
    }

    // Generic: relative path references (./foo, ../bar)
    const relRefs = stripped.matchAll(/['"]([.][^'"]+)['"]/g);
    for (const m of relRefs) {
      refs.add(m[1]);
    }
  }

  // Resolve relative refs to absolute paths
  const resolved = new Set();
  for (const ref of refs) {
    if (ref.startsWith('.')) {
      try {
        resolved.add(path.resolve(dir, ref));
      } catch { /* skip bad refs */ }
    }
  }

  return resolved;
}

/**
 * Build a graph of all source files and their reference counts.
 * Returns { scores: Map<filePath, score>, graph: Map<filePath, Set<filePath>> }
 */
function buildGraph(rootDir) {
  const files = [];
  const excluded = new Set();

  function crawl(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch { return; }

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry)) continue;
        crawl(full);
      } else {
        const ext = path.extname(entry).toLowerCase();
        if (SCAN_EXTS.has(ext) && !EXCLUDE_FILES.has(entry)) {
          files.push(full);
        }
      }
    }
  }

  crawl(rootDir);

  // Build graph: file → set of files it references
  const graph = new Map();
  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const refs = getReferences(f, content);
    const resolved = [];
    for (const ref of refs) {
      // Find which file this ref points to
      const refFile = findFile(ref, path.dirname(f), files);
      if (refFile) resolved.push(refFile);
    }
    graph.set(f, new Set(resolved));
  }

  // Score by in-degree (how many files reference this file)
  const scores = new Map();
  for (const f of files) scores.set(f, 0);

  for (const [, refs] of graph) {
    for (const ref of refs) {
      if (scores.has(ref)) scores.set(ref, scores.get(ref) + 1);
    }
  }

  return { scores, graph };
}

function findFile(ref, fromDir, allFiles) {
  // Try resolving ref as-is
  const candidates = [
    ref,
    ref + '.js',
    ref + '.ts',
    path.join(ref, 'index.js'),
    path.join(ref, 'index.ts'),
  ];
  for (const c of candidates) {
    const abs = path.resolve(fromDir, c);
    if (allFiles.includes(abs)) return abs;
  }
  return null;
}

// ── Token estimation ────────────────────────────────────────────────────────────
function estTokens(str) {
  return Math.ceil(str.length / 4);
}

// ── Generate markdown map ───────────────────────────────────────────────────────
function generateMap(rootDir, options = {}) {
  const maxTokens = options.maxTokens || TOKEN_BUDGET;
  const { scores } = buildGraph(rootDir);

  // Sort files by score descending
  const ranked = [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  // Group by directory
  const dirs = new Map();
  for (const [file, score] of ranked) {
    const dir = path.dirname(file).replace(rootDir, '').replace(/^[/\\]/, '') || '.';
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push({ file, score });
  }

  // Build markdown
  const lines = ['## Repo Map\n'];
  let tokens = estTokens(lines.join('\n'));

  for (const [dir, files] of dirs) {
    if (tokens >= maxTokens * 0.9) break;

    lines.push(`### ${dir}`);
    tokens += estTokens(`### ${dir}\n`);

    for (const { file, score } of files) {
      if (tokens >= maxTokens) break;
      const rel = path.relative(rootDir, file).replace(/\\/g, '/');
      const bar = '█'.repeat(Math.min(score, 10));
      lines.push(`- ${rel} ${'```score:' + score + '```'} ${bar}`);
      tokens += estTokens(rel) + 10;
    }
    lines.push('');
  }

  const note = `\n_Generated by PurpClaw repo-mapper · ${ranked.length} files ranked · ~${tokens} tokens_`;
  lines.push(note);

  return lines.join('\n');
}

// ── CLI entry ───────────────────────────────────────────────────────────────────
function runMap(options = {}) {
  const rootDir = options.root || process.cwd();
  return generateMap(rootDir, options);
}

module.exports = { buildGraph, generateMap, runMap, estTokens };
