'use strict';

/**
 * Canonical agent registry reader.
 *
 * The generated file is the stable machine surface. If it is missing during
 * development, fall back to the generator's in-memory build.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Candidate registry paths. Under Next's bundler __dirname is virtualized, so
// __dirname-relative resolution fails silently → empty roster. Try cwd too
// (the app + CLI both run from the repo root).
const REGISTRY_CANDIDATES = [
  path.join(ROOT, 'agents', 'AGENT_REGISTRY.json'),
  path.join(process.cwd(), 'agents', 'AGENT_REGISTRY.json'),
];
const REGISTRY_PATH = REGISTRY_CANDIDATES[0]; // primary (kept for external refs)

function normalizeAgent(a) {
  return {
    key: String(a.key || a.id || a.name || '').toLowerCase(),
    name: a.name || a.key || a.id,
    type: a.type || 'unknown',
    division: a.division || null,
    role: a.role || null,
    model: a.model || null,
    emoji: a.emoji || null,
    tier: typeof a.tier === 'number' ? a.tier : (a.tier != null ? parseInt(a.tier, 10) : null),
    file: a.file || null,
    sources: a.sources || (a.file ? [a.file] : []),
  };
}

function readRegistry() {
  for (const candidate of REGISTRY_CANDIDATES) {
    try { return JSON.parse(fs.readFileSync(candidate, 'utf8')); } catch { /* try next */ }
  }
  {
    try {
      return eval('require')(path.join(process.cwd(), 'scripts', 'sync-agents.js')).build();
    } catch {
      return {
        schema: 'purpclaw.agent-registry.v1',
        version: null,
        total: 0,
        agents: [],
      };
    }
  }
}

function listAgents() {
  const reg = readRegistry();
  return (reg.agents || []).map(normalizeAgent).filter(a => a.key);
}

function getAgent(id) {
  const key = String(id || '').toLowerCase();
  return listAgents().find(a => a.key === key || String(a.name || '').toLowerCase() === key) || null;
}

module.exports = { ROOT, REGISTRY_PATH, readRegistry, listAgents, getAgent };
