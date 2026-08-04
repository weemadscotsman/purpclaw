'use strict';
/**
 * lib/user-agents.js — P5 ship blocker.
 *
 * Claude Code parity: `.claude/agents/<name>.md` files become custom
 * subagents with frontmatter declaring name/description/tools/model.
 * Invoked via `@<name> do the task` in chat, or via spawn tool.
 *
 * PURPCLAW convention: `.purpclaw/agents/<name>.md` (project) and
 * `~/.purpclaw/agents/<name>.md` (user-global). Project/local override
 * user-global.
 *
 * Eddie audit ask 2026-07-17: parity with Claude Code / Hermes subagents.
 */

const fs = require('fs');
const path = require('path');

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

function parseFrontmatter(text) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.substring(0, idx).trim();
    let value = line.substring(idx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Parse YAML-ish lists: [a, b] or "a, b"
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (value.startsWith('[') || value.endsWith(']')) {
      value = value.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    meta[key] = value;
  }
  return { meta, body: m[2].trim() };
}

function readAgents(cwd) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const dirs = [
    home ? path.join(home, '.purpclaw', 'agents') : null,
    path.join(cwd || process.cwd(), '.purpclaw', 'agents'),
    path.join(cwd || process.cwd(), '.purpclaw.local', 'agents'),
  ].filter(Boolean);
  const map = new Map();
  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !/\.(md|markdown)$/i.test(e.name)) continue;
      const name = e.name.replace(/\.(md|markdown)$/i, '');
      try {
        const text = fs.readFileSync(path.join(dir, e.name), 'utf8');
        const { meta, body } = parseFrontmatter(text);
        const agentName = meta.name || name;
        if (map.has(agentName)) continue; // first-wins (user-global < project < local)
        map.set(agentName, {
          name: agentName,
          description: meta.description || '',
          model: meta.model || null,
          tools: Array.isArray(meta.tools) ? meta.tools : null,
          system: body,
          file: path.join(dir, e.name),
          source: dir,
          meta,
        });
      } catch {}
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getAgent(name, cwd) {
  return readAgents(cwd).find(a => a.name === name) || null;
}

function list(cwd) {
  return readAgents(cwd).map(a => ({ name: a.name, description: a.description, model: a.model }));
}

module.exports = { parseFrontmatter, readAgents, getAgent, list };
