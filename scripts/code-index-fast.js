'use strict';
/**
 * scripts/code-index-fast.js
 * Build a symbol + keyword-fallback index in <10 seconds (no embeddings).
 * Then `purpclaw code search <query>` uses keyword match. `purpclaw code symbol <name>`
 * is instant. Re-run `purpclaw code reindex` later when Ollama is fast enough
 * to add semantic vectors on top.
 */
const fs = require('fs');
const path = require('path');

const PURP = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW';
const OUT = 'E:/code-index';
const SKIP = ['node_modules', '.next', '.git', 'dist', 'build', 'agent_work', 'logs', '__pycache__', 'venv', 'old_cortex', '.cache', 'data', 'raw', 'exports', 'agent_archive', '.claude', 'ui-backup', '.ui-backup'];
const EXTS = ['.js', '.ts', '.tsx', '.jsx', '.py', '.md'];
const MAX_BYTES = 60_000;

function walk(root) {
  const out = [];
  function rec(dir) {
    let e; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const x of e) {
      const full = path.join(dir, x.name);
      const rel = full.replace(/\\/g, '/');
      if (SKIP.some(s => rel.includes('/' + s + '/') || rel.endsWith('/' + s))) continue;
      if (x.isDirectory()) { rec(full); continue; }
      if (!EXTS.includes(path.extname(x.name).toLowerCase())) continue;
      try { const s = fs.statSync(full); if (s.size < 30 || s.size > MAX_BYTES) continue; out.push({ path: full, rel: rel.replace(/^E:\/god folder\/02_ACTIVE_PROJECTS\/PURPCLAW\//, ''), size: s.size }); } catch {}
    }
  }
  rec(root);
  return out;
}

function extractSymbols(src, ext) {
  const syms = [];
  if (ext === '.js' || ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
    const fnRe = /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/gm;
    const clsRe = /^(?:export\s+)?class\s+([\w$]+)/gm;
    const expRe = /^export\s+(?:default\s+)?(?:const|let|var|function|class)\s+([\w$]+)/gm;
    const cfnRe = /^(?:export\s+)?const\s+([\w$]+)\s*=\s*(?:function\s*\(|async\s*\(|[\(])/gm;
    let m;
    while ((m = fnRe.exec(src))) syms.push({ kind: 'function', name: m[1], line: src.slice(0, m.index).split('\n').length });
    while ((m = clsRe.exec(src))) syms.push({ kind: 'class', name: m[1], line: src.slice(0, m.index).split('\n').length });
    while ((m = expRe.exec(src))) syms.push({ kind: 'export', name: m[1], line: src.slice(0, m.index).split('\n').length });
    while ((m = cfnRe.exec(src))) syms.push({ kind: 'const-fn', name: m[1], line: src.slice(0, m.index).split('\n').length });
  } else if (ext === '.py') {
    const defRe = /^(?:async\s+)?def\s+([\w_]+)/gm;
    const clsRe = /^class\s+([\w_]+)/gm;
    let m;
    while ((m = defRe.exec(src))) syms.push({ kind: 'function', name: m[1], line: src.slice(0, m.index).split('\n').length });
    while ((m = clsRe.exec(src))) syms.push({ kind: 'class', name: m[1], line: src.slice(0, m.index).split('\n').length });
  }
  return syms;
}

const t0 = Date.now();
console.log(`walking ${PURP}…`);
const files = walk(PURP);
console.log(`found ${files.length} source files (${files.reduce((s, f) => s + f.size, 0) / 1024 | 0} KB total)`);

const vectors = [];
const symbols = [];

for (const f of files) {
  let src = null;
  try { src = fs.readFileSync(f.path, 'utf-8'); } catch { continue; }
  const ext = path.extname(f.path).toLowerCase();
  const lines = src.split('\n');
  const header = lines.slice(0, 20).join('\n').trim();
  const preview = src.length > 1500 ? src.slice(0, 1500) : src;

  // One chunk per file: header + first 1500 chars
  vectors.push({
    id: `f-${vectors.length}-${f.rel.replace(/[^a-z0-9]/gi, '_')}`,
    file: f.rel,
    content: `FILE: ${f.rel}\n\n${header}\n\n---\n${preview}`,
    embedding: [],  // empty until semantic reindex
  });

  if (ext === '.js' || ext === '.ts' || ext === '.tsx' || ext === '.jsx' || ext === '.py') {
    const syms = extractSymbols(src, ext);
    for (const s of syms) symbols.push({ ...s, file: f.rel, ext });
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'vectors.json'), JSON.stringify({ dim: 0, count: vectors.length, vectors }));
fs.writeFileSync(path.join(OUT, 'symbols.json'), JSON.stringify(symbols, null, 2));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  files: files.length,
  chunks: vectors.length,
  symbols: symbols.length,
  model: 'keyword-fallback (no embeddings yet — run `purpclaw code reindex` for semantic)',
  dim: 0,
  sourceDir: PURP,
}, null, 2));

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n✓ index built:`);
console.log(`  ${files.length} files scanned`);
console.log(`  ${vectors.length} chunks (keyword-searchable)`);
console.log(`  ${symbols.length} symbols (instant lookup)`);
console.log(`  elapsed: ${elapsed}s`);
console.log(`\nnext: try \`purpclaw code search auth middleware\` and \`purpclaw code symbol createAgentId\``);
console.log(`for semantic search, run \`purpclaw code reindex\` (slower, uses Ollama embeddings)`);
