'use strict';
/**
 * packages/memory — the governed seven-layer memory gateway.
 *
 * MemoryGateway is the only permitted application interface for memory. No
 * subsystem may open a second private store; adapters/ wraps the existing
 * implementations instead of replacing them, and lib/memory-gateway.js
 * re-exports this package so lib/ callers migrate without a flag day.
 *
 * The seven layers are seven modules inside one cognitive spine, not seven
 * services and not seven ports.
 */

const { MemoryGateway, LAYER_PATTERNS } = require('./gateway');
const CONTRACT = require('./contract');
const POLICY = require('./policy');

const LAYERS = Object.keys(LAYER_PATTERNS);

let shared = null;
/** Process-wide gateway. Memory is one spine; handing every caller its own
 *  instance is how a stack ends up with seven of them. */
function gateway(options) {
  if (!shared) shared = new MemoryGateway(options || {});
  return shared;
}

module.exports = { MemoryGateway, gateway, LAYERS, LAYER_PATTERNS, CONTRACT, POLICY };
