# PurpClaw

> **Open-source coding-agent CLI.** Terminal-first. Cloud + local. One workflow, many brains.
> Last updated: 2026-06-06

PurpClaw is a Claude Code-style coding agent that runs in your terminal. It reads files, edits code, runs shell commands, searches code semantically, and dispatches work to specialized agents — all from a single CLI. Switch between 17 LLM providers (OpenAI, Anthropic, Gemini, GitHub Models, Codex, Ollama, Atomic Chat, ...) without changing your workflow.

```
$ purpclaw ask "what does the auth flow look like?"

  ╔════════════════════════════════════════════════════════╗
  ║  PURPCLAW — open-source coding-agent CLI               ║
  ╚════════════════════════════════════════════════════════╝
  provider: ollama
  model:    auto
  cwd:     E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW
  tools:   8 available (read, write, edit, shell, grep, code-search, web-fetch, git)
  type /help for slash commands, Ctrl+C to exit

{"tool": "grep", "args": {"pattern": "auth|login|token", "path": "lib/"}}
  ⚡ grep {...}
  ← ok (12 matches)

The auth flow goes through lib/auth/ which uses JWT tokens issued
by the /api/login endpoint and verified by the gateway middleware.
─────────────────────────────────────────────────────────
done in 1 turn(s), 234 tokens streamed, 1 tool call(s)
```

## Why PurpClaw

- **No lock-in.** 17 providers, all interchangeable. Switch mid-session with `/provider`. Use Ollama for free local runs, OpenAI for production, GitHub Models for free hosted.
- **Tool surface.** 8 built-in tools (read, write, edit, shell, grep, code-search, web-fetch, git) plus unlimited MCP servers. Your existing tools, your existing workflows.
- **Streaming.** Every chat streams token-by-token, just like Claude Code. No more waiting 30s for a wall of text.
- **Real agent loop.** LLM emits a `{"tool": ..., "args": ...}` JSON line, PurpClaw executes the tool, sends the result back, loops. Multi-step tasks just work.
- **No fakery.** No mocks, no stubs, no silent fallbacks. If something fails, you see the real error.

## Install

```bash
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw
npm install
# add your API keys to .env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
# or
echo "OPENAI_API_KEY=sk-..." >> .env
# or just use ollama — free, local
```

## Quickstart

```bash
# One-shot
purpclaw ask "explain the auth flow"

# Specify a provider
purpclaw ask --provider ollama "write tests for the new feature"
purpclaw ask --provider anthropic --model claude-3-5-haiku "review this PR"

# Pipe mode
echo "what's the diff?" | purpclaw ask

# Interactive
purpclaw ask
# purp ❯ fix the login bug
# purp ❯ /tools
# purp ❯ /provider github-models
# purp ❯ /quit
```

## Supported providers

| Provider | Auth | Notes |
|---|---|---|
| `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, o1, etc. |
| `anthropic` | `ANTHROPIC_API_KEY` | claude-3.5-sonnet, claude-3-haiku, etc. |
| `gemini` | `GEMINI_API_KEY` | gemini-2.5-flash, gemini-2.5-pro |
| `github-models` | `GITHUB_TOKEN` | Free tier, all major LLMs |
| `codex` | `OPENAI_API_KEY` | gpt-5-codex via OpenAI API |
| `codex-oauth` | `CODEX_OAUTH_TOKEN` | OAuth-flow token from Codex CLI |
| `ollama` | (none) | Local. `qwen2.5:3b`, `llama3`, etc. |
| `lmstudio` | (none) | Local GGUF |
| `openrouter` | `OPENROUTER_API_KEY` | All models, free tier available |
| `groq` | `GROQ_API_KEY` | Fast inference |
| `deepseek` | `DEEPSEEK_API_KEY` | DeepSeek-Coder, etc. |
| `kimi` | `KIMI_API_KEY` | Moonshot Kimi K2 |
| `together` | `TOGETHER_API_KEY` | Open models, fast |
| `mistral` | `MISTRAL_API_KEY` | mistral-large, etc. |
| `minimax` | `MINIMAX_API_KEY` | MiniMax models |
| `atomic-chat` | `ATOMIC_CHAT_API_KEY` | Atomic Chat (configurable endpoint) |
| `custom` | (env) | Any OpenAI-compatible endpoint |

## Slash commands

| command | description |
|---|---|
| `/model <name>` | switch model mid-session |
| `/provider <name>` | switch provider mid-session |
| `/tools` | list all available tools (built-in + MCP) |
| `/mcp` | list configured MCP servers and their tools |
| `/agents` | list available swarm agents |
| `/clear` | clear conversation history |
| `/help` | show all slash commands |
| `/cost` | show token / cost usage |
| `/quit`, `/exit` | exit |

**Bash compat:** all slash commands also work without the leading `/` (e.g. `tools`, `help`) for environments where `/foo` gets path-expanded (git-bash on Windows).

## Tools

| tool | description |
|---|---|
| `read` | read a file (with line offset + limit) |
| `write` | write content to a file |
| `edit` | find/replace edit (requires unique `find` string) |
| `shell` | run a shell command, returns stdout/stderr |
| `grep` | regex search across files (ripgrep, with node fallback) |
| `code-search` | semantic + symbol search over the codebase |
| `web-fetch` | fetch a URL and return text content |
| `git` | read-only git ops (status, diff, log, branch) |
| `mcp__<server>__<tool>` | MCP-backed tools (loaded from `.purpclaw/mcp.json`) |

## MCP (Model Context Protocol)

PurpClaw is an MCP **client**. Configure any MCP server and its tools become first-class tools the agent can call.

### Default: OmniCode MCP (code analysis engine)

PurpClaw ships with **OmniCode** as the default MCP server — a full code analysis engine that indexes your project and provides 42 tools for semantic search, symbol resolution, dependency mapping, blast radius analysis, dead code detection, and more. This saves massive token burn by letting the agent query the index instead of reading every file.

OmniCode is auto-configured in `.purpclaw/mcp.json`:

```json
{
  "servers": {
    "omnicode": {
      "command": "node",
      "args": ["path/to/omnicode-mcp/dist/server.js"],
      "env": {
        "OMNICODE_ROLE": "agent",
        "OMNICODE_TOOL_MODE": "full"
      }
    }
  }
}
```

Index your project:
```bash
cd path/to/omnicode-mcp
node dist/cli.js index /path/to/your/project
```

Then run `purpclaw ask` — the agent can use `mcp__omnicode__search_symbols`, `mcp__omnicode__get_file_slice`, `mcp__omnicode__dependency_map`, and 39 more tools.

### Custom MCP servers

Create `.purpclaw/mcp.json` (or `~/.config/purpclaw/mcp.json`):

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\me\\code"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/me"]
    }
  }
}
```

Then run `purpclaw ask` — the MCP tools show up in the tool list as `mcp__filesystem__read_file`, `mcp__github__create_issue`, etc.

## Swarm mode

When the user picks the `swarm` route, a single message fans out to multiple specialized agents in parallel (Planner, Builder, Researcher, Auditor, ...). Each agent streams its own tokens. A synthesizer merges the best of each into a final answer.

```bash
# via the API
curl -X POST localhost:7780/api/chat/swarm \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message": "add a real-time event timeline"}'
```

## Architecture

```
purpclaw (CLI)
   ├── lib/llm-provider.js     17 providers, single interface
   ├── lib/agent-loop.js       Claude Code-style tool-calling loop
   ├── lib/tools/index.js      8 built-in tools + MCP bridge
   ├── lib/mcp.js              Model Context Protocol client
   ├── lib/child-registry.js   safe spawn lifecycle (no leaks)
   ├── lib/commands/ask.js     CLI surface + slash commands
   └── unified_api.js          optional HTTP API + WebUI
```

## Open-source promise

- **License:** MIT
- **No telemetry** by default
- **No vendor lock-in** — switch providers, switch tools, fork the whole thing
- **Auditable** — every spawn is tracked, every exit clean

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor guide. New providers can be added by extending `lib/llm-provider.js`'s `PROVIDERS` registry. New tools are just modules in `lib/tools/`.

## License & Sponsorship

**License:** MIT — forever free, irrevocably open.

**Support the swarm:** PurpClaw is built by Eddie & the swarm, full-time, daily. If it saves your team money on token burn (OmniCode) or unblocks your stack (ratchet training), consider sponsoring.

| Tier | Price | Perks |
|------|-------|-------|
| 🧪 Pilot | $200/mo | Logo on README, early access to new providers/tools, monthly status update |
| 📈 Growth | $500/mo | All above + roadmap priority voting, quarterly call with the maintainer |
| 🏛 Strategic | $1,000+/mo | All above + dedicated support channel, co-marketing, influence over feature direction |

*(GitHub Sponsors and Open Collective pages coming soon — hit the repo's Sponsor button to express interest.)*
