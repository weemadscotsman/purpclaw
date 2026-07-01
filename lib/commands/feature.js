'use strict';

const path = require('path');

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const capabilities = require(path.join(PURP_DIR, 'lib', 'commands', 'capabilities.js'));
  const normalized = args.length ? args : [];
  return capabilities.run(normalized, ctx);
}

module.exports = { run };
