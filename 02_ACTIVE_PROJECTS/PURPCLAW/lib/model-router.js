'use strict';

/**
 * MODEL ROUTER — delegates to lib/routing-decisions.js
 *
 * All routing decisions now flow through ONE canonical file.
 * This module re-exports the routing-decisions surface so existing
 * consumers (model-router consumers) continue to work without changes.
 */

const RD = require('./routing-decisions');

const LANES       = RD.LANES;
const DEFAULT_LANE = RD.DEFAULT_LANE;

function route(message, opts = {}) {
  return RD.resolve({ message, ...opts });
}

function listLanes() { return RD.listLanes(); }

// Re-export utilities for backward compatibility
const isSpecialist = RD.isSpecialist || (() => false);
const curateCandidates = RD.curateCandidates || ((list) => list);
const FB = RD.FB || {};
const RECOMMENDED = RD.RECOMMENDED || {};
const MODEL_ALIASES = RD.MODEL_ALIASES || {};
const AGENT_LANE_PREFERENCES = RD.AGENT_LANE_PREFERENCES || {};

module.exports = {
  LANES,
  DEFAULT_LANE,
  route,
  listLanes,
  RECOMMENDED,
  isSpecialist,
  curateCandidates,
  FB,
  MODEL_ALIASES,
  AGENT_LANE_PREFERENCES,
};
