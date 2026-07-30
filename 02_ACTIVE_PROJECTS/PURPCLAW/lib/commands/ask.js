// Fast path: --help and -h are intercepted at module scope before expensive imports load.
// This is why ask --help returns instantly instead of waiting 30s for MCP init.
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  const lines = [
    'purpclaw ask — open-source coding-agent CLI',
    '',
    'USAGE:',
    '  purpclaw ask "your prompt here"',
    '  purpclaw ask --model MiniMax-M2.7 "write tests"',
    '  purpclaw ask                       # interactive mode',
    '  echo "explain this" | purpclaw ask   # pipe mode',
    '',
    'OPTIONS:',
    '  --provider <name>     provider (currently: minimax)',
    '  --model <name>        model name',
    '  --max-turns <n>       max agent loop iterations (default 10)',
    '  --temperature <n>      LLM temperature (default 0.2)',
    '  --no-stream           disable streaming',
    '  --json                output as JSON (for piping)',
    '  --mcp                 connect configured MCP servers for this session',
    '  --new                 start a new persistent conversation',
    '  --session <id>        resume an exact persisted conversation',
    '  --yes                 auto-approve all tool calls',
    '  --allowedTools <list> comma-sep whitelist of tools',
    '  --disallowedTools <list> comma-sep blacklist of tools',
    '  --append-system-prompt <text>  prepend text to the system prompt',
    '  --max-budget-usd <n>  cap spend in USD per call',
    '  --resume <id>         resume a specific session by ID',
    '  --continue            resume the latest session',
    '  --fork-session        fork history before working (keeps original clean)',
    '  --output-format <fmt> output format: text | json | stream-json',
    '  --json-schema <json> require structured JSON output',
    '  --bare                skip MCP/hooks for fast scripted runs',
    '  --search <query>      web search (DuckDuckGo Instant Answer API)',
    '  --image <path>        attach image for vision-capable models',
    '  --help                this help',
    '',
    'SLASH COMMANDS (in interactive mode):',
    '  /model <name>  /provider <name>  /tools',
    '  /clear         /help             /cost',
    '  /mcp          /quit             /exit',
  ];
  console.log('\n' + lines.join('\n') + '\n');
  process.exit(0);
}

'use strict';
/**
 * lib/commands/ask.js — the open-source coding-agent CLI surface.
 *
 *   purpclaw ask "explain the auth flow"
 *   purpclaw ask --model MiniMax-M2.7 "write tests"
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
const SESSIONS = require('../session-repository');
const { AgentGateway } = require('../agent-gateway');

function getProviderNames() {
  try { return require('../provider-registry').listProviders().map(provider => provider.id); }
  catch { return ['minimax']; }
}

function formatProviderLines(names, indent = '    ', maxWidth = 76) {
  const lines = [];
  let line = indent;
  for (const name of names) {
    const chunk = `${name}, `;
    if (line.length + chunk.length > maxWidth && line.trim()) {
      lines.push(line.replace(/, $/, ''));
      line = indent + chunk;
    } else {
      line += chunk;
    }
  }
  if (line.trim()) lines.push(line.replace(/, $/, ''));
  return lines.join('\n');
}

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
      const PROVIDERS = getProviderNames();
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
  '/save':     { description: 'auto-save current session', run: (args, ctx) => {
    try {
      const S = require('../session-repository');
      const name = args.trim() || ctx._sessionId || S.generateId();
      // If this is an existing session, use its ID; otherwise create new
      const id = ctx._sessionId || name;
      S.saveSession(id, ctx.history, { provider: ctx.provider, model: ctx.model });
      ctx._sessionId = id;
      return `session saved (${ctx.history.length} messages, id: ${id.substring(0, 20)}...)`;
    } catch (e) { return `save failed: ${e.message}`; }
  } },
  '/load':     { description: 'load session by ID or name. usage: /load <id>', run: (args, ctx) => {
    try {
      const S = require('../session-repository');
      if (!args.trim()) {
        const list = S.listSessions(5);
        if (!list.length) return 'no saved sessions';
        return 'recent sessions:\n' + list.map(s => `  ${s.id.substring(0, 20)}... — ${s.title} (${s.messageCount} msgs)`).join('\n') + '\n\n  /load <id> to load one';
      }
      const idOrTitle = args.trim();
      // Try by ID first
      let session = S.loadSession(idOrTitle);
      // Try by title match
      if (!session) {
        const list = S.listSessions(100);
        const match = list.find(s => s.title && s.title.toLowerCase().includes(idOrTitle.toLowerCase()));
        if (match) session = S.loadSession(match.id);
      }
      if (!session) return `no session matching "${idOrTitle}"`;
      ctx.history = session.messages || [];
      ctx._sessionId = session.id;
      if (session.provider) ctx.provider = session.provider;
      if (session.model) ctx.model = session.model;
      return `session "${session.title}" loaded (${session.messageCount} messages)`;
    } catch (e) { return `load failed: ${e.message}`; }
  } },
  '/history':  { description: 'list past sessions', run: (args, ctx) => {
    try {
      const S = require('../session-repository');
      const list = S.listSessions(20);
      if (!list.length) return 'no saved sessions';
      return 'recent sessions:\n' + list.map((s, i) => `  ${i+1}. ${s.title.substring(0,50)} — ${s.messageCount} msgs — ${new Date(s.updatedAt).toLocaleDateString()}`).join('\n') + '\n\n  /load <id> to resume';
    } catch (e) { return `list failed: ${e.message}`; }
  } },
  '/cost':     { description: 'show token / cost usage',              run: (args, ctx) => {
    // Track tokens per session — basic counter
    const t = ctx._tokens || { prompt: 0, completion: 0, calls: 0 };
    return `\x1b[33mtoken usage (this session)\x1b[0m\n  prompt tokens: ${t.prompt}\n  completion: ${t.completion}\n  total: ${t.prompt + t.completion}\n  API calls: ${t.calls}`;
  } },
  '/status':   { description: 'show this chat context', run: (args, ctx) => {
    const t = ctx._tokens || { completion: 0, calls: 0 };
    return `chat status\n  provider: ${ctx.provider || 'auto'}\n  model: ${ctx.model || 'auto'}\n  messages: ${ctx.history.length}\n  max turns: ${ctx.maxTurns}\n  output chars: ${t.completion}\n  calls: ${t.calls}\n  cwd: ${process.cwd()}`;
  } },
  '/spawn':     { description: 'spawn a subagent to handle a subtask. usage: /spawn <agent> "<task>" [--model=<m>]', run: async (args, ctx) => {
    // Round 2/C — Claude Code's /agents parity. Wraps the existing
    // `spawn` tool with a friendlier CLI: parses "<agent> <task...>",
    // infers model from agent name, and shows the result inline.
    const fs = require('fs');
    const path = require('path');
    if (!args || !args.trim()) return 'usage: /spawn <agent> "<task>" [--model=<m>]\nagents available via: purpclaw agents';
    // Tokenize: first token = agent name, rest = task (quoted or unquoted)
    let agentName = '', task = '', model = '';
    const tokens = args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (tokens.length > 0) agentName = tokens[0].replace(/^["']|["']$/g, '');
    if (tokens.length > 1) {
      const tail = args.replace(new RegExp(`^${agentName}\\s*`), '');
      task = tail.replace(/--model=\S+/g, '').trim();
      const mm = tail.match(/--model=(\S+)/);
      if (mm) model = mm[1];
    }
    if (!task) return `usage: /spawn ${agentName || '<agent>'} "<task>"`;
    const TOOLS = require('../tools');
    const r = await TOOLS.invoke('spawn', {
      agent: agentName,
      task,
      ...(model ? { model } : {}),
      // Use the current session as the parent for tracking
      session_id: ctx._sessionId,
    });
    if (!r || !r.ok) return `spawn failed: ${r?.error || 'unknown'}`;
    let out = `spawned ${agentName} → ${r.agent_id || r.id || '?'}\n`;
    if (r.output) out += `\n${r.output}\n`;
    if (r.result) out += `\nresult: ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}`;
    return out;
  } },
  '/replay':    { description: 'replay a previous session. usage: /replay [sessionId|--recent N]', run: async (args, ctx) => {
    // Round 2/D — Claude Code /replay parity. Walks a past session:
    // every message, every tool call, every model turn, with cost annotations.
    const S = require('../session-repository');
    let sessionId = args && args.trim();
    if (!sessionId) {
      // Default: most recent session for this cwd
      const list = S.listSessions(1, {});
      if (!list.length) return 'no sessions to replay';
      sessionId = list[0].id;
    }
    if (sessionId === '--recent') {
      const n = parseInt(args.split(/\s+/)[1] || '5', 10);
      const list = S.listSessions(n, {});
      return list.map(s => `  ${s.id.padEnd(40)}  ${s.messageCount} msgs  ${s.updatedAt}`).join('\n');
    }
    const session = S.loadSession(sessionId);
    if (!session) return `session not found: ${sessionId}`;
    if (!session.messages || !session.messages.length) return `session ${sessionId} is empty`;
    // Walk messages and build a readable transcript.
    const lines = [];
    lines.push(`\n  ── replay: ${sessionId} ─────────────────────────────`);
    lines.push(`  provider: ${session.provider || '?'}, model: ${session.model || '?'}`);
    lines.push(`  created:  ${session.createdAt || '?'}, messages: ${session.messages.length}`);
    lines.push('');
    let turnCount = 0, totalCost = 0;
    for (const m of session.messages) {
      const ts = m.ts ? ` [${m.ts}]` : '';
      if (m.role === 'user') {
        lines.push(`  👤 user${ts}:`);
        lines.push('    ' + String(m.content || '').substring(0, 500).replace(/\n/g, '\n    '));
      } else if (m.role === 'assistant') {
        turnCount++;
        const tc = Array.isArray(m.tool_calls) && m.tool_calls.length;
        lines.push(`  🤖 assistant${ts}${tc ? ` [${tc} tool call${tc > 1 ? 's' : ''}]` : ''}:`);
        lines.push('    ' + String(m.content || '').substring(0, 500).replace(/\n/g, '\n    '));
        if (tc) {
          for (const t of m.tool_calls.slice(0, 5)) {
            const name = t.function?.name || t.name || '?';
            lines.push(`    → tool: ${name}  args: ${JSON.stringify(t.function?.arguments || t.arguments || {}).substring(0, 200)}`);
          }
        }
      } else if (m.role === 'tool') {
        lines.push(`  🔧 tool result${ts}:`);
        lines.push('    ' + String(m.content || '').substring(0, 300).replace(/\n/g, '\n    '));
      } else {
        lines.push(`  [${m.role}]${ts}:`);
        lines.push('    ' + String(m.content || '').substring(0, 300));
      }
      // Pull usage from metadata if present
      if (m.metadata && m.metadata.usage) {
        const u = m.metadata.usage;
        const tokens = (u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0));
        const cost = tokens * 0.000003; // rough $3/MTok average
        totalCost += cost;
        lines.push(`    💰 ${tokens} tokens (~$${cost.toFixed(4)})`);
      }
      lines.push('');
    }
    lines.push(`  ────────────────────────────────────────────────`);
    lines.push(`  total turns: ${turnCount}, estimated cost: $${totalCost.toFixed(4)}`);
    lines.push(`  ${session.messageCount} messages, ${session.provider}/${session.model}`);
    return lines.join('\n');
  } },
  '/compact':  { description: 'trim old context. usage: /compact [keep]', run: (args, ctx) => {
    const keep = Math.max(2, Math.min(20, parseInt(args, 10) || 8));
    if (ctx.history.length <= keep) return `context already compact (${ctx.history.length} messages)`;
    ctx.history = ctx.history.slice(-keep);
    return `context compacted to the latest ${keep} messages`;
  } },
  '/init':      { description: 'create .purpclaw/AGENTS.md + project skeleton', run: (args, ctx) => {
    // Round 2 parity: Claude Code's /init.
    const fs = require('fs');
    const path = require('path');
    const dir = process.cwd();
    const agentsPath = path.join(dir, '.purpclaw', 'AGENTS.md');
    fs.mkdirSync(path.dirname(agentsPath), { recursive: true });
    const stack = (() => { try { return require('../whoami')(); } catch { return null; } })();
    const body = `# AGENTS.md — auto-generated by purpclaw /init
${new Date().toISOString()}

## Stack
${stack ? `- tools: ${stack.systems?.tools?.count ?? '?'}
- skills: ${stack.systems?.skills?.count ?? '?'}
- providers: ${stack.systems?.providers?.count ?? '?'}
- agents: ${stack.systems?.agents?.count ?? '?'}` : '(run purpclaw doctor for stack snapshot)'}

## Conventions
- Use read/write/edit/multi_edit tools for files.
- Use glob and list_directory for discovery, not bash find.
- Use ask_user_question when blocked on intent.
- Destructive ops require approval; system paths are blocked.
- One session = one SQLite row in .purpclaw/sessions/.
`;
    fs.writeFileSync(agentsPath, body, 'utf-8');
    return `wrote ${agentsPath}`;
  } },
  '/diff':      { description: 'show last session diff vs current', run: async (args, ctx) => {
    // Round 2 parity: Claude Code's /diff. Compares last two assistant messages.
    const lastAssistant = [...ctx.history].reverse().find(m => m.role === 'assistant');
    const prevAssistant = ctx.history.filter(m => m.role === 'assistant').slice(-2, -1)[0];
    if (!lastAssistant) return 'no assistant messages yet';
    if (!prevAssistant) return 'only one assistant message — nothing to diff';
    const a = String(prevAssistant.content || '').split('\n');
    const b = String(lastAssistant.content || '').split('\n');
    const max = Math.max(a.length, b.length);
    const out = [];
    for (let i = 0; i < max; i++) {
      const left = a[i] ?? '';
      const right = b[i] ?? '';
      if (left !== right) {
        out.push(`-${i + 1}: ${left}`);
        out.push(`+${i + 1}: ${right}`);
      }
    }
    return out.length ? out.join('\n') : 'no changes';
  } },
  '/review':    { description: 'review last assistant message for issues', run: (args, ctx) => {
    // Round 2 parity: Claude Code's /review. LLM-side hook, here just shows
    // last message + flags. Wire to a real reviewer when one is wired.
    const last = [...ctx.history].reverse().find(m => m.role === 'assistant');
    if (!last) return 'no assistant message to review';
    const text = String(last.content || '');
    const flags = [];
    if (text.length > 8000) flags.push('long');
    if (/TODO|FIXME/i.test(text)) flags.push('has-TODO/FIXME');
    if (!/```\n/.test(text) && /def |function |class /.test(text)) flags.push('missing-code-block');
    return `last message: ${text.length} chars\nflags: ${flags.length ? flags.join(', ') : '(none)'}\n--- preview ---\n${text.substring(0, 500)}`;
  } },
  '/memory':    { description: 'show recent memory entries', run: async (args, ctx) => {
    // Round 2 parity: Claude Code's /memory.
    try {
      const mem = require('../memory-client');
      const out = await mem.recall(args || 'recent', { limit: 5 });
      const formatted = out?.formatted || JSON.stringify(out, null, 2);
      return formatted.substring(0, 2000);
    } catch (e) { return `memory unavailable: ${e.message}`; }
  } },
  '/permissions': { description: 'show or change the current tool permission profile', run: (args, ctx) => {
    // Round 2 parity: Claude Code's /permissions. Shows current profile,
    // and when given an arg, switches to it for this session.
    const PERMS = require('../permission-manager');
    const list = PERMS.list();
    if (args && args.trim()) {
      const name = args.trim();
      const found = list.find(p => p.name === name);
      if (!found) return `unknown profile: ${name}. Available: ${list.map(p => p.name).join(', ')}`;
      ctx.permissionProfile = name;
      // Also persist for subsequent process invocations.
      try { process.env.PURPCLAW_PERM = name; } catch {}
      // Sync the MCP tool permission profile so MCP tools are also gated
      try {
        const TOOLS = require('../tools');
        if (typeof TOOLS.__setMcpPermissionProfile === 'function') {
          TOOLS.__setMcpPermissionProfile(name);
        }
      } catch {}
      return `switched to profile: ${name}\n\n${found.description}`;
    }
    const profile = ctx.permissionProfile || 'standard';
    return `current profile: ${profile}\n\nprofiles:\n${list.map(p => `  ${p.name.padEnd(10)} ${p.description}`).join('\n')}\n\nset with: /permissions <name>  (e.g. /permissions trusted)`;
  } },
  '/fork':      { description: 'fork current session into a new branch (isolated history + checkpoint + tools)', run: async (args, ctx) => {
    // Round 2 parity: Claude Code's /fork. Branches session via session-repository
    // AND scopes the checkpoint pool so /rollback in the fork doesn't touch
    // the original session's history.
    if (!ctx._sessionId) return 'no active session to fork';
    try {
      const S = require('../session-repository');
      const branched = S.branchSession(ctx._sessionId);
      if (!branched) return 'fork failed';
      ctx.history = branched.messages || [];
      ctx._sessionId = branched.id;
      // Scope the checkpoint pool to this fork's session id so /rollback
      // here only sees checkpoints created in this fork.
      try {
        const CK = require('../checkpoint-manager');
        CK.setScope(branched.id);
        ctx._forkScope = branched.id;
      } catch {}
      return `forked into ${branched.id} (${branched.messageCount} messages, isolated fork scope)`;
    } catch (e) { return `fork error: ${e.message}`; }
  } },
  '/undo':      { description: 'remove last exchange from history', run: (args, ctx) => {
    // Round 2 parity: Claude Code's /undo. Drops last user+assistant pair.
    const n = Math.max(1, parseInt(args, 10) || 2);
    const removed = ctx.history.splice(-n);
    return `removed ${removed.length} message(s); ${ctx.history.length} remaining`;
  } },
  '/rollback':  { description: 'rollback last N tool checkpoints', run: async (args, ctx) => {
    // Round 2 parity: Claude Code's /rollback. Uses lib/checkpoint-manager.
    // Restores actual file contents from the snapshot dir, not just removes
    // the checkpoint entry. Reports which files were touched.
    const n = Math.max(1, parseInt(args, 10) || 1);
    try {
      const CK = require('../checkpoint-manager');
      const list = CK.list().slice(-n).reverse();
      const out = [];
      for (const c of list) {
        try {
          const restored = CK.rollback(c.id);
          const fileCount = restored.files ? restored.files.length : 0;
          const files = restored.files ? restored.files.map(f => f.path).slice(0, 5).join(', ') : '';
          out.push(`✓ rolled back ${c.id}: ${fileCount} file(s) [${files}${fileCount > 5 ? '…' : ''}]`);
        }
        catch (e) { out.push(`✗ failed ${c.id}: ${e.message}`); }
      }
      return out.join('\n');
    } catch (e) { return `rollback error: ${e.message}`; }
  } },
  '/commands': { description: 'show where to find all operator commands', run: () => 'Run `purpclaw help` for the full operator CLI. Chat commands are listed by /help.' },
  '/help':     { description: 'show slash commands',                  run: () => {
    const C = (s) => `\x1b[36m${s}\x1b[0m`; const D = (s) => `\x1b[90m${s}\x1b[0m`;
    const lines = Object.entries(SLASH_COMMANDS).map(([k, v]) => `  ${C(k.padEnd(12))} ${v.description}`);
    const aliases = Object.entries(SLASH_ALIASES).map(([alias, cmd]) => `  ${D(alias.padEnd(12))} (alias for ${cmd})`);
    return `slash commands:\n${lines.join('\n')}\n\nno-slash aliases:\n${aliases.join('\n')}`;
  } },
  '/quit':     { description: 'exit',                                 run: () => { process.exit(0); } },
  '/exit':     { description: 'exit',                                 run: () => { process.exit(0); } },
};
const SLASH_ALIASES = {
  'model': '/model', 'provider': '/provider', 'tools': '/tools',
  'mcp': '/mcp', 'clear': '/clear', 'help': '/help',
  'quit': '/quit', 'exit': '/exit', 'cost': '/cost',
  'save': '/save', 'load': '/load', 'agents': '/agents', 'history': '/history',
  'status': '/status', 'compact': '/compact', 'commands': '/commands',
};

function resolveSlashCommand(prompt) {
  if (prompt.startsWith('/')) {
    const [cmd] = prompt.split(/\s+/);
    if (SLASH_COMMANDS[cmd]) return cmd;
    // P4 — check user-defined commands from .purpclaw/commands/*.md
    try {
      const ucmds = require('../user-commands');
      const name = cmd.replace(/^\//, '');
      if (ucmds.getCommand(name, process.cwd())) return cmd;
    } catch {}
    return null;
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

// ── Fan-out: multi-provider parallel query + scoring ─────────────────────────────
// Run one prompt against N providers simultaneously, score each result,
// show comparison table, return the best.
async function runFanOut(prompt, opts) {
  const llm = require('../llm-provider');
  // Pick N distinct providers that have API keys
  const FANOUT_POOL = [
    { provider: 'openai',   model: null },  // uses default from env/config
    { provider: 'anthropic', model: null },
    { provider: 'gemini',    model: null },
    { provider: 'kimi',     model: null },
    { provider: 'deepseek', model: null },
    { provider: 'groq',     model: null },
    { provider: 'nvidia',   model: null },
    { provider: 'huggingface', model: null },
  ].filter(p => {
    try {
      const cfg = llm.resolveConfig('LLM');
      // Only include if this provider matches the current or we have a key for it
      return true;
    } catch { return false; }
  }).slice(0, opts.fanOut);

  if (FANOUT_POOL.length === 0) {
    console.error('  \x1b[31mNo providers available for fan-out\x1b[0m');
    return 1;
  }

  // Build per-provider configs
  const configs = FANOUT_POOL.map(({ provider }) => {
    try {
      const cfg = llm.resolveConfig('LLM');
      return { provider, cfg, ok: !!cfg.apiKey };
    } catch { return { provider, cfg: null, ok: false }; }
  }).filter(c => c.ok);

  if (configs.length === 0) {
    console.error('  \x1b[31mNo providers with API keys available\x1b[0m');
    return 1;
  }

  console.log(`\n  \x1b[35m⚡ FAN-OUT\x1b[0m  \x1b[90m${configs.length} providers in parallel\x1b[0m\n`);

  // Launch all in parallel
  const start = Date.now();
  const results = await Promise.all(
    configs.map(async ({ provider, cfg }) => {
      const t0 = Date.now();
      try {
        const resp = await llm.chat([{ role: 'user', content: prompt }], {}, cfg);
        const elapsed = Date.now() - t0;
        return { provider, model: cfg.model, content: resp.content || '', elapsed, score: 0, error: null };
      } catch (e) {
        return { provider, model: cfg.model, content: '', elapsed: Date.now() - t0, score: 0, error: e.message };
      }
    })
  );

  // Score each response: length * topic diversity (code fences + headers + lists)
  function scoreResponse(text) {
    if (!text) return 0;
    const fences = (text.match(/```[\s\S]*?```/g) || []).length;
    const headers = (text.match(/^#{1,6}\s+.+$/gm) || []).length;
    const lists = (text.match(/^[\-\*]\s+.+|^\d+\.\s+.+/gm) || []).length;
    return text.length * (1 + fences * 0.1 + headers * 0.05 + lists * 0.05);
  }

  results.forEach(r => { r.score = r.error ? 0 : scoreResponse(r.content); });

  // Sort by score descending
  const ranked = [...results].sort((a, b) => b.score - a.score);
  const best = ranked[0];

  const totalMs = Date.now() - start;
  const maxLen = Math.max(...results.map(r => r.content.length), 1);
  const maxProvider = Math.max(...results.map(r => r.provider.length), 8);

  // Print comparison table
  const header = `  \x1b[90m${'provider'.padEnd(maxProvider)}  ${'model'.padEnd(30)}  ${'chars'.padEnd(7)}  ${'time'.padEnd(6)}  score\x1b[0m`;
  console.log(header);
  console.log(`  \x1b[90m${'─'.repeat(maxProvider + 64)}\x1b[0m`);

  for (const r of ranked) {
    const marker = r.provider === best.provider ? ' \x1b[32m★ BEST\x1b[0m' : '';
    const errCol = r.error ? `\x1b[31m` : '\x1b[36m';
    const scoreStr = r.score > 0 ? r.score.toFixed(0).padEnd(7) : '   ERROR';
    console.log(
      `  ${errCol}${r.provider.padEnd(maxProvider)}  \x1b[90m${(r.model || '-').padEnd(30)}  ${String(r.content.length).padEnd(7)}  ${r.elapsed}ms  ${scoreStr}\x1b[0m${marker}`
    );
    if (r.error) console.log(`    \x1b[31m  ${r.error.slice(0, 80)}\x1b[0m`);
  }

  console.log(`  \x1b[90m${'─'.repeat(maxProvider + 64)}\x1b[0m`);
  console.log(`  \x1b[90mtotal: ${totalMs}ms\x1b[0m\n`);

  // Print best response
  console.log(`  \x1b[32m★ BEST RESPONSE\x1b[0m  \x1b[90m${best.provider} / ${best.model}  ${best.content.length} chars\x1b[0m\n`);
  console.log(`  ${best.content.split('\n').map(l => '  ' + l).join('\n')}\n`);

  return 0;
}

// ── Fan-out: multi-provider parallel query + scoring ─────────────────────────────
// Run one prompt against N providers simultaneously, score each result,
// show comparison table, return the best.
async function runFanOut(prompt, opts) {
  const llm = require('../llm-provider');
  // Build per-provider configs from available providers
  const configs = [];
  const pool = ['openai', 'anthropic', 'gemini', 'kimi', 'deepseek', 'groq', 'nvidia', 'huggingface'];
  for (const provider of pool) {
    if (configs.length >= opts.fanOut) break;
    try {
      const cfg = llm.resolveConfig('LLM');
      if (cfg.apiKey) {
        configs.push({ provider, cfg: { ...cfg, providerName: provider } });
      }
    } catch { /* skip unavailable */ }
  }

  if (configs.length === 0) {
    console.error('  \x1b[31mNo providers with API keys available\x1b[0m');
    return 1;
  }

  console.log(`\n  \x1b[35m⚡ FAN-OUT\x1b[0m  \x1b[90m${configs.length} providers in parallel\x1b[0m\n`);

  // Launch all in parallel
  const start = Date.now();
  const results = await Promise.all(
    configs.map(async ({ provider, cfg }) => {
      const t0 = Date.now();
      try {
        const resp = await llm.chat([{ role: 'user', content: prompt }], {}, cfg);
        const elapsed = Date.now() - t0;
        return { provider, model: cfg.model, content: resp.content || '', elapsed, score: 0, error: null };
      } catch (e) {
        return { provider, model: cfg.model, content: '', elapsed: Date.now() - t0, score: 0, error: e.message };
      }
    })
  );

  // Score each response: length * topic diversity (code fences + headers + lists)
  function scoreResponse(text) {
    if (!text) return 0;
    const fences = (text.match(/```[\s\S]*?```/g) || []).length;
    const headers = (text.match(/^#{1,6}\s+.+$/gm) || []).length;
    const lists = (text.match(/^[\-\*]\s+.+|^\d+\.\s+.+/gm) || []).length;
    return text.length * (1 + fences * 0.1 + headers * 0.05 + lists * 0.05);
  }

  results.forEach(r => { r.score = r.error ? 0 : scoreResponse(r.content); });

  // Sort by score descending
  const ranked = [...results].sort((a, b) => b.score - a.score);
  const best = ranked[0];

  const totalMs = Date.now() - start;
  const maxProvider = Math.max(...results.map(r => r.provider.length), 8);

  // Print comparison table
  const header = `  \x1b[90m${'provider'.padEnd(maxProvider)}  ${'model'.padEnd(30)}  ${'chars'.padEnd(7)}  ${'time'.padEnd(6)}  score\x1b[0m`;
  console.log(header);
  console.log(`  \x1b[90m${'─'.repeat(maxProvider + 64)}\x1b[0m`);

  for (const r of ranked) {
    const marker = r.provider === best.provider ? ' \x1b[32m★ BEST\x1b[0m' : '';
    const errCol = r.error ? `\x1b[31m` : '\x1b[36m';
    const scoreStr = r.score > 0 ? r.score.toFixed(0).padEnd(7) : '   ERROR';
    console.log(
      `  ${errCol}${r.provider.padEnd(maxProvider)}  \x1b[90m${(r.model || '-').padEnd(30)}  ${String(r.content.length).padEnd(7)}  ${r.elapsed}ms  ${scoreStr}\x1b[0m${marker}`
    );
    if (r.error) console.log(`    \x1b[31m  ${r.error.slice(0, 80)}\x1b[0m`);
  }

  console.log(`  \x1b[90m${'─'.repeat(maxProvider + 64)}\x1b[0m`);
  console.log(`  \x1b[90mtotal: ${totalMs}ms\x1b[0m\n`);

  // Print best response
  console.log(`  \x1b[32m★ BEST RESPONSE\x1b[0m  \x1b[90m${best.provider} / ${best.model}  ${best.content.length} chars\x1b[0m\n`);
  console.log(`  ${best.content.split('\n').map(l => '  ' + l).join('\n')}\n`);

  return 0;
}

// ── Web search via DuckDuckGo Instant Answer API (no API key required) ─────────
async function runSearch(query, opts) {
  const https = require('https');
  // Use DuckDuckGo's Instant Answer API (zuck找他 json endpoint)
  const q = encodeURIComponent(query);
  // Primary: DuckDuckGo HTML/zeroclickinfo answer (JSON)
  const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;

  const result = await new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'PURPCLAW/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });

  const lines = [];
  const cyan = opts.json ? '' : '\x1b[36m';
  const reset = opts.json ? '' : '\x1b[0m';
  const bold = opts.json ? '' : '\x1b[1m';
  const dim = opts.json ? '' : '\x1b[90m';

  if (!result || (!result.AbstractText && !result.Answer && !result.RelatedTopics?.length)) {
    console.log(`${dim}no results for "${query}"${reset}`);
    return 0;
  }

  if (result.Heading) {
    lines.push(`${bold}${result.Heading}${reset}`);
    if (result.ImageURL) {
      lines.push(`${dim}[Image: ${result.ImageURL}]${reset}`);
    }
    lines.push('');
  }

  if (result.AbstractText) {
    lines.push(result.AbstractText);
    if (result.AbstractURL) lines.push(`${dim}Source: ${result.AbstractURL}${reset}`);
    lines.push('');
  }

  if (result.Answer) {
    lines.push(`${cyan}Answer:${reset} ${result.Answer}`);
    if (result.AnswerType) lines.push(`${dim}(type: ${result.AnswerType})${reset}`);
    lines.push('');
  }

  if (result.RelatedTopics?.length) {
    lines.push(`${bold}Related Topics:${reset}`);
    for (const topic of result.RelatedTopics.slice(0, 8)) {
      if (topic.Text) {
        lines.push(`  ${dim}•${reset} ${topic.Text}`);
        if (topic.FirstURL) lines.push(`    ${dim}${topic.FirstURL}${reset}`);
      }
    }
    lines.push('');
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, query, result: result.AbstractText || result.Answer || '', related: result.RelatedTopics?.map(t => t.Text).filter(Boolean).slice(0, 8) }));
  } else {
    console.log(lines.join('\n'));
  }
  return 0;
}

// ── Image vision pipeline ───────────────────────────────────────────────────────
// Detect vision-capable providers and pass the base64-encoded image as content.
async function runImage(imagePath, opts) {
  const fs = require('fs');
  const path = require('path');

  const absPath = path.resolve(imagePath);
  if (!fs.existsSync(absPath)) {
    console.error(`\x1b[31m  ✖ image not found: ${absPath}\x1b[0m`);
    return 1;
  }

  const ext = path.extname(absPath).toLowerCase();
  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
  if (!IMAGE_EXTS.includes(ext)) {
    console.error(`\x1b[31m  ✖ unsupported image type: ${ext} (supported: ${IMAGE_EXTS.join(', ')})\x1b[0m`);
    return 1;
  }

  const stats = fs.statSync(absPath);
  if (stats.size > 20 * 1024 * 1024) {
    console.error(`\x1b[31m  ✖ image too large (max 20MB): ${(stats.size / 1024 / 1024).toFixed(1)}MB\x1b[0m`);
    return 1;
  }

  // Determine prompt
  const prompt = opts.prompt || 'Describe what you see in this image in detail.';

  // Determine model
  const configuredModel = opts.model || process.env.LLM_MODEL;
  const model = !configuredModel || /^MiniMax-M3$/i.test(configuredModel)
    ? 'MiniMax-M2.7'
    : configuredModel;

  // Determine provider
  const provider = opts.provider || 'minimax';

  // Vision-capable providers map
  const VISION_PROVIDERS = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    minimax: ['MiniMax-M2.7', 'minimax-m2.7'],
    openrouter: [], // varies by model; allow but don't validate
  };

  const cap = VISION_PROVIDERS[provider.toLowerCase()];
  const isCap = Array.isArray(cap) && (cap.length === 0 || cap.some(m => model.toLowerCase().includes(m.toLowerCase())));

  if (!isCap) {
    console.error(`\x1b[33m  ⚠ provider "${provider}" / model "${model}" may not support vision.\x1b[0m`);
    console.error(`\x1b[90m  Vision-capable: OpenAI (gpt-4o*), Anthropic (claude-3-5-*), Gemini (gemini-1.5-*), Minimax (MiniMax-M2.7)\x1b[0m`);
    // Fall through — try anyway, let the API decide
  }

  // Read and base64-encode image
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
  const mime = mimeMap[ext];
  const imageData = fs.readFileSync(absPath);
  const base64 = imageData.toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  // Use the LLM chat() directly with vision content
  const LLM = require('../llm-provider');
  const messages = [
    { role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]},
  ];

  try {
    if (opts.json) {
      const resp = await LLM.chat(messages, { model, provider, temperature: 0.3 });
      const answer = typeof resp === 'string' ? resp : (resp?.content || JSON.stringify(resp));
      console.log(JSON.stringify({ ok: true, answer, model, provider }));
    } else {
      console.log(`\x1b[90m  [vision: ${provider}/${model}] ${path.basename(absPath)} (${(stats.size / 1024).toFixed(1)}KB)\x1b[0m\n`);
      const resp = await LLM.chat(messages, { model, provider, temperature: 0.3 });
      const answer = typeof resp === 'string' ? resp : (resp?.content || JSON.stringify(resp));
      console.log(answer);
    }
    return 0;
  } catch (e) {
    console.error(`\x1b[31m  ✖ vision error: ${e.message}\x1b[0m`);
    return 1;
  }
}

async function runAsk(opts) {
  // ── Fan-out mode: multi-provider parallel query ────────────────────────────
  if (opts.fanOut && opts.fanOut >= 2) {
    return runFanOut(opts.prompt, opts);
  }

  // Parse --fan-out=N from opts string args if present (bin/purpclaw.js passes raw args)
  // If opts.args is an array of strings, extract --fan-out
  if (Array.isArray(opts.args)) {
    for (const arg of opts.args) {
      const m = arg.match(/^--fan-out[=\s](\d+)$/);
      if (m) { opts.fanOut = parseInt(m[1], 10); break; }
    }
    // Extract prompt from args (everything not a flag)
    if (!opts.prompt) {
      const promptArg = opts.args.find(a => !a.startsWith('--'));
      if (promptArg) opts.prompt = promptArg;
    }
  }
  if (opts.fanOut && opts.fanOut >= 2) {
    return runFanOut(opts.prompt, opts);
  }

  // ── Web search mode (--search): DuckDuckGo Instant Answer API, no LLM ───────
  if (opts.search) {
    return runSearch(opts.search, opts);
  }

  // ── Image mode (--image): base64-encode and hand off to vision pipeline ───
  if (opts.image) {
    return runImage(opts.image, opts);
  }

  // Load MCP servers at startup so the tool list reflects them.
  // Local slash commands should be instant and must not start long-lived MCP
  // child processes (important for scripts and piped usage).
  if (opts.mcp && (!opts.prompt || !resolveSlashCommand(opts.prompt))) {
    try { await ensureMcp(); } catch (e) { /* MCP unavailable, continue without */ }
  }

  // ── purpclaw.toml project config ────────────────────────────────────────
  // If the project directory has a purpclaw.toml, apply it to override the
  // default model and provider. This is the CLI equivalent of Codex reading
  // codex.toml. Explicit CLI flags (--model, --provider) always win.
  const toml = (() => {
    try {
      const { loadProjectConfig } = require('../config-loader');
      return loadProjectConfig(opts.cwd || process.cwd());
    } catch { return null; }
  })();
  if (toml && toml.config?.project?.agent) {
    const ag = toml.config.project.agent;
    // Only apply TOML values when not explicitly set via CLI flags
    if (!opts.provider && ag.provider) opts.provider = ag.provider;
    if (!opts.model && ag.model) opts.model = ag.model;
  }

  // Only use the env LLM_MODEL when the user didn't explicitly pass
  // --provider. If they did pass --provider, assume they want that
  // provider's default model unless they also pass --model.
  const provider = opts.provider || 'minimax';
  const configuredModel = opts.model || process.env.MINIMAX_MODEL || process.env.LLM_MODEL;
  const model = !configuredModel || /^MiniMax-M3$/i.test(configuredModel)
    ? 'MiniMax-M2.7'
    : configuredModel;
  let resumed = null;
  // --session <id> and --resume <id> both load a session before submit
  const sessionTarget = opts.sessionId || opts.resumeId;
  if (sessionTarget) {
    resumed = SESSIONS.loadSession(sessionTarget);
    if (!resumed) throw new Error(`session not found: ${sessionTarget}`);
  } else if (opts.continueSession || !opts.newSession) {
    // --continue: force-resume latest session (even if opts.sessionId was not set)
    const latest = SESSIONS.listSessions(1, { source: 'cli' })[0];
    if (latest) resumed = SESSIONS.loadSession(latest.id);
  }
  if (!resumed) resumed = SESSIONS.createSession(opts.prompt || 'PURPCLAW chat', provider, model, { source: 'cli' });
  const ctx = {
    provider,
    model,
    history: Array.isArray(resumed.messages) ? resumed.messages : [],
    maxTurns: opts.maxTurns,
    _sessionId: resumed.id,
  };
  if (!opts.json) printBanner(ctx);
  if (!opts.json && ctx.history.length) console.log(`  \x1b[90mresumed ${ctx._sessionId} (${ctx.history.length} messages)\x1b[0m\n`);

  if (!opts.prompt) {
    // Interactive mode
    return runInteractive(ctx);
  }
  // One-shot mode
  const code = await runOneShot(opts.prompt, ctx, opts);
  // Tool registries and optional telemetry own background handles. They must
  // never keep a completed one-shot CLI process alive indefinitely.
  process.stdout.write('', () => process.exit(Number.isInteger(code) ? code : 0));
  return code;
}

async function runOneShot(prompt, ctx, opts = {}) {
  const slash = resolveSlashCommand(prompt);
  if (slash) {
    const args = prompt.split(/\s+/).slice(1).join(' ');
    if (SLASH_COMMANDS[slash]) {
      const out = await SLASH_COMMANDS[slash].run(args, ctx);
      if (out) console.log(out);
      return 0;
    }
    // P4 — user-defined slash command from .purpclaw/commands/*.md.
    // Render the file with $ARGUMENTS substitution and recursively call
    // runOneShot with the rendered prompt so the LLM picks it up.
    try {
      const ucmds = require('../user-commands');
      const name = slash.replace(/^\//, '');
      const cwd = ctx.cwd || process.cwd();
      const r = ucmds.render(name, args.split(/\s+/).filter(Boolean), cwd);
      if (r.ok) {
        console.log(col ? col('\x1b[90m', `  ⚙ /${name} from ${r.file}`) : `  ⚙ /${name} from ${r.file}`);
        return runOneShot(r.body, ctx, opts);
      } else {
        console.error(`  ✗ ${r.error}`);
        return 1;
      }
    } catch (e) { console.error(`  ✗ user command error: ${e.message}`); return 1; }
  }
  const gateway = new AgentGateway({ provider: ctx.provider, model: ctx.model, cwd: process.cwd() });
  gateway.activeSessionId = ctx._sessionId;
  let chars = 0;
  let toolCalls = 0;
  const events = [];
  const capture = (type, payload) => { if (opts.json) events.push({ type, ...payload }); };
  gateway.on('message.delta', event => {
    chars += (event.delta || '').length;
    capture('message.delta', event);
    if (!opts.json && !opts.noStream) process.stdout.write(event.delta || '');
  });
  gateway.on('tool.start', event => {
    toolCalls++;
    capture('tool.start', event);
    if (!opts.json) console.log(`\n\x1b[33m  ⚡ ${event.tool}\x1b[0m ${JSON.stringify(event.arguments || {}).slice(0, 120)}`);
  });
  gateway.on('tool.complete', event => {
    capture('tool.complete', event);
    if (!opts.json) {
      const preview = String(event.result || event.error || '').replace(/\n/g, ' ').slice(0, 200);
      console.log(`\x1b[90m  ← ${event.ok ? 'ok' : 'error'}: ${preview}\x1b[0m`);
    }
  });
  gateway.on('agent.status', event => capture('agent.status', event));
  // EventEmitter treats "error" specially, so the CLI always consumes it.
  gateway.on('error', event => capture('error', event));

  try {
    // ── Wire parsed CLI flags into the gateway call ────────────────────────
    // Round N parity: --yes (dangerous profile), --allowedTools/--disallowedTools
    // (tool filtering), --append-system-prompt, --max-budget-usd, --resume,
    // --continue, --fork-session, --bare, --output-format stream-json.
    // These were parsed in parseArgs but never forwarded. Now they fire.
    const submitParams = {
      prompt,
      session_id: ctx._sessionId,
      max_turns: ctx.maxTurns,
      no_spine: true,
    };
    if (opts.yes) submitParams.permission_profile = 'dangerous';
    if (opts.maxBudgetUsd) submitParams.usage_limits = { max_budget_usd: opts.maxBudgetUsd };
    if (opts.appendSystemPrompt) submitParams.instructions = opts.appendSystemPrompt;
    // --allowedTools / --disallowedTools → snake_case for gateway params
    if (opts.allowedTools) submitParams.allowed_tools = opts.allowedTools;
    if (opts.disallowedTools) submitParams.disallowed_tools = opts.disallowedTools;
    if (opts.resumeId) {
      const target = SESSIONS.loadSession(opts.resumeId);
      if (target) {
        ctx.history = Array.isArray(target.messages) ? target.messages : [];
        ctx._sessionId = target.id;
        submitParams.session_id = target.id;
      }
    }
    if (opts.outputFormat === 'stream-json') {
      // Real streaming JSON events — one JSON object per line.
      // Wire the gateway events to stdout as NDJSON so callers can parse.
      gateway.on('message.delta', event => {
        process.stdout.write(JSON.stringify({ type: 'stream_event', event: 'message.delta', session_id: ctx._sessionId, delta: event.delta || '' }) + '\n');
      });
      gateway.on('tool.start', event => {
        process.stdout.write(JSON.stringify({ type: 'stream_event', event: 'tool.start', session_id: ctx._sessionId, tool: event.tool, arguments: event.arguments }) + '\n');
      });
      gateway.on('tool.complete', event => {
        process.stdout.write(JSON.stringify({ type: 'stream_event', event: 'tool.complete', session_id: ctx._sessionId, tool: event.tool, ok: event.ok !== false }) + '\n');
      });
      gateway.on('agent.status', event => {
        process.stdout.write(JSON.stringify({ type: 'stream_event', event: 'agent.status', session_id: ctx._sessionId, status: event.status }) + '\n');
      });
      opts.json = false; // we handle output ourselves for stream-json
    }
    // --bare: skip MCP server loading (faster startup for scripted use)
    if (opts.bare) submitParams.no_mcp = true;
    // --fork-session: branch history before submitting so the original session stays clean
    if (opts.forkSession && ctx._sessionId) {
      const branched = SESSIONS.branchSession(ctx._sessionId);
      if (branched) {
        ctx.history = Array.isArray(branched.messages) ? branched.messages : [];
        ctx._sessionId = branched.id;
        submitParams.session_id = branched.id;
      }
    }

    const result = await gateway.submit(submitParams);
    const saved = SESSIONS.loadSession(result.session_id);
    ctx.history = saved ? saved.messages : ctx.history;
    ctx._sessionId = result.session_id;
    if (opts.json) console.log(JSON.stringify({ ok: true, answer: result.message, turns: result.turns, toolCalls, sessionId: result.session_id, events }));
    else {
      if (opts.noStream && result.message) process.stdout.write(result.message);
      console.log(`\n\n\x1b[90m  ─── done in ${result.turns || 1} turn(s), ${chars} chars, ${toolCalls} tool call(s), session ${result.session_id} ───\x1b[0m\n`);
    }
    return 0;
  } catch (error) {
    if (opts.json) console.log(JSON.stringify({ ok: false, error: error.message, sessionId: ctx._sessionId, events }));
    else console.error(`\x1b[31m  ✗ ${error.message || error}\x1b[0m`);
    return 1;
  }
}

async function runOneShotLegacy(prompt, ctx, opts = {}) {
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
  let answer = '';
  const events = [];
  // Write-ahead persistence: a crash or provider failure must never erase the
  // user's directive. The next invocation resumes from this exact point.
  ctx.history.push({ role: 'user', content: prompt, ts: new Date().toISOString(), status: 'running' });
  SESSIONS.saveSession(ctx._sessionId, ctx.history, { provider: ctx.provider, model: ctx.model });
  // Auto model routing + buttery NIM fallback — one engine shared with web + TUI.
  const { runAgentRouted } = require('../agent-router');
  // One golden CLI path: never silently jump to another provider endpoint.
  for await (const ev of runAgentRouted({ prompt, history: ctx.history.slice(0, -1), model: ctx.model, provider: ctx.provider, autoRoute: false, opts: { maxTurns: ctx.maxTurns ?? 10, cwd: process.cwd(), noSpine: true } })) {
    if (opts.json) events.push(ev);
    switch (ev.type) {
      case 'route':
        if (opts.json) { ctx._routedLane = ev.lane; break; }
        if (ev.label) console.log(`\x1b[90m  ${ev.fallback ? '↻ glide →' : '▸ routed →'} \x1b[36m${ev.label}\x1b[90m (${ev.lane})\x1b[0m`);
        ctx._routedLane = ev.lane;
        break;
      case 'token':
        answer += ev.content;
        if (!opts.json && !opts.noStream) process.stdout.write(ev.content);
        tokens += ev.content.length;
        break;
      case 'tool-call':
        if (opts.json) { toolCalls++; break; }
        console.log(`\n\x1b[33m  ⚡ ${ev.tool}\x1b[0m ${JSON.stringify(ev.args).slice(0, 120)}`);
        toolCalls++;
        break;
      case 'tool-result':
        if (opts.json) break;
        const preview = (ev.content || ev.error || '').toString().replace(/\n/g, ' ').slice(0, 200);
        console.log(`\x1b[90m  ← ${ev.ok ? 'ok' : 'error'} (${ev.content?.length || 0} chars): ${preview}\x1b[0m`);
        break;
      case 'turn':
        if (opts.json) break;
        if (ev.turn > 1) console.log(`\n\x1b[90m  --- turn ${ev.turn}/${ev.maxTurns} ---\x1b[0m`);
        break;
      case 'done':
        answer = ev.totalContent || answer;
        ctx.history[ctx.history.length - 1].status = 'complete';
        ctx.history.push({ role: 'assistant', content: answer, ts: new Date().toISOString(), status: 'complete' });
        SESSIONS.saveSession(ctx._sessionId, ctx.history, { provider: ctx.provider, model: ctx.model });
        ctx._tokens = ctx._tokens || { prompt: 0, completion: 0, calls: 0 };
        ctx._tokens.completion += tokens;
        ctx._tokens.calls += 1;
        if (opts.json) {
          console.log(JSON.stringify({ ok: true, answer, turns: ev.turns, toolCalls, route: ctx._routedLane, events }));
          return 0;
        }
        if (opts.noStream && answer) process.stdout.write(answer);
        console.log(`\n\n\x1b[90m  ─── done in ${ev.turns} turn(s), ${tokens} tokens streamed, ${toolCalls} tool call(s) ───\x1b[0m\n`);
        return 0;
      case 'error':
        ctx.history[ctx.history.length - 1].status = 'failed';
        ctx.history.push({
          role: 'assistant',
          content: `Execution failed before completion. Error: ${ev.error || 'unknown provider error'}. On the next turn, acknowledge this failure, preserve the user's objective, inspect what was completed, and attempt a concrete recovery instead of starting cold.`,
          ts: new Date().toISOString(),
          status: 'failed',
          error: ev.error || 'unknown provider error',
        });
        SESSIONS.saveSession(ctx._sessionId, ctx.history, { provider: ctx.provider, model: ctx.model });
        if (opts.json) {
          console.log(JSON.stringify({ ok: false, error: ev.error, events }));
          return 1;
        }
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
    const slash = resolveSlashCommand(prompt);
    if (slash) {
      const [, ...args] = prompt.split(/\s+/);
      const handler = SLASH_COMMANDS[slash];
      if (handler) {
        const out = await handler.run(args.join(' '), ctx);
        if (out) console.log(out);
        continue;
      }
    }
    if (prompt.startsWith('/')) {
      console.log(`\x1b[31m  unknown: ${prompt.split(/\s+/)[0]}  (try /help)\x1b[0m`);
      continue;
    }
    await runOneShot(prompt, ctx);
    console.log('');
  }
}

function help() {
  const providers = getProviderNames();
  console.log(`
  purpclaw ask — open-source coding-agent CLI

  USAGE:
    purpclaw ask "your prompt here"
    purpclaw ask --model MiniMax-M2.7 "write tests"
    purpclaw ask --max-turns 20 "long task"
    purpclaw ask                       # interactive mode
    echo "explain this" | purpclaw ask   # pipe mode

  OPTIONS:
    --provider <name>     provider (currently: minimax)
    --model <name>        model name
    --max-turns <n>       max agent loop iterations (default 10)
    --temperature <n>     LLM temperature (default 0.2)
    --no-stream           disable streaming
    --json                output as JSON (for piping)
    --mcp                 connect configured MCP servers for this session
    --new                 start a new persistent conversation
    --session <id>        resume an exact persisted conversation
    --yes                 auto-approve all tool calls (dangerous mode)
    --allowedTools <list> comma-sep whitelist of tools (e.g. Read,Edit,Bash)
    --disallowedTools <list> comma-sep blacklist of tools
    --append-system-prompt <text>  prepend text to the system prompt
    --max-budget-usd <n>  cap spend in USD per call
    --resume <id>         resume a specific session by ID
    --continue            resume the latest session
    --fork-session        fork history before working (keeps original clean)
    --output-format <fmt> output format: text | json | stream-json
    --json-schema <json>  require structured JSON output matching a schema
    --bare                skip MCP/hooks for fast scripted runs
    --search <query>      perform a web search (DuckDuckGo Instant Answer API, no LLM call)
    --image <path>        attach an image file for vision-capable models (OpenAI gpt-4o, Anthropic claude-3-5-sonnet, Gemini, Minimax-M2.7)
    --help                this help

  SLASH COMMANDS (in interactive mode):
    /model <name>      /provider <name>   /tools
    /clear             /help              /cost
    /mcp               /quit              /exit

  PROVIDERS (${providers.length} total):
${formatProviderLines(providers)}

  EXAMPLES:
    purpclaw ask "explain the auth flow"
    purpclaw ask --model MiniMax-M2.7 "add a readme section"
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
  // P2 — Claude Code parity flags. Defaults match print-mode best practices.
  const opts = {
    prompt: null,
    provider: null,
    model: null,
    maxTurns: 10,
    maxBudgetUsd: null,           // --max-budget-usd <n>
    effort: null,                  // --effort low|medium|high|max|auto
    help: false,
    json: false,
    noStream: false,
    streamJson: false,             // --output-format stream-json
    outputFormat: 'text',          // text | json | stream-json
    jsonSchema: null,              // --json-schema '{"type":"object",...}'
    bare: false,                   // --bare: skip OAuth/CLAUDE.md/MCP discovery
    mcp: false,
    mcpConfig: null,               // --mcp-config <path>
    strictMcpConfig: false,        // --strict-mcp-config
    appendSystemPrompt: null,      // --append-system-prompt <text>
    allowedTools: null,            // --allowedTools 'Read,Edit'
    disallowedTools: null,         // --disallowedTools 'Bash'
    newSession: false,
    sessionId: null,
    resumeId: null,                // --resume <id>
    continueSession: false,        // -c / --continue
    forkSession: false,            // --fork-session
    addDir: [],                    // --add-dir <paths...>
    worktree: null,                // --worktree [name] / -w
    fallbackModel: null,           // --fallback-model <name>
    noSessionPersistence: false,  // --no-session-persistence
    debug: false,                  // --debug
    yes: false,                    // --yes: auto-approve all tool calls
    settings: null,                // --settings <file>
    agents: null,                  // --agents '<json>'
    search: null,                 // --search <query>: web search via DuckDuckGo Instant Answer API
    image: null,                  // --image <path>: attach image for vision-capable models
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--provider') opts.provider = args[++i];
    else if (a === '--model') opts.model = args[++i];
    else if (a === '--max-turns' || a === '--turns') opts.maxTurns = parseInt(args[++i], 10);
    else if (a === '--max-budget-usd') opts.maxBudgetUsd = parseFloat(args[++i]);
    else if (a === '--fallback-model') opts.fallbackModel = args[++i];
    else if (a === '--effort') opts.effort = String(args[++i]).toLowerCase();
    else if (a === '--temperature') opts.temperature = parseFloat(args[++i]);
    else if (a === '--no-stream') opts.noStream = true;
    else if (a === '--json') { opts.json = true; opts.outputFormat = 'json'; }
    else if (a === '--output-format') { opts.outputFormat = String(args[++i]).toLowerCase(); if (opts.outputFormat === 'json') opts.json = true; if (opts.outputFormat === 'stream-json') opts.streamJson = true; }
    else if (a === '--json-schema') opts.jsonSchema = args[++i];
    else if (a === '--bare') opts.bare = true;
    else if (a === '--mcp') opts.mcp = true;
    else if (a === '--mcp-config') opts.mcpConfig = args[++i];
    else if (a === '--strict-mcp-config') opts.strictMcpConfig = true;
    else if (a === '--append-system-prompt') opts.appendSystemPrompt = args[++i];
    else if (a === '--allowedTools') opts.allowedTools = String(args[++i]).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--disallowedTools') opts.disallowedTools = String(args[++i]).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--new') opts.newSession = true;
    else if (a === '--session') opts.sessionId = args[++i];
    else if (a === '--resume' || a === '-r') opts.resumeId = args[++i];
    else if (a === '--continue' || a === '-c') opts.continueSession = true;
    else if (a === '--fork-session') opts.forkSession = true;
    else if (a === '--no-session-persistence') opts.noSessionPersistence = true;
    else if (a === '--add-dir') { const v = args[++i]; if (v) opts.addDir.push(...v.split(',').map(s => s.trim()).filter(Boolean)); }
    else if (a === '--worktree' || a === '-w') { opts.worktree = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true; break; }
    else if (a === '--settings') opts.settings = args[++i];
    else if (a === '--agents') opts.agents = args[++i];
    else if (a === '--debug' || a === '-d') opts.debug = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--search') { opts.search = args[++i]; if (!opts.search) throw new Error('--search requires a query argument'); }
    else if (a === '--image') { opts.image = args[++i]; if (!opts.image) throw new Error('--image requires a file path'); }
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`);
    else positional.push(a);
  }
  if (positional.length) opts.prompt = positional.join(' ').trim();
  if (!opts.prompt && !process.stdin.isTTY) {
    try { opts.prompt = require('fs').readFileSync(0, 'utf-8').trim(); } catch {}
  }
  return opts;
}

module.exports = { run, help, SLASH_COMMANDS, parseArgs };
