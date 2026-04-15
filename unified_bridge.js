/**
 * PURPCLAW UNIFIED BRIDGE LAUNCHER v8.0
 * =====================================
 * One process to rule them all:
 * - unified_api.js (HTTP API on 7780 + WebSocket to Xiaozhi + MCP tools)
 * - simple_bridge.py (Socket-Rig Python bridge, child process)
 * - Electron avatar (child process)
 *
 * All logs pipe to single terminal. SIGINT kills everything cleanly.
 * All critical services auto-restart with exponential backoff on crash.
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG = {
  BRIDGE_PORT: 7777,
  AVATAR_PORT: 9999,
  VOICE_BRIDGE: path.join(__dirname, 'voice_bridge_7779.js'),
  UNIFIED_API: path.join(__dirname, 'unified_api.js'),
  AGENT_TOWER: path.join(__dirname, 'agent_tower.js'),
  VOICE_COORD: path.join(__dirname, 'voice_coordinator.js'),
  UNIFIED_EVENTBUS: path.join(__dirname, 'unified_eventbus.js'),
  UNIFIED_STATE: path.join(__dirname, 'unified_state.js'),
  PYTHON_BRIDGE: path.join(__dirname, '..', 'RECENT WORK', 'rigs body for avatar', 'bridge', 'simple_bridge.py'),
  ELECTRON_AVATAR: path.join(__dirname, '..', 'RECENT WORK', 'rigs body for avatar', 'main.js'),
  PYTHON: 'C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
  NODE: process.execPath,
  ELECTRON: path.join(__dirname, '..', 'RECENT WORK', 'rigs body for avatar', 'node_modules', 'electron', 'dist', 'electron.exe'),
  MAX_RESTART_DELAY_MS: 30000,
  INITIAL_RESTART_DELAY_MS: 1000,
};

const services = {
  // python:   { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Python bridge' },
  // electron: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Electron avatar' },
  voiceBridge: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Voice Bridge' },
  unifiedApi: { child: null, restarts: 0, delay: 0, name: 'Unified API' },
  agentTower: { child: null, restarts: 0, delay: 0, name: 'Agent Tower SSE' },
  voiceCoord: { child: null, restarts: 0, delay: 0, name: 'Voice Coordinator' },
  nextjs:   { child: null, restarts: 0, delay: 0, name: 'Next.js dashboard' },
  eventbus: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'Unified Event Bus' },
  stateStore: { child: null, restarts: 0, delay: CONFIG.INITIAL_RESTART_DELAY_MS, name: 'State Store' },
};

const PREFIX = {
  python:   '[PYTHON]',
  electron: '[AVATAR]',
  voiceBrdg: '[VOICE-]',
  unified:  '[UNIFIED]',
  agent:    '[AGENT]',
  voice:    '[VOICE ]',
  nextjs:   '[NEXT ]',
  ebus:     '[EVENT ]',
  state:    '[STATE ]',
  system:   '[SYSTEM]',
};

function log(source, ...args) {
  const prefix = PREFIX[source] || PREFIX.system;
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`${prefix}`, ts, '|', ...args);
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

function killPort(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', windowsHide: true });
    const lines = output.trim().split('\n');
    lines.forEach(line => {
      if (line.includes('LISTENING')) {
        const pidMatch = line.match(/LISTENING\s+(\d+)/);
        if (pidMatch) {
          const pid = parseInt(pidMatch[1]);
          if (pid !== process.pid) {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
            log('system', `Killed orphaned process on port ${port} (PID ${pid})`);
          }
        }
      }
    });
  } catch (e) {
  }
}

function killAll() {
  log('system', 'Shutting down all services...');

  ['python', 'electron', 'voiceBridge', 'unifiedApi', 'agentTower', 'voiceCoord', 'nextjs', 'eventbus', 'stateStore'].forEach(key => {
    const svc = services[key];
    if (svc.child && !svc.child.killed) {
      try {
        execSync(`taskkill /PID ${svc.child.pid} /T /F`, { stdio: 'ignore' });
        log('system', `Stopped ${svc.name} (PID ${svc.child.pid})`);
      } catch (e) {
      }
    }
  });

  try {
    const output = execSync(`netstat -ano | findstr :${CONFIG.BRIDGE_PORT}`, { encoding: 'utf8', windowsHide: true });
    const lines = output.trim().split('\n');
    lines.forEach(line => {
      const pidMatch = line.match(/\s(\d+)\s*$/);
      if (pidMatch) {
        const pid = parseInt(pidMatch[1]);
        if (pid !== process.pid && !Object.values(services).some(s => s.child && s.child.pid === pid)) {
          try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true }); } catch(e) {}
        }
      }
    });
  } catch (e) {
  }

  process.exit(0);
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

function scheduleRestart(key) {
  const svc = services[key];
  svc.restarts++;

  const delay = Math.min(svc.delay * 2, CONFIG.MAX_RESTART_DELAY_MS);
  svc.delay = delay;

  log('system', `${svc.name} crashed (attempt ${svc.restarts}) - retrying in ${delay / 1000}s...`);

  setTimeout(() => {
    log('system', `Restarting ${svc.name}...`);
    if (key === 'python') startPythonBridge(true);
    else if (key === 'electron') startElectronAvatar(true);
    else if (key === 'unifiedApi') startUnifiedApi(true);
    else if (key === 'agentTower') startAgentTower(true);
    else if (key === 'voiceCoord') startVoiceCoord(true);
    else if (key === 'nextjs') startNextJs(true);
    else if (key === 'eventbus') startEventBus(true);
    else if (key === 'stateStore') startStateStore(true);
  }, delay);
}

function startVoiceCoord(fromRestart = false) {
  if (!fromRestart) killPort(7781);

  const scriptPath = CONFIG.VOICE_COORD;
  if (!fs.existsSync(scriptPath)) {
    log('voice', `Not found: ${scriptPath} - skipping voice coordinator`);
    return;
  }

  if (fromRestart) services.voiceCoord.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('voice', `Starting: ${scriptPath}`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.voiceCoord.child = child;
  pipeStream('voice', child.stdout, 'stdout');
  pipeStream('voice', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('voice', `Voice Coordinator exited code ${code}`);
    services.voiceCoord.child = null;
    scheduleRestart('voiceCoord');
  });

  child.on('error', (err) => {
    log('voice', `Start error: ${err.message}`);
    services.voiceCoord.child = null;
    scheduleRestart('voiceCoord');
  });
}

function startVoiceBridge(fromRestart = false) {
  if (!fromRestart) killPort(7779);

  const scriptPath = CONFIG.VOICE_BRIDGE;
  if (!fs.existsSync(scriptPath)) {
    log('voiceBrdg', `Not found: ${scriptPath} - skipping voice bridge`);
    return;
  }

  if (fromRestart) services.voiceBridge.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('voiceBrdg', `Starting: ${scriptPath}`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.voiceBridge.child = child;
  pipeStream('voiceBrdg', child.stdout, 'stdout');
  pipeStream('voiceBrdg', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('voiceBrdg', `Voice Bridge exited code ${code}`);
    services.voiceBridge.child = null;
    scheduleRestart('voiceBridge');
  });

  child.on('error', (err) => {
    log('voiceBrdg', `Start error: ${err.message}`);
    services.voiceBridge.child = null;
    scheduleRestart('voiceBridge');
  });
}

function startPythonBridge(fromRestart = false) {
  if (!fromRestart) {
    try {
      const output = execSync(`netstat -ano | findstr :${CONFIG.BRIDGE_PORT}`, { encoding: 'utf8', windowsHide: true });
      const lines = output.trim().split('\n');
      lines.forEach(line => {
        if (line.includes('LISTENING')) {
          const pidMatch = line.match(/LISTENING\s+(\d+)/);
          if (pidMatch) {
            const pid = parseInt(pidMatch[1]);
            if (pid !== process.pid) {
              execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
              log('python', `Killed orphaned bridge on port ${CONFIG.BRIDGE_PORT} (PID ${pid})`);
            }
          }
        }
      });
    } catch (e) {
    }
  }

  const pythonPath = CONFIG.PYTHON_BRIDGE;
  if (!fs.existsSync(pythonPath)) {
    log('python', `Not found: ${pythonPath}`);
    return;
  }

  if (fromRestart) services.python.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('python', `Starting: ${pythonPath}`);
  const child = spawn(CONFIG.PYTHON, [pythonPath], {
    cwd: path.dirname(pythonPath),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });

  services.python.child = child;
  pipeStream('python', child.stdout, 'stdout');
  pipeStream('python', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (code === 0 || child.killed) return;
    log('python', `${services.python.name} exited code ${code}`);
    services.python.child = null;
    scheduleRestart('python');
  });

  child.on('error', (err) => {
    log('python', `Start error: ${err.message}`);
    services.python.child = null;
    scheduleRestart('python');
  });
}

function startElectronAvatar(fromRestart = false) {
  const avatarPath = CONFIG.ELECTRON_AVATAR;
  if (!fs.existsSync(avatarPath)) {
    log('electron', `Not found: ${avatarPath} - skipping avatar`);
    return;
  }

  if (fromRestart) services.electron.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('electron', `Starting: ${avatarPath}`);
  const child = spawn(CONFIG.ELECTRON, [avatarPath], {
    cwd: path.dirname(avatarPath),
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.electron.child = child;
  pipeStream('electron', child.stdout, 'stdout');
  pipeStream('electron', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('electron', `Avatar exited code ${code}`);
    services.electron.child = null;
    scheduleRestart('electron');
  });

  child.on('error', (err) => {
    log('electron', `Start error: ${err.message}`);
    services.electron.child = null;
    scheduleRestart('electron');
  });
}

function startUnifiedApi(fromRestart = false) {
  if (!fromRestart) killPort(7780);

  const scriptPath = CONFIG.UNIFIED_API;
  if (!fs.existsSync(scriptPath)) {
    log('unified', `Not found: ${scriptPath}`);
    return;
  }

  log('unified', `Starting: ${scriptPath}`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
    env: {
      ...process.env,
      XIAOZHI_MCP_URL: process.env.XIAOZHI_MCP_URL || `wss://api.xiaozhi.me/mcp/?token=${process.env.XIAOZHI_TOKEN || ''}`,
      OPENCLAW_GATEWAY: process.env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789'
    },
  });

  services.unifiedApi.child = child;
  pipeStream('unified', child.stdout, 'stdout');
  pipeStream('unified', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('unified', `unified_api.js exited code ${code}`);
    services.unifiedApi.child = null;
    scheduleRestart('unifiedApi');
  });

  child.on('error', (err) => {
    log('unified', `Start error: ${err.message}`);
    services.unifiedApi.child = null;
    scheduleRestart('unifiedApi');
  });
}

function startAgentTower(fromRestart = false) {
  if (!fromRestart) killPort(7790);

  const scriptPath = CONFIG.AGENT_TOWER;
  if (!fs.existsSync(scriptPath)) {
    log('agent', `Not found: ${scriptPath}`);
    return;
  }

  log('agent', `Starting: ${scriptPath}`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.agentTower.child = child;
  pipeStream('agent', child.stdout, 'stdout');
  pipeStream('agent', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('agent', `agent_tower.js exited code ${code}`);
    services.agentTower.child = null;
    scheduleRestart('agentTower');
  });

  child.on('error', (err) => {
    log('agent', `Start error: ${err.message}`);
    services.agentTower.child = null;
    scheduleRestart('agentTower');
  });
}

function startNextJs(fromRestart = false) {
  const nextPath = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextPath)) {
    log('nextjs', 'next not found');
    return;
  }
  log('nextjs', 'Starting Next.js dashboard on :3000');
  const child = spawn(CONFIG.NODE, [nextPath, 'dev', '-p', '3000'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  services.nextjs.child = child;
  pipeStream('nextjs', child.stdout, 'stdout');
  pipeStream('nextjs', child.stderr, 'stderr');
  child.on('exit', (code) => {
    if (!child.killed) {
      log('nextjs', `Next.js exit ${code}`);
      services.nextjs.child = null;
    }
  });
  child.on('error', (err) => {
    log('nextjs', `Next.js error: ${err.message}`);
    services.nextjs.child = null;
  });
}

function startEventBus(fromRestart = false) {
  if (!fromRestart) killPort(7782);

  const scriptPath = CONFIG.UNIFIED_EVENTBUS;
  if (!fs.existsSync(scriptPath)) {
    log('ebus', `Not found: ${scriptPath} - skipping event bus`);
    return;
  }

  if (fromRestart) services.eventbus.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('ebus', `Starting: ${scriptPath}`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.eventbus.child = child;
  pipeStream('ebus', child.stdout, 'stdout');
  pipeStream('ebus', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('ebus', `Event Bus exited code ${code}`);
    services.eventbus.child = null;
    scheduleRestart('eventbus');
  });

  child.on('error', (err) => {
    log('ebus', `Start error: ${err.message}`);
    services.eventbus.child = null;
    scheduleRestart('eventbus');
  });
}

function startStateStore(fromRestart = false) {
  if (!fromRestart) killPort(7783);

  const scriptPath = CONFIG.UNIFIED_STATE;
  if (!fs.existsSync(scriptPath)) {
    log('state', `Not found: ${scriptPath} - skipping state store`);
    return;
  }

  if (fromRestart) services.stateStore.delay = CONFIG.INITIAL_RESTART_DELAY_MS;

  log('state', `Starting: ${scriptPath}`);
  const child = spawn(CONFIG.NODE, [scriptPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    shell: false,
    windowsHide: false,
  });

  services.stateStore.child = child;
  pipeStream('state', child.stdout, 'stdout');
  pipeStream('state', child.stderr, 'stderr');

  child.on('exit', (code) => {
    if (child.killed) return;
    log('state', `State Store exited code ${code}`);
    services.stateStore.child = null;
    scheduleRestart('stateStore');
  });

  child.on('error', (err) => {
    log('state', `Start error: ${err.message}`);
    services.stateStore.child = null;
    scheduleRestart('stateStore');
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
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        console.log(`WARNING: ${url} not responding after ${retries} attempts - continuing anyway`);
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
      socket.setTimeout(2000);
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('error', retry);
      socket.on('timeout', () => { socket.destroy(); retry(); });
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        console.log(`WARNING: ${host}:${port} not accepting connections after ${retries} attempts - continuing anyway`);
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
  console.log('  ==========================================================');
  console.log('  ==========================================================');
  console.log('       PURPCLAW UNIFIED BRIDGE v8.0');
  console.log('       One process. One terminal. All services.');
  console.log('  ==========================================================');
  console.log('  ==========================================================');
  console.log();
  log('system', `Node ${process.version} | ${os.platform()} ${os.arch()}`);
  log('system', `CWD: ${__dirname}`);
  log('system', '');

  startEventBus();
  await waitForPort('127.0.0.1', 7782, 20, 500);

  startStateStore();
  await waitForPort('127.0.0.1', 7783, 20, 500);

  startUnifiedApi();
  await waitForHttp('http://localhost:7780/api/health', 20, 500);

  startAgentTower();
  await waitForPort('127.0.0.1', 7790, 20, 500);

  startVoiceCoord();
  await waitForPort('127.0.0.1', 7781, 20, 500);

  startVoiceBridge();
  await waitForPort('127.0.0.1', 7779, 20, 500);

  startNextJs();
  await waitForHttp('http://localhost:3000', 30, 1000);

  // startPythonBridge(); // DISABLED - path ../RECENT WORK/rigs body for avatar/... does not exist
  // startElectronAvatar(); // DISABLED - path ../RECENT WORK/rigs body for avatar/... does not exist

  log('system', '');
  log('system', 'ALL SERVICES LAUNCHED');
  log('system', '   Unified Event Bus: port 7782 (pub/sub events)');
  log('system', '   State Store: port 7783 (shared state)');
  log('system', '   Unified API:   port 7780 (HTTP API + WebSocket + MCP tools)');
  log('system', '   Agent Tower:   port 7790 (SSE server)');
  log('system', '   Voice Coord:   port 7781 (Voice intent → swarm coordination)');
  log('system', '   Voice Bridge:  port 7779 (WebSocket voice server)');
  log('system', '   Python bridge: DISABLED (path missing)');
  log('system', '   Electron avatar: DISABLED (path missing)');
  log('system', '   Next.js dashboard: port 3000');
  log('system', '');
  log('system', 'Ctrl+C to cleanly stop all services');
  log('system', '');
}

boot();
