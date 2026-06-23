'use strict';

/**
 * Reasoning Tick — the swarm's heartbeat.
 *
 * One bounded round of the proactive loop. Safe to call from a scheduler,
 * a cron job, a manual CLI verb, or a smoke test. Idempotent within a tick.
 *
 * Each tick:
 *   1. Snapshots service health from the registry
 *   2. Pulls pool stats
 *   3. Writes a heartbeat memory entry to the pool
 *   4. Records any newly-detected service failures to pool failures.jsonl
 *   5. Proposes (does NOT execute) maintenance jobs via lib/proactive-maintenance
 *
 * What it does NOT do (deliberately):
 *   - Spawn agents
 *   - Restart services
 *   - Modify state outside the pool
 *
 * That separation is the whole governance contract: reasoning proposes,
 * the operator (or governance.checkWorkflow on the proposal) decides.
 *
 * Run manually:  `purpclaw tick`
 * Run as a loop: lib/reasoning-loop.js (sets it on a setInterval)
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');

const PURP_DIR    = path.resolve(__dirname, '..');
const SERVICE_REG = require(path.join(PURP_DIR, 'service_registry.js'));
const PROACTIVE   = (() => { try { return require(path.join(PURP_DIR, 'lib', 'proactive-maintenance.js')); } catch { return null; } })();
const MEMORY_SYNC = (() => { try { return require(path.join(PURP_DIR, 'lib', 'canonical-memory-sync.js')); } catch { return null; } })();
const POOL_PORT   = parseInt(process.env.POOL_PORT || '7885', 10);

const STATE_FILE  = path.join(PURP_DIR, 'agent_work', '.reasoning_state.json');

// ── Helpers ──────────────────────────────────────────────────────────────────
function ping(port, pathname, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'GET' }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end',  () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, body: data }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, body: 'timeout' }); });
    req.on('error', () => resolve({ ok: false, body: 'error' }));
    req.end();
  });
}

function poolRequest(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: POOL_PORT, path: pathname, method,
      headers: { 'Content-Type': 'application/json', 'X-Pool-Caller': 'reasoning-tick' },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end',  () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('pool timeout')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastTickAt: null, knownDown: {} }; }
}
function writeState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8');
  } catch { /* state file is best-effort */ }
}

// ── The tick ─────────────────────────────────────────────────────────────────
async function tick(options = {}) {
  const verbose = options.verbose === true;
  const log = verbose ? (...a) => console.log('[tick]', ...a) : () => {};
  const tickStart = Date.now();
  const tickId = `tick-${Date.now()}`;
  log('start', tickId);

  // 1. Probe every registered service
  const services = SERVICE_REG.getServices().filter(s => s.healthPort && s.healthPath);
  const probes   = await Promise.all(
    services.map(async s => ({
      key      : s.key,
      name     : s.name,
      port     : s.healthPort,
      group    : s.group,
      required : s.required !== false,
      ok       : (await ping(s.healthPort, s.healthPath)).ok,
    }))
  );

  const online        = probes.filter(p => p.ok);
  const offline       = probes.filter(p => !p.ok);
  const requiredDown  = offline.filter(p => p.required);
  log(`probed ${probes.length} services: ${online.length} online, ${offline.length} offline, ${requiredDown.length} required-down`);

  // 2. Pool snapshot (only if pool itself is alive)
  let poolStats = null;
  const poolAlive = probes.find(p => p.key === 'pool' && p.ok);
  if (poolAlive) {
    try { poolStats = await poolRequest('GET', '/pool/stats'); } catch { /* swallow */ }
  }

  // 3. Detect newly-failed services since last tick (don't re-report stable failures)
  const state = readState();
  state.knownDown = state.knownDown || {};
  const newlyDown = [];
  for (const p of offline) {
    if (!state.knownDown[p.key]) {
      newlyDown.push(p);
      state.knownDown[p.key] = { since: new Date().toISOString(), name: p.name, port: p.port };
    }
  }
  // Clear known-down for things that came back
  for (const key of Object.keys(state.knownDown)) {
    if (online.find(o => o.key === key)) delete state.knownDown[key];
  }

  // 4. Write heartbeat memory + failure records (only if pool reachable)
  const writes = { heartbeat: false, canonicalMemory: false, failures: 0, errors: [] };
  if (poolAlive) {
    try {
      const heartbeatMemory = {
        content : `tick ${tickId}: ${online.length}/${probes.length} services online`,
        topic   : 'heartbeat',
        agent   : 'reasoning-tick',
        keywords: ['heartbeat', 'tick', 'services', String(online.length), 'online'],
        ts      : new Date().toISOString(),
        tickId,
      };
      await poolRequest('POST', '/pool/memory/append', heartbeatMemory);
      writes.heartbeat = true;
      if (MEMORY_SYNC) {
        const synced = await MEMORY_SYNC.syncRecord(PURP_DIR, 'pool-memory', heartbeatMemory);
        writes.canonicalMemory = Boolean(synced?.imported || synced?.skipped);
      }
    } catch (e) { writes.errors.push(`heartbeat: ${e.message}`); }

    for (const p of newlyDown) {
      try {
        await poolRequest('POST', '/pool/failures/record', {
          failure   : `Service ${p.name} (${p.key}) went offline on port ${p.port}`,
          context   : `tick=${tickId} required=${p.required} group=${p.group}`,
          resolution: '',
          agent     : 'reasoning-tick',
        });
        writes.failures++;
      } catch (e) { writes.errors.push(`failure ${p.key}: ${e.message}`); }
    }
  }

  // 5. Propose (don't execute) maintenance jobs
  let proposals = [];
  if (PROACTIVE) {
    try {
      proposals = PROACTIVE.proposeMaintenanceJobs(PURP_DIR, {
        failedWorkflows: requiredDown.length,
        queueDepth     : 0,
      });
    } catch (e) { /* swallow */ }
  }

  // 6. Persist tick state
  state.lastTickAt = new Date().toISOString();
  state.lastTickId = tickId;
  state.lastSummary = {
    durationMs: Date.now() - tickStart,
    online    : online.length,
    offline   : offline.length,
    requiredDown: requiredDown.length,
    newlyDown : newlyDown.map(p => p.key),
    proposals : proposals.length,
    writes,
  };
  writeState(state);

  return {
    tickId,
    durationMs : Date.now() - tickStart,
    services   : { online: online.length, offline: offline.length, requiredDown: requiredDown.length, total: probes.length },
    poolAlive  : Boolean(poolAlive),
    poolStats  : poolStats ? { skills: poolStats.skillsCount, agents: poolStats.agentsCount, memories: poolStats.memories } : null,
    newlyDown  : newlyDown.map(p => ({ key: p.key, name: p.name, port: p.port, required: p.required })),
    proposals,
    writes,
  };
}

module.exports = { tick, readState };

// ── CLI entrypoint when invoked directly ─────────────────────────────────────
if (require.main === module) {
  tick({ verbose: process.argv.includes('--verbose') })
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(r.services.requiredDown ? 1 : 0); })
    .catch(e => { console.error('[tick] failed:', e.message); process.exit(2); });
}
