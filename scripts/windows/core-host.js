#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { PROJECT_ROOT } = require('../../lib/paths');

const PM2_HOME = process.env.PM2_HOME || path.join(process.env.ProgramData || 'C:\\ProgramData', 'PurpClaw', 'pm2');
process.env.PM2_HOME = PM2_HOME;

function resolvePm2Bin() {
  const candidates = [];
  try { candidates.push(require.resolve('pm2/bin/pm2')); } catch {}
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'pm2', 'bin', 'pm2'));
  if (process.env.ProgramData) candidates.push(path.join(process.env.ProgramData, 'npm', 'node_modules', 'pm2', 'bin', 'pm2'));
  return candidates.find(candidate => fs.existsSync(candidate));
}

const PM2_BIN = resolvePm2Bin();
if (!PM2_BIN) throw new Error('PM2 CLI not found. Run npm install before installing the PurpClaw service.');

function pm2(args) {
  return spawnSync(process.execPath, [PM2_BIN, ...args], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function start() {
  const result = pm2(['start', 'ecosystem.config.js', '--only',
    'purpclaw-eventbus,purpclaw-state,purpclaw-api,purpclaw-orchestrator,purpclaw-tower,purpclaw-pool,purpclaw-context,purpclaw-gatekeeper,purpclaw-metrics,purpclaw-cognitive,purpclaw-nextjs,purpclaw-coordinator,purpclaw-harness',
    '--update-env',
  ]);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'PM2 start failed');
  pm2(['save']);
}

start();
console.log(`[core-host] PurpClaw core started with PM2_HOME=${PM2_HOME}`);

const timer = setInterval(() => {
  const result = pm2(['ping']);
  if (result.status !== 0) {
    console.error('[core-host] PM2 ping failed; restarting core');
    start();
  }
}, 30000);

function stop() {
  clearInterval(timer);
  pm2(['kill']);
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
