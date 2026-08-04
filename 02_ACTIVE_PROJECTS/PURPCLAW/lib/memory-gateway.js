'use strict';
// Compatibility wrapper. The implementation lives in packages/memory; this
// path exists so lib/ callers can migrate one at a time rather than in a
// flag day. Delete it once a repo-wide search shows zero requires of
// './memory-gateway' outside packages/.
module.exports = require('../packages/memory');
