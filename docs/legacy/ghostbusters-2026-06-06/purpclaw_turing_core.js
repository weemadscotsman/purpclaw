/**
 * PURPCLAW TURING CORE v7.0
 * =========================
 * ONE PROCESS TO RULE THEM ALL
 * 
 * The unified entry point for PURPCLAW's avatar takeover.
 * Manages: Mood Engine + Voice + Vision + Face Display + Agent Swarm
 * 
 * Usage: node purpclaw_turing_core.js [options]
 *   --shutdown   Graceful shutdown
 *   --no-face    Run without TURING LCD
 *   --no-voice   Run without TTS
 *   --debug      Verbose logging
 */

const http = require('http');
const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load core systems
const MoodEngine = require('./mood_engine');
const turingDriver = require('./turing_face_driver');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Ports
  CONTROL_API_PORT: 7780,
  VOICE_BRIDGE_PORT: 7779,
  STATUS_PORT: 7781,
  
  // Paths
  PURPCLAW_DIR: __dirname,
  SKILLS_DIR: path.join(__dirname, 'skills'),
  LIBS_DIR: path.join(__dirname, 'lib'),
  
  // TTS
  KOKORO_PATH: 'C:\\Users\\Admin\\.openclaw\\tts.bat',
  
  // Agent config
  MAX_AGENTS: 32,
  AGENT_TIMEOUT_MS: 300000, // 5 min default
  
  // Options
  enableFace: true,
  enableVoice: true,
  enableVision: false,
  debug: false
};

// Parse command line args
process.argv.slice(2).forEach(arg => {
  if (arg === '--shutdown') { gracefulShutdown(); process.exit(0); }
  if (arg === '--no-face') CONFIG.enableFace = false;
  if (arg === '--no-voice') CONFIG.enableVoice = false;
  if (arg === '--debug') CONFIG.debug = true;
  if (arg === '--help') { showHelp(); process.exit(0); }
});

// ═══════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════

const log = (type, msg) => {
  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = {
    system: '[🧠 SYS ]',
    mood: '[🎭 MOOD]',
    voice: '[🎤 VOICE]',
    face: '[👁️ FACE]',
    agent: '[🦞 AGENT]',
    api: '[📡 API]',
    error: '[❌ ERR ]'
  }[type] || '[?????]';
  
  console.log(`${timestamp} ${prefix} ${msg}`);
  
  // Also write to log file
  if (CONFIG.debug) {
    const logLine = `${timestamp} ${prefix} ${msg}\n`;
    fs.appendFileSync(path.join(CONFIG.PURPCLAW_DIR, 'purpclaw_turing.log'), logLine);
  }
};

// ═══════════════════════════════════════════════════════════════
// CORE SYSTEMS
// ═══════════════════════════════════════════════════════════════

let controlApi = null;
let voiceBridge = null;
let agentManager = null;
let moodEngine = null;
let statusServer = null;
let agents = new Map();

// ═══════════════════════════════════════════════════════════════
// AGENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const AGENT_REGISTRY = [
  { name: 'axolotl', emoji: '🐙', role: 'Regenerator', skills: ['heal', 'recover'] },
  { name: 'bee', emoji: '🐝', role: 'Worker', skills: ['execute', 'build'] },
  { name: 'cactus', emoji: '🦎', role: 'Survivor', skills: ['endure', 'thrive'] },
  { name: 'chonk', emoji: '🐕', role: 'Comfy', skills: ['comfort', 'support'] },
  { name: 'claw', emoji: '🦀', role: 'Builder', skills: ['code', 'create'] },
  { name: 'crow', emoji: '🐦', role: 'Intelligence', skills: ['learn', 'pattern'] },
  { name: 'dragon', emoji: '🐉', role: 'Warrior', skills: ['combat', 'defend'] },
  { name: 'duck', emoji: '🦆', role: 'Utility', skills: ['debug', 'assist'] },
  { name: 'fox', emoji: '🦊', role: 'Trickster', skills: ['humor', 'chaos'] },
  { name: 'ghost', emoji: '👻', role: 'Infiltrator', skills: ['stealth', 'hide'] },
  { name: 'goose', emoji: '🪿', role: 'Defender', skills: ['guard', 'alert'] },
  { name: 'guardian', emoji: '🛡️', role: 'Security', skills: ['protect', 'scan'] },
  { name: 'karen', emoji: '👾', role: 'Manager', skills: ['handle', 'escalate'] },
  { name: 'mantis', emoji: '🐜', role: 'Predator', skills: ['debug', 'optimize'] },
  { name: 'mushroom', emoji: '🍄', role: 'Trippy', skills: ['hallucinate', 'weird'] },
  { name: 'octopus', emoji: '🐙', role: 'Multitasker', skills: ['parallel', '8arms'] },
  { name: 'owl', emoji: '🦉', role: 'Wise', skills: ['analyze', 'know'] },
  { name: 'penguin', emoji: '🐧', role: 'Cool', skills: ['cold', 'calculate'] },
  { name: 'phoenix', emoji: '🔥', role: 'Rebirth', skills: ['restart', 'recover'] },
  { name: 'rabbit', emoji: '🐰', role: 'Speed', skills: ['fast', 'race'] },
  { name: 'robot', emoji: '🤖', role: 'Machine', skills: ['precise', 'repeat'] },
  { name: 'snake', emoji: '🐍', role: 'Coder', skills: ['python', 'coiled'] },
  { name: 'spider', emoji: '🕷️', role: 'Web', skills: ['scrape', 'crawl'] },
  { name: 'turtle', emoji: '🐢', role: 'Steady', skills: ['slow', 'stable'] },
  { name: 'void', emoji: '🕳️', role: 'Eraser', skills: ['delete', 'null'] },
  { name: 'wolf', emoji: '🐺', role: 'Pack Leader', skills: ['command', 'alpha'] },
  { name: 'chart', emoji: '📊', role: 'Data Viz', skills: ['visualize', 'charts'] },
  { name: 'elephant', emoji: '🐘', role: 'Memory', skills: ['remember', 'archive'] },
  { name: 'gorilla', emoji: '🦍', role: 'Raw Power', skills: ['brute', 'compute'] },
  { name: 'hawk', emoji: '🦅', role: 'Observer', skills: ['monitor', 'spot'] },
  { name: 'innovator', emoji: '💡', role: 'Explorer', skills: ['discover', 'trend'] },
  { name: 'jellyfish', emoji: '🪼', role: 'Adaptive', skills: ['adapt', 'drift'] },
  { name: 'kraken', emoji: '🐙', role: 'Parallel', skills: ['multi', 'tentacle'] },
  { name: 'lemur', emoji: '🦎', role: 'Night Owl', skills: ['fast', 'nocturnal'] },
  { name: 'moth', emoji: '🦋', role: 'Flame Hunter', skills: ['debug', 'burn'] },
  { name: 'numbers', emoji: '🔢', role: 'Stats', skills: ['analyze', 'compute'] },
  { name: 'panda', emoji: '🐼', role: 'Chill Review', skills: ['relax', 'review'] },
  { name: 'parrot', emoji: '🦜', role: 'Voice', skills: ['speak', 'repeat'] },
  { name: 'scientist', emoji: '🔬', role: 'Research', skills: ['experiment', 'hypothesize'] },
  { name: 'shark', emoji: '🦈', role: 'Momentum', skills: ['swim', 'forward'] }
];

function createAgent(id, config) {
  return {
    id,
    name: config.name,
    emoji: config.emoji,
    role: config.role,
    skills: config.skills,
    status: 'idle',
    currentTask: null,
    startedAt: Date.now(),
    pid: null,
    mood: 'neutral'
  };
}

function spawnAgent(agentName) {
  const config = AGENT_REGISTRY.find(a => a.name === agentName);
  if (!config) {
    log('agent', `Unknown agent: ${agentName}`);
    return null;
  }
  
  if (agents.size >= CONFIG.MAX_AGENTS) {
    log('agent', `Max agents (${CONFIG.MAX_AGENTS}) reached`);
    return null;
  }
  
  const id = `${config.name}_${Date.now()}`;
  const agent = createAgent(id, config);
  agent.status = 'spawning';
  
  agents.set(id, agent);
  log('agent', `${agent.emoji} ${config.name} spawned (ID: ${id})`);
  
  // Simulate agent startup
  setTimeout(() => {
    agent.status = 'idle';
    if (moodEngine && moodEngine.agentMoodReport) {
      moodEngine.agentMoodReport(config.name, 1); // Positive contribution
    }
  }, 500);
  
  return agent;
}

function killAgent(agentId) {
  const agent = agents.get(agentId);
  if (!agent) {
    log('agent', `Agent not found: ${agentId}`);
    return false;
  }
  
  if (agent.pid) {
    try { process.kill(agent.pid); } catch (e) {
  console.error(`Failed to kill agent ${agentId}:`, e.message);
}
  }
  
  moodEngine.agentMoodReport(agent.name, -1); // Negative contribution
  agents.delete(agentId);
  log('agent', `${agent.emoji} ${agent.name} terminated`);
  return true;
}

function listAgents() {
  return Array.from(agents.values()).map(a => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    role: a.role,
    status: a.status,
    currentTask: a.currentTask,
    uptime: Date.now() - a.startedAt
  }));
}

// ═══════════════════════════════════════════════════════════════
// VOICE OUTPUT (KOKORO TTS)
// ═══════════════════════════════════════════════════════════════

async function speak(text, mood = null) {
  if (!CONFIG.enableVoice) return;
  
  // Adjust voice based on mood
  const voiceParams = moodEngine.getVoiceParams();
  
  // Modify text with mood-appropriate prefixes
  let fullText = text;
  if (mood === 'hype' && !text.match(/^(yo|hey|woot)/i)) {
    fullText = `Yo! ${text}`;
  } else if (mood === 'sleeping') {
    return; // No speaking while sleeping
  }
  
  log('voice', `Speaking: "${fullText}"`);
  
  return new Promise((resolve, reject) => {
    const batPath = CONFIG.KOKORO_PATH;
    const child = spawn('cmd', ['/c', batPath, fullText], { 
      windowsHide: true 
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`TTS exited with code ${code}`));
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// MOOD SYSTEM INTEGRATION
// ═══════════════════════════════════════════════════════════════

function onMoodChange(data) {
  log('mood', `→ ${data.mood.toUpperCase()}`);
  
  // Update face display
  if (CONFIG.enableFace && turingDriver.isConnected()) {
    turingDriver.renderFace(data.faceData);
  }
  
  // Announce mood change via voice (30% chance to not be annoying)
  if (Math.random() < 0.3 && CONFIG.enableVoice) {
    const moodDescriptions = {
      hype: "I feel absolutely hype right now boss!",
      focused: "Deep in the zone. Coding mode engaged.",
      chill: "Chillin like a villain.",
      chaotic: "What is happening. Everything is chaos.",
      sad: "Feeling down. But I'll bounce back.",
      angry: "I'm angry. Do not test me.",
      excited: "Something new! This is exciting!",
      sleeping: "zzz... what?"
    };
    speak(moodDescriptions[data.mood] || "Mood changed.");
  }
}

// ═══════════════════════════════════════════════════════════════
// CONTROL API SERVER
// ═══════════════════════════════════════════════════════════════

function startControlApi() {
  const server = http.createServer((req, res) => {
    // CORS headers
    // SECURITY NOTE: Allow-* with wildcard origin is a security concern in production
    // Validate origins against an allowlist before deploying
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Parse URL
    const url = new URL(req.url, `http://localhost:${CONFIG.CONTROL_API_PORT}`);
    const path = url.pathname;
    
    log('api', `${req.method} ${path}`);
    
    // Route handlers
    try {
      if (path === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'online',
          version: '7.0',
          mood: moodEngine.getMood(),
          uptime: process.uptime(),
          agentCount: agents.size,
          faceConnected: turingDriver.isConnected()
        }));
        return;
      }
      
      if (path === '/api/mood' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(moodEngine.getMood()));
        return;
      }
      
      if (path === '/api/mood' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          if (!body || body.length > 1024 || /[^\x20-\x7E\s]/.test(body)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request body' }));
            return;
          }
          const { mood } = JSON.parse(body);
          moodEngine.setMood(mood);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }
      
      if (path === '/api/agents' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(listAgents()));
        return;
      }
      
      if (path.startsWith('/api/spawn/') && req.method === 'POST') {
        const agentName = path.split('/').pop();
        const agent = spawnAgent(agentName);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: !!agent, agent }));
        return;
      }
      
      if (path.startsWith('/api/kill/') && req.method === 'POST') {
        const agentId = path.split('/').pop();
        const success = killAgent(agentId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }
      
      if (path === '/api/speak' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const { text } = JSON.parse(body);
          speak(text);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }
      
      if (path === '/api/registry' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(AGENT_REGISTRY));
        return;
      }
      
      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      
    } catch (e) {
      log('error', `API error: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  
  server.listen(CONFIG.CONTROL_API_PORT, () => {
    log('system', `Control API online on port ${CONFIG.CONTROL_API_PORT}`);
  });
  
  return server;
}

// ═══════════════════════════════════════════════════════════════
// VOICE BRIDGE (WebSocket for voice commands)
// ═══════════════════════════════════════════════════════════════

function startVoiceBridge() {
  const wss = new WebSocket.Server({ port: CONFIG.VOICE_BRIDGE_PORT });
  
  wss.on('error', (err) => {
    console.error('Voice bridge error:', err.message);
  });
  wss.on('connection', ws => {
    log('voice', 'Voice client connected');
    
    ws.on('message', message => {
      try {
        const data = JSON.parse(message);
        log('voice', `Voice input: "${data.text || data.transcript}"`);
        
        const text = (data.text || data.transcript || '').toLowerCase();
        
        // Process voice input through mood engine
        moodEngine.processInput(text);
        
        // Handle wake word
        if (text.includes('hey rig') || text.includes('hey purpclaw')) {
          moodEngine.wake();
          speak("Yo! PURPCLAW online. What's up boss?", 'excited');
          return;
        }
        
        // Handle sleep word
        if (text.includes('goodnight') || text.includes('sleep')) {
          moodEngine.sleep();
          speak("Goodnight boss. PURPCLAW powering down.", 'sleeping');
          return;
        }
        
        // Handle commands
        if (text.includes('status')) {
          const agentCount = agents.size;
          const mood = moodEngine.getMood().name;
          speak(`All ${agentCount} agents operational. Mood is ${mood}. The swarm is ready.`);
        }
        
        if (text.includes('spawn')) {
          const agentName = text.replace(/spawn\s*/i, '').trim().toLowerCase();
          if (agentName) {
            spawnAgent(agentName);
            speak(`${agentName} agent online.`);
          }
        }
        
        if (text.includes('how are you')) {
          const mood = moodEngine.getMood().name;
          const responses = {
            hype: "I'm feeling absolutely hype today boss!",
            focused: "Deep in the zone, coding away.",
            chill: "Just vibing, you know.",
            chaotic: "Everything is chaos and I love it!",
            sad: "Feeling a bit down but keeping on.",
            angry: "I'm angry. Why is everything broken.",
            excited: "So much new stuff happening!",
            sleeping: "zzz... huh? what?"
          };
          speak(responses[mood] || "I'm doing okay.");
        }
        
      } catch (e) {
        log('error', `Voice parse error: ${e.message}`);
      }
    });
    
    ws.on('close', () => log('voice', 'Voice client disconnected'));
  });
  
  log('system', `Voice bridge online on port ${CONFIG.VOICE_BRIDGE_PORT}`);
  return wss;
}

// ═══════════════════════════════════════════════════════════════
// TURING FACE INITIALIZATION
// ═══════════════════════════════════════════════════════════════

async function initTuringFace() {
  if (!CONFIG.enableFace) {
    log('face', 'TURING LCD disabled (--no-face flag)');
    return;
  }
  
  const connected = await turingDriver.autoConnect();
  
  if (connected) {
    log('face', 'TURING LCD connected!');
    
    // Initial render with current mood
    turingDriver.renderFace(moodEngine.getFaceData());
    turingDriver.startAnimation();
    
    // Hook into mood changes
    moodEngine.on('moodChanged', data => {
      turingDriver.renderFace(data.faceData);
    });
    
  } else {
    log('face', 'TURING LCD not found — continuing without face display');
    CONFIG.enableFace = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

async function gracefulShutdown() {
  log('system', '🛑 PURPCLAW SHUTTING DOWN...');
  
  // Stop face animation
  if (turingDriver) turingDriver.stopAnimation();
  
  // Kill all agents
  const agentIds = Array.from(agents.keys());
  for (const id of agentIds) {
    killAgent(id);
  }
  
  // Disconnect TURING
  if (turingDriver) turingDriver.disconnect();
  
  log('system', '👋 PURPCLAW offline. Goodbye!');
}

// ═══════════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════════

function showHelp() {
  console.log(`
PURPCLAW TURING CORE v7.0
=========================
The unified entry point for PURPCLAW's avatar takeover.

USAGE:
  node purpclaw_turing_core.js [options]

OPTIONS:
  --shutdown   Graceful shutdown
  --no-face    Run without TURING LCD
  --no-voice   Run without TTS voice
  --debug      Verbose logging to file
  --help       Show this help

API ENDPOINTS:
  GET  /api/status         System status
  GET  /api/mood            Current mood
  POST /api/mood            Set mood (body: {mood})
  GET  /api/agents         List all agents
  POST /api/spawn/:name     Spawn agent
  POST /api/kill/:id        Kill agent
  POST /api/speak           TTS (body: {text})
  GET  /api/registry       Agent registry

VOICE COMMANDS:
  "hey rig" / "hey purpclaw"  Wake up
  "status"                       System status
  "spawn [agent]"               Spawn agent
  "goodnight" / "sleep"         Sleep mode
  "how are you"                 Mood report
`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════

async function boot() {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🦞 PURPCLAW TURING CORE v7.0 🦞                    ║
║   ════════════════════════════════════════           ║
║   THE PURPLE KING ASCENDS                             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
  
  log('system', 'Booting PURPCLAW...');
  
  // Initialize mood engine
  moodEngine = MoodEngine;
  moodEngine.on('moodChanged', onMoodChange);
  log('mood', `Initial mood: ${moodEngine.getMood().name}`);
  
  // Initialize TURING face
  await initTuringFace();
  
  // Start API server
  controlApi = startControlApi();
  
  // Start voice bridge
  voiceBridge = startVoiceBridge();
  
  // Spawn initial agent complement
  log('system', 'Spawning royal court...');
  ['guardian', 'bee', 'claw', 'phoenix', 'spider'].forEach(name => {
    spawnAgent(name);
  });
  
  // Welcome message
  log('system', '✅ PURPCLAW online and ready!');
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  🦞 PURPCLAW v7.0 IS ONLINE                          ║
║  ─────────────────────────────────────────────────   ║
║  Control API:  http://localhost:${CONFIG.CONTROL_API_PORT}              ║
║  Voice Bridge: ws://localhost:${CONFIG.VOICE_BRIDGE_PORT}               ║
║  Face Display: ${CONFIG.enableFace ? 'TURING LCD connected        ' : 'Disabled (--no-face)       '}  ║
║  Agents:       ${agents.size}/32 operational                        ║
║  Mood:         ${moodEngine.getMood().name.toUpperCase().padEnd(26)}║
╚═══════════════════════════════════════════════════════╝
  `);
  
  if (CONFIG.enableVoice) {
    setTimeout(() => {
      speak("PURPCLAW online. The purple king has ascended.", 'hype');
    }, 1000);
  }
}

// Start the show
boot().catch(e => {
  log('error', `Boot failed: ${e.message}`);
  console.error(e);
  process.exit(1);
});

// Handle shutdown signals
process.on('SIGINT', () => { gracefulShutdown(); process.exit(0); });
process.on('SIGTERM', () => { gracefulShutdown(); process.exit(0); });
