#!/usr/bin/env node
'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { PROJECT_ROOT } = require('../../lib/paths');
const telemetry = require('../../lib/runtime/pipeline-telemetry');

const args = process.argv.slice(2);
function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}

const name = value('--name', 'python-service');
const script = path.resolve(PROJECT_ROOT, value('--script', ''));
const port = Number(value('--port', '0'));
const python = value('--python', process.env.PYTHON_BIN || 'python');
const scriptArgs = args.includes('--') ? args.slice(args.indexOf('--') + 1) : [];
const logDir = path.join(PROJECT_ROOT, 'logs', 'services');
const outLog = path.join(logDir, `${name}-out.log`);
const errLog = path.join(logDir, `${name}-error.log`);
const restartWindowMs = 10 * 60 * 1000;
const maxStarts = 3;
let starts = [];
let child = null;
let stopping = false;

if (!fs.existsSync(script)) throw new Error(`Python service script not found: ${script}`);
fs.mkdirSync(logDir, { recursive: true });

function portOpen() {
  if (!port) return Promise.resolve(false);
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
  });
}

function event(status, detail = {}) {
  telemetry.record({
    component: 'process-supervisor',
    service: name,
    status,
    port,
    script: path.relative(PROJECT_ROOT, script),
    ...detail,
  });
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

async function supervise() {
  if (stopping) return;
  if (await portOpen()) {
    event('blocked_duplicate', {
      reason: `port ${port} is already owned`,
      nextAction: `identify the owner of port ${port}; do not start another ${name}`,
    });
    setTimeout(supervise, 15000).unref();
    return;
  }

  const now = Date.now();
  starts = starts.filter(started => now - started < restartWindowMs);
  if (starts.length >= maxStarts) {
    event('circuit_open', {
      reason: `${starts.length} starts within ${restartWindowMs / 60000} minutes`,
      nextAction: `inspect ${errLog} and resolve the startup failure before restarting`,
    });
    setTimeout(supervise, 60000).unref();
    return;
  }

  starts.push(now);
  const stdout = fs.openSync(outLog, 'a');
  const stderr = fs.openSync(errLog, 'a');
  child = spawn(python, [script, ...scriptArgs], {
    cwd: PROJECT_ROOT,
    env: process.env,
    detached: false,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', stdout, stderr],
  });
  fs.closeSync(stdout);
  fs.closeSync(stderr);
  event('started', { childPid: child.pid, startCount: starts.length });

  child.once('error', error => {
    event('spawn_failed', { error: error.message, nextAction: `verify Python path ${python}` });
  });
  child.once('exit', (code, signal) => {
    const runtimeMs = Date.now() - now;
    child = null;
    event(code === 0 ? 'stopped' : 'crashed', {
      code,
      signal,
      runtimeMs,
      nextAction: code === 0 ? 'none' : `inspect ${errLog}`,
    });
    if (!stopping) {
      const delay = Math.min(5000 * (2 ** Math.max(0, starts.length - 1)), 60000);
      setTimeout(supervise, delay).unref();
    }
  });
}

function stop() {
  stopping = true;
  if (child?.pid) killTree(child.pid);
  event('host_stopped');
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('uncaughtException', error => {
  event('host_error', { error: error.stack || error.message });
  stop();
});

event('host_started', { hostPid: process.pid, python });
supervise();
setInterval(() => {
  event('heartbeat', { childPid: child?.pid || null, startsInWindow: starts.length });
}, 30000).unref();
