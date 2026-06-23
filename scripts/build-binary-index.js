'use strict';
/**
 * scripts/build-binary-index.js
 * Build a Float32Array binary cache from vectors.json. ~10x faster to load
 * than the JSON form, and enables a single contiguous Float32Array for
 * inlined dot products in the search loop.
 *
 *   node scripts/build-binary-index.js
 *
 * Output: E:/code-index/vectors.bin  (raw Float32, packed)
 *         E:/code-index/vectors.meta.json  (file + content per index)
 */
const fs = require('fs');
const path = require('path');

const INDEX_DIR = 'E:/code-index';
const VECTORS_JSON = path.join(INDEX_DIR, 'vectors.json');
const VECTORS_BIN  = path.join(INDEX_DIR, 'vectors.bin');
const META_JSON    = path.join(INDEX_DIR, 'vectors.meta.json');

const t0 = Date.now();
console.log(`reading ${VECTORS_JSON}…`);
const idx = JSON.parse(fs.readFileSync(VECTORS_JSON, 'utf-8'));
const vectors = idx.vectors || [];
const N = vectors.length;
const D = (idx.dim || 768);

console.log(`  ${N} vectors × ${D} dims`);

const buf = Buffer.alloc(8 + N * D * 4);
buf.writeUInt32LE(N, 0);
buf.writeUInt32LE(D, 4);

const meta = new Array(N);
for (let i = 0; i < N; i++) {
  const v = vectors[i];
  if (v.embedding && v.embedding.length === D) {
    for (let j = 0; j < D; j++) buf.writeFloatLE(v.embedding[j], 8 + (i * D + j) * 4);
  } else {
    for (let j = 0; j < D; j++) buf.writeFloatLE(0, 8 + (i * D + j) * 4);
  }
  meta[i] = { file: v.file || '?', content: (v.content || '').slice(0, 800) };
}

fs.writeFileSync(VECTORS_BIN, buf);
fs.writeFileSync(META_JSON, JSON.stringify(meta));
console.log(`\n✓ binary index:`);
console.log(`  ${VECTORS_BIN}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`  ${META_JSON}  ${(JSON.stringify(meta).length / 1024).toFixed(0)} KB`);
console.log(`  elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
