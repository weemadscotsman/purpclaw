'use strict';

/**
 * lib/file-index.js
 * Trigram-based fuzzy file indexer.
 *
 * Build:    buildIndex(rootDir) → Promise<Map<filePath, {trigrams, mtime}>>
 * Search:   search(query, index) → [{path, score, matchType}]
 * Cache:    index cached at ~/.purpclaw/findex/<hash>.json, refreshed on mtime change
 *
 * No external deps. Node.js stdlib only.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = (() => {
  const home = process.env.USERPROFILE || process.env.HOME;
  const d = path.join(home, '.purpclaw', 'findex');
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
})();

// ── Trigram helpers ───────────────────────────────────────────────────────

function getTrigrams(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = s.split(/\s+/).filter(Boolean);
  const grams = new Set();
  for (const w of words) {
    if (w.length < 2) continue;
    for (let i = 0; i <= w.length - 2; i++) grams.add(w.slice(i, i + 2));
    if (w.length > 4) {
      for (let i = 0; i <= w.length - 4; i++) grams.add(w.slice(i, i + 4));
    }
  }
  return grams;
}

function trigramScore(query, fileTrigrams, filePath) {
  const qgrams = getTrigrams(query);
  if (qgrams.size === 0) return 0;

  // Prefix bonus — does the filename start with query words?
  const filename = path.basename(filePath).toLowerCase();
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  let prefixBonus = 0;
  for (const w of queryWords) {
    if (filename.startsWith(w)) prefixBonus += 0.4;
    else if (filename.includes(w)) prefixBonus += 0.15;
  }

  // Trigram overlap score
  let overlap = 0;
  for (const g of qgrams) {
    if (fileTrigrams.has(g)) overlap++;
  }
  const jaccard = overlap / Math.max(qgrams.size, 1);

  // Exact substring bonus
  if (filename.includes(query.toLowerCase())) {
    return 1.0 + prefixBonus;
  }

  return Math.min(jaccard + prefixBonus, 1.0);
}

// ── File discovery ─────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  '.next', '.nuxt', '__pycache__', 'dist', 'build', 'out',
  '.cache', '.tmp', 'tmp', '.Temp',
]);

const MAX_DEPTH = 12;

function discoverFiles(rootDir, maxFiles = 30000) {
  const files = [];
  function walk(dir, depth) {
    if (depth > MAX_DEPTH || files.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir); }
    catch { return; }

    for (const entry of entries) {
      if (entry.startsWith('.') && entry !== '.gitignore') continue;
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        if (IGNORE_DIRS.has(entry)) continue;
        walk(full, depth + 1);
      } else if (stat.isFile()) {
        files.push({ path: full, mtime: stat.mtimeMs });
      }
    }
  }
  walk(rootDir, 0);
  return files;
}

// ── Index building ────────────────────────────────────────────────────────

function buildIndex(rootDir, maxFiles = 30000) {
  const files = discoverFiles(rootDir, maxFiles);
  const rootLen = rootDir.length;

  // Group by directory for cache invalidation
  const byDir = new Map();
  for (const f of files) {
    const dir = path.dirname(f.path);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }

  // Build per-file trigram index
  const index = new Map();
  for (const f of files) {
    const rel = f.path.slice(rootLen + 1);
    const trigrams = getTrigrams(rel);
    index.set(f.path, { trigrams, mtime: f.mtime, rel });
  }

  return { rootDir, files, index, builtAt: Date.now() };
}

// ── Search ─────────────────────────────────────────────────────────────────

/**
 * @param {string} query
 * @param {object} idx  — returned by buildIndex()
 * @param {number} limit
 * @param {string} cwd  — only show results under this directory
 * @returns {Array<{path, score, rel, type}>}
 */
function search(query, idx, { limit = 20, cwd = null } = {}) {
  if (!query || !query.trim()) return [];

  const results = [];
  for (const [filePath, data] of idx.index) {
    const rel = data.rel || filePath.slice(idx.rootDir.length + 1);

    // Filter to cwd if specified
    if (cwd) {
      const absCwd = path.resolve(cwd);
      const absFile = path.resolve(filePath);
      if (!absFile.startsWith(absCwd)) continue;
    }

    const score = trigramScore(query, data.trigrams, filePath);
    if (score < 0.05) continue;

    // Determine match type for display
    const fname = path.basename(filePath);
    const ext  = path.extname(fname).slice(1);
    let matchType = 'file';
    if (fname.includes('.')) matchType = ext || 'file';
    if (['js','ts','jsx','tsx','mjs','cjs'].includes(ext)) matchType = 'js';
    else if (['json','toml','yaml','yml','xml'].includes(ext)) matchType = 'config';
    else if (['md','txt','rst','adoc'].includes(ext)) matchType = 'doc';
    else if (['css','scss','less'].includes(ext)) matchType = 'style';
    else if (['py','rb','go','rs','java','c','cpp','h'].includes(ext)) matchType = 'code';

    results.push({ path: filePath, rel, score, matchType, ext });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ── Cache ──────────────────────────────────────────────────────────────────

function cacheKey(rootDir) {
  return crypto.createHash('md5').update(rootDir).digest('hex');
}

function loadCache(rootDir) {
  const key  = cacheKey(rootDir);
  const file = path.join(CACHE_DIR, key + '.json');
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

function saveCache(idx) {
  const key  = cacheKey(idx.rootDir);
  const file = path.join(CACHE_DIR, key + '.json');
  try {
    // Serialize: convert Set trigram arrays back to arrays
    const serial = {
      rootDir: idx.rootDir,
      builtAt: idx.builtAt,
      files: idx.files.map(f => ({ path: f.path, mtime: f.mtime })),
    };
    fs.writeFileSync(file, JSON.stringify(serial), 'utf-8');
  } catch {}
}

function cachedIndex(rootDir, maxFiles = 30000) {
  const cached = loadCache(rootDir);
  const files  = discoverFiles(rootDir, maxFiles);

  // Check if cache is still valid
  if (cached && cached.files) {
    const cachedMap = new Map(cached.files.map(f => [f.path, f.mtime]));
    let valid = true;
    for (const f of files) {
      if (cachedMap.get(f.path) !== f.mtime) { valid = false; break; }
    }
    if (valid) {
      // Use cached trigrams
      const index = new Map();
      for (const f of files) {
        const rel = f.path.slice(rootDir.length + 1);
        const trigrams = getTrigrams(rel);
        index.set(f.path, { trigrams, mtime: f.mtime, rel });
      }
      return { rootDir, files, index, builtAt: cached.builtAt };
    }
  }

  const idx = buildIndex(rootDir, maxFiles);
  saveCache(idx);
  return idx;
}

module.exports = { buildIndex, cachedIndex, search, discoverFiles, getTrigrams, CACHE_DIR };
