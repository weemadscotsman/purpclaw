/**
 * PURPCLAW UNIFIED CLI v1.0
 * Single command-line interface for the entire PURPCLAW system
 * 
 * Usage:
 *   node purpclaw_cli.js status              - Full system status
 *   node purpclaw_cli.js agents             - List all agents
 *   node purpclaw_cli.js spawn <agent> <task> - Spawn agent
 *   node purpclaw_cli.js events             - Stream all events
 *   node purpclaw_cli.js state              - Show shared state
 *   node purpclaw_cli.js demo               - Run full demo
 *   node purpclaw_cli.js help               - Show help
 */

const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const readline = require('readline');
const { execSync, spawn } = require('child_process');
const path = require('path');

const PURP_DIR = path.join(__dirname);
const PORTS = {
  EVENTBUS: 7782,
  STATE: 7783,
  UNIFIED_API: 7780,
  AGENT_TOWER: 7790,
  VOICE_COORD: 7781,
  VOICE_BRIDGE: 7779
};

const DEMO_PROJECT = 'C:\\Users\\Admin\\Desktop\\claude-code-system';

function log(msg, color = '') {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = color === 'green' ? '✅' : color === 'red' ? '❌' : color === 'yellow' ? '⚠️' : '  ';
  console.log(`${prefix} [${ts}] ${msg}`);
}

function logBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           PURPCLAW UNIFIED CLI v1.0                           ║
║           One CLI to rule them all                            ║
╚═══════════════════════════════════════════════════════════════╝
`);
}

function httpGet(port, path = '/health') {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode === 200, data: JSON.parse(data) }); }
        catch (e) { resolve({ ok: false, data, status: res.statusCode }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

function httpPost(port, path, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode === 200, data: JSON.parse(data) }); }
        catch (e) { resolve({ ok: false, data, status: res.statusCode }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

async function checkService(name, port, path = '/health') {
  const result = await httpGet(port, path);
  if (result.ok) {
    log(`${name}: UP`, 'green');
    return { name, port, status: 'up', data: result.data };
  } else {
    log(`${name}: DOWN (${result.error || 'no response'})`, 'red');
    return { name, port, status: 'down', error: result.error };
  }
}

async function cmdStatus() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  SYSTEM STATUS');
  console.log('═══════════════════════════════════════════\n');
  
  const results = await Promise.all([
    checkService('Event Bus', PORTS.EVENTBUS),
    checkService('State Store', PORTS.STATE),
    checkService('Unified API', PORTS.UNIFIED_API, '/api/health'),
    checkService('Agent Tower', PORTS.AGENT_TOWER, '/tower/status'),
  ]);
  
  console.log('\n═══════════════════════════════════════════');
  const upCount = results.filter(r => r.status === 'up').length;
  console.log(`  ${upCount}/${results.length} services UP`);
  console.log('═══════════════════════════════════════════\n');
  
  if (results.find(r => r.name === 'State Store')?.status === 'up') {
    const stateResult = await httpGet(PORTS.STATE, '/state');
    if (stateResult.ok && stateResult.data) {
      console.log('State Summary:');
      console.log(`  Agents: ${Object.keys(stateResult.data.agents || {}).length} registered`);
      console.log(`  Teams: ${Object.keys(stateResult.data.teams || {}).length} active`);
      console.log(`  Swarm Tasks: ${(stateResult.data.swarm?.activeTasks || []).length} active`);
    }
  }
  
  return results;
}

async function cmdAgents() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  AGENT LIST');
  console.log('═══════════════════════════════════════════\n');
  
  const result = await httpGet(PORTS.STATE, '/agents');
  if (result.ok && result.data) {
    const agents = result.data;
    if (agents.length === 0) {
      console.log('  No active agents');
    } else {
      agents.forEach(a => {
        const statusColor = a.status === 'active' ? 'green' : 'yellow';
        console.log(`  [${a.status || 'unknown'.padEnd(10)}] ${a.name || a.id} - ${a.task?.slice(0, 50) || 'no task'}`);
      });
    }
  } else {
    log('Failed to get agents from state store', 'red');
    log('Trying Agent Tower directly...', 'yellow');
    const towerResult = await httpGet(PORTS.AGENT_TOWER, '/tower/status');
    if (towerResult.ok) {
      console.log('  Agent Tower is responding but no agents spawned');
    }
  }
  console.log();
}

async function cmdSpawn(agentName, task) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  SPAWNING AGENT: ${agentName}`);
  console.log(`  Task: ${task}`);
  console.log(`═══════════════════════════════════════════\n`);
  
  const result = await httpPost(PORTS.AGENT_TOWER, '/api/tower/spawn', {
    agentName,
    task: task || 'No task specified'
  });
  
  if (result.ok) {
    log(`Agent ${agentName} spawned successfully`, 'green');
    if (result.data?.agent) {
      console.log(`  Agent ID: ${result.data.agent.id}`);
      console.log(`  Status: ${result.data.agent.status}`);
    }
  } else {
    log(`Failed to spawn ${agentName}: ${JSON.stringify(result.data)}`, 'red');
  }
  console.log();
}

async function cmdEvents(pattern = '*') {
  console.log('\n═══════════════════════════════════════════');
  console.log(`  EVENT STREAM (pattern: ${pattern})`);
  console.log('  Press Ctrl+C to exit');
  console.log('═══════════════════════════════════════════\n');
  
  const eventsUrl = `http://localhost:${PORTS.EVENTBUS}/events/${pattern}`;
  console.log(`Connecting to ${eventsUrl}...\n`);
  
  try {
    const es = new EventSource(eventsUrl);
    
    es.onopen = () => {
      log('Connected to event stream', 'green');
    };
    
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        const topic = event.topic || event.type || 'unknown';
        console.log(`[${event.timestamp?.split('T')[1].slice(0, -1) || ''}] ${topic}: ${JSON.stringify(event.data || event).slice(0, 100)}`);
      } catch (e) {
        console.log(`RAW: ${e.data}`);
      }
    };
    
    es.onerror = (e) => {
      log('Event stream error - reconnecting...', 'yellow');
    };
    
    process.on('SIGINT', () => {
      es.close();
      console.log('\nEvent stream closed');
      process.exit(0);
    });
  } catch (e) {
    log(`Failed to connect: ${e.message}`, 'red');
  }
}

async function cmdState() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  SHARED STATE');
  console.log('═══════════════════════════════════════════\n');
  
  const result = await httpGet(PORTS.STATE, '/state');
  if (result.ok) {
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    log('Failed to get state', 'red');
  }
  console.log();
}

async function cmdDemo() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    PURPCLAW DEMO v1.0                        ║
║     Watch the swarm take orders and delegate work!           ║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  log('STEP 1: Running smoke test...', 'yellow');
  console.log();
  
  const services = await cmdStatus();
  const upCount = services.filter(r => r.status === 'up').length;
  
  if (upCount < 2) {
    log('Not enough services UP for demo. Please start services first.', 'red');
    console.log('  Run: node unified_bridge.js');
    return;
  }
  
  console.log();
  log('STEP 2: Checking event bus...', 'yellow');
  const ebHealth = await httpGet(PORTS.EVENTBUS, '/health');
  if (!ebHealth.ok) {
    log('Event Bus is DOWN - starting it...', 'yellow');
    console.log('  Note: Event bus should be started with unified_bridge.js');
  }
  
  console.log();
  log('STEP 3: Checking demo project exists...', 'yellow');
  try {
    const fs = require('fs');
    if (fs.existsSync(DEMO_PROJECT)) {
      log(`Demo project found: ${DEMO_PROJECT}`, 'green');
    } else {
      log(`Demo project NOT found at ${DEMO_PROJECT}`, 'red');
      log('Will still run demo but agents will have limited work', 'yellow');
    }
  } catch (e) {}
  
  console.log();
  log('STEP 4: Spawning analysis team...', 'yellow');
  console.log();
  
  const agents = [
    { name: 'spider', task: 'Analyze project structure and file organization' },
    { name: 'turtle', task: 'Review code quality and identify technical debt' },
    { name: 'rabbit', task: 'Check for edge cases and error handling' },
    { name: 'ghost', task: 'Audit security patterns and potential vulnerabilities' }
  ];
  
  for (const agent of agents) {
    console.log(`  Spawning ${agent.name}...`);
    await cmdSpawn(agent.name, agent.task);
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log();
  log('STEP 5: Team spawned! Watching delegation...', 'yellow');
  console.log();
  
  const eventStream = `http://localhost:${PORTS.EVENTBUS}/events/agent.*`;
  console.log(`Subscribe to events: ${eventStream}`);
  console.log();
  log('Demo agents are now working. Check the dashboard at http://localhost:3000', 'green');
  log('To watch events in real-time, run: node purpclaw_cli.js events', 'green');
  console.log();
  log('DEMO COMPLETE - Swarm is operational!', 'green');
}

function cmdHelp() {
  logBanner();
  console.log(`
USAGE:
  node purpclaw_cli.js <command> [args]

COMMANDS:
  status              - Check all services and show system status
  agents             - List all active agents
  spawn <name> <task>- Spawn an agent with a task
  events [pattern]   - Stream events from the event bus
  state              - Show the full shared state
  demo               - Run a full demonstration
  
  help               - Show this help

EXAMPLES:
  node purpclaw_cli.js status
  node purpclaw_cli.js spawn spider "Analyze the codebase"
  node purpclaw_cli.js events agent.*
  node purpclaw_cli.js demo

AGENTS:
  dragon, spider, turtle, rabbit, ghost, owl, octopus, wolf, penguin, and more...
  See AGENT_DIRECTORY.md for full list

`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';
  
  switch (cmd) {
    case 'status':
      await cmdStatus();
      break;
    case 'agents':
      await cmdAgents();
      break;
    case 'spawn':
      if (!args[1]) {
        log('Usage: node purpclaw_cli.js spawn <agent-name> <task>', 'red');
        log('Example: node purpclaw_cli.js spawn spider "Analyze code"', 'yellow');
      } else {
        await cmdSpawn(args[1], args.slice(2).join(' '));
      }
      break;
    case 'events':
      await cmdEvents(args[1] || '*');
      break;
    case 'state':
      await cmdState();
      break;
    case 'demo':
      await cmdDemo();
      break;
    case 'help':
    default:
      cmdHelp();
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('CLI Error:', e.message);
    process.exit(1);
  });
}

module.exports = { cmdStatus, cmdAgents, cmdSpawn, cmdEvents, cmdState, cmdDemo };
