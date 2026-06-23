/**
 * PURPCLAW UNIFIED BOOT v8.1
 * ============================
 * ONE SYSTEM. ONE BOOT. PURE FLOW.
 * 
 * Start order:
 * 1. EventBus (7782) - require + wait for port
 * 2. StateStore (7783) - require + wait for port
 * 3. UnifiedApi (7780) - SPAWN node unified_api.js + wait for port
 * 4. AgentTower (7790) - require + createSseServer() + wait for port
 * 5. VoiceCoordinator (7781) - SPAWN node voice_coordinator.js + wait for port
 * 6. VoiceBridge (7779) - SPAWN node voice_bridge_7779.js + wait for port
 * 7. Next.js (3000) - SPAWN node node_modules/next/dist/bin/next dev -p 3000 + wait for port
 */

const http = require('http');
const { spawn: rawSpawn, execSync } = require('child_process');
const path = require('path');
const net = require('net');
const { trackedSpawn, installCleanup } = require('./lib/child-registry');

installCleanup();  // kill all tracked children on SIGINT/SIGTERM

const PURP_DIR = __dirname;
const PORTS = {
  EVENTBUS: 7782,
  STATE: 7783,
  ORCHESTRATOR: 7784,
  API: 7780,
  TOWER: 7790,
  VOICE: 7781,
  BRIDGE: 7779,
  NEXT: 3000
};

const logPrefix = {
  EVENTBUS: '[EVENTBUS]',
  STATE: '[STATE]',
  ORCHESTRATOR: '[ORCHESTRATOR]',
  API: '[API]',
  TOWER: '[TOWER]',
  VOICE: '[VOICE]',
  BRIDGE: '[BRIDGE]',
  NEXT: '[NEXT]',
  BOOT: '[BOOT]'
};

const children = [];
let shuttingDown = false;

function log(service, msg) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`${logPrefix[service] || '[BOOT]'} ${ts} | ${msg}`);
}

const services = {};

async function nukePort(port) {
  return new Promise((resolve) => {
    const conn = net.createConnection(port, '127.0.0.1');
    conn.on('connect', () => {
      conn.destroy();
      if (process.platform === 'win32') {
        try {
          execSync(
            `powershell.exe -NoProfile -NonInteractive -Command "Get-NetTCPConnection -LocalPort ${port} | Stop-Process -Force"`,
            { stdio: 'ignore' }
          );
        } catch (e) {}
      }
      resolve(true);
    });
    conn.on('error', () => {
      resolve(false);
    });
    setTimeout(() => {
      conn.destroy();
      resolve(false);
    }, 500);
  });
}

async function nukePorts() {
  log('BOOT', '══════════════════════════════════════════════════════════════');
  log('BOOT', 'NUKING EXISTING PORTS...');
  log('BOOT', '══════════════════════════════════════════════════════════════');

  const ports = Object.values(PORTS);
  for (const port of ports) {
    const killed = await nukePort(port);
    if (killed) {
      log('BOOT', `  Killed process on port ${port}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  await new Promise((r) => setTimeout(r, 500));
}

async function waitForPort(port, maxAttempts = 20, intervalMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection(port, '127.0.0.1');
        socket.setTimeout(1000);
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('timeout'));
        });
        socket.on('error', () => reject(new Error('error')));
      });
      return true;
    } catch (e) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

async function waitForHttp(path, maxAttempts = 20, intervalMs = 500) {
  const url = `http://127.0.0.1:${path}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => resolve(res));
        req.on('error', reject);
        req.setTimeout(2000);
      });
      res.resume();
      return true;
    } catch (e) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

async function waitForHttpUrl(fullUrl, maxAttempts = 20, intervalMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(fullUrl, (res) => resolve(res));
        req.on('error', reject);
        req.setTimeout(2000);
      });
      res.resume();
      return true;
    } catch (e) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

function spawnService(name, script, args = [], waitPort = null, healthPath = null) {
  return new Promise((resolve, reject) => {
    log(name, '═══════════════════════════════════════════════');
    log(name, `Starting ${name}...`);
    log(name, '═══════════════════════════════════════════════');

    const proc = trackedSpawn('node', [script, ...args], {
      tag: name,
      timeoutMs: 0,  // services run indefinitely
      cwd: PURP_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    children.push(proc);
    services[name.toLowerCase()] = { process: proc };

    let outputBuffer = '';

    proc.stdout.on('data', (data) => {
      const str = data.toString();
      outputBuffer += str;
      const lines = str.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${logPrefix[name] || '[SVC]'} STDOUT | ${line.substring(0, 200)}`);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      if (!str.includes('Warning') && !str.includes('Deprecation') && !str.includes('deprecated')) {
        console.log(`${logPrefix[name] || '[SVC]'} STDERR | ${str.substring(0, 200)}`);
      }
    });

    proc.on('error', (err) => {
      log(name, `❌ Failed to spawn ${name}: ${err.message}`);
      reject(err);
    });

    proc.on('exit', (code, signal) => {
      if (!shuttingDown && code !== 0 && code !== null) {
        log(name, `⚠️ ${name} exited with code ${code}, signal ${signal}`);
      }
    });

    const checkPort = async () => {
      if (waitPort) {
        const ready = await waitForPort(waitPort, 30, 500);
        if (ready) {
          log(name, `✅ ${name} ready on port ${waitPort}`);
          if (healthPath) {
            setTimeout(async () => {
              const ok = await waitForHttp(healthPath, 10, 500);
              if (ok) {
                log(name, `   Health check passed`);
              }
            }, 1000);
          }
          resolve(true);
        } else {
          log(name, `⚠️ ${name} port ${waitPort} not ready, continuing anyway...`);
          resolve(true);
        }
      } else {
        setTimeout(() => {
          log(name, `✅ ${name} process started`);
          resolve(true);
        }, 1000);
      }
    };

    checkPort();
  });
}

async function startEventBus() {
  log('EVENTBUS', '═══════════════════════════════════════════════');
  log('EVENTBUS', 'Starting PURPCLAW Unified Event Bus...');
  log('EVENTBUS', '═══════════════════════════════════════════════');

  const { startServer } = require('./unified_eventbus.js');
  const server = startServer();
  services.eventbus = { server };

  const ready = await waitForPort(PORTS.EVENTBUS, 20, 300);
  if (ready) {
    log('EVENTBUS', `✅ EventBus ready on port ${PORTS.EVENTBUS}`);
    log('EVENTBUS', '   Topics: pub/sub for agent.*, system.*, voice.*, tool.*, swarm.*');
    return true;
  }
  throw new Error('EventBus failed to start');
}

async function startStateStore() {
  log('STATE', '═══════════════════════════════════════════════');
  log('STATE', 'Starting PURPCLAW Unified State Store...');
  log('STATE', '═══════════════════════════════════════════════');

  const { startServer } = require('./unified_state.js');
  const server = startServer();
  services.statestore = { server };

  const ready = await waitForHttp(`${PORTS.STATE}/health`, 20, 300);
  if (ready) {
    log('STATE', `✅ State Store ready on port ${PORTS.STATE}`);
    log('STATE', '   Namespaces: agents, teams, tools, voice, swarm, system');
    return true;
  }
  throw new Error('StateStore failed to start');
}

async function startOrchestrator() {
  log('ORCHESTRATOR', '═══════════════════════════════════════════════');
  log('ORCHESTRATOR', 'Starting PURPCLAW Orchestrator...');
  log('ORCHESTRATOR', '═══════════════════════════════════════════════');

  await spawnService(
    'ORCHESTRATOR',
    path.join(PURP_DIR, 'orchestrator.js'),
    [],
    PORTS.ORCHESTRATOR,
    `${PORTS.ORCHESTRATOR}/health`
  );

  setTimeout(() => {
    if (!shuttingDown) {
      log('ORCHESTRATOR', '   Command flow: voice → parse → route → execute → respond');
    }
  }, 1500);

  return true;
}

async function startUnifiedApi() {
  log('API', '═══════════════════════════════════════════════');
  log('API', 'Starting PURPCLAW Unified API via spawn...');
  log('API', '═══════════════════════════════════════════════');

  await spawnService(
    'API',
    path.join(PURP_DIR, 'unified_api.js'),
    [],
    PORTS.API,
    `${PORTS.API}/api/health`
  );

  setTimeout(() => {
    if (!shuttingDown) {
      log('API', '   Agent spawners initialized');
    }
  }, 1500);

  return true;
}

async function startAgentTower() {
  log('TOWER', '═══════════════════════════════════════════════');
  log('TOWER', 'Starting PURPCLAW Agent Tower...');
  log('TOWER', '═══════════════════════════════════════════════');

  const AgentTower = require('./agent_tower.js');

  const server = AgentTower.createSseServer();

  await new Promise((resolve, reject) => {
    server.on('listening', () => {
      log('TOWER', `Server listening on port ${PORTS.TOWER}`);
      resolve();
    });
    server.on('error', reject);
  });

  AgentTower.connectToUnifiedApi(PORTS.API);
  services.tower = { server, agentTower: AgentTower };

  const ready = await waitForPort(PORTS.TOWER, 15, 300);
  if (ready) {
    log('TOWER', `✅ Agent Tower ready on port ${PORTS.TOWER}`);
    log('TOWER', '   Features: SSE streams, team management, division hierarchy');
    return true;
  }
  throw new Error('AgentTower failed to start');
}

async function startVoiceCoordinator() {
  await spawnService(
    'VOICE',
    path.join(PURP_DIR, 'voice_coordinator.js'),
    [],
    PORTS.VOICE,
    null
  );
  return true;
}

async function startVoiceBridge() {
  await spawnService(
    'BRIDGE',
    path.join(PURP_DIR, 'voice_bridge_7779.js'),
    [],
    PORTS.BRIDGE,
    null
  );
  return true;
}

async function startNextJS() {
  log('NEXT', '═══════════════════════════════════════════════');
  log('NEXT', 'Starting PURPCLAW Next.js Dashboard...');
  log('NEXT', '═══════════════════════════════════════════════');

  return new Promise((resolve, reject) => {
    const nextProc = trackedSpawn(
      'node',
      ['node_modules/next/dist/bin/next', 'dev', '-p', String(PORTS.NEXT)],
      {
        tag: 'Next.js',
        timeoutMs: 0,  // Next.js dev server runs indefinitely
        cwd: PURP_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      }
    );

    children.push(nextProc);
    services.next = { process: nextProc };

    let started = false;

    nextProc.stdout.on('data', (data) => {
      const str = data.toString();
      const lines = str.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${logPrefix.NEXT} STDOUT | ${line.substring(0, 200)}`);
          if (
            !started &&
            (line.includes('Ready') ||
              line.includes('started server') ||
              line.includes('Local') ||
              line.includes('http://'))
          ) {
            started = true;
          }
        }
      }
    });

    nextProc.stderr.on('data', (data) => {
      const str = data.toString();
      if (
        !str.includes('Warning') &&
        !str.includes('Deprecation') &&
        !str.includes('deprecated')
      ) {
        console.log(`${logPrefix.NEXT} STDERR | ${str.substring(0, 200)}`);
      }
    });

    nextProc.on('error', (err) => {
      log('NEXT', `❌ Failed to start Next.js: ${err.message}`);
      reject(err);
    });

    nextProc.on('exit', (code, signal) => {
      if (!shuttingDown && code !== 0 && code !== null) {
        log('NEXT', `⚠️ Next.js exited with code ${code}`);
      }
    });

    const checkReady = async () => {
      const ready = await waitForPort(PORTS.NEXT, 30, 1000);
      if (ready) {
        log('NEXT', `✅ Next.js Dashboard ready on port ${PORTS.NEXT}`);
        log('NEXT', '   URL: http://localhost:3000');
        resolve(true);
      } else {
        log('NEXT', '⚠️ Next.js may still be starting...');
        resolve(true);
      }
    };

    setTimeout(checkReady, 3000);
  });
}

function printBanner() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              🦞 PURPCLAW UNIFIED BOOT v8.1 🦞               ║');
  console.log('║           ONE SYSTEM. ONE BOOT. PURE FLOW.                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
}

function printStatus() {
  const statusData = [
    { port: PORTS.EVENTBUS, name: 'Event Bus', desc: 'pub/sub' },
    { port: PORTS.STATE, name: 'State Store', desc: 'shared state' },
    { port: PORTS.ORCHESTRATOR, name: 'Orchestrator', desc: 'command flow' },
    { port: PORTS.API, name: 'Unified API', desc: 'HTTP + WebSocket + tools' },
    { port: PORTS.TOWER, name: 'Agent Tower', desc: 'SSE + team management' },
    { port: PORTS.VOICE, name: 'Voice Coordinator', desc: 'intent → swarm' },
    { port: PORTS.BRIDGE, name: 'Voice Bridge', desc: 'WebSocket voice' },
    { port: PORTS.NEXT, name: 'Next.js Dashboard', desc: 'http://localhost:3000' }
  ];

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    SERVICES ONLINE                            ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  for (const svc of statusData) {
    const barLen = 50;
    const nameLen = svc.name.length;
    const portStr = `Port ${svc.port}: ${svc.name}`;
    const descStr = `(${svc.desc})`;
    const spaces = barLen - portStr.length - descStr.length;
    const line = `║  ${portStr}${' '.repeat(Math.max(1, spaces))}${descStr}`;
    console.log(line.substring(0, 62) + '║');
  }

  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🦞 PURPCLAW is LIVE and SWARMING 🦞');
  console.log('');
  console.log('Service Process Tree:');
  console.log(`  └─ boot.js (PID: ${process.pid})`);
  for (const [name, svc] of Object.entries(services)) {
    if (svc.process) {
      const pid = svc.process.pid || 'unknown';
      console.log(`     ├─ ${name} (PID: ${pid})`);
    } else if (svc.server) {
      console.log(`     ├─ ${name} (HTTP server)`);
    }
  }
  console.log('');
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('');
  log('BOOT', '══════════════════════════════════════════════════════════════');
  log('BOOT', 'SHUTDOWN SEQUENCE INITIATED');
  log('BOOT', '══════════════════════════════════════════════════════════════');

  log('BOOT', 'Killing child processes...');
  for (const child of children) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } else {
        child.kill('SIGINT');
      }
    } catch (e) {
      try {
        child.kill('SIGTERM');
      } catch (e2) {}
    }
  }

  if (services.eventbus?.server) {
    log('BOOT', 'Closing EventBus server...');
    services.eventbus.server.close();
  }

  if (services.statestore?.server) {
    log('BOOT', 'Closing StateStore server...');
    services.statestore.server.close();
  }

  if (services.tower?.server) {
    log('BOOT', 'Closing AgentTower server...');
    services.tower.server.close();
  }

  if (services.next?.process) {
    log('BOOT', 'Stopping Next.js...');
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${services.next.process.pid} /T /F`, {
          stdio: 'ignore'
        });
      } else {
        services.next.process.kill('SIGINT');
      }
    } catch (e) {
      try {
        services.next.process.kill('SIGTERM');
      } catch (e2) {}
    }
  }

  await new Promise((r) => setTimeout(r, 1000));

  log('BOOT', '══════════════════════════════════════════════════════════════');
  log('BOOT', 'SHUTDOWN COMPLETE');
  log('BOOT', '══════════════════════════════════════════════════════════════');

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  if (!shuttingDown) {
    console.log('\n[BOOT] Process exiting abnormally');
  }
});

async function main() {
  try {
    printBanner();

    log('BOOT', 'Starting PURPCLAW Unified System...');
    log('BOOT', `Directory: ${PURP_DIR}`);
    log('BOOT', `Platform: ${process.platform}`);
    log('BOOT', `Node: ${process.version}`);

    await nukePorts();

    log('BOOT', '─'.repeat(60));
    log('BOOT', 'Starting core services...');
    log('BOOT', '─'.repeat(60));

    await startEventBus();
    await new Promise((r) => setTimeout(r, 500));

    await startStateStore();
    await new Promise((r) => setTimeout(r, 500));

    await startOrchestrator();
    await new Promise((r) => setTimeout(r, 500));

    log('BOOT', '─'.repeat(60));
    log('BOOT', 'Starting spawned services...');
    log('BOOT', '─'.repeat(60));

    await startUnifiedApi();
    await new Promise((r) => setTimeout(r, 1000));

    await startVoiceCoordinator();
    await new Promise((r) => setTimeout(r, 500));

    await startVoiceBridge();
    await new Promise((r) => setTimeout(r, 500));

    log('BOOT', '─'.repeat(60));
    log('BOOT', 'Starting Agent Tower...');
    log('BOOT', '─'.repeat(60));

    await startAgentTower();
    await new Promise((r) => setTimeout(r, 500));

    log('BOOT', '─'.repeat(60));
    log('BOOT', 'Starting Next.js...');
    log('BOOT', '─'.repeat(60));

    await startNextJS();

    printStatus();

    log('BOOT', '══════════════════════════════════════════════════════════════');
    log('BOOT', 'ALL SERVICES STARTED SUCCESSFULLY');
    log('BOOT', '══════════════════════════════════════════════════════════════');
  } catch (err) {
    log('BOOT', `❌ BOOT FAILED: ${err.message}`);
    log('BOOT', err.stack);
    await shutdown();
  }
}

main();
