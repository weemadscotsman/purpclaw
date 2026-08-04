'use strict';
/**
 * lib/curator.js — PURPCLAW Skill Lifecycle Curator + Usage Tracker
 * ============================================================================
 *
 * Combined module ported from:
 *   - Hermes agent/curator.py  (~2019 lines)  — skill lifecycle state machine
 *   - Hermes tools/skill_usage.py (~1119 lines) — skill usage tracking
 *
 * Skill lifecycle state machine (6 states):
 *   pending_review  ← initial; a new skill starts here
 *   approved       ← reviewed and cleared for use
 *   quarantined    ← flagged for review / potential issue
 *   archived       ← inactive; moved to .archive/ dir
 *   rejected       ← reviewed and explicitly rejected
 *
 * State transitions:
 *   pending_review → approved    (review() call, or auto after N days)
 *   pending_review → quarantined (review() flags it)
 *   pending_review → rejected    (review() rejects it)
 *   approved      → quarantined (re-review flags it)
 *   approved      → archived    (inactivity prune)
 *   approved      → rejected    (explicit re-review reject)
 *   quarantined   → approved   (re-review clears it)
 *   quarantined   → rejected   (re-review rejects it)
 *   quarantined   → archived   (inactivity prune)
 *   rejected      → pending_review (explicit re-review request)
 *   archived      → approved   (restore + re-review)
 *
 * Pinned skills bypass all auto-transitions.
 * Protected builtins: 'plan' — never archived, quarantined, or rejected.
 *
 * Skill usage tracking (SkillUsageTracker pattern):
 *   bumpUse(skillName), bumpView(skillName), bumpPatch(skillName)
 *   getUsage(skillName), getTopUsed(n), resetUsage(skillName)
 *
 * Usage file:    ~/.purpclaw/skills/.usage.json
 * Curator state: ~/.purpclaw/skills/.curator_state
 * Archive dir:   ~/.purpclaw/skills/.archive/
 *
 * ISOLATION: In tests, set process.env.PURPCLAW_HOME_DIR before loading this
 * module. The module resolves home directory at load time via a closure so
 * both the fs wrapper and path builders share the same effective home dir.
 */

const assert = require('assert');

// ── Home directory (resolved once at load time, overridable via env var) ────────
// This closure is the single source of truth for the effective home directory.
// Both the fs wrapper and all path functions use it.
const _getHome = (function() {
  // In tests: set PURPCLAW_HOME_DIR before requiring this module.
  // In production: falls back to os.homedir().
  const HOME = process.env.PURPCLAW_HOME_DIR || (function() {
    // eslint-disable-next-line global-require
    return require('os').homedir();
  }());
  return function() { return HOME; };
}());

// ── Minimal fs-compatible wrapper using HOME closure ────────────────────────────
// We wrap fs so all paths go through _getHome() — no absolute path is ever
// hardcoded to the real user's home directory.
const _fs = (function() {
  const Fs = require('fs');
  const Path = require('path');
  function _p(subpath) { return Path.join(_getHome(), subpath); }
  return {
    existsSync:     function(p)  { return Fs.existsSync(p); },
    readFileSync:   function(p, e) { return Fs.readFileSync(p, e); },
    writeFileSync:  function(p, d)  { Fs.writeFileSync(p, d); },
    renameSync:     function(s, d)  { Fs.renameSync(s, d); },
    mkdirSync:      function(p, o)  { Fs.mkdirSync(p, o); },
    rmdirSync:      function(p)      { Fs.rmdirSync(p); },
    unlinkSync:     function(p)      { Fs.unlinkSync(p); },
    readdirSync:    function(p)      { return Fs.readdirSync(p); },
    statSync:      function(p)      { return Fs.statSync(p); },
    openSync:      function(p, m)    { return Fs.openSync(p, m); },
    closeSync:     function(fd)      { Fs.closeSync(fd); },
    copyFileSync:  function(s, d)    { Fs.copyFileSync(s, d); },
    // Convenience helpers that automatically prefix with home
    homeExistsSync:  function(sub)   { return Fs.existsSync(_p(sub)); },
    homeReadFile:    function(sub, e){ return Fs.readFileSync(_p(sub), e); },
    homeWriteFile:   function(sub, d) { Fs.writeFileSync(_p(sub), d); },
    homeMkdirSync:   function(sub, o){ Fs.mkdirSync(_p(sub), o); },
    homeRmdirSync:   function(sub)   { Fs.rmdirSync(_p(sub)); },
    homeUnlinkSync:  function(sub)   { Fs.unlinkSync(_p(sub)); },
    homeReaddirSync: function(sub)   { return Fs.readdirSync(_p(sub)); },
    homeStatSync:   function(sub)   { return Fs.statSync(_p(sub)); },
  };
}());

const os   = require('os');
const path = require('path');

// ── Project root resolver ────────────────────────────────────────────────────────
function _resolveProjectRoot() {
  const sep = path.sep;
  const marker = 'docs' + sep + 'COMPANION_EVENT_MAP.md';
  const KNOWN = [
    'E:' + sep + 'god folder' + sep + '02_ACTIVE_PROJECTS' + sep + 'PURPCLAW',
  ];
  for (const p of KNOWN) {
    if (_fs.existsSync(path.join(p, marker))) return p;
  }
  const original = path.resolve(__dirname, '..');
  let dir = original, prev = '';
  while (dir !== prev) {
    if (_fs.existsSync(path.join(dir, marker))) return dir;
    prev = dir; dir = path.dirname(dir);
  }
  return original;
}
const PROJECT_ROOT = _resolveProjectRoot();

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CONSTANTS & DEFAULTS
// ════════════════════════════════════════════════════════════════════════════════

const STATES = {
  PENDING_REVIEW: 'pending_review',
  APPROVED:       'approved',
  QUARANTINED:    'quarantined',
  ARCHIVED:       'archived',
  REJECTED:       'rejected',
};

const VALID_STATES = new Set(Object.values(STATES));

const PROTECTED_BUILTINS = Object.freeze(new Set(['plan']));

const DEFAULT_INTERVAL_HOURS     = 24 * 7;
const DEFAULT_MIN_IDLE_HOURS    = 2;
const DEFAULT_STALE_AFTER_DAYS  = 30;
const DEFAULT_ARCHIVE_AFTER_DAYS = 90;
const DEFAULT_CONSOLIDATE        = false;
const DEFAULT_AUTO_APPROVE_DAYS = 7;

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2 — PATHS  (all via _fs.home* wrappers using _getHome())
// ════════════════════════════════════════════════════════════════════════════════

function _purpclawDir()   { return '.purpclaw'; }
function _skillsDir()     { return '.purpclaw/skills'; }
function _usageFile()     { return '.purpclaw/skills/.usage.json'; }
function _usageLockFile() { return '.purpclaw/skills/.usage.json.lock'; }
function _archiveDir()   { return '.purpclaw/skills/.archive'; }
function _stateFile()     { return '.purpclaw/skills/.curator_state'; }
function _reportsRoot()   { return '.purpclaw/skills/.curator_reports'; }
function _cronDir()       { return '.purpclaw/cron'; }

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3 — CONFIG
// ════════════════════════════════════════════════════════════════════════════════

function _loadConfig() {
  const cfgPath = '.purpclaw/config.json';
  try {
    if (_fs.homeExistsSync(cfgPath)) {
      const raw = JSON.parse(_fs.homeReadFile(cfgPath, 'utf-8'));
      if (raw && typeof raw === 'object') return raw;
    }
  } catch (_) { /* best-effort */ }
  return {};
}

function _getConfig(key, fallback) {
  const cfg = _loadConfig();
  const cur = cfg.curator || {};
  if (cur && typeof cur === 'object' && key in cur) return cur[key];
  return fallback;
}

const isEnabled          = () => _getConfig('enabled', true) !== false;
const getIntervalHours  = () => { const v = _getConfig('intervalHours', DEFAULT_INTERVAL_HOURS);     return typeof v === 'number' && isFinite(v) ? Math.max(1, Math.round(v)) : DEFAULT_INTERVAL_HOURS; };
const getMinIdleHours    = () => { const v = _getConfig('minIdleHours', DEFAULT_MIN_IDLE_HOURS);      return typeof v === 'number' && isFinite(v) ? Math.max(0, v) : DEFAULT_MIN_IDLE_HOURS; };
const getStaleAfterDays  = () => { const v = _getConfig('staleAfterDays', DEFAULT_STALE_AFTER_DAYS);  return typeof v === 'number' && isFinite(v) ? Math.max(1, Math.round(v)) : DEFAULT_STALE_AFTER_DAYS; };
const getArchiveAfterDays= () => { const v = _getConfig('archiveAfterDays', DEFAULT_ARCHIVE_AFTER_DAYS); return typeof v === 'number' && isFinite(v) ? Math.max(1, Math.round(v)) : DEFAULT_ARCHIVE_AFTER_DAYS; };
const getConsolidate     = () => _getConfig('consolidate', DEFAULT_CONSOLIDATE) === true;
const getAutoApproveDays = () => { const v = _getConfig('autoApproveDays', DEFAULT_AUTO_APPROVE_DAYS); return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.round(v)) : DEFAULT_AUTO_APPROVE_DAYS; };

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4 — TIME HELPERS
// ════════════════════════════════════════════════════════════════════════════════

function _nowIso() { return new Date().toISOString(); }

function _parseIso(ts) {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch (_) { return null; }
}

function _hoursSince(ts) {
  const d = _parseIso(ts);
  if (!d) return Infinity;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 5 — PROTECTED SKILLS
// ════════════════════════════════════════════════════════════════════════════════

function isProtectedBuiltin(name) {
  if (!name || typeof name !== 'string') return false;
  return PROTECTED_BUILTINS.has(name.toLowerCase());
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 6 — CURATOR STATE PERSISTENCE
// ════════════════════════════════════════════════════════════════════════════════

function _defaultState() {
  return {
    lastRunAt:              null,
    lastRunDurationSeconds: null,
    lastRunSummary:         null,
    lastReportPath:         null,
    paused:                 false,
    runCount:               0,
  };
}

function loadState() {
  const p = _stateFile();
  if (!_fs.homeExistsSync(p)) return _defaultState();
  try {
    const data = JSON.parse(_fs.homeReadFile(p, 'utf-8'));
    if (typeof data !== 'object' || data === null) return _defaultState();
    return { ..._defaultState(), ...data };
  } catch (_) { return _defaultState(); }
}

function saveState(data) {
  try {
    _fs.homeMkdirSync(_purpclawDir(), { recursive: true });
    _fs.homeWriteFile(_stateFile(), JSON.stringify(data, null, 2));
  } catch (e) { console.warn('[curator] saveState failed:', e.message); }
}

function isPaused()    { return loadState().paused === true; }
function setPaused(v) { const s = loadState(); s.paused = v === true; saveState(s); }

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 7 — USAGE TRACKING  (SkillUsageTracker pattern)
// ════════════════════════════════════════════════════════════════════════════════

// ── 7a  Usage record factory ───────────────────────────────────────────────────

function _emptyRecord() {
  return {
    useCount:      0,
    viewCount:     0,
    patchCount:    0,
    lastUsedAt:   null,
    lastViewedAt: null,
    lastPatchedAt:null,
    createdAt:    _nowIso(),
    updatedAt:    _nowIso(),
    state:        STATES.PENDING_REVIEW,
    archivedAt:   null,
    reviewedAt:   null,
    reviewNote:   null,
    pinned:       false,
    pinnedAt:     null,
    source:       null,
  };
}

// ── 7b  Raw load / save ───────────────────────────────────────────────────────

function _loadUsage() {
  const fp = _usageFile();
  if (!_fs.homeExistsSync(fp)) return {};
  try {
    const raw = JSON.parse(_fs.homeReadFile(fp, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return {};
    const clean = {};
    for (const [k, v] of Object.entries(raw)) {
      clean[String(k)] = typeof v === 'object' && v !== null ? v : {};
    }
    return clean;
  } catch (_) { return {}; }
}

function _saveUsage(data) {
  try {
    _fs.homeMkdirSync(_skillsDir(), { recursive: true });
    const fp = _usageFile();
    const tmp = fp + '.tmp';
    _fs.homeWriteFile(tmp, JSON.stringify(data, null, 2));
    // atomic rename
    const Fs = require('fs');
    Fs.renameSync(fp, tmp);  // overwrites fp with tmp
  } catch (_) { /* best-effort */ }
}

// ── 7c  Core mutate helper ────────────────────────────────────────────────────

function _mutate(skillName, mutator) {
  if (!skillName) return;
  try {
    const data = _loadUsage();
    let rec = data[skillName];
    if (typeof rec !== 'object' || rec === null) rec = _emptyRecord();
    mutator(rec);
    rec.updatedAt = _nowIso();
    data[skillName] = rec;
    _saveUsage(data);
  } catch (_) { /* best-effort */ }
}

// ── 7d  Skill directory helpers ───────────────────────────────────────────────

function _findSkillDir(skillName) {
  const base = _skillsDir();
  if (!_fs.homeExistsSync(base)) return null;
  const walk = function(dir, depth) {
    depth = depth || 0;
    if (depth > 4) return;
    let entries;
    try { entries = _fs.homeReaddirSync(dir); } catch (_) { return; }
    for (const entry of entries) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue;
      if (entry === 'node_modules' || entry === '__pycache__') continue;
      const full = path.join(dir, entry);
      let st;
      try { st = _fs.homeStatSync(full); } catch (_) { continue; }
      if (!st.isDirectory()) continue;
      const skillMd = path.join(full, 'SKILL.md');
      if (_fs.homeExistsSync(skillMd)) {
        const name = _readSkillName(skillMd) || entry;
        if (name === skillName) return full;
        continue;
      }
      const found = walk(full, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(base, 0);
}

function _readSkillName(skillMd) {
  try {
    const content = _fs.homeReadFile(skillMd, 'utf8').slice(0, 4000);
    let inFrontmatter = false;
    for (const line of content.split('\n')) {
      const stripped = line.trim();
      if (stripped === '---') { inFrontmatter = !inFrontmatter; continue; }
      if (inFrontmatter && stripped.startsWith('name:')) {
        const value = stripped.split(':', 1)[1].trim().replace(/^["']|["']$/g, '');
        if (value) return value;
      }
    }
  } catch (_) {}
  return null;
}

// ── 7e  Activity helpers ───────────────────────────────────────────────────────

function latestActivityAt(skillNameOrRecord) {
  let rec;
  if (typeof skillNameOrRecord === 'string') rec = getRecord(skillNameOrRecord);
  else rec = skillNameOrRecord;
  let latestDt = null, latestRaw = null;
  for (const key of ['lastUsedAt', 'lastViewedAt', 'lastPatchedAt']) {
    const raw = rec[key];
    const dt  = _parseIso(raw);
    if (!dt) continue;
    if (!latestDt || dt > latestDt) { latestDt = dt; latestRaw = raw; }
  }
  return latestRaw;
}

function activityCount(skillNameOrRecord) {
  let rec;
  if (typeof skillNameOrRecord === 'string') rec = getRecord(skillNameOrRecord);
  else rec = skillNameOrRecord;
  let total = 0;
  for (const key of ['useCount', 'viewCount', 'patchCount']) {
    const n = parseInt(rec[key] || 0, 10);
    if (!Number.isNaN(n)) total += n;
  }
  return total;
}

// ── 7f  Public usage tracker API ──────────────────────────────────────────────

function getRecord(skillName) {
  const data = _loadUsage();
  const rec  = data[skillName];
  if (typeof rec !== 'object' || rec === null) return _emptyRecord();
  const base = _emptyRecord();
  for (const [k, v] of Object.entries(base)) { if (!(k in rec)) rec[k] = v; }
  return rec;
}

function getUsage(skillName) { return getRecord(skillName); }

function increment(skillName) {
  _mutate(skillName, function(rec) {
    rec.useCount   = parseInt(rec.useCount || 0, 10) + 1;
    rec.lastUsedAt = _nowIso();
    if (!rec.source) rec.source = 'agent';
  });
}

function bumpView(skillName) {
  _mutate(skillName, function(rec) {
    rec.viewCount    = parseInt(rec.viewCount || 0, 10) + 1;
    rec.lastViewedAt = _nowIso();
    if (!rec.source) rec.source = 'agent';
  });
}

function bumpPatch(skillName) {
  _mutate(skillName, function(rec) {
    rec.patchCount    = parseInt(rec.patchCount || 0, 10) + 1;
    rec.lastPatchedAt = _nowIso();
  });
}

function getTopUsed(n) {
  if (n === undefined) n = 10;
  const data = _loadUsage();
  return Object.entries(data)
    .filter(function(item) { var v = item[1]; return typeof v === 'object' && v !== null; })
    .map(function(item) { return { name: item[0], useCount: parseInt(item[1].useCount || 0, 10) }; })
    .filter(function(r) { return r.useCount > 0; })
    .sort(function(a, b) { return b.useCount - a.useCount; })
    .slice(0, n);
}

function resetUsage(skillName) {
  _mutate(skillName, function(rec) {
    rec.useCount      = 0;
    rec.viewCount     = 0;
    rec.patchCount    = 0;
    rec.lastUsedAt    = null;
    rec.lastViewedAt  = null;
    rec.lastPatchedAt = null;
  });
}

function getState(skillName) {
  const rec = getRecord(skillName);
  return rec.state || STATES.PENDING_REVIEW;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 8 — PROVENANCE & ELIGIBILITY
// ════════════════════════════════════════════════════════════════════════════════

function _readBundledNames() {
  const manifest = '.purpclaw/skills/.bundled_manifest';
  if (!_fs.homeExistsSync(manifest)) return new Set();
  try {
    const names = new Set();
    for (const line of _fs.homeReadFile(manifest, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const name = t.split(':', 1)[0].trim();
      if (name) names.add(name);
    }
    return names;
  } catch (_) { return new Set(); }
}

function _readHubNames() {
  const lockPath = '.purpclaw/skills/.hub/lock.json';
  if (!_fs.homeExistsSync(lockPath)) return new Set();
  try {
    const data = JSON.parse(_fs.homeReadFile(lockPath, 'utf8'));
    return new Set(Object.keys(data && data.installed || {}));
  } catch (_) { return new Set(); }
}

function provenance(skillName) {
  if (_readHubNames().has(skillName)) return 'hub';
  if (_readBundledNames().has(skillName)) return 'builtin';
  return 'agent';
}

function isCuratorEligible(skillName) {
  if (isProtectedBuiltin(skillName)) return false;
  if (_readHubNames().has(skillName)) return false;
  if (_readBundledNames().has(skillName)) return true;
  return _findSkillDir(skillName) !== null;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 9 — LIFECYCLE STATE MACHINE
// ════════════════════════════════════════════════════════════════════════════════

const STATE_TRANSITIONS = {};
STATE_TRANSITIONS[STATES.PENDING_REVIEW] = [STATES.APPROVED, STATES.QUARANTINED, STATES.REJECTED];
STATE_TRANSITIONS[STATES.APPROVED]       = [STATES.QUARANTINED, STATES.ARCHIVED, STATES.REJECTED];
STATE_TRANSITIONS[STATES.QUARANTINED]    = [STATES.APPROVED, STATES.REJECTED, STATES.ARCHIVED];
STATE_TRANSITIONS[STATES.REJECTED]       = [STATES.PENDING_REVIEW];
STATE_TRANSITIONS[STATES.ARCHIVED]       = [STATES.APPROVED];

function _canTransition(from, to) {
  if (from === to) return true;
  const allowed = STATE_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
}

function _setState(skillName, newState, note) {
  if (!VALID_STATES.has(newState)) return { ok: false, message: 'invalid state: ' + newState };
  _mutate(skillName, function(rec) {
    const current = rec.state || STATES.PENDING_REVIEW;
    if (!_canTransition(current, newState)) return;
    rec.state      = newState;
    rec.reviewedAt = _nowIso();
    if (note) rec.reviewNote = String(note).slice(0, 500);
    if (newState === STATES.ARCHIVED) rec.archivedAt = _nowIso();
    else rec.archivedAt = null;
  });
  return { ok: true, message: 'state \u2192 ' + newState };
}

function approve(skillName, note) {
  if (isProtectedBuiltin(skillName)) return { ok: false, message: "'" + skillName + "' is protected" };
  return _setState(skillName, STATES.APPROVED, note);
}

function quarantine(skillName, note) {
  if (isProtectedBuiltin(skillName)) return { ok: false, message: "'" + skillName + "' is protected" };
  return _setState(skillName, STATES.QUARANTINED, note);
}

function reject(skillName, note) {
  if (isProtectedBuiltin(skillName)) return { ok: false, message: "'" + skillName + "' is protected" };
  return _setState(skillName, STATES.REJECTED, note);
}

function archiveSkill(skillName, note) {
  if (isProtectedBuiltin(skillName)) return { ok: false, message: "'" + skillName + "' is protected" };
  if (_readHubNames().has(skillName)) return { ok: false, message: "'" + skillName + "' is hub-installed" };

  const skillDir = _findSkillDir(skillName);
  if (!skillDir) return { ok: false, message: "skill '" + skillName + "' not found" };

  const archiveRoot = _archiveDir();
  try { _fs.homeMkdirSync(archiveRoot, { recursive: true }); }
  catch (e) { return { ok: false, message: 'failed to create archive dir: ' + e.message }; }

  let dest = path.join(archiveRoot, path.basename(skillDir));
  if (_fs.homeExistsSync(dest)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    dest = path.join(archiveRoot, path.basename(skillDir) + '-' + ts);
  }

  try { _fs.renameSync(skillDir, dest); }
  catch (_) {
    try {
      _copyDir(skillDir, dest);
      _deleteDir(skillDir);
    } catch (e2) { return { ok: false, message: 'failed to archive: ' + e2.message }; }
  }

  _setState(skillName, STATES.ARCHIVED, note);
  return { ok: true, message: 'archived to ' + dest };
}

function restoreSkill(skillName) {
  const archiveRoot = _archiveDir();
  if (!_fs.homeExistsSync(archiveRoot)) return { ok: false, message: 'no archive directory' };

  let src = null;
  try {
    for (const entry of _fs.homeReaddirSync(archiveRoot)) {
      const full = path.join(archiveRoot, entry);
      let st;
      try { st = _fs.homeStatSync(full); } catch (_) { continue; }
      if (!st.isDirectory()) continue;
      if (entry === skillName || entry.startsWith(skillName + '-')) { src = full; break; }
    }
  } catch (_) { return { ok: false, message: 'could not read archive' }; }

  if (!src) return { ok: false, message: "skill '" + skillName + "' not found in archive" };

  const destDir = path.join(_skillsDir(), skillName);
  if (_fs.homeExistsSync(destDir)) return { ok: false, message: 'destination already exists: ' + destDir };

  try { _fs.renameSync(src, destDir); }
  catch (_) {
    try {
      _copyDir(src, destDir);
      _deleteDir(src);
    } catch (e) { return { ok: false, message: 'failed to restore: ' + e.message }; }
  }

  _setState(skillName, STATES.APPROVED, 'restored from archive');
  return { ok: true, message: 'restored to ' + destDir };
}

function setPinned(skillName, pinned) {
  _mutate(skillName, function(rec) {
    rec.pinned  = Boolean(pinned);
    rec.pinnedAt = pinned ? _nowIso() : null;
  });
}

function markSource(skillName, source) {
  _mutate(skillName, function(rec) { rec.source = source; });
}

// ── 9b  Review action ──────────────────────────────────────────────────────────

function review(skillName, decision, note) {
  switch (String(decision).toLowerCase()) {
    case 'approve':    return approve(skillName, note);
    case 'quarantine': return quarantine(skillName, note);
    case 'reject':     return reject(skillName, note);
    case 'archive':    return archiveSkill(skillName, note);
    case 'restore':    return restoreSkill(skillName);
    default:          return { ok: false, message: 'unknown decision: ' + decision };
  }
}

// ── 9c  Prune ───────────────────────────────────────────────────────────────

function prune(oldDays) {
  const cutoff = new Date(Date.now() - Math.max(1, oldDays) * 86400000);
  const data = _loadUsage();
  const results = [];

  for (const [name, rec] of Object.entries(data)) {
    if (typeof rec !== 'object' || rec === null) continue;
    if (rec.pinned) continue;
    if (isProtectedBuiltin(name)) continue;
    if (rec.state === STATES.ARCHIVED) continue;

    const lastTs = latestActivityAt({ ..._emptyRecord(), ...rec });
    const lastDt = lastTs ? _parseIso(lastTs) : null;
    const anchor = lastDt || _parseIso(rec.createdAt);
    if (!anchor) continue;

    if (anchor < cutoff) {
      const r = archiveSkill(name, 'pruned after ' + oldDays + ' days inactive');
      results.push({ name: name, ok: r.ok, message: r.message });
    }
  }
  return results;
}

// ── 9d  getStats ─────────────────────────────────────────────────────────────

function getStats() {
  const data = _loadUsage();
  const byState      = {};
  const byProvenance = { agent: 0, builtin: 0, hub: 0 };
  let total = 0;
  let recentlyActive = 0;
  const cutoff7 = new Date(Date.now() - 7 * 86400000);

  for (const [name, rec] of Object.entries(data)) {
    if (typeof rec !== 'object' || rec === null) continue;
    total++;
    const state = rec.state || STATES.PENDING_REVIEW;
    byState[state] = (byState[state] || 0) + 1;
    const prov = provenance(name);
    if (prov in byProvenance) byProvenance[prov]++;

    const lastTs = latestActivityAt({ ..._emptyRecord(), ...rec });
    const lastDt = lastTs ? _parseIso(lastTs) : null;
    if (lastDt && lastDt > cutoff7) recentlyActive++;
  }

  const topUsed = getTopUsed(5);
  return { total: total, byState: byState, byProvenance: byProvenance, topUsed: topUsed, recentlyActive: recentlyActive };
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 10 — AUTOMATIC TRANSITIONS
// ════════════════════════════════════════════════════════════════════════════════

function _cronReferencedSkills() {
  const dir = _cronDir();
  const skills = new Set();
  try {
    if (!_fs.homeExistsSync(dir)) return skills;
    for (const file of _fs.homeReaddirSync(dir)) {
      if (!file.endsWith('.js') && !file.endsWith('.json')) continue;
      try {
        const content = _fs.homeReadFile(path.join(dir, file), 'utf-8');
        const matches = content.matchAll(/(?:skill[s]?[_]?name|skill)\\s*[:=]\\s*['"]([^'"]+)['"]/g);
        for (const m of matches) skills.add(m[1]);
        const skMatches = content.matchAll(/['"]([a-z][a-z0-9-]+)['"]/g);
        for (const m of skMatches) {
          const n = m[1];
          if (/^[a-z][a-z0-9-]+$/.test(n) && n.length > 3) skills.add(n);
        }
      } catch (_) {}
    }
  } catch (_) {}
  return skills;
}

function applyAutomaticTransitions(now) {
  if (!now) now = new Date();
  const staleCutoff   = new Date(now.getTime() - getStaleAfterDays()   * 86400000);
  const archiveCutoff = new Date(now.getTime() - getArchiveAfterDays() * 86400000);
  const approveCutoff = new Date(now.getTime() - getAutoApproveDays() * 86400000);
  const cronSkills    = _cronReferencedSkills();
  const data          = _loadUsage();
  const counts        = { checked: 0, autoApproved: 0, markedStale: 0, archived: 0, reactivated: 0 };

  for (const [name, rec] of Object.entries(data)) {
    if (typeof rec !== 'object' || rec === null) continue;
    counts.checked++;
    if (rec.pinned) continue;
    if (cronSkills.has(name)) continue;
    if (isProtectedBuiltin(name)) continue;

    const lastTs = latestActivityAt({ ..._emptyRecord(), ...rec });
    const lastDt = lastTs ? _parseIso(lastTs) : null;
    const anchor = lastDt || _parseIso(rec.createdAt) || now;

    const neverUsed = parseInt(rec.useCount || 0, 10) === 0;

    if (rec.state === STATES.PENDING_REVIEW && neverUsed && anchor < approveCutoff) {
      _setState(name, STATES.APPROVED, 'auto-approved after inactivity');
      counts.autoApproved++;
      continue;
    }

    if (neverUsed && anchor > staleCutoff) continue;

    if (anchor <= archiveCutoff && rec.state !== STATES.ARCHIVED) {
      archiveSkill(name, 'auto-archived after inactivity');
      counts.archived++;
    } else if (anchor <= staleCutoff && rec.state === STATES.APPROVED) {
      _setState(name, STATES.QUARANTINED, 'auto-quarantined: inactive');
      counts.markedStale++;
    } else if (anchor > staleCutoff && rec.state === STATES.QUARANTINED) {
      _setState(name, STATES.APPROVED, 'reactivated after use');
      counts.reactivated++;
    }
  }
  return counts;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 11 — SKILL DISCOVERY
// ════════════════════════════════════════════════════════════════════════════════

function discoverSkills() {
  const base  = _skillsDir();
  const seen  = new Set();
  const rows  = [];

  const scan = function(dir, depth) {
    depth = depth || 0;
    if (depth > 4) return;
    let entries;
    try { entries = _fs.homeReaddirSync(dir); } catch (_) { return; }
    for (const entry of entries) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue;
      if (entry === 'node_modules' || entry === '__pycache__') continue;
      const full = path.join(dir, entry);
      let st;
      try { st = _fs.homeStatSync(full); } catch (_) { continue; }
      if (st.isDirectory()) {
        const skillMd = path.join(full, 'SKILL.md');
        if (_fs.homeExistsSync(skillMd)) {
          const name = _readSkillName(skillMd) || entry;
          if (!seen.has(name)) { seen.add(name); rows.push({ name: name, path: full }); }
        } else { scan(full, depth + 1); }
      }
    }
  };

  if (_fs.homeExistsSync(base)) scan(base, 0);

  const data        = _loadUsage();
  const cronSkills = _cronReferencedSkills();

  return rows.map(function(item) {
    const name = item.name;
    const skillPath = item.path;
    const rec     = data[name] || {};
    const fullRec = { ..._emptyRecord(), ...rec };
    return {
      name: name,
      path:      skillPath,
      state:     fullRec.state     || STATES.PENDING_REVIEW,
      pinned:    Boolean(fullRec.pinned),
      useCount:  parseInt(fullRec.useCount  || 0, 10),
      viewCount: parseInt(fullRec.viewCount || 0, 10),
      patchCount:parseInt(fullRec.patchCount|| 0, 10),
      lastActivityAt: latestActivityAt(fullRec),
      createdAt: fullRec.createdAt,
      source:    fullRec.source || provenance(name),
      prov:      provenance(name),
      isCronReferenced: cronSkills.has(name),
    };
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 12 — REPORTING
// ════════════════════════════════════════════════════════════════════════════════

function _renderReportMd(opts) {
  const startedAt = opts.startedAt;
  const elapsedSeconds = opts.elapsedSeconds;
  const autoCounts = opts.autoCounts;
  const llmMeta = opts.llmMeta;
  const lines = [];
  const fmt = function(n) { return String(n).padStart(2, '0'); };
  const dateStr = function(d) {
    if (!d) return '?';
    try {
      const dt = new Date(d);
      return dt.getFullYear() + '-' + fmt(dt.getMonth()+1) + '-' + fmt(dt.getDate()) + ' ' + fmt(dt.getHours()) + ':' + fmt(dt.getMinutes());
    } catch (_) { return String(d); }
  };
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = Math.floor(elapsedSeconds % 60);
  const dur  = mins ? mins + 'm ' + secs + 's' : secs + 's';

  lines.push('# Curator run \u2014 ' + dateStr(startedAt) + '\n');
  lines.push('**Duration:** ' + dur + '  \u00b7  **Checked:** ' + autoCounts.checked + '\n');
  if (llmMeta && llmMeta.error) lines.push('> LLM error: `' + llmMeta.error + '`\n');
  lines.push('## Auto-transitions\n');
  lines.push('- checked:       ' + autoCounts.checked);
  lines.push('- auto-approved: ' + autoCounts.autoApproved);
  lines.push('- quarantined:  ' + autoCounts.markedStale);
  lines.push('- archived:      ' + autoCounts.archived);
  lines.push('- reactivated:  ' + autoCounts.reactivated + '\n');
  if (llmMeta && llmMeta.final) {
    lines.push('## LLM summary\n');
    lines.push(llmMeta.final);
    lines.push('');
  }
  lines.push('## Recovery\n');
  lines.push('- Restore: `purpclaw curator restore <name>`');
  lines.push('- Archives live in `~/.purpclaw/skills/.archive/`\n');
  return lines.join('\n');
}

function _writeRunReport(reportMd, metadata) {
  try {
    const root = _reportsRoot();
    _fs.homeMkdirSync(root, { recursive: true });
    const ts    = new Date();
    const stamp = '' + ts.getFullYear() + String(ts.getMonth()+1).padStart(2,'0') + String(ts.getDate()).padStart(2,'0') + '-' + String(ts.getHours()).padStart(2,'0') + String(ts.getMinutes()).padStart(2,'0') + String(ts.getSeconds()).padStart(2,'0');
    let runDir  = path.join(root, stamp);
    let suffix  = 1;
    while (_fs.homeExistsSync(runDir)) runDir = path.join(root, stamp + '-' + (++suffix));
    _fs.homeMkdirSync(runDir, { recursive: true });
    const runJson = { ...metadata, generatedAt: new Date().toISOString() };
    const Fs = require('fs');
    Fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runJson, null, 2), 'utf-8');
    Fs.writeFileSync(path.join(runDir, 'REPORT.md'), reportMd, 'utf-8');
    return runDir;
  } catch (e) { console.warn('[curator] _writeRunReport failed:', e.message); return null; }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 13 — MASTER RUN ORCHESTRATOR
// ════════════════════════════════════════════════════════════════════════════════

async function runCurator(options) {
  options = options || {};
  const dryRun       = options.dryRun !== undefined ? options.dryRun : false;
  const cOverride    = options.consolidate;
  const synchronous = options.synchronous !== undefined ? options.synchronous : false;
  const consolidate = cOverride !== null && cOverride !== undefined ? cOverride : getConsolidate();
  const start    = new Date();
  const startIso = start.toISOString();

  const beforeSkills = discoverSkills();
  const beforeNames  = new Set(beforeSkills.map(function(s) { return s.name; }));

  let autoCounts;
  if (dryRun) {
    autoCounts = { checked: beforeSkills.length, autoApproved: 0, markedStale: 0, archived: 0, reactivated: 0 };
  } else {
    autoCounts = applyAutomaticTransitions(start);
  }

  const autoParts = [];
  if (autoCounts.autoApproved)  autoParts.push(autoCounts.autoApproved + ' auto-approved');
  if (autoCounts.markedStale)  autoParts.push(autoCounts.markedStale + ' quarantined');
  if (autoCounts.archived)     autoParts.push(autoCounts.archived + ' archived');
  if (autoCounts.reactivated)  autoParts.push(autoCounts.reactivated + ' reactivated');
  const autoSummary = autoParts.join(', ') || 'no changes';

  const state = loadState();
  if (!dryRun) { state.lastRunAt = startIso; state.runCount = (state.runCount || 0) + 1; }
  state.lastRunSummary = (dryRun ? 'dry-run: ' : '') + autoSummary;
  saveState(state);

  let llmMeta = { final: '', summary: dryRun ? 'dry-run' : 'skipped (consolidate off)', error: null };
  if (!dryRun && consolidate) {
    try { llmMeta = await _runLLMReview(_buildLLMPrompt()); }
    catch (e) { llmMeta = { final: '', summary: 'error: ' + e.message, error: e.message }; }
  }

  const afterSkills = discoverSkills();
  const afterNames   = new Set(afterSkills.map(function(s) { return s.name; }));
  const removed      = beforeNames.filter(function(n) { return !afterNames.has(n); });
  const added        = afterNames.filter(function(n) { return !beforeNames.has(n); });
  const elapsed      = (Date.now() - start.getTime()) / 1000;

  const reportMd  = _renderReportMd({ startedAt: startIso, elapsedSeconds: elapsed, autoCounts: autoCounts, llmMeta: llmMeta });
  const metadata  = {
    startedAt: startIso, durationSeconds: elapsed, dryRun: dryRun, consolidate: consolidate,
    autoTransitions: autoCounts,
    beforeCount: beforeNames.size, afterCount: afterNames.size,
    delta: afterNames.size - beforeNames.size,
    removed: removed, added: added, llmMeta: llmMeta,
  };
  const reportPath = _writeRunReport(reportMd, metadata);

  const finalState = loadState();
  finalState.lastRunDurationSeconds = Math.round(elapsed * 100) / 100;
  finalState.lastRunSummary = autoSummary + (llmMeta.summary ? '; llm: ' + llmMeta.summary : '');
  finalState.lastReportPath = reportPath || null;
  saveState(finalState);

  return { startedAt: startIso, autoTransitions: autoCounts, summary: autoSummary, reportPath: reportPath, removed: removed, added: added, llmMeta: llmMeta };
}

// ── LLM prompt builder ─────────────────────────────────────────────────────────

const CONSOLIDATION_PROMPT = 'You are PURPCLAW\'s background skill curator. This is an UMBRELLA-BUILDING consolidation pass.\n\nGoal: transform the skill collection from narrow one-off entries into a LIBRARY OF CLASS-LEVEL INSTRUCTIONS.\n\nHard rules:\n1. DO NOT delete \u2014 archiving is the maximum destructive action.\n2. DO NOT touch pinned skills.\n3. DO NOT archive a skill with use=0 unless at least 30 days old AND genuinely obsolete.\n\nOutput:\n## Structured summary (required)\n```yaml\nconsolidations:\n  - from: <old-skill>\n    into: <umbrella>\n    reason: <short sentence>\nprunings:\n  - name: <skill>\n    reason: <short sentence>\n```';

function _buildLLMPrompt() {
  const skills = discoverSkills();
  if (!skills.length) return CONSOLIDATION_PROMPT + '\n\nNo skills to review.';
  const lines = ['Curator-managed skills (' + skills.length + '):\n'];
  for (const s of skills) {
    lines.push(
      '- ' + s.name + '  state=' + s.state + '  pinned=' + (s.pinned?'yes':'no') + '  ' +
      'cron=' + (s.isCronReferenced?'yes':'no') + '  use=' + s.useCount + '  ' +
      'last_activity=' + (s.lastActivityAt || 'never')
    );
  }
  return CONSOLIDATION_PROMPT + '\n\n' + lines.join('\n');
}

async function _runLLMReview(prompt) {
  const result = { final: '', summary: '', error: null };
  try {
    let llm = null;
    try { llm = require('./llm-provider'); } catch (_) {}
    if (!llm) try { llm = require('./model-router'); } catch (_) {}

    let response;
    if (llm && typeof llm.complete === 'function') {
      response = await llm.complete(prompt, {
        max_tokens: 4096, temperature: 0.3,
        system: 'You are a skilled library curator. Be concise and decisive.',
      });
      result.final = typeof response === 'string' ? response : JSON.stringify(response);
    } else {
      const http = require('http');
      const apiPort = parseInt(process.env.API_PORT || '7780', 10);
      response = await new Promise(function(resolve, reject) {
        const body = JSON.stringify({
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a skilled library curator. Be concise and decisive.' },
            { role: 'user',   content: prompt },
          ],
          max_tokens: 4096, temperature: 0.3,
        });
        const req = http.request({
          hostname: '127.0.0.1', port: apiPort,
          path: '/v1/chat/completions', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 120000,
        }, function(res) {
          let d = ''; res.on('data', function(c) { d += c; });
          res.on('end', function() {
            try { resolve(JSON.parse(d).choices[0].message.content || ''); }
            catch (_) { resolve(''); }
          });
        });
        req.on('error', reject); req.on('timeout', reject);
        req.write(body); req.end();
      });
      result.final = response || '';
    }
    result.summary = result.final.slice(0, 240).trim() || 'no change';
  } catch (e) {
    result.error  = e.message;
    result.summary = 'error: ' + e.message;
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 14 — shouldRunNow
// ════════════════════════════════════════════════════════════════════════════════

function shouldRunNow(now) {
  if (!isEnabled()) return false;
  if (isPaused())   return false;
  const state = loadState();
  const last  = _parseIso(state.lastRunAt);
  if (!last) {
    if (!now) now = new Date();
    try {
      const s = loadState();
      s.lastRunAt = now.toISOString();
      s.lastRunSummary = 'deferred first run \u2014 use `purpclaw curator run` to preview now';
      saveState(s);
    } catch (_) {}
    return false;
  }
  return _hoursSince(state.lastRunAt) >= getIntervalHours();
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 15 — MISC HELPERS
// ════════════════════════════════════════════════════════════════════════════════

function _copyDir(src, dest) {
  _fs.homeMkdirSync(dest, { recursive: true });
  for (const entry of _fs.homeReaddirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    let st;
    try { st = _fs.homeStatSync(s); } catch (_) { continue; }
    if (st.isDirectory()) _copyDir(s, d);
    else _fs.copyFileSync(s, d);
  }
}

function _deleteDir(dir) {
  if (!_fs.homeExistsSync(dir)) return;
  for (const entry of _fs.homeReaddirSync(dir)) {
    const full = path.join(dir, entry);
    let st;
    try { st = _fs.homeStatSync(full); } catch (_) { continue; }
    if (st.isDirectory()) _deleteDir(full);
    else _fs.homeUnlinkSync(full);
  }
  _fs.homeRmdirSync(dir);
}

function formatState(s) {
  const lines = [];
  lines.push('```');
  lines.push('  last run:       ' + (s.lastRunAt || '(never)'));
  lines.push('  duration:       ' + (s.lastRunDurationSeconds != null ? s.lastRunDurationSeconds + 's' : '(none)'));
  lines.push('  run count:     ' + (s.runCount || 0));
  lines.push('  paused:        ' + (s.paused ? 'yes' : 'no'));
  lines.push('  enabled:       ' + (isEnabled() ? 'yes' : 'no'));
  lines.push('  interval:      ' + getIntervalHours() + 'h');
  lines.push('  stale after:   ' + getStaleAfterDays() + ' days');
  lines.push('  archive after: ' + getArchiveAfterDays() + ' days');
  lines.push('  consolidate:   ' + (getConsolidate() ? 'yes' : 'no') + ' (default: off)');
  if (s.lastRunSummary) {
    lines.push('  last summary:');
    for (const line of (s.lastRunSummary || '').split('\n')) lines.push('    ' + line);
  }
  if (s.lastReportPath) lines.push('  last report:   ' + s.lastReportPath);
  lines.push('```');
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 16 — EXPORTS
// ════════════════════════════════════════════════════════════════════════════════

module.exports = {
  STATES,
  increment,
  getUsage,
  getTopUsed,
  resetUsage,
  bumpView,
  bumpPatch,
  review,
  approve,
  quarantine,
  reject,
  archiveSkill,
  restoreSkill,
  getState,
  setPinned,
  markSource,
  applyAutomaticTransitions,
  prune,
  getStats,
  getRecord,
  latestActivityAt,
  activityCount,
  isProtectedBuiltin,
  isCuratorEligible,
  provenance,
  discoverSkills,
  runCurator,
  shouldRunNow,
  loadState,
  saveState,
  isPaused,
  setPaused,
  isEnabled,
  getIntervalHours,
  getMinIdleHours,
  getStaleAfterDays,
  getArchiveAfterDays,
  getConsolidate,
  getAutoApproveDays,
  formatState,
  listArchived: function() {
    const root = _archiveDir();
    if (!_fs.homeExistsSync(root)) return [];
    try {
      return _fs.homeReaddirSync(root)
        .filter(function(e) { try { return _fs.homeStatSync(path.join(root, e)).isDirectory(); } catch (x) { return false; } })
        .sort();
    } catch (_) { return []; }
  },
  PROJECT_ROOT,
};
