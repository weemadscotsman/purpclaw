'use strict';

/**
 * PURPCLAW Worker Auth
 * ════════════════════
 * HMAC-SHA256 signing for worker ↔ pool communication.
 *
 * Threat model: prevent untrusted LAN nodes from registering as workers
 * and receiving real jobs. Not meant to be internet-grade TLS — it's an
 * internal shared-secret layer that raises the bar from "open door" to
 * "you need the key."
 *
 * How it works:
 *   - Both sides share WORKER_SECRET (set in .env or ecosystem.config.js)
 *   - Every request the pool sends to a worker includes X-Worker-Token
 *   - Every health response a worker sends back includes X-Worker-Sig
 *   - Tokens encode method + path + 30-second time window → replay window ≤ 60s
 *   - If no secret is configured: pool logs a warning, requests pass through
 *     (backward-compat — existing workers without secrets still work)
 *
 * Token format:
 *   HMAC-SHA256(secret, "<METHOD>:<path>:<window>")
 *   where window = Math.floor(Date.now() / 30000)
 *   Verified against current window AND previous window (±30s clock skew)
 *
 * Usage (pool → worker dispatch):
 *   const headers = workerAuth.signRequest('POST', '/task', secret);
 *   // { 'X-Worker-Token': '...', 'X-Worker-Ts': '...' }
 *
 * Usage (worker validates incoming request):
 *   const ok = workerAuth.verifyRequest(req, secret);
 *
 * Usage (worker signs health response):
 *   const sig = workerAuth.signHealth(secret);
 *   // { 'X-Worker-Sig': '...' }
 *
 * Usage (pool verifies health response):
 *   const ok = workerAuth.verifyHealth(res.headers['x-worker-sig'], secret);
 */

const crypto = require('crypto');

const WINDOW_MS   = 30000;   // 30-second signing windows
const HEADER_TOKEN = 'x-worker-token';
const HEADER_SIG   = 'x-worker-sig';
const HEADER_TS    = 'x-worker-ts';

// ── Core HMAC ────────────────────────────────────────────────────────────────

function hmac(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function currentWindows() {
  const w = Math.floor(Date.now() / WINDOW_MS);
  return [w, w - 1]; // accept current + previous window (handles clock skew)
}

// ── Pool → Worker (outbound request signing) ──────────────────────────────────

/**
 * Returns headers to attach to outbound requests from pool → worker.
 * @param {string} method   HTTP method e.g. 'POST'
 * @param {string} urlPath  path e.g. '/task'
 * @param {string} secret   shared secret
 * @returns {Object} headers to merge into request
 */
function signRequest(method, urlPath, secret) {
  if (!secret) return {};
  const ts = String(Math.floor(Date.now() / WINDOW_MS));
  const token = hmac(secret, `${method.toUpperCase()}:${urlPath}:${ts}`);
  return {
    [HEADER_TOKEN]: token,
    [HEADER_TS]:    ts,
  };
}

/**
 * Verify an incoming request from the pool (called inside worker_service.js).
 * Returns { ok: true } or { ok: false, reason }
 */
function verifyRequest(req, secret) {
  if (!secret) return { ok: true, reason: 'no-secret-configured' };

  const token = req.headers[HEADER_TOKEN];
  const ts    = req.headers[HEADER_TS];

  if (!token) return { ok: false, reason: 'missing X-Worker-Token header' };

  // Accept current + previous time window
  const windows = currentWindows();
  for (const w of windows) {
    const expected = hmac(secret, `${req.method.toUpperCase()}:${req.url.split('?')[0]}:${w}`);
    if (timingSafeEqual(token, expected)) return { ok: true };
  }

  // Also accept the ts value from the header if present (handles edge cases)
  if (ts) {
    const tsWindow = parseInt(ts, 10);
    if (!isNaN(tsWindow) && Math.abs(tsWindow - windows[0]) <= 2) {
      const expected = hmac(secret, `${req.method.toUpperCase()}:${req.url.split('?')[0]}:${tsWindow}`);
      if (timingSafeEqual(token, expected)) return { ok: true };
    }
  }

  return { ok: false, reason: 'invalid or expired token' };
}

// ── Worker → Pool (health response signing) ──────────────────────────────────

/**
 * Returns a header the worker attaches to health responses so the pool
 * can verify it's talking to a legitimately configured worker.
 */
function signHealth(secret) {
  if (!secret) return {};
  const w = Math.floor(Date.now() / WINDOW_MS);
  const sig = hmac(secret, `health:${w}`);
  return { [HEADER_SIG]: sig };
}

/**
 * Verify health response signature (called inside worker-pool.js).
 * Returns true if valid, false if not. Passes if no secret configured.
 */
function verifyHealth(sigHeader, secret) {
  if (!secret) return true; // backward compat
  if (!sigHeader) return false;
  const windows = currentWindows();
  for (const w of windows) {
    const expected = hmac(secret, `health:${w}`);
    if (timingSafeEqual(sigHeader, expected)) return true;
  }
  return false;
}

// ── Shared secret generation ──────────────────────────────────────────────────

/**
 * Generate a new random 32-byte worker secret (hex-encoded, 64 chars).
 * Use this to set WORKER_SECRET in .env and on remote worker machines.
 */
function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Timing-safe comparison ────────────────────────────────────────────────────

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Length mismatch leaks info, but we still need to avoid short-circuit.
    // Hash both to equalize length before comparing.
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = {
  signRequest,
  verifyRequest,
  signHealth,
  verifyHealth,
  generateSecret,
  HEADER_TOKEN,
  HEADER_SIG,
  HEADER_TS,
};
