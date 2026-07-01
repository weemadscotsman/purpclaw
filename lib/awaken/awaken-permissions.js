'use strict';

/**
 * lib/awaken/awaken-permissions.js
 * Permission tiers per mode — defines what the loop can do.
 * Safe defaults: no destructive writes, all reads allowed.
 */

const MODES = {
  watch: {
    label:  'Watch',
    colour: '\x1b[32m',   // green
    reads:  true,
    safe_writes: false,
    auto_research: false,
    companion_reactions: true,
    propose: false,
    patch_docs: false,
    patch_code: false,
    delete_anything: false,
    apply_evolve: false,
  },
  work: {
    label:  'Work',
    colour: '\x1b[33m',   // yellow
    reads:  true,
    safe_writes: true,    // docs, audit reports, evidence, queue updates
    auto_research: false,
    companion_reactions: true,
    propose: true,
    patch_docs: true,
    patch_code: false,
    delete_anything: false,
    apply_evolve: false,
  },
  monster: {
    label:  'Monster',
    colour: '\x1b[31m',   // red
    reads:  true,
    safe_writes: true,
    auto_research: true,  // donor candidates, evolve proposals
    companion_reactions: true,
    propose: true,
    patch_docs: true,
    patch_code: false,    // still no silent code mutations
    delete_anything: false,
    apply_evolve: false,  // requires explicit operator approval
  },
  ritual: {
    label:  'Ritual',
    colour: '\x1b[35m',   // magenta
    reads:  true,
    safe_writes: true,
    auto_research: false,
    companion_reactions: true,
    propose: false,
    patch_docs: false,
    patch_code: false,
    delete_anything: false,
    apply_evolve: false,
  },
};

const ALL_MODES = Object.keys(MODES);

// Risk classification for actions
const ACTION_RISK = {
  read_docs:        'safe',
  read_services:    'safe',
  read_queues:      'safe',
  write_audit:      'safe',
  write_evidence:   'safe',
  write_timeline:   'safe',
  write_report:     'safe',
  patch_docs:       'low',
  queue_update:     'low',
  propose_audit:    'low',
  propose_donor:    'low',
  propose_evolve:   'medium',
  auto_research:    'medium',
  patch_code:       'high',     // requires approval even in monster mode
  delete_files:     'high',     // requires approval
  apply_evolve:    'high',     // requires approval
};

function getMode(name) {
  const mode = MODES[name];
  if (!mode) throw new Error(`Unknown awaken mode: ${name}. Options: ${ALL_MODES.join(', ')}`);
  return mode;
}

function canDo(modeName, action) {
  const mode = getMode(modeName);
  if (action === 'read') return true;  // all modes can read
  if (action === 'safe_write') return mode.safe_writes;
  if (action === 'auto_research') return mode.auto_research;
  if (action === 'propose') return mode.propose;
  if (action === 'patch_docs') return mode.patch_docs;
  if (action === 'patch_code') return mode.patch_code;
  if (action === 'companion_reactions') return mode.companion_reactions;
  if (action === 'apply_evolve') return mode.apply_evolve;
  return false;
}

// Returns 'safe' | 'low' | 'medium' | 'high' | 'blocked'
function actionRisk(action) {
  return ACTION_RISK[action] || 'unknown';
}

// Returns true if an action requires approval regardless of mode
function requiresApproval(action) {
  return ACTION_RISK[action] === 'high';
}

// Actions that are always blocked regardless of mode
const ALWAYS_BLOCKED = new Set([
  'delete_secrets',
  'patch_credentials',
  'apply_code_without_approval',
  'remove_audit_trail',
]);

function isBlocked(action) {
  return ALWAYS_BLOCKED.has(action);
}

module.exports = {
  MODES,
  ALL_MODES,
  getMode,
  canDo,
  actionRisk,
  requiresApproval,
  isBlocked,
};
