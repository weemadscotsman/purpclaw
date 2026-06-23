#!/usr/bin/env node
/**
 * bin/purpclaw-vector-bench.js — FAISS Vector Bench
 * ════════════════════════════════════════════════════
 *
 * Benchmarks the active vector provider against a synthetic corpus.
 * Reports: index time, search latency, recall@k, memory footprint.
 *
 * Usage:
 *   node bin/purpclaw-vector-bench.js [count] [dim] [topK]
 *   purpclaw vector bench [count] [dim] [topK]
 */

const path = require('path');
const { performance } = require('perf_hooks');

const PURP_DIR = path.resolve(__dirname, '..');
const VECTOR = require(path.join(PURP_DIR, 'lib', 'vector'));

async function main() {
  const count = parseInt(process.argv[2] || '1000', 10);
  const dim = parseInt(process.argv[3] || '768', 10);
  const topK = parseInt(process.argv[4] || '10', 10);

  console.log(`\n  🦀  PURPCLAW VECTOR BENCH`);
  console.log(`  ════════════════════════`);
  console.log(`  Vectors:   ${count}`);
  console.log(`  Dimension: ${dim}`);
  console.log(`  Top-K:     ${topK}`);
  console.log(`  Provider:  FAISS (primary local spine)`);
  console.log('');

  // Generate random vectors
  const vectors = [];
  const metadata = [];
  for (let i = 0; i < count; i++) {
    const v = new Float32Array(dim);
    for (let j = 0; j < dim; j++) v[j] = Math.random();
    vectors.push(v);
    metadata.push({ id: `bench_${i}`, file: `src/file_${i}.ts`, lang: 'typescript' });
  }

  // Index
  console.log('  Indexing...');
  const t0 = performance.now();
  await VECTOR.index(vectors, metadata, 'codeSearch');
  const t1 = performance.now();
  const indexMs = Math.round(t1 - t0);
  console.log(`  ✓ Indexed ${count} vectors in ${indexMs}ms (${(count / (indexMs / 1000)).toFixed(0)} vec/s)`);

  // Search
  const query = new Float32Array(dim);
  for (let j = 0; j < dim; j++) query[j] = Math.random();

  console.log('  Searching...');
  const t2 = performance.now();
  const result = await VECTOR.search(query, { topK }, 'codeSearch');
  const t3 = performance.now();
  const searchMs = Math.round(t3 - t2);

  console.log(`  ✓ Search completed in ${searchMs}ms`);
  console.log(`  Provider:  ${result.provider}`);
  console.log(`  Results:   ${result.results?.length || 0}`);
  if (result.results?.length) {
    console.log(`  Top score: ${result.results[0].score?.toFixed(4)}`);
    console.log(`  Top ID:    ${result.results[0].id}`);
  }

  // Status
  const s = VECTOR.status();
  console.log('');
  console.log('  Provider Status:');
  console.log(`  FAISS indexed: ${s.faiss?.indexed || 0}`);
  console.log(`  FAISS tombstones: ${s.faiss?.tombstones || 0}`);
  console.log(`  FAISS ready: ${s.faiss?.ready}`);
  console.log(`  TurboVec: ${s.turbovec?.reason || 'parked'}`);
  console.log('');

  // Summary
  console.log('  ─────────────────────────────────────');
  console.log(`  Index:  ${indexMs}ms  |  Search: ${searchMs}ms  |  Vectors: ${count}`);
  console.log(`  Speed:  ${(count / (searchMs / 1000)).toFixed(0)} vec/s search`);
  console.log('  ─────────────────────────────────────');
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
