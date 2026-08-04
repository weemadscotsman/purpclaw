// packages/memory/cognitive-spine/semantic/index.js
// Semantic layer: fact, knowledge, concept, rule, pattern memories
// Pattern match: /fact|knowledge|concept|rule|pattern/i

'use strict';

var MemoryClient = require('../../../adapters/memory-client-wrapper');

function SemanticLayer(gateway) {
  this.gateway = gateway;
  this.layer = 'semantic';
}

SemanticLayer.prototype.recall = async function(query, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.recall(query, options);
};

SemanticLayer.prototype.record = async function(memory, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.ingest(memory.content, { layer: 'semantic', scope: 'knowledge' });
};

SemanticLayer.prototype.promote = async function(memoryId, targetLayer) {
  return { ok: true, promoted: memoryId, to: targetLayer, layer: 'semantic' };
};

SemanticLayer.prototype.supersede = async function(memoryId, newMemoryId) {
  return { ok: true, superseded: memoryId, by: newMemoryId };
};

SemanticLayer.prototype.health = async function() {
  return { layer: 'semantic', status: 'pending_wiring', ok: false };
};

module.exports = SemanticLayer;
