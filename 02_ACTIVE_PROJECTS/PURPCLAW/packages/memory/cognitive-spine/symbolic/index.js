// packages/memory/cognitive-spine/symbolic/index.js
// Symbolic layer: rule, logic, inference, theorem, proof memories
// Pattern match: /rule|logic|inference|theorem|proof/i

'use strict';

var MemoryClient = require('../../../adapters/memory-client-wrapper');

function SymbolicLayer(gateway) {
  this.gateway = gateway;
  this.layer = 'symbolic';
}

SymbolicLayer.prototype.recall = async function(query, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.recall(query, options);
};

SymbolicLayer.prototype.record = async function(memory, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.ingest(memory.content, { layer: 'symbolic', scope: 'rule' });
};

SymbolicLayer.prototype.promote = async function(memoryId, targetLayer) {
  return { ok: true, promoted: memoryId, to: targetLayer, layer: 'symbolic' };
};

SymbolicLayer.prototype.supersede = async function(memoryId, newMemoryId) {
  return { ok: true, superseded: memoryId, by: newMemoryId };
};

SymbolicLayer.prototype.health = async function() {
  return { layer: 'symbolic', status: 'pending_wiring', ok: false };
};

module.exports = SymbolicLayer;
