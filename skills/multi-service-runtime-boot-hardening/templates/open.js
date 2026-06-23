// open.js — explicit UI launcher
//
// Brings up a service on demand and opens the OS default browser.
// Pair this with the boot-hardening skill: UIs are NOT in the default
// boot. The user explicitly requests them.
//
//   your-cli open              # list available UIs
//   your-cli open <name>       # start the UI service + open browser
//   your-cli open <name> --no-browser   # start the service, just print URL
//   your-cli open <name> --port=4000   # override port
//
// The boot-hardening guarantee: this is the only path that opens a
// browser. Boot never does.

'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');

const DEFAULT_NEXTJS_PORT = 3000;

// Map of UI name → route on the running UI service.
// Each name corresponds to a folder under app/ in a Next.js project.
const UI_ROUTES = {
  // TODO: populate with your UI route names
  // 'mission'        : '/mission',
  // 'command-center' : '/command-center',
  // 'mochi'          : '/mochi',
};

function pm2Cmd() { return process.platform === 'win32' ? 'npx.cmd' : 'npx'; }

function isOnline(name, cwd) {
  try {
    const r = spawnSync(pm2Cmd(), ['pm2', 'jlist'], {
      cwd, windowsHide: true, encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    });
    if (r.status !== 0 || !r.stdout) return false;
    const list = JSON.parse(r.stdout);
    const entry = list.find(p => p.name === name);
    return entry?.pm2_env?.status === 'online';
  } catch { return false; }
}

function startService(name, cwd) {
  const proc = spawn(pm2Cmd(),
    ['pm2', 'start', 'ecosystem.config.js', '--only', name, '--update-env'],
    { cwd, windowsHide: true, shell: process.platform === 'win32', stdio: 'inherit' });
  return new Promise((resolve, reject) => {
    proc.on('close', code => code === 0 ? resolve() : reject(new Error('pm2 exited ' + code)));
    proc.on('error', reject);
  });
}

async function waitForPort(port, host, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await new Promise(resolve => {
      const req = http.get({ hostname: host, port, path: '/', timeout: 1500 }, res => {
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
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url], { windowsHide: true, detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' });
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  }
}

async function run(args, ctx) {
  const { C, col, PURP_DIR } = ctx;
  const wantBrowser = !args.includes('--no-browser');
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_NEXTJS_PORT;
  const host = '127.0.0.1';

  const name = (args.find(a => !a.startsWith('--')) || '').toLowerCase();

  if (!name) {
    console.log(`\n  available UIs (served on :${port}):\n`);
    for (const [n, route] of Object.entries(UI_ROUTES)) {
      console.log(`    ${n.padEnd(20)} http://${host}:${port}${route}`);
    }
    console.log(`\n  usage: your-cli open <name>\n`);
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
  console.log(`\n  open: ${name} → ${url}\n`);

  // TODO: replace 'your-ui-service' with the actual PM2 service name
  const UI_PM2_NAME = 'your-ui-service';

  if (!isOnline(UI_PM2_NAME, PURP_DIR)) {
    console.log(`  ↪ ${UI_PM2_NAME} is offline, starting it (silent)…`);
    try {
      await startService(UI_PM2_NAME, PURP_DIR);
    } catch (e) {
      console.error(col(C.red, `  ✗ failed to start ${UI_PM2_NAME}: ${e.message}`));
      console.error(col(C.gray, `  try: pm2 logs ${UI_PM2_NAME} --lines 30\n`));
      process.exitCode = 1;
      return;
    }
  } else {
    console.log(`  · ${UI_PM2_NAME} already online`);
  }

  console.log(`  · waiting for :${port} to respond…`);
  const ready = await waitForPort(port, host, 30000);
  if (!ready) {
    console.error(col(C.red, `  ✗ port ${port} did not respond within 30s. check: pm2 logs ${UI_PM2_NAME}\n`));
    process.exitCode = 1;
    return;
  }

  console.log(`  ✓ ready  ${url}`);

  if (wantBrowser) {
    openBrowser(url);
    console.log(`  ✓ opened in default browser\n`);
  } else {
    console.log(`  (browser suppressed — URL above)\n`);
  }
}

module.exports = { run, UI_ROUTES };
