'use strict';

/**
 * auto-discovery-probe.js — scan a port range, find live services, cross-ref
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * USE THIS WHEN:
 *   - The UI says "X/Y services live" but you suspect the real count is different.
 *   - You added a service to ecosystem.config.js but the UI doesn't see it.
 *   - A service moved ports and you want to know what's actually listening.
 *   - You're investigating why the "core" boot seems to be missing services.
 *
 * THIS TEMPLATE IS GENERIC. Adapt the paths and the per-service probing
 * to your stack. The pattern is:
 *
 *   1. Scan a port range in parallel with concurrency cap
 *   2. For each port, try multiple health-probe paths in order
 *   3. Cross-reference with ecosystem config + service registry + pm2 jlist
 *   4. Report: live / down / orphan (responding but not registered)
 *
 * Pattern proven in PURPCLAW (lib/commands/services.js). Found 24 live
 * services on a system where the UI thought there were 10.
 *
 * ADAPT:
 *   - PORT_RANGE_START, PORT_RANGE_END: your stack's port space
 *   - HEALTH_PATHS: ordered list of health-probe URLs to try per port
 *   - loadEcosystem: parse your ecosystem / unit file
 *   - loadServiceRegistry: parse your service-registry file (if you have one)
 *   - pm2Names: list of pm2 process names
 */

const http = require('http');
const { spawnSync } = require('child_process');

const PORT_RANGE_START = 7770;
const PORT_RANGE_END   = 7900;
const PROBE_TIMEOUT_MS = 800;
const PROBE_CONCURRENCY = 32;

// ─── Probe one port with multiple health paths ──────────────────────────
function probe(port, paths = ['/health', '/api/health', '/api/status', '/tower/status', '/']) {
  return new Promise(resolve => {
    const tryPath = (i) => {
      if (i >= paths.length) {
        return resolve({ port, ok: false, status: 'no-health-endpoint' });
      }
      const p = paths[i];
      const req = http.request({
        hostname: '127.0.0.1', port, path: p, method: 'GET', timeout: PROBE_TIMEOUT_MS,
      }, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            let statusField = 'online';
            try {
              const j = JSON.parse(body);
              if (j.status) statusField = j.status;
              else if (j.ok === false) statusField = 'degraded';
            } catch {}
            return resolve({ port, ok: true, status: statusField, body, path: p });
          }
          tryPath(i + 1);
        });
      });
      req.on('error', () => tryPath(i + 1));
      req.on('timeout', () => { req.destroy(); tryPath(i + 1); });
      req.end();
    };
    tryPath(0);
  });
}

// ─── Scan the whole port range in parallel ─────────────────────────────
async function scanRange(start, end) {
  const ports = [];
  for (let p = start; p <= end; p++) ports.push(p);
  const results = [];
  for (let i = 0; i < ports.length; i += PROBE_CONCURRENCY) {
    const slice = ports.slice(i, i + PROBE_CONCURRENCY);
    const r = await Promise.all(slice.map(p => probe(p)));
    for (const x of r) if (x.ok) results.push(x);
  }
  return results.sort((a, b) => a.port - b.port);
}

// ─── Cross-reference: ecosystem + registry + pm2 ───────────────────────
function loadEcosystem(/* your ecosystem file path */) {
  // TODO: parse your ecosystem file. Example for PM2 ecosystem:
  //   const apps = require('./ecosystem.config.js').apps;
  //   for (const a of apps) {
  //     const argPort = (a.args || '').match(/--port\s+(\d+)/);
  //     if (argPort) portMap.set(parseInt(argPort[1], 10), { name: a.name, source: 'ecosystem' });
  //   }
  return new Map();
}

function loadServiceRegistry(/* your registry file path */) {
  // TODO: parse your service registry. Same shape as loadEcosystem.
  return new Map();
}

function pm2Names() {
  // On Windows, spawnSync does NOT auto-resolve .cmd shims. You MUST
  // pass shell: true or you get ENOENT. Bump timeout + maxBuffer for
  // large busy daemons.
  const opts = { encoding: 'utf-8', timeout: 30_000, maxBuffer: 100 * 1024 * 1024 };
  if (process.platform === 'win32') opts.shell = true;
  try {
    const r = spawnSync('pm2', ['jlist'], opts);
    if (r.status !== 0 || !r.stdout) return new Set();
    const list = JSON.parse(r.stdout);
    return new Set(list.map(p => p.name).filter(Boolean));
  } catch { return new Set(); }
}

// ─── Main: report live / down / orphan ─────────────────────────────────
async function main() {
  console.log(`scanning ports ${PORT_RANGE_START}-${PORT_RANGE_END}…`);
  const hits = await scanRange(PORT_RANGE_START, PORT_RANGE_END);
  console.log(`found ${hits.length} live services`);

  const portMap = new Map();
  for (const [port, meta] of loadEcosystem())      portMap.set(port, { ...meta, source: 'ecosystem' });
  for (const [port, meta] of loadServiceRegistry()) portMap.set(port, { ...meta, source: 'registry' });

  const pm2 = pm2Names();
  const livePorts = new Set(hits.map(h => h.port));
  const knownPorts = new Set(portMap.keys());

  console.log('\nPORT     STATUS     NAME                              PM2');
  console.log('─'.repeat(80));
  for (const h of hits) {
    const meta = portMap.get(h.port) || { name: 'unknown' };
    const online = meta.pm2 ? pm2.has(meta.pm2) : false;
    console.log(`${String(h.port).padStart(7)}  ${h.status.padEnd(20)}  ${(meta.name || 'unknown').padEnd(32)}  ${online ? 'online' : 'offline'}`);
  }

  // DOWN: in ecosystem but not live
  const missing = [...portMap.entries()].filter(([p]) => !livePorts.has(p));
  if (missing.length) {
    console.log('\n⚠  ecosystem services DOWN:');
    for (const [port, meta] of missing) console.log(`  ${port}  ${meta.name}`);
  }

  // ORPHAN: live but not in ecosystem
  const orphans = hits.filter(h => !knownPorts.has(h.port));
  if (orphans.length) {
    console.log('\nℹ  ports responding but not in ecosystem (orphans):');
    for (const o of orphans) console.log(`  ${o.port}  — investigate: what is this?`);
  }
}

if (require.main === module) main();
module.exports = { probe, scanRange };
