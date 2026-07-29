'use strict';

/**
 * lib/runtime/provider-config.js — user-editable per-lane provider/model config.
 *
 * This is the layer that makes routing NOT hardcoded: the settings page writes
 * per-lane {provider, model} choices here, and the provider-router reads them.
 * Precedence at resolve time (provider-router.js):
 *
 *     env override  >  this user config  >  hardcoded lane default
 *
 * Then a capability check applies: if the chosen provider has no usable key,
 * the router falls back to a provider the user DOES have a key for, ending at
 * the local Ollama model (which always works offline).
 *
 * Storage: ~/.purpclaw/provider-config.json  (override: PROVIDER_CONFIG_PATH)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ponytail: one place resolves the config path, so `provider load/save`, the
// settings page and the router all agree. OPENCLAUDE_CONFIG_DIR relocates the
// whole config dir (upstream openclaude convention) — required so tests can
// point at a temp dir instead of the user's real ~/.purpclaw.
function configPath() {
  return process.env.PROVIDER_CONFIG_PATH
    || (process.env.OPENCLAUDE_CONFIG_DIR
      ? path.join(process.env.OPENCLAUDE_CONFIG_DIR, 'provider-config.json')
      : path.join(os.homedir(), '.purpclaw', 'provider-config.json'));
}

function load() {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (!c.lanes) c.lanes = {};
    return c;
  } catch {
    return { lanes: {} };
  }
}

function save(cfg) {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, p);
  return cfg;
}

/** Get the user override for one lane, e.g. { provider, model } (may be empty). */
function getLane(laneName) {
  return (load().lanes || {})[laneName] || {};
}

/** Set/merge a user override for one lane. Pass null/'' to a field to clear it. */
function setLane(laneName, { provider, model } = {}) {
  const c = load();
  c.lanes = c.lanes || {};
  const cur = c.lanes[laneName] || {};
  const next = { ...cur };
  if (provider !== undefined) { if (provider) next.provider = provider; else delete next.provider; }
  if (model !== undefined) { if (model) next.model = model; else delete next.model; }
  c.lanes[laneName] = next;
  return save(c);
}

module.exports = { configPath, load, save, getLane, setLane };
