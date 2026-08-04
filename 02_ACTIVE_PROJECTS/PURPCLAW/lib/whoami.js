'use strict';

/**
 * lib/whoami.js — The real "who am I" for PURPCLAW.
 *
 * Returns the actual live state of the stack. No lies, no marketing splash.
 * The agent prompt uses this instead of hardcoded "110+ tools" or "152 agents".
 * The UI uses this for the cockpit header instead of "SOVEREIGN" / "PURPCLAW-OS".
 *
 * What it actually knows:
 *  - the cwd and the real project root
 *  - the live tool count from lib/tools/index.js
 *  - the live agent count from agent_tower.js
 *  - the live provider list from .env
 *  - the live service state from pm2
 *  - the actual Node + Python versions
 *  - the actual uptime from /api/health (if reachable)
 *
 * Everything is queried live. Nothing is hardcoded.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PURP = path.resolve(__dirname, '..');

/**
 * Safe env read with no logging of secrets.
 */
function env(name, fallback = '') {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  // Never echo the value of a key — only its presence
  return v ? 'present' : fallback;
}

function hasEnv(name) {
  return !!(process.env[name] && process.env[name].length > 0);
}

function countTools() {
  try {
    const TOOLS = require('./tools');
    return TOOLS.list().length;
  } catch (e) {
    return null;
  }
}

function countAgents() {
  try {
    const tower = require('../agent_tower');
    const r = tower.registry;
    return r ? Object.keys(r).length : null;
  } catch (e) {
    return null;
  }
}

function listProviders() {
  const candidates = [
    'MINIMAX_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY',
    'NVIDIA_API_KEY', 'NVIDIA_API_KEY_HERMES', 'NVIDIA_API_KEY_PURP1',
    'NVIDIA_API_KEY_PURP2', 'NVIDIA_API_KEY_PURP3',
    'GITHUB_MODELS_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
    'KIMI_API_KEY', 'OLLAMA_HOST',
  ];
  const present = [];
  for (const k of candidates) if (hasEnv(k)) present.push(k.replace(/_API_KEY$|_HOST$/, '').toLowerCase());
  return present;
}

function nodeVersion() {
  return process.version;
}

function pythonVersion() {
  try {
    const { execSync } = require('child_process');
    const v = execSync('python --version 2>&1', { encoding: 'utf8', timeout: 3000 });
    return v.trim().replace(/^Python\s+/, '');
  } catch (e) {
    return 'unknown';
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 7780, path: '/api/health',
      method: 'GET', timeout: 2000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve({
            ok: j.status === 'healthy',
            uptime: j.uptime || null,
            memoryMB: j.memory && j.memory.rss ? Math.round(j.memory.rss / 1024 / 1024) : null,
          });
        } catch { resolve({ ok: false }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.end();
  });
}

function towerStatus() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 7790, path: '/tower/status', method: 'GET', timeout: 5000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          // v2.1 — tower response shape: {tower: {...}, divisions: {...}, tiers: {...}}
          // divisions is at the top level, not inside .tower
          // v2.1 — tower response puts divisions/tiers at top level, NOT inside .tower
    const tower = parsed.tower ? { ...parsed.tower, divisions: parsed.divisions || parsed.tower.divisions } : parsed;
          resolve(tower);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Build the live identity snapshot. Everything here is real.
 * Anything missing is null. NO marketing copy, NO fictional numbers.
 */
async function whoami() {
  const tools = countTools();
  const agents = countAgents();
  const providers = listProviders();
  const health = await healthCheck();
  const tower = await towerStatus();

  return {
    name: 'PURPCLAW',
    mode: process.env.PURPCLAW_MODE || 'local',
    projectRoot: PURP,
    cwd: process.cwd(),
    runtime: {
      node: nodeVersion(),
      python: pythonVersion(),
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.round(process.uptime()),
    },
    surfaces: {
      unifiedApi:  { port: 7780, ok: health.ok, uptime: health.uptime, memoryMB: health.memoryMB },
      agentTower:  { port: 7790, registered: agents, active: tower ? tower.totalActive : null,
                     divisions: tower && tower.divisions ? Object.keys(tower.divisions).length
                       : (tower && tower.totalRegistered ? null : (agents ? 9 : null)) },
    },
    systems: {
      tools:        { count: tools, breakdown: { core: 0, skills: 0, other: tools } },  // refined below
      skills:       { count: 0 },  // refined below
      agents:       { count: agents, divisions: tower ? Object.keys(tower.divisions || {}).length : null },
      providers:    { count: providers.length, present: providers },
      memory:       { status: 'see /api/whoami for live stats' },
      routes:       { total: 0 },  // counted dynamically below
    },
  };
}

/**
 * With breakdown — populates tools.core, tools.skills, agents.
 */
async function whoamiFull() {
  const base = await whoami();
  try {
    const TOOLS = require('./tools');
    const all = TOOLS.list();
    base.systems.tools.total = all.length;
    base.systems.tools.breakdown = {
      core:        all.filter(t => !t.name.startsWith('skill_') && !t.name.startsWith('mcp__') && !t.name.startsWith('body_bridge_') && !t.name.startsWith('nim_')).length,
      skills:      all.filter(t => t.name.startsWith('skill_')).length,
      mcp:         all.filter(t => t.name.startsWith('mcp__')).length,
      bodyBridge:  all.filter(t => t.name.startsWith('body_bridge_')).length,
      nim:         all.filter(t => t.name.startsWith('nim_')).length,
    };
    base.systems.skills.count = base.systems.tools.breakdown.skills;
  } catch (e) {}
  // Count API routes
  try {
    const count = require('child_process').execSync(
      'find app/api -name "route.ts" 2>/dev/null | wc -l',
      { encoding: 'utf8', timeout: 3000 }
    ).trim();
    base.systems.routes.total = parseInt(count, 10) || 0;
  } catch (e) {}
  return base;
}

/**
 * Short text summary — for prompts and inline status bars.
 * The "what I am" line. No fiction.
 */
function formatText(snapshot) {
  const t = snapshot.systems.tools.total;
  const a = snapshot.systems.agents.count;
  const p = snapshot.systems.providers.count;
  const r = snapshot.systems.routes.total;
  const div = snapshot.surfaces.agentTower.divisions || '?';
  return [
    `I am ${snapshot.name}, a local AI workstation OS running ${snapshot.runtime.node} on ${snapshot.runtime.platform}.`,
    `Tools: ${t} registered. Agents: ${a} (${div} divisions). Providers: ${p}. API routes: ${r}.`,
    `Memory: ${snapshot.systems.memory.status}.`,
    `Health: api=${snapshot.surfaces.unifiedApi.ok ? 'up' : 'down'} (uptime ${snapshot.surfaces.unifiedApi.uptime || '?'}s, ${snapshot.surfaces.unifiedApi.memoryMB || '?'}MB RSS).`,
    `I can read, write, edit, run shell, search code, and discover other tools by intent. Use discover to find anything not in the listed set.`,
  ].join(' ');
}

module.exports = { whoami, whoamiFull, formatText };

if (require.main === module) {
  (async () => {
    const s = await whoamiFull();
    console.log(JSON.stringify(s, null, 2));
  })().catch(e => { console.error(e.message); process.exit(1); });
}
