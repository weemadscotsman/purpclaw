# Contributing to PurpClaw

PurpClaw is a Claude Code-style open-source coding agent CLI. This guide covers how to add providers, tools, MCP integrations, and slash commands.

## Adding a new LLM provider

Providers live in `lib/llm-provider.js`. To add a new one:

1. Add a config block to `PROVIDERS`:
   ```js
   'my-provider': {
     baseUrl      : 'https://api.example.com/v1',
     defaultModel : 'my-model',
     authHeader   : 'Bearer',     // or 'x-api-key', 'key', etc.
     format       : 'openai',     // or 'anthropic', 'gemini'
     apiKey       : 'default-key', // optional fallback
   },
   ```
2. Add env aliases in `PROVIDER_ENV_ALIASES`:
   ```js
   'my-provider': {
     apiKey: ['MY_PROVIDER_API_KEY'],
     model:  ['MY_PROVIDER_MODEL'],
     baseUrl:['MY_PROVIDER_BASE_URL'],
   },
   ```
3. Test: `purpclaw ask --provider my-provider "hi"`

If your provider needs a non-OpenAI format (like Anthropic's `messages` API or Gemini's `generateContent`), set `format: 'anthropic'` or `format: 'gemini'` and add a `chatAnthropic` / `chatGemini` style adapter in `lib/llm-provider.js`.

## Adding a new tool

Tools live in `lib/tools/index.js`. To add a new one:

```js
registry.register({
  name: 'my-tool',
  description: 'Short description (LLM reads this).',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'what this is' },
    },
    required: ['param1'],
  },
  execute: async (args) => {
    // do the work
    return { result: '...' };
  },
});
```

**Conventions:**
- Use `path` (or accept `file` as alias) for file paths — LLMs often default to `file`
- Use `find`/`replace` (or `old`/`new` as aliases) for edit operations
- Truncate large outputs to 100k chars max
- Use `trackedSpawn` from `lib/child-registry.js` for any subprocess
- Return `{ ok: true, content: ... }` on success or `{ ok: false, error: ... }` on failure

## Adding a slash command

Slash commands live in `lib/commands/ask.js` in the `SLASH_COMMANDS` map. They short-circuit the agent loop and run locally — no LLM call.

```js
'/mycommand': { description: 'does X', run: (args, ctx) => 'output' },
```

For async commands (like `/mcp` which needs to load server config):
```js
'/mycommand': { description: '...', run: async (args, ctx) => { const r = await something(); return r; } },
```

The `args` string is the rest of the line after the command. `ctx` is the shared session context (`{ provider, model, history, maxTurns }`).

**Bash compat:** all slash commands also work without the leading `/`. Update `SLASH_ALIASES` to add a no-slash alias.

## Adding an MCP server integration

MCP servers are configured by the user in `.purpclaw/mcp.json` — no code change needed. The PurpClaw MCP client auto-discovers tools from each server.

If you want to **bundle** a specific MCP server with PurpClaw, document the install in `README.md` and add a sample config snippet.

## Adding an agent (swarm mode)

Swarm agents live in `unified_api.js` `handleChatSwarm`. The default roster is `Planner, Researcher, Builder`. To add a new specialist:

1. Add to `defaultAgents` in `handleChatSwarm`:
   ```js
   { id: 'auditor', role: 'Auditor', emoji: '🔍',
     system: 'You are Quill Auditor. Review the proposed change for security, performance, and code quality. Be specific and ruthless.',
     model: undefined },
   ```
2. Update the synthesizer prompt to know about the new specialist.

## Testing locally

```bash
# Run a quick smoke test
node bin/purpclaw.js ask --provider ollama "say hi"

# Run a tool-using task
node bin/purpclaw.js ask --provider ollama "read package.json and tell me the version"

# Test the full swarm
curl -N -X POST localhost:7780/api/chat/swarm \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message": "refactor the spawn patterns"}'
```

## Coding style

- No emoji in code comments. Emoji in user-facing output is fine.
- No magic numbers. Constants at the top of the file.
- No silent fallbacks. If something fails, surface the error.
- No mocks or stubs. Real providers, real responses, real exits.
- All subprocess spawns go through `lib/child-registry.js` (no raw `spawn`).
- No `detached: true`. No `shell: true` unless intentional (and documented).
- All env-loading via `dotenv` (auto-loaded by `lib/llm-provider.js`).

## Pull request flow

1. Fork + branch
2. Make your change + add a smoke test to `tests/smoke.js` (or new test file)
3. `node --check <files>` must pass
4. PR description should include: what changed, why, how to test
5. Tag `@maintainers` for review

## License

MIT. By contributing, you agree your work is MIT-licensed.
