'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_FILE = 'purpclaw.toml';

/**
 * TOML parser — minimal, covers the schema in init-project.js.
 * Supports: [section], key = value, arrays, inline strings.
 * Does NOT support: nested tables, multi-line values, dates.
 */
function parseToml(text) {
  const result = {};
  let currentSection = null;

  for (let line of text.split(/\r?\n/)) {
    line = line.trim();

    // Skip blank / comment
    if (!line || line.startsWith('#')) continue;

    // Section header: [section.name]
    const secMatch = line.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1];
      const parts = currentSection.split('.');
      let obj = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      continue;
    }

    // Key = value
    const kvMatch = line.match(/^(\S+)\s*=\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let val = kvMatch[2].trim();

      // Unquote
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Array
      else if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(v => {
          v = v.trim();
          if ((v.startsWith('"') && v.endsWith('"')) ||
              (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          return v;
        });
      }
      // Boolean / number passthrough
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);

      if (currentSection) {
        const parts = currentSection.split('.');
        let obj = result;
        for (let i = 0; i < parts.length; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          if (i === parts.length - 1) obj[parts[i]][key] = val;
          obj = obj[parts[i]];
        }
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

/**
 * Walk upward from `startDir` looking for purpclaw.toml.
 * Returns parsed config or null.
 */
function loadProjectConfig(startDir) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const tomlPath = path.join(dir, PROJECT_FILE);
    try {
      if (fs.existsSync(tomlPath)) {
        const text = fs.readFileSync(tomlPath, 'utf8');
        const cfg = parseToml(text);
        return { path: tomlPath, dir, config: cfg };
      }
    } catch (_) {}

    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Check if a path should be ignored per project config.
 * Returns true if ignored.
 */
function isIgnored(relativePath, config) {
  if (!config || !config.project || !config.project.ignores) return false;
  const patterns = config.project.ignores.paths || [];
  for (const pat of patterns) {
    // Simple glob: paths ending in / match directories
    // * at end matches anything
    if (pat.endsWith('/')) {
      const dir = pat.slice(0, -1);
      if (relativePath.startsWith(dir + '/') || relativePath === dir) return true;
    } else if (pat.startsWith('*.')) {
      const ext = pat.slice(1);
      if (relativePath.endsWith(ext)) return true;
    } else if (relativePath === pat || relativePath.includes(pat)) {
      return true;
    }
  }
  return false;
}

/**
 * Get agent config for this project.
 * Returns { name, model, provider } or null.
 */
function getAgentConfig(config) {
  if (!config || !config.project || !config.project.agent) return null;
  return config.project.agent;
}

/**
 * Get tool permission for a path.
 * Returns 'read-write', 'read-only', or 'forbidden'.
 */
function getToolPermission(filePath, config) {
  if (!config || !config.project || !config.project['tool-permissions']) return 'read-write';
  const perms = config.project['tool-permissions'];
  for (const [pattern, perm] of Object.entries(perms)) {
    if (pattern === '*') continue; // default fallback
    if (filePath.includes(pattern.replace(/\*\*/g, '').replace(/\*/g, ''))) {
      return perm;
    }
  }
  return perms['*'] || 'read-write';
}

module.exports = {
  loadProjectConfig,
  isIgnored,
  getAgentConfig,
  getToolPermission,
  parseToml,  // exposed for test
};
