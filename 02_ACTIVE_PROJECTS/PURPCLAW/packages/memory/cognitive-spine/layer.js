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
// Durable file-backed archive — the persistence floor under the volatile spine.
const ARCHIVE = (() => { try { return require('../../../lib/memory-store'); } catch { return null; } })();

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
      const live = (result && (result.items || result.results || result.memories)) || [];

      // Union with the durable archive. The spine's matrix is volatile —
      // working/scratch entries decay and it boots with "No readable archive
      // found" — so spine-only recall silently forgot everything. The archive
      // is the floor; the spine still contributes associative/emotional hits.
      let durable = [];
      try {
        durable = ARCHIVE.recall({ query, layers: [name], limit: options.limit || 5 }).items || [];
      } catch { /* archive unavailable — degrade to spine-only, never throw */ }

      const seen = new Set();
      const items = [...live, ...durable]
        .map(i => ({ ...i, layer: name }))
        .filter(i => {
          const key = String(i.content ?? i.text ?? '').slice(0, 200);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return { items, layer: name, durableCount: durable.length, liveCount: live.length };
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
      // The spine's ingest() signature is ingest(content: str). Envelope content
      // is usually an object ({text: '...'}), and posting an object where a
      // string was expected meant nothing usable was ever stored. Flatten to
      // text here, at the boundary, rather than letting each caller guess.
      const contentText = typeof enriched.content === 'string'
        ? enriched.content
        : (enriched.content && (enriched.content.text || enriched.content.summary))
          || (() => { try { return JSON.stringify(enriched.content); } catch { return String(enriched.content); } })();
      // Write to the durable archive FIRST. If the spine is down, decays, or
      // returns a sentinel, the memory still exists on disk and is recallable.
      let durableId = null;
      if (ARCHIVE) {
        try {
          const d = ARCHIVE.record({ ...enriched, layer: name, content: contentText });
          if (d && d.ok) durableId = d.memoryId;
        } catch { /* never let archiving break the turn */ }
      }

      const result = await this.client.ingest(contentText, {
        layer: name,
        scope: enriched.scope,
        source: enriched.source || options.source,
        importance: enriched.confidence,
      });
      // ingest() returns a memoryId string or null — not a result object.
      // Handle both: raw string (spine v2) and {ok, memoryId} (future contract).
      // 'no_base' is a spine SENTINEL (base matrix unavailable), not an id —
      // treating it as one is how this reported persisted:true while storing
      // nothing. Durable success stands on its own regardless of the spine.
      const spineOk = typeof result === 'string' ? result !== 'no_base' : result != null && result.ok !== false;
      const spineId = typeof result === 'string' ? (result === 'no_base' ? null : result) : (result && result.memoryId) || null;
      return {
        ok: spineOk || !!durableId,
        layer: name,
        memoryId: spineId || durableId || enriched.memoryId,
        persisted: spineOk || !!durableId,
        durable: !!durableId,
        spine: spineOk ? 'stored' : 'unavailable',
      };
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
