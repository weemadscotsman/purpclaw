#!/usr/bin/env node
'use strict';

/**
 * PURPCLAW Harness Service
 * ════════════════════════
 * HTTP service that runs the autonomous productivity harness as a long-lived
 * PM2 process.  Hosts the engine in-process, persists jobs through the engine's
 * built-in State-Store / file-archive fallback, and exposes:
 *
 *   GET  /health                         service health probe
 *   GET  /harness/stats                  service-level stats
 *   GET  /harness/jobs                   list recent jobs
 *   GET  /harness/jobs/:id               get one job
 *   GET  /harness/jobs/:id/stream        SSE event stream
 *   POST /harness/run                    { goal, options? } → { jobId }
 *   POST /harness/jobs/:id/stop          interrupt a running job
 *
 * Port: HARNESS_PORT env var, defaults to 7798 (next free in the PURPCLAW cluster).
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

// Bootstrap .env so the engine's llm-provider has its keys
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
  } catch { /* best-effort */ }
})();

const { createHarness } = require('./lib/harness/engine');

const PORT = parseInt(process.env.HARNESS_PORT || '7798', 10);
const MAX_RECENT = parseInt(process.env.HARNESS_MAX_RECENT || '40', 10);

// ── In-memory state ───────────────────────────────────────────────────────────

const active = new Map();        // jobId → { engine, buffer: [], subscribers: Set<res> }
const recent = new Map();        // jobId → final HarnessJob snapshot

function pushRecent(job) {
  recent.set(job.id, job);
  if (recent.size > MAX_RECENT) {
    const oldest = Array.from(recent.keys())[0];
    recent.delete(oldest);
  }
}

function broadcast(jobId, event) {
  const entry = active.get(jobId);
  if (!entry) return;
  entry.buffer.push(event);
  if (entry.buffer.length > 800) entry.buffer.shift();
  for (const res of entry.subscribers) {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
  }
}

function attachEngine(engine, jobId) {
  engine.on('trace', entry => broadcast(jobId, { type: 'trace', entry }));
  engine.on('log',   entry => broadcast(jobId, { type: 'log', entry }));
  engine.on('subtask', subtask => broadcast(jobId, { type: 'subtask', subtask }));
  engine.on('state', job => broadcast(jobId, { type: 'state', state: job.state, plan: job.plan.map(s => ({ id: s.id, index: s.index, state: s.state, verdict: s.verdict })) }));
  engine.on('done', job => {
    broadcast(jobId, { type: 'done', job });
    pushRecent(job);
    // Drain subscribers and clean up
    const entry = active.get(jobId);
    if (entry) {
      for (const res of entry.subscribers) {
        try { res.end(); } catch {}
      }
      active.delete(jobId);
    }
  });
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleRun(req, res) {
  let body = null;
  try { body = await readBody(req); }
  catch { return send(res, 400, { error: 'invalid_json' }); }

  const goal = String(body?.goal || '').trim();
  if (!goal) return send(res, 400, { error: 'goal_required' });

  const opts = {
    maxIterations: body?.options?.maxIter ?? 30,
    maxRetriesPerSubtask: body?.options?.retries ?? 2,
    rootDir: __dirname,
  };

  const engine = createHarness(opts);
  const startPromise = engine.run(goal);

  // engine.run sets job after start sync; wait one tick to grab id
  await new Promise(r => setImmediate(r));
  const job = engine.job;
  if (!job?.id) return send(res, 500, { error: 'engine_did_not_initialize' });

  active.set(job.id, { engine, buffer: [], subscribers: new Set(), startedAt: Date.now() });
  attachEngine(engine, job.id);
  startPromise.catch(err => console.error(`[harness] job ${job.id} failed:`, err));

  send(res, 200, { jobId: job.id, state: job.state, goal: job.goal });
}

function handleStream(req, res, jobId) {
  const entry = active.get(jobId);
  if (!entry) {
    // Maybe already finished — flush recent snapshot
    const final = recent.get(jobId);
    if (final) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`data: ${JSON.stringify({ type: 'done', job: final })}\n\n`);
      return res.end();
    }
    return send(res, 404, { error: 'job_not_found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Replay buffered events
  for (const ev of entry.buffer) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }

  entry.subscribers.add(res);
  req.on('close', () => entry.subscribers.delete(res));
}

function handleGetJob(jobId) {
  const live = active.get(jobId);
  if (live?.engine?.job) return live.engine.job;
  return recent.get(jobId) || null;
}

function handleStop(req, res, jobId) {
  const entry = active.get(jobId);
  if (!entry) return send(res, 404, { error: 'job_not_active' });
  entry.engine.stop();
  send(res, 200, { ok: true, jobId, state: entry.engine.job?.state });
}

function listJobs() {
  const live = [];
  for (const [, entry] of active) {
    if (entry.engine.job) live.push({ ...entry.engine.job, active: true });
  }
  const archived = Array.from(recent.values()).map(j => ({ ...j, active: false }));
  // Most-recent first
  return [...live, ...archived].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, '');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // health
  if (pathname === '/health') {
    return send(res, 200, {
      ok: true,
      service: 'purpclaw-harness',
      port: PORT,
      active: active.size,
      archived: recent.size,
      uptimeSec: Math.round(process.uptime()),
    });
  }

  if (pathname === '/harness/stats') {
    return send(res, 200, {
      active: active.size,
      archived: recent.size,
      port: PORT,
      uptimeSec: Math.round(process.uptime()),
    });
  }

  if (pathname === '/harness/run' && req.method === 'POST') {
    return handleRun(req, res);
  }

  if (pathname === '/harness/jobs' && req.method === 'GET') {
    return send(res, 200, { jobs: listJobs() });
  }

  const jobMatch = pathname.match(/^\/harness\/jobs\/([^/]+)(\/stream|\/stop)?$/);
  if (jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const sub = jobMatch[2];

    if (sub === '/stream' && req.method === 'GET') return handleStream(req, res, jobId);
    if (sub === '/stop' && req.method === 'POST') return handleStop(req, res, jobId);

    if (!sub && req.method === 'GET') {
      const job = handleGetJob(jobId);
      if (!job) return send(res, 404, { error: 'job_not_found' });
      return send(res, 200, job);
    }
  }

  send(res, 404, { error: 'not_found', path: pathname });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[harness] PURPCLAW harness service listening on :${PORT}`);
});

server.on('error', err => {
  console.error('[harness] server error:', err.message);
  process.exit(1);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[harness] received ${signal}, stopping active jobs...`);
  for (const [, entry] of active) {
    try { entry.engine.stop(); } catch {}
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
