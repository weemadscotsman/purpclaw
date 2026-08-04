'use strict';
/**
 * lib/marketplace.js — PURPCLAW marketplace engine
 *
 * Manages installable skill/agent packages from local dirs, git repos, and URLs.
 * Registry stored in ~/.purpclaw/marketplace/manifest.toml
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const MARKETPLACE_DIR = (() => {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, '.purpclaw', 'marketplace');
})();
const MANIFEST_FILE = path.join(MARKETPLACE_DIR, 'manifest.toml');
const SOURCES_FILE = path.join(MARKETPLACE_DIR, 'sources.toml');

// ── Minimal TOML helpers (same style as credentials-store.js) ────────────────────

function parseToml(raw) {
  const result = {};
  let currentSection = null;
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    let value = line.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    const key = line.slice(0, eqIdx).trim();
    if (currentSection) result[currentSection][key] = value;
  }
  return result;
}

function serializeToml(obj) {
  const sections = Object.keys(obj).sort();
  const lines = ['# PURPCLAW marketplace manifest', ''];
  for (const section of sections) {
    lines.push('[' + section + ']');
    const keys = Object.keys(obj[section]).sort();
    for (const key of keys) {
      const value = String(obj[section][key] ?? '');
      const needsQuote = /[\s'"#=]/.test(value) || value === '';
      lines.push('  ' + key + ' = ' + (needsQuote ? JSON.stringify(value) : value));
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── Manifest CRUD ──────────────────────────────────────────────────────────────

function loadManifest() {
  try {
    if (!fs.existsSync(MANIFEST_FILE)) return {};
    return parseToml(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
  } catch { return {}; }
}

function saveManifest(data) {
  fs.mkdirSync(MARKETPLACE_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, serializeToml(data), 'utf-8');
}

// ── Sources CRUD ───────────────────────────────────────────────────────────────

function loadSources() {
  try {
    if (!fs.existsSync(SOURCES_FILE)) return [];
    const raw = fs.readFileSync(SOURCES_FILE, 'utf-8');
    const obj = parseToml(raw);
    return Object.values(obj).map(s => s.url).filter(Boolean);
  } catch { return []; }
}

function saveSources(urls) {
  fs.mkdirSync(MARKETPLACE_DIR, { recursive: true });
  const data = {};
  urls.forEach((url, i) => { data['source_' + i] = { url }; });
  const lines = ['# PURPCLAW marketplace sources', ''];
  Object.keys(data).sort().forEach(key => {
    lines.push('[' + key + ']');
    lines.push('  url = ' + JSON.stringify(data[key].url));
    lines.push('');
  });
  fs.writeFileSync(SOURCES_FILE, lines.join('\n'), 'utf-8');
}

// ── Package helpers ────────────────────────────────────────────────────────────

function normalizeSourceType(source) {
  if (source.startsWith('git+') || source.includes('://github.com') || source.endsWith('.git')) return 'git';
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  return 'local';
}

function detectType(sourcePath) {
  // Check if it looks like a skills dir or an agents dir
  try {
    const skillsDir = path.join(sourcePath, 'skills');
    const agentsDir = path.join(sourcePath, 'agents');
    if (fs.existsSync(skillsDir) && fs.existsSync(agentsDir)) return 'both';
    if (fs.existsSync(skillsDir)) return 'skill';
    if (fs.existsSync(agentsDir)) return 'agent';
  } catch { /* ignore */ }
  return 'skill'; // default to skill
}

function timestamp() {
  return new Date().toISOString();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all installed packages.
 * @returns {Array<{name, version, type, source, installed_at, source_type}>}
 */
function listInstalled() {
  const manifest = loadManifest();
  return Object.entries(manifest).map(([name, pkg]) => ({
    name,
    version: pkg.version || '0.0.0',
    type: pkg.type || 'skill',
    source: pkg.source || '',
    installed_at: pkg.installed_at || '',
    source_type: pkg.source_type || 'local',
  }));
}

/**
 * Install a package from a source.
 * @param {string} name - display name for the package
 * @param {string} source - local path, git URL, or https URL
 * @param {'skill'|'agent'|'both'} type
 * @param {'local'|'git'|'url'} sourceType
 * @returns {{ok: boolean, name: string, message: string}}
 */
function addPackage(name, source, type, sourceType) {
  const manifest = loadManifest();
  if (manifest[name]) {
    return { ok: false, name, message: `Package '${name}' is already installed. Use 'update' to refresh.` };
  }

  const resolvedType = type || detectType(source) || 'skill';
  const resolvedSourceType = sourceType || normalizeSourceType(source);

  // For local sources, verify the path exists
  if (resolvedSourceType === 'local') {
    if (!fs.existsSync(source)) {
      return { ok: false, name, message: `Local source not found: ${source}` };
    }
  }

  manifest[name] = {
    version: '0.0.0',
    type: resolvedType,
    source,
    installed_at: timestamp(),
    source_type: resolvedSourceType,
  };

  saveManifest(manifest);
  return { ok: true, name, message: `Package '${name}' installed from ${source}` };
}

/**
 * Remove a package from the manifest.
 * @param {string} name
 * @param {{removeFiles?: boolean}} opts
 * @returns {{ok: boolean, name: string, message: string}}
 */
function removePackage(name, opts = {}) {
  const manifest = loadManifest();
  if (!manifest[name]) {
    return { ok: false, name, message: `Package '${name}' is not installed.` };
  }

  // Optionally remove installed files (under ~/.purpclaw/marketplace/packages/<name>/)
  if (opts.removeFiles) {
    const pkgDir = path.join(MARKETPLACE_DIR, 'packages', name);
    try {
      if (fs.existsSync(pkgDir)) {
        fs.rmSync(pkgDir, { recursive: true });
      }
    } catch (e) { /* ignore removal errors */ }
  }

  delete manifest[name];
  saveManifest(manifest);
  return { ok: true, name, message: `Package '${name}' removed.` };
}

/**
 * Update a package by re-fetching from its source.
 * For local sources this just refreshes the manifest timestamp.
 * For git sources, runs `git pull`.
 * @param {string} name
 * @returns {{ok: boolean, name: string, message: string}}
 */
function updatePackage(name) {
  const manifest = loadManifest();
  if (!manifest[name]) {
    return { ok: false, name, message: `Package '${name}' is not installed.` };
  }

  const pkg = manifest[name];
  manifest[name].installed_at = timestamp();
  saveManifest(manifest);

  let msg = `Package '${name}' updated (manifest refreshed).`;
  if (pkg.source_type === 'git') {
    try {
      const pkgDir = path.join(MARKETPLACE_DIR, 'packages', name);
      if (fs.existsSync(path.join(pkgDir, '.git'))) {
        execSync('git pull', { cwd: pkgDir, stdio: 'pipe' });
        msg = `Package '${name}' updated via git pull.`;
      } else {
        msg = `Package '${name}' updated (git repo not found locally, source: ${pkg.source}).`;
      }
    } catch (e) {
      msg = `Package '${name}' updated manifest, but git pull failed: ${e.message}`;
    }
  }

  return { ok: true, name, message: msg };
}

/**
 * Search installed packages (stub: searches local manifest by name/type).
 * @param {string} query
 * @returns {Array}
 */
function searchPackages(query) {
  const q = query.toLowerCase();
  return listInstalled().filter(pkg =>
    pkg.name.toLowerCase().includes(q) ||
    pkg.type.toLowerCase().includes(q) ||
    pkg.source.toLowerCase().includes(q)
  );
}

/**
 * List configured source registries.
 * @returns {string[]}
 */
function listSources() {
  return loadSources();
}

/**
 * Add a source registry URL.
 * @param {string} url
 * @returns {{ok: boolean, url: string, message: string}}
 */
function addSource(url) {
  const sources = loadSources();
  if (sources.includes(url)) {
    return { ok: false, url, message: 'Source already registered.' };
  }
  sources.push(url);
  saveSources(sources);
  return { ok: true, url, message: `Source '${url}' added.` };
}

/**
 * Remove a source registry URL.
 * @param {string} url
 * @returns {{ok: boolean, url: string, message: string}}
 */
function removeSource(url) {
  const sources = loadSources();
  const idx = sources.indexOf(url);
  if (idx === -1) {
    return { ok: false, url, message: 'Source not found.' };
  }
  sources.splice(idx, 1);
  saveSources(sources);
  return { ok: true, url, message: `Source '${url}' removed.` };
}

module.exports = {
  listInstalled,
  addPackage,
  removePackage,
  updatePackage,
  searchPackages,
  listSources,
  addSource,
  removeSource,
};
