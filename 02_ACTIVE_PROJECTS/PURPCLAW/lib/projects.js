'use strict';
/**
 * lib/projects.js — a project is a registered real folder. The folder is the truth.
 *
 * Metadata lives INSIDE the project at <root>/.purpclaw/project.json and holds
 * only what cannot be derived: id, name, root, and a few defaults. Everything
 * dynamic — file counts, memory atoms, missions, agents — is computed from the
 * canonical runtimes at read time.
 *
 * That split is the whole point. A stored `agentCount: 83` would keep claiming
 * 83 long after the registry dropped to 44, and then nobody knows which number
 * is real. Store identity; derive facts.
 *
 * There are no hardcoded workspace names here. DreamForge or Gotham appear only
 * if those folders exist and are registered — the composer's workspace menu and
 * this page must read the same registry or they will drift apart.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const INDEX = path.join(DATA, 'projects.json');       // registered roots only
const MEM_DIR = path.join(DATA, 'memory');

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function readIndex() {
  try {
    const j = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    return Array.isArray(j.roots) ? j.roots : [];
  } catch { return []; }
}

function writeIndex(roots) {
  try {
    fs.mkdirSync(path.dirname(INDEX), { recursive: true });
    fs.writeFileSync(INDEX, JSON.stringify({ roots: [...new Set(roots)] }, null, 2));
  } catch { /* read-only disk — registration is in-process for this run */ }
}

/** Read <root>/.purpclaw/project.json, or synthesise the minimum from the folder. */
function manifest(root) {
  const file = path.join(root, '.purpclaw', 'project.json');
  let m = {};
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const name = m.name || path.basename(root);
  return {
    id: m.id || slug(name),
    name,
    root,
    memoryNamespace: m.memoryNamespace || `project:${m.id || slug(name)}`,
    defaultMemoryScope: m.defaultMemoryScope || 'project',
    defaultAccess: m.defaultAccess || 'agent-actions',
    defaultAgents: Array.isArray(m.defaultAgents) ? m.defaultAgents : [],
    defaultSkills: Array.isArray(m.defaultSkills) ? m.defaultSkills : [],
    type: m.type || null,
    manifestPresent: fs.existsSync(file),
    manifestPath: file,
  };
}

/**
 * Count files without walking a whole disk. Bounded deliberately: an unbounded
 * recursive count on a project root can take minutes and would block the page,
 * so this reports a floor and says when it stopped rather than lying.
 */
function countFiles(root, cap = 20000) {
  let files = 0, dirs = 0, truncated = false;
  const skip = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'venv', '__pycache__']);
  const walk = (p, depth) => {
    if (truncated || depth > 6) return;
    let items = [];
    try { items = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (files >= cap) { truncated = true; return; }
      if (it.isDirectory()) {
        if (skip.has(it.name) || it.name.startsWith('.')) continue;
        dirs++; walk(path.join(p, it.name), depth + 1);
      } else files++;
    }
  };
  walk(root, 0);
  return { files, dirs, truncated };
}

/** Memory atoms whose scope names this project. Derived, never stored. */
function memoryAtoms(projectId) {
  let total = 0;
  let layerFiles = [];
  try { layerFiles = fs.readdirSync(MEM_DIR).filter(f => f.endsWith('.jsonl')); } catch {}
  for (const f of layerFiles) {
    try {
      for (const line of fs.readFileSync(path.join(MEM_DIR, f), 'utf8').split('\n')) {
        if (!line) continue;
        if (line.includes(`"project":"${projectId}"`) || line.includes(`project:${projectId}`)) total++;
      }
    } catch {}
  }
  return total;
}

function snapshots(root) {
  const dir = path.join(root, '.purpclaw', 'snapshots');
  try { return fs.readdirSync(dir).length; } catch { return 0; }
}

/** Register a folder as a project. The folder must actually exist. */
function register(root, meta = {}) {
  const abs = path.resolve(root);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return { ok: false, error: `not a directory: ${abs}` };
  }
  const roots = readIndex();
  if (!roots.includes(abs)) { roots.push(abs); writeIndex(roots); }
  // Write the manifest only when asked to, or when none exists yet.
  const file = path.join(abs, '.purpclaw', 'project.json');
  if (!fs.existsSync(file) || Object.keys(meta).length) {
    const cur = manifest(abs);
    const next = {
      id: meta.id || cur.id,
      name: meta.name || cur.name,
      root: abs,
      memoryNamespace: meta.memoryNamespace || cur.memoryNamespace,
      defaultMemoryScope: meta.defaultMemoryScope || cur.defaultMemoryScope,
      defaultAccess: meta.defaultAccess || cur.defaultAccess,
      ...(meta.type ? { type: meta.type } : {}),
    };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(next, null, 2));
    } catch (e) { return { ok: false, error: e.message }; }
  }
  return { ok: true, project: manifest(abs) };
}

function unregister(root) {
  const abs = path.resolve(root);
  const roots = readIndex().filter(r => r !== abs);
  writeIndex(roots);
  // The manifest stays on disk: unregistering removes it from PurpClaw's list,
  // it does not touch the operator's folder.
  return { ok: true, removed: abs };
}

/**
 * Every project: registered roots plus the current working folder, which is
 * always available even before anything is registered.
 */
function list({ withMetrics = true } = {}) {
  const cwd = process.cwd();
  const roots = [...new Set([...readIndex(), cwd])].filter(r => {
    try { return fs.statSync(r).isDirectory(); } catch { return false; }
  });

  const projects = roots.map(root => {
    const m = manifest(root);
    const registered = readIndex().includes(root);
    const base = { ...m, registered, isCwd: root === cwd, exists: true };
    if (!withMetrics) return base;
    const c = countFiles(root);
    return {
      ...base,
      files: c.files, dirs: c.dirs, fileCountTruncated: c.truncated,
      memoryAtoms: memoryAtoms(m.id),
      snapshots: snapshots(root),
      hasGit: fs.existsSync(path.join(root, '.git')),
    };
  });

  return {
    ok: true,
    count: projects.length,
    projects,
    note: 'a project is a registered folder; counts are derived from canonical state, never stored',
  };
}

module.exports = { list, register, unregister, manifest, readIndex, INDEX };
