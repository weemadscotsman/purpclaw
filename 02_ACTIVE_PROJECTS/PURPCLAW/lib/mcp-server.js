'use strict';
/**
 * lib/mcp-server.js — Run PURPCLAW as an MCP server over stdio.
 *
 * Codex parity: `codex mcp-server` runs Codex as a stdio MCP server.
 * This module does the same for PURPCLAW.
 *
 * MCP stdio protocol:
 *   - Server reads JSON-RPC requests (one per line) from stdin
 *   - Server writes JSON-RPC responses (one per line) to stdout
 *   - Notifications (no id) are fire-and-forget
 *
 * Implements MCP protocol version 2024-11-05:
 *   - initialize       — protocol handshake
 *   - tools/list       — enumerate available tools
 *   - tools/call       — invoke a tool
 *   - resources/list   — enumerate resources
 *   - resources/read   — read a resource
 *   - prompts/list     — enumerate prompts
 *   - prompts/get      — get a prompt
 *   - notifications/initialized — client ready signal
 *
 * Usage:
 *   node bin/purpclaw.js mcp-server [--strict-config]
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── JSON-RPC line reader ──────────────────────────────────────────────────────

/**
 * Read JSON-RPC messages (one per line, \n-terminated) from stdin.
 * Yields { id, method, params } objects.
 */
function createStdinReader(onMessage, onError) {
  let buffer = '';
  let closed = false;

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        onMessage(msg);
      } catch (e) {
        // Parse error — respond with error if request has id
        onError(e, line);
      }
    }
  });

  process.stdin.on('end', () => { closed = true; });
  process.stdin.resume();
}

/**
 * Send a JSON-RPC response or notification to stdout.
 */
function send(data) {
  process.stdout.write(JSON.stringify(data) + '\n');
}

// ── JSON-RPC response helpers ────────────────────────────────────────────────

function response(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function error(id, code, message, data) {
  const err = { jsonrpc: '2.0', id, error: { code, message } };
  if (data !== undefined) err.error.data = data;
  send(err);
}

function notification(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

// ── Protocol constants ────────────────────────────────────────────────────────

const INTERNAL_ERROR      = -32603;
const INVALID_REQUEST     = -32600;
const METHOD_NOT_FOUND    = -32601;
const INVALID_PARAMS      = -32602;
const PARSE_ERROR         = -32700;

const MCP_PROTOCOL_VERSION = '2024-11-05';

// ── Tool registry (lazy-loaded) ──────────────────────────────────────────────

let _toolDefs   = null;
let _toolsReady = false;

async function ensureTools() {
  if (_toolsReady) return;
  _toolDefs = [];
  try {
    // Load MCP client tools
    const mcp = require('./mcp');
    await mcp.loadServers();
    const mcpTools = mcp.listTools();
    _toolDefs.push(...mcpTools);
  } catch (e) {
    // MCP load failed — no-op
  }
  _toolsReady = true;
}

// ── Request handlers ──────────────────────────────────────────────────────────

const handlers = {

  async initialize(id, params) {
    // Respond with server capabilities
    await ensureTools();
    const caps = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools:    { listChanged: true },
        resources: { subscribe: false, listChanged: false },
        prompts:  { listChanged: false },
      },
      serverInfo: {
        name:    'purpclaw',
        version: require('../package.json').version || '0.1.0',
      },
    };
    response(id, caps);
    // Send notifications/initialized to signal we're ready
    notification('notifications/initialized', {});
  },

  async 'tools/list'(id) {
    await ensureTools();
    response(id, {
      tools: _toolDefs.map(t => ({
        name:        t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      })),
    });
  },

  async 'tools/call'(id, params) {
    await ensureTools();
    const { name, arguments: args = {} } = params;
    if (!name) { error(id, INVALID_PARAMS, 'tools/call requires `name`'); return; }

    // Parse mcp__server__tool name format
    const parts = name.split('__');
    if (parts.length === 3 && parts[0] === 'mcp') {
      const [, serverName, toolName] = parts;
      try {
        const mcp = require('./mcp');
        const result = await mcp.callMcpTool(serverName, toolName, args);
        if (!result.ok) {
          response(id, {
            content: [{ type: 'text', text: `[error] ${result.error}` }],
            isError: true,
          });
        } else {
          response(id, {
            content: [{ type: 'text', text: result.content || '' }],
            isError: false,
          });
        }
      } catch (e) {
        response(id, {
          content: [{ type: 'text', text: `[exception] ${e.message}` }],
          isError: true,
        });
      }
      return;
    }

    // Built-in tools (simple subset)
    const builtinResults = handleBuiltinTool(name, args);
    response(id, builtinResults);
  },

  async 'resources/list'(id) {
    await ensureTools();
    response(id, {
      resources: [],
    });
  },

  async 'resources/read'(id, params) {
    error(id, METHOD_NOT_FOUND, 'resources/read not implemented');
  },

  async 'prompts/list'(id) {
    await ensureTools();
    response(id, { prompts: [] });
  },

  async 'prompts/get'(id, params) {
    error(id, METHOD_NOT_FOUND, 'prompts/get not implemented');
  },
};

// ── Built-in tool handler (subset of PURPCLAW tools) ─────────────────────────

function handleBuiltinTool(name, args) {
  const results = [];
  try {
    switch (name) {
      case 'bash':
      case 'shell': {
        const { command } = args;
        if (!command) throw new Error('missing required arg: command');
        const { execSync } = require('child_process');
        const out = execSync(command, { encoding: 'utf-8', stdio: 'pipe', timeout: 30000 });
        results.push({ type: 'text', text: out || '(no output)' });
        break;
      }
      case 'read_file': {
        const { path: filePath, offset, limit } = args;
        if (!filePath) throw new Error('missing required arg: path');
        const content = fs.readFileSync(filePath, 'utf-8');
        results.push({ type: 'text', text: content.slice(offset || 0, (limit || 1000) + (offset || 0)) });
        break;
      }
      case 'write_file': {
        const { path: filePath, content } = args;
        if (!filePath || content === undefined) throw new Error('missing required args: path, content');
        fs.writeFileSync(filePath, content, 'utf-8');
        results.push({ type: 'text', text: `wrote ${content.length} bytes to ${filePath}` });
        break;
      }
      case 'list_directory': {
        const { path: dirPath } = args;
        const dir = dirPath || '.';
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const text = entries.map(e => `${e.isDirectory() ? 'd' : '-'}  ${e.name}`).join('\n');
        results.push({ type: 'text', text: text || '(empty)' });
        break;
      }
      case 'file_exists': {
        const { path: filePath } = args;
        results.push({ type: 'text', text: fs.existsSync(filePath) ? 'true' : 'false' });
        break;
      }
      default:
        results.push({ type: 'text', text: `[unknown tool: ${name}]` });
    }
  } catch (e) {
    results.length = 0;
    results.push({ type: 'text', text: `[error] ${e.message}` });
  }
  return { content: results, isError: results.length && results[0].type === 'text' && results[0].text.startsWith('[error]') };
}

// ── Main dispatch loop ────────────────────────────────────────────────────────

function main() {
  let initialized = false;

  createStdinReader(
    async (msg) => {
      const { id, method, params, jsonrpc } = msg;

      // Validate JSON-RPC version
      if (jsonrpc !== '2.0') {
        error(id, INVALID_REQUEST, 'Invalid JSON-RPC version');
        return;
      }

      // Handle initialize specially (must be first)
      if (method === 'initialize') {
        await handlers.initialize(id, params);
        initialized = true;
        return;
      }

      // Require initialize before any other method
      if (!initialized) {
        error(id, INVALID_REQUEST, 'Server not initialized — send initialize first');
        return;
      }

      const handler = handlers[method];
      if (!handler) {
        error(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
        return;
      }

      try {
        await handler(id, params);
      } catch (e) {
        error(id, INTERNAL_ERROR, `Internal error: ${e.message}`);
      }
    },
    (err, line) => {
      // Parse error
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) {
          error(msg.id, PARSE_ERROR, `Parse error: ${err.message}`);
        }
      } catch {
        // Couldn't extract id — just log
        if (process.stderr.writable) {
          process.stderr.write(`[mcp-server] parse error: ${err.message}\n`);
        }
      }
    }
  );
}

main();
