// packages/memory/contract/index.js
// Memory contract: mandatory field schema for every memory object
// All seven layers must emit objects matching this contract

'use strict';

const REQUIRED = ['memoryId', 'layer', 'content', 'createdAt'];

const OPTIONAL_WITH_DEFAULTS = {
  scope: 'task',
  sessionId: null,
  taskId: null,
  runId: null,
  provenance: [],
  confidence: 1.0,
  verificationState: 'unverified',
  validFrom: null,
  validUntil: null,
  supersedes: null,
  sensitivity: 'internal',
  retention: 'standard',
};

function validate(memory) {
  const missing = REQUIRED.filter(function(k) { return !(k in memory); });
  if (missing.length) return { ok: false, missing: missing };
  return { ok: true };
}

function enrich(memory, options) {
  options = options || {};
  var result = {};
  var k;
  for (k in OPTIONAL_WITH_DEFAULTS) result[k] = OPTIONAL_WITH_DEFAULTS[k];
  for (k in memory) result[k] = memory[k];
  for (k in options) result[k] = options[k];
  return result;
}

module.exports = { REQUIRED: REQUIRED, OPTIONAL_WITH_DEFAULTS: OPTIONAL_WITH_DEFAULTS, validate: validate, enrich: enrich };
