/**
 * Checkpoint Manager — Transparent filesystem snapshots via a single shared
 * shadow git store (Node.js ESM).
 *
 * Storage layout (single shared store, git objects deduplicated across projects):
 *
 *   ~/.purpclaw/checkpoints/
 *       store/                          — single bare-ish git repo
 *           HEAD, config, objects/      — standard git internals (shared)
 *           refs/hermes/<hash16>        — per-project branch tip
 *           indexes/<hash16>            — per-project git index
 *           projects/<hash16>.json       — {workdir, created_at, last_touch}
 *           info/exclude                 — default excludes (shared)
 *
 * Uses GIT_DIR + GIT_WORK_TREE + GIT_INDEX_FILE isolation so no git state
 * leaks into the user's project directory.
 */

'use strict';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// lib/paths.js is CommonJS; this module is ESM. createRequire is the supported
// bridge and keeps one canonical state-root resolver for the whole runtime.
const PURP_PATHS = createRequire(import.meta.url)('./paths.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Constants ────────────────────────────────────────────────────────────────

const STORE_DIRNAME = 'store';
const REFS_PREFIX = 'refs/hermes';
const INDEXES_DIRNAME = 'indexes';
const PROJECTS_DIRNAME = 'projects';

/** @type {string[]} */
const DEFAULT_EXCLUDES = [
  // Dependency / build output
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  '__pycache__/',
  '.cache/',
  // VCS
  '.git/',
  // Secrets
  '.env',
  // Logs & binaries
  '*.log',
  '*.exe',
  '*.dll',
  '*.zip',
  '*.tar',
];

const GIT_TIMEOUT_MS = 30000;
const MAX_FILES = 50000;

// ── Path helpers ────────────────────────────────────────────────────────────

function normalizePath(p) {
  // Expand ~ to home directory manually (path.expandUser doesn't exist in Node)
  if (p.startsWith('~/') || p === '~') {
    p = path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(path.normalize(p));
}

function projectHash(workingDir) {
  return crypto.createHash('sha256').update(normalizePath(workingDir)).digest('hex').slice(0, 16);
}

function checkpointBase() {
  // PURPCLAW state lives inside the project, never in the user profile.
  // This used os.homedir(), which put checkpoints in C:\Users\<user>\.purpclaw
  // while sessions lived in <project>/.purpclaw — two state roots, and the
  // homedir literal is one of the paths @vercel/nft followed out of the project
  // during `next build`, walking into the looping `Application Data` junction.
  // lib/paths.js resolves the single correct root.
  const base = process.env.PURPCLAW_CHECKPOINT_BASE
    || path.join(PURP_PATHS.DATA_ROOT, 'checkpoints');
  return base;
}

function storePath(base) {
  return path.join(base, STORE_DIRNAME);
}

function indexPath(store, dirHash) {
  return path.join(store, INDEXES_DIRNAME, dirHash);
}

function refName(dirHash) {
  return `${REFS_PREFIX}/${dirHash}`;
}

function projectMetaPath(store, dirHash) {
  return path.join(store, PROJECTS_DIRNAME, `${dirHash}.json`);
}

// ── Input validation ────────────────────────────────────────────────────────

const COMMIT_HASH_RE = /^[0-9a-fA-F]{4,64}$/;

function validateCommitHash(commitHash) {
  if (!commitHash || !commitHash.trim()) return 'Empty commit hash';
  if (commitHash.startsWith('-')) return `Invalid commit hash (must not start with '-'): ${commitHash}`;
  if (!COMMIT_HASH_RE.test(commitHash)) return `Invalid commit hash (expected 4-64 hex characters): ${commitHash}`;
  return null;
}

function validateFilePath(filePath, workingDir) {
  if (!filePath || !filePath.trim()) return 'Empty file path';
  if (path.isAbsolute(filePath)) return `File path must be relative, got absolute path: ${filePath}`;
  const absWorkdir = normalizePath(workingDir);
  try {
    const resolved = path.resolve(absWorkdir, filePath);
    const rel = path.relative(absWorkdir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return `File path escapes the working directory via traversal: ${filePath}`;
  } catch (_) {}
  return null;
}

// ── Git env isolation ───────────────────────────────────────────────────────

function gitEnv(store, workingDir, indexFile) {
  const normalized = normalizePath(workingDir);
  const env = { ...process.env };
  env.GIT_DIR = store;
  env.GIT_WORK_TREE = normalized;
  delete env.GIT_NAMESPACE;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  if (indexFile) {
    env.GIT_INDEX_FILE = indexFile;
  } else {
    delete env.GIT_INDEX_FILE;
  }
  // Isolate from user's global git config — prevents gpgsign, signing hooks,
  // credential helpers from breaking non-interactive snapshots.
  // On Windows, use NUL directly (not os.devnull which expands to \\?\NUL
  // that Git can't open). The \\?\ prefix is for extended-length paths and
  // does not work for device names on Windows.
  const DEVNULL = (process.platform === 'win32') ? 'NUL' : os.devnull;
  env.GIT_CONFIG_GLOBAL = DEVNULL;
  env.GIT_CONFIG_SYSTEM = DEVNULL;
  env.GIT_CONFIG_NOSYSTEM = '1';
  return env;
}

function repairBareRepoDirs(store) {
  for (const subdir of ['refs/heads', 'branches']) {
    const p = path.join(store, subdir);
    if (!fs.existsSync(p)) {
      try {
        fs.mkdirSync(p, { recursive: true });
      } catch (exc) {
        // best-effort
      }
    }
  }
}

// ── Git subprocess runner ───────────────────────────────────────────────────

/**
 * @returns {[boolean, string, string]} [ok, stdout, stderr]
 */
function runGit(args, store, workingDir, opts = {}) {
  const { timeout = GIT_TIMEOUT_MS, allowedReturncodes = new Set(), indexFile = null } = opts;
  const normalized = normalizePath(workingDir);

  if (!fs.existsSync(normalized)) {
    return [false, '', `working directory not found: ${normalized}`];
  }

  const env = gitEnv(store, workingDir, indexFile);
  const cmd = ['git', ...args];

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // On Windows, spawning a GUI-less console subprocess with a visible
    // console window briefly flashes a bare window on screen. Hide it.
    const spawnOpts = {
      env,
      cwd: normalized,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    };

    const child = spawn(cmd[0], cmd.slice(1), spawnOpts);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      const ok = (code === 0) || allowedReturncodes.has(code);
      resolve([ok, stdout.trim(), stderr.trim()]);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve([false, '', err.message]);
    });
  });
}

/** Synchronous wrapper for simple git commands. @returns {[boolean, string, string]} */
function runGitSync(args, store, workingDir, opts = {}) {
  const normalized = normalizePath(workingDir);

  if (!fs.existsSync(normalized)) {
    return [false, '', `working directory not found: ${normalized}`];
  }

  const env = gitEnv(store, workingDir, opts.indexFile || null);
  const cmd = ['git', ...args];

  let stdout = '';
  let stderr = '';
  let code = 0;

  try {
    const result = spawn.sync(cmd[0], cmd.slice(1), {
      env,
      cwd: normalized,
      encoding: 'utf8',
      timeout: opts.timeout || GIT_TIMEOUT_MS,
      windowsHide: true,
    });
    stdout = (result.stdout || '').toString().trim();
    stderr = (result.stderr || '').toString().trim();
    code = result.status;
  } catch (err) {
    return [false, '', err.message];
  }

  const ok = (code === 0) || (opts.allowedReturncodes || new Set()).has(code);
  return [ok, stdout, stderr];
}

// ── Store initialization ────────────────────────────────────────────────────

function atomicWriteFile(filePath, content) {
  const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function initStore(store, workingDir) {
  const base = path.dirname(store);

  // One-time: create base + migrate legacy
  if (!fs.existsSync(base)) {
    try {
      fs.mkdirSync(base, { recursive: true });
    } catch (exc) {
      return `Could not create checkpoint base: ${exc}`;
    }
  }

  // Migrate legacy pre-v2 stores (legacy-<timestamp>/) if needed
  migrateLegacyStore(base);

  if (fs.existsSync(path.join(store, 'HEAD'))) {
    return null; // already initialized
  }

  try {
    fs.mkdirSync(store, { recursive: true });
    fs.mkdirSync(path.join(store, INDEXES_DIRNAME), { recursive: true });
    fs.mkdirSync(path.join(store, PROJECTS_DIRNAME), { recursive: true });
  } catch (exc) {
    return `Could not create store dirs: ${exc}`;
  }

  // git init --bare (needs raw subprocess — can't use runGit which sets GIT_DIR)
  const DEVNULL = (process.platform === 'win32') ? 'NUL' : os.devnull;
  const initEnv = { ...process.env };
  initEnv.GIT_CONFIG_GLOBAL = DEVNULL;
  initEnv.GIT_CONFIG_SYSTEM = DEVNULL;
  initEnv.GIT_CONFIG_NOSYSTEM = '1';
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_NAMESPACE', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
    delete initEnv[k];
  }

  try {
    const result = spawn.sync('git', ['init', '--bare', store], {
      env: initEnv,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
    });
    if (result.status !== 0) {
      return `Shadow store init failed: ${(result.stderr || '').toString().trim()}`;
    }
  } catch (exc) {
    return `Shadow store init failed: ${exc}`;
  }

  // Set per-store git config (user email/name disable gpg signing)
  const cfgWd = base; // always exists since we just created store inside it
  runGitSync(['config', 'user.email', 'hermes@local'], store, cfgWd);
  runGitSync(['config', 'user.name', 'PurpClaw Checkpoint'], store, cfgWd);
  runGitSync(['config', 'commit.gpgsign', 'false'], store, cfgWd);
  runGitSync(['config', 'tag.gpgSign', 'false'], store, cfgWd);
  runGitSync(['config', 'gc.auto', '0'], store, cfgWd);

  // Write info/exclude
  const infoDir = path.join(store, 'info');
  fs.mkdirSync(infoDir, { recursive: true });
  atomicWriteFile(path.join(infoDir, 'exclude'), DEFAULT_EXCLUDES.join('\n') + '\n');

  return null;
}

function migrateLegacyStore(base) {
  // Reserved top-level entries
  const reserved = new Set([STORE_DIRNAME]);
  if (!fs.existsSync(base)) return;

  let legacyRoot = null;
  const entries = fs.readdirSync(base, { withFileTypes: true });
  for (const entry of entries) {
    if (reserved.has(entry.name)) continue;
    if (!entry.isDirectory()) continue;

    // Candidate: old pre-v2 shadow repo (has HEAD)
    if (legacyRoot === null) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      legacyRoot = path.join(base, `legacy-${stamp}`);
      try {
        fs.mkdirSync(legacyRoot, { recursive: true });
      } catch (_) {
        legacyRoot = null;
        continue;
      }
    }
    if (legacyRoot) {
      try {
        fs.renameSync(path.join(base, entry.name), path.join(legacyRoot, entry.name));
      } catch (_) {}
    }
  }
}

// ── Volume evidence ─────────────────────────────────────────────────────────

function volumeEvidence(workdir) {
  try {
    if (!fs.existsSync(workdir)) return {};
    const parentDir = path.dirname(workdir);
    const st = fs.statSync(parentDir);
    if (!st.dev || !st.ino) return {};
    return {
      workdir_parent_dev: st.dev,
      workdir_parent_ino: st.ino,
    };
  } catch (_) {
    return {};
  }
}

// ── Project metadata ───────────────────────────────────────────────────────

function registerProject(store, workingDir) {
  const dirHash = projectHash(workingDir);
  const metaPath = projectMetaPath(store, dirHash);
  const now = Date.now() / 1000;
  const meta = {
    workdir: normalizePath(workingDir),
    created_at: now,
    last_touch: now,
    ...volumeEvidence(workingDir),
  };

  if (fs.existsSync(metaPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (existing && typeof existing === 'object') {
        meta.created_at = existing.created_at || now;
        if (!meta.workdir_parent_dev) {
          if (existing.workdir_parent_dev) meta.workdir_parent_dev = existing.workdir_parent_dev;
          if (existing.workdir_parent_ino) meta.workdir_parent_ino = existing.workdir_parent_ino;
        }
      }
    } catch (_) {}
  }

  try {
    fs.mkdirSync(path.dirname(metaPath), { recursive: true });
    atomicWriteFile(metaPath, JSON.stringify(meta));
  } catch (_) {}
}

function touchProject(store, workingDir) {
  const dirHash = projectHash(workingDir);
  const metaPath = projectMetaPath(store, dirHash);

  if (!fs.existsSync(metaPath)) {
    registerProject(store, workingDir);
    return;
  }

  try {
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
    } catch (_) {
      meta = {};
    }
    meta.workdir = normalizePath(workingDir);
    meta.last_touch = Date.now() / 1000;
    if (!meta.created_at) meta.created_at = meta.last_touch;

    const evidence = volumeEvidence(workingDir);
    if (evidence.workdir_parent_dev) meta.workdir_parent_dev = evidence.workdir_parent_dev;
    if (evidence.workdir_parent_ino) meta.workdir_parent_ino = evidence.workdir_parent_ino;

    atomicWriteFile(metaPath, JSON.stringify(meta));
  } catch (_) {}
}

function listProjects(store) {
  const projectsDir = path.join(store, PROJECTS_DIRNAME);
  if (!fs.existsSync(projectsDir)) return [];

  const results = [];
  for (const file of fs.readdirSync(projectsDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(projectsDir, file), 'utf8'));
      if (meta && typeof meta === 'object') {
        meta._hash = file.replace(/\.json$/, '');
        results.push(meta);
      }
    } catch (_) {}
  }
  return results;
}

// ── File count / size helpers ───────────────────────────────────────────────

function dirFileCount(dir) {
  let count = 0;
  try {
    function walk(d) {
      if (count > MAX_FILES) return;
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        count++;
        if (count > MAX_FILES) return;
        if (entry.isDirectory() && !['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.cache'].includes(entry.name)) {
          try {
            walk(path.join(d, entry.name));
          } catch (_) {}
        }
      }
    }
    walk(dir);
  } catch (_) {}
  return count;
}

function dirSizeBytes(dir) {
  let total = 0;
  try {
    for (const p of walkFiles(dir)) {
      try {
        if (p.isFile()) total += p.stat().size;
      } catch (_) {}
    }
  } catch (_) {}
  return total;
}

function* walkFiles(dir) {
  let stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      yield full;
      if (entry.isDirectory()) stack.push(full);
    }
  }
}

// ── Main CheckpointManager class ────────────────────────────────────────────

class CheckpointManager {
  constructor(opts = {}) {
    this.enabled = Boolean(opts.enabled);
    this.maxSnapshots = Math.max(1, parseInt(opts.maxSnapshots || 20, 10));
    this.maxTotalSizeMb = Math.max(0, parseInt(opts.maxTotalSizeMb || 500, 10));
    this.maxFileSizeMb = Math.max(0, parseInt(opts.maxFileSizeMb || 10, 10));
    /** @type {Set<string>} Per-turn dedup set */
    this._checkpointedDirs = new Set();
    this._gitAvailable = null;
  }

  /** Reset per-turn dedup. Call at the start of each agent iteration. */
  newTurn() {
    this._checkpointedDirs.clear();
  }

  /**
   * Take a checkpoint if enabled and not already done this turn.
   * Returns true if a checkpoint was taken, false otherwise.
   * @returns {Promise<{commitHash: string, checkpointId: string}>|false}
   */
  async createCheckpoint(workingDir, message) {
    if (!this.enabled) return false;

    if (this._gitAvailable === null) {
      try {
        const r = spawn.sync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
        this._gitAvailable = (r.status === 0);
      } catch (_) {
        this._gitAvailable = false;
      }
    }
    if (!this._gitAvailable) return false;

    const absDir = normalizePath(workingDir);

    // Skip root / home
    const homeDir = os.homedir();
    if (absDir === '/' || absDir === homeDir) return false;

    if (this._checkpointedDirs.has(absDir)) return false;

    this._checkpointedDirs.add(absDir);

    try {
      return await this._take(absDir, message || 'auto checkpoint');
    } catch (e) {
      return false;
    }
  }

  /** Synchronous alias for tools that need immediate return */
  createCheckpointSync(workingDir, message) {
    if (!this.enabled) return false;

    if (this._gitAvailable === null) {
      try {
        const r = spawn.sync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
        this._gitAvailable = (r.status === 0);
      } catch (_) {
        this._gitAvailable = false;
      }
    }
    if (!this._gitAvailable) return false;

    const absDir = normalizePath(workingDir);
    if (absDir === '/' || absDir === os.homedir()) return false;
    if (this._checkpointedDirs.has(absDir)) return false;

    this._checkpointedDirs.add(absDir);

    try {
      return this._takeSync(absDir, message || 'auto checkpoint');
    } catch (e) {
      return false;
    }
  }

  /**
   * Get checkpoint system status — git availability, checkpoint count, storage info.
   */
  async status(workingDir) {
    const base = checkpointBase();
    const store = storePath(base);
    const absDir = workingDir ? normalizePath(workingDir) : process.cwd();
    const dirHash = projectHash(absDir);
    const ref = refName(dirHash);

    const [gitOk] = await runGit(['--version'], store, absDir);
    const checkpoints = await this.listCheckpoints(workingDir || absDir);
    let storeSizeMb = 0;
    try {
      if (fs.existsSync(store)) {
        let size = 0;
        for (const entry of fs.readdirSync(store)) {
          const full = path.join(store, entry);
          const stat = fs.statSync(full);
          if (stat.isFile()) size += stat.size;
        }
        storeSizeMb = Math.round(size / 1024 / 1024 * 100) / 100;
      }
    } catch {}

    return {
      gitAvailable: gitOk && this._gitAvailable,
      workingDir: absDir,
      checkpointCount: checkpoints.length,
      storePath: store,
      storeSizeMb,
      hasIndex: fs.existsSync(path.join(store, 'HEAD')),
    };
  }

  /**
   * List checkpoints for a working directory.
   * @returns {Promise<Array<{checkpointId: string, commitHash: string, message: string, createdAt: string}>>}
   */
  async listCheckpoints(workingDir) {
    const absDir = normalizePath(workingDir);
    const base = checkpointBase();
    const store = storePath(base);

    if (!fs.existsSync(path.join(store, 'HEAD'))) return [];

    const dirHash = projectHash(absDir);
    const ref = refName(dirHash);

    const [ok, stdout] = await runGit(
      ['log', ref, '--format=%H|%h|%aI|%s', '-n', String(this.maxSnapshots)],
      store, absDir,
      { allowedReturncodes: new Set([128, 129]) }
    );

    if (!ok || !stdout) return [];

    const results = [];
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      const parts = line.split('|');
      if (parts.length < 4) continue;
      results.push({
        checkpointId: parts[0].slice(0, 16),
        commitHash: parts[0],
        shortHash: parts[1],
        message: parts[3],
        createdAt: parts[2],
      });
    }
    return results;
  }

  /** Synchronous listCheckpoints */
  listCheckpointsSync(workingDir) {
    const absDir = normalizePath(workingDir);
    const base = checkpointBase();
    const store = storePath(base);

    if (!fs.existsSync(path.join(store, 'HEAD'))) return [];

    const dirHash = projectHash(absDir);
    const ref = refName(dirHash);

    const [ok, stdout] = runGitSync(
      ['log', ref, '--format=%H|%h|%aI|%s', '-n', String(this.maxSnapshots)],
      store, absDir,
      { allowedReturncodes: new Set([128, 129]) }
    );

    if (!ok || !stdout) return [];

    return stdout.split('\n').filter(Boolean).map((line) => {
      const parts = line.split('|');
      if (parts.length < 4) return null;
      return {
        checkpointId: parts[0].slice(0, 16),
        commitHash: parts[0],
        shortHash: parts[1],
        message: parts[3],
        createdAt: parts[2],
      };
    }).filter(Boolean);
  }

  /**
   * Roll back working directory to a checkpoint.
   * @param {string} workingDir
   * @param {string} checkpointId — full 40-char commit hash or short hash
   * @returns {Promise<boolean>}
   */
  async rollback(workingDir, checkpointId) {
    const absDir = normalizePath(workingDir);
    const base = checkpointBase();
    const store = storePath(base);

    const hashErr = validateCommitHash(checkpointId);
    if (hashErr) return false;

    if (!fs.existsSync(path.join(store, 'HEAD'))) return false;

    // Verify the commit exists
    const [okVerify] = await runGit(['cat-file', '-t', checkpointId], store, absDir);
    if (!okVerify) return false;

    // Take a pre-rollback snapshot
    await this._take(absDir, `pre-rollback snapshot (restoring to ${checkpointId.slice(0, 8)})`);

    const dirHash = projectHash(absDir);
    const indexFile = indexPath(store, dirHash);

    const [ok, , err] = await runGit(
      ['checkout', checkpointId, '--', '.'],
      store, absDir,
      { timeout: GIT_TIMEOUT_MS * 2, indexFile }
    );

    return ok;
  }

  /** Synchronous rollback */
  rollbackSync(workingDir, checkpointId) {
    const absDir = normalizePath(workingDir);
    const base = checkpointBase();
    const store = storePath(base);

    const hashErr = validateCommitHash(checkpointId);
    if (hashErr) return false;

    if (!fs.existsSync(path.join(store, 'HEAD'))) return false;

    const [okVerify] = runGitSync(['cat-file', '-t', checkpointId], store, absDir);
    if (!okVerify) return false;

    // Pre-rollback snapshot
    this._takeSync(absDir, `pre-rollback snapshot (restoring to ${checkpointId.slice(0, 8)})`);

    const dirHash = projectHash(absDir);
    const indexFile = indexPath(store, dirHash);

    const [ok, , err] = runGitSync(
      ['checkout', checkpointId, '--', '.'],
      store, absDir,
      { timeout: GIT_TIMEOUT_MS * 2, indexFile }
    );

    return ok;
  }

  /**
   * Prune stale checkpoints.
   * @returns {Promise<{deleted: number, freedMb: number}>}
   */
  async pruneCheckpoints(workingDir, retentionDays = 7, maxTotalSizeMb = 0) {
    const absDir = normalizePath(workingDir);
    const base = checkpointBase();
    const store = storePath(base);

    if (!fs.existsSync(path.join(store, 'HEAD'))) return { deleted: 0, freedMb: 0 };

    const dirHash = projectHash(absDir);
    const ref = refName(dirHash);

    // Get all commits on this project's ref
    const [okLog, logOut] = await runGit(
      ['log', '--format=%H|%aI|%s', ref],
      store, absDir,
      { allowedReturncodes: new Set([128, 129]) }
    );

    if (!okLog || !logOut) return { deleted: 0, freedMb: 0 };

    const now = Date.now() / 1000;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const cutoff = now - retentionMs / 1000;

    let deleted = 0;
    const commits = logOut.split('\n').filter(Boolean);

    for (const line of commits) {
      const parts = line.split('|');
      if (parts.length < 2) continue;
      const commitHash = parts[0];
      const timestamp = parts[1];

      // Parse ISO timestamp
      const commitTime = new Date(timestamp).getTime() / 1000;
      if (isNaN(commitTime)) continue;

      if (commitTime < cutoff) {
        // Delete this ref pointing to this old commit (prune old chain)
        // We delete by rewriting the ref to exclude this commit
        const [okDel] = await runGit(
          ['update-ref', '-d', ref, commitHash],
          store, absDir,
          { allowedReturncodes: new Set([128]) }
        );
        if (okDel) deleted++;
      }
    }

    // Expire reflog and gc
    await runGit(['reflog', 'expire', '--expire=now', '--all'], store, absDir);
    await runGit(['gc', '--prune=now', '--quiet'], store, absDir, { timeout: GIT_TIMEOUT_MS * 3 });
    repairBareRepoDirs(store);

    // Calculate freed space (rough estimate)
    const sizeBefore = dirSizeBytes(store);
    await new Promise((r) => setTimeout(r, 500));
    const sizeAfter = dirSizeBytes(store);
    const freedMb = Math.max(0, (sizeBefore - sizeAfter) / (1024 * 1024));

    return { deleted, freedMb: Math.round(freedMb * 100) / 100 };
  }

  /** Synchronous pruneCheckpoints */
  pruneCheckpointsSync(workingDir, retentionDays = 7, maxTotalSizeMb = 0) {
    const absDir = normalizePath(workingDir);
    const base = checkpointBase();
    const store = storePath(base);

    if (!fs.existsSync(path.join(store, 'HEAD'))) return { deleted: 0, freedMb: 0 };

    const dirHash = projectHash(absDir);
    const ref = refName(dirHash);

    const [okLog, logOut] = runGitSync(
      ['log', '--format=%H|%aI|%s', ref],
      store, absDir,
      { allowedReturncodes: new Set([128, 129]) }
    );

    if (!okLog || !logOut) return { deleted: 0, freedMb: 0 };

    const now = Date.now() / 1000;
    const cutoff = now - (retentionDays * 24 * 60 * 60);

    let deleted = 0;
    const commits = logOut.split('\n').filter(Boolean);

    for (const line of commits) {
      const parts = line.split('|');
      if (parts.length < 2) continue;
      const commitHash = parts[0];
      const timestamp = parts[1];
      const commitTime = new Date(timestamp).getTime() / 1000;
      if (isNaN(commitTime)) continue;
      if (commitTime < cutoff) {
        const [okDel] = runGitSync(
          ['update-ref', '-d', ref, commitHash],
          store, absDir,
          { allowedReturncodes: new Set([128]) }
        );
        if (okDel) deleted++;
      }
    }

    runGitSync(['reflog', 'expire', '--expire=now', '--all'], store, absDir);
    runGitSync(['gc', '--prune=now', '--quiet'], store, absDir, { timeout: GIT_TIMEOUT_MS * 3 });
    repairBareRepoDirs(store);

    return { deleted, freedMb: 0 };
  }

  // ── Internal: _take ──────────────────────────────────────────────────────

  async _take(workingDir, reason) {
    const base = checkpointBase();
    const store = storePath(base);

    const err = initStore(store, workingDir);
    if (err) return false;

    touchProject(store, workingDir);

    // Quick file count guard
    if (dirFileCount(workingDir) > MAX_FILES) return false;

    const dirHash = projectHash(workingDir);
    const indexFile = indexPath(store, dirHash);
    const ref = refName(dirHash);

    // Ensure index parent dir
    fs.mkdirSync(path.dirname(indexFile), { recursive: true });

    // Seed the per-project index from the last checkpoint
    const [okRef, refCommit] = await runGit(
      ['rev-parse', '--verify', `${ref}^{commit}`],
      store, workingDir,
      { allowedReturncodes: new Set([128]) }
    );
    const hasRef = okRef && refCommit;

    if (hasRef) {
      await runGit(
        ['read-tree', refCommit],
        store, workingDir,
        { indexFile, allowedReturncodes: new Set([128]) }
      );
    } else if (fs.existsSync(indexFile)) {
      try { fs.unlinkSync(indexFile); } catch (_) {}
    }

    // Stage all changes
    const [okAdd] = await runGit(
      ['add', '-A'],
      store, workingDir,
      { timeout: GIT_TIMEOUT_MS * 2, indexFile }
    );
    if (!okAdd) return false;

    // Drop oversize files
    if (this.maxFileSizeMb > 0) {
      await this._dropOversizeFromIndex(store, workingDir, indexFile);
    }

    // Check if anything actually changed
    const [okDiff] = await runGit(
      ['diff-index', '--cached', '--quiet', refCommit || 'HEAD'],
      store, workingDir,
      { indexFile, allowedReturncodes: new Set([1]) }
    );
    if (okDiff) return false; // no changes

    // Write tree
    const [okTree, treeSha] = await runGit(
      ['write-tree'],
      store, workingDir,
      { indexFile }
    );
    if (!okTree || !treeSha) return false;

    // Commit
    const commitArgs = hasRef
      ? ['commit-tree', treeSha, '-p', refCommit, '-m', reason, '--no-gpg-sign']
      : ['commit-tree', treeSha, '-m', reason, '--no-gpg-sign'];

    const [okCommit, newSha] = await runGit(commitArgs, store, workingDir, { indexFile });
    if (!okCommit || !newSha) return false;

    // Update ref
    const updateArgs = hasRef
      ? ['update-ref', ref, newSha, refCommit]
      : ['update-ref', ref, newSha];

    const [okUpdate] = await runGit(updateArgs, store, workingDir);
    if (!okUpdate) return false;

    // Prune old commits beyond maxSnapshots
    await this._prune(store, workingDir, ref);

    // Enforce global size cap
    this._enforceSizeCap(store);

    return { commitHash: newSha, checkpointId: newSha.slice(0, 16) };
  }

  /** Synchronous _take */
  _takeSync(workingDir, reason) {
    const base = checkpointBase();
    const store = storePath(base);

    const err = initStore(store, workingDir);
    if (err) return false;

    touchProject(store, workingDir);

    if (dirFileCount(workingDir) > MAX_FILES) return false;

    const dirHash = projectHash(workingDir);
    const indexFile = indexPath(store, dirHash);
    const ref = refName(dirHash);

    fs.mkdirSync(path.dirname(indexFile), { recursive: true });

    const [okRef, refCommit] = runGitSync(
      ['rev-parse', '--verify', `${ref}^{commit}`],
      store, workingDir,
      { allowedReturncodes: new Set([128]) }
    );
    const hasRef = okRef && refCommit;

    if (hasRef) {
      runGitSync(['read-tree', refCommit], store, workingDir, { indexFile, allowedReturncodes: new Set([128]) });
    } else if (fs.existsSync(indexFile)) {
      try { fs.unlinkSync(indexFile); } catch (_) {}
    }

    const [okAdd] = runGitSync(['add', '-A'], store, workingDir, { timeout: GIT_TIMEOUT_MS * 2, indexFile });
    if (!okAdd) return false;

    if (this.maxFileSizeMb > 0) {
      this._dropOversizeFromIndexSync(store, workingDir, indexFile);
    }

    const [okDiff] = runGitSync(
      ['diff-index', '--cached', '--quiet', refCommit || 'HEAD'],
      store, workingDir,
      { indexFile, allowedReturncodes: new Set([1]) }
    );
    if (okDiff) return false;

    const [okTree, treeSha] = runGitSync(['write-tree'], store, workingDir, { indexFile });
    if (!okTree || !treeSha) return false;

    const commitArgs = hasRef
      ? ['commit-tree', treeSha, '-p', refCommit, '-m', reason, '--no-gpg-sign']
      : ['commit-tree', treeSha, '-m', reason, '--no-gpg-sign'];

    const [okCommit, newSha] = runGitSync(commitArgs, store, workingDir, { indexFile });
    if (!okCommit || !newSha) return false;

    const updateArgs = hasRef
      ? ['update-ref', ref, newSha, refCommit]
      : ['update-ref', ref, newSha];

    runGitSync(updateArgs, store, workingDir);

    this._pruneSync(store, workingDir, ref);
    this._enforceSizeCapSync(store);

    return { commitHash: newSha, checkpointId: newSha.slice(0, 16) };
  }

  async _dropOversizeFromIndex(store, workingDir, indexFile) {
    const cap = this.maxFileSizeMb * 1024 * 1024;
    if (cap <= 0) return;

    const [ok, stdout] = await runGit(
      ['ls-files', '--cached', '-z'],
      store, workingDir, { indexFile }
    );
    if (!ok || !stdout) return;

    // NUL-separated
    const paths = stdout.split('\x00').filter(Boolean);
    const absWorkdir = normalizePath(workingDir);
    const oversize = [];

    for (const rel of paths) {
      try {
        const size = fs.statSync(path.join(absWorkdir, rel)).size;
        if (size > cap) oversize.push(rel);
      } catch (_) {}
    }

    if (!oversize.length) return;

    // Batch remove
    const BATCH = 200;
    for (let i = 0; i < oversize.length; i += BATCH) {
      const chunk = oversize.slice(i, i + BATCH);
      await runGit(
        ['rm', '--cached', '--quiet', '--'].concat(chunk),
        store, workingDir,
        { indexFile, allowedReturncodes: new Set([128]) }
      );
    }
  }

  _dropOversizeFromIndexSync(store, workingDir, indexFile) {
    const cap = this.maxFileSizeMb * 1024 * 1024;
    if (cap <= 0) return;

    const [ok, stdout] = runGitSync(
      ['ls-files', '--cached', '-z'],
      store, workingDir, { indexFile }
    );
    if (!ok || !stdout) return;

    const paths = stdout.split('\x00').filter(Boolean);
    const absWorkdir = normalizePath(workingDir);
    const oversize = [];

    for (const rel of paths) {
      try {
        const size = fs.statSync(path.join(absWorkdir, rel)).size;
        if (size > cap) oversize.push(rel);
      } catch (_) {}
    }

    if (!oversize.length) return;

    const BATCH = 200;
    for (let i = 0; i < oversize.length; i += BATCH) {
      const chunk = oversize.slice(i, i + BATCH);
      runGitSync(
        ['rm', '--cached', '--quiet', '--'].concat(chunk),
        store, workingDir,
        { indexFile, allowedReturncodes: new Set([128]) }
      );
    }
  }

  async _prune(store, workingDir, ref) {
    const [ok, stdout] = await runGit(
      ['rev-list', '--count', ref],
      store, workingDir,
      { allowedReturncodes: new Set([128]) }
    );
    if (!ok) return;
    const count = parseInt(stdout, 10);
    if (isNaN(count) || count <= this.maxSnapshots) return;

    // Get oldest commits
    const [okList, listOut] = await runGit(
      ['rev-list', '--reverse', ref],
      store, workingDir
    );
    if (!okList || !listOut) return;
    const commits = listOut.split('\n').filter(Boolean);
    const keep = commits.slice(-this.maxSnapshots);
    if (keep.length === 0) return;

    // Rebuild linear chain
    let newParent = null;
    for (const sha of keep) {
      const [okTree, treeSha] = await runGit(
        ['rev-parse', `${sha}^{tree}`],
        store, workingDir
      );
      if (!okTree || !treeSha) return;

      const [okMsg, msg] = await runGit(
        ['log', '--format=%s', '-1', sha],
        store, workingDir
      );
      const commitMsg = (okMsg && msg) ? msg : 'checkpoint';

      const args = newParent
        ? ['commit-tree', treeSha, '-p', newParent, '-m', commitMsg, '--no-gpg-sign']
        : ['commit-tree', treeSha, '-m', commitMsg, '--no-gpg-sign'];

      const [okCommit, newSha] = await runGit(args, store, workingDir);
      if (!okCommit || !newSha) return;
      newParent = newSha;
    }

    if (newParent) {
      await runGit(['update-ref', ref, newParent], store, workingDir);
    }

    await runGit(['reflog', 'expire', '--expire=now', '--all'], store, workingDir);
    await runGit(['gc', '--prune=now', '--quiet'], store, workingDir, { timeout: GIT_TIMEOUT_MS * 3 });
    repairBareRepoDirs(store);
  }

  _pruneSync(store, workingDir, ref) {
    const [ok, stdout] = runGitSync(
      ['rev-list', '--count', ref],
      store, workingDir,
      { allowedReturncodes: new Set([128]) }
    );
    if (!ok) return;
    const count = parseInt(stdout, 10);
    if (isNaN(count) || count <= this.maxSnapshots) return;

    const [okList, listOut] = runGitSync(
      ['rev-list', '--reverse', ref],
      store, workingDir
    );
    if (!okList || !listOut) return;
    const commits = listOut.split('\n').filter(Boolean);
    const keep = commits.slice(-this.maxSnapshots);
    if (keep.length === 0) return;

    let newParent = null;
    for (const sha of keep) {
      const [okTree, treeSha] = runGitSync(
        ['rev-parse', `${sha}^{tree}`],
        store, workingDir
      );
      if (!okTree || !treeSha) return;

      const [okMsg, msg] = runGitSync(
        ['log', '--format=%s', '-1', sha],
        store, workingDir
      );
      const commitMsg = (okMsg && msg) ? msg : 'checkpoint';

      const args = newParent
        ? ['commit-tree', treeSha, '-p', newParent, '-m', commitMsg, '--no-gpg-sign']
        : ['commit-tree', treeSha, '-m', commitMsg, '--no-gpg-sign'];

      const [okCommit, newSha] = runGitSync(args, store, workingDir);
      if (!okCommit || !newSha) return;
      newParent = newSha;
    }

    if (newParent) {
      runGitSync(['update-ref', ref, newParent], store, workingDir);
    }

    runGitSync(['reflog', 'expire', '--expire=now', '--all'], store, workingDir);
    runGitSync(['gc', '--prune=now', '--quiet'], store, workingDir, { timeout: GIT_TIMEOUT_MS * 3 });
    repairBareRepoDirs(store);
  }

  _enforceSizeCap(store) {
    if (this.maxTotalSizeMb <= 0) return;
    const capBytes = this.maxTotalSizeMb * 1024 * 1024;
    const size = dirSizeBytes(store);
    if (size <= capBytes) return;

    // Collect all refs
    const [ok, stdout] = runGitSync(
      ['for-each-ref', '--format=%(refname)', REFS_PREFIX],
      store, store,
      { allowedReturncodes: new Set([128]) }
    );
    if (!ok || !stdout) return;
    const refs = stdout.split('\n').filter(Boolean);

    for (let round = 0; round < 20; round++) {
      const curSize = dirSizeBytes(store);
      if (curSize <= capBytes) break;

      let anyDropped = false;
      for (const ref of refs) {
        const [okCount, countOut] = runGitSync(
          ['rev-list', '--count', ref],
          store, store,
          { allowedReturncodes: new Set([128]) }
        );
        const count = okCount ? parseInt(countOut, 10) : 0;
        if (isNaN(count) || count <= 1) continue;

        const [okList, listOut] = runGitSync(
          ['rev-list', '--reverse', ref],
          store, store
        );
        if (!okList || !listOut) continue;
        const commits = listOut.split('\n').filter(Boolean);
        const keep = commits.slice(1); // drop oldest
        if (keep.length === 0) continue;

        let newParent = null;
        let fail = false;
        for (const sha of keep) {
          const [okTree, treeSha] = runGitSync(
            ['rev-parse', `${sha}^{tree}`],
            store, store
          );
          if (!okTree || !treeSha) { fail = true; break; }

          const [okMsg, msg] = runGitSync(
            ['log', '--format=%s', '-1', sha],
            store, store
          );
          const commitMsg = (okMsg && msg) ? msg : 'checkpoint';

          const args = newParent
            ? ['commit-tree', treeSha, '-p', newParent, '-m', commitMsg, '--no-gpg-sign']
            : ['commit-tree', treeSha, '-m', commitMsg, '--no-gpg-sign'];

          const [okCommit, newSha] = runGitSync(args, store, store);
          if (!okCommit || !newSha) { fail = true; break; }
          newParent = newSha;
        }
        if (fail || !newParent) continue;

        runGitSync(['update-ref', ref, newParent], store, store);
        anyDropped = true;
      }
      if (!anyDropped) break;
    }

    runGitSync(['reflog', 'expire', '--expire=now', '--all'], store, store);
    runGitSync(['gc', '--prune=now', '--quiet'], store, store, { timeout: GIT_TIMEOUT_MS * 3 });
    repairBareRepoDirs(store);
  }

  _enforceSizeCapSync(store) {
    this._enforceSizeCap(store);
  }

  /**
   * Get the working directory for a given file path.
   * Walks up looking for project markers.
   */
  getWorkingDirForPath(filePath) {
    const p = normalizePath(filePath);
    const candidates = [p];
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
      candidates.push(path.dirname(p));
    }

    const markers = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'Makefile', 'pom.xml', '.hg', 'Gemfile', 'pyproject.toml'];

    for (const candidate of candidates) {
      let check = candidate;
      let prev = '';
      while (check !== prev) {
        for (const m of markers) {
          if (fs.existsSync(path.join(check, m))) return check;
        }
        prev = check;
        check = path.dirname(check);
      }
    }

    return candidates[candidates.length - 1];
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

const checkpointManager = new CheckpointManager({ enabled: true });

export { CheckpointManager, checkpointManager };
export default checkpointManager;
