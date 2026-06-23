#!/usr/bin/env node
'use strict';

/**
 * PURPCLAW Thringlet Bridge — PM2 service on :7799
 * ═══════════════════════════════════════════════════
 * Hosts the LOCAL Thringlet colony (no external pvx dependency).
 *
 *   GET  /health                            service health + observer snapshot
 *   GET  /thringlets                        all bonded thringlets (colony)
 *   GET  /thringlets/colony-mood            aggregate mood
 *   GET  /thringlets/:id                    single thringlet JSON
 *   POST /thringlets/:id/interact           { kind, reason?, weight? }
 *   POST /thringlets/bond                   { archetypeId, name?, bondedTo? }
 *   DELETE /thringlets/:id                  release a thringlet
 *   GET  /thringlets/archetypes             list available archetypes
 *   GET  /thringlets/last-events            recent observer dispatches
 *   POST /thringlets/decay-now              force decay sweep
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

// .env loader (same as harness_service.js)
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.substring(0, eq).trim();
      let v = line.substring(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
})();

const { getColony, listArchetypes, VALID_INTERACTIONS } = require('./lib/thringlets/engine');
const { createObserver } = require('./lib/thringlets/runtime-observer');

const PORT = parseInt(process.env.THRINGLET_BRIDGE_PORT || '7799', 10);

const colony = getColony();
const observer = createObserver({ colony });

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function send(res, status, body) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, '');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // ── Health ────────────────────────────────────────────────────────────────
  if (pathname === '/health') {
    const snap = await observer.snapshot();
    return send(res, 200, {
      ok: true,
      service: 'purpclaw-thringlet-bridge',
      port: PORT,
      uptimeSec: Math.round(process.uptime()),
      colonySize: snap.colonySize,
      lastPoll: snap.lastPoll,
      services: snap.services,
      historyCount: snap.historyRecent.length,
    });
  }

  // ── Colony list ───────────────────────────────────────────────────────────
  if (pathname === '/thringlets' && req.method === 'GET') {
    const list = await colony.all();
    return send(res, 200, {
      count: list.length,
      thringlets: list.map(t => t.toJSON()),
    });
  }

  if (pathname === '/thringlets/colony-mood') {
    const mood = await colony.colonyMood();
    return send(res, 200, { ...mood, capturedAt: Date.now() });
  }

  if (pathname === '/thringlets/archetypes') {
    return send(res, 200, { archetypes: listArchetypes() });
  }

  if (pathname === '/thringlets/last-events') {
    const limit = parseInt(url.searchParams.get('limit') || '30', 10);
    return send(res, 200, { events: observer.history.slice(-limit) });
  }

  if (pathname === '/thringlets/decay-now' && req.method === 'POST') {
    await colony.runDecaySweep();
    return send(res, 200, { ok: true });
  }

  // ── Bond a new Thringlet ──────────────────────────────────────────────────
  if (pathname === '/thringlets/bond' && req.method === 'POST') {
    let body = null;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'invalid_json' }); }
    const archetypeId = String(body?.archetypeId || '').trim();
    if (!archetypeId) return send(res, 400, { error: 'archetypeId required' });
    try {
      const t = await colony.bondFromArchetype(archetypeId, {
        name: body?.name,
        bondedTo: body?.bondedTo || 'operator',
      });
      return send(res, 201, { ok: true, thringlet: t.toJSON() });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  // ── Per-Thringlet routes ──────────────────────────────────────────────────
  const idMatch = pathname.match(/^\/thringlets\/([^/]+)(?:\/(interact))?$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    const sub = idMatch[2];

    if (sub === 'interact' && req.method === 'POST') {
      let body = null;
      try { body = await readBody(req); } catch { return send(res, 400, { error: 'invalid_json' }); }
      const kind = String(body?.kind || '').toLowerCase();
      if (!VALID_INTERACTIONS.has(kind)) {
        return send(res, 400, { error: 'invalid kind', allowed: Array.from(VALID_INTERACTIONS) });
      }
      const result = await colony.interact(id, kind, {
        reason: body?.reason || 'manual interaction',
        weight: Number(body?.weight) || 1,
        source: body?.source || 'http',
      });
      if (!result.ok) return send(res, 404, { error: result.error || 'not_found', id });
      return send(res, 200, result);
    }

    if (!sub && req.method === 'GET') {
      const t = await colony.get(id);
      if (!t) return send(res, 404, { error: 'not_found', id });
      return send(res, 200, t.toJSON());
    }

    if (!sub && req.method === 'DELETE') {
      const removed = await colony.release(id);
      return send(res, removed ? 200 : 404, { ok: removed, id });
    }
  }

  send(res, 404, { error: 'not_found', path: pathname });
});

// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await colony.ensureDefaultColony('operator');
    await observer.start();
    const initialSize = await colony.size();
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[thringlet-bridge] online on :${PORT}  colony=${initialSize}`);
    });
  } catch (e) {
    console.error('[thringlet-bridge] start failed:', e.message);
    process.exit(1);
  }
})();

server.on('error', err => {
  console.error('[thringlet-bridge] server error:', err.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`[thringlet-bridge] received ${signal}, stopping...`);
  try { observer.stop(); } catch {}
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
