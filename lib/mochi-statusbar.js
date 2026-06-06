'use strict';

/**
 * Mochi Status Bar
 * ================
 * Compact one-line mochi presence for the top and bottom of CLI output.
 *
 * Usage from bin/purpclaw.js:
 *   const sb = require('./lib/mochi-statusbar');
 *   await sb.printTop();      // before command output
 *   ...command runs...
 *   await sb.printBottom();   // after command output
 *
 * Or both in one call:
 *   await sb.wrap(() => cmdSomething(args));
 *
 * Layout (TOP):
 *   ┌─ Marbles  ~(··)~  ◌◌◌◌◌  mood: curious  ─ pool ✓ 139 skills · 38 agents ─┐
 *
 * Layout (BOTTOM):
 *   └─ services 9/9 ✓  ·  reasoning idle  ·  approvals 0  ·  uptime 11h ────────┘
 *
 * Cheap to render — at most 2 HTTP calls (pool stats, reasoning health) cached
 * for 5 seconds so repeated commands don't spam the services.
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');

const PURP_DIR    = path.resolve(__dirname, '..');
const MOCHI_FILE  = path.join(PURP_DIR, 'agent_work', 'mochi.json');
const POOL_PORT   = parseInt(process.env.POOL_PORT       || '7885', 10);
const REASON_PORT = parseInt(process.env.REASONING_PORT  || '7892', 10);

// ── Tiny color helpers (mirror what's in bin/purpclaw.js, kept local so this
// file has zero internal deps and can be used by any service). ───────────────
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', gray: '\x1b[90m', white: '\x1b[37m',
};
const isTTY = !!(process.stdout.isTTY);
const col   = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

// ── Cache (TTL 5s) ───────────────────────────────────────────────────────────
const cache = { poolStats: null, reasoning: null, mochi: null, fetchedAt: 0 };
const TTL_MS = 5000;

function httpGetJson(port, pathname, timeoutMs = 800) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'GET' }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end',  () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function readMochi() {
  try { return JSON.parse(fs.readFileSync(MOCHI_FILE, 'utf8')); }
  catch { return null; }
}

async function refresh(force = false) {
  if (!force && (Date.now() - cache.fetchedAt) < TTL_MS) return;
  const [pool, reason] = await Promise.all([
    httpGetJson(POOL_PORT,   '/pool/stats'),
    httpGetJson(REASON_PORT, '/health'),
  ]);
  cache.poolStats = pool;
  cache.reasoning = reason;
  cache.mochi     = readMochi();
  cache.fetchedAt = Date.now();
}

// ── Mood face from sprite faces table (small subset, no full sprite library
// dependency so this stays portable). The full faces are in lib/mochi-sprites.
// ─────────────────────────────────────────────────────────────────────────────
function moodFace(mochi) {
  if (!mochi) return '(·_·)';
  const eye = mochi.eye || '·';
  const faces = {
    duck    : `(${eye}>`,         goose   : `(${eye}>`,
    blob    : `(${eye}${eye})`,    cat     : `=${eye}ω${eye}=`,
    dragon  : `<${eye}~${eye}>`,    octopus : `~(${eye}${eye})~`,
    owl     : `(${eye})(${eye})`,  penguin : `(${eye}>)`,
    turtle  : `[${eye}_${eye}]`,    snail   : `${eye}(@)`,
    ghost   : `/${eye}${eye}\\`,    axolotl : `}${eye}.${eye}{`,
    capybara: `(${eye}oo${eye})`,   cactus  : `|${eye}  ${eye}|`,
    robot   : `[${eye}${eye}]`,    rabbit  : `(${eye}..${eye})`,
    mushroom: `|${eye}  ${eye}|`,   chonk   : `(${eye}.${eye})`,
  };
  return faces[mochi.species] || `(${eye}${eye})`;
}

function moodLabel(mochi, services) {
  // Heuristic mood from current world state — no LLM needed.
  if (!services || !services.online) return 'offline';
  if (services.requiredDown > 0)     return 'worried';
  if (services.online === services.total) return 'content';
  if (mochi && mochi.interactions > 10)   return 'curious';
  return 'idle';
}

// Truncate or pad to a fixed visible width (ignores ANSI escape codes).
function visibleLen(s) { return s.replace(/\x1b\[[0-9;]*m/g, '').length; }

function getLedgerStats() {
  const ledgerPath = path.join(PURP_DIR, 'agent_work', 'llm-ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) {
    return { totalCalls: 0, totalTokens: 0, totalCost: 0, lastModel: 'none' };
  }
  try {
    const raw = fs.readFileSync(ledgerPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    let totalCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let lastModel = 'none';

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        totalCalls++;
        totalTokens += entry.total_tokens || 0;
        totalCost += entry.estimatedCost || 0;
        if (entry.model) {
          lastModel = entry.model;
        }
      } catch {}
    }
    return { totalCalls, totalTokens, totalCost, lastModel };
  } catch {
    return { totalCalls: 0, totalTokens: 0, totalCost: 0, lastModel: 'none' };
  }
}

// ── Top bar ──────────────────────────────────────────────────────────────────
async function buildTop() {
  await refresh();
  const m = cache.mochi;
  const name    = m ? (m.name || 'Mochi') : 'Mochi';
  const species = m ? (m.species || 'mochi') : 'mochi';
  const face    = moodFace(m);
  const pool    = cache.poolStats;
  const poolBit = pool
    ? `${col(C.green, '✓')} ${pool.skillsCount || 0} skills · ${pool.agentsCount || 0} agents`
    : `${col(C.red,   '✗')} pool offline`;

  const mood    = moodLabel(m, { online: pool ? 1 : 0, total: 1, requiredDown: 0 });

  // Ledger stats
  const ledger = getLedgerStats();
  const modelStr = ledger.lastModel !== 'none' ? `${col(C.gray, 'model:')}${col(C.cyan, ledger.lastModel)}` : '';

  // MCP status via omnicode-bridge
  let mcpStr = '';
  try {
    const bridge = require('./omnicode-bridge');
    const status = bridge.getBridgeStatus({ rootDir: PURP_DIR });
    if (status.ok) {
      const active = status.capabilities.builtServerAvailable;
      mcpStr = `${col(C.gray, 'mcp:omnicode')} (${col(active ? C.green : C.yellow, active ? 'active' : 'ready')})`;
    }
  } catch {}

  const left  = `${col(C.magenta + C.bold, name)} ${col(C.magenta, face)} ${col(C.gray, species)} ${col(C.gray, '(' + mood + ')')}`;
  const right = [mcpStr, modelStr, `${col(C.gray, 'pool')} ${poolBit}`].filter(Boolean).join(`  ${col(C.gray, '·')}  `);

  const W = process.stdout.columns || 80;
  const pad = Math.max(0, W - 6 - visibleLen(left) - visibleLen(right));
  return `${col(C.gray, '┌─')} ${left} ${col(C.gray, '─'.repeat(pad))} ${right} ${col(C.gray, '─┐')}`;
}

// ── Bottom bar ───────────────────────────────────────────────────────────────
async function buildBottom(services) {
  // services = { online, total, requiredDown } — passed in if caller already has it,
  // otherwise we estimate from the pool reachability.
  await refresh();
  if (!services) {
    const reachable = cache.poolStats ? 1 : 0;
    services = { online: reachable, total: 1, requiredDown: 0 };
  }

  const svcStr = services.requiredDown
    ? col(C.yellow, `services ${services.online}/${services.total}  ⚠ ${services.requiredDown} down`)
    : col(C.green,  `services ${services.online}/${services.total} ✓`);

  const reason  = cache.reasoning;
  const reasonStr = reason
    ? `${col(C.gray, 'reasoning')} ${col(C.green, 'ticking')}`
    : `${col(C.gray, 'reasoning')} ${col(C.gray, 'idle')}`;

  const ledger = getLedgerStats();
  const tokenStr = ledger.totalCalls > 0
    ? `${col(C.gray, 'burn:')}${col(C.yellow, (ledger.totalTokens / 1000).toFixed(1) + 'k tokens')} (${col(C.green, '$' + ledger.totalCost.toFixed(4))})`
    : '';

  const left  = `${svcStr}`;
  const right = [reasonStr, tokenStr].filter(Boolean).join(`  ${col(C.gray, '·')}  `);

  const W = process.stdout.columns || 80;
  const pad = Math.max(0, W - 6 - visibleLen(left) - visibleLen(right));
  return `${col(C.gray, '└─')} ${left} ${col(C.gray, '─'.repeat(pad))} ${right} ${col(C.gray, '─┘')}`;
}

async function printTop()    { console.log(await buildTop()); }
async function printBottom(services) { console.log(await buildBottom(services)); }

// Wrap a command between top and bottom bars.
async function wrap(fn, opts = {}) {
  if (opts.silent) return fn();
  await printTop();
  try { return await fn(); }
  finally { await printBottom(opts.services); }
}

module.exports = { printTop, printBottom, wrap, buildTop, buildBottom, refresh };
