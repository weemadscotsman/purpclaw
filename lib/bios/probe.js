'use strict';
/**
 * lib/bios/probe.js — runtime side of the BIOS.
 *
 * Inputs:
 *   - profile name (string) OR a probe-plan array
 *   - service filter (subset of spec.services by class)
 *   - options { timeoutMs, parallelBudget }
 *
 * Output:
 *   - rows: [{service_id, port, state, latency_ms, evidence}]
 *
 * Bans:
 *   - no pm2 subprocess; reads pm2 RPC only if PM2_API_URL is set in env
 *   - no fs writes
 *   - all side effects go through cache.record()
 */

const http = require('http');
const { classify, STATES } = require('./classify');
const { all, service, drift } = require('./spec');
const cache = require('./cache');

const DEFAULT_PARALLEL = 4;
const DEFAULT_TIMEOUT_MS = 1500;

/**
 * Promise wrapper around http.request with a hard timeout.
 */
function httpGet(host, port, path, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request({
      method: 'GET',
      host,
      port,
      path,
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c.toString(); if (body.length > 2048) body = body.slice(0, 2048); });
      res.on('end', () => resolve({
        ok: true,
        latencyMs: Date.now() - start,
        status: res.statusCode || 0,
        body,
      }));
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
      resolve({ ok: false, error: { code: 'ETIMEDOUT' }, latencyMs: Date.now() - start });
    });
    req.on('error', (e) => {
      resolve({ ok: false, error: { code: e.code || 'EUNKNOWN', message: e.message }, latencyMs: Date.now() - start });
    });
    req.end();
  });
}

/**
 * Probe a single service per spec. Returns a row ready for cache.record().
 */
async function probeService(svcId, opts = {}) {
  const row = service(svcId);
  if (!row) {
    return { service_id: svcId, port: null, state: STATES.WRONG_PORT, latency_ms: 0, evidence: { reason: 'spec_missing' } };
  }
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const probe = await httpGet('127.0.0.1', row.port, '/', timeoutMs);
  const state = classify({
    port: row.port,
    response: probe.ok ? { status: probe.status, body: probe.body, latencyMs: probe.latencyMs } : null,
    error: probe.ok ? null : probe.error,
    specRow: row,
  });
  return {
    service_id: svcId,
    port: row.port,
    state,
    latency_ms: probe.latencyMs || 0,
    evidence: probe.ok
      ? { status: probe.status, body_preview: probe.body.slice(0, 200) }
      : { code: probe.error.code, message: probe.error.message },
  };
}

/**
 * Run probes for a profile. Returns rows; cache.record() is called per row.
 * Probe plan = the spec's services filtered by class — for core-safe, that's
 *   `class === 'core'`. For full-chaos, that's all classes.
 */
async function runProfile(profileName, opts = {}) {
  const spec = all();
  const classFilter = opts.classFilter || ['core'];
  const ids = Object.keys(spec.stack.services).filter(id => classFilter.includes(spec.stack.services[id].class));
  const parallel = opts.parallel || DEFAULT_PARALLEL;

  const rows = [];
  // Simple semaphore-style parallel — `parallel` inflight at a time
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const row = await probeService(id, opts);
      rows.push(row);
      cache.record(row);
    }
  }
  const workers = Array.from({ length: Math.min(parallel, ids.length) }, () => worker());
  await Promise.all(workers);
  return rows;
}

/**
 * Probe a single manual service. Used by /api/boot/probe/[service_id].
 */
async function probeOne(svcId, opts = {}) {
  const row = await probeService(svcId, opts);
  cache.record(row);
  return row;
}

module.exports = { probeService, runProfile, probeOne, httpGet };
