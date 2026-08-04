// packages/memory/gateway/index.js
// PURPCLAW Seven-Layer Memory Gateway
// Single permitted application interface for all memory operations.
// Every subsystem must use this gateway - no private memory implementations.
//
// Seven layers: episodic | semantic | procedural | symbolic | temporal | counterfactual | affective-interaction
//
// Install hooks into: AgentGateway, agent loop, ToolRuntime, orchestrator,
// pipeline registry, harness core, Council, Studio, API, CLI, TUI, Web

'use strict';

const MemoryClient = require('../adapters/memory-client-wrapper');

const LAYER_PATTERNS = {
  episodic:             /session|turn|event|action|tool-call/i,
  semantic:             /fact|knowledge|concept|rule|pattern/i,
  procedural:           /workflow|how-to|method|process|step/i,
  symbolic:             /rule|logic|inference|theorem|proof/i,
  temporal:             /time|date|schedule|deadline|when/i,
  counterfactual:       /what-if|scenario|hypothetical|alternative/i,
  'affective-interaction': /feeling|emotion|preference|belief|trust/i,
};

function generateId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

class MemoryGateway {
  constructor(options = {}) {
    this.options = options;
    this.client = new MemoryClient(options);
    this.layers = {};
    this._initLayers();
  }

  _initLayers() {
    const layerNames = Object.keys(LAYER_PATTERNS);
    for (const name of layerNames) {
      this.layers[name] = new (require('../cognitive-spine/' + name))(this);
    }
  }

  inferLayer(memory) {
    const content = String(memory.content || '');
    for (const [layer, pattern] of Object.entries(LAYER_PATTERNS)) {
      if (pattern.test(content)) return layer;
    }
    return 'semantic';
  }

  async recall(query, options = {}) {
    const { layer, limit = 5, scope, sessionId, taskId } = options;
    if (layer) {
      return this.layers[layer]
        ? await this.layers[layer].recall(query, options)
        : { items: [], error: 'unknown layer: ' + layer };
    }
    const results = await Promise.allSettled(
      Object.values(this.layers).map(l => l.recall(query, { limit, scope, sessionId, taskId }))
    );
    const items = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value.items || [])
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, limit);
    return { items, query, layers: Object.keys(this.layers) };
  }

  async record(memory, options = {}) {
    const layer = memory.layer || this.inferLayer(memory);
    if (!this.layers[layer]) return { ok: false, error: 'unknown layer: ' + layer };
    const enriched = {
      ...memory,
      layer,
      memoryId: memory.memoryId || generateId('mem_'),
      createdAt: memory.createdAt || new Date().toISOString(),
      validFrom: memory.validFrom || new Date().toISOString(),
      sensitivity: memory.sensitivity || 'internal',
      retention: memory.retention || 'standard',
    };
    return this.layers[layer].record(enriched, options);
  }

  async promote(memoryId, targetLayer, options = {}) {
    if (!this.layers[targetLayer]) return { ok: false, error: 'unknown layer: ' + targetLayer };
    for (const [name, layer] of Object.entries(this.layers)) {
      const result = await layer.promote(memoryId, targetLayer, options);
      if (result && result.ok) return result;
    }
    return { ok: false, error: 'memory not found in any layer' };
  }

  async supersede(memoryId, newMemoryId, options = {}) {
    const results = await Promise.allSettled(
      Object.values(this.layers).map(l => l.supersede(memoryId, newMemoryId, options))
    );
    return { ok: true, superseded: memoryId, by: newMemoryId, layersChecked: results.length };
  }

  async forget(memoryId, options = {}) {
    const results = await Promise.allSettled(
      Object.values(this.layers).map(l => l.forget && l.forget(memoryId, options))
    );
    return { ok: true, forgotten: memoryId, layersChecked: results.length };
  }

  async explain(memoryId, options = {}) {
    return { memoryId, provenance: [], explanation: 'TODO: wire to provenance store' };
  }

  async health(options = {}) {
    const results = await Promise.allSettled(
      Object.values(this.layers).map(l => l.health())
    );
    const layerHealth = {};
    let allOk = true;
    for (const [name, result] of Object.entries(results)) {
      const key = Object.keys(this.layers)[name];
      layerHealth[key] = result.status === 'fulfilled' ? result.value : { status: 'error', ok: false };
      if (!layerHealth[key].ok) allOk = false;
    }
    return { ok: allOk, layers: layerHealth };
  }
}

module.exports = { MemoryGateway, LAYER_PATTERNS, generateId };
