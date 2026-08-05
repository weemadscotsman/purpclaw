#!/usr/bin/env node
'use strict';
/**
 * Supervisor for the PURPCLAW web surface.
 *
 * PM2 pointed straight at node_modules/next/dist/bin/next. That bin forks a
 * child which is what actually binds the port, and PM2 on Windows kills only
 * the process it started. So every restart orphaned a live child still holding
 * 3030, the replacement could not bind, PM2 read EADDRINUSE as a crash and
 * restarted again — 2,309 times, each one leaking another port-holder.
 *
 * This wrapper fixes both halves:
 *   1. Before starting, check the port. If a healthy PURPCLAW web server is
 *      already serving it, exit 0 — there is nothing to do, and telling PM2
 *      "already running" is honest where crash-looping is not. If something
 *      unhealthy holds it, say so once and exit non-zero WITHOUT looping.
 *   2. While running, own the child: forward SIGINT/SIGTERM, and kill the whole
 *      process tree on exit so the next start finds a free port.
 *
 *   node scripts/start-web.js [--port 3030] [--host 127.0.0.1] [--prod]
 */

const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = parseInt(arg('port', process.env.PORT || '3030'), 10);
const HOST = arg('host', process.env.HOST || '127.0.0.1');
const MODE = process.argv.includes('--prod') ? 'start' : 'dev';

/** Is something already serving PURPCLAW on this port? */
function probe(timeoutMs = 4000) {
  return new Promise(resolve => {
    const req = http.get({ host: HOST, port: PORT, path: '/api/health', timeout: timeoutMs }, res => {
      res.resume();
      resolve({ listening: true, status: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ listening: true, status: null, hung: true }); });
    req.on('error', err => resolve({ listening: false, error: err.code }));
  });
}

(async () => {
  const before = await probe();

  if (before.listening && before.status && before.status < 500) {
    console.log(`[web] ${HOST}:${PORT} is already serving (HTTP ${before.status}). Nothing to start.`);
    console.log('[web] Exiting 0 — a second instance cannot bind the port, and crash-looping to');
    console.log('[web] discover that is what produced thousands of restarts.');
    process.exit(0);
  }

  if (before.listening) {
    console.error(`[web] ${HOST}:${PORT} is held by a process that is not answering /api/health`
      + (before.hung ? ' (request timed out).' : ` (${before.error || 'unknown'}).`));
    console.error('[web] Refusing to start a second server on a busy port. Free it first:');
    console.error(`[web]   Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select OwningProcess`);
    // Exit non-zero ONCE. Restarting cannot free a port someone else owns.
    process.exit(1);
  }

  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const args = [nextBin, MODE, '-p', String(PORT), '-H', HOST];
  console.log(`[web] starting: next ${MODE} on ${HOST}:${PORT}`);

  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });

  let shuttingDown = false;
  /** Kill the whole tree. `next` forks; killing only the direct child leaves
   *  the port bound, which is the bug this wrapper exists to prevent. */
  function killTree(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, signal || 'SIGTERM');
      }
    } catch { /* already gone */ }
  }

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => { console.log(`[web] ${sig} — stopping next and its children`); killTree(sig); process.exit(0); });
  }
  process.on('exit', () => killTree());

  child.on('exit', (code, signal) => {
    console.log(`[web] next exited (code=${code} signal=${signal})`);
    process.exit(code === null ? 1 : code);
  });
  child.on('error', err => {
    console.error(`[web] failed to spawn next: ${err.message}`);
    process.exit(1);
  });
})();
