'use strict';
/**
 * lib/routes/mcp.js — HTTP route mount points for MCP.
 *
 * Wires the Streamable HTTP transport and the legacy HTTP+SSE
 * transport to a single Express-style router (or any router with the
 * standard `app.use`/`.get`/`.post`/`.delete` shape).
 *
 * The router is plug-and-play: drop it under any base path and the
 * MCP server is reachable at:
 *
 *   POST    /mcp            (Streamable HTTP — primary)
 *   GET     /mcp            (Streamable HTTP — open notification stream)
 *   DELETE  /mcp            (Streamable HTTP — close session)
 *   GET     /mcp/sse        (legacy HTTP+SSE)
 *   POST    /mcp/messages   (legacy HTTP+SSE)
 *   GET     /mcp/health     (liveness — for the gateway's /health route)
 *
 * If the host uses raw http.Server (no router), the function
 * `mountOnHttpServer` is exported for direct use.
 *
 * 🌵 CACTUS — minimal, no framework lock-in.
 */

const path = require('path');
const {
  sharedServer,
  defaultRegistry,
  transports,
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
} = require('../services/mcp');

const SESSION_HEADER = 'mcp-session-id';

/**
 * Build a router-shaped object (Express-compatible). Caller is
 * expected to mount it where they want it.
 *
 * @param {object} opts - { server, sessions, allowedOrigins, basePath, logger }
 */
function buildMcpRouter(opts = {}) {
  const server        = opts.server        || sharedServer;
  const sessions      = opts.sessions      || new Map();
  const allowedOrigins = opts.allowedOrigins || null;
  const basePath      = opts.basePath      || '/mcp';
  const logger        = opts.logger        || (() => {});

  const streamableHandler = transports.streamableHttp().createStreamableHttpHandler(server, {
    sessions, logger, allowedOrigins,
  });
  const ssePair = transports.sse().createSseHandler(server, {
    logger, allowedOrigins, basePath,
  });

  // Express-style handler adapter: (req, res) → Response
  const adapt = (fetchHandler) => async (req, res) => {
    try {
      // Build a fetch Request from the Node IncomingMessage.
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach(x => headers.append(k, x));
        else if (v != null)   headers.set(k, String(v));
      }
      let body = null;
      if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'OPTIONS') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        body = Buffer.concat(chunks);
      }
      const fetchReq = new Request(`http://${req.headers.host || 'localhost'}${req.originalUrl || req.url}`, {
        method: req.method,
        headers,
        body,
        duplex: 'half',
      });
      const fetchRes = await fetchHandler(fetchReq);
      res.statusCode = fetchRes.status;
      fetchRes.headers.forEach((v, k) => { res.setHeader(k, v); });
      if (fetchRes.body) {
        const reader = fetchRes.body.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
      }
      res.end();
    } catch (e) {
      logger('mcp-router', e);
      try {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: e.message || 'Internal error' },
        }));
      } catch {}
    }
  };

  return {
    // ── Streamable HTTP (primary) ────────────────────────────────────
    handlePost:   adapt((req) => req.method === 'POST'   ? streamableHandler(req) : new Response('Method not allowed', { status: 405 })),
    handleGet:    adapt((req) => req.method === 'GET'    ? streamableHandler(req) : new Response('Method not allowed', { status: 405 })),
    handleDelete: adapt((req) => req.method === 'DELETE' ? streamableHandler(req) : new Response('Method not allowed', { status: 405 })),
    handleOptions: adapt(streamableHandler),

    // ── Legacy HTTP+SSE (compat) ─────────────────────────────────────
    handleSse:     adapt(ssePair.sse),
    handleMessages: adapt(ssePair.post),

    // ── Health / introspection ───────────────────────────────────────
    handleHealth: (req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        protocol: PROTOCOL_VERSION,
        sessions: sessions.size,
        ...defaultRegistry.stats(),
      }));
    },

    // Mount on an Express app at the given base path. The function
    // mutates the app argument. Example:
    //
    //   const app = express();
    //   mountMcpRouter(app, { basePath: '/mcp' });
    mount: (app, mountOpts = {}) => {
      const base = mountOpts.basePath || basePath;
      app.post(base,    adapt(streamableHandler));
      app.get(base,     adapt(streamableHandler));
      app.delete(base,  adapt(streamableHandler));
      app.options(base, adapt(streamableHandler));
      app.get(`${base}/sse`,      adapt(ssePair.sse));
      app.post(`${base}/messages`, adapt(ssePair.post));
      app.get(`${base}/health`,   (req, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          name: SERVER_NAME,
          version: SERVER_VERSION,
          protocol: PROTOCOL_VERSION,
          sessions: sessions.size,
          ...defaultRegistry.stats(),
        }));
      });
    },

    // Direct mount on a raw http.Server.
    mountOnHttpServer: (httpServer, mountOpts = {}) => {
      const base = mountOpts.basePath || basePath;
      transports.streamableHttp().mountOnHttpServer(httpServer, base, server, { sessions, logger, allowedOrigins });
      // SSE legacy routes
      httpServer.on('request', async (req, res) => {
        if (!req.url) return;
        if (req.url.startsWith(`${base}/sse`)) {
          await adapt(ssePair.sse)(req, res);
        } else if (req.url.startsWith(`${base}/messages`)) {
          await adapt(ssePair.post)(req, res);
        }
      });
    },

    // Expose internals for testing / advanced wiring.
    _internal: { server, sessions, streamableHandler, ssePair },
  };
}

/**
 * Drop-in Express mount: `app.use('/mcp', buildMcpRouter())` — but
 * flattened, since MCP endpoints live at the base, not under it.
 */
function mcpRoutes(opts = {}) {
  return buildMcpRouter(opts);
}

module.exports = {
  buildMcpRouter,
  mcpRoutes,
  SESSION_HEADER,
};
