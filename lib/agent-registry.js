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
const REGISTRY_PATH = path.join(ROOT, 'agents', 'AGENT_REGISTRY.json');

function normalizeAgent(a) {
  return {
    key: String(a.key || a.id || a.name || '').toLowerCase(),
    name: a.name || a.key || a.id,
    type: a.type || 'unknown',
    division: a.division || null,
    role: a.role || null,
    model: a.model || null,
    file: a.file || null,
    sources: a.sources || (a.file ? [a.file] : []),
  };
}

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    try {
      return require(path.join(ROOT, 'scripts', 'sync-agents.js')).build();
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
