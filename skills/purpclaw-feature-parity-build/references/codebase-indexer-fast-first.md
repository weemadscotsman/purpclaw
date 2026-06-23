# Codebase Indexer — Fast Keyword First, Optional Semantic Second

When the system needs to answer "where is X in the codebase?" across
hundreds or thousands of files, the embeddings-only path is too slow
on commodity hardware. A 1400-file tree × ~3 chunks per file = 4000+
chunks × 1-2s per embed call = 1-3 hours per index. Too slow.

The fix: build a **keyword-only index first** (1.7 seconds for 1986 files,
3373 symbols) and **layer semantic embeddings as a slow optional path**.
The keyword index catches 80% of "where is X" queries in <100ms. The
semantic index adds the last 20% (paraphrased queries, "what does this
do" questions).

## The fast keyword index (always run, <2s)

Walk the source tree, extract per-file metadata, write to a JSON file.
No embeddings, no LLM calls, no network.

```js
// scripts/code-index-fast.js (essence)
function walk(root) {
  const out = [];
  function rec(dir) {
    for (const x of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, x.name);
      // Skip node_modules, .git, dist, .next, backups, etc.
      if (SKIP.some(s => full.includes('/' + s + '/'))) continue;
      if (x.isDirectory()) { rec(full); continue; }
      if (!['.js', '.ts', '.tsx', '.jsx', '.py', '.md'].includes(path.extname(x.name))) continue;
      const s = fs.statSync(full);
      if (s.size < 30 || s.size > 60_000) continue;  // skip huge + tiny
      out.push({ path: full, rel: full.replace(/^E:\/...\/PURPCLAW\//, ''), size: s.size });
    }
  }
  rec(root);
  return out;
}

for (const f of files) {
  const src = fs.readFileSync(f.path, 'utf-8');
  const header = src.split('\n').slice(0, 20).join('\n').trim();
  const preview = src.length > 1500 ? src.slice(0, 1500) : src;
  // One chunk per file: header + first 1500 chars
  vectors.push({ id: ..., file: f.rel, content: `FILE: ${f.rel}\n\n${header}\n\n---\n${preview}`, embedding: [] });
  // Symbol-level chunks for the symbol search
  for (const sym of extractSymbols(src, ext)) symbols.push({ ...sym, file: f.rel, ext });
}
```

**Three SKIP rules that matter for PURPCLAW-style trees:**
- `node_modules` — 99% noise
- `.claude/worktrees` — old agent worktrees, not the active code
- `ui-backup` / `agent_archive` / `agent_work` — backups, archives
- `.next`, `dist`, `build` — generated output

**Two size limits that matter:**
- 30 bytes min — skips empty files, license stubs
- 60 KB max — skips huge generated files (use higher if you index bundles)

**Index layout (JSON files in `E:/code-index/`):**
- `vectors.json` — `{dim: 0, count, vectors: [{id, file, content, embedding: []}]}`. `embedding: []` means keyword-only.
- `symbols.json` — `[{name, kind, line, file, ext}]` for instant symbol lookup
- `meta.json` — `{builtAt, files, chunks, symbols, model, dim: 0, sourceDir}`

## The binary Float32Array cache (10x load speedup, 1s semantic search)

The JSON `vectors.json` file is **slow to parse**. A 30975-chunk index is
~5 MB of nested JS objects; `JSON.parse` takes ~7s, then the per-vector
embedding arrays allocate lazily during cosine. Even after a fast path,
semantic search on 30K vectors tops out at ~5-6s.

**The fix: build a parallel `vectors.bin` cache.** A single contiguous
`Float32Array` with the metadata in a side JSON. Loads in ~800ms, cosine
runs against the contiguous buffer with no per-vector allocation.

### Build (one-time, then on every reindex)

```js
// scripts/build-binary-index.js (essence)
const idx = JSON.parse(fs.readFileSync(VECTORS_JSON, 'utf-8'));
const N = idx.vectors.length;
const D = idx.dim || 768;
const buf = Buffer.alloc(8 + N * D * 4);
buf.writeUInt32LE(N, 0);
buf.writeUInt32LE(D, 4);
const meta = new Array(N);
for (let i = 0; i < N; i++) {
  const e = idx.vectors[i].embedding || [];
  for (let j = 0; j < D; j++) {
    buf.writeFloatLE(j < e.length ? e[j] : 0, 8 + (i * D + j) * 4);
  }
  meta[i] = { file: idx.vectors[i].file, content: (idx.vectors[i].content || '').slice(0, 800) };
}
fs.writeFileSync(VECTORS_BIN, buf);                // 90 MB for 30K×768
fs.writeFileSync(path.join(INDEX_DIR, 'vectors.meta.json'), JSON.stringify(meta));
```

### Load (fast path, ~800ms)

```js
function loadIndexBinary() {
  const buf = fs.readFileSync(VECTORS_BIN);
  const meta = JSON.parse(fs.readFileSync(META_JSON, 'utf-8'));
  const N = buf.readUInt32LE(0);
  const D = buf.readUInt32LE(4);
  if (N !== meta.length) return null;  // mismatch → fall back to JSON
  const arr = new Float32Array(N * D);
  for (let i = 0; i < N * D; i++) arr[i] = buf.readFloatLE(8 + i * 4);
  return { dim: D, count: N, _flat: arr, vectors: /* lightweight records with _offset */ };
}
```

### Cosine (inlined, no per-vector allocation)

**The win:** search becomes a single nested loop against the contiguous
`Float32Array`. No view allocation per vector. No object dereference per
dimension. On 30K × 768, the inner loop runs in **~100ms**.

```js
function topKSimilar(queryVec, vectors, k) {
  let qn = 0;
  for (let i = 0; i < queryVec.length; i++) qn += queryVec[i] * queryVec[i];
  qn = Math.sqrt(qn) + 1e-9;
  const q = new Float32Array(queryVec.length);
  for (let i = 0; i < queryVec.length; i++) q[i] = queryVec[i] / qn;

  // Fast path: contiguous Float32Array. Inline the dot product.
  const arr = vectors[0]?._flat;  // all vectors share the same buffer
  if (!arr) return [];
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
```

**Avoid the `.embedding` getter trap.** A getter that calls
`arr.subarray(offset, offset + D)` looks clean but allocates a view per
access. With 30K vectors in the hot path, the allocation cost dominates
the dot product. Inline the offset math in the inner loop instead.

### In-memory cache for the API path

For long-lived processes (the API, not CLI), cache the index at module
scope with a 60s TTL. JSON parse is 7s, so a hot search endpoint that
loads on every request is killed by its own parser.

```js
let _indexCache = null, _indexCacheAt = 0;
const _INDEX_TTL_MS = 60_000;
function loadIndex() {
  if (_indexCache && (Date.now() - _indexCacheAt) < _INDEX_TTL_MS) return _indexCache;
  _indexCache = idx; _indexCacheAt = Date.now();
  return idx;
}
function invalidateIndexCache() { _indexCache = null; _indexCacheAt = 0; }
```

**Real numbers from PURPCLAW (30K × 768):**
- `JSON.parse` of vectors.json: **~7s**
- Binary read of vectors.bin (90MB): **~800ms** (10x faster)
- Dot product over 30K vectors in pure JS: **~100ms**
- Full semantic search end-to-end (load + embed + rank): **~1.0s**
- Keyword fallback (no embed call): **~80ms** end-to-end

### When to rebuild the binary cache

| trigger | action |
|---|---|
| `vectors.json` is rebuilt (reindex) | run `node scripts/build-binary-index.js` |
| `vectors.json` exists but `vectors.bin` doesn't | run the build script — first search will be slow otherwise |
| model dim changes (different embed model) | full rebuild (binary header encodes D) |
| `vectors.bin` is corrupt / wrong size | the loader detects N mismatch and falls back to JSON |

Chain the binary build as a post-step of the JSON reindex orchestrator.

## The keyword search (always available, no Ollama needed)
```js
function searchKeyword(query, topK, idx) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const scored = (idx?.vectors || []).map(v => {
    const text = (v.content || '').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (text.includes(t)) score += 1;
      if ((v.file || '').toLowerCase().includes(t)) score += 0.5;  // bonus for filename match
    }
    return { score, file: v.file, content: v.content };
  }).filter(v => v.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return { results: scored.slice(0, topK), fallback: 'keyword' };
}
```

**Real results from PURPCLAW (1986 files, 3373 symbols, 0.8s build):**
- `code search "service discovery health probe"` → top hit `lib/commands/services.js` (score 4.5)
- `code search "auto research loop ratchet"` → top hit `lib/commands/autoresearch.js` (score 4.0)
- `code search "training buffer kernel finishJob"` → top hit `lib/training-buffer.js` (score 4.0)
- `code symbol createAgentId` → 4 matches across the codebase, <5ms

**File-name bonus is the trick.** `"auth middleware"` matches files that contain "auth" or "middleware" in the path. The first hit on a code search is usually the right one.

## The slow semantic layer (optional, 1-3 hours)

For "what does this do" / paraphrased queries, layer in real embeddings.

```js
async function buildSemanticLayer(vectors, { onProgress, batchSize = 8, timeoutMs = 60_000 } = {}) {
  const withEmbeds = [];
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    const inputs = batch.map(v => v.content.slice(0, 1500));
    let embeds;
    try { embeds = await embedBatch(inputs); }  // POST /v1/embeddings to Ollama
    catch (e) { if (onProgress) onProgress({ stage: 'embed-skip', i, error: e.message }); continue; }
    for (let j = 0; j < batch.length; j++) withEmbeds.push({ ...batch[j], embedding: embeds[j] || [] });
  }
  return withEmbeds;
}
```

**The model:** `nomic-embed-text` (137M params, 768-dim, runs locally on Ollama, no GPU). Pulled via `ollama pull nomic-embed-text`.

**Cosine similarity scoring:**
```js
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
```

**Search returns:** top-K matches sorted by cosine, with score 0-1. >0.5 is high confidence, 0.35-0.5 is medium, <0.35 is noise.

**Why this is slow on first run:** Ollama takes ~1-2s per embed call, with 8 in parallel. 2000 chunks = 250 batches × ~5s = ~20 minutes minimum. The first run is the painful one; subsequent runs only re-embed changed files (md5 check on file content).

**Incremental builds (md5 hash of file content):**
- Store `{file: rel, mtime, hash, chunkCount}` per file in a `filemap.json`
- On rebuild, walk the tree, hash each file, compare to `filemap`
- Unchanged files: keep their existing embeddings (don't re-embed)
- New / changed files: chunk + embed
- Result: a 1986-file tree with 5 changed files takes ~3 minutes, not 20

## Symbol search (always instant)

Independent of the embedding layer, the symbol index is grep-fast:

```js
function searchSymbol(name) {
  const syms = loadSymbols();
  const lower = name.toLowerCase();
  return syms.filter(s => s.name.toLowerCase().includes(lower))
    .slice(0, 20)
    .map(s => ({ ...s }));  // {name, kind: 'function'|'class'|'export'|'const-fn', line, file, ext}
}
```

`code symbol createAgentId` returns `function · agent_tower.js:159` in <5ms. The symbol regex pulls:
- `(?:export\s+)?(?:async\s+)?function\s+([\w$]+)` — function defs
- `(?:export\s+)?class\s+([\w$]+)` — class defs
- `^export\s+(?:const|let|var|function|class)\s+([\w$]+)` — exports
- `^(?:export\s+)?const\s+([\w$]+)\s*=\s*(?:function\s*\(|async\s*\(|[\(])` — const arrow functions
- For Python: `^(?:async\s+)?def\s+([\w_]+)` and `^class\s+([\w_]+)`

This is the lowest-cost, highest-value piece of the index. Always
extract symbols; you get fast `where is this defined` for free.

## When to use which layer

| query type | layer | example |
|---|---|---|
| "where is `createAgentId`" | symbol | `<5ms` |
| "service discovery health probe" | keyword | `<100ms`, top hit score ~4.5 |
| "function that handles auth" | semantic | `~200ms`, score 0.5-0.7 |
| "thing that decides which model to use" | semantic (paraphrase) | only semantic handles this |
| "swarm coordination" | keyword | `<100ms`, top hit score 2-3 |

**Default UI flow:** try keyword first. If `top score < 1.5` for a
multi-word query, try semantic. This is the "two-stage retrieval"
pattern from production RAG systems.

## When to rebuild the index

| trigger | what to do |
|---|---|
| new file added | incremental: re-embed only the new file |
| file edited | incremental: re-embed only the changed file (md5 differs) |
| file deleted | incremental: drop the file's vectors from `vectors.json` |
| every 7 days | full rebuild with `--force` to catch drifted chunks |
| model changed | full rebuild (different dim) |

The incremental path is **50-100x faster** than full rebuild. Always
default to incremental, only `--force` on demand.

## Index storage on Windows

- **Where:** `E:/code-index/{vectors.json, symbols.json, meta.json, filemap.json}`
- **Size:** ~50 KB per 100 files for the keyword index. ~30 MB for the
  semantic index of 2000 files (each chunk ~1.5 KB text + 768 × 4 bytes
  for float32 vectors = ~4.5 KB per chunk × 2000 = 9 MB vectors + 3 MB text = 12 MB).
- **Don't write to C drive.** Ted's C drive is at 99% full. E drive has 60+ GB free.

## When to NOT build a code indexer

- For a single-file project, `grep` + `find` is fine
- For languages you don't have a tokenizer for (Cobol, Fortran, exotic DSLs), extract symbols only
- For docs-only repos (Markdown only), the keyword index is overkill — use a docs search like `blogwatcher`
- For ephemeral scripts that get deleted daily, the index churn is more expensive than the search

## Related: this complements OmniCode MCP

`omnicode-mcp` is a separate tool with AST-aware symbol search, call
hierarchy, and blast radius analysis. If you have it wired, prefer it
for deep code analysis. This indexer is the **lightweight, always-on
fallback** that doesn't require a separate server and works in <2s
on the keyword path.

Use both:
- OmniCode: for `purpclaw -- use omnicode to find where X is called`
- This indexer: for `purpclaw code search "X"` and `purpclaw code symbol X`
