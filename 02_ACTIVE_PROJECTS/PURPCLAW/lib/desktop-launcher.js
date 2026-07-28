'use strict';
/**
 * lib/desktop-launcher.js
 * PURPCLAW WebUI desktop launcher engine
 *
 * Manages the static-server.js lifecycle (start/stop/status),
 * opens the WebUI in the browser, and handles Windows auto-start
 * via HKCU registry key.
 *
 * PID file: ~/.purpclaw/desktop/app.pid
 * Default port: 7790
 */

const { spawn, fork, exec: execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const HOME_DIR = os.homedir();
const PURP_DIR = (() => {
  // Walk up from this file to find project root
  const marker = 'docs' + path.sep + 'COMPANION_EVENT_MAP.md';
  const KNOWN = 'E:' + path.sep + 'god folder' + path.sep + '02_ACTIVE_PROJECTS' + path.sep + 'PURPCLAW';
  if (fs.existsSync(path.join(KNOWN, marker))) return KNOWN;
  let dir = __dirname;
  let prev = '';
  while (dir !== prev) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    prev = dir;
    dir = path.dirname(dir);
  }
  return path.dirname(__dirname); // fallback
})();

const STATIC_SERVER_PATH = path.join(PURP_DIR, 'static-server.js');
const PID_DIR  = path.join(HOME_DIR, '.purpclaw', 'desktop');
const PID_FILE = path.join(PID_DIR, 'app.pid');
const PORT     = 7790;
const URL      = `http://localhost:${PORT}`;
const REG_KEY  = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const REG_NAME = 'PURPCLAW';

/** Ensure the PID directory exists */
function _ensurePidDir() {
  if (!fs.existsSync(PID_DIR)) fs.mkdirSync(PID_DIR, { recursive: true });
}

/** Read the stored PID, or null if file doesn't exist */
function _readPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** Check if a process with the given PID is running on Windows */
function _isProcessRunning(pid) {
  if (!pid) return false;
  try {
    // Windows: tasklist returns non-zero exit code when no match
    const { status, stdout } = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
      windowsHide: true,
      timeout: 5000,
    });
    // stdout format: "imagename  PID  session#  ..."
    // If the PID appears in the line, the process exists
    const lines = stdout.split('\n');
    return lines.some(line => {
      const parts = line.trim().split(/\s+/);
      return parts[1] === String(pid);
    });
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start the static-server.js as a detached background process.
 * Writes PID to ~/.purpclaw/desktop/app.pid
 */
async function startServer() {
  _ensurePidDir();

  const status = serverStatus();
  if (status.running) {
    return { ok: false, running: true, pid: status.pid, port: status.port, message: 'Server already running' };
  }

  // Use fork() so Node.js keeps the IPC channel alive — the child survives
  // the parent's process.exit(0). Do NOT use unref(): the parent must keep a
  // reference until the child has bound its port. We keep the parent alive
  // for 2s using a held setTimeout, then exit normally.
  const child = fork(STATIC_SERVER_PATH, [], {
    cwd: PURP_DIR,
  });

  const pid = child.pid;
  if (!fs.existsSync(PID_DIR)) fs.mkdirSync(PID_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');

  // Poll for up to 5s — wait for the server to bind its port before returning.
  const net = require('net');
  const maxWait = 5_000;
  const step   = 200;
  let waited = 0;
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

  // Hold parent for 2s after successful bind — gives child time to stabilize
  // before parent's process.exit(0) fires. Do NOT unref this — it MUST keep
  // the event loop alive for 2s or the child gets killed at parent exit.
  const hold = setTimeout(() => {}, 2000);

  return { ok: true, running: true, pid, port: PORT, message: `Server started on port ${PORT}` };
}

/**
 * Stop the static-server.js process by PID.
 * Removes the PID file.
 */
function stopServer() {
  const pid = _readPid();
  if (!pid) {
    return { ok: false, running: false, message: 'No PID file found — server may not be running' };
  }

  if (!_isProcessRunning(pid)) {
    // Process is gone — clean up stale PID file
    try { fs.unlinkSync(PID_FILE); } catch { /* */ }
    return { ok: true, running: false, message: 'Server was not running (stale PID file removed)' };
  }

  try {
    // Windows: kill via taskkill /PID
    execSync(`taskkill /PID ${pid} /F`, { windowsHide: true, timeout: 5000 });
  } catch (e) {
    // If taskkill fails (e.g., access denied), try SIGTERM via Node
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }

  // Remove PID file
  try { fs.unlinkSync(PID_FILE); } catch { /* */ }

  return { ok: true, running: false, message: 'Server stopped' };
}

/**
 * Restart: stop then start
 */
async function restartServer() {
  stopServer();
  // Brief pause to allow port to be released
  await new Promise(r => setTimeout(r, 500));
  return startServer();
}

/**
 * Get current server status.
 * @returns {{ running: boolean, pid: number|null, port: number }}
 */
function serverStatus() {
  const pid = _readPid();
  const running = pid ? _isProcessRunning(pid) : false;

  // If we have a PID file but the process is dead, clean it up
  if (pid && !running) {
    try { fs.unlinkSync(PID_FILE); } catch { /* */ }
  }

  return {
    running,
    pid: running ? pid : null,
    port: running ? PORT : null,
  };
}

/**
 * Open the WebUI URL in the default browser using Windows `start` command.
 */
function openBrowser() {
  try {
    // cmd /c start handles URL escaping cleanly
    spawn('cmd.exe', ['/c', 'start', '', URL], { windowsHide: true, detached: true });
    return { ok: true, url: URL, message: `Opened ${URL} in browser` };
  } catch (e) {
    return { ok: false, url: URL, message: `Failed to open browser: ${e.message}` };
  }
}

/**
 * Install auto-start: write PURPCLAW registry key under HKCU\Run.
 * Starts static-server.js on login.
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
    // reg delete exits non-zero if key doesn't exist — treat as already absent
    if (e.message.includes('unable to find')) {
      return { ok: true, message: 'Auto-start was not installed' };
    }
    return { ok: false, message: `Failed to remove auto-start: ${e.message}` };
  }
}

module.exports = {
  startServer,
  stopServer,
  restartServer,
  serverStatus,
  openBrowser,
  installAutoStart,
  removeAutoStart,
  PORT,
  URL,
  PID_FILE,
};
