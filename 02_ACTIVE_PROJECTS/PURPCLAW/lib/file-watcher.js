'use strict';
/**
 * lib/file-watcher.js — Recursive file system watcher for PURPCLAW hot-reload.
 *
 * Features:
 * - Node.js built-in fs.watch with recursive:true (Node 18+) — native, no native deps
 * - Fallback to chokidar if installed (more reliable cross-platform, supports .ignore())
 * - Debounce: 100ms coalescing per file path
 * - Events: add, change, unlink
 * - Ignores: node_modules, .git, .next, dist, coverage, .cache, __pycache__, .parcel-cache
 * - Recursive directory watching with efficient glob ignores
 * - close() to stop the watcher
 *
 * Wire into agent-loop.js:
 *   on skill file change  → reload skill registry via SESSION_STORE or direct require
 *   on config change      → reload config via lib/config.js reloadConfig()
 *
 * CLI: purpclaw watch <dir>  — manual directory watching
 */

const fs   = require('fs');
const path = require('path');

// ── Ignore list (applied to relative paths) ──────────────────────────────────
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'coverage',
  '.cache',
  '__pycache__',
  '.parcel-cache',
  '.pytest_cache',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);

function shouldIgnore(relPath) {
  const parts = relPath.split(path.sep);
  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) return true;
  }
  return false;
}

// ── Debounce ────────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  const pending = new Map();
  return function (...args) {
    const key = JSON.stringify(args);
    clearTimeout(pending.get(key));
    pending.set(key, setTimeout(() => {
      pending.delete(key);
      fn.apply(this, args);
    }, ms));
  };
}

// ── Event normalizer ────────────────────────────────────────────────────────
// fs.watch on Linux/macOS emits 'rename'/'change'; on Windows it emits 'rename'/'change' too.
// chokidar emits 'add'/'change'/'unlink'/'addDir'/'unlinkDir'.
// Normalize everything to: { type: 'add'|'change'|'unlink', filepath: string }
function normalizeEvent(type, filepath) {
  const rel = filepath;
  if (shouldIgnore(rel)) return null;
  // fs.watch legacy rename detection — a rename with no matching unlink is 'add'
  // chokidar already gives clean types
  return { type, filepath: rel };
}

// ── Try chokidar (better cross-platform), fall back to native ──────────────
let _chokidar = null;
try { _chokidar = require('chokidar'); } catch {}

function makeChokidarWatcher(dir, callbacks) {
  const { onAdd, onChange, onUnlink } = callbacks;
  const watcher = _chokidar.watch(dir, {
    persistent      : true,
    ignoreInitial   : true,
    followSymlinks  : false,
    depth           : 99,
    ignored         : (filepath) => {
      const rel = path.relative(dir, filepath);
      return shouldIgnore(rel);
    },
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
  });

  watcher.on('add',    (fp) => { const e = normalizeEvent('add',    fp); if (e) onAdd(e); });
  watcher.on('change', (fp) => { const e = normalizeEvent('change', fp); if (e) onChange(e); });
  watcher.on('unlink', (fp) => { const e = normalizeEvent('unlink', fp); if (e) onUnlink(e); });

  return {
    close() { return watcher.close(); },
  };
}

function makeNativeWatcher(dir, callbacks) {
  const { onAdd, onChange, onUnlink } = callbacks;
  // Track seen files to distinguish rename→add vs rename→unlink
  const knownFiles = new Map(); // filepath → true

  // debounced callbacks
  const dAdd    = debounce(onAdd,    100);
  const dChange = debounce(onChange, 100);
  const dUnlink = debounce(onUnlink, 100);

  // Recursive watch using fs.watch recursively on subdirs
  const watchers = []; // { close() }

  function watchDir(dirPath) {
    let watcher;
    try {
      watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // On some platforms, eventType is 'rename' or 'change' and filename is the name
        const filepath = path.resolve(dirPath, filename);
        const rel = path.relative(dir, filepath);

        if (shouldIgnore(rel)) return;

        // Detect: is the file present on disk?
        let exists;
        try { fs.accessSync(filepath, fs.constants.R_OK); exists = true; } catch { exists = false; }

        if (exists) {
          if (!knownFiles.has(filepath)) {
            knownFiles.set(filepath, true);
            const e = normalizeEvent('add', filepath);
            if (e) dAdd(e);
          } else {
            const e = normalizeEvent('change', filepath);
            if (e) dChange(e);
          }
        } else {
          if (knownFiles.has(filepath)) {
            knownFiles.delete(filepath);
            const e = normalizeEvent('unlink', filepath);
            if (e) dUnlink(e);
          }
        }
      });
    } catch (err) {
      // e.g. permission denied on a subdir — skip it
      return { close: () => {} };
    }

    watchers.push(watcher);

    // Watch existing subdirectories recursively
    let subdirs = [];
    try { subdirs = fs.readdirSync(dirPath).filter(n => {
      const p = path.join(dirPath, n);
      let s;
      try { s = fs.statSync(p); } catch { return false; }
      return s.isDirectory() && !shouldIgnore(path.relative(dir, p));
    }); } catch {}

    for (const sub of subdirs) {
      watchDir(path.join(dirPath, sub));
    }
  }

  watchDir(dir);

  return {
    close() {
      for (const w of watchers) {
        try { w.close(); } catch {}
      }
      watchers.length = 0;
      knownFiles.clear();
    },
  };
}

// ── Public FileWatcher class ────────────────────────────────────────────────
/**
 * @param {string} dir  — root directory to watch
 * @param {{ onAdd?: function, onChange?: function, onUnlink?: function }} callbacks
 */
function createFileWatcher(dir, callbacks = {}) {
  const resolvedDir = path.resolve(dir);

  const wrapped = {
    onAdd    : callbacks.onAdd    || (() => {}),
    onChange : callbacks.onChange || (() => {}),
    onUnlink : callbacks.onUnlink || (() => {}),
  };

  // Initialise known files so the first real edit fires as 'change', not 'add'
  const knownFiles = new Map();
  function seedKnown() {
    try {
      const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir); } catch { return; }
        for (const entry of entries) {
          const fp = path.join(dir, entry);
          let stat;
          try { stat = fs.statSync(fp); } catch { continue; }
          const rel = path.relative(resolvedDir, fp);
          if (shouldIgnore(rel)) continue;
          if (stat.isDirectory()) {
            walk(fp);
          } else {
            knownFiles.set(fp, true);
          }
        }
      };
      walk(resolvedDir);
    } catch {}
  }
  seedKnown();

  // debounced callbacks keyed by filepath
  const debounced = {
    onAdd    : debounce(wrapped.onAdd,    100),
    onChange : debounce(wrapped.onChange, 100),
    onUnlink : debounce(wrapped.onUnlink, 100),
  };

  // Chokidar path — more reliable recursive watching
  if (_chokidar) {
    const watcher = _chokidar.watch(resolvedDir, {
      persistent     : true,
      ignoreInitial  : true,
      followSymlinks : false,
      depth          : 99,
      ignored        : (fp) => {
        const rel = path.relative(resolvedDir, fp);
        return shouldIgnore(rel);
      },
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    });

    watcher.on('add',    (fp) => { const e = normalizeEvent('add', fp);     if (e) debounced.onAdd(e); });
    watcher.on('change', (fp) => { const e = normalizeEvent('change', fp);  if (e) debounced.onChange(e); });
    watcher.on('unlink', (fp) => { const e = normalizeEvent('unlink', fp);  if (e) debounced.onUnlink(e); });

    return {
      close() { return watcher.close(); },
    };
  }

  // ── Native fs.watch fallback ──────────────────────────────────────────────
  const nativeWatchers = [];
  const subdirs = [];

  function watchRecursive(dirPath) {
    let w;
    try {
      w = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fp = path.resolve(dirPath, filename);
        const rel = path.relative(resolvedDir, fp);
        if (shouldIgnore(rel)) return;

        let exists;
        try { fs.accessSync(fp, fs.constants.R_OK); exists = true; } catch { exists = false; }

        if (exists) {
          if (!knownFiles.has(fp)) {
            knownFiles.set(fp, true);
            const e = normalizeEvent('add', fp);
            if (e) debounced.onAdd(e);
          } else {
            const e = normalizeEvent('change', fp);
            if (e) debounced.onChange(e);
          }
        } else {
          if (knownFiles.has(fp)) {
            knownFiles.delete(fp);
            const e = normalizeEvent('unlink', fp);
            if (e) debounced.onUnlink(e);
          }
        }
      });
    } catch { return { close: () => {} }; }

    nativeWatchers.push(w);

    // Recurse into subdirectories
    let entries;
    try { entries = fs.readdirSync(dirPath); } catch { return; }
    for (const entry of entries) {
      const fp = path.join(dirPath, entry);
      let stat;
      try { stat = fs.statSync(fp); } catch { continue; }
      if (!stat.isDirectory()) continue;
      const rel = path.relative(resolvedDir, fp);
      if (shouldIgnore(rel)) continue;
      watchRecursive(fp);
    }
  }

  watchRecursive(resolvedDir);

  return {
    close() {
      for (const w of nativeWatchers) {
        try { w.close(); } catch {}
      }
      nativeWatchers.length = 0;
      knownFiles.clear();
    },
  };
}

// ── Skill reload helper ─────────────────────────────────────────────────────
/**
 * Attempt to reload the skill registry.
 * Uses SESSION_STORE if available (for cross-session persistence), otherwise
 * clears the require cache for skill-registry so the next require gets a fresh load.
 */
function reloadSkillRegistry() {
  let SESSION_STORE;
  try { SESSION_STORE = require('./session-store'); } catch {}
  try {
    // 1. Try to use SESSION_STORE if it exposes a skill-reload mechanism
    if (SESSION_STORE && typeof SESSION_STORE.reloadSkills === 'function') {
      SESSION_STORE.reloadSkills();
      return 'SESSION_STORE.reloadSkills()';
    }
  } catch {}

  // 2. Fallback: clear require cache for skill-registry and its bundle modules
  const targets = [
    'skill-registry',
    'skill-bundles',
    'skill-bridge',
    'skills-deps',
    'skills-guard',
    'skill-usage',
  ];
  for (const t of targets) {
    try {
      const full = require.resolve('./' + t);
      if (full) delete require.cache[full];
    } catch {}
  }
  return `require.cache cleared for: ${targets.join(', ')}`;
}

/**
 * Attempt to reload the config (lib/config.js).
 */
function reloadConfigModule() {
  try {
    const cfg = require('./config');
    if (typeof cfg.reloadConfig === 'function') {
      cfg.reloadConfig();
      return 'config.reloadConfig()';
    }
  } catch (e) {
    return `config.reloadConfig() failed: ${e.message}`;
  }
}

/**
 * Build a callback set that wires skill + config reload into the watcher.
 * @param {object} opts
 * @param {boolean} [opts.skills=true]    — watch skills/ directory
 * @param {boolean} [opts.config=true]    — watch config.json
 * @param {string}  [opts.skillsDir]      — skills root (default: skills/ in PURP_DIR or project root)
 * @param {string}  [opts.configPath]     — config file path
 */
function makeReloadCallbacks(opts = {}) {
  const skillsDir   = opts.skillsDir   || path.join(process.cwd(), 'skills');
  const configPath  = opts.configPath  || null;

  return {
    onAdd(fp) {
      const rel = path.relative(process.cwd(), fp);
      _log('[file-watcher] add    ', rel);
      if (opts.skills !== false && !fp.includes('node_modules')) {
        _maybeReloadSkill(fp, skillsDir);
      }
      if (opts.config !== false && configPath && fp === configPath) {
        const r = reloadConfigModule();
        _log('[file-watcher] config changed, reload result:', r);
      }
    },
    onChange(fp) {
      const rel = path.relative(process.cwd(), fp);
      _log('[file-watcher] change ', rel);
      if (opts.skills !== false) {
        _maybeReloadSkill(fp, skillsDir);
      }
      if (opts.config !== false && configPath && fp === configPath) {
        const r = reloadConfigModule();
        _log('[file-watcher] config changed, reload result:', r);
      }
    },
    onUnlink(fp) {
      const rel = path.relative(process.cwd(), fp);
      _log('[file-watcher] unlink ', rel);
    },
  };
}

function _maybeReloadSkill(fp, skillsDir) {
  const rel = path.relative(skillsDir, fp);
  // Only reload on skill file changes (SKILL.md, .js files in skills dirs)
  if (rel.startsWith('..')) return; // not under skills dir
  const ext = path.extname(fp);
  if (ext === '.md' || ext === '.js' || ext === '.json') {
    const r = reloadSkillRegistry();
    _log('[file-watcher] skill reload:', r);
  }
}

function _log(...args) {
  console.log('[file-watcher]', ...args);
}

module.exports = {
  createFileWatcher,
  makeReloadCallbacks,
  reloadSkillRegistry,
  reloadConfigModule,
  IGNORE_DIRS,
  shouldIgnore,
};
