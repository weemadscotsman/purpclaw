'use strict';

/**
 * lib/agents/archetypes.js — Agent Archetype Loader
 *
 * Loads archetypes from agents/archetypes.toml.
 * Provides: list, get, spawn, validate.
 *
 * Archetypes: default, code, research, security, data, ops, creative,
 *             api, mobile, frontend, qa, db, devrel, product, review,
 *             architect, autonomy, monitoring, investigate
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ARCHETYPES_FILE = path.join(__dirname, '..', '..', 'agents', 'archetypes.toml');
const PURP_DIR = process.env.PURP_DIR || path.join(os.homedir(), '.purpclaw');
const ARCHETYPES_CACHE = path.join(PURP_DIR, 'archetypes-cache.json');

let _cache = null;

/**
 * Parse TOML manually — handles only the sections we define.
 */
function parseTOML(content) {
  const result = {};
  let currentSection = null;
  let currentKey = null;

  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();

    // Section header: [archetype.name]
    const secMatch = line.match(/^\[archetype\.(\w+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1];
      result[currentSection] = {};
      currentKey = null;
      continue;
    }

    if (!currentSection) continue;

    // Skip comments and blank
    if (line.startsWith('#') || !line) continue;

    // Key = value (string, boolean, number, array)
    const kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (kvMatch) {
      const [, key, rawVal] = kvMatch;
      result[currentSection][key] = parseTOMLValue(rawVal.trim());
      currentKey = key;
      continue;
    }
  }

  return result;
}

function parseTOMLValue(v) {
  v = v.trim();
  if (v === 'true')  return true;
  if (v === 'false') return false;
  if (v === 'null')  return null;
  // Quoted string
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  // Array
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(s => {
      s = s.trim();
      if (s === 'true') return true;
      if (s === 'false') return false;
      if (/^-?\d+$/.test(s)) return parseInt(s, 10);
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
        return s.slice(1, -1);
      return s;
    });
  }
  // Number
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  return v;
}

function loadArchetypes(forceReload = false) {
  if (_cache && !forceReload) return _cache;

  if (!fs.existsSync(ARCHETYPES_FILE)) {
    _cache = {};
    return _cache;
  }

  const content = fs.readFileSync(ARCHETYPES_FILE, 'utf8');
  const parsed  = parseTOML(content);

  // Wrap in archetype namespace
  _cache = {};
  for (const [name, data] of Object.entries(parsed)) {
    _cache[name] = { name, ...data };
  }

  return _cache;
}

function listArchetypes() {
  const archetypes = loadArchetypes();
  return Object.entries(archetypes).map(([name, data]) => ({
    name,
    description: data.description || '',
    tools:       data.tools       || [],
    capabilities: data.capabilities || [],
    restricted:  !!data.restricted,
    autonomous: !!data.autonomous,
  }));
}

function getArchetype(name) {
  const archetypes = loadArchetypes();
  return archetypes[name] || null;
}

function validateArchetype(name) {
  const a = getArchetype(name);
  if (!a) return { valid: false, errors: [`Archetype '${name}' not found`] };

  const errors = [];
  if (!a.description) errors.push('missing description');
  if (!a.tools || !a.tools.length) errors.push('missing tools');
  if (!a.model_preference) errors.push('missing model_preference');
  if (!a.system_instructions) errors.push('missing system_instructions');

  return { valid: errors.length === 0, errors };
}

function spawnConfig(archetypeName, overrides = {}) {
  const a = getArchetype(archetypeName);
  if (!a) throw new Error(`Unknown archetype: ${archetypeName}`);

  return {
    archetype:   archetypeName,
    tools:       overrides.tools       || a.tools       || [],
    model:       overrides.model       || a.model_preference || null,
    temperature: overrides.temperature !== undefined ? overrides.temperature : (a.temperature || 0.7),
    maxTokens:   overrides.maxTokens   || a.max_context_tokens || 180000,
    system:      overrides.system      || a.system_instructions || '',
    capabilities: a.capabilities       || [],
    restricted:  a.restricted         || false,
    autonomous:  a.autonomous         || false,
  };
}

/**
 * Search archetypes by keyword (name, description, capability).
 */
function searchArchetypes(query) {
  const q = query.toLowerCase();
  const archetypes = loadArchetypes();
  return Object.entries(archetypes)
    .filter(([name, a]) => {
      return name.includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        (a.capabilities || []).some(c => c.toLowerCase().includes(q));
    })
    .map(([name, a]) => ({ name, description: a.description, capabilities: a.capabilities || [] }));
}

function getAllTools() {
  const archetypes = loadArchetypes();
  const toolSet = new Set();
  for (const a of Object.values(archetypes)) {
    for (const t of (a.tools || [])) toolSet.add(t);
  }
  return [...toolSet].sort();
}

// ── CLI dump ────────────────────────────────────────────────────────────────

function cliList() {
  const list = listArchetypes();
  const cols = process.stdout.columns || 80;
  console.log(`\n${list.length} archetypes:\n`);
  for (const a of list) {
    const tools = (a.tools || []).slice(0, 4).join(', ');
    const rest  = (a.tools || []).length > 4 ? ` +${(a.tools || []).length - 4}` : '';
    const flags  = [a.restricted ? '[SECURITY]' : '', a.autonomous ? '[AUTO]' : ''].filter(Boolean).join(' ');
    console.log(`  ${a.name.padEnd(14)} ${a.description}`.slice(0, cols - 1));
    console.log(`    tools: ${tools}${rest} ${flags}`);
    console.log('');
  }
}

function cliShow(name) {
  const a = getArchetype(name);
  if (!a) { console.log(`Unknown archetype: ${name}`); return; }
  console.log(`\n## ${name}`);
  console.log(`  ${a.description || '(no description)'}`);
  console.log(`  model:     ${a.model_preference || 'default'}`);
  console.log(`  temp:      ${a.temperature || 0.7}`);
  console.log(`  maxTokens: ${a.max_context_tokens || 180000}`);
  console.log(`  tools (${(a.tools||[]).length}):`);
  for (const t of (a.tools || [])) console.log(`    - ${t}`);
  console.log(`  capabilities (${(a.capabilities||[]).length}):`);
  for (const c of (a.capabilities || [])) console.log(`    - ${c}`);
  if (a.restricted)  console.log('  [SECURITY RESTRICTED]');
  if (a.autonomous)  console.log('  [AUTONOMOUS]');
  console.log('');
}

module.exports = {
  loadArchetypes,
  listArchetypes,
  getArchetype,
  validateArchetype,
  spawnConfig,
  searchArchetypes,
  getAllTools,
  cliList,
  cliShow,
};
