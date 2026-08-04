// packages/memory/cognitive-spine/procedural/index.js
// Procedural layer: workflow, how-to, method, process, step memories
// Pattern match: /workflow|how-to|method|process|step/i

'use strict';

var MemoryClient = require('../../../adapters/memory-client-wrapper');

function ProceduralLayer(gateway) {
  this.gateway = gateway;
  this.layer = 'procedural';
}

ProceduralLayer.prototype.recall = async function(query, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.recall(query, options);
};

ProceduralLayer.prototype.record = async function(memory, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.ingest(memory.content, { layer: 'procedural', scope: 'procedure' });
};

ProceduralLayer.prototype.promote = async function(memoryId, targetLayer) {
  return { ok: true, promoted: memoryId, to: targetLayer, layer: 'procedural' };
};

ProceduralLayer.prototype.supersede = async function(memoryId, newMemoryId) {
  return { ok: true, superseded: memoryId, by: newMemoryId };
};

ProceduralLayer.prototype.health = async function() {
  return { layer: 'procedural', status: 'pending_wiring', ok: false };
};

module.exports = ProceduralLayer;
