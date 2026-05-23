'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAP_DIR = path.join(__dirname, '..', 'agent_work', '.snapshots');

// ── Snapshot creation ────────────────────────────────────────────────────────

function ensureSnapDir() {
  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
}

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch { return null; }
}

function createSnapshot(workflowId, command, contractType, options = {}) {
  ensureSnapDir();
  const snap = {
    workflowId,
    createdAt: new Date().toISOString(),
    command: command || '',
    contractType: contractType || 'unknown',
    files: [],
    configState: {},
  };

  const configs = ['.env', 'policies.json', 'service_registry.js', 'ecosystem.config.js',
                  'next.config.ts', 'package.json', 'bin/purpclaw.js'];
  for (const cfg of configs) {
    const fp = path.join(__dirname, '..', cfg);
    if (fs.existsSync(fp)) {
      const h = hashFile(fp);
      if (h) snap.configState[cfg] = { hash: h, size: fs.statSync(fp).size };
    }
  }

  if (options.files) {
    for (const fp of options.files) {
      const full = path.isAbsolute(fp) ? fp : path.join(__dirname, '..', fp);
      if (fs.existsSync(full)) {
        const h = hashFile(full);
        if (h) {
          snap.files.push({ path: fp, hash: h, size: fs.statSync(full).size, mtime: fs.statSync(full).mtime });
        }
      }
    }
  }

  const snapFile = path.join(SNAP_DIR, `${workflowId}.snap.json`);
  fs.writeFileSync(snapFile, JSON.stringify(snap, null, 2), 'utf8');
  return snapFile;
}

function listSnapshots(limit = 20) {
  if (!fs.existsSync(SNAP_DIR)) return [];
  return fs.readdirSync(SNAP_DIR)
    .filter(f => f.endsWith('.snap.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, limit);
}

function getSnapshot(workflowId) {
  const fp = path.join(SNAP_DIR, `${workflowId}.snap.json`);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return null; }
}

function diffSnapshot(workflowId, currentState = {}) {
  const snap = getSnapshot(workflowId);
  if (!snap) return { error: 'Snapshot not found' };

  const report = { workflowId, changed: [], missing: [], intact: [] };
  for (const cfg of Object.keys(snap.configState)) {
    const fp = path.join(__dirname, '..', cfg);
    if (!fs.existsSync(fp)) {
      report.missing.push(cfg);
    } else {
      const h = hashFile(fp);
      if (h !== snap.configState[cfg].hash) {
        report.changed.push({ path: cfg, old: snap.configState[cfg].hash, new: h });
      } else {
        report.intact.push(cfg);
      }
    }
  }
  return report;
}

function snapshotCount() {
  if (!fs.existsSync(SNAP_DIR)) return 0;
  return fs.readdirSync(SNAP_DIR).filter(f => f.endsWith('.snap.json')).length;
}

module.exports = {
  createSnapshot,
  listSnapshots,
  getSnapshot,
  diffSnapshot,
  snapshotCount,
  SNAP_DIR,
};
