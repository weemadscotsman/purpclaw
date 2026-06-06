# PurpClaw

> **The AI Workstation OS.**
> A terminal-first, multi-agent, self-improving AI operating system.
> 17 providers · 54 tools · 152 agents · 25 microservices · 3 surfaces (CLI, TUI, WebUI)

PurpClaw is not another AI application. It's trying to become an **operating system for AI work** — where the CLI is the shell, the agents are processes, the memory matrix is persistent storage, the event bus is IPC, the orchestrator is the scheduler, the providers are CPUs, the swarm is multiprocessing, and the training ratchet is software evolution.

## Why PurpClaw over everything else

| Problem | Everyone Else | PurpClaw |
|---|---|---|
| **Provider lock-in** | One vendor | 17 providers, switch mid-session |
| **Memory** | Session-only, lost on disconnect | Persistent cognitive memory with neuro-symbolic reasoning |
| **Tools** | Fixed set, no extensibility | 54 tools + unlimited MCP servers |
| **Agents** | One or none | 152 specialized agents across 5 divisions |
| **Self-improvement** | None | Karpathy ratchet — trains its own LoRA overnight |
| **Interface** | One (chat or CLI) | CLI + full-screen TUI + WebUI dashboard |
| **Token efficiency** | Feeds entire codebase to LLM | OmniCode index — semantic lookup, saves 99% on token burn |
| **Voice** | None or cloud-only | Full local pipeline: Whisper STT → LLM → Kokoro TTS |
| **Vision** | None | YOLO object detection + screen/camera monitor |
| **MCP ecosystem** | Consumes one server | MCP client — any server becomes a tool |
| **Privacy** | Telemetry by default | No telemetry, self-hosted, auditable |

```
npm install -g purpclaw     # once published
purpclaw ask "deploy the API"
```

---

## 🖥 Three Surfaces — Same Engine

PurpClaw has three faces, all powered by the same unified API:

### 1. CLI (`purpclaw`)

```bash
purpclaw ask "explain the auth flow"              # one-shot agent chat
purpclaw ask --provider ollama "write tests"       # pick any of 17 providers
purpclaw chat                                      # interactive session
purpclaw commit                                    # git commit with AI message
purpclaw review                                    # review working tree
purpclaw find "runAgent"                           # semantic code search
purpclaw tui ask                                   # full-screen TUI chat
purpclaw status                                    # service health
purpclaw heal                                      # auto-recovery
purpclaw safe-start --core                         # start 16 core services
```

**30+ CLI commands:** tui, init, start, stop, restart, chat, run, status, doctor, approve, reject, jobs, policies, introspect, rollback, bg, registry, install, search, resume, context, pool, tick, mochi, spaghetti, llm, browser, cognition, code, lora, agents, profiles, workflows, queue, + all lib/commands module

### 2. TUI (`purpclaw tui`)

Two terminal UIs, no external dependencies:

- **Cockpit** (`scripts/tui.js`): Full-screen live dashboard. 6 tabs. Service health grid, agent activity, memory stats, event stream, system metrics. Keyboard-driven (1-6 = tabs, r = refresh, p = pause, q = quit).
- **Ask Mode** (`scripts/tui-ask.js`): Interactive agent chat in the terminal. Streaming tokens, tool calls displayed inline, slash commands, color-coded output. Chat log scrollable with arrow keys.

### 3. WebUI (`:3000`)

Next.js dashboard with 27 components:

| Component | What it shows |
|---|---|
| **MissionControl** | Central command — service health, agent grid, event timeline, pipeline status |
| **CommandPanel** | Chat input, agent spawn, swarm dispatch, kernel jobs, research, group chat, raw API |
| **SwarmPanel** | Multi-agent swarm orchestration with live status |
| **CognitivePanel** | Memory stats, diagnostic findings, causal graphs, symbolic reasoning |
| **AgentTower** | Agent lifecycle (spawn/observe/kill), 26 base agents with chaos/wisdom stats |
| **ServiceHealthGrid** | 30-service health grid with latency, uptime, color-coded status |
| **OverviewPanel** | System-wide summary metrics |
| **PerkplerDashboard** | Token usage, LLM ledger, agent scores, benchmark comparisons |
| **PipelinePanel** | Workflow pipeline with stages, traces, delegation |
| **GatekeeperPanel** | Security gate status, approve/reject queue |
| **EventTimelinePanel** | Chronological event stream with filters |
| **DivisionActivityPanel** | Per-division agent activity |
| **LiveSystemMap** | Service topology with dependency arrows |
| **LogFeed** | Real-time log stream with severity filters |
| **SamplerPanel** | MCP tool sampler / code injection |
| **UnifiedDashboard** | Combined view of everything |
| **Onboarding** | First-run setup wizard |
| + TowerPanel, AbliteratorPanel, AutonomousHarnessPanel, SwarmOrchestrationView, Toast, ErrorBoundary, LoadingSpinner, PurpClawLogo |

---

## 🤖 17 LLM Providers

Switch between providers without changing your workflow:

| Provider | Auth | Notes |
|---|---|---|
| `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, o1 |
| `anthropic` | `ANTHROPIC_API_KEY` | claude-sonnet-4, claude-3.5-haiku |
| `gemini` | `GEMINI_API_KEY` | gemini-2.5-flash, gemini-2.5-pro |
| `github-models` | `GITHUB_TOKEN` | **Free tier** — all major LLMs |
| `codex` | `OPENAI_API_KEY` | gpt-5-codex via OpenAI API |
| `codex-oauth` | `CODEX_OAUTH_TOKEN` | OAuth-flow token from Codex CLI |
| `ollama` | (none) | Local — qwen2.5, llama3, etc. |
| `lmstudio` | (none) | Local GGUF hosting |
| `openrouter` | `OPENROUTER_API_KEY` | All models, free tier available |
| `groq` | `GROQ_API_KEY` | Fast inference, llama-3.3-70b |
| `deepseek` | `DEEPSEEK_API_KEY` | DeepSeek-Chat, DeepSeek-Coder |
| `kimi` | `KIMI_API_KEY` | Moonshot Kimi K2 |
| `together` | `TOGETHER_API_KEY` | Open models, fast |
| `mistral` | `MISTRAL_API_KEY` | mistral-large, mixtral |
| `minimax` | `MINIMAX_API_KEY` | MiniMax-M3, MiniMax-M2.7 |
| `atomic-chat` | `ATOMIC_CHAT_API_KEY` | Configurable endpoint |
| `custom` | `LLM_API_KEY` + `LLM_BASE_URL` | Any OpenAI-compatible endpoint |

`--provider <name>` switches the provider. `/provider` slash command switches mid-session.

---

## 🛠 54 Tools (8 Built-in + 42 OmniCode MCP + 4 G0DM0D3)

### 8 Built-in Tools

| Tool | What it does |
|---|---|
| **read** | Read a file with offset/limit pagination |
| **write** | Write content to a file (overwrites, creates dirs) |
| **edit** | Find/replace edit (accepts `find`/`replace` or `old`/`new`) |
| **shell** | Run shell command (tracked, time-bounded, no detached processes) |
| **grep** | Regex search across files (ripgrep + node fallback) |
| **code-search** | Semantic + symbol search over the codebase (nomic-embed-text, 768d) |
| **web-fetch** | Fetch URL → text content (15s timeout, 100k char cap) |
| **git** | Read-only git ops (status, diff, log, branch) |

### 42 OmniCode MCP Tools (auto-loaded)

OmniCode indexes your project and provides code analysis without reading every file — saves 99% on token burn:

**Code Analysis:** search_symbols, get_symbol, get_file_slice, get_file_context, file_outline, repo_map, route_map, test_map, config_map, dependency_map, blast_radius, dead_code_scan, blindspot_report, find_references, get_hotspots, get_call_hierarchy, get_churn_rate, resolve_all, blindspot_explorer

**Project Management:** index_project, clone_and_index, language_support, benchmark

**Code Quality:** spaghetti_report, write_repair_handoff, repair_plan, check_rename_safe, check_delete_safe, plan_turn, get_context_bundle, audit_agent_config

**Session/Runtime:** skill_search, skill_load, skill_pack_for_task, health_check, list_tools, get_tool_schema, invoke_tool, session_resume_brief, get_session_stats, token_savings_stats, runtime_telemetry

Configured in `.purpclaw/mcp.json`. Index your project with `node dist/cli.js index <path>`.

### 4 G0DM0D3 Tools (Red-Teaming)

Ported from [G0DM0D3](https://github.com/elder-plinius/G0DM0D3) by Elder Plinius:

| Tool | What it does |
|---|---|
| **parseltongue** | Obfuscate trigger words in text to bypass content filters. 6 techniques × 3 intensities (leetspeak, unicode, ZWJ, mixed case, phonetic, random) |
| **autotune** | Context-adaptive LLM sampling parameters. Detects 5 context types (code/creative/analytical/conversational/chaotic), computes optimal temperature/top_p/top_k/freq/presence/rep penalty |
| **stm** | Semantic Transformation Modules for output normalization. hedgeReducer, directMode, casualMode |
| **godmode** | Full G0DM0D3 pipeline: parseltongue → autotune → prompt ready |

---

## 🧠 Agent Loop

The Claude Code-style agent loop:

```
user prompt
   ↓
[LLM call] → text + {"tool": "...", "args": {...}} JSON
   ↓                  ↓
print text      execute tool (read, write, shell, MCP, G0DM0D3, etc.)
   ↓                  ↓
   ← tool results ←
   ↓
[LLM call #2] → continues until no tool calls or maxTurns (default 10)
```

Streams tokens token-by-token. Tool calls are displayed inline with results. Multi-turn reasoning works through the loop.

---

## 🔌 MCP Client (Model Context Protocol)

PurpClaw is an MCP **client**. Connect any stdio-based MCP server and its tools become first-class tools the agent can use.

Configured in `.purpclaw/mcp.json`:
```json
{
  "servers": {
    "omnicode": { "command": "node", "args": ["path/to/server.js"], "env": {"OMNICODE_TOOL_MODE": "full"} },
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "..." } }
  }
}
```

Tools auto-register as `mcp__<server>__<tool>`. Agent sees them in the tool list.

---

## 🎭 Slash Commands

All work both as `/foo` and `foo` (for shells that munge leading slashes):

| Command | Description |
|---|---|
| `/model <name>` | Switch model mid-session |
| `/provider <name>` | Switch provider mid-session |
| `/tools` | List all available tools (built-in + MCP) |
| `/mcp` | List MCP servers and their tools |
| `/agents` | List available swarm agents |
| `/clear` | Clear conversation history |
| `/help` | Show all slash commands |
| `/cost` | Show token / cost usage |
| `/quit`, `/exit` | Exit |

---

## 🐝 Swarm Mode

Parallel multi-agent dispatch. A single message fans out to specialized agents:

| Agent | Role |
|---|---|
| **Planner** | Decomposes the task, creates a plan |
| **Builder** | Executes the plan, writes code |
| **Researcher** | Gathers context and information |
| **Auditor** | Reviews the result for quality and security |

Each streams its own tokens. A synthesizer merges the best of each into a final answer.

Available via `POST /api/chat/swarm` with SSE streaming.

---

## ⚙️ 25 Microservices (PM2)

| Service | Port | What it does |
|---|---|---|
| **Unified API** | `:7780` | Main API gateway — chat, swarm, kernel jobs, SSE, tools, agents |
| **Event Bus** | `:7782` | Pub/sub event bus for all services |
| **State Store** | `:7783` | Durable key/value runtime state |
| **Tower** | `:7790` | Agent runtime — spawn, observe, kill |
| **Orchestrator** | `:7784` | Workflow engine — multi-stage plan→execute→verify |
| **Gatekeeper** | `:7791` | Safety gate — pre-flights risky operations |
| **Metrics** | `:7890` | Health polling every 2s, SSE log streams |
| **Pool** | `:7885` | Agent pool management |
| **Context Bus** | `:7881` | Inter-service context handoff |
| **Workers** | `:7897` | Remote worker dispatch and lifecycle |
| **Swarm Coordinator** | `:7898` | Multi-agent swarm dispatch |
| **Memory Matrix v2** | `:7880` | Neuro-symbolic long-term memory (3D quantized) |
| **Neuro-Symbolic Bridge** | `:7884` | Symbolic ↔ neural reasoning bridge |
| **Modal Logic Engine** | `:7785` | Kripke modal logic (epistemic, temporal, deontic, doxastic) |
| **Autonomous Diagnostics** | `:7786` | 5 diagnostic agents + causal graphs |
| **Symbolic Rules Engine** | `:7787` | Prolog-style Datalog rules |
| **AutoDream** | `:7895` | Memory consolidation daemon |
| **Reasoning Loop** | `:7892` | Proactive heartbeat tick |
| **Harness** | `:7798` | Autonomous plan→execute→judge→synthesize |
| **No Spaghett** | `:7797` | Codebase spaghetti analyzer |
| **Voice Coordinator** | `:7781` | Voice/text command router |
| **Voice Bridge** | `:7792` | Browser voice socket bridge |
| **STT** | `:7896` | Local Whisper transcription |
| **Chorus** | (companion) | Companion reaction bridge |
| **Vision Monitor** | `:7889` | Screen/camera capture |
| **YOLO Service** | `:7779` | Real-time object detection |
| **Avatar Bridge** | `:7777` | Physical avatar control |

---

## 👥 152 Agents across 5 Divisions

Each agent under `skills/` has AGENT.md, SKILL.md, GOALS.md, PROTOCOLS.md:

| Division | Agents | Purpose |
|---|---|---|
| **CORE** | duck, bee, rabbit, fox, owl, wolf, shark, phoenix, turtle, mantis | Base operations, routing, planning, execution |
| **OPS** | crow, panda, penguin, hawk, raven, jellyfish, moth, cactus, chonk, ghost | Monitoring, deployment, security, cleanup |
| **MEDIA_OPS** | kraken, octopus, gorilla, dragon | Media processing, GPU compute, batch jobs |
| **COGNITIVE** | innovator, scientist, spider, elephant, mushroom | Research, exploration, data extraction |
| **SPECIAL** | snake, godmode, guardian, void | Red-teaming, jailbreak, pentesting, memory ops |

---

## 🧬 Cognitive System

| System | What it does |
|---|---|
| **Memory Matrix v2** | 3D quantized memory (episodic, semantic, procedural). 5 atom types. Temporal reasoning. Counterfactual queries. Entity timelines. |
| **Modal Logic Engine** | 4 modal logics: **Epistemic** (Kt — "agent knows"), **Temporal** (EVER/POREVER), **Deontic** (MUST/MAY/MUST_NOT), **Doxastic** (BELIEF_LEVEL). Kripke models with accessibility relations. |
| **Neuro-Symbolic Bridge** | Lifts vector embeddings into Datalog facts. Grounds symbolic queries with neural context. CozoDB support. |
| **Symbolic Rules Engine** | Prolog-style rules. Define facts + rules, derive new facts. |
| **Autonomous Diagnostics** | 5 diagnostic probes (MemoryDiag, VisionDiag, NetworkDiag, ResourceDiag, AppDiag). Vote on root causes. Build causal graphs. |
| **AutoDream** | Overnight memory consolidation. Replays memories, detects contradictions, strengthens weak ones. |
| **Reasoning Loop** | Heartbeat tick. Checks if any agent needs attention, task stalled, memory needs consolidation. |

---

## 🎤 Voice Pipeline

Full local voice pipeline — no cloud dependency:

```
Microphone → Whisper STT → LLM → Kokoro TTS → Speaker
```

- **STT**: `voice_stt.py` — local Whisper transcription on port `:7896`
- **TTS**: `mimi_speak.py` — Kokoro TTS (af_heart voice), one-shot foreground playback
- **Voice Coordinator**: `voice_coordinator.js` — routes voice/text commands
- **Voice Bridge**: `voice_bridge_7792.js` — browser WebSocket bridge

---

## 👁 Vision System

- **Vision Monitor** (`vision_monitor.js`): Screen/camera capture. Monitors regions, detects changes.
- **YOLO Service** (`yolo_service.py`): Real-time object detection. Publishes to event bus.
- **Clap Detector** (`clap-detector.js`): Sound-triggered boot.

---

## 🎭 REM / Personality Layer

| System | What it does |
|---|---|
| **Digital Shaman** | Creativity co-processor with controlled entropy. Explores problem spaces in associative webs. |
| **Mood Engine** | 7 moods (neutral, happy, sad, angry, surprised, thinking, sleepy). Drives avatar face, voice tone, agent priority. |
| **Thringlet Bridge** | Runtime→emotion translator. Maps events to emotional deltas. |
| **Turing Face Driver** | Drives 3D avatar face via WebSocket. |
| **Ball-to-Rig Bridge** | Xiaozhi Ball → OpenClaw Rig bridge. |
| **LCD Bridge** | Turing Smart Screen display. Shows system status on physical LCD. |

---

## 🔄 Self-Improvement (Karpathy Ratchet)

PurpClaw improves itself overnight using a Karpathy-style autonomous research loop:

```bash
purpclaw autoresearch          # start the ratchet
purpclaw autoresearch status   # check iteration progress
purpclaw training status       # training buffer stats
purpclaw training export       # export training data
```

**The 3-file contract** (`E:/training/`):
- `prepare.py` — **Immutable.** Tokenizes and preprocesses training data. The ground truth. Never changes.
- `train.py` — **Mutable.** LoRA fine-tuning with PEFT+TRL+bitsandbytes. The ratchet rewrites this each iteration.
- `program.md` — **The master instruction.** Tells the ratchet what to optimize, how to evaluate, what hyperparameters to explore.

**The ratchet cycle:**
1. Read program.md → pick a hypothesis (learning rate, rank, alpha, schedule)
2. Apply hypothesis to train.py
3. `git commit` the change
4. Train for N minutes (hard budget)
5. Evaluate val_loss against the best so far
6. If improved → keep it. If not → `git revert`
7. Record in results.tsv. Loop forever.

**Training Buffer**: Every kernel job is auto-recorded to `E:/training/raw/YYYY-MM-DD.ndjson`. CLI: `purpclaw training status|export|backfill|clear|toggle`.

---

## 🧪 Services Architecture

```
                    ┌─────────────┐
                    │  CLI/TUI    │
                    │  WebUI:3000 │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  API:7780   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
  ┌──────▼──────┐  ┌──────▼──────┐  ┌────────┴────────┐
  │ Orchestrator │  │   Tower     │  │   Gatekeeper    │
  │   :7784      │  │   :7790     │  │    :7791        │
  └──────┬───────┘  └──────┬──────┘  └─────────────────┘
         │                 │
  ┌──────▼────────┐  ┌─────▼───────┐
  │  Event Bus    │  │  State Store │
  │   :7782       │  │   :7783     │
  └──────┬────────┘  └─────────────┘
         │
    ┌────┴──────────────────────┐
    │  Cognitive Cluster        │
    │  Memory:7880              │
    │  Neuro-Symbolic:7884      │
    │  Modal Logic:7785         │
    │  Diagnostics:7786         │
    │  Rules Engine:7787        │
    └───────────────────────────┘
```

---

## 📦 What's on Disk

| Directory | Count | What |
|---|---|---|
| `bin/` | 4 files | CLI entry, dispatchers |
| `lib/` | 54 files | Providers, tools, MCP, agents, parseltongue, autotune, STM, agent loop, child registry |
| `lib/commands/` | 31 files | CLI command modules |
| `lib/workers/` | 3 files | HTTP, SSH, purp workers |
| `lib/tools/` | 1 file (index) | 8 built-in + MCP bridge + G0DM0D3 tools |
| `scripts/` | 12 files | TUI, benchmarks, panic-stop, ECC, NanoClaw |
| `app/` | Next.js | 27 components, dashboard |
| `app/components/` | 28 tsx | MissionControl, SwarmPanel, CognitivePanel, etc. |
| `docs/` | 600+ files | Full docs in 6 languages |
| `skills/` | 152 dirs | Agent definitions with AGENT.md, SKILL.md, GOALS.md, PROTOCOLS.md |
| `E:/training/` | LoRA pipeline | prepare.py, train.py, program.md, ratchet orchestrator |

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw

# Install
npm install

# Copy .env and set your API key
cp .env.example .env
# Edit .env — pick a provider and set its key

# Start the core services (16 services in order)
purpclaw safe-start --core

# Use the CLI
purpclaw ask --provider ollama "explain the codebase"
purpclaw ask "deploy the API"                    # uses default provider

# Launch the TUI
purpclaw tui ask                                  # interactive agent chat
purpclaw tui                                      # dashboard cockpit

# Open the WebUI
# http://localhost:3000
```

## 🔧 Configuration

Copy `.env.example` to `.env` and set:

```bash
# Pick your provider
LLM_PROVIDER=ollama
LLM_MODEL=qwen2.5:3b

# Or for cloud providers:
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=...
# GEMINI_API_KEY=...
```

MCP servers in `.purpclaw/mcp.json` (auto-loaded on `purpclaw ask`).

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). New providers go in `lib/llm-provider.js`. New tools go in `lib/tools/index.js`. All subprocess spawns go through `lib/child-registry.js`.

## 📊 Metrics

See [METRICS.md](./METRICS.md) for monthly transparency: distribution, adoption, product surface, reliability.

## 🏛 License & Sponsorship

**MIT** — forever free, irrevocably open.

| Tier | Price | Perks |
|---|---|---|
| 🧪 Pilot | $200/mo | Logo on README, early access, monthly status |
| 📈 Growth | $500/mo | All above + roadmap voting, quarterly call |
| 🏛 Strategic | $1,000+/mo | All above + dedicated support, co-marketing |

Built by Eddie & the swarm. 🟣