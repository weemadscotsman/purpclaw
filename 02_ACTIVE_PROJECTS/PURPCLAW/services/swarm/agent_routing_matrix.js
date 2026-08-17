'use strict';

/**
 * services/swarm/agent_routing_matrix.js — SHIM.
 *
 * Canonical home: /agent_routing_matrix.js (project root).
 *
 * This shim exists so the swarm coordinator and any other swarm-local
 * require('./agent_routing_matrix.js') keeps working after the
 * 2026-08-17 duplicate reconciliation. The root copy is byte-identical
 * to what was here; we just deleted the duplicate to enforce a single
 * source of truth.
 *
 * Test: tests/duplicate_reconcile/test_canonical.js asserts both paths
 * resolve to the same canonical module.
 */
module.exports = require('../../agent_routing_matrix.js');
