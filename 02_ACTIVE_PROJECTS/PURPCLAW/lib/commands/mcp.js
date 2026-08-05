const PURP_PATHS = require('../paths');
// lib/commands/mcp.js — MCP server management CLI
// Codex parity: `codex mcp` subcommand (list/get/add/remove/login/logout)
// 'use strict' already enforced by parent

const mcp  = require('../mcp');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Config helpers ─────────────────────────────────────────────────────────────

const CONFIG_DIR  = () => path.join(PURP_PATHS.DATA_ROOT);
const CONFIG_FILE = () => path.join(CONFIG_DIR(), 'mcp.json');

function readConfig() {
  const f = CONFIG_FILE();
  try {
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf-8'));
      return j && typeof j === 'object' ? j : { servers: {} };
    }
  } catch {}
  return { servers: {} };
}

function writeConfig(cfg) {
  const dir = CONFIG_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2), 'utf-8');
}

// ── Auth helpers (keytar-style env-var storage) ────────────────────────────────

const AUTH_FILE = () => path.join(CONFIG_DIR(), 'mcp-auth.json');

function readAuth() {
  const f = AUTH_FILE();
  try {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {}
  return {};
}

function writeAuth(auth) {
  const dir = AUTH_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_FILE(), JSON.stringify(auth, null, 2), 'utf-8');
}

const AUTH_DIR = () => path.join(PURP_PATHS.DATA_ROOT);

// ── Usage ──────────────────────────────────────────────────────────────────────

const HELP = `
Usage: purpclaw mcp <subcommand> [options]

MCP server management. Config stored at ~/.purpclaw/mcp.json

Subcommands:
  list             List configured servers (--json for machine output)
  get <name>       Show server config (--json for raw JSON)
  add <name> ...   Add a server (see examples below)
  remove <name>    Remove a server from config
  login <name>     Authenticate with an MCP server (OAuth or env var)
  logout <name>    Remove stored credentials for a server
  tools [name]     List tools from all servers or a specific server
  resources [name]  List resources from all servers or a specific server
  status           Health check all loaded servers
  reload           Shutdown and restart all MCP servers

Add examples:
  purpclaw mcp add myserver -- node /path/to/server.js
  purpclaw mcp add myserver -- npx -y @modelcontextprotocol/server-filesystem /tmp
  purpclaw mcp add httpServer --url https://example.com/mcp
  purpclaw mcp add httpServer --url https://example.com/mcp --bearer-token-env-var API_TOKEN
  purpclaw mcp add myserver -- node /path/to/server.js --env MY_VAR=value --env OTHER=secret
`.trim();

// ── Main dispatch ─────────────────────────────────────────────────────────────

module.exports = {
  run(args, ctx) {
    const sub = (args[0] || 'list').toLowerCase();
    switch (sub) {
      case 'list':
      case 'ls':
        return listServers(args.includes('--json'));
      case 'get':
        return getServer(args[1], args.includes('--json'));
      case 'add':
        return addServer(args.slice(1));
      case 'remove':
      case 'rm':
      case 'delete':
        return removeServer(args[1]);
      case 'login':
        return loginServer(args[1]);
      case 'logout':
        return logoutServer(args[1]);
      case 'tools':
        return listTools(args[1]);
      case 'resources':
      case 'res':
        return listResources(args[1]);
      case 'status':
        return serverStatus();
      case 'reload':
      case 'restart':
        return reloadServers(ctx);
      case 'info':
        return serverInfo(args[1]);
      case 'help':
      case '--help':
      case '-h':
        console.log(HELP);
        return;
      default:
        if (sub === args[0]) {
          // Could be `mcp <name>` shorthand for get
          return getServer(args[0], false);
        }
        console.error('Unknown subcommand: ' + sub);
        console.log(HELP);
    }
  },
};

// ── list ──────────────────────────────────────────────────────────────────────

function listServers(asJson) {
  const cfg    = readConfig();
  const status = mcp.status();
  const servers = Object.entries(cfg.servers || {});

  if (!servers.length) {
    if (asJson) {
      console.log('[]');
    } else {
      console.log('No MCP servers configured. Add servers with: purpclaw mcp add <name> ...');
    }
    return;
  }

  if (asJson) {
    const entries = servers.map(([name, cfg]) => {
      const st = status.find(s => s.name === name) || {};
      return { name, ...cfg, connected: st.connected || false };
    });
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log('\n MCP Servers (' + servers.length + '):\n');
  for (const [name, cfg] of servers) {
    const st = status.find(s => s.name === name)
      || { connected: false, toolCount: 0 };
    const connMark = st.connected ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
    const transport = cfg.url ? 'HTTP: ' + cfg.url : 'stdio: ' + (cfg.command || '');
    console.log('  ' + connMark + '  \x1b[36m' + name + '\x1b[0m');
    console.log('       ' + transport + '  (' + st.toolCount + ' tools)');
  }
  console.log('');
}

// ── get ───────────────────────────────────────────────────────────────────────

function getServer(name, asJson) {
  if (!name) {
    console.error('Usage: purpclaw mcp get <name> [--json]');
    return;
  }
  const cfg = readConfig();
  const servers = cfg.servers || {};
  if (!servers[name]) {
    console.error('Server not found: ' + name);
    const available = Object.keys(servers);
    if (available.length) console.error('Available: ' + available.join(', '));
    return;
  }
  if (asJson) {
    console.log(JSON.stringify({ name, ...servers[name] }, null, 2));
  } else {
    const st = (mcp.status() || []).find(s => s.name === name) || {};
    console.log('\n Server: \x1b[36m' + name + '\x1b[0m');
    console.log(' Transport: ' + (servers[name].url ? 'streamable-http' : 'stdio'));
    if (servers[name].url) console.log(' URL: ' + servers[name].url);
    else console.log(' Command: ' + servers[name].command + ' ' + (servers[name].args || []).join(' '));
    if (servers[name].args && !servers[name].url) {
      console.log(' Args: ' + servers[name].args.join(' '));
    }
    if (servers[name].env) {
      const envKeys = Object.keys(servers[name].env);
      console.log(' Env vars: ' + envKeys.join(', '));
    }
    if (servers[name].bearerTokenEnv) {
      console.log(' Bearer token: from env $' + servers[name].bearerTokenEnv);
    }
    console.log(' Connected: ' + (st.connected ? '\x1b[32myes\x1b[0m' : '\x1b[31mno\x1b[0m'));
    console.log(' Tools: ' + (st.toolCount || 0));
    console.log('');
  }
}

// ── add ───────────────────────────────────────────────────────────────────────

function addServer(args) {
  if (!args.length || args[0] === 'help' || args[0] === '--help') {
    console.log(HELP);
    return;
  }

  const name = args[0];
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error('Invalid server name: ' + name + ' (use letters, numbers, - and _ only)');
    return;
  }

  // Parse --url, --bearer-token-env-var, --env, and -- (stdio args)
  const remaining = args.slice(1);
  let url          = null;
  let bearerEnv   = null;
  let stdioArgs   = null;
  let envMap      = {};

  const dashIdx = remaining.indexOf('--');
  const urlIdx  = remaining.indexOf('--url');
  const bearerIdx = remaining.indexOf('--bearer-token-env-var');

  if (urlIdx >= 0 && (dashIdx < 0 || urlIdx < dashIdx)) {
    // HTTP transport
    url = remaining[urlIdx + 1];
    if (!url) {
      console.error('--url requires a URL argument');
      return;
    }
    // Check for bearer-token-env-var after url
    const btIdx = remaining.indexOf('--bearer-token-env-var');
    if (btIdx >= 0) {
      bearerEnv = remaining[btIdx + 1];
      if (!bearerEnv || bearerEnv.startsWith('--')) {
        console.error('--bearer-token-env-var requires an environment variable name');
        return;
      }
    }
    // Parse --env KEY=VALUE from remaining
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === '--env' && i + 1 < remaining.length) {
        const kv = remaining[i + 1];
        const eqIdx = kv.indexOf('=');
        if (eqIdx > 0) {
          envMap[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
        }
        i++;
      }
    }
  } else if (dashIdx >= 0) {
    // Stdio transport
    stdioArgs = remaining.slice(dashIdx + 1);
    if (!stdioArgs.length) {
      console.error('Usage: purpclaw mcp add <name> -- <command> [args...]');
      return;
    }
    // Parse --env from before the --
    for (let i = 0; i < dashIdx; i++) {
      if (remaining[i] === '--env' && i + 1 < dashIdx) {
        const kv = remaining[i + 1];
        const eqIdx = kv.indexOf('=');
        if (eqIdx > 0) {
          envMap[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
        }
        i++;
      }
    }
  } else {
    // Guess: treat remaining as stdio args without explicit --
    // Accept both `mcp add name -- cmd` and `mcp add name cmd` style
    if (remaining.length && !remaining[0].startsWith('--')) {
      stdioArgs = remaining;
    } else {
      console.error('Usage: purpclaw mcp add <name> -- <command> [args...]');
      console.error('   or: purpclaw mcp add <name> --url <url> [--bearer-token-env-var VAR]');
      return;
    }
  }

  const cfg = readConfig();
  if (!cfg.servers) cfg.servers = {};

  if (cfg.servers[name]) {
    console.error('Server already exists: ' + name + ' (use purpclaw mcp remove ' + name + ' first)');
    return;
  }

  let entry;
  if (url) {
    entry = { url };
    if (bearerEnv) entry.bearerTokenEnv = bearerEnv;
    if (Object.keys(envMap).length) entry.env = envMap;
  } else {
    entry = {
      command: stdioArgs[0],
      args: stdioArgs.slice(1),
    };
    if (Object.keys(envMap).length) entry.env = envMap;
  }

  cfg.servers[name] = entry;
  writeConfig(cfg);
  console.log('\x1b[32m+\x1b[0m  Added \x1b[36m' + name + '\x1b[0m to \x1b[2m' + CONFIG_FILE() + '\x1b[0m');

  // Auto-attempt login if OAuth-based (URL transport with no explicit auth = check)
  if (url && !bearerEnv) {
    console.log('\n  Run \x1b[1mpurpclaw mcp login ' + name + '\x1b[0m to authenticate.\n');
  } else if (url && bearerEnv) {
    console.log('  Bearer token will be read from $' + bearerEnv + ' at runtime.\n');
  }
}

// ── remove ───────────────────────────────────────────────────────────────────

function removeServer(name) {
  if (!name) {
    console.error('Usage: purpclaw mcp remove <name>');
    return;
  }
  const cfg = readConfig();
  if (!cfg.servers || !cfg.servers[name]) {
    console.error('Server not found: ' + name);
    return;
  }
  delete cfg.servers[name];
  writeConfig(cfg);
  console.log('\x1b[32m-\x1b[0m  Removed \x1b[36m' + name + '\x1b[0m from config');

  // Also clear auth
  const auth = readAuth();
  if (auth[name]) {
    delete auth[name];
    writeAuth(auth);
    console.log('  Cleared stored credentials for \x1b[36m' + name + '\x1b[0m');
  }
  console.log('');
}

// ── login ─────────────────────────────────────────────────────────────────────

function loginServer(name) {
  if (!name) {
    console.error('Usage: purpclaw mcp login <name>');
    return;
  }
  const cfg = readConfig();
  const servers = cfg.servers || {};
  if (!servers[name]) {
    console.error('Server not found: ' + name + '. Add it first with purpclaw mcp add ' + name + ' ...');
    return;
  }
  const srv = servers[name];

  if (!srv.url) {
    console.error('Login is only supported for HTTP transport servers (added with --url).');
    console.error('For stdio servers, use --env KEY=VALUE when adding the server.');
    return;
  }

  if (srv.bearerTokenEnv) {
    // Check if the env var exists
    const token = process.env[srv.bearerTokenEnv];
    if (!token) {
      console.error('Bearer token env var $' + srv.bearerTokenEnv + ' is not set.');
      console.error('Set it with: export ' + srv.bearerTokenEnv + '=<your-token>');
      return;
    }
    // Save token to auth file
    const auth = readAuth();
    auth[name] = { type: 'bearer', token };
    writeAuth(auth);
    console.log('\x1b[32m+\x1b[0m  Logged in to \x1b[36m' + name + '\x1b[0m (bearer token from $' + srv.bearerTokenEnv + ')');
  } else {
    // Full OAuth flow — would need browser + local server callback
    // For now, prompt for bearer token
    console.log('OAuth login requires browser authentication.');
    console.log('');
    console.log('Quick auth: provide a bearer token now, or set PURPCLAW_MCP_TOKEN env var.');
    console.log('');
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Bearer token: ', token => {
      rl.close();
      if (token.trim()) {
        const auth = readAuth();
        auth[name] = { type: 'bearer', token: token.trim() };
        writeAuth(auth);
        console.log('\x1b[32m+\x1b[0m  Logged in to \x1b[36m' + name + '\x1b[0m');
      } else {
        console.log('No token provided — login cancelled.');
      }
    });
  }
}

// ── logout ────────────────────────────────────────────────────────────────────

function logoutServer(name) {
  if (!name) {
    console.error('Usage: purpclaw mcp logout <name>');
    return;
  }
  const auth = readAuth();
  if (!auth[name]) {
    console.log('No stored credentials for \x1b[36m' + name + '\x1b[0m');
    return;
  }
  delete auth[name];
  writeAuth(auth);
  console.log('\x1b[32m-\x1b[0m  Logged out \x1b[36m' + name + '\x1b[0m (credentials cleared)');
}

// ── tools ─────────────────────────────────────────────────────────────────────

function listTools(server) {
  const allTools = mcp.listTools();
  const byServer = {};
  for (const t of allTools) {
    const s = t.mcp ? t.mcp.server : 'unknown';
    if (server && s !== server) continue;
    if (!byServer[s]) byServer[s] = [];
    byServer[s].push(t);
  }
  const servers = server ? { [server]: byServer[server] || [] } : byServer;

  if (!Object.keys(servers).length) {
    console.log(server ? 'No tools for server: ' + server : 'No MCP tools loaded.');
    return;
  }

  for (const [srv, tools] of Object.entries(servers)) {
    console.log('\n \x1b[36m' + srv + '\x1b[0m (' + tools.length + ' tools):');
    for (const t of tools) {
      const name = t.mcp ? t.mcp.tool : t.name;
      console.log('  \x1b[33m' + name + '\x1b[0m  ' + (t.description || '').split('\n')[0].slice(0, 60));
    }
  }
  console.log('');
}

// ── resources ─────────────────────────────────────────────────────────────────

function listResources(server) {
  const all = mcp.listResources(server);
  if (!all.length) {
    console.log(server ? 'No resources for: ' + server : 'No MCP resources loaded.');
    return;
  }
  const byServer = {};
  for (const r of all) {
    const s = r.server || 'unknown';
    if (!byServer[s]) byServer[s] = [];
    byServer[s].push(r);
  }
  const servers = server ? { [server]: byServer[server] || [] } : byServer;
  for (const [srv, resources] of Object.entries(servers)) {
    console.log('\n \x1b[36m' + srv + '\x1b[0m (' + resources.length + ' resources):');
    for (const r of resources) {
      console.log('  \x1b[32m' + r.uri + '\x1b[0m  ' + (r.description || ''));
    }
  }
  console.log('');
}

// ── status ────────────────────────────────────────────────────────────────────

function serverStatus() {
  const all = mcp.status();
  if (!all.length) {
    console.log('No MCP servers configured.');
    return;
  }
  console.log('\n MCP Server Health:\n');
  for (const st of all) {
    const mark = st.connected ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
    console.log('  ' + mark + '  \x1b[36m' + st.name + '\x1b[0m  (' + (st.toolCount || 0) + ' tools)');
  }
  console.log('');
}

// ── reload ────────────────────────────────────────────────────────────────────

async function reloadServers(ctx) {
  console.log(' Reloading MCP servers...');
  try {
    await mcp.reload();
    const st = mcp.status();
    console.log(' \x1b[32m✔\x1b[0m  Reloaded — ' + st.filter(s => s.connected).length + '/' + st.length + ' servers connected');
  } catch (err) {
    console.error(' \x1b[31m✖\x1b[0m  Reload failed: ' + err.message);
  }
}

// ── info (alias) ───────────────────────────────────────────────────────────────

function serverInfo(name) {
  return getServer(name, false);
}
