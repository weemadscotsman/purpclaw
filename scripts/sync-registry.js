#!/usr/bin/env node
'use strict';

/**
 * sync-registry.js — regenerate registry/index.json from LIVE truth.
 *
 * Kills skill/agent metadata drift: rebuilds the skills[] list from the real
 * skill scanner (lib/tools/skills-registry.js) and the agents[] list from the
 * agents/ directory, preserving prior `origin` tags where the name still
 * matches. Re-run any time files change; the registry can never silently rot.
 *
 *   node scripts/sync-registry.js          # rewrite registry/index.json
 *   node scripts/sync-registry.js --check  # report drift, write nothing (exit 1 if drift)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REG_PATH = path.join(ROOT, 'registry', 'index.json');

function loadPrev() {
  try { return JSON.parse(fs.readFileSync(REG_PATH, 'utf8')); }
  catch { return { skills: [], agents: [] }; }
}

function firstDescription(md) {
  const q = md.match(/^\s*description:\s*"([^"]+)"/m);
  if (q) return q[1].trim();
  const blk = md.match(/^\s*description:\s*[>|][-+]?\s*\n([\s\S]*?)(?=^\S|\n\s*\n|^\s*\w+:)/m);
  if (blk) return blk[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ').trim();
  const p = md.match(/^\s*description:\s*([^\n>|"][^\n]*)/m);
  return p ? p[1].trim() : '';
}

function buildSkills(prev) {
  const reg = require(path.join(ROOT, 'lib', 'tools', 'skills-registry.js'));
  const prevByName = new Map((prev.skills || []).map(s => [s.name, s]));
  return reg.scanSkills()
    .map(s => {
      const rel = path.relative(ROOT, s.path).replace(/\\/g, '/');
      const mdPath = path.join(s.path, 'SKILL.md');
      let size_kb = 0;
      try { size_kb = Math.round(fs.statSync(mdPath).size / 1024); } catch {}
      const old = prevByName.get(s.name) || {};
      return {
        name: s.name,
        description: s.description || old.description || '',
        origin: old.origin || 'local',
        trigger: old.trigger || '',
        file: fs.existsSync(mdPath) ? `${rel}/SKILL.md` : rel,
        size_kb,
        executable: !!s.hasScript,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildAgents() {
  // Source of truth: the canonical agent registry (personas + swarm), built by
  // scripts/sync-agents.js. This makes registry/index.json count EVERY agent,
  // not just the persona .md files.
  let reg;
  try { reg = require(path.join(ROOT, 'scripts', 'sync-agents.js')).build(); }
  catch { reg = { agents: [] }; }
  return (reg.agents || []).map(a => ({
    name: a.name,
    description: a.role || '',
    type: a.type,
    division: a.division,
    model: a.model || '',
    file: a.file,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function build() {
  const prev = loadPrev();
  const skills = buildSkills(prev);
  const agents = buildAgents();
  const stamp = process.env.SYNC_STAMP || new Date().toISOString();
  return {
    version: prev.version || require(path.join(ROOT, 'package.json')).version,
    updated: stamp,
    skills,
    agents,
    total_skills: skills.length,
    total_agents: agents.length,
  };
}

function main() {
  const check = process.argv.includes('--check');
  const prev = loadPrev();
  const next = build();
  const drift = {
    skills: next.total_skills - (prev.total_skills || (prev.skills || []).length),
    agents: next.total_agents - (prev.total_agents || (prev.agents || []).length),
  };
  if (check) {
    const dirty = drift.skills !== 0 || drift.agents !== 0;
    console.log(`registry drift — skills: ${drift.skills >= 0 ? '+' : ''}${drift.skills}, agents: ${drift.agents >= 0 ? '+' : ''}${drift.agents} (was ${prev.total_skills}/${prev.total_agents}, live ${next.total_skills}/${next.total_agents})`);
    process.exit(dirty ? 1 : 0);
  }
  fs.writeFileSync(REG_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`registry/index.json synced — ${next.total_skills} skills, ${next.total_agents} agents (was ${prev.total_skills}/${prev.total_agents}). updated=${next.updated}`);
}

if (require.main === module) main();
module.exports = { build };
