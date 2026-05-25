'use strict';

/**
 * purpclaw roster — compare swarm tower vs disk persona files
 * ═══════════════════════════════════════════════════════════
 *
 * The runtime has two agent layers:
 *   A) Swarm animals defined in-code in agent_tower.js (~44)
 *   B) Persona definition files in agents/*.md (~38, mostly Claude Code agents)
 *
 * This command shows where they diverge:
 *   - Animals in the tower with NO persona file (need one to be useful)
 *   - Persona files with NO tower entry (orphan personas)
 *   - Perfect matches (both layers exist)
 *
 * Useful for: migrating skill matrices back from Codex, finding personas
 * to write, auditing the menagerie before a release.
 *
 * Usage:
 *   purpclaw roster              — full comparison table
 *   purpclaw roster --missing    — just the animals needing personas
 *   purpclaw roster --orphans    — just the persona files without tower entries
 *   purpclaw roster --json       — machine-readable
 */

const fs   = require('fs');
const path = require('path');

function extractTowerAgents(PURP_DIR) {
  const src = fs.readFileSync(path.join(PURP_DIR, 'agent_tower.js'), 'utf8');
  // Match: key: { name: 'X', emoji: 'Y', division: 'Z', role: 'R', tier: N, skills: [...]
  const re = /^\s+(\w+):\s*\{\s*name:\s*'([^']+)',\s*emoji:\s*'([^']+)',\s*division:\s*'([^']+)',\s*role:\s*'([^']+)',\s*tier:\s*(\d+),\s*skills:\s*\[([^\]]+)\]/gm;
  const agents = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    agents.push({
      key: m[1], name: m[2], emoji: m[3], division: m[4],
      role: m[5], tier: parseInt(m[6], 10),
      skills: m[7].split(',').map(s => s.trim().replace(/'/g, '')),
    });
  }
  return agents;
}

function listPersonaFiles(PURP_DIR) {
  const dir = path.join(PURP_DIR, 'agents');
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  } catch { return []; }
}

async function run(args, ctx) {
  const { C, col, PURP_DIR, sectionHead } = ctx;

  const wantMissing = args.includes('--missing');
  const wantOrphans = args.includes('--orphans');
  const wantJson    = args.includes('--json');

  const towerAgents = extractTowerAgents(PURP_DIR);
  const personaFiles = new Set(listPersonaFiles(PURP_DIR));
  const towerKeys = new Set(towerAgents.map(a => a.key));

  const matched = towerAgents.filter(a => personaFiles.has(a.key));
  const missing = towerAgents.filter(a => !personaFiles.has(a.key));
  const orphans = [...personaFiles].filter(p => !towerKeys.has(p)).sort();

  if (wantJson) {
    console.log(JSON.stringify({
      tower_count: towerAgents.length,
      persona_count: personaFiles.size,
      matched: matched.map(a => a.key),
      missing_persona: missing.map(a => ({ key: a.key, division: a.division, role: a.role, tier: a.tier, skills: a.skills })),
      orphan_personas: orphans,
    }, null, 2));
    return;
  }

  // ── Missing-only mode ─────────────────────────────────────────────────────
  if (wantMissing) {
    sectionHead('  🔍  SWARM AGENTS MISSING PERSONA FILES');
    if (missing.length === 0) {
      console.log(col(C.green, '\n  ✔  Every tower animal has a persona file.\n'));
      return;
    }
    console.log(col(C.gray, '\n  These exist in agent_tower.js but lack an agents/<key>.md persona.'));
    console.log(col(C.gray, '  When mirroring from Codex, prioritise these (highest-tier first):\n'));
    const sorted = missing.slice().sort((a, b) => b.tier - a.tier || a.key.localeCompare(b.key));
    for (const a of sorted) {
      console.log(`  ${a.emoji}  ${col(C.cyan, a.key.padEnd(14))}  ${col(C.gray, 'tier ' + a.tier)}  ${col(C.white, a.division.padEnd(16))}  ${col(C.gray, a.role)}`);
    }
    console.log(col(C.gray, `\n  ${missing.length} persona file(s) to write.\n`));
    return;
  }

  // ── Orphan-only mode ──────────────────────────────────────────────────────
  if (wantOrphans) {
    sectionHead('  🔍  PERSONA FILES WITHOUT A TOWER ENTRY');
    if (orphans.length === 0) {
      console.log(col(C.green, '\n  ✔  Every persona file has a tower entry.\n'));
      return;
    }
    console.log(col(C.gray, '\n  These are agents/*.md files with no matching tower animal.'));
    console.log(col(C.gray, '  Most are Claude Code agent definitions (architect, code-reviewer, etc.) —'));
    console.log(col(C.gray, '  that is normal. They are a separate layer.\n'));
    for (const o of orphans) {
      console.log(`  ${col(C.cyan, '·')}  ${col(C.white, o)}`);
    }
    console.log(col(C.gray, `\n  ${orphans.length} persona file(s) without tower binding.\n`));
    return;
  }

  // ── Full report ───────────────────────────────────────────────────────────
  sectionHead('  🎭  ROSTER — TOWER ↔ DISK');
  console.log(col(C.gray, `\n  Tower swarm agents:  ${col(C.cyan, towerAgents.length)}`));
  console.log(col(C.gray, `  Persona files on disk: ${col(C.cyan, personaFiles.size)}`));
  console.log(col(C.gray, `  Matched both layers:   ${col(C.green, matched.length)}`));
  console.log(col(C.gray, `  Missing persona file:  ${col(C.yellow, missing.length)}`));
  console.log(col(C.gray, `  Orphan persona files:  ${col(C.gray, orphans.length)} (typically Claude Code agents, not swarm animals)\n`));

  // Group missing by division
  const byDivision = {};
  for (const a of missing) {
    if (!byDivision[a.division]) byDivision[a.division] = [];
    byDivision[a.division].push(a);
  }
  console.log(col(C.bold || C.white, '  Swarm animals needing persona files (by division):\n'));
  for (const div of Object.keys(byDivision).sort()) {
    console.log(`    ${col(C.cyan, div)}`);
    for (const a of byDivision[div].sort((x, y) => y.tier - x.tier || x.key.localeCompare(y.key))) {
      console.log(`      ${a.emoji}  ${col(C.white, a.key.padEnd(14))}  ${col(C.gray, 'tier ' + a.tier)}  ${col(C.gray, a.role)}`);
    }
  }

  if (matched.length) {
    console.log(col(C.bold || C.white, '\n  Swarm animals with persona files already:\n'));
    for (const a of matched) {
      console.log(`    ${a.emoji}  ${col(C.green, a.key.padEnd(14))}  ${col(C.gray, a.division + ' · tier ' + a.tier)}`);
    }
  }

  console.log(col(C.gray, '\n  Drill down:'));
  console.log(`    ${col(C.cyan, 'purpclaw roster --missing')}   only animals that need persona files`);
  console.log(`    ${col(C.cyan, 'purpclaw roster --orphans')}   persona files without tower entries`);
  console.log(`    ${col(C.cyan, 'purpclaw roster --json')}      machine-readable for scripting migration\n`);
}

module.exports = { run };
