'use strict';
/**
 * lib/services/mcp/index.js — MCP service barrel.
 *
 * Public surface used by transports, routes, and middleware.
 *
 * 🌵 CACTUS — keep imports shallow.
 */

const { McpServer, McpSession } = require('./server');
const { CapabilityRegistry, registry: defaultRegistry, opaqueCursor, decodeCursor } = require('./registry');
const {
  request, notification, success, error, serializeNdjson, encodeSseEvent,
  makeNdjsonParser, isRequest, isNotification, isResponse, isBatch,
  makeError,
} = require('./jsonrpc');
const schema = require('../../schema/mcp');

// Lazy transport requires so consumers only pay for what they use.
function loadStdioTransport()       { return require('./transports/stdio'); }
function loadStreamableHttpTransport(){ return require('./transports/streamable-http'); }
function loadSseTransport()          { return require('./transports/sse'); }

// Shared server instance — singletons are how CACTUS survives scarcity.
const sharedServer = new McpServer();

module.exports = {
  // Core
  McpServer,
  McpSession,
  CapabilityRegistry,
  defaultRegistry,
  opaqueCursor,
  decodeCursor,
  sharedServer,

  // JSON-RPC helpers
  request,
  notification,
  success,
  error,
  serializeNdjson,
  encodeSseEvent,
  makeNdjsonParser,
  isRequest,
  isNotification,
  isResponse,
  isBatch,
  makeError,

  // Schema constants
  PROTOCOL_VERSION: schema.PROTOCOL_VERSION,
  SERVER_NAME:      schema.SERVER_NAME,
  SERVER_VERSION:   schema.SERVER_VERSION,
  MCP_ERROR_CODES:  schema.MCP_ERROR_CODES,
  STANDARD_ERROR_CODES: schema.STANDARD_ERROR_CODES,
  LOG_LEVELS:       schema.LOG_LEVELS,

  // Transports (lazy)
  transports: {
    stdio: loadStdioTransport,
    streamableHttp: loadStreamableHttpTransport,
    sse: loadSseTransport,
  },
};
