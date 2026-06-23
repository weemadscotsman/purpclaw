/**
 * PURPCLAW Python Service Wrapper - No Window Spawn
 * Wraps Python services so they run without CMD/Python console window
 * Uses pythonw.exe which has no console window by default
 */

const { spawn } = require('child_process');
const path = require('path');
const { execSync } = require('child_process');

// Find pythonw.exe - try PYTHON_BIN env var first, then common install locations, then PATH
function findPythonW() {
  // PYTHON_BIN env var takes precedence
  const envPath = process.env.PYTHON_BIN;
  if (envPath && require('fs').existsSync(envPath)) {
    return envPath;
  }

  // Try to get pythonw from registry via where command
  try {
    const result = execSync('where pythonw', { encoding: 'utf8', windowsHide: true }).trim();
    const firstPath = result.split('\n')[0].trim();
    if (firstPath && require('fs').existsSync(firstPath)) {
      return firstPath;
    }
  } catch (e) {}

  // Try common installation paths
  const commonPaths = [
    'C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python311\\pythonw.exe',
    'C:\\Python310\\pythonw.exe',
    'C:\\Python39\\pythonw.exe',
    'C:\\Program Files\\Python311\\pythonw.exe',
    'C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python39\\pythonw.exe',
  ];

  for (const p of commonPaths) {
    if (require('fs').existsSync(p)) return p;
  }

  // Fallback to just 'pythonw.exe' and hope it's in PATH
  return 'pythonw.exe';
}

const PYTHONW_EXE = findPythonW();

// Usage: node run_py.js <service_script.py> [args...]
const serviceScript = process.argv[2];
const serviceArgs = process.argv.slice(3);

if (!serviceScript) {
  console.error('[RUN] Usage: node run_py.js <script.py> [args...]');
  process.exit(1);
}

const scriptPath = path.resolve(__dirname, serviceScript);
const child = spawn(PYTHONW_EXE, [scriptPath, ...serviceArgs], {
  detached: false,
  stdio: 'ignore',
  shell: false,
  windowsHide: true,
  env: { ...process.env }
});

console.log(`[RUN] Started supervised Python service: ${serviceScript} with ${PYTHONW_EXE}`);

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
