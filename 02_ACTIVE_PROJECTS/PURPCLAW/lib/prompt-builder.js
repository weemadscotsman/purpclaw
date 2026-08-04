'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const stableCache = new Map();
const sessionSnapshots = new Map();

function readFile(file, max = 24_000) {
  try { return fs.readFileSync(file, 'utf8').slice(0, max).trim(); } catch { return ''; }
}

function skillIndex(root = ROOT) {
  const dir = path.join(root, 'skills');
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory())
      .map(entry => entry.name).sort().slice(0, 500);
  } catch { return []; }
}

function readDir(dir, maxBytes = 16_000) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => entry.name).sort();
    const parts = [];
    let used = 0;
    for (const name of entries) {
      if (used >= maxBytes) break;
      const body = readFile(path.join(dir, name), Math.max(0, maxBytes - used));
      if (!body) continue;
      parts.push(`## ${name}\n${body}`);
      used += body.length;
    }
    return parts.join('\n\n');
  } catch { return ''; }
}

// Claude Code parity: auto-load project context. Priority order:
//  1. ~/.purpclaw/rules/*.md      (user-global, like ~/.claude/CLAUDE.md)
//  2. <cwd>/PURPCLAW.md           (the canonical project file — note: NO
//                                   PURPCLAW.md exists by default; users
//                                   create one per project, same as CLAUDE.md)
//  3. <cwd>/CLAUDE.md             (Claude Code convention, auto-picked up
//                                   for users migrating from Claude Code)
//  4. <cwd>/AGENTS.md or AGENT.md (legacy PURPCLAW convention)
//  5. <cwd>/.purpclaw/rules/*.md  (project-shared rules dir)
//  6. <cwd>/.purpclaw.local/rules/*.md (gitignored personal overrides —
//                                   same hierarchy as .claude/ local)
function projectContext(cwd, opts = {}) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const sections = [];
  // 1. user-global rules
  if (home) sections.push(readDir(path.join(home, '.purpclaw', 'rules'), 8_000));
  // 2-4. single-file project files (PURPCLAW.md wins over CLAUDE.md over AGENTS.md)
  for (const name of ['PURPCLAW.md', 'CLAUDE.md', 'AGENTS.md', 'AGENT.md']) {
    const content = readFile(path.join(cwd, name), 16_000);
    if (content) sections.push(`## ${name}\n${content}`);
  }
  // 5-6. rules dirs (project + local override)
  sections.push(readDir(path.join(cwd, '.purpclaw', 'rules'), 16_000));
  sections.push(readDir(path.join(cwd, '.purpclaw.local', 'rules'), 8_000));
  return sections.filter(Boolean).join('\n\n');
}

function snapshotContext({ cwd = ROOT, sessionId } = {}) {
  if (sessionId && sessionSnapshots.has(sessionId)) return sessionSnapshots.get(sessionId);
  const snapshot = {
    memory: readFile(path.join(ROOT, 'MEMORY.md')),
    user: readFile(path.join(ROOT, 'USER.md')),
    project: projectContext(cwd),
    createdAt: new Date().toISOString(),
  };
  if (sessionId) sessionSnapshots.set(sessionId, snapshot);
  return snapshot;
}

function stableLayer({ base, tools = [], privacy = '', structuredTools = false, skills = skillIndex() }) {
  const signature = JSON.stringify([base.length, tools.map(tool => tool.name), structuredTools, skills]);
  if (stableCache.has(signature)) return stableCache.get(signature);
  const toolList = tools.map(tool => `- ${tool.name}: ${tool.description || ''}`).join('\n');
  const protocol = structuredTools
    ? 'Call tools through the provider-native tool API. Never duplicate a native call as JSON text.'
    : 'Call tools by emitting one JSON object per call: {"tool":"<name>","args":{...}}.';
  const layer = [
    '# Stable agent identity and operating rules', base,
    '# Tool protocol', protocol,
    '# Available tools', toolList,
    privacy ? `# Privacy contract\n${privacy}` : '',
    skills.length ? `# Skills index\n${skills.join(', ')}` : '',
  ].filter(Boolean).join('\n\n');
  stableCache.set(signature, layer);
  return layer;
}

function contextLayer(snapshot) {
  return [
    snapshot.memory ? `# Persistent memory snapshot\n${snapshot.memory}` : '',
    snapshot.user ? `# User profile snapshot\n${snapshot.user}` : '',
    snapshot.project ? `# Project context\n${snapshot.project}` : '',
  ].filter(Boolean).join('\n\n');
}

function volatileLayer(opts = {}) {
  return [
    '# Volatile runtime context',
    `- Timestamp: ${new Date().toISOString()}`,
    `- Working directory: ${opts.cwd || process.cwd()}`,
    `- Platform: ${opts.platform || 'cli'}`,
    opts.model ? `- Model: ${opts.model}` : '',
    opts.goal ? `# Active persistent goal\n${JSON.stringify(opts.goal)}` : '',
    opts.liveStack ? opts.liveStack : '',
  ].filter(Boolean).join('\n');
}

function buildPrompt(opts = {}) {
  const snapshot = opts.snapshot || snapshotContext(opts);
  const layers = {
    stable: stableLayer(opts),
    context: contextLayer(snapshot),
    volatile: volatileLayer(opts),
  };
  return { text: [layers.stable, layers.context, layers.volatile].filter(Boolean).join('\n\n'), layers, snapshot };
}

function clearSessionSnapshot(sessionId) { sessionSnapshots.delete(sessionId); }

module.exports = { buildPrompt, snapshotContext, clearSessionSnapshot, projectContext, skillIndex };
