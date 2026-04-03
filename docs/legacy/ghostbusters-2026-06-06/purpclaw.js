#!/usr/bin/env node

/**
 * PURPCLAW LAUNCHER v1.0
 * ======================
 * Interactive CLI for PURPCLAW multi-agent orchestration
 *
 * Usage:
 *   node purpclaw.js start      - Start all PM2 services
 *   node purpclaw.js stop      - Stop all services
 *   node purpclaw.js status     - Show service status
 *   node purpclaw.js spawn      - Interactive agent spawner
 *   node purpclaw.js task       - Execute a task
 *   node purpclaw.js agents     - List all agents
 *   node purpclaw.js log        - Stream logs
 *   node purpclaw.js shell      - Interactive shell
 */

const { spawn: rawSpawn, execSync } = require('child_process');
const readline = require('readline');
const http = require('http');
const path = require('path');
const { trackedSpawn } = require('./lib/child-registry');

const PROJECT_DIR = path.join(__dirname);

// Ports for health checks
const SERVICES = {
  'purpclaw-api':         { port: 7780, name: 'Unified API',        color: '\x1b[36m' },
  'purpclaw-tower':       { port: 7790, name: 'Agent Tower',       color: '\x1b[35m' },
  'purpclaw-eventbus':     { port: 7782, name: 'Event Bus',          color: '\x1b[33m' },
  'purpclaw-state':       { port: 7783, name: 'State Store',       color: '\x1b[32m' },
  'purpclaw-orchestrator':{ port: 7784, name: 'Orchestrator',      color: '\x1b[34m' },
  'purpclaw-voice':       { port: 7781, name: 'Voice Coordinator', color: '\x1b[36m' },
  'purpclaw-bridge':      { port: 8779, name: 'Voice Bridge',      color: '\x1b[33m' },
  'purpclaw-gatekeeper':  { port: 7791, name: 'Gatekeeper',        color: '\x1b[31m' },
  'purpclaw-nextjs':      { port: 3000,  name: 'Next.js Frontend',  color: '\x1b[37m' },
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

// ========== UTILITIES ==========

function exec(command, options = {}) {
  return new Promise((resolve, reject) => {
    // Parse command into args for trackedSpawn
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    const child = trackedSpawn(cmd, args, {
      tag: `exec-${cmd}`,
      timeoutMs: options.timeoutMs || 60_000,
      stdio: options.stdout ? 'pipe' : 'inherit',
      ...options,
    });
    let stdout = '', stderr = '';
    if (options.stdout) {
      child.stdout.on('data', d => stdout += d);
      child.stderr.on('data', d => stderr += d);
    }
    child.on('close', code => {
      if (code === 0 || options.ignoreError) resolve({ code, stdout, stderr });
      else reject({ code, stdout, stderr });
    });
    child.on('error', reject);
  });
}

function checkHealth(port) {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${port}/api/health`, res => {
      resolve({ ok: res.statusCode === 200, status: res.statusCode });
    });
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.setTimeout(1000, () => { req.destroy(); resolve({ ok: false, status: 0 }); });
  });
}

async function checkAllHealth() {
  const results = {};
  for (const [name, svc] of Object.entries(SERVICES)) {
    results[name] = await checkHealth(svc.port);
  }
  return results;
}

// ========== COMMANDS ==========

async function cmdStart() {
  console.log(`\n${BOLD}🚀 Starting PURPCLAW services...${RESET}\n`);
  try {
    await exec('pm2 start ecosystem.config.js');
    await exec('pm2 save');
    console.log(`\n${GREEN}✓${RESET} All services started and saved`);
    await cmdStatus();
  } catch (e) {
    console.error(`${RED}✗${RESET} Failed to start services: ${e.stderr || e.message}`);
  }
}

async function cmdStop() {
  console.log(`\n${BOLD}🛑 Stopping PURPCLAW services...${RESET}\n`);
  try {
    await exec('pm2 delete all');
    console.log(`${GREEN}✓${RESET} All services stopped`);
  } catch (e) {
    console.error(`${RED}✗${RESET} Failed to stop: ${e.message}`);
  }
}

async function cmdRestart() {
  console.log(`\n${BOLD}🔄 Restarting PURPCLAW services...${RESET}\n`);
  try {
    await exec('pm2 restart all');
    await cmdStatus();
  } catch (e) {
    console.error(`${RED}✗${RESET} Failed to restart: ${e.message}`);
  }
}

async function cmdStatus() {
  console.log(`\n${BOLD}📊 PURPCLAW Service Status${RESET}\n`);
  const health = await checkAllHealth();
  const pm2Out = execSync('pm2 jlist', { encoding: 'utf8' });
  let pm2Data = [];
  try { pm2Data = JSON.parse(pm2Out); } catch {}

  console.log(`${'Service'.padEnd(22)} ${'Port'.padEnd(6)} ${'PM2'.padEnd(10)} ${'Health'}`);
  console.log('─'.repeat(60));

  for (const [name, svc] of Object.entries(SERVICES)) {
    const pm2Proc = pm2Data.find(p => p.name === name);
    const pm2Status = pm2Proc ? pm2Proc.pm2_env?.status || 'unknown' : 'not running';
    const h = health[name];
    const healthStr = h.ok ? `${GREEN}✓ healthy${RESET}` : `${RED}✗ down${RESET}`;
    const statusColor = pm2Status === 'online' ? GREEN : (pm2Status === 'stopped' ? RED : YELLOW);

    console.log(
      `${svc.color}${svc.name.padEnd(22)}${RESET}` +
      `${String(svc.port).padEnd(6)}` +
      `${statusColor}${pm2Status.padEnd(10)}${RESET}` +
      `${h.ok ? GREEN : RED}${h.status || '---'}${RESET}`
    );
  }
  console.log('');
}

async function cmdSpawn(agentName, task) {
  if (!agentName) {
    console.log(`\n${BOLD}Available agents:${RESET}`);
    const agents = ['dragon','robot','owl','ghost','spider','bunny','cactus','fox','penguin','mantis','gorilla','goose','parrot','phoenix','crow','duck','rabbit','turtle','axolotl','chonk','mushroom','bee','wolf','snake','guardian','karen','lemur','raven','hawk','elephant','panda','void','octopus','shark'];
    for (let i = 0; i < agents.length; i += 3) {
      console.log(`  ${agents.slice(i, i+3).join(', ')}`);
    }
    console.log('\nUsage: node purpclaw.js spawn <agent> [task]');
    return;
  }

  task = task || 'Execute the assigned task';

  console.log(`\n${BOLD}🦾 Spawning ${agentName}...${RESET}\n`);

  const body = JSON.stringify({ agent: agentName, task, broadcast: true });

  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost', port: 7790, path: '/spawn', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, resolve);
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (result.success) {
          console.log(`${GREEN}✓${RESET} Agent spawned: ${result.agent?.id}`);
          console.log(`  Name: ${result.agent?.name}`);
          console.log(`  Division: ${result.agent?.division}`);
          console.log(`  Role: ${result.agent?.role}`);
        } else {
          console.log(`${RED}✗${RESET} Failed: ${result.error}`);
        }
      } catch { console.log(`${RED}✗${RESET} Invalid response`); }
    });
  } catch (e) {
    console.error(`${RED}✗${RESET} Tower not reachable: ${e.message}`);
    console.log(`  Make sure purpclaw-tower is running (${YELLOW}node purpclaw.js status${RESET})`);
  }
}

async function cmdTask(taskText) {
  if (!taskText) {
    console.log('\nUsage: node purpclaw.js task <description>');
    console.log('Example: node purpclaw.js task "build a REST API for user management"\n');
    return;
  }

  console.log(`\n${BOLD}📋 Executing task: "${taskText}"${RESET}\n`);

  const body = JSON.stringify({ command: taskText });

  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost', port: 7784, path: '/execute', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, resolve);
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (result.success) {
          console.log(`${GREEN}✓${RESET} Task accepted: ${result.workflowId}`);
          console.log(`  Intent: ${result.intent}`);
          console.log(`  Plan: ${result.steps?.length || 0} steps`);
          if (result.assignedAgent) console.log(`  Agent: ${result.assignedAgent}`);
        } else {
          console.log(`${RED}✗${RESET} Failed: ${result.error || 'unknown error'}`);
        }
      } catch { console.log(data || 'No response from orchestrator'); }
    });
  } catch (e) {
    console.error(`${RED}✗${RESET} Orchestrator not reachable: ${e.message}`);
    console.log(`  Make sure purpclaw-orchestrator is running (${YELLOW}node purpclaw.js status${RESET})`);
  }
}

async function cmdAgents() {
  console.log(`\n${BOLD}🤖 Agent Registry${RESET}\n`);

  try {
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:7790/agents', resolve).on('error', reject);
    });
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const agents = JSON.parse(data);
        for (const [name, info] of Object.entries(agents)) {
          console.log(`${BOLD}${info.emoji} ${info.name}${RESET}`);
          console.log(`   Division: ${info.division} | Tier: ${info.tier} | Role: ${info.role}`);
          console.log(`   Skills: ${info.skills?.join(', ') || 'none'}`);
          console.log('');
        }
      } catch { console.log(data); }
    });
  } catch (e) {
    console.error(`${RED}✗${RESET} Tower not reachable: ${e.message}`);
  }
}

async function cmdLog(service) {
  if (!service) {
    console.log('\nUsage: node purpclaw.js log <service>');
    console.log('Services:', Object.keys(SERVICES).join(', '));
    console.log('Example: node purpclaw.js log purpclaw-tower\n');
    return;
  }
  if (!SERVICES[service]) {
    console.error(`${RED}Unknown service: ${service}${RESET}`);
    return;
  }
  console.log(`\n${BOLD}📜 Streaming logs: ${service}${RESET} (Ctrl+C to stop)\n`);
  spawn('pm2', ['logs', service], { stdio: 'inherit' });
}

async function cmdShell() {
  console.log(`\n${BOLD}🐚 PURPCLAW Interactive Shell${RESET}`);
  console.log(`Type ${YELLOW}help${RESET} for commands, ${YELLOW}exit${RESET} to quit\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'purpclaw> ' });
  rl.prompt();

  const commands = {
    help: () => {
      console.log(`${BOLD}Commands:${RESET}`);
      console.log(`  ${YELLOW}start${RESET}        - Start all services`);
      console.log(`  ${YELLOW}stop${RESET}         - Stop all services`);
      console.log(`  ${YELLOW}restart${RESET}      - Restart all services`);
      console.log(`  ${YELLOW}status${RESET}       - Show service health`);
      console.log(`  ${YELLOW}agents${RESET}       - List all agents`);
      console.log(`  ${YELLOW}spawn <name>${RESET} - Spawn an agent`);
      console.log(`  ${YELLOW}task <desc>${RESET}  - Execute a task`);
      console.log(`  ${YELLOW}log <svc>${RESET}    - Stream service logs`);
      console.log(`  ${YELLOW}health${RESET}       - Quick health check`);
      console.log(`  ${YELLOW}exit${RESET}         - Exit shell`);
    },
    start: cmdStart,
    stop: cmdStop,
    restart: cmdRestart,
    status: cmdStatus,
    agents: cmdAgents,
    health: async () => { await cmdStatus(); },
  };

  rl.on('line', async line => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === 'exit' || input === 'quit') { rl.close(); return; }

    const [cmd, ...args] = input.split(/\s+/);
    const argStr = args.join(' ');

    if (commands[cmd]) {
      try { await commands[cmd](argStr); } catch (e) { console.error(`${RED}Error: ${e.message}${RESET}`); }
    } else if (cmd === 'spawn' && args[0]) {
      try { await cmdSpawn(args[0], args.slice(1).join(' ')); } catch (e) { console.error(`${RED}Error: ${e.message}${RESET}`); }
    } else if (cmd === 'task') {
      try { await cmdTask(argStr); } catch (e) { console.error(`${RED}Error: ${e.message}${RESET}`); }
    } else if (cmd === 'log') {
      await cmdLog(argStr);
    } else {
      console.log(`${RED}Unknown command: ${cmd}${RESET}. Type ${YELLOW}help${RESET} for commands.`);
    }
    rl.prompt();
  });

  rl.on('close', () => console.log('\nGoodbye! 👋\n'));
}

// ========== MAIN ==========

const [,, command, ...args] = process.argv;

(async () => {
  switch (command) {
    case 'start':      await cmdStart(); break;
    case 'stop':       await cmdStop(); break;
    case 'restart':    await cmdRestart(); break;
    case 'status':     await cmdStatus(); break;
    case 'spawn':      await cmdSpawn(args[0], args.slice(1).join(' ')); break;
    case 'task':       await cmdTask(args.join(' ')); break;
    case 'agents':     await cmdAgents(); break;
    case 'log':        await cmdLog(args[0]); break;
    case 'shell':      await cmdShell(); break;
    case undefined:
    case 'help':
    default:
      console.log(`
${BOLD}🦞 PURPCLAW LAUNCHER${RESET}

${BOLD}Usage:${RESET}
  node purpclaw.js <command>

${BOLD}Commands:${RESET}
  ${YELLOW}start${RESET}        Start all PM2 services
  ${YOLDOW}stop${RESET}         Stop all services
  ${YELLOW}restart${RESET}      Restart all services
  ${YELLOW}status${RESET}       Show service health and PM2 status
  ${YELLOW}spawn${RESET}        Spawn an agent (interactive if no args)
  ${YELLOW}task${RESET}         Execute a task via orchestrator
  ${YELLOW}agents${RESET}       List all registered agents
  ${YELLOW}log${RESET}          Stream logs for a service
  ${YELLOW}shell${RESET}        Interactive shell mode

${BOLD}Examples:${RESET}
  node purpclaw.js start
  node purpclaw.js status
  node purpclaw.js spawn dragon "design a scalable API"
  node purpclaw.js task "fix the authentication bug"
  node purpclaw.js log purpclaw-tower
  node purpclaw.js shell
`);
  }
})();
