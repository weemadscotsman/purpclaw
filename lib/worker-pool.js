'use strict';

/**
 * PURPCLAW Worker Pool
 * ════════════════════
 * Manages remote/cloud worker nodes. Used as overflow when the local
 * Agent Tower hits capacity.
 *
 * v1.1 — adds:
 *   - Job status reconciliation loop (polls remote workers every 15s)
 *   - Stale job reaper (jobs stuck "running" > JOB_TIMEOUT_MS → failed)
 *   - Worker degradation tracking (consecutive failures → degraded status)
 *   - EventBus publishing on job completion/failure
 *   - startReconciliation() / stopReconciliation() lifecycle
 *
 * Worker record shape (stored in agent_work/workers.json):
 *   { id, name, type:'http'|'ssh', url, host, port, user, keyPath,
 *     purpclawDir, tags, maxConcurrent, enabled, addedAt,
 *     _failCount?, _degraded? }
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const WORKERS_FILE  = path.join(__dirname, '..', 'agent_work', 'workers.json');
const JOBS_FILE     = path.join(__dirname, '..', 'agent_work', 'worker-jobs.json');
const EVENTBUS_PORT = 7782;
const JOB_TIMEOUT_MS      = 10 * 60 * 1000;  // 10 min — job stuck running → reap
const RECONCILE_INTERVAL  = 15 * 1000;        // poll every 15s
const DEGRADE_THRESHOLD   = 3;                // consecutive health failures → degraded
const DEGRADE_RECOVERY    = 2;                // consecutive successes → clear degraded

const workerAuth = require('./worker-auth.js');

// ── Persistence helpers ──────────────────────────────────────────────────────

function loadWorkers() {
  try {
    if (fs.existsSync(WORKERS_FILE)) return JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveWorkers(workers) {
  fs.mkdirSync(path.dirname(WORKERS_FILE), { recursive: true });
  fs.writeFileSync(WORKERS_FILE, JSON.stringify(workers, null, 2));
}

function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveJobs(jobs) {
  fs.mkdirSync(path.dirname(JOBS_FILE), { recursive: true });
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpRequest(urlStr, method = 'GET', body = null, timeoutMs = 5000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      timeout: timeoutMs,
    };
    if (body) {
      const b = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(b);
    }
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── EventBus publish ──────────────────────────────────────────────────────────

function publishToEventBus(topic, data) {
  const body = JSON.stringify({ topic, data, ts: Date.now() });
  try {
    const req = http.request({
      hostname: '127.0.0.1',
      port: EVENTBUS_PORT,
      path: '/publish',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 2000,
    });
    req.on('error', () => {}); // best-effort
    req.on('timeout', () => req.destroy());
    req.write(body);
    req.end();
  } catch {}
}

// ── Worker health check ──────────────────────────────────────────────────────

async function checkWorkerHealth(worker) {
  if (!worker.enabled) return { online: false, reason: 'disabled' };
  if (worker._degraded) return { online: false, reason: `degraded (${worker._failCount} consecutive failures)` };

  if (worker.type === 'http') {
    try {
      const res = await httpRequest(`${worker.url}/health`, 'GET', null, 3000);
      if (res.status === 200 && res.body && res.body.status) {
        // Verify health signature if this worker has a secret configured
        const workerSecret = worker.secret || process.env.WORKER_SECRET || null;
        if (workerSecret) {
          const sig = res.headers && res.headers['x-worker-sig'];
          if (!workerAuth.verifyHealth(sig, workerSecret)) {
            return { online: false, reason: 'auth-failed: health signature invalid (wrong secret or unsigned worker)' };
          }
        }
        return {
          online: true,
          active: res.body.active || 0,
          capacity: res.body.capacity || worker.maxConcurrent || 4,
          available: res.body.available || Math.max(0, (res.body.capacity || 4) - (res.body.active || 0)),
          version: res.body.version,
          auth: res.body.auth || 'none',
        };
      }
      return { online: false, reason: `HTTP ${res.status}` };
    } catch (e) {
      return { online: false, reason: e.message };
    }
  }

  if (worker.type === 'ssh') {
    const SshWorker = require('./workers/ssh-worker.js');
    return SshWorker.checkHealth(worker);
  }

  return { online: false, reason: `unknown worker type: ${worker.type}` };
}

// ── Worker Pool class ─────────────────────────────────────────────────────────

class WorkerPool {
  constructor() {
    this._activeJobs     = {};    // jobId → job (in-memory)
    this._reconcileTimer = null;
    this._started        = false;
    // Load persisted running jobs on boot — they'll be reconciled
    this._loadPersistedJobs();
  }

  _loadPersistedJobs() {
    const jobs = loadJobs();
    const now = Date.now();
    for (const [id, job] of Object.entries(jobs)) {
      if (job.status === 'running' || job.status === 'queued') {
        // Don't reload stale in-flight jobs from previous process sessions.
        // If a job was dispatched more than JOB_TIMEOUT_MS ago and we're in a
        // fresh process, it's either already done on the remote or it's dead.
        // The reconcile loop will poll the remote and settle it properly.
        const age = now - new Date(job.startedAt || job.queuedAt || 0).getTime();
        if (age > JOB_TIMEOUT_MS) {
          // Mark as failed in persisted store — don't load into active memory
          jobs[id] = { ...job, status: 'failed', error: 'Reaped on reload: exceeded timeout', completedAt: new Date().toISOString() };
          continue;
        }
        this._activeJobs[id] = job;
      }
    }
    // Save any reap decisions made above
    saveJobs(jobs);
  }

  // ── Reconciliation loop ──────────────────────────────────────────────────────

  startReconciliation() {
    if (this._started) return;
    this._started = true;
    // Run one immediate pass to sync any in-flight jobs loaded from persisted state
    setImmediate(() => this._reconcile().catch(() => {}));
    this._reconcileTimer = setInterval(() => this._reconcile(), RECONCILE_INTERVAL);
    // Unref so the timer doesn't keep the process alive if nothing else is running
    if (this._reconcileTimer.unref) this._reconcileTimer.unref();
    console.log('[WORKER-POOL] Reconciliation loop started (15s interval, immediate first pass)');
  }

  stopReconciliation() {
    if (this._reconcileTimer) clearInterval(this._reconcileTimer);
    this._started = false;
  }

  async _reconcile() {
    const now = Date.now();
    const workers = loadWorkers();
    const workerMap = Object.fromEntries(workers.map(w => [w.id, w]));
    const jobs = loadJobs();
    let dirty = false;

    // ── 1. Reconcile in-flight HTTP jobs ─────────────────────────────────────
    const running = Object.entries(this._activeJobs)
      .filter(([, j]) => j.status === 'running' || j.status === 'queued');

    for (const [jobId, job] of running) {
      const worker = workerMap[job.workerId];

      // ── Stale job reaper: running too long → mark failed ─────────────────
      const age = now - new Date(job.startedAt || job.queuedAt || 0).getTime();
      if (age > JOB_TIMEOUT_MS) {
        console.warn(`[WORKER-POOL] Reaping stale job ${jobId} (${Math.round(age/60000)}m old, worker: ${job.workerName})`);
        this._activeJobs[jobId].status = 'failed';
        this._activeJobs[jobId].error  = `Reaped: exceeded ${JOB_TIMEOUT_MS/60000}m timeout`;
        this._activeJobs[jobId].completedAt = new Date().toISOString();
        if (jobs[jobId]) { jobs[jobId] = { ...jobs[jobId], ...this._activeJobs[jobId] }; dirty = true; }
        publishToEventBus('worker.job.failed', { jobId, agentName: job.agentName, reason: 'timeout', workerId: job.workerId });
        continue;
      }

      // ── Poll remote HTTP worker for real status ───────────────────────────
      if (!worker || job.workerType !== 'http') continue;
      try {
        const secret = worker.secret || process.env.WORKER_SECRET || null;
        const authHeaders = workerAuth.signRequest('GET', `/task/${jobId}`, secret);
        const res = await httpRequest(`${worker.url}/task/${jobId}`, 'GET', null, 4000, authHeaders);
        if (res.status === 200 && res.body) {
          const remoteStatus = res.body.status;
          if (remoteStatus === 'completed' || remoteStatus === 'failed' || remoteStatus === 'cancelled') {
            this._activeJobs[jobId].status      = remoteStatus;
            this._activeJobs[jobId].completedAt = res.body.completedAt || new Date().toISOString();
            this._activeJobs[jobId].result      = res.body.result || null;
            this._activeJobs[jobId].error       = res.body.error  || null;
            if (jobs[jobId]) { jobs[jobId] = { ...jobs[jobId], ...this._activeJobs[jobId] }; dirty = true; }

            const eventTopic = remoteStatus === 'completed' ? 'worker.job.completed' : 'worker.job.failed';
            publishToEventBus(eventTopic, {
              jobId,
              agentName: job.agentName,
              workflowId: job.workflowId,
              workerId: job.workerId,
              workerName: job.workerName,
              result: res.body.result,
              error: res.body.error,
            });
            console.log(`[WORKER-POOL] Job ${jobId} → ${remoteStatus} (worker: ${job.workerName})`);

            // Clear from active after a bit to avoid memory growth
            setTimeout(() => delete this._activeJobs[jobId], 120000);
          }
        } else if (res.status === 404) {
          // Worker has no record of this job (crashed + restarted?) — mark failed
          this._activeJobs[jobId].status = 'failed';
          this._activeJobs[jobId].error  = 'Worker has no record of job (may have restarted)';
          this._activeJobs[jobId].completedAt = new Date().toISOString();
          if (jobs[jobId]) { jobs[jobId] = { ...jobs[jobId], ...this._activeJobs[jobId] }; dirty = true; }
          publishToEventBus('worker.job.failed', { jobId, agentName: job.agentName, reason: '404-on-worker', workerId: job.workerId });
        }
      } catch {
        // Worker unreachable during reconcile — don't fail job yet, let timeout handle it
      }
    }

    // ── 2. Worker health degradation tracking ─────────────────────────────────
    const workersDirty = [];
    for (const worker of workers) {
      if (!worker.enabled) continue;
      const health = await checkWorkerHealth(worker).catch(() => ({ online: false, reason: 'check error' }));
      const wasOnline = !worker._degraded;

      if (!health.online) {
        const newCount = (worker._failCount || 0) + 1;
        worker._failCount = newCount;
        if (!worker._degraded && newCount >= DEGRADE_THRESHOLD) {
          worker._degraded = true;
          console.warn(`[WORKER-POOL] Worker ${worker.name} degraded after ${newCount} consecutive failures`);
          publishToEventBus('worker.degraded', { workerId: worker.id, workerName: worker.name, failCount: newCount });
          workersDirty.push(worker);
        } else if (!worker._degraded) {
          workersDirty.push(worker);
        }
      } else {
        if (worker._failCount && worker._failCount > 0) {
          worker._failCount = Math.max(0, (worker._failCount || 0) - 1);
          if (worker._degraded && worker._failCount <= DEGRADE_THRESHOLD - DEGRADE_RECOVERY) {
            worker._degraded = false;
            console.log(`[WORKER-POOL] Worker ${worker.name} recovered`);
            publishToEventBus('worker.recovered', { workerId: worker.id, workerName: worker.name });
          }
          workersDirty.push(worker);
        }
      }
    }
    if (workersDirty.length > 0) saveWorkers(workers);

    if (dirty) saveJobs(jobs);
  }

  // ── Registry ────────────────────────────────────────────────────────────────

  addWorker(config) {
    const workers = loadWorkers();
    const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const worker = {
      id,
      name: config.name || `worker-${workers.length + 1}`,
      type: config.type || 'http',
      url: config.url || null,
      host: config.host || null,
      port: config.port || 22,
      user: config.user || 'ubuntu',
      keyPath: config.keyPath || null,
      purpclawDir: config.purpclawDir || '/home/ubuntu/purpclaw',
      tags: config.tags || [],
      maxConcurrent: config.maxConcurrent || 4,
      secret: config.secret || null,   // per-worker secret (overrides WORKER_SECRET env)
      enabled: true,
      addedAt: new Date().toISOString(),
      _failCount: 0,
      _degraded: false,
    };
    workers.push(worker);
    saveWorkers(workers);
    return worker;
  }

  removeWorker(id) {
    const workers = loadWorkers().filter(w => w.id !== id && w.name !== id);
    saveWorkers(workers);
    return { removed: true };
  }

  updateWorker(id, patch) {
    const workers = loadWorkers();
    const idx = workers.findIndex(w => w.id === id || w.name === id);
    if (idx === -1) return { found: false };
    workers[idx] = { ...workers[idx], ...patch };
    saveWorkers(workers);
    return workers[idx];
  }

  listWorkers() {
    return loadWorkers();
  }

  // ── Health status ────────────────────────────────────────────────────────────

  async getStatus() {
    const workers = loadWorkers();
    const results = await Promise.all(workers.map(async (w) => {
      const health = await checkWorkerHealth(w);
      const activeCount = Object.values(this._activeJobs)
        .filter(j => j.workerId === w.id && (j.status === 'running' || j.status === 'queued')).length;
      return { ...w, health, activeJobs: activeCount };
    }));
    return results;
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────────

  async dispatch(agentName, task, options = {}) {
    const workers = loadWorkers().filter(w => w.enabled && !w._degraded);
    if (workers.length === 0) {
      const allWorkers = loadWorkers();
      if (allWorkers.length === 0) {
        return { success: false, error: 'No workers registered. Add a worker with: purpclaw workers add' };
      }
      return { success: false, error: `All workers degraded or disabled (${allWorkers.length} total)` };
    }

    // Health-check all workers concurrently
    const healthResults = await Promise.all(workers.map(async (w) => {
      const h = await checkWorkerHealth(w);
      const activeCount = Object.values(this._activeJobs)
        .filter(j => j.workerId === w.id && (j.status === 'running' || j.status === 'queued')).length;
      return { worker: w, health: h, activeJobs: activeCount };
    }));

    // Filter to online workers with capacity
    const available = healthResults
      .filter(r => r.health.online && r.activeJobs < (r.worker.maxConcurrent || 4))
      .sort((a, b) => a.activeJobs - b.activeJobs);

    if (available.length === 0) {
      const offline = healthResults.filter(r => !r.health.online).length;
      const full    = healthResults.filter(r => r.health.online && r.activeJobs >= (r.worker.maxConcurrent || 4)).length;
      return {
        success: false,
        error: `No worker capacity available (${offline} offline, ${full} full, ${workers.length} total)`
      };
    }

    const { worker } = available[0];

    let dispatchResult;
    if (worker.type === 'http') {
      dispatchResult = await this._dispatchHttp(worker, agentName, task, options);
    } else if (worker.type === 'ssh') {
      const SshWorker = require('./workers/ssh-worker.js');
      dispatchResult = await SshWorker.dispatch(worker, agentName, task, options);
    } else {
      dispatchResult = { success: false, error: `Unknown worker type: ${worker.type}` };
    }

    if (dispatchResult.success) {
      const jobId = dispatchResult.jobId;
      const job = {
        workerId: worker.id,
        workerName: worker.name,
        workerType: worker.type,
        agentName,
        task: task.slice(0, 200),
        startedAt: new Date().toISOString(),
        status: 'running',
        workflowId: options.workflowId || null,
        result: null,
        error: null,
        completedAt: null,
      };
      this._activeJobs[jobId] = job;
      const jobs = loadJobs();
      jobs[jobId] = job;
      saveJobs(jobs);

      publishToEventBus('worker.job.dispatched', {
        jobId,
        agentName,
        workerId: worker.id,
        workerName: worker.name,
        workflowId: options.workflowId || null,
      });

      // Record worker success (clear degradation counter)
      this._recordWorkerSuccess(worker.id);
    } else {
      this._recordWorkerFailure(worker.id);
    }

    return dispatchResult;
  }

  async _dispatchHttp(worker, agentName, task, options) {
    try {
      const secret = worker.secret || process.env.WORKER_SECRET || null;
      const authHeaders = workerAuth.signRequest('POST', '/task', secret);
      const res = await httpRequest(`${worker.url}/task`, 'POST', {
        agentName,
        task,
        options: {
          source: 'purpclaw-worker-pool',
          workflowId: options.workflowId || null,
          intent: options.intent || 'run',
        }
      }, 10000, authHeaders);

      if (res.status === 200 || res.status === 201) {
        const body = res.body;
        return {
          success: true,
          jobId: body.jobId || body.id || `job-${Date.now()}`,
          workerId: worker.id,
          workerName: worker.name,
          workerType: 'http',
          response: `🌐 ${worker.name}: dispatched ${agentName} → job ${body.jobId || body.id}`
        };
      }
      return { success: false, error: `Worker returned HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}` };
    } catch (e) {
      return { success: false, error: `HTTP dispatch failed: ${e.message}` };
    }
  }

  // ── Degradation helpers ───────────────────────────────────────────────────────

  _recordWorkerFailure(workerId) {
    const workers = loadWorkers();
    const w = workers.find(x => x.id === workerId);
    if (!w) return;
    w._failCount = (w._failCount || 0) + 1;
    if (!w._degraded && w._failCount >= DEGRADE_THRESHOLD) {
      w._degraded = true;
      publishToEventBus('worker.degraded', { workerId, workerName: w.name, failCount: w._failCount });
      console.warn(`[WORKER-POOL] Worker ${w.name} degraded after dispatch failure #${w._failCount}`);
    }
    saveWorkers(workers);
  }

  _recordWorkerSuccess(workerId) {
    const workers = loadWorkers();
    const w = workers.find(x => x.id === workerId);
    if (!w || (!w._failCount && !w._degraded)) return;
    w._failCount = 0;
    if (w._degraded) {
      w._degraded = false;
      publishToEventBus('worker.recovered', { workerId, workerName: w.name });
      console.log(`[WORKER-POOL] Worker ${w.name} recovered`);
    }
    saveWorkers(workers);
  }

  // ── Job tracking ─────────────────────────────────────────────────────────────

  async getJobStatus(jobId) {
    const job = this._activeJobs[jobId] || loadJobs()[jobId];
    if (!job) return { found: false };

    // For completed/failed/cancelled, return as-is (already reconciled)
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }

    // For running jobs, poll the remote worker on-demand
    if (job.workerType === 'http') {
      const worker = loadWorkers().find(w => w.id === job.workerId);
      if (!worker) return { ...job, workerStatus: 'worker-not-found' };
      try {
        const secret = worker.secret || process.env.WORKER_SECRET || null;
        const authHeaders = workerAuth.signRequest('GET', `/task/${jobId}`, secret);
        const res = await httpRequest(`${worker.url}/task/${jobId}`, 'GET', null, 5000, authHeaders);
        if (res.status === 200 && res.body) {
          // Sync status immediately on on-demand query
          const updated = { ...job, remote: res.body, status: res.body.status || job.status };
          if (res.body.status === 'completed' || res.body.status === 'failed') {
            updated.completedAt = res.body.completedAt || new Date().toISOString();
            updated.result = res.body.result || null;
            updated.error  = res.body.error  || null;
            if (this._activeJobs[jobId]) Object.assign(this._activeJobs[jobId], updated);
          }
          return updated;
        }
      } catch (e) {
        return { ...job, workerError: e.message };
      }
    }

    return job;
  }

  listJobs(limit = 50) {
    const persisted = loadJobs();
    const merged = { ...persisted, ...this._activeJobs };
    return Object.entries(merged)
      .map(([id, job]) => ({ id, ...job }))
      .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0))
      .slice(0, limit);
  }

  markJobDone(jobId, status = 'completed') {
    if (this._activeJobs[jobId]) this._activeJobs[jobId].status = status;
    const jobs = loadJobs();
    if (jobs[jobId]) { jobs[jobId].status = status; saveJobs(jobs); }
  }

  getStats() {
    const all = Object.values(this._activeJobs);
    return {
      running:   all.filter(j => j.status === 'running').length,
      queued:    all.filter(j => j.status === 'queued').length,
      completed: all.filter(j => j.status === 'completed').length,
      failed:    all.filter(j => j.status === 'failed').length,
      total:     all.length,
      workers:   loadWorkers().length,
      degraded:  loadWorkers().filter(w => w._degraded).length,
    };
  }
}

// ── Singleton (starts reconciliation when loaded in a long-running process) ──

const pool = new WorkerPool();

// Auto-start reconciliation if we're in a long-running process (not just a CLI require)
// CLI commands will get the pool without the interval; the orchestrator + worker service
// both run long enough that the 15s reconcile loop is free of cost.
if (require.main !== module) {
  // Defer start slightly so the requiring module can finish its own init
  setImmediate(() => pool.startReconciliation());
}

module.exports = pool;
module.exports.WorkerPool = WorkerPool;
module.exports.checkWorkerHealth = checkWorkerHealth;
module.exports.loadWorkers = loadWorkers;
