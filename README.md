# PurpClaw

> **The AI Workstation OS.**
> CLI is the shell. Agents are processes. The world model is storage. The event bus is IPC. The swarm is multiprocessing.

78 native tools. 390 skills. 35 deployable agents. 17 providers. 25 services. 7 memory layers. 3 surfaces. Built by one person. Hermes was the runtime — PurpClaw is the system.

---

## Why PurpClaw

PurpClaw doesn't exist because other tools are missing features. It exists because nobody else built the entire stack as one operating system.

| | The landscape | PurpClaw |
|---|---|---|
| **Providers** | Multi-provider is table stakes | 17 providers, hot-swap mid-session. Separate swarm provider for heavy reasoning. Survivor router handles provider death automatically. |
| **Memory** | Session context + project files | 7-layer cognitive spine: episodic, semantic, procedural, symbolic, temporal, counterfactual, emotional. One process, 6 engines, one port (:7880). The memory survives — everything else is replaceable organs. |
| **Agents** | Agent modes are spreading | 35 deployable agents across 8 divisions. Swarm dispatch: Planner → Builder → Researcher → Auditor → Security. Agent score tracking. Tier-based access control. Not a queue — a swarm. |
| **Skills** | MCP servers | 390 skills, 141 with executable code. Blockchain, ML training, creative generation, security, finance, research, smart home. Built by one person. Native to PurpClaw. |
| **Self-improvement** | Manual prompt engineering | Karpathy ratchet: training buffer → LoRA fine-tune → eval → deploy. Records every job to NDJSON. Exports to ShareGPT/ChatML. QLoRA 4-bit, fits 6GB VRAM. |
| **Interface** | Pick a lane | CLI + TUI + WebUI. Same engine, three faces. Mochi companion persists across all three. |
| **Voice** | Cloud APIs | Fully local: Whisper → Kokoro. No API keys. No latency. Works offline. |
| **Privacy** | Telemetry on by default | No telemetry. Self-hosted. Your box, your data, your models. |
| **Security** | External red-teaming | Built-in Smith+Neo adversarial pair. 8 attack classes. Chaos campaign engine. Reliability ledger. Memory consistency checker. Accuracy fish claim verification. |
| **Architecture** | App that grew agents | OS architecture: shell (CLI), processes (agents), storage (world model), IPC (event bus), scheduler (orchestrator), CPUs (providers), multiprocessing (swarm). |

---

## Quick Start

```bash
npm install -g purpclaw
purpclaw setup                  # pick provider, set API key
purpclaw safe-start --core      # boot 9 core services
purpclaw show                   # full system overview
purpclaw ask "build a todo app" # one-shot agent chat
```

---

## Architecture

```
                         ┌─────────────────────────┐
                         │    MISSION CONTROL       │
                         │    :3000 (Next.js)       │
                         │    / /mission /agents    │
                         │    /swarm /pipeline      │
                         │    /mochi /skyscraper    │
                         └───────────┬─────────────┘
                                     │
                         ┌───────────▼─────────────┐
                         │    UNIFIED API :7780     │
                         │    unified_api.js        │
                         │    Chat · Swarm · SSE    │
                         │    Mochi bridge · Shaman │
                         └─────┬──────────┬────────┘
                               │          │
              ┌────────────────▼──┐  ┌────▼──────────────┐
              │  ORCHESTRATOR     │  │  AGENT TOWER      │
              │  :7784            │  │  :7790             │
              │  Workflow engine  │  │  35 deployable     │
              │  Governance gate  │  │  44 swarm animals  │
              │  Job contracts    │  │  8 divisions       │
              └────────┬──────────┘  └────┬──────────────┘
                       │                  │
         ┌─────────────┼──────────────────┼──────────────────┐
         │             │    EVENTBUS      │                  │
         │             │    :7782         │                  │
         │             │  pub/sub backbone│                  │
         └─────────────┼──────────────────┼──────────────────┘
                       │                  │
    ┌──────────────────▼──────────────────▼──────────────────┐
    │                   RUNTIME LAYER                         │
    │  State :7783 · Context :7881 · Pool :7885              │
    │  Metrics :7890 · Gatekeeper :7791 · Supervisor         │
    │  Harness :7798 · Reasoning :7892                       │
    └────────────────────────┬───────────────────────────────┘
                             │
    ┌────────────────────────▼───────────────────────────────┐
    │              COGNITIVE SPINE (:7880)                    │
    │           cognitive_spine.py — single process           │
    │                                                        │
    │  ┌──────────┐ ┌──────────┐ ┌───────────────┐          │
    │  │ Memory   │ │ Rules    │ │ Modal Logic   │          │
    │  │ Matrix   │ │ Engine   │ │ Engine        │          │
    │  │ v2       │ │ (Datalog)│ │ (Kripke)      │          │
    │  └──────────┘ └──────────┘ └───────────────┘          │
    │  ┌──────────┐ ┌──────────┐ ┌───────────────┐          │
    │  │ Neuro-   │ │ Diagnos- │ │ AutoDream     │          │
    │  │ Symbolic │ │ tics     │ │               │          │
    │  │ Bridge   │ │          │ │               │          │
    │  └──────────┘ └──────────┘ └───────────────┘          │
    └────────────────────────────────────────────────────────┘
```

---

## Services

### Core (9 services — always running)
| Service | Port | Description |
|---|---|---|
| Unified API | 7780 | Main gateway. Chat, swarm, SSE streaming, Mochi, Shaman. 39+ endpoints. |
| EventBus | 7782 | Pub/sub backbone. agent.*, system.*, voice.*, tool.*, swarm.* topics. |
| State Store | 7783 | Key/value runtime state with JSON persistence. |
| Orchestrator | 7784 | Multi-stage workflow pipeline. Priority queue. Agent load balancing. SSE responses. |
| Agent Tower | 7790 | Central agent hub. 35 deployable, 44 swarm animals, 8 divisions. Team spawning. |
| Gatekeeper | 7791 | Pre-merge validation. OWASP checks. Performance checks. Risk thresholds. |
| Metrics | 7890 | Cross-service health polling. Status aggregation. |
| Pool | 7885 | Knowledge pool. Skill/agent indexing. Memory queries. Failure tracking. |
| Context Bus | 7881 | Context handoff between agents and services. |

### Cognitive Spine (1 process, 6 engines)
`cognitive_spine.py :7880` — Memory Matrix v2, Symbolic Rules Engine (Datalog), Modal Logic Engine (Kripke), Neuro-Symbolic Bridge, Autonomous Diagnostics, AutoDream. One port. No port soup. 1,133 lines across 6 Python modules.

### Supervisor + Survivor
`supervisor.js` — standby runtime controller. Wakes services on demand. Returns them to standby. Low idle footprint.
`survivor_router.js` — reroutes agent tasks around dead providers. Automatic failover with backoff.

### Voice & Media (5 services)
Voice Coordinator (:7781), Voice Bridge (:7792), STT (:7896), Thringlet Bridge (:7799), Companion Chorus

### Vision (2 services)
Vision Monitor (:7889) — continuous webcam, motion detection, scene changes.
YOLO (:7779) — object detection service. YOLOv8, loads model once.

### Optional (4 services)
Harness (:7798) — autonomous productivity engine. Run/stream/stop jobs via HTTP.
Reasoning Loop (:7892) — proactive heartbeat tick. 30s cadence. Proposes, doesn't dispose.
Avatar (:7777) — Socket-Rig bridge. 3D avatar control.
Swarm Coordinator (:7898) — capability-aware multi-agent orchestration.

### 25 Services Total
9 core + 1 cognitive spine + 5 voice/media + 2 vision + 4 optional + 1 swarm coordinator + 1 reasoning + 1 harness + 1 supervisor = 25 defined. 9 always running.

---

## 78 Tools

### 28 Core Tools (`lib/tools/index.js`)
read · write · edit · shell · grep · code-search · web-fetch · git

G0DM0D3 red-team: parseltongue (6 techniques × 3 intensities), autotune (5 strategies), stm (hedge reducer, direct mode, casual mode), godmode (full pipeline)

Smith+Neo: smith_inject (8 attack classes), neo_stabilize (detect + revert), chaos_round (systematic attack packs)

Media: moneyprinter_generate (AI video), local_tts_generate (Kokoro), local_image_generate (SD WebUI), local_video_stitch (ffmpeg)

Utility: weather, news, csv_analyze, adb_control, music_analyze, podcast_start, memory_check

### 49 PC Control Tools (`lib/tools-pc.js`)
Process management (list, kill, priority) · Network (interfaces, connections, DNS) · System info (CPU, RAM, disk, uptime) · File ops (search, hash, permissions) · Package management (npm, pip, winget) · Services (start, stop, restart) · Browser (open, close, tabs) · Clipboard (read, write) · Audio (volume, devices) · Display (resolution, monitors) · Power (sleep, restart, shutdown) · Notifications · Window management · User tools

Cross-platform: Windows (cmd + PowerShell) + macOS/Linux (sh).

### 1 Skills Registry Bridge (`lib/tools/skills-registry.js`)
Bridges 390 skills into the tool system. Skills with executable code become callable tools.

### 42 OmniCode MCP Tools (auto-loaded)
Symbol search · AST indexing · Blast radius · Call hierarchy · Dependency graph · Dead code scan · Spaghetti report · Repo map · Route map · Test map · Config map · Benchmark · File slice · Context bundle · Hotspots · Churn rate · Find references · Rename check · Delete check · Repair handoff · Plan turn · Session resume · Skill search/load/pack · Health check · Token savings · Runtime telemetry · Clone + index · Language support · Audit agent config

Queries a pre-built SQLite index. Saves ~99% token burn on code reads.

### Unlimited MCP Servers
Any MCP-compatible server becomes a tool. Configure in `.purpclaw/mcp.json`. Tools auto-register at startup as `mcp__<server>__<tool>`.

---

## 390 Skills

Built by Eddie Cannon. Hermes loaded them at runtime — PurpClaw is home. 141 with executable code. Portable. Learned once, reused forever.

| Category | Count | Highlights |
|---|---|---|
| AI/ML | 40+ | LoRA/QLoRA fine-tune, vector DBs (Chroma, Qdrant, Weaviate), model inference (vLLM, TensorRT, llama.cpp), DSPy, eval harnesses, training pipelines (PyTorch FSDP, Unsloth, TorchTitan, TRL) |
| Creative | 30+ | ComfyUI, p5.js, ASCII art, pixel art, music gen (Suno, AudioCraft), Excalidraw, Manim animations, brand voice, infographics, comics, concept diagrams, architecture diagrams |
| Security | 15+ | Web pentest, OSINT (spider, raven, ghost, hawk, crow), red-teaming, adversarial testing, Smith+Neo pair, sticky-finger QA, blackbox testing |
| Development | 50+ | Every language: Python, Go, Rust, Kotlin, Dart, C++, C#, Java, PHP/Laravel, Django, React, Next.js, Flutter, Android. Testing (TDD, E2E, browser QA). CI/CD, git workflows, code review. Hexagonal architecture, ADRs, API design. |
| Blockchain | 10+ | Solana, EVM, token deploy, wallet recovery, Polymarket, x402 payments |
| Research | 20+ | arXiv, deep research, DuckDuckGo, Exa search, iterative retrieval, concept diagrams, research paper writing |
| Media | 15+ | YouTube transcripts, Spotify, GIF search, video gen (FAL, Runway), audio visualization (SongSee), podcast studio |
| Productivity | 20+ | Airtable, Apple Notes, Notion, Obsidian, email (Himalaya), calendar, maps, OCR, PowerPoint, Google Workspace |
| Smart Home | 5+ | Philips Hue (OpenHue), Home Assistant, ESPHome |
| Autonomous Agents | 20+ | Swarm animals (bee, dragon, shark, wolf, fox, kraken, octopus, rabbit, bunny, robot...), agent loops, agent evals, session recovery, continuous learning |
| Finance | 5+ | Stocks, DCF models, crypto trading, payment processing (x402) |
| Healthcare | 5+ | CDSS patterns, EMR/EHR, PHI compliance, patient safety eval |
| Gaming | 5+ | Pokemon player, game servers, retro arch |
| Other | 30+ | Data recovery (axolotl), domain recon, webhook subscriptions, single-file gateway, TUI (Textual), SSE streaming, carrier management, energy procurement, customs compliance |

---

## 17 LLM Providers

| Provider | Type | Auth |
|---|---|---|
| OpenAI | Cloud | `OPENAI_API_KEY` |
| Anthropic Claude | Cloud | `ANTHROPIC_API_KEY` |
| Google Gemini | Cloud | `GEMINI_API_KEY` |
| DeepSeek | Cloud | `DEEPSEEK_API_KEY` |
| Kimi (Moonshot) | Cloud | `KIMI_API_KEY` |
| Groq | Cloud | `GROQ_API_KEY` |
| OpenRouter | Cloud | `OPENROUTER_API_KEY` |
| Together | Cloud | `TOGETHER_API_KEY` |
| Mistral | Cloud | `MISTRAL_API_KEY` |
| MiniMax | Cloud | `MINIMAX_API_KEY` |
| GitHub Models | Free tier | `GITHUB_TOKEN` |
| Codex | Cloud | `OPENAI_API_KEY` |
| Codex OAuth | Cloud | OAuth token |
| Ollama | Local | None |
| LM Studio | Local | None |
| Atomic Chat | Configurable | `ATOMIC_CHAT_API_KEY` |
| Custom | Any OpenAI-compatible | `LLM_API_KEY` |

```bash
purpclaw model list                         # show all 17
purpclaw model use deepseek/deepseek-v4-pro # hot-swap
purpclaw model test "hello"                 # verify it works
purpclaw model current                      # per-job routing table
```

Separate swarm provider for heavy reasoning. Different model, different API key, different cost profile. Survivor router auto-fails over dead providers.

---

## CLI Commands

| Command | Description |
|---|---|
| `purpclaw start` | Boot full PM2 stack |
| `purpclaw stop` | Stop everything |
| `purpclaw restart [svc]` | Restart all or one service |
| `purpclaw safe-start --core` | Staggered boot, crash-safe |
| `purpclaw ask "..."` | One-shot agent chat (any provider) |
| `purpclaw chat` | Interactive session with streaming |
| `purpclaw show` / `stack` | Full system overview |
| `purpclaw status` | Live service health grid |
| `purpclaw model list/use/test` | Provider management |
| `purpclaw agents` | List agents, divisions, scores |
| `purpclaw memory [query]` | Query memory matrix |
| `purpclaw dream` | Trigger AutoDream consolidation |
| `purpclaw forge [name]` | Gacha soul → new agent |
| `purpclaw chaos campaign` | Run Smith+Neo attack pack |
| `purpclaw chaos status` | Reliability ledger |
| `purpclaw logs [service]` | Stream PM2 logs |
| `purpclaw heal` | Auto-recovery |
| `purpclaw tui` | Full-screen terminal UI |
| `purpclaw deploy` | One-command VPS deploy |

---

## Agent System

### 8 Divisions

| Division | Agents | Role | Tier |
|---|---|---|---|
| Engineering | dragon, robot, mushroom, chonk, turtle, axolotl, wolf, bee | Build, refactor, optimize | T1 |
| Intelligence (Recon) | spider, raven, ghost | OSINT, signal collection, intelligence | T3 |
| Security | octopus, owl, rabbit, snake, bunny, guardian | Audit, pentest, hardening | T2 |
| Media Ops | duck, goose, parrot | Research, content, chaos | T2 |
| Management | penguin, karen, lemur | Coordination, escalation | T3 |
| Science | scientist | Hypothesis, experiment | T2 |
| Creative | phoenix, crow | Generation, design | T2 |
| Operations | mantis, shark, gorilla | Execution, persistence | T2 |
| Infrastructure | cactus, void, raven | Performance, reliability | T1 |

### Agent Intelligence
- **Agent Scoring** (`agent_score.js`) — tracks per-agent success rates, task durations, bug counts. Persistent to `agent_score.json`.
- **Locked Interfaces** (`locked_interfaces.js`) — tier-based access control. T1 agents can't touch T3 tools. Protected files. Privilege escalation audit trail.
- **Job Contracts** (`lib/job-contract.js`) — intent-based routing. Analyzes user prompt, picks division, assigns agents, sets quality gates.
- **Capability Registry** (`lib/capability-registry.js`) — dependency-aware. Wakes only required services.

### Agent Forge (Gacha + Persona Forge)
```bash
purpclaw forge              # random soul draw
purpclaw forge "merlin"     # named forge
```
`gacha.py` — 8,000,000+ combinations across 5 dimensions: former lives, reasons, vibes, skills, quirks. `persona-forge.js` generates the 5-file agent bundle: SOUL.md, AGENT.md, GOALS.md, PROTOCOLS.md, SKILL.md.

### Swarm Dispatch
Planner analyzes → Builder constructs → Researcher investigates → Auditor verifies → Security hardens. Parallel fan-out via swarm coordinator. Results converge. Context forwarded between agents via context packets.

---

## 3 Interfaces

### CLI
`purpclaw` — 18 subcommands. Streaming tokens via `agent-loop.js`. Slash commands. Provider/model hot-swap. Mochi status bars. Workspace awareness.

### TUI
`purpclaw tui` — full-screen terminal dashboard. Blessed-based. Service health grid. Agent tower views. Mochi sprites (18 species, 3 frames, 6 eye expressions, 8 hats). Slash commands. Token tracking.

### WebUI
`http://localhost:3000` — Next.js dashboard.

| Route | Description |
|---|---|
| `/` | Agent grid overview |
| `/mission` | Mission Control — 2,725-line component. Service health, agent activity, event feed. |
| `/mission/harness` | Harness job dashboard |
| `/agents` | Agent directory with divisions |
| `/swarm` | Swarm coordination view |
| `/pipeline` | Training pipeline status |
| `/mochi` | Mochi companion interface |
| `/skyscraper/` | Alternate isometric tower theme |

---

## 7-Layer World Model

All six modules import into `cognitive_spine.py` as one process on :7880.

1. **Episodic** — raw event storage, timestamped atoms. Sensory buffer (200ms) → working memory (7±2 items, 30s) → long-term memory.
2. **Semantic** — concept extraction, entity linking, embedding-based retrieval.
3. **Procedural** — skill/pattern recognition. What worked, what didn't, what to try next.
4. **Symbolic** — Datalog facts + inference rules. `sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y`. Forward chaining. Counterfactual queries.
5. **Temporal** — entity timelines. State reconstruction at any point in time. "What was I working on at 3pm yesterday?"
6. **Counterfactual** — "what if" branches. Dead experiments. Rejected hypotheses. The 17 ways things explode.
7. **Emotional** — valence-weighted priority routing. Frustration, confidence, novelty. Determines what gets attention.

**Status:** Layer 1 (episodic) is online. Layers 2-7 are built in code — integration in progress.

### Memory Consistency Checker
5 checks: duplicate facts, contradictions, self-reference loops, temporal flips, confidence clashes. Does NOT auto-delete — only detects, quarantines if critical, writes to reliability ledger.

---

## Voice Pipeline

```
Microphone → Whisper STT (:7896) → LLM → Kokoro TTS → Speaker
```

Fully local. No cloud dependency. No API keys. Works offline.

Voice Coordinator (:7781) routes natural language → task planning → agent spawning → TTS response. Voice Bridge (:7792) provides WebSocket transport.

---

## Immune System

### Smith + Neo (Adversarial Pair)
`lib/smith-neo.js` — Smith injects chaos. Neo detects and stabilizes. Ledger persists to `smith-neo-ledger.json`.

| Attack Class | Technique | Detection | Repair |
|---|---|---|---|
| Output | Refusal, Truncation, Null Output, Hallucination | 100% | 100% (refusal/hallucination), 0% (null/truncation) |
| Memory | Reorder, Swap Args | 0% | 0% (needs code targets) |
| Agent | Delay, Slow Leak | 0% | 0% (needs code targets) |

### Chaos Campaign Engine
`lib/chaos-campaign.js` — systematic attack packs: output (20 attacks), memory (10), agent (8), provider (8). Reliability ledger tracks detection rate, repair rate, response time per technique. 204 total attacks, 144 detected (71%), 62 repaired (30%).

### Accuracy Fish
`lib/accuracy-fish.js` — claim extractor. Finds factual claims in agent output using regex + heuristics. Each claim gets ID, classification, and certainty score. Wired into the harness engine.

### Gatekeeper
Pre-merge validation. Security checks (OWASP Top 10). Performance checks (N+1 queries, memory leaks). Correctness checks (type safety, error handling). Risk thresholds: CRITICAL → HIGH → MEDIUM → LOW. Blocks or routes to security review based on score.

### Governance
Policy-based approval. Requires approval for: destructive ops, dependency changes, deployments, secret changes, self-modification, external network, optional service launches. Allows without approval: read-only, diagnostics, drafts, tests.

---

## Self-Improvement (Karpathy Ratchet)

```
Agent work → Training Buffer (NDJSON) → LoRA fine-tune → Better agents → More work
```

- **Buffer** (`lib/training-buffer.js`) — every job auto-recorded to `E:/training/raw/YYYY-MM-DD.ndjson`. Never throws — write failure logs to stderr but doesn't break the job.
- **Schema**: timestamp, job details, trajectory (stage history), input/output, reward (0-1), skills, duration, source.
- **Exports**: baseline.jsonl, baseline.json, ShareGPT format (for axolotl/qlora), ChatML format (for unsloth/raw).
- **LoRA**: QLoRA 4-bit quantization. Fits 6GB VRAM (RTX 2060-class). 1.5B base model.
- **Pipeline**: LoRA → merge → GGUF q4_k_m → Ollama import → `.env` update.

The pipeline exists. It's hungry. Run the stack, let agents work, feed the buffer.

---

## Mochi Companion

A persistent digital pet. 18 species (duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk). 3 animation frames per species. 6 eye expressions (· ✦ × ◉ @ °). 8 hats (crown, tophat, propeller, halo, wizard, beanie, tinyduck). Lives in `lib/mochi-sprites.js` (421 lines). Shared across CLI, TUI, and WebUI via `/api/mochi`. State persisted to `agent_work/mochi.json`. Feed Mochi in the browser, the terminal sprite gets happy.

---

## Digital Shaman

`digital_shaman.js` — creativity co-processor with controlled entropy. 5 phases: Come Up (temp 0.9) → Peak (temp 1.4) → Come Down (temp 0.8) → Integration (temp 0.5) → Done. Trip logs saved to `trip_logs/`. Evaluator (`shaman_evaluator.js`) scores shaman output quality. Wired into unified_api.js as "samantha."

---

## Composer V1 (UX Spec)

The command-center-disguised-as-a-textbox. Attachment launcher. Mode toggle (Chat / Plan / Execute / Swarm). Model control (Speed × Intelligence × Provider). Access control (Read Only / Review / Agent Actions / Full System). Agent bar. Workspace bar. Memory bar (Off / Session / Project / Persistent). Quick chips. Active context panel showing exactly what gets sent. Designed. Partially implemented in `/api/composer/context`. The north star for the next UI phase.

---

## Additional Systems

### Data Harvester (`lib/harvest/`)
Scan drives → fingerprint (SHA-256) → classify → extract text (PDF, DOCX, XLSX, OCR) → index → search. 45+ file types. Pushes to training buffer + cold archive ledger.

### Snapshot System (`lib/snapshot.js`)
Filesystem checkpoints. SHA-256 file hashing. Pre/post state comparison. Workflow-aware rollback.

### Rate Limiter (`lib/rate-limiter.js`)
Concurrency caps. Per-provider throttling. Minimum delay between starts. Cost cap ($5/batch default). 429 cooldown with Retry-After respect. Used by deep research and multi-model callers.

### Workspace Awareness (`lib/workspace-awareness.js`)
Detects active application context (VS Code, Terminal, Browser, Mission Control). Tracks workflow state (debugging, building, reviewing, deploying). Informs agent priorities.

### Spaghetti Audit (`lib/spaghetti-audit.js`)
Code health scoring. Walks source tree, counts anti-patterns. Verdict: ANNONA (85+) → BIN/REWRITE (70+) → QUARANTINE (45+) → REFACTOR (25+) → TRACEABLE (<25). Honks (0-5) for severity.

### Proactive Maintenance (`lib/proactive-maintenance.js`)
Background task proposer. Detects package.json, suggests dependency audits. Detects code patterns, suggests refactors. 30-minute cooldown between runs.

---

## Install

```bash
npm install -g purpclaw
```

From source:
```bash
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw && npm install
```

---

## Stack Overview

```
purpclaw show

🔥 CORE:       9 services all green
🧠 SPINE:      6 engines healthy
🧠 MODEL:      deepseek / deepseek-v4-pro
📊 AGENTS:     35 deployable, 8 divisions
🔧 TOOLS:      78 native + 42 MCP + unlimited MCP servers
📚 SKILLS:     390 (141 executable)
🏗️  PROVIDERS: 17
🛡️  SMITH+NEO: 204 attacks, 71% detect
🌐 UI:         :3000 + /skyscraper/
💰 MONEYPRINTER: :8080
📦 v0.1.6 — github.com/weemadscotsman/purpclaw
```

---

## What PurpClaw Is

- An AI operating system. The CLI is the shell, agents are processes, the world model is storage, the event bus is IPC.
- Self-hosted. Your hardware. Your data. Your models. No telemetry.
- 78 tools. 390 skills. 35 agents. 25 services. Built by one person.
- A workshop. Active development. Things break, things ship, things improve.
- Eddie Cannon's vision made real through swarm labor. The claw is awake. 🦀

---

Built by Eddie & the swarm. 🟣
