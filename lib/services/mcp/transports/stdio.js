'use strict';
/**
 * lib/services/mcp/transports/stdio.js — stdio transport.
 *
 * Speaks MCP over newline-delimited JSON on stdin/stdout. This is
 * the canonical transport for "spawn this server from an MCP host".
 *
 * Wire format:
 *   - host → server: one JSON-RPC message per line on stdin
 *   - server → host: one JSON-RPC message per line on stdout
 *   - server → host logs: stderr (UTF-8, NOT JSON-RPC)
 *
 * 🌵 CACTUS — single-process, low-memory, line-buffered.
 */

const readline = require('readline');
const {
  serializeNdjson,
  makeNdjsonParser,
  success,
  error,
  isBatch,
  isRequest,
  isNotification,
} = require('../jsonrpc');
const { STANDARD_ERROR_CODES, MCP_ERROR_CODES } = require('../../../schema/mcp');

/**
 * Run the server bound to stdin/stdout. Blocks until stdin closes.
 *
 * @param {object} server  - McpServer instance
 * @param {object} opts    - { input, output, errorOutput, sessionId }
 * @returns {Promise<void>}
 */
async function runStdioTransport(server, opts = {}) {
  const input       = opts.input       || process.stdin;
  const output      = opts.output      || process.stdout;
  const errorOutput = opts.errorOutput || process.stderr;
  const sessionId   = opts.sessionId   || 'stdio-1';

  // Outgoing message sender: serialize once, write to stdout, never block.
  const send = (msg) => {
    try { output.write(serializeNdjson(msg)); return true; }
    catch (e) { errorOutput.write(`[mcp-stdio] write failed: ${e.message}\n`); return false; }
  };

  // Build the canonical session. McpServer.createSession wires up
  // lifecycle hooks (session_open, session_close) and tracks the
  // session in the server's session map.
  const session = server.createSession({
    id: sessionId,
    transport: {
      name: 'stdio',
      send,
      close() {},
    },
  });

  errorOutput.write(`[mcp-stdio] session ${session.id} bound to stdin/stdout\n`);

  // Drain a single batch (array of messages) and write a single response
  // batch (or null for an all-notification batch).
  const handleBatch = async (batch) => {
    if (batch.length === 0) {
      send(error(null, STANDARD_ERROR_CODES.INVALID_REQUEST, 'empty batch'));
      return;
    }
    const responses = [];
    for (const msg of batch) {
      if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        responses.push(error(msg && msg.id, STANDARD_ERROR_CODES.INVALID_REQUEST, 'Invalid Request'));
        continue;
      }
      const { response } = await server.dispatch(session, msg);
      if (response) responses.push(response);
    }
    if (responses.length > 0) send(responses);
  };

  const handleSingle = async (msg) => {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      send(error(msg && msg.id, STANDARD_ERROR_CODES.INVALID_REQUEST, 'Invalid Request'));
      return;
    }
    const { response } = await server.dispatch(session, msg);
    if (response) send(response);
  };

  return await new Promise((resolve) => {
    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      let parsed;
      try { parsed = JSON.parse(line); }
      catch (e) {
        send(error(null, STANDARD_ERROR_CODES.PARSE_ERROR, `Parse error: ${e.message}`));
        return;
      }
      try {
        if (isBatch(parsed)) await handleBatch(parsed);
        else                 await handleSingle(parsed);
      } catch (e) {
        errorOutput.write(`[mcp-stdio] dispatch error: ${e.stack || e.message}\n`);
        send(error(parsed.id || null, MCP_ERROR_CODES.INTERNAL_ERROR, e.message));
      }
    });

    rl.on('close', () => {
      errorOutput.write(`[mcp-stdio] stdin closed, tearing down session ${session.id}\n`);
      try { server.destroySession(session.id, 'stdin_closed'); } catch {}
      resolve();
    });
  });
}

module.exports = {
  runStdioTransport,
};
