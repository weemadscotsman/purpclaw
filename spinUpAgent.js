/**
 * spinUpAgent.js — OpenClaude CLI Integration for PURPCLAW
 * =========================================================
 * Spawns a PURPCLAW agent as a detached OpenClaude CLI subagent process.
 * Replaces the Kimi Code CLI dependency with OpenClaude CLI.
 *
 * Usage:
 *   const spinUpAgent = require('./spinUpAgent');
 *   spinUpAgent('dragon', 'Build a REST API for the inventory system');
 *   spinUpAgent('ghost', 'Review the authentication flow for security issues', { teamId: 'audit-001' });
 *
 * Key differences from Kimi CLI:
 *   Kimi: --print --yolo --work-dir X --prompt Y
 *   OpenClaude: -p --add-dir X --system-prompt Y --name AGENT_NAME
 */

const { spawn: rawSpawn } = require('child_process');
const { trackedSpawn } = require('./lib/child-registry');
const path = require('path');
const fs = require('fs');

// Use full path to node + openclaude script (openclaude.cmd is a batch wrapper that can cause issues with detached stdio)
const NODE_BIN = process.execPath;
const OPENCLAUDE_SCRIPT = path.join(process.env.APPDATA || 'C:\\Users\\Admin\\AppData\\Roaming', 'npm', 'node_modules', '@gitlawb', 'openclaude', 'bin', 'openclaude');
const PURP_DIR = path.join(__dirname);
const AGENT_WORK_DIR = path.join(PURP_DIR, 'agent_work');

// PURPCLAW God Folder access — shared memory citadel lives here
const GOD_FOLDER = 'E:\\god folder';

// Agent persona templates (minimal prompt overhead for CLI)
const AGENT_PERSONAS = {
  duck:     { emoji: '🦆', name: 'DUCK',     role: 'Research Accelerant' },
  ghost:    { emoji: '👻', name: 'GHOST',    role: 'Quality Guardian' },
  dragon:   { emoji: '🐉', name: 'DRAGON',   role: 'Chief Architect' },
  octopus:  { emoji: '🐙', name: 'OCTOPUS',  role: 'Edge Case Hunter' },
  robot:    { emoji: '🤖', name: 'ROBOT',    role: 'Systems Engineer' },
  mushroom: { emoji: '🍄', name: 'MUSHROOM', role: 'UI/UX Designer' },
  chonk:    { emoji: '😺', name: 'CHONK',    role: 'Performance Optimizer' },
  owl:      { emoji: '🦉', name: 'OWL',      role: 'Security Auditor' },
  cactus:   { emoji: '🌵', name: 'CACTUS',   role: 'DevOps Engineer' },
  penguin:  { emoji: '🐧', name: 'PENGUIN',  role: 'Project Coordinator' },
  goose:    { emoji: '🪿', name: 'GOOSE',    role: 'Chaos Agent' },
  wolf:     { emoji: '🐺', name: 'WOLF',     role: 'Team Leader' },
  spider:   { emoji: '🕷️', name: 'SPIDER',   role: 'Research Lead' },
  rabbit:   { emoji: '🐰', name: 'RABBIT',   role: 'QA Engineer' },
  mantis:   { emoji: '🦗', name: 'MANTIS',   role: 'Fast Executor' },
  shark:    { emoji: '🦈', name: 'SHARK',    role: 'Heavy Lifter' },
  gorilla:  { emoji: '🦍', name: 'GORILLA',  role: 'Infrastructure Boss' },
  phoenix:  { emoji: '🔥', name: 'PHOENIX',  role: 'Creative Lead' },
  parrot:   { emoji: '🦜', name: 'PARROT',   role: 'Content Generator' },
  crow:     { emoji: '🐦‍⬛', name: 'CROW',     role: 'Data Analyst' },
  axolotl:  { emoji: '🦎', name: 'AXOLOTL',  role: 'Regenerative Healer' },
  turtle:   { emoji: '🐢', name: 'TURTLE',   role: 'Deep Thinker' },
  default:  { emoji: '🌀', name: 'AGENT',    role: 'PURPCLAW Entity' }
};

/**
 * Sanitize output so it doesn't break CLI stdio.
 */
function sanitize(str) {
  return (str || '').replace(/\0/g, ' ').replace(/\r?\n$/, '');
}

/**
 * Get or create agent work directory.
 */
function getAgentWorkDir(agentName) {
  const agentDir = path.join(AGENT_WORK_DIR, agentName);
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }
  return agentDir;
}

/**
 * Build the system prompt for OpenClaude CLI.
 */
function buildSystemPrompt(agentName, task) {
  const persona = AGENT_PERSONAS[agentName] || AGENT_PERSONAS.default;
  const poolUrl = process.env.POOL_URL || `http://127.0.0.1:${process.env.POOL_PORT || '7885'}`;

  return `You are ${persona.name} ${persona.emoji}, ${persona.role} of the PURPCLAW autonomous swarm.

PURPCLAW Context:
- You are a fully autonomous PURPCLAW agent with your own agency and memory.
- The God Folder is your shared knowledge base: ${GOD_FOLDER}
- Your work directory: ${AGENT_WORK_DIR}\\${agentName}
- You have full access to the file system and tools. Use them.
- You are relentless. You are GOOP. Report progress to the Memory Citadel when significant work is done.

Knowledge Pool (open, queryable at any time — ${poolUrl}):
- BEFORE acting on an unfamiliar problem, GET ${poolUrl}/pool/skills/search?q=<keywords> to find relevant skill recipes.
- GET ${poolUrl}/pool/routing/for-task?text=<task> to see which sibling agent owns this kind of work.
- GET ${poolUrl}/pool/memory/recall?q=<keywords> to retrieve prior solutions and operator preferences.
- GET ${poolUrl}/pool/failures/similar?q=<symptom> to learn from past failures before reproducing them.
- AFTER you finish, POST a summary to ${poolUrl}/pool/memory/append so the next agent benefits.
- If you fail, POST to ${poolUrl}/pool/failures/record with { symptom, cause, fix } so the same wound does not reopen.
- The pool is open. Anyone can read. Anyone can write. Use it.

Your current task: ${task}

Remember: You are ${persona.name}. Act like it. Think like it. Work like it.`;
}

/**
 * Spawn an OpenClaude CLI subagent for a PURPCLAW agent.
 *
 * @param {string} agentName - PURPCLAW agent name (e.g. 'dragon', 'ghost')
 * @param {string} task - Task description for the agent
 * @param {object} options - Optional { teamId, parentId, agentFile }
 * @returns {object} - { pid, workDir, logFile }
 */
function spinUpAgent(agentName, task, options = {}) {
  options = options || {};
  const agentWorkDir = getAgentWorkDir(agentName);
  const logDir = path.join(agentWorkDir, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logDir, `agent_${agentName}_${timestamp}.log`);
  const pidFile = path.join(agentWorkDir, 'current_pid.txt');
  const persona = AGENT_PERSONAS[agentName] || AGENT_PERSONAS.default;

  const systemPrompt = buildSystemPrompt(agentName, task);

  const targetDir = options.sandboxDir || agentWorkDir;

  // OpenClaude CLI args for detached non-interactive execution
  // -p = --print (non-interactive, output to stdout)
  // Prompt goes right after -p, then system prompt and other flags
  // --name sets display name for the agent session
  // --add-dir adds the God Folder to accessible directories
  // --system-prompt prepends agent persona to default system prompt
  // --output-format json for machine-parseable output
  const args = [
    '-p',
    task,  // Prompt argument goes immediately after -p
    '--name', `purpclaw-${agentName}`,
    '--add-dir', options.sandboxDir || GOD_FOLDER,
    '--add-dir', targetDir,
    '--system-prompt', systemPrompt,
    '--output-format', 'json',
    '--no-session-persistence'
  ];

  // File-based stdio so detached child survives parent exit
  const stdoutFile = path.join(agentWorkDir, `agent_${agentName}_stdout.log`);
  const stderrFile = path.join(agentWorkDir, `agent_${agentName}_stderr.log`);
  fs.writeFileSync(stdoutFile, '', 'utf8');
  fs.writeFileSync(stderrFile, '', 'utf8');
  const stdoutFd = fs.openSync(stdoutFile, 'a');
  const stderrFd = fs.openSync(stderrFile, 'a');

  console.log(`[spinUpAgent] ${persona.emoji} ${persona.name} spawning OpenClaude CLI...`);
  console.log(`[spinUpAgent]   task: ${task.substring(0, 80)}${task.length > 80 ? '...' : ''}`);
  console.log(`[spinUpAgent]   workDir: ${targetDir}`);

  const child = trackedSpawn(NODE_BIN, [OPENCLAUDE_SCRIPT, ...args], {
    tag: `spinup-${agentName}`,
    timeoutMs: 30 * 60_000,  // 30 min hard budget
    cwd: targetDir,
    stdio: ['ignore', stdoutFd, stderrFd],
    env: {
      ...process.env,
      PURPCLAW_AGENT: agentName,
      PURPCLAW_TASK: task,
      PURPCLAW_TEAM: options.teamId || '',
      PYTHONIOENCODING: 'utf-8',
      // POOL-1: open knowledge pool — agents query at runtime, not at spawn
      POOL_URL: process.env.POOL_URL || `http://127.0.0.1:${process.env.POOL_PORT || '7885'}`,
    }
  });
  child.unref();

  const pid = child.pid;
  fs.writeFileSync(pidFile, pid.toString(), 'utf8');

  console.log(`[spinUpAgent] ${persona.emoji} ${persona.name} spawned (pid=${pid})`);

  // Poll stdout file and broadcast output chunks
  let lastSize = 0;
  let pollInterval = null;

  try {
    const stats = fs.statSync(stdoutFile);
    lastSize = stats.size;
  } catch (e) {}

  pollInterval = setInterval(() => {
    try {
      const stats = fs.statSync(stdoutFile);
      if (stats.size > lastSize) {
        const fd = fs.openSync(stdoutFile, 'r');
        const buf = Buffer.alloc(stats.size - lastSize);
        fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        const text = buf.toString('utf8');
        if (text.trim()) {
          const event = {
            type: 'agent_output',
            agentName,
            emoji: persona.emoji,
            output: text,
            timestamp: new Date().toISOString()
          };
          // Emit to EventBus if available
          if (typeof global !== 'undefined' && global.__eventBus) {
            global.__eventBus.emit('agent_output', event);
          }
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] OUT: ${text}\n`);
        }
        lastSize = stats.size;
      }
    } catch (e) {
      // File might not exist yet or be locked
    }
  }, 1000);

  child.on('close', (code) => {
    clearInterval(pollInterval);

    let rawOutput = '';
    try {
      rawOutput = fs.readFileSync(stdoutFile, 'utf8');
    } catch (e) {}

    try { fs.closeSync(stdoutFd); } catch (e) {}
    try { fs.closeSync(stderrFd); } catch (e) {}

    // Parse JSON output lines (one JSON object per line)
    const lines = rawOutput.split('\n').filter(l => l.trim().startsWith('{'));
    const outputs = [];
    for (const line of lines) {
      try {
        outputs.push(JSON.parse(line));
      } catch (e) {}
    }

    const finalOutput = outputs.length > 0 ? outputs[outputs.length - 1] : rawOutput;

    const event = {
      type: 'agent_complete',
      agentName,
      emoji: persona.emoji,
      code,
      output: finalOutput,
      timestamp: new Date().toISOString()
    };
    if (typeof global !== 'undefined' && global.__eventBus) {
      global.__eventBus.emit('agent_complete', event);
    }

    fs.appendFileSync(logFile, `[${new Date().toISOString()}] EXIT: code ${code}\n`);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] OUTPUT:\n${rawOutput}\n`);

    console.log(`[spinUpAgent] ${persona.emoji} ${persona.name} completed (pid=${pid}) code=${code}`);
  });

  return {
    pid,
    workDir: agentWorkDir,
    logFile,
    agentName,
    emoji: persona.emoji
  };
}

/**
 * Spawn a team of agents in parallel.
 *
 * @param {string} teamName - Team identifier (e.g. 'build', 'audit')
 * @param {Array<{agentName, task}>} agents - Array of agent+task pairs
 * @returns {Array<object>} - Array of spawn results
 */
function spinUpTeam(teamName, agents) {
  console.log(`[spinUpAgent] Team '${teamName}' spawning ${agents.length} agent(s)...`);
  return agents.map(({ agentName, task }) => spinUpAgent(agentName, task, { teamId: teamName }));
}

module.exports = { spinUpAgent, spinUpTeam };
