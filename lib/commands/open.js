'use strict';

/**
 * purpclaw open — explicit UI launcher
 * ════════════════════════════════════════════════════════════════════════
 *
 * Boot the system silent. UIs only appear when the user asks.
 *
 *   purpclaw open                  — list available UIs and their ports
 *   purpclaw open <name>           — start the UI service (if needed) and open browser
 *   purpclaw open <name> --no-browser — start the service, just show the URL
 *   purpclaw open <name> --port 3000   — override port
 *
 * UIs are Next.js routes served by purpclaw-nextjs. The nextjs service is
 * NOT started by safe-start by default — the user pulls it up on demand.
 */

const { spawn, execSync, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const http = require('http');

const DEFAULT_NEXTJS_PORT = 3030;

// Map of UI name → next.js route path on the running nextjs service.
// Each name corresponds to a folder under app/ in the next.js project.
const UI_ROUTES = {
  'mission'        : '/mission',          // default landing
  'command-center' : '/mission',
  'mochi'          : '/mochi',
  'pipeline'       : '/pipeline',
  'swarm'          : '/swarm',
  'memory'         : '/memory',
  'system-map'     : '/system-map',
  'agents'         : '/agents',
  'ui'             : '/mission',
  'api'            : '/api/heartbeat',
};

function pm2Cmd() { return process.platform === 'win32' ? 'npx.cmd' : 'npx'; }

function isOnline(name, PURP_DIR) {
  try {
    const r = spawnSync(pm2Cmd(), ['pm2', 'jlist'], {
      cwd: PURP_DIR, windowsHide: true, encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    });
    if (r.status !== 0 || !r.stdout) return false;
    const list = JSON.parse(r.stdout);
    const entry = list.find(p => p.name === name);
    return entry?.pm2_env?.status === 'online';
  } catch { return false; }
}

function startService(name, PURP_DIR) {
  // Sequential safe-start for the one service. Mirrors safe-start's safety
  // guarantees (windowsHide, no cascade) but is a single-service path.
  // Uses the child-registry so this spawn is tracked, time-bounded, and
  // auto-killed if the parent dies (no detached leak).
  const { trackedSpawn } = require('../../lib/child-registry');
  const child = trackedSpawn(
    pm2Cmd(),
    ['pm2', 'start', 'ecosystem.config.js', '--only', name, '--update-env'],
    {
      tag: `startService(${name})`,
      cwd: PURP_DIR,
      windowsHide: true,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      timeoutMs: 60_000,  // 60s for pm2 start
    }
  );
  return new Promise((resolve, reject) => {
    child.on('close', code => code === 0 ? resolve() : reject(new Error('pm2 exited ' + code)));
    child.on('error', reject);
  });
}

async function waitForPort(port, host, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await new Promise(resolve => {
      const req = http.get({ hostname: host, port, path: '/', timeout: 1500 }, res => {
        // Any HTTP response = port is open and serving
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url) {
  // NO MORE `cmd /c start` — that pattern opens new console windows
  // and leaks detached processes (root cause of the cascade that
  // killed Eddie's box). The CLI just prints the URL now; the user
  // can paste it into their browser. If you really need a programmatic
  // open, use a real handler registered with the OS, NOT spawn().
  if (process.env.PURPCLAW_OPEN_BROWSER === '1') {
    try {
      const { trackedSpawn } = require('../../lib/child-registry');
      if (process.platform === 'win32') {
        // `rundll32 url.dll,FileProtocolHandler` opens via the default
        // browser WITHOUT spawning a new console. Detached is FALSE
        // so we can guarantee cleanup.
        trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', url], {
          tag: `openBrowser(${url})`, timeoutMs: 5_000, windowsHide: true,
        });
      } else if (process.platform === 'darwin') {
        trackedSpawn('open', [url], { tag: `openBrowser(${url})`, timeoutMs: 5_000 });
      } else {
        trackedSpawn('xdg-open', [url], { tag: `openBrowser(${url})`, timeoutMs: 5_000 });
      }
      return true;
    } catch (e) {
      // fall through to print
    }
  }
  // Default: just print the URL. No spawn, no leak.
  console.log(`\n  → ${url}\n`);
  return false;
}

async function run(args, ctx) {
  const { C, col, PURP_DIR } = ctx;
  const wantBrowser = !args.includes('--no-browser');
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_NEXTJS_PORT;
  const host = '127.0.0.1';

  const name = (args.find(a => !a.startsWith('--')) || '').toLowerCase();

  // No name — list available UIs
  if (!name) {
    console.log(`\n  ${col(C.bold || C.white, '🌐  PURPCLAW OPEN')}  ${col(C.gray, '·')}  ${col(C.cyan, 'available UIs (served on :' + port + ')')}\n`);
    for (const [n, route] of Object.entries(UI_ROUTES)) {
      console.log(`  ${col(C.cyan, n.padEnd(20))} ${col(C.gray, 'http://' + host + ':' + port + route)}`);
    }
    console.log(`\n  ${col(C.gray, 'usage:')} ${col(C.cyan, 'purpclaw open <name>')}\n`);
    return;
  }

  const route = UI_ROUTES[name];
  if (!route) {
    console.error(col(C.red, `\n  ✗ unknown UI: ${name}\n`));
    console.error(col(C.gray, `  known: ${Object.keys(UI_ROUTES).join(', ')}\n`));
    process.exitCode = 1;
    return;
  }

  const url = `http://${host}:${port}${route}`;
  console.log(`\n  ${col(C.bold || C.white, '🌐  PURPCLAW OPEN')}  ${col(C.gray, '·')}  ${col(C.cyan, name)}  ${col(C.gray, '→ ' + url)}\n`);

  // Make sure nextjs is running. If not, start it silently.
  if (!isOnline('purpclaw-nextjs', PURP_DIR)) {
    console.log(`  ${col(C.gray, '↪ purpclaw-nextjs is offline, starting it (silent)…')}`);
    try {
      await startService('purpclaw-nextjs', PURP_DIR);
    } catch (e) {
      console.error(col(C.red, `  ✗ failed to start purpclaw-nextjs: ${e.message}`));
      console.error(col(C.gray, `  try: purpclaw logs nextjs --lines 30\n`));
      process.exitCode = 1;
      return;
    }
  } else {
    console.log(`  ${col(C.gray, '· purpclaw-nextjs already online')}`);
  }

  // Wait for the port to actually accept connections (next dev has a compile
  // window after pm2 reports online)
  console.log(`  ${col(C.gray, '· waiting for :' + port + ' to respond…')}`);
  const ready = await waitForPort(port, host, 30000);
  if (!ready) {
    console.error(col(C.red, `  ✗ port ${port} did not respond within 30s. check: purpclaw logs nextjs\n`));
    process.exitCode = 1;
    return;
  }

  console.log(`  ${col(C.green, '✓')}  ${col(C.cyan, 'ready')}  ${col(C.gray, url)}`);

  if (wantBrowser) {
    openBrowser(url);
    console.log(`  ${col(C.green, '✓')}  ${col(C.gray, 'opened in default browser')}\n`);
  } else {
    console.log(`  ${col(C.gray, '(browser suppressed — URL above)')}\n`);
  }
}

module.exports = { run, UI_ROUTES };
