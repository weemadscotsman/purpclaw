'use strict';

/**
 * services/swarm/task_decomposer.js — SHIM.
 *
 * Canonical home: /task_decomposer.js (project root).
 *
 * This shim exists so the swarm coordinator and any other swarm-local
 * require('./task_decomposer.js') keeps working after the 2026-08-17
 * duplicate reconciliation. The root copy is the original (with the
 * correct relative require paths for /lib/ast-dependency-graph.js and
 * ./agent_routing_matrix.js, both at the project root). The services/swarm
 * copy was a temporary copy made during the missing-organ fix; the
 * shim replaces it now that root is canonical.
 *
 * Test: tests/duplicate_reconcile/test_canonical.js asserts both paths
 * resolve to the same canonical module.
 */
module.exports = require('../../task_decomposer.js');
