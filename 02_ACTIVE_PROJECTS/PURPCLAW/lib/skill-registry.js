'use strict';
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Skill search roots: env override → project-local → user-local
function roots(cwd = process.cwd()) {
  return [
    process.env.PURPCLAW_SKILLS_DIR,
    path.join(cwd, 'skills'),
    path.join(cwd, '.purpclaw', 'skills'),
  ].filter(Boolean).map(value => path.resolve(value));
}

function metadata(text, fallback) {
  const match = String(text).match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: fallback, description: '' };
  try {
    return { name: fallback, ...yaml.load(match[1]) };
  } catch {
    return { name: fallback, description: '' };
  }
}

// P1-6: Merge plugin skills into discovery results.
// Plugin skills are namespaced as "plugin-name:skill-name" and take
// precedence over disk skills with the same base name.
function discover(cwd = process.cwd()) {
  const found = new Map();

  // Disk-based skills
  for (const root of roots(cwd)) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })
      .filter(item => item.isDirectory())) {
      const dir  = path.join(root, entry.name);
      const main = ['SKILL.md', 'AGENT.md']
        .map(name => path.join(dir, name))
        .find(file => fs.existsSync(file));
      if (!main) continue;
      const head = fs.readFileSync(main, 'utf8').slice(0, 16384);
      const meta = metadata(head, entry.name);
      if (!found.has(meta.name)) {
        found.set(meta.name, {
          name        : meta.name,
          description : meta.description || '',
          version     : meta.version || null,
          path        : dir,
          main,
          metadata    : meta,
          source      : 'disk',
          inline      : false,
        });
      }
    }
  }

  // Plugin skills (inline — from PluginManager.registerSkill)
  // Plugin skills are additive: they don't overwrite disk skills,
  // but are available under both their namespaced and bare names.
  try {
    const pm = require('./plugin-manager');
    const pluginSkills = pm.pluginRegistry ? pm.pluginRegistry() : [];
    for (const s of pluginSkills) {
      // Always available as namespaced
      if (!found.has(s.name)) {
        found.set(s.name, { ...s, source: 'plugin', inline: true });
      }
      // Also available as bare name if not taken
      const bare = s.name.includes(':') ? s.name.split(':')[1] : s.name;
      if (!found.has(bare)) {
        found.set(bare, { ...s, name: bare, source: 'plugin', inline: true });
      }
    }
  } catch { /* plugin system not available */ }

  return [...found.values()];
}

function find(name, cwd) {
  return discover(cwd).find(skill =>
    skill.name === name || path.basename(skill.path) === name
  );
}

// P1-6: Handle inline (plugin) skills that have no main file.
// For disk skills: read instructions from main file.
// For plugin skills: use the inline content field.
function load(name, cwd = process.cwd()) {
  const skill = find(name, cwd);
  if (!skill) throw new Error(`skill not found: ${name}`);

  let instructions, resources;
  if (skill.inline || skill.source === 'plugin') {
    // Inline skill — content is already in memory
    instructions = skill.content || '';
    resources     = [];
  } else {
    // Disk skill — read from file
    if (!skill.main) throw new Error(`skill has no main file: ${name}`);
    instructions = fs.readFileSync(skill.main, 'utf8');
    resources = [];
    for (const folder of ['references', 'scripts', 'assets']) {
      const root = path.join(skill.path, folder);
      if (fs.existsSync(root)) {
        for (const file of walk(root)) {
          resources.push({
            type : folder,
            path : path.relative(skill.path, file).replace(/\\/g, '/'),
            size : fs.statSync(file).size,
          });
        }
      }
    }
  }

  return { ...skill, instructions, resources };
}

function walk(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(target));
    else if (entry.isFile()) out.push(target);
  }
  return out;
}

function resource(name, relative, cwd = process.cwd()) {
  const skill = find(name, cwd);
  if (!skill) throw new Error(`skill not found: ${name}`);
  if (skill.inline || skill.source === 'plugin') {
    throw new Error('plugin skills do not expose file resources');
  }
  const target = path.resolve(skill.path, relative);
  if (!(target === skill.path || target.startsWith(skill.path + path.sep))) {
    throw new Error('skill resource escapes skill directory');
  }
  if (!fs.statSync(target).isFile()) {
    throw new Error('skill resource is not a file');
  }
  return { skill: name, path: relative, content: fs.readFileSync(target, 'utf8') };
}

module.exports = { discover, load, resource, find, roots };
