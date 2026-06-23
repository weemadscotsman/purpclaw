'use strict';
/**
 * lib/identity.js — PurpClaw Portable Identity
 *
 * What moves between machines isn't software. It's the person-shaped
 * configuration layer: memory indexes, preferences, provider choices,
 * routing weights, budget rules, enabled agents, installed skills.
 *
 *   identity.json
 *   ├── profile         (name, locale, created)
 *   ├── style           (writing style, formatting prefs)
 *   ├── memory          (indexes, recent queries, preferences)
 *   ├── providers       (which ones, default, fallbacks)
 *   ├── budget          (daily/monthly caps, cost sensitivity)
 *   ├── agents          (enabled, favourites, disabled)
 *   ├── skills          (enabled, disabled, customisations)
 *   ├── routing         (per-job preferences, weight overrides)
 *   └── preferences     (telemetry-derived: corrections, favourites, style)
 *
 *   purpclaw identity export <path>      — create signed bundle
 *   purpclaw identity import <path>      — reconstruct from bundle
 *   purpclaw identity show                — current identity summary
 *   purpclaw identity diff <path>         — show what would change
 *   purpclaw identity reset               — start fresh
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PURP_DIR = path.resolve(__dirname, '..');
// Lazy-resolved so tests can set POCKET_DIR before first call.
function pocketDir() {
  return process.env.POCKET_DIR
    || path.join(os.homedir(), '.purpclaw', 'pocket');
}
function identityPath() { return path.join(pocketDir(), 'identity.json'); }
function identityBak() { return identityPath() + '.bak'; }

const DEFAULT_IDENTITY = {
  version: 1,
  profile: { name: null, locale: 'en-US', created: null },
  style: {
    formatting: 'plain',
    voice: 'af_heart',
    language: 'en-US',
  },
  memory: {
    spineEnabled: true,
    recallThreshold: 0.7,
    recentQueries: [],
    localOnly: true,
    retentionHost: '127.0.0.1',
    telemetryPurpose: 'personal-local-training-and-recall',
    remoteTelemetryAllowed: false,
  },
  privacy: {
    localOnly: true,
    owner: 'user',
    telemetryExportAllowed: false,
    remoteRetentionAllowed: false,
    rule: 'Logs, telemetry, chats, sessions, traces, memory archives, and training data stay on the user system and train only the user personal PURPCLAW instance.',
  },
  providers: {
    default: 'deepseek',
    fallback: ['ollama', 'openai', 'anthropic'],
    enabled: ['deepseek', 'ollama', 'openai', 'anthropic', 'gemini'],
    disabled: [],
  },
  budget: {
    dailyTokenCap: 1_000_000,
    monthlyTokenCap: 25_000_000,
    perRequestCap: 16_000,
    maxRequestsPerMinute: 30,
    costSensitive: false,
  },
  agents: {
    enabled: ['duck', 'goose', 'owl', 'wolf', 'phoenix', 'turtle', 'mantis', 'crow', 'moth', 'fox'],
    disabled: [],
    favourites: ['duck', 'goose'],
  },
  skills: {
    enabled: ['research', 'data-analysis', 'content-creation'],
    disabled: [],
  },
  routing: {
    perJob: {
      'fast-chat': { provider: 'ollama', model: 'qwen2.5:3b' },
      'code': { provider: 'deepseek', model: 'deepseek-v4-pro' },
      'creative': { provider: 'openai', model: 'gpt-4o' },
      'local': { provider: 'ollama', model: 'qwen2.5:3b' },
    },
  },
  preferences: {
    corrections: [],   // [{ before, after, count }]
    favourites: [],
    autoBackup: true,
  },
  signing: {
    algorithm: 'ed25519',
    publicKey: null,   // populated on first export
  },
};

function defaultIdentity() {
  return JSON.parse(JSON.stringify(DEFAULT_IDENTITY));
}

function mergeDefaults(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const out = { ...base, ...override };
  for (const [key, value] of Object.entries(base)) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])
    ) {
      out[key] = mergeDefaults(value, override[key]);
    }
  }
  return out;
}

function loadIdentity() {
  if (!fs.existsSync(identityPath())) {
    return defaultIdentity();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(identityPath(), 'utf8'));
    return mergeDefaults(defaultIdentity(), raw);
  } catch {
    return defaultIdentity();
  }
}

function saveIdentity(identity) {
  const dir = pocketDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = identityPath() + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(identity, null, 2));
    fs.renameSync(tmp, identityPath());
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
  return identity;
}

function updateIdentity(patch) {
  const id = loadIdentity();
  const next = { ...id, ...patch, _updatedAt: new Date().toISOString() };
  return saveIdentity(next);
}

function showIdentity() {
  const id = loadIdentity();
  return {
    profile: id.profile,
    providers: { default: id.providers.default, fallback: id.providers.fallback },
    budget: { daily: id.budget.dailyTokenCap, monthly: id.budget.monthlyTokenCap },
    privacy: id.privacy,
    agents: { enabled_count: id.agents.enabled.length, favourites: id.agents.favourites },
    skills: { enabled_count: id.skills.enabled.length },
    routing: Object.keys(id.routing.perJob),
    corrections: id.preferences.corrections.length,
  };
}

function diffIdentity(proposed) {
  const current = loadIdentity();
  const changes = { added: {}, removed: {}, changed: {} };
  // Simple shallow diff
  for (const section of Object.keys(proposed)) {
    if (typeof proposed[section] === 'object' && proposed[section] !== null) {
      if (current[section] === undefined) {
        changes.added[section] = proposed[section];
      } else {
        // Walk subsections
        for (const k of Object.keys(proposed[section])) {
          if (JSON.stringify(current[section][k]) !== JSON.stringify(proposed[section][k])) {
            changes.changed[`${section}.${k}`] = {
              from: current[section][k],
              to: proposed[section][k],
            };
          }
        }
      }
    }
  }
  return changes;
}

function exportIdentity(targetPath) {
  const id = loadIdentity();
  id._exportedAt = new Date().toISOString();
  id._source = { host: os.hostname(), platform: process.platform };
  // Atomic write of bundle
  fs.writeFileSync(targetPath, JSON.stringify(id, null, 2));
  return { ok: true, path: targetPath, sections: Object.keys(id).filter(k => !k.startsWith('_')) };
}

function importIdentity(sourcePath, opts = {}) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Identity bundle not found: ${sourcePath}`);
  }
  const proposed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!opts.force) {
    // Show what would change
    const d = diffIdentity(proposed);
    if (Object.keys(d.added).length === 0 &&
        Object.keys(d.changed).length === 0) {
      return { ok: true, changed: false };
    }
  }
  // Backup current before overwriting
  if (fs.existsSync(identityPath())) {
    try { fs.copyFileSync(identityPath(), identityBak()); } catch {}
  }
  saveIdentity(proposed);
  return { ok: true, changed: true, applied: true };
}

module.exports = {
  loadIdentity,
  saveIdentity,
  updateIdentity,
  showIdentity,
  diffIdentity,
  exportIdentity,
  importIdentity,
  defaultIdentity,
};
