'use strict';

/**
 * purpclaw code — semantic + symbol search over your codebase
 * ════════════════════════════════════════════════════════════════════════
 *
 * Builds a vector index of every function / class / route / file header
 * in the PURPCLAW tree, using nomic-embed-text (137M param embed model,
 * runs locally on Ollama, no GPU required).
 *
 * Index lives at E:/code-index/. Rebuilt incrementally on first run.
 * Cosine similarity ranking, 768-dim vectors.
 *
 *   purpclaw code reindex      — force a full reindex of the tree
 *   purpclaw code search QUERY — semantic search (top-K matches)
 *   purpclaw code symbol NAME  — exact symbol lookup (functions/classes)
 *   purpclaw code stats        — index size, last build, dim, etc.
 *
 * v2: Incremental builds (mtime/hash tracking), enhanced symbol extraction
 * (class methods, arrow functions, module.exports, Python docstrings),
 * graceful Ollama-offline fallback.
 *
 * Why this matters: Quill can now do "where is the auth middleware
 * implemented" in ~50ms, ranked by meaning rather than grep. That's
 * the gap between us and Claude Code.
 */

const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const crypto = require('crypto');

const OLLAMA_EMBED_URL = 'http://127.0.0.1:11434/v1/embeddings';
const EMBED_MODEL      = 'nomic-embed-text';
const EMBED_DIM        = 768;
const INDEX_DIR        = 'E:/code-index';
const VECTORS_FILE     = path.join(INDEX_DIR, 'vectors.json');
const META_FILE        = path.join(INDEX_DIR, 'meta.json');
const SYMBOLS_FILE     = path.join(INDEX_DIR, 'symbols.json');
const FILEMAP_FILE     = path.join(INDEX_DIR, 'filemap.json');  // mtime/hash tracking
const PURP_DIRS        = [
  'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW',
];
const SKIP_DIRS        = ['node_modules', '.next', '.git', 'dist', 'build', 'agent_work', 'logs', '__pycache__', 'venv', 'advisor', 'old_cortex'];
const SKIP_EXTS        = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.pyc', '.class', '.log', '.tsv', '.ndjson'];
const MAX_FILE_BYTES   = 80_000;
const MAX_CHUNK_CHARS  = 1200;

function isPurpFile(p) {
  return p.startsWith('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW');
}

// ── File hash (fast MD5 for change detection) ─────────────────────────────────
function fileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch { return null; }
}

// ── Load previous filemap for incremental builds ──────────────────────────────
function loadFilemap() {
  try {
    if (fs.existsSync(FILEMAP_FILE)) {
      return JSON.parse(fs.readFileSync(FILEMAP_FILE, 'utf-8'));
    }
  } catch {}
  return {}; // { relPath: { mtime, hash, chunkIds: [...] } }
}

function saveFilemap(map) {
  fs.writeFileSync(FILEMAP_FILE, JSON.stringify(map, null, 2));
}

function walkFiles(root) {
  const out = [];
  function recurse(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = full.replace(/\\/g, '/');
      if (SKIP_DIRS.some(s => rel.includes('/' + s + '/') || rel.endsWith('/' + s))) continue;
      if (e.isDirectory()) { recurse(full); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (SKIP_EXTS.includes(ext)) continue;
      if (!['.js', '.ts', '.tsx', '.jsx', '.py', '.md', '.json'].includes(ext)) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size > MAX_FILE_BYTES) continue;
        if (stat.size < 10) continue;
        out.push({
          path: full,
          rel: rel.replace(/^E:\/god folder\/02_ACTIVE_PROJECTS\/PURPCLAW\//, ''),
          size: stat.size,
          ext,
          mtimeMs: stat.mtimeMs,
        });
      } catch {}
    }
  }
  recurse(root);
  return out;
}

function chunkJsTs(src, rel) {
  // Very lightweight chunker — splits on:
  //   - top-level function / class / const exports
  //   - route handlers (Next.js style: '/api/...' string near a function)
  //   - shebang / module.exports / a top header (first 25 lines)
  const chunks = [];
  const lines = src.split('\n');
  let buf = [];
  let block = '';
  let braceDepth = 0;
  let parenDepth = 0;
  const flush = () => {
    if (buf.length) {
      const text = buf.join('\n').trim();
      if (text.length > 80) {
        chunks.push(text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) + '...' : text);
      }
    }
    buf = []; braceDepth = 0; parenDepth = 0;
  };
  // header
  const header = lines.slice(0, 25).join('\n').trim();
  if (header.length > 60) chunks.push(`FILE: ${rel}\n\n${header}`);

  for (const line of lines) {
    buf.push(line);
    for (const c of line) {
      if (c === '{') braceDepth++;
      else if (c === '}') braceDepth--;
      else if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;
    }
    // Heuristic: flush at end of a likely-top-level statement
    if (braceDepth <= 0 && parenDepth <= 0 && /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s/m.test(line)) {
      flush();
    } else if (braceDepth <= 0 && /^\}\s*$/.test(line) && buf.length > 3) {
      flush();
    }
  }
  if (buf.length) flush();
  return chunks.length ? chunks : [header || src.slice(0, 800)];
}

function chunkPython(src, rel) {
  const chunks = [];
  const lines = src.split('\n');
  // header
  const header = lines.slice(0, 25).join('\n').trim();
  if (header.length > 60) chunks.push(`FILE: ${rel}\n\n${header}`);

  let buf = [];
  let inClass = false, inDef = false;
  let blockHeader = '';
  for (const line of lines) {
    const m = line.match(/^(\s*)(async\s+def|def|class)\s+([\w_]+)/);
    if (m) {
      if (buf.length && blockHeader) {
        const text = buf.join('\n').trim();
        if (text.length > 60) chunks.push(`PY: ${blockHeader} (in ${rel})\n\n${text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) + '...' : text}`);
      }
      buf = [];
      blockHeader = m[3];
    }
    buf.push(line);
  }
  if (buf.length && blockHeader) {
    const text = buf.join('\n').trim();
    if (text.length > 60) chunks.push(`PY: ${blockHeader} (in ${rel})\n\n${text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) + '...' : text}`);
  }
  return chunks.length ? chunks : [header || src.slice(0, 800)];
}

function chunkMarkdown(src, rel) {
  // Whole file for small MD; section-split for large
  if (src.length < 4000) return [`FILE: ${rel}\n\n${src}`];
  const sections = src.split(/^#{1,3} /m);
  return sections.filter(s => s.length > 80).map((s, i) => `MD ${rel}#${i}\n\n${s.length > MAX_CHUNK_CHARS ? s.slice(0, MAX_CHUNK_CHARS) : s}`);
}

// ── Enhanced Symbol Extraction ────────────────────────────────────────────────
// v2: Captures class methods, arrow functions, module.exports, Python docstrings

function extractSymbols(src, ext) {
  const syms = [];
  const lines = src.split('\n');

  if (ext === '.js' || ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
    // ── Standard function / class declarations ──
    const fnRe = /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/gm;
    const clsRe = /^(?:export\s+)?class\s+([\w$]+)/gm;
    const expRe = /^export\s+(?:default\s+)?(?:const|let|var|function|class)\s+([\w$]+)/gm;
    const constFn = /^(?:export\s+)?const\s+([\w$]+)\s*=\s*(?:function\s*\(|async\s*\(|[\(])/gm;
    let m;
    while ((m = fnRe.exec(src))) { syms.push({ kind: 'function', name: m[1], line: src.slice(0, m.index).split('\n').length }); }
    while ((m = clsRe.exec(src))) { syms.push({ kind: 'class', name: m[1], line: src.slice(0, m.index).split('\n').length }); }
    while ((m = expRe.exec(src))) { syms.push({ kind: 'export', name: m[1], line: src.slice(0, m.index).split('\n').length }); }
    while ((m = constFn.exec(src))) { syms.push({ kind: 'const-fn', name: m[1], line: src.slice(0, m.index).split('\n').length }); }

    // ── Arrow function assignments (const foo = (...) => { or const foo = async (...) => {) ──
    const arrowRe = /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm;
    while ((m = arrowRe.exec(src))) {
      const name = m[1];
      // Avoid duplicates with constFn
      if (!syms.find(s => s.name === name && s.line === src.slice(0, m.index).split('\n').length)) {
        syms.push({ kind: 'arrow-fn', name, line: src.slice(0, m.index).split('\n').length });
      }
    }

    // ── Class methods (within class bodies) ──
    let currentClass = null;
    for (let i = 0; i < lines.length; i++) {
      const clsMatch = lines[i].match(/^\s*(?:export\s+)?class\s+([\w$]+)/);
      if (clsMatch) { currentClass = clsMatch[1]; continue; }
      if (currentClass) {
        // Method: async name(...) {  or  name(...) {
        const methMatch = lines[i].match(/^\s+(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{/);
        if (methMatch && methMatch[1] !== 'if' && methMatch[1] !== 'for' && methMatch[1] !== 'while' && methMatch[1] !== 'switch') {
          syms.push({ kind: 'method', name: `${currentClass}.${methMatch[1]}`, line: i + 1 });
        }
        // Static method
        const staticMatch = lines[i].match(/^\s+static\s+(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{/);
        if (staticMatch) {
          syms.push({ kind: 'static-method', name: `${currentClass}.${staticMatch[1]}`, line: i + 1 });
        }
        // Getter / setter
        const getSetMatch = lines[i].match(/^\s+(?:get|set)\s+([\w$]+)\s*\([^)]*\)\s*\{/);
        if (getSetMatch) {
          syms.push({ kind: 'accessor', name: `${currentClass}.${getSetMatch[1]}`, line: i + 1 });
        }
      }
      // Reset class context on unindented line (rough heuristic)
      if (currentClass && /^\S/.test(lines[i]) && !lines[i].match(/^\s*(?:export\s+)?class\s/)) {
        currentClass = null;
      }
    }

    // ── module.exports ──
    const modExpRe = /module\.exports\s*=\s*\{([^}]+)\}/g;
    while ((m = modExpRe.exec(src))) {
      const exports = m[1].split(',').map(s => s.trim().split(/[:\s]/)[0]).filter(Boolean);
      for (const name of exports) {
        if (/^[\w$]+$/.test(name)) {
          syms.push({ kind: 'module-export', name, line: src.slice(0, m.index).split('\n').length });
        }
      }
    }

  } else if (ext === '.py') {
    // ── Python: functions, classes, methods, decorators ──
    let currentClass = null;
    let lastDecorator = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track decorators
      const decoMatch = line.match(/^\s*@([\w.]+)/);
      if (decoMatch) { lastDecorator = decoMatch[1]; continue; }

      // Top-level functions
      const defMatch = line.match(/^(async\s+def|def)\s+([\w_]+)\s*\(/);
      if (defMatch) {
        const sym = { kind: 'function', name: defMatch[2], line: i + 1 };
        if (lastDecorator) { sym.decorator = lastDecorator; }
        // Grab docstring (next line)
        if (i + 1 < lines.length) {
          const docMatch = lines[i + 1].match(/^\s+['"]{3}(.+)/);
          if (docMatch) sym.doc = docMatch[1].replace(/['"]{3}$/, '').trim();
        }
        syms.push(sym);
        lastDecorator = null;
        continue;
      }

      // Classes
      const clsMatch = line.match(/^class\s+([\w_]+)/);
      if (clsMatch) {
        currentClass = clsMatch[1];
        syms.push({ kind: 'class', name: currentClass, line: i + 1 });
        lastDecorator = null;
        continue;
      }

      // Class methods (indented def)
      if (currentClass) {
        const methMatch = line.match(/^\s+(async\s+def|def)\s+([\w_]+)\s*\(/);
        if (methMatch) {
          const sym = { kind: 'method', name: `${currentClass}.${methMatch[2]}`, line: i + 1 };
          if (lastDecorator) { sym.decorator = lastDecorator; }
          // Grab docstring
          if (i + 1 < lines.length) {
            const docMatch = lines[i + 1].match(/^\s+['"]{3}(.+)/);
            if (docMatch) sym.doc = docMatch[1].replace(/['"]{3}$/, '').trim();
          }
          syms.push(sym);
          lastDecorator = null;
          continue;
        }
      }

      // Reset class context on unindented non-decorator line
      if (currentClass && /^\S/.test(line) && !line.match(/^class\s/) && !line.match(/^\s*@/)) {
        currentClass = null;
      }
      lastDecorator = null;
    }
  }

  // Deduplicate by name+line
  const seen = new Set();
  return syms.filter(s => {
    const key = `${s.name}:${s.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Ollama Embedding ──────────────────────────────────────────────────────────

function embedBatch(texts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ input: texts, model: EMBED_MODEL });
    const req = http.request(OLLAMA_EMBED_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 60_000 }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          if (j.error) return reject(new Error(j.error));
          resolve((j.data || []).map(d => d.embedding));
        } catch (e) { reject(new Error('parse: ' + buf.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('embed timeout')));
    req.write(body); req.end();
  });
}

// ── Check if Ollama is available ──────────────────────────────────────────────

function checkOllama() {
  return new Promise(resolve => {
    const req = http.request('http://127.0.0.1:11434/api/tags', { method: 'GET', timeout: 3000 }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// Pre-normalized cosine = pure dot product. 30K × 768d should be sub-second.
// Call once at index build time, then every search is just a dot product.
function preNormalize(vectors) {
  for (const v of vectors) {
    if (!v.embedding || v.embedding.length === 0) continue;
    let norm = 0;
    for (let i = 0; i < v.embedding.length; i++) norm += v.embedding[i] * v.embedding[i];
    norm = Math.sqrt(norm) + 1e-9;
    for (let i = 0; i < v.embedding.length; i++) v.embedding[i] /= norm;
    v._norm = 1; // mark normalized
  }
}

function topKSimilar(queryVec, vectors, k) {
  // Pre-normalize query once
  let qn = 0;
  for (let i = 0; i < queryVec.length; i++) qn += queryVec[i] * queryVec[i];
  qn = Math.sqrt(qn) + 1e-9;
  const q = new Float32Array(queryVec.length);
  for (let i = 0; i < queryVec.length; i++) q[i] = queryVec[i] / qn;

  // Fast path: vectors carry _flat/_offset (binary index). Inline the
  // dot product against the contiguous Float32Array — no view allocation.
  const fast = vectors[0] && vectors[0]._flat;
  if (fast) {
    const arr = fast;
    const D = q.length;
    const scored = new Array(vectors.length);
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      if (!v || v._offset === undefined) { scored[i] = { s: -1, i }; continue; }
      const off = v._offset;
      let dot = 0;
      for (let j = 0; j < D; j++) dot += q[j] * arr[off + j];
      scored[i] = { s: dot, i };
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, k).map(x => vectors[x.i]);
  }

  // Slow path: per-vector Float32Array (JSON-loaded index)
  const scored = [];
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (!v.embedding || v.embedding.length === 0) continue;
    const e = v.embedding;
    let dot = 0;
    const len = q.length;
    for (let j = 0; j < len; j++) dot += q[j] * e[j];
    scored.push({ s: dot, i });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map(x => vectors[x.i]);
}

// ── Incremental Build ─────────────────────────────────────────────────────────
// Only re-embed files whose mtime or hash has changed since last build.
// Unchanged files retain their existing chunk embeddings from the previous index.

async function buildIndex(PURP_DIR, { force = false, onProgress = null } = {}) {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  const files = walkFiles(PURP_DIR);

  // Load previous state for incremental comparison
  const prevFilemap = force ? {} : loadFilemap();
  const prevIndex = force ? null : loadIndex();
  const prevVectorsByFile = {};
  if (prevIndex && prevIndex.vectors) {
    for (const v of prevIndex.vectors) {
      if (!prevVectorsByFile[v.file]) prevVectorsByFile[v.file] = [];
      prevVectorsByFile[v.file].push(v);
    }
  }

  // Check Ollama availability
  const ollamaOnline = await checkOllama();

  const allChunks = [];      // chunks that need embedding (new/changed files)
  const retainedVectors = []; // vectors from unchanged files
  const symbols = [];
  const newFilemap = {};
  let skippedFiles = 0;

  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f.path, 'utf-8'); } catch { continue; }

    const hash = crypto.createHash('md5').update(src).digest('hex');
    const prev = prevFilemap[f.rel];

    // Check if file is unchanged
    if (prev && prev.hash === hash && prevVectorsByFile[f.rel]) {
      // File unchanged — retain existing vectors and symbols
      retainedVectors.push(...prevVectorsByFile[f.rel]);
      newFilemap[f.rel] = { mtime: f.mtimeMs, hash, chunkCount: prevVectorsByFile[f.rel].length };
      skippedFiles++;

      // Still extract symbols (cheap, ensures symbol index is always fresh)
      if (f.ext === '.js' || f.ext === '.ts' || f.ext === '.tsx' || f.ext === '.jsx' || f.ext === '.py') {
        const syms = extractSymbols(src, f.ext);
        for (const s of syms) symbols.push({ ...s, file: f.rel, ext: f.ext });
      }
      continue;
    }

    // File is new or changed — chunk it
    let fileChunks = [];
    if (f.ext === '.js' || f.ext === '.ts' || f.ext === '.tsx' || f.ext === '.jsx') {
      fileChunks = chunkJsTs(src, f.rel).map(c => ({ file: f.rel, content: c }));
      const syms = extractSymbols(src, f.ext);
      for (const s of syms) symbols.push({ ...s, file: f.rel, ext: f.ext });
    } else if (f.ext === '.py') {
      fileChunks = chunkPython(src, f.rel).map(c => ({ file: f.rel, content: c }));
      const syms = extractSymbols(src, f.ext);
      for (const s of syms) symbols.push({ ...s, file: f.rel, ext: f.ext });
    } else if (f.ext === '.md') {
      fileChunks = chunkMarkdown(src, f.rel).map(c => ({ file: f.rel, content: c }));
    } else if (f.ext === '.json') {
      fileChunks = [{ file: f.rel, content: `JSON: ${f.rel}\n\n${src.slice(0, MAX_CHUNK_CHARS)}` }];
    }

    allChunks.push(...fileChunks);
    newFilemap[f.rel] = { mtime: f.mtimeMs, hash, chunkCount: fileChunks.length };
  }

  if (onProgress) onProgress({
    stage: 'chunked',
    files: files.length,
    chunks: allChunks.length + retainedVectors.length,
    symbols: symbols.length,
    skipped: skippedFiles,
    newOrChanged: files.length - skippedFiles,
  });

  // ── Embed new/changed chunks ──────────────────────────────────────────────
  const newVectors = [];

  if (ollamaOnline && allChunks.length > 0) {
    const BATCH = 16;
    for (let i = 0; i < allChunks.length; i += BATCH) {
      const batch = allChunks.slice(i, i + BATCH);
      const inputs = batch.map(c => c.content.slice(0, 2000));
      let embeds;
      try {
        embeds = await embedBatch(inputs);
      } catch (e) {
        if (onProgress) onProgress({ stage: 'embed-skip', i, error: e.message });
        continue;
      }
      for (let j = 0; j < batch.length; j++) {
        newVectors.push({
          id: `${i + j}-${batch[j].file.replace(/[^a-z0-9]/gi, '_')}`,
          file: batch[j].file,
          content: batch[j].content,
          embedding: embeds[j] || [],
        });
      }
      if (onProgress) onProgress({ stage: 'embed', done: i + batch.length, total: allChunks.length });
    }
  } else if (!ollamaOnline && allChunks.length > 0) {
    // Ollama offline — store chunks without embeddings (symbol search still works)
    if (onProgress) onProgress({ stage: 'ollama-offline', chunks: allChunks.length });
    for (let i = 0; i < allChunks.length; i++) {
      newVectors.push({
        id: `${i}-${allChunks[i].file.replace(/[^a-z0-9]/gi, '_')}`,
        file: allChunks[i].file,
        content: allChunks[i].content,
        embedding: [], // empty — semantic search won't match but symbol search works
      });
    }
  }

  // Merge retained + new vectors
  const vectors = [...retainedVectors, ...newVectors];

  fs.writeFileSync(VECTORS_FILE, JSON.stringify({ dim: EMBED_DIM, count: vectors.length, vectors }));
  fs.writeFileSync(META_FILE, JSON.stringify({
    builtAt: new Date().toISOString(),
    files: files.length,
    chunks: vectors.length,
    symbols: symbols.length,
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    sourceDir: PURP_DIR,
    incremental: !force,
    skippedFiles,
    newOrChanged: files.length - skippedFiles,
    ollamaOnline,
  }, null, 2));
  fs.writeFileSync(SYMBOLS_FILE, JSON.stringify(symbols, null, 2));
  saveFilemap(newFilemap);

  return {
    files: files.length,
    chunks: vectors.length,
    symbols: symbols.length,
    vectors: vectors.length,
    skipped: skippedFiles,
    newOrChanged: files.length - skippedFiles,
    ollamaOnline,
  };
}

// In-memory cache so the 7s JSON load doesn't repeat on every search.
let _indexCache = null;
let _indexCacheAt = 0;
const _INDEX_TTL_MS = 60_000; // refresh every 60s

// Binary fast-path: vectors.bin (Float32Array) + vectors.meta.json.
// Built by scripts/build-binary-index.js. ~10x faster load than JSON parse.
const VECTORS_BIN = path.join(INDEX_DIR, 'vectors.bin');
const VECTORS_META = path.join(INDEX_DIR, 'vectors.meta.json');

function loadIndexBinary() {
  if (!fs.existsSync(VECTORS_BIN) || !fs.existsSync(VECTORS_META)) return null;
  try {
    const t0 = Date.now();
    const meta = JSON.parse(fs.readFileSync(VECTORS_META, 'utf-8'));
    const buf = fs.readFileSync(VECTORS_BIN);
    const N = buf.readUInt32LE(0);
    const D = buf.readUInt32LE(4);
    if (N !== meta.length) return null;
    // Single contiguous Float32Array. The dot-product search uses
    // .slice() for cache-friendly per-vector views, no allocation.
    const arr = new Float32Array(N * D);
    for (let i = 0; i < N * D; i++) arr[i] = buf.readFloatLE(8 + i * 4);
    // Pre-construct lightweight vector records (no per-vector Float32Array).
    const vectors = new Array(N);
    for (let i = 0; i < N; i++) {
      vectors[i] = {
        id: `bin-${i}`,
        file: meta[i].file,
        content: meta[i].content,
        _offset: i * D,            // index into the contiguous buffer
        _flat: arr,                 // shared Float32Array
        _dim: D,
        // `embedding` is a getter that returns a view (no allocation).
        get embedding() {
          if (this._view && this._viewOffset === this._offset) return this._view;
          this._viewOffset = this._offset;
          this._view = arr.subarray(this._offset, this._offset + D);
          return this._view;
        },
      };
    }
    return { dim: D, count: N, vectors, _normalized: true, _loadMs: Date.now() - t0, _flat: arr };
  } catch { return null; }
}

function loadIndex() {
  if (_indexCache && (Date.now() - _indexCacheAt) < _INDEX_TTL_MS) return _indexCache;
  // Fast path: binary Float32Array
  const bin = loadIndexBinary();
  if (bin) { _indexCache = bin; _indexCacheAt = Date.now(); return bin; }
  // Slow path: JSON
  if (!fs.existsSync(VECTORS_FILE)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(VECTORS_FILE, 'utf-8'));
    if (j.vectors && !j._normalized) {
      preNormalize(j.vectors);
      j._normalized = true;
    }
    _indexCache = j;
    _indexCacheAt = Date.now();
    return j;
  } catch { return null; }
}

function invalidateIndexCache() { _indexCache = null; _indexCacheAt = 0; }

function loadSymbols() {
  const f = SYMBOLS_FILE;
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return []; }
}

async function searchSemantic(query, topK = 5) {
  const idx = loadIndex();
  if (!idx || !idx.vectors?.length) return { error: 'no index — run: purpclaw code reindex' };

  // Check if we have any embeddings at all
  const hasEmbeddings = idx.vectors.some(v => v.embedding && v.embedding.length > 0);
  if (!hasEmbeddings) {
    return searchKeyword(query, topK, idx);
  }

  let qvec;
  try { qvec = (await embedBatch([query]))[0]; }
  catch (e) {
    return searchKeyword(query, topK, idx);
  }

  // ── FAISS primary path ──────────────────────────────────────────────
  try {
    const VECTOR = require('../vector');
    const faissResult = await VECTOR.search(qvec, { topK, filters: {} }, 'codeSearch');
    if (faissResult && faissResult.results && faissResult.results.length > 0) {
      // Map FAISS results back to code chunks
      return {
        results: faissResult.results.map(r => ({
          score: r.score,
          file: r.metadata?.file || r.id,
          content: r.metadata?.content || '',
        })),
        provider: faissResult.provider,
        latencyMs: faissResult.latencyMs,
      };
    }
  } catch (e) {
    // FAISS failed — fall through to raw cosine
  }

  // ── Raw cosine fallback ─────────────────────────────────────────────
  const arr = idx._flat;
  const D = qvec.length;
  const dotOne = (v) => {
    if (!v || v._offset === undefined) return 0;
    const off = v._offset;
    let dot = 0;
    for (let j = 0; j < D; j++) dot += qvec[j] * arr[off + j];
    return dot;
  };
  const topVecs = topKSimilar(qvec, idx.vectors, topK);
  return { results: topVecs.map(v => ({ score: dotOne(v), file: v.file, content: v.content })), provider: 'raw_cosine_fallback' };
}

// ── Keyword fallback (when Ollama is offline) ─────────────────────────────────

function searchKeyword(query, topK, idx) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (!terms.length) return { results: [], fallback: 'keyword' };

  const scored = (idx ? idx.vectors : []).map(v => {
    const text = (v.content || '').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (text.includes(t)) score += 1;
      // Bonus for filename match
      if ((v.file || '').toLowerCase().includes(t)) score += 0.5;
    }
    return { score, file: v.file, content: v.content };
  }).filter(v => v.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return { results: scored.slice(0, topK), fallback: 'keyword' };
}

function searchSymbol(name) {
  const syms = loadSymbols();
  const lower = name.toLowerCase();
  return syms.filter(s => s.name.toLowerCase().includes(lower))
    .slice(0, 20)
    .map(s => ({ ...s }));
}

async function run(args, ctx) {
  const { C, col } = ctx;
  const sub = (args[0] || 'help').toLowerCase();
  console.log('');
  console.log(`  ${col(C.bold || C.white, '🔍  PURPCLAW CODE')}  ${col(C.gray, '· semantic + symbol search')}`);
  console.log(`  ${col(C.gray, '  index:')}  ${col(C.white, INDEX_DIR)}  ${col(C.gray, '(nomic-embed-text, ' + EMBED_DIM + 'd)')}\n`);

  if (sub === 'reindex' || sub === 'index' || sub === 'build') {
    const force = args.includes('--force');
    console.log(`  ${col(C.cyan, '↪')}  ${force ? 'forcing full rebuild' : 'incremental build (only changed files)'}…\n`);
    const t0 = Date.now();
    const r = await buildIndex(PURP_DIRS[0], {
      force,
      onProgress: ({ stage, files, chunks, symbols, done, total, error, skipped, newOrChanged }) => {
        if (stage === 'chunked') {
          process.stdout.write(`  ${col(C.gray, '·')}  scanned ${files} files → ${chunks} chunks, ${symbols} symbols\n`);
          if (skipped > 0) {
            process.stdout.write(`  ${col(C.gray, '·')}  ${col(C.green, skipped + ' unchanged')} (retained), ${col(C.yellow, newOrChanged + ' new/modified')} (re-embedding)\n`);
          }
        } else if (stage === 'embed') {
          if (done % 64 === 0 || done === total) {
            const pct = total ? Math.floor((done / total) * 100) : 0;
            process.stdout.write(`  ${col(C.gray, '·')}  embedded ${done}/${total} (${pct}%)\r`);
          }
        } else if (stage === 'embed-skip') {
          process.stdout.write(`  ${col(C.yellow, '!')}  embed batch skipped at ${done}: ${error}\n`);
        } else if (stage === 'ollama-offline') {
          process.stdout.write(`  ${col(C.yellow, '⚠')}  Ollama offline — storing ${chunks} chunks without embeddings\n`);
          process.stdout.write(`  ${col(C.gray, '·')}  Symbol search works; semantic search needs Ollama running\n`);
        }
      },
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const ollamaNote = r.ollamaOnline ? '' : `  ${col(C.yellow, '(Ollama offline — symbols only)')}`;
    console.log(`\n  ${col(C.green, '✓')}  built: ${r.files} files, ${r.chunks} chunks, ${r.symbols} symbols, ${r.vectors} vectors  ${col(C.gray, '(' + elapsed + 's)')}${ollamaNote}`);
    if (r.skipped > 0) {
      console.log(`  ${col(C.gray, '·')}  ${col(C.green, r.skipped + ' retained')}, ${col(C.cyan, r.newOrChanged + ' re-embedded')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'search' || sub === 'find' || sub === 'semantic') {
    const query = args.slice(1).join(' ').trim();
    if (!query) { console.log(col(C.yellow, '  usage: purpclaw code search <query>\n')); return; }
    const t0 = Date.now();
    const r = await searchSemantic(query, parseInt((args.find(a => a.startsWith('--top=')) || '').split('=')[1], 10) || 5);
    if (r.error) { console.log(col(C.red, '  ✗ ' + r.error + '\n')); return; }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const modeLabel = r.fallback ? col(C.yellow, '(keyword fallback)') : col(C.green, '(semantic)');
    console.log(`  ${col(C.cyan, 'query:')}  "${query}"  ${modeLabel}`);
    console.log(`  ${col(C.gray, 'top ' + r.results.length + ' matches · ' + elapsed + 's')}\n`);
    for (let i = 0; i < r.results.length; i++) {
      const m = r.results[i];
      const scoreColor = m.score > 0.5 ? C.green : m.score > 0.35 ? C.yellow : C.gray;
      console.log(`  ${col(scoreColor, `[${m.score.toFixed(3)}]`)}  ${col(C.white, m.file)}`);
      // Show the first 6 lines of content as a preview
      const preview = m.content.split('\n').slice(0, 8).map(l => '           ' + l).join('\n');
      console.log(col(C.gray, preview));
      console.log('');
    }
    return;
  }

  if (sub === 'symbol' || sub === 'find-symbol') {
    const name = args.slice(1).join(' ').trim();
    if (!name) { console.log(col(C.yellow, '  usage: purpclaw code symbol <name>\n')); return; }
    const matches = searchSymbol(name);
    if (!matches.length) { console.log(col(C.gray, `  no symbol matches "${name}"\n`)); return; }
    console.log(`  ${col(C.cyan, 'symbol:')}  "${name}"  ${col(C.gray, '(' + matches.length + ' match' + (matches.length === 1 ? '' : 'es') + ')')}\n`);
    for (const m of matches) {
      const kColor = m.kind === 'class' ? C.magenta :
                     m.kind === 'function' ? C.cyan :
                     m.kind === 'method' ? C.blue :
                     m.kind === 'arrow-fn' ? C.cyan :
                     m.kind === 'module-export' ? C.green :
                     C.gray;
      const extra = m.decorator ? ` @${m.decorator}` : '';
      const doc = m.doc ? `  ${col(C.gray, '— ' + m.doc.slice(0, 60))}` : '';
      console.log(`  ${col(kColor, '●')}  ${col(C.white, m.name)}  ${col(C.gray, m.kind + '  ·  ' + m.file + ':' + m.line)}${extra}${doc}`);
    }
    console.log('');
    return;
  }

  if (sub === 'stats' || sub === 'status') {
    if (!fs.existsSync(META_FILE)) { console.log(col(C.gray, '  no index yet — run: purpclaw code reindex\n')); return; }
    const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    const idx = loadIndex();
    console.log(`  ${col(C.cyan, 'built:')}    ${meta.builtAt}`);
    console.log(`  ${col(C.cyan, 'model:')}    ${meta.model}  ${col(C.gray, '(' + meta.dim + 'd)')}`);
    console.log(`  ${col(C.cyan, 'files:')}    ${meta.files}`);
    console.log(`  ${col(C.cyan, 'chunks:')}   ${meta.chunks}`);
    console.log(`  ${col(C.cyan, 'symbols:')}  ${meta.symbols}`);
    console.log(`  ${col(C.cyan, 'vectors:')}  ${idx?.vectors?.length || 0}`);
    console.log(`  ${col(C.cyan, 'source:')}   ${meta.sourceDir}`);
    if (meta.incremental !== undefined) {
      console.log(`  ${col(C.cyan, 'mode:')}     ${meta.incremental ? 'incremental' : 'full rebuild'}`);
      console.log(`  ${col(C.cyan, 'skipped:')}  ${meta.skippedFiles || 0} unchanged files`);
      console.log(`  ${col(C.cyan, 'rebuilt:')}  ${meta.newOrChanged || 0} files`);
      console.log(`  ${col(C.cyan, 'ollama:')}   ${meta.ollamaOnline ? col(C.green, 'online') : col(C.yellow, 'offline')}`);
    }
    console.log('');
    return;
  }

  console.log(`  ${col(C.cyan, 'usage:')}`);
  console.log(`    purpclaw code reindex`);
  console.log(`    purpclaw code reindex --force`);
  console.log(`    purpclaw code search "where is the auth middleware"`);
  console.log(`    purpclaw code symbol createAgentId`);
  console.log(`    purpclaw code stats\n`);
}

module.exports = {
  run,
  buildIndex,
  searchSemantic,
  searchSymbol,
  searchKeyword,
  loadIndex,
  loadSymbols,
  extractSymbols,
  INDEX_DIR,
  EMBED_MODEL,
  EMBED_DIM,
};
