'use strict';

/**
 * PURPCLAW Self-Context
 * =====================
 * Builds a LIVE self-description by reading actual system state:
 *   - Service reachability (real HTTP checks)
 *   - Agent scores (real success rates from agent_score.json)
 *   - Recent lessons (what worked / what failed)
 *   - LLM call history (cost, providers, volume)
 *   - Evolution loop history (what the system researched about itself)
 *   - Memory matrix state
 *
 * This is injected into every swarm agent's system prompt so agents
 * operate with full knowledge of the stack they're running inside.
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');
const { privacyPromptBlock } = require('./runtime/privacy-policy');

const ROOT = path.join(__dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJsonSafe(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function readJsonlTail(filePath, n = 10) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean).slice(-n)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

async function pingService(port, path_ = '/', timeoutMs = 2500) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: path_, timeout: timeoutMs }, res => {
      resolve({ up: true, code: res.statusCode });
    });
    req.on('error', () => resolve({ up: false }));
    req.on('timeout', () => { req.destroy(); resolve({ up: false, reason: 'timeout' }); });
  });
}

// ── Live data collectors ──────────────────────────────────────────────────────

async function getLiveServiceState() {
  const services = [
    { name: 'Unified API',       port: 7780, path: '/api/status',    file: 'unified_api.js' },
    { name: 'Voice Coordinator', port: 7781, path: '/health',        file: 'voice_coordinator.js' },
    { name: 'Event Bus',         port: 7782, path: '/health',        file: 'unified_eventbus.js' },
    { name: 'State Store',       port: 7783, path: '/health',        file: 'unified_state.js' },
    { name: 'Orchestrator',      port: 7784, path: '/api/health',    file: 'orchestrator.js' },
    { name: 'Agent Tower',       port: 7790, path: '/tower/status',  file: 'agent_tower.js' },
    { name: 'Voice Bridge',      port: 7792, path: '/health',        file: 'voice_bridge_7792.js' },
    { name: 'Memory Matrix',     port: 7880, path: '/memory/health', file: 'cognitive_spine.py' },
    { name: 'Metrics',           port: 7890, path: '/health',        file: 'metrics_aggregator.js' },
    { name: 'Speech To Text',    port: 7896, path: '/health',        file: 'voice_stt.py' },
    { name: 'Mission Control',   port: 3030, path: '/mission',       file: 'app/', timeoutMs: 8000 },
  ];
  const results = await Promise.all(services.map(async svc => {
    const r = await pingService(svc.port, svc.path, svc.timeoutMs);
    return { ...svc, up: r.up, code: r.code };
  }));
  return results;
}

function getAgentScores() {
  const data = readJsonSafe(path.join(ROOT, 'agent_score.json'), {});
  const agents = data.agents || {};
  return Object.entries(agents)
    .filter(([, d]) => (d.totalTasks || 0) > 0)
    .map(([name, d]) => ({
      name,
      totalTasks: d.totalTasks || 0,
      successRate: d.totalTasks > 0 ? Math.round(((d.successes || d.successCount || 0) / d.totalTasks) * 100) : 0,
      avgDuration: d.avgDuration ? Math.round(d.avgDuration) + 'ms' : '?',
      bugRate: d.bugRate ? `${(d.bugRate * 100).toFixed(1)}%` : '0%',
      lastTask: String(d.lastTask || '').slice(0, 60),
    }))
    .sort((a, b) => b.successRate - a.successRate || b.totalTasks - a.totalTasks);
}

function getRecentLessons(n = 8) {
  const all = readJsonlTail(path.join(ROOT, 'agent_work', 'harness_lessons.jsonl'), 20);
  const recent = all.slice(-n);
  return {
    total: (() => { try { return fs.readFileSync(path.join(ROOT, 'agent_work', 'harness_lessons.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } })(),
    recent: recent.map(l => ({
      agent: l.agent,
      success: l.success,
      task: String(l.task || l.text || '').slice(0, 80),
      ts: String(l.timestamp || '').slice(11, 19),
    })),
  };
}

function getLLMLedger() {
  const lines = readJsonlTail(path.join(ROOT, 'agent_work', 'llm-ledger.jsonl'), 200);
  const total = (() => { try { return fs.readFileSync(path.join(ROOT, 'agent_work', 'llm-ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } })();
  const providers = {};
  let totalTokens = 0;
  lines.forEach(l => {
    if (!l) return;
    providers[l.provider] = (providers[l.provider] || 0) + 1;
    totalTokens += (l.tokens || 0);
  });
  return { total, providers, totalTokens };
}

function getEvolutionHistory() {
  const ticks = readJsonlTail(path.join(ROOT, 'agent_work', 'evolution-log.jsonl'), 5);
  return ticks.map(t => ({
    ts: String(t.startedAt || '').slice(0, 19),
    topic: String(t.topic || '').slice(0, 100),
    status: t.status,
    models: t.modelsAnswered,
    memoryIngested: t.memoryIngested,
    synthesis: String(t.synthesis || '').slice(0, 300),
  }));
}

function getBenchmarks() {
  const runs = readJsonlTail(path.join(ROOT, 'agent_work', 'harness_benchmark.jsonl'), 3);
  return runs.map(r => ({
    ts: String(r.ts || r.startedAt || '').slice(0, 19),
    passRate: r.summary?.completionRate ? Math.round(r.summary.completionRate * 100) + '%' : '?',
    goals: r.summary?.totalGoals || 0,
    passAt1: r.summary?.passAt1 ? Math.round(r.summary.passAt1 * 100) + '%' : '?',
  }));
}

function getSkillCatalog() {
  const reg = readJsonSafe(path.join(ROOT, 'registry', 'index.json'), {});
  const skills = Array.isArray(reg.skills) ? reg.skills : [];
  return {
    total: reg.total_skills || skills.length,
    updated: reg.updated || null,
    skills: skills.map(s => ({
      name: s.name,
      desc: String(s.description || '').replace(/\s+/g, ' ').slice(0, 90),
      file: s.file,
    })),
  };
}

// Live swarm roster from the running Agent Tower (no side effects — HTTP only).
// Falls back to null when the tower is down; caller substitutes a static roster.
function fetchTowerRoster(timeoutMs = 2500) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port: 7790, path: '/tower/status', timeout: timeoutMs }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const registered = data.registeredAgents || [];
          if (!registered.length) return resolve(null);
          const byDiv = {};
          for (const a of registered) {
            const div = a.division || 'UNASSIGNED';
            (byDiv[div] = byDiv[div] || []).push(a.name);
          }
          resolve({ count: registered.length, byDivision: byDiv });
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Static fallback roster — used only when the live tower is unreachable.
const STATIC_DIVISION_ROSTER = [
  'ENGINEERING: dragon, robot, mushroom, cat, turtle, lizard, wolf, bee',
  'INTELLIGENCE: ghost, spider, raven, fox, hawk, jellyfish, kraken, moth',
  'SECURITY: bunny, octopus, owl, rabbit, snake, guardian',
  'INFRASTRUCTURE: cactus, void',
  'MANAGEMENT: penguin, karen, lemur, navigator',
  'OPERATIONS: beetle, shark, gorilla, elephant, claw',
  'SCIENCE: scientist, chart, innovator, numbers',
  'CREATIVE: phoenix, panda, parrot, shaman',
  'MEDIA_OPS: duck, goose, crow',
];

// ── Main context builder ──────────────────────────────────────────────────────

async function buildSelfContextAsync(agentName = 'agent', taskContext = '') {
  const [services, agentScores, lessons, llm, evolution, benchmarks, roster] = await Promise.all([
    getLiveServiceState(),
    Promise.resolve(getAgentScores()),
    Promise.resolve(getRecentLessons()),
    Promise.resolve(getLLMLedger()),
    Promise.resolve(getEvolutionHistory()),
    Promise.resolve(getBenchmarks()),
    fetchTowerRoster(),
  ]);
  const catalog = getSkillCatalog();

  const lines = [
    '## PURPCLAW — LIVE SYSTEM STATE',
    '',
    'PURPCLAW is a persistent AI orchestration runtime. You are a swarm agent executing inside it.',
    'This context is generated from live system data, not documentation.',
    '',
    privacyPromptBlock(),
    '',
    '### Live Services',
  ];

  services.forEach(svc => {
    lines.push(`  ${svc.up ? '✓' : '✗'} :${svc.port} ${svc.name} (${svc.file})`);
  });

  const upCount = services.filter(s => s.up).length;
  lines.push(`  ${upCount}/${services.length} services reachable`);

  lines.push('', '### Key Source Files (the actual code you can reason about)');
  [
    ['unified_api.js', 'Main HTTP gateway — routes /api/chat, /api/kernel/jobs, /api/harness/*, /api/research/*'],
    ['agent_tower.js', 'Agent spawning — /api/spawn/await, registers 44 agents across 9 divisions'],
    ['swarm_coordinator.js', 'Task decomposition + multi-agent routing — coordinateMission(), startMission()'],
    ['task_decomposer.js', 'Semantic clause splitting — returns null for simple tasks (single-agent fallback)'],
    ['lib/api-harness-kernel.js', 'Kernel job lifecycle — createJob(), runJob(), routes: swarm-coordinator, deep-research-group, harness-engine'],
    ['lib/llm-provider.js', 'LLM routing — chat(), swarm(), primary: MiniMax M3, fallback: Ollama'],
    ['lib/deep-research-group.js', 'OpenRouter group research — listFreeModels(), runGroupResearch()'],
    ['lib/self-evolution-loop.js', 'Auto-research loop — fires every 30 min, ingest to memory matrix'],
    ['lib/memory-client.js', 'Memory matrix wrapper — /memory/recall and /memory/ingest through cognitive spine :7880'],
    ['lib/self-context.js', 'THIS FILE — builds live self-context for agent injection'],
    ['agent_score.js', 'Agent performance tracking — recordTask(), getLeaderboard()'],
    ['orchestrator.js', 'Workflow coordination — port 7784'],
    ['ecosystem.config.js', 'PM2 service definitions — all 25 services'],
    ['app/components/MissionControl.tsx', 'Mission Control UI — chat, drawers, self-evolution panel'],
    ['app/hooks/useMissionData.ts', 'UI data polling — 12+ endpoints, 3-15s intervals'],
  ].forEach(([file, desc]) => lines.push(`  ${file} — ${desc}`));

  if (agentScores.length > 0) {
    lines.push('', `### Agent Performance (${agentScores.length} tracked, ${lessons.total} total lessons)`);
    agentScores.slice(0, 10).forEach(a => {
      lines.push(`  ${a.name}: ${a.successRate}% SR on ${a.totalTasks} tasks (avg ${a.avgDuration}) — last: "${a.lastTask}"`);
    });
  }

  lines.push('', `### LLM Usage (${llm.total} total calls)`);
  Object.entries(llm.providers).forEach(([p, n]) => lines.push(`  ${p}: ${n} calls`));

  if (evolution.length > 0) {
    lines.push('', '### Self-Evolution Loop History (auto-research → memory ingestion)');
    evolution.forEach(t => {
      lines.push(`  [${t.ts}] ${t.status} — "${t.topic}"`);
      if (t.synthesis) lines.push(`    Finding: ${t.synthesis.slice(0, 200)}`);
    });
  }

  if (benchmarks.length > 0) {
    lines.push('', '### Benchmark History');
    benchmarks.forEach(b => lines.push(`  [${b.ts}] ${b.passRate} pass rate on ${b.goals} goals (pass@1: ${b.passAt1})`));
  }

  if (lessons.recent.length > 0) {
    lines.push('', '### Recent Task History');
    lessons.recent.forEach(l => {
      lines.push(`  [${l.ts}] ${l.success ? '✓' : '✗'} ${l.agent} — "${l.task}"`);
    });
  }

  // ── Agent divisions — live from the running tower, static fallback if down ──
  if (roster && roster.byDivision) {
    lines.push('', `### Agent Divisions (${roster.count} registered — live from tower :7790)`);
    for (const [div, names] of Object.entries(roster.byDivision)) {
      lines.push(`  ${div}: ${names.join(', ')}`);
    }
  } else {
    lines.push('', '### Agent Divisions (tower offline — last-known roster)');
    STATIC_DIVISION_ROSTER.forEach(row => lines.push(`  ${row}`));
  }

  // ── Skill library — the real catalog you can apply, not a claim ──
  lines.push('', `### Skill Library (${catalog.total} skills available to you)`);
  lines.push('  Each skill is a real playbook at its file path. To employ one:');
  lines.push('    1. Pick the relevant skill below (or query the Knowledge Pool :7885 /pool/query "<keyword>").');
  lines.push('    2. Read its SKILL.md (cite the file path), then follow its steps in your deliverable.');
  if (catalog.skills.length) {
    catalog.skills.slice(0, 60).forEach(s => lines.push(`  - ${s.name}: ${s.desc} (${s.file})`));
    if (catalog.skills.length > 60) {
      lines.push(`  …and ${catalog.skills.length - 60} more — query the Knowledge Pool for the rest by keyword.`);
    }
  }

  // ── How to reach the rest of the stack — real, callable endpoints ──
  lines.push(
    '',
    '### How to use the rest of the stack (real endpoints — you have shell + HTTP)',
    '  You are not isolated. Reach peers, skills, and memory over localhost HTTP (curl):',
    '  - Skills / routing search: GET http://127.0.0.1:7885/pool/query?q=<keywords>  (Knowledge Pool; POOL_URL env)',
    '  - Recall memory:           POST http://127.0.0.1:7880/memory/recall   {"query":"<text>"}',
    '  - Save a lesson to memory: POST http://127.0.0.1:7880/memory/ingest   {"content":"<finding>","source":"<agent>","importance":0.5}',
    '  - Delegate to another agent: POST http://127.0.0.1:7790/api/spawn {"agentName":"<name>","task":"<task>"}',
    '  - Live agent/division roster: GET http://127.0.0.1:7790/tower/status',
    '  - Kernel job / mission:     POST http://127.0.0.1:7780/api/kernel/jobs {"goal":"<goal>","route":"swarm-coordinator"}',
    '  - Group/research room:      POST http://127.0.0.1:7780/api/research/group {"query":"<q>"}',
    '  Prefer querying the pool/memory before guessing. Cite what you retrieved.',
    '',
    '### Your role',
    `You are ${agentName}, a PURPCLAW swarm agent with live knowledge of the stack above.`,
    'Produce concrete deliverables — cite file names, function names, port numbers, line numbers where known.',
    'Label gaps [BLOCKED: reason] rather than fabricating.',
    'The system state above is real. Reason from it directly.',
  );

  if (taskContext) {
    lines.push('', `### Mission context: ${taskContext}`);
  }

  return lines.join('\n');
}

// Sync wrapper — builds context with whatever data is available synchronously,
// then upgrades with async service pings in the background for next call
let _cachedContext = null;
let _cacheBuilding = false;
let _cacheTs = 0;
const CACHE_TTL_MS = 60_000; // rebuild every 60s

function buildSelfContext(agentName = 'agent', taskContext = '') {
  const now = Date.now();
  // Always refresh async in background
  if (!_cacheBuilding && (now - _cacheTs > CACHE_TTL_MS)) {
    _cacheBuilding = true;
    buildSelfContextAsync(agentName, taskContext).then(ctx => {
      _cachedContext = ctx;
      _cacheTs = Date.now();
      _cacheBuilding = false;
    }).catch(() => { _cacheBuilding = false; });
  }
  // Return cached if available, otherwise build sync (no service pings)
  if (_cachedContext) return _cachedContext;

  // Fallback: sync build without service pings
  const agentScores = getAgentScores();
  const lessons = getRecentLessons(5);
  const evolution = getEvolutionHistory();
  const llm = getLLMLedger();
  const lines = [
    '## PURPCLAW SYSTEM CONTEXT (loading live state...)',
    '',
    'You are executing inside PURPCLAW — a persistent AI orchestration runtime.',
    '',
    '### Key files',
    '  unified_api.js :7780, agent_tower.js :7790, swarm_coordinator.js, lib/api-harness-kernel.js',
    '  lib/llm-provider.js (MiniMax M3 + Ollama fallback), lib/deep-research-group.js (OpenRouter)',
    '  lib/self-evolution-loop.js (auto-research), lib/memory-client.js :7880',
    '',
  ];
  const catalog = getSkillCatalog();
  lines.push(`### Skill Library: ${catalog.total} skills in registry/index.json — read skills/<name>/SKILL.md or query Knowledge Pool :7885 to employ them.`, '');
  if (agentScores.length) {
    lines.push(`### Top agents (${agentScores.length} tracked, ${lessons.total} lessons)`);
    agentScores.slice(0, 8).forEach(a => lines.push(`  ${a.name}: ${a.successRate}% SR on ${a.totalTasks} tasks`));
  }
  if (evolution.length) {
    lines.push('', '### Latest self-research');
    lines.push(`  ${evolution[evolution.length-1].topic?.slice(0,100)}`);
  }
  lines.push('', `### You are ${agentName}. Cite filenames/ports. Label gaps [BLOCKED:].`);
  if (taskContext) lines.push(`### Mission: ${taskContext}`);
  return lines.join('\n');
}

// Pre-warm on module load
buildSelfContextAsync().then(ctx => { _cachedContext = ctx; _cacheTs = Date.now(); }).catch(() => {});

module.exports = { buildSelfContext, buildSelfContextAsync };
