'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

function now() { return new Date().toISOString(); }

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function ensureDir(p) { await fsp.mkdir(p, { recursive: true }); }

async function readJson(p) {
  return JSON.parse(await fsp.readFile(p, 'utf8'));
}

async function writeJsonAtomic(p, value) {
  await ensureDir(path.dirname(p));
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tmp, p);
}

async function copyTree(src, dst) {
  await ensureDir(dst);
  const items = await fsp.readdir(src, { withFileTypes: true });
  for (const item of items) {
    const s = path.join(src, item.name);
    const d = path.join(dst, item.name);
    if (item.isDirectory()) await copyTree(s, d);
    else if (item.isFile()) await fsp.copyFile(s, d);
  }
}

async function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p);
    s.on('error', reject);
    s.on('data', d => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

class UpdateManager extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.dataRoot) throw new Error('dataRoot is required');

    this.dataRoot = path.resolve(options.dataRoot);
    this.runtimeDir = path.join(this.dataRoot, 'runtime');
    this.releasesDir = path.join(this.runtimeDir, 'releases');
    this.currentFile = path.join(this.runtimeDir, 'current.json');
    this.previousFile = path.join(this.runtimeDir, 'previous.json');
    this.lockFile = path.join(this.runtimeDir, 'update.lock');
    this.updateDir = path.join(this.dataRoot, 'updates');
    this.inboxDir = path.join(this.updateDir, 'inbox');
    this.stagingDir = path.join(this.updateDir, 'staging');
    this.rejectedDir = path.join(this.updateDir, 'rejected');
    this.historyFile = path.join(this.updateDir, 'history.ndjson');
    this.settingsFile = path.join(this.updateDir, 'settings.json');

    this.callbacks = {
      createSnapshot: options.createSnapshot || (async () => null),
      preflightRelease: options.preflightRelease || (async () => ({ ok: true })),
      verifyReleaseRuntime: options.verifyReleaseRuntime || (async () => ({ ok: true })),
      checkpointRuntime: options.checkpointRuntime || (async () => null),
      activateRelease: options.activateRelease || (async () => {}),
      postActivationHealth: options.postActivationHealth || (async () => ({ ok: true })),
      rollbackRuntime: options.rollbackRuntime || (async () => {})
    };
  }

  async init() {
    for (const p of [
      this.runtimeDir, this.releasesDir, this.updateDir,
      this.inboxDir, this.stagingDir, this.rejectedDir
    ]) await ensureDir(p);

    if (!(await exists(this.settingsFile))) {
      await writeJsonAtomic(this.settingsFile, {
        channel: 'local',
        autoMode: 'notify',
        channelUrls: { dev: null, stable: null },
        pollMs: 2500
      });
    }
  }

  emitEvent(type, data = {}) {
    const evt = { type, at: now(), ...data };
    this.emit('event', evt);
    return evt;
  }

  async history(event) {
    await ensureDir(path.dirname(this.historyFile));
    await fsp.appendFile(this.historyFile, JSON.stringify(event) + '\n', 'utf8');
  }

  async withLock(fn) {
    await ensureDir(this.runtimeDir);
    let fd;
    try {
      fd = await fsp.open(this.lockFile, 'wx');
      await fd.writeFile(JSON.stringify({ pid: process.pid, at: now() }), 'utf8');
    } catch (err) {
      if (err.code === 'EEXIST') throw new Error('update already in progress');
      throw err;
    }

    try { return await fn(); }
    finally {
      try { await fd.close(); } catch {}
      try { await fsp.unlink(this.lockFile); } catch {}
    }
  }

  async settings() {
    await this.init();
    return readJson(this.settingsFile);
  }

  async setAutoMode(mode) {
    if (!['off', 'notify', 'safe', 'aggressive'].includes(mode)) {
      throw new Error(`invalid auto mode: ${mode}`);
    }
    const s = await this.settings();
    s.autoMode = mode;
    await writeJsonAtomic(this.settingsFile, s);
    const evt = this.emitEvent('runtime.update.auto.changed', { autoMode: mode });
    await this.history(evt);
    return s;
  }

  async setChannel(channel) {
    if (!['local', 'dev', 'stable'].includes(channel)) {
      throw new Error(`invalid update channel: ${channel}`);
    }
    const s = await this.settings();
    s.channel = channel;
    await writeJsonAtomic(this.settingsFile, s);
    const evt = this.emitEvent('runtime.update.channel.changed', { channel });
    await this.history(evt);
    return s;
  }

  async status() {
    await this.init();
    const settings = await this.settings();
    const current = await exists(this.currentFile) ? await readJson(this.currentFile) : null;
    const previous = await exists(this.previousFile) ? await readJson(this.previousFile) : null;
    const candidates = await this.scanLocalCandidates();
    return {
      channel: settings.channel,
      autoMode: settings.autoMode,
      current,
      previous,
      rollbackAvailable: !!previous,
      candidates
    };
  }

  async scanLocalCandidates() {
    await this.init();
    const out = [];
    for (const name of await fsp.readdir(this.inboxDir)) {
      const p = path.join(this.inboxDir, name);
      const st = await fsp.stat(p);
      if (!st.isDirectory()) continue;
      const mf = path.join(p, 'purpclaw-update.json');
      if (!(await exists(mf))) continue;
      try {
        const manifest = await readJson(mf);
        if (manifest.product === 'purpclaw') out.push({ source: p, manifest });
      } catch {}
    }
    out.sort((a, b) => String(b.manifest.createdAt || '').localeCompare(String(a.manifest.createdAt || '')));
    return out;
  }

  async validateManifest(manifest) {
    if (!manifest || manifest.product !== 'purpclaw') throw new Error('not a PURPCLAW update');
    for (const k of ['version', 'releaseId', 'entry', 'channel', 'createdAt']) {
      if (!manifest[k]) throw new Error(`manifest missing ${k}`);
    }
    return true;
  }

  async verifyFiles(root, manifest) {
    if (!Array.isArray(manifest.files)) return { ok: true, checked: 0 };
    let checked = 0;
    for (const f of manifest.files) {
      const full = path.join(root, f.path);
      if (!(await exists(full))) return { ok: false, error: `missing ${f.path}` };
      const actual = await sha256File(full);
      if (actual.toLowerCase() !== f.sha256.toLowerCase()) {
        return { ok: false, error: `hash mismatch ${f.path}`, expected: f.sha256, actual };
      }
      checked++;
    }
    return { ok: true, checked };
  }

  async stageDirectory(source) {
    source = path.resolve(source);
    const manifestPath = path.join(source, 'purpclaw-update.json');
    if (!(await exists(manifestPath))) throw new Error('purpclaw-update.json not found');
    const manifest = await readJson(manifestPath);
    await this.validateManifest(manifest);

    const evtStart = this.emitEvent('runtime.update.stage.started', {
      version: manifest.version, releaseId: manifest.releaseId, source
    });
    await this.history(evtStart);

    const verified = await this.verifyFiles(source, manifest);
    if (!verified.ok) throw new Error(verified.error);

    const stage = path.join(this.stagingDir, `${manifest.version}-${manifest.releaseId}`);
    await fsp.rm(stage, { recursive: true, force: true });
    await copyTree(source, stage);

    const preflight = await this.callbacks.preflightRelease({ stage, manifest });
    if (!preflight || preflight.ok !== true) {
      throw new Error(`release preflight failed: ${JSON.stringify(preflight)}`);
    }

    const evt = this.emitEvent('runtime.update.staged', {
      version: manifest.version, releaseId: manifest.releaseId, stage, checkedFiles: verified.checked
    });
    await this.history(evt);
    return { stage, manifest };
  }

  async applyDirectory(source) {
    return this.withLock(async () => {
      let activated = false;
      let previous = null;
      let manifest = null;
      let checkpoint = null;

      try {
        const staged = await this.stageDirectory(source);
        manifest = staged.manifest;

        this.emitEvent('runtime.update.verification.started', { version: manifest.version });
        const runtimeCheck = await this.callbacks.verifyReleaseRuntime(staged);
        if (!runtimeCheck || runtimeCheck.ok !== true) {
          throw new Error(`staged runtime verification failed: ${JSON.stringify(runtimeCheck)}`);
        }
        this.emitEvent('runtime.update.verification.passed', { version: manifest.version });

        const current = await exists(this.currentFile) ? await readJson(this.currentFile) : null;
        previous = current;
        await this.callbacks.createSnapshot({ current, next: manifest });
        checkpoint = await this.callbacks.checkpointRuntime({ current, next: manifest });

        const releasePath = path.join(this.releasesDir, manifest.version);
        await fsp.rm(releasePath, { recursive: true, force: true });
        await fsp.rename(staged.stage, releasePath);

        const nextPointer = {
          version: manifest.version,
          releaseId: manifest.releaseId,
          releasePath,
          activatedAt: now()
        };

        const activationEvt = this.emitEvent('runtime.update.activation.started', {
          from: current?.version || null,
          to: manifest.version
        });
        await this.history(activationEvt);

        if (current) await writeJsonAtomic(this.previousFile, current);
        await writeJsonAtomic(this.currentFile, nextPointer);
        activated = true;

        this.emitEvent('runtime.update.reconnecting', { version: manifest.version });
        await this.callbacks.activateRelease({ current, next: nextPointer, manifest, checkpoint });

        const post = await this.callbacks.postActivationHealth({ next: nextPointer, manifest });
        if (!post || post.ok !== true) {
          throw new Error(`post-activation health failed: ${JSON.stringify(post)}`);
        }

        const done = this.emitEvent('runtime.update.completed', {
          from: previous?.version || null,
          to: manifest.version,
          releaseId: manifest.releaseId
        });
        await this.history(done);
        return { ok: true, current: nextPointer, previous };
      } catch (err) {
        const failed = this.emitEvent('runtime.update.failed', {
          version: manifest?.version || null,
          error: err.message
        });
        await this.history(failed);

        if (activated && previous) {
          const rb = this.emitEvent('runtime.update.rollback.started', {
            from: manifest?.version || null, to: previous.version
          });
          await this.history(rb);
          await writeJsonAtomic(this.currentFile, previous);
          await this.callbacks.rollbackRuntime({ previous, failedManifest: manifest, checkpoint });
          const rbd = this.emitEvent('runtime.update.rolled_back', {
            to: previous.version
          });
          await this.history(rbd);
        }
        throw err;
      }
    });
  }

  async rollback() {
    return this.withLock(async () => {
      if (!(await exists(this.previousFile))) throw new Error('no previous release available');
      const current = await exists(this.currentFile) ? await readJson(this.currentFile) : null;
      const previous = await readJson(this.previousFile);
      const checkpoint = await this.callbacks.checkpointRuntime({ current, next: previous });

      const start = this.emitEvent('runtime.update.rollback.started', {
        from: current?.version || null, to: previous.version
      });
      await this.history(start);

      if (current) await writeJsonAtomic(this.previousFile, current);
      await writeJsonAtomic(this.currentFile, previous);
      await this.callbacks.rollbackRuntime({ previous, current, checkpoint });

      const done = this.emitEvent('runtime.update.rolled_back', { to: previous.version });
      await this.history(done);
      return { ok: true, current: previous };
    });
  }
}

module.exports = { UpdateManager };
