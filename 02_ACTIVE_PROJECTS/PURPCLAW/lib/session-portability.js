'use strict';

/**
 * lib/session-portability.js — Session Export / Import
 *
 * Export a session to a portable archive (.tar.gz), import on any machine.
 * Includes: messages, memory, soul, user profile, files, metadata.
 *
 * Usage:
 *   const SP = require('./lib/session-portability');
 *   const archivePath = await SP.exportSession(sessionKey);
 *   await SP.importSession(archivePath, { targetKey: 'new-key' });
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const zlib  = require('zlib');

// ── Paths ────────────────────────────────────────────────────────────────────

const PURP_DIR     = process.env.PURP_DIR || path.join(os.homedir(), '.purpclaw');
const SESSION_DIR  = path.join(PURP_DIR, 'sessions');
const EXPORT_DIR   = path.join(PURP_DIR, 'exports');

// ── Archive Format ────────────────────────────────────────────────────────────
// Each archive: export_<sessionKey>_<timestamp>.json.gz
// Format: JSON.gz containing:
//   { version: 1, sessionKey, exportedAt, machineId, os, nodeVersion,
//     metadata: { turns, tokens, model, provider, ... },
//     memory: { files: [...], data: {...} },
//     soul: { ... },
//     user: { ... },
//     files: [{path, content, meta}, ...],
//     attachments: [...] }

const EXPORT_VERSION = 1;

// ── Machine ID ────────────────────────────────────────────────────────────────

function getMachineId() {
  const idFile = path.join(PURP_DIR, '.machine-id');
  try {
    if (fs.existsSync(idFile)) return fs.readFileSync(idFile, 'utf8').trim();
    const id = crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(idFile, id);
    return id;
  } catch { return 'unknown'; }
}

// ── Session Snapshot ─────────────────────────────────────────────────────────

/**
 * Take a snapshot of a session by key.
 * Collects all relevant session data.
 */
function snapshotSession(sessionKey) {
  // Find session files
  const sessionPattern = sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sessionFiles = findSessionFiles(sessionPattern);

  const files = [];
  for (const fp of sessionFiles) {
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const rel = path.relative(SESSION_DIR, fp);
      files.push({
        path: rel,
        content: content,
        meta: { size: content.length, mtime: fs.statSync(fp).mtime.toISOString() },
      });
    } catch {}
  }

  // Memory, soul, user
  const memoryFile = path.join(PURP_DIR, 'memory', `${sessionKey}.json`);
  const soulFile   = path.join(PURP_DIR, 'soul',   `${sessionKey}.json`);
  const userFile   = path.join(PURP_DIR, 'user',   `${sessionKey}.json`);

  const memory = fileOrNull(memoryFile);
  const soul   = fileOrNull(soulFile);
  const user   = fileOrNull(userFile);

  return { files, memory, soul, user };
}

function fileOrNull(fp) {
  try {
    if (fs.existsSync(fp)) {
      return { path: fp, content: fs.readFileSync(fp, 'utf8'), meta: fs.statSync(fp) };
    }
  } catch {}
  return null;
}

function findSessionFiles(pattern) {
  const found = [];
  if (!fs.existsSync(SESSION_DIR)) return found;
  const entries = fs.readdirSync(SESSION_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.includes(pattern)) {
      found.push(path.join(SESSION_DIR, entry.name));
    } else if (entry.isDirectory()) {
      const subDir = path.join(SESSION_DIR, entry.name);
      try {
        for (const f of fs.readdirSync(subDir)) {
          if (f.includes(pattern)) found.push(path.join(subDir, f));
        }
      } catch {}
    }
  }
  return found;
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Export a session to a gzipped JSON archive.
 * @param {string} sessionKey
 * @param {object} opts - { includeMemory, includeSoul, includeUser, includeFiles }
 * @returns {Promise<string>} path to archive file
 */
async function exportSession(sessionKey, opts = {}) {
  const {
    includeMemory = true,
    includeSoul   = true,
    includeUser   = true,
    includeFiles  = false, // files can be large — opt-in
  } = opts;

  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const snapshot = snapshotSession(sessionKey);

  const archive = {
    version:    EXPORT_VERSION,
    sessionKey,
    exportedAt: new Date().toISOString(),
    machineId:  getMachineId(),
    os:         process.platform,
    nodeVersion: process.version,
    metadata: {
      exportedBy: 'purpclaw-session-portability',
      options: opts,
      fileCount: snapshot.files.length,
      hasMemory: !!snapshot.memory,
      hasSoul:   !!snapshot.soul,
      hasUser:   !!snapshot.user,
    },
    memory: includeMemory ? snapshot.memory : null,
    soul:   includeSoul   ? snapshot.soul   : null,
    user:   includeUser   ? snapshot.user   : null,
    files:  includeFiles  ? snapshot.files  : snapshot.files.filter(f => {
      // Always include .json session files, not arbitrary attachments
      return f.path.endsWith('.json') || f.path.endsWith('.ndjson') ||
             f.path.endsWith('.md')   || f.path.endsWith('.txt');
    }),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `export_${sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}.json.gz`;
  const archivePath = path.join(EXPORT_DIR, filename);

  const jsonStr = JSON.stringify(archive);
  const gz = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
  fs.writeFileSync(archivePath, gz);

  return archivePath;
}

/**
 * Import a session from a gzipped JSON archive.
 * @param {string} archivePath - path to .json.gz file
 * @param {object} opts - { targetKey, overwrite, merge }
 */
async function importSession(archivePath, opts = {}) {
  const {
    targetKey  = null,
    overwrite  = false,
    merge      = false,
  } = opts;

  if (!fs.existsSync(archivePath)) {
    throw new Error(`Import archive not found: ${archivePath}`);
  }

  // Decompress
  const gz   = fs.readFileSync(archivePath);
  const json  = zlib.gunzipSync(gz).toString('utf8');
  const archive = JSON.parse(json);

  if (!archive.version || !archive.sessionKey) {
    throw new Error('Invalid archive: missing version or sessionKey');
  }

  const destKey = targetKey || archive.sessionKey;

  // Restore memory
  if (archive.memory) {
    const memDir = path.join(PURP_DIR, 'memory');
    if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
    const memFile = path.join(memDir, `${destKey}.json`);
    if (fs.existsSync(memFile) && !overwrite && !merge) {
      // Already exists — skip or merge
    } else {
      fs.writeFileSync(memFile, archive.memory.content);
    }
  }

  // Restore soul
  if (archive.soul) {
    const soulDir = path.join(PURP_DIR, 'soul');
    if (!fs.existsSync(soulDir)) fs.mkdirSync(soulDir, { recursive: true });
    const soulFile = path.join(soulDir, `${destKey}.json`);
    if (!fs.existsSync(soulFile) || overwrite) {
      fs.writeFileSync(soulFile, archive.soul.content);
    }
  }

  // Restore user
  if (archive.user) {
    const userDir = path.join(PURP_DIR, 'user');
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    const userFile = path.join(userDir, `${destKey}.json`);
    if (!fs.existsSync(userFile) || overwrite) {
      fs.writeFileSync(userFile, archive.user.content);
    }
  }

  // Restore session files
  const sessionDestDir = path.join(SESSION_DIR, destKey);
  if (!fs.existsSync(sessionDestDir)) fs.mkdirSync(sessionDestDir, { recursive: true });

  for (const f of archive.files) {
    const destPath = path.join(sessionDestDir, path.basename(f.path));
    if (!fs.existsSync(destPath) || overwrite) {
      fs.writeFileSync(destPath, f.content);
    }
  }

  return {
    version:    archive.version,
    sessionKey: destKey,
    filesRestored: archive.files.length,
    hasMemory: !!archive.memory,
    hasSoul:   !!archive.soul,
    hasUser:   !!archive.user,
  };
}

/**
 * List available export archives.
 */
function listExports() {
  if (!fs.existsSync(EXPORT_DIR)) return [];
  return fs.readdirSync(EXPORT_DIR)
    .filter(f => f.endsWith('.json.gz'))
    .map(f => {
      const fp = path.join(EXPORT_DIR, f);
      const stat = fs.statSync(fp);
      // Peek at archive without full decompress (first 200 bytes = gzip header + partial JSON)
      let meta = {};
      try {
        const gz = fs.readFileSync(fp);
        const json = zlib.gunzipSync(gz).toString('utf8');
        const parsed = JSON.parse(json);
        meta = { sessionKey: parsed.sessionKey, exportedAt: parsed.exportedAt, machineId: parsed.machineId };
      } catch {}
      return { filename: f, path: fp, size: stat.size, mtime: stat.mtime.toISOString(), ...meta };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Delete an export archive.
 */
function deleteExport(filename) {
  const fp = path.join(EXPORT_DIR, filename);
  if (!fp.startsWith(EXPORT_DIR)) throw new Error('Invalid path');
  fs.unlinkSync(fp);
}

/**
 * Inspect an export archive without importing.
 */
function inspectExport(filename) {
  const fp = path.join(EXPORT_DIR, filename);
  const gz = fs.readFileSync(fp);
  const json = zlib.gunzipSync(gz).toString('utf8');
  const archive = JSON.parse(json);
  return {
    version:    archive.version,
    sessionKey: archive.sessionKey,
    exportedAt:  archive.exportedAt,
    machineId:  archive.machineId,
    os:         archive.os,
    nodeVersion: archive.nodeVersion,
    metadata:   archive.metadata,
    fileCount:  archive.files?.length || 0,
    hasMemory:  !!archive.memory,
    hasSoul:    !!archive.soul,
    hasUser:    !!archive.user,
  };
}

module.exports = {
  exportSession,
  importSession,
  listExports,
  deleteExport,
  inspectExport,
  EXPORT_DIR,
  getMachineId,
  EXPORT_VERSION,
};
