#!/usr/bin/env node

/**
 * Voice Bridge Standalone - Port 7792
 * WebSocket server for voice commands
 * Integrates with PURPCLAW control API for full swarm control
 */

const WebSocket = require('ws');
const http = require('http');
const net = require('net');
const { spawn: rawSpawn } = require('child_process');
const { trackedSpawn } = require('./lib/child-registry');
const path = require('path');

const PORT = process.env.VOICE_BRIDGE_PORT || 7792;  // 7792 (was 7779→7778→7777, all conflicted)
const CONTROL_API_HOST = process.env.CONTROL_API_HOST || '127.0.0.1';
const CONTROL_API_PORT = parseInt(process.env.CONTROL_API_PORT) || 7778;  // 7778 = TCP server (JSON-RPC), 7780 = HTTP API
const KOKORO = process.env.KOKORO_BAT || 'C:\\Users\\Admin\\.purpclaw\\kokoro_send.bat';
const KOKORO_LONG = process.env.KOKORO_LONG_BAT || 'C:\\Users\\Admin\\.purpclaw\\kokoro_long_send.bat';

console.log(`🎤 Starting Voice Bridge on port ${PORT}...`);
console.log(`   Control API: ${CONTROL_API_HOST}:${CONTROL_API_PORT}`);

// ── TTS via MiniMax Matrix ────────────────────────────────────────────────────
// Uses Matrix batch text-to-audio (matrix_synthesize_speech)
// voice_id: English_PlayfulGirl — Mimi's voice as of 2026-05-28
const MATRIX_TTS_URL = process.env.MATRIX_TTS_URL || 'https://api.minimax.io/m2/t2a_v2';
const MATRIX_API_KEY  = process.env.MATRIX_API_KEY
  || (process.env.MINIMAX_TTS_USE_MAIN_KEY === '1' ? process.env.MINIMAX_API_KEY : '')
  || '';
const MIMI_VOICE     = process.env.MIMI_VOICE      || 'English_PlayfulGirl';
let warnedMissingTtsKey = false;

function publishToEventBus(topic, payload) {
  // Spread fields top-level so subscribers like orchestrator.handleVoiceEvent
  // (which reads event.command) actually fire; keep nested payload for compat.
  const flat = (payload && typeof payload === 'object') ? payload : {};
  const command = flat.command || flat.transcript || flat.text;
  const data = JSON.stringify({ topic, ...flat, ...(command ? { command } : {}), payload });
  const req = http.request({
    hostname: '127.0.0.1',
    port: 7782,
    path: '/publish',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, res => {
    res.resume();
  });
  req.on('error', () => {});
  req.write(data);
  req.end();
}

function triggerSpeaking(text) {
  publishToEventBus('voice.speaking', { text, speaking: true });
  const duration = Math.max(1500, text.length * 65 + 1000);
  setTimeout(() => {
    publishToEventBus('voice.speaking', { speaking: false });
  }, duration);
}

function speak(text, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!text || !text.trim()) { resolve(); return; }
    if (!MATRIX_API_KEY) {
      if (!warnedMissingTtsKey) {
        warnedMissingTtsKey = true;
        console.log('[speak] MATRIX_API_KEY is not set; refusing to borrow MINIMAX_API_KEY for idle/voice TTS.');
      }
      resolve();
      return;
    }
    const voiceId = opts.voice_id || MIMI_VOICE;
    const speed   = opts.speed   || 1.0;
    const payload  = JSON.stringify({
      model: 'speech-02-hd',
      text,
      stream: false,
      voice_setting: { voice_id: voiceId, speed, volume: 1.0, pitch: 0 },
      audio_setting: { audio_format: 'mp3', sample_rate: 32000, bitrate: 128000 }
    });
    const req = http.request({
      hostname: 'api.minimax.io',
      port: 443,
      path: '/m2/t2a_v2',
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization':  `Bearer ${MATRIX_API_KEY}`
      }
    }, res => {
      if (res.statusCode !== 200) {
        // try openaudio if minimax fails
        const altPayload = JSON.stringify({
          model: 'speech-02-hd',
          text, stream: false,
          voice_setting: { voice_id: voiceId, speed, volume: 1.0, pitch: 0 },
          audio_setting: { audio_format: 'mp3', sample_rate: 32000, bitrate: 128000 }
        });
        const altReq = http.request({
          hostname: 'api.minimax.io', port: 443, path: '/m2/t2a_v2',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(altPayload), 'Authorization': `Bearer ${MATRIX_API_KEY}` }
        }, altRes => {
          let data = '';
          altRes.on('data', c => data += c);
          altRes.on('end', () => {
            try {
              const out = JSON.parse(data);
              if (out.data && out.data.audio_file) {
                triggerSpeaking(text);
                // Download and play via rundll32 — no cmd.exe / start leak
                const dlPath = `C:\\Users\\Admin\\AppData\\Local\\Temp\\mimi_tts_${Date.now()}.mp3`;
                const dlReq2 = http.request({ hostname: 'api.minimax.io', port: 443, path: new URL(out.data.audio_file).pathname, method: 'GET', headers: { 'Authorization': `Bearer ${MATRIX_API_KEY}` } }, dlRes2 => {
                  const ws2 = require('fs').createWriteStream(dlPath);
                  dlRes2.pipe(ws2);
                  ws2.on('finish', () => {
                    trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', dlPath], { tag: 'tts-play', timeoutMs: 30_000 }).unref();
                  });
                });
                dlReq2.on('error', () => resolve());
                dlReq2.end();
              }
            } catch {}
            resolve();
          });
        });
        altReq.on('error', () => resolve());
        altReq.write(altPayload);
        altReq.end();
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', async () => {
        try {
          const out = JSON.parse(data);
          if (out.data && out.data.audio_file) {
            // Download the MP3 and play it
            const outPath = `C:\\Users\\Admin\\AppData\\Local\\Temp\\mimi_tts_${Date.now()}.mp3`;
            const dlReq = http.request({ hostname: 'api.minimax.io', port: 443, path: new URL(out.data.audio_file).pathname, method: 'GET', headers: { 'Authorization': `Bearer ${MATRIX_API_KEY}` } }, dlRes => {
              const ws = require('fs').createWriteStream(outPath);
              dlRes.pipe(ws);
              ws.on('finish', () => {
                triggerSpeaking(text);
                trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', outPath], { tag: 'tts-play', timeoutMs: 30_000 }).unref();
                log('[speak] Playing:', text.slice(0, 60), '|', voiceId);
                resolve();
              });
            });
            dlReq.on('error', () => resolve());
            dlReq.end();
          } else {
            resolve();
          }
        } catch (e) {
          log('[speak] parse error:', e.message);
          resolve();
        }
      });
    });
    req.on('error', e => { log('[speak] network error:', e.message); resolve(); });
    req.write(payload);
    req.end();
    setTimeout(() => resolve(), 20000); // hard timeout
  });
}

// Fallback: call the mavis MCP to generate audio and get a CDN URL for Telegram
async function speakWithCDN(text, opts = {}) {
  const voiceId = opts.voice_id || MIMI_VOICE;
  const payload = JSON.stringify({ text, voice_id: voiceId, emotion: opts.emotion || 'happy' });
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: process.env.MAVIS_DAEMON_PORT || '15321',
      path: '/mcp/call/matrix/matrix_synthesize_speech',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'Authorization': `Bearer ${process.env.MAVIS_TOKEN || ''}` }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { const r = JSON.parse(d); resolve(r.output_url || r.output_file); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
    setTimeout(() => resolve(null), 15000);
  });
}

// HTTP handler — health + /api/speak
const healthServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // POST /api/speak — pipe text through Kokoro TTS then return
  if (url.pathname === '/api/speak' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { text, long } = JSON.parse(body || '{}');
        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'text is required' }));
          return;
        }
        console.log('[speak] TTS request:', text.slice(0, 60));
        await speak(text, { long: !!long });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, spoken: text.slice(0, 80) }));
      } catch (e) {
        console.log('[speak] ERROR:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === '/health' || url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'healthy', service: 'voice-bridge', port: PORT }));
    return;
  }

  // Bridge connection state — used by UI to show degraded/offline banner
  if (url.pathname === '/api/bridge/state') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      state: bridgeState,
      controlApiAttempts,
      offlineThreshold: OFFLINE_THRESHOLD,
      degradeThreshold: DEGRADE_THRESHOLD
    }));
    return;
  }

  res.writeHead(404);
  res.end();
});
// Serve health AND WebSocket upgrades on the same port (no separate +1000 port needed)
const wss = new WebSocket.Server({ server: healthServer });
healthServer.listen(PORT, () => {
  console.log(`🎤 Voice Bridge online on :${PORT} (HTTP health + WebSocket)`);
});

// Cache for control API connection
let controlApiSocket = null;
let socketReady = false;
let messageQueue = [];
let controlApiAttempts = 0;
let voiceCoordAttempts = 0;

// Bridge connection state: 'connected' | 'reconnecting' | 'degraded' | 'offline'
let bridgeState = 'reconnecting';

const BASE_RECONNECT_MS   = 2000;
const MAX_RECONNECT_MS   = 30000;
const DEGRADE_THRESHOLD  = 10;   // consecutive failures → degraded
const OFFLINE_THRESHOLD  = 30;   // consecutive failures → offline (manual intervention)
const JITTER_FACTOR      = 0.25; // ±25% random jitter

function getBackoffDelay(attempts) {
  const exponential = BASE_RECONNECT_MS * Math.pow(2, attempts);
  const capped = Math.min(exponential, MAX_RECONNECT_MS);
  // Apply ±jitter to prevent thundering herd on reconnect
  const jitter = capped * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.round(capped + jitter);
}

function setBridgeState(newState) {
  if (bridgeState !== newState) {
    const prev = bridgeState;
    bridgeState = newState;
    console.log(`[bridge] state: ${prev} → ${newState}`);
  }
}

function postToCommandBus(text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      message: String(text || '').trim(),
      spawnAgents: true,
      forceDelegate: true,
      source: 'voice-bridge',
    });
    const req = http.request({
      hostname: CONTROL_API_HOST,
      port: CONTROL_API_PORT,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, ...JSON.parse(data) }); }
        catch { resolve({ ok: false, statusCode: res.statusCode, raw: data }); }
      });
    });
    req.setTimeout(20000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', error => resolve({ ok: false, error: error.message }));
    req.write(payload);
    req.end();
  });
}

wss.on('error', (err) => {
  console.error('Voice bridge error:', err.message);
});

// Connect to control API via TCP
function connectToControlAPI() {
  if (controlApiSocket && socketReady) return;

  // Circuit-break: if we've exceeded the offline threshold, stop retrying
  if (controlApiAttempts >= OFFLINE_THRESHOLD) {
    setBridgeState('offline');
    console.error('[bridge] ⚠️ OFFLINE — control API unreachable after max retries. Manual restart required.');
    // Still keep the process alive but stop hammering
    return;
  }

  // Transition to reconnecting if not already
  if (bridgeState === 'connected') setBridgeState('reconnecting');

  controlApiSocket = net.createConnection(CONTROL_API_PORT, CONTROL_API_HOST);

  controlApiSocket.on('connect', () => {
    console.log('✅ Connected to PURPCLAW Control API');
    socketReady = true;
    const prevAttempts = controlApiAttempts;
    controlApiAttempts = 0;  // reset on success
    setBridgeState('connected');
    // Send any queued messages
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      if (socketReady && controlApiSocket) controlApiSocket.write(msg);
    }
  });

  controlApiSocket.on('data', (data) => {
    try {
      const response = JSON.parse(data.toString());
      // 408 from server means the server closed the connection mid-request —
      // treat as a normal close, not an error spike
      if (response.statusCode === 408 || response.type === 'timeout') {
        console.log(`⚠️ Control API sent 408 (request timeout) — will reconnect`);
        return;
      }
      console.log(`Control API response:`, response.type || 'OK');
    } catch (e) {
      const raw = data.toString().substring(0, 120);
      // Detect 408 raw HTTP response
      if (raw.includes('408') || raw.includes('Request Timeout')) {
        console.log(`⚠️ Control API 408 — server request-timeout, reconnecting`);
        return;
      }
      console.log(`Control API raw: ${raw}`);
    }
  });

  controlApiSocket.on('close', () => {
    console.log('⚠️ Control API connection closed');
    socketReady = false;
    controlApiSocket = null;
    const delay = getBackoffDelay(controlApiAttempts);
    controlApiAttempts++;
    // Upgrade to degraded after DEGRADE_THRESHOLD failures
    if (controlApiAttempts >= DEGRADE_THRESHOLD) setBridgeState('degraded');
    console.log(`[bridge] Reconnecting in ${delay}ms (attempt ${controlApiAttempts}, state=${bridgeState})`);
    setTimeout(connectToControlAPI, delay);
  });

  controlApiSocket.on('error', (err) => {
    console.error(`Control API connection error: ${err.message}`);
    socketReady = false;
    controlApiSocket = null;
    const delay = getBackoffDelay(controlApiAttempts);
    controlApiAttempts++;
    if (controlApiAttempts >= DEGRADE_THRESHOLD) setBridgeState('degraded');
    if (controlApiAttempts >= OFFLINE_THRESHOLD) setBridgeState('offline');
    setTimeout(connectToControlAPI, delay);
  });
}

// Initialize connection
connectToControlAPI();

// Command routing table
const COMMANDS = {
  'status': { action: 'status', response: 'Voice bridge operational on port 7792. System ready.' },
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
    voiceCoordAttempts = 0;  // reset backoff on success
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
    const delay = getBackoffDelay(voiceCoordAttempts);
    voiceCoordAttempts++;
    console.log(`[bridge] Voice coord reconnect in ${delay}ms (attempt ${voiceCoordAttempts})`);
    setTimeout(connectToVoiceCoord, delay);
  });

  voiceCoordSocket.on('error', (err) => {
    console.error(`Voice Coordinator error: ${err.message}`);
    voiceCoordReady = false;
    voiceCoordSocket = null;
    const delay = getBackoffDelay(voiceCoordAttempts);
    voiceCoordAttempts++;
    setTimeout(connectToVoiceCoord, delay);
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

  ws.on('message', async message => {
    try {
      const data = JSON.parse(message);
      console.log(`Voice input: "${data.text || data.transcript}"`);

      const rawText = data.text || data.transcript || '';
      if (rawText.trim()) {
        publishToEventBus('voice.listening', { transcript: rawText });
      }

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
          const result = await postToCommandBus(command.text);
          ws.send(JSON.stringify({
            sent: Boolean(result.ok),
            command: 'command_bus',
            fallback: true,
            result,
            timestamp: new Date().toISOString()
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
