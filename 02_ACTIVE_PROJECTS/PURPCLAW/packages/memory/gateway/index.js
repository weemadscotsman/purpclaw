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
const CONTRACT = require('../contract');

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
    const now = new Date().toISOString();
    // Envelope defaults come from contract/, not from a second copy of the
    // field list inlined here. Two copies drift, and the one that drifts is
    // always the one nobody is looking at.
    const enriched = CONTRACT.enrich({
      ...memory,
      layer,
      memoryId: memory.memoryId || generateId('mem_'),
      createdAt: memory.createdAt || now,
      validFrom: memory.validFrom || now,
    });
    const checked = CONTRACT.validate(enriched);
    if (!checked.ok) return { ok: false, code: 'CONTRACT_VIOLATION', missing: checked.missing };
    return this.layers[layer].record(enriched, options);
  }

  // promote / supersede / forget are declared by the contract but cannot yet be
  // performed: the live spine (lib/memory-client.js) exposes no operation that
  // implements them. They report that honestly. They previously returned
  // ok:true unconditionally, so a supersession that never happened — and a
  // forget() that deleted nothing — both reported success. For a memory system
  // whose whole job is knowing what is true, that is the worst possible lie.
  // Implement these on the spine first, then let them through here.

  async promote(memoryId, targetLayer, options = {}) {
    if (!this.layers[targetLayer]) return { ok: false, error: 'unknown layer: ' + targetLayer };
    return this.layers[targetLayer].promote(memoryId, targetLayer, options);
  }

  async supersede(memoryId, newMemoryId, options = {}) {
    const results = await Promise.all(
      Object.values(this.layers).map(l => l.supersede(memoryId, newMemoryId, options))
    );
    const done = results.filter(r => r && r.ok);
    return done.length
      ? { ok: true, superseded: memoryId, by: newMemoryId, layers: done.map(r => r.layer) }
      : { ...results[0], memoryId, newMemoryId, layersChecked: results.length };
  }

  async forget(memoryId, options = {}) {
    const results = await Promise.all(
      Object.values(this.layers).map(l => l.forget(memoryId, options))
    );
    const done = results.filter(r => r && r.ok);
    return done.length
      ? { ok: true, forgotten: memoryId, layers: done.map(r => r.layer) }
      : { ...results[0], memoryId, layersChecked: results.length };
  }

  async explain(memoryId, options = {}) {
    return {
      ok: false,
      code: 'NOT_IMPLEMENTED',
      memoryId,
      error: 'explain() needs a provenance store; none is wired yet. '
        + 'Returning an empty provenance list would read as "this memory has no sources".',
    };
  }

  async health(options = {}) {
    // Object.entries() over an array yields string indices, which the previous
    // version then used to index Object.keys(this.layers) — it only worked by
    // coercion and silently mislabelled layers the moment one was reordered.
    const names = Object.keys(this.layers);
    const results = await Promise.allSettled(names.map(n => this.layers[n].health()));
    const layers = {};
    let ok = true;
    names.forEach((name, i) => {
      const r = results[i];
      layers[name] = r.status === 'fulfilled'
        ? r.value
        : { layer: name, ok: false, status: 'error', error: String(r.reason && r.reason.message || r.reason) };
      if (!layers[name].ok) ok = false;
    });
    return { ok, layers };
  }
}

module.exports = { MemoryGateway, LAYER_PATTERNS, generateId };
