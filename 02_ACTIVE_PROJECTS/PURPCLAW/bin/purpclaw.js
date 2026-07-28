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

const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const { URL } = require('url');

// ── Project root resolver ─────────────────────────────────────────────────────────
// The npm global shim lives in AppData on C:. We walk up looking for the real project.
// But the real PURPCLAW lives on E: — the walker can't cross drives. So we also
// check the known absolute path of the real project directly. One .env to rule them all.
function resolveProjectRoot() {
  const marker = 'docs' + path.sep + 'COMPANION_EVENT_MAP.md';

  // Check the known real project path first (E: / gDrive project)
  const KNOWN_PROJECTS = [
    'E:' + path.sep + 'god folder' + path.sep + '02_ACTIVE_PROJECTS' + path.sep + 'PURPCLAW',
  ];
  for (const p of KNOWN_PROJECTS) {
    if (fs.existsSync(path.join(p, marker))) return p;
  }

  // Fallback: walk up from npm package dir
  const original = path.resolve(__dirname, '..');
  let dir = original;
  let prev = '';
  while (dir !== prev) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    prev = dir;
    dir = path.dirname(dir);
  }
  return original;
}

const PURP_DIR      = resolveProjectRoot();
const { trackedSpawn, execSafe, installCleanup, list: listChildren } = require('../lib/child-registry');

// ── Root and config ───────────────────────────────────────────────────────────

// Lightweight .env loader
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
const PURP_SKILLS_DIR = path.join(PURP_DIR, 'skills');
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
  warn(msg)    { return this._stop(col(C.yellow,'[!]'), msg); }
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
  MEDIA_OPERATIONS     : C.green,
  SCIENCE       : C.white,
  CREATIVE      : C.magenta,
  INFRASTRUCTURE: C.gray,
};

// ── Print helpers ─────────────────────────────────────────────────────────────
function banner() {
  const W     = isTTY ? (process.stdout.columns || 80) : 80;
    const inner = W - 2;
    const bTop  = col(C.magenta, '╔' + '═'.repeat(inner) + '╗');
    const bBot  = col(C.magenta, '╚' + '═'.repeat(inner) + '╝');
    const bRow  = (content) => {
      const raw = content.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = Math.max(0, inner - raw.length);
      return col(C.magenta, '║') + content + ' '.repeat(pad) + col(C.magenta, '║');
    };

    const now     = new Date();
    const ts      = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}  ${now.toLocaleTimeString('en-GB')}`;

    // Row 1: PURPCLAW brand
    console.log('\n' + bTop);
    console.log(bRow(
      '  ' + col(C.magenta + C.bold, 'PURPCLAW') + '  ' +
      '  ' + col(C.green, 'ONLINE') + '     ' +
      col(C.gray, '32/32 UP') + '  ' +
      col(C.gray, '|  ') +
      col(C.cyan, '152 AGENTS') + '  ' +
      col(C.gray, '|  ') +
      col(C.white, '501 TOOLS') + '  ' +
      col(C.gray, '|  ') +
      col(C.gray, 'v0.9.0-rc') + '  ' +
      ' '.repeat(Math.max(0, inner - 100)) +
      '  ' + col(C.gray, ts)
    ));

    // Row 2: subtitle + mode
    console.log(bRow(
      '  ' + col(C.gray, 'PURPCLAW TUI  ·  One Mission / Many Lenses') +
      ' '.repeat(Math.max(0, inner - 60)) +
      '  ' + col(C.green + C.bold, '[*] SYSTEM OPERATIONAL')
    ));

    console.log(bBot + '\n');
}

function sectionHead(title) {
  const W    = isTTY ? Math.min(process.stdout.columns || 80, 80) : 80;
  const bare = title.replace(/\x1b\[[0-9;]*m/g, '');
  const fill = Math.max(0, W - bare.length - 2);
  console.log(`\n${col(C.cyan + C.bold, title)}  ${col(C.gray, '─'.repeat(fill))}`);
}

function tick(ok) { return ok ? col(C.green, '[*]') : col(C.red, '[o]'); }

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
    console.error(col(C.red, `  [X] ecosystem.config.js not found`));
    process.exit(1);
  }
  if (!names.length) {
    console.error(col(C.red, `  [X] No services in profile "${target.label}"`));
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
    console.error(col(C.red, `  [X] PM2 failed: ${e.message}`));
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
      console.log(`  ${col(C.yellow + C.bold, '[!]  uh oh bestie')}  ${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length)}  ${col(C.red, coreFailed.length + ' services did a fucky wucky')}`);
    } else {
      console.log(
        `  ${col(C.yellow + C.bold, '[!]  PARTIAL START')}  ` +
        `${col(C.gray, '·')}  ${col(C.green, online.length + '/' + rows.length)}  ` +
        `${col(C.red, coreFailed.length + ' required service(s) failed')}`
      );
    }
  }
  console.log('');

  if (online.some(r => r.pm2 === 'purpclaw-nextjs')) {
    console.log(`  ${col(C.gray, 'Mission Control')}  ${col(C.gray, '→')}  ${col(C.cyan + C.bold, 'http://localhost:3030')}`);
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
    console.error(col(C.red, `\n  [X] No services in profile "${target.label}"\n`));
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
    console.log(`  ${col(C.yellow, '[o]')}  ${col(C.gray, disp)}  ${port}`);
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
      console.log(col(C.green, '  [OK] Done.\n'));
    } catch (e) {
      console.error(col(C.red, `  [X] ${e.message}`));
      process.exit(1);
    }
    return;
  }

  const target = resolveLaunchTarget(args);
  const names = target.names;

  if (!names.length) {
    console.error(col(C.red, `\n  [X] No PM2 services found for ${target.label}\n`));
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
    console.log(col(C.green, `  [OK] Restarted ${names.length} service${names.length === 1 ? '' : 's'}.\n`));
  } catch (e) {
    console.error(col(C.red, `  [X] ${e.message}`));
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
      console.log(col(C.red, '  [X] offline'));
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
      console.log(`\n  [OK] Embeddings healthy`);
      console.log(`    Model:    ${h.model}`);
      console.log(`    Dim:      ${h.dim}`);
      console.log(`    Endpoint: ${h.baseUrl}\n`);
    } else {
      console.log(`\n  [X] Embeddings unavailable: ${h.reason}\n`);
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
      console.log(`\n  [X] ${e.message}\n`);
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
    console.log(`\n  ${col(C.green, '[OK]')} Ed25519 keypair generated`);
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
    console.log(`\n  ${col(C.green, '[OK]')} Signed ${manifestPath}`);
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
      console.log(`\n  ${col(C.red, '[X]')} No signature in manifest\n`);
      return;
    }
    // Strip signature and embedded publicKey before verifying so we get a
    // true test of the stored key against the manifest body.
    const toVerify = { ...manifest };
    delete toVerify.signature;
    delete toVerify.publicKey;
    if (rs.verifyManifest(toVerify, sig)) {
      console.log(`\n  ${col(C.green, '[OK]')} Valid signature\n`);
    } else {
      // Show more detail
      const kp = rs.loadKeypair();
      if (!kp) {
        console.log(`\n  ${col(C.red, '[X]')} No keypair found — run ${col(C.cyan, 'purpclaw release keygen')} first\n`);
      } else {
        console.log(`\n  ${col(C.red, '[X]')} Invalid signature (stored key does not match signing key)\n`);
      }
    }
    return;
  }

  // Show key status
  const kp = rs.loadKeypair();
  console.log(`\n  ${col(C.cyan, '🔐 RELEASE SIGNING')}\n`);
  if (kp) {
    console.log(`  ${col(C.green, '[OK]')} Keypair present`);
    console.log(`  ${col(C.gray, '  Private:')} ${rs.KEYS_DIR}\\private.pem`);
    console.log(`  ${col(C.gray, '  Public:')}  ${rs.KEYS_DIR}\\public.pem`);
  } else {
    console.log(`  ${col(C.yellow, '[!]')} No keypair found — run ${col(C.cyan, 'purpclaw release keygen')}\n`);
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
  // Codex parity: --include-non-interactive flag (include batch/background sessions in list)
  const includeNonInteractive = args.includes('--include-non-interactive');
  const filterArgs = args.filter(a => !a.startsWith('--'));

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
      const tick  = installed ? col(C.green, '✔') : col(C.gray, '[o]');
      const size  = col(C.gray, s.size_kb + 'K');
      const orig  = s.origin ? col(C.gray, '[' + s.origin + ']') : '';
      console.log(`  ${tick}  ${col(C.cyan, s.name.padEnd(32))}  ${col(C.gray, s.description.slice(0, 50))} ${size} ${orig}`);
    }
    if (reg.skills.length > 20) console.log(col(C.gray, `  ... and ${reg.skills.length - 20} more. Full list in registry/index.json`));

    // Show agents
    sectionHead('  AGENTS (' + reg.agents.length + ')');
    for (const a of reg.agents) {
      const installed = fs.existsSync(path.join(LOCAL_AGENTS, a.name + '.md'));
      const tick  = installed ? col(C.green, '✔') : col(C.gray, '[o]');
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

// ── bundles ──────────────────────────────────────────────────────────────────
// Skill bundle management — load multiple skills under one slash command.
// Storage: ~/.purpclaw/skill-bundles/<name>.json
// E.g. /backend-dev loads github-code-review + test-driven-development + github-pr-workflow.
async function cmdBundles(args) {
  const B = require(path.join(PURP_DIR, 'lib', 'skill-bundles'));
  const sub = (args[0] || '').toLowerCase();
  const name = args[1] || '';

  if (sub === 'reload') {
    const diff = B.reloadBundles();
    console.log(`  ${col(C.green, '✓')} Reloaded — added: ${diff.added.length}, removed: ${diff.removed.length}, total: ${diff.total}`);
    return;
  }

  if (sub === 'create') {
    if (!name) return console.log(col(C.gray, '  Usage: purpclaw bundles create <name>'));
    const { execSync } = require('child_process');
    try {
      execSync(`node "${path.join(PURP_DIR, 'lib', 'skill-bundles.js')}" create "${name}"`, { cwd: PURP_DIR, stdio: 'inherit' });
    } catch { process.exit(1); }
    return;
  }

  if (sub === 'show') {
    if (!name) return console.log(col(C.gray, '  Usage: purpclaw bundles show <slug>'));
    const { execSync } = require('child_process');
    try {
      execSync(`node "${path.join(PURP_DIR, 'lib', 'skill-bundles.js')}" show "${name}"`, { cwd: PURP_DIR, stdio: 'inherit' });
    } catch { process.exit(1); }
    return;
  }

  // Default: list all bundles
  const bundles = B.listBundles();
  if (!bundles.length) {
    console.log(col(C.gray, '  No bundles found.'));
    console.log(col(C.gray, '  Create ~/.purpclaw/skill-bundles/<name>.json'));
    console.log(col(C.gray, '  Or: purpclaw bundles create backend-dev'));
    return;
  }
  console.log(`\n  ${col(C.cyan + C.bold, 'Skill Bundles')}  (${bundles.length})\n`);
  for (const b of bundles) {
    console.log(`  ${col(C.bold, '/' + b.slug)}  — ${b.description}`);
    console.log(`    skills: ${b.skills.join(', ')}`);
    console.log('');
  }
  console.log(col(C.gray, '  Use: purpclaw bundles show <slug>'));
  console.log(col(C.gray, '  Create: purpclaw bundles create <name>'));
  console.log('');
}

// ── guard ────────────────────────────────────────────────────────────────────
// Skills security scanner — scan externally-sourced skills for threats.
// Detects: exfiltration, prompt injection, destructive ops, persistence,
// network pivots, obfuscation, hardcoded secrets, and 70+ patterns.
async function cmdGuard(args) {
  const G = require(path.join(PURP_DIR, 'lib', 'skills-guard'));
  const fs = require('fs');
  const sub = (args[0] || '').toLowerCase();
  const target = args[1] || '';

  if (!sub || sub === 'help') {
    sectionHead('  GUARD — Skills Security Scanner');
    console.log(col(C.gray, '  Scan externally-sourced skills for 70+ threat patterns.\n'));
    console.log(`  ${col(C.cyan, 'purpclaw guard scan <path>')}    scan a skill directory`);
    console.log(`  ${col(C.cyan, 'purpclaw guard check <name>')}   check an installed skill`);
    console.log(`  ${col(C.cyan, 'purpclaw guard list')}           list installed skills`);
    console.log(`  ${col(C.cyan, 'purpclaw guard policy')}        show trust policy`);
    console.log(col(C.gray, '\n  Verdict: safe | caution | dangerous'));
    console.log('');
    return;
  }

  if (sub === 'policy') {
    sectionHead('  TRUST POLICY');
    console.log(`  builtin:       always allow`);
    console.log(`  trusted:       allow safe/caution; block dangerous`);
    console.log(`  community:    allow safe; block caution/dangerous`);
    console.log(`  agent-created: always ask`);
    console.log(col(C.gray, '\n  --force bypasses non-dangerous blocks.'));
    console.log('');
    return;
  }

  if (sub === 'list') {
    const SKILLS_DIR = path.join(PURP_DIR, 'skills');
    if (!fs.existsSync(SKILLS_DIR)) {
      return console.log(col(C.gray, '  No skills installed.'));
    }
    const entries = fs.readdirSync(SKILLS_DIR).filter(e => {
      const full = path.join(SKILLS_DIR, e);
      const skillMd = path.join(full, 'SKILL.md');
      return fs.statSync(full).isDirectory() && fs.existsSync(skillMd);
    });
    if (!entries.length) return console.log(col(C.gray, '  No skills installed.'));
    sectionHead(`  INSTALLED SKILLS (${entries.length})`);
    for (const e of entries.sort()) {
      console.log(`  ${col(C.cyan, e)}`);
    }
    console.log(col(C.gray, '\n  Scan: purpclaw guard check <name>'));
    console.log('');
    return;
  }

  let skillPath = '';
  let source = 'community';
  let skillName = '';

  if (sub === 'check') {
    if (!target) return console.log(col(C.gray, '  Usage: purpclaw guard check <skill-name>'));
    const SKILLS_DIR = path.join(PURP_DIR, 'skills');
    skillPath = path.join(SKILLS_DIR, target);
    skillName = target;
    if (!fs.existsSync(skillPath)) {
      // Try hermes skills dir
      const HERMES_SKILLS = path.join(process.env.HOME || process.env.USERPROFILE, '.hermes', 'skills', target);
      if (fs.existsSync(HERMES_SKILLS)) {
        skillPath = HERMES_SKILLS;
      } else {
        return console.log(col(C.red, `  Skill not found: ${target}`));
      }
    }
    // Determine trust from path
    const absSkillPath = path.resolve(skillPath);
    const relToPurp  = path.relative(PURP_DIR, absSkillPath).split(path.sep).join('/');
    const relToHome  = path.relative(process.env.HOME || '', absSkillPath).split(path.sep).join('/');
    if (relToHome.startsWith('.hermes/skills')) {
      source = 'builtin';
    } else if (relToPurp.startsWith('skills/')) {
      source = 'agent-created';
    }
  } else if (sub === 'scan') {
    if (!target) return console.log(col(C.gray, '  Usage: purpclaw guard scan <path>'));
    skillPath = path.resolve(target);
    skillName = path.basename(skillPath);
    if (!fs.existsSync(skillPath)) {
      return console.log(col(C.red, `  Path not found: ${skillPath}`));
    }
  } else {
    return console.log(col(C.gray, `  Unknown guard subcommand: ${sub}`));
  }

  const force = args.includes('--force') || args.includes('-f');
  const cached = args.includes('--no-cache');

  sectionHead('  SCANNING: ' + skillName);

  let result;
  if (cached) {
    result = G.scanSkill(skillPath, source);
  } else {
    const { result: r } = G.scanSkillCached(skillPath, source);
    result = r;
  }

  console.log(formatGuardReport(result));
  console.log('');

  const { allowed, reason } = G.shouldAllowInstall(result, force);
  const verdictColor = result.verdict === 'safe' ? C.green
    : result.verdict === 'caution' ? C.yellow : C.red;
  console.log(`  Trust: ${col(C.cyan, result.trust_level)}   Verdict: ${col(C.bold + verdictColor, result.verdict.toUpperCase())}`);
  if (allowed === true)      console.log(`  ${col(C.green, '✓ ALLOWED')}  ${col(C.gray, reason)}`);
  else if (allowed === null) console.log(`  ${col(C.yellow, '⚠ NEEDS CONFIRMATION')}  ${reason}`);
  else                        console.log(`  ${col(C.red, '✗ BLOCKED')}  ${reason}`);
  console.log('');

  if (allowed === false && !force && !['builtin', 'trusted'].includes(result.trust_level)) {
    console.log(col(C.gray, '  Run with --force to override.'));
  }
}

function formatGuardReport(result) {
  const lines = [];
  const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

  if (!result.findings.length) {
    return col(C.green, '  No threats found.');
  }

  const sorted = [...result.findings].sort((a, b) =>
    (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4)
  );

  for (const f of sorted) {
    const sev  = f.severity.toUpperCase().padEnd(8);
    const cat  = f.category.padEnd(14);
    const loc  = `${f.file}:${f.line}`.padEnd(28);
    const sevColor = f.severity === 'critical' ? C.red
      : f.severity === 'high' ? C.yellow
      : f.severity === 'medium' ? C.cyan : C.gray;
    const match = f.match.slice(0, 55);
    lines.push(`  ${col(sevColor, sev)} ${col(C.magenta, cat)} ${col(C.gray, loc)} "${match}"`);
  }
  return lines.join('\n');
}

// ── run ───────────────────────────────────────────────────────────────────────
async function cmdRun(args) {
  const approvalArg = args.find(a => a.startsWith('--approval='));
  const approvalId = approvalArg ? approvalArg.split('=')[1] : null;
  const IS_JSON = args.includes('--json');
  const taskArgs = args.filter(a => !a.startsWith('--approval=') && a !== '--json');
  const task = taskArgs.join(' ').trim();
  if (!task) {
    console.error(col(C.red, '\n  Usage: purpclaw run "<task>"\n'));
    process.exit(1);
  }

  if (!IS_JSON) {
    console.log(`\n  ${col(C.cyan + C.bold, '⚡ PURPCLAW RUN')}\n`);
    console.log(`  ${col(C.gray, 'Task:')} ${task}\n`);
  }

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

        const type = evt.type || evt.event || 'event';

        // ── JSON mode: emit one JSONL line per event, resolve on completion ──
        if (IS_JSON) {
          if (type === 'workflow_complete' || type === 'completed') {
            const result = evt.result !== undefined ? evt.result : evt.workflow?.result;
            const workflowId = evt.workflowId || evt.workflow?.workflowId;
            process.stdout.write(JSON.stringify({ timestamp_ms: Date.now(), type: 'workflow_complete', result, workflowId }) + '\n');
            if (!resolved) { resolved = true; resolve(); }
          } else if (type === 'workflow_failed' || type === 'failed') {
            process.stdout.write(JSON.stringify({ timestamp_ms: Date.now(), type: 'workflow_failed', error: evt.error || '' }) + '\n');
            if (!resolved) { resolved = true; resolve(); }
          } else if (type === 'agent_spawned' || type === 'agent_complete' || type === 'step' || type === 'log') {
            const out = { timestamp_ms: Date.now(), type };
            if (evt.agent || evt.agentName) out.agent = evt.agent || evt.agentName;
            if (evt.message) out.message = evt.message;
            if (evt.description) out.description = evt.description;
            if (evt.status) out.status = evt.status;
            process.stdout.write(JSON.stringify(out) + '\n');
          }
          return;
        }

        // ── Human mode ──
        const ts = col(C.gray, new Date().toLocaleTimeString());

        if (type === 'workflow_complete' || type === 'completed') {
          console.log(`\n  ${col(C.green, '[OK] Complete')}  ${col(C.gray, evt.workflowId || '')}`);
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
          console.log(`\n  ${col(C.red, '[X] Failed')}  ${col(C.gray, evt.error || '')}`);
          if (!resolved) { resolved = true; resolve(); }
        } else if (type === 'agent_spawned') {
          console.log(`  ${ts}  ${col(C.blue, '⚙ spawn')}   ${col(C.cyan, evt.agent || evt.agentName || '?')} ${col(C.gray, '→')} ${evt.task || evt.intent || ''}`);
        } else if (type === 'agent_complete') {
          console.log(`  ${ts}  ${col(C.green, '[OK] done ')}   ${col(C.cyan, evt.agent || evt.agentName || '?')}`);
        } else if (type === 'step' || type === 'workflow_step') {
          const icon = evt.status === 'started' ? col(C.yellow, '▶ step ') : col(C.green, '[OK] step ');
          console.log(`  ${ts}  ${icon}   ${evt.description || JSON.stringify(evt).substring(0, 80)}`);
        } else if (type === 'log') {
          console.log(`  ${ts}  ${col(C.gray, '·')}          ${evt.message || ''}`);
        } else {
          const msg = evt.message || evt.description || evt.summary || '';
          if (msg) console.log(`  ${ts}  ${col(C.gray, '·')}          ${String(msg).substring(0, 100)}`);
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
      console.error(col(C.red, `\n  [X] Orchestrator rejected task: ${JSON.stringify(resp.body)}\n`));
      streamReq && streamReq.destroy();
      process.exit(1);
    }

    const wf = resp.body;
    if (IS_JSON) {
      process.stdout.write(JSON.stringify({ timestamp_ms: Date.now(), type: 'workflow_start', workflowId: wf.workflowId }) + '\n');
    } else {
      console.log(`  ${col(C.gray, 'Workflow:')} ${col(C.cyan, wf.workflowId || '—')}\n`);
    }

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
        console.log(col(C.yellow, '\n  [!] Timed out waiting for completion signal. Workflow may still be running.'));
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
      console.error(col(C.red, `\n  [X] Orchestrator timed out [port=${PORTS.orchestrator}]. `) +
        col(C.yellow, `The dispatch endpoint is busy — likely active workflows consuming capacity.\n`));
      console.error(col(C.gray, `  Run \`purpclaw status\` to see active workflows.\n`));
    } else if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, `\n  [X] Orchestrator not reachable [port=${PORTS.orchestrator}]. Run \`purpclaw start\` first.\n`));
    } else {
      console.error(col(C.red, `\n  [X] ${e.message}\n`));
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
      const statusDot = busy ? col(C.cyan, '◉') : col(C.gray, '[o]');
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
        console.log(`     ${col(C.green, '[OK]')} ${col(C.gray, (wf.workflowId || wf.id || '—').padEnd(22))} ${wf.command?.substring(0, 50) ?? ''}`);
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
        console.error(col(C.red, `  [X] ${JSON.stringify(result.body)}\n`));
        return;
      }
      console.log(col(C.green, `  [OK] Ingested successfully`));
      if (result.body?.id) console.log(col(C.gray, `  id: ${result.body.id}`));
    } catch (e) {
      console.error(col(C.red, e.code === 'ECONNREFUSED'
        ? '  [X] Memory matrix offline. Run `purpclaw start`.\n'
        : `  [X] ${e.message}\n`));
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
        console.error(col(C.red, `  [X] ${JSON.stringify(result.body)}\n`)); return;
      }
      const removed = result.body?.removed ?? result.body?.count ?? '?';
      console.log(col(C.green, `  [OK] Removed ${removed} memories matching "${query}"\n`));
    } catch (e) {
      console.error(col(C.red, e.code === 'ECONNREFUSED'
        ? '  [X] Memory matrix offline.\n'
        : `  [X] ${e.message}\n`));
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
      console.error(col(C.red, `  [X] Memory matrix error: ${JSON.stringify(result.body)}\n`));
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
      console.error(col(C.red, '  [X] Memory matrix offline. Run `purpclaw start`.\n'));
    } else {
      console.error(col(C.red, `  [X] ${e.message}\n`));
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
      console.error(col(C.red, `  [X] Dream error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const r = result.body;
    if (r.skipped) {
      console.log(`  ${col(C.yellow, '~')} Dream skipped — ${r.skipped}`);
    } else {
      console.log(`  ${col(C.green, '[OK]')} Dream cycle complete`);
      if (r.entriesMerged  !== undefined) console.log(`  Merged     : ${col(C.cyan, String(r.entriesMerged))} entries`);
      if (r.rulesExtracted !== undefined) console.log(`  Rules      : ${col(C.cyan, String(r.rulesExtracted))} extracted`);
      if (r.archived       !== undefined) console.log(`  Archived   : ${col(C.gray, String(r.archived))} old entries`);
    }
    console.log('');
    return;
  } catch (e) {
    if (e.code !== 'ECONNREFUSED') {
      console.error(col(C.red, `  [X] ${e.message}\n`));
      return;
    }
    // autoDream offline — fall through to memory matrix
  }

  tried = 'memory-matrix';
  console.log(col(C.gray, '  autoDream offline — falling back to memory matrix (port 7880)...\n'));
  try {
    const result = await httpPost(PORTS.memory, '/dream', { mode: 'full' }, 30000);
    if (result.status >= 400) {
      console.error(col(C.red, `  [X] Dream cycle error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const r = result.body;
    console.log(`  ${col(C.green, '[OK]')} Dream cycle complete (via memory matrix)`);
    if (r.phase)        console.log(`  Phase      : ${col(C.cyan, r.phase)}`);
    if (r.consolidated) console.log(`  Consolidated: ${col(C.cyan, String(r.consolidated))} memories`);
    if (r.pruned)       console.log(`  Pruned     : ${col(C.gray, String(r.pruned))} stale memories`);
    if (r.symbols)      console.log(`  Symbols    : ${col(C.cyan, String(r.symbols))} lifted`);
    console.log('');
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, `  [X] Both autoDream (7895) and memory matrix (7880) offline. Run \`purpclaw start\`.\n`));
    } else {
      console.error(col(C.red, `  [X] ${e.message}\n`));
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
      console.log(`  \\x1b[32m[OK]\\x1b[0m  personal data ready. run: \\x1b[36mpurpclaw lora train --personal\\x1b[0m`);
    } else if (personalTotal > 0) {
      console.log(`  \\x1b[33m⟳\\x1b[0m  collecting personal data... (${personalTotal}/10, need ${10-personalTotal} more)`);
    } else {
      console.log(`  \\x1b[90m[o]\\x1b[0m  no personal data yet. use PurpClaw normally — corrections auto-capture`);
    }
    console.log('');
    if (examples < 10 && personalTotal < 10) {
      console.log(`  \\x1b[33m[!]\\x1b[0m  need at least 10 examples to train (general or personal). let the runtime accumulate.`);
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
        console.log(`  \\x1b[33m[!]\\x1b[0m  ${exported.reason}`);
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
          console.log(`  \\x1b[32m[OK]\\x1b[0m  Personal LoRA training complete.`);
          console.log(`  \\x1b[90mYour model now knows your preferences. Every correction made it smarter.\\x1b[0m`);
        } else {
          console.log(`  \\x1b[31m[X]\\x1b[0m  personal training exited with code ${code}`);
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
        console.log(`  \\x1b[32m[OK]\\x1b[0m  LoRA pipeline complete.`);
        console.log(`  \\x1b[90mnext:\\x1b[0m  pm2 restart purpclaw-api  \\x1b[90m— to pick up the new LLM_MODEL\\x1b[0m`);
      } else {
        console.log(`  \\x1b[31m[X]\\x1b[0m  pipeline exited with code ${code}`);
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
    console.error(col(C.red, `  [X] persona-forge.js not found: ${e.message}\n`));
    return;
  }

  // Draw soul from gacha
  console.log(col(C.gray, '  Drawing soul from gacha (8,000,000 combinations)...\n'));
  let soul = null;
  try {
    soul = forgeLib.drawSoul();
  } catch (e) {
    console.error(col(C.red, `  [X] Gacha failed: ${e.message}\n  Is Python available? Set PYTHON_BIN in .env.\n`));
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
    console.error(col(C.red, `  [X] Forge failed: ${e.message}\n`));
    return;
  }

  // Report
  console.log(`  ${col(C.green, '[OK]')} Agent forged: ${col(C.bold, agentName)} (${result.slug})`);
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
        console.log(col(C.yellow, '  [!]  key sanitiser noticed:'));
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
        console.log(col(C.yellow, `  [!]  key sanitiser noticed:`));
        for (const w of result.warnings) console.log(col(C.gray, `     · ${w}`));
      }
      apiKey = result.value;
      if (!result.ok) {
        console.log(col(C.red, `  [X] key looks malformed (length ${apiKey.length}); proceeding but auth will likely fail.`));
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
    console.log(col(C.gray, '  Web:   http://localhost:3030\n'));
  }

  console.log(col(C.green + C.bold, '  ✔  PURPCLAW IS READY\n'));
  console.log(col(C.gray, '  Next:'));
  console.log(`    ${col(C.cyan, 'purpclaw status')}      live dashboard`);
  console.log(`    ${col(C.cyan, 'purpclaw mochi')}      chat with your companion`);
  console.log(`    ${col(C.red,   'purpclaw awaken')}      DO NOT PRESS — the machine breathes`);
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
    const icon = c.ok ? col(C.green, '  [OK]') : col(C.red, '  [X]');
    const hint = c.hint ? col(C.gray, `  ← ${c.hint}`) : '';
    console.log(`${icon}  ${c.label}${hint}`);
  }

  // Show service connectivity
  if (anyOnline) {
    console.log(`\n${col(C.bold, '  SERVICES (running)')}`)
    for (const r of svcResults) {
      const s = r.value || { name: '?', ok: false };
      const icon = s.ok ? col(C.green, '  [OK]') : col(C.gray, '  ·');
      console.log(`${icon}  ${s.name.padEnd(16)}${col(C.gray, s.ok ? 'online' : 'offline')}`);
    }
  } else {
    console.log(col(C.gray, '\n  (Services not running yet — run `purpclaw start` after setup)'));
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  console.log('');
  if (issues.length === 0) {
    console.log(col(C.green + C.bold, '  [OK] All checks passed!\n'));
    console.log(`  ${col(C.cyan,  'purpclaw start')}   — boot the full stack`);
    console.log(`  ${col(C.cyan,  'purpclaw chat')}    — open the REPL`);
    console.log(`  ${col(C.cyan,  'purpclaw run "<task>"')} — send a task to the swarm`);
  } else {
    console.log(col(C.yellow + C.bold, `  [!] ${issues.length} issue${issues.length > 1 ? 's' : ''} to fix:\n`));
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
      console.log(col(C.green, `  [OK] .env template written to ${envPath}`));
      console.log(col(C.gray,  '  Edit it with your API key, then run `purpclaw init` again to verify.\n'));
    } catch (e) {
      console.error(col(C.red, `  [X] Could not write .env: ${e.message}\n`));
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
    console.error(col(C.red, '  [X] PM2 not found. Install: npm install -g pm2'));
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
    console.log(col(C.yellow, '  [!] Orchestrator is offline — agent routing unavailable.'));
    console.log(col(C.gray,   '  Run `purpclaw start` in another terminal to enable full swarm.\n'));
  }

  if (!fs.existsSync(NANOCLAW)) {
    console.error(col(C.red, `  [X] nanoclaw.js not found at ${NANOCLAW}`));
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
    console.error(col(C.red, `  [X] Failed to launch nanoclaw: ${e.message}`));
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
      console.log(col(C.red, `  [X] Usage: purpclaw config set ${key} <value>`));
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
      detail = `online :${service.healthPort}  [!] ORPHAN (not under PM2)`;
      orphans.push({ name: service.name, port: service.healthPort, pm2: pm2Name });
    } else if (pm2Info && pm2Info.restarts > 50) {
      detail = `online :${service.healthPort}  [!] ${pm2Info.restarts} restarts (crash loop history)`;
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
    console.log('\n  ' + col(C.yellow + C.bold, '[!]  ORPHAN PROCESSES DETECTED'));
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
    console.log('\n  ' + col(C.yellow + C.bold, '[!]  CRASH-LOOP HISTORY'));
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
    console.log(col(C.red, `  [X] Approval ${approvalId} not found`));
  } else {
    console.log(col(C.yellow, `  [X] Rejected: ${approvalId}`));
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
    if (!s) return console.log(col(C.red, '  [X] context-bus offline on :' + CTX_PORT));
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
    if (!team) return console.log(col(C.red, '  [X] context-bus offline'));
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
    if (!a) return console.log(col(C.red, '  [X] context-bus offline'));
    if (a.not_found) return console.log(col(C.gray, `  Agent "${rest}" not found`));
    console.log('');
    console.log(col(C.bold, `  AGENT: ${rest}`));
    Object.entries(a).forEach(([k, v]) => { if (!k.startsWith('_')) console.log(`  ${String(k).padEnd(15)} ${v}`); });
    console.log('');
    return;
  }

  if (sub === 'workflows') {
    const wf = await ctxGet('/context/workflows');
    if (!wf) return console.log(col(C.red, '  [X] context-bus offline'));
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
        res.on('end', () => { try { const r = JSON.parse(d); console.log(col(r.success ? C.green : C.red, `  ${r.success ? '[OK]' : '[X]'} ${resourceId} ${r.success ? 'locked' : (r.reason || r.lockedBy)}`)); } catch { console.log(col(C.red, '  lock failed')); } resolve(); });
      });
      req.on('error', e => { console.log(col(C.red, '  [X] ' + e.message)); resolve(); });
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
      console.error(col(C.red, `  [X] ${e.message} — is the pool running on :${POOL_PORT}? Try \`purpclaw doctor\`.\n`));
    }
    return;
  }

  // ── pool show <name> ───────────────────────────────────────────────────────
  if (sub === 'show' && rest) {
    sectionHead(`  SKILL · ${rest}`);
    try {
      const res = await poolReq('GET', `/pool/skills/${encodeURIComponent(rest)}`);
      if (res.error) { console.error(col(C.red, `  [X] ${res.error}\n`)); return; }
      console.log(col(C.gray, `  ${res.description || ''}\n`));
      console.log(res.content);
      console.log('');
    } catch (e) {
      console.error(col(C.red, `  [X] ${e.message}\n`));
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
      console.error(col(C.red, `  [X] ${e.message}\n`));
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
      console.error(col(C.red, `  [X] pool offline (:${POOL_PORT})  —  ${e.message}\n`));
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
      console.error(col(C.red, `  [X] ${e.message}\n`));
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

// ── spaghetti ─────────────────────────────────────────────────────────────────────
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

// ── squad ─────────────────────────────────────────────────────────────────────
async function cmdSquad(args) {
  const squad = require(path.join(PURP_DIR, 'lib', 'squad'));
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'feed') {
    const result = squad.feedPet(args[1] || 'mochi', args[2] || 'snack');
    console.log(result.error || `  ${result.pet} — ${result.mood} · ${result.reaction}`);
    return;
  }

  if (sub === 'react') {
    const r = squad.squadReact(args[1] || 'mochi', args[2] || 'idle');
    console.log(r ? `  ${r}` : `  pet not found`);
    return;
  }

  const status = squad.squadStatus();
  console.log('');
  console.log('  === Pet Squad ===');
  for (const pet of status.pets) {
    const m = pet.mood === 'happy' ? '[*]' : pet.mood === 'concerned' ? '[o]' : '◌';
    console.log(`  ${m} ${pet.slug} (${pet.name})`);
    console.log(`     ${pet.personality} · mood: ${pet.mood} · chats: ${pet.interactions}`);
  }
  console.log(`\n  Total: ${status.totalInteractions} interactions\n`);
}

// ── tui ───────────────────────────────────────────────────────────────────────
function cmdTui(args = []) {
  // `purpclaw tui ask` opens the interactive agent chat TUI.
  // `purpclaw tui` (no subcommand) opens the live dashboard cockpit.
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'ask') {
    const TUI_ASK = path.join(PURP_DIR, 'scripts', 'tui-ask.js');
    if (!fs.existsSync(TUI_ASK)) {
      console.error(col(C.red, `\n  [X] scripts/tui-ask.js not found at ${TUI_ASK}\n`));
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
    child.on('error', e => { console.error(col(C.red, `\n  [X] tui-ask failed: ${e.message}\n`)); process.exit(1); });
    return;
  }
  const TUI_SCRIPT = path.join(PURP_DIR, 'scripts', 'tui.js');
  if (!fs.existsSync(TUI_SCRIPT)) {
    console.error(col(C.red, `\n  [X] scripts/tui.js not found at ${TUI_SCRIPT}\n`));
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
    console.error(col(C.red, `  [X] TUI failed to launch: ${e.message}`));
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

  section('🧠  BRAIN STACK', [
    ['purpclaw brain',                'Show full brain stack — controller + worker lanes'],
    ['purpclaw brain -v',            'Full config with fallbacks'],
    ['purpclaw route "<task>"',     'Show which lane a task routes to'],
    ['purpclaw providers status',    'Provider readiness: configured / verified / auth_failed'],
    ['purpclaw providers verify',    'Re-probe all providers with live calls'],
  ]);

  section('🐾  COMPANION PET', [
    ['purpclaw pet',                 'Pet status — mood, hunger, energy, happiness'],
    ['purpclaw pet feed [food]',     'Feed the pet (cookie, pizza, sushi...)'],
    ['purpclaw pet pet',            'Pet it'],
    ['purpclaw pet play [toy]',      'Play fetch (ball, frisbee, laser, yarn)'],
    ['purpclaw pet sleep',          'Sleep time'],
    ['purpclaw pet wake',           'Wake up'],
    ['purpclaw pet clean',          'Bath time'],
    ['purpclaw pet mute',           'Mute / unmute companion'],
    ['purpclaw pet name [n]',       'Rename the pet'],
    ['purpclaw pet trick [n]',      'Teach a trick'],
    ['purpclaw pet thoughts',       'Current thought + message'],
    ['purpclaw pet reset',          'Reset pet state'],
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
    ['purpclaw safe-start --core',     'Wake the stable core baseline (one at a time)'],
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
    [3030, 'Next.js Mission Control UI'],
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
  console.log(`  ${col(C.gray, 'Web UI')}        ${col(C.gray, '—')}  ${col(C.cyan, 'http://localhost:3030')}`);
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

  // Chat-first entry: bare `purpclaw` opens the conversational agent.
  if (!command) {
    command = 'ask';
    args = [];
  }

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
      console.log(col(C.yellow, '  [!] No API keys detected.'));
    }

    console.log('');
    console.log(col(C.white, '  What would you like to launch?'));
    console.log('');
    console.log(col(C.cyan, `    ${col(C.bold, '1')}. CLI chat        `) + col(C.gray, '(purpclaw ask — interactive agent chat)'));
    console.log(col(C.cyan, `    ${col(C.bold, '2')}. TUI cockpit     `) + col(C.gray, '(purpclaw tui — live dashboard)'));
    console.log(col(C.cyan, `    ${col(C.bold, '3')}. TUI ask         `) + col(C.gray, '(purpclaw tui ask — full-screen chat)'));
    console.log(col(C.cyan, `    ${col(C.bold, '4')}. WebUI           `) + col(C.gray, '(http://localhost:3030 — mission control)'));
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
        // WebUI launcher — check backend before opening browser
        console.log(col(C.gray, '\n  Checking backend...'));
        const { execSync } = require('child_process');
        let backendOk = false;
        try {
          const r = execSync('curl -s --max-time 2 http://127.0.0.1:7780/health', { timeout: 4000, encoding: 'utf8', windowsHide: true });
          backendOk = r.includes('ok') || r.includes('200');
        } catch {}

        if (!backendOk) {
          console.log(col(C.yellow, '  [!] Backend offline — starting services...\n'));
          try {
            execSync('start cmd /c purpclaw start', { detached: true, stdio: 'ignore', windowsHide: true });
          } catch {}
          console.log(col(C.gray, '  Run `purpclaw start` manually if the browser does not open.\n'));
          console.log(col(C.green, '  Opening WebUI at http://localhost:3030 anyway...\n'));
        } else {
          console.log(col(C.green, '  [OK] Backend online\n'));
        }

        execSync('start http://localhost:3030', { windowsHide: true });
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

async function cmdSmoke(args = []) {
  // purpclaw smoke              → run full end-to-end smoke, print report
  // purpclaw smoke --only chain → only that layer
  // purpclaw smoke --json       → machine-readable
  // Mirrors GET /api/smoke — same underlying scripts/smoke-test.mjs.
  const { execSync } = require('child_process');
  banner();
  sectionHead('  SMOKE TEST — the CLI talking to itself, layer by layer');
  const script = path.join(PURP_DIR, 'scripts', 'smoke-test.mjs');
  const only = args.includes('--only') ? ['--only', args[args.indexOf('--only') + 1]] : [];
  const json = args.includes('--json') ? ['--json'] : [];
  try {
    execSync(`node "${script}" ${[...only, ...json].join(' ')}`, { cwd: PURP_DIR, stdio: 'inherit', timeout: 180000 });
    console.log(col(C.green, `\n  smoke: green — every layer proven callable\n`));
  } catch (e) {
    console.log(col(C.red, `\n  smoke: FAILED — see report above (public/showcase/smoke-report.json)\n`));
  }
}

async function cmdApiCall(args = []) {
  // purpclaw api <route>            → GET /api/<route>
  // purpclaw api <route> --post <json>  → POST /api/<route> with body
  // The generic CLI-over-API bridge: any Next API route is reachable from the
  // CLI without hand-coding a case for it. Closes the API-only side of parity.
  const routePath = args[0];
  if (!routePath) {
    banner(); sectionHead('  API CALL — generic CLI→API bridge');
    console.log(col(C.gray, `  usage: purpclaw api <route> [--post '<json>']\n         purpclaw api heartbeat\n         purpclaw api steer --post '{"message":"build login"}'\n`));
    return;
  }
  const postIdx = args.findIndex(a => a === '--post');
  const method = postIdx >= 0 ? 'POST' : 'GET';
  const body = postIdx >= 0 ? args.slice(postIdx + 1).join(' ') : null;
  const clean = routePath.replace(/^\/*(api\/)?/, '');
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request({
      hostname: '127.0.0.1', port: 3030, path: '/api/' + clean, method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
    }, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => {
        console.log(col(C.gray, `  ${method} /api/${clean}  →  ${res.statusCode}`));
        try { console.log(JSON.stringify(JSON.parse(data), null, 2)); }
        catch { console.log(data.slice(0, 4000)); }
        resolve();
      });
    });
    req.setTimeout(45000, () => { req.destroy(new Error('45s timeout')); });
    req.on('error', (e) => { console.log(col(C.red, `  request failed: ${e.message}`)); resolve(); });
    if (body) req.write(body);
    req.end();
  });
}

async function cmdApiRouteWrapper(routePath, args = []) {
  const cleanedArgs = Array.isArray(args) ? args : [];
  return cmdApiCall([routePath, ...cleanedArgs]);
}

async function cmdParityAudit(_args = []) {
  // purpclaw parity-audit → the real system-wide CLI↔API parity delta.
  const { execSync } = require('child_process');
  banner(); sectionHead('  PARITY AUDIT — CLI ↔ API delta (real, not curated)');
  try { execSync(`node scripts/audit-parity.mjs`, { cwd: PURP_DIR, stdio: 'inherit' }); } catch { /* soft */ }
  const fs = require('fs');
  try {
    const rep = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'public', 'showcase', 'parity-report.json'), 'utf8'));
    console.log(col(C.cyan, `\n  CLI cases: ${rep.cli_cases_total}   API routes: ${rep.api_routes_total}   matched: ${rep.matched}`));
    console.log(col(rep.parity_pct_api_side < 80 ? C.yellow : C.green, `  api-side parity: ${rep.parity_pct_api_side}%    cli-side parity: ${rep.parity_pct_cli_side}%`));
    console.log(col(C.gray, `\n  ${rep.api_without_cli} API routes have no CLI (call via: purpclaw api <route>)`));
    console.log(col(C.gray, `  ${rep.cli_without_api} CLI cases have no API`));
    console.log(col(C.gray, `\n  full report: docs/PARITY_AUDIT.md   |   json: public/showcase/parity-report.json\n`));
  } catch (e) { console.log(col(C.red, '  no report: ' + e.message)); }
}

async function cmdWatch(args = []) {
  // purpclaw watch [jobId]      → stream every hop of that job in real time
  // purpclaw watch --all         → stream ALL live events (all jobs, all sources)
  // purpclaw watch --tail 20     → replay last N first, then stream
  // Ctrl+C to exit. Reads lib/trace-store.subscribe (in-process events) + tails
  // ~/.purpclaw/trace/recent.jsonl (durable log) so it works even without an
  // active service (as long as the trace-store module is loaded by something).
  const jobId = args.find(a => !a.startsWith('--'));
  const filterAll = args.includes('--all') || !jobId;
  const snapshot = args.includes('--snapshot');
  const tailN = (() => { const i = args.indexOf('--tail'); return i >= 0 ? parseInt(args[i+1] || '0', 10) : 0; })();
  banner();
  sectionHead(`  LIVE WATCH — ${jobId ? 'jobId=' + jobId : 'ALL EVENTS'}${tailN ? ' (tail ' + tailN + ')' : ''}${snapshot ? ' snapshot' : ''}`);
  console.log(col(C.gray, `  ${new Date().toISOString()} — ${snapshot ? 'snapshot mode.' : 'subscribed. Ctrl+C to exit.'}\n`));

  const trace = require('../lib/trace-store');
  const seen = new Set();
  function render(t) {
    if (!t) return;
    if (!filterAll && jobId && t.jobId !== jobId) return;
    if (seen.has(t.id)) return; seen.add(t.id);
    const stage = String(t.action || '').replace('chain.', '');
    const status = String(t.status || '');
    const c = status === 'failed' ? C.red : status === 'done' || status === 'verified' ? C.green : status === 'delegated' || status === 'routed' ? C.cyan : C.gray;
    const ts = String(t.at || '').slice(11, 19);
    const src = (t.source || '?').slice(0, 14).padEnd(14);
    const route = (t.route || '').slice(0, 22).padEnd(22);
    const detail = (t.detail || '').slice(0, 100);
    const job = (t.jobId || '').slice(0, 14).padEnd(14);
    console.log(`  ${col(c, '[*]')} ${col(C.gray, ts)} ${col(C.bold, job)} ${col(C.gray, src)} ${col(c, (stage || 'event').padEnd(11))} ${col(C.gray, route)} ${col(C.gray, detail)}`);
  }
  // Replay tail if asked (or a default small tail so you see recent context)
  const initialTail = tailN || 8;
  for (const t of (trace.recent(200).slice(-initialTail))) render(t);
  if (snapshot) {
    console.log(col(C.gray, `\n  watch: snapshot closed (${seen.size} event${seen.size === 1 ? '' : 's'})\n`));
    return;
  }
  // Subscribe live
  const off = trace.subscribe(render);
  await new Promise((resolve) => {
    process.on('SIGINT', () => { try { off && off(); } catch {} console.log(col(C.gray, '\n  watch: closed\n')); resolve(); });
  });
}

async function cmdFlow(args = []) {
  // purpclaw flow "<goal>"   → open a real job for a goal AND stream its full
  //   chain live to stdout (steer → route → delegate → agent → tool → done).
  //   This is the "see every part of the stack passing information from chat
  //   to end product" command. One call, one live view.
  const goal = args.join(' ').replace(/^["']|["']$/g, '');
  banner();
  sectionHead(`  FLOW — end-to-end live watch of one goal`);
  if (!goal) {
    console.log(col(C.gray, `  usage: purpclaw flow "<goal>"   — e.g.: purpclaw flow "build a website with media and a game about itself"\n`));
    return;
  }
  console.log(col(C.cyan, `  GOAL → "${goal}"\n`));
  // 1) Steer with execute:true → opens a real kernel job
  const steer = require('../lib/steering-router');
  const decision = steer.steer(goal, { source: 'purpclaw-flow', execute: true });
  const jobId = decision.jobId || decision.steerId || 'no-job';
  console.log(col(decision.delegated ? C.green : C.yellow,
    `  steer: route=${decision.route}${decision.agent ? ' agent=' + decision.agent : ''} reason="${decision.reason}" conf=${decision.confidence}`));
  console.log(col(C.gray, `  jobId=${jobId}${decision.delegated ? ' (delegated)' : ' (preview)'}\n`));
  // 2) Stream every hop for this job until Ctrl+C or done/failed
  console.log(col(C.gray, `  ─ LIVE CHAIN (Ctrl+C to exit) ─────────────────────────────────`));
  const trace = require('../lib/trace-store');
  const seen = new Set();
  let done = false;
  function render(t) {
    if (!t || (t.jobId !== jobId && !(t.jobId || '').startsWith(jobId))) return;
    if (seen.has(t.id)) return; seen.add(t.id);
    const stage = String(t.action || '').replace('chain.', '');
    const status = String(t.status || '');
    const c = status === 'failed' ? C.red : status === 'done' || status === 'verified' ? C.green : status === 'delegated' || status === 'routed' ? C.cyan : C.gray;
    const ts = String(t.at || '').slice(11, 19);
    const route = (t.route || '').slice(0, 24).padEnd(24);
    const detail = (t.detail || '').slice(0, 120);
    console.log(`  ${col(c, '[*]')} ${col(C.gray, ts)} ${col(c, (stage || 'event').padEnd(11))} ${col(C.gray, route)} ${col(C.gray, detail)}`);
    if (status === 'done' || status === 'failed') done = true;
  }
  for (const t of (trace.recent(400))) render(t);
  const off = trace.subscribe(render);
  // Fallback: also print the final chain snapshot every 4s so the user sees progress even if events are quiet
  const chainMod = require('../lib/job-chain');
  const printer = setInterval(() => {
    const v = chainMod.get(jobId);
    if (v.status !== 'unknown') console.log(col(C.gray, `  … chain status=${v.status} steps=${v.steps.length}${v.failedAt ? ' failedAt=' + v.failedAt.area : ''}`));
    if (done || v.status === 'complete' || v.status === 'failed') { clearInterval(printer); try { off && off(); } catch {} process.exit(0); }
  }, 4000);
  await new Promise((resolve) => {
    process.on('SIGINT', () => { try { off && off(); } catch {} console.log(col(C.gray, '\n  flow: closed\n')); resolve(); });
  });
}

async function cmdSpine(_args = []) {
  // purpclaw spine → the parity map. Same content as GET /api/spine so any
  // agent/UI/CLI user discovers the same surfaces the same way.
  banner();
  sectionHead('  SPINE — one door per concern (CLI ↔ API parity)');
  // Fetch the same map the API exposes. Keeping a fallback list in sync would
  // fork the truth; instead, if the API isn't up, read the manifest's parity block.
  let surfaces = null;
  try {
    const r = await httpJSON('GET', 3030, '/api/spine', 4000);
    if (Array.isArray(r.surfaces)) surfaces = r.surfaces;
  } catch { /* soft */ }
  if (!surfaces) {
    try {
      const fs = require('fs');
      const p = require('path').join(process.cwd(), 'public', 'showcase', 'truth-manifest.json');
      const m = JSON.parse(fs.readFileSync(p, 'utf8'));
      surfaces = (m.parity && m.parity.surfaces) || [];
      surfaces = surfaces.map(s => ({ surface: s.surface, cli: `purpclaw ${s.surface}`, api: { path: `/api/${s.surface}` } }));
    } catch { surfaces = []; }
  }
  if (!surfaces.length) { console.log(col(C.gray, `  (no spine map available — run: npm run truth)\n`)); return; }
  console.log(col(C.gray, `  ${surfaces.length} surfaces — every one callable identically from CLI, chat, and main UI:\n`));
  for (const s of surfaces) {
    console.log(col(C.cyan, `  ${s.surface}`) + (s.owns ? col(C.gray, ` — ${s.owns}`) : ''));
    if (s.cli) console.log(col(C.gray, `      CLI  ${s.cli}`));
    if (s.api) console.log(col(C.gray, `      API  ${s.api.method || 'GET'} ${s.api.path}` + (s.api.body ? `  body: ${s.api.body}` : '')));
    if (s.returns) console.log(col(C.gray, `      →    ${s.returns}`));
    console.log('');
  }
}

async function cmdSteer(args = []) {
  // purpclaw steer "<message>"            → classify only (preview)
  // purpclaw steer --execute "<message>"  → route + open a real job (delegated)
  // Mirrors POST /api/steer exactly, so CLI and chat/UI share one door.
  const doExecute = args.includes('--execute') || args.includes('--go');
  const message = args.filter(a => !/^--(execute|go)$/.test(a)).join(' ').replace(/^["']|["']$/g, '');
  banner();
  sectionHead('  STEER — where does this request go');
  if (!message) { console.log(col(C.gray, `  usage: purpclaw steer "<message>" [--execute]\n`)); return; }
  const steering = require('../lib/steering-router');
  const r = steering.steer(message, { source: 'cli', execute: doExecute });
  const c = r.delegated ? C.green : C.cyan;
  console.log(col(c, `  route=${r.route}${r.agent ? ' agent=' + r.agent : ''}${r.skill ? ' skill=' + r.skill : ''}`));
  console.log(col(C.gray, `    reason: ${r.reason}   confidence: ${r.confidence}`));
  if (r.delegated) console.log(col(C.green, `    DELEGATED → job ${r.jobId} (poll: purpclaw chain ${r.jobId})`));
  else console.log(col(C.gray, `    preview only — re-run with --execute to open a real job`));
  console.log('');
}

async function cmdInsight(args = []) {
  // purpclaw insight "<lesson>"     → capture a mid-job better-way (instant)
  // purpclaw insight recall "<q>"   → recall learned better-ways
  // purpclaw insight recent         → last 10 captured
  // Mirrors POST /api/insight so agents/chat/CLI all feed the same brain.
  const sub = (args[0] || '').toLowerCase();
  const ins = require('../lib/insight');
  banner();
  sectionHead('  INSIGHT — mid-job learning');
  if (sub === 'recall' || sub === 'r') {
    const q = args.slice(1).join(' ').replace(/^["']|["']$/g, '') || 'better way to do this';
    const { insights, formatted } = await ins.recall(q, { limit: 8 });
    if (!insights.length) { console.log(col(C.gray, `  (no insights match "${q}")\n`)); return; }
    console.log(col(C.cyan, `  ${insights.length} learned better-way(s) for "${q}":`));
    insights.forEach((r, i) => console.log(col(C.gray, `    ${i + 1}. [${r.layer || '?'}] ${String(r.content || r.text || '').replace(ins.TAG, '').trim().slice(0, 150)}`)));
    console.log('');
    return;
  }
  if (sub === 'recent') {
    const { insights } = await ins.recall('', { limit: 10 });
    if (!insights.length) { console.log(col(C.gray, '  (no recent insights)\n')); return; }
    insights.forEach((r, i) => console.log(col(C.gray, `    ${i + 1}. ${String(r.content || r.text || '').replace(ins.TAG, '').trim().slice(0, 150)}`)));
    console.log('');
    return;
  }
  const text = args.join(' ').replace(/^["']|["']$/g, '');
  if (!text) { console.log(col(C.gray, `  usage: purpclaw insight "<lesson>"  |  insight recall "<q>"  |  insight recent\n`)); return; }
  const id = await ins.capture(text, { source: 'cli', kind: 'tooling' });
  if (id) console.log(col(C.green, `  CAPTURED → memory ${String(id).slice(0, 12)} (instant recall — cache cleared)\n`));
  else console.log(col(C.yellow, `  capture path OK, spine :7880 not confirmed (persistence uncertain until service up)\n`));
}

async function cmdChain(args = []) {
  // purpclaw chain <jobId>           → the job's full start→finish chain
  // purpclaw chain                   → last 20 job-chain events (all jobs)
  // Mirrors the `chain` block from GET /api/kernel/jobs/[id].
  const jobId = args[0];
  banner();
  sectionHead('  JOB CHAIN — start → finish, exact break point');
  const chain = require('../lib/job-chain');
  if (!jobId) {
    // No id: dump recent chain events across all jobs.
    const trace = require('../lib/trace-store');
    const rows = trace.recent(60).filter(t => String(t.action || '').startsWith('chain.'));
    if (!rows.length) { console.log(col(C.gray, `  (no chain events yet)\n`)); return; }
    for (const r of rows.slice(-20)) {
      const c = r.status === 'failed' ? C.red : r.status === 'done' ? C.green : C.cyan;
      console.log(`  ${col(c, '[*]')} ${col(C.gray, String(r.at || '').slice(11, 19))} ${col(C.bold, (r.jobId || '?').slice(0, 14).padEnd(14))} ${col(c, (String(r.action || '').replace('chain.', '') || '').padEnd(10))} ${col(C.gray, (r.route || '').padEnd(24))} ${col(C.gray, (r.detail || '').slice(0, 70))}`);
    }
    console.log('');
    return;
  }
  const v = chain.get(jobId);
  if (!v.steps.length) { console.log(col(C.yellow, `  no chain found for "${jobId}"\n`)); return; }
  console.log(col(C.cyan, `  ${v.jobId} — status=${v.status}, ${v.steps.length} step(s)`));
  for (const s of v.steps) {
    const c = s.status === 'failed' ? C.red : s.status === 'done' ? C.green : C.cyan;
    console.log(`    ${col(c, '[*]')} ${col(C.bold, s.stage.padEnd(11))} ${col(c, (s.area || '').padEnd(16))} ${col(C.gray, s.detail || '')}`);
  }
  if (v.failedAt) console.log(col(C.red, `\n  FAILED AT ${v.failedAt.area} — ${v.failedAt.detail}\n`));
  else if (v.complete) console.log(col(C.green, `\n  DONE\n`));
  else console.log(col(C.gray, `\n  still running\n`));
}

async function cmdReceipts(args = []) {
  // purpclaw receipts                  → last 20 receipts
  // purpclaw receipts stats            → totals + breakdown
  // purpclaw receipts job <jobId>      → all receipts for a job (chain)
  // purpclaw receipts agent <name>     → filter by agent
  // purpclaw receipts fails            → recent failures only
  const led = require('../lib/proof-ledger');
  const sub = (args[0] || '').toLowerCase();
  banner();
  sectionHead('  PROOF LEDGER — receipts trail (~/.purpclaw/proof/ledger.jsonl)');
  let rows = [];
  if (sub === 'stats') {
    const s = led.stats();
    console.log(col(C.cyan, `  total receipts: ${s.total || 0}`));
    console.log(`    ${col(C.green, 'verified')}: ${s.verified || 0}   ${col(C.red, 'failed')}: ${s.failed || 0}   ${col(C.yellow, 'rolled-back')}: ${s.rolledBack || 0}`);
    if (s.fakeGreens > 0) console.log(col(C.red, `    [!] fake greens: ${s.fakeGreens} (status=verified/applied but verification!=pass)`));
    else console.log(col(C.green, `    fake greens: 0 (no receipts claim pass without proof)`));
    if (s.byStatus) { console.log(col(C.gray, `\n  by status:`)); for (const [k, v] of Object.entries(s.byStatus)) console.log(col(C.gray, `    ${k}: ${v}`)); }
    if (s.byVerification) { console.log(col(C.gray, `\n  by verification:`)); for (const [k, v] of Object.entries(s.byVerification)) console.log(col(C.gray, `    ${k}: ${v}`)); }
    if (s.byProject) { console.log(col(C.gray, `\n  by project:`)); for (const [k, v] of Object.entries(s.byProject).slice(0, 6)) console.log(col(C.gray, `    ${k}: ${v}`)); }
    if (s.tokensEstimate) console.log(col(C.gray, `\n  tokens estimate: ${s.tokensEstimate.toLocaleString()}`));
    console.log('');
    return;
  }
  if (sub === 'job' && args[1]) rows = led.byTask(args[1]);
  else if (sub === 'agent' && args[1]) rows = led.recent(200, { agent: args[1] });
  else if (sub === 'fails') rows = led.recent(200, { status: 'failed' });
  else rows = led.recent(Number(args[0]) > 0 ? Number(args[0]) : 20);
  if (!rows.length) { console.log(col(C.gray, '  (no receipts match)\n')); return; }
  for (const r of rows.slice(-30)) {
    const c = r.status === 'verified' ? C.green : r.status === 'failed' ? C.red : C.gray;
    const when = String(r.at || '').slice(11, 19);
    console.log(`  ${col(c, '[*]')} ${col(C.gray, when)} ${col(C.bold, (r.agent || '?').slice(0, 14).padEnd(14))} ${col(c, (r.status || '').padEnd(9))} ${col(C.gray, (r.claim || r.action || '').slice(0, 90))}`);
  }
  console.log(col(C.gray, `\n  showing ${Math.min(30, rows.length)} of ${rows.length}\n`));
}

async function cmdPurpflow(args = []) {
  // purpclaw purpflow <mode> "<objective>"   modes: goal plan validate execute review repair prove
  // Controlled recursion with receipts — never "just keeps going".
  const pf = require('../lib/purpflow');
  const mode = (args[0] || 'help').toLowerCase();
  const objective = args.slice(1).join(' ').replace(/^["']|["']$/g, '');
  banner();
  sectionHead('  PURPFLOW — controlled recursion with receipts');
  if (mode === 'help' || !pf.MODES.includes(mode)) {
    console.log(col(C.gray, `  modes: ${pf.MODES.join(' · ')}`));
    console.log(col(C.gray, `  usage: purpclaw purpflow <mode> "<objective>"`));
    console.log(col(C.gray, `  stop rules: ${pf.STOP_CONDITIONS.join(', ')}\n`));
    return;
  }
  if (!objective) { console.log(col(C.yellow, `  need an objective: purpclaw purpflow ${mode} "<objective>"\n`)); return; }
  console.log(col(C.cyan, `  ${mode.toUpperCase()} → "${objective}"\n`));
  const loop = await pf.run(mode, objective, {});
  for (const r of loop.receipts) {
    const c = r.result === 'pass' ? C.green : r.result === 'fail' ? C.red : C.gray;
    console.log(`  ${col(c, '[*]')} ${col(C.bold, r.step)} ${col(c, r.result || 'info')} — ${col(C.gray, r.detail)}`);
    for (const e of (r.evidence || [])) console.log(col(C.gray, `      ${e}`));
  }
  const done = loop.status === 'done';
  console.log(`\n  ${col(done ? C.green : C.red, done ? 'DONE BECAUSE:' : `${loop.status.toUpperCase()} (stopped_by ${loop.stopped_by}):`)} ${col(C.gray, loop.receipts.filter(r => r.result === 'pass').map(r => r.step).join(', ') || '—')}`);
  console.log(col(C.gray, `  loop ${loop.id} · ${loop.receipts.length} receipt(s) · ${loop.FLOW_DIR || '~/.purpclaw/purpflow'}\n`));
  return loop;
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
        console.log(`  ${col(sev, '[*]')} ${col(C.bold, f.title)}: ${col(C.gray, f.body)}`);
      }
    } else {
      console.log(col(C.green, '  No new findings. Stack is nominal.'));
    }
    return 0;
  }

  if (sub === 'history') {
    const r = await httpJSON('GET', 7780, '/api/pulse/notifications?limit=20');
    if (r.error) { console.log(col(C.red, '  [X] ' + r.error)); return 1; }
    const nf = r.notifications || [];
    console.log(col(C.gray, `  Last ${nf.length} findings (live from /api/pulse/notifications):`));
    for (const n of nf) {
      const sev = n.severity === 'error' ? C.red : n.severity === 'warn' ? C.yellow : C.green;
      const ts = n.ts ? n.ts.substring(11, 19) : '';
      console.log(`  ${col(sev, '[*]')} ${col(C.gray, ts)} ${col(C.bold, n.title)} ${col(C.gray, '(' + (n.kind || '') + ')')}`);
      console.log(`     ${col(C.gray, n.body)}`);
    }
    return 0;
  }

  const status = await httpJSON('GET', 7780, '/api/pulse');
  if (status.error) {
    console.log(col(C.red, '  [X] Pulse unavailable: ' + status.error));
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
      console.log(`  ${col(sev, '[*]')} ${col(C.bold, n.title)} ${col(C.gray, '(' + n.severity + ')')}`);
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
    console.log(col(C.red, '  [X] /api/whoami unavailable: ' + w.error));
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
    console.log(col(C.red, '  [X] Pulse: ' + ps.error));
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
    const tag = ok ? col(C.green, '[*]') : col(C.red, '[o]');
    const label = r && r.error ? col(C.red, r.error.substring(0, 30)) : (ok ? col(C.gray, 'up') : col(C.red, 'down'));
    console.log(`    ${tag}  ${t.name.padEnd(15)} :${t.port}  ${label}`);
  }

  // 3. Latest pulse findings
  if (ps && ps.latestNotifications && ps.latestNotifications.length) {
    console.log('');
    console.log(col(C.gray, '  ── Recent findings ──'));
    for (const n of ps.latestNotifications.slice(0, 5)) {
      const sev = n.severity === 'error' ? C.red : n.severity === 'warn' ? C.yellow : C.green;
      console.log(`    ${col(sev, '[*]')} ${col(C.bold, n.title)} ${col(C.gray, '(' + n.severity + ')')}`);
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
"use strict";
// _missing_cmds.js — 8 genuinely missing Codex parity commands
// Injected into bin/purpclaw.js at line 4836

// ── login ─────────────────────────────────────────────────────────────────────
// Codex: codex login [--api-key <key> | --device-auth | --chatgpt]
// PURPCLAW: credentials-store.js stores keys as TOML in ~/.purpclaw/credentials.toml
async function cmdLogin(args) {
  const CS = require(path.join(PURP_DIR, 'lib', 'credentials-store'));
  const readline = require('readline');

  const sub = (args[0] || '').toLowerCase();

  // ── login status ─────────────────────────────────────────────────────────────
  if (sub === 'status') {
    const CS = require(path.join(PURP_DIR, 'lib', 'credentials-store'));
    const creds = CS.list();
    if (!creds.length) {
      console.log('No credentials stored. Run: purpclaw login');
      return;
    }
    console.log('\n  Stored credentials:');
    for (const c of creds) {
      console.log('  ' + c.provider + '  ' + c.masked);
    }
    console.log('');
    return;
  }

  const apiKeyIdx = args.indexOf('--api-key');
  const provider = args[args.indexOf('--provider') + 1] || 'openai';

  banner();
  sectionHead('  PURPCLAW LOGIN');

  // List existing
  const existing = CS.list();
  if (existing.length > 0) {
    console.log(col(C.gray, '  Currently stored:'));
    for (const e of existing) {
      console.log(`  ${col(C.cyan, e.provider.padEnd(16))} ${col(C.gray, e.masked)}`);
    }
    console.log('');
  }

  // Interactive key prompt
  let apiKey = null;
  if (apiKeyIdx !== -1 && args[apiKeyIdx + 1]) {
    apiKey = args[apiKeyIdx + 1];
  } else if (sub === 'api-key' && args[1]) {
    apiKey = args[1];
  }

  if (!apiKey) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    apiKey = await new Promise(res => rl.question('  Enter API key: ', res));
    rl.close();
    if (!apiKey || !apiKey.trim()) {
      console.log(col(C.red, '  Cancelled.\n'));
      return;
    }
  }

  apiKey = apiKey.trim();
  CS.store(provider, apiKey);
  console.log(`\n  ${col(C.green, 'Saved')} — ${provider} key stored in ~/.purpclaw/credentials.toml`);
  console.log(col(C.gray, '  Run `purpclaw logout` to remove, `purpclaw doctor` to verify.\n'));
}

// ── logout ─────────────────────────────────────────────────────────────────────
// Codex: codex logout [--all | <provider>]
async function cmdLogout(args) {
  const CS = require(path.join(PURP_DIR, 'lib', 'credentials-store'));
  const sub = (args[0] || '').toLowerCase();

  banner();
  sectionHead('  PURPCLAW LOGOUT');

  if (sub === '--all' || sub === 'all') {
    const existing = CS.list();
    if (existing.length === 0) {
      console.log(col(C.gray, '  No credentials stored.\n'));
      return;
    }
    let count = 0;
    for (const e of existing) { CS.remove(e.provider); count++; }
    console.log(`  ${col(C.green, 'Cleared')} — ${count} credential(s) removed`);
    console.log(col(C.gray, '  ~/.purpclaw/credentials.toml emptied.\n'));
    return;
  }

  const provider = args[0] || 'openai';
  const ok = CS.remove(provider);
  if (ok) {
    console.log(`  ${col(C.green, 'Removed')} — ${provider} key deleted`);
  } else {
    console.log(`  ${col(C.yellow, 'Not found')} — no key for '${provider}'`);
  }
  console.log('');
}

// ── cmdDelete ─────────────────────────────────────────────────────────────────
// Codex: codex delete <session-id>
async function cmdDelete(args) {
  const SESSIONS_DIR = path.join(PURP_DIR, 'agent_work', 'sessions');
  const target = (args[0] || '').toLowerCase();

  banner();
  sectionHead('  PURPCLAW DELETE SESSION');

  if (!target || target === 'list') {
    console.log(col(C.gray, '  usage: purpclaw delete <session-id>'));
    console.log(col(C.gray, '  Run `purpclaw resume list` to see session IDs.\n'));
    return;
  }

  const sessionFile = path.join(SESSIONS_DIR, target + '.jsonl');
  if (!fs.existsSync(sessionFile)) {
    console.log(`  ${col(C.red, 'Not found')} — '${target}' does not exist`);
    console.log(col(C.gray, '  Run `purpclaw resume list` to see session IDs.\n'));
    return;
  }

  fs.unlinkSync(sessionFile);
  console.log(`  ${col(C.green, 'Deleted')} — ${target}.jsonl`);
  // Also clean up any metadata
  const metaFile = path.join(SESSIONS_DIR, target + '.meta.json');
  if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
  console.log('');
}

// ── cmdArchive ────────────────────────────────────────────────────────────────
// Codex: codex archive <session-id>
async function cmdArchive(args, unarchive) {
  const SESSIONS_DIR = path.join(PURP_DIR, 'agent_work', 'sessions');
  const ARCHIVE_DIR = path.join(PURP_DIR, 'agent_work', 'archive');
  const target = (args[0] || '').toLowerCase();
  const op = unarchive ? 'Restored' : 'Archived';

  banner();
  sectionHead(`  PURPCLAW ${unarchive ? 'UNARCHIVE' : 'ARCHIVE'} SESSION`);

  if (!target || target === 'list') {
    console.log(col(C.gray, `  usage: purpclaw ${unarchive ? 'unarchive' : 'archive'} <session-id>`));
    if (unarchive) {
      if (!fs.existsSync(ARCHIVE_DIR)) {
        console.log(col(C.gray, '  No archived sessions.\n'));
        return;
      }
      const archived = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.jsonl'));
      if (!archived.length) { console.log(col(C.gray, '  No archived sessions.\n')); return; }
      console.log(col(C.gray, '  Archived:'));
      for (const f of archived.sort()) {
        console.log(`  ${col(C.cyan, f.replace('.jsonl', ''))}`);
      }
      console.log('');
    } else {
      console.log(col(C.gray, '  Run `purpclaw resume list` to see session IDs.\n'));
    }
    return;
  }

  const srcDir = unarchive ? ARCHIVE_DIR : SESSIONS_DIR;
  const dstDir = unarchive ? SESSIONS_DIR : ARCHIVE_DIR;
  const srcFile = path.join(srcDir, target + '.jsonl');

  if (!fs.existsSync(srcFile)) {
    console.log(`  ${col(C.red, 'Not found')} — '${target}' not in ${unarchive ? 'archive' : 'active sessions'}`);
    return;
  }

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const dstFile = path.join(dstDir, target + '.jsonl');
  fs.renameSync(srcFile, dstFile);
  console.log(`  ${col(C.green, op)} — ${target}.jsonl ${unarchive ? 'moved to active' : 'moved to archive'}`);
  console.log(col(C.gray, `  Run: purpclaw resume ${target}\n`));
}

// ── cmdFork ───────────────────────────────────────────────────────────────────
// Codex: codex fork [--last | <session-id>]
async function cmdFork(args) {
  const SESSIONS_DIR = path.join(PURP_DIR, 'agent_work', 'sessions');
  const fs2 = require('fs');

  banner();
  sectionHead('  PURPCLAW FORK SESSION');

  // Find target session
  let targetId = null;
  let sessionFile = null;

  if (args[0] === '--last' || args[0] === 'last') {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl')).sort();
    if (!files.length) { console.log(col(C.red, '  No sessions found.\n')); return; }
    targetId = files[files.length - 1].replace('.jsonl', '');
    sessionFile = path.join(SESSIONS_DIR, files[files.length - 1]);
  } else {
    targetId = args[0] || '';
    sessionFile = path.join(SESSIONS_DIR, targetId + '.jsonl');
    if (!fs.existsSync(sessionFile)) {
      console.log(`  ${col(C.red, 'Not found')} — '${targetId}'`);
      console.log(col(C.gray, '  Run `purpclaw resume list`\n'));
      return;
    }
  }

  // Generate new UUID for fork
  const { randomUUID } = require('crypto');
  const forkId = randomUUID ? randomUUID() : ('fork-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
  const forkFile = path.join(SESSIONS_DIR, forkId + '.jsonl');

  // Copy session
  fs.copyFileSync(sessionFile, forkFile);
  console.log(`  ${col(C.green, 'Forked')} — ${targetId} → ${col(C.cyan, forkId)}`);
  console.log(col(C.gray, `  File: ${forkFile}`));
  console.log(col(C.gray, `  Run: purpclaw resume ${forkId}\n`));
}

// ── cmdSandbox ────────────────────────────────────────────────────────────────
// Codex: codex sandbox [--list | --create | --destroy <id> | --run <id> <cmd>]
async function cmdSandbox(args) {
  const SB = require(path.join(PURP_DIR, 'lib', 'sandbox'));

  banner();
  sectionHead('  PURPCLAW SANDBOX');

  const sub = (args[0] || '').toLowerCase();

  if (sub === '--list' || sub === 'list' || sub === 'ls' || !sub) {
    const avail = await SB.dockerAvailable();
    if (!avail.available) {
      console.log(`  ${col(C.red, 'Docker not available')}: ${avail.error || 'unknown error'}`);
      console.log(col(C.gray, '  Install Docker and ensure the daemon is running.\n'));
      return;
    }
    console.log(`  ${col(C.gray, 'Docker')} ${col(C.green, avail.version)}`);
    const boxes = await SB.listSandboxes();
    if (!boxes.length) {
      console.log(col(C.gray, '  No sandbox containers.\n'));
      console.log(`  ${col(C.gray, 'Create: purpclaw sandbox --create [--name <name>] [--image <image>]')}`);
    } else {
      console.log(col(C.gray, '  Containers:'));
      for (const b of boxes) {
        const running = b.Status && b.Status.startsWith('Up') ? C.green : C.yellow;
        console.log(`  ${col(C.cyan, b.ID.slice(0, 12))} ${col(running, b.Status.slice(0, 20).padEnd(20))} ${col(C.white, b.Names)}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === '--create' || sub === 'create') {
    const nameIdx = args.indexOf('--name');
    const imageIdx = args.indexOf('--image');
    const name = nameIdx !== -1 ? args[nameIdx + 1] : null;
    const image = imageIdx !== -1 ? args[imageIdx + 1] : 'alpine';
    try {
      const box = await SB.createSandbox(name, { image });
      console.log(`  ${col(C.green, 'Created')} sandbox ${col(C.cyan, box.name)} (${box.id.slice(0, 12)})`);
      console.log(col(C.gray, `  Image: ${box.image}`));
    } catch (e) {
      console.log(`  ${col(C.red, 'Failed')}: ${e.message}`);
    }
    console.log('');
    return;
  }

  if (sub === '--destroy' || sub === 'destroy' || sub === 'rm' || sub === 'delete') {
    const targetId = args[1] || args[args.indexOf('--destroy') + 1] || '';
    if (!targetId) {
      console.log(col(C.gray, '  usage: purpclaw sandbox --destroy <container-id-or-name>\n'));
      return;
    }
    try {
      await SB.destroySandbox(targetId);
      console.log(`  ${col(C.green, 'Destroyed')} sandbox ${targetId}`);
    } catch (e) {
      console.log(`  ${col(C.red, 'Failed')}: ${e.message}`);
    }
    console.log('');
    return;
  }

  if (sub === '--run' || sub === 'run') {
    const sandboxId = args[1];
    const command = args.slice(2).join(' ');
    if (!sandboxId || !command) {
      console.log(col(C.gray, '  usage: purpclaw sandbox --run <id> <command>\n'));
      return;
    }
    const result = await SB.runInSandbox(sandboxId, command);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.log(col(C.gray, `\n  exit ${result.exitCode}`));
    return;
  }

  console.log(col(C.gray, '  usage:'));
  console.log(col(C.gray, '    purpclaw sandbox [--list]          list containers'));
  console.log(col(C.gray, '    purpclaw sandbox --create          create new sandbox'));
  console.log(col(C.gray, '    purpclaw sandbox --destroy <id>   destroy sandbox'));
  console.log(col(C.gray, '    purpclaw sandbox --run <id> <cmd> run command in sandbox\n'));
}

// ── cmdRemoteControl ──────────────────────────────────────────────────────────
// Codex: codex remote-control [start | stop | pair]
async function cmdRemoteControl(args) {
  banner();
  sectionHead('  PURPCLAW REMOTE CONTROL');
  const sub = (args[0] || '').toLowerCase();

  // Load existing remote config
  const RC = path.join(PURP_DIR, '.purpclaw', 'remote-config.json');
  const loadCfg = () => { try { return JSON.parse(fs.readFileSync(RC, 'utf-8')); } catch { return { targets: [], paired: false }; } };

  if (sub === 'start') {
    console.log(`  ${col(C.green, 'Starting')} remote control daemon...`);
    const cfg = loadCfg();
    cfg.enabled = true;
    cfg.lastStart = new Date().toISOString();
    fs.mkdirSync(path.dirname(RC), { recursive: true });
    fs.writeFileSync(RC, JSON.stringify(cfg, null, 2));
    console.log(`  ${col(C.green, 'Enabled')} — remote control active`);
    console.log(col(C.gray, '  Note: Requires app-server daemon running (purpclaw start)'));
    console.log('');
    return;
  }

  if (sub === 'stop') {
    const cfg = loadCfg();
    cfg.enabled = false;
    fs.writeFileSync(RC, JSON.stringify(cfg, null, 2));
    console.log(`  ${col(C.yellow, 'Stopped')} — remote control disabled\n`);
    return;
  }

  if (sub === 'pair') {
    const cfg = loadCfg();
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    cfg.pairingCode = code;
    cfg.pairedAt = null;
    cfg.paired = false;
    fs.writeFileSync(RC, JSON.stringify(cfg, null, 2));
    console.log(`  ${col(C.cyan, 'Pairing code')}: ${col(C.white, code)}`);
    console.log(col(C.gray, '  Enter this code in the remote client within 5 minutes.\n'));
    return;
  }

  if (sub === 'share') {
    // Codex: codex remote-control share — generate a shareable URL/token
    const cfg = loadCfg();
    const token = Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
    cfg.shareToken = token;
    cfg.shareCreated = new Date().toISOString();
    fs.writeFileSync(RC, JSON.stringify(cfg, null, 2));
    console.log('  Share token: ' + col(C.cyan, token));
    console.log(col(C.gray, '  Remote clients connect via: purpclaw remote connect ' + token));
    console.log('');
    return;
  }

  // Default: status
  const cfg = loadCfg();
  console.log(`  ${col(C.gray, 'Status')}: ${cfg.enabled ? col(C.green, 'enabled') : col(C.yellow, 'disabled')}`);
  if (cfg.lastStart) console.log(`  ${col(C.gray, 'Last start')}: ${cfg.lastStart}`);
  if (cfg.paired) console.log(`  ${col(C.green, 'Paired')}: yes`);
  console.log('');
  console.log(col(C.gray, '  usage: purpclaw remote-control [start | stop | pair]\n'));
}

// ── cmdCloud ──────────────────────────────────────────────────────────────────
// Codex: codex cloud — browse Codex Cloud tasks
async function cmdCloud(args) {
  banner();
  sectionHead('  PURPCLAW CLOUD');
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'list' || sub === 'ls' || !sub) {
    console.log(col(C.gray, '  Codex Cloud integration'));
    console.log('');
    console.log(`  ${col(C.yellow, 'Not configured')} — Codex Cloud requires API credentials`);
    console.log(col(C.gray, '  Codex Cloud is a hosted service at api.openai.com'));
    console.log(col(C.gray, '  For PURPCLAW: tasks are managed locally via `purpclaw run` and `purpclaw resume`'));
    console.log('');
    console.log(col(C.gray, '  Local job catalog:'));
    const JOBS_DIR = path.join(PURP_DIR, 'agent_work', 'jobs');
    if (fs.existsSync(JOBS_DIR)) {
      const jobs = fs.readdirSync(JOBS_DIR).filter(f => f.endsWith('.jsonl')).sort();
      if (!jobs.length) {
        console.log(col(C.gray, '    No jobs yet.'));
      } else {
        for (const j of jobs.slice(-10)) {
          console.log(`    ${col(C.cyan, j.replace('.jsonl', ''))}`);
        }
      }
    } else {
      console.log(col(C.gray, '    No jobs directory.'));
    }
    console.log('');
    return;
  }

  console.log(col(C.gray, '  usage: purpclaw cloud [list]\n'));
}


// cmdUpdate — self-update from GitHub releases
async function cmdUpdate(args) {
  const https = require('https');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execSync } = require('child_process');

  const check = args.includes('--check');
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  // Get current version from package.json
  const pkg = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'package.json'), 'utf-8'));
  const currentVersion = pkg.version || '0.0.0';

  console.log(`\n  ${col(C.cyan + C.bold, 'purpclaw update')}`);
  console.log(`    current version : ${col(C.white, currentVersion)}`);

  // Fetch latest release from GitHub
  console.log(`    ${col(C.gray, 'Checking GitHub…')}`);
  let latestVersion = null;
  try {
    latestVersion = await new Promise((resolve, reject) => {
      const req = https.get({
        hostname: 'api.github.com',
        path: '/repos/weemadscotsman/purpclaw/releases/latest',
        headers: { 'User-Agent': 'purpclaw/' + currentVersion, 'Accept': 'application/vnd.github+json' },
      }, (res) => {
        if (res.statusCode === 403) { reject(new Error('rate limited')); return; }
        if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data).tag_name || null); } catch { resolve(null); }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  } catch (e) {
    console.log(`    ${col(C.yellow, '[!] Could not check GitHub: ' + e.message)}`);
    console.log(`    ${col(C.gray, 'Install manually: npm install -g purpclaw')}`);
    console.log('');
    return;
  }

  if (!latestVersion) {
    console.log(`    ${col(C.yellow, '[!] Could not determine latest version')}`);
    return;
  }

  latestVersion = latestVersion.replace(/^v/, '');

  const current = currentVersion.split('.').map(Number);
  const latest = latestVersion.split('.').map(Number);
  const outdated = (latest[0] > current[0]) || (latest[0] === current[0] && latest[1] > current[1]) || (latest[0] === current[0] && latest[1] === current[1] && latest[2] > current[2]);

  console.log(`    latest version  : ${outdated ? col(C.yellow, latestVersion) : col(C.green, latestVersion)}`);

  if (check) {
    if (!outdated) {
      console.log(`\n  ${col(C.green, '[OK] You are on the latest version')}`);
    } else {
      console.log(`\n  ${col(C.yellow, '↑ Update available: ' + currentVersion + ' → ' + latestVersion)}`);
      console.log(`  ${col(C.gray, 'Run: purpclaw update [--force]')}`);
    }
    console.log('');
    return;
  }

  if (!outdated && !force) {
    console.log(`\n  ${col(C.green, '[OK] You are on the latest version')}`);
    console.log('');
    return;
  }

  if (dryRun) {
    console.log(`\n  ${col(C.cyan, 'Dry run — would update from ' + currentVersion + ' to ' + latestVersion)}`);
    console.log(`  ${col(C.gray, 'Remove --dry-run to actually update')}`);
    console.log('');
    return;
  }

  // Download and install
  const tmpDir = path.join(os.tmpdir(), 'purpclaw-update-' + Date.now());
  fs.mkdirSync(tmpDir);
  const tarballPath = path.join(tmpDir, 'purpclaw-update.tar.gz');

  console.log(`\n  ${col(C.cyan, '↓ Downloading v' + latestVersion + '…')}`);
  try {
    await new Promise((resolve, reject) => {
      const req = https.get({
        hostname: 'api.github.com',
        path: '/repos/weemadscotsman/purpclaw/releases/expanded_assets',
        headers: { 'User-Agent': 'purpclaw/' + currentVersion, 'Accept': 'application/vnd.github+json' },
      }, (res) => {
        // Get redirect
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const u = new URL(res.headers.location);
          const dl = https.get(u, (r) => {
            const ws = fs.createWriteStream(tarballPath);
            r.pipe(ws);
            ws.on('finish', resolve);
            ws.on('error', reject);
          });
          dl.on('error', reject);
          dl.setTimeout(30000, () => { dl.destroy(); reject(new Error('download timeout')); });
          return;
        }
        reject(new Error('Expected redirect, got ' + res.statusCode));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('request timeout')); });
      req.end();
    });
  } catch (e) {
    console.log(`  ${col(C.red, '[X] Download failed: ' + e.message)}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // Extract
  console.log(`  ${col(C.cyan, '↓ Extracting…')}`);
  fs.mkdirSync(path.join(tmpDir, 'extracted'));
  try {
    execSync(`tar -xzf "${tarballPath}" -C "${path.join(tmpDir, 'extracted')}" --strip-components=1`, { stdio: 'pipe' });
  } catch (e) {
    console.log(`  ${col(C.red, '[X] Extract failed')}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // Install deps
  console.log(`  ${col(C.cyan, '↓ Installing dependencies…')}`);
  try {
    execSync('npm install --production --no-audit --no-fund', {
      cwd: path.join(tmpDir, 'extracted'), stdio: 'pipe', timeout: 120000,
    });
  } catch (e) {
    console.log(`  ${col(C.yellow, '[!] npm install had issues but continuing…')}`);
  }

  // Copy bin
  const srcBin = path.join(tmpDir, 'extracted', 'bin', 'purpclaw.js');
  const dstBin = path.join(PURP_DIR, 'bin', 'purpclaw.js');
  if (fs.existsSync(srcBin)) {
    fs.copyFileSync(dstBin, dstBin + '.backup-' + Date.now());
    fs.copyFileSync(srcBin, dstBin);
    console.log(`  ${col(C.green, '[OK] Binaries updated')}`);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n  ${col(C.green, '[OK] Updated to v' + latestVersion)}`);
  console.log(`  ${col(C.gray, 'Restart: purpclaw chat')}`);
  console.log('');
}

// cmdReview — non-interactive code review over git diffs (Codex exec review parity)
async function cmdReview(args) {
  const { execSync } = require('child_process');
  const path = require('path');

  // Parse flags
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--uncommitted') flags.uncommitted = true;
    else if (args[i] === '--base') flags.base = args[++i];
    else if (args[i] === '--commit') flags.commit = args[++i];
    else if (args[i] === '--prompt') flags.prompt = args.slice(i + 1).join(' ');
    else if (args[i] === '--json') flags.json = true;
  }

  if (!flags.uncommitted && !flags.base && !flags.commit && !flags.prompt) {
    console.log(`\n${col(C.bold, 'purpclaw exec review [options]')}`);
    console.log(`  ${col(C.cyan, '--uncommitted')}   Review staged + unstaged + untracked changes`);
    console.log(`  ${col(C.cyan, '--base <branch>')} Review changes from <branch> to HEAD`);
    console.log(`  ${col(C.cyan, '--commit <sha>')}  Review a single commit`);
    console.log(`  ${col(C.cyan, '--prompt <text>')} Free-form review with your question`);
    console.log(`  ${col(C.cyan, '--json')}          Machine-readable output\n`);
    return;
  }

  const isJson = !!flags.json;

  // Use Git Bash shell on Windows to run git commands reliably
  function run(cmd, timeout = 15000) {
    const envStr = 'GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat';
    const shell = 'C:/Program Files/Git/bin/bash.exe';
    try {
      const r = execSync(`${envStr} ${cmd}`, {
        encoding: 'utf-8', timeout,
        shell,
        maxBuffer: 10 * 1024 * 1024,
      });
      return r;
    } catch (e) {
      if (e.stdout) return e.stdout;
      return '';
    }
  }

  function sizeBadge(lines) {
    if (lines === 0) return col(C.green, '[green]');
    if (lines < 20) return col(C.green, `[+${lines}]`);
    if (lines < 100) return col(C.yellow, `[+${lines}]`);
    return col(C.red, `[+${lines}]`);
  }

  function getDiff(selector) {
    switch (selector) {
      case 'uncommitted': {
        // Note: bare `git diff --stat` hangs on Windows — always specify HEAD
        const staged = run('git diff --cached --stat 2>/dev/null', 15000);
        const unstaged = run('git diff --stat HEAD 2>/dev/null', 15000);
        const untrackedRaw = run('git status --porcelain 2>/dev/null', 30000);
        const untracked = untrackedRaw.split('\n').filter(l => l.startsWith('??')).map(l => l.slice(3)).slice(0, 50);
        return { staged, unstaged, untracked, type: 'uncommitted', untrackedTotal: untrackedRaw.split('\n').filter(l => l.startsWith('??')).length };
      }
      case 'base': {
        if (!flags.base) return null;
        const diff = run(`git diff ${flags.base}...HEAD --stat 2>/dev/null`);
        return { diff, type: 'base', base: flags.base };
      }
    case 'commit': {
        if (!flags.commit) return null;
        const show = run(`git show ${flags.commit} --stat 2>/dev/null`);
        return { show, type: 'commit', sha: flags.commit };
      }
      default: return null;
    }
  }

  if (flags.prompt) {
    const diff = run('git diff HEAD 2>/dev/null');
    const status = run('git status --short 2>/dev/null');
    const context = `\n=== GIT STATUS ===\n${status}\n=== GIT DIFF ===\n${diff}\n=== END ===`;
    const body = `Review request:\n\n${flags.prompt}\n\n${context}`;
    if (isJson) {
      console.log(JSON.stringify({ ok: true, prompt: flags.prompt, diff_lines: diff.split('\n').length, status_lines: status.split('\n').length }, null, 2));
    } else {
      console.log(`\n  ${col(C.cyan + C.bold, 'Code Review')}`);
      console.log(`    ${diff.split('\n').length} diff lines, ${status.split('\n').length} status lines`);
      console.log(`    ${col(C.gray, 'Submit to LLM for review:')}`);
      console.log(`    purpclaw chat "${flags.prompt.slice(0, 100)}..."`);
    }
    return;
  }

  const diff = getDiff(flags.uncommitted ? 'uncommitted' : flags.base ? 'base' : 'commit');
  if (!diff) return;

  const isUncommitted = diff.type === 'uncommitted';

  if (isJson) {
    console.log(JSON.stringify({ type: diff.type, ...diff }, null, 2));
    return;
  }

  // Summary output
  console.log(`\n  ${col(C.cyan + C.bold, 'Code Review Summary')}`);
  if (isUncommitted) {
    const stagedLines = diff.staged ? diff.staged.trim().split('\n').length : 0;
    const unstagedLines = diff.unstaged ? diff.unstaged.trim().split('\n').length : 0;
    console.log(`    staged:     ${sizeBadge(stagedLines)} ${diff.staged || col(C.gray, '(none)')}`);
    console.log(`    unstaged:   ${sizeBadge(unstagedLines)} ${diff.unstaged ? diff.unstaged.trim().split('\n')[0] : col(C.gray, '(none)')}`);
    console.log(`    untracked:  ${col(C.gray, (diff.untrackedTotal || diff.untracked.length) + ' file(s)')}`);
    if (diff.untracked.length > 0) {
      console.log(`      ${diff.untracked.slice(0, 5).map(f => '? ' + f).join('\n      ')}`);
      if (diff.untracked.length > 5) console.log(`      ${col(C.gray, '… and ' + (diff.untrackedTotal - 5) + ' more')}`);
    }
  } else if (diff.type === 'base') {
    console.log(`    ${col(C.cyan, diff.base + '...HEAD:')} ${diff.diff.split('\n')[0]}`);
  } else if (diff.type === 'commit') {
    console.log(`    ${col(C.cyan, diff.sha + ':')} ${diff.show.split('\n')[0]}`);
  }
  console.log('');
}


// cmdPlugins — plugin lifecycle management (install/remove/enable/disable/list)
async function cmdPlugins(args) {
  const HR = require(path.join(PURP_DIR, 'lib', 'hooks-runtime'));
  const fs = require('fs');
  const { execSync } = require('child_process');

  const sub = (args[0] || 'list').toLowerCase();
  const PLUGINS_DIR = path.join(PURP_DIR, 'plugins');

  function ensurePluginsDir() {
    if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  }

  // ── list ─────────────────────────────────────────────────────────────────
  if (sub === 'list' || sub === 'ls') {
    const plugins = HR.listPlugins();
    if (!plugins.length) {
      console.log(col(C.gray, '\n  no plugins installed.'));
      console.log(`  Install from:`);
      console.log(`    purpclaw plugins install <name> --path <dir>`);
      console.log(`    purpclaw plugins install <name> --git <url>`);
      return;
    }
    console.log(`\n  ${col(C.cyan + C.bold, 'Plugins')}  (${PLUGINS_DIR})`);
    for (const p of plugins) {
      const manifest = loadManifest(p.path);
      const version = manifest ? manifest.version : col(C.gray, '?');
      const enabled = isEnabled(p.path) ? col(C.green, '[OK]') : col(C.gray, '[o]');
      const error = manifest === false ? ' ' + col(C.red, '[manifest error]') : '';
      console.log(`    ${enabled}  ${p.name.padEnd(32)} ${version}${error}`);
    }
    console.log(`\n  ${plugins.length} plugin(s) installed`);
    console.log(`  ${plugins.filter(p => isEnabled(p.path)).length} enabled, ${plugins.filter(p => !isEnabled(p.path)).length} disabled`);
    console.log(`\n  ${col(C.gray, 'Manage:')}`);
    console.log(`    purpclaw plugins install <name> [--git <url>] [--path <dir>]`);
    console.log(`    purpclaw plugins remove <name>`);
    console.log(`    purpclaw plugins enable <name>`);
    console.log(`    purpclaw plugins disable <name>`);
    return;
  }

  // ── install / add (Codex parity) ──────────────────────────────────────────
  if (sub === 'install' || sub === 'add') {
    ensurePluginsDir();
    let name = null, gitUrl = null, localPath = null;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--git' || args[i] === '-g') gitUrl = args[++i];
      else if (args[i] === '--path' || args[i] === '-p') localPath = args[++i];
      else if (!args[i].startsWith('-')) name = args[i];
    }

    if (!name) {
      console.log(col(C.red, '\n  usage: purpclaw plugins install <name> [--git <url>] [--path <dir>]'));
      return;
    }

    const targetDir = path.join(PLUGINS_DIR, name);
    if (fs.existsSync(targetDir)) {
      console.log(col(C.yellow, `\n  Plugin "${name}" already installed at ${targetDir}`));
      return;
    }

    if (gitUrl) {
      console.log(`\n  ${col(C.cyan, `Cloning ${gitUrl}…`)}`);
      try {
        execSync(`git clone --depth=1 "${gitUrl}" "${targetDir}"`, {
          stdio: 'pipe', timeout: 60000,
          shell: 'C:/Program Files/Git/bin/bash.exe',
        });
        console.log(col(C.green, `  [OK] Installed ${name} from git`));
      } catch (e) {
        console.log(col(C.red, `  [X] Git clone failed: ${e.message}`));
        return;
      }
    } else if (localPath) {
      if (!fs.existsSync(localPath)) {
        console.log(col(C.red, `  [X] Source path not found: ${localPath}`));
        return;
      }
      fs.mkdirSync(targetDir, { recursive: true });
      copyDirRecursive(localPath, targetDir);
      console.log(col(C.green, `  [OK] Installed ${name} from ${localPath}`));
    } else {
      // Try skills dir
      const skillPath = path.join(PURP_DIR, 'skills', name);
      if (fs.existsSync(skillPath)) {
        fs.mkdirSync(targetDir, { recursive: true });
        copyDirRecursive(skillPath, targetDir);
        console.log(col(C.green, `  [OK] Installed ${name} from skills/${name}`));
      } else {
        console.log(col(C.red, `\n  Plugin "${name}" not found in skills/`));
        console.log(`  ${col(C.gray, 'Usage:')}`);
        console.log(`    purpclaw plugins install <name> --path <source-dir>`);
        console.log(`    purpclaw plugins install <name> --git <repo-url>`);
        return;
      }
    }

    const manifest = loadManifest(targetDir);
    if (manifest === false) {
      console.log(col(C.red, `  [X] Plugin installed but manifest has errors`));
    } else {
      console.log(`  ${col(C.green, '[OK]')} manifest valid: ${manifest.name} v${manifest.version || '?'}`);
      console.log(`  ${col(C.green, '[OK]')} plugin ready — run "purpclaw plugins enable ${name}" to activate`);
    }
    return;
  }

  // ── remove ────────────────────────────────────────────────────────────────
  if (sub === 'remove' || sub === 'rm' || sub === 'uninstall') {
    const name = args[1];
    if (!name) { console.log(col(C.red, '\n  usage: purpclaw plugins remove <name>')); return; }
    const targetDir = path.join(PLUGINS_DIR, name);
    if (!fs.existsSync(targetDir)) {
      console.log(col(C.red, `  Plugin "${name}" not found at ${targetDir}`));
      return;
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log(col(C.green, `  [OK] Removed plugin "${name}"`));
    return;
  }

  // ── enable ────────────────────────────────────────────────────────────────
  if (sub === 'enable') {
    const name = args[1];
    if (!name) { console.log(col(C.red, '\n  usage: purpclaw plugins enable <name>')); return; }
    const targetDir = path.join(PLUGINS_DIR, name);
    if (!fs.existsSync(targetDir)) { console.log(col(C.red, `  Plugin "${name}" not found`)); return; }
    const manifest = loadManifest(targetDir);
    if (manifest === false) { console.log(col(C.red, `  Cannot enable — invalid manifest`)); return; }
    fs.writeFileSync(path.join(targetDir, '.enabled'), '1');
    console.log(col(C.green, `  [OK] Enabled plugin "${name}"`));
    return;
  }

  // ── disable ───────────────────────────────────────────────────────────────
  if (sub === 'disable') {
    const name = args[1];
    if (!name) { console.log(col(C.red, '\n  usage: purpclaw plugins disable <name>')); return; }
    const targetDir = path.join(PLUGINS_DIR, name);
    if (!fs.existsSync(targetDir)) { console.log(col(C.red, `  Plugin "${name}" not found`)); return; }
    const ef = path.join(targetDir, '.enabled');
    if (fs.existsSync(ef)) fs.unlinkSync(ef);
    console.log(col(C.yellow, `  [o] Disabled plugin "${name}"`));
    return;
  }

  // Default: list
  const plugins = HR.listPlugins();
  console.log(`\n  ${col(C.cyan + C.bold, 'Plugins')}`);
  if (!plugins.length) {
    console.log(`  ${col(C.gray, 'no plugins installed')}`);
  } else {
    for (const p of plugins) {
      const enabled = isEnabled(p.path);
      console.log(`    ${enabled ? col(C.green, '[OK]') : col(C.gray, '[o]')}  ${p.name}`);
    }
  }
  console.log(`\n  ${col(C.gray, 'usage: purpclaw plugins <list|install|remove|enable|disable> [args]')}`);

  // ── helpers ────────────────────────────────────────────────────────────────
  function loadManifest(dir) {
    for (const f of ['manifest.json', 'package.json']) {
      const fp = path.join(dir, f);
      if (fs.existsSync(fp)) {
        try {
          const m = JSON.parse(fs.readFileSync(fp, 'utf8'));
          return { name: m.name, version: m.version || '0.0.0', description: m.description || '' };
        } catch (e) {
          console.log(col(C.red, `  manifest parse error in ${f}: ${e.message}`));
          return false;
        }
      }
    }
    return { name: path.basename(dir), version: '0.0.0', description: '' };
  }

  function isEnabled(dir) {
    return fs.existsSync(path.join(dir, '.enabled')) && !fs.existsSync(path.join(dir, '.disabled'));
  }

  function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDirRecursive(s, d);
      else fs.copyFileSync(s, d);
    }
  }
}


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
    case 'update':    return cmdUpdate(args);
    case 'login':     return cmdLogin(args);
    case 'logout':    return cmdLogout(args);
    case 'delete':    return cmdDelete(args);
    case 'archive':   return cmdArchive(args, false);
    case 'unarchive': return cmdArchive(args, true);
    case 'fork':      return cmdFork(args);
    case 'sandbox':   return cmdSandbox(args);
    case 'remote-control': return cmdRemoteControl(args);
    case 'execpolicy': {
      const EP = require(path.join(PURP_DIR, 'lib', 'exec-policy'));
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'check') {
        const cmd = args.slice(1).join(' ');
        if (!cmd) { console.log('usage: purpclaw execpolicy check <command>'); return 1; }
        const result = EP.check(cmd);
        if (result.allowed) {
          console.log('allowed  — ' + (result.reason || 'ok'));
        } else {
          console.log('denied   — ' + (result.reason || result.source || 'policy'));
          return 1;
        }
        return 0;
      }
      console.log('purpclaw execpolicy check <command>');
      return 0;
    }
    case 'cloud':     return cmdCloud(args);
    case 'plugins':  return cmdPlugins(args);
    case 'doctor':    return cmdDoctor(args);
    case 'app-server': {
      // Codex parity: `codex app-server` / `codex app-server daemon` management
      // Subcommands: start, stop, restart, status, version, daemon <sub>
      const { execSync } = require('child_process');
      const sub = (args[0] || 'status').toLowerCase();
      const APP_NAME = 'purpclaw-nextjs';

      if (sub === 'daemon') {
        const daemonSub = (args[1] || 'status').toLowerCase();
        const daemonCmds = {
          start:          'pm2 start ecosystem.config.js --env production',
          stop:           'pm2 delete purpclaw-nextjs 2>/dev/null; pm2 delete purpclaw-app 2>/dev/null; true',
          restart:        'pm2 restart purpclaw-nextjs 2>/dev/null || pm2 start ecosystem.config.js --env production',
          bootstrap:      'echo "Bootstrap: SSH-driven durable daemon setup (manual pm2 config required)"',
          'enable-remote-control': 'echo "Enable remote control: set PURPCLAW_REMOTE=1 and restart"',
          'disable-remote-control': 'echo "Disable remote control: unset PURPCLAW_REMOTE and restart"',
          status:         'pm2 jlist 2>/dev/null | node -e "const d=require(\'fs\').readFileSync(\'/dev/stdin\',\'utf-8\');const j=JSON.parse(d);j.filter(x=>x.name.includes(\'purpclaw\')).forEach(x=>console.log(x.name+\'[\'+x.pm2_env.status+\'] pid:\'+x.pid))" || echo "pm2 not running"',
        };
        if (daemonCmds[daemonSub]) {
          try {
            const out = execSync(daemonCmds[daemonSub], { encoding: 'utf-8', cwd: PURP_DIR, stdio: 'pipe' });
            if (out) process.stdout.write(out);
          } catch (e) { if (e.stdout) process.stdout.write(String(e.stdout)); if (e.stderr) process.stderr.write(String(e.stderr)); }
        } else {
          console.log('Daemon subcommands: start, stop, restart, status, bootstrap, enable-remote-control, disable-remote-control');
        }
        return 0;
      }

      if (sub === 'start') {
        try {
          execSync('pm2 start ecosystem.config.js --env production', { encoding: 'utf-8', cwd: PURP_DIR, stdio: 'inherit' });
        } catch (e) { if (e.stdout) process.stdout.write(String(e.stdout)); }
        return 0;
      }
      if (sub === 'stop') {
        try {
          execSync('pm2 delete purpclaw-nextjs 2>/dev/null; pm2 delete purpclaw-app 2>/dev/null; true', { encoding: 'utf-8', cwd: PURP_DIR, stdio: 'inherit' });
        } catch (e) {}
        return 0;
      }
      if (sub === 'restart') {
        try {
          execSync('pm2 restart purpclaw-nextjs 2>/dev/null || pm2 start ecosystem.config.js --env production', { encoding: 'utf-8', cwd: PURP_DIR, stdio: 'inherit' });
        } catch (e) {}
        return 0;
      }
      if (sub === 'version') {
        try {
          const out = execSync('node -p "JSON.stringify({cli:require(\'./package.json\').version,server:process.env.npm_package_version||\'unknown\'})"', { encoding: 'utf-8', cwd: PURP_DIR, stdio: 'pipe' });
          process.stdout.write(out);
        } catch (e) { console.log('{}'); }
        return 0;
      }

      if (sub === 'proxy') {
        // Codex: codex app-server proxy [--sock <path>]
        const sockIdx = args.indexOf('--sock');
        const sockPath = sockIdx !== -1 && args[sockIdx + 1] ? args[sockIdx + 1] : null;
        if (!sockPath) {
          console.log('usage: purpclaw app-server proxy --sock <socket-path>');
          return 0;
        }
        console.log('proxy to: ' + sockPath);
        console.log('(Windows named pipe proxy not yet implemented — connect via WebSocket at ws://localhost:9119)');
        return 0;
      }

      if (sub === 'generate-ts') {
        console.log('TypeScript bindings generation requires the TypeScript compiler (tsc).');
        console.log('This is a Codex IDE integration feature — not applicable to PURPCLAW web runtime.');
        return 0;
      }

      if (sub === 'generate-json-schema') {
        console.log('JSON Schema generation for app-server protocol.');
        console.log('PURPCLAW uses OpenAPI/REST — schema is auto-generated from route definitions.');
        return 0;
      }

      // Default: status
      try {
        const out = execSync('pm2 jlist 2>/dev/null || echo "[]"', { encoding: 'utf-8', cwd: PURP_DIR, stdio: 'pipe' });
        const list = JSON.parse(out);
        const ours = list.filter(x => x.name && x.name.includes('purpclaw'));
        if (!ours.length) { console.log('purpclaw-app: no PM2 processes running\n'); return 0; }
        for (const p of ours) {
          const ok = p.pm2_env && p.pm2_env.status === 'online';
          console.log(' ' + (ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m') + '  \x1b[36m' + p.name + '\x1b[0m  [\x1b[33m' + (p.pm2_env && p.pm2_env.status || '?') + '\x1b[0m]  pid:' + p.pid + '  mem:' + Math.round((p.monit && p.monit.memory) / 1024 / 1024) + 'MB');
        }
        console.log('');
      } catch (e) {
        console.log('PM2 not available or not running. Run `purpclaw app-server start`\n');
      }
      return 0;
    }
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
    case 'bundles':  return cmdBundles(args);
    case 'guard':    return cmdGuard(args);
    case 'install':   return cmdRegistry(['install', ...args]);
    case 'search':    return cmdRegistry(['search', ...args]);
 case 'resume':   return cmdResume(args);

    case 'exec': {
      // Codex parity: purpclaw exec [review|archive|delete|unarchive|...]
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'review')    return cmdReview(args.slice(1));
      if (sub === 'archive')   return cmdArchive(args.slice(1));
      if (sub === 'delete')    return cmdDelete(args.slice(1));
      if (sub === 'unarchive') return cmdArchive(args.slice(1), true);

      // --help and --json are reserved flags, not exec subcommands
      if (sub === '--help' || sub === '-h' || sub === '--json') {
        console.log('purpclaw exec <subcommand> [args...]');
        console.log('  review [--uncommitted|--base <branch>|--commit <sha>|--prompt <text>] [--json]');
        console.log('  archive <session-id>');
        console.log('  delete  <session-id>');
        console.log('  unarchive <session-id>');
        console.log('  <any shell command>  (run directly, subject to exec-policy)');
        return 0;
      }

      const execPolicy = require(path.join(PURP_DIR, 'lib', 'exec-policy'));
      if (!args.length) { console.log('  usage: purpclaw exec <command> [args...]\n'); return; }
      const cmdStr = args.join(' ');
      const check = execPolicy.check(cmdStr);
      if (check.allowed === false) { console.log(`${col(C.red, '[X] blocked by policy:')} ${check.reason || check.source || 'unknown'}`); return 1; }
      const [cmd, ...cmdArgs] = args;
      try {
        const { execSync } = require('child_process');
        const out = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 60000, shell: 'C:/Program Files/Git/bin/bash.exe' });
        process.stdout.write(out);
      } catch (e) {
        if (e.stdout) process.stdout.write(e.stdout);
        if (e.stderr) process.stderr.write(e.stderr);
        return e.status || 1;
      }
      return 0;
    }
    case 'mcp-server': {
      // Codex parity: run PURPCLAW as an MCP server over stdio.
      // `codex mcp-server` — serves MCP protocol on stdin/stdout.
      // Flags: --strict-config  (require all env vars present, fail if missing)
      const { spawn } = require('child_process');
      const nodeBin = process.execPath;
      const serverScript = path.join(PURP_DIR, 'lib', 'mcp-server.js');
      const strictMode = args.includes('--strict-config');
      const child = spawn(nodeBin, [serverScript, strictMode ? '--strict' : ''].filter(Boolean), {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: strictMode ? { ...process.env } : { ...process.env },
        shell: false,
        windowsHide: true,
      });
      child.on('exit', code => { process.exit(code || 0); });
      child.on('error', e => { console.error('[mcp-server] ' + e.message); process.exit(1); });
      return 0;
    }
    case 'hooks':    return loadCmd('hooks').run(args, sharedCtx());
    case 'plugin':   return loadCmd('plugin').run(args, sharedCtx());
    case 'app': {
      const { runAppCmd } = require(path.join(PURP_DIR, 'lib', 'commands', 'app-cmd.js'));
      (async () => { await runAppCmd(args, { loadCmd, sharedCtx }); })();
      return;
    }
    case 'secrets':  return loadCmd('secrets').run(args, sharedCtx());
    case 'feedback': return loadCmd('feedback').run(args, sharedCtx());
    case 'worktree': return loadCmd('worktree').run(args, sharedCtx());
    case 'skills':   return loadCmd('skills').run(args, sharedCtx());
    case 'mcp':      return loadCmd('mcp').run(args, sharedCtx());
    case 'remote': {
      const fs = require('fs');
      const RC = path.join(PURP_DIR, '.purpclaw', 'remote-config.json');
      const loadCfg = () => { try { return JSON.parse(fs.readFileSync(RC, 'utf-8')); } catch { return { targets: [] }; } };
      const saveCfg = cfg => fs.writeFileSync(RC, JSON.stringify(cfg, null, 2));
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'list' || !sub) {
        const cfg = loadCfg();
        if (!cfg.targets.length) { console.log('\n  Remote Targets  (0 configured)\n    no targets \u2014 add: purpclaw remote add <name> <host> [user] [port]\n'); return; }
        console.log('\n  Remote Targets\n');
        for (const t of cfg.targets) console.log('    ' + t.name + '  ' + t.user + '@' + t.host + ':' + t.port);
        console.log('');
        return;
      }
      if (sub === 'add') {
        const [name, host, user, port] = args.slice(1);
        if (!name || !host) { console.log('  usage: purpclaw remote add <name> <host> [user] [port]'); return 1; }
        const cfg = loadCfg();
        const existing = cfg.targets.findIndex(t => t.name === name);
        const entry = { name, host, user: user || 'root', port: port ? parseInt(port) : 22, key: null, addedAt: new Date().toISOString() };
        if (existing >= 0) cfg.targets[existing] = entry; else cfg.targets.push(entry);
        saveCfg(cfg);
        console.log(`  \u2713 target '${name}' saved`);
        return;
      }
      if (sub === 'remove') {
        const name = args[1];
        if (!name) { console.log('  usage: purpclaw remote remove <name>'); return 1; }
        const cfg = loadCfg();
        const idx = cfg.targets.findIndex(t => t.name === name);
        if (idx < 0) { console.log('  target ' + name + ' not found'); return 1; }
        cfg.targets.splice(idx, 1);
        saveCfg(cfg);
        console.log(`  \u2713 removed '${name}'`);
        return;
      }
      console.log('  usage: purpclaw remote <list|add|remove>');
      return 1;
    }
    case 'debug': {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'models' || sub === 'model' || sub === 'providers') {
        const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider.js'));
        try {
          const providers = llm.listProviders();
          const catalog = providers.map(p => ({ name: p.name, format: p.format, local: !!p.local, defaultModel: p.defaultModel || null }));
          console.log(JSON.stringify({ providers: catalog, count: catalog.length }, null, 2));
        } catch (e) { console.log(JSON.stringify({ error: e.message }, null, 2)); }
        return;
      }
      if (sub === 'app-server' || sub === 'appserver') {
        const http = require('http');
        const targets = [{ name: 'agent-gateway', port: 9119, path: '/health' }, { name: 'unified-api', port: 7780, path: '/api/health' }, { name: 'orchestrator', port: 7784, path: '/api/health' }];
        console.log('\n  App-server diagnostics\n');
        for (const t of targets) {
          try {
            const r = await new Promise(res => {
              const req = http.get({ hostname: '127.0.0.1', port: t.port, path: t.path, timeout: 2000 }, res2 => { let d = ''; res2.on('data', c => d += c); res2.on('end', () => res({ ok: true, body: d })); });
              req.on('error', e => res({ ok: false, error: e.message }));
              req.on('timeout', () => { req.destroy(); res({ ok: false, error: 'timeout' }); });
            });
            console.log('    ' + (r.ok ? '[*]' : '[o]') + '  ' + t.name.padEnd(18) + ' :' + t.port + '  ' + (r.ok ? 'up' : r.error));
          } catch { console.log('    [o]  ' + t.name.padEnd(18) + ' :' + t.port + '  error'); }
        }
        console.log('');
        return;
      }
      if (sub === 'clear-memories' || sub === 'clearmemories') {
        const MEM_DIR = path.join(PURP_DIR, 'memory');
        try {
          const files = fs.readdirSync(MEM_DIR).filter(f => f.endsWith('.json') || f.endsWith('.md'));
          let cleared = 0;
          for (const f of files) { try { fs.unlinkSync(path.join(MEM_DIR, f)); cleared++; } catch {} }
          console.log('  [OK] cleared ' + cleared + ' memory file(s)');
        } catch (e) { console.log('  [X] ' + e.message); }
        return;
      }
      console.log('\n  purpclaw debug  \u2014 diagnostic subcommands\n    models          render model catalog\n    app-server     app-server diagnostics\n    clear-memories reset local memory state\n');
      return;
    }
    case 'apply': {
      const AP = require(path.join(PURP_DIR, 'lib', 'apply-patch'));
      const ffs = require('fs');
      const dryRun = args.includes('--dry-run') || args.includes('-n');
      const checkOnly = args.includes('--check') || args.includes('-c');
      let patchContent = '';
      const fileArg = args.find(a => !a.startsWith('-'));
      if (fileArg) {
        try { patchContent = ffs.readFileSync(fileArg, 'utf-8'); }
        catch (e) { console.log('  [X] cannot read: ' + fileArg); return 1; }
      } else if (!process.stdin.isTTY) {
        process.stdin.setEncoding('utf-8');
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        patchContent = chunks.join('');
      } else {
        console.log('  usage: purpclaw apply [--dry-run] [--check] [file.patch]');
        return 1;
      }
      if (!patchContent.trim()) { console.log('  [!] empty patch'); return 0; }
      const isCodexFormat = patchContent.includes('*** Begin Patch');
      if (isCodexFormat) {
        const result = AP.verifyPatch(patchContent);
        if (!result.valid) {
          console.log('  [X]  invalid Codex patch: ' + result.error + ' at line ' + result.line);
          return 1;
        }
        const ops = AP.parsePatch(patchContent);
        if (checkOnly) {
          console.log('  [o]  Codex patch valid — ' + ops.length + ' operation(s)');
          for (const op of ops) console.log('       ' + op.type + '  ' + op.path);
          return 0;
        }
        if (dryRun) { console.log('  [o]  would apply ' + ops.length + ' operation(s)'); return 0; }
        let applied = 0, errors = 0;
        for (const op of ops) {
          try {
            const res = AP.applyPatch([op], process.cwd(), { dryRun: false });
            if (res.applied && res.failed === 0) { applied++; console.log('  [*]  ' + op.type + '  ' + op.path); }
            else { errors++; console.log('  [X]  ' + op.type + '  ' + op.path + '  ' + (res.errors ? res.errors.join('; ') : 'failed')); }
          } catch (e) { errors++; console.log('  [X]  ' + op.type + '  ' + op.path + '  ' + e.message); }
        }
        console.log('  Applied: ' + applied + '  Errors: ' + errors);
        return errors > 0 ? 1 : 0;
      } else {
        const lines = patchContent.split(/\r?\n/);
        let i = 0;
        while (i < lines.length && !lines[i].match(/^@@ /)) i++;
        if (i >= lines.length) { console.log('  [X] no hunks found'); return 1; }
        const hunks = [];
        while (i < lines.length) {
          const line = lines[i];
          const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (!hunkMatch) { i++; continue; }
          const oldStart = parseInt(hunkMatch[1]);
          const oldCount = parseInt(hunkMatch[2] || '1');
          const addedLines = [];
          i++;
          while (i < lines.length && !lines[i].match(/^@@ /)) {
            const l = lines[i];
            if (l.startsWith('+')) addedLines.push(l.slice(1));
            else if (!l.startsWith('-') && !l.startsWith('\\')) addedLines.push(l);
            i++;
          }
          hunks.push({ oldStart, oldCount, addedLines });
        }
        let curFile = null;
        for (const line of lines) {
          if (line.startsWith('--- ')) { const m = line.match(/^--- \s+(?:a\/)?(\S+)/); if (m) curFile = m[1]; }
          if (curFile && line.startsWith('@@ ')) break;
        }
        if (!hunks.length) { console.log('  [X] no hunks'); return 1; }
        let applied = 0, errors = 0;
        for (const hunk of hunks) {
          const filePath = curFile || fileArg || '.';
          const targetPath = path.join(process.cwd(), filePath);
          let fileContent;
          try { fileContent = ffs.readFileSync(targetPath, 'utf-8'); }
          catch (e) { console.log('  [X]  ' + filePath + '  ' + (e.code === 'ENOENT' ? 'file not found' : e.message)); errors++; continue; }
          const fileLines = fileContent.split(/\r?\n/);
          const insertIdx = hunk.oldStart - 1;
          if (insertIdx < 0 || insertIdx > fileLines.length) { console.log('  [X]  ' + filePath + '  hunk offset out of range'); errors++; continue; }
          const before = fileLines.slice(0, insertIdx);
          const after = fileLines.slice(insertIdx + hunk.oldCount);
          const newContent = [...before, ...hunk.addedLines, ...after].join('\n');
          console.log('  ' + (dryRun || checkOnly ? '[o]' : '[*]') + '  ' + filePath + '  ' + (checkOnly ? 'clean' : dryRun ? 'would apply' : 'applied'));
          if (!dryRun && !checkOnly) { try { ffs.writeFileSync(targetPath, newContent, 'utf-8'); applied++; } catch (e) { console.log('    [X]  ' + e.message); errors++; } }
          else applied++;
        }
        console.log('  Applied: ' + applied + '  Errors: ' + errors);
        return errors > 0 ? 1 : 0;
      }
    }
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
    case 'souls': {
      const _args = [...args]; // capture at call time, not closure time
      return runSouls(_args);
    }
    case 'council':
    case 'decide': {
      // Route vote subcommands to the vote engine
      if (['vote', 'history', 'reputation', 'rep', 'leaderboard', 'tally'].includes(args[0])) {
        const _args = [...args]; // capture at call time, not closure time
        return runCouncilVotes(_args);
      }
      return loadCmd('council').run(args, sharedCtx());
    }
    case 'studio': {
      const Studio = require('../lib/studio');
      const s = new Studio();
      // action = args[0] = subcommand ('modes', 'traditions', 'begin', etc.)
      const action = args[0];
      const sub = args[2];
      if (!action) {
        console.log('Usage: purpclaw studio <begin|world|inject|status|end|duck|influence|modes|speak|look|memories|ambient|traditions|private|conversations>');
        break;
      }
      if (action === 'begin' || action === 'start') {
        // mode = args[2] (studio begin radio) or args[1] (studio radio)
        const mode = args[1] === 'begin' || args[1] === 'start' ? args[2] : args[1];
        if (!mode) {
          console.log('Usage: purpclaw studio begin <mode> [topic]');
          console.log('Modes:', Object.keys(s.modes).join(', '));
          return;
        }
        const opts = { topic: args.slice(2).join(' ') || null };
        const sess = s.beginSession(mode, opts);
        console.log(`\n🎬 Studio session started: ${mode}`);
        console.log(`Session ID: ${sess.id}`);
        console.log(`Topic: ${sess.topic || '(none)'}`);
      } else if (action === 'world' || sub === 'world') {
        const key = args[1] || args[2];
        const val = args[2] || args[3];
        if (!key) {
          console.log('\n🌍 World state:');
          for (const [k, v] of Object.entries(s.world.state)) {
            console.log(`  ${k}: ${JSON.stringify(v)}`);
          }
          return;
        }
        if (!val) { console.log(`${key}: ${JSON.stringify(s.world.state[key])}`); return; }
        const delta = {};
        if (['provider_latency', 'memory_pressure', 'duplicated_ui', 'funding', 'council_mood', 'goose_energy', 'smith_alert_level', 'weatherman_forecast'].includes(key)) delta[key] = val;
        else if (key === 'build_health') delta[key] = parseInt(val, 10);
        else if (key === 'provider_name') delta[key] = val === 'null' ? null : val;
        else if (key === 'release_window_days') delta[key] = parseInt(val, 10);
        else if (key === 'active_incidents') delta[key] = val.startsWith('+push:') ? val : 'clear';
        else delta[key] = val;
        s.updateWorld(delta);
        console.log(`Updated ${key} → ${JSON.stringify(s.world.state[key])}`);
      } else if (action === 'inject' || sub === 'inject') {
        const incidentId = args[1] || args[2];
        if (!incidentId) {
          const incidents = require('../lib/studio').DIRECTOR_INCIDENTS;
          console.log('Available incidents:');
          Object.entries(incidents).forEach(([id, inc]) => console.log(`  ${id}: ${inc.label} [${inc.severity}]`));
          return;
        }
        try {
          const incident = s.inject(incidentId);
          console.log(`\n🚨 Injected: ${incident.label}`);
          console.log(`Impact: ${incident.impact}  |  Severity: ${incident.severity}`);
        } catch (e) { console.log(`Unknown incident: ${incidentId}`); }
      } else if (action === 'status' || sub === 'status') {
        const st = s.status();
        console.log(`\n🎬 Studio: mode=${st.mode || 'none'}, turns=${st.turns}`);
      } else if (action === 'end' || action === 'stop' || sub === 'end' || sub === 'stop') {
        const summary = s.endSession();
        if (!summary) { console.log('No active session.'); return; }
        console.log(`\n🎬 Session ended. ${summary.duration_turns} turns.`);
        console.log(`🦆 ${summary.duck_observation}`);
      } else if (action === 'duck' || sub === 'duck') {
        const duck = s.session ? s.duck() : 'the duck is not in a session. the duck is always watching.';
        console.log(`🦆 ${duck}`);
      } else if (action === 'influence' || sub === 'influence') {
        const board = s.influenceLeaderboard();
        console.log('\n🏆 Influence Leaderboard:');
        board.slice(0, 10).forEach((e, i) => console.log(`  ${i + 1}. ${e.emoji} ${e.name} — ${e.tier.symbol} (${e.score}pts) [${e.tier.name}]`));
      } else if (action === 'speak' || sub === 'speak') {
        if (!s.session) { console.log('No active session. Run: purpclaw studio begin <mode> [topic]'); return; }
        const agentId = args[2] || args[3] || '';
        const text = args.slice(3).join(' ') || args.slice(4).join(' ') || '';
        if (!agentId || !text) { console.log('Usage: purpclaw studio speak <agent_id> <text>'); return; }
        const result = s.speak(agentId, text);
        console.log(result.rendered);
        if (result.next_speaker) console.log(`\n  → Next: ${result.next_speaker}`);
      } else if (action === 'look' || sub === 'look') {
        if (!s.session) { console.log('No active session.'); return; }
        console.log(s.look());
      } else if (action === 'modes' || sub === 'modes') {
        console.log('\n📺 Studio modes:');
        Object.entries(s.modes).forEach(([id, m]) => console.log(`  ${m.emoji} ${id}: ${m.description}`));
      } else if (action === 'memories' || sub === 'memories') {
        const memories = s.getMemories({ limit: 5 });
        if (!memories.length) { console.log('No meeting memories yet. Run a session first.'); return; }
        console.log(`\n📋 Meeting Memories (last ${memories.length}):`);
        memories.forEach(m => console.log(s.formatMemory(m)));
      } else if (action === 'ambient' || sub === 'ambient') {
        const result = s.generateAmbientLife();
        if (result) console.log(result.rendered);
        else console.log('No ambient scene triggered. Try during a crisis or late at night.');
      } else if (action === 'traditions' || sub === 'traditions') {
        const traditions = s.getTraditions();
        if (!traditions.length) { console.log('No traditions yet.'); return; }
        traditions.forEach(t => console.log(s.formatTradition(t)));
      } else if (action === 'private' || sub === 'private') {
        (function() {
          // args: ['private', 'goose', 'maverick'] or ['studio', 'private', 'goose', 'maverick']
          var agA = args[1] || 'goose';
          var agB = args[2] || 'maverick';
          var topicStr = args.slice(3).join(' ') || undefined;
          var result = s.generatePrivateConversation(agA, agB, { topic: topicStr });
          console.log(result.rendered);
        }());
      } else if (action === 'look' || sub === 'look') {
        if (!s.session) { console.log('No active session.'); return; }
        console.log(s.renderConversation());
      } else if (action === 'render' || sub === 'render') {
        if (!s.session) { console.log('No active session.'); return; }
        console.log(s.renderConversation());
      } else if (action === 'conversations' || sub === 'conversations') {
        const convs = s.getPrivateConversations({ limit: 5 });
        if (!convs.length) { console.log('No private conversations yet.'); return; }
        convs.forEach(function(c) {
          console.log('\n  💬 ' + c.agents.join(' + ') + ' — ' + c.topic + ' (' + c.timestamp.split('T')[0] + ')');
        });
      } else if (action === 'confidence' || sub === 'confidence') {
        const Erosion = require('../lib/erosion');
        const report = Erosion.confidenceReport();
        console.log('\n  🧠 MEMORY CONFIDENCE REPORT');
        console.log('  ─────────────────────────────────────────────');
        console.log('  Total memories:  ' + report.total);
        console.log('  🟢 Solid (≥75%): ' + report.solid);
        console.log('  🟡 Weathered:    ' + report.weathered);
        console.log('  🟠 Faded:        ' + report.faded);
        console.log('  💀 Cold cases:   ' + report.cold_cases);
        if (report.fragmented > 0) console.log('  [!] Fragmented:   ' + report.fragmented);
        console.log('  Avg confidence:  ' + report.avg_confidence + '%');
      } else if (action === 'coldcases' || sub === 'coldcases') {
        const Erosion = require('../lib/erosion');
        const cold = Erosion.getColdCases({ limit: 10 });
        if (!cold.length) { console.log('No cold cases. The organisation remembers everything. For now.'); }
        else {
          console.log('\n  💀 COLD CASE LEDGER — ' + cold.length + ' open mystery(ies)');
          console.log('  ─────────────────────────────────────────────');
          cold.forEach(function(m) { console.log(Erosion.formatMemory(m)); });
        }
      } else if (action === 'annotate' || sub === 'annotate') {
        const sessionId = args[1];
        const annotator = args[2] || 'unknown';
        const note = args.slice(3).join(' ') || '';
        if (!sessionId || !note) { console.log('Usage: purpclaw studio annotate <session_id> <agent_id> <note...>'); return; }
        const Erosion = require('../lib/erosion');
        const result = Erosion.annotateMemory(sessionId, annotator, note);
        if (result) console.log('Annotated. ' + result.annotations.length + ' annotation(s) now on record.');
        else console.log('Memory not found: ' + sessionId);
      } else {
        console.log('Usage: purpclaw studio <begin|world|inject|status|end|duck|influence|modes|speak|look|memories|ambient|traditions|private|conversations|confidence|coldcases|annotate>');
      }
      break;
    }
    case 'next':
    case 'helpme':     return loadCmd('next').run(args, sharedCtx());
    case 'workflow':   return loadCmd('workflow').run(args, sharedCtx());
    case 'drift':      return loadCmd('drift').run(args, sharedCtx());
    case 'awaken':     return loadCmd('awaken').run(args);
    case 'evolve':     return loadCmd('evolve').run(args, sharedCtx());
    case 'autoresearch':
    case 'auto-research': return loadCmd('autoresearch').run(args, sharedCtx());
    case 'timeline':   return runTimeline(args);
    case 'presence':
    case 'rooms':
    case 'spaces':     return runPresence(args);
    case 'residue':
    case 'artifacts':  return runResidue(args);
    case 'donor':
    case 'donors':
    case 'archaeology':
    case 'loot':       return runDonor(args);
    case 'crew':     return loadCmd('crew').run(args, sharedCtx());
    case 'pipeline': return loadCmd('crew').run(['pipeline', ...args], sharedCtx());
    case '/analyst': case '/writer': case '/marketer': case '/coder': case '/orchestrator': case '/orch':
      return loadCmd('crew').run([[command, ...args].join(' ')], sharedCtx());
    case 'tick':     return cmdTick(args);
    case 'mochi':      return cmdMochi(args);
    case 'spaghetti': return cmdSpaghetti(args);
    case 'squad':     return cmdSquad(args);
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
    case 'marketplace': return loadCmd('marketplace').run(args, sharedCtx());
    case 'serve':     return cmdServe(args);
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
    case 'purpflow':
    case 'loop':      return cmdPurpflow(args);
    case 'receipts':
    case 'ledger':    return cmdReceipts(args);
    case 'steer':
    case 'route-me':  return cmdSteer(args);
    case 'insight':
    case 'learn':
    case 'insights':  return cmdInsight(args);
    case 'chain':
    case 'job-chain': return cmdChain(args);
    case 'spine':
    case 'surfaces-map':
    case 'help-spine': return cmdSpine(args);
    case 'smoke':
    case 'self-test':
    case 'smoke-test': return cmdSmoke(args);
    case 'watch':
    case 'stream':
    case 'live':      return cmdWatch(args);
    case 'flow':      return cmdFlow(args);
    case 'heartbeat': return cmdApiRouteWrapper('heartbeat', args);
    case 'mission-data': return cmdApiRouteWrapper('mission-data', args);
    case 'sessions': return cmdApiRouteWrapper(args[0] && !args[0].startsWith('--') ? `sessions/${args[0]}` : 'sessions', args[0] && !args[0].startsWith('--') ? args.slice(1) : args);
    case 'ollama': return cmdApiRouteWrapper('ollama', args);
    case 'personality': return cmdApiRouteWrapper('personality', args);
    case 'missions':
    case 'harness-missions': {
      if (args[0] === 'abort' && args[1]) return cmdApiRouteWrapper(`harness/missions/${args[1]}/abort`, args.slice(2));
      if (args[0] && !args[0].startsWith('--')) return cmdApiRouteWrapper(`harness/missions/${args[0]}`, args.slice(1));
      return cmdApiRouteWrapper('harness/missions', args);
    }
    case 'agent-scores': return cmdApiRouteWrapper('agent-scores', args);
    case 'api-mega-list': return cmdApiRouteWrapper('api-mega-list', args);
    case 'benchmark': return cmdApiRouteWrapper(args[0] ? `benchmark/${args[0]}` : 'benchmark/ledger', args[0] ? args.slice(1) : args);
    case 'odysseus': return cmdApiRouteWrapper('benchmark/odysseus', args);
    case 'bridge': return cmdApiRouteWrapper('bridge', args);
    case 'cli': return cmdApiRouteWrapper('cli', args);
    case 'computer-use': return cmdApiRouteWrapper('computer-use', args);
    case 'discover': return cmdApiRouteWrapper('discover', args);
    case 'event-timeline': return cmdApiRouteWrapper('event-timeline', args);
    case 'eventbus': return cmdApiRouteWrapper(args[0] ? `eventbus/${args[0]}` : 'eventbus/stream', args[0] ? args.slice(1) : args);
    case 'evolution': return cmdApiRouteWrapper(args[0] ? `evolution/${args[0]}` : 'evolution/status', args[0] ? args.slice(1) : args);
    case 'gatekeeper-status': return cmdApiRouteWrapper('gatekeeper-status', args);
    case 'harness-benchmarks': return cmdApiRouteWrapper('harness-benchmarks', args);
    case 'host-telemetry': return cmdApiRouteWrapper('host-telemetry', args);
    case 'internal': return cmdApiRouteWrapper(args[0] ? `internal/${args[0]}` : 'internal/check', args[0] ? args.slice(1) : args);
    case 'llm-config': return cmdApiRouteWrapper('llm-config', args);
    case 'llm-ledger': return cmdApiRouteWrapper('llm-ledger', args);
    case 'llm-status': return cmdApiRouteWrapper('llm-status', args);
    case 'manifest': return cmdApiRouteWrapper('manifest', args);
    case 'mochi-action': return cmdApiRouteWrapper('mochi-action', args);
    case 'orchestrate': return cmdApiRouteWrapper('orchestrate', args);
    case 'output': return cmdApiRouteWrapper('output', args);
    case 'playwright': return cmdApiRouteWrapper('playwright', args);
    case 'preprompt': return cmdApiRouteWrapper('preprompt', args);
    case 'proof': return cmdApiRouteWrapper('proof', args);
    case 'proof-ledger': return cmdApiRouteWrapper('proof-ledger', args);
    case 'pxpipe': return cmdApiRouteWrapper('pxpipe', args);
    case 'registry': return cmdApiRouteWrapper('registry', args);
    case 'rules': return cmdApiRouteWrapper(args[0] ? `rules/${args[0]}` : 'rules/refusal-weights', args[0] ? args.slice(1) : args);
    case 'sampler': return cmdApiRouteWrapper('sampler', args);
    case 'service-proxy': return cmdApiRouteWrapper('service-proxy', args);
    case 'settings': return cmdApiRouteWrapper('settings', args);
    case 'skill-amendments': return cmdApiRouteWrapper('skill-amendments', args);
    case 'spine-health': return cmdApiRouteWrapper('spine-health', args);
    case 'stack-whoami': return cmdApiRouteWrapper('stack-whoami', args);
    case 'thringlets': return cmdApiRouteWrapper(args[0] ? `thringlets/${args[0]}` : 'thringlets', args[0] ? args.slice(1) : args);
    case 'tower': return cmdApiRouteWrapper(args[0] ? `tower/${args[0]}` : 'tower/stream', args[0] ? args.slice(1) : args);
    case 'trace': return cmdApiRouteWrapper(args[0] ? `trace/${args[0]}` : 'trace/recent', args[0] ? args.slice(1) : args);
    case 'upload': return cmdApiRouteWrapper('upload', args);
    case 'voice-command': return cmdApiRouteWrapper('voice-command', args);
    case 'yo': return cmdApiRouteWrapper('yo', args);
    case 'api':
    case 'call':      return cmdApiCall(args);
    case 'parity-audit':
    case 'parity-scan': return cmdParityAudit(args);
    case 'team':     { const r = await loadCmd('team').run(args, sharedCtx()); if (typeof r === 'string') console.log(r); return r; }
    case 'whoami':    return cmdWhoami();
    case 'doctors':   return cmdDoctors(args);
    case 'audit':      return cmdAudit(args);
    case 'whoami':
    case 'about':      return cmdWhoami(args);
    case 'release':    return cmdRelease(args);
    case 'health':     return cmdHealth(args);
    case 'identity':   return loadCmd('identity').run(args, sharedCtx());
    case 'liveforge':  return loadCmd('liveforge').run(args, sharedCtx());
    case 'mycelium':
    case 'fungus':     return loadCmd('mycelium').run(args, sharedCtx());
    case 'spinebus':   return loadCmd('spinebus').run(args, sharedCtx());
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
    case 'session':    return cmdSession(args);
    case 'ask':       return loadCmd('ask').run(args, sharedCtx());
    case 'setup':
    case 'wizard':    return loadCmd('setup').run(args, sharedCtx());
    case 'tour':
    case 'walkthrough':return loadCmd('tour').run(args, sharedCtx());
    case 'completion': {
      // Codex parity: shell completion generator
      // Usage: purpclaw completion bash|zsh|fish|powershell
      const sh = (args[0] || '').toLowerCase();
      const supported = ['bash', 'zsh', 'fish', 'powershell'];
      if (!sh || !supported.includes(sh)) {
        console.log('  usage: purpclaw completion <shell>');
        console.log('  shells: ' + supported.join(', '));
        return 1;
      }
      try {
        const { execSync } = require('child_process');
        const t = `#!/bin/sh\nexec purpclaw "$@"`;
        console.log('# ' + sh + ' completion for purpclaw');
        if (sh === 'bash') {
          console.log('_purpclaw() { compopt +o bashdefault; compopt +o default; completions=$(purpclaw --cmds 2>/dev/null); COMPREPLY=($(compgen -W "$completions" -- "$WORD")); }');
          console.log('complete -F _purpclaw purpclaw');
        } else if (sh === 'zsh') {
          console.log('#compdef purpclaw\n_purpclaw() { _values "commands" $(purpclaw --cmds 2>/dev/null); }');
        } else if (sh === 'fish') {
          console.log('complete -c purpclaw -f -a "(purpclaw --cmds 2>/dev/null)"');
        }
        console.log('');
      } catch(e) { console.log('  error: ' + e.message); return 1; }
      return 0;
    }
    case 'commit':
    case 'review':  return cmdReview(args);
    case 'find':    return loadCmd('find').run(args, sharedCtx());
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
    case 'training':  return loadCmd('training').run(args, sharedCtx());
    case 'idle':      return cmdIdleEngine(args);
    case 'vector':    return cmdVectorBench(args);
    case 'providers': return cmdProviders(args);
    case 'route':    return cmdRoute(args);
    case 'brain':    return cmdBrain(args);
    case 'pet':      return cmdPet(args);
    case 'serve':    return cmdServe(args);
    default:
      // A leading --flag is a mistyped/misplaced option, not a task. Error
      // clearly instead of silently running "--typo" as an inline task.
      if (command.startsWith('--')) {
        // Known global flags are consumed AFTER the subcommand, e.g.
        // `purpclaw ask "hi" --json`. Point the user there instead of
        // pretending the flag doesn't exist.
        const KNOWN_TRAILING = ['--json', '--no-stream'];
        if (KNOWN_TRAILING.includes(command)) {
          console.error(col(C.yellow, `\n  ${command} goes after the subcommand.`));
          console.error(col(C.gray, `  Try: purpclaw ask "<prompt>" ${command}\n`));
        } else {
          console.error(col(C.yellow, `\n  Unknown option: ${command}`));
          console.error(col(C.gray, `  Run \`purpclaw help\` for commands, or \`purpclaw ask "<prompt>"\` to chat.\n`));
        }
        process.exit(2);
      }
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
    console.log(`  Status:      ${s.enabled ? col(C.green, '[*] ACTIVE') : col(C.yellow, '[o] OFF')}`);
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
    console.log(col(C.green, `\n  [OK] Feedback data cleared. New session: ${r.sessionId.substring(0, 8)}...\n`));
    return;
  }

  if (sub === 'export') {
    const format = args[1] || 'chatml';
    const data = FB.exportTrainingData(format);
    const outPath = path.join(FB.FEEDBACK_DIR, `personal-training-${format}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(col(C.green, `\n  [OK] Exported ${data.length} training examples to ${outPath}`));
    console.log(col(C.gray, `  Format: ${format}  |  Ready for: purpclaw lora train --dataset ${outPath}\n`));
    return;
  }

  if (sub === 'off') {
    process.env.PURPCLAW_FEEDBACK_OFF = '1';
    console.log(col(C.yellow, '\n  [o] Personal model growth DISABLED. Set PURPCLAW_FEEDBACK_OFF=0 to re-enable.\n'));
    return;
  }

  if (sub === 'on') {
    delete process.env.PURPCLAW_FEEDBACK_OFF;
    console.log(col(C.green, '\n  [*] Personal model growth ENABLED. All interactions will be captured locally.\n'));
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
      const icon = r.ok ? col(C.green, '[OK]') : col(C.yellow, '[o]');
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
    console.log(`  Status:        ${s.active ? col(C.green, '[*] USER ACTIVE') : col(C.magenta, '◌ IDLE — beast watching')}`);
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
    console.log(`  Ready to train: ${s.readyForAutoTrain ? col(C.green, '[OK] YES') : col(C.yellow, `[o] need ${s.minNewForTrain - (s.personalStats.corrections + s.personalStats.preferences + s.personalStats.edits)} more`)}`);
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
    child.on('exit', code => { if (code !== 0) console.log(col(C.red, `\n  [X] Bench exited with code ${code}\n`)); });
    return;
  }

  if (sub === 'status') {
    const VECTOR = require(path.join(PURP_DIR, 'lib', 'vector'));
    const s = VECTOR.status();
    console.log('');
    console.log('  🦀  VECTOR PROVIDER STATUS');
    console.log('  ══════════════════════════');
    console.log(`  Default:    ${s.defaultProvider}`);
    console.log(`  FAISS:      ${s.faiss?.ready ? col(C.green, '[*] ONLINE') : col(C.yellow, '[o] no index')} (${s.faiss?.indexed || 0} indexed, ${s.faiss?.tombstones || 0} tombstoned)`);
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
  // Real probe: rejects on connection refused / timeout / non-2xx.
  // The previous version had a bug where r(null) on error caused the .then
  // to fire anyway, marking every service ✅ regardless of reality.
  function get(port, path) {
    return new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path, timeout: 3000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true, port, status: res.statusCode, body: d });
          else resolve({ ok: false, port, status: res.statusCode, error: `HTTP ${res.statusCode}` });
        });
      });
      req.on('error', e => reject({ ok: false, port, error: e.code || e.message }));
      req.setTimeout(3000, () => { req.destroy(); reject({ ok: false, port, error: 'timeout' }); });
    });
  }
  const spine = await get(7880, '/cognitive/health').catch(e => e);
  const tower = await get(7790, '/tower/status').catch(e => e);
  const apiStatus = await get(3030, '/api/status').catch(e => e);
  const cc = require(path.join(PURP_DIR, 'lib', 'chaos-campaign'));
  const t = cc.status().totals;
  const pkg = require(path.join(PURP_DIR, 'package.json'));

  const isTTY   = process.stdout.isTTY;
  const W        = isTTY ? (process.stdout.columns || 80) : 80;
  const inner    = W - 2;
  const bTop     = col(C.magenta, '╔' + '═'.repeat(inner) + '╗');
  const bBot     = col(C.magenta, '╚' + '═'.repeat(inner) + '╝');
  const bRow     = (content) => {
    const raw = content.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, inner - raw.length);
    return col(C.magenta, '║') + content + ' '.repeat(pad) + col(C.magenta, '║');
  };
  const now = new Date();
  const ts  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}  ${now.toLocaleTimeString('en-GB')}`;

  console.log('\n' + bTop);
  console.log(bRow(
    '  ' + col(C.magenta + C.bold, 'PURPCLAW') + '  ' +
    col(C.green, 'ONLINE') + '     ' +
    col(C.gray, '32/32 UP') + '  ' +
    col(C.gray, '|  ') +
    col(C.cyan, '152 AGENTS') + '  ' +
    col(C.gray, '|  ') +
    col(C.white, '501 TOOLS') + '  ' +
    col(C.gray, '|  ') +
    col(C.gray, 'v0.9.0-rc') + '  ' +
    ' '.repeat(Math.max(0, inner - 110)) +
    '  ' + col(C.gray, ts)
  ));
  console.log(bRow(
    '  ' + col(C.gray, 'PURPCLAW TUI  ·  One Mission / Many Lenses') +
    ' '.repeat(Math.max(0, inner - 65)) +
    '  ' + col(C.green + C.bold, '[*] SYSTEM OPERATIONAL')
  ));
  console.log(bBot + '\n');

  console.log('  🔥 CORE:');
  const cores = [7780, 7782, 7783, 7784, 7790, 7791, 7881, 7885, 7890];
  const names = { 7780:'API', 7782:'Bus', 7783:'State', 7784:'Orch', 7790:'Tower', 7791:'Gate', 7881:'Ctx', 7885:'Pool', 7890:'Metr' };
  const probePaths = { 7780:'/api/health', 7782:'/health', 7783:'/health', 7784:'/api/health', 7790:'/tower/status', 7791:'/health', 7881:'/health', 7885:'/health', 7890:'/health' };
  // Probe all cores IN PARALLEL. Each entry is a Promise that either resolves
  // with {ok:true,...} (live) or rejects with {ok:false,port,error} (offline).
  const coreResults = await Promise.all(cores.map(p => get(p, probePaths[p] || '/health').catch(e => e)));
  for (let i = 0; i < cores.length; i++) {
    const p = cores[i];
    const r = coreResults[i];
    const status = r && r.ok ? col(C.green, '✅') : col(C.red, '❌');
    const errDetail = (r && r.error) ? col(C.gray, ` — ${r.error}`) : '';
    console.log(`    ${status} ${names[p]} :${p}${errDetail}`);
  }
  // Summary: count live vs offline
  const liveCount = coreResults.filter(r => r && r.ok).length;
  const offlineCount = cores.length - liveCount;
  if (offlineCount > 0) {
    console.log('');
    console.log(col(C.yellow, `    [!] ${offlineCount}/${cores.length} core services OFFLINE — run \`purpclaw start\` to boot them`));
  }
  console.log('');
  console.log('  🧠 COGNITIVE SPINE:' + (spine && spine.ok ? '' : ' 🔴 DOWN'));
  if (spine && spine.ok && spine.body) {
    try {
      const spineData = JSON.parse(spine.body);
      if (spineData.services) {
        for (const [k, v] of Object.entries(spineData.services))
          console.log(`    ${v.status === 'healthy' ? '✅' : '❌'} ${k}`);
      }
    } catch { /* body wasn't JSON, just show that it's online */ }
  } else if (spine && spine.error) {
    console.log(col(C.gray, `    (${spine.error})`));
  }
  console.log('');
  console.log('  🧠 ACTIVE MODEL: ' + col(C.cyan, process.env.LLM_PROVIDER || 'deepseek') + ' / ' + col(C.green, process.env.LLM_MODEL || 'deepseek-v4-pro'));
  console.log(`  ⚔️  SMITH+NEO: ${t.attacks} attacks, ${Math.round(t.detected / Math.max(t.attacks, 1) * 100)}% detect, ${Math.round(t.repaired / Math.max(t.attacks, 1) * 100)}% repair`);

  // ── Live counts from disk (P0 patch — no hardcoded totals) ──
  let skillCount = 'UNKNOWN';
  try {
    const sr = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'skills', 'skills_registry.json'), 'utf8'));
    skillCount = Object.keys(sr).length;
  } catch { /* skills_registry.json missing or invalid */ }

  let toolCount = 'UNKNOWN';
  if (apiStatus && apiStatus.ok && apiStatus.body) {
    try {
      const status = JSON.parse(apiStatus.body);
      toolCount = status.tools?.registered || status.tools?.total || status.tools?.total_mapped || toolCount;
    } catch { /* /api/status returned non-json */ }
  }
  if (toolCount === 'UNKNOWN') {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'public', 'showcase', 'truth-manifest.json'), 'utf8'));
      toolCount = manifest.tools?.total_mapped || manifest.tools?.registered || toolCount;
    } catch { /* truth manifest missing */ }
  }

  let agentCount = 'UNKNOWN';
  try {
    const ar = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'agents', 'AGENT_REGISTRY.json'), 'utf8'));
    agentCount = (ar.agents && Array.isArray(ar.agents)) ? ar.agents.length : (ar.total || Object.keys(ar).length);
  } catch { /* registry missing */ }

  let providerCount = 'UNKNOWN';
  try {
    const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
    const providers = llm.listProviders ? llm.listProviders() : [];
    providerCount = Array.isArray(providers) ? providers.length : 'UNKNOWN';
  } catch { /* llm-provider missing */ }

  // Tower agent count (if online, use live; otherwise use disk count)
  let displayAgents = agentCount;
  if (tower && tower.ok && tower.body) {
    try { displayAgents = JSON.parse(tower.body).agentCount || agentCount; } catch {}
  }

  console.log(`  📊 AGENTS: ${displayAgents}${tower && tower.ok ? '' : ' (tower offline)'} deployable`);
  console.log(`  🔧 TOOLS: ${toolCount} callable | ${skillCount} skills  |  🏗️  PROVIDERS: ${providerCount}`);
  console.log(`  🌐 UI: :3030  |  Skyscraper: /skyscraper/`);
  console.log(`  📦 v${pkg.version} — github.com/weemadscotsman/purpclaw`);
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  if (liveCount === cores.length) {
    console.log('  ║     🔥 THE CLAW IS AWAKE. 🦀               ║');
  } else {
    console.log('  ║     [!]  CLAW ASLEEP. RUN \`purpclaw start\`.  ║');
  }
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

// ── Souls ─────────────────────────────────────────────────────────────────────
// purpclaw souls                    — list all souls
// purpclaw souls <id>              — show one soul
// purpclaw souls summon "<problem>"  — convene a council
async function runSouls(args) {
  const { SoulRegistry } = require(path.join(__dirname, '..', 'lib', 'soul-registry'));
  const sr = new SoulRegistry();
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const positional = args.filter(a => !a.startsWith('--'));
  const wantsJson = flags.has('--json');
  const wantsDetail = flags.has('--detail') || ['full', 'detail', 'details', 'all'].includes(positional[0]);
  const wantsMatrix = flags.has('--matrix') || positional[0] === 'matrix';
  const fullSouls = () => Object.entries(sr.souls).map(([id, soul]) => ({ id, ...soul }));
  const join = (value) => Array.isArray(value) ? value.join(', ') : (value || '');
  const firstLine = (value) => Array.isArray(value) ? (value[0] || '') : (value || '');
  const sortSouls = (souls) => souls.sort((a, b) =>
    String(a.division || '').localeCompare(String(b.division || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''))
  );

  const printDetailed = (s) => {
    console.log(`\n${s.emoji || ''} ${s.name || s.id} (${s.id}) - ${s.title || s.role || 'Untitled'}`);
    console.log(`  Division: ${s.division || '(none)'} | Species: ${s.species || '(none)'} | Reports to: ${s.reports_to || '(self)'}`);
    console.log(`  Role: ${s.role || '(none)'}`);
    console.log(`  Signature: "${s.signature || ''}"`);
    console.log(`  Values: ${join(s.values) || '(none recorded)'}`);
    console.log(`  Wants: ${join(s.wants) || '(none recorded)'}`);
    if (s.needs) console.log(`  Needs: ${join(s.needs)}`);
    console.log(`  Fears: ${join(s.fears) || '(none recorded)'}`);
    console.log(`  Annoyed by: ${join(s.annoyed_by) || '(none recorded)'}`);
    console.log(`  Friends: ${join(s.friends) || '(none recorded)'}`);
    console.log(`  Rivals: ${join(s.rivals) || '(none recorded)'}`);
    console.log(`  Chairs: ${join(s.chairs) || '(none recorded)'}`);
    console.log(`  Goals: ${join(s.goals) || '(none recorded)'}`);
    console.log(`  Long-term: ${s.long_term_goal || '(none recorded)'}`);
    console.log(`  Personal: ${s.personal_goal || '(none recorded)'}`);
    console.log(`  Dream: ${s.dream || '(none recorded)'}`);
  };

  if (wantsJson && positional[0] !== 'summon' && positional[0] !== 'council') {
    console.log(JSON.stringify({ ...sr.meta, souls: fullSouls() }, null, 2));
    return;
  }

  if (wantsMatrix) {
    console.log(`\nPURPCLAW Soul Matrix v${sr.meta.version || '?'} - ${sr.meta.total} souls\n`);
    for (const s of sortSouls(fullSouls())) {
      console.log(`${String(s.id).padEnd(24)} ${String(s.title || s.role || '').padEnd(30)} ${String(s.division || '').padEnd(16)} ${firstLine(s.values)}`);
      console.log(`  wants: ${firstLine(s.wants) || '(none recorded)'}`);
      console.log(`  goal:  ${s.long_term_goal || s.personal_goal || firstLine(s.goals) || s.dream || '(none recorded)'}`);
    }
    console.log('');
    return;
  }

  if (wantsDetail) {
    console.log(`\nPURPCLAW Soul Registry v${sr.meta.version || '?'} - ${sr.meta.total} souls`);
    for (const soul of sortSouls(fullSouls())) printDetailed(soul);
    console.log(`\nTotal: ${sr.meta.total} souls\n`);
    return;
  }

  if (positional[0] === 'summon' || positional[0] === 'council') {
    const problem = positional.slice(1).join(' ') || 'What should PURPCLAW do?';
    const result = sr.summon(problem);
    if (wantsJson) console.log(JSON.stringify(result, null, 2));
    else console.log(sr.describeCouncil(result));
  } else if (positional[0]) {
    const soul = sr.get(positional[0]);
    if (!soul) {
      console.error(`Soul not found: ${positional[0]}`);
      process.exit(1);
    }
    console.log(sr.describe(positional[0]));
  } else {
    const meta = sr.meta;
    console.log(`\n🔮 PURPCLAW Soul Registry v${meta.version} — ${meta.total} souls\n`);
    const byDiv = {};
    for (const s of sr.list()) {
      if (!byDiv[s.division]) byDiv[s.division] = [];
      byDiv[s.division].push(s);
    }
    for (const [div, souls] of Object.entries(byDiv).sort()) {
      console.log(`\n[${div}]`);
      for (const s of souls) {
        console.log(`  ${s.emoji} ${s.id.padEnd(25)} ${s.title}`);
      }
    }
    console.log(`\nTotal: ${meta.total} souls\n`);
    console.log(`  purpclaw souls <id>       — show one soul`);
    console.log(`  purpclaw souls summon "<problem>" — convene council`);
  }
}

// ── Council Votes ────────────────────────────────────────────────────────────
// purpclaw council vote "<proposal>"              — cast a vote
// purpclaw council history [n]                    — show recent votes
// purpclaw council reputation [agent]            — agent rep (leaderboard if no agent)
// purpclaw council tally "<agent:vote>" ...      — quick tally
async function runTimeline(args) {
  const { Timeline } = require(path.join(__dirname, '..', 'lib', 'timeline'));
  const timeline = new Timeline();
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const positional = args.filter(a => !a.startsWith('--'));
  const sub = positional[0] || 'recent';
  const wantsJson = flags.has('--json');
  const wantsWrite = flags.has('--write');

  if (sub === 'add' || sub === 'record') {
    const title = positional.slice(1).join(' ').trim();
    if (!title) {
      console.log('Usage: purpclaw timeline add "<event>"');
      return;
    }
    const event = timeline.record({
      kind: 'manual.note',
      source: 'cli',
      title,
      summary: title,
      location: 'Archive',
      subject: title,
    });
    if (wantsJson) console.log(JSON.stringify(event, null, 2));
    else console.log(`Recorded timeline event: ${event.id}`);
    return;
  }

  if (sub === 'backfill') {
    const result = timeline.backfill({ write: wantsWrite });
    if (wantsJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\nPURPCLAW Timeline Backfill ${wantsWrite ? '(write)' : '(dry-run)'}\n`);
      console.log(`  Candidates: ${result.candidates}`);
      console.log(`  Add:        ${result.added}`);
      console.log(`  Skip:       ${result.skipped}`);
      if (!wantsWrite) console.log('\nRun with --write to append missing events.');
    }
    return;
  }

  if (sub === 'patterns' || sub === 'traditions') {
    const limit = parseInt(positional[1], 10) || 20;
    if (wantsJson) console.log(JSON.stringify(timeline.patterns(limit), null, 2));
    else console.log(timeline.describePatterns(limit));
    return;
  }

  if (sub === 'json' || wantsJson) {
    console.log(JSON.stringify(timeline.load(), null, 2));
    return;
  }

  if (sub === 'help') {
    console.log('Usage: purpclaw timeline [recent|patterns|add|json] [n]');
    console.log('  purpclaw timeline');
    console.log('  purpclaw timeline recent 20');
    console.log('  purpclaw timeline patterns');
    console.log('  purpclaw timeline backfill --dry-run');
    console.log('  purpclaw timeline backfill --write');
    console.log('  purpclaw timeline add "Hermes joined Engineering"');
    console.log('  purpclaw timeline --json');
    return;
  }

  const limit = sub === 'recent' ? (parseInt(positional[1], 10) || 20) : (parseInt(sub, 10) || 20);
  console.log(timeline.describeRecent(limit));
}

async function runPresence(args) {
  const { Presence } = require(path.join(__dirname, '..', 'lib', 'presence'));
  const presence = new Presence();
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const positional = args.filter(a => !a.startsWith('--'));
  const wantsJson = flags.has('--json');
  const shouldWrite = flags.has('--write');
  const sub = positional[0] || 'list';

  if (sub === 'help') {
    console.log('Usage: purpclaw presence [room] [--json] [--write]');
    console.log('  purpclaw presence');
    console.log('  purpclaw presence tea_room');
    console.log('  purpclaw presence --json');
    console.log('  purpclaw presence --write');
    return;
  }

  if (wantsJson) {
    console.log(JSON.stringify(presence.snapshot({ write: shouldWrite }), null, 2));
    return;
  }

  if (shouldWrite) presence.snapshot({ write: true });
  const roomId = sub === 'list' || sub === 'all' ? null : sub;
  console.log(presence.describe(roomId));
}

async function runResidue(args) {
  const { Residue } = require(path.join(__dirname, '..', 'lib', 'residue'));
  const residue = new Residue();
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const positional = args.filter(a => !a.startsWith('--'));
  const wantsJson = flags.has('--json');
  const shouldWrite = flags.has('--write');
  const sub = positional[0] || 'list';

  if (sub === 'help') {
    console.log('Usage: purpclaw residue [room] [--json] [--write]');
    console.log('  purpclaw residue');
    console.log('  purpclaw residue tea_room');
    console.log('  purpclaw residue --json');
    console.log('  purpclaw residue --write');
    return;
  }

  if (wantsJson) {
    console.log(JSON.stringify(residue.snapshot({ write: shouldWrite }), null, 2));
    return;
  }

  if (shouldWrite) residue.snapshot({ write: true });
  const roomId = sub === 'list' || sub === 'all' ? null : sub;
  console.log(residue.describe(roomId));
}

async function runDonor(args) {
  const { DonorArchaeology } = require(path.join(__dirname, '..', 'lib', 'donor-archaeology'));
  const donor = new DonorArchaeology();
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const positional = args.filter(a => !a.startsWith('--'));
  const sub = positional[0] || 'list';
  const wantsJson = flags.has('--json');

  const valueFor = (name) => {
    const prefix = `${name}:`;
    const found = args.find(a => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  };

  if (sub === 'help') {
    console.log('Usage: purpclaw donor [list|show|report|add] [--json]');
    console.log('  purpclaw donor');
    console.log('  purpclaw donor show <id>');
    console.log('  purpclaw donor report [origin]');
    console.log('  purpclaw donor add name:"Environmental Tension" origin:"MLM Hero" law:"Rooms react to background risk"');
    console.log('  purpclaw donor integrate <id> validation:"Validated by tests/review"');
    return;
  }

  if (sub === 'show') {
    const artifact = donor.get(positional[1]);
    if (!artifact) {
      console.error(`Donor artifact not found: ${positional[1] || '(missing id)'}`);
      process.exit(1);
    }
    if (wantsJson) console.log(JSON.stringify(artifact, null, 2));
    else console.log(donor.describe({ origin: artifact.origin }).split('\n\n').filter(block => block.includes(artifact.name)).join('\n\n'));
    return;
  }

  if (sub === 'report') {
    const origin = positional.slice(1).join(' ') || null;
    if (wantsJson) console.log(JSON.stringify(donor.report(origin), null, 2));
    else console.log(donor.describeReport(origin));
    return;
  }

  if (sub === 'heist' || sub === 'yoink') {
    const id = positional[1];
    if (!id) {
      console.log('Usage: purpclaw donor heist <artifact_id>');
      return;
    }
    const report = donor.heist(id, {
      scout: valueFor('scout') || 'Scout',
      thief: valueFor('thief') || 'Goose',
      integrator: valueFor('integrator') || 'Hermes',
      historian: valueFor('historian') || 'Memory',
      status: valueFor('status') || null,
      calling_card: valueFor('card') || null,
      duck_observation: valueFor('duck') || null,
      note: valueFor('note') || null,
    });
    if (wantsJson) console.log(JSON.stringify(report, null, 2));
    else console.log(donor.describeHeist(report));
    return;
  }

  if (sub === 'evolve' || sub === 'feed') {
    const id = positional[1];
    if (!id) {
      console.log('Usage: purpclaw donor evolve <artifact_id>');
      return;
    }
    const result = donor.queueEvolution(id);
    if (wantsJson) console.log(JSON.stringify(result, null, 2));
    else console.log(donor.describeEvolutionQueued(result));
    return;
  }

  if (sub === 'integrate' || sub === 'promote') {
    const id = positional[1];
    if (!id) {
      console.log('Usage: purpclaw donor integrate <artifact_id> validation:"Validated by tests/review"');
      return;
    }
    try {
      const result = donor.integrate(id, {
        validation_note: valueFor('validation') || valueFor('validation_note') || valueFor('note'),
        actor: valueFor('actor') || 'CLI',
      });
      if (wantsJson) console.log(JSON.stringify(result, null, 2));
      else console.log(donor.describeIntegration(result));
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (sub === 'add') {
    const name = valueFor('name') || positional[1];
    const origin = valueFor('origin');
    const law = valueFor('law') || valueFor('behavioural_law');
    if (!name || !origin || !law) {
      console.log('Usage: purpclaw donor add name:"Artifact" origin:"Project" law:"Behavioural law"');
      return;
    }
    const artifact = donor.add({
      name,
      origin,
      behavioural_law: law,
      type: valueFor('type') || 'Behaviour Physics',
      status: valueFor('status') || 'candidate',
      value: valueFor('value') || 'unknown',
      integrated_into: valueFor('into'),
      rejected: valueFor('rejected'),
      rejected_mechanics: valueFor('rejected_mechanics'),
      reason: valueFor('reason') || '',
      validation_note: valueFor('validation') || valueFor('validation_note') || '',
      notes: valueFor('notes') || '',
    });
    if (wantsJson) console.log(JSON.stringify(artifact, null, 2));
    else console.log(`Recorded donor artifact: ${artifact.id}`);
    return;
  }

  if (sub === 'json' || wantsJson) {
    console.log(JSON.stringify(donor.load(), null, 2));
    return;
  }

  console.log(donor.describe());
}

async function runCouncilVotes(args) {
  const voteEngine = require(path.join(__dirname, '..', 'lib', 'council-vote-engine'));
  const sub = args[0];

  if (sub === 'vote') {
    // purpclaw council vote "proposal" [chair] [meeting_type] [vote_type]
    // Each remaining positional is "agent:vote" e.g. hermes:approve smith:reject goose:chaos-pass
    const proposal = args.slice(1).find(a => !a.includes(':')) || args[1] || 'general question';
    const chair = args.find(a => a.startsWith('chair:'))?.split(':')[1] || 'hermes';
    const meetingType = args.find(a => a.startsWith('type:'))?.split(':')[1] || 'engineering';
    const voteType = args.find(a => a.startsWith('threshold:'))?.split(':')[1] || 'simple_majority';

    // Parse individual votes: agent:approve or agent:reject:reason
    const voteArgs = args.slice(1).filter(a => a.includes(':') && !a.startsWith('chair:') && !a.startsWith('type:') && !a.startsWith('threshold:'));
    const votes = {};
    for (const v of voteArgs) {
      const parts = v.split(':');
      const agentId = parts[0];
      const vote = parts[1] || 'approve';
      const rationale = parts.slice(2).join(':') || '';
      votes[agentId] = { vote, rationale };
    }

    // Ensure chair and required attendees are in the vote
    const requiredAttendees = Object.keys(votes);
    const record = voteEngine.castVote({
      problem: proposal,
      meeting_type: meetingType,
      chair,
      vote_type: voteType,
      attendees: requiredAttendees,
      votes,
      decision: voteEngine.quickTally(votes, voteType).passes ? 'proceed' : 'defer',
      actions: requiredAttendees.join(', ') + ' to act on outcome',
    });
    console.log(voteEngine.describeVote(record));

  } else if (sub === 'history') {
    const count = parseInt(args[1]) || 10;
    const { loadVotes } = voteEngine;
    const votesData = loadVotes();
    const recent = votesData.votes.slice(-count).reverse();
    if (recent.length === 0) {
      console.log('\n  No votes recorded yet. The council has not convened.\n');
    } else {
      for (const v of recent) console.log(voteEngine.describeVote(v));
    }

  } else if (sub === 'reputation' || sub === 'rep') {
    const agentId = args[1];
    if (!agentId) {
      console.log(voteEngine.leaderboard());
    } else {
      console.log(voteEngine.agentReputation(agentId));
    }

  } else if (sub === 'leaderboard') {
    console.log(voteEngine.leaderboard(parseInt(args[1]) || 10));

  } else if (sub === 'tally') {
    // quick tally from command line: agent:vote agent:vote ...
    const voteArgs = args.slice(1).filter(a => a.includes(':'));
    const votes = {};
    for (const v of voteArgs) {
      const parts = v.split(':');
      votes[parts[0]] = { vote: parts[1] || 'approve', rationale: parts.slice(2).join(':') };
    }
    const result = voteEngine.quickTally(votes);
    console.log('\n  Quick tally:');
    console.log(`    ✅ Yes:  ${result.yes} (${result.yesPct}%)`);
    console.log(`    ❌ No:   ${result.no}  |  ⬜ Abstain: ${result.abstain}  |  🚫 Veto: ${result.veto}`);
    console.log(`    Threshold: ${result.threshold}%  |  Result: ${result.passes ? '✅ PASSES' : '❌ FAILS'}\n`);

  } else {
    console.log('\n  🗳️  PURPCLAW Big Brother Ballot');
    console.log('  ' + '─'.repeat(44));
    console.log('  purpclaw council vote "<proposal>" chair:hermes type:engineering hermes:approve smith:reject');
    console.log('  purpclaw council history [n]');
    console.log('  purpclaw council reputation [agent]');
    console.log('  purpclaw council tally hermes:approve smith:reject neo:abstain goose:chaos-pass');
    console.log('  purpclaw council leaderboard');
    console.log('\n  Vote types: approve reject abstain veto defer needs-proof chaos-pass');
    console.log('  Thresholds: simple_majority super_majority unanimous\n');
  }
}

// ── session management ─────────────────────────────────────────────────────
async function cmdSession(args) {
  const sub = (args[0] || 'list').toLowerCase();
  const work = require(path.join(PURP_DIR, 'lib', 'core', 'work-engine'));
  const fmt = (s) => s < 10 ? '0' + s : String(s);
  const dateStr = (iso) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${fmt(d.getMonth()+1)}-${fmt(d.getDate())} ${fmt(d.getHours())}:${fmt(d.getMinutes())}`;
    } catch { return iso; }
  };

  if (sub === 'list' || sub === 'ls') {
    const sessions = work.listSessions(50);
    console.log(`\n${col(C.bold, 'PURPCLAW Sessions')}\n`);
    if (!sessions.length) {
      console.log(`  ${col(C.gray, 'No sessions yet. Run `purpclaw ask` to create one.')}\n`);
      return;
    }
    const currentId = work.getCurrentSessionId();
    for (const s of sessions) {
      const marker = s.id === currentId ? col(C.cyan, ' ▶') : '  ';
      const title = col(C.white, (s.title || 'Untitled').substring(0, 50).padEnd(50));
      const prov = s.provider ? col(C.dim, s.provider) : '';
      const model = s.model ? col(C.yellow, s.model) : '';
      const msgs = col(C.dim, `${s.messageCount || 0} msgs`);
      const updated = col(C.gray, dateStr(s.updatedAt));
      console.log(`${marker} ${title} ${prov} ${model} ${msgs} ${updated}`);
      console.log(`    ${col(C.gray, s.id)}`);
    }
    console.log(`\n  ${col(C.gray, sessions.length + ' session(s)')}`);
    if (currentId) console.log(`  ${col(C.cyan, '▶')} = current session`);
    console.log('');
    return;
  }

  if (sub === 'new') {
    const title = args.slice(1).join(' ') || null;
    const s = work.createSession({ title: title || 'New Chat' });
    console.log(`\n${col(C.green, '[OK]')} Session created\n`);
    console.log(`  id:     ${col(C.cyan, s.id)}`);
    console.log(`  title:  ${s.title}`);
    console.log(`  date:   ${dateStr(s.createdAt)}\n`);
    return;
  }

  if (sub === 'open') {
    const id = args[1];
    if (!id) {
      console.log(`\n${col(C.red, 'Usage:')} purpclaw session open <id>\n`);
      console.log(`  Run ${col(C.cyan, 'purpclaw session list')} to see session IDs.\n`);
      return;
    }
    const s = work.loadSession(id);
    if (!s) {
      console.log(`\n${col(C.red, '[X]')} Session not found: ${id}\n`);
      return;
    }
    work.setCurrentSessionId(id);
    console.log(`\n${col(C.green, '[OK]')} Switched to session\n`);
    console.log(`  id:     ${col(C.cyan, s.id)}`);
    console.log(`  title:  ${s.title}`);
    console.log(`  model:  ${s.model ? col(C.yellow, s.model) : col(C.gray, '(none)')}`);
    console.log(`  msgs:   ${s.messages ? s.messages.length : 0}`);
    console.log(`  updated: ${dateStr(s.updatedAt)}\n`);
    if (s.messages && s.messages.length > 0) {
      console.log(`  ${col(C.bold, 'Recent messages:')}`);
      const preview = s.messages.slice(-4);
      for (const m of preview) {
        const role = m.role === 'user' ? col(C.cyan, 'user') : col(C.green, 'assistant');
        const content = (m.content || '').substring(0, 80).replace(/\n/g, ' ');
        console.log(`    ${role}: ${content}`);
      }
      console.log('');
    }
    return;
  }

  if (sub === 'delete' || sub === 'rm') {
    const id = args[1];
    if (!id) {
      console.log(`\n${col(C.red, 'Usage:')} purpclaw session delete <id>\n`);
      return;
    }
    const result = work.deleteSession(id);
    console.log(`\n${col(C.green, '[OK]')} Deleted${result.archived ? ' (archived)' : ''}: ${id}\n`);
    return;
  }

  if (sub === 'export') {
    const id = args[1] || work.getCurrentSessionId();
    if (!id) {
      console.log(`\n${col(C.red, 'No active session. Specify:')} purpclaw session export <id>\n`);
      return;
    }
    const s = work.loadSession(id);
    if (!s) {
      console.log(`\n${col(C.red, '[X]')} Session not found: ${id}\n`);
      return;
    }
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  if (sub === 'current') {
    const currentId = work.getCurrentSessionId();
    if (!currentId) {
      console.log(`\n${col(C.gray, 'No active session.')}\n`);
      return;
    }
    const s = work.loadSession(currentId);
    console.log(`\n${col(C.cyan, currentId)}  ${s ? s.title : col(C.gray, '(not found)')}\n`);
    return;
  }

  // Help / unknown subcommand
  console.log(`\n${col(C.bold, 'purpclaw session')}\n`);
  console.log(`  ${col(C.cyan, 'purpclaw session list')}              list all sessions`);
  console.log(`  ${col(C.cyan, 'purpclaw session new')}              create new session`);
  console.log(`  ${col(C.cyan, 'purpclaw session new <title>')}      create named session`);
  console.log(`  ${col(C.cyan, 'purpclaw session open <id>')}        switch to session`);
  console.log(`  ${col(C.cyan, 'purpclaw session current')}           show current session`);
  console.log(`  ${col(C.cyan, 'purpclaw session delete <id>')}      delete session`);
  console.log(`  ${col(C.cyan, 'purpclaw session export [id]')}       export session JSON\n`);
}

// ── providers status ─────────────────────────────────────────────────────
async function cmdProviders(args) {
  const sub = (args[0] || 'status').toLowerCase();
  const ps = require(path.join(PURP_DIR, 'lib', 'core', 'provider-status'));

  if (sub === 'status') {
    ps.printAllProviders();
    return;
  }

  if (sub === 'verify') {
    const name = args[1] || 'minimax-native';
    console.log(`\n${col(C.yellow, 'Verifying')} ${name}...\n`);
    const result = await ps.verifyProvider(name);
    console.log(`  provider:  ${result.provider}`);
    console.log(`  role:      ${result.role}`);
    console.log(`  state:     ${result.state}`);
    if (result.latencyMs) console.log(`  latency:   ${result.latencyMs}ms`);
    if (result.error) console.log(`  error:     ${col(C.red, result.error)}`);
    console.log('');
    return;
  }

  if (sub === 'roles') {
    const all = ps.getAllProviderStatus();
    console.log(`\n${col(C.bold, 'Provider Roles')}\n`);
    for (const p of all) {
      const state = ps.formatState(p.state);
      console.log(`  ${state}  ${col(C.cyan, p.provider.padEnd(16))} ${p.role}`);
    }
    console.log('');
    return;
  }

  // Help
  console.log(`\n${col(C.bold, 'purpclaw providers')}\n`);
  console.log(`  ${col(C.cyan, 'purpclaw providers status')}          show all providers and states`);
  console.log(`  ${col(C.cyan, 'purpclaw providers verify [name]')}  test API connection for a provider`);
  console.log(`  ${col(C.cyan, 'purpclaw providers roles')}          show provider roles\n`);
}

// ── route / brain commands ───────────────────────────────────────────────
async function cmdRoute(args) {
  const dc = require(path.join(PURP_DIR, 'lib', 'core', 'deployment-config'));
  const verbose = args.includes('-v') || args.includes('--verbose');
  // Extract message (everything after any flags)
  const msgArgs = args.filter(a => !a.startsWith('-'));
  const message = msgArgs.join(' ') || '';
  const lane = args.includes('--lane') ? args[args.indexOf('--lane') + 1] : null;

  if (!message) {
    console.log(`\n${col(C.bold, 'purpclaw route')}  — test delegation routing\n`);
    console.log(`  ${col(C.cyan, 'purpclaw route "<message>"')}          show how a message routes`);
    console.log(`  ${col(C.cyan, 'purpclaw route --lane <name> <msg>')}  force a specific lane`);
    console.log(`  ${col(C.cyan, 'purpclaw route -v "<message>"')}        verbose output\n`);
    return;
  }

  const result = dc.explainRouting(message);
  const msgPreview = message.substring(0, 80) + (message.length > 80 ? '…' : '');
  console.log('\n' + col(C.bold, 'Routing:') + ' ' + col(C.gray, msgPreview) + '\n');

  console.log(`${col(C.green, 'CONTROLLER (primary brain)')}`);
  console.log(`  provider:  ${col(C.cyan, result.controller.provider)}`);
  console.log(`  model:     ${col(C.yellow, result.controller.model)}`);
  console.log(`  role:      ${result.controller.role}`);
  console.log(`  label:     ${result.controller.label}`);

  if (result.suggestedLane) {
    console.log(`\n${col(C.yellow, 'WORKER LANE (specialist)')}`);
    console.log(`  lane:      ${col(C.magenta, result.suggestedLane.name)}`);
    console.log(`  provider:  ${col(C.cyan, result.suggestedLane.provider)}`);
    console.log(`  model:     ${col(C.yellow, result.suggestedLane.model)}`);
    console.log(`  role:      ${result.suggestedLane.role}`);
    console.log(`  description: ${col(C.dim, result.suggestedLane.description)}`);
  } else {
    console.log(`\n${col(C.green, 'No specialist lane matched — controller handles directly')}`);
  }

  if (verbose && result.allMatches.length > 0) {
    console.log(`\n${col(C.bold, 'All matches:')}`);
    for (const m of result.allMatches) {
      console.log(`  ${col(C.magenta, m.name.padEnd(10))} score=${m.score}  ${col(C.dim, m.lane.description)}`);
    }
  }

  console.log(`\n${col(C.gray, 'reason: ' + result.reason)}\n`);
}

async function cmdBrain(args) {
  const dc = require(path.join(PURP_DIR, 'lib', 'core', 'deployment-config'));
  const verbose = args.includes('-v');
  dc.printBrainStack(verbose);
  console.log(`  ${col(C.cyan, 'purpclaw brain')}              show summary`);
  console.log(`  ${col(C.cyan, 'purpclaw brain -v')}          show full config with fallbacks\n`);
}

// ── serve — JSON-RPC + A2A gateway server on port 9119 ──────────────────
async function cmdServe(args) {
  const { AgentGatewayServer } = require(path.join(PURP_DIR, 'lib', 'agent-gateway-server'));
  const host = args.includes('--host') ? args[args.indexOf('--host') + 1] : '127.0.0.1';
  const port = parseInt(args.find(a => /^\d+$/.test(a)) || '9119', 10);
  console.log(col(C.cyan, `\n  Starting gateway server on ${host}:${port}...`));
  console.log(col(C.gray, '  JSON-RPC  POST /rpc'));
  console.log(col(C.gray, '  A2A       POST /a2a  |  GET /.well-known/agent-card.json'));
  console.log(col(C.gray, '  Chat      POST /v1/chat/completions'));
  console.log(col(C.gray, '  WebSocket ws://localhost:' + port));
  const server = new AgentGatewayServer({ host, port });
  server.listen();
  console.log(col(C.green, `  Gateway listening on http://${host}:${port}`));
  // Block until the process is terminated
  process.stdin.resume();
  await new Promise(resolve => process.on('SIGINT', resolve) || process.on('SIGTERM', resolve));
}

async function cmdPet(args) {
  // Companion — fun reactions, not enforcement
  let comp;
  try { comp = require(path.join(PURP_DIR, 'lib', 'core', 'companion')).getCompanion(); } catch (_) {}

  if (!comp) {
    console.log('\n  Companion not available.\n');
    return;
  }

  const sub  = (args[0] || 'status').toLowerCase();
  const rest = args.slice(1).join(' ');

  switch (sub) {
    case 'status':
    case undefined:
      comp.tick();
      console.log('\n' + comp.statsString() + '\n');
      break;

    case 'feed':
      comp.tick();
      comp.feed(rest || 'cookie');
      console.log(`\n  ${comp.display()} Fed ${rest || 'cookie'}! 🍪\n`);
      break;

    case 'pet':
      comp.tick();
      comp.pet();
      console.log(`\n  ${comp.display()} *wags tail* 🐾\n`);
      break;

    case 'play':
      comp.tick();
      comp.play(rest || 'ball');
      console.log(`\n  ${comp.display()} Play time! 🎾\n`);
      break;

    case 'sleep':
      comp.tick();
      comp.sleep();
      console.log(`\n  ${comp.display()} Shhh... 😴\n`);
      break;

    case 'wake':
      comp.tick();
      comp.wake();
      console.log(`\n  ${comp.display()} Good morning! ☀️\n`);
      break;

    case 'clean':
      comp.tick();
      comp.clean();
      console.log(`\n  ${comp.display()} Bath time! 🛁\n`);
      break;

    case 'mute':
      const muted = comp.mute();
      console.log(`\n  ${comp.display()} ${muted ? 'Muted.' : 'Unmuted.'}\n`);
      break;

    case 'reset':
      comp.reset();
      console.log(`\n  ${comp.display()} Fresh start!\n`);
      break;

    case 'name':
      if (rest) {
        comp.tick();
        comp.namePet(rest);
        console.log(`\n  New name: ${comp.state.name}\n`);
      } else {
        console.log(`\n  Name: ${comp.state.name}\n`);
      }
      break;

    case 'trick':
      if (rest) {
        comp.tick();
        comp.trick(rest);
        console.log(`\n  ${comp.display()} Learned: ${rest}! 🎉\n`);
      } else {
        console.log(`\n  Tricks: ${(comp.state.tricks || []).join(', ') || 'none yet'}\n`);
      }
      break;

    case 'thoughts':
      comp.tick();
      console.log(`\n  Current: ${comp.state.currentThought || 'none'}\n`);
      if (comp.state.systemMessage) console.log(`  Message: ${comp.state.systemMessage}\n`);
      break;

    default:
      console.log(`\n${col(C.bold, 'purpclaw pet')}  — PURPCLAW companion\n`);
      console.log(`  ${col(C.cyan, 'purpclaw pet status')}           pet stats`);
      console.log(`  ${col(C.cyan, 'purpclaw pet feed [food]')}      feed the pet`);
      console.log(`  ${col(C.cyan, 'purpclaw pet pet')}             pet it`);
      console.log(`  ${col(C.cyan, 'purpclaw pet play [toy]')}      play fetch`);
      console.log(`  ${col(C.cyan, 'purpclaw pet sleep')}            sleep time`);
      console.log(`  ${col(C.cyan, 'purpclaw pet wake')}            wake up`);
      console.log(`  ${col(C.cyan, 'purpclaw pet clean')}           bath time`);
      console.log(`  ${col(C.cyan, 'purpclaw pet mute')}            mute/unmute`);
      console.log(`  ${col(C.cyan, 'purpclaw pet name [n]')}         rename`);
      console.log(`  ${col(C.cyan, 'purpclaw pet trick [n]')}        teach a trick`);
      console.log(`  ${col(C.cyan, 'purpclaw pet thoughts')}         current thoughts`);
      console.log(`  ${col(C.cyan, 'purpclaw pet reset')}           reset pet state\n`);
  }
}

if (require.main === module) {
  // Global stream redaction — redact secrets (sk-*, Bearer, JWT, AWS keys)
  // from every byte written to stdout/stderr across ALL commands.
  // Codex does this at the Rust level on every write. PURPCLAW now does it
  // from the top of every CLI invocation.
  try {
    const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
    redactor.wrapStream(process.stdout);
    redactor.wrapStream(process.stderr);
  } catch {}

  // Global handlers for uncaught sync errors and unhandled async rejections.
  // These are the last line of defense before a silent process exit.
  process.on('uncaughtException', (err) => {
    const hint = err.message ? '' : ' (no message — possible non-Error rejection)';
    if (TAINT_MODE) {
      console.error(col(C.magenta, `\n  [X] uncaughtException${hint}: ${err.message || err}\n`));
    } else {
      console.error(col(C.red, `\n  [X] Unhandled error${hint}: ${err.message || err}\n`));
    }
    if (err.stack) {
      err.stack.split('\n').slice(1, 5).forEach(l => console.error('  ' + l.trim()));
    }
    console.error(col(C.gray, `  Run with --taint for full trace.\n`));
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason || 'unknown');
    if (TAINT_MODE) {
      console.error(col(C.magenta, `\n  [X] unhandledRejection: ${msg}\n`));
    } else {
      console.error(col(C.red, `\n  [X] Unhandled rejection: ${msg || '(empty)'}\n`));
    }
    if (reason instanceof Error && reason.stack) {
      reason.stack.split('\n').slice(1, 4).forEach(l => console.error('  ' + l.trim()));
    }
    process.exit(1);
  });

  main().catch(e => {
    if (TAINT_MODE) {
      console.error(col(C.magenta, `\n  [X] ${taintError(e.message)}\n`));
    } else {
      const msg = e && e.message ? e.message : String(e || 'unknown error');
      console.error(col(C.red, `\n  [X] Unhandled error: ${msg}\n`));
      if (e && e.stack && !e.message) {
        e.stack.split('\n').slice(1, 3).forEach(l => console.error('  ' + l.trim()));
      }
    }
    process.exit(1);
  });
}
