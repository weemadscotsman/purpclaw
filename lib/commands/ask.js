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
const { runAgent, buildSystemPrompt } = require('../agent-loop');
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
  '/model':    { description: 'switch model. usage: /model <name>',     run: (args, ctx) => { ctx.model = args.trim() || ctx.model; return `model → ${ctx.model}`; } },
  '/provider': { description: 'switch provider. usage: /provider <name>', run: (args, ctx) => { ctx.provider = args.trim() || ctx.provider; return `provider → ${ctx.provider}`; } },
  '/tools':    { description: 'list available tools (built-in + MCP)',  run: () => TOOLS.list().map(t => `  ${t.name} — ${t.description.slice(0, 80)}`).join('\n') },
  '/mcp':      { description: 'list MCP servers and their tools',       run: async () => {
    const mcp = await ensureMcp();
    const servers = mcp.listServers();
    if (!servers.length) return '  no MCP servers configured.\n  config: .purpclaw/mcp.json or ~/.config/purpclaw/mcp.json\n  format: { "servers": { "<name>": { "command": "...", "args": [...], "env": {...} } } }';
    return servers.map(s => `  ${s.name}: ${s.toolCount} tools\n    cmd: ${s.command} ${(s.args || []).join(' ')}\n    tools: ${s.tools.join(', ')}`).join('\n');
  } },
  '/agents':   { description: 'list available swarm agents',          run: () => '  available agents: planner, builder, researcher, auditor, security, designer, video, audio, custom\n  use the swarm mode (route: swarm) to dispatch to multiple agents in parallel' },
  '/clear':    { description: 'clear conversation history',           run: (args, ctx) => { ctx.history.length = 0; return 'history cleared'; } },
  '/help':     { description: 'show slash commands',                  run: () => Object.entries(SLASH_COMMANDS).map(([k, v]) => `  ${k.padEnd(12)} ${v.description}`).join('\n') },
  '/quit':     { description: 'exit',                                 run: () => { process.exit(0); } },
  '/exit':     { description: 'exit',                                 run: () => { process.exit(0); } },
  '/cost':     { description: 'show token / cost usage',              run: () => '(token accounting not yet wired)' },
};
// Slash command names WITHOUT the leading slash — for environments where
// bash/git-bash on Windows munges `/foo` into a file path. The user can
// also call the actual slash form; both work.
const SLASH_ALIASES = {
  'model':    '/model',  'provider': '/provider',  'tools':  '/tools',
  'mcp':      '/mcp',    'clear':    '/clear',     'help':   '/help',
  'quit':     '/quit',   'exit':     '/exit',      'cost':   '/cost',
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
  console.log('');
  console.log(c('  ╔════════════════════════════════════════════════════════╗', '36'));
  console.log(c('  ║  PURPCLAW — open-source coding-agent CLI               ║', '36'));
  console.log(c('  ╚════════════════════════════════════════════════════════╝', '36'));
  console.log(`  ${c('provider', '90')}: ${c(opts.provider || 'auto', '36')}`);
  console.log(`  ${c('model', '90')}:    ${c(opts.model || 'auto', '36')}`);
  console.log(`  ${c('cwd', '90')}:     ${c(process.cwd(), '90')}`);
  console.log(`  ${c('tools', '90')}:   ${c(TOOLS.list().length, '36')} available (${TOOLS.list().map(t => t.name).join(', ')})`);
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
  for await (const ev of runAgent({ prompt, history: ctx.history, model: ctx.model, provider: ctx.provider, opts: { maxTurns: ctx.maxTurns ?? 10 } })) {
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
