/**
 * Shared constants for PURPCLAW Studio modules.
 * Centralises the ROOT path so lib/studio.js and lib/erosion.js agree.
 */

'use strict';
var path = require('path');

// Resolve relative to this file's location
var ROOT = path.resolve(path.join(__dirname, '..'));

module.exports = { ROOT: ROOT };
