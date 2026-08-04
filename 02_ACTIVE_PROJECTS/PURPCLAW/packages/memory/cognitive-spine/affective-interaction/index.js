// packages/memory/cognitive-spine/affective-interaction/index.js
// Affective-interaction layer: feeling, emotion, preference, belief, trust
// Pattern match: /feeling|emotion|preference|belief|trust/i

'use strict';

var MemoryClient = require('../../../adapters/memory-client-wrapper');

function AffectiveInteractionLayer(gateway) {
  this.gateway = gateway;
  this.layer = 'affective-interaction';
}

AffectiveInteractionLayer.prototype.recall = async function(query, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.recall(query, options);
};

AffectiveInteractionLayer.prototype.record = async function(memory, options) {
  var client = new MemoryClient(this.gateway.options);
  return client.ingest(memory.content, { layer: 'affective-interaction', scope: 'interaction' });
};

AffectiveInteractionLayer.prototype.promote = async function(memoryId, targetLayer) {
  return { ok: true, promoted: memoryId, to: targetLayer, layer: 'affective-interaction' };
};

AffectiveInteractionLayer.prototype.supersede = async function(memoryId, newMemoryId) {
  return { ok: true, superseded: memoryId, by: newMemoryId };
};

AffectiveInteractionLayer.prototype.health = async function() {
  return { layer: 'affective-interaction', status: 'pending_wiring', ok: false };
};

module.exports = AffectiveInteractionLayer;
