#!/usr/bin/env node

/**
 * Voice Bridge Standalone - Port 7779
 * WebSocket server for voice commands
 * Integrates with PURPCLAW control API for full swarm control
 */

const WebSocket = require('ws');
const http = require('http');
const net = require('net');

const PORT = 7779;
const CONTROL_API_HOST = '127.0.0.1';
const CONTROL_API_PORT = 7780;

console.log(`🎤 Starting Voice Bridge on port ${PORT}...`);

// HTTP health endpoint
const healthServer = http.createServer((req, res) => {
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
    res.end(JSON.stringify({ status: 'healthy', service: 'voice-bridge', port: PORT }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(PORT + 1000, () => {});
const wss = new WebSocket.Server({ port: PORT });

// Cache for control API connection
let controlApiSocket = null;
let socketReady = false;
let messageQueue = [];

wss.on('error', (err) => {
  console.error('Voice bridge error:', err.message);
});

// Connect to control API via TCP
function connectToControlAPI() {
  if (controlApiSocket && socketReady) return;

  controlApiSocket = net.createConnection(CONTROL_API_PORT, CONTROL_API_HOST);

  controlApiSocket.on('connect', () => {
    console.log('✅ Connected to PURPCLAW Control API');
    socketReady = true;
    // Send any queued messages
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      controlApiSocket.write(msg);
    }
  });

  controlApiSocket.on('data', (data) => {
    try {
      const response = JSON.parse(data.toString());
      console.log(`Control API response:`, response.type || 'OK');
    } catch (e) {
      console.log(`Control API raw: ${data.toString().substring(0, 100)}`);
    }
  });

  controlApiSocket.on('close', () => {
    console.log('⚠️ Control API connection closed');
    socketReady = false;
    controlApiSocket = null;
    setTimeout(connectToControlAPI, 2000);
  });

  controlApiSocket.on('error', (err) => {
    console.error(`Control API connection error: ${err.message}`);
    socketReady = false;
    controlApiSocket = null;
    setTimeout(connectToControlAPI, 2000);
  });
}

// Initialize connection
connectToControlAPI();

// Command routing table
const COMMANDS = {
  'status': { action: 'status', response: 'Voice bridge operational on port 7779. System ready.' },
  'test': { action: 'test', response: 'Voice bridge test successful. WebSocket connection working.' },
  'swarm status': { action: 'swarm', endpoint: '/api/swarm' },
  'swarm stats': { action: 'swarm', endpoint: '/api/swarm' },
  'divisions': { action: 'divisions', endpoint: '/api/divisions' },
  'logs': { action: 'logs', endpoint: '/api/logs' },
  'agents': { action: 'agents', endpoint: '/api/swarm' },
  'tasks': { action: 'tasks', endpoint: '/api/tasks' },
  'help': { action: 'help' }
};

// Voice Coordinator connection for unified swarm control
const VOICE_COORD_HOST = '127.0.0.1';
const VOICE_COORD_PORT = 7781;
let voiceCoordSocket = null;
let voiceCoordReady = false;

function connectToVoiceCoord() {
  if (voiceCoordSocket && voiceCoordReady) return;

  voiceCoordSocket = net.createConnection(VOICE_COORD_PORT, VOICE_COORD_HOST);

  voiceCoordSocket.on('connect', () => {
    console.log('✅ Connected to Voice Coordinator (port 7781)');
    voiceCoordReady = true;
  });

  voiceCoordSocket.on('data', (data) => {
    try {
      const response = JSON.parse(data.toString());
      console.log(`Voice Coordinator response:`, response.response || 'OK');
    } catch (e) {
      console.log(`Voice Coord raw: ${data.toString().substring(0, 100)}`);
    }
  });

  voiceCoordSocket.on('close', () => {
    console.log('⚠️ Voice Coordinator connection closed');
    voiceCoordReady = false;
    voiceCoordSocket = null;
    setTimeout(connectToVoiceCoord, 2000);
  });

  voiceCoordSocket.on('error', (err) => {
    console.error(`Voice Coordinator error: ${err.message}`);
    voiceCoordReady = false;
    voiceCoordSocket = null;
    setTimeout(connectToVoiceCoord, 2000);
  });
}

// Initialize Voice Coordinator connection
connectToVoiceCoord();

// Parse voice input and route to appropriate handler
function parseCommand(text) {
  text = text.toLowerCase().trim();

  // Direct commands
  if (text === 'status') return COMMANDS['status'];
  if (text === 'test') return COMMANDS['test'];
  if (text === 'help') return COMMANDS['help'];

  // Swarm commands
  if (text.includes('swarm') && (text.includes('status') || text.includes('stats'))) {
    return COMMANDS['swarm status'];
  }
  if (text.includes('division')) return COMMANDS['divisions'];
  if (text.includes('log')) return COMMANDS['logs'];
  if (text.includes('agent')) return COMMANDS['agents'];
  if (text.includes('task')) return COMMANDS['tasks'];

  // Spawn commands: "spawn X agents in division"
  const spawnMatch = text.match(/spawn\s+(\d+)\s+agents?\s+(?:in|to)\s+(\w+)/i);
  if (spawnMatch) {
    return {
      action: 'spawn',
      count: parseInt(spawnMatch[1]),
      division: spawnMatch[2],
      endpoint: '/api/spawn',
      payload: { count: parseInt(spawnMatch[1]), division: spawnMatch[2].toLowerCase() }
    };
  }

  // Command: "send command X"
  const cmdMatch = text.match(/command\s+(.+)/i);
  if (cmdMatch) {
    return {
      action: 'custom',
      command: cmdMatch[1],
      endpoint: '/api/command',
      payload: { command: cmdMatch[1] }
    };
  }

  // Unknown commands go to Voice Coordinator for intent parsing
  return { action: 'voice_coord', text: text, route: 'voice_coord' };
}

wss.on('connection', ws => {
  console.log('Voice client connected');

  // Send welcome message
  ws.send(JSON.stringify({
    welcome: "PURPCLAW Voice Bridge v7.0",
    status: "connected",
    port: PORT,
    capabilities: [
      'swarm_status', 'division_info', 'log_retrieval',
      'spawn_agents', 'task_management', 'custom_commands'
    ]
  }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      console.log(`Voice input: "${data.text || data.transcript}"`);

      const text = (data.text || data.transcript || '').toLowerCase();
      const command = parseCommand(text);

      if (!command) {
        // Echo back unrecognized
        ws.send(JSON.stringify({
          received: text,
          timestamp: new Date().toISOString(),
          note: 'Command not recognized. Try "help" or "status"'
        }));
        return;
      }

      // Handle help command
      if (command.action === 'help') {
        ws.send(JSON.stringify({
          response: "PURPCLAW Voice Commands: status, test, swarm status, divisions, logs, agents, tasks, spawn [n] agents in [division], command [your command], or natural language like 'build a website' or 'fix that bug'"
        }));
        return;
      }

      // Route to Voice Coordinator for unified intent parsing
      if (command.route === 'voice_coord') {
        if (voiceCoordReady && voiceCoordSocket) {
          voiceCoordSocket.write(JSON.stringify({ text: command.text }) + '\n');
          ws.send(JSON.stringify({
            sent: true,
            command: 'voice_coord',
            note: 'Routing to Voice Coordinator for intent parsing',
            timestamp: new Date().toISOString()
          }));
        } else {
          ws.send(JSON.stringify({
            error: 'Voice Coordinator not connected',
            hint: 'Start voice_coordinator.js to enable natural language commands'
          }));
        }
        return;
      }

      // Handle status/test responses
      if (command.response) {
        ws.send(JSON.stringify({
          response: command.response
        }));
        return;
      }

      // Send to control API via TCP
      const apiRequest = JSON.stringify({
        type: command.action,
        endpoint: command.endpoint,
        payload: command.payload || {},
        timestamp: new Date().toISOString()
      });

      if (socketReady && controlApiSocket) {
        controlApiSocket.write(apiRequest + '\n');
        ws.send(JSON.stringify({
          sent: true,
          command: command.action,
          timestamp: new Date().toISOString()
        }));
      } else {
        messageQueue.push(apiRequest + '\n');
        ws.send(JSON.stringify({
          queued: true,
          command: command.action,
          reason: 'Control API not connected'
        }));
      }

    } catch (e) {
      console.error(`Voice parse error: ${e.message}`);
      ws.send(JSON.stringify({ error: e.message }));
    }
  });

  ws.on('close', () => console.log('Voice client disconnected'));
});

console.log(`✅ Voice Bridge running on ws://localhost:${PORT}`);
console.log('Ready for voice commands...');
console.log('Commands: status, test, swarm status, divisions, logs, agents, tasks, spawn, command');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down voice bridge...');
  if (controlApiSocket) controlApiSocket.end();
  wss.close();
  process.exit(0);
});