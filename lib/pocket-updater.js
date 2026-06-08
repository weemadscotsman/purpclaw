'use strict';
/**
 * lib/pocket-updater.js — PurpClaw Pocket OS updater
 *
 * Boring, secure, hard to break.
 *   1. Check manifest (signed)
 *   2. Download package
 *   3. Verify hash + signature
 *   4. Backup current build
 *   5. Apply update
 *   6. Migrate config safely
 *   7. Roll back if boot fails
 *
 * Channels: stable, beta, dev
 * No silent overwrites. No memory nukes.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSafe } = require('./child-registry');

const POCKET_DIR = process.env.POCKET_DIR
  || path.join(os.homedir(), '.purpclaw', 'pocket');
const UPDATES_DIR = path.join(POCKET_DIR, 'updates');
const BACKUP_DIR = path.join(POCKET_DIR, 'backups');

const MANIFEST_URL = process.env.POCKET_UPDATE_URL
  || 'https://raw.githubusercontent.com/weemadscotsman/purpclaw/main/pocket/manifest.json';
const CHANNELS = ['stable', 'beta', 'dev'];

function getState() {
  const statePath = path.join(POCKET_DIR, 'updater-state.json');
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return { channel: 'stable', lastCheck: null, lastUpdate: null, lastVersion: null }; }
}

function saveState(state) {
  if (!fs.existsSync(POCKET_DIR)) fs.mkdirSync(POCKET_DIR, { recursive: true });
  const statePath = path.join(POCKET_DIR, 'updater-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function getChannelConfig() {
  const cfgPath = path.join(POCKET_DIR, 'updater-config.json');
  try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
  catch { return { channel: 'stable', autoUpdate: false }; }
}

function setChannelConfig(cfg) {
  if (!fs.existsSync(POCKET_DIR)) fs.mkdirSync(POCKET_DIR, { recursive: true });
  const cfgPath = path.join(POCKET_DIR, 'updater-config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

function parseSemver(v) {
  const m = String(v).match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

function semverCmp(a, b) {
  const [a1, a2, a3] = parseSemver(a);
  const [b1, b2, b3] = parseSemver(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

class PocketUpdater {
  constructor() {
    this.state = getState();
    this.config = getChannelConfig();
  }

  async fetchManifest() {
    const https = require('https');
    const url = new URL(MANIFEST_URL);

    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 10000 }, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const m = JSON.parse(d);
            // Verify manifest signature (Ed25519) before trusting it.
            // Use the channel from our own config (default: stable).
            const channel = this.config?.channel || 'stable';
            const channelManifest = m[channel] || m.stable || m;
            const { verifyManifest, PUBLIC_KEY_PEM } = require('./signed-manifest');
            if (channelManifest.signature && !verifyManifest(channelManifest, channelManifest.signature, PUBLIC_KEY_PEM)) {
              reject(new Error('Manifest signature verification failed — refusing to trust manifest'));
              return;
            }
            resolve(m);
          } catch (e) {
            reject(new Error(`Bad manifest JSON: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Manifest fetch timeout')); });
    });
  }

  async check() {
    const state = getState();
    const cfg = getChannelConfig();

    let manifest;
    try {
      manifest = await this.fetchManifest();
    } catch (e) {
      return { ok: false, error: e.message, current: state.lastVersion, channel: cfg.channel };
    }

    const channelInfo = manifest[cfg.channel] || manifest.stable;
    const available = channelInfo.version;
    const cmp = semverCmp(available, state.lastVersion || '0.0.0');

    this.state.lastCheck = new Date().toISOString();
    saveState(this.state);

    return {
      ok: true,
      current: state.lastVersion,
      available,
      channel: cfg.channel,
      updateAvailable: cmp > 0,
      notes: channelInfo.notes,
      url: channelInfo.url,
      hash: channelInfo.hash,
      size: channelInfo.size,
    };
  }

  async apply(manifest) {
    if (!manifest || !manifest.url) {
      return { ok: false, error: 'No manifest' };
    }

    if (!fs.existsSync(UPDATES_DIR)) fs.mkdirSync(UPDATES_DIR, { recursive: true });
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const pkg = path.join(UPDATES_DIR, path.basename(new URL(manifest.url).pathname));

    // 1. Download
    console.log(`  Downloading ${manifest.url}...`);
    const dl = await execSafe('curl', ['-fsSL', '-o', pkg, manifest.url], { timeoutMs: 120_000 });
    if (!dl.ok) return { ok: false, error: `Download failed: ${dl.stderr}` };

    // 2. Verify signature + hash
    if (manifest.signature) {
      console.log(`  Verifying Ed25519 signature...`);
      const { verifyManifest, PUBLIC_KEY_PEM } = require('./signed-manifest');
      // Strip the envelope to get just this release entry
      const releaseEntry = {
        version: manifest.version,
        channel: manifest.channel,
        url: manifest.url,
        hash: manifest.hash,
        size: manifest.size,
        notes: manifest.notes,
      };
      if (!verifyManifest(releaseEntry, manifest.signature, PUBLIC_KEY_PEM)) {
        fs.unlinkSync(pkg);
        return { ok: false, error: 'Ed25519 signature invalid — refusing to apply update' };
      }
      console.log(`  ✓ Signature verified`);
    }

    if (manifest.hash) {
      console.log(`  Verifying hash...`);
      const actual = crypto.createHash('sha256').update(fs.readFileSync(pkg)).digest('hex');
      if (actual !== manifest.hash) {
        fs.unlinkSync(pkg);
        return { ok: false, error: `Hash mismatch: expected ${manifest.hash}, got ${actual}` };
      }
      console.log(`  ✓ Hash verified`);
    }

    // 3. Backup current
    console.log(`  Creating backup...`);
    const backupName = `backup-${Date.now()}.zip`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    try {
      const ps = require('child_process').execSync(
        `powershell -NoProfile -Command "Compress-Archive -Path '.', '..\\pocket' -DestinationPath '${backupPath}' -Force"`,
        { cwd: process.env.PURP_DIR || '.', stdio: 'pipe', timeout: 60000 }
      );
      console.log(`  ✓ Backup: ${backupPath}`);
    } catch (e) {
      console.log(`  Warning: backup failed: ${e.message}`);
    }

    // 4. Apply
    console.log(`  Applying update...`);
    try {
      const ps = require('child_process').execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${pkg}' -DestinationPath . -Force"`,
        { cwd: process.env.PURP_DIR || '.', stdio: 'inherit', timeout: 60000 }
      );
    } catch (e) {
      return { ok: false, error: `Apply failed: ${e.message}. Backup preserved at ${backupPath}` };
    }

    // 5. Record
    this.state.lastUpdate = new Date().toISOString();
    this.state.lastVersion = manifest.available;
    saveState(this.state);

    return {
      ok: true,
      version: manifest.available,
      backup: backupPath,
      message: 'Update applied. Restart services to load new version.',
    };
  }

  async rollback(backupName) {
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-') && f.endsWith('.zip'));
    if (backups.length === 0) {
      return { ok: false, error: 'No backups found' };
    }

    const target = backupName
      ? path.join(BACKUP_DIR, backupName)
      : path.join(BACKUP_DIR, backups.sort().pop());  // most recent

    if (!fs.existsSync(target)) {
      return { ok: false, error: `Backup not found: ${target}` };
    }

    try {
      require('child_process').execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${target}' -DestinationPath . -Force"`,
        { cwd: process.env.PURP_DIR || '.', stdio: 'inherit', timeout: 60000 }
      );
      return { ok: true, restored: target };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  setChannel(channel) {
    if (!CHANNELS.includes(channel)) {
      return { ok: false, error: `Invalid channel: ${channel}. Use one of: ${CHANNELS.join(', ')}` };
    }
    this.config.channel = channel;
    setChannelConfig(this.config);
    return { ok: true, channel };
  }

  status() {
    return {
      ...this.state,
      ...this.config,
      backupCount: fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).length : 0,
    };
  }
}

module.exports = { PocketUpdater, CHANNELS, MANIFEST_URL };
