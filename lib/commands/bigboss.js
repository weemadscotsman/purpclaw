'use strict';
/**
 * lib/commands/bigboss.js — meta-layer slash commands for full stack control.
 * Wires into the ask command's slash handler so the Big Boss agent can
 * drive the entire PURPCLAW stack from the chat.
 *
 * All commands: /bigboss <subcommand> [args...]
 * Also accessible as just the subcommand name when unambiguous.
 */

const { execSafe } = require('../child-registry');
const path = require('path');
const fs = require('fs');

const PURP_DIR = path.resolve(__dirname, '..', '..');
const API_PORT = process.env.API_PORT || 7780;
// PM2 path on Windows — the .cmd file needs shell:true, so we use node + the real script
const PM2 = (() => {
  const candidates = [
    ['C:/Program Files/nodejs/node.exe', 'C:/Users/Admin/AppData/Roaming/npm/node_modules/pm2/bin/pm2'],
    ['node', 'pm2'],
  ];
  for (const [node, script] of candidates) {
    try {
      if (fs.existsSync(node) || node === 'node') return { node, script };
    } catch {}
  }
  return { node: 'node', script: 'pm2' };
})();

// ── HTTP helper ──────────────────────────────────────────────────────
async function apiGet(path) {
  return fetch(`http://127.0.0.1:${API_PORT}${path}`, { signal: AbortSignal.timeout(5000) })
    .then(r => r.ok ? r.json() : { error: r.statusText })
    .catch(e => ({ error: e.message }));
}

async function apiPost(path, body) {
  return fetch(`http://127.0.0.1:${API_PORT}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000)
  }).then(r => r.ok ? r.json() : { error: r.statusText })
   .catch(e => ({ error: e.message }));
}

// ── Command implementations ──────────────────────────────────────────

async function cmdStatus() {
  const list = await execSafe(PM2.node, [PM2.script, 'list'], { timeoutMs: 8000, windowsHide: true });
  const lines = (list.stdout || '').split('\n');
  const online = lines.filter(l => l.includes('online')).length;
  const errored = lines.filter(l => l.includes('errored')).length;
  const stopped = lines.filter(l => l.includes('stopped')).length;
  const total = online + errored + stopped;
  return `${online}/${total} services online · ${errored} errored · ${stopped} stopped`;
}

async function cmdHeal() {
  // Try to restart dead PM2 services
  const list = await execSafe(PM2.node, [PM2.script, 'list'], { timeoutMs: 8000, windowsHide: true });
  const lines = (list.stdout || '').split('\n');
  const dead = [];
  for (const line of lines) {
    const m = line.match(/│\s+(\d+)\s+│\s+(purpclaw-\S+)/);
    if (m && (line.includes('errored') || line.includes('stopped'))) {
      dead.push(m[2]);
    }
  }
  if (!dead.length) return 'all services already healthy';
  const results = [];
  for (const name of dead.slice(0, 5)) {
    try {
      await execSafe(PM2.node, [PM2.script, 'start', name, '--update-env'], { timeoutMs: 10000, windowsHide: true });
      results.push(`${name} restarted`);
    } catch { results.push(`${name} failed to restart`); }
  }
  return results.join(' · ');
}

async function cmdAgentList() {
  // Read from agent_tower.js or the skills directory
  try {
    const dirs = fs.readdirSync(path.join(PURP_DIR, 'skills')).filter(d => {
      try { return fs.statSync(path.join(PURP_DIR, 'skills', d)).isDirectory(); }
      catch { return false; }
    });
    const divisions = {};
    for (const d of dirs) {
      const agentMd = path.join(PURP_DIR, 'skills', d, 'AGENT.md');
      let div = 'UNKNOWN';
      if (fs.existsSync(agentMd)) {
        const content = fs.readFileSync(agentMd, 'utf-8');
        const dm = content.match(/division:\s*(\S+)/i);
        if (dm) div = dm[1].toUpperCase();
      }
      if (!divisions[div]) divisions[div] = [];
      divisions[div].push(d);
    }
    return Object.entries(divisions).map(([div, agents]) =>
      `${div}: ${agents.length} agents`
    ).join(' · ');
  } catch {
    return 'failed to read agent index';
  }
}

async function cmdAgentSpawn(name, task) {
  const r = await apiPost('/api/agents/spawn', { name, task, priority: 'normal' });
  return r.error ? `spawn failed: ${r.error}` : `${name} spawned: ${r.jobId || 'ok'}`;
}

async function cmdAgentKill(name) {
  const r = await apiPost('/api/agents/kill', { name });
  return r.error ? `kill failed: ${r.error}` : `${name} terminated`;
}

async function cmdSwarm(goal) {
  const r = await apiPost('/api/chat/swarm', { message: goal });
  if (r.error) return `swarm failed: ${r.error}`;
  return `swarm launched on: "${goal.slice(0, 60)}..."`;
}

async function cmdToolList() {
  try {
    const tools = require('../tools');
    const all = tools.list();
    const builtin = all.filter(t => !t.name.startsWith('mcp__')).length;
    const mcp = all.filter(t => t.name.startsWith('mcp__')).length;
    return `${all.length} tools total · ${builtin} built-in · ${mcp} MCP`;
  } catch { return 'tools module unavailable'; }
}

async function cmdToolRun(name, argsStr) {
  try {
    const tools = require('../tools');
    let args = {};
    try { args = JSON.parse(argsStr || '{}'); } catch { args = { query: argsStr }; }
    const r = await tools.invoke(name, args);
    if (!r.ok) return `tool error: ${r.error || 'failed'}`;
    const preview = (r.content || r.output || JSON.stringify(r)).substring(0, 200);
    return `⚡ ${name} → ${preview}`;
  } catch (e) {
    return `tool error: ${e.message}`;
  }
}

async function cmdMemoryRecall(query) {
  const r = await apiGet(`/api/memory/search?q=${encodeURIComponent(query)}`);
  if (r.error) return `memory error: ${r.error}`;
  const entries = r.results || r.data || [];
  if (!entries.length) return 'no matching memories';
  return entries.slice(0, 3).map((e, i) =>
    `${i + 1}. ${e.content || e.text || JSON.stringify(e).substring(0, 100)}`
  ).join('\n');
}

async function cmdMemoryIngest(content) {
  const r = await apiPost('/api/memory/ingest', { content, type: 'text', importance: 'medium' });
  return r.error ? `ingest failed: ${r.error}` : 'memory stored';
}

async function cmdDiagnose() {
  const r = await apiGet('/api/diagnostics/run');
  if (r.error) return `diagnostics error: ${r.error}`;
  const findings = r.findings || r.data || [];
  if (!findings.length) return 'no issues found';
  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARNING');
  let msg = `${findings.length} findings`;
  if (critical.length) msg += ` · ${critical.length} critical`;
  if (errors.length) msg += ` · ${errors.length} errors`;
  if (warnings.length) msg += ` · ${warnings.length} warnings`;
  return msg;
}

async function cmdEvolve() {
  const r = await apiPost('/api/kernel/jobs', {
    goal: 'autoresearch iteration', route: 'training', priority: 'low'
  });
  return r.error ? `evolve failed: ${r.error}` : 'ratchet tick queued';
}

async function cmdVoiceSpeak(text) {
  const { execSafe } = require('../child-registry');
  const py = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
  const tts = path.join(__dirname, '..', '..', 'scripts', 'speak_kokoro.py');
  if (!fs.existsSync(tts)) return 'TTS script not found';
  execSafe(py, [tts, text], { timeoutMs: 30000, windowsHide: true }).catch(() => {});
  return `🔊 "${text.substring(0, 60)}"`;
}

async function cmdVoiceListen(seconds) {
  const s = parseInt(seconds) || 5;
  const r = await apiPost('/api/stt/transcribe', { duration: s });
  return r.error ? `listen failed: ${r.error}` : `heard: "${(r.text || '').substring(0, 100)}"`;
}

async function cmdVisionCapture() {
  const r = await apiPost('/api/vision/capture', {});
  return r.error ? `capture failed: ${r.error}` : `capture saved: ${r.path || 'ok'}`;
}

async function cmdJobList() {
  const r = await apiGet('/api/kernel/jobs');
  if (r.error) return `jobs error: ${r.error}`;
  const jobs = Array.isArray(r) ? r : (r.jobs || r.data || []);
  if (!jobs.length) return 'no kernel jobs';
  return jobs.slice(0, 5).map(j =>
    `#${j.id || j.jobId} · ${j.state || j.status} · ${(j.goal || '').substring(0, 40)}`
  ).join('\n');
}

async function cmdJobRetry(id) {
  const r = await apiPost('/api/kernel/jobs/retry', { id });
  return r.error ? `retry failed: ${r.error}` : `job #${id} retrying`;
}

// ── Registry ─────────────────────────────────────────────────────────

const COMMANDS = {
  status:     { run: cmdStatus, desc: 'Show stack health (PM2 status, service counts)' },
  heal:       { run: cmdHeal, desc: 'Auto-recovery: restart dead services' },
  agents:     { run: async (args) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];
    const rest = parts.slice(1).join(' ');
    if (sub === 'list') return cmdAgentList();
    if (sub === 'spawn' && parts[1]) return cmdAgentSpawn(parts[1], rest.substring(parts[1].length).trim());
    if (sub === 'kill' && parts[1]) return cmdAgentKill(parts[1]);
    return 'usage: agents list | spawn <name> <task> | kill <name>';
  }, desc: 'Manage agents: list, spawn <name> <task>, kill <name>' },
  swarm:      { run: cmdSwarm, desc: 'Launch full swarm on a goal: swarm <goal>' },
  tools:      { run: async (args) => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    if (sub === 'list' || !sub) return cmdToolList();
    if (sub === 'run') return cmdToolRun(rest[0], rest.slice(1).join(' '));
    return 'usage: tools list | run <name> <json-args>';
  }, desc: 'List or run tools: tools list | run <name> <json>' },
  memory:     { run: async (args) => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    const content = rest.join(' ');
    if (sub === 'recall') return cmdMemoryRecall(content || '');
    if (sub === 'ingest') return cmdMemoryIngest(content || '');
    return 'usage: memory recall <query> | ingest <content>';
  }, desc: 'Query or store memory: memory recall <q> | ingest <text>' },
  diagnose:   { run: cmdDiagnose, desc: 'Full autonomous diagnostics (5 agents, causal graph)' },
  evolve:     { run: cmdEvolve, desc: 'Trigger one Karpathy ratchet iteration' },
  voice:      { run: async (args) => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    const text = rest.join(' ');
    if (sub === 'speak') return cmdVoiceSpeak(text || '');
    if (sub === 'listen') return cmdVoiceListen(rest[0] || '5');
    return 'usage: voice speak <text> | listen <seconds>';
  }, desc: 'Voice ops: speak <text> | listen <seconds>' },
  vision:     { run: async (args) => {
    const [sub] = args.trim().split(/\s+/);
    if (sub === 'capture') return cmdVisionCapture();
    return 'usage: vision capture';
  }, desc: 'Capture camera/screen: vision capture' },
  jobs:       { run: async (args) => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    if (sub === 'list' || !sub) return cmdJobList();
    if (sub === 'retry') return cmdJobRetry(rest[0] || '');
    return 'usage: jobs list | retry <id>';
  }, desc: 'Kernel job management: jobs list | retry <id>' },
  reset:      { run: async () => '(session reset — conversation cleared)', desc: 'Clear conversation, keep long-term memory' },
  help:       { run: async () => {
    return Object.entries(COMMANDS).map(([k, v]) => `  /bigboss ${k.padEnd(16)} ${v.desc}`).join('\n');
  }, desc: 'Show this help' },
};

// ── Entry point ──────────────────────────────────────────────────────

function run(cmd, args = '') {
  const handler = COMMANDS[cmd];
  if (!handler) return Promise.resolve(`unknown bigboss command: ${cmd}\n  try /bigboss help`);
  return handler.run(args);
}

function help() {
  return 'Big Boss meta-commands — full stack control from the chat:\n' +
    Object.entries(COMMANDS).map(([k, v]) => `  /bigboss ${k.padEnd(16)} ${v.desc}`).join('\n') +
    '\n\nAlso works as just the subcommand name (e.g. "status" instead of "/bigboss status")';
}

module.exports = { run, help, COMMANDS };
