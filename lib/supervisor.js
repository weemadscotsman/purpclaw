// ═══════════════════════════════════════════════════════════════════════════
// PURPCLAW SUPERVISOR — Standby Runtime Controller
// ═══════════════════════════════════════════════════════════════════════════
//
// ONE process. Starts core capabilities only.
// All other services register as standby — no RAM burned until needed.
// When a job arrives, the supervisor wakes only the required capabilities,
// keeps them warm briefly after the job, then returns them to standby.
//
// Silent boot. No cascade. Low idle footprint.
//
// ═══════════════════════════════════════════════════════════════════════════

const EventEmitter = require('events');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { CAPABILITIES, getCapability, getCoreCapabilities, getStandbyCapabilities, resolveDependencies, getCapabilitiesByDependency } = require('./capability-registry');

class PurpclawSupervisor extends EventEmitter {
  constructor() {
    super();
    this.running = new Map();     // capId → { proc, startedAt, lastUsed }
    this.pending = new Set();    // capIds currently starting
    this.heartbeats = new Map();  // capId → last health check time

    // Core supervisor state
    this.isReady = false;
    this.startTime = Date.now();
    this.jobsCompleted = 0;
    this.jobsFailed = 0;

    // Config
    this.WARM_TIMEOUT = 5 * 60 * 1000;    // 5 min before unloading warm service
    this.HEARTBEAT_INTERVAL = 30 * 1000;   // 30s health check interval
    this.STARTUP_GRACE = 5000;             // 5s grace period for startup

    this.PYTHON_BIN = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
  }

  // ─── Boot ────────────────────────────────────────────────────────────────

  async boot() {
    console.log('[SUPERVISOR] Starting PURPCLAW Standby Runtime...');
    console.log('[SUPERVISOR] Capability Registry loaded:', Object.keys(CAPABILITIES).length, 'capabilities');

    // Start only the core capabilities
    const coreCaps = getCoreCapabilities();
    console.log('[SUPERVISOR] Booting core capabilities:', coreCaps.map(c => c.id).join(', '));

    for (const cap of coreCaps) {
      if (cap.mode === 'embedded') {
        // Supervisor itself — already running
        console.log('[SUPERVISOR] ✓ Supervisor running');
      } else {
        await this.startCapability(cap.id);
      }
    }

    // Register all standby capabilities (don't start them)
    const standbyCaps = getStandbyCapabilities();
    console.log('[SUPERVISOR] Registering', standbyCaps.length, 'standby capabilities (not starting yet)');

    // Broadcast the full registry to any connected dashboards
    this.broadcast({
      type: 'registry',
      core: coreCaps.map(c => c.id),
      standby: standbyCaps.map(c => c.id),
      uptime: 0
    });

    // Start the housekeeping loop
    this.startHousekeeping();

    this.isReady = true;
    console.log('[SUPERVISOR] ✓ Standby Runtime ready. Silent boot complete.');

    this.emit('ready');
  }

  // ─── Capability Lifecycle ───────────────────────────────────────────────

  // Start a capability (core or on-demand)
  async startCapability(capId, jobContext = null) {
    const cap = getCapability(capId);
    if (!cap) {
      console.error('[SUPERVISOR] Unknown capability:', capId);
      return false;
    }

    // Already running?
    if (this.running.has(capId)) {
      this.running.get(capId).lastUsed = Date.now();
      return true;
    }

    // Already pending?
    if (this.pending.has(capId)) {
      return new Promise((resolve) => {
        this.once(`cap:${capId}:ready`, () => resolve(true));
      });
    }

    console.log('[SUPERVISOR] Starting:', capId, jobContext ? `(job: ${jobContext})` : '(core)');
    this.pending.add(capId);

    try {
      // Start dependencies first
      for (const depId of cap.dependencies) {
        await this.startCapability(depId);
      }

      // Spawn the process
      const proc = this.spawnProcess(cap);

      this.running.set(capId, {
        proc,
        startedAt: Date.now(),
        lastUsed: Date.now(),
        port: cap.port,
        mode: cap.mode
      });

      // Wait for ready signal or timeout
      await this.waitForReady(cap);

      this.pending.delete(capId);
      this.emit(`cap:${capId}:ready`);
      this.emit('cap:started', capId);

      console.log('[SUPERVISOR] ✓', capId, 'running');

      // Broadcast state change
      this.broadcast({ type: 'cap:started', cap: capId, port: cap.port });

      return true;

    } catch (err) {
      console.error('[SUPERVISOR] ✗ Failed to start', capId, ':', err.message);
      this.pending.delete(capId);
      this.running.delete(capId);
      return false;
    }
  }

  // Spawn a child process for a capability
  spawnProcess(cap) {
    const opts = {
      cwd: cap.cwd || __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...cap.env },
      windowsHide: true
    };

    const scriptPath = path.isAbsolute(cap.script)
      ? cap.script
      : path.join(__dirname, '..', cap.script);

    let child = null;
    if (cap.mode === 'python') {
      child = spawn(this.PYTHON_BIN, [scriptPath, ...(cap.args || '').split(' ').filter(Boolean)], opts);
    } else {
      child = spawn('node', [scriptPath], opts);
    }

    const capId = cap.id;

    // Log stdout/stderr quietly unless verbose
    child.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.log(`[${capId}]`, line.substring(0, 200));
    });

    child.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line && !line.includes('ExperimentalWarning')) {
        console.error(`[${capId} ERR]`, line.substring(0, 200));
      }
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error('[SUPERVISOR] ✗', capId, 'exited with code', code);
      }
      // Remove from running if it exited
      if (this.running.has(capId)) {
        this.running.delete(capId);
        this.emit(`cap:${capId}:stopped`);
        this.emit('cap:stopped', capId);
      }
    });

    child.on('error', (err) => {
      console.error('[SUPERVISOR] ✗', capId, 'error:', err.message);
    });

    return child;
  }

  probeHealth(port, healthPath) {
    return new Promise((resolve) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: healthPath, method: 'GET', timeout: 1000 },
        (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 500);
        }
      );
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
      req.end();
    });
  }

  // Wait for a service to answer its registered health endpoint.
  waitForReady(cap) {
    return new Promise((resolve, reject) => {
      const capId = cap.id;
      if (!cap.port || !cap.healthCheck) {
        setTimeout(() => resolve(true), cap.startupDelay || 250);
        return;
      }

      let poller = null;
      const timeout = setTimeout(() => {
        clearInterval(poller);
        reject(new Error(`Timeout waiting for ${capId} to start`));
      }, Math.max(10000, (cap.startupDelay || 0) + 8000));

      poller = setInterval(async () => {
        if (!this.running.has(capId)) return;
        const ok = await this.probeHealth(cap.port, cap.healthCheck);
        if (!ok) return;
        clearInterval(poller);
        clearTimeout(timeout);
        resolve(true);
      }, 250);
    });
  }

  // Stop a capability (return to standby)
  stopCapability(capId) {
    const running = this.running.get(capId);
    if (!running) return;

    console.log('[SUPERVISOR] Stopping:', capId);
    running.proc.kill('SIGTERM');
    this.running.delete(capId);
    this.emit(`cap:${capId}:stopped`);
    this.broadcast({ type: 'cap:stopped', cap: capId });
  }

  // Mark a capability as used (updates lastUsed timestamp)
  touch(capId) {
    const running = this.running.get(capId);
    if (running) {
      running.lastUsed = Date.now();
    }
  }

  // ─── Job Processing ──────────────────────────────────────────────────────

  // Submit a job — supervisor wakes only the capabilities it needs
  async submitJob(job) {
    const { capabilities: requiredCaps = [] } = job;

    if (requiredCaps.length === 0) {
      return { success: false, error: 'No capabilities required for job' };
    }

    console.log('[SUPERVISOR] Job submitted:', job.type || 'unnamed', '→ needs:', requiredCaps.join(', '));

    // Resolve all dependencies
    const toStart = new Set();
    for (const capId of requiredCaps) {
      toStart.add(capId);
      resolveDependencies(capId).forEach(d => toStart.add(d));
    }

    // Start everything needed
    const started = [];
    for (const capId of toStart) {
      const ok = await this.startCapability(capId, job.id || 'unknown');
      if (ok) started.push(capId);
    }

    this.jobsCompleted++;
    this.touchAll(started);

    this.broadcast({
      type: 'job:started',
      job: job.type || 'unknown',
      capabilities: started,
      jobsCompleted: this.jobsCompleted
    });

    return {
      success: true,
      capabilities: started,
      supervisor: {
        jobsCompleted: this.jobsCompleted,
        uptime: Date.now() - this.startTime,
        runningCapabilities: this.running.size
      }
    };
  }

  touchAll(capIds) {
    capIds.forEach(id => this.touch(id));
  }

  // ─── Housekeeping ───────────────────────────────────────────────────────

  startHousekeeping() {
    // Every 30s: check running capabilities for idle timeout
    setInterval(() => {
      this.housekeep();
    }, this.HEARTBEAT_INTERVAL);

    // Also check immediately
    this.housekeep();
  }

  housekeep() {
    const now = Date.now();
    const toStop = [];

    for (const [capId, state] of this.running) {
      const cap = getCapability(capId);
      if (!cap) continue;

      // Never unload core capabilities or fly
      if (cap.type === 'core') continue;

      // Check idle timeout
      const idleTime = now - state.lastUsed;
      if (idleTime > cap.idleTimeout && cap.idleTimeout > 0) {
        toStop.push(capId);
      }
    }

    for (const capId of toStop) {
      this.stopCapability(capId);
      console.log('[SUPERVISOR] Unloaded (idle):', capId);
    }

    // Broadcast heartbeat with current state
    this.broadcast({
      type: 'heartbeat',
      uptime: Date.now() - this.startTime,
      running: Array.from(this.running.keys()),
      jobsCompleted: this.jobsCompleted,
      memoryUsage: process.memoryUsage()
    });
  }

  // ─── Broadcast to connected clients ───────────────────────────────────

  broadcast(msg) {
    // Emit locally for any EventEmitter listeners
    this.emit('broadcast', msg);
  }

  // ─── Status ─────────────────────────────────────────────────────────────

  status() {
    return {
      isReady: this.isReady,
      uptime: Date.now() - this.startTime,
      jobsCompleted: this.jobsCompleted,
      jobsFailed: this.jobsFailed,
      running: Array.from(this.running.keys()),
      pending: Array.from(this.pending),
      capabilities: Object.keys(CAPABILITIES),
      standbyCount: getStandbyCapabilities().length,
      coreCount: getCoreCapabilities().length
    };
  }

  // Get full registry with current status
  fullStatus() {
    const status = this.status();
    const capabilityStatus = {};

    for (const [capId, cap] of Object.entries(CAPABILITIES)) {
      const running = this.running.get(capId);
      capabilityStatus[capId] = {
        type: cap.type,
        port: cap.port,
        description: cap.description,
        status: running ? 'running' : (this.pending.has(capId) ? 'starting' : 'standby'),
        lastUsed: running ? new Date(running.lastUsed).toISOString() : null,
        uptime: running ? Date.now() - running.startedAt : null
      };
    }

    return { ...status, capabilities: capabilityStatus };
  }

  // Stop everything cleanly
  async shutdown() {
    console.log('[SUPERVISOR] Shutting down...');
    for (const [capId] of this.running) {
      this.stopCapability(capId);
    }
    process.exit(0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Standalone supervisor process entry point
// ═══════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const supervisor = new PurpclawSupervisor();

  // Handle IPC from parent / orchestration
  process.on('message', async (msg) => {
    if (msg.type === 'job') {
      const result = await supervisor.submitJob(msg.job);
      process.send({ type: 'job:result', result });
    } else if (msg.type === 'status') {
      process.send({ type: 'status', data: supervisor.status() });
    } else if (msg.type === 'shutdown') {
      supervisor.shutdown();
    } else if (msg.type === 'start') {
      await supervisor.startCapability(msg.capability);
      process.send({ type: 'cap:started', cap: msg.capability });
    }
  });

  supervisor.boot().catch(console.error);
}

module.exports = { PurpclawSupervisor };
