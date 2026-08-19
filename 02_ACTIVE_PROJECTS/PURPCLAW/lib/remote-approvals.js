'use strict';

/**
 * SPEC-013: Remote Approvals
 *
 * Queue approval requests, approve/deny from any channel,
 * agent waits with timeout. Storage: .purpclaw/approvals/
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// Relative root — no donor-machine absolute paths in runtime code.
const ROOT = path.resolve(__dirname, '..');
const DIR  = path.join(ROOT, '.purpclaw', 'approvals');

function safeMkdir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function requestPath(requestId) {
  return path.join(DIR, requestId + '.json');
}

/**
 * Queue an approval request.
 * @param {object} opts
 * @param {string} opts.tool     - tool name
 * @param {object} opts.args     - tool arguments
 * @param {object} [opts.context] - extra context
 * @param {number} [opts.ttlSeconds] - TTL in seconds (default 300 = 5 min)
 * @returns {{ requestId, queuedAt, expiresAt }}
 */
function queue({ tool, args, context, ttlSeconds = 300 }) {
  safeMkdir();
  const requestId = crypto.randomBytes(8).toString('hex');
  const queuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const request = {
    requestId, tool, args, context,
    status: 'pending',
    queuedAt, expiresAt, ttlSeconds,
    decision: null, decidedAt: null, notes: null,
  };
  fs.writeFileSync(requestPath(requestId), JSON.stringify(request, null, 2));
  return { requestId, queuedAt, expiresAt };
}

/**
 * Get all pending approval requests.
 */
function pending() {
  safeMkdir();
  const now = new Date().toISOString();
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(r => r && r.status === 'pending' && r.expiresAt > now);
}

/**
 * Get a specific request.
 */
function get(requestId) {
  try {
    return JSON.parse(fs.readFileSync(requestPath(requestId), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Approve a request.
 * @param {string} requestId
 * @param {object} [opts]
 * @param {string} [opts.notes]
 */
function approve(requestId, opts = {}) {
  return _resolve(requestId, 'approved', opts.notes || null);
}

/**
 * Deny a request.
 * @param {string} requestId
 * @param {object} [opts]
 * @param {string} [opts.reason]
 */
function deny(requestId, opts = {}) {
  return _resolve(requestId, 'denied', opts.reason || 'denied by operator');
}

function _resolve(requestId, decision, notes) {
  const request = get(requestId);
  if (!request) return null;
  if (request.status !== 'pending') return { ...request, error: 'already resolved' };

  request.status = 'resolved';
  request.decision = decision;
  request.decidedAt = new Date().toISOString();
  request.notes = notes;
  fs.writeFileSync(requestPath(requestId), JSON.stringify(request, null, 2));
  return { requestId, decision, decidedAt: request.decidedAt, notes };
}

/**
 * Agent waits for approval with timeout.
 * @param {string} requestId
 * @param {{ timeoutMs: number }} [opts]
 * @returns {Promise<{ decision: 'approved'|'denied'|'timeout', notes? }>}
 */
function wait(requestId, opts = {}) {
  const timeoutMs = opts.timeoutMs || 300_000;
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const req = get(requestId);
      if (!req) { resolve({ decision: 'timeout' }); return; }
      if (req.status === 'resolved') {
        resolve({ decision: req.decision, notes: req.notes });
        return;
      }
      if (Date.now() > deadline) { resolve({ decision: 'timeout' }); return; }
      setTimeout(poll, 200);
    };
    poll();
  });
}

/**
 * Cancel a pending request.
 */
function cancel(requestId) {
  const request = get(requestId);
  if (!request) return null;
  request.status = 'cancelled';
  request.decidedAt = new Date().toISOString();
  fs.writeFileSync(requestPath(requestId), JSON.stringify(request, null, 2));
  return request;
}

/**
 * Clear expired requests.
 */
function purgeExpired() {
  const now = new Date().toISOString();
  let count = 0;
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      if (r.status === 'pending' && r.expiresAt <= now) {
        r.status = 'expired';
        r.decidedAt = now;
        fs.writeFileSync(path.join(DIR, f), JSON.stringify(r, null, 2));
        count++;
      }
    } catch {}
  }
  return count;
}

module.exports = { queue, pending, get, approve, deny, wait, cancel, purgeExpired, DIR };
