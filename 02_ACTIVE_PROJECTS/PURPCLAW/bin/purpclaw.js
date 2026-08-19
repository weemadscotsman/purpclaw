#!/usr/bin/env node
/**
 * PURPCLAW CLI â€” bin/purpclaw.js
 * ================================
 * The front door. Run from anywhere after `npm link` or `npm install -g`.
 *
 * Usage:
 *   purpclaw start              â€” boot the full PM2 stack
 *   purpclaw stop               â€” stop everything
 *   purpclaw restart [service]  â€” restart all or one service
 *   purpclaw chat               â€” open NanoClaw REPL (swarm-aware)
 *   purpclaw ask "<question>"   â€” direct LLM conversation (stack-aware, session-persistent)
 *   purpclaw ask                â€” drop into LLM REPL mode
 *   purpclaw run "<task>"       â€” one-shot task, streams agent progress
 *   purpclaw code status        â€” repo/GitHub operator tools
 *   purpclaw status             â€” live dashboard of all services + agents
 *   purpclaw agents             â€” list agents, scores, and division info
 *   purpclaw workflows          â€” list active and recent workflows
 *   purpclaw queue              â€” show task queue depth and items
 *   purpclaw memory [query]     â€” query the memory matrix
 *   purpclaw parity [--json]    â€” 6-tile capability dashboard (live/partial/gap)
 *   purpclaw dream              â€” trigger AutoDream consolidation manually
 *   purpclaw forge [name]       â€” draw a gacha soul + create a new lobster agent
 *   purpclaw skill-forge ...    â€” self-improving skills (attach/record/evaluate)
 *   purpclaw cross-review ...   â€” run the cross-provider review gate (check/pick/run)
 *   purpclaw soul-memory ...    â€” view/validate USER.md + MEMORY.md contracts
 *   purpclaw constitution ...   â€” validate the canonical law chain
 *   purpclaw logs [service]     â€” tail PM2 logs
 *   purpclaw help               â€” show this help
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const https = require('https');
const { spawn: rawSpawn, execSync } = require('child_process');
const readline = require('readline');
const { trackedSpawn, execSafe, installCleanup, list: listChildren } = require('../lib/child-registry');

// â”€â”€ Root and config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PURP_DIR      = path.resolve(__dirname, '..');

// Lightweight .env loader â€” populates process.env without adding a dependency.
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

// â”€â”€ ANSI colours (no deps) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ TAINT MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Spinner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Rotating flavor text â€” goose-approved
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
    this._frames  = ['â ‹','â ™','â ¹','â ¸','â ¼','â ´','â ¦','â §','â ‡','â '];
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

  succeed(msg) { return this._stop(col(C.green, 'âœ”'), msg); }
  fail(msg)    { return this._stop(col(C.red,   'âœ–'), msg); }
  warn(msg)    { return this._stop(col(C.yellow,'âš '), msg); }
  info(msg)    { return this._stop(col(C.cyan,  'â„¹'), msg); }

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

// â”€â”€ Tiny HTTP helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // Any non-null response means the port answered â€” covers JSON health objects AND
    // plain-HTML pages (e.g. Next.js UI at /) whose parse falls back to a string.
    if (r === null || r === undefined) return false;
    if (typeof r === 'object') return true; // JSON health payload
    if (typeof r === 'string') return r.length > 0; // HTML / text response
    return false;
  } catch {
    return false;
  }
}

// â”€â”€ SSE stream consumer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ PM2 wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Division colour map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Print helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function banner() {
  const W = isTTY ? (process.stdout.columns || 80) : 80;
  const inner = W - 2; // inside the border

  // box helpers (no deps)
  const bTop = col(C.magenta, 'â•”' + 'â•'.repeat(inner) + 'â•—');
  const bBot = col(C.magenta, 'â•š' + 'â•'.repeat(inner) + 'â•');
  const bMid = col(C.magenta, 'â• ' + 'â•'.repeat(inner) + 'â•£');
  const bRow = (content) => {
    const raw = content.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, inner - raw.length);
    return col(C.magenta, 'â•‘') + content + ' '.repeat(pad) + col(C.magenta, 'â•‘');
  };

  const ART = [
    '  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ•—   â–ˆâ–ˆâ•—â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â–ˆâ–ˆâ•—      â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ•—    â–ˆâ–ˆâ•—',
    '  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â•â•â•â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘    â–ˆâ–ˆâ•‘',
    '  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘ â–ˆâ•— â–ˆâ–ˆâ•‘',
    '  â–ˆâ–ˆâ•”â•â•â•â• â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â•â• â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘â–ˆâ–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘',
    '  â–ˆâ–ˆâ•‘     â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘  â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘     â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘  â–ˆâ–ˆâ•‘â•šâ–ˆâ–ˆâ–ˆâ•”â–ˆâ–ˆâ–ˆâ•”â•',
    '  â•šâ•â•      â•šâ•â•â•â•â•â• â•šâ•â•  â•šâ•â•â•šâ•â•      â•šâ•â•â•â•â•â•â•šâ•â•â•â•â•â•â•â•šâ•â•  â•šâ•â• â•šâ•â•â•â•šâ•â•â•',
  ];

  const now = new Date();
  const ts  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}  ${now.toLocaleTimeString('en-GB')}`;
  const tagline  = '  ðŸ¦ž  PURPCLAW  â€”  TINY HAUNTED WORKSHOP  ðŸ¦ž';
  const subtitle = `  Agent Orchestration Runtime  Â·  ${ts}`;

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
  console.log(`\n${col(C.cyan + C.bold, title)}  ${col(C.gray, 'â”€'.repeat(fill))}`);
}

function tick(ok) { return ok ? col(C.green, 'â—') : col(C.red, 'â—‹'); }

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  COMMANDS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Boot helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BOOT_SPIN    = ['â ‹','â ™','â ¹','â ¸','â ¼','â ´','â ¦','â §','â ‡','â '];
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
    return `  ${col(C.green, 'âœ”')}  ${col(C.white, name)}  ${col(C.gray, portStr)}   ${col(C.green, 'online')}   ${timing}`;
  }
  if (row.state === 'timeout') {
    return `  ${col(C.red,  'âœ–')}  ${col(C.red,   name)}  ${col(C.gray, portStr)}   ${col(C.red,   'timeout')}`;
  }
  const elapsed   = Date.now() - row.startedAt;
  const stateMsg  = elapsed > 10000 ? col(C.yellow, 'slow start') : col(C.gray, 'initialising');
  const frame     = col(C.cyan, BOOT_SPIN[spinIdx % BOOT_SPIN.length]);
  return `  ${frame}  ${col(C.gray, name)}  ${col(C.gray, portStr)}   ${stateMsg}`;
}

// â”€â”€ start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdStart(args) {
  banner();
  const target = resolveLaunchTarget(args);
  const names  = target.names;

  if (!fs.existsSync(ECOSYSTEM)) {
    console.error(col(C.red, `  âœ— ecosystem.config.js not found`));
    process.exit(1);
  }
  if (!names.length) {
    console.error(col(C.red, `  âœ— No services in profile "${target.label}"`));
    process.exit(1);
  }

  if (target.dryRun) {
    console.log(col(C.yellow, '  DRY RUN â€” no processes will start\n'));
    printPm2Plan('start', names);
    console.log('');
    return;
  }

  // Header
  const profileLabel = target.label.toUpperCase();
  console.log(
    `  ${col(C.magenta + C.bold, 'LAUNCHING')}  ${col(C.gray, 'Â·')}  ` +
    `${col(C.white + C.bold, profileLabel)}  ${col(C.gray, 'Â·')}  ` +
    `${col(C.cyan, names.length + ' services')}\n`
  );
  console.log(col(C.gray, '  ' + 'â”€'.repeat(60)) + '\n');

  // Fire PM2 silently (use basename â€” cwd is PURP_DIR, avoids path-with-spaces issues on Windows)
  try {
    await pm2(['start', 'ecosystem.config.js', '--only', names.join(',')], { silent: true });
  } catch (e) {
    console.error(col(C.red, `  âœ— PM2 failed: ${e.message}`));
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

  // Animate at 100ms â€” rewrite the table in place
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

  // â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const online     = rows.filter(r => r.state === 'online');
  const failed     = rows.filter(r => r.state !== 'online');
  const coreFailed = failed.filter(r => r.required);
  const totalSec   = ((Date.now() - launchAt) / 1000).toFixed(1);

  console.log('');
  if (coreFailed.length === 0) {
    if (TAINT_MODE) {
      console.log(`  ${col(C.magenta + C.bold, 'âœ”  PURPCLAW IS THROBBING ONLINE')}  ${col(C.gray, 'Â·')}  ${col(C.green, online.length + '/' + rows.length + ' services')}  ${col(C.gray, 'Â·')}  ${col(C.gray, totalSec + 's')}`);
      console.log(`  ${col(C.gray, taintSuccess('all services online'))}`);
    } else {
      console.log(
        `  ${col(C.green + C.bold, 'âœ”  PURPCLAW ONLINE')}  ` +
        `${col(C.gray, 'Â·')}  ${col(C.green, online.length + '/' + rows.length + ' services')}  ` +
        `${col(C.gray, 'Â·')}  ${col(C.gray, totalSec + 's')}`
      );
    }
  } else {
    if (TAINT_MODE) {
      console.log(`  ${col(C.yellow + C.bold, 'âš   uh oh bestie')}  ${col(C.gray, 'Â·')}  ${col(C.green, online.length + '/' + rows.length)}  ${col(C.red, coreFailed.length + ' services did a fucky wucky')}`);
    } else {
      console.log(
        `  ${col(C.yellow + C.bold, 'âš   PARTIAL START')}  ` +
        `${col(C.gray, 'Â·')}  ${col(C.green, online.length + '/' + rows.length)}  ` +
        `${col(C.red, coreFailed.length + ' required service(s) failed')}`
      );
    }
  }
  console.log('');

  if (online.some(r => r.pm2 === 'purpclaw-nextjs')) {
    console.log(`  ${col(C.gray, 'Mission Control')}  ${col(C.gray, 'â†’')}  ${col(C.cyan + C.bold, 'http://localhost:3000')}`);
  }
  console.log(`  ${col(C.gray, 'API Gateway    ')}  ${col(C.gray, 'â†’')}  ${col(C.cyan, 'http://localhost:7780')}`);
  console.log(`  ${col(C.gray, 'Agent Tower    ')}  ${col(C.gray, 'â†’')}  ${col(C.cyan, 'http://localhost:7790')}`);
  console.log('');

  if (coreFailed.length > 0) {
    console.log(col(C.yellow, TAINT_MODE ? '  the following services need a hug: ' + coreFailed.map(r => r.display).join(', ') : '  Failed: ' + coreFailed.map(r => r.display).join(', ')));
    console.log(col(C.gray,   TAINT_MODE ? '  try: purpclaw doctor (gently)\n' : '  Run `purpclaw doctor` to diagnose.\n'));
  } else {
    console.log(col(C.gray, '  purpclaw status        â†’  live metrics + agent leaderboard'));
    console.log(col(C.gray, '  purpclaw run "<task>"  â†’  dispatch an agent task\n'));
  }
}

// â”€â”€ stop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdStop(args) {
  const target = resolveLaunchTarget(args);
  const names  = target.names;

  if (!names.length) {
    console.error(col(C.red, `\n  âœ— No services in profile "${target.label}"\n`));
    process.exit(1);
  }

  if (target.dryRun) {
    console.log(col(C.yellow, '  DRY RUN â€” no processes will stop\n'));
    printPm2Plan('stop', names);
    console.log('');
    return;
  }

  console.log(`\n  ${col(C.yellow + C.bold, 'SHUTTING DOWN')}  ${col(C.gray, 'Â·')}  ${col(C.white, target.label.toUpperCase())}  ${col(C.gray, 'Â·')}  ${col(C.cyan, names.length + ' services')}\n`);
  console.log(col(C.gray, '  ' + 'â”€'.repeat(60)) + '\n');

  // Show what's being stopped
  const svcMap = new Map(SERVICE_REGISTRY.getServices().map(s => [s.pm2, s]));
  names.forEach(n => {
    const disp = bootDisplayName(n).padEnd(14);
    const reg  = svcMap.get(n) || {};
    const port = reg.port ? col(C.gray, `:${reg.port}`) : '';
    console.log(`  ${col(C.yellow, 'â—‹')}  ${col(C.gray, disp)}  ${port}`);
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

// â”€â”€ restart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdRestart(args) {
  const service = args.find(a => !a.startsWith('--'));
  if (service) {
    console.log(col(C.cyan, `\n  Restarting ${service}...\n`));
    try {
      await pm2(['restart', service]);
      console.log(col(C.green, '  âœ“ Done.\n'));
    } catch (e) {
      console.error(col(C.red, `  âœ— ${e.message}`));
      process.exit(1);
    }
    return;
  }

  const target = resolveLaunchTarget(args);
  const names = target.names;

  if (!names.length) {
    console.error(col(C.red, `\n  âœ— No PM2 services found for ${target.label}\n`));
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
    console.log(col(C.green, `  âœ“ Restarted ${names.length} service${names.length === 1 ? '' : 's'}.\n`));
  } catch (e) {
    console.error(col(C.red, `  âœ— ${e.message}`));
    process.exit(1);
  }
}

// â”€â”€ parity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2026-08-17: rewrote from legacy/reintegrate-2026-08-17/purpconsole into
// services/console/. Plain-text fallback always works; the Textual TUI
// (services/console/app.py) is loaded if `textual` is installed.
async function cmdParity(args) {
  const wantJson = (args || []).includes('--json');
  const wantById = (args || []).find(a => a.startsWith('--by-id'));
  const subArgs = [];
  if (wantJson) subArgs.push('--json');
  if (wantById) {
    subArgs.push('--by-id', wantById.split('=')[1] || (args || [])[(args || []).indexOf('--by-id') + 1]);
  }
  const pyArgs = ['-m', 'services.console', ...(subArgs.length ? subArgs : ['--text'])];
  const { spawnSync } = require('child_process');
  const result = spawnSync('python', pyArgs, { cwd: PURP_DIR, stdio: 'inherit' });
  if (result.error) {
    console.error(`[parity] failed to spawn python: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status || 0);
}

// â”€â”€ /plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2026-08-17: parity with Claude Code /plan and Antigravity plan mode.
// Takes a one-line goal, returns a structured plan. No LLM call yet —
// the plan is a deterministic scaffolding: probe for relevant skills/agents,
// then suggest a sequence. Future: wire to the cognitive spine for
// LLM-generated plans.
async function cmdPlan(args) {
  const goal = args.join(' ').trim();
  banner();
  if (!goal) {
    console.log(col(C.yellow, '\n  /plan needs a goal. e.g. /plan add MCP client to the parity surface\n'));
    process.exit(2);
  }
  sectionHead('  /plan — STRUCTURED PLAN');
  console.log('');
  console.log(`  ${col(C.cyan, 'goal')}      ${goal}`);
  console.log(`  ${col(C.cyan, 'session')}   ${process.pid} @ ${new Date().toISOString()}`);
  console.log('');

  // 1. Probe the agent registry for relevant personas
  let personas = [];
  try {
    const reg = require(path.join(PURP_DIR, 'packages', 'core', 'runtime', 'agent-registry'));
    personas = reg.listAgents().filter(a => a.name).slice(0, 6);
  } catch (e) {
    // registry not reachable — that's fine, the plan is still useful
  }
  if (personas.length) {
    console.log(`  ${col(C.bold, 'available personas (first 6):')}`);
    for (const p of personas) {
      const tag = `${p.division || '-'} / ${p.role || '-'}`;
      console.log(`    ${col(C.green, '\u2022')} ${p.name.padEnd(28)} ${col(C.gray, tag)}`);
    }
    console.log('');
  }

  // 2. Probe the parity dashboard for relevant capability status
  console.log(`  ${col(C.bold, 'parity snapshot:')}`);
  try {
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', [path.join(PURP_DIR, 'bin', 'purpclaw.js'), 'parity', '--json'],
      { cwd: PURP_DIR, encoding: 'utf8', timeout: 10000 });
    if (r.status === 0 && r.stdout) {
      const data = JSON.parse(r.stdout);
      console.log(`    ${col(C.green, '\u25CF')} live:     ${data.counts.live}`);
      console.log(`    ${col(C.yellow, '\u25CF')} partial:  ${data.counts.partial}`);
      console.log(`    ${col(C.red, '\u25CF')} gap:      ${data.counts.gap}`);
    }
  } catch (e) { /* parity not available, skip */ }
  console.log('');

  // 3. Suggested plan structure (deterministic scaffolding)
  console.log(`  ${col(C.bold, 'suggested plan structure:')}`);
  const steps = [
    `1. ${col(C.cyan, 'Inspect')} existing systems for "${goal}" \u2014 use the wrap-don't-rebuild rule`,
    `2. ${col(C.cyan, 'Wire')}  the smallest cert that proves the lane end-to-end`,
    `3. ${col(C.cyan, 'Cert')}  at agent_work/cert_gates/ (CONTRACT + verify script)`,
    `4. ${col(C.cyan, 'Voice')}  a one-note update to Eddie on Telegram when green`,
  ];
  for (const s of steps) console.log(`    ${s}`);
  console.log('');
  console.log(`  ${col(C.gray, 'to execute, run:')}  purpclaw run "${goal}"`);
  console.log('');
  return 0;
}

// â”€â”€ /clear â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2026-08-17: parity with Claude Code /clear. Clears transient session state
// (in-memory queues, history caches, scratch JSONL). Does NOT touch durable
// state (memory, skills, agent registry).
async function cmdClear(args) {
  banner();
  const what = args.includes('--all') ? 'all' : 'session';
  sectionHead('  /clear — RESET ' + what.toUpperCase() + ' STATE');
  console.log('');

  const cleared = [];
  const skipped = [];

  // 1. Clear the JSONL journals in .purpclaw/ (transient session logs only)
  const journalsDir = path.join(PURP_DIR, 'agent_work');
  if (fs.existsSync(journalsDir)) {
    for (const f of fs.readdirSync(journalsDir)) {
      if (f.endsWith('.jsonl') || f.endsWith('.json')) {
        // Match transient session-state files, leave durable artifacts alone
        if (/_journal|_log|state/i.test(f) && !/memory|skill|registry|agent|ledger|receipt/i.test(f)) {
          try {
            const full = path.join(journalsDir, f);
            fs.unlinkSync(full);
            cleared.push(f);
          } catch (e) { skipped.push(`${f}: ${e.message}`); }
        }
      }
    }
  }

  // 2. Clear .next build cache (regenerable)
  const nextDir = path.join(PURP_DIR, 'apps', 'desktop', '.next');
  if (fs.existsSync(nextDir)) {
    try {
      fs.rmSync(nextDir, { recursive: true, force: true });
      cleared.push('apps/desktop/.next');
    } catch (e) { skipped.push(`.next: ${e.message}`); }
  }

  // 3. Note durable state preserved
  const preserved = [
    'agent_work/agents/         (39 personas — durable)',
    'agent_work/architecture/   (canonical docs — durable)',
    'agent_work/cert_gates/     (cert results — durable)',
    'packages/                  (source code — durable)',
  ];

  console.log(`  ${col(C.green, '\u2713')} cleared ${cleared.length} transient file(s):`);
  for (const f of cleared.slice(0, 10)) console.log(`    \u2022 ${f}`);
  if (cleared.length > 10) console.log(`    \u2022 \u2026 and ${cleared.length - 10} more`);
  console.log('');
  console.log(`  ${col(C.cyan, '\u2630')} preserved (durable):`);
  for (const p of preserved) console.log(`    \u2022 ${p}`);
  if (skipped.length) {
    console.log('');
    console.log(`  ${col(C.yellow, '\u26A0')}  ${skipped.length} skipped:`);
    for (const s of skipped.slice(0, 5)) console.log(`    \u2022 ${s}`);
  }
  console.log('');
  console.log(`  ${col(C.gray, 'next:')}  run \`purpclaw status\` to confirm clean state.`);
  console.log('');
  return 0;
}

// â”€â”€ /compact â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2026-08-17: parity with Claude Code /compact. Compresses agent_work/ JSONL
// journals by removing completed entries older than 7 days. Does NOT touch
// memory, skills, agent personas, cert results, or receipts.
async function cmdCompact(args) {
  banner();
  const days = (() => {
    const m = args.find(a => a.startsWith('--days='));
    return m ? parseInt(m.split('=')[1], 10) : 7;
  })();
  sectionHead(`  /compact — PRUNE >${days}d OLD FROM JSONL JOURNALS`);
  console.log('');

  const journalsDir = path.join(PURP_DIR, 'agent_work');
  if (!fs.existsSync(journalsDir)) {
    console.log(`  ${col(C.yellow, '\u26A0')} no agent_work/ directory; nothing to compact.`);
    return 0;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const reports = [];

  for (const f of fs.readdirSync(journalsDir)) {
    if (!f.endsWith('.jsonl')) continue;
    // Skip durable categories (memory, skill, registry, agent, ledger, receipt)
    if (/memory|skill|registry|agent|ledger|receipt|audio_walker|harness_lessons/i.test(f)) continue;
    const full = path.join(journalsDir, f);
    let before = 0, after = 0;
    let kept = '';
    try {
      const content = fs.readFileSync(full, 'utf8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        before++;
        let entry;
        try { entry = JSON.parse(line); } catch { kept += line + '\n'; continue; }
        const ts = Date.parse(entry.ts || entry.timestamp || entry.date || '');
        if (Number.isFinite(ts) && ts < cutoff) continue; // prune
        kept += line + '\n';
        after++;
      }
      fs.writeFileSync(full, kept, 'utf8');
      reports.push({ file: f, before, after, pruned: before - after });
    } catch (e) {
      reports.push({ file: f, error: e.message });
    }
  }

  if (!reports.length) {
    console.log(`  ${col(C.gray, '(no eligible JSONL journals)')}`);
  } else {
    let totalBefore = 0, totalAfter = 0;
    for (const r of reports) {
      if (r.error) {
        console.log(`  ${col(C.yellow, '\u26A0')}  ${r.file}: ${r.error}`);
      } else {
        totalBefore += r.before;
        totalAfter  += r.after;
        const pct = r.before > 0 ? Math.round(100 * r.pruned / r.before) : 0;
        console.log(`  ${col(C.green, '\u2713')} ${r.file.padEnd(36)} ${String(r.before).padStart(5)} \u2192 ${String(r.after).padStart(5)}  (${pct}% pruned)`);
      }
    }
    console.log('');
    console.log(`  ${col(C.bold, 'total:')} ${totalBefore} \u2192 ${totalAfter} (${totalBefore - totalAfter} pruned)`);
  }
  console.log('');
  console.log(`  ${col(C.gray, 'preserved (durable):')} memory, skills, personas, cert results, receipts.`);
  console.log('');
  return 0;
}

// â”€â”€ status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      console.log(`  ${tick(true)}  ${col(C.green, s.name).padEnd(34)}${col(C.gray, ':' + s.port)}  ${col(C.gray, 'Â· ' + s.group)}`);
    }
  }

  // Orchestrator metrics
  try {
    const metrics = await httpGet(PORTS.orchestrator, '/api/status', 3000);
    sectionHead('  ORCHESTRATOR METRICS');
    console.log(`  Total tasks    : ${col(C.cyan,   String(metrics.session?.totalTasks     ?? metrics.totalTasks     ?? 'â€”'))}`);
    console.log(`  Completed      : ${col(C.green,  String(metrics.session?.completedTasks ?? metrics.completedTasks ?? 'â€”'))}`);
    console.log(`  Failed         : ${col(C.red,    String(metrics.session?.failedTasks    ?? metrics.failedTasks    ?? 'â€”'))}`);
    console.log(`  Avg resp time  : ${col(C.yellow, String(metrics.metrics?.avgResponseTime ?? metrics.avgResponseTime ?? 'â€”'))}ms`);
    console.log(`  Active wf      : ${col(C.cyan,   String(metrics.active ?? metrics.activeWorkflows ?? 'â€”'))}`);
    console.log(`  Queue depth    : ${col(C.yellow, String(metrics.queue  ?? metrics.queueDepth      ?? 'â€”'))}`);
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
        console.log(`  ${col(statusColour, 'â–¶')}  ${col(C.bold, wf.workflowId || wf.id || 'â€”')} ${col(C.gray, 'â€”')} ${wf.command?.substring(0, 55) ?? 'â€”'}`);
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
          const bar   = 'â–ˆ'.repeat(Math.round((s.successRate ?? 0) / 10)).padEnd(10, 'â–‘');
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
        console.log(`  ${col(C.yellow, 'âš¡ Circuit breakers open:')} ${open.map(([n]) => n).join(', ')}`);
      } else {
        console.log(`  Circuit breakers: ${col(C.green, 'all closed')}`);
      }
    }
  } catch { /* tower offline */ }

  // Memory matrix
  try {
    const mem = await httpGet(PORTS.memory, '/health', 2000);
    sectionHead('  MEMORY MATRIX');
    console.log(`  ${tick(true)}  ${col(C.green, 'memory_matrix_v2')} ${col(C.gray, ':' + PORTS.memory + ' â€” online')}`);
    if (mem.memories !== undefined) console.log(`  Stored memories : ${col(C.cyan, String(mem.memories))}`);
    if (mem.symbols  !== undefined) console.log(`  Lifted symbols  : ${col(C.cyan, String(mem.symbols))}`);
  } catch {
    sectionHead('  MEMORY MATRIX');
    console.log(`  ${tick(false)}  ${col(C.red, 'memory_matrix_v2')} ${col(C.gray, ':' + PORTS.memory + ' â€” offline')}`);
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

  // â”€â”€ Knowledge Pool â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
console.log(`  ${col(C.green, 'âœ”')}  Pool service online`);
    }

    // â”€â”€ Context Bus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const ctx = await ctxGet('/context/stats');
    if (ctx) {
      sectionHead('  CONTEXT BUS');
      console.log(`  Active agents  : ${col(C.green, String(ctx.activeAgents))}`);
      console.log(`  Workflows      : ${col(C.cyan, String(ctx.totalWorkflows))}`);
      console.log(`  Locks held     : ${col(C.cyan, String(ctx.activeLocks))}`);
      console.log(`  Agents spawned : ${col(C.gray, String(ctx.stats.totalAgentsSpawned))}`);
    } else {
      sectionHead('  CONTEXT BUS');
      console.log(col(C.red, '  âœ— offline'));
    }
  } catch {
    sectionHead('  KNOWLEDGE POOL');
    console.log(`  ${tick(false)}  ${col(C.red, 'pool service offline')}  ${col(C.gray, ':7885')}`);
    console.log(col(C.gray, '  Boot: purpclaw pool reindex or pm2 start --only purpclaw-pool'));
  }

  // â”€â”€ Queue snapshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Companion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    const mochiLib = require(path.join(PURP_DIR, 'lib', 'mochi'));
    const m = mochiLib.loadMochi();
    const sprites = require(path.join(PURP_DIR, 'lib', 'mochi-sprites'));
    sectionHead('  COMPANION');
    const spriteLines = sprites.renderSprite(m, Math.floor(Date.now() / 800) % sprites.frameCount(m.species));
    const face   = sprites.renderFace(m);
    const rarity = m.rarity || 'common';
    const shiny  = m.shiny ? col(C.yellow, ' âœ¨') : '';
    const mood   = m.mood || 'curious';
    const interacts = m.interactions || 0;
    // Stat mini-bars from pool (already fetched above if pool is up)
    let statLine = '';
    if (poolRes) {
      const failures = poolRes.failures ?? 0;
      const food = Math.max(0, Math.min(10, 10 - failures));
      const joy  = Math.min(10, Math.floor(interacts / 2) + (poolRes.memories ?? 0));
      const bar  = (n) => 'â–ˆ'.repeat(Math.min(n, 10)).padEnd(10, 'â–‘');
      statLine = `\n  FOOD ${col(C.green,  bar(food))}  JOY ${col(C.magenta, bar(joy))}`;
    }
    // Print sprite side-by-side with info
    const info = [
      `${col(C.magenta + C.bold, m.name)}${shiny}  ${col(C.gray, 'Â·')}  ${col(C.cyan, m.species)}`,
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


// â”€â”€ health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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



// â”€â”€ audit deep â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdAudit(args) {
  const { runFast, runFull } = require('../lib/deep-audit');
  const isFast = args.includes('--fast') || args.includes('-f');
  const result = isFast ? await runFast() : await runFull();
  process.exit(result.fail > 0 ? 1 : 0);
}


// â”€â”€ embeddings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Hosted vector embeddings via NVIDIA NIM (bge-m3, 1024-dim, free).
async function cmdEmbeddings(args) {
  const emb = require('../lib/embeddings');
  const sub = args[0] || 'health';

  if (sub === 'health') {
    const h = await emb.health();
    if (h.ok) {
      console.log(`\n  âœ“ Embeddings healthy`);
      console.log(`    Model:    ${h.model}`);
      console.log(`    Dim:      ${h.dim}`);
      console.log(`    Endpoint: ${h.baseUrl}\n`);
    } else {
      console.log(`\n  âœ— Embeddings unavailable: ${h.reason}\n`);
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
      console.log(`\n  âœ— ${e.message}\n`);
      process.exit(1);
    }
    return;
  }

  console.log('\n  purpclaw embeddings health    check bge-m3 connectivity');
  console.log('  purpclaw embeddings embed <text>   embed text to 1024-dim vector\n');
}


// â”€â”€ whoami â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    console.log(`${self.name} v${self.version} â€” ${self.tagline}.`);
    console.log(`  ${self.surfaces.cli.command}  Â·  ${self.motto}`);
  } else {
    console.log(formatText(self));
  }
}


// â”€â”€ release â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   purpclaw release keygen     â€” generate Ed25519 keypair
//   purpclaw release sign <m>   â€” sign a manifest
//   purpclaw release verify <m> â€” verify a manifest signature
async function cmdRelease(args) {
  const C = { cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', white: '\x1b[97m', bold: '\x1b[1m', magenta: '\x1b[35m' };
  const col = (c, s) => s;
  const sub = (args[0] || 'status').toLowerCase();
  const rest = args.slice(1);
  const rs = require('../lib/release-sign');

  if (sub === 'keygen') {
    const kp = rs.generateAndStoreKeypair();
    const pubB64 = kp.publicKeyDer.toString('base64');
    console.log(`\n  ${col(C.green, 'âœ“')} Ed25519 keypair generated`);
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
    console.log(`\n  ${col(C.green, 'âœ“')} Signed ${manifestPath}`);
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
      console.log(`\n  ${col(C.red, 'âœ—')} No signature in manifest\n`);
      return;
    }
    // Strip signature and embedded publicKey before verifying so we get a
    // true test of the stored key against the manifest body.
    const toVerify = { ...manifest };
    delete toVerify.signature;
    delete toVerify.publicKey;
    if (rs.verifyManifest(toVerify, sig)) {
      console.log(`\n  ${col(C.green, 'âœ“')} Valid signature\n`);
    } else {
      // Show more detail
      const kp = rs.loadKeypair();
      if (!kp) {
        console.log(`\n  ${col(C.red, 'âœ—')} No keypair found â€” run ${col(C.cyan, 'purpclaw release keygen')} first\n`);
      } else {
        console.log(`\n  ${col(C.red, 'âœ—')} Invalid signature (stored key does not match signing key)\n`);
      }
    }
    return;
  }

  // Show key status
  const kp = rs.loadKeypair();
  console.log(`\n  ${col(C.cyan, 'ðŸ” RELEASE SIGNING')}\n`);
  if (kp) {
    console.log(`  ${col(C.green, 'âœ“')} Keypair present`);
    console.log(`  ${col(C.gray, '  Private:')} ${rs.KEYS_DIR}\\private.pem`);
    console.log(`  ${col(C.gray, '  Public:')}  ${rs.KEYS_DIR}\\public.pem`);
  } else {
    console.log(`  ${col(C.yellow, 'âš ')} No keypair found â€” run ${col(C.cyan, 'purpclaw release keygen')}\n`);
  }
  console.log(`  ${col(C.cyan, 'purpclaw release keygen')}          generate Ed25519 keypair`);
  console.log(`  ${col(C.cyan, 'purpclaw release sign <file>')}     sign a manifest`);
  console.log(`  ${col(C.cyan, 'purpclaw release verify <file>')}   verify a manifest signature`);
  console.log('');
}


// â”€â”€ resume â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Resume a previous session from agent_work/sessions/
async function cmdResume(args) {
  const SESSIONS_DIR = path.join(PURP_DIR, 'agent_work', 'sessions');
  const sub = (args[0] || '').toLowerCase();

  // â”€â”€ resume list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      const ln  = (s.lastLine || 'â€”').slice(0, 60);
      console.log(`  ${col(C.cyan, s.id.padEnd(16))} ${col(C.gray, ts)}  ${col(C.white, ln)}`);
    }
    console.log(col(C.gray, `\n  ${sessions.length} session(s) stored.\n`));
    console.log(col(C.gray, '  purpclaw resume <session-id>  â€” reload a session'));
    console.log(col(C.gray, '  purpclaw resume latest        â€” reload most recent\n'));
    return;
  }

  // â”€â”€ resume <id> or latest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  sectionHead('  SESSION RESUME â€” ' + targetId);
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
// â”€â”€ bg â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fire-and-forget background task dispatch
async function cmdBg(args) {
  const task = args.join(' ').trim();
  if (!task) {
    banner();
    sectionHead('  BACKGROUND TASKS');
    console.log(col(C.gray, '  purpclaw bg "<task>"  â€” dispatch and forget\n'));
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
    console.log(col(C.gray, '  purpclaw bg "<build me a landing page>"  â€” fires and returns immediately'));
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
  console.log(`  ${col(C.green, 'âœ”')}  Job ID : ${col(C.cyan, jobId)}`);
  console.log(`  ${col(C.green, 'âœ”')}  Log   : ${col(C.gray, LOG_FILE)}`);
  console.log(`  ${col(C.green, 'âœ”')}  Task  : ${col(C.white, task)}`);
  console.log(col(C.gray, '\n  Results appear in agent_work/bg-sessions/'));
  console.log(col(C.gray, `  Watch:  tail -f "${LOG_FILE}"`));
  console.log(col(C.gray, `  Status: purpclaw bg`));
  console.log('');
}
// â”€â”€ registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Local git-backed registry of installable skills and agents
// registry/ index.json is the source of truth â€” publish = open a PR on it
async function cmdRegistry(args) {
  const REGISTRY_DIR = path.join(PURP_DIR, 'registry');
  const LOCAL_SKILLS = path.join(PURP_DIR, 'skills');
  const LOCAL_AGENTS = path.join(PURP_DIR, 'agents');
  const INDEX_FILE   = path.join(REGISTRY_DIR, 'index.json');

  const sub   = (args[0] || '').toLowerCase();
  const name  = (args[1] || '').trim();
  const rest  = args.slice(1).join(' ').trim();

  // â”€â”€ registry browse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'browse' || sub === 'ls' || (!sub)) {
    sectionHead('  SKILL REGISTRY Â· ' + (sub ? sub.toUpperCase() : 'ALL'));
    if (!fs.existsSync(INDEX_FILE)) {
      console.log(col(C.red, '  Registry not found. Run: purpclaw registry update'));
      return;
    }
    const reg = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    
    // Show skills
    sectionHead('  SKILLS (' + reg.skills.length + ')');
    for (const s of reg.skills.slice(0, 20)) {
      const installed = fs.existsSync(path.join(LOCAL_SKILLS, s.name, 'SKILL.md'));
      const tick  = installed ? col(C.green, 'âœ”') : col(C.gray, 'â—‹');
      const size  = col(C.gray, s.size_kb + 'K');
      const orig  = s.origin ? col(C.gray, '[' + s.origin + ']') : '';
      console.log(`  ${tick}  ${col(C.cyan, s.name.padEnd(32))}  ${col(C.gray, s.description.slice(0, 50))} ${size} ${orig}`);
    }
    if (reg.skills.length > 20) console.log(col(C.gray, `  ... and ${reg.skills.length - 20} more. Full list in registry/index.json`));
    
    // Show agents
    sectionHead('  AGENTS (' + reg.agents.length + ')');
    for (const a of reg.agents) {
      const installed = fs.existsSync(path.join(LOCAL_AGENTS, a.name + '.md'));
      const tick  = installed ? col(C.green, 'âœ”') : col(C.gray, 'â—‹');
      console.log(`  ${tick}  ${col(C.yellow, a.name.padEnd(24))}  ${col(C.gray, a.description.slice(0, 50))}`);
    }
    console.log(col(C.gray, '\n  purpclaw registry install <name>   â€” install from registry'));
    console.log(col(C.gray, '  purpclaw registry publish <name>    â€” publish to registry (opens guide)'));
    console.log(col(C.gray, '  purpclaw registry search "<text>" â€” keyword search'));
    console.log(col(C.gray, '  purpclaw registry update          â€” rebuild local index'));
    console.log('');
    return;
  }

  // â”€â”€ registry search "<intent>" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'search' && rest) {
    sectionHead('  REGISTRY SEARCH Â· "' + rest + '"');
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

  // â”€â”€ registry install <name> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'install' && name) {
    sectionHead('  INSTALLING Â· ' + name);
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
        console.log(col(C.green, '  âœ”') + `  Installed skill: ${name}`);
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
        console.log(col(C.green, '  âœ”') + `  Installed agent: ${name}`);
        console.log(col(C.gray, `  Copy: ${srcFile}`));
      }
    }
    console.log('');
    return;
  }

  // â”€â”€ registry publish <name> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'publish' && name) {
    sectionHead('  PUBLISH GUIDE Â· ' + name);
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
    console.log(col(C.gray, '  purpclaw registry install ' + name + '  â€” install locally after PR merges'));
    console.log('');
    return;
  }

  // â”€â”€ registry update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      spin.succeed(`${skills.length} skills Â· ${agents.length} agents`);
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

// â”€â”€ run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdRun(args) {
  const approvalArg = args.find(a => a.startsWith('--approval='));
  const approvalId = approvalArg ? approvalArg.split('=')[1] : null;
  const task = args.filter(a => !a.startsWith('--approval=')).join(' ').trim();
  if (!task) {
    console.error(col(C.red, '\n  Usage: purpclaw run "<task>"\n'));
    process.exit(1);
  }

  console.log(`\n  ${col(C.cyan + C.bold, 'âš¡ PURPCLAW RUN')}\n`);
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
          console.log(`\n  ${col(C.green, 'âœ“ Complete')}  ${col(C.gray, evt.workflowId || '')}`);
          if (evt.result) {
            console.log(`\n${col(C.gray, '  â”€â”€â”€ Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€')}`);
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
          console.log(`\n  ${col(C.red, 'âœ— Failed')}  ${col(C.gray, evt.error || '')}`);
          if (!resolved) { resolved = true; resolve(); }
        } else if (type === 'agent_spawned') {
          console.log(`  ${ts}  ${col(C.blue, 'âš™ spawn')}   ${col(C.cyan, evt.agent || evt.agentName || '?')} ${col(C.gray, 'â†’')} ${evt.task || evt.intent || ''}`);
        } else if (type === 'agent_complete') {
          console.log(`  ${ts}  ${col(C.green, 'âœ“ done ')}   ${col(C.cyan, evt.agent || evt.agentName || '?')}`);
        } else if (type === 'step' || type === 'workflow_step') {
          const icon = evt.status === 'started' ? col(C.yellow, 'â–¶ step ') : col(C.green, 'âœ“ step ');
          console.log(`  ${ts}  ${icon}   ${evt.description || JSON.stringify(evt).substring(0, 80)}`);
        } else if (type === 'log') {
          console.log(`  ${ts}  ${col(C.gray, 'Â·')}          ${evt.message || ''}`);
        } else {
          // Generic event â€” show compactly
          const msg = evt.message || evt.description || evt.summary || '';
          if (msg) console.log(`  ${ts}  ${col(C.gray, 'Â·')}          ${msg.substring(0, 100)}`);
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
      console.error(col(C.red, `\n  âœ— Orchestrator rejected task: ${JSON.stringify(resp.body)}\n`));
      streamReq && streamReq.destroy();
      process.exit(1);
    }

    const wf = resp.body;
    console.log(`  ${col(C.gray, 'Workflow:')} ${col(C.cyan, wf.workflowId || 'â€”')}\n`);

    // If the orchestrator returns a result synchronously (non-streaming), print it
    if (wf.status === 'completed' || wf.status === 'failed') {
      if (!resolved) { resolved = true; }
      if (wf.workflow?.result) {
        console.log(`\n${col(C.gray, '  â”€â”€â”€ Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€')}`);
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
        console.log(col(C.yellow, '\n  âš  Timed out waiting for completion signal. Workflow may still be running.'));
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
      console.error(col(C.red, '\n  âœ— Orchestrator not reachable. Run `purpclaw start` first.\n'));
    } else {
      console.error(col(C.red, `\n  âœ— ${e.message}\n`));
    }
    process.exit(1);
  }
}

// â”€â”€ agents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      const statusDot = busy ? col(C.cyan, 'â—‰') : col(C.gray, 'â—‹');
      const scoreStr  = score
        ? col(C.gray, ` [${(score.successRate ?? 0).toFixed(0)}% ok, ${score.totalTasks ?? 0} tasks]`)
        : '';
      const roleStr   = info.role ? col(C.gray, ` â€” ${info.role}`) : '';
      console.log(`    ${statusDot}  ${col(C.white, name.padEnd(12))}${roleStr}${scoreStr}`);
    }
  }

  if (poolData) {
    console.log(`\n  ${col(C.gray, `Pool: ${poolData.pool?.total ?? 0} total, ${poolData.busy?.length ?? 0} busy`)}`);
  }
  console.log('');
}

// â”€â”€ workflows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        console.log(`  ${col(statusColour, 'â–¶')}  ${col(C.bold, (wf.workflowId || wf.id || 'â€”').padEnd(22))} ${col(statusColour, (wf.status || 'â€”').padEnd(10))} ${col(C.gray, age)}`);
        if (wf.command) console.log(`     ${col(C.gray, wf.command.substring(0, 72))}`);
      }
    }

    // Also show pipeline completed list
    const pipeline = await httpGet(PORTS.orchestrator, '/api/pipeline', 3000);
    if (pipeline.completed?.length) {
      console.log(col(C.gray, `\n  Recent completed: ${pipeline.completed.length}`));
      for (const wf of pipeline.completed.slice(-4)) {
        console.log(`     ${col(C.green, 'âœ“')} ${col(C.gray, (wf.workflowId || wf.id || 'â€”').padEnd(22))} ${wf.command?.substring(0, 50) ?? ''}`);
      }
    }
  } catch {
    console.log(col(C.gray, '  Orchestrator offline. Run `purpclaw start`.\n'));
  }
  console.log('');
}

// â”€â”€ queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdQueue() {
  sectionHead('  TASK QUEUE');
  try {
    const q = await httpGet(PORTS.orchestrator, '/api/queue', 3000);
    console.log(`  Depth: ${col(C.cyan, String(q.depth ?? 0))}\n`);
    if (q.items?.length) {
      for (const item of q.items) {
        console.log(`  ${col(C.yellow, 'â³')}  P${item.priority ?? '?'}  ${item.command ?? 'â€”'}`);
        console.log(col(C.gray, `       enqueued ${item.enqueuedAt ?? 'â€”'}`));
      }
    } else {
      console.log(col(C.gray, '  Queue is empty.'));
    }
  } catch {
    console.log(col(C.gray, '  Orchestrator offline.\n'));
  }
  console.log('');
}

// â”€â”€ memory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdMemory(args) {
  const sub   = (args[0] || '').toLowerCase();
  const rest  = args.slice(1).join(' ').trim();

  // â”€â”€ purpclaw memory stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'stats') {
    sectionHead('  MEMORY MATRIX â€” STATS');
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

  // â”€â”€ purpclaw memory ingest "<text>" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'ingest') {
    const text = rest || args.slice(1).join(' ').trim();
    if (!text) {
      console.error(col(C.red, '\n  Usage: purpclaw memory ingest "<text to remember>"\n'));
      process.exit(1);
    }
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ§  MEMORY INGEST')}\n`);
    console.log(`  ${col(C.gray, 'Ingesting:')} ${text.substring(0, 80)}${text.length > 80 ? 'â€¦' : ''}\n`);
    try {
      const result = await httpPost(PORTS.memory, '/ingest', {
        content    : text,
        source     : 'cli',
        importance : 0.7,
      }, 10000);
      if (result.status >= 400) {
        console.error(col(C.red, `  âœ— ${JSON.stringify(result.body)}\n`));
        return;
      }
      console.log(col(C.green, `  âœ“ Ingested successfully`));
      if (result.body?.id) console.log(col(C.gray, `  id: ${result.body.id}`));
    } catch (e) {
      console.error(col(C.red, e.code === 'ECONNREFUSED'
        ? '  âœ— Memory matrix offline. Run `purpclaw start`.\n'
        : `  âœ— ${e.message}\n`));
    }
    console.log('');
    return;
  }

  // â”€â”€ purpclaw memory forget "<query>" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'forget') {
    const query = rest;
    if (!query) {
      console.error(col(C.red, '\n  Usage: purpclaw memory forget "<query>"\n'));
      process.exit(1);
    }
    console.log(`\n  ${col(C.yellow + C.bold, 'ðŸ§  MEMORY FORGET')}\n  ${col(C.gray, `"${query}"`)}\n`);
    try {
      const result = await httpPost(PORTS.memory, '/forget', { query }, 8000);
      if (result.status >= 400) {
        console.error(col(C.red, `  âœ— ${JSON.stringify(result.body)}\n`)); return;
      }
      const removed = result.body?.removed ?? result.body?.count ?? '?';
      console.log(col(C.green, `  âœ“ Removed ${removed} memories matching "${query}"\n`));
    } catch (e) {
      console.error(col(C.red, e.code === 'ECONNREFUSED'
        ? '  âœ— Memory matrix offline.\n'
        : `  âœ— ${e.message}\n`));
    }
    return;
  }

  // â”€â”€ purpclaw memory (no args) â€” status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!sub) {
    sectionHead('  MEMORY MATRIX STATUS');
    try {
      const health = await httpGet(PORTS.memory, '/health', 3000);
      console.log(`  ${tick(true)}  ${col(C.green, 'memory_matrix_v2')} ${col(C.gray, `on :${PORTS.memory}`)}`);
      if (health.memories !== undefined) console.log(`  Stored  : ${col(C.cyan, String(health.memories))} memories`);
      if (health.symbols  !== undefined) console.log(`  Symbols : ${col(C.cyan, String(health.symbols))}`);
      console.log(`\n  ${col(C.bold, 'Subcommands:')}`);
      console.log(`  ${col(C.cyan, 'purpclaw memory <query>')}       â€” recall matching memories`);
      console.log(`  ${col(C.cyan, 'purpclaw memory ingest "<text>"')} â€” store a new memory`);
      console.log(`  ${col(C.cyan, 'purpclaw memory forget "<query>"')} â€” remove matching memories`);
      console.log(`  ${col(C.cyan, 'purpclaw memory stats')}         â€” detailed matrix stats`);
      console.log(`  ${col(C.cyan, 'purpclaw dream')}                â€” run AutoDream consolidation\n`);
    } catch {
      console.log(`  ${tick(false)}  ${col(C.red, 'memory_matrix_v2 offline')}`);
      console.log(col(C.gray, '  Run `purpclaw start` to boot services.\n'));
    }
    return;
  }

  // â”€â”€ purpclaw memory <query> â€” recall â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const query = args.join(' ').trim();
  console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ§  MEMORY RECALL')}\n  ${col(C.gray, `"${query}"`)}\n`);

  try {
    const result = await httpPost(PORTS.memory, '/query', { query, limit: 5 }, 8000);
    if (result.status >= 400) {
      console.error(col(C.red, `  âœ— Memory matrix error: ${JSON.stringify(result.body)}\n`));
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
      const source  = mem.source ? col(C.gray, ` â€¢ ${mem.source}`) : '';
      const ts      = mem.timestamp ? col(C.gray, ` â€¢ ${new Date(mem.timestamp).toLocaleDateString()}`) : '';
      console.log(`  ${col(C.cyan, String(i + 1) + '.')}  ${content}`);
      console.log(col(C.gray, `      ${score}${source}${ts}\n`));
    }
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, '  âœ— Memory matrix offline. Run `purpclaw start`.\n'));
    } else {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
    }
  }
}

// â”€â”€ constitution validate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per AGENTS.md "RELATED LAW" + PURPCLAW_INTEGRATION_MANIFEST.md Â§11.
// Verifies canonical law files exist and cross-reference each other.

// Module-level flag parser used by subcommands that take --flag value pairs.
// Supports both `--key value` and `--key=value` forms. A flag followed by
// another `--flag` or end-of-args is recorded as boolean `true`.
function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a !== 'string') continue;
    const eq = a.indexOf('=');
    let key, val;
    if (a.startsWith('--') && eq > 0) {
      key = a.slice(2, eq);
      val = a.slice(eq + 1);
    } else if (a.startsWith('--')) {
      key = a.slice(2);
      val = (i + 1 < argv.length && !String(argv[i + 1]).startsWith('--')) ? argv[++i] : true;
    } else {
      continue;
    }
    out[key] = val;
  }
  return out;
}

async function cmdConstitution(args) {
  const constitution = require(path.join(PURP_DIR, 'lib', 'constitution'));
  const sub = (args[0] || 'validate').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ“œ CONSTITUTION â€” Commands')}`);
    console.log('  purpclaw constitution validate    Check canonical law files');
    console.log('  purpclaw constitution list        List required files');
    console.log('  purpclaw constitution help        Show this help\n');
    return;
  }

  if (sub === 'list') {
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ“œ Required canonical files')}\n`);
    for (const f of constitution.getRequiredFiles()) {
      console.log(`  ${f.file.padEnd(45)} ${f.role}`);
    }
    console.log('');
    return;
  }

  // Default: validate
  const result = constitution.validateConstitution({ root: PURP_DIR });
  console.log(constitution.formatResult(result));
  if (!result.ok) process.exit(1);
}

// â”€â”€ soul-memory contract â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per PURPCLAW_INTEGRATION_MANIFEST.md Â§8: USER.md and MEMORY.md are
// the high-signal context files loaded into every prompt. This command
// validates, views, and updates them under the canonical contract.
async function cmdSoulMemory(args) {
  const soulMemory = require(path.join(PURP_DIR, 'lib', 'soul-memory'));
  const sub = (args[0] || 'validate').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ§  SOUL MEMORY â€” Commands')}`);
    console.log('  purpclaw soul-memory validate          Check USER.md / MEMORY.md contracts');
    console.log('  purpclaw soul-memory show              Show first lines of both files');
    console.log('  purpclaw soul-memory inject            Print the prompt-context injection');
    console.log('  purpclaw soul-memory help              Show this help\n');
    return;
  }

  if (sub === 'show') {
    const r = soulMemory.readContracts();
    console.log(`\n  ${col(C.cyan + C.bold, 'USER.md')} (${r.user.chars} chars)`);
    console.log('  ' + '-'.repeat(60));
    console.log(r.user.content.split('\n').slice(0, 8).map(l => '  ' + l).join('\n'));
    console.log('  ...');
    console.log('');
    console.log(`  ${col(C.cyan + C.bold, 'MEMORY.md')} (${r.memory.chars} chars)`);
    console.log('  ' + '-'.repeat(60));
    console.log(r.memory.content.split('\n').slice(0, 8).map(l => '  ' + l).join('\n'));
    console.log('  ...\n');
    return;
  }

  if (sub === 'inject') {
    const ctx = soulMemory.buildPromptContext();
    console.log(ctx);
    return;
  }

  // Default: validate
  const result = soulMemory.validateContracts();
  console.log(soulMemory.formatResult(result));
  if (!result.ok) process.exit(1);
}

// â”€â”€ cross-review (cross-provider review gate) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per PURPCLAW_AUTONOMOUS_EXECUTION_CONTRACT.md Â§10: for significant
// mutations, the reviewer MUST come from a different provider family
// when available. The gate lives at lib/cross-review-gate.js and is
// invoked by the Forge Loop and the agent loop. This CLI command is
// the human-facing surface: dry-run the significance check, dry-run
// the reviewer pick, and optionally execute a live review.
//
// NOTE: this is intentionally NOT `purpclaw review` â€” that command is
// already used by lib/commands/claudecode.js for working-tree review.
// Distinct names avoid breaking the existing CLI contract.
async function cmdCrossReview(args) {
  const gate = require(path.join(PURP_DIR, 'lib', 'cross-review-gate'));
  const sub = (args[0] || 'help').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ” CROSS-REVIEW GATE â€” Commands')}`);
    console.log('  purpclaw cross-review check --file <path> [--lines N] [--files a,b,c]');
    console.log('      Run the significance heuristic. Returns shouldReview + severity.');
    console.log('  purpclaw cross-review pick --executor <provider>');
    console.log('      Pick a cross-family reviewer via Provider Parliament.');
    console.log('  purpclaw cross-review run --executor <provider> --mutation <text> [--context <text>]');
    console.log('      Run a live cross-provider review (invokes the reviewer LLM).');
    console.log('  purpclaw cross-review thresholds');
    console.log('      Print the significance thresholds (tunables).');
    console.log('  purpclaw cross-review help');
    console.log('      Show this help.\n');
    return;
  }

  if (sub === 'thresholds') {
    const t = gate.THRESHOLDS;
    console.log(`\n  ${col(C.cyan + C.bold, 'Cross-Review Thresholds')}\n`);
    console.log(`  ${'minLinesChanged'.padEnd(22)} ${col(C.cyan, String(t.minLinesChanged))}`);
    console.log(`  ${'minFilesChanged'.padEnd(22)} ${col(C.cyan, String(t.minFilesChanged))}`);
    console.log(`  ${'minDiffRatio'.padEnd(22)} ${col(C.cyan, String(t.minDiffRatio))}`);
    console.log(`  ${'alwaysReviewPatterns'.padEnd(22)} ${col(C.gray, `${t.alwaysReviewPatterns.length} regex(es) â€” see lib/cross-review-gate.js`)}\n`);
    return;
  }

  if (sub === 'check') {
    const opts = parseFlags(args.slice(1));
    const files = opts.files ? String(opts.files).split(',').map(s => s.trim()).filter(Boolean)
                 : opts.file ? [String(opts.file)]
                 : [];
    const lines = opts.lines ? Number(opts.lines) : undefined;
    if (!files.length && lines === undefined) {
      console.error(col(C.red, '  âœ— need --file <path> or --lines <N> or --files a,b,c\n'));
      process.exit(2);
    }
    const mutation = { files, linesChanged: lines };
    const decision = gate.shouldReview(mutation);
    const sevColor = decision.severity === 'critical' ? C.red
                   : decision.severity === 'high'     ? C.yellow
                   : decision.severity === 'medium'   ? C.cyan
                   : C.gray;
    console.log(`\n  ${col(C.cyan + C.bold, 'Significance check')}\n`);
    console.log(`  Files:        ${files.length ? files.join(', ') : col(C.gray, '(none)')}`);
    console.log(`  Lines:        ${lines !== undefined ? lines : col(C.gray, '(unspecified)')}`);
    console.log(`  Should review: ${decision.shouldReview ? col(C.yellow + C.bold, 'YES') : col(C.green, 'no')}`);
    console.log(`  Severity:     ${col(sevColor, decision.severity)}`);
    console.log(`  Reason:       ${col(C.gray, decision.reason)}\n`);
    if (!decision.shouldReview) process.exit(0);
    return;
  }

  if (sub === 'pick') {
    const opts = parseFlags(args.slice(1));
    const executor = opts.executor || process.env.LLM_PROVIDER || 'unknown';
    const reviewer = gate.pickReviewer({ executor });
    if (!reviewer) {
      console.log(col(C.yellow, `\n  ~ no cross-family reviewer available for executor="${executor}"\n`));
      process.exit(1);
    }
    console.log(`\n  ${col(C.cyan + C.bold, 'Cross-family reviewer')}`);
    console.log(`  Executor: ${col(C.gray, executor)}`);
    console.log(`  Reviewer: ${col(C.green + C.bold, reviewer)}\n`);
    return;
  }

  if (sub === 'run') {
    const opts = parseFlags(args.slice(1));
    const executor = opts.executor || process.env.LLM_PROVIDER || 'unknown';
    const mutation = opts.mutation;
    const context = opts.context || '';
    if (!mutation) {
      console.error(col(C.red, '  âœ— --mutation <text> is required for run\n'));
      process.exit(2);
    }
    const reviewer = gate.pickReviewer({ executor });
    if (!reviewer) {
      console.log(col(C.yellow, `\n  ~ no cross-family reviewer available for executor="${executor}" â€” escalating\n`));
      process.exit(1);
    }
    let llm;
    try {
      llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
    } catch (e) {
      console.error(col(C.red, `  âœ— cannot load llm-provider: ${e.message}\n`));
      process.exit(1);
    }
    console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ” Cross-provider review')}`);
    console.log(`  Executor: ${col(C.gray, executor)}`);
    console.log(`  Reviewer: ${col(C.cyan, reviewer)}`);
    console.log(`  ${col(C.gray, 'Asking reviewerâ€¦')}`);
    const result = await gate.runReview({ executor, reviewer, mutation, context, llm });
    const vColor = result.verdict === 'approve' ? C.green
                 : result.verdict === 'reject'  ? C.red
                 : C.yellow;
    console.log(`  Verdict:  ${col(vColor + C.bold, result.verdict.toUpperCase())}`);
    console.log(`  Provider: ${col(C.gray, result.provider || '(none)')}`);
    console.log(`  Duration: ${col(C.gray, `${result.durationMs}ms`)}`);
    console.log(`  Confidence: ${col(C.gray, String(result.confidence))}`);
    console.log(`\n  ${col(C.cyan, 'Feedback:')}`);
    console.log('  ' + (result.feedback || '(none)').split('\n').join('\n  '));
    console.log('');
    process.exit(result.verdict === 'approve' ? 0 : result.verdict === 'reject' ? 1 : 2);
  }

  // Unknown subcommand
  console.error(col(C.red, `  âœ— unknown subcommand: ${sub}\n  try: purpclaw cross-review help\n`));
  process.exit(2);
}

// â”€â”€ skill-forge (self-improving skills) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per PURPCLAW_INTEGRATION_MANIFEST.md Â§9 + v0.5 spec: the Skill Forge
// extends lib/evolution/skill-forge.js with trigger/preconditions/steps
// structure and success-rate tracking. This CLI is the human surface
// for attaching specs, recording outcomes, and triggering lifecycle eval.
//
// Distinct from `purpclaw forge` (which is the gacha soul-generator).
// â”€â”€ bench (provider benchmarks) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per PURPCLAW_INTEGRATION_MANIFEST.md + v0.5 spec: per-task model
// benchmarking for dynamic routing. Sits on top of

// â”€â”€ checkpoint (unified checkpoint system, P2 #12) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per PURPCLAW_INTEGRATION_INVENTORY.md P2 #12: unify the existing
// filesystem-snapshot manager (lib/checkpoint-manager.mjs) and the
// per-loop JSON files (lib/forge/loop.js) under one canonical surface.
// This CLI is the human-facing view of lib/unified-checkpoint.js.
async function cmdCheckpoint(args) {
  const uc = require(path.join(PURP_DIR, 'lib', 'unified-checkpoint'));
  const sub = (args[0] || 'help').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ’¾ CHECKPOINT â€” Unified Checkpoint System')}`);
    console.log('  purpclaw checkpoint list [--kind K] [--run-id R] [--scope S] [--limit N]');
    console.log('      List checkpoints (unified store)');
    console.log('  purpclaw checkpoint show <id>');
    console.log('      Show one checkpoint (header + state preview)');
    console.log('  purpclaw checkpoint lineage <id>');
    console.log('      Show parent â†’ child lineage for an id');
    console.log('  purpclaw checkpoint stats');
    console.log('      Counts by kind, total bytes, oldest/newest ts');
    console.log('  purpclaw checkpoint latest --run-id R');
    console.log('      Show the most recent checkpoint for a run');
    console.log('  purpclaw checkpoint remove <id>');
    console.log('      Delete a checkpoint by id');
    console.log('  purpclaw checkpoint migrate <path-to-legacy-cp.json>');
    console.log('      Import a legacy forge-loop checkpoint into the unified store');
    console.log('  purpclaw checkpoint help');
    console.log('      Show this help\n');
    return;
  }

  if (sub === 'list') {
    const opts = parseFlags(args.slice(1));
    const filter = {};
    if (opts.kind)       filter.kind = opts.kind;
    if (opts['run-id'])  filter.runId = opts['run-id'];
    if (opts.scope)      filter.scope = opts.scope;
    if (opts.limit)      filter.limit = Number(opts.limit);
    const list = uc.list(filter);
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ’¾ Unified checkpoints')}  ${col(C.gray, `(${list.length} match${list.length === 1 ? '' : 'es'})`)}\n`);
    if (!list.length) {
      console.log(`  ${col(C.gray, '(none â€” try `purpclaw forge "..." --autonomous` to create one)')}\n`);
      return;
    }
    for (const it of list) {
      const age = it.ts ? `${((Date.now() - it.ts) / 1000).toFixed(0)}s ago` : '';
      const run = it.runId ? col(C.gray, `run=${it.runId}`) : '';
      console.log(`  ${col(C.cyan, it.id)}  ${col(C.gray, it.kind.padEnd(20))} ${col(C.gray, it.scope || '-')} ${run} ${col(C.gray, age)}`);
    }
    console.log('');
    return;
  }

  if (sub === 'show') {
    const id = args[1];
    if (!id) { console.error(col(C.red, '  âœ— usage: purpclaw checkpoint show <id>\n')); process.exit(2); }
    const cp = uc.load(id);
    if (!cp) { console.error(col(C.red, `  âœ— no checkpoint with id "${id}"\n`)); process.exit(1); }
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ’¾ ' + cp.id)}\n`);
    console.log(`  Kind:        ${col(C.gray, cp.kind)}`);
    console.log(`  Scope:       ${col(C.gray, cp.scope || '-')}`);
    console.log(`  Run ID:      ${col(C.gray, cp.runId || '-')}`);
    console.log(`  Task ID:     ${col(C.gray, cp.taskId || '-')}`);
    console.log(`  Parent:      ${col(C.gray, cp.parentId || '-')}`);
    console.log(`  Timestamp:   ${col(C.gray, new Date(cp.ts).toISOString())}`);
    console.log(`  Bytes:       ${col(C.gray, String(cp.bytes || 0))}`);
    console.log(`  SHA-256:     ${col(C.gray, cp.sha256 || '-')}`);
    console.log(`  Source:      ${col(C.gray, cp.source || '-')}`);
    if (cp.metadata && Object.keys(cp.metadata).length) {
      console.log(`  Metadata:    ${col(C.gray, JSON.stringify(cp.metadata))}`);
    }
    if (cp.state) {
      const stateStr = JSON.stringify(cp.state);
      const preview = stateStr.length > 240 ? stateStr.slice(0, 237) + 'â€¦' : stateStr;
      console.log(`\n  State preview:`);
      console.log(`    ${col(C.gray, preview)}`);
    }
    console.log('');
    return;
  }

  if (sub === 'lineage') {
    const id = args[1];
    if (!id) { console.error(col(C.red, '  âœ— usage: purpclaw checkpoint lineage <id>\n')); process.exit(2); }
    const tree = uc.lineage(id);
    if (!tree.self) { console.error(col(C.red, `  âœ— no checkpoint with id "${id}"\n`)); process.exit(1); }
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ’¾ Lineage for ' + id)}\n`);
    console.log(`  Self:`);
    console.log(`    ${col(C.cyan, tree.self.id)}  ${col(C.gray, tree.self.kind)}  ts=${new Date(tree.self.ts).toISOString()}`);
    if (tree.ancestors.length) {
      console.log(`\n  Ancestors (${tree.ancestors.length}):`);
      for (const a of tree.ancestors) {
        console.log(`    ${col(C.cyan, a.id)}  ${col(C.gray, a.kind)}  ts=${new Date(a.ts).toISOString()}`);
      }
    }
    if (tree.descendants.length) {
      console.log(`\n  Descendants (${tree.descendants.length}):`);
      for (const d of tree.descendants) {
        console.log(`    ${col(C.cyan, d.id)}  ${col(C.gray, d.kind)}  ts=${new Date(d.ts).toISOString()}`);
      }
    }
    if (!tree.ancestors.length && !tree.descendants.length) {
      console.log(`\n  ${col(C.gray, '(no ancestors or descendants)')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'stats') {
    const s = uc.stats();
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ’¾ Unified Checkpoint Stats')}\n`);
    console.log(`  Base:        ${col(C.gray, s.base)}`);
    console.log(`  Total:       ${col(C.cyan, String(s.total))}`);
    console.log(`  Total bytes: ${col(C.gray, String(s.totalBytes))}`);
    console.log(`  By kind:`);
    for (const [k, n] of Object.entries(s.byKind)) {
      console.log(`    ${k.padEnd(24)} ${col(C.cyan, String(n))}`);
    }
    if (s.oldestTs) console.log(`  Oldest:      ${col(C.gray, new Date(s.oldestTs).toISOString())}`);
    if (s.newestTs) console.log(`  Newest:      ${col(C.gray, new Date(s.newestTs).toISOString())}`);
    console.log('');
    return;
  }

  if (sub === 'latest') {
    const opts = parseFlags(args.slice(1));
    const runId = opts['run-id'];
    if (!runId) { console.error(col(C.red, '  âœ— usage: purpclaw checkpoint latest --run-id R\n')); process.exit(2); }
    const latest = uc.latestForRun(runId);
    if (!latest) { console.log(col(C.yellow, `\n  ~ no checkpoint for run "${runId}"\n`)); return; }
    console.log(col(C.green, `\n  âœ“ latest for run "${runId}": ${latest.id}  ${col(C.gray, latest.kind)}  ts=${new Date(latest.ts).toISOString()}\n`));
    return;
  }

  if (sub === 'remove') {
    const id = args[1];
    if (!id) { console.error(col(C.red, '  âœ— usage: purpclaw checkpoint remove <id>\n')); process.exit(2); }
    const r = uc.remove(id);
    if (r.ok) console.log(col(C.green, `\n  âœ“ removed ${id}\n`));
    else { console.error(col(C.red, `  âœ— ${r.error}\n`)); process.exit(1); }
    return;
  }

  if (sub === 'migrate') {
    const legacyPath = args[1];
    if (!legacyPath) { console.error(col(C.red, '  âœ— usage: purpclaw checkpoint migrate <path>\n')); process.exit(2); }
    const r = await uc.migrateFromForge(legacyPath);
    if (r.ok) console.log(col(C.green, `\n  âœ“ migrated to ${r.id}\n`));
    else { console.error(col(C.red, `  âœ— ${r.error}\n`)); process.exit(1); }
    return;
  }

  console.error(col(C.red, `  âœ— unknown subcommand: ${sub}\n  try: purpclaw checkpoint help\n`));
  process.exit(2);
}

// â”€â”€ certify (release-grade certification report) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per docs/CERTIFICATION_GATE_AUDIT.md: wraps scripts/certify-ephemeral-runtime.mjs
// and turns its JSON artifacts into a human-readable release report. The
// harness produces 4 artifacts (baseline.json, snapshot-*.json, compare-*.json,
// certification.json); the report reads all 4 and emits a markdown table
// with gate verdicts, evidence pointers, and a top-level CERTIFIED / NOT_CERTIFIED verdict.
async function cmdCertify(args) {
  const sub = (args[0] || 'help').toLowerCase();
  const scriptPath = path.join(PURP_DIR, 'scripts', 'certify-ephemeral-runtime.mjs');
  const artifactsDir = path.join(PURP_DIR, 'artifacts', 'ephemeral-runtime');

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ“œ CERTIFY â€” 29-gate certification report')}`);
    console.log('  purpclaw certify run [--baseline-samples N] [--baseline-ms MS]');
    console.log('      Run the harness end-to-end and emit a release report.');
    console.log('      Establishes a baseline (3-30 samples), compares, certifies.');
    console.log('  purpclaw certify report');
    console.log('      Read existing artifacts/ephemeral-runtime/certification.json');
    console.log('      and produce a release report (markdown on stdout).');
    console.log('  purpclaw certify help');
    console.log('      Show this help\n');
    return;
  }

  if (sub === 'run') {
    const opts = parseFlags(args.slice(1));
    const samples = Number(opts['baseline-samples']) || 3;
    const sampleMs = Number(opts['baseline-ms']) || 2000;
    const env = { ...process.env, PURPCLAW_BASELINE_SAMPLES: String(samples), PURPCLAW_BASELINE_SAMPLE_MS: String(sampleMs) };
    if (!fs.existsSync(scriptPath)) {
      console.error(col(C.red, `  âœ— harness script not found at ${scriptPath}\n`));
      process.exit(2);
    }
    console.log(col(C.gray, `\n  â±  establishing baseline (${samples} samples Ã— ${sampleMs}ms = ${(samples * sampleMs / 1000).toFixed(1)}s)â€¦`));
    const baseline = trackedSpawn(process.execPath, [scriptPath, 'baseline'], { tag: 'certify-baseline', stdio: 'inherit', timeoutMs: 0, env, cwd: PURP_DIR });
    await new Promise((res) => baseline.on('close', (code) => code === 0 ? res() : res()));
    console.log(col(C.gray, '\n  â±  comparing (idle grace)â€¦'));
    const compare = trackedSpawn(process.execPath, [scriptPath, 'compare'], { tag: 'certify-compare', stdio: 'inherit', timeoutMs: 0, env, cwd: PURP_DIR });
    await new Promise((res) => compare.on('close', (code) => res()));
    console.log(col(C.gray, '\n  â±  certifyingâ€¦'));
    const cert = trackedSpawn(process.execPath, [scriptPath, 'certify'], { tag: 'certify-certify', stdio: 'inherit', timeoutMs: 0, env, cwd: PURP_DIR });
    await new Promise((res) => cert.on('close', (code) => res()));
    // Now print the report
    await cmdCertify(['report']);
    return;
  }

  if (sub === 'report') {
    const certPath = path.join(artifactsDir, 'certification.json');
    const baselinePath = path.join(artifactsDir, 'baseline.json');
    if (!fs.existsSync(certPath)) {
      console.error(col(C.red, `  âœ— no certification.json at ${certPath} â€” run \`purpclaw certify run\` first\n`));
      process.exit(2);
    }
    let cert, baseline;
    try { cert = JSON.parse(fs.readFileSync(certPath, 'utf8')); } catch (e) {
      console.error(col(C.red, `  âœ— corrupt certification.json: ${e.message}\n`));
      process.exit(1);
    }
    try { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); } catch (_) { baseline = null; }
    const opts = parseFlags(args.slice(1));
    const md = opts.markdown != null || (process.stdout.isTTY === false);
    emitCertificationReport(cert, baseline, md);
    return;
  }

  console.error(col(C.red, `  âœ— unknown subcommand: ${sub}\n  try: purpclaw certify help\n`));
  process.exit(2);
}

function emitCertificationReport(cert, baseline, asMarkdown) {
  const sep = asMarkdown ? '\n' : '\n';
  const h1 = asMarkdown ? '# ' : col(C.cyan + C.bold, '\n  ');
  const h2 = asMarkdown ? '## ' : col(C.cyan + C.bold, '\n  ');
  const h3 = asMarkdown ? '### ' : col(C.magenta + C.bold, '\n  ');
  const dim = asMarkdown ? '' : col(C.gray, '');
  const grn = asMarkdown ? '**PASS**' : col(C.green, 'PASS');
  const ylw = asMarkdown ? '`UNKNOWN`' : col(C.yellow, 'UNKNOWN');
  const red = asMarkdown ? '**FAIL**' : col(C.red, 'FAIL');
  const verdictColor = cert.verdict === 'CERTIFIED' ? grn : (cert.verdict === 'FAILED' ? red : ylw);
  const gates = Object.entries(cert.gates || {});
  const counts = gates.reduce((acc, [, v]) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const pass = counts.PASS || counts.pass || 0;
  const fail = counts.FAIL || counts.fail || 0;
  const unk  = counts.UNKNOWN || counts.unknown || 0;
  process.stdout.write(sep);
  process.stdout.write(h1 + `PurpClaw Certification Report${sep}`);
  process.stdout.write(asMarkdown
    ? `**Generated:** ${cert.createdAt}${sep}`
    : `  ${dim}Generated: ${cert.createdAt}${sep}`);
  process.stdout.write(asMarkdown
    ? `**Schema:** \`${cert.schema}\`${sep}`
    : `  ${dim}Schema: ${cert.schema}${sep}`);
  process.stdout.write(asMarkdown
    ? `**Verdict:** ${verdictColor} (${pass} PASS, ${fail} FAIL, ${unk} UNKNOWN of ${gates.length} gates)${sep}${sep}`
    : `  Verdict: ${verdictColor} ${dim}(${pass} PASS, ${fail} FAIL, ${unk} UNKNOWN of ${gates.length} gates)${sep}${sep}`);
  if (baseline && baseline.metrics) {
    process.stdout.write(h2 + `Baseline (${baseline.sampleCount} samples Ã— ${baseline.config.sampleMs}ms)${sep}`);
    const m = baseline.metrics;
    const rows = [
      ['total RSS median', m.totalRssBytesMedian, 'bytes'],
      ['total RSS p95',    m.totalRssBytesP95,    'bytes'],
      ['process count median', m.processCountMedian, ''],
      ['process count p95',    m.processCountP95,    ''],
      ['GPU MiB median',  m.gpuMiBMedian,  'MiB'],
      ['GPU MiB p95',     m.gpuMiBP95,     'MiB']
    ];
    if (asMarkdown) {
      process.stdout.write('| Metric | Value |\n|---|---|\n');
      for (const [k, v, u] of rows) process.stdout.write(`| ${k} | ${v == null ? 'n/a' : v + ' ' + u} |\n`);
    } else {
      for (const [k, v, u] of rows) process.stdout.write(`  ${dim}${k.padEnd(28)} ${v == null ? 'n/a' : v + ' ' + u}${sep}`);
    }
    process.stdout.write(sep);
  }
  process.stdout.write(h2 + `Gates (${gates.length})${sep}`);
  if (asMarkdown) {
    process.stdout.write('| # | Gate | Verdict | Notes |\n|---|---|---|---|\n');
    gates.forEach(([name, verdict], i) => {
      const v = String(verdict).toUpperCase();
      const vFmt = v === 'PASS' ? grn : v === 'FAIL' ? red : ylw;
      const note = (cert.note && i === 0) ? cert.note : '';
      process.stdout.write(`| ${i + 1} | \`${name}\` | ${vFmt} | ${note} |\n`);
    });
  } else {
    gates.forEach(([name, verdict], i) => {
      const v = String(verdict).toUpperCase();
      const vFmt = v === 'PASS' ? grn : v === 'FAIL' ? red : ylw;
      process.stdout.write(`  ${dim}${String(i + 1).padStart(2)}. ${name.padEnd(36)} ${vFmt}${sep}`);
    });
  }
  process.stdout.write(sep);
  process.stdout.write(h3 + `Audit reference${sep}`);
  process.stdout.write(asMarkdown
    ? `For per-gate evidence + gap status, see \`docs/CERTIFICATION_GATE_AUDIT.md\`.${sep}`
    : `  ${dim}For per-gate evidence + gap status, see docs/CERTIFICATION_GATE_AUDIT.md.${sep}`);
  if (cert.thresholds) {
    process.stdout.write(asMarkdown
      ? `Thresholds: RSS tolerance ${cert.thresholds.rssTolerancePercent}% / ${cert.thresholds.rssToleranceBytes}B, GPU tolerance ${cert.thresholds.gpuToleranceMiB} MiB.${sep}`
      : `  ${dim}Thresholds: RSS tolerance ${cert.thresholds.rssTolerancePercent}% / ${cert.thresholds.rssToleranceBytes}B, GPU ${cert.thresholds.gpuToleranceMiB} MiB.${sep}`);
  }
  process.stdout.write(sep);
}

// â”€â”€ cryosleep (P3 #10) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per docs/CRYOSLEEP_PLAN.md Â§10 step 6: the human-facing surface for the
// runtime's quiesce-serialize-stop-restart-deserialize-resume cycle.
// Slices 1-2 ship writer + reader + validation. `wake` validates the
// bundle and prints the replay summary. Full state restoration (applying
// replay.* back into in-process modules) ships with extractors/restorers
// in slices 4-5.
async function cmdCryosleep(args) {
  const writer = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'bundle-writer'));
  const reader = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'bundle-reader'));
  const sub = (args[0] || 'help').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ›Œ CRYOSLEEP â€” runtime hibernate / wake')}`);
    console.log('  purpclaw cryosleep status');
    console.log('      Show runtime state: last sleep, last wake, idle watcher, bundle count, disk usage');
    console.log('  purpclaw cryosleep sleep [--trigger T] [--now] [--dry-run]');
    console.log('      Capture live state + write ~/.purpclaw/cryosleep/<sleepId>/');
    console.log('      --dry-run : show what would be captured without writing');
    console.log('  purpclaw cryosleep sleep --gc [--keep N]');
    console.log('      Garbage-collect old bundles (default: keep last 3)');
    console.log('  purpclaw cryosleep list');
    console.log('      List bundles in the index');
    console.log('  purpclaw cryosleep show <sleepId>');
    console.log('      Show manifest of one bundle');
    console.log('  purpclaw cryosleep idle [--configure] [--start] [--auto-sleep] [--stop] [--record] [--threshold-ms N]');
    console.log('      Idle-watcher status / start / stop / record-activity. Used by Â§2.2 auto-sleep.');
    console.log('      --auto-sleep : when idle, capture state via extractors and write a cryosleep bundle');
    console.log('  purpclaw cryosleep wake [--from-bundle PATH] [--force-version-skip] [--apply] [--dry-run]');
    console.log('      Re-hydrate the runtime from a bundle. Validates, restores, prints report.');
    console.log('      --apply        : mark the bundle as consumed (idempotent)');
    console.log('      --dry-run      : show what would be restored without calling any hooks');
    console.log('  purpclaw cryosleep help');
    console.log('      Show this help\n');
    return;
  }

  if (sub === 'sleep') {
    const opts = parseFlags(args.slice(1));
    if (opts.gc != null) {
      const keep = Number(opts.keep) || 3;
      const root = writer.defaultRoot();
      if (!fs.existsSync(root)) {
        console.log(col(C.gray, `\n  ~ no bundles at ${root}\n`));
        return;
      }
      const removed = await writer.gcOldBundles(root, keep);
      console.log(col(C.green, `\n  âœ“ kept last ${keep} bundles, removed ${removed.length}\n`));
      for (const p of removed) console.log(`    ${col(C.gray, '- ' + path.basename(p))}`);
      console.log('');
      return;
    }
    if (opts['dry-run'] != null) {
      // Show what would be captured without writing a bundle
      const extractors = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'extractors'));
      const inv = extractors.extractorInventory();
      const sampleState = extractors.captureAll();
      console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ›Œ Cryosleep sleep â€” dry run')}\n`);
      console.log(`  ${col(C.gray, 'Module inventory:')}`);
      for (const [k, v] of Object.entries(inv)) {
        const mark = v.present ? col(C.green, 'â—') : col(C.yellow, 'â—‹');
        console.log(`    ${mark} ${k.padEnd(20)} ${col(C.gray, v.kind)}`);
      }
      console.log(`\n  ${col(C.gray, 'Sample state shape (will be serialized):')}`);
      for (const [k, v] of Object.entries(sampleState)) {
        const len = Array.isArray(v) ? v.length : (v == null ? 'null' : 'object');
        console.log(`    ${k.padEnd(20)} ${col(C.gray, String(len))}`);
      }
      console.log('');
      return;
    }
    // Real sleep: capture state via extractors, then write the bundle
    const extractors = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'extractors'));
    const trigger = opts.trigger || 'manual';
    const captured = extractors.captureAll();
    const ctx = {
      trigger,
      purpclawVersion: (() => {
        try { return require(path.join(PURP_DIR, 'package.json')).version || '0.5.0'; }
        catch { return '0.5.0'; }
      })(),
      pid: process.pid,
      activeGoals: [],
      activeSouls: (captured.souls || []).map(s => s.soulId || s.id).filter(Boolean),
      openLeases: (captured.leases || []).length,
      state: captured
    };
    try {
      const res = await writer.write(ctx);
      console.log(col(C.green, `\n  âœ“ sleep ${res.sleepId}`));
      console.log(`    path:     ${col(C.gray, res.path)}`);
      console.log(`    size:     ${col(C.gray, res.size + ' bytes')}`);
      console.log(`    sha256:   ${col(C.gray, res.checksum)}`);
      console.log(`    files:    ${col(C.gray, res.files.length + ' subfiles + manifest + checksum')}`);
      const populated = Object.entries(captured).filter(([k, v]) =>
        v != null && (Array.isArray(v) ? v.length > 0 : true)
      ).map(([k]) => k);
      console.log(`    captured: ${col(C.gray, populated.join(', ') || '(empty)')}`);
      console.log('');
      return;
    } catch (e) {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
      process.exit(1);
    }
  }

  if (sub === 'idle') {
    const idle = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'idle-watcher'));
    const opts = parseFlags(args.slice(1));
    if (opts.configure != null) {
      const t = Number(opts['threshold-ms']);
      const c = Number(opts['confirm-ms']);
      const i = Number(opts['interval-ms']);
      idle.configure({
        thresholdMs: t || undefined,
        confirmTimeoutMs: c || undefined,
        checkIntervalMs: i || undefined
      });
      console.log(col(C.green, '\n  âœ“ idle-watcher configured\n'));
    }
    if (opts.start != null) {
      // When --auto-sleep is set, on idle: capture state via extractors
      // and write a bundle; onSleep is the same with a stronger log.
      // This wires the idle-watcher to the cryosleep writer per Â§2.2.
      const autoSleep = opts['auto-sleep'] != null;
      const triggerSleep = (ev, reason) => {
        if (!autoSleep) return;
        const extractors = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'extractors'));
        const captured = extractors.captureAll();
        const ctx = {
          trigger: 'idle-timeout',
          purpclawVersion: (() => { try { return require(path.join(PURP_DIR, 'package.json')).version || '0.5.0'; } catch { return '0.5.0'; } })(),
          pid: process.pid,
          activeGoals: [],
          activeSouls: (captured.souls || []).map(s => s.soulId || s.id).filter(Boolean),
          openLeases: (captured.leases || []).length,
          state: captured
        };
        writer.write(ctx).then((res) => {
          console.log(col(C.green, `\n  âœ“ auto-sleep wrote ${res.sleepId} (${res.size}B, sha256 ${res.checksum.slice(0,8)}...)`));
        }).catch((e) => {
          console.log(col(C.red, `  âœ— auto-sleep write failed: ${e.message}`));
        });
      };
      const goalInFlight = opts['allow-goal-in-flight'] != null;
      idle.start({
        isGoalInFlight: () => goalInFlight,
        onIdle: (ev) => {
          console.log(col(C.yellow, `\n  ~ idle detected at ${ev.at} (${Math.round(ev.idleMs / 1000)}s) â€” confirm in 60s`));
          triggerSleep(ev, 'onIdle');
        },
        onSleep: (ev) => {
          console.log(col(C.red, `\n  âœ— operator did not respond in 60s â€” auto-sleep at ${ev.at}`));
          triggerSleep(ev, 'onSleep');
        }
      });
      console.log(col(C.green, '\n  âœ“ idle-watcher started' + (autoSleep ? ' (auto-sleep ENABLED â€” idle triggers cryosleep sleep)' : ' (status-only) ') + '\n'));
    }
    if (opts.stop != null) {
      idle.stop();
      console.log(col(C.gray, '\n  âœ“ idle-watcher stopped\n'));
    }
    if (opts['record'] != null) {
      idle.recordActivity();
      console.log(col(C.gray, '\n  âœ“ activity recorded\n'));
    }
    const s = idle.status();
    console.log(`  ${col(C.cyan, 'idle-watcher status')}\n`);
    console.log(`    thresholdMs:       ${col(C.gray, String(s.configured.thresholdMs))}`);
    console.log(`    confirmTimeoutMs:  ${col(C.gray, String(s.configured.confirmTimeoutMs))}`);
    console.log(`    checkIntervalMs:   ${col(C.gray, String(s.configured.checkIntervalMs))}`);
    console.log(`    running:           ${s.running ? col(C.green, 'yes') : col(C.gray, 'no')}`);
    console.log(`    lastActivityAt:    ${col(C.gray, s.lastActivityAt || '(none)')}`);
    console.log(`    msSinceActivity:   ${col(C.gray, s.msSinceLastActivity == null ? '(no activity yet)' : s.msSinceLastActivity + 'ms')}`);
    console.log(`    isIdle:            ${s.isIdle ? col(C.yellow, 'yes') : col(C.green, 'no')}`);
    console.log(`    history:           ${col(C.gray, String(s.historyCount) + ' events')}`);
    if (s.recentHistory.length) {
      console.log(`    recent:`);
      for (const ev of s.recentHistory) {
        console.log(`      ${col(C.gray, ev.at + '  idleMs=' + ev.idleMs)}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'list') {
    const root = writer.defaultRoot();
    const idxPath = path.join(root, 'index.json');
    if (!fs.existsSync(idxPath)) {
      console.log(col(C.gray, `\n  ~ no bundles at ${root}\n`));
      return;
    }
    let idx;
    try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); }
    catch (e) {
      console.error(col(C.red, `  âœ— corrupt index.json â€” try purpclaw cryosleep sleep --gc\n`));
      process.exit(1);
    }
    const list = Array.isArray(idx.bundles) ? idx.bundles : [];
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ›Œ Cryosleep bundles')}  ${col(C.gray, `(${list.length})`)}\n`);
    for (const b of list) {
      const age = b.completedAt ? `${((Date.now() - new Date(b.completedAt).getTime()) / 1000).toFixed(0)}s ago` : '';
      const consumed = b.consumed ? col(C.yellow, ' [consumed]') : '';
      console.log(`  ${col(C.cyan, b.sleepId)}  ${col(C.gray, b.trigger || '-')}  ${col(C.gray, b.size + 'B')}  ${col(C.gray, age)}${consumed}`);
    }
    console.log('');
    return;
  }

  if (sub === 'status') {
    // Runtime state at a glance: last sleep, last wake, idle watcher, bundle count, disk usage.
    const root = writer.defaultRoot();
    const idle = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'idle-watcher'));
    const idxPath = path.join(root, 'index.json');
    let idx = null;
    try { if (fs.existsSync(idxPath)) idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); }
    catch (_) { idx = null; }
    const bundles = idx && Array.isArray(idx.bundles) ? idx.bundles : [];
    // Compute total size on disk
    let totalBytes = 0;
    try {
      if (fs.existsSync(root)) {
        const walk = (p) => {
          const st = fs.statSync(p);
          if (st.isFile()) totalBytes += st.size;
          else if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
        };
        walk(root);
      }
    } catch (_) {}
    const lastSleep = bundles[0] || null;
    const consumed = bundles.filter(b => b.consumed).length;
    const pending = bundles.filter(b => !b.consumed).length;
    const is = idle.status();
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ›Œ Cryosleep runtime status')}\n`);
    console.log(`    last sleep:        ${col(C.gray, lastSleep ? lastSleep.sleepId + ' (' + lastSleep.trigger + ')' : '(none)')}`);
    console.log(`    last completed:    ${col(C.gray, lastSleep ? lastSleep.completedAt : '-')}`);
    console.log(`    last consumed:     ${col(C.gray, lastSleep && lastSleep.consumed ? 'yes' : 'no')}`);
    console.log(`    bundles:           ${col(C.cyan, String(bundles.length))} ${col(C.gray, '(' + pending + ' pending, ' + consumed + ' consumed)')}`);
    console.log(`    disk usage:        ${col(C.cyan, (totalBytes / 1024).toFixed(1) + ' KiB')}  ${col(C.gray, '(bundles + index)')}`);
    console.log(`    root:              ${col(C.gray, root)}`);
    console.log('');
    console.log(`    ${col(C.cyan, 'idle-watcher')}`);
    console.log(`      running:         ${is.running ? col(C.green, 'yes') : col(C.gray, 'no')}`);
    console.log(`      threshold:       ${col(C.gray, (is.configured.thresholdMs / 1000 / 60).toFixed(1) + ' min')}`);
    console.log(`      confirm:         ${col(C.gray, (is.configured.confirmTimeoutMs / 1000).toFixed(0) + 's')}`);
    console.log(`      last activity:   ${col(C.gray, is.lastActivityAt || '(none)')}`);
    console.log(`      is idle:         ${is.isIdle ? col(C.yellow, 'yes') : col(C.green, 'no')}`);
    console.log(`      history:         ${col(C.gray, String(is.historyCount) + ' idle events')}`);
    console.log('');
    return;
  }

  if (sub === 'show') {
    const sleepId = args[1];
    if (!sleepId) { console.error(col(C.red, '  âœ— usage: purpclaw cryosleep show <sleepId>\n')); process.exit(2); }
    const root = writer.defaultRoot();
    const manifestPath = path.join(root, sleepId, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(col(C.red, `  âœ— no bundle with id "${sleepId}"\n`));
      process.exit(1);
    }
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ›Œ ' + m.sleepId)}\n`);
    console.log(`  Trigger:        ${col(C.gray, m.trigger)}`);
    console.log(`  Started:        ${col(C.gray, m.startedAt)}`);
    console.log(`  Completed:      ${col(C.gray, m.completedAt)}`);
    console.log(`  PurpClaw ver:   ${col(C.gray, m.purpclawVersion)}`);
    console.log(`  PID:            ${col(C.gray, String(m.pid))}`);
    console.log(`  Active goals:   ${col(C.gray, (m.activeGoals || []).join(', ') || '-')}`);
    console.log(`  Active souls:   ${col(C.gray, (m.activeSouls || []).join(', ') || '-')}`);
    console.log(`  Open leases:    ${col(C.gray, String(m.openLeases))}`);
    console.log(`  Size:           ${col(C.gray, m.size + ' bytes')}`);
    console.log(`  SHA-256:        ${col(C.gray, m.sha256)}`);
    console.log(`  Files:          ${col(C.gray, String(m.fileCount))}`);
    if (m.files) {
      console.log(`  Subfiles:`);
      for (const f of m.files) console.log(`    ${col(C.gray, f.name.padEnd(28) + ' ' + f.bytes + 'B')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'wake') {
    const opts = parseFlags(args.slice(1));
    // First non-flag positional after `wake` is the sleepId (if any).
    // Otherwise read() uses findLatest() to pick the most recent bundle.
    const sleepId = args.slice(1).find(a => !a.startsWith('--'));
    // Note: --from-bundle for portable bundle paths (v1.0) is not yet
    // implemented â€” slice 2 only reads from the local rootDir.
    try {
      const r = await reader.read({
        sleepId: sleepId || null,
        forceVersionSkip: !!opts['force-version-skip'],
        apply: !!opts.apply
      });
      console.log(col(C.green, `\n  âœ“ wake ${r.sleepId}`));
      console.log(`    path:           ${col(C.gray, r.path)}`);
      console.log(`    validation:     schema=${r.validation.schema} checksum=${r.validation.checksum} version=${r.validation.version}`);
      console.log(`    completed:      ${col(C.gray, r.manifest.completedAt)}`);
      console.log(`    trigger:        ${col(C.gray, r.manifest.trigger)}`);
      console.log(`    active goals:   ${col(C.gray, (r.manifest.activeGoals || []).join(', ') || '-')}`);
      console.log(`    active souls:   ${col(C.gray, (r.manifest.activeSouls || []).join(', ') || '-')}`);
      console.log(`    open leases:    ${col(C.gray, String(r.manifest.openLeases))}`);
      console.log(`    consumed:       ${r.consumed ? col(C.yellow, 'yes (idempotent on next read)') : col(C.gray, 'no')}`);

      // Replay-section summary (always)
      const restorers = require(path.join(PURP_DIR, 'lib', 'cryosleep', 'restorers'));
      const plan = restorers.planRestore(r.replay);
      const dryRun = opts['dry-run'] != null;
      if (dryRun) {
        console.log(`    would-restore (dry run):`);
        for (const p of plan) {
          const mark = p.wouldApply ? col(C.green, 'â—') : col(C.gray, 'â—‹');
          console.log(`      ${mark} ${p.subsystem.padEnd(20)} ${p.wouldApply ? col(C.green, 'would apply') : col(C.gray, p.reason || 'skipped')}`);
        }
        console.log('');
        return;
      }

      // Real restore: call the restorers
      const result = await restorers.restoreAll(r.replay);
      console.log(`    restore result: applied=${col(C.green, String(result.applied.length))} skipped=${col(C.yellow, String(result.skipped.length))} errors=${col(C.red, String(result.errors.length))}`);
      for (const p of plan) {
        const status = result.results[p.subsystem].status;
        let mark;
        if (status === 'applied') mark = col(C.green, 'â—');
        else if (status === 'error') mark = col(C.red, 'âœ—');
        else mark = col(C.gray, 'â—‹');
        const note = result.results[p.subsystem].reason || result.results[p.subsystem].message || '';
        console.log(`      ${mark} ${p.subsystem.padEnd(20)} ${col(C.gray, status.padEnd(8))} ${col(C.gray, note)}`);
      }
      if (result.errors.length) {
        console.log('');
        console.log(col(C.red, `  âœ— ${result.errors.length} restore error(s) â€” wake partial`));
        process.exit(2);
      }
      console.log('');
      return;
    } catch (e) {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
      process.exit(1);
    }
  }

  console.error(col(C.red, `  âœ— unknown subcommand: ${sub}\n  try: purpclaw cryosleep help\n`));
  process.exit(2);
}

// â”€â”€ steering (first-class control system) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per FOUNDING_PRINCIPLES.md Â§11 + Eddie's design law (2026-08-16):
// "Steering has to be treated as a first-class control system, not
//  just another prompt blob." The resolver answers three questions
// before any turn runs: what governs, what is forbidden, what must
// be proven. The per-reply supervisor consults the capsule before
// deciding which capability pillars to spawn.
async function cmdSteering(args) {
  const sr = require(path.join(PURP_DIR, 'lib', 'steering-resolver'));
  const sub = (args[0] || 'help').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.magenta + C.bold, 'ðŸŽ¯ STEERING â€” Commands')}`);
    console.log('  purpclaw steering ladder                 Show the 9-step authority ladder');
    console.log('  purpclaw steering fields                 Show the 6 field taxonomies');
    console.log('  purpclaw steering list                    List all built-in steering items');
    console.log('  purpclaw steering show <id>               Show one steering item');
    console.log('  purpclaw steering resolve [--intent I] [--field F] [--project P]');
    console.log('                                           Resolve a capsule for a context');
    console.log('  purpclaw steering check-action <kind>    Test if a forbidden action is blocked');
    console.log('  purpclaw steering help                    Show this help\n');
    return;
  }

  if (sub === 'ladder') {
    const ladder = sr.authorityLadder();
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸŽ¯ Authority ladder')}\n`);
    for (const { name, value } of ladder) {
      const bar = 'â–ˆ'.repeat(Math.round(value / 50));
      const color = value >= 800 ? C.green : value >= 500 ? C.yellow : C.gray;
      console.log(`  ${col(color, String(value).padStart(3))}  ${name.padEnd(24)} ${col(C.gray, bar)}`);
    }
    console.log('');
    return;
  }

  if (sub === 'fields') {
    const tax = sr.fieldTaxonomy();
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸŽ¯ Field taxonomies')}\n`);
    for (const { field, pillars } of tax) {
      console.log(`  ${col(C.cyan, field.padEnd(20))} ${col(C.gray, pillars.join(', '))}`);
    }
    console.log('');
    return;
  }

  if (sub === 'list') {
    const idx = sr.loadBuiltInIndex();
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸŽ¯ Built-in steering items')}  ${col(C.gray, `(${idx.length} items)`)}\n`);
    const byAuth = {};
    for (const it of idx) {
      const tier = Object.entries(sr.AUTHORITY).find(([, v]) => v === it.authority);
      const tierName = tier ? tier[0] : 'UNKNOWN';
      if (!byAuth[tierName]) byAuth[tierName] = [];
      byAuth[tierName].push(it);
    }
    for (const tierName of sr.AUTHORITY_ORDER) {
      const items = byAuth[tierName];
      if (!items || !items.length) continue;
      console.log(`  ${col(C.cyan, tierName)} ${col(C.gray, `(${sr.AUTHORITY[tierName]})`)}`);
      for (const it of items) {
        const field = it.field ? col(C.yellow, `[${it.field}]`) : col(C.gray, '[general]');
        const mandatory = it.mandatory ? col(C.red, '!') : ' ';
        console.log(`    ${mandatory} ${col(C.gray, it.id)}  ${field}`);
        const rulePreview = it.rule.length > 80 ? it.rule.slice(0, 77) + 'â€¦' : it.rule;
        console.log(`        ${col(C.gray, rulePreview)}`);
      }
      console.log('');
    }
    return;
  }

  if (sub === 'show') {
    const id = args[1];
    if (!id) {
      console.error(col(C.red, '  âœ— usage: purpclaw steering show <id>\n'));
      process.exit(2);
    }
    const idx = sr.loadBuiltInIndex();
    const item = idx.find(i => i.id === id);
    if (!item) {
      console.error(col(C.red, `  âœ— no steering item with id "${id}"\n`));
      process.exit(1);
    }
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸŽ¯ ' + item.id)}\n`);
    console.log(`  Authority:  ${col(C.cyan, String(item.authority))} (${Object.entries(sr.AUTHORITY).find(([,v]) => v === item.authority)?.[0] || 'unknown'})`);
    console.log(`  Scope:      ${col(C.gray, item.scope || 'global')}`);
    console.log(`  Field:      ${col(C.gray, item.field || 'general')}`);
    console.log(`  Mandatory:  ${item.mandatory ? col(C.red, 'yes') : col(C.gray, 'no')}`);
    console.log(`  Applies to: ${col(C.gray, (item.appliesTo || []).join(', '))}`);
    if (item.condition) console.log(`  Condition:  ${col(C.gray, item.condition)}`);
    if (item.source)    console.log(`  Source:     ${col(C.gray, item.source)}`);
    console.log(`\n  Rule:`);
    console.log(`    ${col(C.white, item.rule)}\n`);
    return;
  }

  if (sub === 'resolve') {
    const opts = parseFlags(args.slice(1));
    const capsule = sr.resolve({
      intent:  opts.intent  || 'chat',
      field:   opts.field   || 'general',
      project: opts.project || (process.env.PURPCLAW_PROJECT || 'purpclaw'),
      workflowNode: opts['workflow-node'],
      soulId:  opts['soul-id'],
    });
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸŽ¯ Resolved Steering Capsule')}\n`);
    console.log(`  Field:        ${col(C.gray, capsule.field)}`);
    console.log(`  Resolved at:  ${col(C.gray, capsule.resolvedAt)}`);
    console.log(`  Items:        ${col(C.cyan, String(capsule.items.length))}`);
    console.log(`  Forbids:      ${col(C.yellow, String(capsule.forbids.length))}`);
    console.log(`  Proofs:       ${col(C.green, String(capsule.proofs.length))}`);
    console.log(`  Cutoff:       ${col(C.gray, String(capsule.authorityCutoff))}`);
    console.log('');
    for (const it of capsule.items) {
      const authColor = it.authority >= 800 ? C.green : it.authority >= 500 ? C.yellow : C.gray;
      console.log(`  ${col(authColor, String(it.authority).padStart(3))}  ${it.id}`);
    }
    console.log('');
    return;
  }

  if (sub === 'check-action') {
    const kind = args[1];
    if (!kind) {
      console.error(col(C.red, '  âœ— usage: purpclaw steering check-action <kind>\n'));
      process.exit(2);
    }
    const opts = parseFlags(args.slice(2));
    const capsule = sr.resolve({
      intent:  opts.intent  || 'chat',
      field:   opts.field   || 'pc-control',
      project: opts.project || (process.env.PURPCLAW_PROJECT || 'purpclaw'),
    });
    const r = sr.applyToAction(capsule, { kind });
    if (r.allowed) {
      console.log(col(C.green, `\n  âœ“ action "${kind}" is allowed`));
      console.log(col(C.gray, `    reason: ${r.reason}\n`));
      process.exit(0);
    } else {
      console.log(col(C.red, `\n  âœ— action "${kind}" is FORBIDDEN`));
      console.log(col(C.gray, `    reason: ${r.reason}\n`));
      process.exit(1);
    }
  }

  console.error(col(C.red, `  âœ— unknown subcommand: ${sub}\n  try: purpclaw steering help\n`));
  process.exit(2);
}

// lib/provider-benchmarks.js (JSONL persistence + per-task aggregation)
// and the parliamentary pickWithBenchmarks() method.
async function cmdBench(args) {
  const bench = require(path.join(PURP_DIR, 'lib', 'provider-benchmarks'));
  const { ProviderParliament } = require(path.join(PURP_DIR, 'lib', 'provider-parliament'));
  const sub = (args[0] || 'help').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ“Š BENCH â€” Provider Benchmarks')}`);
    console.log('  purpclaw bench summary                            Snapshot of all benchmarks');
    console.log('  purpclaw bench show <provider> <taskType>          Stats for one provider+task');
    console.log('  purpclaw bench rank <taskType> <p1,p2,p3>          Rank candidates empirically');
    console.log('  purpclaw bench record --provider P --task T --success|--failure [--latency-ms N] [--cost N] [--quality 0..1]');
    console.log('                                                     Record an observation');
    console.log('  purpclaw bench pick "<task>" [--since-ms N]         Pick via Parliament + empirical');
    console.log('  purpclaw bench reset                               Wipe history (test-only)');
    console.log('  purpclaw bench help                                Show this help\n');
    return;
  }

  if (sub === 'summary') {
    const s = bench.summary();
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ“Š Provider Benchmarks')}  ${col(C.gray, `(${s.totalObservations} observations)`)}\n`);
    if (s.totalObservations === 0) {
      console.log(`  ${col(C.gray, '(no data â€” record some with `purpclaw bench record ...`')}\n`);
      return;
    }
    if (Object.keys(s.byProvider).length) {
      console.log(`  ${col(C.white + C.bold, 'by provider:')}`);
      for (const [p, e] of Object.entries(s.byProvider)) {
        const sr = (e.successRate * 100).toFixed(0);
        const color = e.successRate >= 0.8 ? C.green : e.successRate >= 0.5 ? C.yellow : C.red;
        console.log(`    ${p.padEnd(20)} ${col(color, sr + '%')}  ${col(C.gray, `(${e.successes}/${e.samples})`)}`);
      }
      console.log('');
    }
    if (Object.keys(s.byTaskType).length) {
      console.log(`  ${col(C.white + C.bold, 'by task type:')}`);
      for (const [t, e] of Object.entries(s.byTaskType)) {
        const sr = (e.successRate * 100).toFixed(0);
        const color = e.successRate >= 0.8 ? C.green : e.successRate >= 0.5 ? C.yellow : C.red;
        const top = s.topByTaskType[t];
        const topStr = top ? col(C.cyan, `top: ${top.provider} (${(top.successRate*100).toFixed(0)}%)`) : '';
        console.log(`    ${t.padEnd(20)} ${col(color, sr + '%')}  ${col(C.gray, `(${e.successes}/${e.samples})`)} ${topStr}`);
      }
      console.log('');
    }
    return;
  }

  if (sub === 'show') {
    const provider = args[1];
    const taskType = args[2];
    if (!provider || !taskType) {
      console.error(col(C.red, '  âœ— usage: purpclaw bench show <provider> <taskType>\n'));
      process.exit(2);
    }
    const s = bench.scoreFor(provider, taskType, { minSamples: 1 });
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ“Š')} ${provider} / ${taskType}\n`);
    console.log(`  Samples:      ${col(C.cyan, String(s.samples))}`);
    console.log(`  Success-rate: ${col(C.cyan, (s.successRate * 100).toFixed(1) + '%')}`);
    console.log(`  Avg latency:  ${col(C.gray, s.avgLatencyMs.toFixed(0) + 'ms')}`);
    console.log(`  p95 latency:  ${col(C.gray, s.p95LatencyMs.toFixed(0) + 'ms')}`);
    console.log(`  Avg cost:     ${col(C.gray, s.avgCostTokens.toFixed(0) + ' tokens')}`);
    console.log(`  Avg quality:  ${col(C.gray, s.avgQuality != null ? s.avgQuality.toFixed(2) : '(none)')}`);
    console.log(`  Confidence:   ${col(C.cyan, (s.confidence * 100).toFixed(0) + '%')}\n`);
    return;
  }

  if (sub === 'rank') {
    const taskType = args[1];
    const list = (args[2] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!taskType || !list.length) {
      console.error(col(C.red, '  âœ— usage: purpclaw bench rank <taskType> <p1,p2,p3>\n'));
      process.exit(2);
    }
    const ranking = bench.getProviderRanking(taskType, list, { minSamples: 1 });
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ“Š Empirical ranking')}  ${col(C.gray, `taskType=${taskType}`)}\n`);
    for (let i = 0; i < ranking.length; i++) {
      const r = ranking[i];
      const medal = i === 0 ? col(C.green, '1st') : i === 1 ? col(C.yellow, '2nd') : col(C.gray, '3rd');
      console.log(`  ${medal}  ${r.provider.padEnd(18)} composite=${r.composite.toFixed(3)}  succ=${(r.successRate*100).toFixed(0)}%  lat=${r.avgLatencyMs.toFixed(0)}ms  conf=${(r.confidence*100).toFixed(0)}%  n=${r.samples}`);
    }
    console.log('');
    return;
  }

  if (sub === 'record') {
    const opts = parseFlags(args.slice(1));
    if (!opts.provider || !opts.task) {
      console.error(col(C.red, '  âœ— usage: purpclaw bench record --provider P --task T --success|--failure [--latency-ms N] [--cost N] [--quality 0..1]\n'));
      process.exit(2);
    }
    let success;
    if (opts.success === true || opts.success === 'true')  success = true;
    else if (opts.failure === true || opts.failure === 'true') success = false;
    else { console.error(col(C.red, '  âœ— pass --success or --failure\n')); process.exit(2); }
    const obs = {
      provider: opts.provider,
      taskType: opts.task,
      success,
      latencyMs: opts['latency-ms'] || opts.latencyMs ? Number(opts['latency-ms'] || opts.latencyMs) : 0,
      costTokens: opts.cost ? Number(opts.cost) : 0,
      qualityScore: opts.quality != null ? Number(opts.quality) : undefined,
      context: opts.context || null,
    };
    const r = bench.record(obs);
    if (!r.ok) {
      console.error(col(C.red, `  âœ— record failed: ${r.error}\n`));
      process.exit(1);
    }
    console.log(col(C.green, `\n  âœ“ recorded ${success ? 'success' : 'failure'} for ${opts.provider} / ${opts.task}\n`));
    return;
  }

  if (sub === 'pick') {
    const task = args.slice(1).join(' ').replace(/^["']|["']$/g, '');
    if (!task) {
      console.error(col(C.red, '  âœ— usage: purpclaw bench pick "<task>"\n'));
      process.exit(2);
    }
    const opts = parseFlags(args.slice(1).filter(a => a.startsWith('--')));
    const sinceMs = opts['since-ms'] ? Number(opts['since-ms']) : undefined;
    const parl = new ProviderParliament();
    const pick = parl.pickWithBenchmarks(task, { sinceMs });
    console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ“Š Empirical pick')}\n`);
    console.log(`  Task:      ${col(C.gray, task)}`);
    console.log(`  Task-type: ${col(C.gray, pick.taskType)}`);
    console.log(`  Pick:      ${col(C.green + C.bold, pick.provider || '(none)')}`);
    console.log(`  Rationale: ${col(C.gray, pick.rationale)}`);
    if (pick.empirical) {
      console.log(`  Empirical: ${col(C.gray, pick.empirical.reason)}`);
    }
    console.log('');
    return;
  }

  if (sub === 'reset') {
    const ok = bench._resetForTests();
    console.log(ok ? col(C.yellow, '\n  âš  bench history cleared (test-only)\n') : col(C.red, '\n  âœ— reset failed\n'));
    return;
  }

  console.error(col(C.red, `  âœ— unknown subcommand: ${sub}\n  try: purpclaw bench help\n`));
  process.exit(2);
}

async function cmdSkillForge(args) {
  const sf = require(path.join(PURP_DIR, 'lib', 'evolution', 'skill-forge'));
  const sub = (args[0] || 'help').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`\n  ${col(C.magenta + C.bold, 'âš’  SKILL FORGE â€” Commands')}`);
    console.log('  purpclaw skill-forge run                          Run gap-detector forge pass');
    console.log('  purpclaw skill-forge list [--status pending|validated|retired]');
    console.log('      List forged skills (optionally filtered by status).');
    console.log('  purpclaw skill-forge show <id>                    Show one forged skill + success-rate');
    console.log('  purpclaw skill-forge attach <id> --trigger "..." [--preconditions "a,b,c"] [--steps "x,y,z"]');
    console.log('      Attach trigger/preconditions/steps to a forged skill.');
    console.log('  purpclaw skill-forge record <id> --success|--failure');
    console.log('      Record an invocation outcome. Auto-evaluates lifecycle.');
    console.log('  purpclaw skill-forge evaluate <id>                Run lifecycle evaluation (promote/retire).');
    console.log('  purpclaw skill-forge help                         Show this help.\n');
    return;
  }

  if (sub === 'run') {
    const r = sf.runForgePass();
    console.log(`\n  ${col(C.cyan + C.bold, 'âš’  Forge pass complete')}`);
    console.log(`  Jobs surveyed:   ${col(C.gray, String(r.evidenceSummary.jobs))}`);
    console.log(`  Benchmarks seen: ${col(C.gray, String(r.evidenceSummary.benchmarks))}`);
    console.log(`  Proposals:       ${col(r.proposals.length ? C.yellow : C.green, String(r.proposals.length))}`);
    if (r.proposals.length) {
      for (const p of r.proposals) {
        console.log(`    ${col(C.cyan, p.id)}  ${col(C.gray, `(${p.kind} / ${p.status})`)}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'list') {
    const filterStatus = (args.find(a => a.startsWith('--status=')) || '').slice('--status='.length) || null;
    const items = sf.listForged(filterStatus ? { status: filterStatus } : {});
    console.log(`\n  ${col(C.cyan + C.bold, 'âš’  Forged skills')} ${col(C.gray, filterStatus ? `(status=${filterStatus})` : '(all)')}\n`);
    if (!items.length) {
      console.log(`  ${col(C.gray, '(none â€” run `purpclaw skill-forge run` to detect gaps)')}\n`);
      return;
    }
    for (const it of items) {
      const sr = (it.invocationCount || 0) > 0
        ? `${(it.successRate * 100).toFixed(0)}% (${it.successCount || 0}/${it.invocationCount})`
        : col(C.gray, 'no outcomes yet');
      const statusColor = it.status === 'validated' ? C.green
                       : it.status === 'retired'   ? C.red
                       : it.status === 'approved'  ? C.green
                       : C.yellow;
      console.log(`  ${col(C.cyan, it.id)}`);
      console.log(`    kind: ${col(C.gray, it.kind)}  status: ${col(statusColor, it.status)}  success-rate: ${sr}`);
      if (it.trigger) console.log(`    trigger: ${col(C.gray, it.trigger)}`);
    }
    console.log('');
    return;
  }

  if (sub === 'show') {
    const id = args[1];
    if (!id) {
      console.error(col(C.red, '  âœ— usage: purpclaw skill-forge show <id>\n'));
      process.exit(2);
    }
    const item = sf.getForged(id);
    if (!item) {
      console.error(col(C.red, `  âœ— no forged skill with id "${id}"\n`));
      process.exit(1);
    }
    const sr = sf.getSuccessRate(id);
    console.log(`\n  ${col(C.cyan + C.bold, 'âš’  ' + item.id)}\n`);
    console.log(`  Kind:         ${col(C.gray, item.kind)}`);
    console.log(`  Name:         ${col(C.gray, item.name || '(unnamed)')}`);
    console.log(`  Status:       ${col(C.gray, item.status)}`);
    console.log(`  Risk:         ${col(C.gray, item.risk || '(unspecified)')}`);
    if (item.trigger) {
      console.log(`  Trigger:      ${col(C.gray, item.trigger)}`);
      if (item.preconditions?.length) {
        console.log(`  Preconditions:`);
        for (const p of item.preconditions) console.log(`    - ${col(C.gray, p)}`);
      }
      if (item.steps?.length) {
        console.log(`  Steps:`);
        for (const s of item.steps) console.log(`    - ${col(C.gray, s)}`);
      }
    }
    if (sr && sr.invocationCount > 0) {
      console.log(`  Invocations:  ${col(C.cyan, String(sr.invocationCount))}`);
      console.log(`  Successes:    ${col(C.cyan, String(sr.successCount))}`);
      console.log(`  Success-rate: ${col(C.cyan, `${(sr.successRate * 100).toFixed(0)}%`)}`);
      console.log(`  Last outcome: ${col(C.gray, sr.lastOutcome || '(none)')}`);
    } else {
      console.log(`  ${col(C.gray, '(no outcomes recorded yet)')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'attach') {
    const id = args[1];
    if (!id) {
      console.error(col(C.red, '  âœ— usage: purpclaw skill-forge attach <id> --trigger "..." [opts]\n'));
      process.exit(2);
    }
    const opts = parseFlags(args.slice(2));
    if (!opts.trigger) {
      console.error(col(C.red, '  âœ— --trigger is required\n'));
      process.exit(2);
    }
    const preconditions = opts.preconditions ? String(opts.preconditions).split(',').map(s => s.trim()).filter(Boolean) : [];
    const steps = opts.steps ? String(opts.steps).split(',').map(s => s.trim()).filter(Boolean) : [];
    const r = sf.attachSkillSpec(id, { trigger: opts.trigger, preconditions, steps });
    if (!r.ok) {
      console.error(col(C.red, `  âœ— attach failed: ${r.error}\n`));
      process.exit(1);
    }
    console.log(`\n  ${col(C.green, 'âœ“')} attached spec to ${col(C.cyan, r.id)}`);
    console.log(`  Trigger:      ${col(C.gray, r.spec.trigger)}`);
    console.log(`  Preconditions: ${col(C.gray, String(r.spec.preconditions.length))}`);
    console.log(`  Steps:         ${col(C.gray, String(r.spec.steps.length))}\n`);
    return;
  }

  if (sub === 'record') {
    const id = args[1];
    if (!id) {
      console.error(col(C.red, '  âœ— usage: purpclaw skill-forge record <id> --success|--failure\n'));
      process.exit(2);
    }
    const opts = parseFlags(args.slice(2));
    let success;
    if (opts.success === true || opts.success === 'true')  success = true;
    else if (opts.failure === true || opts.failure === 'true') success = false;
    else if (opts.success === false || opts.failure === false) {
      success = opts.success === false ? false : (opts.failure === false ? false : undefined);
      if (success === undefined) {
        console.error(col(C.red, '  âœ— pass exactly one of --success or --failure\n'));
        process.exit(2);
      }
    } else {
      console.error(col(C.red, '  âœ— pass exactly one of --success or --failure\n'));
      process.exit(2);
    }
    const r = sf.recordOutcome(id, success);
    if (!r.ok) {
      console.error(col(C.red, `  âœ— record failed: ${r.error}\n`));
      process.exit(1);
    }
    const lifecycle = sf.evaluateLifecycle(id);
    const vColor = r.lastOutcome === 'success' ? C.green : C.red;
    console.log(`\n  ${col(vColor, '\u2713')} recorded ${r.lastOutcome} for ${col(C.cyan, r.id)}`);
    console.log(`  Invocations:  ${col(C.cyan, String(r.invocationCount))}`);
    console.log(`  Success-rate: ${col(C.cyan, `${(r.successRate * 100).toFixed(0)}%`)}`);
    if (lifecycle.action === 'validated') {
      console.log(`  ${col(C.green + C.bold, '\u2191 auto-validated')} ${col(C.gray, '(promoted to hot path)')}`);
    } else if (lifecycle.action === 'retired') {
      console.log(`  ${col(C.red + C.bold, '\u2193 auto-retired')} ${col(C.gray, '(never invoke again)')}`);
    } else {
      console.log(`  ${col(C.gray, '(no lifecycle change)')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'evaluate') {
    const id = args[1];
    if (!id) {
      console.error(col(C.red, '  âœ— usage: purpclaw skill-forge evaluate <id>\n'));
      process.exit(2);
    }
    const r = sf.evaluateLifecycle(id);
    if (!r.ok) {
      console.error(col(C.red, `  âœ— evaluate failed: ${r.id}\n`));
      process.exit(1);
    }
    if (r.action === 'validated') {
      console.log(col(C.green, `\n  \u2191 ${r.id} validated (auto-promoted to hot path)\n`));
    } else if (r.action === 'retired') {
      console.log(col(C.red, `\n  \u2193 ${r.id} retired (auto-retired due to low success-rate)\n`));
    } else {
      console.log(col(C.gray, `\n  ~ ${r.id} unchanged (thresholds not met)\n`));
    }
    return;
  }

  console.error(col(C.red, `  âœ— unknown subcommand: ${sub}\n  try: purpclaw skill-forge help\n`));
  process.exit(2);
}

// â”€â”€ dream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdDream() {
  console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ’¤ AUTODREAM â€” Memory Consolidation')}\n`);

  // Try autoDream HTTP server first (port 7895), fall back to memory matrix
  let tried = 'autodream';
  try {
    console.log(col(C.gray, '  Triggering autoDream consolidation cycle (port 7895)...\n'));
    const result = await httpPost(PORTS.dream, '/dream', { force: true }, 30000);
    if (result.status >= 400) {
      console.error(col(C.red, `  âœ— Dream error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const r = result.body;
    if (r.skipped) {
      console.log(`  ${col(C.yellow, '~')} Dream skipped â€” ${r.skipped}`);
    } else {
      console.log(`  ${col(C.green, 'âœ“')} Dream cycle complete`);
      if (r.entriesMerged  !== undefined) console.log(`  Merged     : ${col(C.cyan, String(r.entriesMerged))} entries`);
      if (r.rulesExtracted !== undefined) console.log(`  Rules      : ${col(C.cyan, String(r.rulesExtracted))} extracted`);
      if (r.archived       !== undefined) console.log(`  Archived   : ${col(C.gray, String(r.archived))} old entries`);
    }
    console.log('');
    return;
  } catch (e) {
    if (e.code !== 'ECONNREFUSED') {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
      return;
    }
    // autoDream offline â€” fall through to memory matrix
  }

  tried = 'memory-matrix';
  console.log(col(C.gray, '  autoDream offline â€” falling back to memory matrix (port 7880)...\n'));
  try {
    const result = await httpPost(PORTS.memory, '/dream', { mode: 'full' }, 30000);
    if (result.status >= 400) {
      console.error(col(C.red, `  âœ— Dream cycle error: ${JSON.stringify(result.body)}\n`));
      return;
    }
    const r = result.body;
    console.log(`  ${col(C.green, 'âœ“')} Dream cycle complete (via memory matrix)`);
    if (r.phase)        console.log(`  Phase      : ${col(C.cyan, r.phase)}`);
    if (r.consolidated) console.log(`  Consolidated: ${col(C.cyan, String(r.consolidated))} memories`);
    if (r.pruned)       console.log(`  Pruned     : ${col(C.gray, String(r.pruned))} stale memories`);
    if (r.symbols)      console.log(`  Symbols    : ${col(C.cyan, String(r.symbols))} lifted`);
    console.log('');
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error(col(C.red, `  âœ— Both autoDream (7895) and memory matrix (7880) offline. Run \`purpclaw start\`.\n`));
    } else {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
    }
  }
}

// â”€â”€ forge â€” create a new lobster agent from a gacha soul draw â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdLora(args) {
  const sub = (args[0] || 'help').toLowerCase();
  const path_mod = require('path');

  // â”€â”€ Parse flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const flags = { personal: false, merge: false };
  const cleanArgs = args.filter(a => {
    if (a === '--personal') { flags.personal = true; return false; }
    if (a === '--merge') { flags.merge = true; return false; }
    return true;
  });

  console.log('');
  if (flags.personal) {
    console.log(`  \\x1b[1m\\x1b[35mðŸ§   PURPCLAW LORA â€” PERSONAL PASS\\x1b[0m  \\x1b[90mÂ· training on YOUR corrections\\x1b[0m`);
  } else {
    console.log(`  \\x1b[1m\\x1b[35mðŸ§   PURPCLAW LORA\\x1b[0m  \\x1b[90mÂ· LoRA fine-tuning pipeline\\x1b[0m`);
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

    // â”€â”€ Personal training data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let personalStats = null;
    try { personalStats = require(path.join(PURP_DIR, 'lib', 'training', 'personal-dataset')).stats(); }
    catch { personalStats = { corrections: 0, preferences: 0, edits: 0, readyForTraining: false }; }

    const personalTotal = personalStats.corrections + personalStats.preferences + personalStats.edits;
    console.log(`  \\x1b[36mpersonal data:\\x1b[0m   ${personalTotal} examples (${personalStats.corrections} corrections, ${personalStats.preferences} preferences, ${personalStats.edits} edits)`);
    if (personalTotal >= 10) {
      console.log(`  \\x1b[32mâœ“\\x1b[0m  personal data ready. run: \\x1b[36mpurpclaw lora train --personal\\x1b[0m`);
    } else if (personalTotal > 0) {
      console.log(`  \\x1b[33mâŸ³\\x1b[0m  collecting personal data... (${personalTotal}/10, need ${10-personalTotal} more)`);
    } else {
      console.log(`  \\x1b[90mâ—‹\\x1b[0m  no personal data yet. use PurpClaw normally â€” corrections auto-capture`);
    }
    console.log('');
    if (examples < 10 && personalTotal < 10) {
      console.log(`  \\x1b[33mâš \\x1b[0m  need at least 10 examples to train (general or personal). let the runtime accumulate.`);
    }
    console.log('');
    return;
  }

  if (sub === 'train') {
    // â”€â”€ Personal training pass â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (flags.personal) {
      const pd = require(path.join(PURP_DIR, 'lib', 'training', 'personal-dataset'));
      const exported = pd.exportToFile('chatml');
      if (!exported.ready) {
        console.log(`  \\x1b[33mâš \\x1b[0m  ${exported.reason}`);
        console.log(`  \\x1b[90mUse PurpClaw normally â€” every correction auto-captures to ${pd.FEEDBACK_DIR}\\x1b[0m`);
        console.log('');
        return;
      }
      console.log(`  \\x1b[36mpersonal dataset:\\x1b[0m ${exported.count} examples â†’ ${exported.path}`);
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
          console.log(`  \\x1b[32mâœ“\\x1b[0m  Personal LoRA training complete.`);
          console.log(`  \\x1b[90mYour model now knows your preferences. Every correction made it smarter.\\x1b[0m`);
        } else {
          console.log(`  \\x1b[31mâœ—\\x1b[0m  personal training exited with code ${code}`);
        }
        console.log('');
      });
      return;
    }

    // â”€â”€ General training pass â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        console.log(`  \\x1b[32mâœ“\\x1b[0m  LoRA pipeline complete.`);
        console.log(`  \\x1b[90mnext:\\x1b[0m  pm2 restart purpclaw-api  \\x1b[90mâ€” to pick up the new LLM_MODEL\\x1b[0m`);
      } else {
        console.log(`  \\x1b[31mâœ—\\x1b[0m  pipeline exited with code ${code}`);
      }
      console.log('');
    });
    return;
  }

  console.log(`  \x1b[33munknown subcommand. try:\x1b[0m  purpclaw lora help\n`);
}

// â”€â”€ Web search (MiniMax Code's "Web Search & Data" support capability) â”€â”€â”€â”€â”€â”€â”€

async function cmdWebsearch(args) {
  const sub = (args[0] || 'help').toLowerCase();
  if (sub === 'help' || sub === '-h' || sub === '--help') {
    console.log('\n  purpclaw websearch â€” real Bing search + HTTP fetch (no API key)\n'
      + '  Subcommands:\n'
      + '    purpclaw websearch search <query>      Bing web search, returns top 10 results\n'
      + '    purpclaw websearch fetch <url>          Fetch a URL, return title + text\n'
      + '    purpclaw websearch ping <url>          Probe a URL (status + latency)\n'
      + '    purpclaw websearch help                Show this help\n');
    return;
  }

  let driver;
  try {
    ({ WebsearchDriver: driver } = require('../lib/control/drivers/websearch.js'));
  } catch (e) {
    console.error(`  \x1b[31merror loading websearch.js:\x1b[0m ${e.message}`);
    return;
  }
  const ws = new driver();
  const rest = args.slice(1).join(' ').trim();

  if (sub === 'search') {
    if (!rest) { console.log('  \x1b[33musage:\x1b[0m  purpclaw websearch search <query>'); return; }
    const r = await ws.execute({ capability: 'websearch.search', args: { query: rest, limit: 10 } });
    if (r.status !== 'SUCCESS') { console.log(`  \x1b[31mfail:\x1b[0m ${r.error}`); return; }
    console.log(`  \x1b[36m${r.resultCount}\x1b[0m results for "\x1b[1m${r.query}\x1b[0m" (${r.durationMs}ms)\n`);
    for (const hit of r.results) {
      console.log(`    \x1b[1m${hit.title}\x1b[0m`);
      console.log(`      ${hit.url}`);
      if (hit.snippet) console.log(`      ${hit.snippet.slice(0, 140)}${hit.snippet.length > 140 ? 'â€¦' : ''}`);
      console.log('');
    }
    return;
  }

  if (sub === 'fetch') {
    if (!rest) { console.log('  \x1b[33musage:\x1b[0m  purpclaw websearch fetch <url>'); return; }
    const r = await ws.execute({ capability: 'websearch.fetch', args: { url: rest } });
    if (r.status !== 'SUCCESS') { console.log(`  \x1b[31mfail:\x1b[0m ${r.error}`); return; }
    console.log(`  \x1b[36m${r.statusCode}\x1b[0m ${r.finalUrl} (${r.textLength} chars, ${r.durationMs}ms)`);
    if (r.title) console.log(`  title: \x1b[1m${r.title}\x1b[0m`);
    console.log(`  ---`);
    console.log(r.text.split('\n').map(l => '  ' + l).join('\n'));
    return;
  }

  if (sub === 'ping') {
    if (!rest) { console.log('  \x1b[33musage:\x1b[0m  purpclaw websearch ping <url>'); return; }
    const r = await ws.execute({ capability: 'websearch.ping', args: { url: rest } });
    console.log(`  status: \x1b[36m${r.statusCode}\x1b[0m  latency: \x1b[36m${r.latencyMs}ms\x1b[0m  url: ${r.finalUrl}`);
    if (r.error) console.log(`  \x1b[31merror:\x1b[0m ${r.error}`);
    return;
  }

  console.log(`  \x1b[33munknown subcommand:\x1b[0m ${sub}. try: purpclaw websearch help`);
}

// â”€â”€ Team formation (Hermes / MiniMax-style multi-agent) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cmdTeam(args) {
  // subcommands: form <task...> | help
  const sub = (args[0] || 'help').toLowerCase();
  if (sub === 'help' || sub === '-h' || sub === '--help') {
    console.log('\n  purpclaw team â€” form an agent team for a task\n'
      + '  Subcommands:\n'
      + '    purpclaw team form <task>     Form a team (lead/executor/reviewer/supporter) for a task\n'
      + '    purpclaw team help             Show this help\n\n'
      + '  Stolen from Hermes harness and MiniMax Code harness.\n'
      + '  Scans the 95-soul registry for keyword matches and assigns roles by division.\n');
    return;
  }
  if (sub === 'form') {
    const task = args.slice(1).join(' ').trim();
    if (!task) {
      console.log('  \x1b[33musage:\x1b[0m  purpclaw team form <task>');
      return;
    }
    let tf;
    try {
      ({ TeamFormation: tf } = require('../lib/team-formation.js'));
    } catch (e) {
      console.error(`  \x1b[31merror loading team-formation.js:\x1b[0m ${e.message}`);
      return;
    }
    const team = new tf();
    const r = team.formTeam(task, { teamSize: 4 });
    console.log(`  task: \x1b[36m"${task}"\x1b[0m`);
    console.log(`  ${r.rationale}\n`);
    for (const m of r.members) {
      const role = m.role.padEnd(10);
      const score = String(m.score).padStart(3);
      const tags = m.matchedTerms.length ? `matched=${m.matchedTerms.join(',')}` : 'matched=-';
      console.log(`    [${role}] ${m.name.padEnd(20)}  score=${score}  division=${(m.division||'?').padEnd(12)}  ${tags}`);
    }
    if (r.members.length === 0) {
      console.log('    (no soul matched the task â€” try different keywords)');
    }
    return;
  }
  console.log(`  \x1b[33munknown subcommand:\x1b[0m ${sub}. try: purpclaw team help`);
}

// â”€â”€ Team roster (persistent role identity) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cmdTeamRoster(args) {
  // subcommands: list | show | clear | form-persist | help
  const sub = (args[0] || 'help').toLowerCase();
  const { TeamRoster, ROSTER_SCHEMA, HISTORY_CAP, VALID_ROLES } = require('../lib/team-roster.js');
  const { TeamFormation, formPersistentTeam } = require('../lib/team-formation.js');
  const defaultRoot = path.join(PURP_DIR, '.purpclaw', 'teams');

  function parsePath(args, startIdx) {
    for (let i = startIdx; i < args.length; i++) {
      if (args[i] === '--path') return args[i + 1];
      if (args[i] === '--root') return require('../lib/team-roster.js').defaultRosterPath(args[i + 1]);
    }
    return require('../lib/team-roster.js').defaultRosterPath(defaultRoot);
  }

  if (sub === 'help' || sub === '-h' || sub === '--help') {
    console.log('\n  purpclaw team-roster â€” persistent role identity for formed teams\n'
      + '  Stolen from MiniMax\'s "Agent Teams with stable role identity".\n\n'
      + '  Subcommands:\n'
      + '    purpclaw team-roster list                          Show the current roster\n'
      + '    purpclaw team-roster show [--path <file>]          Show full roster file contents\n'
      + '    purpclaw team-roster form-persist <task...>        Form a team + persist roles to disk\n'
      + '    purpclaw team-roster clear [--path <file>]         Wipe the roster file\n'
      + '    purpclaw team-roster help                          Show this help\n\n'
      + `  Default path: ${defaultRoot}/team-roster.json\n`
      + `  Schema: ${ROSTER_SCHEMA}  History cap: ${HISTORY_CAP}  Roles: ${[...VALID_ROLES].join(', ')}\n`);
    return;
  }

  if (sub === 'list') {
    const p = parsePath(args, 1);
    const r = new TeamRoster({ path: p });
    if (r.exists()) r.load();
    const s = r.summary();
    console.log(`  roster: ${s.path}`);
    console.log(`  updated: ${new Date(s.updatedAt).toISOString()}  filled: ${s.filledSlots}/${s.totalSlots}  history: ${s.historySize}/${s.historyCap}`);
    for (const [role, entry] of Object.entries(s.activeRoles)) {
      if (entry) {
        const since = new Date(entry.since).toISOString();
        console.log(`    [${role.padEnd(10)}] ${entry.name.padEnd(24)}  id=${entry.soulId}  since=${since}`);
      } else {
        console.log(`    [${role.padEnd(10)}] (empty)`);
      }
    }
    if (!r.exists()) console.log('  (file does not exist yet â€” no persistent roles)');
    return;
  }

  if (sub === 'show') {
    const p = parsePath(args, 1);
    const r = new TeamRoster({ path: p });
    if (!r.exists()) {
      console.log('  (file does not exist yet)');
      return;
    }
    r.load();
    const s = r.summary();
    console.log(`  path: ${s.path}`);
    console.log(`  activeRoles: ${JSON.stringify(s.activeRoles, null, 2)}`);
    console.log(`  history (last ${s.historySize}):`);
    for (const h of r.history.slice(-10)) {
      console.log(`    ${new Date(h.formedAt).toISOString()}  "${h.task}"  members=${h.members.length}  replaced=${h.replaced.length}`);
    }
    return;
  }

  if (sub === 'form-persist') {
    // Collect task words up to the first --flag.
    const taskArgs = [];
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) break;
      taskArgs.push(args[i]);
    }
    const task = taskArgs.join(' ').trim();
    if (!task) {
      console.log('  \x1b[33musage:\x1b[0m  purpclaw team-roster form-persist <task> [--path <file>] [--root <dir>]');
      return;
    }
    const p = parsePath(args, 1);
    const tf = new TeamFormation();
    const r = new TeamRoster({ path: p });
    r.load();
    const out = formPersistentTeam(task, { teamFormation: tf, roster: r, teamSize: 4 });
    const f = out.formation.formation;
    console.log(`  task: \x1b[36m"${task}"\x1b[0m`);
    console.log(`  ${out.formation.rationale}\n`);
    if (f.lead) console.log(`    lead:      ${f.lead.name} (id=${f.lead.id}, score=${f.lead.score})`);
    if (f.executor) console.log(`    executor:  ${f.executor.name} (id=${f.executor.id}, score=${f.executor.score})`);
    if (f.reviewer) console.log(`    reviewer:  ${f.reviewer.name} (id=${f.reviewer.id}, score=${f.reviewer.score})`);
    if (f.supporter) console.log(`    supporter: ${f.supporter.name} (id=${f.supporter.id}, score=${f.supporter.score})`);
    console.log(`\n  persisted to: ${p}`);
    return;
  }

  if (sub === 'clear') {
    const p = parsePath(args, 1);
    const r = new TeamRoster({ path: p });
    if (r.exists()) {
      r.load();
      r.clear();
      r.save();
      console.log(`  wiped: ${p}`);
    } else {
      console.log(`  (nothing to clear â€” file does not exist: ${p})`);
    }
    return;
  }

  console.log(`  \x1b[33munknown subcommand:\x1b[0m ${sub}. try: purpclaw team-roster help`);
}

// â”€â”€ Hierarchical Skills (MiniMax steal â€” typed-edge composition) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cmdSkillGraph(args) {
  // subcommands: list | plan <id> | validate | help
  const sub = (args[0] || 'help').toLowerCase();
  const { SkillGraph, loadSeedCatalog } = require('../lib/evolution/skill-graph.js');
  const path = require('path');

  if (sub === 'help' || sub === '-h' || sub === '--help') {
    console.log('\n  purpclaw skill-graph â€” Hierarchical Skills (typed-edge composition)\n'
      + '  Stolen from MiniMax\'s "Hierarchical Skills (composable + chainable)" (2026-08).\n\n'
      + '  Subcommands:\n'
      + '    purpclaw skill-graph list                       List all skills in the catalog\n'
      + '    purpclaw skill-graph plan <target-skill-id>     Plan the ordered chain to reach a skill\n'
      + '    purpclaw skill-graph validate                   Check for cycles + missing requirements\n'
      + '    purpclaw skill-graph help                       Show this help\n\n'
      + '  Seed catalog: data/registries/skills/catalog.json (7 skills, 5-stage release pipeline)\n');
    return;
  }

  if (sub === 'list') {
    let explicitPath;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--catalog') { explicitPath = args[i + 1]; break; }
    }
    const g = loadSeedCatalog({ path: explicitPath });
    if (!g) {
      console.log('  (catalog not found)');
      return;
    }
    console.log(`  ${g.size} skills\n`);
    for (const s of g.list()) {
      const req = s.requires.length ? s.requires.join(', ') : '(none)';
      const prod = s.produces.length ? s.produces.join(', ') : '(none)';
      console.log(`    ${s.id.padEnd(20)}  requires: ${req.padEnd(28)}  produces: ${prod}`);
    }
    return;
  }

  if (sub === 'plan') {
    const target = args[1];
    if (!target) { console.log('  usage: purpclaw skill-graph plan <target-skill-id>'); return; }
    const g = loadSeedCatalog();
    if (!g) { console.log('  (catalog not found)'); return; }
    try {
      const chain = g.plan(target);
      console.log(`  plan for "${target}": ${chain.length} skill(s) in order\n`);
      for (let i = 0; i < chain.length; i++) {
        const skill = g.get(chain[i]);
        console.log(`    ${(i + 1).toString().padStart(2)}. ${chain[i].padEnd(20)}  produces: ${skill.produces.join(', ') || '(none)'}`);
      }
    } catch (err) {
      console.log(`  \x1b[31merror:\x1b[0m ${err.message}`);
    }
    return;
  }

  if (sub === 'validate') {
    const g = loadSeedCatalog();
    if (!g) { console.log('  (catalog not found)'); return; }
    const v = g.validate();
    if (v.ok) {
      console.log('  \x1b[32mok\x1b[0m â€” no cycles, no missing requirements');
    } else {
      console.log('  \x1b[31mfail\x1b[0m');
      if (v.cycles.length) {
        console.log(`  ${v.cycles.length} cycle(s):`);
        for (const c of v.cycles) console.log(`    ${c.join(' -> ')}`);
      }
      if (v.missing.length) {
        console.log(`  ${v.missing.length} missing requirement(s):`);
        for (const [sid, req] of v.missing) console.log(`    ${sid} requires "${req}" (no skill with that id produces that name)`);
      }
    }
    return;
  }

  console.log(`  \x1b[33munknown subcommand:\x1b[0m ${sub}. try: purpclaw skill-graph help`);
}

// â”€â”€ Sub-agent bridges (claude-code, codex, dsh, custom) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cmdSubagent(args) {
  // subcommands: list | health | call <bridge> <task...>
  const sub = (args[0] || 'list').toLowerCase();
  if (sub === 'help' || sub === '-h' || sub === '--help') {
    console.log('\n  purpclaw subagent â€” delegate tasks to external agent CLIs\n'
      + '  Subcommands:\n'
      + '    purpclaw subagent list              List registered bridges\n'
      + '    purpclaw subagent health            Show health of all bridges\n'
      + '    purpclaw subagent call <bridge> <task>   Invoke a bridge with a task\n\n'
      + '  Bridges:\n'
      + '    claude-code    Claude Code (Anthropic) â€” "claude -p <task>"\n'
      + '    codex          Codex (OpenAI)         â€” "codex exec <task>"\n'
      + '    dsh            DeepSeek Harness       â€” "dsh run <task>"\n');
    return;
  }

  const bridgeMod = require('../lib/subagent-bridge.js');
  const bridges = bridgeMod.list;
  const get = bridgeMod.get;
  const healthAll = bridgeMod.healthAll;

  if (sub === 'list') {
    const items = bridges();
    console.log(`  registered bridges: ${items.length}\n`);
    for (const b of items) {
      console.log(`    ${b.name.padEnd(20)}  ${b.displayName.padEnd(30)}  bin=${b.bin}`);
    }
    return;
  }

  if (sub === 'health') {
    const results = healthAll();
    for (const h of results) {
      const icon = h.status === 'HEALTHY' ? '\x1b[32mâ—\x1b[0m' : '\x1b[31mâ—\x1b[0m';
      const ver = h.version || '(no version)';
      const where = h.binPath || '(not found)';
      console.log(`    ${icon} ${h.name.padEnd(20)}  status=${h.status.padEnd(8)}  v=${ver.slice(0, 40).padEnd(40)}  ${where}`);
    }
    return;
  }

  if (sub === 'call') {
    const bridgeName = args[1];
    const task = args.slice(2).join(' ').trim();
    if (!bridgeName || !task) {
      console.log('  \x1b[33musage:\x1b[0m  purpclaw subagent call <bridge> <task>');
      return;
    }
    const b = get(bridgeName);
    if (!b) {
      console.log(`  \x1b[31munknown bridge:\x1b[0m ${bridgeName}`);
      console.log(`  \x1b[33mavailable:\x1b[0m ${bridges().map(x => x.name).join(', ')}`);
      return;
    }
    const h = b.health();
    if (h.status !== 'HEALTHY') {
      console.log(`  \x1b[31mbinary not available:\x1b[0m ${b.bin} (${h.problems.map(p => p.code).join(', ')})`);
      return;
    }
    console.log(`  invoking \x1b[36m${bridgeName}\x1b[0m with task: ${task.slice(0, 80)}${task.length > 80 ? 'â€¦' : ''}`);
    const r = await b.call(task, { timeoutMs: 300000 });
    console.log(`  status: ${r.ok ? '\x1b[32mok\x1b[0m' : '\x1b[31mfail\x1b[0m'}  exit=${r.exitCode}  duration=${r.durationMs}ms  mode=${r.raw && r.raw.mode}`);
    if (r.text) console.log(`  text: ${r.text.slice(0, 500)}${r.text.length > 500 ? 'â€¦' : ''}`);
    if (r.json) console.log(`  json: ${JSON.stringify(r.json).slice(0, 500)}`);
    if (r.error) console.log(`  \x1b[31merror:\x1b[0m ${r.error}`);
    return;
  }

  console.log(`  \x1b[33munknown subcommand:\x1b[0m ${sub}. try: purpclaw subagent help`);
}

// â”€â”€ Forge Code (DeepSeek's code-runtime â€” PTC: one program, N tool calls) â”€â”€â”€â”€â”€

async function cmdForgeCode(args) {
  // subcommands: run --program <src> [--cwd <dir>] | run --task <text> | demo | help
  const sub = (args[0] || 'help').toLowerCase();
  if (sub === 'help' || sub === '-h' || sub === '--help') {
    console.log('\n  purpclaw forge-code â€” DeepSeek-style Code Mode (PTC)\n'
      + '  The model writes ONE program that calls N tools in a single execution,\n'
      + '  instead of N separate LLM round-trips. Same Service Definition as\n'
      + '  DeepSeek Harness\'s @deepseek-ai/dsh-code-runtime (MIT, 2026-06).\n\n'
      + '  Subcommands:\n'
      + '    purpclaw forge-code run --program <src>   Run a JS program against tool bindings\n'
      + '    purpclaw forge-code demo                  Built-in demo (read, write, edit, glob, grep)\n\n'
      + '  Optional flags:\n'
      + '    --cwd <dir>      Working directory (default: process.cwd())\n'
      + '    --timeout <ms>   Hard timeout (default: 10000ms)\n'
      + '    --output <bytes> Max output bytes (default: 256KB)\n\n'
      + '  Bindings exposed: tools.{read_file, write_file, edit_file, glob, grep, run_command}\n'
      + '  Error class:      ToolCallError (program-side instanceof works)\n');
    return;
  }

  let effectiveSub = sub;
  if (sub === 'demo') {
    const program = [
      "// One program = one LLM round-trip = many tool calls.",
      "const found = await tools.glob({ pattern: 'lib/forge/*.js' });",
      "const sample = found.files[0];",
      "const r = await tools.read_file({ path: sample });",
      "return { matched: found.files.length, sample, sample_bytes: r.bytes, sample_lines: r.lines };",
    ].join('\n');
    args = ['run', '--program', program];
    effectiveSub = 'run';
  }

  if (effectiveSub === 'run') {
    const codeRuntime = require('../lib/forge/code-runtime-vm.js');
    const bindings = require('../lib/forge/code-runtime-bindings.js');
    let program = null;
    let cwd = process.cwd();
    let timeoutMs = 10000;
    let outputBytes = 256 * 1024;
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === '--program') { program = args[++i]; }
      else if (a === '--cwd') { cwd = args[++i]; }
      else if (a === '--timeout') { timeoutMs = parseInt(args[++i], 10); }
      else if (a === '--output') { outputBytes = parseInt(args[++i], 10); }
    }
    if (!program) {
      console.log('  \x1b[33m--program is required\x1b[0m');
      console.log('  \x1b[33mtip: try `purpclaw forge-code demo`\x1b[0m');
      return;
    }
    const rt = new codeRuntime.VMCodeRuntime({ maxOutputBytes: outputBytes, defaultTimeoutMs: timeoutMs });
    const toolsNs = bindings.buildToolsNamespace({ cwd });
    const t0 = Date.now();
    const r = await rt.run({ program, bindings: [toolsNs] });
    const elapsed = Date.now() - t0;
    console.log(`  purpclaw forge-code â€” vm-context backend (timeout=${timeoutMs}ms, maxOutput=${outputBytes}B)\n`);
    if (r.error) {
      console.log(`  status: \x1b[31mfail\x1b[0m  kind=${r.error.kind}  elapsed=${elapsed}ms`);
      console.log(`  error: ${r.error.message.split('\n').slice(0, 6).join('\n         ')}`);
    } else {
      console.log(`  status: \x1b[32mok\x1b[0m  elapsed=${elapsed}ms  logs=${r.logs.length}`);
    }
    if (r.logs && r.logs.length) {
      console.log('  --- logs ---');
      for (const l of r.logs.slice(0, 10)) console.log(`    ${l}`);
    }
    if (r.value !== undefined) {
      console.log('  --- value ---');
      console.log('  ' + JSON.stringify(r.value, null, 2).split('\n').join('\n  '));
    }
    return;
  }

  console.log(`  \x1b[33munknown subcommand:\x1b[0m ${sub}. try: purpclaw forge-code help`);
}

// â”€â”€ Session log (DeepSeek's append-only JSONL with fork + replay) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cmdSessionLog(args) {
  // subcommands: new | list | show | append | fork | replay | help
  const sub = (args[0] || 'help').toLowerCase();
  const sessionLog = require('../lib/session-log.js');
  const { SessionLog, newSessionId, listSessions } = sessionLog;
  const defaultRoot = path.join(PURP_DIR, '.purpclaw', 'sessions');

  function parseRoot(args, startIdx) {
    for (let i = startIdx; i < args.length; i++) {
      if (args[i] === '--root') return args[i + 1];
    }
    return defaultRoot;
  }

  if (sub === 'help' || sub === '-h' || sub === '--help') {
    console.log('\n  purpclaw session-log â€” append-only JSONL with header + seq contiguity\n'
      + '  Stolen from DeepSeek Harness\'s @deepseek-ai/dsh-session-persistence-jsonl (MIT, 2026-08).\n\n'
      + '  Subcommands:\n'
      + '    purpclaw session-log new [--root <dir>]    Create a new session, print the id\n'
      + '    purpclaw session-log list [--root <dir>]   List all sessions under root\n'
      + '    purpclaw session-log show <id>             Show header + every event in seq order\n'
      + '    purpclaw session-log append <id> <type> <json-data>   Append one event\n'
      + '    purpclaw session-log fork <id> --new-id <nid>          Fork a session\n'
      + '    purpclaw session-log replay <id>          Replay events (prints each line)\n\n'
      + '  Default root: ' + defaultRoot + '\n');
    return;
  }

  if (sub === 'new') {
    const root = parseRoot(args, 1);
    const id = newSessionId();
    const log = new SessionLog({ root, id, cwd: process.cwd() });
    await log.create();
    console.log(`  created session: ${id}\n  root: ${root}\n  path: ${log.filePath()}`);
    return;
  }

  if (sub === 'list') {
    const root = parseRoot(args, 1);
    const ids = listSessions(root);
    console.log(`  ${ids.length} session(s) under ${root}\n`);
    for (const id of ids) console.log(`    ${id}`);
    return;
  }

  if (sub === 'show') {
    const id = args[1];
    if (!id) { console.log('  usage: purpclaw session-log show <id>'); return; }
    const root = parseRoot(args, 2);
    const log = new SessionLog({ root, id });
    const view = await log.read();
    console.log(`  session: ${id}`);
    console.log(`  parent:  ${view.header.parentSession || '(top-level)'}`);
    console.log(`  created: ${new Date(view.header.createdAt).toISOString()}`);
    console.log(`  events:  ${view.count}\n`);
    for (const ev of view.events) {
      const t = new Date(ev.ts).toISOString();
      console.log(`    [${ev.seq}] ${t}  ${ev.type}  ${JSON.stringify(ev.data).slice(0, 120)}`);
    }
    return;
  }

  if (sub === 'append') {
    const id = args[1];
    const type = args[2];
    // Collect data args up to the first --flag (so --root doesn't leak in).
    const dataArgs = [];
    let rootStartIdx = args.length;
    for (let i = 3; i < args.length; i++) {
      if (args[i].startsWith('--')) { rootStartIdx = i; break; }
      dataArgs.push(args[i]);
    }
    const dataStr = dataArgs.join(' ');
    if (!id || !type || !dataStr) {
      console.log('  usage: purpclaw session-log append <id> <type> <json-data>');
      return;
    }
    let data;
    try { data = JSON.parse(dataStr); }
    catch (err) { console.log(`  \x1b[31minvalid JSON for data:\x1b[0m ${err.message}`); return; }
    const root = parseRoot(args, rootStartIdx);
    const log = new SessionLog({ root, id });
    const seq = await log.append({ type, data });
    console.log(`  appended seq=${seq}  type=${type}  path=${log.filePath()}`);
    return;
  }

  if (sub === 'fork') {
    const id = args[1];
    let newId = null;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--new-id') newId = args[i + 1];
    }
    if (!id || !newId) {
      console.log('  usage: purpclaw session-log fork <id> --new-id <nid>');
      return;
    }
    const root = parseRoot(args, 4);
    const log = new SessionLog({ root, id });
    const child = await log.fork({ newId });
    console.log(`  forked: ${id}  ->  ${newId}\n  child path: ${child.filePath()}`);
    return;
  }

  if (sub === 'replay') {
    const id = args[1];
    if (!id) { console.log('  usage: purpclaw session-log replay <id>'); return; }
    const root = parseRoot(args, 2);
    const log = new SessionLog({ root, id });
    const summary = await log.replay({
      onHeader: (h) => console.log(`  [header]  id=${h.id}  parent=${h.parentSession || '(none)'}  created=${new Date(h.createdAt).toISOString()}`),
      onEvent: (ev) => console.log(`  [${ev.seq}]  ${new Date(ev.ts).toISOString()}  ${ev.type}  ${JSON.stringify(ev.data).slice(0, 200)}`),
    });
    console.log(`\n  replayed ${summary.replayed} event(s).`);
    return;
  }

  console.log(`  \x1b[33munknown subcommand:\x1b[0m ${sub}. try: purpclaw session-log help`);
}

// â”€â”€ Forge Loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cmdForgeStatus() {
  const CHECKPOINT_DIR = path.join(PURP_DIR, '.purpclaw', 'forge', 'checkpoints');
  const INTERRUPT_FILE = path.join(PURP_DIR, '.purpclaw', 'forge', 'interrupt');

  let latestCp = null;
  let latestTs = 0;
  try {
    const files = fs.readdirSync(CHECKPOINT_DIR).filter(f => f.startsWith('cp-') && f.endsWith('.json'));
    for (const file of files) {
      const stat = fs.statSync(path.join(CHECKPOINT_DIR, file));
      if (stat.mtimeMs > latestTs) {
        latestTs = stat.mtimeMs;
        latestCp = file;
      }
    }
  } catch {
    // checkpoint dir doesn't exist yet
  }

  const isInterrupted = fs.existsSync(INTERRUPT_FILE);

  if (!latestCp) {
    console.log('\n  Forge Loop â€” no checkpoints found.\n');
    if (isInterrupted) console.log('  ' + col(C.yellow, 'âš  Interrupt flag is set. Clear with:') + ' purpclaw forge interrupt --clear\n');
    return;
  }

  const cp = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, latestCp), 'utf8'));
  const started = cp.ts ? new Date(cp.ts).toLocaleString() : 'unknown';
  const elapsed = cp.ts ? Math.floor((Date.now() - cp.ts) / 1000) : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  console.log('\n  ' + col(C.cyan + C.bold, 'âš™ Forge Loop â€” Status'));
  console.log('  ' + col(C.dim, 'State') + '     : ' + (isInterrupted ? col(C.yellow, 'INTERRUPTED') : cp.data.state || 'unknown'));
  console.log('  ' + col(C.dim, 'Checkpoint') + ' : ' + latestCp.replace('.json', ''));
  console.log('  ' + col(C.dim, 'Started') + '   : ' + started + ' (' + mins + 'm ' + secs + 's ago)');
  console.log('  ' + col(C.dim, 'Iteration') + ' : ' + cp.data.iteration);
  console.log('  ' + col(C.dim, 'Goal') + '      : ' + cp.data.goal);
  console.log('  ' + col(C.dim, 'Tool calls') + ' : ' + (cp.data.toolHistory || []).length);
  console.log('  ' + col(C.dim, 'Last tool') + '  : ' + (cp.data.toolHistory || []).at(-1)?.tool?.name || 'none');
  if (isInterrupted) console.log('  ' + col(C.yellow, '  âš  Interrupt flag set â€” loop will pause at end of current iteration.\n'));
  else console.log('');
}

async function cmdForgeInterrupt() {
  const INTERRUPT_FILE = path.join(PURP_DIR, '.purpclaw', 'forge', 'interrupt');

  if (process.argv.includes('--clear')) {
    try { fs.unlinkSync(INTERRUPT_FILE); } catch {}
    console.log('\n  ' + col(C.green, 'âœ“ Interrupt flag cleared.\n'));
    return;
  }

  fs.writeFileSync(INTERRUPT_FILE, JSON.stringify({ loopId: 'cli', ts: Date.now() }), 'utf8');
  console.log('\n  ' + col(C.yellow, 'âš  Forge Loop interrupt sent.'));
  console.log('  ' + col(C.dim, 'Loop will pause at the end of the current iteration.\n'));
}

async function cmdForgeAutonomous(args, taskArg) {
  console.log(`\n  ${col(C.magenta + C.bold, 'âš™ forge Loop â€” Autonomous Mode')}\n`);
  console.log(`  ${col(C.dim, 'Loading ForgeLoop...')}`);
  try {
    const { ForgeLoop } = require('../lib/forge/loop');
    const llmProvider = require('../lib/llm-provider');

    // Wrap llmProvider.complete to match the { chat(promptString) } interface ForgeLoop expects.
    // _plan() passes a plain string prompt. Use complete() which returns plain text with
    // embedded JSON. (MiniMax's chat() API returns code-agent output we can't parse.)
    const llmClient = {
      chat: async (prompt) => {
        return llmProvider.complete(prompt, {}, '');
      },
      summarize: async (text) => {
        // Truncate to first 200 chars for summary
        return llmProvider.complete('Summarize this in one sentence: ' + text.slice(0, 500), {}, '');
      },
    };

    const task = taskArg || args.find(a => !a.startsWith('-')) || 'autonomous task';
    console.log(`  ${col(C.green, 'âœ“')} Loaded. Starting loop for: "${task}"\n`);

    const loop = new ForgeLoop({
      goal: task,
      llmClient,
      maxIterations: 50,
      checkpointInterval: 10,
    });

    loop.on('iteration', (state) => {
      process.stdout.write(
        `\r  [${col(C.cyan, `iter ${state.iteration}`)}] ${state.phase} â€” ${state.message || ''}   `
      );
    });

    loop.on('complete', (result) => {
      console.log(`\n\n  ${col(C.green + C.bold, 'âœ“ Forge Loop complete!')}`);
      console.log(`  ${col(C.dim, 'Iterations')}: ${result.iterations}`);
      console.log(`  ${col(C.dim, 'Edits')}: ${result.editsApplied}`);
      console.log(`  ${col(C.dim, 'Result')}: ${result.summary}\n`);
    });

    loop.on('error', (err) => {
      console.error(`\n\n  ${col(C.red, 'âœ— Forge Loop error:')} ${err.message}`);
    });

    await loop.run();
  } catch (e) {
    console.error(`  ${col(C.red, 'âœ— Failed to start Forge Loop:')} ${e.message}\n`);
    if (e.stack) console.error(col(C.gray, e.stack.split('\n').slice(0, 5).join('\n')));
  }
}

async function cmdForge(args) {
  // â”€â”€ Autonomous Forge Loop mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // purpclaw forge "task description" --autonomous
  // purpclaw forge status
  // purpclaw forge interrupt
  if (args.includes('--help') || args.includes('-h')) {
    console.log('\n  ' + col(C.magenta + C.bold, 'âš™ Forge â€” Commands'));
    console.log('  purpclaw forge "task" --autonomous   Start autonomous loop');
    console.log('  purpclaw forge status               Check loop status');
    console.log('  purpclaw forge interrupt            Pause running loop');
    console.log('  purpclaw forge interrupt --clear   Clear interrupt flag\n');
    return;
  }
  if (args[0] === 'status' || args[0] === '--status') {
    return cmdForgeStatus();
  }
  if (args[0] === 'interrupt' || args[0] === '--interrupt' || args[0] === '-i') {
    return cmdForgeInterrupt();
  }

  const isAutonomous = args.includes('--autonomous') || args.includes('-a') || args.includes('forge');
  const taskArg = args.find(a => !a.startsWith('-') && a.length > 10 && a.includes(' '));
  if (isAutonomous || taskArg) {
    return cmdForgeAutonomous(args, taskArg);
  }

  // â”€â”€ Gacha Soul Draw mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log(`\n  ${col(C.magenta + C.bold, 'ðŸ¦ž PERSONA FORGE â€” Soul Draw & Agent Creation')}\n`);

  let forgeLib = null;
  try {
    forgeLib = require(path.join(PURP_DIR, 'lib', 'persona-forge.js'));
  } catch (e) {
    console.error(col(C.red, `  âœ— persona-forge.js not found: ${e.message}\n`));
    return;
  }

  // Draw soul from gacha
  console.log(col(C.gray, '  Drawing soul from gacha (8,000,000 combinations)...\n'));
  let soul = null;
  try {
    soul = forgeLib.drawSoul();
  } catch (e) {
    console.error(col(C.red, `  âœ— Gacha failed: ${e.message}\n  Is Python available? Set PYTHON_BIN in .env.\n`));
    return;
  }

  // Display soul draw
  console.log(`  ${col(C.cyan + C.bold, 'âœ¦ Soul Draw')}`);
  console.log(`  ${col(C.dim, 'Former Life')} : ${soul.life}`);
  console.log(`  ${col(C.dim, 'Reason')}      : ${soul.reason}`);
  console.log(`  ${col(C.dim, 'Vibe')}        : ${soul.vibe}`);
  console.log(`  ${col(C.dim, 'Speech')}      : ${soul.speech}`);
  console.log(`  ${col(C.dim, 'Prop')}        : ${soul.prop}`);
  console.log('');

  // Suggest names
  const suggestions = forgeLib.suggestNames(soul);
  console.log(`  ${col(C.cyan + C.bold, 'âœ¦ Name Candidates')}`);
  suggestions.forEach((s, i) => {
    console.log(`  ${col(C.yellow, String(i + 1))}. ${col(C.bold, s.name)} (${s.strategy}) â€” ${s.why}`);
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
    console.error(col(C.red, `  âœ— Forge failed: ${e.message}\n`));
    return;
  }

  // Report
  console.log(`  ${col(C.green, 'âœ“')} Agent forged: ${col(C.bold, agentName)} (${result.slug})`);
  console.log(`  ${col(C.dim, 'Directory')} : ${result.dir}`);
  result.files.forEach(f => console.log(`  ${col(C.gray, 'Â·')} ${f}`));
  console.log('');
  console.log(`  ${col(C.cyan + C.bold, 'âœ¦ Avatar Prompt')} (paste into Gemini, ChatGPT, or Midjourney)`);
  console.log(col(C.gray, '  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€'));
  console.log(result.avatarPrompt.split('\n').slice(0, 8).map(l => `  ${col(C.dim, l)}`).join('\n'));
  console.log(col(C.gray, '  ... (full prompt in skills/' + result.slug + '/avatar-prompt.txt)'));

  // Write avatar prompt to file too
  const promptFile = path.join(result.dir, 'avatar-prompt.txt');
  try {
    require('fs').writeFileSync(promptFile, result.avatarPrompt, 'utf8');
  } catch {}

  console.log('');
  console.log(`  ${col(C.green, 'Done.')} ${col(C.bold, agentName)} is ready â€” dispatch with: ${col(C.cyan, `purpclaw run "${agentName} <task>"`)}`);
  console.log('');
}

// â”€â”€ init wizard (interactive first-run) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Provider pick â”€â”€
  console.log(col(C.gray, '  Pick which LLM your harness should call. You can change this any time in .env.\n'));
  const providers = [
    { key: 'minimax',   label: 'MiniMax (M2.7) â€” recommended, has a generous tier' },
  { key: 'anthropic', label: 'Anthropic Claude' },
  { key: 'gemini',    label: 'Google Gemini' },
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

  // â”€â”€ Key (skip for local providers) â”€â”€
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
        console.log(col(C.yellow, '  âš   key sanitiser noticed:'));
        for (const w of result.warnings) console.log(col(C.gray, `     Â· ${w}`));
      }
      apiKey = result.value;
      console.log(col(C.gray, `  Stored as: ${redactor.maskForDisplay(apiKey)}  (length ${apiKey.length})`));
    }
    model   = await ask('Model name:');
  } else {
    apiKey = await askSecret(`API key for ${provider.key} (input hidden, paste & press enter):`);
    // â”€â”€ Sanitize + validate the pasted key â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
      const result = redactor.sanitizeApiKey(apiKey);
      if (result.warnings.length) {
        console.log(col(C.yellow, `  âš   key sanitiser noticed:`));
        for (const w of result.warnings) console.log(col(C.gray, `     Â· ${w}`));
      }
      apiKey = result.value;
      if (!result.ok) {
        console.log(col(C.red, `  âœ— key looks malformed (length ${apiKey.length}); proceeding but auth will likely fail.`));
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

  // â”€â”€ Companion seed â”€â”€
  const userName = process.env.USERNAME || process.env.USER || 'wanderer';
  const seed = await ask('Companion seed (anything â€” controls species/eye/hat):', userName);

  // â”€â”€ Persist .env â”€â”€
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
  console.log(`\n  ${col(C.green, 'âœ”')} Wrote ${path.relative(PURP_DIR, envPath)}\n`);

  // Re-export into current process so subsequent steps see the new vars
  process.env.LLM_PROVIDER = provider.key;
  if (apiKey)  process.env.LLM_API_KEY  = apiKey;
  if (baseUrl) process.env.LLM_BASE_URL = baseUrl;
  if (model)   process.env.LLM_MODEL    = model;
  if (seed)    process.env.PURPCLAW_MOCHI_SEED = seed;

  // â”€â”€ Hatch companion â”€â”€
  try {
    const mochiLib = require(path.join(PURP_DIR, 'lib', 'mochi'));
    const mochi = mochiLib.hatchMochi(seed);
    console.log(col(C.magenta, '\n  Hatching your companion...\n'));
    mochiLib.renderSprite(mochi, 0).forEach(l => console.log('  ' + col(C.magenta + C.bold, l)));
    console.log(`\n  ${col(C.cyan, mochi.name)} â€” ${col(C.gray, mochi.species + ' Â· ' + (mochi.rarity || 'common'))}${mochi.shiny ? col(C.yellow, '  âœ¨ shiny') : ''}\n`);
  } catch (e) {
    console.log(col(C.yellow, `  Could not hatch companion now: ${e.message} (we'll try again on first \`purpclaw mochi\`)\n`));
  }

  // â”€â”€ Smoke-test the LLM (skip for local providers) â”€â”€
  if (apiKey || provider.key === 'ollama') {
    const spin = spinner(`testing ${provider.key} connectivity...`).start();
    try {
      const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
      const out = await llm.complete('Say the single word: ready', { max_tokens: 8, temperature: 0 });
      if (out && String(out).toLowerCase().includes('ready')) {
        spin.succeed(`${provider.key} answered`);
      } else {
        spin.warn(`${provider.key} responded but did not say "ready" â€” that's usually fine, just unusual`);
      }
    } catch (e) {
      const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
      const safeMsg = redactor.redact(String(e.message || '')).slice(0, 200);
      spin.fail(`${provider.key} test failed: ${safeMsg}`);
      console.log(col(C.yellow, '  Provider config saved, but authentication failed.'));
      console.log(col(C.gray, '  Your key may be invalid or malformed â€” double-check at the provider dashboard.'));
      console.log(col(C.gray, '  Re-test later with `purpclaw doctor`, or re-run `purpclaw init --wizard`.'));
    }
  }

rl.close();

  // â”€â”€ Offer to boot â”€â”€
  console.log('');
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
  const boot = await new Promise(r => {
    if (!isTTY) return r(false);  // non-interactive â€” skip
    rl2.question(col(C.cyan + C.bold, '  Boot the swarm now? ') + col(C.gray, '[Y/n] '), ans => r(ans !== 'n' && ans !== 'N'));
  });
  rl2.close();

  if (boot) {
    console.log(col(C.gray, '\n  Starting PURPCLAW...\n'));
    // Use trackedSpawn â€” purpclaw start uses PM2 internally, so services
    // survive even after this CLI parent exits. No detached: true needed.
    trackedSpawn(process.execPath, [path.join(PURP_DIR, 'bin', 'purpclaw.js'), 'start'], {
      tag: 'purpclaw-boot',
      timeoutMs: 0,  // no timeout â€” PM2 keeps this alive
      cwd: PURP_DIR,
      stdio: 'inherit',
    });
    console.log(col(C.cyan, '  PURPCLAW is booting in the background.'));
    console.log(col(C.gray, '  Watch: purpclaw status'));
    console.log(col(C.gray, '  Web:   http://localhost:3000\n'));
  }

  console.log(col(C.green + C.bold, '  âœ”  PURPCLAW IS READY\n'));
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

// â”€â”€ init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdInit(args) {
  if (args.includes('--wizard')) return cmdInitWizard(args);
  banner();
  console.log(col(C.magenta + C.bold, '  PURPCLAW SETUP WIZARD\n'));
  console.log(col(C.gray, '  Checking your environment before first boot...\n'));

  const issues = [];
  const checks = [];

  // â”€â”€ 1. Node version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const nodeVer = parseInt(process.versions.node.split('.')[0], 10);
  const nodeOk  = nodeVer >= 18;
  checks.push({ label: `Node.js v${process.versions.node}`, ok: nodeOk,
                hint: nodeOk ? '' : 'Need Node 18+. Install from nodejs.org.' });
  if (!nodeOk) issues.push('Upgrade Node.js to v18 or later');

  // â”€â”€ 2. PM2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let pm2Ok = false;
  // No shell: pm2 is invoked via the platform-correct binary directly.
  try {
    const pm2Cmd = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';
    execSync(`${pm2Cmd} --version`, { stdio: 'ignore' });
    pm2Ok = true;
  } catch {}
  checks.push({ label: 'PM2', ok: pm2Ok, hint: pm2Ok ? '' : 'Run: npm install -g pm2' });
  if (!pm2Ok) issues.push('Install PM2 globally: npm install -g pm2');

  // â”€â”€ 3. ecosystem.config.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ecoOk = fs.existsSync(ECOSYSTEM);
  checks.push({ label: 'ecosystem.config.js', ok: ecoOk,
                hint: ecoOk ? '' : `Missing at ${ECOSYSTEM}` });

  // â”€â”€ 4. .env file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ 5. LLM Provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                  hint: `Local provider â€” no API key required` });
  } else if (!apiKey) {
    checks.push({ label: `LLM provider: ${provider}`, ok: false,
                  hint: `Set LLM_API_KEY in .env for ${provider}` });
    issues.push(`LLM_API_KEY not set for provider "${provider}"`);
  } else {
    const masked = apiKey.substring(0, 6) + '***' + apiKey.slice(-3);
    checks.push({ label: `LLM provider: ${provider}`, ok: true,
                  hint: `Key: ${masked}` });
  }

  // â”€â”€ 6. Swarm provider (optional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ 7. Service connectivity (if stack is running) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const icon = c.ok ? col(C.green, '  âœ“') : col(C.red, '  âœ—');
    const hint = c.hint ? col(C.gray, `  â† ${c.hint}`) : '';
    console.log(`${icon}  ${c.label}${hint}`);
  }

  // Show service connectivity
  if (anyOnline) {
    console.log(`\n${col(C.bold, '  SERVICES (running)')}`)
    for (const r of svcResults) {
      const s = r.value || { name: '?', ok: false };
      const icon = s.ok ? col(C.green, '  âœ“') : col(C.gray, '  Â·');
      console.log(`${icon}  ${s.name.padEnd(16)}${col(C.gray, s.ok ? 'online' : 'offline')}`);
    }
  } else {
    console.log(col(C.gray, '\n  (Services not running yet â€” run `purpclaw start` after setup)'));
  }

  // â”€â”€ Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('');
  if (issues.length === 0) {
    console.log(col(C.green + C.bold, '  âœ“ All checks passed!\n'));
    console.log(`  ${col(C.cyan,  'purpclaw start')}   â€” boot the full stack`);
    console.log(`  ${col(C.cyan,  'purpclaw chat')}    â€” open the REPL`);
    console.log(`  ${col(C.cyan,  'purpclaw run "<task>"')} â€” send a task to the swarm`);
  } else {
    console.log(col(C.yellow + C.bold, `  âš  ${issues.length} issue${issues.length > 1 ? 's' : ''} to fix:\n`));
    for (const issue of issues) console.log(`  ${col(C.yellow, 'Â·')}  ${issue}`);

    if (!envExists) {
      console.log(col(C.gray, '\n  Generate a .env template:'));
      console.log(`  ${col(C.cyan, 'purpclaw init --template')}\n`);
    }
  }
  console.log('');

  // â”€â”€ --template flag: write a starter .env â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (args.includes('--template') && !envExists) {
    const template = [
      '# PURPCLAW Environment Configuration',
      '# Generated by purpclaw init --template',
      '',
      '# â”€â”€ LLM Provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
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
      '# â”€â”€ Swarm Engine (heavy reasoning) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
      '# Defaults to main provider if not set. Kimi K2 recommended.',
      '# SWARM_PROVIDER=kimi',
      '# SWARM_API_KEY=',
      '# SWARM_MODEL=kimi-k2-5',
      '',
      '# â”€â”€ Internal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
      'INTERNAL_API_KEY=',
      'OPENCLAW_GATEWAY=ws://127.0.0.1:18789',
    ].join('\n');

    try {
      fs.writeFileSync(envPath, template, 'utf8');
      console.log(col(C.green, `  âœ“ .env template written to ${envPath}`));
      console.log(col(C.gray,  '  Edit it with your API key, then run `purpclaw init` again to verify.\n'));
    } catch (e) {
      console.error(col(C.red, `  âœ— Could not write .env: ${e.message}\n`));
    }
  }
}

// â”€â”€ logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdLogs(args) {
  const service = args[0] ? `purpclaw-${args[0]}` : '--merge';
  const child = trackedSpawn('pm2', ['logs', service, '--lines', '50'], {
    tag: 'pm2-logs',
    timeoutMs: 0,  // user controls duration via Ctrl+C
    stdio : 'inherit',
    shell : false,  // no shell needed â€” pm2 is in PATH
    cwd   : PURP_DIR,
  });
  child.on('close', code => process.exit(code || 0));
  child.on('error', () => {
    console.error(col(C.red, '  âœ— PM2 not found. Install: npm install -g pm2'));
    process.exit(1);
  });
}

// â”€â”€ chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdChat(args) {
  banner();

  // Check orchestrator health â€” advise if offline
  const orchOnline = await ping(PORTS.orchestrator, '/health');
  const memOnline  = await ping(PORTS.memory, '/health');

  console.log(`  Orchestrator ${tick(orchOnline)}   Memory ${tick(memOnline)}\n`);

  if (!orchOnline) {
    console.log(col(C.yellow, '  âš  Orchestrator is offline â€” agent routing unavailable.'));
    console.log(col(C.gray,   '  Run `purpclaw start` in another terminal to enable full swarm.\n'));
  }

  if (!fs.existsSync(NANOCLAW)) {
    console.error(col(C.red, `  âœ— nanoclaw.js not found at ${NANOCLAW}`));
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
    console.error(col(C.red, `  âœ— Failed to launch nanoclaw: ${e.message}`));
    process.exit(1);
  });
}

// â”€â”€ look â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      console.log(`  ${col(C.cyan, `Screen ${s.index}`)}  ${s.width}Ã—${s.height}  ${col(C.gray, `@ (${s.left}, ${s.top})`)}`);
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
    spin.succeed(`${info.count} monitor${info.count !== 1 ? 's' : ''} found â€” capturing all`);
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

    spin.succeed(`Screen ${idx}  (${r.width}Ã—${r.height})`);

    if (r.description) {
      const lines = r.description.split('\n');
      for (const l of lines) console.log(`  ${col(C.white, l)}`);
    } else if (noVision) {
      console.log(col(C.gray, '  [vision skipped]'));
    } else {
      console.log(col(C.gray, '  [no vision â€” provider may not support images, or no key set]'));
    }

    if (r.objectCount > 0) {
      const uniq = [...new Set(r.objects)];
      console.log(col(C.gray, `  Objects: ${uniq.join(', ')} (${r.objectCount} detections)`));
    }

    console.log('');
  }

  console.log(col(C.gray, '  Context saved â†’ agent_work/.screen_context.json'));
  const ws = screenLook.readWorkspace();
  if (ws?.summary) console.log(col(C.gray, `  Workspace -> ${ws.summary}`));
  console.log(col(C.gray, '  Agents will read this before their next task.\n'));
}

// â”€â”€ config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdConfig(args) {
  const envPath = path.join(PURP_DIR, '.env');

  // â”€â”€ known config keys with metadata
  const CONFIG_KEYS = [
    { key: 'LLM_PROVIDER',   label: 'LLM Provider',        choices: ['anthropic','gemini','openai','kimi','groq','deepseek','openrouter','together','mistral','ollama','lmstudio'],  secret: false },
    { key: 'LLM_MODEL',      label: 'LLM Model',           choices: [],  secret: false, hint: 'e.g. claude-opus-4-5, gpt-4o, kimi-k2-5' },
    { key: 'LLM_API_KEY',    label: 'LLM API Key',         choices: [],  secret: true  },
    { key: 'SWARM_PROVIDER', label: 'Swarm Provider',      choices: ['kimi','anthropic','gemini','openai','groq','openrouter'], secret: false },
    { key: 'SWARM_MODEL',    label: 'Swarm Model',         choices: [],  secret: false, hint: 'Heavy reasoning engine model' },
    { key: 'SWARM_API_KEY',  label: 'Swarm API Key',       choices: [],  secret: true  },
    { key: 'KIMI_API_KEY',   label: 'Kimi API Key',        choices: [],  secret: true  },
    { key: 'ORCHESTRATOR_PORT','label':'Orchestrator Port', choices: [],  secret: false, hint: 'default 7784' },
    { key: 'TOWER_PORT',     label: 'Tower Port',          choices: [],  secret: false, hint: 'default 7790' },
    { key: 'API_PORT',       label: 'API Port',            choices: [],  secret: false, hint: 'default 7780' },
    { key: 'MEMORY_PORT',    label: 'Memory Port',         choices: [],  secret: false, hint: 'default 7880' },
    { key: 'XIAOZHI_WS_URL', label: 'Xiaozhi WS URL',     choices: [],  secret: false, hint: 'ws://... â€” the AI ball WebSocket' },
    { key: 'VOICE_PORT',     label: 'Voice Service Port',  choices: [],  secret: false, hint: 'default 7781' },
  ];

  // â”€â”€ parse .env into a map
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

  // â”€â”€ write one key back to .env
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

  // â”€â”€ show mode: just print current values
  if (args[0] === 'show' || args[0] === 'list') {
    sectionHead('  âš™  PURPCLAW CONFIG');
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

  // â”€â”€ set mode: purpclaw config set KEY value
  if (args[0] === 'set' && args[1]) {
    const key   = args[1].toUpperCase();
    const value = args.slice(2).join(' ');
    if (!value) {
      console.log(col(C.red, `  âœ— Usage: purpclaw config set ${key} <value>`));
      return;
    }
    writeEnvKey(key, value);
    const meta  = CONFIG_KEYS.find(k => k.key === key);
    const shown = meta?.secret ? maskVal(value, true) : col(C.green, value);
    console.log(col(C.green, `  âœ”  ${key} updated â†’ ${shown}`));
    console.log(col(C.gray,  `  Restart services to apply: purpclaw restart\n`));
    return;
  }

  // â”€â”€ interactive mode: readline menu
  sectionHead('  âš™  PURPCLAW INTERACTIVE CONFIG');
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
      const prefix = i === selected ? col(C.magenta, ' â–¶ ') : '   ';
      const bg     = i === selected ? C.bold : '';
      process.stdout.write(`${prefix}${col(bg, k.label.padEnd(20))} ${masked}\n`);
    });
    process.stdout.write(col(C.gray, '\n  â†‘â†“ navigate  Enter=edit  q=quit\n'));
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
          process.stdout.write(`\n  ${col(C.cyan, k.label)} â€” choose one:\n`);
          k.choices.forEach((c, i) => console.log(`  ${col(C.gray, `${i + 1}.`)} ${c}`));
          process.stdout.write('  > ');
          rl.question('', (answer) => {
            const idx = parseInt(answer) - 1;
            const val = (idx >= 0 && idx < k.choices.length) ? k.choices[idx] : answer.trim();
            if (val) {
              writeEnvKey(k.key, val);
              env[k.key] = val;
              console.log(col(C.green, `  âœ”  ${k.key} = ${val}`));
            }
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
            renderMenu();
          });
        } else {
          const hint = k.hint ? ` (${k.hint})` : '';
          process.stdout.write(`\n  ${col(C.cyan, k.label)}${col(C.gray, hint)} â†’ `);
          rl.question('', (answer) => {
            if (answer.trim()) {
              writeEnvKey(k.key, answer.trim());
              env[k.key] = answer.trim();
              console.log(col(C.green, `  âœ”  ${k.key} updated`));
            }
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
            renderMenu();
          });
        }
      }
    });
  });
}

// â”€â”€ voice (/command shorthand) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdVoice(args) {
  // If a command string is passed, send it directly to the voice/orchestrator pipeline
  // without going through the normal text routing.
  // Usage:
  //   purpclaw voice "build the login page"   â€” send as voice command
  //   purpclaw voice                           â€” show voice service status

  const text = args.join(' ').trim();

  if (!text) {
    // Show voice service status
    sectionHead('  ðŸŽ™  VOICE SERVICE');
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

// â”€â”€ doctor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdDoctor(args) {
  const registry = require(path.join(PURP_DIR, 'service_registry.js'));
  const screenLook = require(path.join(PURP_DIR, 'lib', 'screen-look.js'));

  // Driver preflight is a separate mode: `purpclaw doctor --drivers`.
  // It checks each of the 10 native drivers for its prerequisites
  // (binaries on PATH, install paths, etc.) and prints a structured
  // report. Stolen from the Hermes install flow.
  if (args.includes('--drivers')) {
    const { runPreflight } = require(path.join(PURP_DIR, 'lib', 'driver-preflight.js'));
    banner();
    sectionHead('  PURPCLAW DOCTOR â€” DRIVER PREFLIGHT');
    const r = runPreflight();
    console.log(`  drivers: ${r.ready}/${r.totalDrivers} ready, ${r.missing} missing\n`);
    for (const driver of r.results) {
      const icon = driver.ok ? '\x1b[32mâ—\x1b[0m' : '\x1b[31mâ—\x1b[0m';
      const status = driver.ok ? '\x1b[32mready\x1b[0m' : '\x1b[31mMISSING\x1b[0m';
      console.log(`    ${icon} ${driver.id.padEnd(14)}  ${status.padEnd(20)}  ${driver.detail}`);
      if (!driver.ok && driver.installHint) {
        console.log(`        \x1b[33mâ†’\x1b[0m ${driver.installHint}`);
      }
    }
    if (r.missing > 0) {
      console.log(`\n  ${r.missing} driver(s) need installation. Run \`purpclaw install --drivers\` once that ships.`);
    } else {
      console.log(`\n  \x1b[32mAll drivers ready.\x1b[0m`);
    }
    return;
  }

  banner();
  sectionHead('  PURPCLAW DOCTOR');

  const checks = [];
  const add = (label, ok, detail = '') => checks.push({ label, ok: Boolean(ok), detail });

  add('package.json', fs.existsSync(path.join(PURP_DIR, 'package.json')), 'runtime manifest');
  add('node_modules/next', fs.existsSync(path.join(PURP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next')), 'Next.js CLI installed');
  add('ecosystem.config.js', fs.existsSync(ECOSYSTEM), 'PM2 service config');
  add('service_registry.js', fs.existsSync(path.join(PURP_DIR, 'service_registry.js')), 'single service map');
  add('.env', fs.existsSync(path.join(PURP_DIR, '.env')), 'local keys/config');

  // â”€â”€ NVIDIA NIM probe (if --nim flag) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (args.includes('--nim') || args.includes('--embeddings')) {
    try {
      const emb = require(path.join(PURP_DIR, 'lib', 'embeddings.js'));
      const h = await emb.health();
      if (h.ok) {
        add('NVIDIA NIM bge-m3', true, `${h.model} Â· ${h.dim}-dim Â· ${h.baseUrl}`);
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

  // â”€â”€ Cross-reference PM2's actual managed process list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // A port answering /health is necessary but not sufficient â€” it tells you
  // SOMETHING owns the port, not that PM2 is supervising it. Orphan processes
  // from previous sessions can squat on ports and block their PM2 siblings'
  // restart loop. We surface that as a warning.
  let pm2State = {}; // pm2-name â†’ { status, restarts, pid }
  let pm2Available = false;
  try {
    const pm2Bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const raw = execSync(`${pm2Bin} pm2 jlist`, { cwd: PURP_DIR, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 });
    const arr = JSON.parse(raw);
    pm2Available = true;
    for (const p of arr) pm2State[p.name] = { status: p.pm2_env?.status, restarts: p.pm2_env?.restart_time || 0, pid: p.pid };
  } catch { /* pm2 not available or hung â€” we still do the port probes */ }

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
      detail = `online :${service.healthPort}  âš  ORPHAN (not under PM2)`;
      orphans.push({ name: service.name, port: service.healthPort, pm2: pm2Name });
    } else if (pm2Info && pm2Info.restarts > 50) {
      detail = `online :${service.healthPort}  âš  ${pm2Info.restarts} restarts (crash loop history)`;
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

  // â”€â”€ Split-brain summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (orphans.length) {
    console.log('\n  ' + col(C.yellow + C.bold, 'âš   ORPHAN PROCESSES DETECTED'));
    console.log(col(C.gray, '  These services answer on their port but PM2 does NOT manage them.'));
    console.log(col(C.gray, '  They will not auto-restart on crash and they block PM2 siblings.'));
    for (const o of orphans) {
      console.log(`    Â· ${col(C.yellow, o.name.padEnd(26))} port ${o.port} â€” pm2 entry: ${o.pm2}`);
    }
    console.log(col(C.gray, '\n  Resolve: find the PID with `netstat -ano | findstr :<port>` and stop it,'));
    console.log(col(C.gray, '           then use the cascade-safe launcher (NOT raw pm2 start):'));
    console.log(col(C.cyan,  '             purpclaw safe-start ' + orphans.map(o => o.pm2.replace('purpclaw-', '')).join(' ')));
  }
  if (crashLoops.length) {
    console.log('\n  ' + col(C.yellow + C.bold, 'âš   CRASH-LOOP HISTORY'));
    console.log(col(C.gray, '  These services have restarted >50 times â€” investigate the cause.'));
    for (const cl of crashLoops) {
      console.log(`    Â· ${col(C.yellow, cl.name.padEnd(26))} ${cl.restarts} restarts (${cl.pm2})`);
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

// â”€â”€ reject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    console.log(col(C.red, `  âœ— Approval ${approvalId} not found`));
  } else {
    console.log(col(C.yellow, `  âœ— Rejected: ${approvalId}`));
  }
}



// â”€â”€ profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Context Bus (cross-agent state) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    if (!s) return console.log(col(C.red, '  âœ— context-bus offline on :' + CTX_PORT));
    console.log('');
    console.log(col(C.bold, '  CONTEXT BUS Â· CROSS-AGENT STATE'));
    console.log('  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
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
    if (!team) return console.log(col(C.red, '  âœ— context-bus offline'));
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
    if (!a) return console.log(col(C.red, '  âœ— context-bus offline'));
    if (a.not_found) return console.log(col(C.gray, `  Agent "${rest}" not found`));
    console.log('');
    console.log(col(C.bold, `  AGENT: ${rest}`));
    Object.entries(a).forEach(([k, v]) => { if (!k.startsWith('_')) console.log(`  ${String(k).padEnd(15)} ${v}`); });
    console.log('');
    return;
  }

  if (sub === 'workflows') {
    const wf = await ctxGet('/context/workflows');
    if (!wf) return console.log(col(C.red, '  âœ— context-bus offline'));
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
        res.on('end', () => { try { const r = JSON.parse(d); console.log(col(r.success ? C.green : C.red, `  ${r.success ? 'âœ“' : 'âœ—'} ${resourceId} ${r.success ? 'locked' : (r.reason || r.lockedBy)}`)); } catch { console.log(col(C.red, '  lock failed')); } resolve(); });
      });
      req.on('error', e => { console.log(col(C.red, '  âœ— ' + e.message)); resolve(); });
      req.write(body); req.end();
    });
  }

  // Default help
  console.log('');
  console.log(col(C.bold, '  CONTEXT BUS Â· cross-agent shared state'));
  console.log('  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
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

  // â”€â”€ pool query <text> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'query' && rest) {
    sectionHead('  KNOWLEDGE POOL Â· SEARCH');
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
      console.error(col(C.red, `  âœ— ${e.message} â€” is the pool running on :${POOL_PORT}? Try \`purpclaw doctor\`.\n`));
    }
    return;
  }

  // â”€â”€ pool show <name> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'show' && rest) {
    sectionHead(`  SKILL Â· ${rest}`);
    try {
      const res = await poolReq('GET', `/pool/skills/${encodeURIComponent(rest)}`);
      if (res.error) { console.error(col(C.red, `  âœ— ${res.error}\n`)); return; }
      console.log(col(C.gray, `  ${res.description || ''}\n`));
      console.log(res.content);
      console.log('');
    } catch (e) {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
    }
    return;
  }

  // â”€â”€ pool routing <task text> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'routing' && rest) {
    sectionHead('  KNOWLEDGE POOL Â· ROUTING HINTS');
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
        console.log(`  ${agent} ${div} ${col(C.white, role)}  ${col(C.gray, 'Â· score ' + h.score)}`);
        if (h.give && h.give.length) console.log(col(C.gray, `    give:  ${h.give.slice(0,3).join(', ')}`));
      }
      console.log('');
    } catch (e) {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
    }
    return;
  }

  // â”€â”€ pool reindex â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'reindex') {
    sectionHead('  KNOWLEDGE POOL Â· REINDEX');
    const spin = spinner('rebuilding index from disk').start();
    try {
      const res = await poolReq('POST', '/pool/reindex', {});
      spin.succeed(`reindexed: ${res.skillsCount} skills Â· ${res.agentsCount} agents Â· ${res.routingProfiles || 0} routing profiles`);
      console.log('');
    } catch (e) {
      spin.fail(e.message);
    }
    return;
  }

  // â”€â”€ pool stats (default) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (sub === 'stats' || !sub) {
    sectionHead('  KNOWLEDGE POOL Â· STATS');
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
      console.error(col(C.red, `  âœ— pool offline (:${POOL_PORT})  â€”  ${e.message}\n`));
      console.log(col(C.gray, '  Boot it:  purpclaw start  (or)  npx pm2 start ecosystem.config.js --only purpclaw-pool\n'));
    }
    return;
  }

  if (sub === 'recent') {
    sectionHead('  KNOWLEDGE POOL Â· RECENT QUERIES');
    try {
      const r = await poolReq('GET', '/pool/recent?limit=15');
      if (!r.entries || !r.entries.length) { console.log(col(C.gray, '  No queries yet.\n')); return; }
      for (const e of r.entries) {
        const ts = String(e.ts || '').slice(11, 19);
        console.log(`  ${col(C.gray, ts)}  ${col(C.yellow, (e.method || 'GET').padEnd(4))}  ${col(C.gray, e.path)}`);
      }
      console.log('');
    } catch (e) {
      console.error(col(C.red, `  âœ— ${e.message}\n`));
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

// â”€â”€ mochi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdMochi(args) {
  const mochiLib = require(path.join(PURP_DIR, 'lib', 'mochi'));

  // Subcommands first
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'hatch') {
    const mochi = mochiLib.hatchMochi(args[1] || undefined, args[2] || null);
    console.log('');
    const lines = mochiLib.renderSprite(mochi, 0);
    lines.forEach(l => console.log('  ' + col(C.magenta, l)));
    console.log(`\n  ${col(C.cyan, mochi.name)} â€” ${col(C.gray, mochi.species + ' Â· ' + mochi.rarity)}\n`);
    console.log(col(C.gray, '  Hatched. Run `purpclaw mochi` to chat.\n'));
    return;
  }

  if (sub === 'show' || sub === 'card') {
    const mochi = mochiLib.loadMochi();
    console.log('');
    mochiLib.renderSprite(mochi, 0).forEach(l => console.log('  ' + col(C.magenta, l)));
    console.log(`\n  ${col(C.cyan + C.bold, mochi.name)}  ${col(C.gray, 'Â·')}  ${col(C.gray, mochi.species + ' Â· ' + (mochi.rarity || 'common') + (mochi.shiny ? ' Â· âœ¨ shiny' : ''))}`);
    console.log(`  ${col(C.gray, 'eye: ' + mochi.eye + '   hat: ' + (mochi.hat || 'none') + '   tone: ' + (mochi.tone || ''))}`);
    console.log(`  ${col(C.gray, 'hatched: ' + (mochi.hatchedAt || '?') + '   chats: ' + (mochi.interactions || 0))}\n`);
    return;
  }

  // Default â†’ interactive REPL
  const mochi  = mochiLib.loadMochi();
  const status = await mochiLib.snapshotStatus();
  const provider = mochiLib.activeProvider();   // null if no keys

  // â”€â”€ Header
  console.log('');
  const sprite = mochiLib.renderSprite(mochi, 0);
  sprite.forEach(line => console.log('  ' + col(C.magenta + C.bold, line)));
  const tagline = provider
    ? col(C.green,  `live Â· ${provider}`)
    : col(C.yellow, 'offline Â· set ANTHROPIC_API_KEY (or MINIMAX_API_KEY) for chat');
  console.log(`  ${col(C.cyan + C.bold, mochi.name)} ${col(C.gray, 'Â· ' + mochi.species + ' Â·')} ${tagline}`);
  if (status.poolOnline) {
    console.log(col(C.gray, `  pool: ${status.skills} skills Â· ${status.agents} agents Â· ${status.memories} memories`));
  } else {
    console.log(col(C.yellow, `  pool offline â€” boot it: purpclaw start`));
  }
  console.log(col(C.gray, '  type your message â€” "/help" for commands, "bye" to leave\n'));

  // â”€â”€ REPL with serial line processing
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: col(C.magenta, '  you â€º '),
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
      console.log(`  ${col(C.magenta, face)} ${col(C.cyan, mochi.name)} Â· ${col(C.gray, mochi.species + ' Â· ' + mochi.rarity)}\n`);
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
      console.log(col(C.gray, `\n  skills:  ${ctx.skills.map(s => s.name).join(', ') || 'â€”'}`));
      console.log(col(C.gray, `  routing: ${ctx.routing.map(h => h.agent + ' (' + h.role + ')').join(', ') || 'â€”'}`));
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

// â”€â”€ tick (manual reasoning heartbeat) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdTick(args) {
  const { tick, readState } = require(path.join(PURP_DIR, 'lib', 'reasoning-tick'));
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'status' || sub === 'last') {
    sectionHead('  REASONING TICK Â· LAST STATE');
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
  sectionHead('  REASONING TICK Â· FIRING');
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
    if (r.poolStats) console.log(`  Pool snapshot : ${r.poolStats.skills} skills Â· ${r.poolStats.agents} agents Â· ${r.poolStats.memories} memories`);
    console.log(`  Wrote to pool : heartbeat=${r.writes.heartbeat ? col(C.green, 'yes') : col(C.gray, 'skipped')}  failures=${r.writes.failures}`);
    if (r.writes.errors.length) console.log(`  ${col(C.yellow, 'Write errors :')} ${r.writes.errors.length}`);
    if (r.proposals.length) {
      console.log('');
      console.log(col(C.cyan, '  Proactive proposals (not executed):'));
      for (const p of r.proposals) console.log(`    Â· ${p.command}   ${col(C.gray, '(' + p.reason + ')')}`);
    }
    console.log('');
    console.log(col(C.gray, '  proposals are NOT executed â€” they\'re proposals. Run them with: purpclaw run "<command>"'));
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

// â”€â”€ tui â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function cmdTui(args = []) {
  // `purpclaw tui ask` opens the interactive agent chat TUI.
  // `purpclaw tui` (no subcommand) opens the live dashboard cockpit.
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'ask') {
    const TUI_ASK = path.join(PURP_DIR, 'scripts', 'tui-ask.js');
    if (!fs.existsSync(TUI_ASK)) {
      console.error(col(C.red, `\n  âœ— scripts/tui-ask.js not found at ${TUI_ASK}\n`));
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
    child.on('error', e => { console.error(col(C.red, `\n  âœ— tui-ask failed: ${e.message}\n`)); process.exit(1); });
    return;
  }
  const TUI_SCRIPT = path.join(PURP_DIR, 'scripts', 'tui.js');
  if (!fs.existsSync(TUI_SCRIPT)) {
    console.error(col(C.red, `\n  âœ— scripts/tui.js not found at ${TUI_SCRIPT}\n`));
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
    console.error(col(C.red, `  âœ— TUI failed to launch: ${e.message}`));
    process.exit(1);
  });
}

// â”€â”€ help â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function cmdHelp(topic) {
  const CLI_REGISTRY = require(path.join(PURP_DIR, 'lib', 'cli', 'registry'));
  // Per-command detail from the registry: `purpclaw help <command>`
  if (topic) {
    const t = String(topic).replace(/^\//, '').toLowerCase();
    const entry = CLI_REGISTRY.find(t);
    if (!entry) {
      const suggestions = CLI_REGISTRY.suggest(t);
      console.log(col(C.red, `\n  No help for "${t}" — not a known command.`));
      if (suggestions.length) console.log(col(C.gray, `  Did you mean: ${suggestions.join(', ')}`));
      process.exit(2);
    }
    console.log(`\n  ${col(C.cyan + C.bold, 'purpclaw ' + entry.name)}${entry.aliases && entry.aliases.length ? col(C.gray, '  (' + entry.aliases.join(', ') + ')') : ''}`);
    console.log(`  ${col(C.white, entry.description || '(no description)')}`);
    console.log(col(C.gray, `  category: ${entry.category}${entry.json ? '  ·  supports --json' : ''}${entry.module ? '  ·  module: lib/commands/' + entry.module + '.js' : '  ·  built-in'}`));
    console.log('');
    return;
  }
  banner();

  const W = isTTY ? Math.min(process.stdout.columns || 100, 100) : 100;
  const inner = W - 4;

  // Section box helpers
  const secTop  = () => col(C.gray, '  â”Œ' + 'â”€'.repeat(inner) + 'â”');
  const secBot  = () => col(C.gray, '  â””' + 'â”€'.repeat(inner) + 'â”˜');
  const secRow  = (left, right) => {
    const l = left  || '';
    const r = right || '';
    const lRaw = l.replace(/\x1b\[[0-9;]*m/g, '');
    const rRaw = r.replace(/\x1b\[[0-9;]*m/g, '');
    const pad  = Math.max(1, inner - lRaw.length - rRaw.length);
    return col(C.gray, '  â”‚') + ' ' + l + ' '.repeat(pad) + r + ' ' + col(C.gray, 'â”‚');
  };

  function section(title, rows) {
    console.log(`\n  ${col(C.cyan + C.bold, title)}`);
    console.log(secTop());
    for (const [cmd, desc] of rows) {
      console.log(secRow(col(C.cyan, cmd), col(C.gray, desc)));
    }
    console.log(secBot());
  }

  section('ðŸš€  LIFECYCLE', [
    ['purpclaw init',                  'Audit env, keys, and services'],
    ['purpclaw init --wizard',         'Interactive first-run setup (60 seconds)'],
    ['purpclaw start',                 'Boot the harness (bounded profile)'],
    ['purpclaw start --all',           'Boot every PM2 service'],
    ['purpclaw start --profile=voice', 'Boot harness + voice bridge'],
    ['purpclaw stop',                  'Shut down gracefully'],
    ['purpclaw restart [service]',     'Restart all or one service'],
    ['purpclaw doctor',                'Quick health check â€” reads only'],
    ['purpclaw status',                'Dashboard: services + leaderboard + pool'],
  ]);

  section('ðŸ’¬  CHAT WITH THE STACK  (front door)', [
    ['purpclaw',                       'No args â†’ drop into chat REPL (stack-aware, persistent)'],
    ['purpclaw ask "<question>"',      'One-shot LLM query â€” answers from live stack context'],
    ['purpclaw ask',                   'REPL mode â€” /exit /clear /help /status, sessions saved'],
    ['purpclaw ask --session <name>',  'Named session (separate context, persisted on disk)'],
    ['purpclaw ask --fresh',           'Clear the current session and start clean'],
    ['purpclaw ask --status',          'Show provider + active session info'],
    ['purpclaw chat',                  'NanoClaw REPL â€” swarm-aware (uses claude CLI)'],
    ['purpclaw mochi',                 'Chat with your companion (animated, LLM-backed)'],
    ['purpclaw architecture',          'Live runtime overview: services + flow + files + concepts'],
    ['purpclaw architecture services', 'Service topology only'],
    ['purpclaw architecture flow',     'Task-flow diagram only'],
    ['purpclaw overview',              'Canonical doc â€” what PURPCLAW is + philosophy (the README)'],
    ['purpclaw overview --raw',        'Raw markdown for piping'],
  ]);

  section('âš¡  THE WORK LOOP', [
    ['purpclaw tui',                   'ðŸŽ›  LIVE cockpit â€” full-screen TUI dashboard'],
    ['purpclaw run "<task>"',          'Dispatch + stream agent progress live'],
    ['purpclaw bg "<task>"',           'Background dispatch â€” fire and forget'],
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

  section('ðŸ§   KNOWLEDGE POOL  (:7885)', [
    ['purpclaw pool query "<text>"',   'Keyword-search the skill index'],
    ['purpclaw pool show <name>',      'Full SKILL.md content'],
    ['purpclaw pool routing "<task>"', 'Routing hints for a task type'],
    ['purpclaw pool stats',            'How many skills and agents indexed'],
    ['purpclaw pool reindex',          'Rebuild index from disk'],
  ]);

  section('ðŸ“¦  REGISTRY  (139 skills  Â·  38 Claude-agent definitions)', [
    ['purpclaw registry browse',       'See all skills + agents with install status'],
    ['purpclaw install <name>',        'Install a skill from the local registry'],
    ['purpclaw search "<text>"',       'Keyword-search across all 139 skills'],
    ['purpclaw registry publish <n>',  'Publishing guide (step-by-step PR walkthrough)'],
    ['purpclaw registry update',       'Rebuild local index from disk'],
  ]);

  section('ðŸ§¬  MEMORY + DREAM', [
    ['purpclaw memory [query]',        'Recall matching memories from the matrix'],
    ['purpclaw memory ingest "<text>"','Store a new memory manually'],
    ['purpclaw memory forget "<q>"',   'Remove matching memories'],
    ['purpclaw memory stats',          'Detailed memory matrix stats'],
    ['purpclaw dream',                 'Trigger AutoDream memory consolidation'],
  ]);

  section('ðŸ¤–  AGENTS + FORGE', [
    ['purpclaw agents',                'List swarm agents (44 in tower), divisions, scores'],
    ['purpclaw roster',                'Compare tower swarm vs disk persona files'],
    ['purpclaw roster --missing',      'Show animals lacking persona files (Codex migration target)'],
    ['purpclaw forge [name]',          'Draw a gacha soul + create a new agent'],
    ['purpclaw look [1 2 3]',          'Capture screens + vision analysis'],
    ['purpclaw look --list',           'List detected monitors'],
    ['purpclaw look --workspace',      'Show remembered monitor roles'],
    ['purpclaw voice "<command>"',     'Send command via voice pipeline'],
  ]);

  section('ðŸ”§  CONFIG + GOVERNANCE', [
    ['purpclaw config',                'Interactive config editor (â†‘â†“ arrow keys)'],
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

  section('ðŸ”  DIAGNOSTICS + DEVOPS', [
    ['purpclaw bughunt',               'Full stack scan â€” syntax, ports, health, smells'],
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

  section('ðŸ§¹  HOUSEKEEPING  (keep the workshop tidy)', [
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

  section('â˜  CLOUD / SCALE  (worker pool)', [
    ['purpclaw workers status',        'Health check all registered worker nodes'],
    ['purpclaw workers list',          'Show worker registry (IDs, types, targets)'],
    ['purpclaw workers add --type http --url <url>', 'Register remote HTTP worker'],
    ['purpclaw workers add --type ssh --host <h>',   'Register remote SSH worker'],
    ['purpclaw workers remove <id>',   'Deregister a worker'],
    ['purpclaw workers jobs',          'Show recent worker dispatch jobs'],
    ['purpclaw workers test <id>',     'Smoke-test a specific worker'],
    ['purpclaw workers secret',        'Generate a fresh HMAC worker secret (copy/paste)'],
  ]);

  section('ðŸ¦†  GOOSE COMMANDS  (for the unhinged)', [
    ['purpclaw mochi',                 'Chat with your companion (animated, LLM-backed)'],
    ['purpclaw mochi hatch [seed]',    'Hatch a new mochi species'],
    ['purpclaw mochi card',            'Show companion card'],
    ['purpclaw logs [service]',        'Tail PM2 logs'],
    ['purpclaw profiles',              'List bounded launch profiles'],
    ['purpclaw bars',                  'Mochi status bars preview (opt-in with --bars)'],
  ]);

  // ── Complete command index (generated from lib/cli/registry.js) ─────────
  // The sections above are a curated guide with subcommand examples; this
  // index is machine-generated so no command can go undocumented again.
  for (const { key, title } of CLI_REGISTRY.categories()) {
    const rows = CLI_REGISTRY.commands().filter(c => c.category === key);
    if (!rows.length) continue;
    section('â–’  ' + title + '  (all)', rows.map(c => [
      'purpclaw ' + c.name + (c.aliases && c.aliases.length ? '  [' + c.aliases.join(' ') + ']' : ''),
      (c.description || '') + (c.json ? '  [--json]' : ''),
    ]));
  }

  // Port quick-ref
  console.log(`\n  ${col(C.cyan + C.bold, 'ðŸ—º  PORTS')}`);
  console.log(col(C.gray, '  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”'));
  const portRows = [
    [3000, 'Next.js Mission Control UI'],
    [7780, 'unified-api   â€” main HTTP API + MCP tools'],
    [7781, 'voice-coord   â€” intent parsing + TTS'],
    [7782, 'eventbus      â€” central pub/sub broker'],
    [7783, 'state-store   â€” shared state namespaces'],
    [7784, 'orchestrator  â€” priority queue + governance'],
    [7790, 'agent-tower   â€” 44 swarm agents (animals), spawning'],
    [7791, 'gatekeeper    â€” pre-merge validation'],
    [7881, 'context-bus   â€” cross-agent context propagation'],
    [7884, 'neuro-symbolic bridge (Python)'],
    [7885, 'pool          â€” knowledge pool (skills + agents)'],
    [7889, 'vision-monitor â€” webcam + YOLO'],
    [7890, 'metrics       â€” health polling + SSE heartbeat'],
    [7895, 'autodream     â€” memory consolidation'],
    [7897, 'worker-pool   â€” overflow lane (HTTP/SSH workers)'],
  ];
  for (const [port, desc] of portRows) {
    console.log(col(C.gray, '  â”‚') + `  ${col(C.cyan, String(port).padStart(5))}  ${col(C.white, String(desc).padEnd(54))}` + col(C.gray, 'â”‚'));
  }
  console.log(col(C.gray, '  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜'));

  console.log('');
  console.log(`  ${col(C.magenta, 'purpclaw tui')}   ${col(C.gray, 'â€” launch the live cockpit')}`);
  console.log(`  ${col(C.gray, 'Web UI')}        ${col(C.gray, 'â€”')}  ${col(C.cyan, 'http://localhost:3000')}`);
  console.log(`  ${col(C.gray, 'Pool')}          ${col(C.gray, 'â€”')}  ${col(C.cyan, 'http://localhost:7885')}`);
  console.log('');
  console.log(col(C.gray, '  The hammers walk. The tickets file themselves. The pool is open.'));
  console.log(col(C.dim,  '  â€” Built by Eddie Cannon. Maintained by the goose. Watched by the mochi.'));
  console.log(col(C.dim,  `  ${TAINT_MODE ? col(C.magenta, '  ðŸŽ¨ taint mode is ON. the interface is embodying state. slightly damp.') : '  append --taint to any command. you\'ll know.'}\n`));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  ENTRY POINT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function main() {
  // â”€â”€ Belt-and-brace secret redaction across the entire CLI lifetime â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Wraps stdout + stderr at the lowest level so anything printed (our logs,
  // child-process inheritance, error stacks, third-party library noise) gets
  // run through the redactor first. Catches: env-var lines, JWTs, sk-â€¦ keys,
  // long hex blobs, X-Worker-Token headers, Bearer tokens. Opt-out via
  // PURPCLAW_NO_REDACT=1 for debugging.
  if (process.env.PURPCLAW_NO_REDACT !== '1') {
    try {
      const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
      redactor.wrapStream(process.stdout);
      redactor.wrapStream(process.stderr);
    } catch { /* redactor optional â€” never block CLI if module missing */ }
  }

  const argv = process.argv.slice(2);
  // Strip --bars / --no-bars flags so they don't pollute command args
  const wantBars  = argv.includes('--bars')    || process.env.PURPCLAW_BARS === '1';
  const skipBars  = argv.includes('--no-bars') || process.env.PURPCLAW_BARS === '0';
  const cleanArgv = argv.filter(a => a !== '--bars' && a !== '--no-bars' && a !== '--taint');

  // Taint mode Easter egg announcement
  if (TAINT_MODE) {
    console.log(col(C.magenta + C.bold, '\n  ðŸŽ¨ TAINT MODE ACTIVATED. the interface will now embody state.'));
    console.log(col(C.gray, '  errors are now emotionally resonant. success is slightly damp.\n'));
  }
  let [command, ...args] = cleanArgv;

  // 2026-08-17: slash command parity with Claude Code / Antigravity CLI / Kimi CLI.
  // `purpclaw /status` is equivalent to `purpclaw status`. New slash commands
  // that don't have a non-slash alias (like /plan, /clear, /compact) are routed
  // through the case statement below. This keeps the existing 148 cases
  // working while adding the modern slash ergonomics.
  if (command && command.startsWith('/')) {
    command = command.slice(1);
    if (!command) { cmdHelp(); return; }
  }

  // Git Bash (MSYS) path conversion rewrites a leading-slash command like
  // `/status` into a Windows path (`C:/Program Files/Git/status`). Reverse it:
  // a drive-absolute arg whose file does not exist and whose basename is a
  // known command was a slash command before the shell touched it.
  if (command && /^[A-Za-z]:[\\/]/.test(command)) {
    const base = command.split(/[\\/]/).pop().toLowerCase();
    const reg = require(path.join(PURP_DIR, 'lib', 'cli', 'registry'));
    if (!fs.existsSync(command) && reg.find(base)) {
      command = base;
    }
  }

  // Explicit help/version paths
  if (command === 'help' || command === '--help' || command === '-h') {
    cmdHelp(args[0]); return;
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
    const pkgVersion = require(path.join(PURP_DIR, 'package.json')).version || '0.0.0';

    console.log('');
    console.log(col(C.cyan + C.bold, `  ðŸŸ£ PURPCLAW v${pkgVersion} â€” AI Workstation OS`));
    console.log(col(C.gray, '  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€'));

    if (ready > 0) {
      console.log(col(C.green, `  âœ… ${ready} provider(s) detected:`));
      Object.entries(found).slice(0, 5).forEach(([id, info]) => {
        console.log(col(C.gray, `     ${id} â€” ${info.source === 'local' ? 'local' : info.key}`));
      });
    } else {
      console.log(col(C.yellow, '  âš  No API keys detected.'));
    }

    console.log('');
    console.log(col(C.white, '  What would you like to launch?'));
    console.log('');
    console.log(col(C.cyan, `    ${col(C.bold, '1')}. CLI chat        `) + col(C.gray, '(purpclaw ask â€” interactive agent chat)'));
    console.log(col(C.cyan, `    ${col(C.bold, '2')}. TUI cockpit     `) + col(C.gray, '(purpclaw tui â€” live dashboard)'));
    console.log(col(C.cyan, `    ${col(C.bold, '3')}. TUI ask         `) + col(C.gray, '(purpclaw tui ask â€” full-screen chat)'));
    console.log(col(C.cyan, `    ${col(C.bold, '4')}. WebUI           `) + col(C.gray, '(http://localhost:3000 â€” mission control)'));
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
        console.log(col(C.green, '\n  ðŸš€ Opening WebUI at http://localhost:3000'));
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
  function loadCmd(name) {
    return require(path.join(PURP_DIR, 'lib', 'commands', name + '.js'));
  }

  // Canonical command registry — identity, aliases, modules, help, completion
  const CLI_REGISTRY = require(path.join(PURP_DIR, 'lib', 'cli', 'registry'));

  // Shared context object passed to all lib/commands modules
  function sharedCtx() {
    return {
      PURP_DIR, C, col, spinner, httpGet, httpPost, ping, PORTS,
      isTTY, sectionHead, banner,
    };
  }

  // Helper: dispatches the command, optionally wrapped in mochi status bars
  async function dispatch() {
    // ── Registry-first dual dispatch ──────────────────────────────────────
    // lib/cli/registry.js is the canonical command table. Registry-only
    // commands (migrated orphans) route straight to their module; commands
    // the switch already handles fall through to it unchanged; anything else
    // is an error — natural-language tasks belong to `run` / `ask`.
    const entry = CLI_REGISTRY.find(command);
    if (entry && !entry.inSwitch && entry.module) {
      return loadCmd(entry.module).run(args, sharedCtx());
    }
    if (!entry) {
      const suggestions = CLI_REGISTRY.suggest(command);
      console.error(col(C.red, `\n  Unknown command: ${command}`));
      if (suggestions.length) console.error(col(C.gray, `  Did you mean: ${suggestions.join(', ')}`));
      console.error(col(C.gray, `  Natural-language tasks: purpclaw run <goal>  ·  purpclaw ask`));
      process.exit(2);
    }
    switch (command.toLowerCase()) {
    case 'tui':
    case 'ui':        return cmdTui(args);
    case 'init':      return cmdInit(args);
    case 'start':     return cmdStart(args);
    case 'stop':      return cmdStop(args);
    case 'restart':   return cmdRestart(args);
    case 'chat':      return cmdChat(args);
    case 'run':       return cmdRun(args);
    case 'plan':      return cmdPlan(args);
    case 'clear':     return cmdClear(args);
    case 'compact':   return cmdCompact(args);
    case 'status':    return cmdStatus();
    case 'doctor':    return cmdDoctor(args);
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
 case 'resume':   return cmdResume(args);
    case 'context':  return cmdContext(args);
    case 'pool':     return cmdPool(args);
    case 'tick':     return cmdTick(args);
    case 'mochi':      return cmdMochi(args);
    case 'spaghetti': return cmdSpaghetti(args);
    case 'llm':       return loadCmd('llm').run(args, sharedCtx());
    case 'browser':
    case 'browse':    return loadCmd('browser').run(args, sharedCtx());
    case 'cognition':
    case 'cog':       return loadCmd('cognition').run(args, sharedCtx());
    case 'code':
    case 'github':
    case 'gitx':      return loadCmd('code').run(args, sharedCtx());
    case 'lora':      return cmdLora(args);
    case 'checkpoint':
    case 'cp':        return cmdCheckpoint(args);
    case 'certify':
    case 'cert':      return cmdCertify(args);
    case 'cryosleep':
    case 'sleep':
    case 'wake':      return cmdCryosleep(args);
    case 'steering':  return cmdSteering(args);
    case 'bench':
    case 'provider-bench':
    case 'benchmarks':return cmdBench(args);
    case 'model':     return cmdModel(args);
    case 'models':    return cmdModel(args);
    case 'agents':    return cmdAgents();
    case 'profiles':  return cmdProfiles();
    case 'workflows': return cmdWorkflows();
    case 'queue':     return cmdQueue();
    case 'memory':    return cmdMemory(args);
    case 'parity':    return cmdParity(args);
    case 'constitution':
    case 'law':       return cmdConstitution(args);
    case 'soul-memory':
    case 'memory-contract': return cmdSoulMemory(args);
    case 'cross-review':
    case 'xreview':         return cmdCrossReview(args);
    case 'dream':     return cmdDream();
    case 'forge':     return cmdForge(args);
    case 'skill-forge':
    case 'skillforge':return cmdSkillForge(args);
    case 'subagent':
    case 'bridge':    return cmdSubagent(args);
    case 'team':      return cmdTeam(args);
    case 'team-roster':
    case 'roster':    return cmdTeamRoster(args);
    case 'websearch':  return cmdWebsearch(args);
    case 'forgecode':
    case 'forge-code':
    case 'ptc':       return cmdForgeCode(args);
    case 'sessionlog':
    case 'session-log':
    case 'session':   return cmdSessionLog(args);
    case 'hooks':     return loadCmd('hooks').run(args, sharedCtx());
    case 'skill-discovery':
    case 'discover':  return loadCmd('skill-discovery').run(args, sharedCtx());
    case 'pr':        return loadCmd('pr').run(args, sharedCtx());
    case 'release':   return loadCmd('release').run(args, sharedCtx());
    case 'skillgraph':
    case 'skill-graph':
    case 'skills':    return cmdSkillGraph(args);
    case 'look':      return cmdLook(args);
    case 'voice':     return cmdVoice(args);
    case 'config':    return cmdConfig(args);
    case 'logs':      return cmdLogs(args);
    case 'bars':       return cmdBars(args);
    case 'show':
    case 'stack':     return cmdStatus();
    case 'audit':      return cmdAudit(args);
    case 'whoami':
    case 'about':      return cmdWhoami(args);
    case 'health':     return cmdHealth(args);
    case 'identity':   return loadCmd('identity').run(args, sharedCtx());
    case 'embeddings': return cmdEmbeddings(args);
    case 'embed':      return cmdEmbeddings(['embed', ...args]);
    // â”€â”€ Resurrected commands (lib/commands/) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    case 'automate':
    case 'atbs':      return loadCmd('automate').run(args);
    case 'setup':
    case 'wizard':    return loadCmd('setup').run(args, sharedCtx());
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
    case 'evolve':    return loadCmd('evolve').run(args, sharedCtx());
    case 'safe-stop':
    case 'safestop':  return loadCmd('safe-stop').run(args, sharedCtx());
    case 'services':  return loadCmd('services').run(args, sharedCtx());
    case 'heal':
    case 'recover':   return loadCmd('heal').run(args, sharedCtx());
    case 'training':  return cmdTrainingFeedback(args);
    case 'idle':      return cmdIdleEngine(args);
    case 'vector':    return cmdVectorBench(args);
    default:
      // Unreachable in the registry era: unknown commands are rejected before
      // the switch. Kept as a hard guard - a command reaching here means the
      // registry and the switch have drifted apart.
      console.error(col(C.red, '\n  Internal dispatch drift: "' + command + '" passed the registry check but has no case.'));
      console.error(col(C.gray, '  Report this - lib/cli/registry.js and the switch disagree.'));
      process.exit(2);
    }
  }

  // Wrap in mochi status bars if --bars / PURPCLAW_BARS=1 and command doesn't own its own screen
  if (useBars) {
    const sb = require(path.join(PURP_DIR, 'lib', 'mochi-statusbar'));
    return sb.wrap(dispatch);
  }
  return dispatch();
}

// â”€â”€ training feedback â€” personal model growth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdTrainingFeedback(args) {
  const sub = (args[0] || 'status').toLowerCase();
  const FB = require(path.join(PURP_DIR, 'lib', 'user-feedback'));

  if (sub === 'status') {
    const s = FB.status();
    console.log('');
    console.log('  ðŸ§   PERSONAL MODEL GROWTH');
    console.log('  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
    console.log(`  Status:      ${s.enabled ? col(C.green, 'â— ACTIVE') : col(C.yellow, 'â—‹ OFF')}`);
    console.log(`  Session:     ${s.sessionId.substring(0, 8)}...`);
    console.log(`  Captures:    ${s.stats.total} total`);
    console.log(`  Corrections: ${s.stats.corrections} (need â‰¥10 for training)`);
    console.log(`  Preferences: ${s.stats.preferences}`);
    console.log(`  Directory:   ${s.feedbackDir}`);
    console.log('');
    if (s.recentFiles.length > 0) {
      console.log('  Recent capture files:');
      for (const f of s.recentFiles) console.log(`    ${f.file} â€” ${f.lines} records, ${(f.size/1024).toFixed(1)}KB`);
      console.log('');
    }
    console.log(`  ${col(C.cyan, s.trainingHint)}`);
    // â”€â”€ Personal dataset readiness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    console.log(col(C.green, `\n  âœ“ Feedback data cleared. New session: ${r.sessionId.substring(0, 8)}...\n`));
    return;
  }

  if (sub === 'export') {
    const format = args[1] || 'chatml';
    const data = FB.exportTrainingData(format);
    const outPath = path.join(FB.FEEDBACK_DIR, `personal-training-${format}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(col(C.green, `\n  âœ“ Exported ${data.length} training examples to ${outPath}`));
    console.log(col(C.gray, `  Format: ${format}  |  Ready for: purpclaw lora train --dataset ${outPath}\n`));
    return;
  }

  if (sub === 'off') {
    process.env.PURPCLAW_FEEDBACK_OFF = '1';
    console.log(col(C.yellow, '\n  â—‹ Personal model growth DISABLED. Set PURPCLAW_FEEDBACK_OFF=0 to re-enable.\n'));
    return;
  }

  if (sub === 'on') {
    delete process.env.PURPCLAW_FEEDBACK_OFF;
    console.log(col(C.green, '\n  â— Personal model growth ENABLED. All interactions will be captured locally.\n'));
    return;
  }

  console.log(col(C.yellow, `\n  Unknown subcommand: ${sub}`));
  console.log(col(C.gray, '  Try: status, reset, export, on, off\n'));
}

// â”€â”€ idle engine â€” the beast that wakes when you stop typing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdIdleEngine(args) {
  const sub = (args[0] || 'status').toLowerCase();

  if (sub === 'trigger' || sub === 'run') {
    const IE = require(path.join(PURP_DIR, 'lib', 'idle-engine'));
    console.log(col(C.cyan, '\n  ðŸ¦€  Forcing idle optimization cycle...\n'));
    const results = await IE.forceTrigger();
    console.log('');
    console.log('  Results:');
    for (const [phase, r] of Object.entries(results.phases || {})) {
      const icon = r.ok ? col(C.green, 'âœ“') : col(C.yellow, 'â—‹');
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
    console.log('  ðŸ¦€  IDLE ENGINE â€” the beast that wakes when you stop typing');
    console.log('  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
    console.log(`  Status:        ${s.active ? col(C.green, 'â— USER ACTIVE') : col(C.magenta, 'â—Œ IDLE â€” beast watching')}`);
    console.log(`  Sessions:      ${s.sessionCount}`);
    console.log(`  Idle cycles:   ${s.idleCycles}`);
    console.log(`  Last activity: ${s.lastActivityAt || 'never'}`);
    console.log(`  Current phase: ${s.currentPhase || 'none'}`);
    console.log(`  Idle delay:    ${s.idleDelayMs / 1000}s`);
    console.log(`  Auto-train:    ${s.autoTrainEnabled ? col(C.green, 'ON') : col(C.yellow, 'OFF')} (min ${s.minNewForTrain} new examples)`);
    console.log('');
    console.log(`  ðŸ—ï¸ðŸ‘¹ A/G RATIO:  ${ag.architect} Architect / ${ag.goblin} Goblin = ${col(ag.ratio >= 1 ? C.green : C.yellow, ag.ratio)}`);
    console.log(`  Contained:     ${ag.contained}  |  Escaped: ${ag.escaped}`);
    console.log(`  Threat Level:  ${ag.threatLevel === 'Stable' ? col(C.green, ag.threatLevel) : ag.threatLevel === 'Manageable' ? col(C.yellow, ag.threatLevel) : col(C.red, ag.threatLevel)}`);
    console.log(`  Verdict:       ${ag.verdict}`);
    console.log('');
    console.log(`  Personal data: ${s.personalStats.corrections} corrections, ${s.personalStats.preferences} preferences`);
    console.log(`  Ready to train: ${s.readyForAutoTrain ? col(C.green, 'âœ“ YES') : col(C.yellow, `â—‹ need ${s.minNewForTrain - (s.personalStats.corrections + s.personalStats.preferences + s.personalStats.edits)} more`)}`);
    console.log('');
    console.log(col(C.gray, '  purpclaw idle trigger    force optimization cycle now'));
    console.log(col(C.gray, '  The engine fires automatically 30s after each session ends'));
    console.log('');
    return;
  }

  console.log(col(C.yellow, `\n  Unknown subcommand: ${sub}`));
  console.log(col(C.gray, '  Try: status, trigger\n'));
}

// â”€â”€ vector bench â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cmdVectorBench(args) {
  const sub = (args[0] || 'bench').toLowerCase();
  
  if (sub === 'bench' || sub === 'run') {
    const benchPath = path.join(PURP_DIR, 'bin', 'purpclaw-vector-bench.js');
    const count = args[1] || '1000';
    const dim = args[2] || '768';
    const topK = args[3] || '10';
    const cmd = ['node', benchPath, count, dim, topK];
    const child = trackedSpawn(cmd[0], cmd.slice(1), { tag: 'vector-bench', stdio: 'inherit', timeoutMs: 120000 });
    child.on('exit', code => { if (code !== 0) console.log(col(C.red, `\n  âœ— Bench exited with code ${code}\n`)); });
    return;
  }

  if (sub === 'status') {
    const VECTOR = require(path.join(PURP_DIR, 'lib', 'vector'));
    const s = VECTOR.status();
    console.log('');
    console.log('  ðŸ¦€  VECTOR PROVIDER STATUS');
    console.log('  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
    console.log(`  Default:    ${s.defaultProvider}`);
    console.log(`  FAISS:      ${s.faiss?.ready ? col(C.green, 'â— ONLINE') : col(C.yellow, 'â—‹ no index')} (${s.faiss?.indexed || 0} indexed, ${s.faiss?.tombstones || 0} tombstoned)`);
    console.log(`  TurboVec:   ${col(C.yellow, 'â—Œ PARKED â€” requires AVX2 CPU')}`);
    console.log('');
    return;
  }

  console.log(col(C.yellow, `\n  Unknown subcommand: ${sub}\n  Try: bench, status\n`));
}

// â”€â”€ bars â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ show / stack â€” full overview of the running system
// â”€â”€ model â€” hot-swap provider/model, list, test, serve local GGUF
async function cmdModel(args) {
  const sub = (args[0] || '').toLowerCase();
  const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
  const fs = require('fs');

  // purpclaw model list
  if (sub === 'list') {
    const info = llm.getProviderInfo();
    const providers = llm.listProviders();
    console.log('');
    console.log('  ðŸ—ï¸  AVAILABLE PROVIDERS');
    console.log('');
    for (const p of providers) {
      const active = info.main.provider === p ? ' â—€ active' : '';
      const swarm = info.swarm.provider === p ? ' â—€ swarm' : '';
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
    console.log(`  âœ… Switched to ${col(C.cyan, provider)}/${col(C.green, model)}`);
    console.log(col(C.gray, '  Hot-reloaded â€” next chat uses this provider/model.'));
    console.log('');
    return;
  }

  // purpclaw model test "prompt"
  if (sub === 'test') {
    const prompt = args.slice(1).join(' ') || 'Say hello in one word.';
    console.log('');
    console.log(`  ðŸ§ª Testing: ${col(C.cyan, llm.getProviderInfo().main.provider)}/${col(C.green, llm.getProviderInfo().main.model)}`);
    console.log(`  Prompt: \"${prompt}\"`);
    console.log('');
    try {
      const resp = await llm.complete(prompt, { maxTokens: 100 });
      console.log(`  âœ… Response: ${col(C.green, (resp || '(empty)').substring(0, 200))}`);
    } catch (e) {
      console.log(`  âŒ Error: ${col(C.red, e.message)}`);
    }
    console.log('');
    return;
  }

  // purpclaw model reload â€” refresh .env into process.env
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
      console.log(`  âœ… Environment reloaded from .env`);
    } catch (e) {
      console.log(`  âŒ Failed to reload .env: ${e.message}`);
    }
    console.log('');
    return;
  }

  // purpclaw model current â€” show full routing table
  if (sub === 'current') {
    const info = llm.getProviderInfo();
    console.log('');
    console.log('  ðŸ§  ACTIVE MODEL ROUTING');
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
      console.error(col(C.magenta, `\n  âœ— ${taintError(e.message)}\n`));
    } else {
      console.error(col(C.red, `\n  âœ— Unhandled error: ${e.message}\n`));
    }
    process.exit(1);
  });
}
