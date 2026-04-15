#!/usr/bin/env node
/**
 * PURPCLAW Detached Launcher
 * Spawns processes that survive the parent exiting
 * Usage: node launch_detached.js
 */

const { spawn } = require('child_process');
const path = require('path');

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

components.forEach(comp => {
  const proc = spawn('node', [comp.file], {
    cwd: __dirname,
    detached: true,
    stdio: 'ignore',
    shell: false,
    env: env
  });

  proc.unref();
  console.log(`[LAUNCHER] Spawned ${comp.name} (pid: ${proc.pid}) on port ${comp.port}`);
});

console.log('\n[LAUNCHER] All services launched. Exiting parent.');
process.exit(0);
