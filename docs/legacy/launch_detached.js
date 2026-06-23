#!/usr/bin/env node
/**
 * PURPCLAW Detached Launcher
 * Spawns services that survive the parent exiting.
 * 
 * ⚠ LEGACY — prefer adding services to ecosystem.config.js + PM2.
 *   This file exists for the "quick start without PM2" path.
 *   All spawns go through child-registry for tracking + timeouts.
 *
 * Usage: node launch_detached.js
 */

const path = require('path');
const { trackedSpawn } = require('./lib/child-registry');

// Add Python to PATH so unified_bridge can find it
const env = { ...process.env };
if (!env.PATH.includes('Python314')) {
  env.PATH = 'C:\\Python314;' + env.PATH;
}

const components = [
  {
    name: 'Control API',
    file: 'control_api.js',
    port: 7780
  },
  {
    name: 'GUARDIAN Security API',
    file: 'skills/guardian/security_control_api.js',
    port: 7781
  },
  {
    name: 'Voice Command Bridge (unified_bridge)',
    file: 'unified_bridge.js',
    port: 7778
  }
];

console.log('[LAUNCHER] PURPCLAW Detached Start');
console.log('[LAUNCHER] Starting', components.length, 'services...\n');

// NOTE: We do NOT call installCleanup() here — the parent exits immediately
// via process.exit(0), which skips the 'beforeExit' event, so children survive.
// All children get hard timeouts via trackedSpawn.
components.forEach(comp => {
  const child = trackedSpawn('node', [comp.file], {
    tag: `launcher-${comp.name}`,
    timeoutMs: 0,  // no hard timeout — services run indefinitely
    cwd: __dirname,
    stdio: 'ignore',
    env: env
  });

  child.unref();  // allow parent to exit without waiting
  console.log(`[LAUNCHER] Spawned ${comp.name} (pid: ${child.pid}) on port ${comp.port}`);
});

console.log('\n[LAUNCHER] All services launched. Exiting parent.');
process.exit(0);
