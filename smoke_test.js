/**
 * PURPCLAW SMOKE TEST v1.0
 * Tests all services are healthy before running demos
 */

const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PURP_DIR = path.join(__dirname);
const SERVICES = [
  { name: 'Unified Event Bus', port: 7782, url: 'http://localhost:7782/health', type: 'http' },
  { name: 'State Store', port: 7783, url: 'http://localhost:7783/health', type: 'http' },
  { name: 'Unified API', port: 7780, url: 'http://localhost:7780/api/health', type: 'http' },
  { name: 'Agent Tower', port: 7790, url: 'http://localhost:7790/tower/status', type: 'http' },
  { name: 'Voice Coordinator', port: 7781, url: 'http://localhost:7781', type: 'tcp' },
  { name: 'Voice Bridge', port: 7779, url: 'ws://localhost:7779', type: 'websocket' },
  { name: 'OpenClaw Gateway', port: 18789, url: 'ws://127.0.0.1:18789', type: 'websocket' },
];

const KOKORO = 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat';
const DEMO_PROJECT = 'C:\\Users\\Admin\\Desktop\\claude-code-system';

function log(msg, type = 'INFO') {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = type === 'OK' ? '✅' : type === 'FAIL' ? '❌' : type === 'WARN' ? '⚠️' : '  ';
  console.log(`${prefix} [${ts}] ${msg}`);
}

function httpGet(url, timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, data }));
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

function checkHttp(port, path = '/api/health') {
  return httpGet(`http://localhost:${port}${path}`);
}

function checkTcp(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1');
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve({ ok: true }); });
    socket.on('error', (e) => resolve({ ok: false, error: e.message }));
    socket.on('timeout', () => { socket.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

function checkWebSocket(url) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => { ws.close(); resolve({ ok: false, error: 'timeout' }); }, 3000);
      ws.on('open', () => { clearTimeout(timeout); ws.close(); resolve({ ok: true }); });
      ws.on('error', (e) => resolve({ ok: false, error: e.message }));
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function checkService(svc) {
  log(`Checking ${svc.name} (${svc.type})...`);
  
  try {
    let result = null;
    if (svc.type === 'http') {
      result = await checkHttp(svc.port, svc.url.replace(`http://localhost:${svc.port}`, ''));
    } else if (svc.type === 'tcp') {
      result = await checkTcp(svc.port);
    } else if (svc.type === 'websocket') {
      result = await checkWebSocket(svc.url);
    }
    
    if (result.ok) {
      log(`${svc.name} is UP`, 'OK');
      return { ...svc, status: 'up', result };
    } else {
      log(`${svc.name} is DOWN: ${result.error}`, 'FAIL');
      return { ...svc, status: 'down', error: result.error };
    }
  } catch (e) {
    log(`${svc.name} ERROR: ${e.message}`, 'FAIL');
    return { ...svc, status: 'error', error: e.message };
  }
}

async function checkAllServices() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  PURPCLAW SMOKE TEST');
  console.log('═══════════════════════════════════════════\n');
  
  log('Testing all services...\n');
  
  const results = await Promise.all(SERVICES.map(s => checkService(s)));
  
  console.log('\n───────────────────────────────────────────');
  log('RESULTS:');
  
  const upCount = results.filter(r => r.status === 'up').length;
  const downCount = results.filter(r => r.status !== 'up').length;
  
  results.forEach(r => {
    if (r.status === 'up') {
      log(`  ${r.name}: UP`, 'OK');
    } else {
      log(`  ${r.name}: DOWN (${r.error})`, 'FAIL');
    }
  });
  
  console.log('\n───────────────────────────────────────────');
  console.log(`  Summary: ${upCount}/${SERVICES.length} services UP`);
  console.log('═══════════════════════════════════════════\n');
  
  return { upCount, downCount, results };
}

async function testTool(toolName, args = {}) {
  log(`Testing tool: ${toolName}...`);
  try {
    const result = await httpPost('http://localhost:7780/api/tools/call', {
      name: toolName,
      arguments: args
    });
    if (result.ok) {
      log(`Tool ${toolName}: OK`, 'OK');
      return { ok: true, result };
    } else {
      log(`Tool ${toolName}: FAIL (${result.status})`, 'FAIL');
      return { ok: false, result };
    }
  } catch (e) {
    log(`Tool ${toolName}: ERROR ${e.message}`, 'FAIL');
    return { ok: false, error: e.message };
  }
}

function httpPost(url, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode === 200, status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, data });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

async function testKokoroTTS() {
  log('Testing Kokoro TTS...');
  const testMessage = 'PURPCLAW smoke test running';
  try {
    const batExists = fs.existsSync(KOKORO);
    if (!batExists) {
      log('Kokoro TTS: NOT FOUND', 'WARN');
      return { ok: false, error: 'kokoro_send.bat not found' };
    }
    execSync(`"${KOKORO}" "${testMessage}"`, { shell: 'cmd.exe', timeout: 10000 });
    log('Kokoro TTS: OK', 'OK');
    return { ok: true };
  } catch (e) {
    log(`Kokoro TTS: FAIL (${e.message})`, 'FAIL');
    return { ok: false, error: e.message };
  }
}

async function testAgentSpawn() {
  log('Testing Agent Tower spawn...');
  try {
    const result = await httpPost('http://localhost:7790/api/tower/spawn', {
      agentName: 'dragon',
      task: 'Smoke test task - respond with "Smoke test OK"'
    });
    if (result.ok) {
      log('Agent spawn: OK', 'OK');
      return { ok: true, result };
    } else {
      log(`Agent spawn: FAIL (${result.status})`, 'FAIL');
      return { ok: false, result };
    }
  } catch (e) {
    log(`Agent spawn: ERROR ${e.message}`, 'FAIL');
    return { ok: false, error: e.message };
  }
}

async function runSmokeTests() {
  const health = await checkAllServices();
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  TOOL TESTS (if services up)');
  console.log('═══════════════════════════════════════════\n');
  
  if (health.upCount >= 2) {
    await testTool('execute_command', { command: 'echo smoke_test_ok' });
    await testTool('system_status', {});
    await testTool('memory', { action: 'list' });
  } else {
    log('Skipping tool tests - not enough services UP', 'WARN');
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  KOKORO TTS TEST');
  console.log('═══════════════════════════════════════════\n');
  
  await testKokoroTTS();
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  AGENT SPAWN TEST');
  console.log('═══════════════════════════════════════════\n');
  
  if (health.results.find(r => r.name === 'Agent Tower')?.status === 'up') {
    await testAgentSpawn();
  } else {
    log('Skipping agent spawn - Agent Tower DOWN', 'WARN');
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  SMOKE TEST COMPLETE');
  console.log('═══════════════════════════════════════════\n');
  
  return health;
}

if (require.main === module) {
  runSmokeTests()
    .then(health => {
      if (health.downCount > 0) {
        console.log(`⚠️  ${health.downCount} services are DOWN`);
        console.log('   Run individual services to debug:');
        health.results.filter(r => r.status !== 'up').forEach(r => {
          console.log(`   - ${r.name}: ${r.error}`);
        });
        process.exit(1);
      } else {
        console.log('✅ All services UP - ready for demo!');
        process.exit(0);
      }
    })
    .catch(e => {
      console.error('Smoke test failed:', e.message);
      process.exit(1);
    });
}

module.exports = { runSmokeTests, checkAllServices, checkService };
