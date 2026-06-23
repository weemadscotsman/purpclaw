'use strict';
/**
 * lib/bios/classify.js — pure classifier for a single probe response.
 *
 *   classify({port, response, specRow, latencyMs, error})
 *
 * Returns one of 12 states from STACK_SPEC §3.
 * No IO. No fs. No clock.
 *
 * The classifier is the source of truth for what a probe response means;
 * probe.js feeds it raw http results, the verdict layer reads its output.
 */

const STATES = Object.freeze({
  BOOTING: 'BOOTING',
  ONLINE: 'ONLINE',
  DEGRADED: 'DEGRADED',
  OFFLINE_INTENTIONAL: 'OFFLINE_INTENTIONAL',
  OFFLINE_UNEXPECTED: 'OFFLINE_UNEXPECTED',
  WRONG_PORT: 'WRONG_PORT',
  WRONG_PROTOCOL: 'WRONG_PROTOCOL',
  AUTH_FAILED: 'AUTH_FAILED',
  ROUTE_FAILED: 'ROUTE_FAILED',
  STALE: 'STALE',
  SAFE_MODE: 'SAFE_MODE',
  HALT: 'HALT',
});

/**
 * @param {object} probe
 *   - port:        number, the port the spec says is canonical
 *   - actualPort?: number, the port we actually connected to (same as port unless wrong-port)
 *   - response?:   { status, body, latencyMs }  present on a successful TCP+HTTP attempt
 *   - error?:      { code, message }            present on connect-refused / timeout
 *   - specRow?:    { service_id, port, class, protocol, depends_on, expect_status_in?:[] }
 *   - runTimeMs?:  number, time the process has been up (for STALE detection)
 */
function classify(probe) {
  const { error, response, specRow, port } = probe;

  // ── 1. Connect refused / never heard ────────────────────────────────────
  if (error) {
    if (error.code === 'ECONNREFUSED') {
      // Spec says optional-dark + not-required = intentional offline
      if (specRow && (specRow.class === 'optional-dark' || specRow.class === 'deprecated')) {
        return STATES.OFFLINE_INTENTIONAL;
      }
      return STATES.OFFLINE_UNEXPECTED;
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      // Spec expects a window above the timeout → process too slow = HALT proxy
      if (specRow && specRow.expect_status_in && specRow.expect_status_in.length) {
        return STATES.HALT;
      }
      return STATES.OFFLINE_UNEXPECTED;
    }
    if (error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH') {
      return STATES.WRONG_PORT; // listener up but port mismatched
    }
    return STATES.OFFLINE_UNEXPECTED;
  }

  if (!response) return STATES.BOOTING; // mid-flight capture

  // ── 2. Auth ──────────────────────────────────────────────────────────────
  if (response.status === 401 || response.status === 403) {
    return STATES.AUTH_FAILED;
  }

  // ── 3. HTTP reply present ────────────────────────────────────────────────
  const expect = (specRow && specRow.expect_status_in && specRow.expect_status_in.length)
    ? specRow.expect_status_in
    : [200]; // default = 2xx healthy

  if (response.status >= 200 && response.status < 300) {
    // Status matches the expected set
    if (expect.includes(response.status)) return STATES.ONLINE;
    return STATES.DEGRADED;
  }

  if (response.status >= 300 && response.status < 400) {
    // 3xx = redirect; healthy service might just need /healthz redirected to /
    return STATES.DEGRADED;
  }

  if (response.status === 404) {
    // Some services (e.g. agent-tower) intentionally 404 on / but /health works.
    // We treat 404 as ONLINE only when expected.
    if (expect.includes(404)) return STATES.ONLINE;
    return STATES.ROUTE_FAILED;
  }

  if (response.status >= 500) {
    return STATES.ROUTE_FAILED;
  }

  return STATES.WRONG_PROTOCOL;
}

module.exports = { classify, STATES };
