'use strict';

/**
 * lib/spine/envelope.js — the single message wrapper.
 *
 * Every dispatch the spine makes — chat, research, kernel, mission, swarm,
 * harness, bigboss — runs through createEnvelope. The envelope carries the
 * same shape everywhere so a job-bridge can match a result back to the
 * originating chat session, and the chat SSE stream can report a
 * consistent terminal status no matter which route produced the work.
 *
 * Status is the only state field; everything else is metadata.
 */

const crypto = require('crypto');

const TERMINAL_STATUSES = new Set([
  'answered',   // route produced a final reply the user should see
  'delegated',   // route spawned a sub-job whose result will bridge back
  'failed',      // route hit 501/429/503/timeout/no-output — card is shown
  'pending',     // route still running, more events will follow
  'no-output',   // route completed cleanly but produced nothing — explicit "no result" card
]);

/**
 * Create a fresh envelope. The optional parentId lets a delegated job link
 * back to the chat session that spawned it.
 *
 * @param {Object} opts
 * @param {string} opts.sessionId  - chat session id (or undefined for system jobs)
 * @param {string} opts.route      - 'chat' | 'research' | 'kernel' | 'mission' | 'swarm' | 'harness' | 'bigboss' | ...
 * @param {string} [opts.userText]  - the raw user input, if this came from a chat message
 * @param {string} [opts.parentId]  - id of the envelope that spawned this one
 */
function createEnvelope({ sessionId = null, route, userText = null, parentId = null, source = 'spine' } = {}) {
  if (!route) throw new Error('envelope requires a route');
  const id = 'env-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  return {
    id,
    parentId,
    sessionId,
    route,
    source,
    userText: userText ? String(userText).slice(0, 8000) : null,
    status: 'pending',          // pending | answered | delegated | failed | no-output
    provider: null,            // 'minimax' | 'nvidia' | 'minimax' | ...
    model: null,
    jobId: null,                // kernel/swarm/mission job id, if route delegated
    error: null,                // {code, message, hint} when status=failed
    errorCode: null,            // 'http_501' | 'timeout' | 'no_output' | 'rate_limit' | 'unavailable'
    timestamps: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    artifacts: {},              // arbitrary: synthesis, sources, partialReply, etc.
  };
}

/**
 * Mutate an envelope: set status + timestamps. Returns the envelope.
 * Validates that status is one of the five terminal values.
 */
function setStatus(env, status, extra = {}) {
  if (!TERMINAL_STATUSES.has(status)) {
    throw new Error(`invalid envelope status: ${status}. Must be one of: ${[...TERMINAL_STATUSES].join(', ')}`);
  }
  env.status = status;
  env.timestamps.updated = new Date().toISOString();
  if (extra.provider) env.provider = extra.provider;
  if (extra.model) env.model = extra.model;
  if (extra.jobId) env.jobId = extra.jobId;
  if (extra.error !== undefined) env.error = extra.error;
  if (extra.errorCode) env.errorCode = extra.errorCode;
  if (extra.artifacts) Object.assign(env.artifacts, extra.artifacts);
  return env;
}

/**
 * Map a raw error / http status into the envelope's terminal state.
 *   - 200, 201, 204                  → answered (with artifacts if provided)
 *   - 501 / 404 / no-handler         → failed (errorCode: 'http_501')
 *   - 429                            → failed (errorCode: 'rate_limit')
 *   - 502 / 503 / 504 / ECONNREFUSED → failed (errorCode: 'unavailable')
 *   - 408 / request-timeout           → failed (errorCode: 'timeout')
 *   - any other 4xx/5xx               → failed
 *   - 200 with empty/null result     → no-output
 *   - explicit delegated object     → delegated
 */
function deriveStatus({ statusCode, body, error }) {
  if (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') return { status: 'failed', errorCode: 'timeout' };
    if (error.code === 'ECONNREFUSED') return { status: 'failed', errorCode: 'unavailable' };
    return { status: 'failed', errorCode: 'unknown', error: { message: error.message || String(error) } };
  }
  if (statusCode === 200 || statusCode === 201 || statusCode === 204) {
    if (body == null) return { status: 'no-output', errorCode: 'no_output' };
    return { status: 'answered' };
  }
  if (statusCode === 501 || statusCode === 404) return { status: 'failed', errorCode: 'http_501' };
  if (statusCode === 429) return { status: 'failed', errorCode: 'rate_limit' };
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) return { status: 'failed', errorCode: 'unavailable' };
  if (statusCode === 408) return { status: 'failed', errorCode: 'timeout' };
  if (statusCode >= 400) return { status: 'failed', errorCode: `http_${statusCode}` };
  return { status: 'failed', errorCode: 'unknown' };
}

module.exports = { createEnvelope, setStatus, deriveStatus, TERMINAL_STATUSES };
