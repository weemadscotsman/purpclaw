'use strict';

/**
 * purpclaw services — runtime service discovery + health probe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Scans a port range (default 7770–7900) for services that answer a
 * health probe. Cross-references against ecosystem.config.js to label
 * them. Reports what's online, what's missing, and what the runtime
 * can/can't reach.
 *
 *   purpclaw services scan              — port range scan + ecosystem cross-ref
 *   purpclaw services list              — list services from ecosystem (no probe)
 *   purpclaw services probe <port>     — probe a single port (any path)
 *   purpclaw services live              — list only the live ones
 *   purpclaw services missing           — list the ones the ecosystem expects but DOWN
 *
 * The probe is honest: it sends a real HTTP request to each port and
 * records the response. No fake "online" statuses.
 */

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('http');

const PURP_DIR = process.env.PURP_DIR || 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW';
const ECOSYSTEM = path.join(PURP_DIR, 'ecosystem.config.js');
const SERVICE_REGISTRY = path.join(PURP_DIR, 'service_registry.js');

const PORT_RANGE_START = 7770;
const PORT_RANGE_END   = 7900;
const PROBE_TIMEOUT_MS = 800;

function probe(port, paths = ['/health', '/api/health', '/api/status', '/tower/status', '/']) {
  return new Promise(resolve => {
    let tried = 0;
    const results = [];
    const tryPath = (i) => {
      if (i >= paths.length) {
        return resolve({ port, ok: false, status: 'no-health-endpoint', results });
      }
      const p = paths[i];
      const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET', timeout: PROBE_TIMEOUT_MS }, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          results.push({ path: p, status: res.statusCode });
          if (res.statusCode === 200) {
            // Try to parse as JSON for a status field
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

async function scanRange(start, end) {
  const ports = [];
  for (let p = start; p <= end; p++) ports.push(p);
  // Probe in parallel with a concurrency cap
  const CONC = 32;
  const results = [];
  for (let i = 0; i < ports.length; i += CONC) {
    const slice = ports.slice(i, i + CONC);
    const r = await Promise.all(slice.map(p => probe(p)));
    for (const x of r) if (x.ok) results.push(x);
  }
  return results.sort((a, b) => a.port - b.port);
}

function loadEcosystem() {
  try {
    // Clear require cache so a fresh load is cheap but the result is consistent
    delete require.cache[require.resolve(ECOSYSTEM)];
    return require(ECOSYSTEM).apps.filter(a => !a.disabled);
  } catch (e) { return []; }
}

function loadServiceRegistry() {
  try {
    delete require.cache[require.resolve(SERVICE_REGISTRY)];
    return require(SERVICE_REGISTRY).SERVICES || [];
  } catch (e) { return []; }
}

function pm2Names() {
  try {
    // On Windows, node's spawnSync doesn't auto-resolve .cmd / .bat
    // shims. Force shell:true so PATH is honored (the .cmd wrapper
    // works correctly through the shell even without a shebang).
    const r = spawnSync('pm2', ['jlist'], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 100 * 1024 * 1024, shell: process.platform === 'win32' });
    if (r.status !== 0 || !r.stdout) return new Set();
    const list = JSON.parse(r.stdout);
    return new Set(list.map(p => p.name).filter(Boolean));
  } catch { return new Set(); }
}

async function run(args, ctx) {
  const { C, col, PURP_DIR: pd } = ctx;
  const sub = (args[0] || 'scan').toLowerCase();
  const rest = args.slice(1);
  console.log('');
  console.log(`  ${col(C.bold || C.white, '🔌  PURPCLAW SERVICES')}  ${col(C.gray, '· runtime discovery + health probe')}`);
  console.log('');

  if (sub === 'probe') {
    const port = parseInt(rest[0] || '0', 10);
    if (!port) { console.log(col(C.red, '  usage: purpclaw services probe <port>\n')); return; }
    const r = await probe(port);
    console.log(`  ${col(C.cyan, `port ${port}:`)}  ${r.ok ? col(C.green, r.status) : col(C.red, r.status || 'no-answer')}`);
    if (r.path) console.log(`    ${col(C.gray, 'path: ' + r.path)}`);
    if (r.body) console.log(`    ${col(C.gray, 'body: ' + r.body.slice(0, 200))}`);
    console.log('');
    return;
  }

  if (sub === 'list') {
    const eco = loadEcosystem();
    const pm2 = pm2Names();
    console.log(`  ${col(C.cyan, 'ecosystem services:')}  ${eco.length}`);
    for (const a of eco) {
      const online = pm2.has(a.name);
      console.log(`    ${col(online ? C.green : C.yellow, '●')}  ${col(C.white, a.name.padEnd(28))} ${col(C.gray, 'pid=' + (a.script || '?').slice(0, 40))}`);
    }
    console.log('');
    return;
  }

  // Default: full scan
  const start = PORT_RANGE_START;
  const end   = parseInt(rest[0] || String(PORT_RANGE_END), 10);

  console.log(`  ${col(C.cyan, '↪')}  scanning ports ${start}-${end}…\n`);
  const t0 = Date.now();
  const hits = await scanRange(start, end);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ${col(C.cyan, 'found:')}  ${col(C.green, hits.length + ' services')}  ${col(C.gray, '(in ' + elapsed + 's)')}`);
  console.log('');

  // Build port → (ecosystem name, registry name) lookup
  const eco = loadEcosystem();
  const reg = loadServiceRegistry();
  const pm2 = pm2Names();

  const portMap = new Map();
  for (const a of eco) {
    // Extract port from script args
    const argPort = (a.args || '').match(/--port\s+(\d+)/);
    const port = argPort ? parseInt(argPort[1], 10) : null;
    if (port) portMap.set(port, { name: a.name, source: 'ecosystem', optional: a.optional, pm2: a.name });
  }
  const registryByPort = new Map();
  for (const s of reg) {
    if (!s.port) continue;
    const list = registryByPort.get(s.port) || [];
    list.push(s);
    registryByPort.set(s.port, list);
  }
  for (const [port, services] of registryByPort.entries()) {
    const primary = services[0];
    const pm2Name = primary.pm2 || (primary.key ? 'purpclaw-' + primary.key : null);
    const cognitiveSpine = services.length > 1 && services.every(s => s.group === 'cognitive' && s.pm2 === pm2Name);
    portMap.set(port, {
      name: cognitiveSpine ? `Cognitive Spine (${services.length} modules)` : primary.name,
      key: cognitiveSpine ? 'cognitive-spine' : primary.key,
      source: 'registry',
      group: primary.group,
      optional: services.every(s => s.required === false),
      pm2: pm2Name
    });
  }

  console.log('  ' + col(C.gray, 'PORT     STATUS     NAME                              PM2        SOURCE'));
  console.log('  ' + col(C.gray, '─'.repeat(96)));
  for (const h of hits) {
    const meta = portMap.get(h.port) || { name: 'unknown' };
    const online = meta.pm2 ? pm2.has(meta.pm2) : false;
    const statusText = h.status === 'online' || h.status === 'healthy' ? col(C.green, '●  ' + h.status)
                     : h.status === 'degraded' ? col(C.yellow, '◐  ' + h.status)
                     : col(C.red, '○  ' + h.status);
    console.log(`  ${col(C.cyan, String(h.port).padStart(7))}  ${statusText.padEnd(20)}  ${col(C.white, (meta.name || 'unknown').padEnd(32))}  ${col(online ? C.green : C.gray, online ? 'online' : 'offline')}    ${col(C.gray, meta.source || 'orphan')}`);
  }
  console.log('');

  // Cross-reference: ecosystem says X but no live port
  const livePorts = new Set(hits.map(h => h.port));
  const missing = [];
  for (const [port, meta] of portMap.entries()) {
    if (!livePorts.has(port) && meta.source === 'ecosystem' && !meta.optional) {
      missing.push({ port, ...meta });
    }
  }
  if (missing.length) {
    console.log(`  ${col(C.yellow, '⚠  ecosystem services DOWN (non-optional):')}`);
    for (const m of missing) {
      console.log(`    ${col(C.red, m.port)}  ${col(C.white, m.name)}  ${col(C.gray, '(purpclaw-safe-start would bring these up)')}`);
    }
    console.log('');
  }

  // Orphans: live ports we don't know about
  const known = new Set(portMap.keys());
  const orphans = hits.filter(h => !known.has(h.port));
  if (orphans.length) {
    console.log(`  ${col(C.gray, 'ℹ  ports responding but not in ecosystem:')}`);
    for (const o of orphans) {
      console.log(`    ${col(C.gray, o.port)}  ${col(C.gray, '— no service registered (orphan)')}`);
    }
    console.log('');
  }
}

module.exports = { run, probe, scanRange };
