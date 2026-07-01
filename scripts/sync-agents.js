#!/usr/bin/env node
'use strict';

/**
 * sync-agents.js - build the canonical PURPCLAW agent registry.
 *
 * Runtime agent sources:
 *   - agents/*.md              persona prompts loaded by lib/agent-personas.js
 *   - agent_profiles.json      swarm profile roster
 *   - agent_tower.js           spawnable runtime roster before persona merge
 *   - agent_routing_matrix.js  routing/model bindings
 *   - divisions/\u002a/AGENTS.md  division grouping and routing docs
 *
 * Outputs:
 *   - agents/AGENT_REGISTRY.json
 *   - agents/AGENTS_INDEX.md
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REG = path.join(ROOT, 'agents', 'AGENT_REGISTRY.json');
const IDX = path.join(ROOT, 'agents', 'AGENTS_INDEX.md');
const DISCOVERY_SKIP = new Set(['node_modules', '.git', '.next']);

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function normDivision(v) {
  return String(v || 'unassigned').toUpperCase().replace(/-/g, '_');
}

function frontmatter(md) {
  const m = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (mm) out[mm[1]] = mm[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function routing() {
  try { return require(path.join(ROOT, 'agent_routing_matrix.js')).AGENT_ROUTING || {}; }
  catch { return {}; }
}

function modelFor(name) {
  try { return require(path.join(ROOT, 'agent_routing_matrix.js')).modelForAgent(name) || ''; }
  catch { return ''; }
}

function modelName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return [v.provider, v.model].filter(Boolean).join('/');
  return String(v);
}

function buildDivisionIndex() {
  const dir = path.join(ROOT, 'divisions');
  const map = {};
  let divs = [];
  try { divs = fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'AGENTS.md'))); } catch {}
  for (const d of divs) {
    let md; try { md = fs.readFileSync(path.join(dir, d, 'AGENTS.md'), 'utf8'); } catch { continue; }
    for (const line of md.split(/\r?\n/)) {
      const m = line.match(/^\|\s*([a-z][a-z0-9 _-]+?)\s*\|/i);
      if (!m) continue;
      const n = m[1].trim().toLowerCase();
      if (n && n !== 'agent' && !map[n]) map[n] = d;
    }
  }
  return map;
}

function personaAgents(divIndex) {
  const dir = path.join(ROOT, 'agents');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'AGENT.md' && f !== 'AGENTS_INDEX.md'); } catch {}
  const out = [];
  for (const f of files) {
    let md; try { md = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const fm = frontmatter(md);
    if (!fm) continue;
    const name = fm.name || f.replace(/\.md$/, '');
    const key = name.toLowerCase();
    out.push({
      key,
      name,
      type: 'persona',
      division: normDivision(divIndex[key] || 'unassigned'),
      role: (fm.description || '').slice(0, 120),
      model: modelName(fm.model || modelFor(key)),
      emoji: '',
      file: `agents/${f}`,
      sources: [`agents/${f}`],
    });
  }
  return out;
}

function swarmAgents() {
  let j; try { j = require(path.join(ROOT, 'agent_profiles.json')); } catch { return []; }
  const entries = Array.isArray(j) ? j.map((v, i) => [v.key || v.id || v.name || String(i), v]) : Object.entries(j);
  return entries.map(([k, a]) => {
    const key = String(k || a.name || '').toLowerCase();
    return {
      key,
      name: a.name || key.toUpperCase(),
      type: 'swarm',
      division: normDivision(a.division),
      role: a.role || '',
      model: modelName(modelFor(key) || modelFor(a.name)),
      emoji: a.emoji || '',
      tier: a.tier,
      skills: a.skills || [],
      file: 'agent_profiles.json',
      sources: ['agent_profiles.json'],
    };
  });
}

function towerAgents() {
  let src; try { src = fs.readFileSync(path.join(ROOT, 'agent_tower.js'), 'utf8'); } catch { return []; }
  const re = /^\s+([A-Za-z0-9_-]+):\s*\{\s*name:\s*'([^']+)',\s*emoji:\s*'([^']*)',\s*division:\s*'([^']+)',\s*role:\s*'([^']+)',\s*tier:\s*(\d+),\s*skills:\s*\[([^\]]*)\]/gm;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({
      key: m[1].toLowerCase(),
      name: m[2],
      type: 'tower',
      division: normDivision(m[4]),
      role: m[5],
      model: modelName(modelFor(m[1])),
      emoji: m[3],
      tier: parseInt(m[6], 10),
      skills: m[7].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
      file: 'agent_tower.js',
      sources: ['agent_tower.js'],
    });
  }
  return out;
}

function routingAgents() {
  return Object.entries(routing()).map(([key, a]) => ({
    key: key.toLowerCase(),
    name: key.toUpperCase(),
    type: 'routing',
    division: normDivision(a.division),
    role: a.role || '',
    model: modelName(modelFor(key)),
    emoji: '',
    file: 'agent_routing_matrix.js',
    sources: ['agent_routing_matrix.js'],
  }));
}

function discoverAgentFiles() {
  const hits = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (DISCOVERY_SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const r = rel(full);
      const low = r.toLowerCase();
      if (
        /(^|\/|\.)agents?(\/|\.|$)/i.test(r) ||
        low.includes('agent_') ||
        low.includes('agent-') ||
        low.endsWith('/agent.md') ||
        low.endsWith('/agents.md') ||
        low.endsWith('/agent.json') ||
        low.endsWith('/agents.json')
      ) {
        hits.push(r);
      }
    }
  }
  walk(ROOT);
  hits.sort();
  return hits;
}

function classifySource(relPath) {
  if (/^agents\/[^/]+\.md$/i.test(relPath)) return 'canonical_persona_or_index';
  if (relPath === 'agents/AGENT_REGISTRY.json' || relPath === 'agents/AGENTS_INDEX.md') return 'generated_canonical';
  if (relPath === 'agent_profiles.json') return 'canonical_swarm_profile';
  if (relPath === 'agent_routing_matrix.js') return 'canonical_routing';
  if (relPath === 'agent_tower.js') return 'runtime_tower';
  if (/^divisions\/[^/]+\/AGENTS\.md$/i.test(relPath)) return 'division_route';
  if (/^\.kiro\/agents\//i.test(relPath)) return 'duplicate_mirror';
  if (/^docs\//i.test(relPath) || /^research\//i.test(relPath) || /^rules\//i.test(relPath)) return 'documentation_reference';
  if (/^agent_work\//i.test(relPath) || /^logs\//i.test(relPath)) return 'runtime_output';
  if (/^archive\//i.test(relPath) || /^\.archive\//i.test(relPath) || /^\.donors\//i.test(relPath) || /^vendor\//i.test(relPath)) return 'external_or_archive';
  return 'other_agent_named_file';
}

function sourceAudit() {
  const files = discoverAgentFiles();
  const byKind = {};
  for (const f of files) {
    const k = classifySource(f);
    byKind[k] = (byKind[k] || 0) + 1;
  }
  return {
    scanned_root: ROOT,
    skipped_dirs: [...DISCOVERY_SKIP].sort(),
    files_seen: files.length,
    by_kind: byKind,
    files,
  };
}

function mergeAgents(groups) {
  const byName = new Map();
  for (const a of groups.flat()) {
    const key = String(a.key || a.name || '').toLowerCase();
    if (!key) continue;
    const route = routing()[key] || null;
    if (!byName.has(key)) {
      byName.set(key, {
        ...a,
        key,
        division: normDivision(a.division || (route && route.division)),
        role: a.role || (route && route.role) || '',
        model: modelName(a.model || modelFor(key)),
        sources: [...new Set(a.sources || [a.file].filter(Boolean))],
      });
      continue;
    }
    const ex = byName.get(key);
    ex.also = ex.also || [];
    ex.also.push(a.type);
    ex.sources = [...new Set([...(ex.sources || []), ...(a.sources || [a.file].filter(Boolean))])];
    if (!ex.model && a.model) ex.model = modelName(a.model);
    if ((!ex.division || ex.division === 'UNASSIGNED') && a.division) ex.division = normDivision(a.division);
    if (!ex.role && a.role) ex.role = a.role;
  }
  return [...byName.values()].sort((a, b) =>
    (a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)));
}

function build() {
  const divIndex = buildDivisionIndex();
  const personas = personaAgents(divIndex);
  const swarm = swarmAgents();
  const tower = towerAgents();
  const route = routingAgents();
  const agents = mergeAgents([personas, swarm, tower, route]);

  const byDivision = {};
  for (const a of agents) byDivision[a.division] = (byDivision[a.division] || 0) + 1;

  return {
    schema: 'purpclaw.agent-registry.v1',
    version: require(path.join(ROOT, 'package.json')).version,
    updated: process.env.SYNC_STAMP || new Date().toISOString(),
    total: agents.length,
    by_type: agents.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {}),
    by_division: byDivision,
    sources: {
      personas: 'agents/*.md (loaded by lib/agent-personas.js -> tower)',
      swarm: 'agent_profiles.json (profile roster)',
      tower: 'agent_tower.js (spawnable runtime roster before persona merge)',
      routing: 'agent_routing_matrix.js (model bindings + routing descriptions)',
      divisions: 'divisions/*/AGENTS.md (grouping + keyword routing)',
    },
    source_counts: {
      personas: personas.length,
      swarm_profiles: swarm.length,
      tower_runtime: tower.length,
      routing_matrix: route.length,
      divisions_indexed: Object.keys(divIndex).length,
    },
    source_audit: sourceAudit(),
    agents,
  };
}

function writeIndex(reg) {
  let md = '# PURPCLAW Agent Registry\n\n';
  md += '> Auto-generated by scripts/sync-agents.js. Do not edit by hand.\n\n';
  md += `**Total: ${reg.total} agents**`;
  for (const [k, v] of Object.entries(reg.by_type)) md += ` - ${k}: ${v}`;
  md += '\n\n';
  md += '### Source audit\n\n';
  md += `- Files seen with agent-like names: **${reg.source_audit.files_seen}**\n`;
  for (const [k, v] of Object.entries(reg.source_audit.by_kind).sort()) md += `- ${k}: ${v}\n`;
  md += '\n### By division\n\n';
  for (const [d, n] of Object.entries(reg.by_division).sort((a, b) => b[1] - a[1])) md += `- **${d}**: ${n}\n`;
  md += '\n### Roster\n\n| Agent | Type | Division | Model | Lives in |\n|---|---|---|---|---|\n';
  for (const a of reg.agents) {
    const type = a.also && a.also.length ? `${a.type} +${[...new Set(a.also)].join(',')}` : a.type;
    md += `| ${a.emoji ? `${a.emoji} ` : ''}\`${a.name}\` | ${type} | ${a.division} | ${a.model || '-'} | ${(a.sources || [a.file]).join(', ')} |\n`;
  }
  fs.writeFileSync(IDX, md);
}

function main() {
  const reg = build();
  if (process.argv.includes('--check')) {
    let prev = 0; try { prev = JSON.parse(fs.readFileSync(REG, 'utf8')).total; } catch {}
    console.log(`agents: registry has ${prev}, live build ${reg.total}; sources ${JSON.stringify(reg.source_counts)}`);
    process.exit(prev !== reg.total ? 1 : 0);
  }
  fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n');
  writeIndex(reg);
  console.log(`agents/AGENT_REGISTRY.json + AGENTS_INDEX.md written - ${reg.total} agents across ${Object.keys(reg.by_division).length} divisions; source files seen=${reg.source_audit.files_seen}`);
}

if (require.main === module) main();
module.exports = { build, sourceAudit, discoverAgentFiles };
