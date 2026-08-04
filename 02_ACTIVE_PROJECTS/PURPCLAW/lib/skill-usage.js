'use strict';
/**
 * lib/skill-usage.js — PURPCLAW Skill Telemetry System
 *
 * Tracks per-skill usage metadata in a sidecar JSON file
 * (~/.purpclaw/skills/.usage.json) keyed by skill name.
 *
 * Design:
 *   - Sidecar keeps operational telemetry out of SKILL.md content.
 *   - Atomic writes via tempfile + fs.renameSync.
 *   - Windows file locking via fs.open with 'r+' and retry loop.
 *   - All counter bumps are best-effort: failures are silent.
 *   - Protected built-ins ('plan', 'coding', 'research') never auto-archived.
 *
 * Lifecycle states:
 *   active    — default
 *   stale     — unused > staleAfterDays (default 30)
 *   archived  — unused > archiveAfterDays (default 90); moved to .archive/
 *   pinned    — opt-out from auto transitions (boolean, orthogonal to state)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_ACTIVE   = 'active';
const STATE_STALE    = 'stale';
const STATE_ARCHIVED = 'archived';
const VALID_STATES   = new Set([STATE_ACTIVE, STATE_STALE, STATE_ARCHIVED]);

/** Protected built-ins — never archived or auto-transitioned. */
const PROTECTED_BUILTINS = new Set(['plan', 'coding', 'research']);

// ── Paths ─────────────────────────────────────────────────────────────────────

function _purpclawDir() {
  return path.join(os.homedir(), '.purpclaw');
}

function _skillsBaseDir() {
  return path.join(_purpclawDir(), 'skills');
}

function _usageFile() {
  return path.join(_skillsBaseDir(), '.usage.json');
}

function _archiveDir() {
  return path.join(_skillsBaseDir(), '.archive');
}

function _lockFile() {
  return path.join(_skillsBaseDir(), '.usage.json.lock');
}

// ── Timestamp helpers ───────────────────────────────────────────────────────────

function _nowIso() {
  return new Date().toISOString();
}

function _parseIsoTimestamp(value) {
  if (!value) return null;
  try {
    let parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Protected skill check ─────────────────────────────────────────────────────

function isProtectedBuiltin(skillName) {
  return PROTECTED_BUILTINS.has(skillName);
}

// ── Empty record factory ───────────────────────────────────────────────────────

function _emptyRecord() {
  return {
    useCount:     0,
    viewCount:    0,
    patchCount:   0,
    lastUsedAt:   null,
    lastViewedAt: null,
    lastPatchedAt:null,
    createdAt:    _nowIso(),
    state:        STATE_ACTIVE,
    pinned:       false,
    pinnedAt:     null,
    archivedAt:   null,
    source:       null,   // 'agent' | 'hub' | 'builtin' — set at creation time
  };
}

// ── Low-level I/O with Windows locking ─────────────────────────────────────────

/**
 * Acquire an exclusive lock on the usage file using a retry loop.
 * On Windows we open the lock file with 'r+' (must exist) and use
 * FileSystemFlags.FILE_FLAG_NO_BUFFERING isn't available in Node.js,
 * so we use a simple fs.open retry loop as the locking mechanism.
 * Returns a {fd, release} object; release() closes the fd.
 */
function _acquireLock(maxRetries = 50, retryDelayMs = 100) {
  const lockPath = _lockFile();
  const dir = path.dirname(lockPath);

  // Ensure directory exists
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}

  // Ensure lock file exists (Windows requires the file to exist for r+ open)
  if (!fs.existsSync(lockPath)) {
    fs.writeFileSync(lockPath, '', 'utf8');
  }

  let fd = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fd = fs.openSync(lockPath, 'r+');
      return {
        fd,
        release() {
          if (fd === null) return;
          try { fs.closeSync(fd); } catch {}
          fd = null;
        }
      };
    } catch (err) {
      // Lock is held — retry after a short delay
      if (fd !== null) { try { fs.closeSync(fd); } catch {} fd = null; }
      const pause = retryDelayMs + Math.floor(Math.random() * 50);
      _sleep(pause);
    }
  }
  throw new Error(`Could not acquire lock on ${lockPath} after ${maxRetries} attempts`);
}

function _sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

// ── Usage file read/write ──────────────────────────────────────────────────────

function loadUsage() {
  const filePath = _usageFile();
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return {};
    // Defensive: coerce non-object values to empty
    const clean = {};
    for (const [k, v] of Object.entries(data)) {
      clean[String(k)] = typeof v === 'object' && v !== null ? v : {};
    }
    return clean;
  } catch {
    return {};
  }
}

/**
 * Atomically write the usage map: write to .tmp then rename.
 * Errors are logged silently (best-effort).
 */
function saveUsage(data) {
  const filePath = _usageFile();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tmpPath = filePath + '.tmp';
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, content, 'utf8');
    // Atomic rename on Windows (same drive)
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort — swallow
  }
}

// ── Record helpers ─────────────────────────────────────────────────────────────

function getRecord(skillName) {
  const data = loadUsage();
  const rec  = data[skillName];
  if (typeof rec !== 'object' || rec === null) return _emptyRecord();
  // Backfill missing keys
  const base = _emptyRecord();
  for (const [k, v] of Object.entries(base)) {
    if (!(k in rec)) rec[k] = v;
  }
  return rec;
}

/**
 * Mutate a skill's record under an exclusive lock.
 * @param {string}   skillName
 * @param {Function} mutator  (record) => void
 * @param {boolean}  requireCuratorEligible — only act on curator-eligible skills
 */
function _mutate(skillName, mutator, { requireCuratorEligible = false } = {}) {
  if (!skillName) return;
  try {
    if (requireCuratorEligible && !isCuratorEligible(skillName)) return;

    let lock;
    try {
      lock = _acquireLock();
    } catch {
      return; // Could not acquire lock — give up silently
    }

    try {
      const data = loadUsage();
      let rec = data[skillName];
      if (typeof rec !== 'object' || rec === null) rec = _emptyRecord();
      mutator(rec);
      data[skillName] = rec;
      saveUsage(data);
    } finally {
      lock.release();
    }
  } catch {
    // Best-effort
  }
}

// ── Activity helpers ───────────────────────────────────────────────────────────

/**
 * Return the newest actual activity timestamp for a usage record.
 * Excludes createdAt — only use/view/patch events count.
 */
function latestActivityAt(skillNameOrRecord) {
  let record;
  if (typeof skillNameOrRecord === 'string') {
    record = getRecord(skillNameOrRecord);
  } else {
    record = skillNameOrRecord;
  }

  let latestDt   = null;
  let latestRaw  = null;
  const tsFields = ['lastUsedAt', 'lastViewedAt', 'lastPatchedAt'];

  for (const key of tsFields) {
    const raw  = record[key];
    const dt   = _parseIsoTimestamp(raw);
    if (dt === null) continue;
    if (latestDt === null || dt > latestDt) {
      latestDt  = dt;
      latestRaw = raw;
    }
  }
  return latestRaw;
}

/**
 * Return total activity count across use/view/patch events.
 */
function getActivityCount(skillNameOrRecord) {
  let record;
  if (typeof skillNameOrRecord === 'string') {
    record = getRecord(skillNameOrRecord);
  } else {
    record = skillNameOrRecord;
  }
  let total = 0;
  for (const key of ['useCount', 'viewCount', 'patchCount']) {
    const n = parseInt(record[key] || 0, 10);
    if (!Number.isNaN(n)) total += n;
  }
  return total;
}

// ── Counter bumps — telemetry for ALL skills ───────────────────────────────────

/** Bump use_count + last_used_at. Call when a skill is actively used. */
function bumpUse(skillName) {
  _mutate(skillName, rec => {
    rec.useCount    = parseInt(rec.useCount || 0, 10) + 1;
    rec.lastUsedAt  = _nowIso();
    // On first use, default source to 'builtin' (caller can override)
    if (!rec.source) rec.source = 'builtin';
  });
}

/** Bump view_count + last_viewed_at. Call when a skill is displayed/loaded. */
function bumpView(skillName) {
  _mutate(skillName, rec => {
    rec.viewCount     = parseInt(rec.viewCount || 0, 10) + 1;
    rec.lastViewedAt  = _nowIso();
    if (!rec.source) rec.source = 'builtin';
  });
}

/** Bump patch_count + last_patched_at. Call when a skill is edited. */
function bumpPatch(skillName) {
  _mutate(skillName, rec => {
    rec.patchCount     = parseInt(rec.patchCount || 0, 10) + 1;
    rec.lastPatchedAt  = _nowIso();
  });
}

// ── State / pin management ─────────────────────────────────────────────────────

function setState(skillName, state) {
  if (!VALID_STATES.has(state)) return;
  _mutate(skillName, rec => {
    rec.state = state;
    if (state === STATE_ARCHIVED) {
      rec.archivedAt = _nowIso();
    } else if (state === STATE_ACTIVE) {
      rec.archivedAt = null;
    }
  }, { requireCuratorEligible: true });
}

function setPinned(skillName, pinned) {
  _mutate(skillName, rec => {
    rec.pinned  = Boolean(pinned);
    rec.pinnedAt = pinned ? _nowIso() : null;
  }, { requireCuratorEligible: true });
}

function markSource(skillName, source) {
  // source: 'agent' | 'hub' | 'builtin'
  _mutate(skillName, rec => {
    rec.source = source;
  });
}

// ── Skill directory helpers ─────────────────────────────────────────────────────

/**
 * Find the directory for a skill by its frontmatter name field.
 * Searches both flat (~/.purpclaw/skills/<name>/) and category-nested
 * (~/.purpclaw/skills/<category>/<name>/) layouts.
 */
function _findSkillDir(skillName) {
  const base = _skillsBaseDir();
  if (!fs.existsSync(base)) return null;

  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isDirectory()) continue;
      const skillMd = path.join(full, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        // Check if this is the skill we want
        const name = _readSkillName(skillMd) || entry;
        if (name === skillName) { return full; }
        // Don't descend into a skill directory
        continue;
      }
      // Category folder — keep walking
      const found = walk(full, depth + 1);
      if (found) return found;
    }
    return null;
  };

  return walk(base);
}

/**
 * Parse the `name:` field from SKILL.md YAML frontmatter.
 */
function _readSkillName(skillMd) {
  try {
    const content = fs.readFileSync(skillMd, 'utf8').slice(0, 4000);
    let inFrontmatter = false;
    for (const line of content.split('\n')) {
      const stripped = line.trim();
      if (stripped === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter && stripped.startsWith('name:')) {
        const value = stripped.split(':', 1)[1].trim().replace(/^["']|["']$/g, '');
        if (value) return value;
      }
    }
  } catch {}
  return null;
}

// ── Provenance ─────────────────────────────────────────────────────────────────

function _readBundledManifestNames() {
  const manifest = path.join(_skillsBaseDir(), '.bundled_manifest');
  if (!fs.existsSync(manifest)) return new Set();
  try {
    const text = fs.readFileSync(manifest, 'utf8');
    const names = new Set();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const name = trimmed.split(':', 1)[0].trim();
      if (name) names.add(name);
    }
    return names;
  } catch {
    return new Set();
  }
}

function _readHubInstalledNames() {
  const lockPath = path.join(_skillsBaseDir(), '.hub', 'lock.json');
  if (!fs.existsSync(lockPath)) return new Set();
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw);
    const installed = (data && data.installed) || {};
    return new Set(Object.keys(installed));
  } catch {
    return new Set();
  }
}

function provenance(skillName) {
  if (_readHubInstalledNames().has(skillName)) return 'hub';
  if (_readBundledManifestNames().has(skillName)) return 'builtin';
  return 'agent';
}

// ── Curation eligibility ───────────────────────────────────────────────────────

function isCuratorEligible(skillName) {
  if (isProtectedBuiltin(skillName)) return false;
  if (_readHubInstalledNames().has(skillName)) return false;
  if (_readBundledManifestNames().has(skillName)) return true; // eligible when prune_builtins on
  // Agent-created or local skills: check they exist on disk
  return _findSkillDir(skillName) !== null;
}

// ── Query APIs ─────────────────────────────────────────────────────────────────

/** Get the full usage record for a skill. */
function getUsage(skillName) {
  return getRecord(skillName);
}

/** List all skills in a given state. */
function listByState(state) {
  if (!VALID_STATES.has(state)) return [];
  const data  = loadUsage();
  const base  = _skillsBaseDir();
  const names = new Set();

  // Scan disk for known skills
  if (fs.existsSync(base)) {
    const scan = (dir, depth = 0) => {
      if (depth > 4) return;
      let entries;
      try { entries = fs.readdirSync(dir); } catch { return; }
      for (const entry of entries) {
        if (entry.startsWith('_') || entry.startsWith('.')) continue;
        if (entry === 'node_modules' || entry === '__pycache__') continue;
        const full = path.join(dir, entry);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.isDirectory()) {
          const skillMd = path.join(full, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            const name = _readSkillName(skillMd) || entry;
            names.add(name);
          } else {
            scan(full, depth + 1);
          }
        }
      }
    };
    scan(base);
  }

  const results = [];
  for (const name of names) {
    const rec = data[name];
    if (rec && rec.state === state) {
      results.push({ name, ..._emptyRecord(), ...rec });
    }
  }
  return results;
}

/**
 * List skills that are stale (unused for > days).
 * @param {number} days
 * @returns {{name, record}[]}
 */
function listStale(days) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const data   = loadUsage();
  const base   = _skillsBaseDir();
  const names  = new Set();

  if (fs.existsSync(base)) {
    const scan = (dir, depth = 0) => {
      if (depth > 4) return;
      let entries;
      try { entries = fs.readdirSync(dir); } catch { return; }
      for (const entry of entries) {
        if (entry.startsWith('_') || entry.startsWith('.')) continue;
        const full = path.join(dir, entry);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.isDirectory()) {
          const skillMd = path.join(full, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            names.add(_readSkillName(skillMd) || entry);
          } else {
            scan(full, depth + 1);
          }
        }
      }
    };
    scan(base);
  }

  const results = [];
  for (const name of names) {
    if (isProtectedBuiltin(name)) continue;
    const rec = data[name] || {};
    if (rec.pinned) continue;
    const lastTs = latestActivityAt({ ..._emptyRecord(), ...rec });
    if (!lastTs) {
      // Never used — check createdAt
      const created = _parseIsoTimestamp(rec.createdAt);
      if (created && created < cutoff) results.push({ name, record: { ..._emptyRecord(), ...rec } });
      continue;
    }
    const lastDt = _parseIsoTimestamp(lastTs);
    if (lastDt && lastDt < cutoff) results.push({ name, record: { ..._emptyRecord(), ...rec } });
  }
  return results;
}

// ── Archive ─────────────────────────────────────────────────────────────────────

/**
 * Move a skill's directory to ~/.purpclaw/skills/.archive/<skill>/
 * Returns {ok, message}.
 */
function archiveSkill(skillName) {
  if (!skillName) return { ok: false, message: 'no skill name given' };
  if (isProtectedBuiltin(skillName)) {
    return { ok: false, message: `'${skillName}' is a protected built-in and is never archived` };
  }
  if (_readHubInstalledNames().has(skillName)) {
    return { ok: false, message: `'${skillName}' is hub-installed and cannot be archived` };
  }

  const skillDir = _findSkillDir(skillName);
  if (!skillDir) {
    return { ok: false, message: `skill '${skillName}' not found` };
  }

  const archiveRoot = _archiveDir();
  try {
    if (!fs.existsSync(archiveRoot)) fs.mkdirSync(archiveRoot, { recursive: true });
  } catch (e) {
    return { ok: false, message: `failed to create archive dir: ${e.message}` };
  }

  let dest = path.join(archiveRoot, path.basename(skillDir));
  if (fs.existsSync(dest)) {
    // Disambiguate with timestamp
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    dest = path.join(archiveRoot, `${path.basename(skillDir)}-${ts}`);
  }

  try {
    fs.renameSync(skillDir, dest);
  } catch (e) {
    // Cross-device — fall back to copy+delete
    try {
      _copyDir(skillDir, dest);
      _deleteDir(skillDir);
    } catch (e2) {
      return { ok: false, message: `failed to archive: ${e2.message}` };
    }
  }

  setState(skillName, STATE_ARCHIVED);
  return { ok: true, message: `archived to ${dest}` };
}

/**
 * Restore a skill from the archive back to the skills directory.
 * Returns {ok, message}.
 */
function restoreSkill(skillName) {
  if (!skillName) return { ok: false, message: 'no skill name given' };

  const archiveRoot = _archiveDir();
  if (!fs.existsSync(archiveRoot)) {
    return { ok: false, message: 'no archive directory' };
  }

  // Find the archived skill directory
  let src = null;
  const entries = fs.readdirSync(archiveRoot);
  for (const entry of entries) {
    const full = path.join(archiveRoot, entry);
    if (!fs.statSync(full).isDirectory()) continue;
    if (entry === skillName || entry.startsWith(`${skillName}-`)) {
      src = full;
      break;
    }
  }

  if (!src) return { ok: false, message: `skill '${skillName}' not found in archive` };

  const dest = _findSkillDir(skillName);
  if (dest && fs.existsSync(dest)) {
    return { ok: false, message: `destination already exists: ${dest}` };
  }

  try {
    fs.renameSync(src, path.join(_skillsBaseDir(), skillName));
  } catch {
    try {
      _copyDir(src, path.join(_skillsBaseDir(), skillName));
      _deleteDir(src);
    } catch (e) {
      return { ok: false, message: `failed to restore: ${e.message}` };
    }
  }

  setState(skillName, STATE_ACTIVE);
  return { ok: true, message: `restored to ${path.join(_skillsBaseDir(), skillName)}` };
}

/** List all archived skill names. */
function listArchived() {
  const archiveRoot = _archiveDir();
  if (!fs.existsSync(archiveRoot)) return [];
  try {
    return fs.readdirSync(archiveRoot)
      .filter(e => {
        try { return fs.statSync(path.join(archiveRoot, e)).isDirectory(); }
        catch { return false; }
      })
      .sort();
  } catch {
    return [];
  }
}

// ── Full usage report ─────────────────────────────────────────────────────────

/**
 * Return usage telemetry for ALL skills on disk (bundled, hub, agent — all).
 * Each row carries: name, useCount, viewCount, patchCount, lastUsedAt,
 * lastViewedAt, lastPatchedAt, createdAt, state, pinned, source, provenance,
 * lastActivityAt, activityCount.
 */
function usageReport() {
  const data  = loadUsage();
  const base  = _skillsBaseDir();
  const seen  = new Set();
  const rows  = [];

  if (fs.existsSync(base)) {
    const scan = (dir, depth = 0) => {
      if (depth > 4) return;
      let entries;
      try { entries = fs.readdirSync(dir); } catch { return; }
      for (const entry of entries) {
        if (entry.startsWith('_') || entry.startsWith('.')) continue;
        if (entry === 'node_modules' || entry === '__pycache__') continue;
        const full = path.join(dir, entry);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.isDirectory()) {
          const skillMd = path.join(full, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            const name = _readSkillName(skillMd) || entry;
            if (!seen.has(name)) {
              seen.add(name);
              rows.push({ name, dir: full });
            }
          } else {
            scan(full, depth + 1);
          }
        }
      }
    };
    scan(base);
  }

  const results = [];
  for (const { name } of rows) {
    const raw     = data[name] || {};
    const rec     = { ..._emptyRecord(), ...raw };
    const lastAct = latestActivityAt(rec);
    const actCnt  = getActivityCount(rec);
    results.push({
      name,
      useCount:     rec.useCount,
      viewCount:    rec.viewCount,
      patchCount:   rec.patchCount,
      lastUsedAt:   rec.lastUsedAt,
      lastViewedAt: rec.lastViewedAt,
      lastPatchedAt:rec.lastPatchedAt,
      createdAt:    rec.createdAt,
      state:        rec.state,
      pinned:       rec.pinned,
      source:       rec.source,
      provenance:   provenance(name),
      lastActivityAt: lastAct,
      activityCount:  actCnt,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function _copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) {
      _copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function _deleteDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      _deleteDir(full);
    } else {
      fs.unlinkSync(full);
    }
  }
  fs.rmdirSync(dir);
}

// ── Exports ─────────────────────────────────────────────────────────────────────

module.exports = {
  // Core telemetry
  bumpUse,
  bumpView,
  bumpPatch,
  markSource,

  // Queries
  getUsage,
  getRecord,
  getActivityCount,
  latestActivityAt,
  listByState,
  listStale,
  listArchived,
  usageReport,

  // Lifecycle
  setState,
  setPinned,
  archiveSkill,
  restoreSkill,

  // Utilities
  isProtectedBuiltin,
  isCuratorEligible,
  provenance,
  _findSkillDir,
  _readSkillName,
  _skillsBaseDir,
  _archiveDir,

  // Constants
  STATE_ACTIVE,
  STATE_STALE,
  STATE_ARCHIVED,
  PROTECTED_BUILTINS,
};
