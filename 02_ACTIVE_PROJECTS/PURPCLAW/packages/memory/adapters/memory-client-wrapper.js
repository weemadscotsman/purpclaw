'use strict';
/**
 * Adapter over lib/memory-client.js — the live cognitive spine client (:7880).
 *
 * lib/memory-client.js stays the implementation; this only gives packages/
 * a stable surface to import. Remove the adapter once no lib/ caller talks to
 * memory-client directly.
 */

const legacy = require('../../../lib/memory-client');

class MemoryClientAdapter {
  constructor(options = {}) {
    this.options = options;
  }

  async recall(query, options = {}) {
    return legacy.recall(query, options);
  }

  async ingest(content, options = {}) {
    return legacy.ingest(content, options);
  }

  /**
   * Real health, not a shrug. The previous version probed for a `health`
   * method, did not find one — memory-client exposes isOnline/degraded/stats,
   * not health — and returned {ok:true} on the fallback path. That reported a
   * healthy spine whenever the spine was unreachable, which is the exact
   * failure mode the proof ledger exists to catch.
   */
  async health() {
    const online = await legacy.isOnline();
    const degraded = typeof legacy.degraded === 'function' ? legacy.degraded() : null;
    return {
      ok: online === true && !degraded,
      online: online === true,
      degraded: degraded || null,
      port: legacy.PORT,
    };
  }
}

module.exports = MemoryClientAdapter;
