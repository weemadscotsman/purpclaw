/**
 * VOICE COORDINATOR v1.0 - PURPCLAW
 * ==================================
 * Unified voice command processor
 * Routes natural language → task planning → agent spawning → TTS response
 *
 * Listens on TCP port 7781 for voice bridge commands
 * Connects to unified_api.js on 7780 for agent control
 * Uses Kokoro TTS for voice responses
 */

const net = require('net');
const http = require('http');
const path = require('path');

const VOICE_COORD_PORT = 7781;

log(`Voice Coordinator listening on port ${VOICE_COORD_PORT}`);

// HTTP health endpoint
const healthPort = VOICE_COORD_PORT + 1000;
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }
  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'healthy', service: 'voice-coordinator', port: VOICE_COORD_PORT }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(healthPort, () => {});
const CONTROL_API_PORT = 7780;
const PURP_DIR = path.join(__dirname);
const TASKS_FILE = path.join(PURP_DIR, 'cognitive_tasks.json');
const KOKORO = 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat';
const KOKORO_LONG = 'C:\\Users\\Admin\\.openclaw\\kokoro_long_send.bat';
const AGENT_TOWER_PORT = 7790;

// Agent registry for intent matching
const AGENT_BY_INTENT = {
  // Architecture & Planning
  design: ['dragon', 'owl'],
  architect: ['dragon'],
  plan: ['penguin', 'wolf'],

  // Code work
  build: ['robot', 'dragon'],
  code: ['robot', 'bee'],
  fix: ['cactus', 'rabbit'],
  debug: ['cactus'],
  refactor: ['axolotl', 'mushroom'],

  // Design
  design_ui: ['mushroom', 'duck', 'penguin'],
  interface: ['mushroom', 'penguin'],

  // Security
  security: ['spider', 'ghost', 'guardian', 'snake'],
  audit: ['ghost', 'owl', 'snake'],

  // Data & Research
  research: ['spider', 'duck', 'raven'],
  data: ['duck', 'crow'],
  web: ['spider'],

  // System
  optimize: ['chonk', 'fox'],
  system: ['chonk', 'turtle'],
  analyze: ['turtle', 'octopus', 'hawk'],

  // Quality
  test: ['rabbit', 'turtle', 'robot'],
  review: ['owl', 'karen', 'ghost'],
  validate: ['robot', 'rabbit'],

  // Coordination
  coordinate: ['wolf', 'penguin'],
  lead: ['wolf'],
  manage: ['penguin', 'karen'],

  // Media & Communication
  media: ['goose', 'parrot', 'duck'],
  content: ['phoenix', 'parrot', 'panda'],

  // Quick fixes
  quick: ['bunny', 'mantis'],
  fast: ['bunny', 'mantis'],

  // Infrastructure
  infrastructure: ['cactus', 'void', 'raven'],
  server: ['cactus', 'fox'],

  // Operations
  deploy: ['gorilla', 'shark'],
  heavy: ['gorilla'],
};

// Intent patterns for task routing
const INTENT_PATTERNS = [
  { pattern: /build\s+(.+)/i, intent: 'build', useTeam: true },
  { pattern: /create\s+(.+)/i, intent: 'build', useTeam: true },
  { pattern: /make\s+(.+)/i, intent: 'build', useTeam: true },
  { pattern: /design\s+(.+)/i, intent: 'design', useTeam: true },
  { pattern: /fix\s+(.+)/i, intent: 'fix', useTeam: false },
  { pattern: /debug\s+(.+)/i, intent: 'debug', useTeam: false },
  { pattern: /research\s+(.+)/i, intent: 'research', useTeam: true },
  { pattern: /analyze\s+(.+)/i, intent: 'analyze', useTeam: true },
  { pattern: /audit\s+(.+)/i, intent: 'audit', useTeam: true },
  { pattern: /test\s+(.+)/i, intent: 'test', useTeam: true },
  { pattern: /review\s+(.+)/i, intent: 'review', useTeam: true },
  { pattern: /deploy\s+(.+)/i, intent: 'deploy', useTeam: true },
  { pattern: /optimize\s+(.+)/i, intent: 'optimize', useTeam: false },
  { pattern: /refactor\s+(.+)/i, intent: 'refactor', useTeam: true },
  { pattern: /coordinate\s+(.+)/i, intent: 'coordinate', useTeam: true },
  { pattern: /status/i, intent: 'status', useTeam: false },
  { pattern: /swarm\s+status/i, intent: 'swarm_status', useTeam: false },
  { pattern: /list\s+agents/i, intent: 'list_agents', useTeam: false },
  { pattern: /list\s+tasks/i, intent: 'list_tasks', useTeam: false },
  { pattern: /kill\s+(.+)/i, intent: 'kill', useTeam: false },
  { pattern: /stop\s+(.+)/i, intent: 'stop', useTeam: false },
];

// Team templates for common workflows
const TEAM_TEMPLATES = {
  build: { leader: 'wolf', members: ['dragon', 'robot', 'bee'], description: 'Building' },
  design: { leader: 'wolf', members: ['mushroom', 'penguin', 'duck'], description: 'Designing' },
  research: { leader: 'spider', members: ['raven', 'duck', 'crow'], description: 'Researching' },
  audit: { leader: 'owl', members: ['ghost', 'snake', 'rabbit'], description: 'Auditing' },
  fix: { leader: 'cactus', members: ['robot', 'rabbit'], description: 'Fixing' },
  analyze: { leader: 'turtle', members: ['octopus', 'hawk'], description: 'Analyzing' },
  deploy: { leader: 'gorilla', members: ['shark', 'chonk'], description: 'Deploying' },
  optimize: { leader: 'chonk', members: ['fox', 'cactus'], description: 'Optimizing' },
  refactor: { leader: 'axolotl', members: ['mushroom', 'robot', 'void'], description: 'Refactoring' },
  test: { leader: 'rabbit', members: ['turtle', 'robot'], description: 'Testing' },
  review: { leader: 'owl', members: ['karen', 'ghost'], description: 'Reviewing' },
  coordinate: { leader: 'wolf', members: ['penguin', 'karen', 'bee'], description: 'Coordinating' },
  debug: { leader: 'cactus', members: ['rabbit', 'void'], description: 'Debugging' },
  security: { leader: 'spider', members: ['ghost', 'guardian', 'snake'], description: 'Securing' },
};

// Task queue for coordination
const taskQueue = [];
let currentTaskId = 0;

// Active team tracking
const activeTeams = new Map();

// Logging helper
function log(...args) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[VOICE-COORD]`, ts, '|', ...args);
}

// Speak via Kokoro TTS
function speak(text) {
  if (!text || text.length === 0) return;
  try {
    const cmd = `cmd.exe /c "${KOKORO}" "${text.replace(/"/g, '\\"')}"`;
    require('child_process').exec(cmd, { windowsHide: true });
    log('SPEAK:', text.substring(0, 80));
  } catch (e) {
    log('TTS Error:', e.message);
  }
}

// Send to control API
function sendToControlAPI(data) {
  return new Promise((resolve, reject) => {
    try {
      const payload = JSON.stringify(data);
      const req = http.request({
        hostname: 'localhost',
        port: CONTROL_API_PORT,
        path: '/api/bridge-event',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Fetch agent tower status
async function getTowerStatus() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${AGENT_TOWER_PORT}/api/status`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// Parse voice command into intent
function parseVoiceCommand(text) {
  const lower = text.toLowerCase().trim();

  for (const intentPattern of INTENT_PATTERNS) {
    const match = lower.match(intentPattern.pattern);
    if (match) {
      return {
        intent: intentPattern.intent,
        useTeam: intentPattern.useTeam,
        target: match[1] || null,
        raw: text
      };
    }
  }

  return { intent: null, useTeam: false, target: null, raw: text };
}

// Get agents for intent
function getAgentsForIntent(intent) {
  const agentKeys = AGENT_BY_INTENT[intent] || [];
  const agents = [];

  for (const key of agentKeys) {
    const info = getAgentInfo(key);
    if (info) agents.push(info);
  }

  return agents;
}

// Get agent info (mock registry for standalone use)
function getAgentInfo(name) {
  const registry = {
    wolf: { name: 'WOLF', emoji: '🐺', division: 'Engineering', role: 'Pack Leader' },
    dragon: { name: 'DRAGON', emoji: '🐉', division: 'Engineering', role: 'Chief Architect' },
    robot: { name: 'ROBOT', emoji: '🤖', division: 'Engineering', role: 'Precision Engineer' },
    bee: { name: 'BEE', emoji: '🐝', division: 'Engineering', role: 'Pollination Specialist' },
    cactus: { name: 'CACTUS', emoji: '🌵', division: 'Infrastructure', role: 'Efficiency Auditor' },
    rabbit: { name: 'RABBIT', emoji: '🐰', division: 'Security', role: 'Defensive Programmer' },
    mushroom: { name: 'MUSHROOM', emoji: '🍄', division: 'Engineering', role: 'Organic Refactorer' },
    penguin: { name: 'PENGUIN', emoji: '🐧', division: 'Management', role: 'Project Coordinator' },
    duck: { name: 'DUCK', emoji: '🦆', division: 'Media Ops', role: 'Research Accelerant' },
    spider: { name: 'SPIDER', emoji: '🕷️', division: 'Intelligence', role: 'Intel Specialist' },
    raven: { name: 'RAVEN', emoji: '🐦‍⬛', division: 'Intelligence', role: 'Signals Analyst' },
    crow: { name: 'CROW', emoji: '🐦', division: 'Creative', role: 'Gatherer' },
    owl: { name: 'OWL', emoji: '🦉', division: 'Security', role: 'Security Auditor' },
    ghost: { name: 'GHOST', emoji: '👻', division: 'Intelligence', role: 'Quality Guardian' },
    snake: { name: 'SNAKE', emoji: '🐍', division: 'Security', role: 'Primary Access' },
    turtle: { name: 'TURTLE', emoji: '🐢', division: 'Engineering', role: 'Quality Engineer' },
    octopus: { name: 'OCTOPUS', emoji: '🐙', division: 'Security', role: 'Edge Case Hunter' },
    hawk: { name: 'HAWK', emoji: '🦅', division: 'Intelligence', role: 'Aerial Recon' },
    chonk: { name: 'CHONK', emoji: '💀', division: 'Engineering', role: 'Simplification Expert' },
    fox: { name: 'FOX', emoji: '🦊', division: 'Intelligence', role: 'Strategy Specialist' },
    axolotl: { name: 'AXOLOTL', emoji: '🦎', division: 'Engineering', role: 'Regeneration Specialist' },
    void: { name: 'VOID', emoji: '🕳️', division: 'Infrastructure', role: 'Null Handler' },
    guardian: { name: 'GUARDIAN', emoji: '🛡️', division: 'Security', role: 'Real-time Monitor' },
    gorilla: { name: 'GORILLA', emoji: '🦍', division: 'Operations', role: 'Heavy Lifter' },
    shark: { name: 'SHARK', emoji: '🦈', division: 'Operations', role: 'Hunter' },
    goose: { name: 'GOOSE', emoji: '🪿', division: 'Media Ops', role: 'Chaos Catalyst' },
    parrot: { name: 'PARROT', emoji: '🦜', division: 'Media Ops', role: 'Communication Bridge' },
    phoenix: { name: 'PHOENIX', emoji: '🔥', division: 'Creative', role: 'Rebirth Specialist' },
    panda: { name: 'PANDA', emoji: '🐼', division: 'Creative', role: 'Content Specialist' },
    bunny: { name: 'BUNNY', emoji: '🐰', division: 'Security', role: 'Quick Reaction' },
    mantis: { name: 'MANTIS', emoji: '🪲', division: 'Operations', role: 'Precision Striker' },
    karen: { name: 'KAREN', emoji: '💅', division: 'Management', role: 'Quality Control' },
  };
  return registry[name.toLowerCase()] || null;
}

// Spawn team via agent tower
async function spawnTeamFromIntent(intent, target) {
  const template = TEAM_TEMPLATES[intent];
  if (!template) {
    return { success: false, error: `No team template for intent: ${intent}` };
  }

  const teamId = `team-${Date.now()}`;
  const task = `${template.description} ${target}`;

  const teamInfo = {
    type: 'team_spawn',
    teamId,
    leader: template.leader,
    members: template.members,
    task,
    target,
    intent
  };

  try {
    await sendToControlAPI(teamInfo);
    activeTeams.set(teamId, {
      intent,
      target,
      leader: template.leader,
      members: template.members,
      startTime: new Date().toISOString()
    });

    return {
      success: true,
      teamId,
      leader: template.leader,
      members: template.members,
      task
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Handle status queries
async function handleStatusQuery() {
  try {
    const status = await getTowerStatus();
    if (status) {
      const active = status.activeAgents?.length || 0;
      const teams = status.teams?.length || 0;
      return `System operational. ${active} agents active across ${teams} teams.`;
    }
    return 'Agent tower not responding.';
  } catch (e) {
    return 'Error getting status.';
  }
}

// Handle list agents
async function handleListAgents() {
  try {
    const status = await getTowerStatus();
    if (status && status.registeredAgents) {
      const agents = status.registeredAgents.map(a => `${a.emoji} ${a.name}`).join(', ');
      return `Available agents: ${agents}`;
    }
    return 'Could not fetch agent list.';
  } catch (e) {
    return 'Error listing agents.';
  }
}

// Main command handler
async function handleCommand(cmd) {
  log('Received command:', cmd);

  try {
    const parsed = parseVoiceCommand(cmd);
    log('Parsed intent:', parsed.intent, '| target:', parsed.target);

    // Handle status queries directly
    if (parsed.intent === 'status') {
      const response = await handleStatusQuery();
      speak(response);
      return { response };
    }

    if (parsed.intent === 'swarm_status') {
      const status = await getTowerStatus();
      const active = status?.tower?.totalActive || 0;
      const teams = status?.tower?.totalTeams || 0;
      const response = `${active} agents active in ${teams} teams.`;
      speak(response);
      return { response };
    }

    if (parsed.intent === 'list_agents') {
      const response = await handleListAgents();
      speak(response);
      return { response };
    }

    if (parsed.intent === 'list_tasks') {
      try {
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
        const running = Object.values(tasks.tasks).filter(t => t.status === 'running');
        const completed = Object.values(tasks.tasks).filter(t => t.status === 'completed');
        const response = `${running.length} tasks running, ${completed.length} completed.`;
        speak(response);
        return { response };
      } catch (e) {
        return { response: 'Could not read tasks.' };
      }
    }

    // Handle kill/stop
    if (parsed.intent === 'kill' || parsed.intent === 'stop') {
      const target = parsed.target;
      await sendToControlAPI({ type: 'kill_agent', agentName: target });
      speak(`Stopping ${target}.`);
      return { response: `Killing ${target}` };
    }

    // Handle team-based intents
    if (parsed.intent && parsed.useTeam && parsed.target) {
      const result = await spawnTeamFromIntent(parsed.intent, parsed.target);

      if (result.success) {
        const leader = getAgentInfo(result.leader);
        const memberList = result.members.map(m => getAgentInfo(m)).filter(Boolean).map(a => a.emoji).join('');
        const response = `Team spawned. ${leader.emoji} ${leader.name} leading ${memberList} on ${parsed.target}.`;
        speak(response);
        return { response, teamId: result.teamId };
      } else {
        speak('Failed to spawn team.');
        return { response: 'Team spawn failed.' };
      }
    }

    // Handle single agent intents
    if (parsed.intent && parsed.target && !parsed.useTeam) {
      const agents = getAgentsForIntent(parsed.intent);
      if (agents.length > 0) {
        const agent = agents[0];
        await sendToControlAPI({
          type: 'agent_spawn',
          agentName: agent.name.toLowerCase(),
          task: `${parsed.intent} ${parsed.target}`
        });
        speak(`${agent.emoji} ${agent.name} working on ${parsed.target}.`);
        return { response: `Spawned ${agent.name}` };
      }
    }

    // Fallback: couldn't parse
    speak('Command not understood. Try "status", "swarm status", or "build [task]".');
    return { response: 'Command not recognized' };

  } catch (e) {
    log('Error handling command:', e.message);
    speak('Error processing command.');
    return { error: e.message };
  }
}

// Hybrid server: handles both TCP (voice bridge) and HTTP (unified_api)
const netServer = net.createServer((socket) => {
  log('Voice bridge connected');

  let buffer = '';

  socket.on('data', async (data) => {
    buffer += data.toString();

    // Check if this looks like HTTP request
    if (buffer.startsWith('GET ') || buffer.startsWith('POST ') || buffer.startsWith('PUT ') || buffer.startsWith('DELETE ') || buffer.startsWith('OPTIONS ')) {
      // Handle as HTTP
      const [requestLine, ...rest] = buffer.split('\r\n');
      const reqParts = requestLine.split(' ');
      const method = reqParts[0];
      const url = reqParts[1];
      const headers = {};
      let body = '';
      let headerEnd = 0;

      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '') {
          headerEnd = i + 1;
          break;
        }
        const [key, value] = rest[i].split(': ');
        headers[key.toLowerCase()] = value;
      }

      if (headers['content-length']) {
        body = rest.slice(headerEnd).join('\r\n').substring(0, parseInt(headers['content-length']));
      }

      // Wait for full body if needed
      if (body.length < parseInt(headers['content-length'] || 0)) {
        return; // Wait for more data
      }

      buffer = ''; // Reset buffer

      // Route HTTP requests
      if (url === '/api/voice-coord' && method === 'POST') {
        try {
          const cmd = JSON.parse(body);
          const result = await handleCommand(cmd.text || cmd.command);
          socket.write(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(result)}`);
        } catch (e) {
          socket.write(`HTTP/1.1 400 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ error: e.message })}`);
        }
      } else if (url === '/api/voice-coord/status') {
        const status = await getTowerStatus();
        socket.write(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({
          port: VOICE_COORD_PORT,
          activeTeams: activeTeams.size,
          queueLength: taskQueue.length,
          towerStatus: status
        })}`);
      } else {
        socket.write('HTTP/1.1 404 OK\r\n\r\n');
      }
      socket.end();
      return;
    }

    // Otherwise handle as raw JSON (voice bridge protocol)
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const cmd = line.trim();
        let commandText = cmd;
        try {
          const parsed = JSON.parse(cmd);
          commandText = parsed.text || parsed.command || parsed.transcript || cmd;
        } catch (e) {
          // Plain text, use as-is
        }

        const result = await handleCommand(commandText);
        socket.write(JSON.stringify({
          success: !result.error,
          ...result,
          timestamp: new Date().toISOString()
        }) + '\n');
      } catch (e) {
        socket.write(JSON.stringify({ error: e.message }) + '\n');
      }
    }
  });

  socket.on('error', (err) => {
    log('Socket error:', err.message);
  });
});

netServer.listen(VOICE_COORD_PORT, () => {
  log(`Voice Coordinator listening on port ${VOICE_COORD_PORT}`);
  log('Ready to receive voice commands and coordinate swarms');
});

process.on('SIGINT', () => {
  log('Shutting down Voice Coordinator');
  process.exit(0);
});