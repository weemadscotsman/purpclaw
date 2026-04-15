#!/usr/bin/env node

/**
 * PURPCLAW Unified Startup System
 * Launches all components of the PURPCLAW swarm
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 PURPCLAW v7.0 - Unified Startup System');
console.log('='.repeat(50));

// Component configurations
// NOTE: Control API (7780) is started BY unified_bridge.js - do NOT add it here to avoid EADDRINUSE
const components = [
  {
    name: 'GUARDIAN Security API',
    file: path.join(__dirname, 'skills', 'guardian', 'security_control_api.js'),
    port: 7781,
    color: '🔒'
  },
  {
    name: 'Voice Command Bridge',
    file: path.join(__dirname, 'unified_bridge.js'),
    port: 7778,
    color: '🎤'
  }
];

const processes = [];

// Function to start a component
function startComponent(component) {
  console.log(`${component.color} Starting ${component.name} on port ${component.port}...`);

  const proc = spawn('node', [component.file], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: component.port }
  });

  // Capture output
  proc.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`${component.color} ${component.name}: ${output}`);
    }
  });

  proc.stderr.on('data', (data) => {
    const error = data.toString().trim();
    if (error) {
      console.error(`${component.color} ${component.name} ERROR: ${error}`);
    }
  });

  proc.on('close', (code) => {
    console.log(`${component.color} ${component.name} exited with code ${code}`);
    if (code !== 0) {
      console.log(`${component.color} Restarting ${component.name} in 3 seconds...`);
      setTimeout(() => startComponent(component), 3000);
    }
  });

  processes.push({
    name: component.name,
    process: proc,
    port: component.port
  });

  return proc;
}

// Start all components
components.forEach(component => {
  startComponent(component);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down PURPCLAW swarm...');

  processes.forEach(({ name, process }) => {
    console.log(`Stopping ${name}...`);
    process.kill('SIGTERM');
  });

  setTimeout(() => {
    console.log('✅ PURPCLAW swarm stopped');
    process.exit(0);
  }, 2000);
});

// Display status
setTimeout(() => {
  console.log('\n' + '='.repeat(50));
  console.log('✅ PURPCLAW Swarm v7.0 Ready');
  console.log('='.repeat(50));
  console.log('📡 Available Services:');
  console.log('  💀 Main Control API: http://localhost:7780');
  console.log('  🔒 GUARDIAN Security: http://localhost:7781');
  console.log('  🎤 Voice Bridge: ws://localhost:7778');
  console.log('  🔒 Voice Security: ws://localhost:7779 (when started)');
  console.log('\n📋 Security Endpoints:');
  console.log('  POST /scan/full      - Run full security scan');
  console.log('  POST /scan/secrets   - Scan for hardcoded secrets');
  console.log('  POST /scan/dependencies - Audit dependencies');
  console.log('  POST /scan/emergency - Emergency security scan');
  console.log('  POST /voice/start    - Start voice security handler');
  console.log('  POST /voice/stop     - Stop voice security handler');
  console.log('  GET  /status         - Security status');
  console.log('  GET  /recommendations - Security recommendations');
  console.log('\n🎤 Voice Commands:');
  console.log('  "scan security"      - Run comprehensive security scan');
  console.log('  "check secrets"      - Scan for hardcoded credentials');
  console.log('  "audit dependencies" - Check npm packages');
  console.log('  "validate inputs"    - Review input validation');
  console.log('  "emergency"          - Activate emergency protocol');
  console.log('  "security status"    - Get security status');
  console.log('='.repeat(50));
  console.log('Press Ctrl+C to shutdown\n');
}, 3000);