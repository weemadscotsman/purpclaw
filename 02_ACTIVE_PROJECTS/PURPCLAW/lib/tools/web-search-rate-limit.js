'use strict';
/**
 * lib/tools/web-search-rate-limit.js
 *
 * In-process rate limiter for the web_search tool.
 * Default: 30 requests per 60-second rolling window per process.
 *
 * Used by lib/tools/index.js web_search tool to prevent hammering upstream services.
 * In multi-process Next.js/PM2 environments each worker has its own counter —
 * for cluster-wide limits, swap to a Redis-backed store.
 */

const RATE_LIMIT = parseInt(process.env.WEB_SEARCH_RATE_LIMIT || '30', 10);
const WINDOW_MS = parseInt(process.env.WEB_SEARCH_WINDOW_MS || '60000', 10);

// Rolling window: { count, windowStart }
let state = { count: 0, windowStart: Date.now() };

function allow() {
  const now = Date.now();
  // Reset window if expired
  if (now - state.windowStart >= WINDOW_MS) {
    state = { count: 0, windowStart: now };
  }
  if (state.count >= RATE_LIMIT) {
    const retryAfterMs = WINDOW_MS - (now - state.windowStart);
    return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
  }
  state.count++;
  return { allowed: true, retryAfterMs: 0 };
}

function reset() {
  state = { count: 0, windowStart: Date.now() };
}

function status() {
  const now = Date.now();
  if (now - state.windowStart >= WINDOW_MS) {
    return { count: 0, limit: RATE_LIMIT, windowMs: WINDOW_MS, resetInMs: 0 };
  }
  return {
    count: state.count,
    limit: RATE_LIMIT,
    windowMs: WINDOW_MS,
    resetInMs: WINDOW_MS - (now - state.windowStart),
  };
}

module.exports = { allow, reset, status, RATE_LIMIT, WINDOW_MS };
