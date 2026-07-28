'use strict';
/**
 * lib/commands/desktop.js
 * purpclaw app — WebUI desktop launcher CLI
 *
 * Usage:
 *   purpclaw app status    [--json] [--verbose]
 *   purpclaw app start    [--json] [--verbose]
 *   purpclaw app stop     [--json] [--verbose]
 *   purpclaw app restart  [--json] [--verbose]
 *   purpclaw app open     [--json] [--verbose]
 *   purpclaw app install  [--json]   (auto-start on login)
 *   purpclaw app uninstall[--json]    (remove auto-start)
 *   purpclaw app --help
 */

const launcher = require('../desktop-launcher');

// ANSI colours (matches bin/purpclaw.js palette)
const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  blue   : '\x1b[34m',
  gray   : '\x1b[90m',
};

const isTTY = process.stdout.isTTY;
const col   = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

function out(msg)  { process.stdout.write(msg + '\n'); }
function err(msg)  { process.stderr.write(msg + '\n'); }
function bare(msg) { process.stdout.write(msg); }

async function statusCmd(args) {
  const json    = args.includes('--json');
  const verbose = args.includes('--verbose');
  const s       = await launcher.serverStatus();

  if (json) {
    out(JSON.stringify({ running: s.running, pid: s.pid, port: s.port }));
    return;
  }

  if (s.running) {
    out(col(C.green, `✔  WebUI running`) + `  ${col(C.cyan, `port ${s.port}`)}  ${col(C.gray, `pid ${s.pid}`)}`);
    if (verbose) out(col(C.dim, `   ${launcher.URL}`));
  } else {
    out(col(C.red,   `✖  WebUI not running`) + `  ${col(C.gray, `port ${launcher.PORT}`)}`);
    if (verbose) out(col(C.dim, `   Run: purpclaw app start`));
  }
}

async function startCmd(args) {
  const json    = args.includes('--json');
  const verbose = args.includes('--verbose');
  const result  = await launcher.startServer();

  if (json) {
    out(JSON.stringify(result));
    return;
  }

  if (result.running && result.message.includes('already')) {
    out(col(C.yellow, `!  ${result.message}`));
    if (verbose) out(col(C.dim, `   pid ${result.pid}  port ${result.port}`));
  } else if (result.ok) {
    out(col(C.green, `✔  ${result.message}`));
    if (verbose) out(col(C.dim, `   pid ${result.pid}  ${launcher.URL}`));
  } else {
    out(col(C.red, `✖  ${result.message}`));
  }
}

async function stopCmd(args) {
  const json    = args.includes('--json');
  const verbose = args.includes('--verbose');
  const result  = await launcher.stopServer();

  if (json) {
    out(JSON.stringify(result));
    return;
  }

  if (result.ok) {
    out(col(C.green, `✔  ${result.message}`));
  } else {
    out(col(C.yellow, `!  ${result.message}`));
    if (verbose && result.pid) out(col(C.dim, `   pid ${result.pid}`));
  }
}

async function restartCmd(args) {
  const json    = args.includes('--json');
  const verbose = args.includes('--verbose');

  // stop
  const stopResult = launcher.stopServer();
  if (!stopResult.ok && !stopResult.running) {
    // already stopped — that's fine
  }

  // start
  const startResult = await launcher.startServer();

  if (json) {
    out(JSON.stringify({
      stop: stopResult,
      start: startResult,
    }));
    return;
  }

  if (startResult.ok) {
    out(col(C.green, `✔  WebUI restarted`) + `  ${col(C.cyan, `port ${startResult.port}`)}  ${col(C.gray, `pid ${startResult.pid}`)}`);
  } else {
    out(col(C.red, `✖  Restart failed: ${startResult.message}`));
  }
}

function openCmd(args) {
  const json    = args.includes('--json');
  const result  = launcher.openBrowser();

  if (json) {
    out(JSON.stringify(result));
    return;
  }

  if (result.ok) {
    out(col(C.green, `✔  ${result.message}`));
  } else {
    out(col(C.red, `✖  ${result.message}`));
  }
}

function installCmd(args) {
  const json    = args.includes('--json');
  const result  = launcher.installAutoStart();

  if (json) {
    out(JSON.stringify(result));
    return;
  }

  if (result.ok) {
    out(col(C.green, `✔  ${result.message}`));
  } else {
    out(col(C.red, `✖  ${result.message}`));
  }
}

function uninstallCmd(args) {
  const json    = args.includes('--json');
  const result  = launcher.removeAutoStart();

  if (json) {
    out(JSON.stringify(result));
    return;
  }

  if (result.ok) {
    out(col(C.green, `✔  ${result.message}`));
  } else {
    out(col(C.yellow, `!  ${result.message}`));
  }
}

function helpCmd() {
  out(`purpclaw app — WebUI desktop launcher

${col(C.bold, 'Usage:')}  purpclaw app <subcommand> [--json] [--verbose]

${col(C.bold, 'Subcommands:')}
  status     Show whether the WebUI server is running (port, PID)
  start      Start the static-server.js background process
  stop       Stop the background server process
  restart    Stop then start the server
  open       Open the WebUI in your default browser
  install    Install auto-start (PURPCLAW starts on Windows login)
  uninstall  Remove auto-start

${col(C.bold, 'Options:')}
  --json     Output raw JSON instead of coloured text
  --verbose  Show additional detail (full URL, PID file path)

${col(C.bold, 'Defaults:')}
  Port:     ${launcher.PORT}
  PID file: ${launcher.PID_FILE}
  URL:      ${launcher.URL}

The WebUI is served by static-server.js from the ${col(C.cyan, 'public/')} directory.`);
}

// ── Main run fn ─────────────────────────────────────────────────────────────────

/**
 * @param {string[]} args  — everything after the subcommand name
 * @param {object}   ctx   — shared context (ignored here)
 */
async function run(args, ctx = {}) {
  const sub = (args[0] || '').toLowerCase();
  const json = args.includes('--json');
  const verbose = args.includes('--verbose');

  // ── Codex parity: bare `purpclaw app` opens the UI ─────────────────────────
  // `codex app` with no subcommand opens the desktop app / starts the server.
  // Equivalent: start server if needed, then open browser.
  if (!sub || sub === 'open' || (sub === 'run' && !args[1])) {
    // Start server if not running, then open browser
    const s = await launcher.serverStatus();
    if (!s.running) {
      const start = await launcher.startServer();
      if (!start.ok) {
        if (json) { out(JSON.stringify({ ok: false, error: start.message })); }
        else { out(col(C.red, `✖  ${start.message}`)); }
        return;
      }
      if (!json) out(col(C.green, `✔  Server started`) + `  ${col(C.cyan, `port ${start.port}`)}`);
    }
    const open = launcher.openBrowser();
    if (json) { out(JSON.stringify({ ok: true, url: launcher.URL, message: open.message })); }
    else { out(col(C.green, `✔  ${open.message}`) + `  ${col(C.cyan, launcher.URL)}`); }
    return;
  }

  switch (sub) {
    case 'status':
      await statusCmd(args.slice(1));
      break;
    case 'start':
      await startCmd(args.slice(1));
      break;
    case 'stop':
      await stopCmd(args.slice(1));
      break;
    case 'restart':
      await restartCmd(args.slice(1));
      break;
    case 'open':
      openCmd(args.slice(1));
      break;
    case 'install':
      installCmd(args.slice(1));
      break;
    case 'uninstall':
      uninstallCmd(args.slice(1));
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      // No recognised subcommand — show help in text mode, or status as JSON if --json
      if (!args.includes('--json')) {
        helpCmd();
      } else {
        // --json with no sub: output status JSON
        const s = await launcher.serverStatus();
        out(JSON.stringify({ running: s.running, pid: s.pid, port: s.port }));
      }
      break;
  }
}

module.exports = { run };
