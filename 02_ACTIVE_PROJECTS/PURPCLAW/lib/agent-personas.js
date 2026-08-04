'use strict';
/**
 * lib/agent-personas.js — load the agents/*.md persona definitions so the
 * tower/swarm can spawn them, not just count them.
 *
 * The agents/ directory holds Claude-Code-style specialist subagents
 * (architect, code-reviewer, security-reviewer, tdd-guide, …) in the standard
 * frontmatter format:
 *
 *   ---
 *   name: code-reviewer
 *   description: Expert code review specialist...
 *   tools: ["Read", "Grep", "Glob", "Bash"]
 *   model: sonnet
 *   ---
 *   <system prompt body>
 *
 * Before this, those personas were only tallied for display — the tower's
 * spawnable roster was a separate hardcoded set of 35 animal agents, so the
 * specialists the operator authored could never be dispatched. This loader
 * turns each persona file into a tower registry entry whose system prompt IS
 * the persona body.
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');

// A small emoji palette so persona agents render in the tower UI alongside
// the animal roster. Deterministic by name hash — no Math.random.
const PERSONA_EMOJIS = ['🧭', '🔧', '🧠', '🛡️', '🔬', '📐', '⚗️', '🗂️', '🩺', '📊', '🧩', '⚙️', '🪛', '📎'];

function pickEmoji(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PERSONA_EMOJIS[h % PERSONA_EMOJIS.length];
}

function parseFrontmatter(content) {
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content, hasFrontmatter: false };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if (/^\[.*\]$/.test(val)) {
      try { val = JSON.parse(val.replace(/'/g, '"')); } catch { /* keep string */ }
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    meta[kv[1].toLowerCase()] = val;
  }
  return { meta, body: m[2].trim(), hasFrontmatter: true };
}

/**
 * Load all persona definitions from agents/*.md.
 *
 * Skips files with no YAML frontmatter (those are docs about the agents/
 * directory itself, not personas — e.g. `AGENT.md`). The previous version
 * loaded them as empty personas which polluted the tower registry.
 * @returns {Array<{key,name,role,description,tools,model,emoji,personaPrompt}>}
 */
function loadPersonas(dir = AGENTS_DIR) {
  const out = [];
  let files;
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    let content;
    try { content = fs.readFileSync(path.join(dir, file), 'utf8'); } catch { continue; }
    const { meta, body, hasFrontmatter } = parseFrontmatter(content);
    if (!hasFrontmatter) continue;  // skip docs files like AGENT.md
    const name = (meta.name || file.replace(/\.md$/, '')).trim();
    const key = name.toLowerCase();
    const description = (meta.description || `${name} specialist agent`).trim();
    out.push({
      key,
      name,
      role: description.split(/[.!]/)[0].slice(0, 60) || name,
      description,
      tools: Array.isArray(meta.tools) ? meta.tools : [],
      model: meta.model || null,
      emoji: pickEmoji(name),
      personaPrompt: body || description,
    });
  }
  return out;
}

/**
 * Build tower-registry entries from the persona files, shaped exactly like
 * the hardcoded animal registry so spawnAgent() can look them up. The persona
 * body rides along as `personaPrompt` for the prompt builder to prefer.
 * @returns {Object<string, registryEntry>}
 */
function personaRegistryEntries(dir = AGENTS_DIR) {
  const entries = {};
  for (const p of loadPersonas(dir)) {
    entries[p.key] = {
      name: p.name,
      emoji: p.emoji,
      division: 'SPECIALIST',
      role: p.role,
      tier: 2,
      skills: Array.isArray(p.tools) ? p.tools.map(t => String(t).toLowerCase()) : [],
      status: 'idle',
      source: 'persona-file',
      model: p.model,
      personaPrompt: p.personaPrompt,
    };
  }
  return entries;
}

module.exports = { loadPersonas, personaRegistryEntries, parseFrontmatter, AGENTS_DIR };
