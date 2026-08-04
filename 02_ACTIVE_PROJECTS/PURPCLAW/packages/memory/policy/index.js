// packages/memory/policy/index.js
// Memory retention and sensitivity policy
// Enforced by the gateway on every record() call

'use strict';

var RETENTION = {
  ephemeral:   { days: 0,    label: 'session-only, never persisted' },
  short:       { days: 7,    label: 'one week' },
  standard:    { days: 90,   label: 'quarterly review' },
  long:        { days: 365,  label: 'annual review' },
  permanent:   { days: null, label: 'never expire' },
};

var SENSITIVITY = {
  public:      { label: 'shareable with any system' },
  internal:    { label: 'PURPCLAW internal only' },
  confidential: { label: 'operator eyes only' },
  restricted:  { label: 'explicit opt-in required' },
};

function retentionPolicy(memory) {
  return RETENTION[memory.retention] || RETENTION.standard;
}

function sensitivityLevel(memory) {
  return SENSITIVITY[memory.sensitivity] || SENSITIVITY.internal;
}

function shouldExpire(memory) {
  var pol = retentionPolicy(memory);
  if (!pol.days) return false;
  var created = new Date(memory.createdAt || Date.now());
  var expiry = new Date(created.getTime() + pol.days * 86400000);
  return Date.now() > expiry.getTime();
}

module.exports = { RETENTION: RETENTION, SENSITIVITY: SENSITIVITY,
  retentionPolicy: retentionPolicy,
  sensitivityLevel: sensitivityLevel,
  shouldExpire: shouldExpire };
