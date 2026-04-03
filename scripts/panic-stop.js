'use strict';

const http = require('http');
const { execFileSync } = require('child_process');
const { OPTIONAL_PM2_NAMES } = require('../service_registry');

function postJson(port, path, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      timeout: 2500,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode }));
    });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('[panic-stop] stopping optional PM2 services');
  try {
    execFileSync('pm2', ['stop', ...OPTIONAL_PM2_NAMES], { stdio: 'inherit' });
  } catch (err) {
    console.log('[panic-stop] optional PM2 stop returned non-zero; continuing');
  }

  console.log('[panic-stop] requesting tower worker shutdown');
  const status = await new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port: 7790, path: '/tower/status', timeout: 2500 }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });

  const active = status && Array.isArray(status.activeAgents) ? status.activeAgents : [];
  for (const agent of active) {
    const result = await postJson(7790, '/api/kill', { agentId: agent.id });
    console.log(`[panic-stop] kill ${agent.name || agent.id}: ${result.ok ? 'ok' : result.error || result.statusCode}`);
  }

  console.log(`[panic-stop] complete; stopped optional services and requested ${active.length} active worker kills`);
}

main().catch(err => {
  console.error('[panic-stop] failed:', err);
  process.exit(1);
});
