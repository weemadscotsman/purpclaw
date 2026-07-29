'use strict';
/**
 * lib/mcp-server.js — Run PURPCLAW as an MCP server over stdio.
 *
 * Codex parity: `codex mcp-server` runs Codex as a stdio MCP server.
 * This module does the same for PURPCLAW.
 *
 * MCP stdio protocol:
 *   - Server reads JSON-RPC requests (one per line, \n-terminated) from stdin
 *   - Server writes JSON-RPC responses (one per line) to stdout
 *   - Notifications (no id) are fire-and-forget
 *
 * Implements MCP protocol version 2024-11-05:
 *   - initialize              — protocol handshake
 *   - tools/list              — enumerate available tools
 *   - tools/call              — invoke a tool (all go through ToolRuntime)
 *   - resources/list          — enumerate resources
 *   - resources/read          — read a resource
 *   - prompts/list            — enumerate prompts
 *   - prompts/get             — get a prompt
 *   - notifications/initialized — client ready signal
 *
 * Permission model:
 *   All tool calls go through ToolRuntime with the canonical permission
 *   evaluator (lib/permission-manager.js). The active profile is set via
 *   the MCP_INITIAL_PROFILE env var (default: 'workspace-read-only').
 *
 * Usage:
 *   MCP_INITIAL_PROFILE=trusted node bin/purpclaw.js mcp-server
 *   MCP_INITIAL_PROFILE=deny-by-default node bin/purpclaw.js mcp-server
 */

// P0-B: Gate MCP builtin tools through ToolRuntime with permission enforcement.
// handleBuiltinTool (raw execSync/readFileSync) is deleted — no more permission bypass.
// Tool name mapping: MCP names → canonical tool names.
const { ToolRuntime } = require('./tool-runtime');
const TOOL_RUNTIME = new ToolRuntime({ permissionProfile: 'standard' });

// Map MCP tool names to canonical tool registry names
const MCP_TO_REGISTRY = {
  bash:            'shell',
  shell:           'shell',
  read_file:       'read',
  write_file:      'write',
  list_directory:  'list',
  file_exists:     'file_exists',
};

// ── Tool registry (canonical — all surfaces use this) ──────────────────────────
const TOOLS = require('./tools');

// ── Permission evaluator (canonical — all surfaces use this) ────────────────────
const PERMISSIONS = require('./permission-manager');

// Active permission profile for this MCP session.
// Default: workspace-read-only — MCP servers should be restricted until
// the operator explicitly upgrades the session profile.
const SESSION_PROFILE = process.env.MCP_INITIAL_PROFILE || 'workspace-read-only';

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

    // P0-B FIX: Route all non-MCP tool calls through the canonical tool registry.
    // Previously handleBuiltinTool used raw execSync('bash ...') and fs.writeFileSync
    // directly — bypassing ToolRuntime entirely: no permission profile, no
    // path-security, no approval queue, no guardrails, no checkpoints.
    // Now dispatch through TOOLS.invoke() which is wrapped by ToolRuntime.
    //
    // Tool-name aliases (MCP-client-friendly names → canonical names):
    //   read          → read_file
    //   write         → write_file
    //   list          → list_directory
    //   exists        → file_exists
    //   shell / bash  → bash
    const ALIASES = {
      read:    'read_file',
      write:   'write_file',
      list:    'list_directory',
      exists:  'file_exists',
      shell:   'bash',
    };
    const canonicalName = ALIASES[name] || name;

    // Pre-permission check using canonical permission evaluator (early deny)
    const permResult = PERMISSIONS.evaluate(SESSION_PROFILE, canonicalName);
    if (permResult.action === 'deny') {
      response(id, {
        content: [{ type: 'text', text: `[permission denied] ${canonicalName} is denied by profile '${SESSION_PROFILE}'` }],
        isError: true,
      });
      return;
    }

    try {
      // P0-B: route through ToolRuntime — permission profile + governance + approval + guardrails
      const result = await TOOL_RUNTIME.invoke(canonicalName, args, {
        permissionProfile: SESSION_PROFILE,
        operatorInitiated: true,
      });
      if (result.ok) {
        response(id, {
          content: [{ type: 'text', text: result.content || result.stdout || '' }],
          isError: false,
        });
      } else {
        response(id, {
          content: [{ type: 'text', text: `[error] ${result.error}` }],
          isError: true,
        });
      }
    } catch (e) {
      response(id, {
        content: [{ type: 'text', text: `[exception] ${e.message}` }],
        isError: true,
      });
    }
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
