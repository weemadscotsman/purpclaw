'use strict';

/**
 * services/artifact-store — Artifact Storage
 * Stub — stores generated artifacts from harness runs.
 */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

class ArtifactStore {
  constructor(opts) {
    this.root = opts?.root || path.join(process.env.PURP_DIR || '.', 'agent_work', 'artifacts');
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true });
  }

  put(taskId, filename, content, metadata) {
    const id  = `${taskId}_${filename}_${Date.now()}`;
    const dir = path.join(this.root, taskId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, filename);
    fs.writeFileSync(full, Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 2));
    const checksum = crypto.createHash('sha256').update(
      Buffer.isBuffer(content) ? content : JSON.stringify(content)
    ).digest('hex');
    const record = { id, taskId, filename, path: full, checksum, metadata,
                     storedAt: new Date().toISOString() };
    return record;
  }

  get(taskId) {
    const dir = path.join(this.root, taskId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map(f => {
      const full = path.join(dir, f);
      return { filename: f, size: fs.statSync(full).size, path: full };
    });
  }

  list() {
    if (!fs.existsSync(this.root)) return [];
    return fs.readdirSync(this.root).map(d => ({
      taskId: d,
      count:  fs.readdirSync(path.join(this.root, d)).length,
    }));
  }
}

module.exports = { ArtifactStore };
