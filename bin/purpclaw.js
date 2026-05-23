#!/usr/bin/env node
/**
 * PURPCLAW CLI — bin/purpclaw.js
 * ================================
 * The front door. Run from anywhere after `npm link` or `npm install -g`.
 *
 * Usage:
 *   purpclaw start              — boot the full PM2 stack
 *   purpclaw stop               — stop everything
 *   purpclaw restart [service]  — restart all or one service
 *   purpclaw chat               — open NanoClaw REPL (swarm-aware)
 *   purpclaw run "<task>"       — one-shot task, streams agent progress
 *   purpclaw status             — live dashboard of all services + agents
 *   purpclaw agents             — list agents, scores, and division info
 *   purpclaw workflows          — list active and recent workflows
 *   purpclaw queue              — show task queue depth and items
 *   purpclaw memory [query]     — query the memory matrix
 *   purpclaw dream              — trigger AutoDream consolidation manually
 *   purpclaw logs [service]     — tail PM2 logs
 *   purpclaw help               — show this help
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');
const readline = require('readline');

// ── Root and config ───────────────────────────────────────────────────────────
const PURP_DIR      = path.resolve(__dirname, '..');

// Lightweight .env loader — populates process.env without adding a dependency.
// Existing shell env vars win over .env (shell-set values are explicit).
(function loadEnv() {
  try {
    const envPath = path.join(PURP_DIR, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.substring(0, eq).trim();
      let v = line.substring(eq + 1).trim();
      // Strip optional surrounding quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* env loader is best-effort */ }
})();

const ECOSYSTEM     = path.join(PURP_DIR, 'ecosystem.config.js');
const NANOCLAW      = path.join(PURP_DIR, 'scripts', 'nanoclaw.js');
const AGENT_SCORE   = path.join(PURP_DIR, 'agent_score.json');
const SERVICE_REGISTRY = require(path.join(PURP_DIR, 'service_registry.js'));
const GOVERNANCE = require(path.join(PURP_DIR, 'lib', 'governance.js'));
const JOB_CONTRACT = require(path.join(PURP_DIR, 'lib', 'job-contract.js'));
const PROACTIVE = require(path.join(PURP_DIR, 'lib', 'proactive-maintenance.js'));
const SPAGHETTI = require(path.join(PURP_DIR, 'lib', 'spaghetti-audit.js'));

const PORTS = {
  orchestrator : parseInt(process.env.ORCHESTRATOR_PORT  || '7784', 10),
  api          : parseInt(process.env.API_PORT           || '7780', 10),
  tower        : parseInt(process.env.TOWER_PORT         || '7790', 10),
  eventbus     : parseInt(process.env.EVENTBUS_PORT      || '7782', 10),
  state        : parseInt(process.env.STATE_PORT         || '7783', 10),
  memory       : parseInt(process.env.MEMORY_PORT        || '7880', 10),
  metrics      : parseInt(process.env.METRICS_PORT       || '7890', 10),
  voice        : parseInt(process.env.VOICE_PORT         || '7781', 10),
};

// ── ANSI colours (no deps) ────────────────────────────────────────────────────
const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  blue   : '\x1b[34m',
  magenta: '\x1b[35m',
  white  : '\x1b[37m',
  gray   : '\x1b[90m',
};

const isTTY = process.stdout.isTTY;
const col   = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

// ── Spinner ───────────────────────────────────────────────────────────────────
class Spinner {
  constructor(label = '') {
    this._frames  = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    this._label   = label;
    this._idx     = 0;
    this._timer   = null;
    this._active  = false;
  }

  start(label) {
    if (!isTTY) { if (label || this._label) process.stdout.write(`  ${label || this._label}...\n`); return this; }
    if (label) this._label = label;
    this._active = true;
    process.stdout.write('\x1B[?25l'); // hide cursor
    this._timer = setInterval(() => {
      const frame = col(C.cyan, this._frames[this._idx % this._frames.length]);
      process.stdout.write(`\r  ${frame}  ${this._label}`);
      this._idx++;
    }, 80);
    return this;
  }

  text(label) {
    this._label = label;
    return this;
  }

  succeed(msg) { return this._stop(col(C.green, '✔'), msg); }
  fail(msg)    { return this._stop(col(C.red,   '✖'), msg); }
  warn(msg)    { return this._stop(col(C.yellow,'⚠'), msg); }
  info(msg)    { return this._stop(col(C.cyan,  'ℹ'), msg); }

  _stop(icon, msg) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._active = false;
    if (isTTY) {
      process.stdout.write('\x1B[?25h'); // show cursor
      process.stdout.write(`\r  ${icon}  ${msg || this._label}\n`);
    } else {
      console.log(`  ${msg || this._label}`);
    }
    return this;
  }
}

function spinner(label) { return new Spinner(label); }

// ── Tiny HTTP helpers ─────────────────────────────────────────────────────────
function httpGet(port, pathname, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: pathname, method: 'GET', headers: { Accept: 'application/json' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      }
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function httpPost(port, pathname, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1', port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function ping(port, path_ = '/health') {
  try {
    const r = await httpGet(port, path_, 2000);
    return r && (r.status === 'healthy' || r.status === 'ok' || r.ok === true || typeof r === 'object');
  } catch {
    return false;
  }
}

// ── SSE stream consumer ───────────────────────────────────────────────────────
function subscribeSSE(port, pathname, onEvent, onError) {
  const req = http.request(
    { hostname: '127.0.0.1', port, path: pathname, headers: { Accept: 'text/event-stream' } },
    res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop(); // keep partial line
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { onEvent(JSON.parse(line.slice(6))); } catch { /* skip malformed */ }
          }
        }
      });
      res.on('end', () => onError && onError(new Error('stream closed')));
    }
  );
  req.on('error', e => onError && onError(e));
  req.end();
  return req; // caller can req.destroy() to unsubscribe
}

// ── PM2 wrapper ───────────────────────────────────────────────────────────────
function pm2(args, opts = {}) {
  return new Promise((resolve, reject) => {
    let command, finalArgs;
    if (process.env.PM2_BIN) {
      command   = process.env.PM2_BIN;
      finalArgs = args;
    } else if (process.platform === 'win32') {
      // On Windows use cmd /c so .cmd scripts work without shell:true
      command   = 'cmd.exe';
      finalArgs = ['/c', 'npx', 'pm2', ...args];
    } else {
      command   = 'npx';
      finalArgs = ['pm2', ...args];
    }
    const child = spawn(command, finalArgs, {
      cwd        : PURP_DIR,
      stdio      : opts.silent ? 'pipe' : 'inherit',
      shell      : false,
      windowsHide: true,
    });
    child.on('close', code => code === 0 ? resolve(code) : reject(new Error(`pm2 exited ${code}`)));
    child.on('error', reject);
  });
}

function resolveLaunchTarget(args, defaultProfile = 'harness') {
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const profileArg = args.find(a => a.startsWith('--profile='));
  const groupArg = args.find(a => a.startsWith('--group='));

  if (all) {
    return { dryRun, label: 'all services', names: SERVICE_REGISTRY.getLaunchProfile('all') };
  }

  if (groupArg) {
    const group = groupArg.split('=')[1];
    return {
      dryRun,
      label: `${group} group`,
      names: SERVICE_REGISTRY.getServicesByGroup(group).map(service => service.pm2),
    };
  }

  const profile = profileArg ? profileArg.split('=')[1] : defaultProfile;
  return { dryRun, label: `${profile} profile`, names: SERVICE_REGISTRY.getLaunchProfile(profile) };
}

function printPm2Plan(action, names) {
  if (action === 'start') {
    console.log(col(C.gray, `  npx pm2 start ecosystem.config.js --only ${names.join(',')}`));
  } else {
    console.log(col(C.gray, `  npx pm2 ${action} ${names.join(' ')}`));
  }
}

// ── Division colour map ───────────────────────────────────────────────────────
const DIV_COLOUR = {
  ENGINEERING   : C.cyan,
  SECURITY      : C.red,
  INTELLIGENCE  : C.blue,
  OPERATIONS    : C.yellow,
  MANAGEMENT    : C.magenta,
  MEDIA_OPS     : C.green,
  SCIENCE       : C.white,
  CREATIVE      : C.magenta,
  INFRASTRUCTURE: C.gray,
};

// ── Print helpers ─────────────────────────────────────────────────────────────
function banner() {
  console.log(col(C.magenta + C.bold,
    '\n  ██████╗ ██╗   ██╗██████╗ ██████╗  ██████╗██╗      █████╗ ██╗    ██╗\n' +
    '  ██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██║     ██╔══██╗██║    ██║\n' +
    '  ██████╔╝██║   ██║██████╔╝██████╔╝██║     ██║     ███████║██║ █╗ ██║\n' +
    '  ██╔═══╝ ██║   ██║██╔══██╗██╔═══╝ ██║     ██║     ██╔══██║██║███╗██║\n' +
    '  ██║     ╚██████╔╝██║  ██║██║     ╚██████╗███████╗██║  ██║╚███╔███╔╝\n' +
    '  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝      ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ '
  ));
  const now = new Date();
  const ts  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}  ${now.toLocaleTimeString('en-GB')}`;
  console.log(
    `\n  ${col(C.gray, 'Agent Orchestration Runtime')}  ` +
    `${col(C.gray, '·')}  ` +
    `${col(C.magenta, 'v1')}  ` +
    `${col(C.gray, '·')}  ` +
    `${col(C.gray, ts)}\n`
  );
}

function sectionHead(title) {
  const line = '─'.repeat(60);
  console.log(`\n${col(C.cyan + C.bold, title)}`);
  console.log(col(C.gray, line));
}

function tick(ok) { return ok ? col(C.green, '●') : col(C.red, '○'); }

// ═════════════════════════════════════════════════════════════════════════════
//  COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

// ── Boot helpers ──────────────────────────────────────────────────────────────
const BOOT_SPIN    = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const BOOT_TIMEOUT = 40000;

const BOOT_NAMES = {
  eventbus: 'eventbus', state: 'state-store', api: 'unified-api',
  tower: 'agent-tower', orchestrator: 'orchestrator', gatekeeper: 'gatekeeper',
  metrics: 'metrics', pool: 'knowledge-pool', nextjs: 'mission-ctrl',
  voice: 'voice-coord', bridge: 'voice-bridge', chorus: 'chorus',
  vision: 'vision-mon', yolo: 'yolo', memory: 'memory-matrix',
  'bridge-ns': 'neuro-symbolic', modal: 'modal-logic',
  diagnostics: 'diagnostics', rules: 'rules-engine', avatar: 'avatar-bridge',
};

function bootDisplayName(pm2name) {
  const key = pm2name.replace('purpclaw-', '');
  return BOOT_NAMES[key] || key;
}

function renderBootRow(row, spinIdx) {
  const name    = row.display.padEnd(14);
  const portStr = row.port ? `:${row.port}`.padEnd(6) : '      ';
  if (row.state === 'online') {
    const timing = row.ms > 0 ? col(C.gray, `${row.ms}ms`) : '';
    return `  ${col(C.green, '✔')}  ${col(C.white, name)}  ${col(C.gray, portStr)}   ${col(C.green, 'online')}   ${timing}`;
  }
  if (row.state === 'timeout') {
    return `  ${col(C.red,  '✖')}  ${col(C.red,   name)}  ${col(C.gray, portStr)}   ${col(C.red,   'timeout')}`;
  }
  const elapsed   = Date.now() - row.startedAt;
  const stateMsg  = elapsed > 10000 ? col(C.yellow, 'slow start') : col(C.gray, 'initialising');
  const frame     = col(C.cyan, BOOT_SPIN[spinIdx % BOOT_SPIN.length]);
  return `  ${frame}  ${col(C.gray, name)}  ${col(C.gray, portStr)}   ${stateMsg}`;
}

// ── start ─────────────────────────────────────────────────────────────────────
async function cmdStart(args) {
  banner();
  const target = resolveLaunchTarget(args);
  const names  = target.names;

  if (!fs.existsSync(ECOSYSTEM)) {
    console.error(col(C.red, `  ✗ ecosystem.config.js not found`));
    process.exit(1);
  }
  if (!names.length) {
    console.error(col(C.red, `  ✗ No services in profile "${target.label}"`));
    process.exit(1);
  }

  if (target.dryRun) {
    console.log(col(C.yellow, '  DRY RUN — no processes will start\n'));
    printPm2Plan('start', names);
    console.log('');
    return;
  }

  // Header
  const profileLabel = target.label.toUpperCase();
  console.log(
    `  ${col(C.magenta + C.bold, 'LAUNCHING')}  ${col(C.gray, '·')}  ` +
    `${col(C.white + C.bold, profileLabel)}  ${col(C.gray, '·')}  ` +
    `${col(C.cyan, names.length + ' services')}\n`
  );
  console.log(col(C.gray, '  ' + '─'.repeat(60)) + '\n');

  // Fire PM2 silently (use basename — cwd is PURP_DIR, avoids path-with-spaces issues on Windows)
  try {
    await pm2(['start', 'ecosystem.config.js', '--only', names.join(',')], { silent: true });
  } catch (e) {
    console.error(col(C.red, `  ✗ PM2 failed: ${e.message}`));
    console.log(col(C.gray, '  Check: npm install -g pm2'));
    process.exit(1);
  }

  // Build service rows with registry metadata
  const svcMap   = new Map(SERVICE_REGISTRY.getServices().map(s => [s.pm2, s]));
  const launchAt = Date.now();
  const rows     = names.map(pm2name => {
    const reg = svcMap.get(pm2name) || {};
    return {
      pm2: pm2name, display: bootDisplayName(pm2name),
      port: reg.healthPort || reg.port || null,
      healthPath: reg.healthPath || '/health',
      required: reg.required !== false,
      state: 'waiting', ms: 0, startedAt: launchAt,
    };
  });

  // Render initial table
  let spinIdx = 0;
  rows.forEach(r => process.stdout.write(renderBootRow(r, spinIdx) + '\n'));

  // Poll each service in parallel
  const pollers = rows.map(async row => {
    if (!row.port) { row.state = 'online'; row.ms = 0; return; }
    const deadline = launchAt + BOOT_TIMEOUT;
    while (Date.now() < deadline) {
      if (await ping(row.port, row.healthPath)) {
        row.state = 'online';
        row.ms = Date.now() - launchAt;
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    row.state = 'timeout';
  });

  // Animate at 100ms — rewrite the table in place
  const refresher = setInterval(() => {
    spinIdx++;
    if (!isTTY) return;
    process.stdout.write(`\x1b[${rows.length}A`);
    rows.forEach(r => process.stdout.write(`\x1b[2K${renderBootRow(r, spinIdx)}\n`));
  }, 100);

  await Promise.all(pollers);
  clearInterval(refresher);

  // Final paint
  spinIdx++;
  if (isTTY) {
    process.stdout.write(`\x1b[${rows.length}A`);
    rows.forEach(r => process.stdout.write(`\x1b[2K${renderBootRow(r, spinIdx)}\n`));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const online     = rows.filter(r => r.state === 'online');
  const failed     = rows.filter(r => r.state !== 'online');
  const coreFailed = failed.filter(r => r.required);
  const totalSec   = ((Date.now() - launchAt) / 1000).toFixed(1);

  console.log('');
  if (coreFailed.length === 0) {
    console.log(
      `  ${col(C.green + C.bold, '✔  PURPCLAW ONLINE')}  ` +
      `${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length + ' services')}  ` +
      `${col(C.gray, '·')}  ${col(C.gray, totalSec + 's')}`
    );
  } else {
    console.log(
      `  ${col(C.yellow + C.bold, '⚠  PARTIAL START')}  ` +
      `${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length)}  ` +
      `${col(C.red, coreFailed.length + ' required service(s) failed')}`
    );
  }
  console.log('');

  if (online.some(r => r.pm2 === 'purpclaw-nextjs')) {
    console.log(`  ${col(C.gray, 'Mission Control')}  ${col(C.gray, '→')}  ${col(C.cyan + C.bold, 'http://localhost:3000')}`);
  }
  console.log(`  ${col(C.gray, 'API Gateway    ')}  ${col(C.gray, '→')}  ${col(C.cyan, 'http://localhost:7780')}`);
  console.log(`  ${col(C.gray, 'Agent Tower    ')}  ${col(C.gray, '→')}  ${col(C.cyan, 'http://localhost:7790')}`);
  console.log('');

  if (coreFailed.length > 0) {
    console.log(col(C.yellow, '  Failed: ' + coreFailed.map(r => r.display).join(', ')));
    console.log(col(C.gray,   '  Run `purpclaw doctor` to diagnose.\n'));
  } else {
    console.log(col(C.gray, '  purpclaw status        →  live metrics + agent leaderboard'));
    console.log(col(C.gray, '  purpclaw run "<task>"  →  dispatch an agent task\n'));
  }
}

// ── stop ──────────────────────────────────────────────────────────────────────
async function cmdStop(args) {
  const target = resolveLaunchTarget(args);
  const names  = target.names;

  if (!names.length) {
    console.error(col(C.red, `\n  ✗ No services in profile "${target.label}"\n`));
    process.exit(1);
  }

  if (target.dryRun) {
    console.log(col(C.yellow, '  DRY RUN — no processes will stop\n'));
    printPm2Plan('stop', names);
    console.log('');
    return;
  }

  console.log(`\n  ${col(C.yellow + C.bold, 'SHUTTING DOWN')}  ${col(C.gray, '·')}  ${col(C.white, target.label.toUpperCase())}  ${col(C.gray, '·')}  ${col(C.cyan, names.length + ' services')}\n`);
  console.log(col(C.gray, '  ' + '─'.repeat(60)) + '\n');

  // Show what's being stopped
  const svcMap = new Map(SERVICE_REGISTRY.getServices().map(s => [s.pm2, s]));
  names.forEach(n => {
    const disp = bootDisplayName(n).padEnd(14);
    const reg  = svcMap.get(n) || {};
    const port = reg.port ? col(C.gray, `:${reg.port}`) : '';
    console.log(`  ${col(C.yellow, '○')}  ${col(C.gray, disp)}  ${port}`);
  });

  const spin = spinner('stopping services').start();
  try {
    await pm2(['stop', ...names], { silent: true });
    spin.succeed(`${names.length} service${names.length === 1 ? '' : 's'} stopped`);
    console.log('');
    console.log(col(C.gray, '  Run `purpclaw start` to bring the harness back online.\n'));
  } catch (e) {
    spin.fail(e.message);
    process.exit(1);
  }
}

// ── restart ───────────────────────────────────────────────────────────────────
async function cmdRestart(args) {
  const service = args.find(a => !a.startsWith('--'));
  if (service) {
    console.log(col(C.cyan, `\n  Restarting ${service}...\n`));
    try {
      await pm2(['restart', service]);
      console.log(col(C.green, '  ✓ Done.\n'));
    } catch (e) {
      console.error(col(C.red, `  ✗ ${e.message}`));
      process.exit(1);
    }
    return;
  }

  const target = resolveLaunchTarget(args);
  const names = target.names;

  if (!names.length) {
    console.error(col(C.red, `\n  ✗ No PM2 services found for ${target.label}\n`));
    process.exit(1);
  }

  console.log(col(C.cyan, `\n  Restarting PURPCLAW ${target.label}...\n`));

  if (target.dryRun) {
    console.log(col(C.yellow, '  Dry run only. No processes will be restarted.\n'));
    printPm2Plan('restart', names);
    console.log('');
    return;
  }

  try {
    await pm2(['restart', ...names]);
    console.log(col(C.green, `  ✓ Restarted ${names.length} service${names.length === 1 ? '' : 's'}.\n`));
  } catch (e) {
    console.error(col(C.red, `  ✗ ${e.message}`));
    process.exit(1);
  }
}

// ── status ────────────────────────────────────────────────────────────────────
async function cmdStatus() {
  banner();

  // Probe all service health endpoints in parallel
  const checks = await Promise.allSettled([
    ping(PORTS.orchestrator, '/health').then(ok => ({ name: 'orchestrator', port: PORTS.orchestrator, ok })),
    ping(PORTS.api,          '/health').then(ok => ({ name: 'api',          port: PORTS.api,          ok })),
    ping(PORTS.tower,        '/health').then(ok => ({ name: 'tower',        port: PORTS.tower,        ok })),
    ping(PORTS.eventbus,     '/health').then(ok => ({ name: 'eventbus',     port: PORTS.eventbus,     ok })),
    ping(PORTS.state,        '/health').then(ok => ({ name: 'state',        port: PORTS.state,        ok })),
    ping(PORTS.memory,       '/health').then(ok => ({ name: 'memory',       port: PORTS.memory,       ok })),
    ping(PORTS.metrics,      '/health').then(ok => ({ name: 'metrics',      port: PORTS.metrics,      ok })),
    ping(PORTS.voice,        '/health').then(ok => ({ name: 'voice',        port: PORTS.voice,        ok })),
  ]);

  sectionHead('  SERVICE HEALTH');
  for (const r of checks) {
    const svc = r.status === 'fulfilled' ? r.value : { name: '?', port: 0, ok: false };
    const portStr = col(C.gray, `:${svc.port}`);
    const label   = svc.ok
      ? col(C.green, `${svc.name}`)
      : col(C.red,   `${svc.name}`);
    console.log(`  ${tick(svc.ok)}  ${label.padEnd(30)}${portStr}`);
  }

  // Orchestrator metrics
  try {
    const metrics = await httpGet(PORTS.orchestrator, '/api/status', 3000);
    sectionHead('  ORCHESTRATOR METRICS');
    console.log(`  Total tasks    : ${col(C.cyan,   String(metrics.session?.totalTasks     ?? metrics.totalTasks     ?? '—'))}`);
    console.log(`  Completed      : ${col(C.green,  String(metrics.session?.completedTasks ?? metrics.completedTasks ?? '—'))}`);
    console.log(`  Failed         : ${col(C.red,    String(metrics.session?.failedTasks    ?? metrics.failedTasks    ?? '—'))}`);
    console.log(`  Avg resp time  : ${col(C.yellow, String(metrics.metrics?.avgResponseTime ?? metrics.avgResponseTime ?? '—'))}ms`);
    console.log(`  Active wf      : ${col(C.cyan,   String(metrics.active ?? metrics.activeWorkflows ?? '—'))}`);
    console.log(`  Queue depth    : ${col(C.yellow, String(metrics.queue  ?? metrics.queueDepth      ?? '—'))}`);
    if (metrics.uptime !== undefined) {
      const up = Math.round(metrics.uptime);
      console.log(`  Uptime         : ${col(C.gray, `${Math.floor(up/3600)}h ${Math.floor((up%3600)/60)}m`)}`);
    }
  } catch {
    sectionHead('  ORCHESTRATOR METRICS');
    console.log(col(C.gray, '  (orchestrator offline or unreachable)'));
  }

  // Active workflows
  try {
    const workflows = await httpGet(PORTS.orchestrator, '/api/workflows', 3000);
    if (Array.isArray(workflows) && workflows.length > 0) {
      sectionHead('  ACTIVE WORKFLOWS');
      for (const wf of workflows.slice(0, 8)) {
        const statusColour = wf.status === 'running' ? C.cyan : wf.status === 'completed' ? C.green : C.yellow;
        console.log(`  ${col(statusColour, '▶')}  ${col(C.bold, wf.workflowId || wf.id || '—')} ${col(C.gray, '—')} ${wf.command?.substring(0, 55) ?? '—'}`);
      }
    }
  } catch { /* silent */ }

  // Agent leaderboard (top performers from agent_score.json)
  try {
    if (fs.existsSync(AGENT_SCORE)) {
      const scoreData = JSON.parse(fs.readFileSync(AGENT_SCORE, 'utf8'));
      const ranked = Object.entries(scoreData)
        .filter(([, s]) => (s.totalTasks || 0) >= 1)
        .sort(([, a], [, b]) => (b.successRate || 0) - (a.successRate || 0))
        .slice(0, 6);
      if (ranked.length > 0) {
        sectionHead('  AGENT LEADERBOARD');
        for (const [name, s] of ranked) {
          const rate  = (s.successRate ?? 0).toFixed(0);
          const bar   = '█'.repeat(Math.round((s.successRate ?? 0) / 10)).padEnd(10, '░');
          const tasks = col(C.gray, `${s.totalTasks ?? 0} tasks`);
          const rateCol = (s.successRate ?? 0) >= 80 ? C.green : (s.successRate ?? 0) >= 50 ? C.yellow : C.red;
          console.log(`  ${col(rateCol, bar)}  ${col(C.white, name.padEnd(12))} ${col(rateCol, rate + '%')}  ${tasks}`);
        }
      }
    }
  } catch { /* no score data yet */ }

  // Tower status (circuit breakers + active agents)
  try {
    const tower = await httpGet(PORTS.tower, '/api/status', 2000);
    sectionHead('  AGENT TOWER');
    if (tower.activeAgents !== undefined)
      console.log(`  Active agents  : ${col(C.cyan, String(tower.activeAgents))}`);
    if (tower.throttled !== undefined)
      console.log(`  Throttled      : ${tower.throttled ? col(C.yellow, 'yes') : col(C.green, 'no')}`);
    if (tower.circuitBreakers) {
      const open = Object.entries(tower.circuitBreakers || {}).filter(([, s]) => s === 'open');
      if (open.length > 0) {
        console.log(`  ${col(C.yellow, '⚡ Circuit breakers open:')} ${open.map(([n]) => n).join(', ')}`);
      } else {
        console.log(`  Circuit breakers: ${col(C.green, 'all closed')}`);
      }
    }
  } catch { /* tower offline */ }

  // Memory matrix
  try {
    const mem = await httpGet(PORTS.memory, '/health', 2000);
    sectionHead('  MEMORY MATRIX');
    console.log(`  ${tick(true)}  ${col(C.green, 'memory_matrix_v2')} ${col(C.gray, ':' + PORTS.memory + ' — online')}`);
    if (mem.memories !== undefined) console.log(`  Stored memories : ${col(C.cyan, String(mem.memories))}`);
    if (mem.symbols  !== undefined) console.log(`  Lifted symbols  : ${col(C.cyan, String(mem.symbols))}`);
  } catch {
    sectionHead('  MEMORY MATRIX');
    console.log(`  ${tick(false)}  ${col(C.red, 'memory_matrix_v2')} ${col(C.gray, ':' + PORTS.memory + ' — offline')}`);
    console.log(col(C.gray,  '  Run `purpclaw start` to boot all services.'));
  }

  // Cognitive services (optional Python trio)
  const cogPorts = [
    { name: 'modal-logic',   port: 7785 },
    { name: 'diagnostics',   port: 7786 },
    { name: 'rules-engine',  port: 7787 },
    { name: 'neuro-symbolic', port: 7884 },
  ];
  const cogChecks = await Promise.allSettled(
    cogPorts.map(s => ping(s.port).then(ok => ({ ...s, ok })))
  );
  const cogOnline = cogChecks.filter(r => r.value?.ok);
  if (cogOnline.length > 0) {
    sectionHead('  COGNITIVE SERVICES');
    for (const r of cogChecks) {
      const s = r.value || { name: '?', ok: false };
      if (s.ok) console.log(`  ${tick(true)}  ${col(C.green, s.name.padEnd(18))} ${col(C.gray, ':' + s.port)}`);
    }
    const offline = cogChecks.filter(r => !r.value?.ok);
    if (offline.length) {
      for (const r of offline) {
        const s = r.value || { name: '?', ok: false };
        console.log(`  ${tick(false)}  ${col(C.gray, s.name.padEnd(18))} ${col(C.gray, ':' + s.port + ' offline')}`);
      }
    }
  }

  console.log('');

  // ── Knowledge Pool ───────────────────────────────────────────────────────────
  try {
    const poolRes = await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: PORTS.memory, path: '/pool/stats', method: 'GET' },
        res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); }
      );
      req.setTimeout(2000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });
    if (poolRes) {
      sectionHead('  KNOWLEDGE POOL');
      const sc  = poolRes.skillsCount ?? 0;
      const ac  = poolRes.agentsCount ?? 0;
      const qc  = poolRes.queries ?? 0;
      const ia  = (poolRes.indexedAt || '').replace('T', ' ').slice(0, 19);
      const ups = poolRes.uptimeSec ? `${Math.round(poolRes.uptimeSec)}s` : '?';
      console.log(`  Skills indexed   : ${col(C.green, String(sc))}`);
      console.log(`  Agents indexed   : ${col(C.green, String(ac))}`);
      console.log(`  Queries served   : ${col(C.gray, String(qc))}`);
      console.log(`  Uptime           : ${col(C.gray, ups)}`);
      if (ia) console.log(`  Last indexed     : ${col(C.gray, ia)}`);
      console.log(`  Pool endpoint    : ${col(C.cyan, 'http://localhost:' + PORTS.memory)}`);
      console.log(`  ${col(C.green, '✔')}  Pool service online`);
    }
  } catch {
    sectionHead('  KNOWLEDGE POOL');
    console.log(`  ${tick(false)}  ${col(C.red, 'pool service offline')}  ${col(C.gray, ':' + PORTS.memory)}`);
    console.log(col(C.gray, '  Boot the pool:  npx pm2 start ecosystem.config.js --only purpclaw-pool'));
  }

  // ── Queue snapshot ─────────────────────────────────────────────────────────
  try {
    const orch = await httpGet(PORTS.orchestrator, '/api/status', 2000);
    const pending = (orch.pending ?? []).length || 0;
    const running = (orch.active  ?? 0);
    const total   = (orch.total   ?? 0);
    if (pending > 0) {
      sectionHead('  APPROVAL QUEUE');
      console.log(`  ${col(C.yellow, pending + ' job(s) waiting for approval')}`);
      console.log(col(C.gray, `    Run: purpclaw jobs pending`));
    }
  } catch { /* silent */ }

  console.log('');
}



// ── resume ─────────────────────────────────────────────────────────────────────
// Resume a previous session from agent_work/sessions/
async function cmdResume(args) {
  const SESSIONS_DIR = path.join(PURP_DIR, 'agent_work', 'sessions');
  const sub = (args[0] || '').toLowerCase();

  // ── resume list ──────────────────────────────────────────────────────────
  if (sub === 'list' || sub === 'ls') {
    banner();
    sectionHead('  SESSION RESUME');
    if (!fs.existsSync(SESSIONS_DIR)) {
      console.log(col(C.gray, '  No sessions yet. Run a task first with purpclaw run "..."\n'));
      return;
    }
    const sessions = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const fp = path.join(SESSIONS_DIR, f);
        const stat = fs.statSync(fp);
        const id = f.replace('.jsonl', '');
        // Read last line for result summary
        let lastLine = '';
        try {
          const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
          if (lines.length > 0) lastLine = JSON.parse(lines[lines.length - 1]).result || '';
        } catch {}
        return { id, file: f, mtime: stat.mtime, size: stat.size, lastLine };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (sessions.length === 0) {
      console.log(col(C.gray, '  No sessions found.\n'));
      return;
    }

    for (const s of sessions.slice(0, 10)) {
      const ts  = new Date(s.mtime).toISOString().replace('T', ' ').slice(0, 16);
      const sz  = s.size > 1024 ? (s.size/1024).toFixed(0) + 'K' : s.size + 'b';
      const ln  = (s.lastLine || '—').slice(0, 60);
      console.log(`  ${col(C.cyan, s.id.padEnd(16))} ${col(C.gray, ts)}  ${col(C.white, ln)}`);
    }
    console.log(col(C.gray, `\n  ${sessions.length} session(s) stored.\n`));
    console.log(col(C.gray, '  purpclaw resume <session-id>  — reload a session'));
    console.log(col(C.gray, '  purpclaw resume latest        — reload most recent\n'));
    return;
  }

  // ── resume <id> or latest ────────────────────────────────────────────────
  const targetId = args[0] || 'latest';
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log(col(C.red, '  No sessions directory found. Run purpclaw run first.\n'));
    return;
  }

  let sessionFile = null;
  if (targetId === 'latest') {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl')).sort();
    if (files.length === 0) {
      console.log(col(C.red, '  No sessions found.\n'));
      return;
    }
    sessionFile = path.join(SESSIONS_DIR, files[files.length - 1]);
    targetId = files[files.length - 1].replace('.jsonl', '');
  } else {
    sessionFile = path.join(SESSIONS_DIR, targetId + '.jsonl');
    if (!fs.existsSync(sessionFile)) {
      console.log(col(C.red, `  Session '${targetId}' not found.`));
      console.log(col(C.gray, '  Run: purpclaw resume list\n'));
      return;
    }
  }

  // Load session messages
  const lines = fs.readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean);
  const messages = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  sectionHead('  SESSION RESUME — ' + targetId);
  console.log(col(C.gray, `  ${messages.length} message(s) in this session\n`));
  
  // Show session summary
  const userMsgs = messages.filter(m => m.role === 'user');
  const assistantMsgs = messages.filter(m => m.role === 'assistant');
  console.log(`  ${col(C.white, userMsgs.length)} user messages`);
  console.log(`  ${col(C.cyan, assistantMsgs.length)} assistant messages`);
  console.log(`  ${col(C.gray, 'file: ' + sessionFile)}\n`);

  if (userMsgs.length > 0) {
    console.log(col(C.gray, '  Last user input:'));
    const last = userMsgs[userMsgs.length - 1];
    console.log(col(C.white, '  ' + (last.text || last.content || JSON.stringify(last)).slice(0, 120)));
    console.log('');
  }

  if (assistantMsgs.length > 0) {
    console.log(col(C.gray, '  Last assistant output:'));
    const last = assistantMsgs[assistantMsgs.length - 1];
    console.log(col(C.cyan, '  ' + (last.text || last.content || JSON.stringify(last)).slice(0, 120)));
    console.log('');
  }

  console.log(col(C.gray, '  To continue this session:'));
  console.log(`    ${col(C.cyan, 'purpclaw run --resume ' + targetId + ' "continue from where we left off"')}`);
  console.log(col(C.gray, '\n  Or: purpclaw pool show <skill> to find what was being used\n'));
}
// ── bg ─────────────────────────────────────────────────────────────────────────
// Fire-and-forget background task dispatch
async function cmdBg(args) {
  const task = args.join(' ').trim();
  if (!task) {
    banner();
    sectionHead('  BACKGROUND TASKS');
    console.log(col(C.gray, '  purpclaw bg "<task>"  — dispatch and forget\n'));
    console.log(col(C.gray, '  Background tasks run detached, results go to agent_work/\n'));
    // List any running background jobs
    const BGSESSIONS = path.join(PURP_DIR, 'agent_work', 'bg-sessions');
    if (fs.existsSync(BGSESSIONS)) {
      const jobs = fs.readdirSync(BGSESSIONS).filter(f => f.endsWith('.json'));
      if (jobs.length > 0) {
        console.log(col(C.gray, `  ${jobs.length} background job(s) tracked:`));
        for (const j of jobs.slice(0, 10)) {
          const d = JSON.parse(fs.readFileSync(path.join(BGSESSIONS, j), 'utf8'));
          const status = d.done ? col(C.green, 'done') : d.running ? col(C.cyan, 'running') : col(C.gray, 'pending');
          console.log(`    ${col(C.yellow, j.replace('.json',''))}  ${status}  ${col(C.gray, (d.task||'').slice(0,50))}`);
        }
      } else {
        console.log(col(C.gray, '  No background jobs tracked yet.\n'));
      }
    }
    console.log(col(C.gray, '  purpclaw bg "<build me a landing page>"  — fires and returns immediately'));
    console.log('');
    return;
  }

  // Dispatch background task: write session file + spawn detached
  const BG_DIR = path.join(PURP_DIR, 'agent_work', 'bg-sessions');
  if (!fs.existsSync(BG_DIR)) fs.mkdirSync(BG_DIR, { recursive: true });
  
  const jobId = 'bg-' + Date.now();
  const sessionFile = path.join(BG_DIR, jobId + '.json');
  const meta = {
    id: jobId, task, status: 'dispatched',
    dispatchedAt: new Date().toISOString(), done: false, running: false
  };
  fs.writeFileSync(sessionFile, JSON.stringify(meta, null, 2));

  // Spawn detached: node bin/purpclaw.js run "<task>" 2>&1 >> agent_work/bg-sessions/<jobId>.log
  const LOG_FILE = path.join(BG_DIR, jobId + '.log');
  const spawnCmd = `node "${path.join(PURP_DIR, 'bin', 'purpclaw.js')}" run "${task.replace(/"/g, '\"')}" >> "${LOG_FILE}" 2>&1 &`;
  
  try {
    require('child_process').exec(spawnCmd);
  } catch(e) { /* fire and forget */ }

  banner();
  sectionHead('  BACKGROUND DISPATCHED');
  console.log(`  ${col(C.green, '✔')}  Job ID : ${col(C.cyan, jobId)}`);
  console.log(`  ${col(C.green, '✔')}  Log   : ${col(C.gray, LOG_FILE)}`);
  console.log(`  ${col(C.green, '✔')}  Task  : ${col(C.white, task)}`);
  console.log(col(C.gray, '\n  Results appear in agent_work/bg-sessions/'));
  console.log(col(C.gray, `  Watch:  tail -f "${LOG_FILE}"`));
  console.log(col(C.gray, `  Status: purpclaw bg`));
  console.log('');
}
// ── registry ───────────────────────────────────────────────────────────────────
// Local git-backed registry of installable skills and agents
// registry/ index.json is the source of truth — publish = open a PR on it
async function cmdRegistry(args) {
  const REGISTRY_DIR = path.join(PURP_DIR, 'registry');
  const LOCAL_SKILLS = path.join(PURP_DIR, 'skills');
  const LOCAL_AGENTS = path.join(PURP_DIR, 'agents');
  const INDEX_FILE   = path.join(REGISTRY_DIR, 'index.json');

  const sub   = (args[0] || '').toLowerCase();
  const name  = (args[1] || '').trim();
  const rest  = args.slice(1).join(' ').trim();

  // ── registry browse ─────────────────────────────────────────────────────────
  if (sub === 'browse' || sub === 'ls' || (!sub)) {
    sectionHead('  SKILL REGISTRY · ' + (sub ? sub.toUpperCase() : 'ALL'));
    if (!fs.existsSync(INDEX_FILE)) {
      console.log(col(C.red, '  Registry not found. Run: purpclaw registry update'));
      return;
    }
    const reg = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    
    // Show skills
    sectionHead('  SKILLS (' + reg.skills.length + ')');
    for (const s of reg.skills.slice(0, 20)) {
      const installed = fs.existsSync(path.join(LOCAL_SKILLS, s.name, 'SKILL.md'));
      const tick  = installed ? col(C.green, '✔') : col(C.gray, '○');
      const size  = col(C.gray, s.size_kb + 'K');
      const orig  = s.origin ? col(C.gray, '[' + s.origin + ']') : '';
      console.log(`  ${tick}  ${col(C.cyan, s.name.padEnd(32))}  ${col(C.gray, s.description.slice(0, 50))} ${size} ${orig}`);
    }
    if (reg.skills.length > 20) console.log(col(C.gray, `  ... and ${reg.skills.length - 20} more. Full list in registry/index.json`));
    
    // Show agents
    sectionHead('  AGENTS (' + reg.agents.length + ')');
    for (const a of reg.agents) {
      const installed = fs.existsSync(path.join(LOCAL_AGENTS, a.name + '.md'));
      const tick  = installed ? col(C.green, '✔') : col(C.gray, '○');
      console.log(`  ${tick}  ${col(C.yellow, a.name.padEnd(24))}  ${col(C.gray, a.description.slice(0, 50))}`);
    }
    console.log(col(C.gray, '\n  purpclaw registry install <name>   — install from registry'));
    console.log(col(C.gray, '  purpclaw registry publish <name>    — publish to registry (opens guide)'));
    console.log(col(C.gray, '  purpclaw registry search "<text>" — keyword search'));
    console.log(col(C.gray, '  purpclaw registry update          — rebuild local index'));
    console.log('');
    return;
  }

  // ── registry search "<intent>" ─────────────────────────────────────────────
  if (sub === 'search' && rest) {
    sectionHead('  REGISTRY SEARCH · "' + rest + '"');
    if (!fs.existsSync(INDEX_FILE)) { console.log(col(C.red, '  Run: purpclaw registry update')); return; }
    const reg = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const qTokens = new Set(rest.toLowerCase().split(/\s+/).filter(Boolean));
    
    function score(item) {
      const text = ((item.description || '') + ' ' + (item.name || '')).toLowerCase();
      let s = 0;
      for (const t of qTokens) { if (text.includes(t)) s++; }
      return s;
    }
    
    const scored = [...reg.skills, ...reg.agents].map(i => ({ ...i, _score: score(i) })).filter(i => i._score > 0).sort((a, b) => b._score - a._score);
    
    if (scored.length === 0) { console.log(col(C.gray, '  Nothing matched. Try different keywords.\n')); return; }
    
    for (const s of scored.slice(0, 15)) {
      const type = s.file.startsWith('skills/') ? col(C.cyan, 'skill') : col(C.yellow, 'agent ');
      console.log(`  [${type}]  ${col(C.white, s.name.padEnd(28))}  ${col(C.gray, s.description.slice(0, 50))}  score: ${s._score}`);
    }
    console.log(col(C.gray, `\n  ${scored.length} result(s)\n`));
    return;
  }

  // ── registry install <name> ─────────────────────────────────────────────────
  if (sub === 'install' && name) {
    sectionHead('  INSTALLING · ' + name);
    if (!fs.existsSync(INDEX_FILE)) { console.log(col(C.red, '  Run: purpclaw registry update first.\n')); return; }
    const reg = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    
    // Find in registry
    const entry = [...reg.skills, ...reg.agents].find(i => i.name === name);
    if (!entry) {
      console.log(col(C.red, `  '${name}' not found in registry.`));
      console.log(col(C.gray, '  Run: purpclaw registry browse'));
      return;
    }
    
    const srcDir  = path.join(PURP_DIR, entry.file).replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const srcFile = path.join(PURP_DIR, entry.file);
    
    if (entry.file.startsWith('skills/')) {
      const destDir = path.join(LOCAL_SKILLS, name);
      if (fs.existsSync(destDir)) {
        console.log(col(C.yellow, `  ${name} is already installed.\n`));
        return;
      }
      fs.mkdirSync(destDir, { recursive: true });
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(destDir, 'SKILL.md'));
        console.log(col(C.green, '  ✔') + `  Installed skill: ${name}`);
        console.log(col(C.gray, `  Copy: ${srcFile}`));
        console.log(col(C.gray, '  Pool will index it on next boot. Run: purpclaw pool reindex'));
      }
    } else {
      const destFile = path.join(LOCAL_AGENTS, name + '.md');
      if (fs.existsSync(destFile)) {
        console.log(col(C.yellow, `  ${name} is already installed.\n`));
        return;
      }
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
        console.log(col(C.green, '  ✔') + `  Installed agent: ${name}`);
        console.log(col(C.gray, `  Copy: ${srcFile}`));
      }
    }
    console.log('');
    return;
  }

  // ── registry publish <name> ─────────────────────────────────────────────────
  if (sub === 'publish' && name) {
    sectionHead('  PUBLISH GUIDE · ' + name);
    console.log(col(C.cyan, '  To publish a skill or agent to the registry:'));
    console.log('');
    console.log(col(C.white, '  1. Create: registry/' + name + '/SKILL.md'));
    console.log(col(C.white, '     (or: agents/' + name + '.md for an agent)'));
    console.log('');
    console.log(col(C.gray, '  2. Add frontmatter:'));
    console.log(col(C.gray, '     ---'));
    console.log(col(C.gray, '     name: <name>'));
    console.log(col(C.gray, '     description: <what this does>'));
    console.log(col(C.gray, '     trigger: <when to activate>'));
    console.log(col(C.gray, '     origin: community'));
    console.log(col(C.gray, '     ---'));
    console.log('');
    console.log(col(C.gray, '  3. Update registry/index.json (add to skills[] or agents[])'));
    console.log('');
    console.log(col(C.gray, '  4. Open a PR:'));
    console.log(col(C.white, '     git checkout -b add-skill-' + name));
    console.log(col(C.white, '     git add registry/ skills/ agents/'));
    console.log(col(C.white, '     git commit -m "feat: add ' + name + ' skill"'));
    console.log(col(C.white, '     git push origin head -u'));
    console.log('');
    console.log(col(C.cyan, '  Registry is git-backed. If you have push access, commit directly.'));
    console.log(col(C.gray, '  purpclaw registry install ' + name + '  — install locally after PR merges'));
    console.log('');
    return;
  }

  // ── registry update ─────────────────────────────────────────────────────────
  if (sub === 'update') {
    sectionHead('  REGISTRY UPDATE');
    const spin = spinner('rebuilding registry index').start();
    try {
      const { execSync } = require('child_process');
      execSync('node -e "require(\'./scripts/registry-indexer.js\')"', { cwd: PURP_DIR, stdio: 'ignore' });
      spin.succeed('registry index updated');
    } catch {
      // Fallback: rebuild inline
      const skills = [];
      const agents = [];
      
      for (const n of fs.readdirSync(path.join(PURP_DIR, 'skills')).filter(d => fs.existsSync(path.join(PURP_DIR, 'skills', d, 'SKILL.md')))) {
        skills.push({ name: n, file: 'skills/' + n + '/SKILL.md' });
      }
      for (const f of fs.readdirSync(path.join(PURP_DIR, 'agents')).filter(f => f.endsWith('.md'))) {
        const name = f.replace('.md', '');
        const content = fs.readFileSync(path.join(PURP_DIR, 'agents', f), 'utf8');
        agents.push({ name, file: 'agents/' + f, description: (content.split('\n')[0] || '').trim() });
      }
      
      const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      idx.skills = skills;
      idx.agents = agents;
      idx.updated = new Date().toISOString();
      idx.total_skills = skills.length;
      idx.total_agents = agents.length;
      fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2));
      spin.succeed(`${skills.length} skills · ${agents.length} agents`);
    }
    console.log('');
    console.log(col(C.gray, '  Browse: purpclaw registry browse'));
    console.log('');
    return;
  }

  // Default: help
  sectionHead('  REGISTRY HELP');
  console.log(col(C.gray, '  Local git-backed registry of installable skills and agents.\n'));
  console.log(`  ${col(C.cyan, 'purpclaw registry browse')}            list all skills and agents`);
  console.log(`  ${col(C.cyan, 'purpclaw registry search "<text>"')}   find by keyword`);
  console.log(`  ${col(C.cyan, 'purpclaw registry install <name>')}   install locally`);
  console.log(`  ${col(C.cyan, 'purpclaw registry publish <name>')}   publishing guide`);
  console.log(`  ${col(C.cyan, 'purpclaw registry update')}            rebuild local index`);
  console.log('');
}

// ── run ───────────────────────────────────────────────────────────────────────
async function cmdRun(args) {
  const approvalArg = args.find(a => a.startsWith('--approval='));
  const approvalId = approvalArg ? approvalArg.split('=')[1] : null;
  const task = args.filter(a => !a.startsWith('--approval=')).join(' ').trim();
  if (!task) {
    console.error(col(C.red, '\n  Usage: purpclaw run "<task>"\n'));
    process.exit(1);
  }

  console.log(`\n  ${col(C.cyan + C.bold, '⚡ PURPCLAW RUN')}\n`);
  console.log(`  ${col(C.gray, 'Task:')} ${task}\n`);

  // Subscribe to SSE stream BEFORE sending the task so we catch the first events
  let streamReq;
  const streamId = `cli-${Date.now()}`;
  let resolved = false;

  const ssePromise = new Promise((resolve) => {
    streamReq = subscribeSSE(
      PORTS.orchestrator,
      `/api/stream?streamId=${streamId}`,
      (evt) => {
        if (evt.type === 'connected') return;

        const ts = col(C.gray, new Date().toLocaleTimeString());
        const type = evt.type || evt.event || 'event';

        if (type === 'workflow_complete' || type === 'completed') {
          console.log(`\n  ${col(C.green, '✓ Complete')}  ${col(C.gray, evt.workflowId || '')}`);
          if (evt.result) {
            console.log(`\n${col(C.gray, '  ─── Result ────────────────────────────────────────────')}`);
            const r = typeof evt.result === 'string' ? evt.result : JSON.stringify(evt.result, null, 2);
            console.log(r.split('\n').map(l => `  ${l}`).join('\n'));
          }
          if (!resolved) { resolved = true; resolve(); }
        } else if (type === 'waiting_approval') {
          const approval = evt.workflow?.approval?.id || evt.approvalId || evt.workflow?.result?.approvalId;
          console.log(`\n  ${col(C.yellow, 'Approval required')}  ${col(C.cyan, approval || '')}`);
          console.log(col(C.gray, '  Approve: purpclaw approve <id>'));
          console.log(col(C.gray, '  Rerun:   purpclaw run "<task>" --approval=<id>\n'));
          if (!resolved) { resolved = true; resolve(); }
        } else if (type === 'workflow_failed' || type === 'failed') {
          console.log(`\n  ${col(C.red, '✗ Failed')}  ${col(C.gray, evt.error || '')}`);
          if (!resolved) { resolved = true; resolve(); }
        } else if (type === 'agent_spawned') {
          console.log(`  ${ts}  ${col(C.blue, '⚙ spawn')}   ${col(C.cyan, evt.agent || evt.agentName || '?')} ${col(C.gray, '→')} ${evt.task || evt.intent || ''}`);
        } else if (type === 'agent_complete') {
          console.log(`  ${ts}  ${col(C.green, '✓ done ')}   ${col(C.cyan, evt.agent || evt.agentName || '?')}`);
        } else if (type === 'step' || type === 'workflow_step') {
          const icon = evt.status === 'started' ? col(C.yellow, '▶ step ') : col(C.green, '✓ step ');
          console.log(`  ${ts}  ${icon}   ${evt.description || JSON.stringify(evt).substring(0, 80)}`);
        } else if (type === 'log') {
          console.log(`  ${ts}  ${col(C.gray, '·')}          ${evt.message || ''}`);
        } else {
          // Generic event — show compactly
          const msg = evt.message || evt.description || evt.summary || '';
          if (msg) console.log(`  ${ts}  ${col(C.gray, '·')}          ${msg.substring(0, 100)}`);
        }
      },
      (err) => {
        if (!resolved) { resolved = true; resolve(); }
      }
    );
  });

  // Small delay so the SSE connection is established before we send the task
  await new Promise(r => setTimeout(r, 150));

  // Send the task
  try {
    const resp = await httpPost(PORTS.orchestrator, '/api/orchestrate', {
      command  : task,
      stream   : true,
      streamId : streamId,
      source   : 'cli',
      approvalId,
    });

    if (resp.status >= 400) {
      console.error(col(C.red, `\n  ✗ Orchestrator rejected task: ${JSON.stringify(resp.body)}\n`));
      streamReq && streamReq.destroy();
      process.exit(1);
    }

    const wf = resp.body;
    console.log(`  ${col(C.gray, 'Workflow:')} ${col(C.cyan, wf.workflowId || '—')}\n`);

    // If the orchestrator returns a result synchronously (non-streaming), print it
    if (wf.status === 'completed' || wf.status === 'failed') {
      if (!resolved) { resolved = true; }
      if (wf.workflow?.result) {
        console.log(`\n${col(C.gray, '  ─── Result ────────────────────────────────────────────')}`);
        const r = typeof wf.workflow.result === 'string'
          ? wf.workflow.result
          : JSON.stringify(wf.workflow.result, null, 2);
        console.log(r.split('\n').map(l => `  ${l}`).join('\n'));
      }
      console.log('');
      streamReq && streamReq.destroy();
      return;
    }

    // Wait for SSE completion signal (max 10 mins)
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(col(C.yellow, '\n  ⚠ Timed out waiting for completion signal. Workflow may still be running.'));
        console.log(col(C.gray,   `  Poll: purpclaw workflows\n`));
      }
    }, 600000);

    await ssePromise;
    clearTimeout(timeout);
    streamReq && streamReq.destroy();
    console.log('');

  } catch (e) {
    streamReq && streamReq.destroy();
    if (e.message === 'timeout' || e.code === 'ECONNREFUSED') {
      console.error(col(C.red, '\n  ✗ Orchestrator not reachable. Run `purpclaw start` first.\n'));
    } else {
      console.error(col(C.red, `\n  ✗ ${e.message}\n`));
    }
    process.exit(1);
  }
}

// ── agents ────────────────────────────────────────────────────────────────────
async function cmdAgents() {
  sectionHead('  AGENT ROSTER');

  let scoreData = {};
  try {
    if (fs.existsSync(AGENT_SCORE)) {
      scoreData = JSON.parse(fs.readFileSync(AGENT_SCORE, 'utf8'));
    }
  } catch { /* no scores yet */ }

  // Pull live pool stats from orchestrator if available
  let poolData = null;
  try {
    poolData = await httpGet(PORTS.orchestrator, '/api/agents', 2000);
  } catch { /* offline */ }

  // Pull routing matrix for division info
  let routing = {};
  try {
    routing = require(path.join(PURP_DIR, 'agent_routing_matrix.js')).AGENT_ROUTING;
  } catch { /* no routing */ }

  const agents = Object.keys(routing).length ? Object.keys(routing) : Object.keys(scoreData);

  if (agents.length === 0) {
    console.log(col(C.gray, '  No agent data available. Services may be offline.'));
    return;
  }

  // Group by division
  const byDiv = {};
  for (const name of agents) {
    const info = routing[name] || {};
    const div  = info.division || 'UNKNOWN';
    (byDiv[div] = byDiv[div] || []).push(name);
  }

  for (const [div, names] of Object.entries(byDiv).sort()) {
    const divCol = DIV_COLOUR[div] || C.white;
    console.log(`\n  ${col(divCol + C.bold, div)}`);
    for (const name of names.sort()) {
      const info    = routing[name] || {};
      const score   = scoreData[name];
      const busy    = poolData?.busy?.find(a => a.name === name);
      const statusDot = busy ? col(C.cyan, '◉') : col(C.gray, '○');
      const scoreStr  = score
        ? col(C.gray, ` [${(score.successRate ?? 0).toFixed(0)}% ok, ${score.totalTasks ?? 0} tasks]`)
        : '';
      const roleStr   = info.role ? col(C.gray, ` — ${info.role}`) : '';
      console.log(`    ${statusDot}  ${col(C.white, name.padEnd(12))}${roleStr}${scoreStr}`);
    }
  }

  if (poolData) {
    console.log(`\n  ${col(C.gray, `Pool: ${poolData.pool?.total ?? 0} total, ${poolData.busy?.length ?? 0} busy`)}`);
  }
  console.log('');
}

// ── workflows ─────────────────────────────────────────────────────────────────
async function cmdWorkflows() {
  sectionHead('  WORKFLOWS');
  try {
    const workflows = await httpGet(PORTS.orchestrator, '/api/workflows', 3000);
    if (!Array.isArray(workflows) || workflows.length === 0) {
      console.log(col(C.gray, '  No active workflows.\n'));
    } else {
      for (const wf of workflows) {
        const statusColour = {
          running   : C.cyan,
          completed : C.green,
          failed    : C.red,
          queued    : C.yellow,
        }[wf.status] || C.gray;
        const age = wf.startedAt ? `${Math.round((Date.now() - new Date(wf.startedAt).getTime()) / 1000)}s ago` : '';
        console.log(`  ${col(statusColour, '▶')}  ${col(C.bold, (wf.workflowId || wf.id || '—').padEnd(22))} ${col(statusColour, (wf.status || '—').padEnd(10))} ${col(C.gray, age)}`);
        if (wf.command) console.log(`     ${col(C.gray, wf.command.substring(0, 72))}`);
      }
    }

    // Also show pipeline completed list
    const pipeline = await httpGet(PORTS.orchestrator, '/api/pipeline', 3000);
    if (pipeline.completed?.length) {
      console.log(col(C.gray, `\n  Recent completed: ${pipeline.completed.length}`));
      for (const wf of pipeline.completed.slice(-4)) {
        console.log(`     ${col(C.green, '✓')} ${col(C.gray, (wf.workflowId || wf.id || '—').padEnd(22))} ${wf.command?.substring(0, 50) ?? ''}`);
      }
    }
  } catch {
    console.log(col(C.gray, '  Orchestrator offline. Run `purpclaw start`.\n'));
  }
  console.log('');
}

// ── queue ─────────────────────────────────────────────────────────────────────
async function cmdQueue() {
  sectionHead('  TASK QUEUE');
  try {
    const q = await httpGet(PORTS.orchestrator, '/api/queue', 3000);
    console.log(`  Depth: ${col(C.cyan, String(q.depth ?? 0))}\n`);
    if (q.items?.length) {
      for (const item of q.items) {
        console.log(`  ${col(C.yellow, '⏳')}  P${item.priority ?? '?'}  ${item.command ?? '—'}`);
        console.log(col(C.gray, `       enqueued ${item.enqueuedAt ?? '—'}`));
      }
    } else {
      console.log(col(C.gray, '  Queue is empty.'));
    }
  } catch {
    console.log(col(C.gray, '  Orchestrator offline.\n'));
  }
  console.log('');
}

// ── memory ────────────────────────────────────────────────────────────────────
async function cmdMemory(args) {
  const sub   = (args[0] || '').toLowerCase();
  const rest  = args.slice(1).join(' ').trim();

  // ── purpclaw memory stats ─────────────────────────────────────────────────
  if (sub === 'stats') {
    sectionHead('  MEMORY MATRIX — STATS');
    try {
      const [health, stats] = await Promise.allSettled([
        httpGet(PORTS.memory, '/health', 3000),
        httpGet(PORTS.memory, '/stats',  3000),
      ]);
      const h = health.status === 'fulfilled' ? health.value : {};
      const s = stats.status  === 'fulfilled' ? stats.value  : {};
      const merged = { ...h, ...s };

      console.log(`  ${tick(true)}  ${col(C.green, 'memory_matrix_v2')} ${col(C.gray, `:${PORTS.memory}`)}\n`);

      const fields = [
        ['Stored memories', merged.memories    ?? merged.total_memories],
        ['Episodic',        merged.episodic    ?? merged.episodic_count],
        ['Semantic',        merged.semantic    ?? merged.semantic_count],
        ['Symbols lifted',  merged.symbols     ?? merged.symbol_count],
        ['Dreams run',      merged.dreams      ?? merged.dream_cycles],
        ['Uptime',          merged.uptime      ? `${Math.round(merged.uptime / 60)}m` : null],
      ];
      for (const [label, val] of fields) {
        if (val !== undefined && val !== null)
          console.log(`  ${label.padEnd(18)}: ${col(C.cyan, String(val))}`);
      }
    } catch {
      console.log(`  ${tick(false)}  ${col(C.red, 'memory_matrix_v2 offline')}`);
    }
    console.log('');
    return;
  }

  // ── purpclaw memory ingest "<text>" ───────────────────────────────────────
  if (sub === 'ingest') {
    const text = rest || args.slice(1).join(' ').trim();
    if (!text) {
      console.error(col(C.red, '\n  Usage: purpclaw memory ingest "<text to remember>"\n'));
      process.exit(1);
    }
    console.log(`\n  ${col(C.cyan + C.bold, '🧠 MEMORY INGEST')}\n`);
    console.log(`  ${col(C.gray, 'Ingesting:')} ${text.substring(0, 80)}${text.length > 80 ? '…' : ''}\n`);
    try {
      const result = await httpPost(PORTS.memory, '/ingest', {
        content    : text,
        source     : 'cli',
        importance : 0.7,
      }, 10000);
      if (result.status >= 400) {
        console.error(col(C.red, `  ✗ ${JSON.stringify(result.body)}\n`));
        return;
      }
      console.log(col(C.green, `  ✓ Ingested successfully`));
      if (result.body?.id) console.log(col(C.gray, `  id: ${result.body.id}`));
    } catch (e) {
      console.error(col(C.red, e.code === 'ECONNREFUSED'
        ? '  ✗ Memory matrix offline. Run `purpclaw start`.\n'
        : `  ✗ ${e.message}\n`));
    }
    console.log('');
    return;
  }

  // ── purpclaw memory forget "<query>" ─────────────────────────────────────
  if (sub === 'forget') {
    const query = rest;
    if (!query) {
      console.error(col(C.red, '\n  Usage: purpclaw memory forget "<query>"\n'));
      process.exit(1);
    }
    console.log(`\n  ${col(C.yellow + C.bold, '🧠 MEMORY FORGET')}\n  ${col(C.gray, `"${query}"`)}\n`);
    try {
      const result = await httpPost(PORTS.memory, '/forget', { query }, 8000);
      if (result.status >= 400) {
        console.error(col(C.red, `  ✗ ${JSON.stringify(result.body)}\n`)); return;
      }
      const removed = result.body?.removed ?? result.body?.count ?? '?';
      console.log(col(C.green, `  ✓ Removed ${removed} memories matching "${query}"\n`));
    } catch (e) {
      console.error(col(C.red, e.code === 'ECONNREFUSED'
        ? '  ✗ Memory matrix offline.\n'
        : `  ✗ ${e.message}\n`));
    }
    return;
  }

  // ── purpclaw memory (no args) — status ────────────────────────────────────
  if (!sub) {
    sectionHead('  MEMORY MATRIX STATUS');
    try {
      const health = await httpGet(PORTS.memory, '/health', 3000);
      console.log(`  ${tick(true)}  ${col(C.green, 'memory_matrix_v2')} ${col(C.gray, `on :${PORTS.memory}`)}`);
      if (health.memories !== undefined) console.log(`  Stored  : ${col(C.cyan, String(health.memories))} memories`);
      if (health.symbols  !== undefined) console.log(`  Symbols : ${col(C.cyan, String(health.symbols))}`);
      console.log(`\n  ${col(C.bold, 'Subcommands:')}`);
      console.log(`  ${col(C.cyan, 'purpclaw memory <query>')}       — recall matching memories`);
      console.log(`  ${col(C.cyan, 'purpclaw memory ingest "<text>"')} — store a new memory`);
      console.log(`  ${col(C.cyan, 'purpclaw memory forget "<query>"')} — remove matching memories`);
      console.log(`  ${col(C.cyan, 'purpclaw memory stats')}         — detailed matrix stats`);
      console.log(`  ${col(C.cyan, 'purpclaw dream')}                — run AutoDream consolidation\n`);
    } catch {
      console.log(`  ${tick(false)}  ${col(C.red, 'memory_matrix_v2 offline')}`);
      console.log(col(C.gray, '  Run `purpclaw start` to boot services.\n'));
    }
    return;
  }

  // ── purpclaw memory <query> — recall ──────────────────────────────────────
  const query = args.join(' ').trim();
  console.log(`\n  ${col(C.cyan + C.bold, '🧠 MEMORY RECALL')}\n  ${col(C.gray, `"${query}"`)}\n`);

  try {
    const result = await httpPost(PORTS.memory, '/query', { query, limit: 5 }, 8000);
    if (result.status >= 400) {
      console.error(col(C.red, `  ✗ Memory matrix error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const memories = result.body?.results || result.body?.memories || result.body || [];
    if (!Array.isArray(memories) || memories.length === 0) {
      console.log(col(C.gray, '  No matching memories found.\n'));
      return;
    }
    for (const [i, mem] of memories.entries()) {
      const score   = mem.score !== undefined ? col(C.gray, ` [${(mem.score * 100).toFixed(0)}%]`) : '';
      const content = mem.content || mem.text || mem.summary || JSON.stringify(mem).substring(0, 120);
      const source  = mem.source ? col(C.gray, ` • ${mem.source}`) : '';
      const ts      = mem.timestamp ? col(C.gray, ` • ${new Date(mem.timestamp).toLocaleDateString()}`) : '';
      console.log(`  ${col(C.cyan, String(i + 1) + '.')}  ${content}`);
      console.log(col(C.gray, `      ${score}${source}${ts}\n`));
    }
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, '  ✗ Memory matrix offline. Run `purpclaw start`.\n'));
    } else {
      console.error(col(C.red, `  ✗ ${e.message}\n`));
    }
  }
}

// ── dream ─────────────────────────────────────────────────────────────────────
async function cmdDream() {
  console.log(`\n  ${col(C.magenta + C.bold, '💤 AUTODREAM — Memory Consolidation')}\n`);
  console.log(col(C.gray, '  Triggering consolidation cycle on memory matrix...\n'));
  try {
    const result = await httpPost(PORTS.memory, '/dream', { mode: 'full' }, 30000);
    if (result.status >= 400) {
      console.error(col(C.red, `  ✗ Dream cycle error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const r = result.body;
    console.log(`  ${col(C.green, '✓')} Dream cycle complete`);
    if (r.phase)        console.log(`  Phase      : ${col(C.cyan, r.phase)}`);
    if (r.consolidated) console.log(`  Consolidated: ${col(C.cyan, String(r.consolidated))} memories`);
    if (r.pruned)       console.log(`  Pruned     : ${col(C.gray, String(r.pruned))} stale memories`);
    if (r.symbols)      console.log(`  Symbols    : ${col(C.cyan, String(r.symbols))} lifted`);
    console.log('');
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, '  ✗ Memory matrix offline. Run `purpclaw start`.\n'));
    } else {
      console.error(col(C.red, `  ✗ ${e.message}\n`));
    }
  }
}

// ── init wizard (interactive first-run) ─────────────────────────────────────
async function cmdInitWizard(args) {
  banner();
  console.log(col(C.magenta + C.bold, '  PURPCLAW FIRST-RUN WIZARD\n'));

  const envPath  = path.join(PURP_DIR, '.env');
  const envExists = fs.existsSync(envPath);
  let envBody = envExists ? fs.readFileSync(envPath, 'utf8') : '';
  const existingEnv = {};
  if (envExists) {
    for (const line of envBody.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const eq = s.indexOf('=');
      if (eq > 0) existingEnv[s.substring(0, eq).trim()] = s.substring(eq + 1).trim();
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
  const ask = (q, def = '') => new Promise(r => {
    const tail = def ? col(C.gray, ` [${def}]`) : '';
    rl.question(`  ${col(C.cyan, '?')} ${q}${tail} `, ans => r((ans || '').trim() || def));
  });
  const askSecret = (q) => new Promise(r => {
    // Best-effort masked input: not perfect on Windows cmd, but works in modern terminals.
    const prompt = `  ${col(C.cyan, '?')} ${q} `;
    process.stdout.write(prompt);
    const stdin = process.stdin;
    if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(true);
    let buf = '';
    const onData = (b) => {
      const ch = b.toString('utf8');
      if (ch === '\r' || ch === '\n') {
        if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        r(buf);
      } else if (ch === '') {  // ctrl-c
        if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '' || ch === '\b') {
        if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
      } else {
        buf += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });

  // ── Provider pick ──
  console.log(col(C.gray, '  Pick which LLM your harness should call. You can change this any time in .env.\n'));
  const providers = [
    { key: 'minimax',   label: 'MiniMax (M2.7) — recommended, has a generous tier' },
    { key: 'anthropic', label: 'Anthropic Claude' },
    { key: 'openai',    label: 'OpenAI (GPT-4o etc.)' },
    { key: 'kimi',      label: 'Kimi / Moonshot' },
    { key: 'groq',      label: 'Groq (fast inference)' },
    { key: 'deepseek',  label: 'DeepSeek' },
    { key: 'openrouter',label: 'OpenRouter (access 200+ models with one key)' },
    { key: 'ollama',    label: 'Ollama (fully local, no key needed)' },
    { key: 'custom',    label: 'Custom (paste an OpenAI-compatible URL)' },
  ];
  providers.forEach((p, i) => {
    console.log(`    ${col(C.cyan, String(i + 1).padStart(2))}) ${p.label}`);
  });
  console.log('');
  let providerIdx = -1;
  while (providerIdx < 0 || providerIdx >= providers.length) {
    const ans = await ask('Choice number:', '1');
    providerIdx = parseInt(ans, 10) - 1;
  }
  const provider = providers[providerIdx];

  // ── Key (skip for local providers) ──
  let apiKey = '';
  let baseUrl = '';
  let model = '';
  if (provider.key === 'ollama') {
    baseUrl = await ask('Ollama base URL:', 'http://localhost:11434/v1');
    model   = await ask('Model name:', 'llama3.2');
  } else if (provider.key === 'custom') {
    baseUrl = await ask('Base URL (OpenAI-compatible /v1):');
    apiKey  = await askSecret('API key (input hidden):');
    model   = await ask('Model name:');
  } else {
    apiKey = await askSecret(`API key for ${provider.key} (input hidden, paste & press enter):`);
    if (provider.key === 'minimax') model = await ask('Model name:', 'MiniMax-M2.7');
    if (provider.key === 'anthropic') model = await ask('Model name:', 'claude-sonnet-4-5');
    if (provider.key === 'openai') model = await ask('Model name:', 'gpt-4o-mini');
    if (provider.key === 'kimi') model = await ask('Model name:', 'kimi-k2-5');
    if (provider.key === 'groq') model = await ask('Model name:', 'llama-3.3-70b-versatile');
    if (provider.key === 'deepseek') model = await ask('Model name:', 'deepseek-chat');
    if (provider.key === 'openrouter') model = await ask('Model name:', 'anthropic/claude-3.5-haiku');
  }

  // ── Companion seed ──
  const userName = process.env.USERNAME || process.env.USER || 'wanderer';
  const seed = await ask('Companion seed (anything — controls species/eye/hat):', userName);

  // ── Persist .env ──
  function setEnvKey(body, key, value) {
    if (!value) return body;
    const lines = body.split(/\r?\n/);
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim();
      if (!ln || ln.startsWith('#')) continue;
      const eq = ln.indexOf('=');
      if (eq > 0 && ln.substring(0, eq).trim() === key) {
        lines[i] = `${key}=${value}`;
        found = true; break;
      }
    }
    if (!found) lines.push(`${key}=${value}`);
    return lines.join('\n');
  }

  envBody = setEnvKey(envBody, 'LLM_PROVIDER', provider.key);
  if (apiKey)   envBody = setEnvKey(envBody, 'LLM_API_KEY', apiKey);
  if (baseUrl)  envBody = setEnvKey(envBody, 'LLM_BASE_URL', baseUrl);
  if (model)    envBody = setEnvKey(envBody, 'LLM_MODEL', model);
  if (seed && !existingEnv.PURPCLAW_MOCHI_SEED) envBody = setEnvKey(envBody, 'PURPCLAW_MOCHI_SEED', seed);
  fs.writeFileSync(envPath, envBody.trim() + '\n', 'utf8');
  console.log(`\n  ${col(C.green, '✔')} Wrote ${path.relative(PURP_DIR, envPath)}\n`);

  // Re-export into current process so subsequent steps see the new vars
  process.env.LLM_PROVIDER = provider.key;
  if (apiKey)  process.env.LLM_API_KEY  = apiKey;
  if (baseUrl) process.env.LLM_BASE_URL = baseUrl;
  if (model)   process.env.LLM_MODEL    = model;
  if (seed)    process.env.PURPCLAW_MOCHI_SEED = seed;

  // ── Hatch companion ──
  try {
    const mochiLib = require(path.join(PURP_DIR, 'lib', 'mochi'));
    const mochi = mochiLib.hatchMochi(seed);
    console.log(col(C.magenta, '\n  Hatching your companion...\n'));
    mochiLib.renderSprite(mochi, 0).forEach(l => console.log('  ' + col(C.magenta + C.bold, l)));
    console.log(`\n  ${col(C.cyan, mochi.name)} — ${col(C.gray, mochi.species + ' · ' + (mochi.rarity || 'common'))}${mochi.shiny ? col(C.yellow, '  ✨ shiny') : ''}\n`);
  } catch (e) {
    console.log(col(C.yellow, `  Could not hatch companion now: ${e.message} (we'll try again on first \`purpclaw mochi\`)\n`));
  }

  // ── Smoke-test the LLM (skip for local providers) ──
  if (apiKey || provider.key === 'ollama') {
    const spin = spinner(`testing ${provider.key} connectivity...`).start();
    try {
      const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
      const out = await llm.complete('Say the single word: ready', { max_tokens: 8, temperature: 0 });
      if (out && String(out).toLowerCase().includes('ready')) {
        spin.succeed(`${provider.key} answered`);
      } else {
        spin.warn(`${provider.key} responded but did not say "ready" — that's usually fine, just unusual`);
      }
    } catch (e) {
      spin.fail(`${provider.key} test failed: ${e.message.slice(0, 80)}`);
      console.log(col(C.gray, '  You can still proceed; re-test later with `purpclaw doctor`.'));
    }
  }

rl.close();

  // ── Offer to boot ──
  console.log('');
  const { spawn } = require('child_process');
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
  const boot = await new Promise(r => {
    if (!isTTY) return r(false);  // non-interactive — skip
    rl2.question(col(C.cyan + C.bold, '  Boot the swarm now? ') + col(C.gray, '[Y/n] '), ans => r(ans !== 'n' && ans !== 'N'));
  });
  rl2.close();

  if (boot) {
    console.log(col(C.gray, '\n  Starting PURPCLAW...\n'));
    const proc = spawn('node', ['bin/purpclaw.js', 'start'], {
      cwd: PURP_DIR,
      stdio: 'inherit',
      detached: true,
      shell: true,
    });
    proc.unref();
    console.log(col(C.cyan, '  PURPCLAW is booting in the background.'));
    console.log(col(C.gray, '  Watch: purpclaw status'));
    console.log(col(C.gray, '  Web:   http://localhost:3000\n'));
  }

  console.log(col(C.green + C.bold, '  ✔  PURPCLAW IS READY\n'));
  console.log(col(C.gray, '  Next:'));
  console.log(`    ${col(C.cyan, 'purpclaw status')}      live dashboard`);
  console.log(`    ${col(C.cyan, 'purpclaw mochi')}      chat with your companion`);
  console.log(`    ${col(C.cyan, 'purpclaw doctor')}     health check`);
  console.log(`    ${col(C.cyan, 'purpclaw run "<task>"')} dispatch an agent task\n`);
}

// ── init ─────────────────────────────────────────────────────────────────────
async function cmdInit(args) {
  if (args.includes('--wizard')) return cmdInitWizard(args);
  banner();
  console.log(col(C.magenta + C.bold, '  PURPCLAW SETUP WIZARD\n'));
  console.log(col(C.gray, '  Checking your environment before first boot...\n'));

  const issues = [];
  const checks = [];

  // ── 1. Node version ──────────────────────────────────────────────────────────
  const nodeVer = parseInt(process.versions.node.split('.')[0], 10);
  const nodeOk  = nodeVer >= 18;
  checks.push({ label: `Node.js v${process.versions.node}`, ok: nodeOk,
                hint: nodeOk ? '' : 'Need Node 18+. Install from nodejs.org.' });
  if (!nodeOk) issues.push('Upgrade Node.js to v18 or later');

  // ── 2. PM2 ───────────────────────────────────────────────────────────────────
  let pm2Ok = false;
  try { execSync('pm2 --version', { stdio: 'ignore', shell: true }); pm2Ok = true; } catch {}
  checks.push({ label: 'PM2', ok: pm2Ok, hint: pm2Ok ? '' : 'Run: npm install -g pm2' });
  if (!pm2Ok) issues.push('Install PM2 globally: npm install -g pm2');

  // ── 3. ecosystem.config.js ───────────────────────────────────────────────────
  const ecoOk = fs.existsSync(ECOSYSTEM);
  checks.push({ label: 'ecosystem.config.js', ok: ecoOk,
                hint: ecoOk ? '' : `Missing at ${ECOSYSTEM}` });

  // ── 4. .env file ─────────────────────────────────────────────────────────────
  const envPath = path.join(PURP_DIR, '.env');
  let envExists = fs.existsSync(envPath);
  let envVars   = {};
  if (envExists) {
    try {
      fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && !k.trim().startsWith('#')) envVars[k.trim()] = v.join('=').trim();
      });
    } catch {}
  }
  checks.push({ label: '.env file', ok: envExists,
                hint: envExists ? '' : `Create one at ${envPath} (see --template flag)` });

  // ── 5. LLM Provider ──────────────────────────────────────────────────────────
  const provider = (envVars.LLM_PROVIDER || '').toLowerCase();
  const apiKey   = envVars.LLM_API_KEY  || '';
  const local    = provider === 'ollama' || provider === 'lmstudio';
  const noKeyNeeded = local || provider === 'custom';

  if (!provider) {
    checks.push({ label: 'LLM_PROVIDER', ok: false,
                  hint: 'Set LLM_PROVIDER in .env (e.g. openai, groq, ollama)' });
    issues.push('LLM_PROVIDER not set in .env');
  } else if (noKeyNeeded) {
    checks.push({ label: `LLM provider: ${provider}`, ok: true,
                  hint: `Local provider — no API key required` });
  } else if (!apiKey) {
    checks.push({ label: `LLM provider: ${provider}`, ok: false,
                  hint: `Set LLM_API_KEY in .env for ${provider}` });
    issues.push(`LLM_API_KEY not set for provider "${provider}"`);
  } else {
    const masked = apiKey.substring(0, 6) + '***' + apiKey.slice(-3);
    checks.push({ label: `LLM provider: ${provider}`, ok: true,
                  hint: `Key: ${masked}` });
  }

  // ── 6. Swarm provider (optional) ─────────────────────────────────────────────
  const swarmProvider = (envVars.SWARM_PROVIDER || '').toLowerCase();
  const swarmKey      = envVars.SWARM_API_KEY || '';
  if (swarmProvider && swarmProvider !== provider) {
    const swarmOk = swarmKey.length > 0 ||
      swarmProvider === 'ollama' || swarmProvider === 'lmstudio';
    const masked  = swarmKey ? swarmKey.substring(0, 6) + '***' + swarmKey.slice(-3) : '(not set)';
    checks.push({ label: `Swarm provider: ${swarmProvider}`, ok: swarmOk,
                  hint: swarmOk ? `Key: ${masked}` : `Set SWARM_API_KEY in .env` });
    if (!swarmOk) issues.push(`SWARM_API_KEY not set for swarm provider "${swarmProvider}"`);
  }

  // ── 7. Service connectivity (if stack is running) ─────────────────────────────
  const coreServices = [
    { name: 'orchestrator', port: PORTS.orchestrator },
    { name: 'tower',        port: PORTS.tower },
    { name: 'api',          port: PORTS.api },
    { name: 'memory',       port: PORTS.memory },
  ];
  const svcResults = await Promise.allSettled(
    coreServices.map(s => ping(s.port).then(ok => ({ ...s, ok })))
  );
  const anyOnline = svcResults.some(r => r.value?.ok);

  console.log(col(C.bold, '  CHECKS\n'));
  for (const c of checks) {
    const icon = c.ok ? col(C.green, '  ✓') : col(C.red, '  ✗');
    const hint = c.hint ? col(C.gray, `  ← ${c.hint}`) : '';
    console.log(`${icon}  ${c.label}${hint}`);
  }

  // Show service connectivity
  if (anyOnline) {
    console.log(`\n${col(C.bold, '  SERVICES (running)')}`)
    for (const r of svcResults) {
      const s = r.value || { name: '?', ok: false };
      const icon = s.ok ? col(C.green, '  ✓') : col(C.gray, '  ·');
      console.log(`${icon}  ${s.name.padEnd(16)}${col(C.gray, s.ok ? 'online' : 'offline')}`);
    }
  } else {
    console.log(col(C.gray, '\n  (Services not running yet — run `purpclaw start` after setup)'));
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  console.log('');
  if (issues.length === 0) {
    console.log(col(C.green + C.bold, '  ✓ All checks passed!\n'));
    console.log(`  ${col(C.cyan,  'purpclaw start')}   — boot the full stack`);
    console.log(`  ${col(C.cyan,  'purpclaw chat')}    — open the REPL`);
    console.log(`  ${col(C.cyan,  'purpclaw run "<task>"')} — send a task to the swarm`);
  } else {
    console.log(col(C.yellow + C.bold, `  ⚠ ${issues.length} issue${issues.length > 1 ? 's' : ''} to fix:\n`));
    for (const issue of issues) console.log(`  ${col(C.yellow, '·')}  ${issue}`);

    if (!envExists) {
      console.log(col(C.gray, '\n  Generate a .env template:'));
      console.log(`  ${col(C.cyan, 'purpclaw init --template')}\n`);
    }
  }
  console.log('');

  // ── --template flag: write a starter .env ────────────────────────────────────
  if (args.includes('--template') && !envExists) {
    const template = [
      '# PURPCLAW Environment Configuration',
      '# Generated by purpclaw init --template',
      '',
      '# ── LLM Provider ──────────────────────────────────────────────',
      '# Any OpenAI-compatible provider. Free options below.',
      'LLM_PROVIDER=openai',
      'LLM_API_KEY=sk-...',
      'LLM_MODEL=gpt-4o-mini',
      '',
      '# Free local option (no API key needed):',
      '# LLM_PROVIDER=ollama',
      '# LLM_MODEL=llama3.2',
      '',
      '# OpenRouter (200+ models, one key):',
      '# LLM_PROVIDER=openrouter',
      '# LLM_API_KEY=sk-or-...',
      '# LLM_MODEL=anthropic/claude-3.5-haiku',
      '',
      '# ── Swarm Engine (heavy reasoning) ────────────────────────────',
      '# Defaults to main provider if not set. Kimi K2 recommended.',
      '# SWARM_PROVIDER=kimi',
      '# SWARM_API_KEY=',
      '# SWARM_MODEL=kimi-k2-5',
      '',
      '# ── Internal ───────────────────────────────────────────────────',
      'INTERNAL_API_KEY=',
      'OPENCLAW_GATEWAY=ws://127.0.0.1:18789',
    ].join('\n');

    try {
      fs.writeFileSync(envPath, template, 'utf8');
      console.log(col(C.green, `  ✓ .env template written to ${envPath}`));
      console.log(col(C.gray,  '  Edit it with your API key, then run `purpclaw init` again to verify.\n'));
    } catch (e) {
      console.error(col(C.red, `  ✗ Could not write .env: ${e.message}\n`));
    }
  }
}

// ── logs ──────────────────────────────────────────────────────────────────────
async function cmdLogs(args) {
  const service = args[0] ? `purpclaw-${args[0]}` : '--merge';
  const child = spawn('pm2', ['logs', service, '--lines', '50'], {
    stdio : 'inherit',
    shell : true,
    cwd   : PURP_DIR,
  });
  child.on('close', code => process.exit(code || 0));
  child.on('error', () => {
    console.error(col(C.red, '  ✗ PM2 not found. Install: npm install -g pm2'));
    process.exit(1);
  });
}

// ── chat ──────────────────────────────────────────────────────────────────────
async function cmdChat(args) {
  banner();

  // Check orchestrator health — advise if offline
  const orchOnline = await ping(PORTS.orchestrator, '/health');
  const memOnline  = await ping(PORTS.memory, '/health');

  console.log(`  Orchestrator ${tick(orchOnline)}   Memory ${tick(memOnline)}\n`);

  if (!orchOnline) {
    console.log(col(C.yellow, '  ⚠ Orchestrator is offline — agent routing unavailable.'));
    console.log(col(C.gray,   '  Run `purpclaw start` in another terminal to enable full swarm.\n'));
  }

  if (!fs.existsSync(NANOCLAW)) {
    console.error(col(C.red, `  ✗ nanoclaw.js not found at ${NANOCLAW}`));
    process.exit(1);
  }

  // Set env so nanoclaw knows it was launched from the CLI
  const env = {
    ...process.env,
    PURPCLAW_ORCHESTRATOR_PORT : String(PORTS.orchestrator),
    PURPCLAW_MEMORY_PORT       : String(PORTS.memory),
    PURPCLAW_SWARM_ONLINE      : orchOnline ? '1' : '0',
    CLAW_MODEL                 : process.env.CLAW_MODEL || 'sonnet',
  };

  // Pass any extra args (e.g. --session, --skill) through to nanoclaw
  const child = spawn(process.execPath, [NANOCLAW, ...args], {
    stdio  : 'inherit',
    env,
    cwd    : PURP_DIR,
  });

  child.on('close', code => process.exit(code || 0));
  child.on('error', e => {
    console.error(col(C.red, `  ✗ Failed to launch nanoclaw: ${e.message}`));
    process.exit(1);
  });
}

// ── look ─────────────────────────────────────────────────────────────────────
async function cmdLook(args) {
  const screenLook = require(path.join(PURP_DIR, 'lib', 'screen-look.js'));

  if (args.includes('--workspace')) {
    const ws = screenLook.readWorkspace();
    sectionHead('  WORKSPACE AWARENESS');
    console.log(`  ${col(C.white, ws.summary || 'No workspace observations yet. Run purpclaw look.')}`);
    const monitors = Object.values(ws.monitors || {}).sort((a, b) => Number(a.screen) - Number(b.screen));
    for (const m of monitors) {
      const changed = m.changed ? col(C.yellow, m.changeSummary || 'changed') : col(C.gray, 'stable');
      console.log(`  ${col(C.cyan, `Screen ${m.screen}`)}  ${m.role || 'workspace'}  ${col(C.gray, `${m.app || 'Unknown'} / ${m.workflow || 'unknown'}`)}  ${changed}`);
    }
    console.log(col(C.gray, `\n  Context file -> ${ws.persist?.file || path.join(PURP_DIR, 'agent_work', '.workspace_awareness.json')}\n`));
    return;
  }

  // purpclaw look --list
  if (args.includes('--list')) {
    const spin = spinner('Detecting monitors...').start();
    const info = await screenLook.listScreens();
    if (info.error || info.count === 0) {
      spin.fail(info.error || 'No screens found');
      console.log(col(C.gray, '  Ensure Python + mss are installed: pip install mss Pillow'));
      return;
    }
    spin.succeed(`${info.count} monitor${info.count !== 1 ? 's' : ''} detected`);
    for (const s of info.screens) {
      console.log(`  ${col(C.cyan, `Screen ${s.index}`)}  ${s.width}×${s.height}  ${col(C.gray, `@ (${s.left}, ${s.top})`)}`);
    }
    return;
  }

  const noVision  = args.includes('--no-vision');
  const noYolo    = args.includes('--no-yolo');
  const rawTokens = args.filter(a => !a.startsWith('--'));

  // Resolve which screens to capture
  let indices = screenLook.parseScreenSpec(rawTokens);

  if (!indices) {
    const spin = spinner('Detecting monitors...').start();
    const info = await screenLook.listScreens();
    if (info.error || info.count === 0) {
      spin.fail(info.error || 'No screens found (pip install mss Pillow)');
      return;
    }
    indices = Array.from({ length: info.count }, (_, i) => i + 1);
    spin.succeed(`${info.count} monitor${info.count !== 1 ? 's' : ''} found — capturing all`);
  }

  console.log('');

  for (const idx of indices) {
    const spin = spinner(`Capturing screen ${idx}...`).start();
    const results = await screenLook.look([idx], { vision: !noVision, yolo: !noYolo });
    const r = results[0];

    if (r.error) {
      spin.fail(`Screen ${idx}: ${r.error}`);
      continue;
    }

    spin.succeed(`Screen ${idx}  (${r.width}×${r.height})`);

    if (r.description) {
      const lines = r.description.split('\n');
      for (const l of lines) console.log(`  ${col(C.white, l)}`);
    } else if (noVision) {
      console.log(col(C.gray, '  [vision skipped]'));
    } else {
      console.log(col(C.gray, '  [no vision — provider may not support images, or no key set]'));
    }

    if (r.objectCount > 0) {
      const uniq = [...new Set(r.objects)];
      console.log(col(C.gray, `  Objects: ${uniq.join(', ')} (${r.objectCount} detections)`));
    }

    console.log('');
  }

  console.log(col(C.gray, '  Context saved → agent_work/.screen_context.json'));
  const ws = screenLook.readWorkspace();
  if (ws?.summary) console.log(col(C.gray, `  Workspace -> ${ws.summary}`));
  console.log(col(C.gray, '  Agents will read this before their next task.\n'));
}

// ── config ────────────────────────────────────────────────────────────────────
async function cmdConfig(args) {
  const envPath = path.join(PURP_DIR, '.env');

  // ── known config keys with metadata
  const CONFIG_KEYS = [
    { key: 'LLM_PROVIDER',   label: 'LLM Provider',        choices: ['anthropic','openai','kimi','groq','deepseek','openrouter','together','mistral','ollama','lmstudio'],  secret: false },
    { key: 'LLM_MODEL',      label: 'LLM Model',           choices: [],  secret: false, hint: 'e.g. claude-opus-4-5, gpt-4o, kimi-k2-5' },
    { key: 'LLM_API_KEY',    label: 'LLM API Key',         choices: [],  secret: true  },
    { key: 'SWARM_PROVIDER', label: 'Swarm Provider',      choices: ['kimi','openai','anthropic','groq','openrouter'], secret: false },
    { key: 'SWARM_MODEL',    label: 'Swarm Model',         choices: [],  secret: false, hint: 'Heavy reasoning engine model' },
    { key: 'SWARM_API_KEY',  label: 'Swarm API Key',       choices: [],  secret: true  },
    { key: 'KIMI_API_KEY',   label: 'Kimi API Key',        choices: [],  secret: true  },
    { key: 'ORCHESTRATOR_PORT','label':'Orchestrator Port', choices: [],  secret: false, hint: 'default 7784' },
    { key: 'TOWER_PORT',     label: 'Tower Port',          choices: [],  secret: false, hint: 'default 7790' },
    { key: 'API_PORT',       label: 'API Port',            choices: [],  secret: false, hint: 'default 7780' },
    { key: 'MEMORY_PORT',    label: 'Memory Port',         choices: [],  secret: false, hint: 'default 7880' },
    { key: 'XIAOZHI_WS_URL', label: 'Xiaozhi WS URL',     choices: [],  secret: false, hint: 'ws://... — the AI ball WebSocket' },
    { key: 'VOICE_PORT',     label: 'Voice Service Port',  choices: [],  secret: false, hint: 'default 7781' },
  ];

  // ── parse .env into a map
  function parseEnv() {
    const map = {};
    try {
      const raw = fs.readFileSync(envPath, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {}
    return map;
  }

  function maskVal(val, secret) {
    if (!val) return col(C.gray, '[not set]');
    if (!secret) return col(C.white, val);
    if (val.length <= 8) return col(C.yellow, '***');
    return col(C.yellow, `${val.slice(0, 6)}...${val.slice(-3)}`);
  }

  // ── write one key back to .env
  function writeEnvKey(key, value) {
    let raw = '';
    try { raw = fs.readFileSync(envPath, 'utf8'); } catch {}
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(raw)) {
      raw = raw.replace(re, `${key}=${value}`);
    } else {
      raw = raw.trimEnd() + `\n${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, raw, 'utf8');
  }

  // ── show mode: just print current values
  if (args[0] === 'show' || args[0] === 'list') {
    sectionHead('  ⚙  PURPCLAW CONFIG');
    const env = parseEnv();
    for (const k of CONFIG_KEYS) {
      const val = env[k.key] || process.env[k.key] || '';
      const masked = maskVal(val, k.secret);
      console.log(`  ${col(C.cyan, k.key.padEnd(22))}${masked}  ${k.hint ? col(C.gray, k.hint) : ''}`);
    }
    console.log('');
    console.log(col(C.gray, `  .env location: ${envPath}`));
    console.log(col(C.gray, `  Run "purpclaw config set KEY value" to change a key.\n`));
    return;
  }

  // ── set mode: purpclaw config set KEY value
  if (args[0] === 'set' && args[1]) {
    const key   = args[1].toUpperCase();
    const value = args.slice(2).join(' ');
    if (!value) {
      console.log(col(C.red, `  ✗ Usage: purpclaw config set ${key} <value>`));
      return;
    }
    writeEnvKey(key, value);
    const meta  = CONFIG_KEYS.find(k => k.key === key);
    const shown = meta?.secret ? maskVal(value, true) : col(C.green, value);
    console.log(col(C.green, `  ✔  ${key} updated → ${shown}`));
    console.log(col(C.gray,  `  Restart services to apply: purpclaw restart\n`));
    return;
  }

  // ── interactive mode: readline menu
  sectionHead('  ⚙  PURPCLAW INTERACTIVE CONFIG');
  const env = parseEnv();

  console.log(col(C.gray, '  Arrow keys / number to pick a setting. "q" to quit.\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  // Print menu
  let selected = 0;

  function renderMenu() {
    // Move cursor up to redraw
    if (selected > 0) process.stdout.write(`\x1B[${CONFIG_KEYS.length + 2}A`);

    CONFIG_KEYS.forEach((k, i) => {
      const val    = env[k.key] || process.env[k.key] || '';
      const masked = val ? maskVal(val, k.secret) : col(C.gray, '[not set]');
      const prefix = i === selected ? col(C.magenta, ' ▶ ') : '   ';
      const bg     = i === selected ? C.bold : '';
      process.stdout.write(`${prefix}${col(bg, k.label.padEnd(20))} ${masked}\n`);
    });
    process.stdout.write(col(C.gray, '\n  ↑↓ navigate  Enter=edit  q=quit\n'));
  }

  renderMenu();

  return new Promise((resolve) => {
    process.stdin.on('keypress', async (ch, key) => {
      if (!key) return;

      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        rl.close();
        console.log('\n');
        resolve();
        return;
      }

      if (key.name === 'up')   { selected = (selected - 1 + CONFIG_KEYS.length) % CONFIG_KEYS.length; renderMenu(); return; }
      if (key.name === 'down') { selected = (selected + 1) % CONFIG_KEYS.length; renderMenu(); return; }

      if (key.name === 'return') {
        const k = CONFIG_KEYS[selected];
        if (process.stdin.isTTY) process.stdin.setRawMode(false);

        // If choices available, show them
        if (k.choices && k.choices.length > 0) {
          process.stdout.write(`\n  ${col(C.cyan, k.label)} — choose one:\n`);
          k.choices.forEach((c, i) => console.log(`  ${col(C.gray, `${i + 1}.`)} ${c}`));
          process.stdout.write('  > ');
          rl.question('', (answer) => {
            const idx = parseInt(answer) - 1;
            const val = (idx >= 0 && idx < k.choices.length) ? k.choices[idx] : answer.trim();
            if (val) {
              writeEnvKey(k.key, val);
              env[k.key] = val;
              console.log(col(C.green, `  ✔  ${k.key} = ${val}`));
            }
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
            renderMenu();
          });
        } else {
          const hint = k.hint ? ` (${k.hint})` : '';
          process.stdout.write(`\n  ${col(C.cyan, k.label)}${col(C.gray, hint)} → `);
          rl.question('', (answer) => {
            if (answer.trim()) {
              writeEnvKey(k.key, answer.trim());
              env[k.key] = answer.trim();
              console.log(col(C.green, `  ✔  ${k.key} updated`));
            }
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
            renderMenu();
          });
        }
      }
    });
  });
}

// ── voice (/command shorthand) ────────────────────────────────────────────────
async function cmdVoice(args) {
  // If a command string is passed, send it directly to the voice/orchestrator pipeline
  // without going through the normal text routing.
  // Usage:
  //   purpclaw voice "build the login page"   — send as voice command
  //   purpclaw voice                           — show voice service status

  const text = args.join(' ').trim();

  if (!text) {
    // Show voice service status
    sectionHead('  🎙  VOICE SERVICE');
    const spin = spinner('Checking voice service...').start();
    const online = await ping(PORTS.voice, '/health');
    if (online) {
      spin.succeed(`Voice service online  :${PORTS.voice}`);
    } else {
      spin.warn(`Voice service offline  :${PORTS.voice}`);
      console.log(col(C.gray, '  Start it: purpclaw restart voice'));
    }

    // Show last screen context if available
    const screenLook = require(path.join(PURP_DIR, 'lib', 'screen-look.js'));
    const ctx = screenLook.readLastContext();
    if (ctx) {
      console.log(col(C.gray, `\n  Screen context: ${ctx.screens?.length || 0} screen(s) from ${new Date(ctx.ts).toLocaleTimeString()}`));
      for (const s of (ctx.screens || [])) {
        if (s.description) console.log(col(C.gray, `  Screen ${s.screen}: ${s.description.slice(0, 80)}...`));
      }
    }

    console.log('');
    console.log(col(C.gray, '  Usage: purpclaw voice "<command>"'));
    console.log(col(C.gray, '     or: purpclaw voice  (then speak if mic is live)'));
    console.log('');
    return;
  }

  // Send the text as a voice command to the unified API
  const spin = spinner(`Sending to voice pipeline: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`).start();

  try {
    const r = await httpPost(PORTS.api, '/api/command', { command: text, source: 'cli_voice', ts: new Date().toISOString() });
    if (r.status >= 200 && r.status < 300) {
      spin.succeed('Command dispatched via voice pipeline');
      if (r.body?.workflowId) {
        console.log(col(C.gray, `  Workflow: ${r.body.workflowId}`));
        console.log(col(C.gray, '  Track it: purpclaw workflows\n'));
      }
    } else {
      spin.fail(`API returned ${r.status}`);
    }
  } catch (e) {
    spin.fail(`Failed: ${e.message}`);
    console.log(col(C.gray, '  Is the stack running? purpclaw status\n'));
  }
}

// ── doctor ───────────────────────────────────────────────────────────────────
async function cmdDoctor() {
  const registry = require(path.join(PURP_DIR, 'service_registry.js'));
  const screenLook = require(path.join(PURP_DIR, 'lib', 'screen-look.js'));

  banner();
  sectionHead('  PURPCLAW DOCTOR');

  const checks = [];
  const add = (label, ok, detail = '') => checks.push({ label, ok: Boolean(ok), detail });

  add('package.json', fs.existsSync(path.join(PURP_DIR, 'package.json')), 'runtime manifest');
  add('node_modules/next', fs.existsSync(path.join(PURP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next')), 'Next.js CLI installed');
  add('ecosystem.config.js', fs.existsSync(ECOSYSTEM), 'PM2 service config');
  add('service_registry.js', fs.existsSync(path.join(PURP_DIR, 'service_registry.js')), 'single service map');
  add('.env', fs.existsSync(path.join(PURP_DIR, '.env')), 'local keys/config');

  try {
    const py = execSync('py -3.11 -c "import sys; print(sys.version.split()[0])"', { cwd: PURP_DIR, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    add('Python 3.11', true, py);
  } catch {
    add('Python 3.11', false, 'py -3.11 unavailable');
  }

  try {
    const info = await screenLook.listScreens();
    add('screen capture deps', !info.error && info.count > 0, info.error || `${info.count} monitor(s)`);
  } catch (e) {
    add('screen capture deps', false, e.message);
  }

  for (const service of registry.getServices()) {
    if (!service.healthPort || !service.healthPath) {
      add(`${service.name} (${service.group})`, !service.required, service.note || 'no health endpoint');
      continue;
    }
    const online = await ping(service.healthPort, service.healthPath);
    const ok = service.required ? online : true;
    const state = online ? `online :${service.healthPort}${service.healthPath}` : (service.required ? `offline :${service.healthPort}${service.healthPath}` : `optional/config-needed :${service.healthPort}${service.healthPath}`);
    add(`${service.name} (${service.group})`, ok, state);
  }

  let failures = 0;
  for (const check of checks) {
    if (!check.ok) failures++;
    const icon = check.ok ? col(C.green, 'OK') : col(C.red, 'NO');
    console.log(`  ${icon}  ${check.label.padEnd(30)} ${col(C.gray, check.detail)}`);
  }

  console.log('');
  if (failures) {
    console.log(col(C.yellow, `  Doctor found ${failures} required issue${failures === 1 ? '' : 's'}. Optional offline services are not counted as failures.\n`));
  } else {
    console.log(col(C.green, '  Doctor found no required local setup issues. Optional services may still need config.\n'));
  }
}

// ── approve ─────────────────────────────────────────────────────────────────
function cmdApprove(args) {
  const gov = require(path.join(PURP_DIR, 'lib', 'governance.js'));

  if (!args.length) {
    const pending = gov.pendingApprovals(PURP_DIR);
    if (!pending.length) {
      console.log(col(C.gray, '  No pending approvals.\n'));
      return;
    }
    sectionHead('  PENDING APPROVALS');
    for (const entry of pending) {
      const risks = (entry.risks || []).map(r =>
        r === 'critical' ? col(C.red, 'CRITICAL') :
        r === 'destructive' ? col(C.red, 'DESTRUCTIVE') :
        r === 'self-modification' ? col(C.yellow, 'SELF-MOD') :
        col(C.gray, r)
      ).join(' ');
      console.log(`  ${col(C.cyan, entry.id.padEnd(25))}  ${risks}`);
      console.log(col(C.gray, `    ${entry.command?.slice(0, 80) || entry.jobType || '?'}`));
    }
    console.log(col(C.gray, '\n  purpclaw approve <approval-id>'));
    console.log(col(C.gray, '  purpclaw reject  <approval-id> [reason]'));
    return;
  }

  const approvalId = args[0];
  const result = gov.setApprovalStatus(PURP_DIR, approvalId, 'approved');
  if (!result.id) {
    console.log(col(C.red, `  ✗ Approval ${approvalId} not found`));
  } else {
    console.log(col(C.green, `  ✓ Approved: ${approvalId}`));
  }
}

// ── reject ──────────────────────────────────────────────────────────────────
function cmdReject(args) {
  const gov = require(path.join(PURP_DIR, 'lib', 'governance.js'));

  if (!args.length) {
    const pending = gov.pendingApprovals(PURP_DIR);
    if (!pending.length) {
      console.log(col(C.gray, '  Nothing pending to reject.\n'));
      return;
    }
    console.log(col(C.gray, '  Usage: purpclaw reject <approval-id>'));
    for (const entry of pending) {
      console.log(`    ${col(C.cyan, entry.id)}  ${entry.command?.slice(0, 60) || entry.jobType}`);
    }
    return;
  }

  const approvalId = args[0];
  const result = gov.setApprovalStatus(PURP_DIR, approvalId, 'rejected');
  if (!result.id) {
    console.log(col(C.red, `  ✗ Approval ${approvalId} not found`));
  } else {
    console.log(col(C.yellow, `  ✗ Rejected: ${approvalId}`));
  }
}

// ── jobs ─────────────────────────────────────────────────────────────────────
function cmdJobs(args) {
  const gov = require(path.join(PURP_DIR, 'lib', 'governance.js'));
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'pending') {
    const pending = gov.pendingApprovals(PURP_DIR);
    if (!pending.length) {
      console.log(col(C.gray, '  No pending approvals.\n'));
      return;
    }
    sectionHead('  PENDING APPROVALS');
    for (const entry of pending) {
      console.log(`  ${col(C.cyan, entry.id)}  ${col(C.yellow, (entry.risks || []).join(', '))}`);
      console.log(col(C.gray, `    ${entry.command?.slice(0, 80) || entry.jobType || '?'}`));
      console.log(col(C.gray, `    created: ${entry.createdAt}`));
    }
    return;
  }

  if (sub === 'recent') {
    const all = gov.listApprovals(PURP_DIR);
    const byId = {};
    for (const e of all) byId[e.id] = e;
    const unique = Object.values(byId).slice(-20).reverse();
    sectionHead('  RECENT APPROVAL LOG (last 20)');
    for (const entry of unique) {
      const icon = entry.status === 'approved' ? col(C.green, '✓') :
                   entry.status === 'rejected' ? col(C.red, '✗') :
                   col(C.gray, '·');
      console.log(`  ${icon}  ${col(C.gray, String(entry.createdAt || '').slice(0, 19))}  ${entry.id}  ${entry.status}`);
    }
    return;
  }

  // Default: summary
  const pending = gov.pendingApprovals(PURP_DIR);
  sectionHead('  GOVERNANCE STATUS');
  console.log(`  ${pending.length > 0 ? col(C.red, String(pending.length)) : col(C.green, '0')}  pending approval(s)`);
  console.log(col(C.gray, '  purpclaw jobs pending | recent'));
  console.log('');
}

// ── policies ─────────────────────────────────────────────────────────────────
function cmdPolicies() {
  const gov = require(path.join(PURP_DIR, 'lib', 'governance.js'));
  const policy = gov.readPolicy(PURP_DIR);

  sectionHead('  GOVERNOR — POLICIES');
  console.log(`  Mode: ${col(C.cyan, policy.mode)}`);
  console.log('');
  console.log(`  ${col(C.red, 'Require approval for:')}`);
  for (const r of (policy.requireApprovalFor || [])) {
    console.log(`    ${col(C.red, '⚠')}  ${r}`);
  }
  console.log('');
  console.log(`  ${col(C.green, 'Allow without approval:')}`);
  for (const r of (policy.allowWithoutApproval || [])) {
    console.log(`    ${col(C.green, '✓')}  ${r}`);
  }
  console.log(col(C.gray, '\n  purpclaw approve <id> | reject <id>'));
  console.log(col(C.gray, '  purpclaw jobs pending | recent'));
}


// ── introspect ────────────────────────────────────────────────────────────────
function cmdIntrospect(args) {
  const gov  = require(path.join(PURP_DIR, 'lib', 'governance.js'));
  const reg  = (() => { try { return require(path.join(PURP_DIR, 'service_registry.js')); } catch { return null; } })();
  const fs   = require('fs');

  const sub = (args[0] || '').toLowerCase();
  const target = args[1] || '';

  if (sub === 'risks') {
    sectionHead('  RISK CLASSIFICATION');
    console.log(col(C.gray, '  Testing: npm install self-modification'));
    const risks = gov.classifyRisk('npm install purpclaw orchestrator self-modification');
    for (const r of risks) {
      const label = r === 'destructive' ? col(C.red, 'DESTRUCTIVE') :
                    r === 'self-modification' ? col(C.yellow, 'SELF-MOD') :
                    r === 'dependency-change' ? col(C.yellow, 'DEP-CHANGE') :
                    col(C.gray, r);
      console.log(`    ${col(C.yellow, '⚠')}  ${label}`);
    }
    console.log('');
    console.log(col(C.gray, '  Testing: status doctor look (read-only)'));
    const safe = gov.classifyRisk('purpclaw doctor status look');
    for (const r of safe) console.log(`    ${col(C.green, '✓')}  ${r}`);
    console.log('');
    return;
  }

  if (sub === 'policies') {
    const policy = gov.readPolicy(PURP_DIR);
    console.log(col(C.cyan, `Mode: ${policy.mode}`));
    console.log(col(C.gray, `Require: ${policy.requireApprovalFor.join(', ')}`));
    return;
  }

  // Default: full introspect report
  sectionHead('  PURPCLAW INTROSPECT');
  console.log('');
  console.log(`  ${col(C.white, 'Governance mode:')}  ${col(C.cyan, gov.readPolicy(PURP_DIR).mode)}`);
  const pending = gov.pendingApprovals(PURP_DIR);
  console.log(`  ${col(C.white, 'Pending approvals:')}  ${pending.length > 0 ? col(C.red, String(pending.length)) : col(C.green, '0')}`);
  console.log('');

  if (reg) {
    try {
      const services = reg.getServices();
      const required = services.filter(s => s.required);
      const optional = services.filter(s => !s.required);
      console.log(`  ${col(C.white, 'Services:')}  ${col(C.green, String(required.length))} required, ${col(C.gray, String(optional.length))} optional`);
    } catch { console.log(col(C.gray, '  Service registry: not accessible')); }
  }

  console.log('');
  console.log(`  ${col(C.gray, 'Sub-commands:')}`);
  console.log(`    ${col(C.cyan, 'purpclaw introspect risks')}      — test risk classification`);
  console.log(`    ${col(C.cyan, 'purpclaw introspect policies')}  — show current policy mode`);
  console.log('');
}



// ── rollback ─────────────────────────────────────────────────────────────────
function cmdRollback(args) {
  const sub = (args[0] || '').toLowerCase();
  const fs = require('fs');

  const gov = require(path.join(PURP_DIR, 'lib', 'governance.js'));

  if (sub === 'list') {
    sectionHead('  AVAILABLE ROLLBACK POINTS');
    // Show recent completed jobs that could be rolled back
    const agent_work = path.join(PURP_DIR, 'agent_work');
    const jobs = [];
    try {
      for (const entry of fs.readdirSync(agent_work)) {
        if (entry.startsWith('job-') && fs.statSync(path.join(agent_work, entry)).isDirectory()) {
          const meta = path.join(agent_work, entry, '.meta.json');
          if (fs.existsSync(meta)) {
            try { jobs.push(JSON.parse(fs.readFileSync(meta, 'utf8'))); } catch {}
          }
        }
      }
    } catch {}

    if (!jobs.length) {
      console.log(col(C.gray, '  No completed jobs with rollback metadata.\n'));
      return;
    }

    const recent = jobs.slice(-20).reverse();
    for (const job of recent) {
      const ts = job.completedAt || job.createdAt || '';
      const id = job.id || job.workflowId || '?';
      const desc = (job.command || job.description || '?').slice(0, 60);
      console.log(`  ${col(C.cyan, id.padEnd(20))}  ${col(C.gray, ts.slice(0, 19))}  ${desc}`);
    }
    console.log(col(C.gray, '\n  Rollback a job: purpclaw rollback undo <job-id>\n'));
    return;
  }

  if (sub === 'undo') {
    const jobId = args[1];
    if (!jobId) {
      console.log(col(C.gray, '  Usage: purpclaw rollback undo <job-id>'));
      console.log(col(C.gray, '  List available: purpclaw rollback list'));
      return;
    }
    console.log(col(C.yellow, `  Rollback for ${jobId} — implemented as governance checkpoint, not auto-revert.`));
    console.log(col(C.gray, '  Check purpclaw jobs recent to see what changed.'));
    console.log(col(C.gray, '  For auto-revert on self-change failures, see policies.json: POL-005.'));
    return;
  }

  // Default: show rollback status
  sectionHead('  ROLLBACK');
  const agent_work = path.join(PURP_DIR, 'agent_work');
  let count = 0;
  try { count = fs.readdirSync(agent_work).filter(e => e.startsWith('job-')).length; } catch {}
  console.log(`  ${count} job directories in agent_work/`);
  console.log(col(C.gray, '  purpclaw rollback list     — show available rollback points'));
  console.log(col(C.gray, '  purpclaw rollback undo <id> — rollback a specific job'));
  console.log('');
}




// ── profiles ───────────────────────────────────────────────────────────────────

async function cmdPool(args) {
  const sub   = (args[0] || '').toLowerCase();
  const rest  = args.slice(1).join(' ').trim();
  const POOL_PORT = parseInt(process.env.POOL_PORT || '7880', 10);

  function poolReq(method, path, body) {
    return new Promise((resolve, reject) => {
      const opts = { hostname: '127.0.0.1', port: POOL_PORT, path, method,
        headers: { 'Content-Type': 'application/json', 'X-Pool-Caller': 'cli' } };
      const req = http.request(opts, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
      });
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // ── pool query <text> ──────────────────────────────────────────────────────
  if (sub === 'query' && rest) {
    sectionHead('  KNOWLEDGE POOL · SEARCH');
    console.log(col(C.gray, `  Query: "${rest}"\n`));
    try {
      const res = await poolReq('GET', `/pool/skills/search?q=${encodeURIComponent(rest)}&limit=10`);
      if (!res.results || !res.results.length) {
        console.log(col(C.gray, '  No skills matched.\n'));
        return;
      }
for (const s of res.results) {
        const name = (s.name || '').padEnd(32);
        const desc = col(C.gray, (s.description || '').slice(0, 60));
        console.log(`  ${col(C.cyan, name)}  ${desc}`);
      }
      console.log(col(C.gray, `\n  Try: purpclaw pool show <name>\n`));
    } catch (e) {
      console.error(col(C.red, `  ✗ ${e.message} — is the pool running on :${POOL_PORT}? Try \`purpclaw doctor\`.\n`));
    }
    return;
  }

  // ── pool show <name> ───────────────────────────────────────────────────────
  if (sub === 'show' && rest) {
    sectionHead(`  SKILL · ${rest}`);
    try {
      const res = await poolReq('GET', `/pool/skills/${encodeURIComponent(rest)}`);
      if (res.error) { console.error(col(C.red, `  ✗ ${res.error}\n`)); return; }
      console.log(col(C.gray, `  ${res.description || ''}\n`));
      console.log(res.content);
      console.log('');
    } catch (e) {
      console.error(col(C.red, `  ✗ ${e.message}\n`));
    }
    return;
  }

  // ── pool routing <task text> ───────────────────────────────────────────────
  if (sub === 'routing' && rest) {
    sectionHead('  KNOWLEDGE POOL · ROUTING HINTS');
    console.log(col(C.gray, `  Task: "${rest}"\n`));
    try {
      const res = await poolReq('GET', `/pool/routing/for-task?text=${encodeURIComponent(rest)}`);
      if (!res.hints || !res.hints.length) {
        console.log(col(C.gray, '  No routing hints matched.\n'));
        return;
      }
      for (const h of res.hints) {
        const agent = col(C.cyan, h.agent.padEnd(12));
        const div   = col(C.gray, (h.division || '').padEnd(14));
        const role  = h.role || '';
        console.log(`  ${agent} ${div} ${col(C.white, role)}  ${col(C.gray, '· score ' + h.score)}`);
        if (h.give && h.give.length) console.log(col(C.gray, `    give:  ${h.give.slice(0,3).join(', ')}`));
      }
      console.log('');
    } catch (e) {
      console.error(col(C.red, `  ✗ ${e.message}\n`));
    }
    return;
  }

  // ── pool reindex ───────────────────────────────────────────────────────────
  if (sub === 'reindex') {
    sectionHead('  KNOWLEDGE POOL · REINDEX');
    const spin = spinner('rebuilding index from disk').start();
    try {
      const res = await poolReq('POST', '/pool/reindex', {});
      spin.succeed(`reindexed: ${res.skillsCount} skills · ${res.agentsCount} agents · ${res.routingProfiles || 0} routing profiles`);
      console.log('');
    } catch (e) {
      spin.fail(e.message);
    }
    return;
  }

  // ── pool stats (default) ───────────────────────────────────────────────────
  if (sub === 'stats' || !sub) {
    sectionHead('  KNOWLEDGE POOL · STATS');
    try {
      const m = await poolReq('GET', '/pool/stats');
      console.log(`  Skills indexed   : ${col(C.green, String(m.skillsCount ?? 0))}`);
      console.log(`  Agents indexed   : ${col(C.green, String(m.agentsCount ?? 0))}`);
      console.log(`  Routing profiles : ${col(C.green, String(m.routingProfiles ?? 0))}`);
      console.log(`  Memory entries   : ${col(C.cyan,  String(m.memories ?? 0))}`);
      console.log(`  Failures logged  : ${col(C.cyan,  String(m.failures ?? 0))}`);
      console.log(`  Queries served   : ${col(C.gray,  String(m.queries ?? 0))}`);
      console.log(`  Last indexed     : ${col(C.gray,  m.indexedAt || 'never')}`);
      console.log(`  Uptime           : ${col(C.gray,  (m.uptimeSec || 0) + 's')}`);
      console.log('');
      if (!sub) {
        console.log(col(C.gray, '  Subcommands:'));
        console.log(`    ${col(C.cyan, 'pool query <text>')}      keyword-search skills`);
        console.log(`    ${col(C.cyan, 'pool show <name>')}       full SKILL.md content`);
        console.log(`    ${col(C.cyan, 'pool routing <text>')}    routing hints for a task`);
        console.log(`    ${col(C.cyan, 'pool reindex')}           rebuild from disk`);
        console.log(`    ${col(C.cyan, 'pool recent')}            last few pool queries`);
        console.log('');
      }
    } catch (e) {
      console.error(col(C.red, `  ✗ pool offline (:${POOL_PORT})  —  ${e.message}\n`));
      console.log(col(C.gray, '  Boot it:  purpclaw start  (or)  npx pm2 start ecosystem.config.js --only purpclaw-pool\n'));
    }
    return;
  }

  if (sub === 'recent') {
    sectionHead('  KNOWLEDGE POOL · RECENT QUERIES');
    try {
      const r = await poolReq('GET', '/pool/recent?limit=15');
      if (!r.entries || !r.entries.length) { console.log(col(C.gray, '  No queries yet.\n')); return; }
      for (const e of r.entries) {
        const ts = String(e.ts || '').slice(11, 19);
        console.log(`  ${col(C.gray, ts)}  ${col(C.yellow, (e.method || 'GET').padEnd(4))}  ${col(C.gray, e.path)}`);
      }
      console.log('');
    } catch (e) {
      console.error(col(C.red, `  ✗ ${e.message}\n`));
    }
    return;
  }

  console.log(col(C.gray, `\n  Unknown subcommand "${sub}". Try: purpclaw pool\n`));
}

function cmdProfiles() {
  banner();
  sectionHead('  LAUNCH PROFILES');

  for (const [name, names] of Object.entries(SERVICE_REGISTRY.LAUNCH_PROFILES)) {
    console.log(`  ${col(C.cyan, name.padEnd(10))} ${col(C.gray, `${String(names.length).padStart(2)} services`)}  ${names.join(', ')}`);
  }

  console.log('');
  console.log(col(C.gray, '  Default: purpclaw start -> harness profile'));
  console.log(col(C.gray, '  Preview: purpclaw start --profile=minimal --dry-run\n'));
}

function cmdPolicies(args) {
  const sub = (args[0] || 'show').toLowerCase();
  if (sub === 'init') {
    GOVERNANCE.writePolicy(PURP_DIR, GOVERNANCE.DEFAULT_POLICY);
    console.log(col(C.green, '\n  Wrote purpclaw_policy.json\n'));
    return;
  }
  const policy = GOVERNANCE.readPolicy(PURP_DIR);
  sectionHead('  GOVERNANCE POLICY');
  console.log(JSON.stringify(policy, null, 2).split('\n').map(line => `  ${line}`).join('\n'));
  console.log('');
}

function cmdApprove(args) {
  const sub = (args[0] || 'list').toLowerCase();
  if (sub === 'list') {
    sectionHead('  PENDING APPROVALS');
    const pending = GOVERNANCE.pendingApprovals(PURP_DIR);
    if (!pending.length) {
      console.log(col(C.gray, '  No pending approvals.\n'));
      return;
    }
    for (const item of pending) {
      console.log(`  ${col(C.cyan, item.id)}  ${col(C.gray, item.jobType || 'unknown')}  ${(item.risks || []).join(', ')}`);
      console.log(`    ${item.command || ''}`);
    }
    console.log('');
    return;
  }
  if (args[0] && sub !== 'yes' && sub !== 'no') {
    GOVERNANCE.setApprovalStatus(PURP_DIR, args[0], 'approved');
    console.log(col(C.green, `\n  ${args[0]} approved.\n`));
    return;
  }
  if ((sub === 'yes' || sub === 'no') && args[1]) {
    GOVERNANCE.setApprovalStatus(PURP_DIR, args[1], sub === 'yes' ? 'approved' : 'rejected');
    console.log(col(sub === 'yes' ? C.green : C.yellow, `\n  ${args[1]} ${sub === 'yes' ? 'approved' : 'rejected'}.\n`));
    return;
  }
  console.log(col(C.gray, '\n  Usage: purpclaw approve list | purpclaw approve yes <id> | purpclaw approve no <id>\n'));
}

function cmdJobs(args = []) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'pending') return cmdApprove(['list']);
  if (sub === 'recent') {
    sectionHead('  RECENT APPROVAL LOG');
    const rows = GOVERNANCE.listApprovals(PURP_DIR).slice(-20).reverse();
    if (!rows.length) {
      console.log(col(C.gray, '  No approval log yet.\n'));
      return;
    }
    for (const row of rows) {
      console.log(`  ${col(C.cyan, row.id || '?')}  ${col(C.gray, row.status || 'unknown')}  ${row.command || ''}`);
    }
    console.log('');
    return;
  }
  sectionHead('  JOBS');
  console.log(col(C.gray, '  Live jobs are exposed by the orchestrator when running: purpclaw workflows'));
  console.log(col(C.gray, '  Pending governance holds: purpclaw approve list\n'));
}

function cmdIntrospect() {
  sectionHead('  INTROSPECT');
  const jobs = PROACTIVE.proposeMaintenanceJobs(PURP_DIR, {});
  const contract = JOB_CONTRACT.createJobContract('audit the local build and dependency health, then report exact failing gates');
  console.log(`  Proactive enabled        : ${col(C.yellow, process.env.PURPCLAW_PROACTIVE === '1' ? 'yes' : 'no')}`);
  console.log(`  Default job type sample  : ${col(C.cyan, contract.type)}`);
  console.log(`  Suggested maintenance    : ${col(C.cyan, String(jobs.length))}`);
  for (const job of jobs) console.log(`    - ${job.command} ${col(C.gray, `(${job.reason})`)}`);
  console.log('');
}

function cmdRollback(args) {
  sectionHead('  ROLLBACK');
  console.log(col(C.yellow, '  Rollback is a command surface only right now; no fake restore was run.'));
  console.log(col(C.gray, '  Next required piece: snapshot manifest per approved job, then rollback can restore exact artifacts.\n'));
}

// ── mochi ─────────────────────────────────────────────────────────────────────
async function cmdMochi(args) {
  const mochiLib = require(path.join(PURP_DIR, 'lib', 'mochi'));

  // Subcommands first
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'hatch') {
    const mochi = mochiLib.hatchMochi(args[1] || undefined, args[2] || null);
    console.log('');
    const lines = mochiLib.renderSprite(mochi, 0);
    lines.forEach(l => console.log('  ' + col(C.magenta, l)));
    console.log(`\n  ${col(C.cyan, mochi.name)} — ${col(C.gray, mochi.species + ' · ' + mochi.rarity)}\n`);
    console.log(col(C.gray, '  Hatched. Run `purpclaw mochi` to chat.\n'));
    return;
  }

  if (sub === 'show' || sub === 'card') {
    const mochi = mochiLib.loadMochi();
    console.log('');
    mochiLib.renderSprite(mochi, 0).forEach(l => console.log('  ' + col(C.magenta, l)));
    console.log(`\n  ${col(C.cyan + C.bold, mochi.name)}  ${col(C.gray, '·')}  ${col(C.gray, mochi.species + ' · ' + (mochi.rarity || 'common') + (mochi.shiny ? ' · ✨ shiny' : ''))}`);
    console.log(`  ${col(C.gray, 'eye: ' + mochi.eye + '   hat: ' + (mochi.hat || 'none') + '   tone: ' + (mochi.tone || ''))}`);
    console.log(`  ${col(C.gray, 'hatched: ' + (mochi.hatchedAt || '?') + '   chats: ' + (mochi.interactions || 0))}\n`);
    return;
  }

  // Default → interactive REPL
  const mochi  = mochiLib.loadMochi();
  const status = await mochiLib.snapshotStatus();
  const provider = mochiLib.activeProvider();   // null if no keys

  // ── Header
  console.log('');
  const sprite = mochiLib.renderSprite(mochi, 0);
  sprite.forEach(line => console.log('  ' + col(C.magenta + C.bold, line)));
  const tagline = provider
    ? col(C.green,  `live · ${provider}`)
    : col(C.yellow, 'offline · set ANTHROPIC_API_KEY (or MINIMAX_API_KEY) for chat');
  console.log(`  ${col(C.cyan + C.bold, mochi.name)} ${col(C.gray, '· ' + mochi.species + ' ·')} ${tagline}`);
  if (status.poolOnline) {
    console.log(col(C.gray, `  pool: ${status.skills} skills · ${status.agents} agents · ${status.memories} memories`));
  } else {
    console.log(col(C.yellow, `  pool offline — boot it: purpclaw start`));
  }
  console.log(col(C.gray, '  type your message — "/help" for commands, "bye" to leave\n'));

  // ── REPL with serial line processing
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: col(C.magenta, '  you › '),
    terminal: isTTY,
  });

  let closed   = false;
  let busy     = false;
  const queue  = [];

  function safePrompt() {
    if (!closed) try { rl.prompt(); } catch { /* ignore */ }
  }

  function closeNow() {
    if (closed) return;
    closed = true;
    try { rl.close(); } catch { /* ignore */ }
    process.stdout.write('\x1B[?25h');
  }

  async function handleLine(text) {
    if (!text) return;
    if (text === 'bye' || text === 'exit' || text === 'quit') {
      console.log(col(C.gray, `  ${mochi.name}: *waves a paw*\n`));
      closeNow();
      return;
    }
    if (text === '/help' || text === '?') {
      console.log(col(C.gray, '\n  /help         this list'));
      console.log(col(C.gray, '  /pool <q>     ask the pool directly'));
      console.log(col(C.gray, '  /card         show companion card'));
      console.log(col(C.gray, '  /hatch        roll a new companion'));
      console.log(col(C.gray, '  bye           leave\n'));
      return;
    }
    if (text === '/card') {
      const face = mochiLib.renderFace(mochi);
      console.log(`  ${col(C.magenta, face)} ${col(C.cyan, mochi.name)} · ${col(C.gray, mochi.species + ' · ' + mochi.rarity)}\n`);
      return;
    }
    if (text === '/hatch') {
      const next = mochiLib.hatchMochi(Date.now().toString());
      Object.assign(mochi, next);
      console.log(col(C.cyan, `\n  hatched: ${next.name} (${next.species})`));
      mochiLib.renderSprite(next, 0).forEach(l => console.log('  ' + col(C.magenta, l)));
      console.log('');
      return;
    }
    if (text.startsWith('/pool ')) {
      const q = text.slice(6).trim();
      const ctx = await mochiLib.poolContext(q);
      console.log(col(C.gray, `\n  skills:  ${ctx.skills.map(s => s.name).join(', ') || '—'}`));
      console.log(col(C.gray, `  routing: ${ctx.routing.map(h => h.agent + ' (' + h.role + ')').join(', ') || '—'}`));
      console.log('');
      return;
    }

    const spin = spinner(`${mochi.name} is thinking...`).start();
    try {
      const out  = await mochiLib.reply(mochi, text);
      if (spin._timer) { clearInterval(spin._timer); spin._timer = null; }
      if (isTTY) process.stdout.write('\r\x1b[2K');
      const face = mochiLib.renderFace(mochi);
      console.log(`  ${col(C.magenta, face)} ${col(C.cyan, mochi.name)}: ${col(C.white, out)}\n`);
      mochi.interactions = (mochi.interactions || 0) + 1;
      mochiLib.saveMochi(mochi);
    } catch (e) {
      spin.fail(`${mochi.name} got lost: ${e.message}`);
    }
  }

  async function drainQueue() {
    if (busy) return;
    busy = true;
    while (queue.length && !closed) {
      const text = queue.shift();
      await handleLine(text);
    }
    busy = false;
    safePrompt();
  }

  safePrompt();

  rl.on('line', line => {
    const text = String(line || '').trim();
    if (!text) { safePrompt(); return; }
    queue.push(text);
    drainQueue();
  });

  rl.on('close', closeNow);
  rl.on('SIGINT', closeNow);
}

function cmdSpaghetti(args) {
  const sub = (args[0] || 'audit').toLowerCase();
  const target = args[1];

  if (sub === 'audit') {
    sectionHead('  SPAGHETTI AUDIT');
    const rows = SPAGHETTI.audit(PURP_DIR, { limit: 30 });
    console.log(`  ${'FILE'.padEnd(42)} ${'SCORE'.padStart(5)}  HONKS  VERDICT`);
    console.log(col(C.gray, `  ${'-'.repeat(72)}`));
    for (const row of rows) {
      console.log(`  ${row.file.substring(0, 42).padEnd(42)} ${String(row.score).padStart(5)}  ${String(row.honks).padStart(5)}  ${row.verdict}`);
    }
    console.log('');
    return;
  }

  if ((sub === 'explain' || sub === 'rewrite-plan') && target) {
    const analysis = SPAGHETTI.analyzeFile(PURP_DIR, target);
    sectionHead(sub === 'explain' ? '  SPAGHETTI EXPLAIN' : '  SPAGHETTI REWRITE PLAN');
    console.log(`  File    : ${analysis.file}`);
    console.log(`  Score   : ${analysis.score}`);
    console.log(`  Verdict : ${analysis.verdict}`);
    console.log(`  Metrics : ${JSON.stringify(analysis.metrics, null, 2).split('\n').join('\n            ')}`);
    if (sub === 'rewrite-plan') {
      console.log('\n  Plan:');
      for (const item of SPAGHETTI.rewritePlan(analysis)) console.log(`    - ${item}`);
    }
    console.log('');
    return;
  }

  if (sub === 'diff' && target && args[2]) {
    const before = SPAGHETTI.analyzeFile(PURP_DIR, target);
    const after = SPAGHETTI.analyzeFile(PURP_DIR, args[2]);
    const diff = SPAGHETTI.diffAnalyses(before, after);
    sectionHead('  SPAGHETTI DIFF');
    const delta = diff.scoreDelta;
    const deltaText = delta < 0 ? `${delta}` : `+${delta}`;
    console.log(`  Before : ${before.file}  score ${before.score}  ${before.verdict}`);
    console.log(`  After  : ${after.file}  score ${after.score}  ${after.verdict}`);
    console.log(`  Delta  : ${col(delta < 0 ? C.green : delta > 0 ? C.red : C.gray, deltaText)}`);
    console.log('');
    for (const [metric, value] of Object.entries(diff.metricDelta)) {
      if (value === 0) continue;
      const valueText = value < 0 ? String(value) : `+${value}`;
      console.log(`  ${metric.padEnd(16)} ${col(value < 0 ? C.green : C.red, valueText)}`);
    }
    console.log('');
    return;
  }

  if ((sub === 'quarantine' || sub === 'annona') && target) {
    const analysis = SPAGHETTI.analyzeFile(PURP_DIR, target);
    const command = `spaghetti ${sub} ${analysis.file}`;
    const contract = JOB_CONTRACT.createJobContract(command, {}, { source: 'cli' });
    const gov = GOVERNANCE.checkWorkflow(PURP_DIR, command, contract);
    const approval = GOVERNANCE.requestApproval(PURP_DIR, `spaghetti-${Date.now()}`, command, contract, gov);
    console.log(col(C.yellow, `\n  ${sub} requires approval. No files moved.`));
    console.log(col(C.gray, `  Approval: ${approval.id}`));
    console.log(col(C.gray, `  File: ${analysis.file} (${analysis.verdict}, score ${analysis.score})\n`));
    return;
  }

  console.log(col(C.gray, '\n  Usage: purpclaw spaghetti audit | explain <file> | rewrite-plan <file> | diff <before> <after> | quarantine <file> | annona <file>\n'));
}

// ── help ──────────────────────────────────────────────────────────────────────
function cmdHelp() {
  banner();
  const cmd = (name, desc) =>
    `  ${col(C.cyan, name.padEnd(34))}${col(C.gray, desc)}`;

  console.log(col(C.bold, '  COMMANDS\n'));
  console.log(cmd('purpclaw init',                'Audit env, keys, services (read-only check)'));
  console.log(cmd('purpclaw init --wizard',       'Interactive first-run (pick LLM, paste key, hatch mochi)'));
  console.log(cmd('purpclaw init --template',     'Generate a starter .env file'));
  console.log(cmd('purpclaw start',               'Boot bounded harness profile only'));
  console.log(cmd('purpclaw start --dry-run',     'Show launch plan without starting processes'));
  console.log(cmd('purpclaw start --profile=minimal', 'Boot lean CLI/API/UI harness'));
  console.log(cmd('purpclaw start --profile=voice', 'Boot harness plus voice bridge'));
  console.log(cmd('purpclaw start --all',         'Explicitly boot every PM2 service'));
  console.log(cmd('purpclaw stop',                'Stop bounded harness profile only'));
  console.log(cmd('purpclaw restart [service]',   'Restart a service or bounded harness profile'));
  console.log(cmd('purpclaw chat',                'Open the NanoClaw REPL (swarm-aware)'));
  console.log(cmd('purpclaw run "<task>"',         'One-shot task — streams agent progress live'));
  console.log(cmd('purpclaw status',               'Live dashboard: services + leaderboard + breakers'));
  console.log(cmd('purpclaw doctor',               'Read-only local setup, dependency, and port checks'));
  console.log(cmd('purpclaw policies',             'Show governance policy'));
  console.log(cmd('purpclaw approve list',         'List approval-gated jobs'));
  console.log(cmd('purpclaw jobs',                 'Show job surfaces and governance holds'));
  console.log(cmd('purpclaw introspect',           'Read-only self-inspection summary'));
  console.log(cmd('purpclaw rollback',             'Show rollback readiness'));
  console.log(cmd('purpclaw spaghetti audit',      'Score tangled runtime code risk'));
  console.log(cmd('purpclaw spaghetti diff A B',   'Compare code health before/after'));
console.log(cmd('purpclaw pool query "<text>"',   'Keyword-search the skill index'));
  console.log(cmd('purpclaw pool show <name>',    'Full SKILL.md content'));
  console.log(cmd('purpclaw pool routing "<task>"','Routing hints for a task'));
  console.log(cmd('purpclaw pool reindex',         'Rebuild index from disk'));
  console.log(cmd('purpclaw registry browse',      'See all 139 skills + 38 agents'));
  console.log(cmd('purpclaw install <name>',        'Install a skill from registry'));
  console.log(cmd('purpclaw search "<text>"',      'Keyword-search the registry'));
  console.log(cmd('purpclaw registry publish <n>', 'Publish guide for your own skill'));
  console.log(cmd('purpclaw registry update',      'Rebuild local registry index'));
  console.log(cmd('purpclaw mochi',                'Chat with your companion (animated, pool-aware, LLM-backed)'));
  console.log(cmd('purpclaw mochi hatch [seed]',   'Hatch a new companion'));
  console.log(cmd('purpclaw mochi card',           'Show companion card'));
  console.log(cmd('purpclaw profiles',             'List bounded launch profiles'));
  console.log(cmd('purpclaw agents',               'List all agents, divisions, and scores'));
  console.log(cmd('purpclaw resume list',           'List session checkpoints'));
  console.log(cmd('purpclaw resume <id>',           'Reload a previous session'));
  console.log(cmd('purpclaw bg "<task>"',           'Background dispatch — fire and forget'));
console.log(cmd('purpclaw workflows',            'Show active and recent workflows'));
  console.log(cmd('purpclaw queue',                'Show task queue depth and items'));
  console.log(cmd('purpclaw memory [query]',       'Recall from memory matrix'));
  console.log(cmd('purpclaw memory ingest "<t>"',  'Store a new memory manually'));
  console.log(cmd('purpclaw memory stats',         'Detailed memory matrix stats'));
  console.log(cmd('purpclaw dream',                'Trigger AutoDream memory consolidation'));
  console.log(cmd('purpclaw look [1 2 3]',         'Capture screens + vision analysis (all if none given)'));
  console.log(cmd('purpclaw look --list',          'List available monitors'));
  console.log(cmd('purpclaw look --no-vision',     'Skip LLM describe (YOLO-only, faster)'));
  console.log(cmd('purpclaw look --workspace',     'Show remembered monitor roles and workflow context'));
  console.log(cmd('purpclaw voice "<command>"',    'Send command via voice pipeline shorthand'));
  console.log(cmd('purpclaw config',               'Interactive config editor (↑↓ navigate)'));
  console.log(cmd('purpclaw config show',          'Print current config values'));
  console.log(cmd('purpclaw config set KEY val',   'Set a config key in .env directly'));
  console.log(cmd('purpclaw logs [service]',       'Tail PM2 logs (e.g. purpclaw logs orchestrator)'));
  console.log(cmd('purpclaw help',                 'Show this help'));

  console.log(`\n  ${col(C.bold, 'SERVICES')}  ${col(C.gray, '(named purpclaw-<service> in PM2)')}`);
  const services = [
    ['orchestrator', 7784], ['api', 7780], ['tower', 7790],
    ['eventbus', 7782],     ['state', 7783],['memory', 7880],
    ['voice', 7781],        ['bridge', '—'],['gatekeeper', '—'],
    ['chorus', '—'],        ['vision', '—'],['metrics', 7890],
    ['nextjs', 3000],
  ];
  for (const [svc, port] of services) {
    console.log(`  ${col(C.gray, '·')}  ${svc.padEnd(18)} ${port !== '—' ? col(C.gray, `:${port}`) : ''}`);
  }
  console.log('');
}

// ═════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  const [,, command, ...args] = process.argv;

  // No args — show help
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    cmdHelp();
    return;
  }

  switch (command.toLowerCase()) {
    case 'init':      return cmdInit(args);
    case 'start':     return cmdStart(args);
    case 'stop':      return cmdStop(args);
    case 'restart':   return cmdRestart(args);
    case 'chat':      return cmdChat(args);
    case 'run':       return cmdRun(args);
    case 'status':    return cmdStatus();
    case 'doctor':    return cmdDoctor();
    case 'approve':   return cmdApprove(args);
    case 'reject':    return cmdReject(args);
    case 'jobs':      return cmdJobs(args);
    case 'policies':  return cmdPolicies(args);
    case 'policy':    return cmdPolicies(args);
    case 'introspect': return cmdIntrospect(args);
    case 'rollback':  return cmdRollback(args);
    case 'bg':        return cmdBg(args);
case 'registry': return cmdRegistry(args);
    case 'install':   return cmdRegistry(['install', ...args]);
    case 'search':    return cmdRegistry(['search', ...args]);
    case 'resume':    return cmdResume(args);
    case 'pool':       return cmdPool(args);
    case 'mochi':      return cmdMochi(args);
    case 'spaghetti': return cmdSpaghetti(args);
    case 'agents':    return cmdAgents();
    case 'profiles':  return cmdProfiles();
    case 'workflows': return cmdWorkflows();
    case 'queue':     return cmdQueue();
    case 'memory':    return cmdMemory(args);
    case 'dream':     return cmdDream();
    case 'look':      return cmdLook(args);
    case 'voice':     return cmdVoice(args);
    case 'config':    return cmdConfig(args);
    case 'logs':      return cmdLogs(args);
    default:
      // Unknown command — treat as an inline task for convenience
      // e.g. `purpclaw fix the auth bug` → same as `purpclaw run "fix the auth bug"`
      const task = [command, ...args].join(' ');
      console.log(col(C.gray, `\n  Treating as task: "${task}"`));
      return cmdRun([task]);
  }
}

main().catch(e => {
  console.error(col(C.red, `\n  ✗ Unhandled error: ${e.message}\n`));
  process.exit(1);
});
