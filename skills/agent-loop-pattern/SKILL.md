---
name: agent-loop-pattern
description: How to build a Claude Code-style coding-agent loop — LLM call → parse tool calls → execute tools → send results back → repeat. Tools (read/write/edit/shell/grep/code-search/web-fetch/git), slash commands, multi-provider, streaming, agent-friendly tool schemas. The PURPCLAW / open-source-CLI pattern.
when_to_use: Building any coding-agent CLI or service that has LLM + tool-call surface; building a Claude Code / Codex alternative; wiring an LLM to a filesystem; adding multi-turn tool-using capabilities to an existing chat; designing tool schemas for LLM use
---

# Agent Loop Pattern — Claude Code-style Coding Agent

The architecture behind `purpclaw ask` and any LLM-backed coding agent
that needs to actually DO things, not just talk about them. The loop:
LLM call → parse tool calls → execute → feed results back → loop until
the LLM says it's done.

## Why this is a class of work

Every LLM chat interface in 2026 has the same shape. Whether it's Claude
Code, Codex, Cursor's CLI, or a custom agent, the pieces are the
same: streaming LLM call, tool-call parsing, tool execution, history
management, multi-provider fallback, slash commands for in-prompt
control, LLM-friendly tool schemas. Build it once, build it right.

## The four pieces

### 1. LLM provider abstraction (`lib/llm-provider.js`)

Provider-agnostic chat + stream. Same call shape, multiple backends.
**Critical lesson: when the user passes `--provider X` but doesn't pass
`--model`, the override block must reset `cfg.model` to the new
provider's `defaultModel`.** Otherwise the new provider gets asked
for a model it doesn't have. The ask.js pattern:

```js
if (opts.provider && PROVIDERS[opts.provider]) {
  const p = PROVIDERS[opts.provider];
  cfg.baseUrl = p.baseUrl;
  cfg.apiKey  = ...;
  cfg.model   = opts.model || p.defaultModel;  // <-- THIS LINE
}
```

17 providers are wired: `openai, kimi, minimax, groq, deepseek,
openrouter, together, mistral, ollama, lmstudio, anthropic, gemini,
custom, github-models, codex, codex-oauth, atomic-chat`. The list is
the `PROVIDERS` map at the top of `lib/llm-provider.js` — add new
providers there.

### 2. Tool registry (`lib/tools/index.js`)

Each tool is `{ name, description, inputSchema, execute(args) }`. The
registry exposes `list()` and `invoke(name, args)`. The LLM gets the
list in its system prompt and emits `{"tool": "...", "args": {...}}`
JSON in its output; the loop parses that, calls `invoke`, and feeds
the result back.

**Critical: design tool schemas for the lowest-common-denominator LLM,
not the ideal API consumer.** LLMs default to:
- `file` instead of `path` → accept both
- `old`/`new` instead of `find`/`replace` → accept both
- `command` for shell tools → just `command`
- `content` for file content → just `content`
- `url` for web tools → just `url`

The 8 tools in `lib/tools/index.js`:
- `read` — file contents, with `offset` + `limit`
- `write` — create/overwrite, accepts `path` or `file`
- `edit` — find/replace, accepts `find` or `old`, `replace` or `new`
- `shell` — `trackedSpawn` of cmd.exe / sh, hard 30s timeout by default
- `grep` — regex search, ripgrep with node fallback
- `code-search` — semantic + symbol search over the codebase
- `web-fetch` — HTTPS GET, 15s timeout, 100k char cap
- `git` — read-only ops (status/diff/log/branch)

### 3. Agent loop (`lib/agent-loop.js`)

The core. Iterates: send messages → stream LLM → parse tool calls →
execute → append results to messages → loop. Configurable max turns
(default 10). Yields events to the CLI:
- `turn` → { turn, maxTurns }
- `token` → { content, model }  (real-time token from LLM)
- `turn-done` → { text, calls, fullContent }
- `tool-call` → { tool, args }
- `tool-result` → { tool, ok, content, error }
- `done` → { turns, totalContent, maxTurnsHit? }
- `error` → { error }

```js
const { runAgent } = require('./lib/agent-loop');
for await (const ev of runAgent({ prompt, provider: 'ollama' })) {
  if (ev.type === 'token')    process.stdout.write(ev.content);
  if (ev.type === 'tool-call') console.log(`⚡ ${ev.tool} ${JSON.stringify(ev.args)}`);
  if (ev.type === 'done')      console.log(`done in ${ev.turns} turns`);
}
```

**Tool-call parsing is regex-based on the LLM's raw output, not on a
structured API.** Many models support the OpenAI tool-call JSON
schema, but the regex approach works across all providers without
per-provider plumbing. The pattern:

```js
const re = /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
while ((m = re.exec(text)) !== null) {
  const args = JSON.parse(m[2]);
  calls.push({ tool: m[1], args, raw: m[0] });
  cleanText = cleanText.replace(m[0], '');
}
```

For stronger models, also support `<tool_call>{"name": ..., "arguments": ...}</tool_call>` (the Qwen/Codex XML-ish form) and OpenAI's `tool_calls` array.

### 4. CLI surface (`lib/commands/ask.js`)

The user-facing entry point. Handles:
- `purpclaw ask "your prompt here"` — one-shot mode
- `purpclaw ask --provider X --model Y "..."` — explicit provider/model
- `purpclaw ask` — interactive mode (readline)
- `purpclaw ask /tools` / `/help` / `/model` / `/provider` / `/clear` / `/quit` / `/cost` — slash commands, short-circuit the LLM

**Critical: support both `/foo` and `foo` for slash commands.** git-bash
on Windows munges `/tools` to `C:/Program Files/Git/tools`. Users will
forget to quote. Register both forms:

```js
const SLASH_ALIASES = {
  'model': '/model', 'provider': '/provider', 'tools': '/tools',
  'help': '/help', 'quit': '/quit', 'exit': '/exit',
  'clear': '/clear', 'cost': '/cost', 'mcp': '/mcp',
};
```

Slash commands run synchronously, no LLM call. They mutate the
context (`ctx.model`, `ctx.provider`, `ctx.history`) and return a
string for display.

## System prompt design

The system prompt does three things:
1. **Set the tone** — terse, no fluff, "be concise. No 'Great question!'"
2. **Tell the LLM what it can do** — list each tool with a one-line description
3. **Set the working directory** — `cwd: /path/to/project`

```js
const SYSTEM_PROMPT = `You are PURPCLAW, an open-source coding agent running
in the user's terminal. You help with software engineering tasks:
read files, write code, run shell commands, search code, fetch URLs,
manage git.

# Tone
- Be concise. No fluff. No "Great question!" or "I'd be happy to help!".
- Show the work, then the answer.
- Use code blocks for code, paths, and commands.

# Tools
- You have access to tools. When you need to inspect a file, run a
  command, etc., emit a tool call.
- Tool calls: { "tool": "<name>", "args": { ... } }
- After tool results, decide the next step. Keep going until the task
  is done or you need clarification.

# Working directory
- The current working directory is the project root. Use relative paths
  when convenient, absolute when not.

# Limits
- Be terse. Tokens are money.
- Don't repeat the user's question back to them.
- Don't explain what a tool does unless the user asked.
`;
```

The tool list is generated from `TOOLS.list()` at runtime, so adding a
new tool automatically updates the system prompt.

## Multi-provider

`lib/llm-provider.js` already handles 17 providers with auto-fallback.
Key patterns:
- OpenAI-compatible format: most providers (openai, openrouter,
  github-models, codex, ollama, lmstudio, custom, atomic-chat, mistral,
  groq, deepseek, together, kimi, minimax)
- Anthropic format: native
- Gemini format: native

When the LLM ID looks like `provider/model` (e.g. `z-ai/glm-4.5-air:free`
on OpenRouter), auto-route to OpenRouter. See
`sse-streaming-pattern` pitfall #8 for the full pattern.

## Streaming

The agent loop yields `token` events as the LLM streams. The CLI
writes them to stdout as they arrive. Real Claude Code UX.

For the API surface (SSE), see `sse-streaming-pattern` skill — same
token events, different transport (SSE vs in-process async iterator).

## Pitfalls

1. **Provider override must reset model.** If the user passes
   `--provider` but the env has `LLM_MODEL`, the override block must
   set `cfg.model = opts.model || p.defaultModel`. Otherwise the new
   provider gets asked for a model it doesn't have. (See "Critical" note
   in the LLM Provider section above.)
2. **Slash commands short-circuit the LLM.** They run synchronously,
   no streaming. Don't put them through the agent loop — it's a
   waste of LLM calls and a confusing UX.
3. **Both `/foo` and `foo` forms.** git-bash on Windows munges
   leading slashes. Register both. Same for `--foo` and `foo` as flags
   if you support both.
4. **Tool schemas should accept aliases.** LLMs default to `file`
   instead of `path`, `old` instead of `find`, etc. Accept both. The
   inputSchema can list both as valid properties; the `execute` fn
   picks whichever is set.
5. **The agent loop must yield events, not return a final string.**
   Yielding lets the CLI render progress in real time. Returning a
   final string makes the user wait. Yes, the event-based API is
   harder to write. It's worth it.
6. **Tool result messages must have a stable shape.** The LLM
   receives `{"role": "tool", "name": "...", "content": "..."}`. If
   the shape changes between calls, the LLM gets confused. Keep
   `content` as a string (stringify non-string results).
7. **The LLM might emit garbage tool calls.** Wrap `JSON.parse` in
   a try/catch, log the malformed input, and continue the loop.
   Don't crash the whole session on one bad parse.
8. **Max-turns prevents infinite loops.** Default 10. Some tasks need
   20-30. Long autonomous runs need 50+. Expose as `--max-turns` and
   also as `/max-turns` slash command.
9. **Streaming output is critical for UX.** Without it, the user
   sees nothing for 5-30 seconds, then a wall of text. With it, the
   text appears as the LLM types. Claude Code's UX is the gold
   standard here.
10. **Bash / git-bash on Windows munges `/foo` args.** A leading
    slash in an arg is interpreted as a path. See
    `child-registry-no-spawn-leak` for the full Layer-1 / Layer-2
    leak context.
11. **Patch tool mangles `\r\n` in regex/string literals.** Use
    `String.fromCharCode(10)` / `String.fromCharCode(13)` for
    embedded newlines when writing regex. See
    `sse-streaming-pattern` pitfall #13.

## Verification

```bash
# Smoke: simple one-shot
purpclaw ask --provider ollama "say hi in 5 words"
# → streams tokens, exits

# Tools: read + answer
purpclaw ask --provider ollama "read package.json and tell me the version"
# → emits {"tool": "read", ...}, gets content, answers

# Write
purpclaw ask --provider ollama "create a file at /tmp/x.txt with 'hello'"
# → emits write tool call, file appears

# Slash commands
purpclaw ask tools          # lists all 8 tools, no LLM call
purpclaw ask help           # lists slash commands
purpclaw ask model qwen2.5:3b   # switches model
```

Watch the output for: streamed tokens appearing in real-time, tool
calls prefixed with `⚡`, tool results prefixed with `←`, final
`done in N turns` summary.

## Where it's wired

- `lib/llm-provider.js` — multi-provider abstraction (17 providers)
- `lib/tools/index.js` — 8-tool registry (12KB)
- `lib/agent-loop.js` — Claude Code-style loop with tool parsing (7KB)
- `lib/commands/ask.js` — CLI surface with slash commands (9KB)
- `bin/purpclaw.js:4055` — `case 'ask': return loadCmd('ask').run(args, ctx)`

## Related skills

- `sse-streaming-pattern` — same token events over SSE for the API
- `child-registry-no-spawn-leak` — safe spawn patterns for tool execution
- `karpathy-autoresearch-3file-contract` — uses agent loop ideas for
  the training ratchet
