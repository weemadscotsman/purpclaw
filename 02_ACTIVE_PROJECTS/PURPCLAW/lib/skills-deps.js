'use strict';

/**
 * lib/skills-deps.js
 * Skills dependency resolver — build-order, circular dep detection, missing deps.
 *
 * Schema (from skill SKILL.md frontmatter):
 *   depends: [skill-name, ...]   — must be loaded/resolved first
 *   provides: [capability, ...]  — exported capabilities other skills can depend on
 *   conflicts: [skill-name, ...]  — cannot coexist with these skills
 *
 * Rules:
 *   1. Circular deps → error with the cycle path
 *   2. Missing deps → error listing them
 *   3. Conflicts → error listing conflicting pairs
 *   4. Build order → topological sort (Kahn's algorithm)
 */

const fs   = require('fs');
const path = require('path');

// ── Schema detection ──────────────────────────────────────────────────────

/** Parse depends/provides/conflicts from a SKILL.md frontmatter string */
function parseFrontmatter(raw) {
  const deps     = [];
  const provides = [];
  const conflicts = [];
  const lines = raw.split('\n');
  let inDeps = false, inProvides = false, inConflicts = false;
  let seenFrontmatter = false;

  for (const line of lines) {
    const t = line.trim();
    if (t === '---') {
      if (!seenFrontmatter) { seenFrontmatter = true; inDeps = true; }
      else break; // end of frontmatter
      continue;
    }
    if (!seenFrontmatter) continue;

    // New top-level key ends any list context
    if (/^[a-zA-Z]/.test(t) && !t.startsWith('- ')) {
      inDeps = false; inProvides = false; inConflicts = false;
    }

    if (t.startsWith('depends:')) {
      inDeps = true; inProvides = false; inConflicts = false;
      const val = t.slice(8).trim().replace(/[\[\]]/g, '');
      if (val) deps.push(...val.split(',').map(s => s.trim()).filter(Boolean));
      continue;
    }
    if (t.startsWith('provides:')) {
      inProvides = true; inDeps = false; inConflicts = false;
      const val = t.slice(9).trim().replace(/[\[\]]/g, '');
      if (val) provides.push(...val.split(',').map(s => s.trim()).filter(Boolean));
      continue;
    }
    if (t.startsWith('conflicts:')) {
      inConflicts = true; inDeps = false; inProvides = false;
      const val = t.slice(10).trim().replace(/[\[\]]/g, '');
      if (val) conflicts.push(...val.split(',').map(s => s.trim()).filter(Boolean));
      continue;
    }
    if (inDeps     && t.startsWith('- ')) deps.push(t.slice(2).trim().replace(/['"]/g, ''));
    if (inProvides && t.startsWith('- ')) provides.push(t.slice(2).trim().replace(/['"]/g, ''));
    if (inConflicts && t.startsWith('- ')) conflicts.push(t.slice(2).trim().replace(/['"]/g, ''));
  }
  return { depends: [...new Set(deps)], provides: [...new Set(provides)], conflicts: [...new Set(conflicts)] };
}

/** Extract skill name from SKILL.md filename or directory name */
function skillName(dir) {
  return path.basename(dir).replace(/[-_]/g, '-');
}

// ── Discovery ─────────────────────────────────────────────────────────────

/** Find all skills under a root dir (looks for SKILL.md or skill.md) */
function discoverSkills(skillsRoot) {
  const skills = new Map(); // name → { dir, deps, provides, conflicts, meta }
  if (!fs.existsSync(skillsRoot)) return skills;

  function walk(dir, depth) {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        const skillMd = path.join(full, 'SKILL.md');
        const skillMd2 = path.join(full, 'skill.md');
        if (fs.existsSync(skillMd)) {
          const raw = fs.readFileSync(skillMd, 'utf-8');
          const { depends, provides, conflicts } = parseFrontmatter(raw);
          const name = entry.replace(/[-_]/g, '-');
          if (!skills.has(name)) {
            skills.set(name, { dir: full, deps: depends, provides, conflicts, meta: {} });
          }
        } else {
          walk(full, depth + 1);
        }
      }
    }
  }
  walk(skillsRoot, 0);
  return skills;
}

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Validate a skill graph.
 * Returns { ok, errors, warnings }
 * errors: [{ skill, type, message }]
 */
function validate(skills) {
  const errors   = [];
  const warnings = [];
  const names    = new Set(skills.keys());

  for (const [name, skill] of skills) {
    // Missing dependencies
    for (const dep of skill.deps) {
      if (!names.has(dep)) {
        errors.push({ skill: name, type: 'missing-dep', dep, message: `skill '${name}' depends on '${dep}' which is not in the registry` });
      }
    }
    // Self-dependency
    if (skill.deps.includes(name)) {
      errors.push({ skill: name, type: 'self-dep', message: `skill '${name}' depends on itself` });
    }
    // Conflicts with self
    if (skill.conflicts.includes(name)) {
      errors.push({ skill: name, type: 'self-conflict', message: `skill '${name}' conflicts with itself` });
    }
    // Empty skill dir
    try { const files = fs.readdirSync(skill.dir); if (!files.length) warnings.push({ skill: name, type: 'empty-dir' }); }
    catch { errors.push({ skill: name, type: 'unreadable', message: `cannot read skill dir: ${skill.dir}` }); }
  }

  // Circular dependency check via DFS
  const visiting = new Set();
  const visited  = new Set();
  const cyclePath = [];

  function dfs(name, stack) {
    if (visiting.has(name)) {
      const idx = stack.indexOf(name);
      const cycle = [...stack.slice(idx), name].join(' → ');
      errors.push({ skill: name, type: 'circular-dep', message: `circular dependency detected: ${cycle}` });
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    stack.push(name);
    const skill = skills.get(name);
    if (skill) {
      for (const dep of skill.deps) {
        if (skills.has(dep)) dfs(dep, [...stack]);
      }
    }
    visited.add(name);
  }

  for (const name of names) {
    if (!visited.has(name)) dfs(name, []);
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ── Build order (topological sort — Kahn's algorithm) ─────────────────────

/**
 * Topological sort of skills.
 * Returns { order: string[], errors }
 * errors: [{ skill, type, message }]
 */
function buildOrder(skills, wanted = null) {
  const errors = [];
  const names  = new Set(skills.keys());
  const wantedSet = wanted ? new Set(wanted.filter(n => names.has(n))) : names;
  const inDegree = new Map();
  const graph    = new Map(); // name → [dep names]

  for (const name of wantedSet) {
    inDegree.set(name, 0);
    graph.set(name, []);
  }

  for (const [name, skill] of skills) {
    if (!wantedSet.has(name)) continue;
    for (const dep of skill.deps) {
      if (!wantedSet.has(dep)) {
        errors.push({ skill: name, type: 'out-of-scope', dep, message: `wanted skill '${name}' depends on '${dep}' which is not in wanted set` });
        continue;
      }
      graph.get(dep).push(name);
      inDegree.set(name, (inDegree.get(name) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue = [...wantedSet].filter(n => inDegree.get(n) === 0);
  const order = [];

  while (queue.length) {
    const current = queue.shift();
    order.push(current);
    for (const dependent of graph.get(current) || []) {
      const newDeg = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(dependent);
    }
  }

  const remaining = order.length < wantedSet.size ? [...wantedSet].filter(n => !order.includes(n)) : [];
  if (remaining.length) {
    for (const name of remaining) {
      errors.push({ skill: name, type: 'cycle', message: `skill '${name}' is part of an unresolved dependency cycle` });
    }
  }

  return { order, errors };
}

// ── Capability registry ───────────────────────────────────────────────────

/**
 * Build a capability → skill index (which skills provide which capabilities)
 */
function buildCapabilityIndex(skills) {
  const index = new Map(); // capability → [skill names]
  for (const [name, skill] of skills) {
    for (const cap of skill.provides) {
      if (!index.has(cap)) index.set(cap, []);
      index.get(cap).push(name);
    }
  }
  return index;
}

/**
 * Resolve a capability: find which skill provides it, or return null
 */
function resolveCapability(skills, capability) {
  const capIndex = buildCapabilityIndex(skills);
  const providers = capIndex.get(capability) || [];
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];
  // If multiple, prefer the one with fewest deps
  return providers.sort((a, b) => skills.get(a).deps.length - skills.get(b).deps.length)[0];
}

module.exports = { parseFrontmatter, discoverSkills, validate, buildOrder, buildCapabilityIndex, resolveCapability };
