'use strict';
/**
 * lib/tool-cache.js — Round 2/B: persistent tool-result cache.
 *
 * Pure-perf feature. Every `tool-call` re-runs the same expensive thing
 * (grep, code-search, web-search, read). Cache by (tool_name, args_hash)
 * with TTL. Disk-backed so it survives process restarts.
 *
 * USAGE:
 *   const TC = require('./lib/tool-cache');
 *   const key = TC.keyFor('grep', { pattern: 'TODO', path: 'lib' });
 *   const hit = TC.get(key);
 *   if (!hit) {
 *     const result = await invoke(...);
 *     TC.put(key, result, { ttlMs: 60_000 });
 *   }
 *
 *   // Inspection
 *   TC.summary();
 *
 * Storage: ~/.purpclaw/tool-cache/<sha16>.json (debounced flush)
 *
 * Defaults:
 *   - max entries: 500 (LRU eviction)
 *   - default TTL: 5 minutes
 *   - per-tool TTL override via PURPCLAW_CACHE_TTL_<TOOL>=<ms>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_DIR = (() => {
  const env = process.env.PURPCLAW_STATE_DIR;
  if (env) return env;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return home ? path.join(home, '.purpclaw', 'tool-cache') : path.join(process.cwd(), '.purpclaw', 'tool-cache');
})();

const VERSION = '1.0.0';
const MAX_ENTRIES = parseInt(process.env.PURPCLAW_CACHE_MAX_ENTRIES || '500', 10);
const DEFAULT_TTL_MS = parseInt(process.env.PURPCLAW_CACHE_DEFAULT_TTL_MS || '300000', 10); // 5min
const FLUSH_DEBOUNCE_MS = 1000;

// In-memory index. Each entry: { key, tool, args, result, expiresAt, hits }
const _cache = new Map();  // key -> entry
let _flushTimer = null;
let _dirty = false;

function ensureDir() { try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch {} }

function keyFor(tool, args) {
  const hash = crypto.createHash('sha256');
  hash.update(String(tool));
  hash.update('\x00');
  hash.update(JSON.stringify(args || {}, Object.keys(args || {}).sort()));
  return hash.digest('hex').substring(0, 16);
}

function get(key, opts = {}) {
  const e = _cache.get(key);
  if (!e) return null;
  if (e.expiresAt > 0 && Date.now() > e.expiresAt) {
    _cache.delete(key);
    _dirty = true;
    scheduleFlush();
    return null;
  }
  e.hits = (e.hits || 0) + 1;
  e.lastHitAt = Date.now();
  return e.result;
}

function put(key, result, opts = {}) {
  const tool = opts.tool || 'unknown';
  const args = opts.args || {};
  let ttlMs = opts.ttlMs ?? (process.env[`PURPCLAW_CACHE_TTL_${tool.toUpperCase()}`]
                              ? parseInt(process.env[`PURPCLAW_CACHE_TTL_${tool.toUpperCase()}`], 10)
                              : DEFAULT_TTL_MS);
  const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
  const entry = {
    key,
    tool,
    args,
    result,
    expiresAt,
    hits: 0,
    createdAt: Date.now(),
    lastHitAt: Date.now(),
  };
  _cache.set(key, entry);
  _dirty = true;
  // LRU eviction
  while (_cache.size > MAX_ENTRIES) {
    // Find oldest lastHitAt
    let oldestKey = null, oldestAt = Infinity;
    for (const [k, v] of _cache) {
      if ((v.lastHitAt || v.createdAt) < oldestAt) {
        oldestAt = v.lastHitAt || v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) _cache.delete(oldestKey);
    else break;
  }
  scheduleFlush();
  return entry;
}

function invalidate(key) {
  if (_cache.delete(key)) { _dirty = true; scheduleFlush(); return true; }
  return false;
}

function invalidateTool(tool) {
  let n = 0;
  for (const [k, v] of _cache) {
    if (v.tool === tool) { _cache.delete(k); n++; }
  }
  if (n) { _dirty = true; scheduleFlush(); }
  return n;
}

function clear() {
  _cache.clear();
  _dirty = true;
  scheduleFlush();
}

function summary() {
  const now = Date.now();
  let live = 0, expired = 0, totalHits = 0;
  const byTool = {};
  for (const v of _cache.values()) {
    if (v.expiresAt > 0 && now > v.expiresAt) { expired++; continue; }
    live++;
    totalHits += v.hits || 0;
    byTool[v.tool] = (byTool[v.tool] || 0) + 1;
  }
  return {
    live_entries: live,
    expired_entries: expired,
    total_hits: totalHits,
    max_entries: MAX_ENTRIES,
    default_ttl_ms: DEFAULT_TTL_MS,
    state_dir: STATE_DIR,
    by_tool: byTool,
  };
}

function load() {
  if (!_cache.size) {
    // Try loading from disk on first call.
    ensureDir();
    try {
      for (const f of fs.readdirSync(STATE_DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
          const entry = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf-8'));
          if (entry && entry.key && entry.result !== undefined) {
            _cache.set(entry.key, entry);
          }
        } catch {}
      }
      // Enforce max size after load
      while (_cache.size > MAX_ENTRIES) {
        const oldest = [..._cache.entries()].sort((a, b) => (a[1].lastHitAt || a[1].createdAt) - (b[1].lastHitAt || b[1].createdAt))[0];
        if (oldest) _cache.delete(oldest[0]); else break;
      }
    } catch {}
  }
}

function flushNow() {
  if (!_dirty) return;
  try {
    ensureDir();
    // Wipe and re-write
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (f.endsWith('.json')) {
        try { fs.unlinkSync(path.join(STATE_DIR, f)); } catch {}
      }
    }
    for (const [k, v] of _cache) {
      fs.writeFileSync(path.join(STATE_DIR, k + '.json'), JSON.stringify(v), 'utf-8');
    }
    _dirty = false;
  } catch (e) {
    console.error('[tool-cache] flush failed:', e.message);
  }
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; flushNow(); }, FLUSH_DEBOUNCE_MS);
}

// Eager load on first require so cache survives restart.
load();

module.exports = {
  keyFor,
  get,
  put,
  invalidate,
  invalidateTool,
  clear,
  summary,
  load,
  flushNow,
  VERSION,
  STATE_DIR,
  MAX_ENTRIES,
  DEFAULT_TTL_MS,
};

// CLI
if (require.main === module) {
  const cmd = process.argv[2] || 'summary';
  if (cmd === 'summary') console.log(JSON.stringify(summary(), null, 2));
  else if (cmd === 'clear') { clear(); console.log('cache cleared'); }
  else if (cmd === 'invalidate-tool') { const n = invalidateTool(process.argv[3]); console.log(`invalidated ${n}`); }
  process.exit(0);
}
