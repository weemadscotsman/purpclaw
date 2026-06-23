'use strict';
/**
 * lib/controllers/mcp.js — Request controllers for the MCP API surface.
 *
 * The transports are mostly self-driving: Streamable HTTP and HTTP+SSE
 * both speak JSON-RPC end-to-end. This controller layer adds the
 * PURPCLAW-specific admin / introspection endpoints that live next
 * to the MCP wire endpoints but aren't part of the protocol:
 *
 *   GET  /mcp/health          — liveness + capability counts
 *   GET  /mcp/sessions        — list active sessions
 *   GET  /mcp/sessions/:id    — session details
 *   POST /mcp/sessions/:id/close  — close a session
 *   GET  /mcp/tools           — full tool catalogue (no pagination)
 *   GET  /mcp/tools/:name     — one tool's def + inputSchema
 *   GET  /mcp/resources       — full resource catalogue
 *   GET  /mcp/resources/:uri  — read a resource inline
 *   GET  /mcp/prompts         — full prompt catalogue
 *   GET  /mcp/prompts/:name   — one prompt's def + arguments
 *   POST /mcp/tools/:name/invoke  — direct invocation (admin/curl)
 *   POST /mcp/roots           — set the host roots (filesystem boundaries)
 *
 * All admin endpoints honor the auth middleware in lib/middleware/mcp-auth.js.
 *
 * 🌵 CACTUS — every endpoint is one screen of code, no bloat.
 */

const { URL } = require('url');
const {
  sharedServer,
  defaultRegistry,
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
} = require('../services/mcp');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function getServer(opts) { return opts.server || sharedServer; }

// ────────────────────────────── handlers ─────────────────────────────────

async function health(req, res, opts = {}) {
  const server = getServer(opts);
  return json(res, 200, {
    ok:           true,
    name:         SERVER_NAME,
    version:      SERVER_VERSION,
    protocol:     PROTOCOL_VERSION,
    sessions:     (opts.sessions || []).length,
    ...server.registry.stats(),
  });
}

function listSessions(req, res, opts = {}) {
  const server = getServer(opts);
  return json(res, 200, { sessions: server.listSessions() });
}

function getSession(req, res, opts = {}) {
  const server = getServer(opts);
  const id = req.params && req.params.id;
  const s  = server.getSession(id);
  if (!s) return json(res, 404, { error: 'session_not_found', id });
  return json(res, 200, s.toJSON());
}

function closeSession(req, res, opts = {}) {
  const server = getServer(opts);
  const id = req.params && req.params.id;
  const ok = server.destroySession(id, 'admin_close');
  if (opts.sessions && opts.sessions.delete) opts.sessions.delete(id);
  return json(res, ok ? 200 : 404, { ok, id });
}

async function listTools(req, res, opts = {}) {
  const server = getServer(opts);
  const out = { tools: [] };
  let cursor;
  do {
    const page = server.registry.listTools({ cursor, pageSize: 500 });
    out.tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return json(res, 200, out);
}

async function getTool(req, res, opts = {}) {
  const server = getServer(opts);
  const name = req.params && req.params.name;
  const all = server.registry.listTools({ pageSize: 10_000 }).tools;
  const t = all.find(x => x.name === name);
  if (!t) return json(res, 404, { error: 'tool_not_found', name });
  return json(res, 200, t);
}

async function listResources(req, res, opts = {}) {
  const server = getServer(opts);
  const out = { resources: [] };
  let cursor;
  do {
    const page = server.registry.listResources({ cursor, pageSize: 500 });
    out.resources.push(...page.resources);
    cursor = page.nextCursor;
  } while (cursor);
  return json(res, 200, out);
}

async function readResource(req, res, opts = {}) {
  const server = getServer(opts);
  const uri = decodeURIComponent((req.params && req.params.uri) || '');
  try {
    const out = await server.registry.readResource(uri, { session: null });
    return json(res, 200, out);
  } catch (e) {
    return json(res, 404, { error: e.code || 'resource_error', message: e.message, uri });
  }
}

async function listPrompts(req, res, opts = {}) {
  const server = getServer(opts);
  const out = { prompts: [] };
  let cursor;
  do {
    const page = server.registry.listPrompts({ cursor, pageSize: 500 });
    out.prompts.push(...page.prompts);
    cursor = page.nextCursor;
  } while (cursor);
  return json(res, 200, out);
}

async function getPrompt(req, res, opts = {}) {
  const server = getServer(opts);
  const name = req.params && req.params.name;
  const all = server.registry.listPrompts({ pageSize: 10_000 }).prompts;
  const p = all.find(x => x.name === name);
  if (!p) return json(res, 404, { error: 'prompt_not_found', name });
  return json(res, 200, p);
}

async function invokeTool(req, res, opts = {}) {
  const server = getServer(opts);
  const name = req.params && req.params.name;
  let body = req.body;
  if (!body && typeof req.on === 'function') {
    // Lazy-collect the body if the framework didn't pre-parse.
    const chunks = [];
    body = await new Promise((resolve) => {
      req.on('data', c => chunks.push(c));
      req.on('end',  () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ __raw: raw }); }
      });
    });
  }
  if (body && body.__raw) return json(res, 400, { error: 'invalid_json', raw: body.__raw });
  try {
    const result = await server.registry.callTool(name, body || {}, { session: null });
    if (Array.isArray(result)) return json(res, 200, { content: result });
    return json(res, 200, result);
  } catch (e) {
    return json(res, e.code === 'TOOL_NOT_FOUND' ? 404 : 500, {
      error: e.code || 'tool_error',
      message: e.message,
      tool: name,
    });
  }
}

async function setRoots(req, res, opts = {}) {
  const server = getServer(opts);
  let body = req.body;
  if (!body && typeof req.on === 'function') {
    const chunks = [];
    body = await new Promise((resolve) => {
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({ __raw: raw }); }
      });
    });
  }
  if (body && body.__raw) return json(res, 400, { error: 'invalid_json', raw: body.__raw });
  if (!Array.isArray(body && body.roots)) return json(res, 400, { error: 'roots must be an array' });
  server.registry.setRoots(body.roots);
  return json(res, 200, { ok: true, count: body.roots.length });
}

// ────────────────────────────── router shape ─────────────────────────────

function buildMcpController(opts = {}) {
  return {
    health:        (req, res) => health(req, res, opts),
    listSessions:  (req, res) => listSessions(req, res, opts),
    getSession:    (req, res) => getSession(req, res, opts),
    closeSession:  (req, res) => closeSession(req, res, opts),
    listTools:     (req, res) => listTools(req, res, opts),
    getTool:       (req, res) => getTool(req, res, opts),
    listResources: (req, res) => listResources(req, res, opts),
    readResource:  (req, res) => readResource(req, res, opts),
    listPrompts:   (req, res) => listPrompts(req, res, opts),
    getPrompt:     (req, res) => getPrompt(req, res, opts),
    invokeTool:    (req, res) => invokeTool(req, res, opts),
    setRoots:      (req, res) => setRoots(req, res, opts),
  };
}

module.exports = {
  buildMcpController,
  // Exported for testing.
  _handlers: { health, listSessions, getSession, closeSession, listTools, getTool, listResources, readResource, listPrompts, getPrompt, invokeTool, setRoots },
};
