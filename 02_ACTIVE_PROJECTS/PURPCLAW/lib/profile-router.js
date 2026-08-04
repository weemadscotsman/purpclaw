'use strict';

/**
 * lib/profile-router.js — Profile Routing
 * Port of Hermes gateway/profile_routing.py
 *
 * One gateway serves multiple isolated profiles. Routes inbound messages
 * to different profiles based on platform/guild/chat/thread.
 *
 * Source shape: { platform, chat_id, thread_id, guild_id, user_id, chat_type }
 * Profile = dir under PURP_DIR/profiles/<name>/ with own MEMORY.md, USER.md, SOUL.md, sessions/
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PURP_DIR  = process.env.PURP_DIR || path.join(os.homedir(), '.purpclaw');
const PROFILES_DIR = path.join(PURP_DIR, 'profiles');
const ROUTES_FILE  = path.join(PURP_DIR, 'profiles', 'profiles.json');

const WEIGHTS = { thread: 8, chat: 4, guild: 2, platform: 0 };

function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

// ── Profile Management ────────────────────────────────────────────────────────

/**
 * List all profiles.
 * @returns {{ name, path, hasMemory, hasSoul, hasUser }[]}
 */
function listProfiles() {
  ensureProfilesDir();
  const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const p = path.join(PROFILES_DIR, e.name);
      return {
        name: e.name,
        path: p,
        hasMemory: fs.existsSync(path.join(p, 'MEMORY.md')),
        hasSoul:   fs.existsSync(path.join(p, 'SOUL.md')),
        hasUser:   fs.existsSync(path.join(p, 'USER.md')),
        hasSessions: fs.existsSync(path.join(p, 'sessions')),
        hasSkills:   fs.existsSync(path.join(p, 'skills')),
      };
    });
}

/**
 * Get the active profile name (from profiles.json).
 */
function getActiveProfile() {
  try {
    const routes = _loadRoutes();
    return routes.active_profile || 'default';
  } catch { return 'default'; }
}

/**
 * Switch active profile.
 */
function setActiveProfile(name) {
  const profiles = listProfiles();
  if (!profiles.find(p => p.name === name)) {
    throw new Error(`Profile '${name}' does not exist`);
  }
  const routes = _loadRoutes();
  routes.active_profile = name;
  _saveRoutes(routes);
  return name;
}

/**
 * Create a new profile directory.
 * @returns {string} profile path
 */
function createProfile(name, cloneFrom = null) {
  if (/[^a-z0-9_-]/i.test(name)) throw new Error('Profile name must be alphanumeric');
  const profilePath = path.join(PROFILES_DIR, name);
  if (fs.existsSync(profilePath)) throw new Error(`Profile '${name}' already exists`);

  fs.mkdirSync(profilePath, { recursive: true });

  // Clone if requested
  if (cloneFrom) {
    const src = path.join(PROFILES_DIR, cloneFrom);
    if (fs.existsSync(src)) {
      for (const f of ['MEMORY.md', 'USER.md', 'SOUL.md', 'skills']) {
        const srcF = path.join(src, f);
        if (fs.existsSync(srcF)) {
          const destF = path.join(profilePath, f);
          if (fs.statSync(srcF).isDirectory()) {
            _copyDir(srcF, destF);
          } else {
            fs.copyFileSync(srcF, destF);
          }
        }
      }
    }
  }

  return profilePath;
}

function _copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) _copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── Route Management ──────────────────────────────────────────────────────────

/**
 * Get all profile routes.
 * @returns {object} routes config
 */
function getRoutes() {
  return _loadRoutes();
}

/**
 * Add or update a route.
 * @param {object} route - { name, platform, guild_id, chat_id, thread_id, profile, enabled }
 */
function addRoute(route) {
  const routes = _loadRoutes();
  const idx = routes.profile_routes.findIndex(r => r.name === route.name);
  if (idx >= 0) routes.profile_routes[idx] = route;
  else routes.profile_routes.push(route);
  _saveRoutes(routes);
  return route;
}

/**
 * Remove a route by name.
 */
function removeRoute(name) {
  const routes = _loadRoutes();
  routes.profile_routes = routes.profile_routes.filter(r => r.name !== name);
  _saveRoutes(routes);
}

function _loadRoutes() {
  try {
    if (fs.existsSync(ROUTES_FILE)) {
      return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    }
  } catch {}
  return { active_profile: 'default', profile_routes: [] };
}

function _saveRoutes(routes) {
  ensureProfilesDir();
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
}

// ── Core Matching ─────────────────────────────────────────────────────────────

/**
 * Match a source against all routes. Returns the most specific match.
 * Conjunctive: ALL declared fields must match. Hierarchical specificity.
 *
 * @param {object} source - { platform, chat_id, thread_id, guild_id }
 * @returns {{ route, score, profile } | null}
 */
function match(source) {
  const routes = _loadRoutes().profile_routes.filter(r => r.enabled !== false);
  let best = null;

  for (const route of routes) {
    const score = _matchScore(route, source);
    if (score < 0) continue; // no match
    if (!best || score > best.score) best = { route, score, profile: route.profile };
  }

  return best || null;
}

function _matchScore(route, source) {
  // Conjunctive: ALL declared fields must match
  if (route.thread_id && source.thread_id !== route.thread_id) return -1;
  if (route.chat_id && source.chat_id !== route.chat_id) return -1;
  if (route.guild_id && source.guild_id !== route.guild_id) return -1;
  if (route.platform && source.platform !== route.platform) return -1;

  // Specificity = sum of weights for matched discriminators
  let score = 0;
  if (route.thread_id) score += WEIGHTS.thread;
  else if (route.chat_id) score += WEIGHTS.chat;
  else if (route.guild_id) score += WEIGHTS.guild;
  else score += WEIGHTS.platform;
  return score;
}

// ── Source Helpers ────────────────────────────────────────────────────────────

/**
 * Build session key from source (same logic as session-store).
 * Format: agent:main:{platform}:{chat_type}[:{chat_id}][:{thread_id}]
 */
function buildSourceKey(source) {
  const parts = ['agent', 'main', source.platform || 'local', source.chat_type || 'dm'];
  if (source.chat_id) parts.push(source.chat_id);
  if (source.thread_id) parts.push(source.thread_id);
  return parts.join(':');
}

/**
 * Get profile dir for a given source.
 * Priority: matched route > active profile > 'default'
 */
function profileForSource(source) {
  const matched = match(source);
  if (matched) return path.join(PROFILES_DIR, matched.profile);
  const active = getActiveProfile();
  return path.join(PROFILES_DIR, active);
}

// ── CLI Helpers ─────────────────────────────────────────────────────────────

function cliListProfiles() {
  const profiles = listProfiles();
  const active = getActiveProfile();
  let out = `Profiles (${profiles.length}):\n`;
  for (const p of profiles) {
    const marker = p.name === active ? ' [ACTIVE]' : '';
    out += `  ${p.name}${marker}\n`;
    out += `    memory=${p.hasMemory} soul=${p.hasSoul} user=${p.hasUser} sessions=${p.hasSessions}\n`;
  }
  return out;
}

function cliListRoutes() {
  const routes = _loadRoutes().profile_routes;
  let out = `Routes (${routes.length}):\n`;
  for (const r of routes) {
    const enabled = r.enabled !== false ? 'enabled' : 'disabled';
    out += `  [${enabled}] ${r.name} → ${r.profile}\n`;
    const parts = [];
    if (r.platform)  parts.push(`platform=${r.platform}`);
    if (r.guild_id) parts.push(`guild=${r.guild_id}`);
    if (r.chat_id)   parts.push(`chat=${r.chat_id}`);
    if (r.thread_id) parts.push(`thread=${r.thread_id}`);
    out += `    match: ${parts.join(', ') || 'platform only'}\n`;
  }
  return out;
}

function cliTestRoute(platform, chatId, threadId, guildId) {
  const src = { platform, chat_id: chatId, thread_id: threadId, guild_id: guildId };
  const result = match(src);
  if (result) return `Match: ${result.route.name} (score=${result.score}) → profile '${result.profile}'`;
  return `No match — falls back to active profile: '${getActiveProfile()}'`;
}

module.exports = {
  // Profile CRUD
  listProfiles,
  createProfile,
  getActiveProfile,
  setActiveProfile,
  profileForSource,

  // Route management
  getRoutes,
  addRoute,
  removeRoute,

  // Core matching
  match,
  buildSourceKey,

  // CLI helpers
  cliListProfiles,
  cliListRoutes,
  cliTestRoute,
  PROFILES_DIR,
};
