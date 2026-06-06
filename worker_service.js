'use strict';

/**
 * PURPCLAW Worker Service  v1.1
 * ══════════════════════════════
 * Lightweight HTTP runner that accepts agent tasks from the worker pool
 * and dispatches them to the local Agent Tower. Runs on port 7897.
 *
 * v1.1 — adds persistent task store (worker-tasks.json).
 * Jobs survive worker restarts: the pool can poll /task/:id after a restart
 * and get the real completed/failed status rather than a 404.
 *
 * Deploy on any remote machine with PURPCLAW + tower, then:
 *   purpclaw workers add --type http --url http://<host>:7897
 *
 * API:
 *   GET  /health           → { status, active, capacity, version }
 *   POST /task             → { jobId, queued }
 *   GET  /task/:id         → { jobId, status, result, ... }
 *   GET  /tasks            → [ ...recent jobs ]
 *   DELETE /task/:id       → { cancelled }
 *   GET  /metrics          → { uptime, completed, failed, active }
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT           = parseInt(process.env.WORKER_PORT        || '7897', 10);
const TOWER_PORT     = parseInt(process.env.TOWER_PORT         || '7790', 10);
const MAX_CONCURRENT = parseInt(process.env.WORKER_MAX_CONCURRENT || '4', 10);
const VERSION        = '1.2.0';

// ── Auth ─────────────────────────────────────────────────────────────────────
const workerAuth = require('./lib/worker-auth.js');
const WORKER_SECRET = process.env.WORKER_SECRET || null;

if (WORKER_SECRET) {
  console.log('[WORKER] Auth enabled — HMAC-SHA256 request verification active');
} else {
  console.warn('[WORKER] WARNING: WORKER_SECRET not set — running unauthenticated (set in .env to enable)');
}

// ── Persistent task store ────────────────────────────────────────────────────

const TASKS_FILE = path.join(__dirname, 'agent_work', 'worker-tasks.json');
const TASK_TTL_MS = 24 * 60 * 60 * 1000; // keep tasks 24h
const MAX_PERSISTED = 500;

function loadPersistedTasks() {
  try {
    if (fs.existsSync(TASKS_FILE)) return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch {}
  return {};
}

function savePersistedTasks(taskMap) {
  try {
    fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
    // Prune old completed tasks before saving
    const now = Date.now();
    const entries = Object.entries(taskMap)
      .filter(([, t]) => {
        // Keep: still running/queued (regardless of age)
        if (t.status === 'running' || t.status === 'queued') return true;
        // Keep: completed/failed within TTL
        const completedAt = new Date(t.completedAt || 0).getTime();
        return now - completedAt < TASK_TTL_MS;
      })
      .sort(([, a], [, b]) => new Date(b.queuedAt||0) - new Date(a.queuedAt||0))
      .slice(0, MAX_PERSISTED);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(Object.fromEntries(entries), null, 2));
  } catch (e) {
    console.error('[WORKER] Failed to persist tasks:', e.message);
  }
}

// ── In-memory + persisted job store ─────────────────────────────────────────

// jobs = union of in-memory (fast) + persisted (restart-safe)
// In-memory is authoritative for active jobs; persisted for completed ones.
const jobs = new Map();

// Restore persisted tasks on boot so old completed/failed jobs are still queryable
const persisted = loadPersistedTasks();
for (const [id, task] of Object.entries(persisted)) {
  jobs.set(id, task);
}
console.log(`[WORKER] Restored ${Object.keys(persisted).length} tasks from disk`);

let counters = {
  completed: Object.values(persisted).filter(t => t.status === 'completed').length,
  failed:    Object.values(persisted).filter(t => t.status === 'failed').length,
  dispatched: Object.keys(persisted).length,
};
const startTime = Date.now();

function activeCount() {
  return [...jobs.values()].filter(j => j.status === 'running' || j.status === 'queued').length;
}

function persistJob(job) {
  const snapshot = {};
  for (const [id, t] of jobs) snapshot[id] = t;
  savePersistedTasks(snapshot);
}

// ── Tower request ────────────────────────────────────────────────────────────

function towerRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: TOWER_PORT,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    };
    if (body) {
      const b = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(b);
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('tower timeout')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Task dispatch ────────────────────────────────────────────────────────────

async function dispatchTask(jobId, agentName, task, options) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status    = 'running';
  job.startedAt = new Date().toISOString();
  persistJob(job);

  try {
    const res = await towerRequest('POST', '/api/spawn', {
      agentName,
      task,
      options: { ...options, source: 'worker-service', workerJobId: jobId }
    });

    if (res.status === 200 && res.body && res.body.success) {
      job.status      = 'completed';
      job.completedAt = new Date().toISOString();
      job.result      = res.body;
      job.agentId     = res.body.agentId;
      counters.completed++;
    } else {
      job.status      = 'failed';
      job.completedAt = new Date().toISOString();
      job.error       = (res.body && res.body.error) || `Tower returned HTTP ${res.status}`;
      counters.failed++;
    }
  } catch (e) {
    job.status      = 'failed';
    job.completedAt = new Date().toISOString();
    job.error       = e.message;
    counters.failed++;
  }

  // Always persist after settling
  persistJob(job);
}

// ── Periodic flush: write tasks to disk every 30s ────────────────────────────
// Catches any in-flight tasks that didn't get flushed immediately (e.g. crash mid-run)

setInterval(() => {
  const snapshot = {};
  for (const [id, t] of jobs) snapshot[id] = t;
  savePersistedTasks(snapshot);
}, 30000).unref();

// ── HTTP Server ──────────────────────────────────────────────────────────────

function respond(res, statusCode, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.writeHead(statusCode);
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer((req, res) => {
  const urlParts = req.url.split('?');
  const urlPath  = urlParts[0];

  // ── GET /health ────────────────────────────────────────────────────────────
  if (req.method === 'GET' && urlPath === '/health') {
    // Health is readable without auth (pool needs it to discover workers)
    // but includes a signature the pool can verify to prove the worker knows the secret
    const sigHeaders = workerAuth.signHealth(WORKER_SECRET);
    Object.entries(sigHeaders).forEach(([k, v]) => res.setHeader(k, v));
    respond(res, 200, {
      status: 'healthy',
      service: 'purpclaw-worker-service',
      version: VERSION,
      active: activeCount(),
      capacity: MAX_CONCURRENT,
      available: Math.max(0, MAX_CONCURRENT - activeCount()),
      towerPort: TOWER_PORT,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      totalTasks: jobs.size,
      auth: WORKER_SECRET ? 'hmac-sha256' : 'none',
    });
    return;
  }

  // ── GET /metrics ───────────────────────────────────────────────────────────
  if (req.method === 'GET' && urlPath === '/metrics') {
    respond(res, 200, {
      uptime: Math.floor((Date.now() - startTime) / 1000),
      active: activeCount(),
      capacity: MAX_CONCURRENT,
      total: jobs.size,
      ...counters,
    });
    return;
  }

  // ── GET /tasks ─────────────────────────────────────────────────────────────
  if (req.method === 'GET' && urlPath === '/tasks') {
    const list = [...jobs.values()]
      .sort((a, b) => new Date(b.queuedAt || 0) - new Date(a.queuedAt || 0))
      .slice(0, 100);
    respond(res, 200, list);
    return;
  }

  // ── POST /task ─────────────────────────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/task') {
    // Reject unauthenticated dispatch if secret is configured
    const authCheck = workerAuth.verifyRequest(req, WORKER_SECRET);
    if (!authCheck.ok) {
      respond(res, 401, { error: 'Unauthorized', reason: authCheck.reason, hint: 'Set WORKER_SECRET on both pool and worker' });
      console.warn(`[WORKER] Rejected POST /task: ${authCheck.reason} from ${req.socket.remoteAddress}`);
      return;
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { agentName, task, options = {} } = JSON.parse(body);
        if (!agentName || !task) {
          respond(res, 400, { error: 'agentName and task are required' });
          return;
        }
        if (activeCount() >= MAX_CONCURRENT) {
          respond(res, 503, { error: `Worker at capacity (${MAX_CONCURRENT} active)`, active: activeCount() });
          return;
        }

        const jobId = `wjob-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const job = {
          jobId,
          agentName,
          task: task.slice(0, 500),
          options,
          status: 'queued',
          queuedAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
          result: null,
          error: null,
        };
        jobs.set(jobId, job);
        counters.dispatched++;
        // Persist immediately so a crash between dispatch and completion is recoverable
        persistJob(job);

        respond(res, 201, { jobId, queued: true });

        dispatchTask(jobId, agentName, task, options).catch(e => {
          const j = jobs.get(jobId);
          if (j) {
            j.status      = 'failed';
            j.error       = e.message;
            j.completedAt = new Date().toISOString();
            persistJob(j);
          }
          counters.failed++;
        });
      } catch (e) {
        respond(res, 400, { error: `Bad request: ${e.message}` });
      }
    });
    return;
  }

  // ── GET /task/:id ──────────────────────────────────────────────────────────
  const taskMatch = urlPath.match(/^\/task\/([^/]+)$/);
  if (req.method === 'GET' && taskMatch) {
    const job = jobs.get(taskMatch[1]);
    if (!job) { respond(res, 404, { error: 'job not found', jobId: taskMatch[1] }); return; }
    respond(res, 200, job);
    return;
  }

  // ── DELETE /task/:id ───────────────────────────────────────────────────────
  if (req.method === 'DELETE' && taskMatch) {
    const authCheck = workerAuth.verifyRequest(req, WORKER_SECRET);
    if (!authCheck.ok) {
      respond(res, 401, { error: 'Unauthorized', reason: authCheck.reason });
      return;
    }
    const job = jobs.get(taskMatch[1]);
    if (!job) { respond(res, 404, { error: 'job not found' }); return; }
    if (job.status === 'running' || job.status === 'queued') {
      job.status      = 'cancelled';
      job.completedAt = new Date().toISOString();
      persistJob(job);
    }
    respond(res, 200, { cancelled: true, jobId: taskMatch[1] });
    return;
  }

  respond(res, 404, { error: 'not found', path: urlPath });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[WORKER] Port ${PORT} in use — retrying in 5s...`);
    setTimeout(() => {
      try { server.close(); } catch {}
      server.listen(PORT, '127.0.0.1');
    }, 5000);
  } else {
    console.error(`[WORKER] Fatal: ${err.message}`);
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[WORKER] purpclaw-worker-service v${VERSION} on :${PORT} (tower→:${TOWER_PORT}, cap=${MAX_CONCURRENT})`);
});
