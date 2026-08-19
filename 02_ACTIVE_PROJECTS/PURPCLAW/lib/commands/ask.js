'use strict';
/**
 * lib/commands/ask.js — the open-source coding-agent CLI surface.
 *
 *   purpclaw ask "explain the auth flow"
 *   purpclaw ask --provider ollama --model qwen2.5:3b "write tests"
 *   echo "explain this" | purpclaw ask
 *   purpclaw ask --tui "let's refactor"
 *
 * This is the Claude Code-style entry point. It runs the agent loop,
 * streams tokens, renders tool calls, and exits when done.
 *
 * Slash commands (typed in interactive mode):
 *   /model <name>      — switch model
 *   /provider <name>   — switch provider
 *   /tools             — list available tools
 *   /mcp               — list MCP servers
 *   /clear             — clear conversation history
 *   /help              — show slash commands
 *   /quit              — exit
 */

const fs   = require('fs');
const path = require('path');
const { runAgent, buildSystemPrompt, AGENT_TOOLS } = require('../agent-loop');
const TOOLS = require('../tools');

// MCP integration: load servers on startup, wire their tools into
// the ToolRegistry, expose a single mcp() call function.
let _mcp = null;
async function ensureMcp() {
  if (_mcp) return _mcp;
  _mcp = require('../mcp');
  await _mcp.loadServers();
  TOOLS.__registerMcpTools(_mcp.listTools(), (server, tool, args) => _mcp.callMcpTool(server, tool, args));
  return _mcp;
}

const SLASH_COMMANDS = {
  '/bigboss':  { description: 'Big Boss meta-commands. usage: /bigboss <cmd> [args]',  run: async (args, ctx) => {
    const bb = require('../commands/bigboss');
    const [cmd, ...rest] = args.trim().split(/\s+/);
    const out = await bb.run(cmd || 'help', rest.join(' '));
    ctx.lastSlashResult = out;
    return out;
  } },
  '/model':    { description: 'switch model. usage: /model <name>  |  /model (shows current)', 
    run: (args, ctx) => {
      const name = args.trim();
      if (!name) return `current model: ${ctx.model || process.env.LLM_MODEL || 'auto'}`;
      ctx.model = name;
      return `model → ${name}`;
    } 
  },
  '/provider': { description: 'switch provider. usage: /provider <name>  |  /provider (shows current)', 
    run: (args, ctx) => {
      const name = args.trim().toLowerCase();
      if (!name) return `current provider: ${ctx.provider || process.env.LLM_PROVIDER || 'ollama'}`;
      const PROVIDERS = ['openai','anthropic','gemini','github-models','codex','codex-oauth','ollama','lmstudio','openrouter','groq','deepseek','kimi','together','mistral','minimax','atomic-chat','custom'];
      if (!PROVIDERS.includes(name)) return `unknown provider: ${name}\n  available: ${PROVIDERS.join(', ')}`;
      ctx.provider = name;
      if (!ctx.model) ctx.model = null; // let provider pick default
      return `provider → ${name}`;
    } 
  },
  '/tools':    { description: 'list available tools (built-in + MCP)',  run: () => {
    const all = TOOLS.list();
    const builtin = all.filter(t => !t.name.startsWith('mcp__') && !['parseltongue','autotune','stm','godmode'].includes(t.name));
    const mcp = all.filter(t => t.name.startsWith('mcp__'));
    const g0d = all.filter(t => ['parseltongue','autotune','stm','godmode'].includes(t.name));
    const C = (s) => `\x1b[36m${s}\x1b[0m`; const M = (s) => `\x1b[35m${s}\x1b[0m`; const G = (s) => `\x1b[32m${s}\x1b[0m`; const D = (s) => `\x1b[90m${s}\x1b[0m`;
    let out = `${all.length} tools total\n`;
    out += `\n${C('built-in')} (${builtin.length}): ` + builtin.map(t => t.name).join(', ') + '\n';
    if (g0d.length) out += `\n${M('G0DM0D3')} (${g0d.length}): ` + g0d.map(t => t.name).join(', ') + '\n';
    if (mcp.length) out += `\n${G('MCP')} (${mcp.length}): ` + mcp.slice(0, 10).map(t => t.name.replace('mcp__omnicode__', '')).join(', ') + (mcp.length > 10 ? ` ${D('+' + (mcp.length - 10) + ' more')}` : '') + '\n';
    return out;
  } },
  '/mcp':      { description: 'list MCP servers and their tools',       run: async () => {
    try {
      const mcp = require('../mcp');
      await mcp.loadServers();
      const servers = mcp.listServers();
      if (!servers.length) return '  no MCP servers configured.\n  config: .purpclaw/mcp.json or ~/.config/purpclaw/mcp.json\n  format: { "servers": { "<name>": { "command": "...", "args": [...], "env": {...} } } }';
      return servers.map(s => `  \x1b[32m${s.name}\x1b[0m: ${s.toolCount} tools\n    cmd: ${s.command} ${(s.args || []).join(' ')}\n    tools: ${s.tools.join(', ')}`).join('\n');
    } catch { return '  MCP server not available'; }
  } },
  '/agents':   { description: 'list available swarm agents',          run: async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(require('path').resolve(__dirname, '..', '..'), 'skills');
      const dirs = fs.readdirSync(dir).filter(d => { try { return fs.statSync(path.join(dir, d)).isDirectory(); } catch { return false; } });
      const divisions = {};
      for (const d of dirs) {
        const am = path.join(dir, d, 'AGENT.md');
        let div = 'UNKNOWN';
        if (fs.existsSync(am)) {
          const c = fs.readFileSync(am, 'utf-8');
          const m = c.match(/division:\s*(\S+)/i);
          if (m) div = m[1].toUpperCase();
        }
        if (!divisions[div]) divisions[div] = [];
        divisions[div].push(d);
      }
      return Object.entries(divisions).map(([div, agents]) =>
        `  \x1b[35m${div}\x1b[0m (${agents.length}): ${agents.slice(0, 8).join(', ')}${agents.length > 8 ? ' +' + (agents.length - 8) : ''}`
      ).join('\n') + `\n  \x1b[90mtotal: ${dirs.length} agents\x1b[0m`;
    } catch { return '  could not read agent index'; }
  } },
  '/clear':    { description: 'clear conversation history',           run: (args, ctx) => { ctx.history.length = 0; return '\x1b[33mhistory cleared\x1b[0m'; } },
  '/save':     { description: 'save session to file. usage: /save <name>  (default: last-session)', run: (args, ctx) => {
    try {
      const name = args.trim() || 'last-session';
      const fs = require('fs');
      const path = require('path');
      const sessionsDir = path.join(require('os').homedir(), '.purpclaw', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      const data = JSON.stringify({ history: ctx.history, provider: ctx.provider, model: ctx.model, savedAt: new Date().toISOString() });
      fs.writeFileSync(path.join(sessionsDir, `${name}.json`), data);
      return `session saved as "${name}" (${data.length} bytes)`;
    } catch (e) { return `save failed: ${e.message}`; }
  } },
  '/load':     { description: 'load session from file. usage: /load <name>  (default: last-session)', run: (args, ctx) => {
    try {
      const name = args.trim() || 'last-session';
      const fs = require('fs');
      const path = require('path');
      const file = path.join(require('os').homedir(), '.purpclaw', 'sessions', `${name}.json`);
      if (!fs.existsSync(file)) return `no saved session "${name}"`;
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      ctx.history = data.history || [];
      if (data.provider) ctx.provider = data.provider;
      if (data.model) ctx.model = data.model;
      return `session "${name}" loaded (${(data.history || []).length} messages)`;
    } catch (e) { return `load failed: ${e.message}`; }
  } },
  '/cost':     { description: 'show token / cost usage',              run: (args, ctx) => {
    // Track tokens per session — basic counter
    const t = ctx._tokens || { prompt: 0, completion: 0, calls: 0 };
    return `\x1b[33mtoken usage (this session)\x1b[0m\n  prompt tokens: ${t.prompt}\n  completion: ${t.completion}\n  total: ${t.prompt + t.completion}\n  API calls: ${t.calls}`;
  } },
  '/help':     { description: 'show slash commands',                  run: () => {
    const C = (s) => `\x1b[36m${s}\x1b[0m`; const D = (s) => `\x1b[90m${s}\x1b[0m`;
    const lines = Object.entries(SLASH_COMMANDS).map(([k, v]) => `  ${C(k.padEnd(12))} ${v.description}`);
    const aliases = Object.entries(SLASH_ALIASES).map(([alias, cmd]) => `  ${D(alias.padEnd(12))} (alias for ${cmd})`);
    return `slash commands:\n${lines.join('\n')}\n\nno-slash aliases:\n${aliases.join('\n')}`;
  } },
  '/update':   { description: 're-exec this REPL into the newest on-disk code', run: async () => {
    const { spawn } = require('child_process');
    const path = require('path');
    let ver = '?'; try { ver = require(path.resolve(__dirname, '..', '..', 'package.json')).version; } catch {}
    process.stdout.write(`\x1b[36m  reloading REPL into newest code (v${ver})...\x1b[0m\n`);
    // Hand the terminal to a fresh process running the same argv, then exit.
    const child = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', cwd: process.cwd() });
    child.on('exit', code => process.exit(code || 0));
    return '';
  } },
  '/quit':     { description: 'exit',                                 run: () => { process.exit(0); } },
  '/exit':     { description: 'exit',                                 run: () => { process.exit(0); } },
};
const SLASH_ALIASES = {
  'model': '/model', 'provider': '/provider', 'tools': '/tools',
  'mcp': '/mcp', 'clear': '/clear', 'help': '/help',
  'quit': '/quit', 'exit': '/exit', 'cost': '/cost',
  'save': '/save', 'load': '/load', 'agents': '/agents',
  'update': '/update',
};

function resolveSlashCommand(prompt) {
  if (prompt.startsWith('/')) {
    const [cmd] = prompt.split(/\s+/);
    return SLASH_COMMANDS[cmd] ? cmd : null;
  }
  const [cmd] = prompt.split(/\s+/);
  return SLASH_ALIASES[cmd] || null;
}

function printBanner(opts) {
  const c = (s, color) => `\x1b[${color}m${s}\x1b[0m`;
  const allTools = TOOLS.list();
  const mcpCount = allTools.filter(t => t.name.startsWith('mcp__')).length;
  const g0dCount = allTools.filter(t => ['parseltongue','autotune','stm','godmode'].includes(t.name)).length;
  const builtin = allTools.length - mcpCount - g0dCount;
  console.log('');
  console.log(c('  ╔══════════════════════════════════════════════════════════════════╗', '35'));
  console.log(c('  ║  PURPCLAW — AI Workstation OS · open-source coding-agent CLI    ║', '35'));
  console.log(c('  ╚══════════════════════════════════════════════════════════════════╝', '35'));
  console.log(`  ${c('provider', '90')}: ${c(opts.provider || 'auto', '36')}  ${c('·', '90')}  ${c('model', '90')}: ${c(opts.model || 'auto', '36')}`);
  console.log(`  ${c('tools', '90')}:   ${c(builtin, '36')} built-in  ${c('+', '90')}  ${c(g0dCount, '35')} G0DM0D3  ${c('+', '90')}  ${c(mcpCount, '32')} MCP (OmniCode)  ${c('=', '90')}  ${c(allTools.length, '1;36')} total`);
  const omniTip = mcpCount > 0 ? `  ${c('OmniCode', '32')}:  ${c('active · saves 99% token burn on code reads', '90')}` : `  ${c('OmniCode', '90')}:  not connected (add to .purpclaw/mcp.json)`;
  console.log(omniTip);
  console.log(`  type ${c('/help', '36')} for slash commands, ${c('Ctrl+C', '36')} to exit`);
  console.log('');
}

async function runAsk(opts) {
  // Load MCP servers at startup so the tool list reflects them.
  try { await ensureMcp(); } catch (e) { /* MCP unavailable, continue without */ }

  // Only use the env LLM_MODEL when the user didn't explicitly pass
  // --provider. If they did pass --provider, assume they want that
  // provider's default model unless they also pass --model.
  const provider = opts.provider || process.env.LLM_PROVIDER;
  const model    = opts.model    || (opts.provider ? null : process.env.LLM_MODEL);
  const ctx = { provider, model, history: [], maxTurns: opts.maxTurns };
  printBanner(ctx);

  if (!opts.prompt) {
    // Interactive mode
    return runInteractive(ctx);
  }
  // One-shot mode
  return runOneShot(opts.prompt, ctx);
}

async function runOneShot(prompt, ctx) {
  // Slash commands short-circuit the agent loop. They're fast, local,
  // don't need an LLM. Accept both `/foo` and `foo` (the latter for
  // shells like git-bash that mung a leading slash into a file path).
  const slash = resolveSlashCommand(prompt);
  if (slash) {
    const args = prompt.split(/\s+/).slice(1).join(' ');
    const out = SLASH_COMMANDS[slash].run(args, ctx);
    if (out) console.log(out);
    return 0;
  }
  let tokens = 0;
  let toolCalls = 0;
  for await (const ev of runAgent({ prompt, history: ctx.history, model: ctx.model, provider: ctx.provider, opts: { maxTurns: ctx.maxTurns ?? 10, tools: AGENT_TOOLS } })) {
    switch (ev.type) {
      case 'token':
        process.stdout.write(ev.content);
        tokens += ev.content.length;
        break;
      case 'tool-call':
        console.log(`\n\x1b[33m  ⚡ ${ev.tool}\x1b[0m ${JSON.stringify(ev.args).slice(0, 120)}`);
        toolCalls++;
        break;
      case 'tool-result':
        const preview = (ev.content || ev.error || '').toString().replace(/\n/g, ' ').slice(0, 200);
        console.log(`\x1b[90m  ← ${ev.ok ? 'ok' : 'error'} (${ev.content?.length || 0} chars): ${preview}\x1b[0m`);
        break;
      case 'turn':
        if (ev.turn > 1) console.log(`\n\x1b[90m  --- turn ${ev.turn}/${ev.maxTurns} ---\x1b[0m`);
        break;
      case 'done':
        console.log(`\n\n\x1b[90m  ─── done in ${ev.turns} turn(s), ${tokens} tokens streamed, ${toolCalls} tool call(s) ───\x1b[0m\n`);
        return 0;
      case 'error':
        console.error(`\x1b[31m  ✗ ${ev.error}\x1b[0m`);
        return 1;
    }
  }
  return 0;
}

async function runInteractive(ctx) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  console.log('  \x1b[90minteractive mode — type a prompt, or /help for commands\x1b[0m\n');
  while (true) {
    const prompt = await new Promise(resolve => {
      rl.question('\x1b[36mpurp ❯\x1b[0m ', resolve);
    });
    if (!prompt.trim()) continue;
    if (prompt.startsWith('/')) {
      const [cmd, ...args] = prompt.split(/\s+/);
      const handler = SLASH_COMMANDS[cmd];
      if (handler) {
        const out = handler.run(args.join(' '), ctx);
        if (out) console.log(out);
        continue;
      }
      console.log(`\x1b[31m  unknown: ${cmd}  (try /help)\x1b[0m`);
      continue;
    }
    await runOneShot(prompt, ctx);
    console.log('');
  }
}

function help() {
  console.log(`
  purpclaw ask — open-source coding-agent CLI

  USAGE:
    purpclaw ask "your prompt here"
    purpclaw ask --provider ollama --model qwen2.5:3b "write tests"
    purpclaw ask --max-turns 20 "long task"
    purpclaw ask                       # interactive mode
    echo "explain this" | purpclaw ask   # pipe mode

  OPTIONS:
    --provider <name>     provider (openai, anthropic, gemini, github-models, codex, codex-oauth, ollama, atomic-chat, ...)
    --model <name>        model name
    --max-turns <n>       max agent loop iterations (default 10)
    --temperature <n>     LLM temperature (default 0.2)
    --no-stream           disable streaming
    --json                output as JSON (for piping)
    --help                this help

  SLASH COMMANDS (in interactive mode):
    /model <name>      /provider <name>   /tools
    /clear             /help              /cost
    /mcp               /quit              /exit

  PROVIDERS (17 total):
    openai, kimi, minimax, groq, deepseek, openrouter, together, mistral,
    ollama, lmstudio, anthropic, gemini, github-models, codex, codex-oauth,
    atomic-chat, custom

  EXAMPLES:
    purpclaw ask "explain the auth flow"
    purpclaw ask --provider ollama "add a readme section"
    purpclaw ask "refactor the spawn patterns" --max-turns 20
`);
}

async function run(args, ctx) {
  if (args.includes('--help') || args.includes('-h')) return help();
  const opts = parseArgs(args);
  if (opts.help) return help();
  return runAsk(opts);
}

function parseArgs(args) {
  const opts = { prompt: null, provider: null, model: null, maxTurns: 10, help: false, json: false, noStream: false };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--provider') opts.provider = args[++i];
    else if (a === '--model') opts.model = args[++i];
    else if (a === '--max-turns' || a === '--turns') opts.maxTurns = parseInt(args[++i], 10);
    else if (a === '--temperature') opts.temperature = parseFloat(args[++i]);
    else if (a === '--no-stream') opts.noStream = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) { /* ignore unknown */ }
    else positional.push(a);
  }
  if (positional.length) opts.prompt = positional.join(' ').trim();
  // Read from stdin if no prompt and stdin is piped
  if (!opts.prompt && !process.stdin.isTTY) {
    try {
      opts.prompt = require('fs').readFileSync(0, 'utf-8').trim();
    } catch {}
  }
  return opts;
}

module.exports = { run, help, SLASH_COMMANDS };
