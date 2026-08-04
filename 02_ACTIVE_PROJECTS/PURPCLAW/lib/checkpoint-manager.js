// CJS shim for the ESM checkpoint-manager.mjs
// lib/tool-runtime.js and lib/agent-gateway.js do require('./checkpoint-manager')
// which Node resolves as .js first. The actual implementation is in .mjs (ESM).
// This shim wraps the async import in a thenable so callers can use it synchronously.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const _promise = import(pathToFileURL(path.join(__dirname, 'checkpoint-manager.mjs')));

// Thenable wrapper — resolves when imported, chainable by callers
const shim = {
  then: (resolve, reject) => _promise.then(m => resolve(m.checkpointManager || m.default)).catch(reject),
  catch: (reject) => _promise.catch(reject),
};

// Also attach resolved accessors once loaded
let _cm = null;
_promise.then(m => { _cm = m.checkpointManager || m.default; });

// Proxy that defers to _cm once resolved, for sync accessors
const proxy = new Proxy(shim, {
  get(t, p) {
    if (_cm && typeof _cm[p] === 'function') {
      return _cm[p].bind(_cm);
    }
    if (_cm && _cm[p] !== undefined) return _cm[p];
    if (p === 'then' || p === 'catch') return Reflect.get(t, p);
    return () => _cm && _cm[p];
  },
  has(t, p) { return _cm ? p in _cm : true; },
});

module.exports = proxy;
