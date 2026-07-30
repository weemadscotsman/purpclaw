'use strict';

/**
 * Cognitive Spine gateway.
 *
 * Windows was leaving the Python BaseHTTPRequestHandler sockets in CLOSE_WAIT
 * under repeated dashboard/status polling. Keep the public contract on :7880,
 * but let Node own that socket and run the Python cognitive engine behind it on
 * an internal loopback port. Health stays cheap and stable; deeper cognitive
 * routes are proxied to Python.
 */

const http = require('http');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const path = require('path');

const PUBLIC_HOST = '127.0.0.1';
const PUBLIC_PORT = Number(process.env.COGNITIVE_PUBLIC_PORT || 7880);
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = Number(process.env.COGNITIVE_BACKEND_PORT || 7888);
const PYTHON_BIN = process.env.PYTHON_BIN || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
const ROOT = __dirname;

// Defense-in-depth cap on the spawned spine child. PM2 max_memory_restart
// watches THIS Node process — not the python child — so the gateway has to
// enforce the ceiling itself. Default 1500 MB matches the spine's own
// mem_guard ceiling so a breach trips BOTH watchers within a few seconds.
const CHILD_MEM_LIMIT_MB = Number(process.env.COGNITIVE_CHILD_MEM_LIMIT_MB || 1500);
const CHILD_MEM_POLL_MS = Number(process.env.COGNITIVE_CHILD_MEM_POLL_MS || 10000);
// Two consecutive over-cap readings before kill — same pattern as mem_guard.
const CHILD_MEM_BREACH_LIMIT = Number(process.env.COGNITIVE_CHILD_MEM_BREACH_LIMIT || 2);

let backend = null;
let backendStartedAt = 0;
let lastBackendExit = null;
let childMemBreaches = 0;
let childMemTimer = null;

function startBackend() {
  if (backend && !backend.killed) return;
  backendStartedAt = Date.now();
  const script = path.join(ROOT, 'cognitive_spine.py');
  backend = spawn(PYTHON_BIN, [script, '--port', String(BACKEND_PORT)], {
    cwd: ROOT,
    windowsHide: true,
    env: {
      ...process.env,
      // Disable .pyc caching — stale bytecode from a prior crash was masking
      // the real error (NameError from a failed import). With this set the
      // Python interpreter always re-parses .py files fresh.
      PYTHONDONTWRITEBYTECODE: '1',
      COGNITIVE_SOCKET_TIMEOUT_S: process.env.COGNITIVE_SOCKET_TIMEOUT_S || '3',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', d => process.stdout.write(`[cognitive-backend] ${d}`));
  backend.stderr.on('data', d => process.stderr.write(`[cognitive-backend] ${d}`));
  backend.on('exit', (code, signal) => {
    lastBackendExit = { code, signal, at: new Date().toISOString() };
    backend = null;
    childMemBreaches = 0;
    if (childMemTimer) { clearInterval(childMemTimer); childMemTimer = null; }
    setTimeout(startBackend, 2000);
  });
  startChildMemWatch();
}

// Read the spawned child's RSS on Windows. Tries two backends in order:
//   1) wmic (always available on Win10/11 but deprecated; survives legacy
//      corporate images where PowerShell is locked down)
//   2) PowerShell Get-CimInstance Win32_Process (modern, but blocked by
//      some execution policies)
// Falls back to null — the spine's own mem_guard is the primary watchdog,
// and the gateway's job here is just defense-in-depth. Silent on error
// means no log spam if both are unavailable.
function readChildRssMb(pid) {
  if (!pid) return null;
  // 1) wmic — try first because it's faster (no powershell JIT).
  try {
    const out = execFileSync('wmic', [
      'process', 'where', `ProcessId=${pid}`,
      'get', 'WorkingSetSize', '/VALUE',
    ], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    const m = /WorkingSetSize=(\d+)/.exec(out);
    if (m) return Number(m[1]) / (1024 * 1024);
  } catch (_) { /* fall through to powershell */ }
  // 2) powershell — works even when wmic is removed (Win11 24H2+).
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").WorkingSetSize`,
    ], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const n = Number(out.trim());
    return Number.isFinite(n) && n > 0 ? n / (1024 * 1024) : null;
  } catch (_) { return null; }
}

function startChildMemWatch() {
  if (childMemTimer) clearInterval(childMemTimer);
  childMemBreaches = 0;
  childMemTimer = setInterval(() => {
    if (!backend || backend.killed || !backend.pid) return;
    const mb = readChildRssMb(backend.pid);
    if (mb === null) return;
    if (mb > CHILD_MEM_LIMIT_MB) {
      childMemBreaches += 1;
      process.stderr.write(
        `[cognitive-gateway] child PID ${backend.pid} RSS ${mb.toFixed(0)}MB > ` +
        `${CHILD_MEM_LIMIT_MB}MB cap (${childMemBreaches}/${CHILD_MEM_BREACH_LIMIT}) — ` +
        (childMemBreaches >= CHILD_MEM_BREACH_LIMIT
          ? `killing for clean restart`
          : `will kill at ${CHILD_MEM_BREACH_LIMIT} consecutive breaches`) + `\n`
      );
      if (childMemBreaches >= CHILD_MEM_BREACH_LIMIT) {
        try { backend.kill(); } catch (_) {}
      }
    } else {
      childMemBreaches = 0;
    }
  }, CHILD_MEM_POLL_MS);
}

function stopBackend() {
  if (!backend) return;
  try { backend.kill(); } catch {}
  if (childMemTimer) { clearInterval(childMemTimer); childMemTimer = null; }
}

function tcpOpen(port, timeoutMs = 500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: BACKEND_HOST, port });
    const done = ok => {
      socket.removeAllListeners();
      try { socket.destroy(); } catch {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// Probe the backend's own HTTP /health endpoint — not just the TCP port.
// The Python server binds its socket BEFORE CognitiveState finishes loading
// (to avoid ECONNREFUSED during warm-up). TCP-connect succeeds while the
// backend still returns 503 "warming" for every actual route. We need the
// honest HTTP response to know when the spine is genuinely ready to serve.
function httpBackendReady(timeoutMs = 2000) {
  return new Promise(resolve => {
    const req = http.request({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/health',
      method: 'GET',
      timeout: timeoutMs,
      headers: { 'Connection': 'close' },
    }, res => {
      res.on('data', () => {}); // drain
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Cache the backend ready state — refreshed asynchronously so health() never blocks.
let backendReady = false;
let backendReadyTimer = null;
function scheduleBackendReadyCheck() {
  if (backendReadyTimer) clearTimeout(backendReadyTimer);
  backendReadyTimer = setTimeout(async () => {
    backendReady = await httpBackendReady(2000);
    scheduleBackendReadyCheck(); // check again in 5s
  }, 5000);
}
scheduleBackendReadyCheck();

function sendJson(res, status, data) {
  if (res.writableEnded || res.destroyed) return false;
  const body = Buffer.from(JSON.stringify(data));
  if (res.headersSent) {
    try { res.end(body); } catch {}
    return false;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Length': body.length,
    'Connection': 'close',
  });
  res.end(body);
  return true;
}

async function health(res) {
  // Use the cached backendReady — refreshed every 5s by scheduleBackendReadyCheck().
  // This is synchronous so health() never blocks the event loop.
  sendJson(res, 200, {
    status: backendReady ? 'healthy' : 'warming',
    service: 'cognitive_spine',
    gateway: 'node',
    port: PUBLIC_PORT,
    backend: {
      host: BACKEND_HOST,
      port: BACKEND_PORT,
      online: backendReady,
      pid: backend?.pid || null,
      uptime: backendStartedAt ? (Date.now() - backendStartedAt) / 1000 : 0,
      lastExit: lastBackendExit,
    },
    services: {
      memory: { status: backendReady ? 'healthy' : 'warming', service: 'memory_matrix_v2' },
      rules: { status: backendReady ? 'healthy' : 'warming', service: 'rules_engine' },
      modal: { status: backendReady ? 'healthy' : 'warming', service: 'modal_logic_engine' },
      diagnostics: { status: backendReady ? 'healthy' : 'warming', service: 'diagnostics' },
      'neuro-symbolic': { status: backendReady ? 'healthy' : 'warming', service: 'neuro_symbolic_bridge' },
      autodream: { status: backendReady ? 'healthy' : 'warming', service: 'autodream' },
    },
  });
}

function proxy(req, res) {
  const chunks = [];
  let settled = false;
  const finishJson = (status, data) => {
    if (settled) return false;
    settled = true;
    return sendJson(res, status, data);
  };
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const upstream = http.request({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      timeout: Number(process.env.COGNITIVE_PROXY_TIMEOUT_MS || 30000),
      headers: {
        ...req.headers,
        host: `${BACKEND_HOST}:${BACKEND_PORT}`,
        connection: 'close',
        'content-length': body.length,
      },
    }, upstreamRes => {
      const outHeaders = { ...upstreamRes.headers, connection: 'close' };
      if (res.headersSent || res.writableEnded || res.destroyed) {
        upstreamRes.resume();
        return;
      }
      settled = true;
      res.writeHead(upstreamRes.statusCode || 502, outHeaders);
      upstreamRes.on('error', () => { try { res.end(); } catch {} });
      upstreamRes.pipe(res);
    });
    upstream.on('timeout', () => {
      upstream.destroy();
      if (!res.headersSent && !res.writableEnded && !res.destroyed) finishJson(504, { ok: false, error: 'cognitive_backend_timeout' });
      else res.end();
    });
    upstream.on('error', err => {
      if (settled || res.headersSent || res.writableEnded || res.destroyed) {
        try { res.end(); } catch {}
      } else {
        finishJson(503, { ok: false, error: 'cognitive_backend_unavailable', detail: err.message });
      }
    });
    if (body.length) upstream.write(body);
    upstream.end();
  });
}

startBackend();

const server = http.createServer((req, res) => {
  res.shouldKeepAlive = false;
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  const pathOnly = new URL(req.url, `http://${PUBLIC_HOST}:${PUBLIC_PORT}`).pathname;
  if (req.method === 'GET' && (pathOnly === '/health' || pathOnly === '/cognitive/health')) {
    return health(res);
  }
  return proxy(req, res);
});

server.keepAliveTimeout = 1000;
server.headersTimeout = 5000;
server.requestTimeout = 35000;

server.on('clientError', (_err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch {}
});

server.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
  console.log(`[cognitive-gateway] listening on ${PUBLIC_HOST}:${PUBLIC_PORT}, backend ${BACKEND_HOST}:${BACKEND_PORT}`);
});

process.on('SIGINT', () => { stopBackend(); process.exit(0); });
process.on('SIGTERM', () => { stopBackend(); process.exit(0); });
