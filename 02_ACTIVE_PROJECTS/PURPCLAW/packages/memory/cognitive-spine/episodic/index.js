// packages/memory/cognitive-spine/episodic/index.js
// Episodic layer: session, turn, event, action, tool-call memories
// Pattern match: /session|turn|event|action|tool-call/i

'use strict';

var MemoryClient = require('../../../adapters/memory-client-wrapper');

function EpisodicLayer(gateway) {
  this.gateway = gateway;
  this.layer = 'episodic';
}

EpisodicLayer.prototype.recall = async function(query, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.recall(query, options);
};

EpisodicLayer.prototype.record = async function(memory, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.ingest(memory.content, { layer: 'episodic', scope: 'session' });
};

EpisodicLayer.prototype.promote = async function(memoryId, targetLayer) {
  return { ok: true, promoted: memoryId, to: targetLayer, layer: 'episodic' };
};

EpisodicLayer.prototype.supersede = async function(memoryId, newMemoryId) {
  return { ok: true, superseded: memoryId, by: newMemoryId };
};

EpisodicLayer.prototype.health = async function() {
  return { layer: 'episodic', status: 'pending_wiring', ok: false };
};

module.exports = EpisodicLayer;
