'use strict';

const PURP_PATHS = require('./paths');
/**
 * system-manifest.js — THE SINGLE SOURCE OF TRUTH.
 *
 * Every part of the build (CLI, daemons, agents, UI) can ask one place
 * "what services/tools/lanes/agents exist and how do I use them?" instead of
 * each component carrying its own drifting copy.
 *
 * It does NOT duplicate data — it re-reads the canonical sources live:
 *   - services & ports  ← service_registry.js
 *   - tools             ← lib/tools (the auto-registered native+skill registry)
 *   - provider lanes    ← lib/runtime/provider-router (resolveLane)
 *   - agents/divisions  ← agents/AGENT_REGISTRY.json
 *
 * Every source is wrapped so a missing/broken one degrades gracefully instead
 * of taking down the whole manifest.
 */

const path = require('path');
const ROOT = path.dirname(__dirname); // repo root (this file lives in lib/)

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

// ── Services & ports (authoritative: service_registry.js) ──
function getServices() {
  const reg = safe(() => eval('require')(path.join(ROOT, 'service_registry')), null);
  if (!reg || !Array.isArray(reg.SERVICES)) return [];
  return reg.SERVICES.map(s => ({
    key: s.key, name: s.name, pm2: s.pm2, group: s.group,
    port: s.port,
    healthPort: s.healthPort ?? s.port,
    health: s.healthPath,
    required: !!s.required,
    note: s.note || null,
  }));
}

// ── Tools (authoritative: lib/tools registry, auto-registered on require) ──
function getTools() {
  const reg = safe(() => require('./tools'), null);
  const list = reg && typeof reg.list === 'function' ? safe(() => reg.list(), []) : [];
  return (list || []).map(t => ({ name: t.name, description: t.description || '', aliases: t.aliases || [] }));
}

// ── Provider lanes (authoritative: provider-router + provider-config.json) ──
const LANE_NAMES = ['PRIMARY_CHAT', 'PRIMARY_TOOL', 'PRIMARY_DELEGATION', 'CODE', 'SWARM', 'DIVISION', 'REASONING', 'FALLBACK', 'LOCAL', 'PRIVATE_MODE'];
function getLanes() {
  const os = require('os'), fs = require('fs');
  const cfgPath = path.join(PURP_PATHS.DATA_ROOT, 'provider-config.json');
  const cfg = safe(() => JSON.parse(fs.readFileSync(cfgPath, 'utf8')), null);
  const lanes = (cfg && cfg.lanes) || {};
  const out = {};
  for (const lane of LANE_NAMES) {
    const l = lanes[lane];
    out[lane] = (l && l.provider)
      ? { provider: l.provider, model: l.model || null, source: 'provider-config.json' }
      : { provider: null, model: null, source: 'code-default' };
  }
  return out;
}

// ── Agents / divisions (authoritative: agents/AGENT_REGISTRY.json) ──
function getAgents() {
  const reg = safe(() => require('./agent-registry'), null);
  const agents = reg && typeof reg.listAgents === 'function' ? safe(() => reg.listAgents(), []) : [];
  return agents.map(a => ({
    key: a.key,
    name: a.name,
    type: a.type,
    division: a.division || null,
    role: a.role || null,
    model: a.model || null,
    file: a.file || null,
  }));
}

/**
 * The full manifest — one object describing the entire system.
 * `as_of` is stamped by the caller (pass a timestamp) to keep this pure.
 */
function getManifest(as_of = null) {
  const services = getServices();
  const tools = getTools();
  const agents = getAgents();
  const lanes = getLanes();
  return {
    as_of,
    root: ROOT,
    services, serviceCount: services.length,
    tools, toolCount: tools.length,
    lanes,
    agents, agentCount: agents.length,
  };
}

module.exports = { getManifest, getServices, getTools, getLanes, getAgents, LANE_NAMES, ROOT };
