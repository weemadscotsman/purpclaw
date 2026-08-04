// packages/memory/cognitive-spine/temporal/index.js
// Temporal layer: time, date, schedule, deadline, when memories
// Pattern match: /time|date|schedule|deadline|when/i

'use strict';

var MemoryClient = require('../../../adapters/memory-client-wrapper');

function TemporalLayer(gateway) {
  this.gateway = gateway;
  this.layer = 'temporal';
}

TemporalLayer.prototype.recall = async function(query, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.recall(query, options);
};

TemporalLayer.prototype.record = async function(memory, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.ingest(memory.content, { layer: 'temporal', scope: 'temporal' });
};

TemporalLayer.prototype.promote = async function(memoryId, targetLayer) {
  return { ok: true, promoted: memoryId, to: targetLayer, layer: 'temporal' };
};

TemporalLayer.prototype.supersede = async function(memoryId, newMemoryId) {
  return { ok: true, superseded: memoryId, by: newMemoryId };
};

TemporalLayer.prototype.health = async function() {
  return { layer: 'temporal', status: 'pending_wiring', ok: false };
};

module.exports = TemporalLayer;
