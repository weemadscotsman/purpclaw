'use strict';
/**
 * lib/services/mcp/transports/stdio.js
 *
 * Stdio JSON-RPC transport — used when MCP runs as a CLI subprocess
 * (e.g. `node bin/mcp-stdio.js`). Reads newline-delimited JSON-RPC
 * frames from stdin, writes responses to stdout.
 *
 * Spec: https://modelcontextprotocol.io (2025-06-18 §stdio transport)
 *
 * 🤖 ROBOT — line-buffered, NDJSON, clean SIGTERM/SIGINT handling.
 */

const { McpServer } = require('../mcp');

/**
 * Start a stdio MCP server. Returns a handle with `.stop()`.
 *
 * @param {object} opts
 * @param {McpServer} [opts.server] — server instance (defaults to sharedServer)
 * @param {NodeJS.ReadableStream} [opts.input]  — defaults to process.stdin
 * @param {NodeJS.WritableStream} [opts.output] — defaults to process.stdout
 * @param {NodeJS.WritableStream} [opts.error]  — defaults to process.stderr
 * @param {(line:string)=>void}   [opts.logger]
 */
function startStdioServer(opts = {}) {
  const server = opts.server || require('../mcp').sharedServer;
  const input  = opts.input  || process.stdin;
  const output = opts.output || process.stdout;
  const error  = opts.error  || process.stderr;
  const logger = opts.logger || ((tag, e) => {
    try { error.write(`[mcp-stdio ${tag}] ${e && e.stack ? e.stack : String(e)}\n`); } catch {}
  });

  let buf = '';
  let stopping = false;

  function writeFrame(frame) {
    try {
      output.write(JSON.stringify(frame) + '\n');
    } catch (e) {
      logger('write', e);
    }
  }

  async function processLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let frame;
    try {
      frame = JSON.parse(trimmed);
    } catch (e) {
      writeFrame({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
      return;
    }
    try {
      const response = await server.handle(frame, { transport: 'stdio' });
      if (response !== null && response !== undefined) writeFrame(response);
    } catch (e) {
      logger('handle', e);
      writeFrame({
        jsonrpc: '2.0',
        id: (frame && frame.id) ?? null,
        error: { code: -32603, message: e.message || 'internal error' },
      });
    }
  }

  function onData(chunk) {
    if (stopping) return;
    buf += chunk.toString('utf-8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      processLine(line);
    }
  }

  function stop(reason = 'manual') {
    if (stopping) return;
    stopping = true;
    try { input.removeListener('data', onData); } catch {}
    try { input.pause(); } catch {}
    logger('stop', reason);
  }

  input.on('data', onData);
  input.on('end',  () => stop('stdin_end'));
  input.on('error', (e) => logger('stdin', e));

  // Graceful shutdown
  const onSignal = (sig) => { stop(sig); process.exit(0); };
  process.once('SIGINT',  () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  return { stop, server };
}

module.exports = { startStdioServer };
