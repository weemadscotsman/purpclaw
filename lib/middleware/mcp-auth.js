'use strict';
/**
 * lib/middleware/mcp-auth.js — Auth middleware for the MCP HTTP surface.
 *
 * Three layers, pluggable:
 *
 *   1. Shared-secret bearer token (for local dev / LAN deployments)
 *      Header: `authorization: Bearer <token>`
 *      Or:     `x-mcp-token: <token>`
 *
 *   2. Origin allowlist (for browser clients — MCP forbids DNS
 *      rebinding, so the server must reject unexpected origins)
 *      Header: `origin: <url>`
 *
 *   3. Capability check (for admin endpoints — e.g. listing sessions)
 *      Header: `x-mcp-capability: <cap>`   where cap ∈ {admin, read, write}
 *
 * By default, ALL THREE are permissive in development mode and
 * restrictive in production (NODE_ENV=production).
 *
 * 🌵 CACTUS — zero deps, configurable, and quiet (no logs unless asked).
 */

const crypto = require('crypto');

const DEFAULT_DEV_MODE = process.env.NODE_ENV !== 'production';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getToken(opts, req) {
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  if (req.headers && (req.headers['x-mcp-token'] || req.headers['X-Mcp-Token'])) {
    return String(req.headers['x-mcp-token'] || req.headers['X-Mcp-Token']);
  }
  if (req.query && (req.query.token || req.query.access_token)) {
    return String(req.query.token || req.query.access_token);
  }
  return null;
}

function buildAuthMiddleware(opts = {}) {
  const {
    token         = process.env.MCP_AUTH_TOKEN || null,
    allowedOrigins = null,                       // null = no check
    devMode       = DEFAULT_DEV_MODE,
    allowLocalhost = true,
  } = opts;

  return function mcpAuth(req, res, next) {
    // ── Origin check (DNS rebinding defense) ───────────────────
    if (allowedOrigins && allowedOrigins.length) {
      const origin = req.headers && (req.headers.origin || req.headers.Origin);
      if (origin) {
        const ok = allowedOrigins.includes('*') || allowedOrigins.includes(String(origin));
        if (!ok) return deny(res, 403, 'forbidden_origin', { origin });
      }
    }

    // ── Token check (only when configured) ─────────────────────
    if (token) {
      const presented = getToken(opts, req);
      if (!presented) return deny(res, 401, 'missing_token', { hint: 'authorization: Bearer <token>' });
      if (!safeEqual(presented, String(token))) return deny(res, 403, 'bad_token', {});
    }

    // ── Localhost passthrough (loopback is trusted when configured)
    if (allowLocalhost) {
      const remote = (req.socket && req.socket.remoteAddress) || '';
      if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') {
        return next();
      }
    }

    // ── Dev mode short-circuit ────────────────────────────────
    if (devMode && !token && !allowedOrigins) return next();

    return next();
  };
}

function buildCapabilityMiddleware(requiredCapability, opts = {}) {
  const tokensByCapability = opts.tokens || {};
  return function mcpCapability(req, res, next) {
    // If a global MCP_AUTH_TOKEN is set, the same token is accepted
    // for any capability — useful when the surface is behind one
    // reverse proxy. Otherwise require a per-capability token in
    // `x-mcp-capability: <name>` AND `authorization: Bearer <token>`.
    const presented = getToken(opts, req);
    const globalToken = opts.token || process.env.MCP_AUTH_TOKEN;

    if (globalToken && presented && safeEqual(presented, String(globalToken))) {
      return next();
    }

    const cap = req.headers && (req.headers['x-mcp-capability'] || req.headers['X-Mcp-Capability']);
    if (cap && String(cap) === requiredCapability) {
      const capTokens = tokensByCapability[requiredCapability] || [];
      if (capTokens.length === 0) return next();  // open capability
      if (presented && capTokens.some(t => safeEqual(presented, String(t)))) return next();
    }

    return deny(res, 403, 'capability_denied', { required: requiredCapability });
  };
}

function deny(res, status, code, extra = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: code, ...extra }));
}

module.exports = {
  buildAuthMiddleware,
  buildCapabilityMiddleware,
  getToken,
  safeEqual,
  DEFAULT_DEV_MODE,
};
