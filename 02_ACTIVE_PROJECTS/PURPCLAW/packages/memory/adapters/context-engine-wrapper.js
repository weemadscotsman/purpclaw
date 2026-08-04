// packages/memory/adapters/context-engine-wrapper.js
// Adapter: wraps lib/context-engine.js
// Keeps lib/context-engine.js as the live implementation

'use strict';

const { ContextEngine } = require('../../../lib/context-engine');

class ContextEngineAdapter {
  constructor(options = {}) {
    this.engine = new ContextEngine(options);
  }

  shouldCompress(messages) {
    return this.engine.shouldCompress(messages);
  }

  compress(messages, options) {
    return this.engine.compress(messages, options);
  }
}

module.exports = { ContextEngineAdapter };
