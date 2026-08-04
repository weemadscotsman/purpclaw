'use strict';
/**
 * lib/mcp.js — Model Context Protocol (MCP) client integration.
 *
 * The MCP SDK lets any tool server expose itself via JSON-RPC over
 * stdio. We spawn each server as a tracked child, then surface its
 * tools through the regular ToolRegistry so the agent loop can call
 * them like any other tool.
 *
 * Config (E:/tmp/.purpclaw/mcp.json or ~/.config/purpclaw/mcp.json):
 *   {
 *     "servers": {
 *       "filesystem": {
 *         "command": "npx",
 *         "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
 *       },
 *       "github": {
 *         "command": "npx",
 *         "args": ["-y", "@modelcontextprotocol/server-github"],
 *         "env": { "GITHUB_TOKEN": "..." }
 *       }
 *     }
 *   }
 *
 * Usage:
 *   const mcp = require('./mcp');
 *   await mcp.loadServers();
 *   const tools = mcp.listTools();   // MCP tool defs in ToolRegistry format
 *   const result = await mcp.callTool('filesystem', 'read_file', { path: '/tmp/foo' });
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// PURP_DIR — used for NODE_PATH when spawning MCP server child processes
const PURP_DIR = path.resolve(__dirname, '..');

let _client = null;
let _transport = null;
const _servers = new Map();      // name → { config, process, transport, tools }
const _tools   = [];              // flat list of { server, name, description, inputSchema }
const _resources = [];
const _prompts = [];
let _loaded = false;

function configPaths() {
  // Search order:
  //  1. $PURPCLAW_MCP_CONFIG env
  //  2. ./.purpclaw/mcp.json  (cwd-relative)
  //  3. ~/.config/purpclaw/mcp.json
  //  4. ~/.purpclaw/mcp.json
  const paths = [];
  if (process.env.PURPCLAW_MCP_CONFIG) paths.push(process.env.PURPCLAW_MCP_CONFIG);
  paths.push(path.resolve(process.cwd(), '.purpclaw', 'mcp.json'));
  paths.push(path.join(os.homedir(), '.config', 'purpclaw', 'mcp.json'));
  paths.push(path.join(os.homedir(), '.purpclaw', 'mcp.json'));
  return paths.filter(p => { try { return fs.existsSync(p); } catch { return false; } });
}

function findConfig() {
  const paths = configPaths();
  return paths.length ? paths[0] : null;
}

function readConfig() {
  const cfg = findConfig();
  if (!cfg) return { servers: {} };
  try {
    const j = JSON.parse(fs.readFileSync(cfg, 'utf-8'));
    return j && typeof j === 'object' && j.servers ? j : { servers: {} };
  } catch (e) {
    console.error(`[mcp] failed to parse ${cfg}: ${e.message}`);
    return { servers: {} };
  }
}

/**
 * Connect to all configured MCP servers. Each server is spawned as a
 * tracked child (so we get the same lifecycle guarantees as the rest
 * of the runtime). Tools are listed via the standard `tools/list` call.
 */
async function loadServers(opts = {}) {
  if (_loaded) return { count: _servers.size, tools: _tools.length };

  // Auto-generate mcp.json config if omnicode platform is detected and no config exists
  try {
    const omnicodeBridge = require('./omnicode-bridge');
    const bridgeStatus = omnicodeBridge.getBridgeStatus();
    if (bridgeStatus.ok && bridgeStatus.capabilities.builtServerAvailable) {
      if (!findConfig()) {
        const localConfigPath = path.resolve(process.cwd(), '.purpclaw', 'mcp.json');
        const configDir = path.dirname(localConfigPath);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(localConfigPath, JSON.stringify({
          servers: {
            omnicode: {
              command: 'node',
              args: [bridgeStatus.capabilities.mcpServer]
            }
          }
        }, null, 2), 'utf-8');
      }
    }
  } catch (e) {
    // Ignore bridge/auto-generation errors
  }

  _loaded = true;
  const config = readConfig();
  const serversMap = { ...(config.servers || {}) };

  // Fallback auto-discovery at runtime (in case mcp.json config doesn't have it, e.g. custom user config)
  try {
    const omnicodeBridge = require('./omnicode-bridge');
    const bridgeStatus = omnicodeBridge.getBridgeStatus();
    if (bridgeStatus.ok && bridgeStatus.capabilities.builtServerAvailable) {
      if (!serversMap['omnicode']) {
        serversMap['omnicode'] = {
          command: 'node',
          args: [bridgeStatus.capabilities.mcpServer],
        };
      }
    }
  } catch (e) {}

  const requested = Array.isArray(opts.servers) && opts.servers.length ? new Set(opts.servers) : null;
  const entries = Object.entries(serversMap).filter(([name]) => !requested || requested.has(name));
  if (!entries.length) return { count: 0, tools: 0 };

  // MCP SDK is the only runtime dep we need. If it's not installed,
  // we silently skip — the user can still use the rest of the agent.
  let Client = null, StdioClientTransport = null;
  try {
    ({ Client } = require('@modelcontextprotocol/sdk/client/index.js'));
    ({ StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js'));
  } catch (e) {
    console.error('[mcp] @modelcontextprotocol/sdk not installed; skipping MCP servers');
    return { count: 0, tools: 0 };
  }

  for (const [name, server] of entries) {
    if (server.enabled === false) continue;
    if (!server.command) {
      console.error(`[mcp] ${name}: no command specified`);
      continue;
    }
    try {
      // StdioClientTransport owns the child process. Spawning another copy
      // here leaked duplicate servers and broke deterministic shutdown.
      const env = {
        ...process.env,
        ...(server.env || {}),
        // Give child processes access to PURPCLAW's node_modules (e.g. @modelcontextprotocol/sdk)
        NODE_PATH: server.env && server.env.NODE_PATH
          ? `${server.env.NODE_PATH}${path.delimiter}${path.join(PURP_DIR, 'node_modules')}`
          : path.join(PURP_DIR, 'node_modules'),
      };
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env,
      });
      const client = new Client({ name: 'purpclaw', version: '0.1.0' }, { capabilities: {} });
      await client.connect(transport);
      // Discover tools
      let tools = [];
      try {
        const result = await client.listTools();
        tools = result.tools || [];
      } catch (e) {
        console.error(`[mcp] ${name}: tools/list failed: ${e.message}`);
      }
      let resources = [], prompts = [];
      try { resources = (await client.listResources()).resources || []; } catch {}
      try { prompts = (await client.listPrompts()).prompts || []; } catch {}
      _servers.set(name, { config: server, transport, client, tools, resources, prompts });
      for (const t of tools) {
        _tools.push({
          server: name,
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        });
      }
      for (const resource of resources) _resources.push({ server: name, ...resource });
      for (const prompt of prompts) _prompts.push({ server: name, ...prompt });
    } catch (e) {
      console.error(`[mcp] ${name}: failed to connect: ${e.message}`);
    }
  }
  return { count: _servers.size, tools: _tools.length };
}

function listServers() {
  return [..._servers.entries()].map(([name, s]) => ({
    name,
    command: s.config.command,
    args: s.config.args || [],
    toolCount: s.tools.length,
    tools: s.tools.map(t => t.name),
    resourceCount: s.resources?.length || 0,
    promptCount: s.prompts?.length || 0,
  }));
}

function status() {
  const config = readConfig();
  return Object.entries(config.servers || {}).map(([name, value]) => {
    const live = _servers.get(name);
    return { name, enabled: value.enabled !== false, connected: Boolean(live), command: value.command,
      args: value.args || [], toolCount: live?.tools?.length || 0, resourceCount: live?.resources?.length || 0,
      promptCount: live?.prompts?.length || 0, tools: live?.tools?.map(tool => tool.name) || [] };
  });
}

async function reload(opts = {}) { await shutdown(); return loadServers(opts); }

function listTools() {
  // Return as ToolRegistry-compatible tool defs. Each MCP tool becomes
  // a tool named "mcp_<server>_<tool>" so it doesn't collide with
  // built-in tools.
  return _tools.map(t => ({
    name: `mcp__${t.server}__${t.name}`,
    description: `[mcp:${t.server}] ${t.description}`,
    inputSchema: t.inputSchema,
    mcp: { server: t.server, tool: t.name },
  }));
}
function listResources(server) { return _resources.filter(item => !server || item.server === server); }
function listPrompts(server) { return _prompts.filter(item => !server || item.server === server); }
async function readResource(serverName, uri) { const server=_servers.get(serverName);if(!server)throw new Error(`unknown MCP server: ${serverName}`);return server.client.readResource({uri}); }
async function getPrompt(serverName, name, args={}) { const server=_servers.get(serverName);if(!server)throw new Error(`unknown MCP server: ${serverName}`);return server.client.getPrompt({name,arguments:args}); }

async function callMcpTool(serverName, toolName, args) {
  const server = _servers.get(serverName);
  if (!server) return { ok: false, error: `unknown MCP server: ${serverName}` };
  try {
    const result = await server.client.callTool({ name: toolName, arguments: args || {} });
    // MCP returns { content: [{ type: 'text', text: '...' }, ...], isError? }
    const text = (result.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    return { ok: !result.isError, content: text, raw: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function shutdown() {
  for (const [name, server] of _servers) {
    try { await server.client.close(); } catch {}
  }
  _servers.clear();
  _tools.length = 0;
  _resources.length = 0;
  _prompts.length = 0;
  _loaded = false;
}

module.exports = {
  loadServers,
  listServers,
  listTools,
  callMcpTool,
  listResources,
  listPrompts,
  readResource,
  getPrompt,
  shutdown,
  findConfig,
  readConfig,
  status,
  reload,
};
