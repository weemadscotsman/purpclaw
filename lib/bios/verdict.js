'use strict';
/**
 * lib/bios/verdict.js — pure verdict oracle.
 *
 *   verdict(rows, spec) -> enum
 *
 * Inputs are probe rows + the parsed spec. Output is one of:
 *   READY | READY_WITH_DRIFT | DEGRADED_READY | SPEC_INCOMPLETE | NOT_READY | INVALID_PROFILE
 *
 * See docs/spec/BIOS_PROFILES.md §3 for the rule anchors.
 *
 * This file is the truth oracle. The probe runner executes; this function
 * decides. Tests assert this file's output verbatim against the §3 rules.
 */

const STATES = require('./classify').STATES;

const VERDICTS = Object.freeze({
  READY: 'READY',
  READY_WITH_DRIFT: 'READY_WITH_DRIFT',
  DEGRADED_READY: 'DEGRADED_READY',
  SPEC_INCOMPLETE: 'SPEC_INCOMPLETE',
  NOT_READY: 'NOT_READY',
  INVALID_PROFILE: 'INVALID_PROFILE',
});

const CORE_BAD_STATES = new Set([
  STATES.OFFLINE_UNEXPECTED,
  STATES.WRONG_PORT,
  STATES.WRONG_PROTOCOL,
  STATES.AUTH_FAILED,
  STATES.ROUTE_FAILED,
  STATES.HALT,
]);

function isOrphan(row, spec) {
  return !spec.stack.services[row.service_id];
}

function verdict(rows, spec, driftList = []) {
  const rowsSafe = Array.isArray(rows) ? rows : [];
  const driftSafe = Array.isArray(driftList) ? driftList : [];

  // ── 1. SPEC_INCOMPLETE if any probed service is missing from spec ───────
  for (const row of rowsSafe) {
    if (isOrphan(row, spec)) {
      return {
        verdict: VERDICTS.SPEC_INCOMPLETE,
        reason: `orphan service: ${row.service_id}`,
        rows: rowsSafe,
        drift: driftSafe,
      };
    }
  }

  // ── 2. SPEC_INCOMPLETE if any spec-defined service is missing from rows ─
  for (const svcId of Object.keys(spec.stack.services)) {
    if (!rowsSafe.find(r => r.service_id === svcId)) {
      return {
        verdict: VERDICTS.SPEC_INCOMPLETE,
        reason: `spec says ${svcId} but rows have no probe for it`,
        rows: rowsSafe,
        drift: driftSafe,
      };
    }
  }

  const core = rowsSafe.filter(r => spec.stack.services[r.service_id].class === 'core');
  const dark = rowsSafe.filter(r => spec.stack.services[r.service_id].class === 'optional-dark');
  const dep  = rowsSafe.filter(r => spec.stack.services[r.service_id].class === 'deprecated');

  // ── 3. NOT_READY if any core is in a "bad" state ─────────────────────────
  for (const row of core) {
    if (CORE_BAD_STATES.has(row.state)) {
      return {
        verdict: VERDICTS.NOT_READY,
        reason: `core ${row.service_id} is ${row.state}`,
        rows: rowsSafe,
        drift: driftSafe,
      };
    }
  }

  // ── 4. DEGRADED_READY if > 50% optional-dark are down ────────────────────
  if (dark.length) {
    const down = dark.filter(r => r.state === STATES.OFFLINE_INTENTIONAL || r.state === STATES.OFFLINE_UNEXPECTED).length;
    const ratio = down / dark.length;
    if (ratio > 0.5) {
      return {
        verdict: VERDICTS.DEGRADED_READY,
        reason: `${down}/${dark.length} optional-dark services offline`,
        rows: rowsSafe,
        drift: driftSafe,
      };
    }
  }

  // ── 5. READY_WITH_DRIFT if spec drift exists ─────────────────────────────
  if (driftSafe.length) {
    return {
      verdict: VERDICTS.READY_WITH_DRIFT,
      reason: `${driftSafe.length} spec drift(s) noted`,
      rows: rowsSafe,
      drift: driftSafe,
    };
  }

  return {
    verdict: VERDICTS.READY,
    reason: 'all core services online; no drift',
    rows: rowsSafe,
    drift: driftSafe,
  };
}

module.exports = { verdict, VERDICTS };
