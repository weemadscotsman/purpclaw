'use strict';
/**
 * lib/vector/index.js — Unified Vector Provider Router
 * ════════════════════════════════════════════════════════
 *
 * Routes vector operations (index, search, delete, compact)
 * to the appropriate provider based on hardware capability
 * and the routing matrix in .purpclaw/vector-provider.json.
 *
 * Current routing (Sandy Bridge / no AVX2):
 *   codeSearch      → FAISS
 *   memoryHot       → FAISS
 *   sessionDeltas   → FAISS
 *   antiGoblinPrune → FAISS (tombstone → periodic compact)
 *   turbovec        → PARKED (requires AVX2 / newer CPU)
 *   raw_cosine      → emergency debug fallback only
 *
 * Provider priority:
 *   1. FAISS (primary — works on current hardware)
 *   2. raw_cosine (debug fallback)
 *   3. turbovec (future upgrade — requires AVX2)
 *   4. Qdrant (optional service mode)
 *   5. ChromaDB (MCP memory compat)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

const PURP_DIR = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(PURP_DIR, '.purpclaw', 'vector-provider.json');
const DEFAULT_CONFIG = {
  defaultProvider: 'faiss',
  providers: {
    faiss:    { enabled: true,  role: 'primary-local-index' },
    turbovec: { enabled: false, role: 'future-upgrade-requires-avx2' },
    raw_cosine: { enabled: true, role: 'debug-fallback' },
  },
  routing: {
    codeSearch: 'faiss',
    memoryHot: 'faiss',
    sessionDeltas: 'faiss',
    antiGoblinPruning: 'faiss',
  },
};

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
  catch { return DEFAULT_CONFIG; }
}

// ── Provider instances (lazy) ──────────────────────────────────────────────
let _faissProvider = null;
let _currentDim = 768;
function getFaissProvider(dim) {
  if (dim && dim !== _currentDim) {
    _faissProvider = null;
    _currentDim = dim;
  }
  if (!_faissProvider) {
    const FAISS = require('./providers/faissProvider');
    _faissProvider = new FAISS({
      indexDir: path.join(PURP_DIR, '.purpclaw', 'vector', 'faiss'),
      pythonBin: process.env.PURPCLAW_PYTHON || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe',
      dim: _currentDim,
    });
  }
  return _faissProvider;
}

// ── Resolve provider for a route ──────────────────────────────────────────
function resolveProvider(route, dim) {
  const cfg = loadConfig();
  const providerName = cfg.routing[route] || cfg.defaultProvider;

  if (!cfg.providers[providerName] || !cfg.providers[providerName].enabled) {
    return { name: 'raw_cosine', provider: null, reason: `${providerName} disabled or missing` };
  }

  switch (providerName) {
  case 'faiss':    return { name: 'faiss', provider: getFaissProvider(dim) };
  case 'turbovec': return { name: 'turbovec', provider: null, reason: 'parked — requires AVX2 CPU' };
  case 'raw_cosine': return { name: 'raw_cosine', provider: null };
  default:          return { name: 'raw_cosine', provider: null, reason: `unknown: ${providerName}` };
  }
}

// ── Index vectors ─────────────────────────────────────────────────────────
async function index(vectors, metadata, route = 'codeSearch') {
  const dim = vectors[0]?.length || 768;
  const { name, provider } = resolveProvider(route, dim);
  if (!provider) {
    // Fallback: store as flat JSON
    return fallbackIndex(vectors, metadata);
  }
  return provider.index(vectors, metadata);
}

// ── Search ────────────────────────────────────────────────────────────────
async function search(queryVector, options = {}, route = 'codeSearch') {
  const { name, provider } = resolveProvider(route, 768);
  const topK = options.topK || 10;

  if (!provider) {
    return fallbackSearch(queryVector, topK);
  }

  try {
    const start = performance.now();
    const result = await provider.search(queryVector, topK, options.filters);
    const latencyMs = Math.round(performance.now() - start);
    return { ...result, provider: name, latencyMs };
  } catch (e) {
    console.warn(`[VECTOR] ${name} search failed: ${e.message}. Falling back to raw cosine.`);
    const start = performance.now();
    const result = fallbackSearch(queryVector, topK);
    const latencyMs = Math.round(performance.now() - start);
    return { ...result, provider: 'raw_cosine_fallback', latencyMs };
  }
}

// ── Delete by IDs (tombstone for FAISS, native for turbovec) ──────────────
async function deleteByIds(ids, route = 'antiGoblinPruning') {
  const { name, provider } = resolveProvider(route, 768);
  if (!provider) return { deleted: 0, method: 'none', reason: 'no provider' };

  if (name === 'faiss') {
    // FAISS doesn't support O(1) deletes — use tombstone
    return provider.tombstone(ids);
  }

  return provider.deleteByIds(ids);
}

// ── Compact (rebuild FAISS index without tombstoned vectors) ──────────────
async function compact(route = 'antiGoblinPruning') {
  const { provider } = resolveProvider(route, 768);
  if (!provider) return { compacted: false };
  return provider.compact();
}

// ── Status ────────────────────────────────────────────────────────────────
function status() {
  const cfg = loadConfig();
  const faiss = getFaissProvider();
  return {
    defaultProvider: cfg.defaultProvider,
    routing: cfg.routing,
    faiss: faiss.status(),
    turbovec: { enabled: false, reason: 'parked — requires AVX2-capable CPU (Haswell 2013+)' },
  };
}

// ── Fallback: flat JSON storage ───────────────────────────────────────────
const FALLBACK_PATH = path.join(PURP_DIR, '.purpclaw', 'vector', 'flat_store.json');

function fallbackIndex(vectors, metadata) {
  const store = [];
  for (let i = 0; i < vectors.length; i++) {
    store.push({ id: metadata[i]?.id || `v${i}`, vector: Array.from(vectors[i]), metadata: metadata[i] || {} });
  }
  fs.mkdirSync(path.dirname(FALLBACK_PATH), { recursive: true });
  fs.writeFileSync(FALLBACK_PATH, JSON.stringify(store), 'utf8');
  return { indexed: store.length, method: 'flat_json' };
}

function fallbackSearch(queryVector, topK) {
  if (!fs.existsSync(FALLBACK_PATH)) return { results: [], method: 'flat_json_empty' };
  const store = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
  const results = store
    .map(item => ({ id: item.id, score: cosineSimilarity(queryVector, item.vector), metadata: item.metadata }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return { results, method: 'raw_cosine' };
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { index, search, deleteByIds, compact, status, resolveProvider };
