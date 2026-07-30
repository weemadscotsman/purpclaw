'use strict';

/**
 * lib/commands/find.js
 * purpclaw find — Fast fuzzy file search
 *
 * Codex parity: codex file-search (nucleo-based)
 * Engine: lib/file-index.js (trigram index, no external deps)
 */

const path   = require('path');
const fs     = require('fs');
const { cachedIndex, search } = require('../file-index');

const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  gray   : '\x1b[90m',
};

const isTTY = process.stdout.isTTY;
const col   = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

// ── Config ────────────────────────────────────────────────────────────────

const DEFAULT_ROOTS = (() => {
  const home = process.env.USERPROFILE || process.env.HOME;
  return [
    process.cwd(),
    path.join(home, '.purpclaw'),
    'E:/god folder',
    'E:/billy desktop',
  ].filter((v, i, a) => v && a.indexOf(v) === i); // dedupe
})();

async function run(args, ctx = {}) {
  const json    = args.includes('--json');
  const verbose = args.includes('--verbose');
  const limitArg = args.indexOf('--limit');
  const limit   = limitArg >= 0 ? parseInt(args[limitArg + 1]) || 20 : 20;
  const cwdArg  = args.indexOf('--cwd');
  const cwd     = cwdArg >= 0 ? args[cwdArg + 1] : process.cwd();

  // Strip flags before checking subcommands
  const raw = args.filter(a => !a.startsWith('--'));
  const sub = raw[0];
  // Rebase flag-sensitive positional args on raw (no --flags)
  const pos1 = raw[1]; // root for build/stats, query for search

  // ── find build [root] ────────────────────────────────────────────────
  if (sub === 'build' || sub === 'index') {
    const root = pos1 || cwd;
    if (json) {
      process.stdout.write(JSON.stringify({ building: root }) + '\n');
    } else {
      console.log(col(C.cyan, '⚡ Building index:') + ` ${root}`);
    }
    const idx = cachedIndex(root);
    const count = idx.index.size;
    const age = idx.builtAt ? `(${(Date.now() - idx.builtAt) / 1000 | 0}s ago)` : '(fresh)';
    if (json) {
      process.stdout.write(JSON.stringify({ ok: true, root, files: count, builtAt: idx.builtAt }) + '\n');
    } else {
      console.log(`  ${col(C.green, count.toLocaleString())} files indexed ${col(C.gray, age)}`);
    }
    return;
  }

  // ── find stats [root] ────────────────────────────────────────────────
  if (sub === 'stats') {
    const root = pos1 || cwd;
    const idx  = cachedIndex(root);
    if (json) {
      process.stdout.write(JSON.stringify({
        root, files: idx.index.size,
        builtAt: idx.builtAt,
        cacheDir: require('../file-index').CACHE_DIR
      }) + '\n');
    } else {
      console.log(`Index: ${root}`);
      console.log(`Files: ${idx.index.size.toLocaleString()}`);
      console.log(`Built: ${idx.builtAt ? new Date(idx.builtAt).toISOString() : 'never'}`);
    }
    return;
  }

  // ── find watch [root] ────────────────────────────────────────────────
  if (sub === 'watch') {
    const root = pos1 || cwd;
    console.log(col(C.yellow, '👁 Watching:') + ` ${root}  (Ctrl+C to stop)`);
    console.log(col(C.dim, 'Re-indexing on file changes...'));
    // Simple approach: rebuild every 30s
    let lastMtime = 0;
    const tick = () => {
      try {
        const idx = cachedIndex(root);
        const count = idx.index.size;
        if (count !== lastMtime) {
          process.stdout.write(`\r${col(C.green, '✓')} ${count.toLocaleString()} files   ${new Date().toLocaleTimeString()}   `);
          lastMtime = count;
        }
      } catch {}
    };
    tick();
    const interval = setInterval(tick, 5000);
    process.on('SIGINT', () => { clearInterval(interval); console.log('\nStopped.'); process.exit(0); });
    return;
  }

  // ── find <query> ────────────────────────────────────────────────────
  const query = raw[0] || '';
  if (!query || query.length < 2) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'query too short (min 2 chars)' }) + '\n');
    } else {
      console.log('usage: purpclaw find <query> [--cwd DIR] [--limit N] [--json] [--verbose]');
      console.log('       purpclaw find build [root]   rebuild the index');
      console.log('       purpclaw find stats [root]   show index stats');
      console.log('');
      console.log('  query   fuzzy filename search (bigram/trigram overlap)');
      console.log('  --cwd   limit search to a directory');
      console.log('  --limit max results (default 20)');
      console.log('  --json  JSON output');
      console.log('  --verbose show full paths');
    }
    return 1;
  }

  // Build index for cwd (cached on disk)
  if (json) {
    process.stdout.write(JSON.stringify({ searching: query, cwd }) + '\n');
  }
  const idx = cachedIndex(cwd);

  const results = search(query, idx, { limit, cwd });

  if (results.length === 0) {
    if (json) {
      process.stdout.write(JSON.stringify({ query, results: [] }) + '\n');
    } else {
      console.log(col(C.gray, `No files matching "${query}" in ${cwd}`));
    }
    return;
  }

  if (json) {
    process.stdout.write(JSON.stringify({
      query, cwd, count: results.length,
      results: results.map(r => ({
        path : r.path,
        score: r.score,
        type : r.matchType,
        ext  : r.ext,
      }))
    }, null, 2) + '\n');
    return;
  }

  // Pretty output
  const maxScore = results[0].score;
  for (const r of results) {
    const bar   = barScore(r.score, maxScore);
    const type  = col(C.cyan, `[${r.matchType.padEnd(6)}]`);
    const fname = col(C.bold, path.basename(r.path));
    const dir   = col(C.gray, path.dirname(r.path));
    const score = col(C.yellow, (r.score * 100 | 0) + '%');
    console.log(`${bar}  ${type}  ${fname}  ${score}`);
    if (verbose) console.log(`          ${col(C.dim, r.path)}`);
  }
  console.log(col(C.dim, `\n${results.length} results in ${cwd}`));
}

function barScore(score, max) {
  const W = 12;
  const normalized = Math.min(score / Math.max(max, 0.01), 1.0);
  const filled = Math.round(normalized * W);
  const empty  = W - filled;
  return col(C.green, '█'.repeat(filled)) + col(C.gray, '░'.repeat(empty));
}

module.exports = { run };
