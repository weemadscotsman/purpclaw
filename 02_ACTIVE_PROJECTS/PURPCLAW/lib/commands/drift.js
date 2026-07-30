'use strict';
// CLI wrapper: purpclaw drift [--fix] [--json]  → lib/drift-watcher.js
async function run(args = []) {
  const dw = require('../drift-watcher.js');
  return dw.once({ fix: args.includes('--fix'), json: args.includes('--json') });
}
module.exports = { run };
