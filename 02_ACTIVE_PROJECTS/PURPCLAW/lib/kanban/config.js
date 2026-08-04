'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Minimal config loader for PURPCLAW.
 * Reads PURP_DIR/config.json or env-based overrides.
 *
 * Config schema:
 * {
 *   "purp_dir": "...",          // base directory for all purpclaw data
 *   "kanban": {
 *     "dispatch_in_gateway": true   // only one gateway runs the dispatcher
 *   }
 * }
 */

let _config = null;

function getDefaultPurpDir() {
  return path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.purpclaw');
}

function loadConfig() {
  const purpDir = process.env.PURP_DIR || getDefaultPurpDir();
  const configPath = path.join(purpDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    return { purp_dir: purpDir, kanban: { dispatch_in_gateway: true } };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      purp_dir: purpDir,
      kanban: { dispatch_in_gateway: true, ...(parsed.kanban || {}) },
      ...parsed,
    };
  } catch (err) {
    console.error(`[config] Failed to load ${configPath}: ${err.message}`);
    return { purp_dir: purpDir, kanban: { dispatch_in_gateway: true } };
  }
}

/**
 * Get the current config (cached).
 * @returns {object}
 */
function getConfig() {
  if (_config === null) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Reload config from disk (useful after config edits).
 * @returns {object}
 */
function reloadConfig() {
  _config = loadConfig();
  return _config;
}

/**
 * Save config to disk.
 * @param {object} cfg
 */
function saveConfig(cfg) {
  const purpDir = cfg.purp_dir || getDefaultPurpDir();
  const configPath = path.join(purpDir, 'config.json');
  const kanban = { dispatch_in_gateway: true, ...(cfg.kanban || {}) };
  const toSave = { ...cfg, kanban, purp_dir: purpDir };

  if (!fs.existsSync(purpDir)) {
    fs.mkdirSync(purpDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), 'utf8');
  _config = toSave;
}

/**
 * Get kanban config section.
 * @returns {{ dispatch_in_gateway: boolean }}
 */
function getKanbanConfig() {
  const cfg = getConfig();
  return cfg.kanban || { dispatch_in_gateway: true };
}

module.exports = {
  getConfig,
  reloadConfig,
  saveConfig,
  getKanbanConfig,
};
