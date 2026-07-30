'use strict';
// Proxy: actual bus lives at ../unified_eventbus (repo root)
const path = require('path');
const bus = require(path.join(__dirname, '..', 'unified_eventbus'));
module.exports = bus;
