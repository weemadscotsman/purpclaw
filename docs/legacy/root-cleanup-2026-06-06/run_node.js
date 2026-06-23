/**
 * PURPCLAW Node Service Wrapper - No Window Spawn
 * Wraps Node.js services so they run without CMD window on Windows
 * Uses Windows CREATE_NO_WINDOW flag via spawn options
 */

const { spawn } = require('child_process');
const path = require('path');

// Usage: node run_node.js <service_script.js> [args...]
const serviceScript = process.argv[2];
const serviceArgs = process.argv.slice(3);

if (!serviceScript) {
  console.error('[RUN] Usage: node run_node.js <script.js> [args...]');
  process.exit(1);
}

const scriptPath = path.resolve(__dirname, serviceScript);
const child = spawn('node', [scriptPath, ...serviceArgs], {
  detached: false,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
  env: { ...process.env }
});

console.log(`[RUN] Started supervised Node service: ${serviceScript}`);

function stopChild(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on('SIGINT', () => stopChild('SIGINT'));
process.on('SIGTERM', () => stopChild('SIGTERM'));

child.on('error', (err) => {
  console.error(`[RUN] ${serviceScript} failed to start: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`[RUN] ${serviceScript} exited by signal ${signal}`);
    process.exit(0);
  }
  process.exit(code ?? 0);
});
