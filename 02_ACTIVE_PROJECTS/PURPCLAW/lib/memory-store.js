'use strict';
/**
 * lib/memory-store.js — durable, file-backed memory archive.
 *
 * WHY THIS EXISTS
 * The cognitive spine accepts writes and returns real ids, but the content
 * lands in volatile working/scratch memory that decays; on boot it logs
 * "[MEMORY] No readable archive found; starting with empty memory". So a fact
 * recorded a minute ago is gone, and recall comes back empty — the system had
 * memory APIs but no memory.
 *
 * This is the same shape Claude Code uses for persistent memory: plain files on
 * disk, one durable record per fact, an index alongside, and retrieval by
 * reading them back. No server to be up, no cache to expire, no embedding
 * service required. If the process dies, the memory is still there.
 *
 * The spine stays in the loop — it keeps doing associative/emotional recall on
 * the live matrix. This archive is the floor underneath it: writes go to both,
 * reads union both, so a spine restart can never lose the durable record.
 *
 * Layout:
 *   <data>/memory/<layer>.jsonl   append-only, one JSON record per line
 *   <data>/memory/index.json      counts + last write per layer
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const MEM_DIR = path.join(DATA, 'memory');
const INDEX_FILE = path.join(MEM_DIR, 'index.json');

const LAYERS = ['episodic', 'semantic', 'procedural', 'symbolic', 'temporal', 'counterfactual', 'affective-interaction'];
const MAX_SCAN = Number(process.env.PURPCLAW_MEMORY_SCAN_LIMIT || 5000);

function ensureDir() { fs.mkdirSync(MEM_DIR, { recursive: true }); }
function layerFile(layer) { return path.join(MEM_DIR, `${String(layer || 'episodic').replace(/[^a-z-]/gi, '')}.jsonl`); }

/** Flatten any envelope content shape into searchable text. */
function toText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    if (content.text) return String(content.text);
    if (content.summary) return String(content.summary);
    try { return JSON.stringify(content); } catch { return String(content); }
  }
  return String(content);
}

/** Append one memory. Durable the moment this returns. */
function record(memory = {}) {
  const text = toText(memory.content);
  if (!text.trim()) return { ok: false, error: 'empty memory content' };
  ensureDir();
  const rec = {
    id: memory.memoryId || 'mem_' + crypto.randomUUID(),
    layer: memory.layer || 'episodic',
    text,
    scope: memory.scope || null,
    source: memory.source || 'purpclaw',
    kind: memory.kind || 'note',
    importance: typeof memory.importance === 'number' ? memory.importance : 0.5,
    createdAt: memory.createdAt || new Date().toISOString(),
  };
  fs.appendFileSync(layerFile(rec.layer), JSON.stringify(rec) + '\n', 'utf8');
  bumpIndex(rec.layer);
  return { ok: true, persisted: true, memoryId: rec.id, layer: rec.layer, durable: true };
}

function bumpIndex(layer) {
  let idx = {};
  try { idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { /* first write */ }
  idx[layer] = { count: (idx[layer]?.count || 0) + 1, lastWrite: new Date().toISOString() };
  try { fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2)); } catch { /* index is advisory */ }
}

function readLayer(layer) {
  try {
    const lines = fs.readFileSync(layerFile(layer), 'utf8').split('\n').filter(Boolean);
    return lines.slice(-MAX_SCAN).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/**
 * Score by term overlap + recency. Deliberately simple and dependency-free:
 * a working keyword recall beats a perfect vector recall that is never wired.
 */
function score(rec, terms) {
  if (!terms.length) return 0;
  const hay = (rec.text || '').toLowerCase();
  let hits = 0;
  for (const t of terms) if (hay.includes(t)) hits++;
  if (!hits) return 0;
  const ageDays = Math.max(0, (Date.now() - Date.parse(rec.createdAt || 0)) / 86_400_000);
  const recency = 1 / (1 + ageDays);              // newer wins ties
  return (hits / terms.length) + (recency * 0.15) + ((rec.importance || 0.5) * 0.1);
}

/** Read back the durable archive. */
function recall({ query = '', layers = LAYERS, limit = 5 } = {}) {
  const terms = String(query).toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const wanted = (Array.isArray(layers) && layers.length ? layers : LAYERS);
  const out = [];
  for (const layer of wanted) {
    for (const rec of readLayer(layer)) {
      const s = terms.length ? score(rec, terms) : 0.1;
      if (s > 0) out.push({ ...rec, score: Number(s.toFixed(3)), content: rec.text, durable: true });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return { items: out.slice(0, limit), scanned: wanted.length, durable: true };
}

function stats() {
  const per = {};
  let total = 0;
  for (const l of LAYERS) { const n = readLayer(l).length; if (n) { per[l] = n; total += n; } }
  return { ok: true, total, layers: per, dir: MEM_DIR };
}

module.exports = { record, recall, stats, toText, MEM_DIR, LAYERS };

if (require.main === module) console.log(JSON.stringify(stats(), null, 2));
