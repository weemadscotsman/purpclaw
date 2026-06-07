'use strict';
/**
 * lib/vector/providers/faissProvider.js — FAISS Local Vector Spine
 * ════════════════════════════════════════════════════════════════
 *
 * Bridges Node.js to FAISS via a Python sidecar over stdin/stdout JSON.
 * FAISS doesn't support O(1) ID deletes, so we use:
 *   - Tombstone list (denylist) for fast exclusion at search time
 *   - Periodic compact/rebuild during idle cleanup
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

class FaissProvider {
  constructor(options = {}) {
    this.indexDir = options.indexDir;
    this.pythonBin = options.pythonBin || process.env.PURPCLAW_PYTHON || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
    this.dim = options.dim || 768;
    this.sidecarPath = options.sidecarPath || path.join(__dirname, '..', '..', '..', 'python', 'faiss_sidecar.py');
    this.indexPath = path.join(this.indexDir, 'index.faiss');
    this.metaPath = path.join(this.indexDir, 'metadata.jsonl');
    this.tombstonePath = path.join(this.indexDir, 'tombstones.json');
    this._ensureDirs();
  }

  _ensureDirs() {
    fs.mkdirSync(this.indexDir, { recursive: true });
  }

  // ── Call sidecar ────────────────────────────────────────────────────────
  async _call(command, payload = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonBin, [this.sidecarPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(this.sidecarPath),
      });

      const request = JSON.stringify({ command, indexPath: this.indexPath, metaPath: this.metaPath, dim: this.dim, ...payload });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());

      child.on('close', code => {
        if (code !== 0) return reject(new Error(`FAISS sidecar exit ${code}: ${stderr.substring(0, 500)}`));
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new Error(`FAISS sidecar parse error: ${stdout.substring(0, 200)}`)); }
      });

      child.stdin.write(request);
      child.stdin.end();

      // 60s timeout
      setTimeout(() => { child.kill(); reject(new Error('FAISS sidecar timeout')); }, 60000);
    });
  }

  // ── Index vectors ───────────────────────────────────────────────────────
  async index(vectors, metadata = []) {
    // Convert to plain arrays for JSON transport
    const payload = {
      vectors: vectors.map(v => Array.from(v)),
      metadata: metadata.map((m, i) => ({ id: m.id || `vec_${i}`, ...m })),
    };
    return this._call('index', { payload });
  }

  // ── Search ──────────────────────────────────────────────────────────────
  async search(queryVector, topK = 10, filters = {}) {
    const tombstones = this._loadTombstones();
    const payload = {
      query: Array.from(queryVector),
      topK,
      filters,
      tombstones,
    };
    return this._call('search', { payload });
  }

  // ── Tombstone (mark for exclusion, don't rebuild) ───────────────────────
  async tombstone(ids) {
    const tombstones = this._loadTombstones();
    const added = [];
    for (const id of ids) {
      if (!tombstones.includes(id)) {
        tombstones.push(id);
        added.push(id);
      }
    }
    fs.writeFileSync(this.tombstonePath, JSON.stringify(tombstones), 'utf8');
    return { deleted: added.length, method: 'tombstone', tombstones: tombstones.length };
  }

  _loadTombstones() {
    try { return JSON.parse(fs.readFileSync(this.tombstonePath, 'utf8')); }
    catch { return []; }
  }

  // ── Compact (rebuild index without tombstoned vectors) ──────────────────
  async compact() {
    const tombstones = this._loadTombstones();
    if (tombstones.length === 0) return { compacted: false, reason: 'no tombstones' };

    const result = await this._call('compact', { payload: { tombstones } });
    // Clear tombstones after successful compact
    if (result.ok) {
      fs.writeFileSync(this.tombstonePath, '[]', 'utf8');
    }
    return { ...result, removedCount: tombstones.length };
  }

  // ── Status ──────────────────────────────────────────────────────────────
  status() {
    const tombstones = this._loadTombstones();
    let indexedCount = 0;
    try {
      if (fs.existsSync(this.metaPath)) {
        indexedCount = fs.readFileSync(this.metaPath, 'utf8').split('\n').filter(Boolean).length;
      }
    } catch {}
    return {
      provider: 'faiss',
      indexed: indexedCount,
      tombstones: tombstones.length,
      indexDir: this.indexDir,
      ready: fs.existsSync(this.indexPath),
    };
  }
}

module.exports = FaissProvider;
