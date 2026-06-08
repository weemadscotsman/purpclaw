/**
 * PURPCLAW AGENT TOWER v1.0
 * ==========================
 * Central hub for unified agent management
 * Combines companion_swarm agents with division hierarchy
 * Provides team spawning, inter-agent comms, health monitoring
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const http = require('http');
const LLM = require('./lib/llm-provider');
const { complete: llmComplete } = LLM;
// Real tool-calling brain: the same agent-loop that powers ask/chat
let agentLoopTools = null;
try {
  agentLoopTools = require('./lib/agent-loop');
} catch {}

// Environment Constants
const PURP_DIR = __dirname;
const AGENT_TOWER_PORT = process.env.AGENT_TOWER_PORT || 7790;

// Import companion_swarm for personality-enhanced prompts
let companionSwarm = null;
try {
  companionSwarm = require('./companion_swarm.js');
} catch (e) {
  // companion_swarm.js not available - use built-in prompts
}

const TOWER_TIERS = {
  TIER_1_FOUNDATION: { level: 1, name: 'Foundation', color: '#4A90D9' },
  TIER_2_OPERATIONS: { level: 2, name: 'Operations', color: '#9B59B6' },
  TIER_3_STRATEGIC: { level: 3, name: 'Strategic', color: '#E74C3C' }
};

const DIVISIONS = {
  INTELLIGENCE: { id: 'intel', color: '#E74C3C', tier: 3, agents: ['spider', 'raven', 'ghost'] },
  ENGINEERING: { id: 'eng', color: '#3498DB', tier: 1, agents: ['dragon', 'robot', 'mushroom', 'chonk', 'turtle', 'axolotl', 'wolf', 'bee'] },
  SECURITY: { id: 'sec', color: '#27AE60', tier: 2, agents: ['octopus', 'owl', 'rabbit', 'snake', 'bunny', 'guardian'] },
  INFRASTRUCTURE: { id: 'infra', color: '#F39C12', tier: 1, agents: ['cactus', 'void', 'raven'] },
  MEDIA_OPS: { id: 'media', color: '#9B59B6', tier: 2, agents: ['duck', 'goose', 'parrot'] },
  MANAGEMENT: { id: 'mgmt', color: '#1ABC9C', tier: 3, agents: ['penguin', 'karen', 'lemur'] },
  SCIENCE: { id: 'science', color: '#00BCD4', tier: 2, agents: ['scientist', 'axolotl'] },
  CREATIVE: { id: 'creative', color: '#E91E63', tier: 2, agents: ['phoenix', 'parrot', 'crow'] },
  OPERATIONS: { id: 'ops', color: '#FF5722', tier: 2, agents: ['mantis', 'shark', 'gorilla'] }
};

const AGENT_TOWER = {
  registry: {
    duck:     { name: 'DUCK',     emoji: '🦆', division: 'MEDIA_OPS',    role: 'Research Accelerant',    tier: 1, skills: ['research', 'data_analysis', 'content_creation'], status: 'idle' },
    ghost:    { name: 'GHOST',    emoji: '👻', division: 'INTELLIGENCE',  role: 'Quality Guardian',        tier: 2, skills: ['qa', 'security'], status: 'idle' },
    dragon:   { name: 'DRAGON',   emoji: '🐉', division: 'ENGINEERING',   role: 'Chief Architect',        tier: 3, skills: ['architecture', 'planning'], status: 'idle' },
    octopus:  { name: 'OCTOPUS',  emoji: '🐙', division: 'SECURITY',      role: 'Edge Case Hunter',       tier: 2, skills: ['security', 'testing'], status: 'idle' },
    robot:    { name: 'ROBOT',    emoji: '🤖', division: 'ENGINEERING',   role: 'Precision Engineer',     tier: 1, skills: ['coding', 'automation'], status: 'idle' },
    mushroom: { name: 'MUSHROOM', emoji: '🍄', division: 'ENGINEERING',   role: 'Organic Refactorer',     tier: 1, skills: ['refactoring', 'code_health'], status: 'idle' },
    chonk:    { name: 'CHONK',    emoji: '🐈', division: 'ENGINEERING',   role: 'Simplification Expert',  tier: 1, skills: ['optimization', 'cleanup'], status: 'idle' },
    owl:      { name: 'OWL',      emoji: '🦉', division: 'SECURITY',      role: 'Security Auditor',       tier: 2, skills: ['security', 'analysis'], status: 'idle' },
    cactus:   { name: 'CACTUS',   emoji: '🌵', division: 'INFRASTRUCTURE',role: 'Efficiency Auditor',    tier: 1, skills: ['performance', 'monitoring'], status: 'idle' },
    penguin:  { name: 'PENGUIN',  emoji: '🐧', division: 'MANAGEMENT',    role: 'Project Coordinator',    tier: 3, skills: ['coordination', 'planning'], status: 'idle' },
    goose:    { name: 'GOOSE',    emoji: '🪿', division: 'MEDIA_OPS',     role: 'Chaos Catalyst',        tier: 2, skills: ['creativity', 'agitation'], status: 'idle' },
    turtle:   { name: 'TURTLE',   emoji: '🐢', division: 'ENGINEERING',   role: 'Quality Engineer',       tier: 1, skills: ['testing', 'qa'], status: 'idle' },
    axolotl:  { name: 'AXOLOTL',  emoji: '🦎', division: 'ENGINEERING',   role: 'Regeneration Specialist', tier: 2, skills: ['recovery', 'adaptation'], status: 'idle' },
    rabbit:   { name: 'RABBIT',   emoji: '🐰', division: 'SECURITY',      role: 'Defensive Programmer',   tier: 1, skills: ['defense', 'validation'], status: 'idle' },
    void:     { name: 'VOID',     emoji: '🕳️', division: 'INFRASTRUCTURE',role: 'Null Handler',          tier: 1, skills: ['error_handling', 'null_safety'], status: 'idle' },
    wolf:     { name: 'WOLF',     emoji: '🐺', division: 'ENGINEERING',   role: 'Pack Leader',            tier: 3, skills: ['leadership', 'coordination'], status: 'idle' },
    spider:   { name: 'SPIDER',   emoji: '🕷️', division: 'INTELLIGENCE',  role: 'Intel Specialist',      tier: 2, skills: ['recon', 'analysis'], status: 'idle' },
    raven:    { name: 'RAVEN',    emoji: '🐦‍⬛', division: 'INTELLIGENCE',  role: 'Signals Analyst',       tier: 2, skills: ['comms', 'monitoring'], status: 'idle' },
    snake:    { name: 'SNAKE',    emoji: '🐍', division: 'SECURITY',      role: 'Primary Access',        tier: 3, skills: ['access', 'auth'], status: 'idle' },
    bee:      { name: 'BEE',      emoji: '🐝', division: 'ENGINEERING',   role: 'Pollination Specialist', tier: 1, skills: ['integration', 'connecting'], status: 'idle' },
    bunny:    { name: 'BUNNY',    emoji: '🐰', division: 'SECURITY',      role: 'Quick Reaction',        tier: 1, skills: ['rapid_response', 'alerts'], status: 'idle' },
    guardian: { name: 'GUARDIAN', emoji: '🛡️', division: 'SECURITY',      role: 'Real-time Monitor',     tier: 2, skills: ['monitoring', 'protection'], status: 'idle' },
    karen:    { name: 'KAREN',    emoji: '💅', division: 'MANAGEMENT',    role: 'Quality Control',       tier: 2, skills: ['oversight', 'compliance'], status: 'idle' },
    lemur:    { name: 'LEMUR',    emoji: '🦝', division: 'MANAGEMENT',    role: 'Resource Manager',      tier: 2, skills: ['allocation', 'budget'], status: 'idle' },
    mantis:   { name: 'MANTIS',  emoji: '🪲', division: 'OPERATIONS',    role: 'Precision Striker',     tier: 2, skills: ['precision', 'targeted_action'], status: 'idle' },
    shark:    { name: 'SHARK',    emoji: '🦈', division: 'OPERATIONS',    role: 'Hunter',                tier: 2, skills: ['tracking', 'pursuit'], status: 'idle' },
    gorilla:  { name: 'GORILLA',  emoji: '🦍', division: 'OPERATIONS',    role: 'Heavy Lifter',          tier: 2, skills: ['strength', 'persistence'], status: 'idle' },
    phoenix:  { name: 'PHOENIX',  emoji: '🔥', division: 'CREATIVE',      role: 'Rebirth Specialist',    tier: 2, skills: ['reinvention', 'transformation'], status: 'idle' },
    fox:      { name: 'FOX',      emoji: '🦊', division: 'INTELLIGENCE',   role: 'Strategy Specialist',   tier: 3, skills: ['strategy', 'cunning'], status: 'idle' },
    crow:     { name: 'CROW',     emoji: '🐦', division: 'CREATIVE',      role: 'Gatherer',              tier: 1, skills: ['collection', 'observation'], status: 'idle' },
    scientist:{ name: 'SCIENTIST',emoji: '🔬', division: 'SCIENCE',       role: 'Research Lead',        tier: 3, skills: ['research', 'experimentation'], status: 'idle' },
    hawk:     { name: 'HAWK',     emoji: '🦅', division: 'INTELLIGENCE',  role: 'Aerial Recon',         tier: 2, skills: ['recon', 'scouting'], status: 'idle' },
    elephant: { name: 'ELEPHANT', emoji: '🐘', division: 'OPERATIONS',    role: 'Memory Keeper',         tier: 2, skills: ['memory', 'long_term_planning'], status: 'idle' },
    panda:    { name: 'PANDA',    emoji: '🐼', division: 'CREATIVE',      role: 'Content Specialist',    tier: 1, skills: ['content', 'media'], status: 'idle' },
    parrot:   { name: 'PARROT',   emoji: '🦜', division: 'MEDIA_OPS',     role: 'Communication Bridge',  tier: 2, skills: ['communication', 'translation'], status: 'idle' }
  },

  activeAgents: new Map(),
  teams: new Map(),
  sseClients: [],
  eventEmitter: new EventEmitter(),

  stats: {
    totalRegistered: 0,
    totalActive: 0,
    totalTeams: 0,
    uptime: null,
    startTime: null
  }
};

AGENT_TOWER.stats.totalRegistered = Object.keys(AGENT_TOWER.registry).length;
AGENT_TOWER.stats.startTime = new Date().toISOString();

function broadcast(event) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  });

  for (const client of AGENT_TOWER.sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (e) {
      console.log(`[TOWER] SSE client error: ${e.message}`);
    }
  }

  AGENT_TOWER.eventEmitter.emit('broadcast', event);
}

function createAgentId(name) {
  return `${name}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function spawnAgent(agentName, task, options = {}) {
  const agentInfo = AGENT_TOWER.registry[agentName.toLowerCase()];
  if (!agentInfo) {
    return { success: false, error: `Unknown agent: ${agentName}` };
  }

  const agentId = createAgentId(agentName);

  // Build the agent's working directory
  const agentWorkDir = path.join(PURP_DIR, 'agent_work', agentName);
  if (!fs.existsSync(agentWorkDir)) {
    fs.mkdirSync(agentWorkDir, { recursive: true });
  }

  // Create agent log file
  const logFile = path.join(agentWorkDir, `${agentId}.log`);
  const pidFile = path.join(agentWorkDir, `${agentId}.pid`);

  // Write task to agent's workspace
  const taskFile = path.join(agentWorkDir, 'current_task.txt');
  fs.writeFileSync(taskFile, `[${new Date().toISOString()}] TASK:\n${task}\n\nAGENT: ${agentName}\nDIVISION: ${agentInfo.division}\nROLE: ${agentInfo.role}\n`, 'utf8');

  // Build the agent prompt - prefer companion_swarm's personality-loaded version
  let prompt = `You are ${agentInfo.name}, a ${agentInfo.role} agent in the ${agentInfo.division} division.`;
  if (companionSwarm && companionSwarm.buildAgentPrompt) {
    prompt = companionSwarm.buildAgentPrompt(agentName.toLowerCase(), task, {
      emoji: agentInfo.emoji,
      name: agentInfo.name,
      division: agentInfo.division,
      role: agentInfo.role
    });
  } else {
    prompt = await buildAgentPrompt(agentName, task);
  }

  const activeAgent = {
    id: agentId,
    name: agentName,
    emoji: agentInfo.emoji,
    division: agentInfo.division,
    role: agentInfo.role,
    tier: agentInfo.tier,
    skills: agentInfo.skills,
    task: task,
    status: 'working',
    startTime: new Date().toISOString(),
    pid: null,
    teamId: options.teamId || null,
    parentId: options.parentId || null,
    logFile,
    workDir: agentWorkDir
  };

  AGENT_TOWER.activeAgents.set(agentId, activeAgent);
  agentInfo.status = 'active';

  broadcast({
    type: 'agent_spawned',
    agentId,
    name: agentName,
    emoji: agentInfo.emoji,
    division: agentInfo.division,
    role: agentInfo.role,
    task: task.substring(0, 100),
    teamId: options.teamId,
    status: 'working'
  });

  // Execute agent via llm-provider.js — single gateway, no Kimi/stub fallback
  const agentPrompt = prompt;
  const providerInfo = LLM.getProviderInfo();
  const providerName = providerInfo?.main?.provider || 'unknown';
  const modelName = providerInfo?.main?.model || 'unknown';
  
  console.log(`[TOWER] ${agentInfo.emoji} ${agentInfo.name} executing via ${providerName}/${modelName}...`);
  
  // Use the real tool-calling brain (same as ask/chat) if available.
  // Falls back to one-shot llmComplete for backwards compat.
  // All result variables initialized to non-undefined defaults.
  // In JavaScript, `let x;` is `let x = undefined;` — that's a bug waiting to happen.
  let result = { content: '(empty response — no agent output captured)', toolCalls: [] };
  let toolCalls = [];
  let totalTokens = 0;

  if (agentLoopTools) {
    const { runAgent, AGENT_TOOLS } = agentLoopTools;
    const fullPrompt = `${agentPrompt}\n\nTASK: ${task}`;
    const agentState = { toolCalls: [] };

    try {
      for await (const ev of runAgent({
        prompt: fullPrompt,
        opts: { maxTokens: 4096, temperature: 0.7, tools: AGENT_TOOLS },
      })) {
        if (ev.type === 'token') {
          // Accumulate streaming output
        } else if (ev.type === 'tool-exec' && ev.name) {
          agentState.toolCalls.push({ name: ev.name, args: ev.args, result: ev.result });
        } else if (ev.type === 'turn-done') {
          // Collect tool results
        }
      }

      result = {
        content: agentState.toolCalls.map(tc => 
          `[${tc.name}] ${JSON.stringify(tc.args).substring(0, 100)} → ${String(tc.result).substring(0, 200)}`
        ).join('\n') || 'Task completed.',
        toolCalls: agentState.toolCalls,
      };
      totalTokens = agentState.toolCalls.length;
      console.log(`[TOWER] ${agentInfo.emoji} ${agentInfo.name} completed (${agentState.toolCalls.length} tool calls)`);
    } catch (e) {
      console.log(`[TOWER] Agent-loop fell back to one-shot: ${e.message}`);
      result = await llmComplete(
        `${agentPrompt}\n\nTASK: ${task}`,
        { maxTokens: 4096, temperature: 0.7 }
      );
      if (typeof result === 'string') result = { content: result };
    }
  } else {
    try {
      const raw = await llmComplete(
        `${agentPrompt}\n\nTASK: ${task}`,
        { maxTokens: 4096, temperature: 0.7 }
      );
      result = typeof raw === 'string' ? { content: raw } : raw;
    } catch (e) {
      result = { error: e.message };
    }
  }
  
  const output = typeof result === 'string' ? result :
    result?.content || result?.output || result?.text || result?.error || '(empty response)';
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] LLM RESPONSE:\n${output}\n`);
    broadcast({ type: 'agent_output', agentId, agentName, emoji: agentInfo.emoji, output, timestamp: new Date().toISOString() });
    broadcast({ type: 'agent_complete', agentId, agentName, emoji: agentInfo.emoji, code: 0, output, timestamp: new Date().toISOString(), provider: providerName, model: modelName });
    
    activeAgent.status = 'completed';
    activeAgent.result = output;
    console.log(`[TOWER] ${agentInfo.emoji} ${agentInfo.name} completed via ${providerName}/${modelName} (${agentId})`);

  // Notify EventBus
  try {
    const ebPayload = JSON.stringify({ topic: 'agent.spawned', agentId, name: agentName, division: agentInfo.division, role: agentInfo.role, task: task.substring(0, 100), pid: activeAgent.pid });
    const ebReq = http.request({ hostname: 'localhost', port: 7782, path: '/publish', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ebPayload) } }, () => {});
    ebReq.on('error', (e) => console.error('[AGENT_TOWER] Error:', e.message));
    ebReq.write(ebPayload);
    ebReq.end();
  } catch (e) {}

  return { success: true, agent: activeAgent };
}

function sanitizeForCli(text) {
  // Remove supplementary-plane characters (most emojis) that crash Windows console
  return text.replace(/[\u{10000}-\u{10FFFF}]/gu, '');
}

async function buildAgentPrompt(agentName, task) {
  const info = AGENT_TOWER.registry[agentName.toLowerCase()];
  if (!info) return '';

  const divisionInfo = DIVISIONS[info.division] || {};
  const tierInfo = TOWER_TIERS[`TIER_${info.tier}_${['FOUNDATION', 'OPERATIONS', 'STRATEGIC'][info.tier - 1]}`] || TOWER_TIERS.TIER_1_FOUNDATION;

  let prompt = `${info.emoji} You are ${info.name} — ${info.role}\n`;
  prompt += `Division: ${info.division} (${divisionInfo.color || '#888'})\n`;
  prompt += `Tower Tier: ${tierInfo.name}\n`;
  prompt += `Skills: ${info.skills.join(', ')}\n\n`;
  prompt += `Your Task:\n${task}\n\n`;
  prompt += `Remember: You are ${info.name}. Work with your division and team.\n\n`;

  // Append cognitive spine context (best-effort, 2s timeout)
  prompt += `--- Cognitive Context ---\n`;
  try {
    const http = require('http');
    const ctx = await new Promise(resolve => {
      const req = http.get({ hostname: '127.0.0.1', port: 7880, path: '/memory/context', timeout: 2000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
    if (ctx && ctx.context && ctx.context.length > 0) {
      prompt += `Recent memory: ${JSON.stringify(ctx.context).substring(0, 300)}\n`;
    } else {
      prompt += `Memory: no recent context\n`;
    }
  } catch { prompt += `Memory: unavailable\n`; }

  // Rules summary
  try {
    const http = require('http');
    const rules = await new Promise(resolve => {
      const req = http.get({ hostname: '127.0.0.1', port: 7880, path: '/rules/stats', timeout: 2000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
    if (rules) {
      prompt += `Rules: ${rules.facts || 0} facts, ${rules.rules || 0} rules active\n`;
    }
  } catch {}

  return prompt;
}

function forwardSpawnToApi(spawnConfig) {
  try {
    const http = require('http');
    const payload = JSON.stringify(spawnConfig);
    const req = http.request({
      hostname: 'localhost',
      port: 7780,
      path: '/api/tower/spawn',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, () => {});
    req.on('error', (e) => console.error('[TOWER] API Error:', e.message));
    req.write(payload);
    req.end();
  } catch (e) {}
}

function killAgent(agentId) {
  const agent = AGENT_TOWER.activeAgents.get(agentId);
  if (!agent) return { success: false, error: 'Agent not found' };

  if (agent.pid) {
    try {
      process.kill(agent.pid);
      console.log(`[TOWER] Process ${agent.pid} killed for agent ${agent.name}`);
    } catch (e) {
      console.log(`[TOWER] Failed to kill process ${agent.pid} for agent ${agent.name}: ${e.message}`);
    }
  }

  agent.status = 'killed';
  agent.endTime = new Date().toISOString();

  const info = AGENT_TOWER.registry[agent.name.toLowerCase()];
  if (info) info.status = 'idle';

  broadcast({
    type: 'agent_killed',
    agentId,
    name: agent.name,
    emoji: agent.emoji,
    reason: 'manual'
  });

  AGENT_TOWER.activeAgents.delete(agentId);

  const ebPayload = JSON.stringify({ topic: 'agent.completed', agentId, name: agent.name, division: agent.division, role: agent.role, task: agent.task });
  const ebReq = http.request({ hostname: 'localhost', port: 7782, path: '/publish', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ebPayload) } }, () => {});
  ebReq.on('error', (e) => console.error('[AGENT_TOWER] Error:', e.message));
  ebReq.write(ebPayload);
  ebReq.end();

  if (agent.teamId) {
    removeAgentFromTeam(agentId, agent.teamId);
  }

  console.log(`[TOWER] 💀 ${agent.emoji} ${agent.name} killed`);
  return { success: true };
}

async function spawnTeam(teamConfig) {
  const { name, leader, members, task, priority } = teamConfig;

  if (!leader || !AGENT_TOWER.registry[leader.toLowerCase()]) {
    return { success: false, error: 'Invalid team leader' };
  }

  const teamId = `team-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const spawnOrder = [leader, ...(members || [])];

  const team = {
    id: teamId,
    name: name || `Team ${teamId}`,
    leader,
    members: [],
    tasks: [],
    status: 'forming',
    created: new Date().toISOString(),
    priority: priority || 'normal',
    spawnedAgents: []
  };

  AGENT_TOWER.teams.set(teamId, team);

  const spawned = [];
  for (const memberName of spawnOrder) {
    const memberInfo = AGENT_TOWER.registry[memberName.toLowerCase()];
    if (!memberInfo) {
      console.log(`[TOWER] Unknown team member: ${memberName}`);
      continue;
    }

    const isLeader = memberName.toLowerCase() === leader.toLowerCase();
    const memberTask = isLeader ? task : `[TEAM:${teamId}] Supporting ${leader} on: ${task}`;

    const result = await spawnAgent(memberName, memberTask, {
      teamId,
      parentId: isLeader ? null : `${leader}-${teamId}`
    });

    if (result.success) {
      team.members.push({
        name: memberName,
        agentId: result.agent.id,
        role: isLeader ? 'leader' : 'member'
      });
      team.spawnedAgents.push(result.agent.id);
      spawned.push(memberName);
    }
  }

  team.status = 'active';

  broadcast({
    type: 'team_spawned',
    teamId,
    name: team.name,
    leader,
    members: spawned,
    task: task.substring(0, 100),
    priority: team.priority
  });

  console.log(`[TOWER] Team "${team.name}" spawned: ${spawned.join(', ')}`);

  return { success: true, team };
}

function removeAgentFromTeam(agentId, teamId) {
  const team = AGENT_TOWER.teams.get(teamId);
  if (!team) return;

  const memberIdx = team.members.findIndex(m => m.agentId === agentId);
  if (memberIdx !== -1) {
    const removed = team.members.splice(memberIdx, 1)[0];
    const agent = AGENT_TOWER.activeAgents.get(agentId);
    if (agent) agent.status = 'orphaned';

    broadcast({
      type: 'team_member_removed',
      teamId,
      agentId,
      name: removed.name,
      reason: 'agent_killed'
    });

    if (team.members.length === 0) {
      team.status = 'disbanded';
      broadcast({ type: 'team_disbanded', teamId, reason: 'all_members_gone' });
    } else if (removed.role === 'leader') {
      const newLeader = team.members[0];
      if (newLeader) {
        newLeader.role = 'leader';
        team.leader = newLeader.name;
        broadcast({ type: 'team_leader_changed', teamId, newLeader: newLeader.name });
      }
    }
  }
}

function getAgentStatus() {
  const divisionStats = {};
  for (const [divKey, divInfo] of Object.entries(DIVISIONS)) {
    divisionStats[divKey] = {
      id: divInfo.id,
      color: divInfo.color,
      tier: divInfo.tier,
      agents: divInfo.agents,
      activeCount: 0,
      idleCount: divInfo.agents.length
    };
  }

  const activeByDivision = {};
  for (const [agentId, agent] of AGENT_TOWER.activeAgents) {
    if (!activeByDivision[agent.division]) activeByDivision[agent.division] = 0;
    activeByDivision[agent.division]++;
  }

  for (const [divKey, stats] of Object.entries(divisionStats)) {
    const divAgents = AGENT_TOWER.registry ? Object.values(AGENT_TOWER.registry).filter(a => a.division === divKey) : [];
    stats.totalAgents = divAgents.length;
    stats.activeCount = activeByDivision[divKey] || 0;
    stats.idleCount = stats.totalAgents - stats.activeCount;
  }

  const teamsSummary = [];
  for (const [id, team] of AGENT_TOWER.teams) {
    teamsSummary.push({
      id: team.id,
      name: team.name,
      leader: team.leader,
      memberCount: team.members.length,
      status: team.status,
      priority: team.priority,
      created: team.created
    });
  }

  return {
    tower: {
      version: '1.0',
      uptime: AGENT_TOWER.stats.startTime ? Date.now() - new Date(AGENT_TOWER.stats.startTime).getTime() : 0,
      totalRegistered: AGENT_TOWER.stats.totalRegistered,
      totalActive: AGENT_TOWER.activeAgents.size,
      totalTeams: AGENT_TOWER.teams.size
    },
    tiers: TOWER_TIERS,
    divisions: divisionStats,
    teams: teamsSummary,
    activeAgents: Array.from(AGENT_TOWER.activeAgents.values()).map(a => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      division: a.division,
      role: a.role,
      tier: a.tier,
      status: a.status,
      task: a.task.substring(0, 80),
      teamId: a.teamId,
      startTime: a.startTime
    })),
    registeredAgents: Object.entries(AGENT_TOWER.registry).map(([key, info]) => ({
      name: key,
      emoji: info.emoji,
      division: info.division,
      role: info.role,
      tier: info.tier,
      status: info.status
    }))
  };
}

function getAgentsByDivision(divisionKey) {
  const divInfo = DIVISIONS[divisionKey.toUpperCase()];
  if (!divInfo) return [];

  return divInfo.agents.map(name => AGENT_TOWER.registry[name]).filter(Boolean);
}

function getAgentsByTier(tier) {
  return Object.entries(AGENT_TOWER.registry)
    .filter(([name, info]) => info.tier === tier)
    .map(([name, info]) => ({ name, ...info }));
}

function interAgentMessage(fromAgentId, toAgentName, message) {
  const fromAgent = AGENT_TOWER.activeAgents.get(fromAgentId);
  if (!fromAgent) return { success: false, error: 'Sender agent not found' };

  const toAgentInfo = AGENT_TOWER.registry[toAgentName.toLowerCase()];
  if (!toAgentInfo) return { success: false, error: 'Recipient agent not found' };

  const toActiveAgent = Array.from(AGENT_TOWER.activeAgents.values()).find(a => a.name.toLowerCase() === toAgentName.toLowerCase());

  broadcast({
    type: 'inter_agent_message',
    from: { id: fromAgentId, name: fromAgent.name, emoji: fromAgent.emoji },
    to: { name: toAgentName, emoji: toAgentInfo.emoji, active: !!toActiveAgent },
    message,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    delivered: !!toActiveAgent,
    target: toAgentName
  };
}

function connectToBall(xiaozhiUrl) {
  AGENT_TOWER.ballConnection = {
    url: xiaozhiUrl,
    connected: false,
    reconnectAttempts: 0
  };

  try {
    const WebSocket = require('ws');
    const ws = new WebSocket(xiaozhiUrl);

    ws.on('open', () => {
      AGENT_TOWER.ballConnection.connected = true;
      AGENT_TOWER.ballConnection.ws = ws;
      broadcast({ type: 'ball_connected', url: xiaozhiUrl });
      console.log(`[TOWER] 🔮 Connected to Ball at ${xiaozhiUrl}`);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleBallMessage(msg);
      } catch (e) {}
    });

    ws.on('close', () => {
      AGENT_TOWER.ballConnection.connected = false;
      broadcast({ type: 'ball_disconnected' });
      setTimeout(() => connectToBall(xiaozhiUrl), 5000);
    });

    ws.on('error', (e) => {
      AGENT_TOWER.ballConnection.connected = false;
      console.error('[TOWER] Ball connection error:', e.message);
    });

  } catch (e) {
    console.log(`[TOWER] Ball connection failed: ${e.message}`);
    return { success: false, error: e.message };
  }

  return { success: true, status: 'connecting' };
}

function handleBallMessage(msg) {
  if (msg.type === 'voice_command') {
    broadcast({
      type: 'ball_voice_command',
      command: msg.command,
      agent: msg.target,
      timestamp: msg.timestamp
    });

    if (msg.target) {
      const agentName = msg.target.toLowerCase();
      const agentInfo = AGENT_TOWER.registry[agentName];
      if (agentInfo) {
        spawnAgent(agentName, msg.command, { source: 'ball' });
      }
    } else {
      const task = msg.command;
      const leaderCandidates = ['wolf', 'dragon', 'penguin', 'fox'];
      for (const candidate of leaderCandidates) {
        if (AGENT_TOWER.registry[candidate]) {
          spawnAgent(candidate, task, { source: 'ball' });
          break;
        }
      }
    }
  }

  if (msg.type === 'query') {
    if (msg.query === 'status') {
      const status = getAgentStatus();
      sendToBall({ type: 'status_response', data: status });
    }
    if (msg.query === 'agents') {
      sendToBall({ type: 'agents_list', agents: Object.keys(AGENT_TOWER.registry) });
    }
    if (msg.query === 'teams') {
      sendToBall({ type: 'teams_list', teams: Array.from(AGENT_TOWER.teams.keys()) });
    }
  }
}

function sendToBall(message) {
  if (AGENT_TOWER.ballConnection?.ws?.readyState === 1) {
    AGENT_TOWER.ballConnection.ws.send(JSON.stringify(message));
  }
}

function createSseServer() {
  const http = require('http');
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.url === '/tower/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...CORS_HEADERS
      });

      AGENT_TOWER.sseClients.push(res);

      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

      req.on('close', () => {
        const idx = AGENT_TOWER.sseClients.indexOf(res);
        if (idx !== -1) AGENT_TOWER.sseClients.splice(idx, 1);
      });
    } else if (req.url === '/tower/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify(getAgentStatus()));
    } else if (req.url === '/tower/agents') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify(Object.keys(AGENT_TOWER.registry)));
    } else if (req.url === '/tower/divisions') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify(DIVISIONS));
    } else if (req.url === '/tower/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString(), uptime: Date.now() - new Date(AGENT_TOWER.stats.startTime).getTime(), activeAgents: AGENT_TOWER.activeAgents.size }));
    } else if (req.url === '/api/spawn' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { agentName, task, options } = JSON.parse(body);
          if (!agentName || !task) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
            res.end(JSON.stringify({ success: false, error: 'agentName and task required' }));
            return;
          }
          const result = await spawnAgent(agentName, task, options || {});
          res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (req.url === '/api/team/spawn' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const teamConfig = JSON.parse(body);
          const result = spawnTeam(teamConfig);
          res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if ((req.url?.startsWith('/api/agents/') || req.url?.startsWith('/tower/agents/')) && req.method === 'DELETE') {
      const parts = req.url.startsWith('/api/agents/') ? req.url.split('/api/agents/') : req.url.split('/tower/agents/');
      const agentId = decodeURIComponent(parts[1] || '');
      const result = killAgent(agentId);
      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ success: true, agentId }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ success: false, error: result.error }));
      }
    } else if ((req.url?.startsWith('/api/teams/') || req.url?.startsWith('/tower/teams/')) && req.method === 'DELETE') {
      const parts = req.url.startsWith('/api/teams/') ? req.url.split('/api/teams/') : req.url.split('/tower/teams/');
      const teamId = decodeURIComponent(parts[1] || '');
      const result = killTeam(teamId);
      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ success: true, teamId }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ success: false, error: result.error }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(AGENT_TOWER_PORT, () => {
    console.log(`[TOWER] Agent Tower listening on port ${AGENT_TOWER_PORT}`);
  });

  return server;
}

function disconnectFromApi() {
  AGENT_TOWER.unifiedApiConnected = false;
}

function connectToUnifiedApi(apiPort = 7780) {
  AGENT_TOWER.unifiedApiPort = apiPort;
  AGENT_TOWER.unifiedApiConnected = true;
  broadcast({ type: 'api_connected', port: apiPort });
  console.log(`[TOWER] Connected to Unified API at port ${apiPort}`);
  return { success: true };
}

function killTeam(teamId) {
  const team = AGENT_TOWER.teams.get(teamId);
  if (!team) return { success: false, error: 'Team not found' };

  const killed = [];
  for (const agentId of team.spawnedAgents) {
    const result = killAgent(agentId);
    if (result.success) killed.push(agentId);
  }

  team.status = 'killed';

  broadcast({
    type: 'team_killed',
    teamId,
    killedAgents: killed.length
  });

  return { success: true, killed: killed.length };
}

function getTeamInfo(teamId) {
  const team = AGENT_TOWER.teams.get(teamId);
  if (!team) return null;

  return {
    ...team,
    activeAgents: team.spawnedAgents.map(id => AGENT_TOWER.activeAgents.get(id)).filter(Boolean)
  };
}

AGENT_TOWER.spawnAgent = spawnAgent;
AGENT_TOWER.spawnTeam = spawnTeam;
AGENT_TOWER.killAgent = killAgent;
AGENT_TOWER.killTeam = killTeam;
AGENT_TOWER.getAgentStatus = getAgentStatus;
AGENT_TOWER.getTeamInfo = getTeamInfo;
AGENT_TOWER.getAgentsByDivision = getAgentsByDivision;
AGENT_TOWER.getAgentsByTier = getAgentsByTier;
AGENT_TOWER.interAgentMessage = interAgentMessage;
AGENT_TOWER.connectToBall = connectToBall;
AGENT_TOWER.connectToUnifiedApi = connectToUnifiedApi;
AGENT_TOWER.disconnectFromApi = disconnectFromApi;
AGENT_TOWER.createSseServer = createSseServer;
AGENT_TOWER.broadcast = broadcast;

if (require.main === module) {
  const server = createSseServer();

  connectToUnifiedApi(7780);

  console.log('[TOWER] Agent Tower initialized');
  console.log(`[TOWER] Registered agents: ${AGENT_TOWER.stats.totalRegistered}`);
  console.log(`[TOWER] Divisions: ${Object.keys(DIVISIONS).length}`);
  console.log(`[TOWER] Tiers: ${Object.keys(TOWER_TIERS).length}`);

  process.on('SIGINT', () => {
    console.log('\n[TOWER] Shutting down...');
    for (const [id] of AGENT_TOWER.activeAgents) {
      killAgent(id);
    }
    server.close();
    process.exit(0);
  });
}

module.exports = AGENT_TOWER;