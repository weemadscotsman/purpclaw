/**
 * PURPCLAW CLEAN LAUNCHER v8.0
 * ============================
 * Only starts what actually works.
 * Kills the dead weight (avatar, simple_bridge.py, LCD).
 *
 * Services that RUN:
 * - unified_api.js (7780) - HTTP + MCP tools + Xiaozhi WebSocket
 * - agent_tower.js (7790) - Team management + SSE
 * - voice_coordinator.js (7781) - Voice intent → swarm
 * - voice_bridge_7779.js (7779) - WebSocket voice server
 * - Next.js dashboard (3000) - React UI
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PURP_DIR = __dirname;
const CONFIG = {
  UNIFIED_API: path.join(PURP_DIR, 'unified_api.js'),
  AGENT_TOWER: path.join(PURP_DIR, 'agent_tower.js'),
  VOICE_COORD: path.join(PURP_DIR, 'voice_coordinator.js'),
  VOICE_BRIDGE: path.join(PURP_DIR, 'voice_bridge_7779.js'),
  NEXTJS_DIR: path.join(PURP_DIR, 'app'),
  NODE: process.execPath,
  MAX_RESTART_DELAY_MS: 30000,
  INITIAL_RESTART_DELAY_MS: 1000,
};

const services = {
  unifiedApi: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Unified API', port: 7780 },
  agentTower: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Agent Tower', port: 7790 },
  voiceCoord: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Voice Coordinator', port: 7781 },
  voiceBridge: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Voice Bridge', port: 7779 },
  nextjs: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Next.js Dashboard', port: 3000 },
};

const PREFIX = {
  unified: '[UNIFIED]',
  agent: '[AGENT]',
  voice: '[VOICE ]',
  voiceBrdg: '[VOICE-]',
  nextjs: '[NEXT ]',
  system: '[SYSTEM]',
};

function log(source, ...args) {
  const prefix = PREFIX[source] || PREFIX.system;
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(prefix, ts, '|', ...args);
}

function pipeStream(source, stream, label) {
  stream.on('data', (data) => {
    const text = data.toString().trim();
    if (!text) return;
    text.split('\n').forEach(line => {
      if (line.trim()) log(source, `${label}:`, line);
    });
  });
  stream.on('error', (err) => log(source, `${label} ERROR:`, err.message));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Kill any lingering processes from old launchers
function nukeLegacyProcesses() {
  log('system', '🧹 Clearing legacy processes...');

  const toKill = [
    { name: 'python.exe', filter: 'simple_bridge' },
    { name: 'electron.exe', filter: 'avatar' },
    { name: 'node.exe', filter: 'simple_bridge' },
  ];

  for (const proc of toKill) {
    try {
      execSync(`taskkill /F /IM ${proc.name} 2>nul`, { stdio: 'ignore', windowsHide: true });
    } catch (e) {}
  }

  // Clear port 7777 (simple_bridge graveyard)
  try {
    const output = execSync(`netstat -ano | findstr :7777`, { encoding: 'utf8', windowsHide: true });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const pidMatch = line.match(/\s(\d+)\s*$/);
      if (pidMatch) {
        try { execSync(`taskkill /PID ${pidMatch[1]} /F 2>nul`, { stdio: 'ignore', windowsHide: true }); } catch (e) {}
      }
    }
  } catch (e) {}

  // Clear port 9999 (dead avatar)
  try {
    const output = execSync(`netstat -ano | findstr :9999`, { encoding: 'utf8', windowsHide: true });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const pidMatch = line.match(/\s(\d+)\s*$/);
      if (pidMatch) {
        try { execSync(`taskkill /PID ${pidMatch[1]} /F 2>nul`, { stdio: 'ignore', windowsHide: true }); } catch (e) {}
      }
    }
  } catch (e) {}

  log('system', '✅ Legacy processes cleared');
}

function killAll() {
  log('system', '🛑 Shutting down all services...');

  for (const key of Object.keys(services)) {
    const svc = services[key];
    if (svc.child && !svc.child.killed) {
      try {
        execSync(`taskkill /PID ${svc.child.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
        log('system', `Stopped ${svc.name} (PID ${svc.child.pid})`);
      } catch (e) {}
    }
  }

  process.exit(0);
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

function scheduleRestart(key) {
  const svc = services[key];
  if (key === 'nextjs') {
    // Next.js can restart but don't loop
    if (svc.restarts > 3) {
      log('system', `${svc.name} failed ${svc.restarts} times - giving up`);
      return;
    }
  }

  svc.restarts++;
  const delay = Math.min(svc.delay * 2, CONFIG.MAX_RESTART_DELAY_MS);
  svc.delay = delay;
  log('system', `${svc.name} crashed (attempt ${svc.restarts}) - retrying in ${delay / 1000}s...`);

  setTimeout(() => {
    log('system', `Restarting ${svc.name}...`);
    if (key === 'unifiedApi') startUnifiedApi(true);
    else if (key === 'agentTower') startAgentTower(true);
    else if (key === 'voiceCoord') startVoiceCoord(true);
    else if (key === 'voiceBridge') startVoiceBridge(true);
    else if (key === 'nextjs') startNextJs(true);
  }, delay);
}

function startUnifiedApi(fromRestart = false) {
  const scriptPath = CONFIG.UNIFIED_API;
  if (!fs.existsSync(scriptPath)) {
    log('unified', `❌ NOT FOUND: ${scriptPath}`);
    return;
  }

  if (fromRestart) services.unifiedApi.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('unified', `🚀 Starting Unified API...`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: PURP_DIR,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
    env: {
      ...process.env,
      XIAOZHI_MCP_URL: process.env.XIAOZHI_MCP_URL || '',
      XIAOZHI_TOKEN: process.env.XIAOZHI_TOKEN || '',
    },
  });

  services.unifiedApi.child = child;
  pipeStream('unified', child.stdout, 'stdout');
  pipeStream('unified', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('unified', `⚠️  Exited code ${code}`);
    services.unifiedApi.child = null;
    scheduleRestart('unifiedApi');
  });

  child.on('error', (err) => {
    log('unified', `❌ Start error: ${err.message}`);
    services.unifiedApi.child = null;
    scheduleRestart('unifiedApi');
  });
}

function startAgentTower(fromRestart = false) {
  const scriptPath = CONFIG.AGENT_TOWER;
  if (!fs.existsSync(scriptPath)) {
    log('agent', `❌ NOT FOUND: ${scriptPath}`);
    return;
  }

  if (fromRestart) services.agentTower.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('agent', `🚀 Starting Agent Tower...`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: PURP_DIR,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.agentTower.child = child;
  pipeStream('agent', child.stdout, 'stdout');
  pipeStream('agent', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('agent', `⚠️  Exited code ${code}`);
    services.agentTower.child = null;
    scheduleRestart('agentTower');
  });

  child.on('error', (err) => {
    log('agent', `❌ Start error: ${err.message}`);
    services.agentTower.child = null;
    scheduleRestart('agentTower');
  });
}

function startVoiceCoord(fromRestart = false) {
  const scriptPath = CONFIG.VOICE_COORD;
  if (!fs.existsSync(scriptPath)) {
    log('voice', `❌ NOT FOUND: ${scriptPath}`);
    return;
  }

  if (fromRestart) services.voiceCoord.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('voice', `🚀 Starting Voice Coordinator...`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: PURP_DIR,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.voiceCoord.child = child;
  pipeStream('voice', child.stdout, 'stdout');
  pipeStream('voice', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('voice', `⚠️  Exited code ${code}`);
    services.voiceCoord.child = null;
    scheduleRestart('voiceCoord');
  });

  child.on('error', (err) => {
    log('voice', `❌ Start error: ${err.message}`);
    services.voiceCoord.child = null;
    scheduleRestart('voiceCoord');
  });
}

function startVoiceBridge(fromRestart = false) {
  const scriptPath = CONFIG.VOICE_BRIDGE;
  if (!fs.existsSync(scriptPath)) {
    log('voiceBrdg', `❌ NOT FOUND: ${scriptPath}`);
    return;
  }

  if (fromRestart) services.voiceBridge.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('voiceBrdg', `🚀 Starting Voice Bridge (port 7779)...`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: PURP_DIR,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.voiceBridge.child = child;
  pipeStream('voiceBrdg', child.stdout, 'stdout');
  pipeStream('voiceBrdg', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('voiceBrdg', `⚠️  Exited code ${code}`);
    services.voiceBridge.child = null;
    scheduleRestart('voiceBridge');
  });

  child.on('error', (err) => {
    log('voiceBrdg', `❌ Start error: ${err.message}`);
    services.voiceBridge.child = null;
    scheduleRestart('voiceBridge');
  });
}

function startNextJs(fromRestart = false) {
  const nextPath = path.join(PURP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextPath)) {
    log('nextjs', `❌ Next.js not found at ${nextPath}`);
    return;
  }

  if (fromRestart) services.nextjs.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('nextjs', `🚀 Starting Next.js Dashboard (port 3000)...`);
  const child = spawn(CONFIG.NODE, [nextPath, 'dev', '-p', '3000', '--turbo'], {
    cwd: PURP_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  services.nextjs.child = child;
  pipeStream('nextjs', child.stdout, 'stdout');
  pipeStream('nextjs', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('nextjs', `⚠️  Exited code ${code}`);
    services.nextjs.child = null;
    if (services.nextjs.restarts < 3) {
      scheduleRestart('nextjs');
    }
  });

  child.on('error', (err) => {
    log('nextjs', `❌ Start error: ${err.message}`);
    services.nextjs.child = null;
  });
}

function waitForHttp(url, retries = 20, intervalMs = 500) {
  return new Promise((resolve) => {
    let attempts = 0;
    const tryConnect = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) { resolve(); }
        else { retry(); }
      });
      req.on('error', retry);
      req.setTimeout(3000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        log('system', `⚠️  ${url} not responding after ${retries} attempts - continuing anyway`);
        resolve();
      } else {
        setTimeout(tryConnect, intervalMs * Math.min(attempts, 5));
      }
    };
    tryConnect();
  });
}

function waitForPort(host, port, retries = 20, intervalMs = 500) {
  return new Promise((resolve) => {
    let attempts = 0;
    const tryConnect = () => {
      const socket = require('net').createConnection(port, host);
      socket.setTimeout(3000);
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('error', retry);
      socket.on('timeout', () => { socket.destroy(); retry(); });
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        log('system', `⚠️  ${host}:${port} not accepting connections after ${retries} attempts - continuing anyway`);
        resolve();
      } else {
        setTimeout(tryConnect, intervalMs * Math.min(attempts, 5));
      }
    };
    tryConnect();
  });
}

async function boot() {
  console.log();
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║         PURPCLAW CLEAN LAUNCHER v8.0                       ║');
  console.log('  ║         No dead weight. Pure Tower Power.                   ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log();
  log('system', `Node ${process.version} | ${os.platform()} ${os.arch()}`);
  log('system', `CWD: ${PURP_DIR}`);
  log('system', '');

  // Nuke legacy processes first
  nukeLegacyProcesses();

  // Start core services
  log('system', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('system', '🚀 Starting services...');
  log('system', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  startUnifiedApi();
  await waitForHttp('http://localhost:7780/api/health', 25, 500);
  log('system', '✅ Unified API ready (port 7780)');

  startAgentTower();
  await waitForPort('127.0.0.1', 7790, 25, 500);
  log('system', '✅ Agent Tower ready (port 7790)');

  startVoiceCoord();
  await waitForPort('127.0.0.1', 7781, 25, 500);
  log('system', '✅ Voice Coordinator ready (port 7781)');

  startVoiceBridge();
  await waitForPort('127.0.0.1', 7779, 25, 500);
  log('system', '✅ Voice Bridge ready (port 7779)');

  startNextJs();
  await waitForHttp('http://localhost:3000', 30, 1000);
  log('system', '✅ Next.js Dashboard ready (port 3000)');

  log('system', '');
  log('system', '╔══════════════════════════════════════════════════════════════╗');
  log('system', '║                    ALL SERVICES ONLINE                       ║');
  log('system', '╠══════════════════════════════════════════════════════════════╣');
  log('system', '║  Port  Service             Purpose                          ║');
  log('system', '╠══════════════════════════════════════════════════════════════╣');
  log('system', '║  7780  Unified API          HTTP + MCP tools + Xiaozhi WS    ║');
  log('system', '║  7790  Agent Tower          Team management + SSE             ║');
  log('system', '║  7781  Voice Coordinator   Natural language → swarm         ║');
  log('system', '║  7779  Voice Bridge        WebSocket voice server            ║');
  log('system', '║  3000  Next.js Dashboard   React UI + agent control         ║');
  log('system', '╚══════════════════════════════════════════════════════════════╝');
  log('system', '');
  log('system', '🗑️  KILLED: simple_bridge.py, avatar Electron, LCD bridge');
  log('system', '');
  log('system', '💬 Talk to Samantha to spawn teams, check status, coordinate swarm');
  log('system', '🌐 Dashboard: http://localhost:3000');
  log('system', '');
  log('system', '🛑 Ctrl+C to cleanly stop all services');
  log('system', '');
}

boot().catch(err => {
  console.error('❌ Boot failed:', err);
  process.exit(1);
});