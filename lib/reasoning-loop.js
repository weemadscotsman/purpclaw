'use strict';

/**
 * Reasoning Loop — wraps lib/reasoning-tick on a setInterval.
 *
 * Long-lived process. Add to PM2 to make the swarm proactive:
 *   - Default cadence: 30 seconds (override with PURPCLAW_TICK_MS)
 *   - Default state:   running (set PURPCLAW_PROACTIVE=0 to disable & exit clean)
 *
 * Health surface:
 *   - GET /health  → liveness + last tick summary
 *
 * What the loop does NOT do:
 *   - Take any destructive action. Reasoning proposes, governance disposes.
 *   - Spawn agents directly. It writes proposals to the pool; an operator
 *     (or a future autopilot policy) decides whether to dispatch.
 */

const http = require('http');
const { tick, readState } = require('./reasoning-tick');

const TICK_MS = parseInt(process.env.PURPCLAW_TICK_MS || '30000', 10);
const HEALTH_PORT = parseInt(process.env.REASONING_PORT || '7892', 10);
const ENABLED = process.env.PURPCLAW_PROACTIVE !== '0';

if (!ENABLED) {
  console.log('[REASONING] PURPCLAW_PROACTIVE=0 — exiting (loop disabled)');
  process.exit(0);
}

let lastResult = null;
let tickCount  = 0;
let running    = false;

async function fire() {
  if (running) {
    console.log('[REASONING] previous tick still running, skipping');
    return;
  }
  running = true;
  try {
    lastResult = await tick();
    tickCount++;
    const s = lastResult.services;
    console.log(`[REASONING] tick ${tickCount} (${lastResult.tickId}): ${s.online}/${s.total} online, ${lastResult.newlyDown.length} newly-down, ${lastResult.proposals.length} proposals — ${lastResult.durationMs}ms`);
    if (lastResult.newlyDown.length) {
      console.log(`[REASONING]   newly down: ${lastResult.newlyDown.map(d => d.key).join(', ')}`);
    }
  } catch (e) {
    console.error('[REASONING] tick failed:', e.message);
  } finally {
    running = false;
  }
}

// Health endpoint so doctor/status can see the loop
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy', service: 'reasoning-loop', port: HEALTH_PORT,
      tickCount, intervalMs: TICK_MS,
      lastTickAt: lastResult ? new Date().toISOString() : null,
      lastSummary: lastResult ? lastResult.services : null,
      uptimeSec: Math.round(process.uptime()),
    }));
    return;
  }
  if (req.url === '/last') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lastResult || { not_yet: true }, null, 2));
    return;
  }
  if (req.method === 'POST' && req.url === '/tick') {
    // Manual tick trigger — used by Mochi FEED button and purpclaw tick
    if (running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'tick already running' }));
      return;
    }
    fire().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, tickCount, summary: lastResult?.services || null }));
    }).catch(e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(HEALTH_PORT, '127.0.0.1', () => {
  console.log(`[REASONING] heartbeat loop online — health on :${HEALTH_PORT}, tick every ${TICK_MS}ms`);
});

// Fire once immediately so the first health response has data
setImmediate(fire);

// Then on the configured cadence
const interval = setInterval(fire, TICK_MS);

function shutdown() {
  console.log('[REASONING] shutting down');
  clearInterval(interval);
  try { server.close(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
