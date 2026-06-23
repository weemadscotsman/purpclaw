'use strict';

/**
 * Thringlet persistence
 * ═════════════════════
 * Single-file JSON store at agent_work/thringlets/colony.json by default.
 * If the State Store service (:7783) is online, the engine ALSO mirrors there
 * under key `thringlet:colony` (best-effort, never blocks).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_DIR = path.join(ROOT, 'agent_work', 'thringlets');
const DEFAULT_FILE = 'colony.json';
const STATE_PORT = parseInt(process.env.STATE_PORT || '7783', 10);
const STATE_KEY = 'thringlet:colony';

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function putStateValue(key, value) {
  return new Promise(resolve => {
    const body = JSON.stringify({ key: STATE_KEY, value, ttl: 0 });
    const req = http.request({
      hostname: '127.0.0.1', port: STATE_PORT, path: `/state/thringlet/${encodeURIComponent(STATE_KEY)}`,
      method: 'PUT', timeout: 1500,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

class FileStore {
  constructor(opts = {}) {
    this.dir = opts.dir || DEFAULT_DIR;
    this.file = opts.file || DEFAULT_FILE;
    this.mirrorToState = opts.mirrorToState !== false;
    this.fullPath = path.join(this.dir, this.file);
  }

  async load() {
    try {
      if (!fs.existsSync(this.fullPath)) return [];
      const raw = fs.readFileSync(this.fullPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.thringlets)) return parsed.thringlets;
      return [];
    } catch (e) {
      console.warn('[thringlet-store] load failed:', e.message);
      return [];
    }
  }

  async save(arr) {
    try {
      ensureDir(this.dir);
      const payload = { thringlets: arr, savedAt: Date.now(), version: 1 };
      fs.writeFileSync(this.fullPath, JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error('[thringlet-store] save failed:', e.message);
      return false;
    }
    // Best-effort mirror to State Store
    if (this.mirrorToState) {
      putStateValue(null, { thringlets: arr, savedAt: Date.now() }).catch(() => {});
    }
    return true;
  }
}

function createStore(opts) {
  return new FileStore(opts);
}

module.exports = { createStore, FileStore, DEFAULT_DIR, DEFAULT_FILE };
