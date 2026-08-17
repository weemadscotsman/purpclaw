'use strict';

/**
 * Canonical agent registry reader.
 *
 * The generated file is the stable machine surface. If it is missing during
 * development, fall back to the generator's in-memory build.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
// Candidate registry paths. Under Next's bundler __dirname is virtualized, so
// __dirname-relative resolution fails silently → empty roster. Try cwd too
// (the app + CLI both run from the repo root).
const REGISTRY_CANDIDATES = [
  path.join(ROOT, 'agents', 'AGENT_REGISTRY.json'),
  path.join(process.cwd(), 'agents', 'AGENT_REGISTRY.json'),
  path.join(ROOT, 'packages', 'organisation', 'agents', 'agents', 'AGENT_REGISTRY.json'),
  path.join(process.cwd(), 'packages', 'organisation', 'agents', 'agents', 'AGENT_REGISTRY.json'),
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

// --- persona md scan fallback (2026-08-17 integration) ---
// If the JSON registry is missing or empty, scan agent_work/agents/root/*.md
// for yaml-frontmatter personas. This is the path the swarm/dispatcher
// hits in dev when the generated AGENT_REGISTRY.json is stale.
const PERSONA_DIR_CANDIDATES = [
  path.join(ROOT, 'agent_work', 'agents', 'root'),
  path.join(process.cwd(), 'agent_work', 'agents', 'root'),
  path.join(ROOT, 'agents'),
  path.join(process.cwd(), 'agents'),
];

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return null;
  const end = md.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = md.slice(3, end);
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (m) {
      const v = m[2].trim();
      // strip surrounding quotes if present
      out[m[1]] = v.replace(/^["'](.*)["']$/, '$1');
    }
  }
  return out;
}

function scanPersonaFiles() {
  for (const dir of PERSONA_DIR_CANDIDATES) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { continue; }
    const personas = [];
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      const full = path.join(dir, f);
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      const fm = parseFrontmatter(content);
      if (!fm || !fm.name) continue;
      const key = path.basename(f, '.md');
      personas.push({
        key,
        name: fm.name,
        type: 'persona',
        division: 'ENGINEERING',
        role: (fm.description || '').slice(0, 80),
        model: fm.model || null,
        emoji: null,
        tier: null,
        file: f,
        sources: [f],
      });
    }
    if (personas.length > 0) {
      return {
        schema: 'purpclaw.agent-registry.v1',
        version: 'persona-md-scan',
        total: personas.length,
        agents: personas,
      };
    }
  }
  return null;
}

function readRegistry() {
  for (const candidate of REGISTRY_CANDIDATES) {
    try { return JSON.parse(fs.readFileSync(candidate, 'utf8')); } catch { /* try next */ }
  }
  // 2026-08-17: persona-md fallback before sync-agents script
  const mdScan = scanPersonaFiles();
  if (mdScan) return mdScan;
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
