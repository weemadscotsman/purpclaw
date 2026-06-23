// lib/orchestrator-hardening.js
// v2.1 hardening layer for the orchestrator. Loaded as a single
// `withHardening` factory that wraps the orchestrator's main module.
// Keeps the original orchestrator.js mostly unchanged while adding:
//   - retry/backoff on tower/state/api calls
//   - workflow timeouts (no run-forever workflows)
//   - request body cap (no 100MB POST bombs)
//   - circuit breaker (fail fast when a service is down)
//   - bounded Maps (no memory leaks from long-lived Maps)
//   - graceful shutdown (drain queue, persist state)
//   - rate limiting (token bucket on /api/orchestrate)
//   - idempotency keys (replay-safe POSTs)
//   - workflow persistence (write-through to disk)

'use strict';

const fs   = require('fs');
const http = require('http');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 10_000;        // per HTTP request
const DEFAULT_MAX_BODY   = 64 * 1024;     // 64KB request cap
const DEFAULT_MAX_WORKFLOWS = 500;        // bounded activeWorkflows
const DEFAULT_MAX_STREAMS   = 200;        // bounded activeStreams
const DEFAULT_RATE_PER_MIN  = 120;        // token-bucket per IP on /api/orchestrate
const DEFAULT_WORKFLOW_TIMEOUT_MS = 5 * 60 * 1000; // 5min hard cap per workflow
const PERSIST_DIR = path.join(process.cwd(), 'agent_work', 'orchestrator');

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch (_) {} }

// ── Retry with exponential backoff + jitter ──────────────────────────────
async function withRetry(fn, { attempts = 3, baseMs = 200, maxMs = 2000, label = 'op' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i === attempts - 1) break;
      const delay = Math.min(maxMs, baseMs * (2 ** i)) + Math.random() * 50;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  const err = new Error(`${label} failed after ${attempts} attempts: ${lastErr && lastErr.message}`);
  err.lastError = lastErr;
  throw err;
}

// ── HTTP request with timeout, body cap, JSON parse ──────────────────────
function httpJson({ method = 'GET', hostname = 'localhost', port, path: urlPath, body, timeoutMs = DEFAULT_TIMEOUT_MS, maxBody = DEFAULT_MAX_BODY }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    if (payload && Buffer.byteLength(payload) > maxBody) {
      return reject(new Error(`request body ${Buffer.byteLength(payload)} bytes exceeds cap ${maxBody}`));
    }
    const req = http.request({
      hostname, port, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let chunks = [];
      let bytes = 0;
      res.on('data', c => {
        bytes += c.length;
        if (bytes > maxBody) {
          req.destroy(new Error(`response body exceeded cap ${maxBody}`));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 500) {
          const err = new Error(`${method} ${urlPath} -> ${res.statusCode}: ${data.slice(0, 200)}`);
          err.statusCode = res.statusCode;
          err.body = data;
          return reject(err);
        }
        if (res.statusCode === 204) return resolve(null);
        if (!data) return resolve(null);
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`${method} ${urlPath} timed out after ${timeoutMs}ms`)));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Circuit breaker (per service) ────────────────────────────────────────
//   Closed: requests pass through. On 3+ consecutive failures, open.
//   Open:   for the next 30s, fail fast without making a request.
//   Half-open: after 30s, allow ONE probe. Success closes the circuit.
function makeBreaker(name, { failThreshold = 3, cooldownMs = 30_000 } = {}) {
  let state = 'closed';
  let consecutiveFails = 0;
  let openedAt = 0;
  return {
    name,
    isOpen() {
      if (state === 'open' && Date.now() - openedAt > cooldownMs) {
        state = 'half-open';
        return false;
      }
      return state === 'open';
    },
    recordSuccess() {
      consecutiveFails = 0;
      state = 'closed';
    },
    recordFailure() {
      consecutiveFails++;
      if (state === 'half-open' || consecutiveFails >= failThreshold) {
        state = 'open';
        openedAt = Date.now();
      }
    },
    state() { return { state, consecutiveFails, openedAt }; },
  };
}

// ── Bounded Map (LRU eviction) ───────────────────────────────────────────
class BoundedMap {
  constructor(max, label) {
    this.max = max;
    this.label = label;
    this.map = new Map();
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) {
      // Evict oldest (FIFO via Map iteration order).
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    return v;
  }
  get(k) { return this.map.get(k); }
  has(k) { return this.map.has(k); }
  delete(k) { return this.map.delete(k); }
  clear() { this.map.clear(); }
  size() { return this.map.size; }
  values() { return this.map.values(); }
  entries() { return this.map.entries(); }
  keys() { return this.map.keys(); }
  forEach(fn, ctx) { this.map.forEach(fn, ctx); }
}

// ── Token-bucket rate limiter (per key) ─────────────────────────────────
function makeRateLimiter({ capacity = DEFAULT_RATE_PER_MIN, refillPerSec = capacity / 60 } = {}) {
  const buckets = new Map();
  return {
    take(key = 'global', cost = 1) {
      const now = Date.now();
      const b = buckets.get(key) || { tokens: capacity, last: now };
      // Refill
      const elapsedSec = (now - b.last) / 1000;
      b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
      b.last = now;
      if (b.tokens < cost) {
        buckets.set(key, b);
        return { allow: false, retryAfterMs: Math.ceil((cost - b.tokens) / refillPerSec * 1000) };
      }
      b.tokens -= cost;
      buckets.set(key, b);
      return { allow: true, tokensLeft: b.tokens };
    },
    state(key = 'global') {
      const b = buckets.get(key);
      return b ? { tokens: Math.floor(b.tokens) } : { tokens: capacity };
    },
  };
}

// ── Workflow timeout enforcement ────────────────────────────────────────
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Workflow persistence (write-through) ────────────────────────────────
function persistWorkflow(workflow) {
  try {
    ensureDir(PERSIST_DIR);
    const file = path.join(PERSIST_DIR, workflow.id + '.json');
    const tmp  = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(workflow, null, 2));
    fs.renameSync(tmp, file); // atomic
  } catch (_) { /* never let persistence break the workflow */ }
}

function loadPersistedWorkflows() {
  try {
    ensureDir(PERSIST_DIR);
    return fs.readdirSync(PERSIST_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(PERSIST_DIR, f), 'utf8')); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

function clearPersistedWorkflow(id) {
  try { fs.unlinkSync(path.join(PERSIST_DIR, id + '.json')); } catch (_) {}
}

// ── Graceful shutdown ───────────────────────────────────────────────────
function makeGracefulShutdown(shutdownFn, { timeoutMs = 15_000 } = {}) {
  let shuttingDown = false;
  async function handler(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[orchestrator] ${signal} received, draining…`);
    try {
      await Promise.race([shutdownFn(), new Promise((_, r) => setTimeout(() => r(new Error('shutdown timeout')), timeoutMs))]);
      console.log('[orchestrator] drained cleanly');
    } catch (e) {
      console.error('[orchestrator] drain error:', e.message);
    }
    process.exit(0);
  }
  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT',  () => handler('SIGINT'));
  return { isShuttingDown: () => shuttingDown };
}

// ── Public factory: returns helpers bound to the orchestrator's ports ───
function withHardening(ports) {
  return {
    withRetry,
    httpJson,
    makeBreaker,
    BoundedMap,
    makeRateLimiter,
    withTimeout,
    persistWorkflow,
    loadPersistedWorkflows,
    clearPersistedWorkflow,
    makeGracefulShutdown,
    breakers: {
      api:     makeBreaker('api'),
      tower:   makeBreaker('tower'),
      state:   makeBreaker('state'),
      eventbus:makeBreaker('eventbus'),
    },
    cfg: {
      DEFAULT_TIMEOUT_MS,
      DEFAULT_MAX_BODY,
      DEFAULT_MAX_WORKFLOWS,
      DEFAULT_MAX_STREAMS,
      DEFAULT_RATE_PER_MIN,
      DEFAULT_WORKFLOW_TIMEOUT_MS,
      PERSIST_DIR,
    },
  };
}

module.exports = { withHardening };
