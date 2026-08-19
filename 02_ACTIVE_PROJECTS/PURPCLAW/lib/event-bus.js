'use strict';
// Proxy: actual bus lives at ../unified_eventbus (repo root).
//
// This MUST be a literal relative require. It previously used
//   require(path.join(__dirname, '..', 'unified_eventbus'))
// which Node resolves fine, but bundlers cannot analyse statically — Next.js
// failed the build with "Module not found: Can't resolve './ROOT/unified_eventbus'",
// so every API route that reached this proxy returned HTTP 500. That is why the
// Web UI chat 500'd while the CLI worked: a surface-parity break caused purely
// by an unanalysable import path.
const bus = require('../unified_eventbus');
module.exports = bus;
