'use strict';
/**
 * lib/mcp-resources.js — Built-in MCP resources for PURPCLAW.
 *
 * Resources are app-controlled, URI-addressed, like GET endpoints.
 * Each handler returns either a string (auto-wrapped) or
 * { contents: [{ uri, mimeType, text|blob, _meta? }, ...] }.
 *
 * Naming convention: purpclaw://<area>/<id>
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PURP_ROOT = path.resolve(__dirname, '..');

function safeReadJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return fallback; }
}

function safeReadText(filePath, maxBytes = 64 * 1024) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(Math.min(maxBytes, fs.fstatSync(fd).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch (e) { return `<read error: ${e.message}>`; }
}

function truncate(s, max = 8000) {
  if (typeof s !== 'string') s = JSON.stringify(s, null, 2);
  return s.length > max ? s.slice(0, max) + `\n… (truncated, ${s.length - max} more bytes)` : s;
}

// ── resource: purpclaw://status ─────────────────────────────────────────────
async function readStatus() {
  return {
    contents: [{
      uri: 'purpclaw://status',
      mimeType: 'application/json',
      text: JSON.stringify({
        service: 'purpclaw',
        node: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        cwd: process.cwd(),
        root: PURP_ROOT,
        ts: new Date().toISOString(),
      }, null, 2),
    }],
  };
}

// ── resource template: purpclaw://service/{name} ───────────────────────────
function readService({ params }) {
  const name = params.name;
  const reg  = require('../service_registry.js');
  const svc  = reg.getService(name);
  if (!svc) return { contents: [{ uri: `purpclaw://service/${name}`, mimeType: 'text/plain', text: `service not found: ${name}` }] };
  return {
    contents: [{
      uri: `purpclaw://service/${name}`,
      mimeType: 'application/json',
      text: JSON.stringify(svc, null, 2),
    }],
  };
}

// ── resource: purpclaw://services (all registered) ─────────────────────────
function readServices() {
  const reg = require('../service_registry.js');
  return {
    contents: [{
      uri: 'purpclaw://services',
      mimeType: 'application/json',
      text: JSON.stringify({
        count: reg.SERVICES.length,
        core: reg.CORE_PM2_NAMES,
        optional: reg.OPTIONAL_PM2_NAMES,
        services: reg.SERVICES,
      }, null, 2),
    }],
  };
}

// ── resource: purpclaw://skills (registered skills) ────────────────────────
async function readSkills() {
  const skillsDir = path.join(PURP_ROOT, 'skills');
  const skills = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === '_legacy') continue;
      const skillFile = path.join(skillsDir, e.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const stat = fs.statSync(skillFile);
      const head = safeReadText(skillFile, 2048);
      // first non-heading line = description heuristic
      const desc = (head.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').trim().slice(0, 240);
      skills.push({ name: e.name, description: desc, mtime: stat.mtime.toISOString() });
    }
  } catch (e) { /* ignore */ }
  return {
    contents: [{
      uri: 'purpclaw://skills',
      mimeType: 'application/json',
      text: JSON.stringify({ count: skills.length, skills }, null, 2),
    }],
  };
}

// ── resource template: purpclaw://skill/{name} ─────────────────────────────
async function readSkill({ params }) {
  const name = params.name;
  if (!name || /[.\\/]/.test(name)) return { contents: [{ uri: `purpclaw://skill/${name}`, mimeType: 'text/plain', text: 'invalid skill name' }] };
  const skillFile = path.join(PURP_ROOT, 'skills', name, 'SKILL.md');
  const text = safeReadText(skillFile, 64 * 1024);
  if (!text) return { contents: [{ uri: `purpclaw://skill/${name}`, mimeType: 'text/plain', text: `skill not found: ${name}` }] };
  return { contents: [{ uri: `purpclaw://skill/${name}`, mimeType: 'text/markdown', text: truncate(text) }] };
}

// ── resource: purpclaw://memory/recent (last N entries from samantha_memory.json) ──
function readMemoryRecent() {
  const memFile = path.join(PURP_ROOT, 'samantha_memory.json');
  const data = safeReadJson(memFile, null);
  if (!data) return { contents: [{ uri: 'purpclaw://memory/recent', mimeType: 'application/json', text: '{"entries":[]}' }] };
  const entries = Array.isArray(data.entries) ? data.entries : (Array.isArray(data) ? data : []);
  return {
    contents: [{
      uri: 'purpclaw://memory/recent',
      mimeType: 'application/json',
      text: JSON.stringify({ total: entries.length, recent: entries.slice(-10) }, null, 2),
    }],
  };
}

// ── resource: purpclaw://agents (agent_profiles.json summary) ─────────────
function readAgents() {
  const profiles = safeReadJson(path.join(PURP_ROOT, 'agent_profiles.json'), { agents: [] });
  const agents = (profiles.agents || []).map(a => ({
    id: a.id, name: a.name, division: a.division, role: a.role,
  }));
  return {
    contents: [{
      uri: 'purpclaw://agents',
      mimeType: 'application/json',
      text: JSON.stringify({ count: agents.length, agents }, null, 2),
    }],
  };
}

// ── resource template: purpclaw://agent/{id} ───────────────────────────────
function readAgent({ params }) {
  const id = params.id;
  const profiles = safeReadJson(path.join(PURP_ROOT, 'agent_profiles.json'), { agents: [] });
  const agent = (profiles.agents || []).find(a => a.id === id);
  if (!agent) return { contents: [{ uri: `purpclaw://agent/${id}`, mimeType: 'text/plain', text: `agent not found: ${id}` }] };
  return { contents: [{ uri: `purpclaw://agent/${id}`, mimeType: 'application/json', text: JSON.stringify(agent, null, 2) }] };
}

// ── resource: purpclaw://system/pulse (live from lib/pulse if loaded) ─────
function readPulse() {
  try {
    const pulse = require('./pulse');
    const status = (typeof pulse.status === 'function') ? pulse.status() : { ok: true, note: 'pulse loaded' };
    return { contents: [{ uri: 'purpclaw://system/pulse', mimeType: 'application/json', text: JSON.stringify(status, null, 2) }] };
  } catch (e) {
    return { contents: [{ uri: 'purpclaw://system/pulse', mimeType: 'text/plain', text: `pulse unavailable: ${e.message}` }] };
  }
}

// ── registration helper ────────────────────────────────────────────────────
function registerAll(server) {
  server.registerResource({ uri: 'purpclaw://status',          name: 'status',          description: 'PURPCLAW process status (node, platform, uptime, pid)', mimeType: 'application/json', handler: readStatus });
  server.registerResource({ uri: 'purpclaw://services',        name: 'services',        description: 'Full PM2 service registry with ports, health paths, groups', mimeType: 'application/json', handler: readServices });
  server.registerResource({ uri: 'purpclaw://skills',          name: 'skills',          description: 'Index of all installed skills (name, description, mtime)',  mimeType: 'application/json', handler: readSkills });
  server.registerResource({ uri: 'purpclaw://memory/recent',   name: 'memory_recent',   description: 'Last 10 entries from samantha_memory.json',                 mimeType: 'application/json', handler: readMemoryRecent });
  server.registerResource({ uri: 'purpclaw://agents',          name: 'agents',          description: 'Agent registry summary (id, name, division, role)',          mimeType: 'application/json', handler: readAgents });
  server.registerResource({ uri: 'purpclaw://system/pulse',    name: 'pulse',           description: 'Live stack pulse from lib/pulse',                             mimeType: 'application/json', handler: readPulse });

  server.registerResourceTemplate({ uriTemplate: 'purpclaw://service/{name}', name: 'service_detail', description: 'Single service definition by key (e.g. api, tower)',  mimeType: 'application/json', handler: readService });
  server.registerResourceTemplate({ uriTemplate: 'purpclaw://skill/{name}',   name: 'skill_detail',   description: 'Full SKILL.md body for a single skill',              mimeType: 'text/markdown',    handler: readSkill });
  server.registerResourceTemplate({ uriTemplate: 'purpclaw://agent/{id}',     name: 'agent_detail',   description: 'Full agent profile (id, name, division, role, skills)', mimeType: 'application/json', handler: readAgent });
}

module.exports = { registerAll };
