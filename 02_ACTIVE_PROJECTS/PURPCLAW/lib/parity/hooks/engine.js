'use strict';
// Proxy: actual engine lives at ../parity/hooks/engine (repo root)
const path = require('path');
const engine = require(path.join(__dirname, '..', '..', 'parity', 'hooks', 'engine'));
module.exports = engine;
