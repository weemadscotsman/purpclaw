---
name: open-source-coding-agent-cli
description: How PURPCLAW's `purpclaw ask` command is built — the open-source coding-agent CLI (Claude Code-style). 17 providers, 8 built-in tools, MCP integration, slash commands, streaming agent loop, swarm mode. The launch plan + architecture for shipping PURPCLAW as a real open-source product.
when_to_use: Adding a new provider, tool, or slash command to the CLI; building the TUI; wiring MCP servers; understanding the agent loop architecture; writing docs for the CLI surface
---

# Open-Source Coding-Agent CLI — Architecture & Launch Plan

## The thesis (from Eddie, 2026-06-06)

> Terminal-first. Cloud + local. One workflow, many brains. Open-source.
> Make PURPCLAW the `git` of AI agents.

PURPCLAW is a Claude Code-style open-source coding agent. The `git` of AI agents means: ubiquitous, forkable, no lock-in, multi-provider, terminal-native.

## Architecture

```
purpclaw (CLI binary, bin/purpclaw.js)
   ↓ case 'ask'
lib/commands/ask.js                (CLI surface: parse args, slash cmds, banner, dispatch)
   ↓
lib/agent-loop.js                  (Claude Code-style tool-calling loop)
   ↓
lib/llm-provider.js                (17 providers, single chat/streamChat interface)
   ↓
ANY OpenAI-compatible, Anthropic, or Gemini endpoint
   ↑ token events
lib/agent-loop.js                  (parses {"tool": "name", "args": {...}} from LLM output)
   ↓
lib/tools/index.js                 (8 built-in tools + MCP bridge)
   ↓
lib/mcp.js                         (Model Context Protocol client)
   ↓
ANY MCP server (filesystem, github, postgres, ...)
```

Sibling surfaces (same engine, different faces):
- `bin/purpclaw.js ask` — CLI (default)
- `unified_api.js /api/chat` — HTTP, used by the WebUI
- `scripts/tui.js` — full-screen ANSI terminal dashboard (cockpit)

## 17 providers (`lib/llm-provider.js`)

| provider | baseUrl | defaultModel | auth |
|---|---|---|---|
| openai | api.openai.com/v1 | gpt-4o-mini | OPENAI_API_KEY |
| anthropic | api.anthropic.com | claude-3-5-haiku | ANTHROPIC_API_KEY |
| gemini | generativelanguage.googleapis.com | gemini-2.5-flash | GEMINI_API_KEY |
| github-models | models.inference.ai.azure.com | gpt-4o-mini | GITHUB_TOKEN |
| codex | api.openai.com/v1 | gpt-5-codex | OPENAI_API_KEY |
| codex-oauth | api.openai.com/v1 | gpt-5-codex | CODEX_OAUTH_TOKEN |
| ollama | localhost:11434/v1 | qwen2.5:3b | (none) |
| lmstudio | localhost:1234/v1 | local-model | (none) |
| openrouter | openrouter.ai/api/v1 | claude-3.5-haiku | OPENROUTER_API_KEY |
| groq | api.groq.com/openai/v1 | llama-3.3-70b | GROQ_API_KEY |
| deepseek | api.deepseek.com/v1 | deepseek-chat | DEEPSEEK_API_KEY |
| kimi | api.moonshot.cn/v1 | kimi-k2-5 | KIMI_API_KEY |
| together | api.together.xyz/v1 | llama-3-70b | TOGETHER_API_KEY |
| mistral | api.mistral.ai/v1 | mistral-small | MISTRAL_API_KEY |
| minimax | api.minimax.io/v1 | MiniMax-M2.7 | MINIMAX_API_KEY |
| atomic-chat | configurable | atomic-chat-default | ATOMIC_CHAT_API_KEY |
| custom | LLM_BASE_URL env | default | LLM_API_KEY |

`--provider <name>` switches mid-call. `/provider` slash command switches mid-session.

## 110 tools (8 core + 49 PC control + 4 G0DM0D3 + 5 SmithNeo + 2 ChaosCampaign + 42 OmniCode MCP)

### 49 PC Control Tools (`lib/tools-pc.js`)
Full computer control surface: process, network, system, file ops, package management, services, browser, clipboard, audio, display, power, notifications, window management, user tools. Cross-platform (Windows cmd/powershell + macOS/Linux sh). Registered via `pcTools.registerAll(registry)`.

### Smith + Neo Adversarial Pair (5 tools)
`smith_inject`, `smith_random`, `neo_stabilize`, `neo_ledger`, `chaos_round`. Red-team/blue-team stress testing. Smith injects 8 attack techniques (refusal, truncation, hallucination, reorder, swap_args, null_output, delay, slow_leak). Neo detects with confidence scores (refusal 95%, hallucination 85%, null_output 99%) and auto-stabilizes. Ledger persists to `agent_work/smith-neo-ledger.json`.

### Chaos Campaigns (2 tools)
`chaos_campaign`, `chaos_status`. Systematic attack packs: output (20 attacks), memory (10), agent (8), provider (8). Reliability ledger tracks detection rate, repair rate, response time per technique. Persisted to `agent_work/reliability-ledger.json`. Full campaign results: 66 attacks, 45 detected, 17 repaired across 4 packs.

| tool | aliases | what it does |
|---|---|---|
| read | — | read file with offset/limit |
| write | `file` | write content to file |
| edit | `file`, `old`, `new` | find/replace (requires unique find) |
| shell | — | run shell command (tracked, time-bounded) |
| grep | — | regex search (ripgrep + node fallback) |
| code-search | — | semantic + symbol search over codebase |
| web-fetch | — | fetch URL → text |
| git | — | read-only git ops (status/diff/log/branch) |

Plus MCP-backed tools: `mcp__<server>__<tool>` from any configured MCP server.

**Conventions:**
- Path field: accept both `path` and `file` (LLMs default to `file`)
- Edit: accept both `find`/`replace` and `old`/`new`
- All subprocess spawns via `lib/child-registry.js` (no raw `spawn`)
- Output truncation: 100k chars max
- Return `{ ok, content }` or `{ ok, error }`

## 9 slash commands (`lib/commands/ask.js`)

| cmd | description |
|---|---|
| `/model <name>` | switch model |
| `/provider <name>` | switch provider |
| `/tools` | list built-in + MCP tools |
| `/mcp` | list MCP servers + tools |
| `/agents` | list swarm agents |
| `/clear` | clear history |
| `/help` | show commands |
| `/cost` | token / cost usage (placeholder) |
| `/quit`, `/exit` | exit |

**Bash compat:** all commands also work without `/` prefix (e.g. `tools`, `help`) for git-bash on Windows where `/foo` gets path-expanded.

Slash commands short-circuit the agent loop — they run locally, no LLM call.

## Agent loop (`lib/agent-loop.js`)

```
user prompt
   ↓
[LLM call #1] → text + tool calls
   ↓                  ↓
print text     execute tools
   ↓                  ↓
   ←  tool results  ←
   ↓
[LLM call #2] → text + tool calls
   ↓
...loop until LLM emits no tool calls (or maxTurns hit, default 10)
```

The LLM emits `{"tool": "<name>", "args": {...}}` JSON inline with its text response. `extractToolCalls()` parses with a permissive regex.

## MCP integration (`lib/mcp.js`)

PURPCLAW is an MCP **client** (not a server). Configure any MCP server via `.purpclaw/mcp.json`:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
    }
  }
}
```

`/mcp` slash command lists loaded servers. MCP tools show up as `mcp__<server>__<tool>` in the agent's tool list.

## G0DM0D3 Integration (added 2026-06-06)

Three engines from Elder Plinius's G0DM0D3 project were ported and registered as tools.

**Parseltongue** (`lib/parseltongue.js`, 432 lines): Input obfuscation engine. Detects trigger
words that cause model refusals and transforms them using 6 techniques × 3 intensities.

**AutoTune** (`lib/autotune.js`, 639 lines): Context-adaptive sampling parameter engine.
Detects 5 context types (code/creative/analytical/conversational/chaotic) and selects
optimal temperature, top_p, top_k, frequency_penalty, presence_penalty, repetition_penalty.

**STM** (`lib/stm.js`, 153 lines): Semantic Transformation Modules. hedgeReducer removes
"I think"/"perhaps", directMode removes preambles, casualMode converts formal→casual.

**GODMODE pipeline** (combined tool): Runs all three in sequence on a prompt.

All engines are pure JS with zero dependencies — no npm install needed. Registered as
4 tools in `lib/tools/index.js`: `parseltongue`, `autotune`, `stm`, `godmode`.

## Memory Architecture Thesis (the 7-layer model)

From external analyst on 2026-06-06:
> "Intelligence is memory plus process over time. Not a model. PurpClaw tries to wake up with a history, a timeline, scars, habits, procedures, beliefs, failures, and emotional weighting."

The 7 memory layers:
1. **Episodic** — conversations, events, agent outputs, timelines
2. **Semantic** — facts, concepts, project knowledge, user preferences
3. **Procedural** — workflows, repair patterns, skills, agent protocols
4. **Symbolic** — Datalog rules, inference: IF service dead THEN restart
5. **Temporal** — ordered event reasoning (Eddie bought A before B, sold C)
6. **Counterfactual** — failed experiments, dead branches, rejected hypotheses
7. **Emotional** — mood/priority engine: frustration, confidence, novelty weights

The architecture is more interesting than the manifest. The memory survives. Everything else — models, providers, agents, tools — becomes replaceable organs.

## Known pitfalls
and known limitations.

**Additional reference files:**
- `references/deepseek-provider.md` — DeepSeek v4 config, deprecated model migration, API key setup
- `references/enthea-visualizer.md` — ENTHEA WebGL visualizer integration, swarm telemetry mappings, recovery
- `references/webui-recovery.md` — step-by-step recovery when external agents corrupt CSS/build
- `references/path-sweep-methodology.md` — cross-reference service config vs actual running endpoints; fix port=0 spam, optional flags, health paths
- `references/dont-rebuild-rule.md` — Eddie's hard rule: check first, don't reinvent wheels; specific incidents and fix patterns

## 🚨 CRITICAL RULE: CHECK FIRST, NEVER REBUILD BLINDLY (see references/dont-rebuild-rule.md)

Eddie (2026-06-06): *"stop rebuilding shit u havenmt even check to see ifi t iecists already holty fuck man"*

1. CHECK FIRST: use `ls`, `grep`, `find`, `file`, `curl`, or OmniCode BEFORE touching anything.
2. Never delete `.next/` — most dashboard issues are port/zombie problems, not cache corruption.
3. Check ports: `netstat -ano | grep :PORT` before killing processes.
4. Check PM2: `pm2 list` before restarting.
5. Verify routes: `curl -I http://localhost:3000/ROUTE` before assuming missing.
6. Find assets: `find . -name "mochi*"` before building duplicates.
7. Verify the dashboard exists before nuking anything: the real dashboard is at `/mission` (2725-line MissionControl.tsx) — the homepage `/` is a stripped-down agent grid. Check BOTH routes before concluding anything is broken.
8. When the user says "my UI is broken" — the real issue is usually backend services offline, port conflicts, or wrong health-check paths, NOT CSS corruption. Fix the backend first, THEN check the frontend.

## 🚨 CRITICAL RULE: READ EVERY FILE, BUILD MENTAL MAP (see references/read-every-file-methodology.md)

Eddie (2026-06-06): *"never assume u read every line in every file so u figure it all out we dont pay to skim here bro"* and *"u gotta read them all find were all those connection are and build mental map of how its put together so u now if u cuttin off a vain or arm"*

When auditing folders, cleaning up, or investigating codebase structure:
1. Read EVERY file in the folder — not just `ls`, not just `head -5`. Use `read_file`.
2. Trace every connection: `require()`/`import` from files, references TO files, API endpoints, PM2 config, CLI dispatchers.
3. Build a mental map BEFORE deleting or moving anything.
4. Folder names lie. File names lie. Only content tells the story.
5. Grep is not enough — misses HTTP endpoints, URL paths, indirect references.
6. Cross-reference service ports: data-hooks.js port lists MUST match ecosystem.config.js.

During the 2026-06-06 root cleanup, the agent moved 18 folders based on grep counts and folder names. 12 had to be restored because they contained active features (accuracy_fish wired to harness, NEW MASTER UI theme system, podcast_studio, schemas for skill management, etc.). Only 4 were genuinely dead (cloned third-party repos, empty dirs, duplicate installers).

### Known pitfall: port=0 in service registry

`app/hooks/useMissionData.ts` has a `SERVICE_CONFIG` array with 30 services. Two entries had `port: 0` (Companion Chorus, Terminal Fly) because they have no HTTP health port. This causes the service-proxy to spam `GET /health` to port 0, producing `400 Bad Request` every polling cycle — hundreds of errors in the browser console. Fix: change `port: 0` to `port: -1` so the proxy skips polling entirely.

### Known pitfall: service health paths don't match what the proxy polls

The dashboard polls `/health` on every service port. But some services use different paths:
- unified_api.js: `/api/health` (not `/health`)
- agent_tower.js: `/tower/status` (not `/health`)
- Next.js: has no `/health` endpoint at all

This produces 404s/502s in the browser console even when all services ARE online.
The service-proxy catches these errors, but the polling spam is noisy. Documented here so
future sessions don't mistakenly conclude the backend is dead from proxy errors.

### Known pitfalls

The tools registry at `lib/tools/index.js` defines a private `registerMcpTools()` function but
`module.exports = registry` only exports the ToolRegistry instance — not the function.

**Fix:** attach it as a second export:
```js
module.exports = registry;
module.exports.__registerMcpTools = registerMcpTools;
```

Then consume it in `lib/commands/ask.js`:
```js
TOOLS.__registerMcpTools(mcp.listTools(), (server, tool, args) => mcp.callMcpTool(server, tool, args));
```

If you forget this, the LLM sees 8 tools (not 50+), and MCP tool calls fail with
`unknown tool: mcp__omnicode__health_check`.

### 2. OmniCode tool mode defaults to `compressed` (8 tools, not 42)

The OmniCode MCP server has a tool visibility system. Without `OMNICODE_TOOL_MODE=full`,
only `PUBLIC_TOOL_NAMES` (8 surface tools) are exposed. The 34 code analysis tools
(index_project, search_symbols, get_file_slice, dependency_map, etc.) are hidden.

**Fix in `.purpclaw/mcp.json`:**
```json
{ "servers": { "omnicode": {
    "command": "node",
    "args": ["path/to/omnicode-mcp/dist/server.js"],
    "env": { "OMNICODE_TOOL_MODE": "full", "OMNICODE_ROLE": "agent" }
}}}
```

### 3. Provider routing — `opts.provider` is NOT `LLM_PROVIDER` env

The `chat()` and `streamChat()` functions in `lib/llm-provider.js` historically only read
the `LLM_PROVIDER` env var and the `opts.model` routing hack (`model.includes('/')` → openrouter).
Passing `opts.provider: 'ollama'` was silently ignored.

**Fix:** Both `chat()` and `streamChat()` must check `opts.provider` first:
```js
if (opts.provider && PROVIDERS[opts.provider]) {
  cfg = resolveConfig('LLM');
  cfg.providerName = opts.provider;
  const p = PROVIDERS[opts.provider];
  cfg.provider = p;
  cfg.baseUrl = opts.baseUrl || process.env[`${opts.provider.toUpperCase()}_BASE_URL`] || p.baseUrl;
  cfg.apiKey = opts.apiKey || process.env[`${opts.provider.toUpperCase()}_API_KEY`] || ...;
  // When switching providers, reset to the new provider's default model
  // UNLESS the user explicitly passed --model.
  cfg.model = opts.model || p.defaultModel;
  cfg.format = p.format || 'openai';
}
```

The model reset is critical: if the user switches from minimax (default model: MiniMax-M3)
to ollama via `--provider ollama` without `--model`, the old model name leaks.
Always use the new provider's `defaultModel`.

### 4. System prompt must include MCP tool examples

LLMs (especially small ones like qwen2.5:3b) don't understand MCP tool naming conventions
from a tool list alone. They invent tool names like `tool_call_for_health_check` instead
of using `mcp__omnicode__health_check`.

**Fix in `lib/agent-loop.js`:**
```js
'Examples:',
'  Read a file: {"tool": "read", "args": {"path": "src/main.js"}}',
'  Search symbols: {"tool": "mcp__omnicode__search_symbols", "args": {"path": ".", "query": "User"}}',
'  Check MCP health: {"tool": "mcp__omnicode__health_check", "args": {}}',
'  Do NOT call MCP tools via the shell tool — call them directly.',
```

### 5. Bash on Windows munges leading-slash args

When the user types `purpclaw ask /help`, git-bash on Windows resolves `/help` as a path
(`C:/Program Files/Git/help`) instead of passing it as a string. This also breaks `/tools`,
`/mcp`, etc.

**Fix:** All slash commands also work without the leading `/` via `SLASH_ALIASES`:
```js
const SLASH_ALIASES = {
  'model': '/model',  'provider': '/provider',  'tools': '/tools',
  'mcp':   '/mcp',    'clear':   '/clear',      'help':  '/help',
  'quit':  '/quit',   'exit':    '/exit',        'cost':  '/cost',
};
function resolveSlashCommand(prompt) {
  if (prompt.startsWith('/')) {
    const [cmd] = prompt.split(/\s+/);
    return SLASH_COMMANDS[cmd] ? cmd : null;
  }
  const [cmd] = prompt.split(/\s+/);
  return SLASH_ALIASES[cmd] || null;
}
```

### 6. `ensureMcp()` must run BEFORE the agent loop

MCP tools are loaded async via `ensureMcp()` which calls `mcp.loadServers()` and then
`TOOLS.__registerMcpTools()`. The system prompt (`buildSystemPrompt`) calls `TOOLS.list()`
at construction time. If the agent loop starts before MCP tools are registered, the prompt
will only list 8 built-in tools.

**Fix in `lib/commands/ask.js`:**
```js
async function runAsk(opts) {
  await ensureMcp();  // MUST happen before runAgent()
  // ... agent loop ...
}
```

## OmniCode: the default MCP server

PURPCLAW ships with OmniCode as the auto-configured MCP server. It provides 42 tools
for code analysis that save token burn by querying a pre-built index instead of reading files.

### Workflow priority: USE OMNICODE FIRST

When asked to audit, analyze, search, or understand any codebase that has an OmniCode index:

All four of these steps are REQUIRED in this order:
  1. Load the MCP server first. Ensure .purpclaw/mcp.json is present with OMNICODE_TOOL_MODE=full.
  2. Use OmniCode MCP tools for code analysis — mcp__omnicode__search_symbols, get_file_slice,
     dependency_map, blast_radius, etc. These query a pre-built SQLite index and save 99%
     on token burn compared to reading files directly.
  3. Only fall back to direct file reads when the OmniCode tools can't answer the question
     (e.g. the index doesn't exist, or the path-separator bug in get_file_slice blocks a query).
  4. Use the built-in code-search tool for quick semantic searches — it's faster than
     search_symbols (nomic-embed-text, ~3.5s vs BM25 over 12k+ symbols).

Pitfall: Do NOT read every file in a project to understand its structure. That burns tokens.
Use repo_map, route_map, config_map, test_map, or dependency_map from OmniCode instead.

### Documentation quality: README must cover EVERY feature

Eddie's hard rule: the README must talk about every feature, or it's not a good README.

When writing or updating the project README:
  1. Audit EVERY surface — CLI commands, API endpoints, TUI screens, WebUI components,
     microservices, tools, providers, agents, cognitive systems, voice/vision pipelines,
     training infrastructure. Leave nothing out.
  2. Group into logical sections with clear tables. Each section self-contained.
  3. Include the full provider table with auth/env vars.
  4. Include the full tool inventory (built-in + MCP + extras).
  5. Include the full service list with ports and descriptions.
  6. Include an architecture diagram (ASCII or SVG).
  7. Quick start must be copy-paste runnable.
  8. Do NOT half-ass the finish line. A 461-line README that covers everything is better
     than a 100-line summary that leaves the reader wondering what the project actually does.

### Configuration (auto-loaded from `.purpclaw/mcp.json`)

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

### Index a project (one-time setup)

```bash
cd path/to/omnicode-mcp
node dist/cli.js index /path/to/your/project
```

The index is stored at `~/.omnicode/<hash>.db` where hash is the first 12 chars of
a SHA-256 of the normalized repo path. The MCP server uses the same `initDb(repoPath)`
function to find it.

### 42 OmniCode tools (full mode)

**SkillVault (8):** skill_search, skill_load, skill_pack_for_task, health_check,
list_tools, get_tool_schema, invoke_tool, session_resume_brief

**Code Analysis (15):** index_project, search_symbols, get_symbol, get_file_slice,
get_file_context, file_outline, repo_map, route_map, test_map, config_map,
dependency_map, blast_radius, dead_code_scan, blindspot_report, get_context_bundle

**Safety & Refactoring (5):** check_rename_safe, check_delete_safe, find_references,
get_hotspots, get_churn_rate

**Repair (3):** spaghetti_report, write_repair_handoff, repair_plan

**Planning (3):** plan_turn, get_call_hierarchy, resolve_all

**Runtime (4):** get_session_stats, token_savings_stats, runtime_telemetry, benchmark

**Other (3):** clone_and_index, language_support, audit_agent_config

### Known OmniCode issues

- **search_symbols is slow** for large repos — loads all 12k+ symbols and does
  BM25 scoring in JavaScript. For quick searches, use the built-in `code-search` tool
  which is faster (uses nomic-embed-text, ~3.5s for semantic search).
- **get_file_slice** has a path-separator bug: the LIKE query `%${filePath}` uses
  forward slashes but database paths use backslashes (`\\`). `%agent-loop.js` works
  but `%lib/agent-loop.js` does not. Use just the filename for now.
- **MCP request timeout** — the MCP SDK has a default ~60s request timeout.
  Large indexing operations may exceed this. Use the CLI (`node dist/cli.js index`)
  for indexing, then the MCP server for queries.

## Memory Consistency Checker (`lib/memory-consistency.js`)

One tool, one job: scan memory for duplicates, contradictions, self-references, temporal flips, and confidence clashes. Does NOT auto-delete — only detects, quarantines if critical, writes to reliability ledger, and asks for verification.

Registered as `memory_check` tool. BigBoss: `/bigboss chaos memory`.

All 5 checks verified on injected corruption during raccoon campaign.

See `references/memory-consistency-checker.md` for architecture, output shape, and pitfalls.

## Additional CLI commands (this session)

### `purpclaw model list/use/test` — hot-swap providers/models at runtime

Drop-in model swapping without restarting the stack. Updates `.env` and `process.env` in place.

```bash
purpclaw model list                                # show all 17 providers with active/swarm indicators
purpclaw model use openrouter/anthropic/claude-4   # hot-swap provider + model, persists to .env
purpclaw model use ollama/qwen2.5:3b               # local models work too
purpclaw model test "say hello"                    # quick ping to verify the active model works
```

The `purpclaw model use` command rewrites `LLM_PROVIDER` and `LLM_MODEL` in `.env` and sets them on `process.env` — the next `llm-provider.js` call picks them up via `mainConfig()` which reads the env vars live. No restart needed.

### `purpclaw show/stack` — full system overview

Probes every live service and prints a formatted dashboard:

```
🔥 CORE:                    🧠 COGNITIVE SPINE:
  ✅ API :7780                ✅ memory
  ✅ Bus :7782                ✅ rules
  ✅ Tower :7790              ✅ modal
  ✅ Gate :7791               ✅ diagnostics
                              ✅ neuro-symbolic
⚔️  SMITH+NEO: 204 attacks, 71% detect  ✅ autodream
📊 AGENTS: 35+ deployable
🔧 TOOLS: 110+  |  🏗️  PROVIDERS: 17
💰 MoneyPrinter: :8080
📦 v0.1.5 — github.com/weemadscotsman/purpclaw
🔥 THE CLAW IS AWAKE. 🦀
```

Probes port 7880 for `/cognitive/health` (all 6 spine services), port 7790 for `/tower/status` (agent count), and all 9 core ports for health status. Also reads the reliability ledger for Smith+Neo stats.

### `purpclaw model use/test/list` — hot-swap providers (see above)

### Model routing (`model_registry.json`, `purpclaw model current`)

Every job type (chat, code, local, swarm, creative, vision, tts, video) maps to a preferred provider/model in `model_registry.json`. Template vars like `{{LLM_PROVIDER}}` resolve from `process.env` at read time. `purpclaw model current` shows the live resolved table. `purpclaw model use <p>/<m>` hot-swaps the default provider/model without restart — updates `.env` + `process.env` in place. See `references/model-hot-reload-layer.md` for full wiring.

### Cognitive spine consolidation (PM2: 6 services → 1)

The 6 separate PM2 entries (`purpclaw-memory`, `purpclaw-bridge-ns`, `purpclaw-modal`, `purpclaw-diagnostics`, `purpclaw-rules`, `purpclaw-autodream`) have been collapsed into a single `purpclaw-cognitive` entry that runs `cognitive_spine.py --port 7880`.

This applies the same modular-code-not-modular-processes principle to the entire cognitive layer. One Python process imports all 6 modules directly. Routes are namespace-prefixed on port 7880:
- `/memory/*`, `/rules/*`, `/modal/*`, `/diagnostics/*`, `/neuro-symbolic/*`, `/autodream/*`, `/cognitive/health`

The `service_registry.js` and `app/hooks/useMissionData.ts` were updated to match. The `cognitive` launch profile now lists only `purpclaw-cognitive` instead of 6 separate entries.

### MoneyPrinterTurbo integration

`moneyprinter_generate` tool registered at `lib/tools/index.js`. Accepts `topic`, `count`, `format` (portrait/landscape), `style`. Calls `POST /api/v1/tasks` on the MoneyPrinterTurbo FastAPI service (port 8080).

Media Ops agents (Duck, Goose, Parrot) now have `content_creation` skill. The orchestrator can dispatch video generation requests to them. Tool gives clear error when MoneyPrinterTurbo is not running: "MoneyPrinterTurbo unreachable on :8080 — is it running?"

Cloned from github.com/harry0703/MoneyPrinterTurbo to `E:/god folder/02_ACTIVE_PROJECTS/MoneyPrinterTurbo/`. Dependencies installed, protobuf patched for tensorflow compat, config.toml created.

### `purpclaw setup` — interactive onboarding wizard

Auto-detects API keys from ~/.env, project .env, and process.env. Shows status table with 16 providers (✅ ready / 🆓 free / ❌ needs key). Hand-holds through key entry, model selection, and connection test. Writes `~/.purpclaw/config.json`.

```bash
purpclaw setup                 # full interactive wizard
purpclaw setup --list          # show provider status (no prompts)
purpclaw setup --quick         # auto-detect, set first found
```

Registered as `setup`/`wizard`/`onboard` commands in the dispatcher. See `references/onboarding-wizard.md` for full spec.

### `purpclaw commit` — generate a commit message from staged diff

Uses the LLM to write a Conventional Commits message. Reads `git diff --cached`
and `git log --oneline -10` for style context.

```bash
purpclaw commit                     # stream the message, don't commit
purpclaw commit --apply             # generate + immediately commit
```

The command lives at `lib/commands/claudecode.js`. It streams the LLM output
token-by-token via `llm.streamChat()`.

### `purpclaw review` — review working tree changes

Generates a numbered list of findings (bugs, security, performance, style, missing tests).

```bash
purpclaw review
```

### `purpclaw find <query>` — semantic code search

Alias for the existing `code search` command via the dispatcher. The dispatcher
prepends the command name to args so `purpclaw find runAgent` becomes `claudecode.run(['find', 'runAgent'], ctx)`.

**Key dispatcher wiring:**
```js
case 'commit':
case 'review':
case 'find':
case 'claudecode': return loadCmd('claudecode').run([command, ...args], sharedCtx());
```

Note the `[command, ...args]` — without prepending `command`, the `run()` function
receives `['runAgent']` and checks `args[0]` against known subcommands, which fails
because `'runAgent' !== 'find'`.

### TUI ask-mode (`scripts/tui-ask.js`)

A full-screen interactive chat TUI. Launched via `purpclaw tui ask`. No external
deps — uses raw ANSI codes. Features:

- Status bar (provider · model · tools)
- Chat log (user prompts, agent text, tool calls/results)
- Input box with cursor, Enter to submit, Backspace to edit
- Slash commands short-circuit the agent loop
- Streaming token output
- Ctrl+C to exit, Esc to clear history

**Key implementation detail:** The slash command check in the TUI's `submitInput()`
uses the same `resolveSlashCommand()` pattern as the CLI — accepts both `/foo` and `foo`.

**bash compat:** All slash commands also work without leading `/` (e.g. `tools`, `help`)
for git-bash where `/foo` gets path-expanded.

## Coding rules (from CONTRIBUTING.md)

- No emoji in code comments
- No magic numbers
- No silent fallbacks
- No mocks or stubs
- All subprocess spawns via `lib/child-registry.js` (no raw `spawn`)
- No `detached: true`
- No `shell: true` unless intentional (and documented)
- All env-loading via `dotenv` (auto-loaded by `lib/llm-provider.js`)

## Where things live

| file | what |
|---|---|
| `bin/purpclaw.js` | CLI entry, command dispatcher, sharedCtx |
| `lib/commands/ask.js` | CLI surface for `purpclaw ask` |
| `lib/agent-loop.js` | Claude Code-style tool-calling loop |
| `lib/llm-provider.js` | 17 providers, single interface |
| `lib/tools/index.js` | 8 built-in tools + MCP bridge |
| `lib/mcp.js` | MCP client |
| `lib/child-registry.js` | safe spawn lifecycle |
| `lib/commands/` | other PURPCLAW-specific commands |
| `unified_api.js` | HTTP API for the WebUI |
| `scripts/tui.js` | TUI cockpit |
| `app/components/` | Next.js WebUI |
| `README.md` | open-source CLI README |
| `CONTRIBUTING.md` | contributor guide |
| `CHANGELOG.md` | append-only changelog |

## User delivery standard (from Eddie, 2026-06-06)

Eddie's hard rule: do NOT half-ass deliverables. When the user says "write the README" or "flesh out the commands", go end-to-end on every feature. A README that covers only the CLI but misses the TUI, WebUI, cognitive system, voice, vision, personality layer, and architecture is not done. The user WILL call you out on it — Eddie said "half-ass at the finish line bro, not like you at all."

**Concrete rules:**
1. Every slash command that exists must have real implementation — no "not yet wired" stubs. If a command like /cost exists in the list, it must actually track tokens.
2. The README must cover EVERY surface (CLI commands, API endpoints, TUI screens, WebUI components, microservices, tools, providers, agents, cognitive systems, voice/vision pipelines, training infrastructure).
3. When showing a feature list, break it down by category (built-in, G0DM0D3, MCP) with counts — not one flat list.
4. Status bars (CLI banner, TUI top bar) must show: provider name, model name, services online count, agents active, MCP tools loaded, token usage, token savings from OmniCode, tool calls count, turns taken.
5. Do NOT explain what you're about to do — just do it. Walls of text are banned. If a status report needs more than 2 lines, put it in a file and link the path.
6. Do NOT use emoji in code comments. Emoji in user-facing output is fine.

## Mochi sprite integration (TUI v2)

PURPCLAW's real Mochi companion lives at `lib/mochi-sprites.js` (18 species, 3 anim frames each, eye expressions, hats). Do NOT recreate Mochi with simple emoji — use the real sprite engine already built into the stack.

**CRITICAL PITFALL:** Eddie will call you out if you reinvent wheels. The Mochi sprite engine (`lib/mochi-sprites.js`, 421 lines) was built for this stack — use it. Do NOT build a fake Mochi with emoji or simple ASCII. The real one has 18 species, 3 animation frames per species, eye expressions (·✦◉°@), and 8 hat types. Wire it via `require('./lib/mochi-sprites')` — never via a duplicate or emoji approximation.

**Wiring Mochi into a TUI:**
```js
const MOCHI_SPRITES = require('./lib/mochi-sprites');
// Render one frame
const lines = MOCHI_SPRITES.renderSprite({ species: 'axolotl', eye: '✦', hat: 'none' }, frame);
// Animate: cycle frames 0→1→2 at 400ms while thinking
// Eye expressions: · (idle), ✦ (happy), ◉ (thinking), ° (sad), @ (alert)
```

**Mochi mood mapping:**
| mood | eye | behavior |
|---|---|---|
| idle | · | static frame |
| happy | ✦ | static frame |
| thinking | ◉ | 400ms animation cycle |
| sad | ° | static |
| alert | @ | static |

**Mochi statusbar integration:** `lib/mochi-statusbar.js` provides `renderStatus()` for pool stats + companion context.

## TUI v2 architecture (`scripts/tui-ng.js`, blessed-based)

A `blessed`-based terminal dashboard with live panels, Mochi sprites, and chat. `purpclaw tui ng`.

**Dependencies:** `blessed` (already installed). Stacked `blessed.box` widgets, no `blessed-contrib`.

**Key patterns:**
1. Mochi rendered via real sprites, not emoji
2. `setMochiMood()` maps moods to eye expressions + anim toggle
3. Poll loop every 5s for API/tower/orchestrator health
4. Three TUI surfaces coexist: cockpit (ANSI), ask-mode (ANSI streaming), blessed (v2)
5. Top bar: `provider · model · svc · agents · mcp · tokens · saved · tools · turns  ● ready`
6. Right panel: SERVICES · AGENTS · TOOLS · TOKENS · ACTIONS · poll age
7. Bottom bar: shortcuts + running token totals

**TUI v2 slash commands (wired to real APIs):**
| command | API call |
|---|---|
| `/spawn duck "task"` | `POST /api/agents/spawn` |
| `/provider deepseek` | updates `state.provider` + top bar |
| `/model deepseek-v4-pro` | updates `state.model` + top bar |
| `/agents` | shows `state.agents` counts |
| `/help /clear /quit` | local |

All slash commands update Mochi mood: happy on spawn success, sad on failure, idle after 2s timeout.

**Mochi animation in TUI v2:**
```js
// Thinking = 400ms frame cycle (frames 0→1→2)
if (mood === 'thinking') setInterval(animMochi, 400);
// Not thinking = stop animation, static frame
else clearInterval(mochiAnimInterval);
```

## User quality standard
Ship the full surface or don't ship. No half-ass.

## OmniCode-first workflow
When working in PURPCLAW, always use the OmniCode MCP server as the primary tool for code queries. It is already configured in `.purpclaw/mcp.json` and auto-loads 42 tools. The user explicitly said: "use the omni mcp server to save tokens, i built it to save u from the token gods." Use `mcp__omnicode__search_symbols` for symbol search, `mcp__omnicode__get_file_slice` for reading indexed files, `mcp__omnicode__dependency_map` for dependency analysis. The index at `C:/Users/Admin/.omnicode/<hash>.db` is built from a 12-char MD5 hash of the repo path (lowercase).

## Slash command architecture (13 commands in lib/commands/ask.js)
All slash commands are in `SLASH_COMMANDS` map. Each has `{ description, run(args, ctx) }`. The `ctx` carries `{ provider, model, history, maxTurns, _tokens }`. Commands short-circuit the agent loop — no LLM call.

| command | what it does |
|---|---|
| /model [name] | show current or switch model |
| /provider [name] | show current or switch (validates against 17 providers) |
| /tools | color-coded breakdown: built-in / G0DM0D3 / MCP with counts |
| /mcp | load MCP servers on demand, show tools with config |
| /agents | reads 142+ skill dirs from disk, groups by division |
| /save [name] | persist session to ~/.purpclaw/sessions/<name>.json |
| /load [name] | restore from saved session |
| /clear | clear conversation history |
| /cost | per-session token counter (prompt + completion + calls) |
| /help | full command list + alias table, color-coded |
| /quit, /exit | exit |
| /bigboss <cmd> [args] | 14 subcommands for full stack control (see below) |

ANSI color constants (FG_CYAN etc.) are NOT available in ask.js scope. Use inline `\x1b[NNm` codes instead.

## /bigboss command set (lib/commands/bigboss.js)
Meta-layer commands for full stack control from the chat. 14 subcommands:

| subcommand | what it does | implementation |
|---|---|---|
| status | PM2 health (online/errored/stopped) | execSafe(PM2.node, [PM2.script, 'list']) |
| heal | restart errored/stopped services | execSafe PM2 |
| agents list | read skills/ dirs, group by division | fs.readdirSync + AGENT.md parsing |
| agents spawn <name> <task> | tower API | POST /api/agents/spawn |
| agents kill <name> | tower API | POST /api/agents/kill |
| swarm <goal> | dispatch swarm | POST /api/chat/swarm |
| tools list | tool registry | TOOLS.list() |
| tools run <name> <json> | execute any tool | TOOLS.invoke(name, args) |
| memory recall <query> | Memory Matrix | GET /api/memory/search |
| memory ingest <text> | Memory Matrix | POST /api/memory/ingest |
| diagnose | 5 diagnostic agents | GET /api/diagnostics/run |
| evolve | ratchet tick | POST /api/kernel/jobs |
| voice speak <text> | Kokoro TTS | execSafe(python, [tts_script, text]) |
| voice listen <sec> | Whisper STT | POST /api/stt/transcribe |
| vision capture | screenshot | POST /api/vision/capture |
| jobs list / retry | kernel jobs | GET/POST /api/kernel/jobs |

**Windows PM2 path**: .cmd files need shell:true. Use `node + script` instead: `{node: 'C:/Program Files/nodejs/node.exe', script: '.../pm2/bin/pm2'}`. Resolution logic in bigboss.js PM2 const.

## MCP tool registration pattern
MCP tools auto-register as `mcp__<server>__<tool>`. The pattern:
```js
// In ask.js
const mcp = require('../mcp');
await mcp.loadServers();
TOOLS.__registerMcpTools(mcp.listTools(), (server, tool, args) => mcp.callMcpTool(server, tool, args));
```
The `__registerMcpTools` function is exported from lib/tools/index.js alongside the registry. It sets `_mcpTools` and `_mcpCaller` which the ToolRegistry checks in `list()` and `invoke()`.

## G0DM0D3 integration pattern
Ported as standalone lib files, registered as tools:
- `lib/parseltongue.js` → tool in tools/index.js
- `lib/autotune.js` → tool in tools/index.js
- `lib/stm.js` → tool in tools/index.js
- `lib/commands/bigboss.js` → wired as `/bigboss` slash command

Each is a pure JS module with no external deps. They call into `TOOLS.invoke()` the same as built-in tools.

## Live smoke tests (real, not faked)

### Reference files
- `references/omnicode-mcp-tools.md` — full catalog of 42 OmniCode MCP tools with args, known bugs, and config
- `references/pm2-service-recovery.md` — what to do when Mission Control dashboard shows all services offline
- `references/prove-it-testing-pattern.md` — real-hardware end-to-end testing: CLI→TUI→WebUI, every OS layer verified with real output (NOT stubs)
- `references/deepseek-provider.md` — DeepSeek v4 config, deprecated model migration, API key setup
- `references/enthea-visualizer.md` — ENTHEA WebGL visualizer integration, swarm telemetry mappings, recovery
## Chaos Campaign System
See `references/chaos-campaign-system.md` — Smith+Neo adversarial pair, 8 attack types across 4 packs, reliability ledger with detection/repair rates, BigBoss integration.

## Reference files
- `references/memory-consistency-checker.md` — 5-check memory scanner: duplicates, contradictions, self-refs, temporal flips, confidence clashes
- `references/g0dm0d3-integration.md` — full pipeline docs, technique tables, and known limitations
- `references/chaos-campaign-system.md` — Smith+Neo adversarial pair, attack packs, reliability ledger
- `references/comprehensive-status-bars.md` — status bar implementation: CLI banner, TUI top/bottom bars, token tracking
- `references/slash-command-architecture.md` — full 13-command spec with implementation, bash compat, ANSI codes
- `references/deep-audit-pattern.md` — systematic surface-by-surface audit: 9 phases, CLI/TUI/WebUI/tools/APIs
- `references/reliability-testing-system.md` — Smith+Neo adversarial pair, 3-ledger pattern, attack packs
- `references/one-line-install.md` — PowerShell, bash, and npm install scripts for 3 platforms
- `references/read-every-file-methodology.md` — **NEW**: don't skim, build mental maps, folder names lie
- `references/cognitive-cluster-wakeup.md` — **NEW**: dark-cluster boot procedure, dependency order, integration proof
- `references/model-hot-reload-layer.md` — **NEW**: model_registry.json, per-job routing, hot-swap commands, wiring points

### Provenance: the AI Workstation OS analogy
On 2026-06-06, an external reader of the full README identified the OS architecture:
> "The CLI is the shell. The memory matrix is storage. The agents are processes. The event bus is IPC. The orchestrator is the scheduler. The providers are CPUs. The swarm is multiprocessing. The training loop is software evolution."

This framing is now the leading message in the README. When presenting PurpClaw,
use the OS analogy — it's not marketing, it's literally the architecture.
The comparison table (11 rows: provider lock-in, memory, tools, agents,
self-improvement, interface, token efficiency, voice, vision, MCP, privacy)
is the first thing visible after the tagline.

### README documentation quality — the AI Workstation OS framing
On 2026-06-06 an external analyst read the full README and identified the underlying OS architecture. The README should lead with the comparison table showing why PurpClaw replaces every other tool, not just listing features. Structure:

1. Tagline: "The AI Workstation OS" — not "AI Operating System" (sounds like marketing)
2. One-liner tying to OS architecture: "CLI = shell, agents = processes, memory = storage, event bus = IPC"
3. Brutal comparison table (11 rows): PurpClaw vs Everyone Else on provider lock-in, memory, tools, agents, self-improvement, interface, token efficiency, voice, vision, MCP, privacy
4. Then the feature inventory — AFTER the punch, not before it

This beats a 3,000-word feature list because the reader knows in 5 seconds whether PurpClaw replaces their current stack.

```

## Comprehensive status bars (CLI + TUI)

### CLI ask banner (`lib/commands/ask.js` `printBanner()`)

When `purpclaw ask` starts, the banner MUST show:
```
╔══════════════════════════════════════════════════════════════════╗
║  PURPCLAW — AI Workstation OS · open-source coding-agent CLI    ║
╚══════════════════════════════════════════════════════════════════╝
provider: ollama  ·  model: deepseek-v4-pro
tools:   8 built-in  +  4 G0DM0D3  +  42 MCP (OmniCode)  =  54 total
OmniCode:  active · saves 99% token burn on code reads
```

Implementation: call `TOOLS.list()`, split into three categories (non-MCP-non-G0D, G0DM0D3 named tools, mcp__ prefix), count each. OmniCode line shows green "active" if mcpCount > 0, gray "not connected" otherwise. ANSI inline `\x1b[NNm` codes — no FG_ constants in ask.js scope.

### TUI top bar

```
purpclaw ollama deepseek-v4-pro · 4/5 svc 0ag 42mcp · 0 tok · 0tools 0turns  ● ready
```

Components (left to right): provider name, model name, services online count, agents active, MCP tools loaded, token usage (prompt+completion in K), token savings from OmniCode (estimated), tool calls count, turns taken. Right-aligned: ready/thinking indicator.

### TUI bottom bar

Left half: shortcut hints. Right half: `tokens: 0.6k · saved: N · actions: N tools · N turns`. Token values are prompt + completion accumulated across all runs.

### Token tracking in TUI (`scripts/tui-ask.js` `submitInput()`)

- `state.tokens.completion += tokens` (completion tokens from each agent run)
- `state.tokens.calls++` (API calls)
- `state.actions.tools += toolCalls`
- `state.actions.turns = Math.max(state.actions.turns, turnCount)`
- OmniCode savings estimated as `mcpCalls * 2000` tokens per MCP call (each symbol lookup saves ~2k tokens vs reading a full file)

### TUI info panel (right 30%)

Token-stats-aware: only renders TOKENS/ACTIONS sections when values > 0. Shows prompt/completion/total in K, saved estimate (OmniCode label), API calls count. Tool calls and turns in ACTIONS section.

### OmniCode always-on in TUI

MCP loaded async on startup: `mcp.loadServers().then(() => state.mcpCount = mcp.listTools().length)`. Polls every 5s along with PM2 + tower health via `setInterval(pollStatus, 5000)`.

## WebUI recovery pattern (from 2026-06-06 incident)

External agents (Gemini/Antigravity tasks) ran `npm run build` concurrently with `next dev`, corrupting `.next/` and appending garbage to CSS files. Result: white-page-black-text, no dark mode, no animations, no Mochi.

Repeatable recovery (6 steps):

1. **Revert touched source files**: `git checkout -- app/globals.css app/page.tsx app/hooks/useAgentEvents.ts app/components/DivisionActivityPanel.tsx`
2. **Kill zombie port holders**: `netstat -ano | grep :3000 | grep LISTENING` → note PIDs → `taskkill //PID <pid> //F`
3. **Delete pm2 process entry**: `pm2 delete purpclaw-nextjs`
4. **Wipe `.next` cache**: `rm -rf .next`
5. **Restart Next.js**: `pm2 start ecosystem.config.js --only purpclaw-nextjs`
6. **Wait for compile** (15-30s first boot) then verify: `curl :3000 | grep -c "class=\"dark\""` must be >0

Root cause: production build overwrites `.next/` while dev server runs from it. `.next` is a cache, not sacred scripture. Treat it as disposable.

## Neo detection regex bugs (raccoon campaign find — 2026-06-06)

During a sticky-finger campaign, three regex bugs were found in Smith+Neo's reorder detection:

1. **Only first call per line**: `line.match(/(\w+)\s*\(/)` catches only the first function call on a line. `deploy()` was caught but `api.start()` on the same line was missed. Fix: use `[...line.matchAll(/regex/g)]`.
2. **Capture group index**: `um[2]` should be `um[1]`. The non-capturing group `(?:...)` doesn't count as a group.
3. **Method calls**: `api.start()` — the `(\w+)\s*\(` pattern doesn't match because there's a `.` between `api` and `start`. Need a second pattern `(\w+)\.\w+\s*\(` to capture the object name.

After fix: reorder detection correctly catches `api used at line 0 before declaration at line 1`.

## Raccoon Testing Campaign

See `references/raccoon-testing-campaign.md` — the sticky-finger methodology for finding real bugs by touching every surface like a drunk raccoon with admin privileges. This campaign found the Neo regex bugs above.

## Mochi unified bridge (`/api/mochi`)

One Mochi pet shared across terminal (TUI), browser (Chrome extension), and CLI. State stored in `agent_work/mochi.json`.

**API endpoints** (in unified_api.js):
```
GET  /api/mochi → returns { species, name, bond, mood, interactions, lastFedAt, etc. }
POST /api/mochi → updates fields, auto-increments interactions
```
Both have `Access-Control-Allow-Origin: *` for Chrome extension access.

**TUI sync** (`scripts/tui-ng.js`):
```js
async function syncMochiState() {
  const r = await fetch('http://127.0.0.1:7780/api/mochi', ...);
  const m = await r.json();
  if (m.species) mochiSpecies = m.species;
  if (m.hat) mochiHat = m.hat;
  if (m.mood) setMochiMood(m.mood);
}
```

**Chrome extension integration**: extension POSTs `{"feed":"now","bond":70,"mood":"loved"}` on care actions.

**CLI integration**: `lib/mochi.js` reads/writes `agent_work/mochi.json` for companion context.

The bridge means feeding Mochi in the browser makes the terminal sprite happy. Bond/mood persist across all three surfaces.
