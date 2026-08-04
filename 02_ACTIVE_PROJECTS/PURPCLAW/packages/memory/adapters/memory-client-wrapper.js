// packages/memory/adapters/memory-client-wrapper.js
// Adapter: wraps lib/memory-client.js as a packages/ import
// Keeps lib/memory-client.js as the live implementation
// Wrapper removed only after zero callers remain in lib/

'use strict';

const legacy = require('../../../lib/memory-client');

class MemoryClientAdapter {
  constructor(options = {}) {
    this.options = options;
  }

  async recall(query, options = {}) {
    if (typeof legacy.recall === 'function') {
      return legacy.recall(query, options);
    }
    return { items: [] };
  }

  async ingest(content, options = {}) {
    if (typeof legacy.ingest === 'function') {
      return legacy.ingest(content, options);
    }
    return { ok: true };
  }

  async health() {
    if (typeof legacy.health === 'function') {
      return legacy.health();
    }
    return { ok: true };
  }
}

module.exports = MemoryClientAdapter;
