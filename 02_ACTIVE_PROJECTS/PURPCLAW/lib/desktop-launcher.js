'use strict';
/**
 * lib/desktop-launcher.js
 * PURPCLAW WebUI desktop launcher engine
 *
 * Manages the static-server.js lifecycle (start/stop/status/restart),
 * opens the WebUI in the browser, and handles Windows auto-start
 * via HKCU registry key.
 *
 * PID file: ~/.purpclaw/desktop/app.pid
 * Default port: 7790
 */

const { spawn, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const HOME_DIR = os.homedir();
const PURP_DIR = (() => {
  const KNOWN = 'E:' + path.sep + 'god folder' + path.sep + '02_ACTIVE_PROJECTS' + path.sep + 'PURPCLAW';
  if (fs.existsSync(path.join(KNOWN, 'docs', 'COMPANION_EVENT_MAP.md'))) return KNOWN;
  let dir = __dirname, prev = '';
  while (dir !== prev) {
    if (fs.existsSync(path.join(dir, 'docs', 'COMPANION_EVENT_MAP.md'))) return dir;
    prev = dir; dir = path.dirname(dir);
  }
  return path.dirname(__dirname);
})();

const STATIC_SERVER_PATH = path.join(PURP_DIR, 'static-server.js');
const PID_DIR  = path.join(HOME_DIR, '.purpclaw', 'desktop');
const PID_FILE = path.join(PID_DIR, 'app.pid');
const PORT     = 7790;
const URL      = `http://localhost:${PORT}`;
const REG_KEY  = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const REG_NAME = 'PURPCLAW';

function _ensurePidDir() {
  if (!fs.existsSync(PID_DIR)) fs.mkdirSync(PID_DIR, { recursive: true });
}

function _readPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch { return null; }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start the static-server.js as a background process.
 * Uses detached:true + stdio:ignore so the child survives parent exit.
 * Writes PID to ~/.purpclaw/desktop/app.pid
 */
async function startServer() {
  _ensurePidDir();

  const status = await serverStatus();
  if (status.running) {
    return { ok: false, running: true, pid: status.pid, port: status.port, message: 'Server already running' };
  }

  // Write PID file before fork — parent can't write after it exits.
  // Use detached:true + stdio:ignore so child becomes a session leader
  // that survives the parent process exiting on Windows.
  if (!fs.existsSync(PID_DIR)) fs.mkdirSync(PID_DIR, { recursive: true });
  const pidFileTmp = path.join(PID_DIR, 'starting.tmp');
  fs.writeFileSync(pidFileTmp, 'starting', 'utf8');

  const child = spawn(process.execPath, [STATIC_SERVER_PATH], {
    cwd:         PURP_DIR,
    detached:    true,
    stdio:       ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  child.unref();

  const pid = child.pid;
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');
  try { fs.unlinkSync(pidFileTmp); } catch { /* */ }

  // Poll for up to 5s — wait for the server to bind its port before returning.
  const net = require('net');
  const maxWait = 5_000;
  const step    = 200;
  let waited    = 0;
  while (waited < maxWait) {
    const ok = await new Promise(resolve => {
      const s = net.connect(PORT, '127.0.0.1', () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
    });
    if (ok) break;
    await new Promise(r => setTimeout(r, step));
    waited += step;
  }

  if (waited >= maxWait) {
    return { ok: false, running: false, pid, port: PORT, message: `Server PID ${pid} but port ${PORT} did not bind after ${maxWait}ms` };
  }

  return { ok: true, running: true, pid, port: PORT, message: `Server started on port ${PORT}` };
}

/**
 * Stop the static-server.js process.
 * Detects by port first (no PID file needed), then kills by PID.
 */
async function stopServer() {
  let actuallyRunning = false;
  await new Promise(resolve => {
    const net = require('net');
    const s = net.connect(PORT, '127.0.0.1', () => { s.destroy(); actuallyRunning = true; resolve(); });
    s.on('error', () => resolve());
    setTimeout(resolve, 500);
  });

  if (!actuallyRunning) {
    try { fs.unlinkSync(PID_FILE); } catch { /* */ }
    return { ok: false, running: false, message: 'Server is not running on port ' + PORT };
  }

  let pid = _readPid();
  if (!pid) {
    try {
      const { stdout } = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, {
        encoding: 'utf-8', windowsHide: true,
      });
      const m = stdout.trim().match(/LISTENING\s+(\d+)/);
      if (m) pid = parseInt(m[1], 10);
    } catch { /* */ }
  }

  if (!pid) {
    return { ok: false, running: true, message: 'Server running but PID could not be determined' };
  }

  try { execSync(`taskkill /PID ${pid} /F`, { windowsHide: true, timeout: 5000 }); }
  catch (e) { try { process.kill(pid, 'SIGTERM'); } catch { /* */ } }

  try { fs.unlinkSync(PID_FILE); } catch { /* */ }
  return { ok: true, running: false, message: 'Server stopped' };
}

/**
 * Check if the static server is running — async, uses port connectivity.
 */
async function serverStatus() {
  const net = require('net');
  let portOpen = false;
  await new Promise(resolve => {
    const s = net.connect(PORT, '127.0.0.1', () => { s.destroy(); portOpen = true; resolve(); });
    s.on('error', () => resolve());
    setTimeout(resolve, 1000);
  });

  const pid = _readPid();
  return {
    running: portOpen,
    pid:     portOpen ? (pid || null) : null,
    port:    portOpen ? PORT : null,
  };
}

/**
 * Open the WebUI URL in the default browser.
 */
function openBrowser() {
  try {
    spawn('cmd.exe', ['/c', 'start', '', URL], { windowsHide: true, detached: true });
    return { ok: true, url: URL, message: `Opened ${URL} in browser` };
  } catch (e) {
    return { ok: false, url: URL, message: `Failed to open browser: ${e.message}` };
  }
}

/**
 * Install auto-start: write PURPCLAW registry key under HKCU\Run.
 */
function installAutoStart() {
  try {
    const val = `"${process.execPath}" "${STATIC_SERVER_PATH}"`;
    execSync(`reg add "${REG_KEY}" /v "${REG_NAME}" /d ${val} /f`, { windowsHide: true, timeout: 5000 });
    return { ok: true, message: 'Auto-start installed (PURPCLAW starts on login)' };
  } catch (e) {
    return { ok: false, message: `Failed to install auto-start: ${e.message}` };
  }
}

/**
 * Remove auto-start: delete PURPCLAW registry key from HKCU\Run.
 */
function removeAutoStart() {
  try {
    execSync(`reg delete "${REG_KEY}" /v "${REG_NAME}" /f`, { windowsHide: true, timeout: 5000 });
    return { ok: true, message: 'Auto-start removed' };
  } catch (e) {
    if (e.message.includes('unable to find')) {
      return { ok: true, message: 'Auto-start was not installed' };
    }
    return { ok: false, message: `Failed to remove auto-start: ${e.message}` };
  }
}

module.exports = {
  startServer,
  stopServer,
  serverStatus,
  openBrowser,
  installAutoStart,
  removeAutoStart,
  PORT,
  URL,
  PID_FILE,
};
