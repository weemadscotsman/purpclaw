'use strict';

/**
 * lib/memory-gateway.js
 * ======================
 * Canonical compatibility wrapper — re-exports MemoryGateway from packages/memory/gateway.
 *
 * EXISTING callers (lib/ and root) should migrate to this entry point:
 *   const gateway = require('./memory-gateway');
 *   gateway.record({ layer: 'episodic', ... });
 *   gateway.recall({ query: '...', layers: ['episodic', 'semantic'] });
 *
 * The underlying packages/memory/gateway uses file-system adapters by default.
 * The cognitive-spine adapter (packages/memory/cognitive-spine/index.js) bridges
 * to the live Python spine on port 7880 when available.
 *
 * Lifecycle:
 *   recall → assemble governed context → plan → act → capture event → verify → consolidate
 *
 * The seven layers (episodic | semantic | procedural | symbolic | temporal | counterfactual | affective)
 * are enforced by the envelope contract. Every memory object includes:
 *   memoryId, layer, kind, scope, lineage, content, truth, time, policy
 *
 * Do not create second private memory implementations. Every surface uses this gateway.
 */

let _gateway = null;

function _getGateway() {
  if (_gateway) return _gateway;
  try {
    const { MemoryGateway } = require('../packages/memory/gateway');
    _gateway = new MemoryGateway({
      scope: { organisation: 'purpclaw', workspace: 'canonical', user: 'operator' }
    });
  } catch (err) {
    console.error('[memory-gateway] failed to load packages/memory/gateway:', err.message);
    return null;
  }
  return _gateway;
}

// ── Primary API (7 mandatory methods) ──────────────────────────────────────────

/** recall(opts) → { ok, items[], tokenCount, errors[] } */
function recall(opts = {}) {
  const gw = _getGateway();
  if (!gw) return { ok: false, items: [], tokenCount: 0, errors: ['gateway unavailable'] };
  return gw.recall(opts);
}

/** record(opts) → { ok, memoryId, envelope } */
function record(opts = {}) {
  const gw = _getGateway();
  if (!gw) return { ok: false, memoryId: null, envelope: null, error: 'gateway unavailable' };
  return gw.record(opts);
}

/** promote(memoryId, opts) → { ok, memoryId, envelope } */
function promote(memoryId, opts = {}) {
  const gw = _getGateway();
  if (!gw) return { ok: false, error: 'gateway unavailable' };
  return gw.promote(memoryId, opts);
}

/** supersede(memoryId, opts) → alias for forget() */
function supersede(memoryId, opts = {}) {
  const gw = _getGateway();
  if (!gw) return { ok: false, error: 'gateway unavailable' };
  return gw.forget(memoryId, { reason: 'superseded', ...opts });
}

/** forget(memoryId, opts) → { ok, memoryId, reason } */
function forget(memoryId, opts = {}) {
  const gw = _getGateway();
  if (!gw) return { ok: false, error: 'gateway unavailable' };
  return gw.forget(memoryId, opts);
}

/** explain(memoryId) → { found, memoryId, explanation, ... } */
function explain(memoryId) {
  const gw = _getGateway();
  if (!gw) return { found: false, memoryId, explanation: 'gateway unavailable' };
  return gw.explain(memoryId);
}

/** health() → { ok, layers: {}, checkedAt } */
function health() {
  const gw = _getGateway();
  if (!gw) return { ok: false, layers: {}, checkedAt: new Date().toISOString(), error: 'gateway unavailable' };
  return gw.health();  // underlying MemoryGateway exposes health(), not healthCheck()
}

// ── Layer constants ─────────────────────────────────────────────────────────────

let _LAYERS = null;
function getLayers() {
  if (_LAYERS) return _LAYERS;
  try {
    ({ LAYERS: _LAYERS } = require('../packages/memory/gateway'));
  } catch { _LAYERS = ['episodic', 'semantic', 'procedural', 'symbolic', 'temporal', 'counterfactual', 'affective']; }
  return _LAYERS;
}

// ── Module exports ───────────────────────────────────────────────────────────────

module.exports = {
  // Primary 7-method API
  recall,
  record,
  promote,
  supersede,  // alias — both terms are acceptable
  forget,
  explain,
  health,
  // Convenience
  getLayers,
  // Direct gateway access for advanced use
  getGateway: _getGateway,
};
