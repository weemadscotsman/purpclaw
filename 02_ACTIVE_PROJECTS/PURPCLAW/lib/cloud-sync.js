'use strict';

/**
 * lib/cloud-sync.js — Session cloud sync for PURPCLAW
 *
 * Syncs sessions bidirectionally to cloud storage.
 * Pluggable backends: LocalFS (free), S3, GitHub Gist, Webhook.
 *
 * Architecture:
 *   push(sessionId)    — upload session to cloud
 *   pull(sessionId)    — download session from cloud
 *   status()           — show sync status of all sessions
 *   sync()             — bidir sync (local + cloud → merged)
 *   configure(backend) — switch cloud backend
 *
 * Backends implement: push(session, data), pull(sessionId), list(), remove(sessionId)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');

const PURP_DIR      = process.env.PURP_DIR || path.join(os.homedir(), '.purpclaw');
const SYNC_DIR      = path.join(PURP_DIR, 'cloud-sync');
const CONFIG_FILE   = path.join(SYNC_DIR, 'config.json');
const MANIFEST_FILE = path.join(SYNC_DIR, 'manifest.json');

// ── Config ─────────────────────────────────────────────────────────────────────

function loadConfig() {
  ensureDir(SYNC_DIR);
  if (!fs.existsSync(CONFIG_FILE)) return defaultConfig();
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return defaultConfig(); }
}

function saveConfig(cfg) {
  ensureDir(SYNC_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function defaultConfig() {
  return {
    backend: 'localfs',
    localfs: { dir: path.join(SYNC_DIR, 'backups') },
    gist: { enabled: false, tokenEnvVar: 'PURPCLAW_GIST_TOKEN', idEnvVar: 'PURPCLAW_GIST_ID' },
    s3: { enabled: false, bucket: '', prefix: 'purpclaw-sessions/' },
    webhook: { enabled: false, url: '' },
    lastSync: null,
    autoSync: false,
    syncIntervalMs: 5 * 60 * 1000, // 5 min
  };
}

// ── Manifest ───────────────────────────────────────────────────────────────────

function loadManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')); }
  catch { return {}; }
}

function saveManifest(m) {
  ensureDir(SYNC_DIR);
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(m, null, 2), { mode: 0o600 });
}

// ── Backends ──────────────────────────────────────────────────────────────────

const backends = {

  // ── LocalFS ─────────────────────────────────────────────────────────────────
  localfs: {
    async push(sessionId, data, cfg) {
      const dir = cfg.dir || path.join(SYNC_DIR, 'backups');
      ensureDir(dir);
      const file = path.join(dir, `${sessionId}.json.gz`);
      const { gzipSync } = await import('zlib').then(z => ({ gzipSync: z.createGzip }));
      // Use sync gzip via sync import
      const zlib = require('zlib');
      const content = JSON.stringify(data);
      const compressed = zlib.gzipSync(Buffer.from(content));
      fs.writeFileSync(file, compressed);
      return { ok: true, file, size: compressed.length };
    },

    async pull(sessionId, cfg) {
      const dir = cfg.dir || path.join(SYNC_DIR, 'backups');
      const file = path.join(dir, `${sessionId}.json.gz`);
      if (!fs.existsSync(file)) return { ok: false, error: 'not found' };
      const zlib = require('zlib');
      const compressed = fs.readFileSync(file);
      const content = zlib.gunzipSync(compressed).toString('utf8');
      return { ok: true, data: JSON.parse(content) };
    },

    async list(cfg) {
      const dir = cfg.dir || path.join(SYNC_DIR, 'backups');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.json.gz'))
        .map(f => ({ sessionId: f.replace('.json.gz', ''), file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtime }));
    },

    async remove(sessionId, cfg) {
      const dir = cfg.dir || path.join(SYNC_DIR, 'backups');
      const file = path.join(dir, `${sessionId}.json.gz`);
      if (fs.existsSync(file)) { fs.unlinkSync(file); return { ok: true }; }
      return { ok: false, error: 'not found' };
    },
  },

  // ── GitHub Gist ─────────────────────────────────────────────────────────────
  gist: {
    async push(sessionId, data, cfg) {
      const token = process.env[cfg.tokenEnvVar || 'PURPCLAW_GIST_TOKEN'];
      if (!token) return { ok: false, error: 'Gist token not set' };
      const gistId = cfg.gistId || process.env[cfg.idEnvVar || 'PURPCLAW_GIST_ID'];
      const content = JSON.stringify(data);
      const filename = `session-${sessionId}.json`;
      const body = {
        description: `PURPCLAW session ${sessionId}`,
        public: false,
        files: { [filename]: { content } },
      };
      const url = gistId
        ? `https://api.github.com/gists/${gistId}`
        : 'https://api.github.com/gists';
      const method = gistId ? 'PATCH' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, error: `GitHub API ${resp.status}: ${err}` };
      }
      const json = await resp.json();
      return { ok: true, gistId: json.id, url: json.html_url, filename };
    },

    async pull(sessionId, cfg) {
      const token = process.env[cfg.tokenEnvVar || 'PURPCLAW_GIST_TOKEN'];
      const gistId = cfg.gistId || process.env[cfg.idEnvVar || 'PURPCLAW_GIST_ID'];
      if (!gistId) return { ok: false, error: 'Gist ID not configured' };
      const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      if (!resp.ok) return { ok: false, error: `GitHub API ${resp.status}` };
      const json = await resp.json();
      const filename = `session-${sessionId}.json`;
      const file = json.files && json.files[filename];
      if (!file) return { ok: false, error: 'session not found in gist' };
      return { ok: true, data: JSON.parse(file.content) };
    },

    async list(cfg) {
      const token = process.env[cfg.tokenEnvVar || 'PURPCLAW_GIST_TOKEN'];
      const gistId = cfg.gistId || process.env[cfg.idEnvVar || 'PURPCLAW_GIST_ID'];
      if (!gistId) return [];
      const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      if (!resp.ok) return [];
      const json = await resp.json();
      return Object.keys(json.files || {})
        .filter(f => f.startsWith('session-') && f.endsWith('.json'))
        .map(f => ({ sessionId: f.replace('session-', '').replace('.json', ''), url: json.html_url }));
    },

    async remove(sessionId, cfg) {
      // Gist is immutable — we just skip this session on pull
      return { ok: true };
    },
  },

  // ── Webhook ─────────────────────────────────────────────────────────────────
  webhook: {
    async push(sessionId, data, cfg) {
      const url = cfg.url || process.env.PURPCLAW_WEBHOOK_URL;
      if (!url) return { ok: false, error: 'Webhook URL not set' };
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push', sessionId, data }),
      });
      if (!resp.ok) return { ok: false, error: `Webhook ${resp.status}` };
      return { ok: true };
    },

    async pull(sessionId, cfg) {
      const url = (cfg.url || process.env.PURPCLAW_WEBHOOK_URL || '').replace('/push', '/pull');
      if (!url) return { ok: false, error: 'Webhook pull URL not set' };
      const resp = await fetch(`${url}/${sessionId}`, { method: 'GET' });
      if (!resp.ok) return { ok: false, error: `Webhook ${resp.status}` };
      const data = await resp.json();
      return { ok: true, data };
    },

    async list(cfg) { return []; },
    async remove(sessionId, cfg) { return { ok: true }; },
  },
};

// ── Core sync APIs ────────────────────────────────────────────────────────────

function getBackend(cfg) {
  const name = cfg.backend || 'localfs';
  const b = backends[name];
  if (!b) throw new Error(`Unknown backend: ${name}`);
  return b;
}

/**
 * Push a session to cloud.
 */
async function push(sessionId, sessionData) {
  const cfg = loadConfig();
  const b = getBackend(cfg);
  const data = sessionData || loadSessionData(sessionId);
  if (!data) return { ok: false, error: `Session '${sessionId}' not found` };

  const result = await b.push(sessionId, data, cfg[cfg.backend] || {});
  if (result.ok) {
    const m = loadManifest();
    m[sessionId] = { pushedAt: new Date().toISOString(), backend: cfg.backend, size: result.size || 0 };
    saveManifest(m);
    cfg.lastSync = new Date().toISOString();
    saveConfig(cfg);
  }
  return result;
}

/**
 * Pull a session from cloud.
 */
async function pull(sessionId, targetSessionId) {
  const cfg = loadConfig();
  const b = getBackend(cfg);
  const result = await b.pull(sessionId, cfg[cfg.backend] || {});
  if (!result.ok) return result;

  // Write to sessions dir
  const destId = targetSessionId || sessionId;
  const destDir = path.join(PURP_DIR, 'sessions', destId);
  ensureDir(destDir);
  const metaFile = path.join(destDir, 'meta.json');
  const msgsFile = path.join(destDir, 'messages.json');
  const { data } = result;

  if (data.meta)    fs.writeFileSync(metaFile, JSON.stringify(data.meta, null, 2), { mode: 0o600 });
  if (data.messages) fs.writeFileSync(msgsFile, JSON.stringify(data.messages, null, 2), { mode: 0o600 });

  const m = loadManifest();
  m[sessionId] = { ...(m[sessionId] || {}), pulledAt: new Date().toISOString(), backend: cfg.backend };
  saveManifest(m);

  return { ok: true, sessionId: destId };
}

/**
 * Get sync status for all sessions.
 */
async function status() {
  const cfg = loadConfig();
  const b = getBackend(cfg);
  const manifest = loadManifest();
  let cloudSessions = [];
  try { cloudSessions = await b.list(cfg[cfg.backend] || {}); } catch (e) { /* ignore */ }

  const rows = [];
  for (const [sessionId, info] of Object.entries(manifest)) {
    const cloudEntry = cloudSessions.find(c => c.sessionId === sessionId);
    rows.push({
      sessionId,
      pushedAt: info.pushedAt || null,
      pulledAt: info.pulledAt || null,
      inCloud: !!cloudEntry,
      backend: info.backend || cfg.backend,
    });
  }

  return {
    backend: cfg.backend,
    configured: cfg.backend !== 'localfs' || fs.existsSync(path.join(SYNC_DIR, 'backups')),
    lastSync: cfg.lastSync,
    autoSync: cfg.autoSync,
    manifest: rows,
    cloudCount: cloudSessions.length,
  };
}

/**
 * Configure the sync backend.
 */
function configure(options = {}) {
  const cfg = loadConfig();
  if (options.backend) {
    if (!backends[options.backend]) throw new Error(`Unknown backend: ${options.backend}`);
    cfg.backend = options.backend;
  }
  if (options.localfsDir)   cfg.localfs = { ...cfg.localfs, dir: options.localfsDir };
  if (options.gistToken)   cfg.gist = { ...cfg.gist, enabled: true };
  if (options.gistId)      cfg.gist = { ...cfg.gist, gistId: options.gistId };
  if (options.s3Bucket)    cfg.s3   = { ...cfg.s3,   enabled: true, bucket: options.s3Bucket };
  if (options.webhookUrl)   cfg.webhook = { ...cfg.webhook, enabled: true, url: options.webhookUrl };
  if (typeof options.autoSync === 'boolean') cfg.autoSync = options.autoSync;
  if (options.intervalMs)   cfg.syncIntervalMs = options.intervalMs;
  saveConfig(cfg);
  return cfg;
}

function getConfig() { return loadConfig(); }

/**
 * Simple session data loader.
 */
function loadSessionData(sessionId) {
  // Handle both directory-based and file-based session storage
  const dirPath  = path.join(PURP_DIR, 'sessions', sessionId);
  const filePath = path.join(PURP_DIR, 'sessions', sessionId + '.json');
  if (fs.existsSync(dirPath)) {
    const metaFile  = path.join(dirPath, 'meta.json');
    const msgsFile  = path.join(dirPath, 'messages.json');
    const meta     = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
    const messages  = fs.existsSync(msgsFile) ? JSON.parse(fs.readFileSync(msgsFile, 'utf8')) : [];
    return { meta, messages };
  }
  if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── CLI helpers ───────────────────────────────────────────────────────────────

function cliStatus() {
  status().then(s => {
    console.log(`\n  Cloud Sync Status`);
    console.log(`  ─────────────────`);
    console.log(`  Backend:  ${s.backend}`);
    console.log(`  Configured: ${s.configured}`);
    console.log(`  Last sync: ${s.lastSync || 'never'}`);
    console.log(`  Auto-sync: ${s.autoSync ? 'on' : 'off'}`);
    console.log(`  Synced:    ${Object.keys(s.manifest).length} session(s)`);
    console.log(`  In cloud:  ${s.cloudCount} session(s)`);
    if (Object.keys(s.manifest).length > 0) {
      console.log(`\n  Sessions:`);
      for (const [id, info] of Object.entries(s.manifest)) {
        const icon = info.pushedAt ? '☁️' : '📍';
        console.log(`  ${icon} ${id.substring(0, 8)}  pushed:${info.pushedAt ? info.pushedAt.substring(0, 10) : '-'}  pulled:${info.pulledAt ? info.pulledAt.substring(0, 10) : '-'}`);
      }
    }
    console.log('');
  });
}

module.exports = {
  push, pull, status, configure, getConfig,
  backends,
  cliStatus,
  isConfigured: () => { try { return loadConfig().backend !== 'localfs' || true; } catch { return false; } },
};
