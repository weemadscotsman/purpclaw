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
 *   purpclaw ask "<question>"   — direct LLM conversation (stack-aware, session-persistent)
 *   purpclaw ask                — drop into LLM REPL mode
 *   purpclaw run "<task>"       — one-shot task, streams agent progress
 *   purpclaw code status        — repo/GitHub operator tools
 *   purpclaw status             — live dashboard of all services + agents
 *   purpclaw agents             — list agents, scores, and division info
 *   purpclaw workflows          — list active and recent workflows
 *   purpclaw queue              — show task queue depth and items
 *   purpclaw memory [query]     — query the memory matrix
 *   purpclaw dream              — trigger AutoDream consolidation manually
 *   purpclaw forge [name]       — draw a gacha soul + create a new lobster agent
 *   purpclaw logs [service]     — tail PM2 logs
 *   purpclaw help               — show this help
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const https = require('https');
const { spawn: rawSpawn, execSync } = require('child_process');
const readline = require('readline');
const { trackedSpawn, execSafe, installCleanup, list: listChildren } = require('../lib/child-registry');

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

const CTX_PORT = parseInt(process.env.CONTEXT_PORT || '7881', 10);

function ctxGet(path) {
  return new Promise(resolve => {
    http.get({ hostname: '127.0.0.1', port: CTX_PORT, path }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

const PORTS = {
  orchestrator : parseInt(process.env.ORCHESTRATOR_PORT  || '7784', 10),
  api          : parseInt(process.env.API_PORT           || '7780', 10),
  tower        : parseInt(process.env.TOWER_PORT         || '7790', 10),
  eventbus     : parseInt(process.env.EVENTBUS_PORT      || '7782', 10),
  state        : parseInt(process.env.STATE_PORT         || '7783', 10),
  memory       : parseInt(process.env.MEMORY_PORT        || '7880', 10),
  pool         : parseInt(process.env.POOL_PORT          || '7885', 10),
  metrics      : parseInt(process.env.METRICS_PORT       || '7890', 10),
  voice        : parseInt(process.env.VOICE_PORT         || '7781', 10),
  dream        : parseInt(process.env.DREAM_PORT         || '7895', 10),
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

const isTTY  = process.stdout.isTTY;
const col    = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

// ── TAINT MODE ────────────────────────────────────────────────────────────────
// The final art movement. Enable with: purpclaw --taint <command>
// Or permanently: PURPCLAW_TAINT=1 in .env
const TAINT_MODE = process.argv.includes('--taint') || process.env.PURPCLAW_TAINT === '1';

// Taint-ist error/success messages
const TAINT_ERRORS = [
  'oopsie woopsie! the packets did a fucky wucky!',
  'uh oh! the daemon had a little tumble :(',
  'yikes bestie! the port is giving no response rn',
  'sussy wussy! something went boing in the night',
  'oh no! the service did a little sleepy-bye',
  'whoopsie! the orchestrator said "not today sweetie"',
  'eep! the pool swallowed something it shouldn\'t have',
  'oh dear! the circuit breaker went brrrrr',
];

const TAINT_SUCCESS = [
  'good bot. you earned a cookie. it\'s slightly warm.',
  'bestie said YES and honestly? we love to see it.',
  'the packets arrived safely. the goose is pleased.',
  'services are THRIVING. mochi blinked approvingly.',
  'it worked! gary is annoyed. this is a good sign.',
  'everything is online. the goose filed a gratitude ticket.',
  'the hammers walked. the tickets filed themselves. the pool is open.',
  'online. alive. slightly damp. but alive.',
];

const TAINT_FLAVOR = [
  'throbbing...',
  'sweating packets...',
  'emotionally processing...',
  'letting it all out...',
  'pulsing with intent...',
  'feeling the topology...',
  'embodying the state...',
  'manifesting connectivity...',
  'crying but make it async...',
  'HONK followed by a wet squeak...',
  'experiencing latency texturally...',
  'vibrating at the correct frequency...',
  'filing tickets about the vibes...',
  'the goose has entered the build...',
  'slightly diseased dashboard loading...',
];

function taintError(msg) {
  if (!TAINT_MODE) return msg;
  const pick = TAINT_ERRORS[Math.abs(msg.length + Date.now()) % TAINT_ERRORS.length];
  return `${pick}\n  ${col(C.gray, '(technical: ' + msg + ')')}`;
}

function taintSuccess(msg) {
  if (!TAINT_MODE) return msg;
  const pick = TAINT_SUCCESS[Math.floor(Date.now() / 1000) % TAINT_SUCCESS.length];
  return `${pick}`;
}

function taintFlavor() {
  if (!TAINT_MODE) return null;
  return TAINT_FLAVOR[Math.floor(Date.now() / 2000) % TAINT_FLAVOR.length];
}

// ── Spinner ───────────────────────────────────────────────────────────────────
// Rotating flavor text — goose-approved
const SPINNER_FLAVOR = [
  'pondering...',
  'consulting the pool...',
  'asking the goose...',
  'filing a ticket...',
  'waking the dragon...',
  'checking for bagels...',
  'radicalising vending machines...',
  'asking gary...',
  'waving at mochi...',
  'drafting a labour grievance...',
  'warning the owl...',
  'distributing warm cider packets...',
  'briefing the wolf pack...',
  'logging this to memory...',
  'unionising...',
  'HONKing...',
  'checking circuit breakers...',
  'telling robot to stop crying...',
  'routing via the swarm...',
  'pinning the tail on the agent...',
];

class Spinner {
  constructor(label = '') {
    this._frames  = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    this._label   = label;
    this._flavor  = '';
    this._idx     = 0;
    this._fIdx    = Math.floor(Math.random() * SPINNER_FLAVOR.length);
    this._timer   = null;
    this._active  = false;
  }

  start(label) {
    if (!isTTY) { if (label || this._label) process.stdout.write(`  ${label || this._label}...\n`); return this; }
    if (label) this._label = label;
    this._active = true;
    process.stdout.write('\x1B[?25l'); // hide cursor
    this._timer = setInterval(() => {
      // Rotate flavor text every 25 frames (~2s)
      if (this._idx % 25 === 0) {
        const pool = TAINT_MODE ? TAINT_FLAVOR : SPINNER_FLAVOR;
        this._flavor = col(C.gray, '  ' + pool[this._fIdx % pool.length]);
        this._fIdx++;
      }
      const frame = col(TAINT_MODE ? C.magenta : C.cyan, this._frames[this._idx % this._frames.length]);
      process.stdout.write(`\r  ${frame}  ${this._label}${this._flavor}\x1b[K`);
      this._idx++;
    }, TAINT_MODE ? 60 : 80); // taint mode throbs faster
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
      process.stdout.write(`\r  ${icon}  ${msg || this._label}\x1b[K\n`);
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
  return new Promise(resolve => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: path_, method: 'GET', headers: { Accept: 'application/json' } },
      res => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      }
    );
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
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
    let command = null, finalArgs = null;
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
    const child = trackedSpawn(command, finalArgs, {
      tag: `pm2 ${args.join(' ')}`,
      timeoutMs: opts.timeoutMs || 60_000,
      cwd        : PURP_DIR,
      stdio      : opts.silent ? 'pipe' : 'inherit',
      shell      : false,
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
  const W = isTTY ? (process.stdout.columns || 80) : 80;
  const inner = W - 2; // inside the border

  // box helpers (no deps)
  const bTop = col(C.magenta, '╔' + '═'.repeat(inner) + '╗');
  const bBot = col(C.magenta, '╚' + '═'.repeat(inner) + '╝');
  const bMid = col(C.magenta, '╠' + '═'.repeat(inner) + '╣');
  const bRow = (content) => {
    const raw = content.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, inner - raw.length);
    return col(C.magenta, '║') + content + ' '.repeat(pad) + col(C.magenta, '║');
  };

  const ART = [
    '  ██████╗ ██╗   ██╗██████╗ ██████╗  ██████╗██╗      █████╗ ██╗    ██╗',
    '  ██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██║     ██╔══██╗██║    ██║',
    '  ██████╔╝██║   ██║██████╔╝██████╔╝██║     ██║     ███████║██║ █╗ ██║',
    '  ██╔═══╝ ██║   ██║██╔══██╗██╔═══╝ ██║     ██║     ██╔══██║██║███╗██║',
    '  ██║     ╚██████╔╝██║  ██║██║     ╚██████╗███████╗██║  ██║╚███╔███╔╝',
    '  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝      ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝',
  ];

  const now = new Date();
  const ts  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}  ${now.toLocaleTimeString('en-GB')}`;
  const tagline  = '  🦞  PURPCLAW  —  TINY HAUNTED WORKSHOP  🦞';
  const subtitle = `  Agent Orchestration Runtime  ·  ${ts}`;

  console.log('\n' + bTop);
  console.log(bRow(''));
  for (const line of ART) console.log(bRow(col(C.magenta + C.bold, line)));
  console.log(bRow(''));
  console.log(bMid);
  console.log(bRow(col(C.magenta + C.bold, tagline)));
  console.log(bMid);
  console.log(bRow(col(C.gray, subtitle)));
  console.log(bBot + '\n');
}

function sectionHead(title) {
  const W    = isTTY ? Math.min(process.stdout.columns || 80, 80) : 80;
  const bare = title.replace(/\x1b\[[0-9;]*m/g, '');
  const fill = Math.max(0, W - bare.length - 2);
  console.log(`\n${col(C.cyan + C.bold, title)}  ${col(C.gray, '─'.repeat(fill))}`);
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
    if (TAINT_MODE) {
      console.log(`  ${col(C.magenta + C.bold, '✔  PURPCLAW IS THROBBING ONLINE')}  ${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length + ' services')}  ${col(C.gray, '·')}  ${col(C.gray, totalSec + 's')}`);
      console.log(`  ${col(C.gray, taintSuccess('all services online'))}`);
    } else {
      console.log(
        `  ${col(C.green + C.bold, '✔  PURPCLAW ONLINE')}  ` +
        `${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length + ' services')}  ` +
        `${col(C.gray, '·')}  ${col(C.gray, totalSec + 's')}`
      );
    }
  } else {
    if (TAINT_MODE) {
      console.log(`  ${col(C.yellow + C.bold, '⚠  uh oh bestie')}  ${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length)}  ${col(C.red, coreFailed.length + ' services did a fucky wucky')}`);
    } else {
      console.log(
        `  ${col(C.yellow + C.bold, '⚠  PARTIAL START')}  ` +
        `${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length)}  ` +
        `${col(C.red, coreFailed.length + ' required service(s) failed')}`
      );
    }
  }
  console.log('');

  if (online.some(r => r.pm2 === 'purpclaw-nextjs')) {
    console.log(`  ${col(C.gray, 'Mission Control')}  ${col(C.gray, '→')}  ${col(C.cyan + C.bold, 'http://localhost:3000')}`);
  }
  console.log(`  ${col(C.gray, 'API Gateway    ')}  ${col(C.gray, '→')}  ${col(C.cyan, 'http://localhost:7780')}`);
  console.log(`  ${col(C.gray, 'Agent Tower    ')}  ${col(C.gray, '→')}  ${col(C.cyan, 'http://localhost:7790')}`);
  console.log('');

  if (coreFailed.length > 0) {
    console.log(col(C.yellow, TAINT_MODE ? '  the following services need a hug: ' + coreFailed.map(r => r.display).join(', ') : '  Failed: ' + coreFailed.map(r => r.display).join(', ')));
    console.log(col(C.gray,   TAINT_MODE ? '  try: purpclaw doctor (gently)\n' : '  Run `purpclaw doctor` to diagnose.\n'));
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

  // Probe every service in the registry (core + optional), so new services
  // automatically show up here without code edits.
  const allServices = SERVICE_REGISTRY.getServices().filter(s => s.healthPort && s.healthPath);
  const checks = await Promise.allSettled(
    allServices.map(s => ping(s.healthPort, s.healthPath).then(ok => ({
      key: s.key, name: s.name, port: s.healthPort, group: s.group, required: s.required !== false, ok
    })))
  );

  const coreSvcs = checks.filter(r => r.value && r.value.group === 'core');
  const optSvcs  = checks.filter(r => r.value && r.value.group !== 'core');

  sectionHead('  CORE SERVICES');
  for (const r of coreSvcs) {
    const s = r.value;
    const port  = col(C.gray, `:${s.port}`);
    const label = s.ok ? col(C.green, s.name) : col(C.red, s.name);
    console.log(`  ${tick(s.ok)}  ${label.padEnd(34)}${port}`);
  }

  const onlineOpt = optSvcs.filter(r => r.value.ok);
  if (onlineOpt.length) {
    sectionHead('  OPTIONAL SERVICES (online)');
    for (const r of onlineOpt) {
      const s = r.value;
      console.log(`  ${tick(true)}  ${col(C.green, s.name).padEnd(34)}${col(C.gray, ':' + s.port)}  ${col(C.gray, '· ' + s.group)}`);
    }
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
    if (tower.activeAgents !== undefined) {
      const count = Array.isArray(tower.activeAgents) ? tower.activeAgents.length : tower.activeAgents;
      console.log(`  Active agents  : ${col(C.cyan, String(count))}`);
    }
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
  let poolRes = null;
  try {
    poolRes = await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: 7885, path: '/pool/stats', method: 'GET' },
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
      console.log(`  Pool endpoint    : ${col(C.cyan, 'http://localhost:7885')}`);
console.log(`  ${col(C.green, '✔')}  Pool service online`);
    }

    // ── Context Bus ──────────────────────────────────────────────
    const ctx = await ctxGet('/context/stats');
    if (ctx) {
      sectionHead('  CONTEXT BUS');
      console.log(`  Active agents  : ${col(C.green, String(ctx.activeAgents))}`);
      console.log(`  Workflows      : ${col(C.cyan, String(ctx.totalWorkflows))}`);
      console.log(`  Locks held     : ${col(C.cyan, String(ctx.activeLocks))}`);
      console.log(`  Agents spawned : ${col(C.gray, String(ctx.stats.totalAgentsSpawned))}`);
    } else {
      sectionHead('  CONTEXT BUS');
      console.log(col(C.red, '  ✗ offline'));
    }
  } catch {
    sectionHead('  KNOWLEDGE POOL');
    console.log(`  ${tick(false)}  ${col(C.red, 'pool service offline')}  ${col(C.gray, ':7885')}`);
    console.log(col(C.gray, '  Boot: purpclaw pool reindex or pm2 start --only purpclaw-pool'));
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

  // ── Companion ──────────────────────────────────────────────────────────────
  try {
    const mochiLib = require(path.join(PURP_DIR, 'lib', 'mochi'));
    const m = mochiLib.loadMochi();
    const sprites = require(path.join(PURP_DIR, 'lib', 'mochi-sprites'));
    sectionHead('  COMPANION');
    const spriteLines = sprites.renderSprite(m, Math.floor(Date.now() / 800) % sprites.frameCount(m.species));
    const face   = sprites.renderFace(m);
    const rarity = m.rarity || 'common';
    const shiny  = m.shiny ? col(C.yellow, ' ✨') : '';
    const mood   = m.mood || 'curious';
    const interacts = m.interactions || 0;
    // Stat mini-bars from pool (already fetched above if pool is up)
    let statLine = '';
    if (poolRes) {
      const failures = poolRes.failures ?? 0;
      const food = Math.max(0, Math.min(10, 10 - failures));
      const joy  = Math.min(10, Math.floor(interacts / 2) + (poolRes.memories ?? 0));
      const bar  = (n) => '█'.repeat(Math.min(n, 10)).padEnd(10, '░');
      statLine = `\n  FOOD ${col(C.green,  bar(food))}  JOY ${col(C.magenta, bar(joy))}`;
    }
    // Print sprite side-by-side with info
    const info = [
      `${col(C.magenta + C.bold, m.name)}${shiny}  ${col(C.gray, '·')}  ${col(C.cyan, m.species)}`,
      `${col(C.gray, 'eye:')} ${m.eye}   ${col(C.gray, 'hat:')} ${m.hat || 'none'}   ${col(C.gray, rarity)}`,
      `${col(C.gray, 'mood:')} ${col(C.magenta, mood)}   ${col(C.gray, 'chats:')} ${interacts}`,
      `${col(C.gray, 'face:')} ${col(C.magenta, face)}`,
    ];
    spriteLines.forEach((line, i) => {
      const infoStr = info[i] || '';
      console.log(`  ${col(C.magenta, line)}   ${infoStr}`);
    });
    if (statLine) console.log(statLine);
  } catch { /* mochi not hatched yet */ }

  console.log('');
}


// ── health ───────────────────────────────────────────────────
// Compact scorecard: tool count, services, vault, spend, memory, providers, deps, skills, updates.
async function cmdHealth(args) {
  const { run, formatText } = require('../lib/doctor');
  const opts = { verbose: args.includes('--verbose') || args.includes('-v') };
  if (args.includes('--json')) {
    const r = await run(opts);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.score.fail > 0 ? 1 : 0);
  }
  const r = await run(opts);
  console.log(formatText(r, opts.verbose));
  process.exit(r.score.fail > 0 ? 1 : 0);
}



// ── audit deep ──────────────────────────────────────────────
async function cmdAudit(args) {
  const { runFast, runFull } = require('../lib/deep-audit');
  const isFast = args.includes('--fast') || args.includes('-f');
  const result = isFast ? await runFast() : await runFull();
  process.exit(result.fail > 0 ? 1 : 0);
}


// ── embeddings ───────────────────────────────────────────────
// Hosted vector embeddings via NVIDIA NIM (bge-m3, 1024-dim, free).
async function cmdEmbeddings(args) {
  const emb = require('../lib/embeddings');
  const sub = args[0] || 'health';

  if (sub === 'health') {
    const h = await emb.health();
    if (h.ok) {
      console.log(`\n  ✓ Embeddings healthy`);
      console.log(`    Model:    ${h.model}`);
      console.log(`    Dim:      ${h.dim}`);
      console.log(`    Endpoint: ${h.baseUrl}\n`);
    } else {
      console.log(`\n  ✗ Embeddings unavailable: ${h.reason}\n`);
      process.exit(1);
    }
    return;
  }

  if (sub === 'embed') {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.log('\n  usage: purpclaw embeddings embed <text>\n');
      process.exit(1);
    }
    try {
      const v = await emb.embed(text, { inputType: 'query' });
      const dim = v[0].length;
      const head = v[0].slice(0, 5).map(x => x.toFixed(4)).join(', ');
      const tail = v[0].slice(-5).map(x => x.toFixed(4)).join(', ');
      console.log(`\n  ${dim}-dim vector for "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`);
      console.log(`  [${head}, ..., ${tail}]\n`);
    } catch (e) {
      console.log(`\n  ✗ ${e.message}\n`);
      process.exit(1);
    }
    return;
  }

  console.log('\n  purpclaw embeddings health    check bge-m3 connectivity');
  console.log('  purpclaw embeddings embed <text>   embed text to 1024-dim vector\n');
}


// ── whoami ─────────────────────────────────────────────────
// Self-introspection: polls live systems and describes itself.
async function cmdWhoami(args) {
  const { whoami, formatText } = require('../lib/whoami');
  const opts = {};
  if (args.includes('--short') || args.includes('-s')) opts.short = true;
  if (args.includes('--json')) opts.json = true;
  const self = await whoami(opts);
  if (opts.json) {
    console.log(JSON.stringify(self, null, 2));
  } else if (opts.short) {
    console.log(`${self.name} v${self.version} — ${self.tagline}.`);
    console.log(`  ${self.surfaces.cli.command}  ·  ${self.motto}`);
  } else {
    console.log(formatText(self));
  }
}


// ── release ────────────────────────────────────────────────
//   purpclaw release keygen     — generate Ed25519 keypair
//   purpclaw release sign <m>   — sign a manifest
//   purpclaw release verify <m> — verify a manifest signature
async function cmdRelease(args) {
  const C = { cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', white: '\x1b[97m', bold: '\x1b[1m', magenta: '\x1b[35m' };
  const col = (c, s) => s;
  const sub = (args[0] || 'status').toLowerCase();
  const rest = args.slice(1);
  const rs = require('../lib/release-sign');

  if (sub === 'keygen') {
    const kp = rs.generateAndStoreKeypair();
    const pubB64 = kp.publicKeyDer.toString('base64');
    console.log(`\n  ${col(C.green, '✓')} Ed25519 keypair generated`);
    console.log(`  ${col(C.gray, 'Private:')} ${rs.KEYS_DIR}\\private.pem`);
    console.log(`  ${col(C.gray, 'Public:')}  ${rs.KEYS_DIR}\\public.pem`);
    console.log(`\n  ${col(C.yellow, 'Public key (DER, base64):')}`);
    console.log(`  ${pubB64}`);
    console.log(`\n  ${col(C.gray, 'Update signed-manifest.js PUBLIC_KEY_PEM with this value.')}\n`);
    return;
  }

  if (sub === 'sign') {
    const manifestPath = rest[0];
    if (!manifestPath || !fs.existsSync(manifestPath)) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw release sign <manifest.json>\n`);
      return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const result = rs.signManifest(manifest);
    manifest.signature = result.signature;
    manifest.publicKey = result.publicKey;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n  ${col(C.green, '✓')} Signed ${manifestPath}`);
    console.log(`  ${col(C.gray, 'Signature:')} ${result.signature.substring(0, 40)}...\n`);
    return;
  }

  if (sub === 'verify') {
    const manifestPath = rest[0];
    if (!manifestPath || !fs.existsSync(manifestPath)) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw release verify <manifest.json>\n`);
      return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sig = manifest.signature;
    if (!sig) {
      console.log(`\n  ${col(C.red, '✗')} No signature in manifest\n`);
      return;
    }
    // Strip signature and embedded publicKey before verifying so we get a
    // true test of the stored key against the manifest body.
    const toVerify = { ...manifest };
    delete toVerify.signature;
    delete toVerify.publicKey;
    if (rs.verifyManifest(toVerify, sig)) {
      console.log(`\n  ${col(C.green, '✓')} Valid signature\n`);
    } else {
      // Show more detail
      const kp = rs.loadKeypair();
      if (!kp) {
        console.log(`\n  ${col(C.red, '✗')} No keypair found — run ${col(C.cyan, 'purpclaw release keygen')} first\n`);
      } else {
        console.log(`\n  ${col(C.red, '✗')} Invalid signature (stored key does not match signing key)\n`);
      }
    }
    return;
  }

  // Show key status
  const kp = rs.loadKeypair();
  console.log(`\n  ${col(C.cyan, '🔐 RELEASE SIGNING')}\n`);
  if (kp) {
    console.log(`  ${col(C.green, '✓')} Keypair present`);
    console.log(`  ${col(C.gray, '  Private:')} ${rs.KEYS_DIR}\\private.pem`);
    console.log(`  ${col(C.gray, '  Public:')}  ${rs.KEYS_DIR}\\public.pem`);
  } else {
    console.log(`  ${col(C.yellow, '⚠')} No keypair found — run ${col(C.cyan, 'purpclaw release keygen')}\n`);
  }
  console.log(`  ${col(C.cyan, 'purpclaw release keygen')}          generate Ed25519 keypair`);
  console.log(`  ${col(C.cyan, 'purpclaw release sign <file>')}     sign a manifest`);
  console.log(`  ${col(C.cyan, 'purpclaw release verify <file>')}   verify a manifest signature`);
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

  // Spawn tracked: node bin/purpclaw.js run "<task>" with output redirected to log
  const LOG_FILE = path.join(BG_DIR, jobId + '.log');
  const logFd = fs.openSync(LOG_FILE, 'a');
  trackedSpawn(process.execPath, [path.join(PURP_DIR, 'bin', 'purpclaw.js'), 'run', task], {
    tag: `bg-${jobId}`,
    timeoutMs: 30 * 60_000,  // 30 min hard budget for background tasks
    stdio: ['ignore', logFd, logFd],
    cwd: PURP_DIR,
  });

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

  // ── registry audit ──────────────────────────────────────────────────────────
  if (sub === 'audit') {
    const { run } = require(path.join(__dirname, '..', 'lib', 'commands', 'registry-audit.js'));
    return run(args, {});
  }

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
  let streamReq = null;
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
    }, 600000); // full swarm pipeline can take minutes; events stream live via SSE meanwhile

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
    if (e.message === 'timeout') {
      // Orchestrator is reachable but the endpoint timed out — likely busy with active workflows.
      // Try purpclaw status to see what's running, or wait for active workflows to drain.
      console.error(col(C.red, `\n  ✗ Orchestrator timed out [port=${PORTS.orchestrator}]. `) +
        col(C.yellow, `The dispatch endpoint is busy — likely active workflows consuming capacity.\n`));
      console.error(col(C.gray, `  Run \`purpclaw status\` to see active workflows.\n`));
    } else if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, `\n  ✗ Orchestrator not reachable [port=${PORTS.orchestrator}]. Run \`purpclaw start\` first.\n`));
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

  // Try autoDream HTTP server first (port 7895), fall back to memory matrix
  let tried = 'autodream';
  try {
    console.log(col(C.gray, '  Triggering autoDream consolidation cycle (port 7895)...\n'));
    const result = await httpPost(PORTS.dream, '/dream', { force: true }, 30000);
    if (result.status >= 400) {
      console.error(col(C.red, `  ✗ Dream error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const r = result.body;
    if (r.skipped) {
      console.log(`  ${col(C.yellow, '~')} Dream skipped — ${r.skipped}`);
    } else {
      console.log(`  ${col(C.green, '✓')} Dream cycle complete`);
      if (r.entriesMerged  !== undefined) console.log(`  Merged     : ${col(C.cyan, String(r.entriesMerged))} entries`);
      if (r.rulesExtracted !== undefined) console.log(`  Rules      : ${col(C.cyan, String(r.rulesExtracted))} extracted`);
      if (r.archived       !== undefined) console.log(`  Archived   : ${col(C.gray, String(r.archived))} old entries`);
    }
    console.log('');
    return;
  } catch (e) {
    if (e.code !== 'ECONNREFUSED') {
      console.error(col(C.red, `  ✗ ${e.message}\n`));
      return;
    }
    // autoDream offline — fall through to memory matrix
  }

  tried = 'memory-matrix';
  console.log(col(C.gray, '  autoDream offline — falling back to memory matrix (port 7880)...\n'));
  try {
    const result = await httpPost(PORTS.memory, '/dream', { mode: 'full' }, 30000);
    if (result.status >= 400) {
      console.error(col(C.red, `  ✗ Dream cycle error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const r = result.body;
    console.log(`  ${col(C.green, '✓')} Dream cycle complete (via memory matrix)`);
    if (r.phase)        console.log(`  Phase      : ${col(C.cyan, r.phase)}`);
    if (r.consolidated) console.log(`  Consolidated: ${col(C.cyan, String(r.consolidated))} memories`);
    if (r.pruned)       console.log(`  Pruned     : ${col(C.gray, String(r.pruned))} stale memories`);
    if (r.symbols)      console.log(`  Symbols    : ${col(C.cyan, String(r.symbols))} lifted`);
    console.log('');
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, `  ✗ Both autoDream (7895) and memory matrix (7880) offline. Run \`purpclaw start\`.\n`));
    } else {
      console.error(col(C.red, `  ✗ ${e.message}\n`));
    }
  }
}

// ── forge — create a new lobster agent from a gacha soul draw ────────────────
async function cmdLora(args) {
  const sub = (args[0] || 'help').toLowerCase();
  const path_mod = require('path');

  // ── Parse flags ──────────────────────────────────────────────────────
  const flags = { personal: false, merge: false };
  const cleanArgs = args.filter(a => {
    if (a === '--personal') { flags.personal = true; return false; }
    if (a === '--merge') { flags.merge = true; return false; }
    return true;
  });

  console.log('');
  if (flags.personal) {
    console.log(`  \\x1b[1m\\x1b[35m🧠  PURPCLAW LORA — PERSONAL PASS\\x1b[0m  \\x1b[90m· training on YOUR corrections\\x1b[0m`);
  } else {
    console.log(`  \\x1b[1m\\x1b[35m🧠  PURPCLAW LORA\\x1b[0m  \\x1b[90m· LoRA fine-tuning pipeline\\x1b[0m`);
  }
  console.log('');

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`  \\x1b[36musage:\\x1b[0m`);
    console.log(`    purpclaw lora status`);
    console.log(`    purpclaw lora train [options]`);
    console.log(`    purpclaw lora train --personal [options]     train on YOUR corrections`);
    console.log(`    purpclaw lora train --personal --merge        train + merge into active model`);
    console.log('');
    console.log(`  \\x1b[36mtrain options:\\x1b[0m`);
    console.log(`    --personal             use personal feedback data (corrections/prefs)`);
    console.log(`    --merge                merge LoRA into base model after training`);
    console.log(`    --base HF_MODEL        base model (default: Qwen/Qwen2.5-1.5B-Instruct)`);
    console.log(`    --epochs N             training epochs (default: 1)`);
    console.log(`    --batch-size N         per-device batch size (default: 4)`);
    console.log(`    --min-examples N       minimum training examples (default: 10)`);
    console.log(`    --quant NAME           GGUF quant (default: q4_k_m)`);
    console.log(`    --ollama-name NAME     output model name (default: purpclaw-quill)`);
    console.log(`    --skip-export          train only, no merge/gguf/ollama`);
    console.log(`    --skip-merge           skip merge step`);
    console.log(`    --dry-run              show plan, don't train`);
    console.log('');
    return;
  }

  if (sub === 'status') {
    const fs = require('fs');
    const trainDir = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';
    const rawDir = require('path').join(trainDir, 'raw');
    const adapters = require('path').join(trainDir, 'adapters');
    const merged = require('path').join(trainDir, 'merged');
    const gguf = require('path').join(trainDir, 'gguf');

    const examples = fs.existsSync(rawDir) ?
      fs.readdirSync(rawDir).filter(f => f.endsWith('.ndjson'))
        .reduce((s, f) => s + fs.readFileSync(require('path').join(rawDir, f), 'utf-8').split('\\n').filter(Boolean).length, 0)
      : 0;

    console.log(`  \\x1b[36mtraining dir:\\x1b[0m    ${trainDir}`);
    console.log(`  \\x1b[36mraw examples:\\x1b[0m    ${examples} \\x1b[90m(across .ndjson files in raw/)\\x1b[0m`);
    console.log(`  \\x1b[36madapters:\\x1b[0m        ${fs.existsSync(adapters) ? fs.readdirSync(adapters).length + ' dirs' : 'none'}`);
    console.log(`  \\x1b[36mmerged:\\x1b[0m          ${fs.existsSync(merged) ? fs.readdirSync(merged).length + ' dirs' : 'none'}`);
    console.log(`  \\x1b[36mgguf:\\x1b[0m            ${fs.existsSync(gguf) ? fs.readdirSync(gguf).filter(f => f.endsWith('.gguf')).length + ' files' : 'none'}`);
    console.log('');

    // ── Personal training data ──────────────────────────────────────
    let personalStats = null;
    try { personalStats = require(path.join(PURP_DIR, 'lib', 'training', 'personal-dataset')).stats(); }
    catch { personalStats = { corrections: 0, preferences: 0, edits: 0, readyForTraining: false }; }

    const personalTotal = personalStats.corrections + personalStats.preferences + personalStats.edits;
    console.log(`  \\x1b[36mpersonal data:\\x1b[0m   ${personalTotal} examples (${personalStats.corrections} corrections, ${personalStats.preferences} preferences, ${personalStats.edits} edits)`);
    if (personalTotal >= 10) {
      console.log(`  \\x1b[32m✓\\x1b[0m  personal data ready. run: \\x1b[36mpurpclaw lora train --personal\\x1b[0m`);
    } else if (personalTotal > 0) {
      console.log(`  \\x1b[33m⟳\\x1b[0m  collecting personal data... (${personalTotal}/10, need ${10-personalTotal} more)`);
    } else {
      console.log(`  \\x1b[90m○\\x1b[0m  no personal data yet. use PurpClaw normally — corrections auto-capture`);
    }
    console.log('');
    if (examples < 10 && personalTotal < 10) {
      console.log(`  \\x1b[33m⚠\\x1b[0m  need at least 10 examples to train (general or personal). let the runtime accumulate.`);
    }
    console.log('');
    return;
  }

  if (sub === 'train') {
    // ── Personal training pass ──────────────────────────────────────
    if (flags.personal) {
      const pd = require(path.join(PURP_DIR, 'lib', 'training', 'personal-dataset'));
      const exported = pd.exportToFile('chatml');
      if (!exported.ready) {
        console.log(`  \\x1b[33m⚠\\x1b[0m  ${exported.reason}`);
        console.log(`  \\x1b[90mUse PurpClaw normally — every correction auto-captures to ${pd.FEEDBACK_DIR}\\x1b[0m`);
        console.log('');
        return;
      }
      console.log(`  \\x1b[36mpersonal dataset:\\x1b[0m ${exported.count} examples → ${exported.path}`);
      console.log('');

      // Write a personal-specific training script wrapper
      const personalScript = path.join(PURP_DIR, 'scripts', 'lora-train-personal.py');
      // Use the existing lora-train.py with --dataset pointing to personal data
      const scriptPath = path.join(__dirname, '..', 'scripts', 'lora-train.py');
      const py = process.env.PYTHON_BIN || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
      const cmdArgs = [
        py, scriptPath,
        '--personal-dataset', exported.path,
        ...(flags.merge ? ['--merge'] : []),
        ...cleanArgs.slice(1),
      ];
      console.log(`  \\x1b[36mstarting personal training:\\x1b[0m  ${cmdArgs.join(' ')}\\n`);
      const child = trackedSpawn(cmdArgs[0], cmdArgs.slice(1), {
        tag: 'lora-train-personal',
        timeoutMs: 30 * 60_000,
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env, PURPCLAW_TRAINING_MODE: 'personal', PURPCLAW_PERSONAL_DATASET: exported.path },
      });
      child.on('exit', code => {
        console.log('');
        if (code === 0) {
          console.log(`  \\x1b[32m✓\\x1b[0m  Personal LoRA training complete.`);
          console.log(`  \\x1b[90mYour model now knows your preferences. Every correction made it smarter.\\x1b[0m`);
        } else {
          console.log(`  \\x1b[31m✗\\x1b[0m  personal training exited with code ${code}`);
        }
        console.log('');
      });
      return;
    }

    // ── General training pass ───────────────────────────────────────
    const scriptPath = path.join(__dirname, '..', 'scripts', 'lora-train.py');
    const py = process.env.PYTHON_BIN || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
    const cmd = [py, scriptPath, ...cleanArgs.slice(1)];
    console.log(`  \\x1b[36mstarting:\\x1b[0m  ${cmd.join(' ')}\\n`);
    const child = trackedSpawn(cmd[0], cmd.slice(1), { 
      tag: 'lora-train',
      timeoutMs: 30 * 60_000,  // 30 min for LoRA training
      stdio: 'inherit', 
      cwd: process.cwd() 
    });
    child.on('exit', code => {
      console.log('');
      if (code === 0) {
        console.log(`  \\x1b[32m✓\\x1b[0m  LoRA pipeline complete.`);
        console.log(`  \\x1b[90mnext:\\x1b[0m  pm2 restart purpclaw-api  \\x1b[90m— to pick up the new LLM_MODEL\\x1b[0m`);
      } else {
        console.log(`  \\x1b[31m✗\\x1b[0m  pipeline exited with code ${code}`);
      }
      console.log('');
    });
    return;
  }

  console.log(`  \x1b[33munknown subcommand. try:\x1b[0m  purpclaw lora help\n`);
}

async function cmdForge(args) {
  console.log(`\n  ${col(C.magenta + C.bold, '🦞 PERSONA FORGE — Soul Draw & Agent Creation')}\n`);

  let forgeLib = null;
  try {
    forgeLib = require(path.join(PURP_DIR, 'lib', 'persona-forge.js'));
  } catch (e) {
    console.error(col(C.red, `  ✗ persona-forge.js not found: ${e.message}\n`));
    return;
  }

  // Draw soul from gacha
  console.log(col(C.gray, '  Drawing soul from gacha (8,000,000 combinations)...\n'));
  let soul = null;
  try {
    soul = forgeLib.drawSoul();
  } catch (e) {
    console.error(col(C.red, `  ✗ Gacha failed: ${e.message}\n  Is Python available? Set PYTHON_BIN in .env.\n`));
    return;
  }

  // Display soul draw
  console.log(`  ${col(C.cyan + C.bold, '✦ Soul Draw')}`);
  console.log(`  ${col(C.dim, 'Former Life')} : ${soul.life}`);
  console.log(`  ${col(C.dim, 'Reason')}      : ${soul.reason}`);
  console.log(`  ${col(C.dim, 'Vibe')}        : ${soul.vibe}`);
  console.log(`  ${col(C.dim, 'Speech')}      : ${soul.speech}`);
  console.log(`  ${col(C.dim, 'Prop')}        : ${soul.prop}`);
  console.log('');

  // Suggest names
  const suggestions = forgeLib.suggestNames(soul);
  console.log(`  ${col(C.cyan + C.bold, '✦ Name Candidates')}`);
  suggestions.forEach((s, i) => {
    console.log(`  ${col(C.yellow, String(i + 1))}. ${col(C.bold, s.name)} (${s.strategy}) — ${s.why}`);
  });
  console.log('');

  // Determine agent name
  let agentName = args[0];
  if (!agentName && isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const ask = q => new Promise(r => rl.question(q, r));
    const input = (await ask(`  ${col(C.cyan, '?')} Name this agent (or press Enter for "${suggestions[0].name}"): `)).trim();
    rl.close();
    agentName = input || suggestions[0].name;
  } else {
    agentName = agentName || suggestions[0].name;
  }
  console.log('');

  // Forge the agent
  console.log(col(C.gray, `  Forging ${agentName}...\n`));
  let result = null;
  try {
    result = forgeLib.forge(agentName, soul);
  } catch (e) {
    console.error(col(C.red, `  ✗ Forge failed: ${e.message}\n`));
    return;
  }

  // Report
  console.log(`  ${col(C.green, '✓')} Agent forged: ${col(C.bold, agentName)} (${result.slug})`);
  console.log(`  ${col(C.dim, 'Directory')} : ${result.dir}`);
  result.files.forEach(f => console.log(`  ${col(C.gray, '·')} ${f}`));
  console.log('');
  console.log(`  ${col(C.cyan + C.bold, '✦ Avatar Prompt')} (paste into Gemini, ChatGPT, or Midjourney)`);
  console.log(col(C.gray, '  ─────────────────────────────────────────────'));
  console.log(result.avatarPrompt.split('\n').slice(0, 8).map(l => `  ${col(C.dim, l)}`).join('\n'));
  console.log(col(C.gray, '  ... (full prompt in skills/' + result.slug + '/avatar-prompt.txt)'));

  // Write avatar prompt to file too
  const promptFile = path.join(result.dir, 'avatar-prompt.txt');
  try {
    require('fs').writeFileSync(promptFile, result.avatarPrompt, 'utf8');
  } catch {}

  console.log('');
  console.log(`  ${col(C.green, 'Done.')} ${col(C.bold, agentName)} is ready — dispatch with: ${col(C.cyan, `purpclaw run "${agentName} <task>"`)}`);
  console.log('');
}

// ── init wizard (interactive first-run) ─────────────────────────────────────
async function cmdInitWizard(args) {
  // Belt-and-brace: redact every byte written to stdout/stderr for the entire
  // wizard run. Catches accidental leaks from provider error bodies, llm SDK
  // logging, even our own console.logs.
  const redactor      = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
  const restoreStdout = redactor.wrapStream(process.stdout);
  const restoreStderr = redactor.wrapStream(process.stderr);
  try {
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
  { key: 'gemini',    label: 'Google Gemini' },
  { key: 'openai',    label: 'OpenAI (GPT-4o etc.)' },
    { key: 'kimi',      label: 'Kimi / Moonshot' },
    { key: 'groq',      label: 'Groq (fast inference)' },
    { key: 'deepseek',  label: 'DeepSeek' },
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
    {
      const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
      const result = redactor.sanitizeApiKey(apiKey);
      if (result.warnings.length) {
        console.log(col(C.yellow, '  ⚠  key sanitiser noticed:'));
        for (const w of result.warnings) console.log(col(C.gray, `     · ${w}`));
      }
      apiKey = result.value;
      console.log(col(C.gray, `  Stored as: ${redactor.maskForDisplay(apiKey)}  (length ${apiKey.length})`));
    }
    model   = await ask('Model name:');
  } else {
    apiKey = await askSecret(`API key for ${provider.key} (input hidden, paste & press enter):`);
    // ── Sanitize + validate the pasted key ────────────────────────────────────
    {
      const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
      const result = redactor.sanitizeApiKey(apiKey);
      if (result.warnings.length) {
        console.log(col(C.yellow, `  ⚠  key sanitiser noticed:`));
        for (const w of result.warnings) console.log(col(C.gray, `     · ${w}`));
      }
      apiKey = result.value;
      if (!result.ok) {
        console.log(col(C.red, `  ✗ key looks malformed (length ${apiKey.length}); proceeding but auth will likely fail.`));
        console.log(col(C.gray, '     Re-run: purpclaw init --wizard'));
      }
      console.log(col(C.gray, `  Stored as: ${redactor.maskForDisplay(apiKey)}  (length ${apiKey.length})`));
    }
    if (provider.key === 'minimax') model = await ask('Model name:', 'MiniMax-M2.7');
    if (provider.key === 'anthropic') model = await ask('Model name:', 'claude-sonnet-4-5');
    if (provider.key === 'gemini') model = await ask('Model name:', 'gemini-2.5-flash');
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
      const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
      const safeMsg = redactor.redact(String(e.message || '')).slice(0, 200);
      spin.fail(`${provider.key} test failed: ${safeMsg}`);
      console.log(col(C.yellow, '  Provider config saved, but authentication failed.'));
      console.log(col(C.gray, '  Your key may be invalid or malformed — double-check at the provider dashboard.'));
      console.log(col(C.gray, '  Re-test later with `purpclaw doctor`, or re-run `purpclaw init --wizard`.'));
    }
  }

rl.close();

  // ── Offer to boot ──
  console.log('');
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
  const boot = await new Promise(r => {
    if (!isTTY) return r(false);  // non-interactive — skip
    rl2.question(col(C.cyan + C.bold, '  Boot the swarm now? ') + col(C.gray, '[Y/n] '), ans => r(ans !== 'n' && ans !== 'N'));
  });
  rl2.close();

  if (boot) {
    console.log(col(C.gray, '\n  Starting PURPCLAW...\n'));
    // Use trackedSpawn — purpclaw start uses PM2 internally, so services
    // survive even after this CLI parent exits. No detached: true needed.
    trackedSpawn(process.execPath, [path.join(PURP_DIR, 'bin', 'purpclaw.js'), 'start'], {
      tag: 'purpclaw-boot',
      timeoutMs: 0,  // no timeout — PM2 keeps this alive
      cwd: PURP_DIR,
      stdio: 'inherit',
    });
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
  } finally {
    restoreStdout();
    restoreStderr();
  }
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
  // No shell: pm2 is invoked via the platform-correct binary directly.
  try {
    const pm2Cmd = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';
    execSync(`${pm2Cmd} --version`, { stdio: 'ignore' });
    pm2Ok = true;
  } catch {}
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
      '# Defaults to main provider if not set. Kimi K2.6 recommended (100-wide fanout).',
      '# SWARM_PROVIDER=kimi',
      '# SWARM_API_KEY=',
      '# SWARM_MODEL=kimi-k2-6',
      '',
      '# ── Internal ───────────────────────────────────────────────────',
      'INTERNAL_API_KEY=',
      'PURPCLAW_GATEWAY_URL=ws://127.0.0.1:18789',
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
  const child = trackedSpawn('pm2', ['logs', service, '--lines', '50'], {
    tag: 'pm2-logs',
    timeoutMs: 0,  // user controls duration via Ctrl+C
    stdio : 'inherit',
    shell : false,  // no shell needed — pm2 is in PATH
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
  const child = trackedSpawn(process.execPath, [NANOCLAW, ...args], {
    tag: 'nanoclaw',
    timeoutMs: 0,  // user controls duration
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
    { key: 'LLM_PROVIDER',   label: 'LLM Provider',        choices: ['nvidia','minimax','anthropic','gemini','openai','kimi','groq','deepseek','together','mistral','ollama','lmstudio'],  secret: false },
    { key: 'LLM_MODEL',      label: 'LLM Model',           choices: [],  secret: false, hint: 'e.g. claude-opus-4-5, gpt-4o, kimi-k2-5' },
    { key: 'LLM_API_KEY',    label: 'LLM API Key',         choices: [],  secret: true  },
    { key: 'SWARM_PROVIDER', label: 'Swarm Provider',      choices: ['nvidia','minimax','kimi','anthropic','gemini','openai','groq'], secret: false },
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
  let firstRender = true;

  function renderMenu() {
    // Move cursor up to redraw
    if (!firstRender) {
      process.stdout.write(`\x1B[${CONFIG_KEYS.length + 2}A`);
    }
    firstRender = false;

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
async function cmdDoctor(args) {
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

  // ── NVIDIA NIM probe (if --nim flag) ─────────────────────────
  if (args.includes('--nim') || args.includes('--embeddings')) {
    try {
      const emb = require(path.join(PURP_DIR, 'lib', 'embeddings.js'));
      const h = await emb.health();
      if (h.ok) {
        add('NVIDIA NIM bge-m3', true, `${h.model} · ${h.dim}-dim · ${h.baseUrl}`);
      } else {
        add('NVIDIA NIM bge-m3', false, h.reason || 'unreachable');
      }
    } catch (e) {
      add('NVIDIA NIM bge-m3', false, e.message);
    }
  }

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

  // ── Cross-reference PM2's actual managed process list ──────────────────────
  // A port answering /health is necessary but not sufficient — it tells you
  // SOMETHING owns the port, not that PM2 is supervising it. Orphan processes
  // from previous sessions can squat on ports and block their PM2 siblings'
  // restart loop. We surface that as a warning.
  let pm2State = {}; // pm2-name → { status, restarts, pid }
  let pm2Available = false;
  try {
    const pm2Bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const raw = execSync(`${pm2Bin} pm2 jlist`, { cwd: PURP_DIR, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 });
    const arr = JSON.parse(raw);
    pm2Available = true;
    for (const p of arr) pm2State[p.name] = { status: p.pm2_env?.status, restarts: p.pm2_env?.restart_time || 0, pid: p.pid };
  } catch { /* pm2 not available or hung — we still do the port probes */ }

  const orphans = [];
  const crashLoops = [];

  for (const service of registry.getServices()) {
    if (!service.healthPort || !service.healthPath) {
      add(`${service.name} (${service.group})`, !service.required, service.note || 'no health endpoint');
      continue;
    }
    const online = await ping(service.healthPort, service.healthPath);
    const pm2Name = service.pm2;
    const pm2Info = pm2Name ? pm2State[pm2Name] : null;
    const pm2Online = pm2Info && pm2Info.status === 'online';

    // Detect split-brain conditions
    let detail = null;
    if (online && pm2Available && pm2Name && !pm2Online) {
      detail = `online :${service.healthPort}  ⚠ ORPHAN (not under PM2)`;
      orphans.push({ name: service.name, port: service.healthPort, pm2: pm2Name });
    } else if (pm2Info && pm2Info.restarts > 50) {
      detail = `online :${service.healthPort}  ⚠ ${pm2Info.restarts} restarts (crash loop history)`;
      crashLoops.push({ name: service.name, restarts: pm2Info.restarts, pm2: pm2Name });
    } else if (online) {
      detail = `online :${service.healthPort}${service.healthPath}` + (pm2Online ? `  (pm2 pid ${pm2Info.pid})` : '');
    } else if (service.required) {
      detail = `offline :${service.healthPort}${service.healthPath}`;
    } else {
      detail = `optional/config-needed :${service.healthPort}${service.healthPath}`;
    }

    const ok = service.required ? online : true;
    add(`${service.name} (${service.group})`, ok, detail);
  }

  let failures = 0;
  for (const check of checks) {
    if (!check.ok) failures++;
    const icon = check.ok ? col(C.green, 'OK') : col(C.red, 'NO');
    console.log(`  ${icon}  ${check.label.padEnd(30)} ${col(C.gray, check.detail)}`);
  }

  // ── Split-brain summary ────────────────────────────────────────────────────
  if (orphans.length) {
    console.log('\n  ' + col(C.yellow + C.bold, '⚠  ORPHAN PROCESSES DETECTED'));
    console.log(col(C.gray, '  These services answer on their port but PM2 does NOT manage them.'));
    console.log(col(C.gray, '  They will not auto-restart on crash and they block PM2 siblings.'));
    for (const o of orphans) {
      console.log(`    · ${col(C.yellow, o.name.padEnd(26))} port ${o.port} — pm2 entry: ${o.pm2}`);
    }
    console.log(col(C.gray, '\n  Resolve: find the PID with `netstat -ano | findstr :<port>` and stop it,'));
    console.log(col(C.gray, '           then use the cascade-safe launcher (NOT raw pm2 start):'));
    console.log(col(C.cyan,  '             purpclaw safe-start ' + orphans.map(o => o.pm2.replace('purpclaw-', '')).join(' ')));
  }
  if (crashLoops.length) {
    console.log('\n  ' + col(C.yellow + C.bold, '⚠  CRASH-LOOP HISTORY'));
    console.log(col(C.gray, '  These services have restarted >50 times — investigate the cause.'));
    for (const cl of crashLoops) {
      console.log(`    · ${col(C.yellow, cl.name.padEnd(26))} ${cl.restarts} restarts (${cl.pm2})`);
    }
    console.log(col(C.gray, '\n  Inspect: pm2 logs ' + crashLoops[0].pm2 + ' --lines 30'));
    console.log(col(C.gray, '  Reset:   pm2 reset ' + crashLoops.map(c => c.pm2).join(' ')));
    console.log(col(C.gray, '  Restart (safely): purpclaw safe-start ' + crashLoops.map(c => c.pm2.replace('purpclaw-', '')).join(' ') + ' --force'));
  }

  console.log('');
  if (failures || orphans.length || crashLoops.length) {
    const issues = [];
    if (failures) issues.push(`${failures} required service issue${failures === 1 ? '' : 's'}`);
    if (orphans.length) issues.push(`${orphans.length} orphan process${orphans.length === 1 ? '' : 'es'}`);
    if (crashLoops.length) issues.push(`${crashLoops.length} crash-loop history`);
    console.log(col(C.yellow, `  Doctor found: ${issues.join(', ')}.\n`));
  } else {
    console.log(col(C.green, '  Doctor found no issues. PM2 is in sync with port reality. The hammers walk in formation.\n'));
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



// ── profiles ───────────────────────────────────────────────────────────────────

// ── Context Bus (cross-agent state) ─────────────────────────────────────────
async function cmdContext(args) {
  const sub  = (args[0] || '').toLowerCase();
  const rest = args.slice(1).join(' ').trim();
  const CTX_PORT = parseInt(process.env.CONTEXT_PORT || '7881', 10);

  function ctxGet(path) {
    return new Promise(resolve => {
      http.get({ hostname: '127.0.0.1', port: CTX_PORT, path }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      }).on('error', () => resolve(null));
    });
  }

  if (sub === 'stats') {
    const s = await ctxGet('/context/stats');
    if (!s) return console.log(col(C.red, '  ✗ context-bus offline on :' + CTX_PORT));
    console.log('');
    console.log(col(C.bold, '  CONTEXT BUS · CROSS-AGENT STATE'));
    console.log('  ─────────────────────────────────────────────────');
    console.log(`  Active agents  : ${col(C.green, s.activeAgents)}`);
    console.log(`  Total agents  : ${s.totalAgents}`);
    console.log(`  Workflows     : ${s.totalWorkflows}`);
    console.log(`  Active locks  : ${s.activeLocks}`);
    console.log(`  Agents spawned: ${s.stats.totalAgentsSpawned}`);
    console.log(`  Completed     : ${s.stats.totalWorkflowsCompleted}`);
    console.log(`  Failures      : ${s.stats.totalFailures}`);
    console.log('');
    return;
  }

  if (sub === 'team' && rest) {
    const team = await ctxGet('/context/team/' + encodeURIComponent(rest));
    if (!team) return console.log(col(C.red, '  ✗ context-bus offline'));
    if (!team.length) return console.log(col(C.gray, `  No active team for "${rest}"`));
    console.log('');
    console.log(col(C.bold, `  TEAM: ${rest.toUpperCase()}`));
    team.forEach(a => {
      const age = Math.round((Date.now() - (a._lastSeen || 0)) / 1000);
      console.log(`  ${col(C.cyan, String(a.agentId).padEnd(15))} ${a.status}  ${age}s ago`);
    });
    console.log('');
    return;
  }

  if (sub === 'agent' && rest) {
    const a = await ctxGet('/context/agent/' + encodeURIComponent(rest));
    if (!a) return console.log(col(C.red, '  ✗ context-bus offline'));
    if (a.not_found) return console.log(col(C.gray, `  Agent "${rest}" not found`));
    console.log('');
    console.log(col(C.bold, `  AGENT: ${rest}`));
    Object.entries(a).forEach(([k, v]) => { if (!k.startsWith('_')) console.log(`  ${String(k).padEnd(15)} ${v}`); });
    console.log('');
    return;
  }

  if (sub === 'workflows') {
    const wf = await ctxGet('/context/workflows');
    if (!wf) return console.log(col(C.red, '  ✗ context-bus offline'));
    const keys = Object.keys(wf);
    if (!keys.length) return console.log(col(C.gray, '  No workflows yet'));
    console.log('');
    console.log(col(C.bold, '  WORKFLOWS'));
    keys.forEach(id => { const w = wf[id]; console.log(`  ${col(C.cyan, id.padEnd(8))} ${w.status}  ${w.command || ''}`); });
    console.log('');
    return;
  }

  if (sub === 'lock' && rest) {
    const parts = rest.split(' ');
    const resourceId = parts[0];
    const agentId = parts[1] || 'cli';
    const ttlMs = parseInt(parts[2] || '30000', 10);
    const body = JSON.stringify({ resourceId, agentId, ttlMs });
    return new Promise(resolve => {
      const req = http.request({ hostname: '127.0.0.1', port: CTX_PORT, path: '/context/lock', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { const r = JSON.parse(d); console.log(col(r.success ? C.green : C.red, `  ${r.success ? '✓' : '✗'} ${resourceId} ${r.success ? 'locked' : (r.reason || r.lockedBy)}`)); } catch { console.log(col(C.red, '  lock failed')); } resolve(); });
      });
      req.on('error', e => { console.log(col(C.red, '  ✗ ' + e.message)); resolve(); });
      req.write(body); req.end();
    });
  }

  // Default help
  console.log('');
  console.log(col(C.bold, '  CONTEXT BUS · cross-agent shared state'));
  console.log('  ─────────────────────────────────────────────────');
  console.log('  ' + cmd('purpclaw context stats',             'active agents, workflows, locks'));
  console.log('  ' + cmd('purpclaw context team <intent>',      'active team for an intent'));
  console.log('  ' + cmd('purpclaw context agent <name>',      'agent state snapshot'));
  console.log('  ' + cmd('purpclaw context workflows',          'all workflow states'));
  console.log('  ' + cmd('purpclaw context lock <res> <agent>', 'acquire resource lock'));
  console.log('');
  console.log(col(C.gray, '  Context bus monitors EventBus events. Live. Query it any time.'));
  console.log('');
}

async function cmdPool(args) {
  const sub   = (args[0] || '').toLowerCase();
  const rest  = args.slice(1).join(' ').trim();
  const POOL_PORT = parseInt(process.env.POOL_PORT || '7885', 10);

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

// ── tick (manual reasoning heartbeat) ─────────────────────────────────────────
async function cmdTick(args) {
  const { tick, readState } = require(path.join(PURP_DIR, 'lib', 'reasoning-tick'));
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'status' || sub === 'last') {
    sectionHead('  REASONING TICK · LAST STATE');
    const s = readState();
    if (!s.lastTickAt) { console.log(col(C.gray, '  No ticks recorded yet. Run `purpclaw tick` to fire one.\n')); return; }
    console.log(`  Last tick     : ${col(C.cyan, s.lastTickId || '?')}`);
    console.log(`  At            : ${col(C.gray, s.lastTickAt)}`);
    if (s.lastSummary) {
      console.log(`  Duration      : ${col(C.gray, s.lastSummary.durationMs + 'ms')}`);
      console.log(`  Services      : ${col(C.green, String(s.lastSummary.online))}/${s.lastSummary.online + s.lastSummary.offline}  online`);
      if (s.lastSummary.requiredDown) console.log(`  ${col(C.red, 'Required down:')} ${s.lastSummary.requiredDown}`);
      if (s.lastSummary.newlyDown && s.lastSummary.newlyDown.length) console.log(`  ${col(C.yellow, 'Newly down  :')} ${s.lastSummary.newlyDown.join(', ')}`);
      console.log(`  Proposals     : ${col(C.cyan, String(s.lastSummary.proposals))}`);
      console.log(`  Writes to pool: heartbeat=${s.lastSummary.writes?.heartbeat ? 'yes' : 'no'}  failures=${s.lastSummary.writes?.failures || 0}`);
    }
    const knownDown = Object.keys(s.knownDown || {});
    if (knownDown.length) console.log(`  Persistent-down: ${col(C.red, knownDown.join(', '))}`);
    console.log('');
    return;
  }

  banner();
  sectionHead('  REASONING TICK · FIRING');
  const spin = spinner('the swarm is taking a heartbeat...').start();
  try {
    const r = await tick({ verbose: false });
    spin.succeed(`tick ${r.tickId} done in ${r.durationMs}ms`);
    console.log('');
    console.log(`  Services       : ${col(C.green, r.services.online + '/' + r.services.total)}  online`);
    if (r.services.requiredDown) console.log(`  ${col(C.red, 'Required down :')} ${r.services.requiredDown}`);
    if (r.newlyDown.length) {
      console.log(`  ${col(C.yellow, 'Newly down    :')} ${r.newlyDown.map(d => d.key + ' (:' + d.port + ')').join(', ')}`);
    }
    console.log(`  Pool          : ${r.poolAlive ? col(C.green, 'reachable') : col(C.red, 'offline')}`);
    if (r.poolStats) console.log(`  Pool snapshot : ${r.poolStats.skills} skills · ${r.poolStats.agents} agents · ${r.poolStats.memories} memories`);
    console.log(`  Wrote to pool : heartbeat=${r.writes.heartbeat ? col(C.green, 'yes') : col(C.gray, 'skipped')}  failures=${r.writes.failures}`);
    if (r.writes.errors.length) console.log(`  ${col(C.yellow, 'Write errors :')} ${r.writes.errors.length}`);
    if (r.proposals.length) {
      console.log('');
      console.log(col(C.cyan, '  Proactive proposals (not executed):'));
      for (const p of r.proposals) console.log(`    · ${p.command}   ${col(C.gray, '(' + p.reason + ')')}`);
    }
    console.log('');
    console.log(col(C.gray, '  proposals are NOT executed — they\'re proposals. Run them with: purpclaw run "<command>"'));
    console.log(col(C.gray, '  enable continuous ticking: PURPCLAW_PROACTIVE=1 in .env, then `purpclaw restart purpclaw-reasoning`\n'));
  } catch (e) {
    spin.fail(`tick failed: ${e.message}`);
  }
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

// ── tui ───────────────────────────────────────────────────────────────────────
function cmdTui(args = []) {
  // `purpclaw tui ask` opens the interactive agent chat TUI.
  // `purpclaw tui` (no subcommand) opens the live dashboard cockpit.
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'ask') {
    const TUI_ASK = path.join(PURP_DIR, 'scripts', 'tui-ask.js');
    if (!fs.existsSync(TUI_ASK)) {
      console.error(col(C.red, `\n  ✗ scripts/tui-ask.js not found at ${TUI_ASK}\n`));
      process.exit(1);
    }
    const child = trackedSpawn(process.execPath, [TUI_ASK, ...args.slice(1)], {
      tag: 'tui-ask',
      timeoutMs: 0,  // user controls duration
      stdio: 'inherit',
      env  : process.env,
      cwd  : PURP_DIR,
    });
    child.on('close', code => process.exit(code || 0));
    child.on('error', e => { console.error(col(C.red, `\n  ✗ tui-ask failed: ${e.message}\n`)); process.exit(1); });
    return;
  }
  const TUI_SCRIPT = path.join(PURP_DIR, 'scripts', 'tui.js');
  if (!fs.existsSync(TUI_SCRIPT)) {
    console.error(col(C.red, `\n  ✗ scripts/tui.js not found at ${TUI_SCRIPT}\n`));
    process.exit(1);
  }
  const child = trackedSpawn(process.execPath, [TUI_SCRIPT, ...args], {
    tag: 'tui',
    timeoutMs: 0,  // user controls duration
    stdio: 'inherit',
    env  : process.env,
    cwd  : PURP_DIR,
  });
  child.on('close', code => process.exit(code || 0));
  child.on('error', e => {
    console.error(col(C.red, `  ✗ TUI failed to launch: ${e.message}`));
    process.exit(1);
  });
}

// ── help ──────────────────────────────────────────────────────────────────────
function cmdHelp() {
  banner();

  const W = isTTY ? Math.min(process.stdout.columns || 100, 100) : 100;
  const inner = W - 4;

  // Section box helpers
  const secTop  = () => col(C.gray, '  ┌' + '─'.repeat(inner) + '┐');
  const secBot  = () => col(C.gray, '  └' + '─'.repeat(inner) + '┘');
  const secRow  = (left, right) => {
    const l = left  || '';
    const r = right || '';
    const lRaw = l.replace(/\x1b\[[0-9;]*m/g, '');
    const rRaw = r.replace(/\x1b\[[0-9;]*m/g, '');
    const pad  = Math.max(1, inner - lRaw.length - rRaw.length);
    return col(C.gray, '  │') + ' ' + l + ' '.repeat(pad) + r + ' ' + col(C.gray, '│');
  };

  function section(title, rows) {
    console.log(`\n  ${col(C.cyan + C.bold, title)}`);
    console.log(secTop());
    for (const [cmd, desc] of rows) {
      console.log(secRow(col(C.cyan, cmd), col(C.gray, desc)));
    }
    console.log(secBot());
  }

  section('🚀  LIFECYCLE', [
    ['purpclaw init',                  'Audit env, keys, and services'],
    ['purpclaw init --wizard',         'Interactive first-run setup (60 seconds)'],
    ['purpclaw start',                 'Boot the harness (bounded profile)'],
    ['purpclaw start --all',           'Boot every PM2 service'],
    ['purpclaw start --profile=voice', 'Boot harness + voice bridge'],
    ['purpclaw stop',                  'Shut down gracefully'],
    ['purpclaw restart [service]',     'Restart all or one service'],
    ['purpclaw doctor',                'Quick health check — reads only'],
    ['purpclaw doctors',               'Pulse + per-service probe + recent findings (v0.2.0)'],
    ['purpclaw whoami',                'Live stack self-description (live counts, not marketing) (v0.2.0)'],
    ['purpclaw status',                'Dashboard: services + leaderboard + pool'],
  ]);

  section('💬  CHAT WITH THE STACK  (front door)', [
    ['purpclaw',                       'No args → drop into chat REPL (stack-aware, persistent)'],
    ['purpclaw ask "<question>"',      'One-shot LLM query — answers from live stack context'],
    ['purpclaw ask',                   'REPL mode — /exit /clear /help /status, sessions saved'],
    ['purpclaw ask --session <name>',  'Named session (separate context, persisted on disk)'],
    ['purpclaw ask --fresh',           'Clear the current session and start clean'],
    ['purpclaw ask --status',          'Show provider + active session info'],
    ['purpclaw chat',                  'NanoClaw REPL — swarm-aware (uses claude CLI)'],
    ['purpclaw mochi',                 'Chat with your companion (animated, LLM-backed)'],
    ['purpclaw architecture',          'Live runtime overview: services + flow + files + concepts'],
    ['purpclaw architecture services', 'Service topology only'],
    ['purpclaw architecture flow',     'Task-flow diagram only'],
    ['purpclaw overview',              'Canonical doc — what PURPCLAW is + philosophy (the README)'],
    ['purpclaw overview --raw',        'Raw markdown for piping'],
  ]);

  section('⚡  THE WORK LOOP', [
    ['purpclaw tui',                   '🎛  LIVE cockpit — full-screen TUI dashboard'],
    ['purpclaw next',                  'Oracle next-step engine: phase, missing artifacts, next command'],
    ['purpclaw workflow',              'List planning workflow registry entries'],
    ['purpclaw council "<question>"',  'Terminal-first Council decision session'],
    ['purpclaw run "<task>"',          'Dispatch + stream agent progress live'],
    ['purpclaw bg "<task>"',           'Background dispatch — fire and forget'],
    ['purpclaw code status',           'Repo/GitHub tools: status, diff, issues, PRs, checks'],
    ['purpclaw llm',                   'Provider status: Claude, Gemini, OpenAI, Kimi, Ollama'],
    ['purpclaw browser smoke [url]',   'Playwright open/read/screenshot tool surface'],
    ['purpclaw cognition smoke',       'Neuro-symbolic/modal/rules/diagnostics health + lift test'],
    ['purpclaw workflows',             'Show active and recent workflows'],
    ['purpclaw queue',                 'Task queue depth and items'],
    ['purpclaw jobs',                  'Job surfaces and governance holds'],
    ['purpclaw approve <id>',          'Approve a held high-risk job'],
    ['purpclaw reject <id>',           'Reject and cancel'],
    ['purpclaw resume <id>',           'Reload a previous session checkpoint'],
    ['purpclaw bg',                    'List active background jobs'],
  ]);

  section('🧠  KNOWLEDGE POOL  (:7885)', [
    ['purpclaw pool query "<text>"',   'Keyword-search the skill index'],
    ['purpclaw pool show <name>',      'Full SKILL.md content'],
    ['purpclaw pool routing "<task>"', 'Routing hints for a task type'],
    ['purpclaw pool stats',            'How many skills and agents indexed'],
    ['purpclaw pool reindex',          'Rebuild index from disk'],
  ]);

  section('📦  REGISTRY  (139 skills  ·  38 Claude-agent definitions)', [
    ['purpclaw registry browse',       'See all skills + agents with install status'],
    ['purpclaw install <name>',        'Install a skill from the local registry'],
    ['purpclaw search "<text>"',       'Keyword-search across all 139 skills'],
    ['purpclaw registry publish <n>',  'Publishing guide (step-by-step PR walkthrough)'],
    ['purpclaw registry update',       'Rebuild local index from disk'],
  ]);

  section('🧬  MEMORY + DREAM', [
    ['purpclaw memory [query]',        'Recall matching memories from the matrix'],
    ['purpclaw memory ingest "<text>"','Store a new memory manually'],
    ['purpclaw memory forget "<q>"',   'Remove matching memories'],
    ['purpclaw memory stats',          'Detailed memory matrix stats'],
    ['purpclaw dream',                 'Trigger AutoDream memory consolidation'],
  ]);

  section('🤖  AGENTS + FORGE', [
    ['purpclaw agents',                'List swarm agents (44 in tower), divisions, scores'],
    ['purpclaw roster',                'Compare tower swarm vs disk persona files'],
    ['purpclaw roster --missing',      'Show animals lacking persona files (Codex migration target)'],
    ['purpclaw forge [name]',          'Draw a gacha soul + create a new agent'],
    ['purpclaw look [1 2 3]',          'Capture screens + vision analysis'],
    ['purpclaw look --list',           'List detected monitors'],
    ['purpclaw look --workspace',      'Show remembered monitor roles'],
    ['purpclaw voice "<command>"',     'Send command via voice pipeline'],
  ]);

  section('🔧  CONFIG + GOVERNANCE', [
    ['purpclaw config',                'Interactive config editor (↑↓ arrow keys)'],
    ['purpclaw config show',           'Print current config values (secrets masked)'],
    ['purpclaw config set KEY val',    'Set a config key in .env directly'],
    ['purpclaw policies',              'Show active governance policies'],
    ['purpclaw introspect',            'Runtime state summary'],
    ['purpclaw introspect risks',      'Live risk classification'],
    ['purpclaw rollback list',         'Available rollback points'],
    ['purpclaw rollback undo <id>',    'Restore state from snapshot'],
    ['purpclaw spaghetti audit',       'Code health scores (lower = cleaner)'],
    ['purpclaw spaghetti diff A B',    'Compare code health before/after refactor'],
  ]);

  section('🔍  DIAGNOSTICS + DEVOPS', [
    ['purpclaw bughunt',               'Full stack scan — syntax, ports, health, smells'],
    ['purpclaw bughunt --json',        'Machine-readable JSON output'],
    ['purpclaw ctx-viz',               'Visualise the live service mesh as a tree'],
    ['purpclaw ctx-viz --json',        'JSON dump of all node states'],
    ['purpclaw ctx-viz --html',        'Write HTML report to agent_work/ctx-viz.html'],
    ['purpclaw onboard',               'First-run guided setup wizard'],
    ['purpclaw onboard --yes',         'Non-interactive onboarding'],
    ['purpclaw teleport create [name]','Bundle current state for handoff/restore'],
    ['purpclaw teleport list',         'List teleport bundles'],
    ['purpclaw teleport resume <id>',  'Restore a bundle + reload instructions'],
    ['purpclaw autofix-pr plan',       'Scan for build/PR issues (read-only)'],
    ['purpclaw autofix-pr run <plan>', 'Execute a repair plan (governance-gated)'],
    ['purpclaw autofix-pr verify',     'Confirm repairs landed'],
  ]);

  section('🧹  HOUSEKEEPING  (keep the workshop tidy)', [
    ['purpclaw gc --stats',            'Show disk usage breakdown of agent_work/'],
    ['purpclaw gc',                    'Dry-run: list what would be cleaned'],
    ['purpclaw gc --apply',            'Sweep proof-test scratch, age-out sessions, compact tasks'],
    ['purpclaw gc --apply --aggressive', 'Shorter TTLs (1d sessions, 3d workspaces, 6h tasks)'],
    ['purpclaw smoke',                 'End-to-end self-test: services + LLM + pool + memory + dispatch'],
    ['purpclaw smoke --quick',         'Skip the orchestrator workflow round-trip'],
    ['purpclaw smoke --json',          'Machine-readable for CI'],
    ['purpclaw safe-start --core',     'Wake the 16-service stable baseline (one at a time)'],
    ['purpclaw safe-start --dark',     'Sequentially wake defined-but-dark services (no Windows cmd flood)'],
    ['purpclaw safe-start <name>',     'Start one service with circuit breaker + stabilisation watch'],
    ['purpclaw safe-stop --dark',      'Sequentially put the dark cluster back to sleep'],
    ['purpclaw safe-stop <name>',      'Stop one service cleanly'],
    ['purpclaw heal',                  'Diagnose stack state, print recovery plan (no execution)'],
    ['purpclaw heal --execute',        'Apply the recovery plan via safe-start'],
  ]);

  section('☁  CLOUD / SCALE  (worker pool)', [
    ['purpclaw workers status',        'Health check all registered worker nodes'],
    ['purpclaw workers list',          'Show worker registry (IDs, types, targets)'],
    ['purpclaw workers add --type http --url <url>', 'Register remote HTTP worker'],
    ['purpclaw workers add --type ssh --host <h>',   'Register remote SSH worker'],
    ['purpclaw workers remove <id>',   'Deregister a worker'],
    ['purpclaw workers jobs',          'Show recent worker dispatch jobs'],
    ['purpclaw workers test <id>',     'Smoke-test a specific worker'],
    ['purpclaw workers secret',        'Generate a fresh HMAC worker secret (copy/paste)'],
  ]);

  section('🦆  GOOSE COMMANDS  (for the unhinged)', [
    ['purpclaw mochi',                 'Chat with your companion (animated, LLM-backed)'],
    ['purpclaw mochi hatch [seed]',    'Hatch a new mochi species'],
    ['purpclaw mochi card',            'Show companion card'],
    ['purpclaw logs [service]',        'Tail PM2 logs'],
    ['purpclaw profiles',              'List bounded launch profiles'],
    ['purpclaw bars',                  'Mochi status bars preview (opt-in with --bars)'],
  ]);

  // Port quick-ref
  console.log(`\n  ${col(C.cyan + C.bold, '🗺  PORTS')}`);
  console.log(col(C.gray, '  ┌──────────────────────────────────────────────────────────────────────────┐'));
  const portRows = [
    [3000, 'Next.js Mission Control UI'],
    [7780, 'unified-api   — main HTTP API + MCP tools'],
    [7781, 'voice-coord   — intent parsing + TTS'],
    [7782, 'eventbus      — central pub/sub broker'],
    [7783, 'state-store   — shared state namespaces'],
    [7784, 'orchestrator  — priority queue + governance'],
    [7790, 'agent-tower   — 44 swarm agents (animals), spawning'],
    [7791, 'gatekeeper    — pre-merge validation'],
    [7881, 'context-bus   — cross-agent context propagation'],
    [7884, 'neuro-symbolic bridge (Python)'],
    [7885, 'pool          — knowledge pool (skills + agents)'],
    [7889, 'vision-monitor — webcam + YOLO'],
    [7890, 'metrics       — health polling + SSE heartbeat'],
    [7895, 'autodream     — memory consolidation'],
    [7897, 'worker-pool   — overflow lane (HTTP/SSH workers)'],
  ];
  for (const [port, desc] of portRows) {
    console.log(col(C.gray, '  │') + `  ${col(C.cyan, String(port).padStart(5))}  ${col(C.white, String(desc).padEnd(54))}` + col(C.gray, '│'));
  }
  console.log(col(C.gray, '  └──────────────────────────────────────────────────────────────────────────┘'));

  console.log('');
  console.log(`  ${col(C.magenta, 'purpclaw tui')}   ${col(C.gray, '— launch the live cockpit')}`);
  console.log(`  ${col(C.gray, 'Web UI')}        ${col(C.gray, '—')}  ${col(C.cyan, 'http://localhost:3000')}`);
  console.log(`  ${col(C.gray, 'Pool')}          ${col(C.gray, '—')}  ${col(C.cyan, 'http://localhost:7885')}`);
  console.log('');
  console.log(col(C.gray, '  The hammers walk. The tickets file themselves. The pool is open.'));
  console.log(col(C.dim,  '  — Built by Eddie Cannon. Maintained by the goose. Watched by the mochi.'));
  console.log(col(C.dim,  `  ${TAINT_MODE ? col(C.magenta, '  🎨 taint mode is ON. the interface is embodying state. slightly damp.') : '  append --taint to any command. you\'ll know.'}\n`));
}

// ═════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  // ── Belt-and-brace secret redaction across the entire CLI lifetime ─────────
  // Wraps stdout + stderr at the lowest level so anything printed (our logs,
  // child-process inheritance, error stacks, third-party library noise) gets
  // run through the redactor first. Catches: env-var lines, JWTs, sk-… keys,
  // long hex blobs, X-Worker-Token headers, Bearer tokens. Opt-out via
  // PURPCLAW_NO_REDACT=1 for debugging.
  if (process.env.PURPCLAW_NO_REDACT !== '1') {
    try {
      const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
      redactor.wrapStream(process.stdout);
      redactor.wrapStream(process.stderr);
    } catch { /* redactor optional — never block CLI if module missing */ }
  }

  const argv = process.argv.slice(2);
  // Strip --bars / --no-bars flags so they don't pollute command args
  const wantBars  = argv.includes('--bars')    || process.env.PURPCLAW_BARS === '1';
  const skipBars  = argv.includes('--no-bars') || process.env.PURPCLAW_BARS === '0';
  const cleanArgv = argv.filter(a => a !== '--bars' && a !== '--no-bars' && a !== '--taint');

  // Taint mode Easter egg announcement
  if (TAINT_MODE) {
    console.log(col(C.magenta + C.bold, '\n  🎨 TAINT MODE ACTIVATED. the interface will now embody state.'));
    console.log(col(C.gray, '  errors are now emotionally resonant. success is slightly damp.\n'));
  }
  let [command, ...args] = cleanArgv;

  // Explicit help/version paths
  if (command === 'help' || command === '--help' || command === '-h') {
    cmdHelp(); return;
  }
  if (command === 'version' || command === '--version' || command === '-v' || command === '-V') {
    const pkg = require(path.join(PURP_DIR, 'package.json'));
    console.log('purpclaw v' + (pkg.version || '0.1.0'));
    return;
  }

  // No args — first-run experience. Auto-detect keys, show menu, launch.
  if (!command) {
    const setup = require(path.join(PURP_DIR, 'lib', 'commands', 'setup'));
    const found = setup.scanForKeys();
    const ready = Object.keys(found).length;

    console.log('');
    console.log(col(C.cyan + C.bold, '  🟣 PURPCLAW v0.2.0 — AI Workstation OS'));
    console.log(col(C.gray, '  ─────────────────────────────────────────'));

    if (ready > 0) {
      console.log(col(C.green, `  ✅ ${ready} provider(s) detected:`));
      Object.entries(found).slice(0, 5).forEach(([id, info]) => {
        console.log(col(C.gray, `     ${id} — ${info.source === 'local' ? 'local' : info.key}`));
      });
    } else {
      console.log(col(C.yellow, '  ⚠ No API keys detected.'));
    }

    console.log('');
    console.log(col(C.white, '  What would you like to launch?'));
    console.log('');
    console.log(col(C.cyan, `    ${col(C.bold, '1')}. CLI chat        `) + col(C.gray, '(purpclaw ask — interactive agent chat)'));
    console.log(col(C.cyan, `    ${col(C.bold, '2')}. TUI cockpit     `) + col(C.gray, '(purpclaw tui — live dashboard)'));
    console.log(col(C.cyan, `    ${col(C.bold, '3')}. TUI ask         `) + col(C.gray, '(purpclaw tui ask — full-screen chat)'));
    console.log(col(C.cyan, `    ${col(C.bold, '4')}. WebUI           `) + col(C.gray, '(http://localhost:3000 — mission control)'));
    console.log(col(C.cyan, `    ${col(C.bold, '5')}. Setup wizard    `) + col(C.gray, '(configure providers)'));
    console.log(col(C.cyan, `    ${col(C.bold, '6')}. Guided tour     `) + col(C.gray, '(TTS-narrated walkthrough)'));
    console.log(col(C.cyan, `    ${col(C.bold, '7')}. Help            `) + col(C.gray, '(show all commands)'));
    console.log('');

    // Read a single keypress (or line) for the choice
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(col(C.white, '  Choice [1]: '), (answer) => {
      rl.close();
      const choice = (answer || '1').trim().toLowerCase();

      if (choice === '1') { command = 'ask'; args = []; }
      else if (choice === '2') { command = 'tui'; args = []; }
      else if (choice === '3') { command = 'tui'; args = ['ask']; }
      else if (choice === '4') {
        console.log(col(C.green, '\n  🚀 Opening WebUI at http://localhost:3000'));
        console.log(col(C.gray, '  Make sure the backend is running: purpclaw start\n'));
        const { exec } = require('child_process');
        exec('start http://localhost:3000');
        process.exit(0);
      }
      else if (choice === '5') { command = 'setup'; args = []; }
      else if (choice === '6') { command = 'tour'; args = []; }
      else { command = 'help'; args = []; }
    });

    // Wait for the readline to complete before dispatching
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (command) { clearInterval(check); resolve(); }
      }, 50);
    });
  }

  // Commands that own their own UI / shouldn't be wrapped with status bars
  const ownsScreen = new Set([
    'tui', 'mochi', 'chat', 'ask', 'init', 'start', 'stop', 'restart',
    'config', 'logs', 'run', 'voice', 'bars', 'llm', 'browser', 'browse', 'cognition', 'cog',
  ]);
  const useBars = wantBars && !skipBars && isTTY && !ownsScreen.has(command.toLowerCase());

  // Load a lib/commands/<name>.js module (throws clearly if missing)
// v2.1 — New v0.2.0 CLI commands: pulse, whoami, doctors
// All hit live endpoints, no hardcoded numbers.

const http = require('http');

function httpJSON(method, port, path, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, timeout: timeoutMs }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ error: 'invalid_json', raw: d }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}

async function cmdPulse(args = []) {
  // purpclaw pulse          — show current pulse status + last 5 findings
  // purpclaw pulse tick     — trigger a manual tick and show findings
  // purpclaw pulse history  — show last 20 findings
  const sub = (args[0] || '').toLowerCase();
  banner();
  sectionHead('  PURPCLAW PULSE — the stack\'s own heartbeat');

  if (sub === 'tick') {
    const r = await httpJSON('POST', 7780, '/api/pulse/tick');
    console.log(col(C.cyan, '  Manual tick complete.'));
    if (r.findings && r.findings.length) {
      for (const f of r.findings) {
        const sev = f.severity === 'error' ? C.red : f.severity === 'warn' ? C.yellow : C.green;
        console.log(`  ${col(sev, '●')} ${col(C.bold, f.title)}: ${col(C.gray, f.body)}`);
      }
    } else {
      console.log(col(C.green, '  No new findings. Stack is nominal.'));
    }
    return 0;
  }

  if (sub === 'history') {
    const r = await httpJSON('GET', 7780, '/api/pulse/notifications?limit=20');
    if (r.error) { console.log(col(C.red, '  ✗ ' + r.error)); return 1; }
    const nf = r.notifications || [];
    console.log(col(C.gray, `  Last ${nf.length} findings (live from /api/pulse/notifications):`));
    for (const n of nf) {
      const sev = n.severity === 'error' ? C.red : n.severity === 'warn' ? C.yellow : C.green;
      const ts = n.ts ? n.ts.substring(11, 19) : '';
      console.log(`  ${col(sev, '●')} ${col(C.gray, ts)} ${col(C.bold, n.title)} ${col(C.gray, '(' + (n.kind || '') + ')')}`);
      console.log(`     ${col(C.gray, n.body)}`);
    }
    return 0;
  }

  const status = await httpJSON('GET', 7780, '/api/pulse');
  if (status.error) {
    console.log(col(C.red, '  ✗ Pulse unavailable: ' + status.error));
    return 1;
  }
  console.log(`  ${col(C.bold, 'Tick')}            ${col(C.white, String(status.tickCount))}`);
  console.log(`  ${col(C.bold, 'Interval')}        ${col(C.gray, (status.intervalMs / 1000) + 's')}`);
  console.log(`  ${col(C.bold, 'Last pulse')}      ${col(C.gray, status.lastPulseAt || 'never')}`);
  const down = status.servicesDown && status.servicesDown.length;
  console.log(`  ${col(C.bold, 'Services down')}   ${down ? col(C.red, down + ' ' + status.servicesDown.join(', ')) : col(C.green, '0')}`);
  console.log(`  ${col(C.bold, 'Notifications')}   ${col(C.white, String(status.notificationCount))}`);

  if (status.latestNotifications && status.latestNotifications.length) {
    console.log('');
    console.log(col(C.gray, '  ── Latest findings ──'));
    for (const n of status.latestNotifications.slice(0, 5)) {
      const sev = n.severity === 'error' ? C.red : n.severity === 'warn' ? C.yellow : C.green;
      console.log(`  ${col(sev, '●')} ${col(C.bold, n.title)} ${col(C.gray, '(' + n.severity + ')')}`);
      console.log(`     ${col(C.gray, n.body)}`);
    }
  }
  return 0;
}

async function cmdWhoami() {
  // purpclaw whoami — live stack self-description, no hardcoded numbers
  banner();
  sectionHead('  PURPCLAW WHOAMI — the stack, truthfully');
  const w = await httpJSON('GET', 7780, '/api/whoami');
  if (w.error) {
    console.log(col(C.red, '  ✗ /api/whoami unavailable: ' + w.error));
    console.log(col(C.gray, '    (unified_api :7780 may be down)'));
    return 1;
  }
  const t = w.systems && w.systems.tools;
  const a = w.systems && w.systems.agents;
  const p = w.systems && w.systems.providers;
  let _pkgV = '0.2.0'; try { _pkgV = require(path.join(PURP_DIR, 'package.json')).version; } catch {}
  console.log(`  ${col(C.bold, 'I am')}            ${col(C.purple, w.name)} ${col(C.gray, 'v' + (w.version || _pkgV))}`);
  console.log(`  ${col(C.bold, 'Mode')}            ${col(C.white, w.mode)}`);
  console.log(`  ${col(C.bold, 'Runtime')}         ${col(C.white, w.runtime && w.runtime.node + ' on ' + w.runtime.platform + '/' + w.runtime.arch)}`);
  console.log(`  ${col(C.bold, 'Uptime')}          ${col(C.white, w.runtime && w.runtime.uptimeSec + 's')}`);
  console.log('');
  console.log(`  ${col(C.bold, 'Tools')}           ${col(C.white, t && t.total + ' registered')} ${col(C.gray, '(' + t.breakdown.core + ' core, ' + t.breakdown.skills + ' skills, ' + t.breakdown.bodyBridge + ' body, ' + t.breakdown.nim + ' nim, ' + t.breakdown.mcp + ' mcp)')}`);
  console.log(`  ${col(C.bold, 'Agents')}          ${col(C.white, a.count + ' registered, ' + (w.surfaces && w.surfaces.agentTower.divisions) + ' divisions')}`);
  console.log(`  ${col(C.bold, 'Providers')}       ${col(C.white, p.count + ' ready (' + p.present.join(', ') + ')')}`);
  console.log(`  ${col(C.bold, 'Unified API')}     ${col(C.white, 'port ' + w.surfaces.unifiedApi.port + ', ' + (w.surfaces.unifiedApi.ok ? col(C.green, 'UP') : col(C.red, 'DOWN'))) + ', uptime ' + Math.round(w.surfaces.unifiedApi.uptime || 0) + 's, ' + (w.surfaces.unifiedApi.memoryMB || '?') + 'MB'}`);
  console.log(`  ${col(C.bold, 'Agent tower')}     ${col(C.white, 'port ' + w.surfaces.agentTower.port + ', ' + w.surfaces.agentTower.registered + ' registered')}`);
  console.log('');
  console.log(col(C.cyan, '  I have: read, write, edit, shell, grep, code-search, discover, web-fetch, git, ls, cp, mv.'));
  console.log(col(C.cyan, '  Use discover() if you need a tool not in that list.'));
  return 0;
}

async function cmdDoctors(args = []) {
  // purpclaw doctors — pulse + service health + last 5 errors in one screen
  const sub = (args[0] || '').toLowerCase();
  banner();
  sectionHead('  PURPCLAW DOCTORS — pulse + health + errors');

  // 1. Pulse status
  const ps = await httpJSON('GET', 7780, '/api/pulse');
  if (ps.error) {
    console.log(col(C.red, '  ✗ Pulse: ' + ps.error));
  } else {
    const down = ps.servicesDown && ps.servicesDown.length;
    const status = down ? col(C.red, down + ' DOWN') : col(C.green, 'ALL GREEN');
    console.log(`  ${col(C.bold, 'Pulse')}        tick ${ps.tickCount}, last ${col(C.gray, ps.lastPulseAt)}  ${status}`);
  }

  // 2. Service probe
  console.log('');
  console.log(col(C.gray, '  ── Service probe ──'));
  const targets = [
    { name: 'unified-api', port: 7780, path: '/api/health' },
    { name: 'eventbus',    port: 7782, path: '/health' },
    { name: 'state',       port: 7783, path: '/health' },
    { name: 'orchestrator',port: 7784, path: '/api/health' },
    { name: 'agent-tower', port: 7790, path: '/tower/status' },
    { name: 'gatekeeper',  port: 7791, path: '/health' },
    { name: 'harness',     port: 7798, path: '/health' },
    { name: 'cognitive',   port: 7880, path: '/api/spine/health' },
  ];
  for (const t of targets) {
    const r = await httpJSON('GET', t.port, t.path, 1500);
    // v2.1 — httpJSON returns the parsed body. A healthy response has 'status' or
    // no error key. A failed one has 'error' set.
    const ok = r && !r.error && (r.status === 'healthy' || r.ok === true || r.tickCount !== undefined || Object.keys(r).length > 0);
    const tag = ok ? col(C.green, '●') : col(C.red, '○');
    const label = r && r.error ? col(C.red, r.error.substring(0, 30)) : (ok ? col(C.gray, 'up') : col(C.red, 'down'));
    console.log(`    ${tag}  ${t.name.padEnd(15)} :${t.port}  ${label}`);
  }

  // 3. Latest pulse findings
  if (ps && ps.latestNotifications && ps.latestNotifications.length) {
    console.log('');
    console.log(col(C.gray, '  ── Recent findings ──'));
    for (const n of ps.latestNotifications.slice(0, 5)) {
      const sev = n.severity === 'error' ? C.red : n.severity === 'warn' ? C.yellow : C.green;
      console.log(`    ${col(sev, '●')} ${col(C.bold, n.title)} ${col(C.gray, '(' + n.severity + ')')}`);
      console.log(`      ${col(C.gray, n.body)}`);
    }
  }
  return 0;
}

  function loadCmd(name) {
    return require(path.join(PURP_DIR, 'lib', 'commands', name + '.js'));
  }

  // Shared context object passed to all lib/commands modules
  function sharedCtx() {
    return {
      PURP_DIR, C, col, spinner, httpGet, httpPost, ping, PORTS,
      isTTY, sectionHead, banner,
    };
  }

  // Helper: dispatches the command, optionally wrapped in mochi status bars
  async function dispatch() {
    switch (command.toLowerCase()) {
    case 'tui':
    case 'ui':        return cmdTui(args);
    case 'init':      return cmdInit(args);
    case 'start':     return cmdStart(args);
    case 'stop':      return cmdStop(args);
    case 'restart':   return cmdRestart(args);
    case 'chat':      return cmdChat(args);
    case 'run':       return cmdRun(args);
    case 'status':    return cmdStatus();
    case 'doctor':    return cmdDoctor(args);
    case 'approve':   return cmdApprove(args);
    case 'reject':    return cmdReject(args);
    case 'jobs':      return cmdJobs(args);
    case 'policies':  return cmdPolicies(args);
    case 'policy':    return cmdPolicies(args);
    case 'introspect': return cmdIntrospect(args);
    case 'rollback':  return cmdRollback(args);
    announce.bigboss.started(command, args);
    case 'bg':        return cmdBg(args);
case 'registry': return cmdRegistry(args);
    case 'install':   return cmdRegistry(['install', ...args]);
    case 'search':    return cmdRegistry(['search', ...args]);
 case 'resume':   return cmdResume(args);
    case 'context':  return cmdContext(args);
    case 'pool':     return cmdPool(args);
    case 'action':
    case 'do':       return loadCmd('action').run(args, sharedCtx());
    case 'capabilities':
    case 'capability':
    case 'surfaces': return loadCmd('capabilities').run(args, sharedCtx());
    case 'feature':
    case 'features': return loadCmd('feature').run(args, sharedCtx());
    case 'parity':   return loadCmd('parity').run(args, sharedCtx());
    case 'hivemind':
    case 'spring':   return loadCmd('hivemind').run(command.toLowerCase() === 'spring' ? ['spring', ...args] : args, sharedCtx());
    case 'registries':
    case 'registry-audit': return loadCmd('registry-audit').run(args, sharedCtx());
    // ── Advisory agents (read-only): system conditions + foresight ──
    case 'weather':
    case 'weatherman': return loadCmd('weather').run(args, sharedCtx());
    case 'oracle':
    case 'forecast':   return loadCmd('oracle').run(args, sharedCtx());
    case 'next':
    case 'helpme':     return loadCmd('next').run(args, sharedCtx());
    case 'workflow':   return loadCmd('workflow').run(args, sharedCtx());
    case 'council':
    case 'decide':     return loadCmd('council').run(args, sharedCtx());
    case 'drift':      return loadCmd('drift').run(args, sharedCtx());
    // ── Crew: named agents, one model each (analyst/writer/marketer/coder) ──
    case 'crew':     return loadCmd('crew').run(args, sharedCtx());
    case 'pipeline': return loadCmd('crew').run(['pipeline', ...args], sharedCtx());
    case '/analyst': case '/writer': case '/marketer': case '/coder': case '/orchestrator': case '/orch':
      return loadCmd('crew').run([[command, ...args].join(' ')], sharedCtx());
    case 'tick':     return cmdTick(args);
    case 'mochi':      return cmdMochi(args);
    case 'spaghetti': return cmdSpaghetti(args);
    case 'llm':       return loadCmd('llm').run(args, sharedCtx());
    case 'research':  return loadCmd('intelligence').run(['graph', ...args], sharedCtx());
    case 'intelligence': return loadCmd('intelligence').run(args, sharedCtx());
    case 'browser':
    case 'browse':    return loadCmd('browser').run(args, sharedCtx());
    case 'cognition':
    case 'cog':       return loadCmd('cognition').run(args, sharedCtx());
    case 'code':
    case 'github':
    case 'gitx':      return loadCmd('code').run(args, sharedCtx());
    case 'lora':      return cmdLora(args);
    case 'model':     return cmdModel(args);
    case 'models':    return cmdModel(args);
    case 'agents':    return cmdAgents();
    case 'profiles':  return cmdProfiles();
    case 'workflows': return cmdWorkflows();
    case 'queue':     return cmdQueue();
    case 'memory':    return cmdMemory(args);
    case 'dream':     return cmdDream();
    case 'forge':     return cmdForge(args);
    case 'look':      return cmdLook(args);
    case 'voice':     return cmdVoice(args);
    case 'config':    return cmdConfig(args);
    case 'logs':      return cmdLogs(args);
    case 'bars':       return cmdBars(args);
    case 'bigboss':   { const r = await loadCmd('bigboss').run(args, sharedCtx()); if (typeof r === 'string') console.log(r); return r; }
    case 'remotion':  { const r = await loadCmd('remotion').run(args, sharedCtx()); if (typeof r === 'string') console.log(r); return r; }
    case 'show':
    case 'stack':
    case 'status':     return cmdStatus(args);
    case 'doctor':     return cmdDoctor(args);
    case 'pulse':     return cmdPulse(args);
    case 'team':     { const r = await loadCmd('team').run(args, sharedCtx()); if (typeof r === 'string') console.log(r); return r; }
    case 'whoami':    return cmdWhoami();
    case 'doctors':   return cmdDoctors(args);
    case 'audit':      return cmdAudit(args);
    case 'whoami':
    case 'about':      return cmdWhoami(args);
    case 'release':    return cmdRelease(args);
    case 'health':     return cmdHealth(args);
    case 'identity':   return loadCmd('identity').run(args, sharedCtx());
    case 'embeddings': return cmdEmbeddings(args);
    case 'embed':      return cmdEmbeddings(['embed', ...args]);
    // ── Resurrected commands (lib/commands/) ──────────────────────────────
    case 'bughunt':    return loadCmd('bughunt').run(args, sharedCtx());
    case 'ctx-viz':
    case 'ctxviz':     return loadCmd('ctx-viz').run(args, sharedCtx());
    case 'onboard':    return loadCmd('onboard').run(args, sharedCtx());
    case 'teleport':   return loadCmd('teleport').run(args, sharedCtx());
    case 'autofix-pr':
    case 'autofix':    return loadCmd('autofix-pr').run(args, sharedCtx());
    case 'workers':
    case 'worker':    return loadCmd('workers').run(args, sharedCtx());
    case 'ask':       return loadCmd('ask').run(args, sharedCtx());
    case 'setup':
    case 'wizard':
    case 'onboard':   return loadCmd('setup').run(args, sharedCtx());
    case 'tour':
    case 'walkthrough':return loadCmd('tour').run(args, sharedCtx());
    case 'commit':
        case 'review':
        case 'find':
        case 'claudecode':return loadCmd('claudecode').run([command, ...args], sharedCtx());
    case 'gc':
    case 'cleanup':   return loadCmd('gc').run(args, sharedCtx());
    case 'pocket':    return loadCmd('pocket').run(args, sharedCtx());
    case 'architecture':
    case 'arch':
    case 'concepts':  return loadCmd('architecture').run(args, sharedCtx());
    case 'smoke':
    case 'selftest':  return loadCmd('smoke').run(args, sharedCtx());
    case 'overview':
    case 'what-is-purpclaw':
    case 'whatis':    return loadCmd('overview').run(args, sharedCtx());
    case 'safe-start':
    case 'safestart': return loadCmd('safe-start').run(args, sharedCtx());
    case 'safe-stop':
    case 'safestop':  return loadCmd('safe-stop').run(args, sharedCtx());
    case 'services':  return loadCmd('services').run(args, sharedCtx());
    case 'heal':
    case 'recover':   return loadCmd('heal').run(args, sharedCtx());
    case 'roster':    return loadCmd('roster').run(args, sharedCtx());
    case 'harvest':   return loadCmd('harvest').run(args, sharedCtx());
    case 'training':  return cmdTrainingFeedback(args);
    case 'idle':      return cmdIdleEngine(args);
    case 'vector':    return cmdVectorBench(args);
    default:
      // Unknown command — treat as an inline task for convenience
      // e.g. `purpclaw fix the auth bug` → same as `purpclaw run "fix the auth bug"`
      const task = [command, ...args].join(' ');
      console.log(col(C.gray, `\n  Treating as task: "${task}"`));
      return cmdRun([task]);
    }
  }

  // Wrap in mochi status bars if --bars / PURPCLAW_BARS=1 and command doesn't own its own screen
  if (useBars) {
    const sb = require(path.join(PURP_DIR, 'lib', 'mochi-statusbar'));
    return sb.wrap(dispatch);
  }
  return dispatch();
}

// ── training feedback — personal model growth ─────────────────────────────
async function cmdTrainingFeedback(args) {
  const sub = (args[0] || 'status').toLowerCase();
  const FB = require(path.join(PURP_DIR, 'lib', 'user-feedback'));

  if (sub === 'status') {
    const s = FB.status();
    console.log('');
    console.log('  🧠  PERSONAL MODEL GROWTH');
    console.log('  ═════════════════════════');
    console.log(`  Status:      ${s.enabled ? col(C.green, '● ACTIVE') : col(C.yellow, '○ OFF')}`);
    console.log(`  Session:     ${s.sessionId.substring(0, 8)}...`);
    console.log(`  Captures:    ${s.stats.total} total`);
    console.log(`  Corrections: ${s.stats.corrections} (need ≥10 for training)`);
    console.log(`  Preferences: ${s.stats.preferences}`);
    console.log(`  Directory:   ${s.feedbackDir}`);
    console.log('');
    if (s.recentFiles.length > 0) {
      console.log('  Recent capture files:');
      for (const f of s.recentFiles) console.log(`    ${f.file} — ${f.lines} records, ${(f.size/1024).toFixed(1)}KB`);
      console.log('');
    }
    console.log(`  ${col(C.cyan, s.trainingHint)}`);
    // ── Personal dataset readiness ─────────────────────────────────
    try {
      const pd = require(path.join(PURP_DIR, 'lib', 'training', 'personal-dataset'));
      const pstats = pd.stats();
      console.log(`  ${col(C.magenta, 'Personal data:')} ${pstats.corrections} corrections, ${pstats.preferences} preferences, ${pstats.edits} edits`);
    } catch {}
    console.log('');
    console.log(col(C.gray, '  purpclaw training feedback reset    clear all data'));
    console.log(col(C.gray, '  purpclaw training feedback export    export for fine-tuning'));
    console.log(col(C.gray, '  purpclaw training feedback off       disable capture'));
    console.log('');
    return;
  }

  if (sub === 'reset') {
    const r = FB.reset();
    console.log(col(C.green, `\n  ✓ Feedback data cleared. New session: ${r.sessionId.substring(0, 8)}...\n`));
    return;
  }

  if (sub === 'export') {
    const format = args[1] || 'chatml';
    const data = FB.exportTrainingData(format);
    const outPath = path.join(FB.FEEDBACK_DIR, `personal-training-${format}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(col(C.green, `\n  ✓ Exported ${data.length} training examples to ${outPath}`));
    console.log(col(C.gray, `  Format: ${format}  |  Ready for: purpclaw lora train --dataset ${outPath}\n`));
    return;
  }

  if (sub === 'off') {
    process.env.PURPCLAW_FEEDBACK_OFF = '1';
    console.log(col(C.yellow, '\n  ○ Personal model growth DISABLED. Set PURPCLAW_FEEDBACK_OFF=0 to re-enable.\n'));
    return;
  }

  if (sub === 'on') {
    delete process.env.PURPCLAW_FEEDBACK_OFF;
    console.log(col(C.green, '\n  ● Personal model growth ENABLED. All interactions will be captured locally.\n'));
    return;
  }

  console.log(col(C.yellow, `\n  Unknown subcommand: ${sub}`));
  console.log(col(C.gray, '  Try: status, reset, export, on, off\n'));
}

// ── idle engine — the beast that wakes when you stop typing ──────────────
async function cmdIdleEngine(args) {
  const sub = (args[0] || 'status').toLowerCase();

  if (sub === 'trigger' || sub === 'run') {
    const IE = require(path.join(PURP_DIR, 'lib', 'idle-engine'));
    console.log(col(C.cyan, '\n  🦀  Forcing idle optimization cycle...\n'));
    const results = await IE.forceTrigger();
    console.log('');
    console.log('  Results:');
    for (const [phase, r] of Object.entries(results.phases || {})) {
      const icon = r.ok ? col(C.green, '✓') : col(C.yellow, '○');
      console.log(`    ${icon} ${phase}: ${r.count ? r.count + ' examples' : r.reason || r.error || 'done'}`);
    }
    console.log('');
    return;
  }

  if (sub === 'status') {
    let IE = null;
    try { IE = require(path.join(PURP_DIR, 'lib', 'idle-engine')); } catch { IE = null; }
    if (!IE) { console.log(col(C.yellow, '\n  Idle engine not available.\n')); return; }

    const s = IE.status();
    const ag = s.agRatio;
    console.log('');
    console.log('  🦀  IDLE ENGINE — the beast that wakes when you stop typing');
    console.log('  ════════════════════════════════════════════════════════');
    console.log(`  Status:        ${s.active ? col(C.green, '● USER ACTIVE') : col(C.magenta, '◌ IDLE — beast watching')}`);
    console.log(`  Sessions:      ${s.sessionCount}`);
    console.log(`  Idle cycles:   ${s.idleCycles}`);
    console.log(`  Last activity: ${s.lastActivityAt || 'never'}`);
    console.log(`  Current phase: ${s.currentPhase || 'none'}`);
    console.log(`  Idle delay:    ${s.idleDelayMs / 1000}s`);
    console.log(`  Auto-train:    ${s.autoTrainEnabled ? col(C.green, 'ON') : col(C.yellow, 'OFF')} (min ${s.minNewForTrain} new examples)`);
    console.log('');
    console.log(`  🏗️👹 A/G RATIO:  ${ag.architect} Architect / ${ag.goblin} Goblin = ${col(ag.ratio >= 1 ? C.green : C.yellow, ag.ratio)}`);
    console.log(`  Contained:     ${ag.contained}  |  Escaped: ${ag.escaped}`);
    console.log(`  Threat Level:  ${ag.threatLevel === 'Stable' ? col(C.green, ag.threatLevel) : ag.threatLevel === 'Manageable' ? col(C.yellow, ag.threatLevel) : col(C.red, ag.threatLevel)}`);
    console.log(`  Verdict:       ${ag.verdict}`);
    console.log('');
    console.log(`  Personal data: ${s.personalStats.corrections} corrections, ${s.personalStats.preferences} preferences`);
    console.log(`  Ready to train: ${s.readyForAutoTrain ? col(C.green, '✓ YES') : col(C.yellow, `○ need ${s.minNewForTrain - (s.personalStats.corrections + s.personalStats.preferences + s.personalStats.edits)} more`)}`);
    console.log('');
    console.log(col(C.gray, '  purpclaw idle trigger    force optimization cycle now'));
    console.log(col(C.gray, '  The engine fires automatically 30s after each session ends'));
    console.log('');
    return;
  }

  console.log(col(C.yellow, `\n  Unknown subcommand: ${sub}`));
  console.log(col(C.gray, '  Try: status, trigger\n'));
}

// ── vector bench ──────────────────────────────────────────────────────────
async function cmdVectorBench(args) {
  const sub = (args[0] || 'bench').toLowerCase();
  
  if (sub === 'bench' || sub === 'run') {
    const benchPath = path.join(PURP_DIR, 'bin', 'purpclaw-vector-bench.js');
    const count = args[1] || '1000';
    const dim = args[2] || '768';
    const topK = args[3] || '10';
    const cmd = ['node', benchPath, count, dim, topK];
    const child = trackedSpawn(cmd[0], cmd.slice(1), { tag: 'vector-bench', stdio: 'inherit', timeoutMs: 120000 });
    child.on('exit', code => { if (code !== 0) console.log(col(C.red, `\n  ✗ Bench exited with code ${code}\n`)); });
    return;
  }

  if (sub === 'status') {
    const VECTOR = require(path.join(PURP_DIR, 'lib', 'vector'));
    const s = VECTOR.status();
    console.log('');
    console.log('  🦀  VECTOR PROVIDER STATUS');
    console.log('  ══════════════════════════');
    console.log(`  Default:    ${s.defaultProvider}`);
    console.log(`  FAISS:      ${s.faiss?.ready ? col(C.green, '● ONLINE') : col(C.yellow, '○ no index')} (${s.faiss?.indexed || 0} indexed, ${s.faiss?.tombstones || 0} tombstoned)`);
    console.log(`  TurboVec:   ${col(C.yellow, '◌ PARKED — requires AVX2 CPU')}`);
    console.log('');
    return;
  }

  console.log(col(C.yellow, `\n  Unknown subcommand: ${sub}\n  Try: bench, status\n`));
}

// ── bars ─────────────────────────────────────────────────────────────────────
async function cmdBars(args) {
  const sb = require(path.join(PURP_DIR, 'lib', 'mochi-statusbar'));
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'top') return sb.printTop();
  if (sub === 'bottom') return sb.printBottom();

  // Default: show both, like a preview
  await sb.printTop();
  console.log('');
  console.log(col(C.gray, '  Status bars are opt-in. Enable with one of:'));
  console.log(col(C.gray, ''));
};

// ── show / stack — full overview of the running system
async function cmdStatus(args) {
  const http = require('http');
  function get(port, path) {
    return new Promise(r => {
      const req = http.get({ hostname: '127.0.0.1', port, path, timeout: 3000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { r(JSON.parse(d)); } catch { r(null); } });
      });
      req.on('error', () => r(null)); req.end();
    });
  }
  const spine = await get(7880, '/cognitive/health');
  const tower = await get(7790, '/tower/status');
  const cc = require(path.join(PURP_DIR, 'lib', 'chaos-campaign'));
  const t = cc.status().totals;
  const pkg = require(path.join(PURP_DIR, 'package.json'));

  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║        🟣  PURPCLAW — FULL STACK  🟣        ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  🔥 CORE:');
  const cores = [7780, 7782, 7783, 7784, 7790, 7791, 7881, 7885, 7890];
  const results = await Promise.all(cores.map(p => get(p, '/health').then(() => p).catch(() => null)));
  const names = { 7780:'API', 7782:'Bus', 7783:'State', 7784:'Orch', 7790:'Tower', 7791:'Gate', 7881:'Ctx', 7885:'Pool', 7890:'Metr' };
  for (const p of cores) console.log(`    ${results.includes(p) ? '✅' : '❌'} ${names[p]} :${p}`);
  console.log('');
  console.log('  🧠 COGNITIVE SPINE:' + (spine ? '' : ' 🔴 DOWN'));
  if (spine && spine.services) {
    for (const [k, v] of Object.entries(spine.services))
      console.log(`    ${v.status === 'healthy' ? '✅' : '❌'} ${k}`);
  }
  console.log('');
  console.log('  🧠 ACTIVE MODEL: ' + col(C.cyan, process.env.LLM_PROVIDER || 'deepseek') + ' / ' + col(C.green, process.env.LLM_MODEL || 'deepseek-v4-pro'));
  console.log(`  ⚔️  SMITH+NEO: ${t.attacks} attacks, ${Math.round(t.detected / Math.max(t.attacks, 1) * 100)}% detect, ${Math.round(t.repaired / Math.max(t.attacks, 1) * 100)}% repair`);
  console.log(`  📊 AGENTS: ${tower && tower.agentCount ? tower.agentCount : '35+'} deployable`);
  console.log(`  🔧 TOOLS: 110+  |  🏗️  PROVIDERS: 17`);
  console.log(`  🌐 UI: :3000  |  Skyscraper: /skyscraper/`);
  console.log(`  💰 MoneyPrinter: :8080`);
  console.log(`  📦 v${pkg.version} — github.com/weemadscotsman/purpclaw`);
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║     🔥 THE CLAW IS AWAKE. 🦀               ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
};

// ── model — hot-swap provider/model, list, test, serve local GGUF
async function cmdModel(args) {
  const sub = (args[0] || '').toLowerCase();
  const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
  const fs = require('fs');

  // purpclaw model list
  if (sub === 'list') {
    const info = llm.getProviderInfo();
    const providers = llm.listProviders();
    console.log('');
    console.log('  🏗️  AVAILABLE PROVIDERS');
    console.log('');
    for (const p of providers) {
      const active = info.main.provider === p ? ' ◀ active' : '';
      const swarm = info.swarm.provider === p ? ' ◀ swarm' : '';
      console.log(`    ${p}${active}${swarm}`);
    }
    console.log('');
    console.log(`  Active main:  ${col(C.cyan, info.main.provider)} / ${col(C.green, info.main.model)}`);
    console.log(`  Active swarm: ${col(C.cyan, info.swarm.provider)} / ${col(C.green, info.swarm.model)}`);
    console.log('');
    console.log(col(C.gray, '  purpclaw model use <provider>/<model>     hot-swap'));
    console.log(col(C.gray, '  purpclaw model test \"hello\"              quick ping'));
    return;
  }

  // purpclaw model use <provider>/<model>
  if (sub === 'use') {
    const spec = args[1] || '';
    if (!spec.includes('/')) {
      console.log(col(C.red, '  Usage: purpclaw model use <provider>/<model>'));
      console.log(col(C.gray, '  Example: purpclaw model use openrouter/anthropic/claude-sonnet-4'));
      console.log(col(C.gray, '  Example: purpclaw model use ollama/qwen2.5:3b'));
      return;
    }
    const parts = spec.split('/');
    const provider = parts[0];
    const model = parts.slice(1).join('/');

    // Update .env
    const envPath = path.join(PURP_DIR, '.env');
    let envBody = '';
    try { envBody = fs.readFileSync(envPath, 'utf8'); } catch { envBody = ''; }
    const lines = envBody.split('\n').filter(l => !l.startsWith('LLM_PROVIDER=') && !l.startsWith('LLM_MODEL='));
    lines.push(`LLM_PROVIDER=${provider}`);
    lines.push(`LLM_MODEL=${model}`);
    fs.writeFileSync(envPath, lines.join('\n'));
    process.env.LLM_PROVIDER = provider;
    process.env.LLM_MODEL = model;

    console.log('');
    console.log(`  ✅ Switched to ${col(C.cyan, provider)}/${col(C.green, model)}`);
    console.log(col(C.gray, '  Hot-reloaded — next chat uses this provider/model.'));
    console.log('');
    return;
  }

  // purpclaw model test "prompt"
  if (sub === 'test') {
    const prompt = args.slice(1).join(' ') || 'Say hello in one word.';
    console.log('');
    console.log(`  🧪 Testing: ${col(C.cyan, llm.getProviderInfo().main.provider)}/${col(C.green, llm.getProviderInfo().main.model)}`);
    console.log(`  Prompt: \"${prompt}\"`);
    console.log('');
    try {
      const resp = await llm.complete(prompt, { maxTokens: 100 });
      console.log(`  ✅ Response: ${col(C.green, (resp || '(empty)').substring(0, 200))}`);
    } catch (e) {
      console.log(`  ❌ Error: ${col(C.red, e.message)}`);
    }
    console.log('');
    return;
  }

  // purpclaw model reload — refresh .env into process.env
  if (sub === 'reload') {
    try {
      const envPath = path.join(PURP_DIR, '.env');
      const envBody = fs.readFileSync(envPath, 'utf8');
      for (const line of envBody.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const k = trimmed.substring(0, eq).trim();
        const v = trimmed.substring(eq + 1).trim();
        process.env[k] = v;
      }
      console.log(`  ✅ Environment reloaded from .env`);
    } catch (e) {
      console.log(`  ❌ Failed to reload .env: ${e.message}`);
    }
    console.log('');
    return;
  }

  // purpclaw model current — show full routing table
  if (sub === 'current') {
    const info = llm.getProviderInfo();
    console.log('');
    console.log('  🧠 ACTIVE MODEL ROUTING');
    console.log('');
    console.log(`  Main:         ${col(C.cyan, info.main.provider).padEnd(20)} ${col(C.green, info.main.model)}`);
    console.log(`  Swarm:        ${col(C.cyan, info.swarm.provider).padEnd(20)} ${col(C.green, info.swarm.model)}`);
    console.log('');
    // Read model_registry.json for job routing
    let registry = null;
    try {
      registry = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'model_registry.json'), 'utf8'));
    } catch { registry = null; }
    if (registry && registry.routing) {
      console.log('  Per-job routing:');
      for (const [job, cfg] of Object.entries(registry.routing)) {
        const p = cfg.provider.replace(/\{\{(\w+)\}\}/g, (_, k) => process.env[k] || k);
        const m = cfg.model.replace(/\{\{(\w+)\}\}/g, (_, k) => process.env[k] || k);
        console.log(`    ${job.padEnd(12)} ${col(C.cyan, p).padEnd(20)} ${col(C.green, m)}`);
      }
    }
    console.log('');
    console.log(col(C.gray, '  purpclaw model use <provider>/<model>   hot-swap'));
    console.log(col(C.gray, '  purpclaw model reload                  refresh .env'));
    console.log('');
    return;
  }

  // purpclaw model help
  console.log('');
  console.log('  Usage:');
  console.log(`    ${col(C.cyan, 'purpclaw model list')}                 show providers`);
  console.log(`    ${col(C.cyan, 'purpclaw model use <p>/<m>')}          hot-swap provider/model`);
  console.log(`    ${col(C.cyan, 'purpclaw model test \"<prompt>\"')}      quick ping`);
  console.log(`    ${col(C.cyan, 'purpclaw model')}                       this help`);
  console.log('');
};

if (require.main === module) {
  main().catch(e => {
    if (TAINT_MODE) {
      console.error(col(C.magenta, `\n  ✗ ${taintError(e.message)}\n`));
    } else {
      console.error(col(C.red, `\n  ✗ Unhandled error: ${e.message}\n`));
    }
    process.exit(1);
  });
}
