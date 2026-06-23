#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PM2_APP = 'purpclaw-nextjs';

function resolvePm2Bin() {
  const candidates = [];
  try {
    candidates.push(require.resolve('pm2/bin/pm2'));
  } catch {}
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'pm2', 'bin', 'pm2'));
  }
  if (process.env.ProgramData) {
    candidates.push(path.join(process.env.ProgramData, 'npm', 'node_modules', 'pm2', 'bin', 'pm2'));
  }
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

const pm2Bin = resolvePm2Bin();

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
}

function managedNextIsRunning() {
  if (!pm2Bin) return false;
  const result = spawnSync(process.execPath, [pm2Bin, 'pid', PM2_APP], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return false;
  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .some(line => /^\d+$/.test(line) && line !== '0');
}

const restartManagedNext = managedNextIsRunning();
if (restartManagedNext) {
  console.log(`[build] stopping ${PM2_APP} to protect the live .next manifest`);
  const stopped = run(process.execPath, [pm2Bin, 'stop', PM2_APP]);
  if (stopped.status !== 0) process.exit(stopped.status || 1);
}

let buildStatus = 1;
try {
  const nextBin = require.resolve('next/dist/bin/next');
  const built = run(process.execPath, [nextBin, 'build']);
  buildStatus = built.status ?? 1;
} finally {
  if (restartManagedNext) {
    console.log(`[build] restarting ${PM2_APP}`);
    const restarted = run(process.execPath, [pm2Bin, 'start', PM2_APP]);
    if (buildStatus === 0 && restarted.status !== 0) {
      buildStatus = restarted.status || 1;
    }
  }
}

process.exitCode = buildStatus;
