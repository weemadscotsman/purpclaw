# Fast Semantic Search — Binary Float32Array Recipe

The pattern that gets sub-second semantic search over 30K+ vectors without a vector DB. Used in the PURPCLAW runtime to power `/api/llm/plan` codebase context, `purpclaw code search`, and the kernel trajectory buffer.

## TL;DR

- 30K vectors × 768d = 23M ops, well under 100ms in V8
- JSON parse of `vectors.json` (5MB) takes 7s — that's the real bottleneck
- Write a binary Float32Array dump: 8-byte header (N, D) + N×D×4 bytes — drops load to ~800ms
- Pre-normalize vectors once on build → every search is a pure dot product
- In-memory cache with 60s TTL → repeated queries are instant
- Strip 4-byte header: `N` (4 bytes LE), `D` (4 bytes LE), then `Float32` rows

## Why JSON.parse is the bottleneck

```
JSON parse:  7,000ms  ← THIS
dot product:    98ms  ← fast
total load:   7,100ms
```

For 30K vectors × 768 floats × 4 bytes = 90MB. JSON inflates this with structural overhead and slower string parsing. Float32Array is one contiguous typed buffer, parsed in a single pass.

## Index format

```
[0..4)    N = number of vectors (uint32 LE)
[4..8)    D = embedding dimension (uint32 LE)
[8..8+N*D*4)  Float32 rows, each D floats, packed contiguously
```

Plus a sibling `vectors.meta.json` with `{file, content}` per index. Keep the meta as JSON (it's not on the hot path) and the vectors as binary.

## Build script

```js
// scripts/build-binary-index.js
const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('E:/code-index/vectors.json', 'utf-8'));
const N = idx.vectors.length, D = idx.dim || 768;
const buf = Buffer.alloc(8 + N * D * 4);
buf.writeUInt32LE(N, 0);
buf.writeUInt32LE(D, 4);
const meta = [];
for (let i = 0; i < N; i++) {
  const v = idx.vectors[i];
  if (v.embedding && v.embedding.length === D) {
    for (let j = 0; j < D; j++) buf.writeFloatLE(v.embedding[j], 8 + (i*D + j) * 4);
  } else {
    for (let j = 0; j < D; j++) buf.writeFloatLE(0, 8 + (i*D + j) * 4);
  }
  meta.push({ file: v.file, content: (v.content || '').slice(0, 800) });
}
fs.writeFileSync('E:/code-index/vectors.bin', buf);
fs.writeFileSync('E:/code-index/vectors.meta.json', JSON.stringify(meta));
```

## Load + inlined dot product (the hot path)

```js
function loadIndexBinary() {
  if (!fs.existsSync(VECTORS_BIN) || !fs.existsSync(VECTORS_META)) return null;
  const meta = JSON.parse(fs.readFileSync(VECTORS_META, 'utf-8'));
  const buf = fs.readFileSync(VECTORS_BIN);
  const N = buf.readUInt32LE(0);
  const D = buf.readUInt32LE(4);
  if (N !== meta.length) return null;
  const arr = new Float32Array(N * D);
  for (let i = 0; i < N * D; i++) arr[i] = buf.readFloatLE(8 + i * 4);
  // Lightweight records — no per-vector Float32Array allocation.
  const vectors = new Array(N);
  for (let i = 0; i < N; i++) {
    vectors[i] = {
      id: `bin-${i}`,
      file: meta[i].file,
      content: meta[i].content,
      _offset: i * D,           // index into the contiguous buffer
      _flat: arr,                // shared Float32Array
      _dim: D,
    };
  }
  return { dim: D, count: N, vectors, _normalized: true, _flat: arr };
}

function topKSimilar(queryVec, vectors, k) {
  // Pre-normalize query once
  let qn = 0;
  for (let i = 0; i < queryVec.length; i++) qn += queryVec[i] * queryVec[i];
  qn = Math.sqrt(qn) + 1e-9;
  const q = new Float32Array(queryVec.length);
  for (let i = 0; i < queryVec.length; i++) q[i] = queryVec[i] / qn;

  // Fast path: vectors carry _flat/_offset. Inline dot product against
  // the contiguous Float32Array — no view allocation.
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
  // (slow path: per-vector Float32Array — JSON-loaded index)
}
```

## Pre-normalize on build

If vectors are pre-normalized (length = 1), cosine similarity = pure dot product. No `sqrt` per query, no `1/||v||` per result.

```js
function preNormalize(vectors) {
  for (const v of vectors) {
    if (!v.embedding || v.embedding.length === 0) continue;
    let norm = 0;
    for (let i = 0; i < v.embedding.length; i++) norm += v.embedding[i] * v.embedding[i];
    norm = Math.sqrt(norm) + 1e-9;
    for (let i = 0; i < v.embedding.length; i++) v.embedding[i] /= norm;
  }
}
```

Mark normalized in the loaded index: `if (j.vectors && !j._normalized) { preNormalize(j.vectors); j._normalized = true; }`.

## In-memory cache (60s TTL)

JSON load is still 800ms even with the binary format. For a chat endpoint that gets many search requests, cache:

```js
let _indexCache = null, _indexCacheAt = 0;
const _INDEX_TTL_MS = 60_000;
function loadIndex() {
  if (_indexCache && (Date.now() - _indexCacheAt) < _INDEX_TTL_MS) return _indexCache;
  // ... load + pre-normalize
  _indexCache = result;
  _indexCacheAt = Date.now();
  return result;
}
```

CLI invocations start fresh each time so the cache doesn't help them — but the API process (long-lived) gets repeated-query speedups.

## Measured results (PURPCLAW, 30K vectors × 768d)

| version | cold search | warm search |
|---|---|---|
| JSON parse + plain cosine | 16.4s | 16.4s |
| JSON parse + inlined dot | 16.0s | 16.0s |
| binary Float32 + inlined dot | 1.0s | <50ms (in-memory cache) |

The 16x speedup on cold search comes from JSON.parse → Float32Array. The warm path is just the dot loop + sort.

## Pitfalls

1. **Don't put the binary file in git.** `vectors.bin` is 90MB+. Add it to `.gitignore`. Commit the build script and the meta file (or build on first run).
2. **Float32 precision is fine for cosine.** 32-bit floats are the standard for embedding models (most return Float32 anyway). Don't waste space with Float64.
3. **Keep the meta file content small** (800 chars per chunk). 30K × 800B = 24MB JSON — that's OK. 30K × 8KB = 240MB, too big.
4. **Skip empty embeddings during the dot loop** — filter to `{ s, i }` records with valid `v._offset`. Empty embeddings waste cycles.
5. **Don't try to make the dot product SIMD.** V8 already does a good job with typed arrays. SIMD intrinsics (WebAssembly) are an order of magnitude harder to wire and rarely worth it under 100K vectors.
6. **Embed-call latency dominates for small N.** 0.5s per embed via Ollama. For sub-second response, you need either: (a) cached query embeddings, (b) a smaller embed model, or (c) accept that the first search is 1s and warm queries are 0.5s.

## Embedding via Ollama (no GPU required)

```js
const OLLAMA_EMBED_URL = 'http://127.0.0.1:11434/v1/embeddings';
const EMBED_MODEL = 'nomic-embed-text';  // 137M params, F16
const EMBED_DIM = 768;

function embedBatch(texts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ input: texts, model: EMBED_MODEL });
    const req = http.request(OLLAMA_EMBED_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 60_000
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        const j = JSON.parse(buf);
        if (j.error) return reject(new Error(j.error));
        resolve((j.data || []).map(d => d.embedding));
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
```

Use OpenAI-compatible `/v1/embeddings` (not Ollama's native `/api/embeddings`) for portability with OpenAI API conventions.

## The visualizer fakery lesson

Eddie Cannon called this out hard. A semantic-search-backed visualizer that showed:

- A **pulse animation** on the center orb when `active > 0` (CSS `animation: pulse 1.6s ease-in-out infinite`) — fake, looks live, isn't.
- A **sine wave baseline** on the event waveform bars (`Math.sin((i + seed) * 0.72) * 48`) — fake, makes empty buckets look busy.

Both were replaced with **real time-bucketed activity**: 32 bars, each bar = number of events in that 9-second bucket over the last 5 minutes. Empty buckets are 4% tall, populated bars are 8-96% tall proportional to count. Recent 8 bars tinted differently from older ones. Title attribute shows the count on hover.

**Rule:** if a UI element is supposed to reflect activity, it must be driven by real activity. Decoration that looks live is fakery. The user reads "decorating with no data" as deception.

## Related

- `mlops/inference` — embedding model serving, quantization
- `kernel-job-training-buffer` — same embed pipeline used to embed kernel trajectories

## Reproducing in 30 minutes

```bash
# 1. Get a binary index (assume vectors.json already exists from a JSON-only indexer)
node scripts/build-binary-index.js
# → vectors.bin (90MB), vectors.meta.json (15MB)

# 2. Add loadIndexBinary() + topKSimilar() to your search module
#    (paste from above)

# 3. Add a `mode: 'binary'` fallback chain in loadIndex():
#    if (vectors.bin exists) return loadIndexBinary();
#    else return loadJsonIndex();

# 4. Add in-memory cache with 60s TTL

# 5. Test:
node -e "
const r = await searchSemantic('how does the kernel queue jobs', 5);
console.log(r.results.map(x => x.file));
"

# Expected: 1.0-1.5s for cold load + search, 50-100ms for warm
```
