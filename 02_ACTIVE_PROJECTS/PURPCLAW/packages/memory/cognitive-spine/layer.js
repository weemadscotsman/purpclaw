'use strict';
/**
 * One layer implementation, seven names.
 *
 * The seven cognitive-spine directories previously held seven copies of the
 * same ~35-line stub, differing only in a string literal — and all seven had
 * the same broken require path (`../../../adapters/...` resolves to
 * packages/adapters/, which does not exist, so every layer threw on load).
 * Fixing that bug in seven places is seven chances to fix it in six.
 *
 * Read the doctrine before changing the return values below: promote(),
 * supersede() and forget() are NOT implemented, because the live spine
 * (lib/memory-client.js) exposes no operation that can implement them — its
 * surface is recall/ingest/react/getContext/getLiftedFacts/isOnline/stats/
 * preTask/postTask/invalidateRecall. They therefore return ok:false with
 * NOT_IMPLEMENTED. They previously returned ok:true unconditionally, which
 * made a supersession that never happened report success.
 */

const MemoryClientAdapter = require('../adapters/memory-client-wrapper');
const CONTRACT = require('../contract');
const POLICY = require('../policy');

const NOT_IMPLEMENTED = op => ({
  ok: false,
  code: 'NOT_IMPLEMENTED',
  error: `${op} is not supported by the current cognitive spine — `
    + 'lib/memory-client.js exposes no operation that can perform it. '
    + 'Implement it on the spine first; do not report success here.',
});

function makeLayer(name) {
  class Layer {
    constructor(gateway) {
      this.gateway = gateway;
      this.layer = name;
      // One client per layer, built once. The stubs constructed a fresh
      // adapter on every single call.
      this.client = new MemoryClientAdapter(gateway ? gateway.options : {});
    }

    async recall(query, options = {}) {
      const result = await this.client.recall(query, { ...options, layer: name });
      const items = (result && (result.items || result.results || result.memories)) || [];
      return { items: items.map(i => ({ ...i, layer: name })), layer: name };
    }

    async record(memory, options = {}) {
      const enriched = CONTRACT.enrich({ ...memory, layer: name }, options);
      const checked = CONTRACT.validate(enriched);
      if (!checked.ok) {
        return { ok: false, code: 'CONTRACT_VIOLATION', missing: checked.missing, layer: name };
      }
      if (POLICY.retentionPolicy(enriched).days === 0) {
        // ephemeral: session-only, never persisted. Honouring this is the
        // whole point of having a retention policy.
        return { ok: true, persisted: false, reason: 'retention=ephemeral', layer: name };
      }
      const result = await this.client.ingest(enriched.content, {
        layer: name,
        scope: enriched.scope,
        source: enriched.source || options.source,
        importance: enriched.confidence,
      });
      // ingest() returns a memoryId string or null — not a result object.
      // Handle both: raw string (spine v2) and {ok, memoryId} (future contract).
      if (typeof result === 'string') {
        return { ok: true, layer: name, memoryId: result, persisted: result != null };
      }
      if (result == null) {
        return { ok: false, layer: name, memoryId: enriched.memoryId, persisted: false };
      }
      return { ...result, layer: name, memoryId: enriched.memoryId, persisted: result.ok !== false };
    }

    async promote(memoryId, targetLayer) { return { ...NOT_IMPLEMENTED('promote'), memoryId, targetLayer, layer: name }; }
    async supersede(memoryId, newMemoryId) { return { ...NOT_IMPLEMENTED('supersede'), memoryId, newMemoryId, layer: name }; }
    async forget(memoryId) { return { ...NOT_IMPLEMENTED('forget'), memoryId, layer: name }; }

    async health() {
      const h = await this.client.health();
      return { layer: name, ok: h.ok === true, ...h };
    }
  }
  Object.defineProperty(Layer, 'name', { value: `${name}Layer` });
  return Layer;
}

module.exports = makeLayer;
module.exports.NOT_IMPLEMENTED = NOT_IMPLEMENTED;
