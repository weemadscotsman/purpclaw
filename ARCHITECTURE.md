# PURPCLAW Architecture

> Ship date: 2026-06-06 · v0.1.0 · 25 services · 152 agent directories · 110+ tools · 7 memory layers

---

## Thesis

PURPCLAW is an **AI operating system**, not an AI application. Every layer maps to an OS primitive:

| OS Primitive | PURPCLAW Component |
|---|---|
| Shell | `purpclaw` CLI + TUI + WebUI |
| Processes | 35 runtime agents (152 directories) |
| Persistent storage | Memory Matrix v2 (7 layers) |
| IPC | EventBus (pub/sub) |
| Scheduler | Orchestrator (task routing + governance) |
| CPUs | 17 LLM providers |
| Multiprocessing | Swarm mode (parallel agent fan-out) |
| Software evolution | Karpathy ratchet (self-training) |

---

## Service Topology (25 services)

```
                    ┌─────────────────────────────────┐
                    │         MISSION CONTROL          │
                    │         :3000 (Next.js)          │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │         MAIN API (:7780)          │
                    │     unified_api.js                │
                    └──────┬──────────────┬────────────┘
                           │              │
          ┌────────────────▼──┐    ┌──────▼──────────────┐
          │   ORCHESTRATOR    │    │    AGENT TOWER      │
          │   :7784           │    │    :7790             │
          │   task routing    │    │    agent spawning    │
          │   governance gate │    │    152 directories   │
          └────────┬──────────┘    └──────┬──────────────┘
                   │                      │
    ┌──────────────┼──────────────────────┼──────────────────┐
    │              │      EVENTBUS        │                  │
    │              │      :7782           │                  │
    │              │   pub/sub backbone   │                  │
    └──────────────┼──────────────────────┼──────────────────┘
                   │                      │
    ┌──────────────▼──────────────────────▼──────────────────┐
    │                    RUNTIME LAYER                        │
    │                                                        │
    │  state :7783    context :7881    pool :7885             │
    │  workers :7897  reasoning :7892  metrics :7890          │
    │  gatekeeper :7791                                       │
    └────────────────────────┬───────────────────────────────┘
                             │
    ┌────────────────────────▼───────────────────────────────┐
    │                    MEDIA LAYER                          │
    │                                                        │
    │  voice :7781    bridge :7792    stt :7896              │
    │  vision (monitor)  yolo :7779    avatar :7777           │
    │  chorus (companion bridge)                              │
    └────────────────────────────────────────────────────────┘
                             │
    ┌────────────────────────▼───────────────────────────────┐
    │                COGNITIVE SPINE (:7880)                  │
    │         cognitive_spine.py — single process             │
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

The cognitive layer used to be 6 separate services. `cognitive_spine.py` imports all modules directly — one process, one port. Modular code, not modular processes.

---

## 7-Layer World Model

The cognitive layer stores more than memory — it stores time, rules, beliefs, counterfactuals, inference, and consolidation. That's a world model, not a database.

```
Layer 1: EPISODIC     — raw event storage (timestamped atoms)
Layer 2: SEMANTIC     — concept extraction + entity linking
Layer 3: PROCEDURAL   — skill/pattern recognition
Layer 4: SYMBOLIC     — Datalog facts + rules (rules engine)
Layer 5: TEMPORAL     — entity timelines + state reconstruction
Layer 6: COUNTERFACTUAL — "what if" branches (forgotten/noticed)
Layer 7: EMOTIONAL    — valence-weighted priority routing
```

Implementation: 1,133 lines in `memory_matrix_v2.py` + `symbolic_rules_engine.py` + `modal_logic_engine.py` + `neuro_symbolic_bridge.py` + `autoDream.py`. All six modules import into `cognitive_spine.py` as one process.

Currently Layer 1 (episodic) is online at runtime; Layers 2-7 are built in code but awaiting integration audit.

---

## Agent System

### Honest breakdown

| Category | Count | Description |
|---|---|---|
| Skill directories | 152 | Total directories under `agents/` |
| Documented personas | 42 | Agents with defined personality, role, and behavior |
| Executable code modules | 54 | Agents with working code implementations |
| Runtime deployable | 35 | Agents that can be spawned and run right now |
| Swarm animals | 44 | Animal-themed agents in agent_tower.js |
| Specialist builders | 38 | Language/framework-specific code agents |

The number "152" is the directory count — accurate but misleading if you expect 152 live processes. The deployable number is 35. The documentation now distinguishes these categories.

### 5 Divisions

| Division | Agents | Role |
|---|---|---|
| **Build** | architect, builder, cpp-builder, java-builder, kotlin-builder, python-builder, etc. | Code generation |
| **Review** | code-reviewer, security-reviewer, cpp-reviewer, java-reviewer, etc. | Code review |
| **Resolve** | build-error-resolver, cpp-build-resolver, go-build-resolver, etc. | Error resolution |
| **Testing** | e2e-runner, tdd-guide, benchmark, browser-qa, etc. | Testing |
| **Meta** | planner, refactor-cleaner, performance-optimizer, gan-generator, etc. | Meta-work |

### Swarm Animals (44 companion agents)

`dragon`, `owl`, `goose`, `mushroom`, `rabbit`, `kraken`, `shark`, `wolf`, `fox`, `crow`, `spider`, `mantis`, `elephant`, `gorilla`, `turtle`, `phoenix`, `penguin`, `jellyfish`, `snake`, `ghost`, `guardian`, `raven`, `lemur`, `moth`, `bee`, `bunny`, `cactus`, `chonk`, `claw`, `duck`, `hawk`, `innovator`, `karen`, `numbers`, `octopus`, `panda`, `parrot`, `robot`, `scientist`, `void`, and more.

These map to skill files — each animal is a persona + toolset that the orchestrator can dispatch.

---

## Tool System (110+)

| Category | Count | Examples |
|---|---|---|
| Built-in CLI | 8 | file_rw, terminal, search, web, browser, vision, etc. |
| OmniCode MCP | 42 | symbol lookup, AST indexing, semantic search |
| G0DM0D3 | 4 | parseltongue, godmode, ultraplinian |
| Smith+Neo | 5 | chaos injector, stabilizer, audit trail |
| PC Control | 49 | mouse, keyboard, window management, screen capture |
| **Total** | **110+** | |

Tools are auto-discovered via MCP servers. Any MCP-compatible server becomes a tool.

---

## Provider System (17)

OpenAI · Anthropic Claude · Google Gemini · DeepSeek · MiniMax · Kimi · Groq · OpenRouter · Ollama (local) · GitHub Models · Codex · Codex OAuth · Atomic Chat · Qwen · Any OpenAI-compatible endpoint

Switch providers mid-session: `/model deepseek-v4-pro` or `/provider openrouter`

---

## Self-Improvement (Karpathy Ratchet)

```
Agent work → Training Buffer (NDJSON) → LoRA fine-tuning → Better agents → More work
```

- **Training Buffer**: `lib/training-buffer.js` — every job auto-recorded to `E:/training/raw/`
- **LoRA Pipeline**: `purpclaw lora train` — fine-tune on your own agent work
- **3-File Contract**: `training/` directory — CRITIQUE.md, IMPROVE.md, EXECUTE.md

---

## Security (Smith + Neo Adversarial Pair)

- **Smith**: Chaos injector — 8 attack classes (prompt injection, tool abuse, memory poisoning, context flooding, authority bypass, reflection escape, recursive overload, hallucination seeding)
- **Neo**: Stabilizer — detects Smith's attacks, patches vulnerabilities
- **Reliability Ledger**: Tracks every attack detected + whether Neo caught it
- **Memory Consistency Checker**: Validates memory integrity against adversarial corruption

---

## Key Design Decisions

1. **Modular code, not modular processes** — The cognitive layer imports modules directly. HTTP between services is for the runtime layer, not the reasoning layer.
2. **Spawn safety** — All child processes go through `lib/child-registry.js`. Zero `detached: true`. Zero `shell: true`. Zero `cmd /c start`.
3. **Honest numbers** — The README and docs distinguish between "built" (code exists), "running" (process alive), and "integrated" (actually participating in decisions).
4. **No telemetry** — Everything runs locally. API keys stay in `.env`.
5. **Crash-only design** — Services restart automatically. The recovery runbook (`docs/RECOVERY.md`) covers common failure patterns.

---

## Protocol & Port Contract

All feature code MUST import ports from `lib/runtime/ports.js` — never hard-code literals.

### Core Services

| Service | Port | Protocol | Primary Endpoints | Class |
|---|---|---|---|---|
| **Next.js WebUI** | 3030 | HTTP | `/` (Mission Control) | core |
| **Unified API** | 7780 | HTTP | `/api/chat`, `/api/health`, `/api/agents/*` | core |
| **Unified API — TCP control** | 7778 | TCP (raw JSON) | — | core |
| **Voice Coordinator** | 7781 | HTTP + WebSocket | voice command routing | optional-dark |
| **EventBus** | 7782 | HTTP | `/publish`, `/subscribe` (pub/sub) | core |
| **Unified State** | 7783 | HTTP | state read/write | core |
| **Orchestrator** | 7784 | HTTP + **SSE** | `/api/orchestrate`, `/api/workflows`, `/api/system/health`, `/api/stream` | core |
| **Agent Tower** | 7790 | HTTP | `/tower/status`, `/tower/spawn` | core |
| **Gatekeeper** | 7791 | HTTP | `/health` | core |
| **Voice Bridge** | 7792 | HTTP + WebSocket | bridge-to-TCP proxy; connects to `127.0.0.1:7778` | optional-dark |
| **STT Ingress** | 7896 | HTTP | transcript ingestion | optional-dark |
| **Cognitive Spine** | 7880 | HTTP | all cognitive engines in one process | core |
| **Worker / Knowledge Pool** | 7885 | HTTP | knowledge pool | core |
| **Metrics** | 7890 | HTTP | metrics collection | core |
| **Harness (N1)** | 7798 | HTTP | product factory / autonomous harness | core |

### Deprecated / Dark Services

| Service | Port | Protocol | Status |
|---|---|---|---|
| Modal Logic Engine | 7785 | HTTP | deprecated — imported into cognitive_spine.py |
| Autonomous Diagnostics | 7786 | HTTP | deprecated — imported into cognitive_spine.py |
| Symbolic Rules Engine | 7787 | HTTP | deprecated — imported into cognitive_spine.py |
| AutoDream | 7895 | HTTP | deprecated — imported into cognitive_spine.py |
| Overflow Worker Pool | 7897 | HTTP | optional-dark |
| Vision Monitor | 7788 | HTTP | optional-dark — webcam/camera monitor (moved from 7781 to avoid voice conflict) |
| Companion Chorus Bridge | 7797 | HTTP | optional-dark |
| Neuro-Symbolic Bridge | 7799 | HTTP | deprecated — imported into cognitive_spine.py |
| TUI | 9120 | — | deprecated |

### Local AI Providers

| Provider | Port | Protocol |
|---|---|---|
| Ollama (local) | 11434 | HTTP |
| LM Studio (local) | 1234 | HTTP |

### Port Drift Resolved

| Old value | Correct value | Source |
|---|---|---|
| WebUI 3000 | **3030** | ecosystem.config.js + safe-start |
| AutoDream 7895 | **7897** | ecosystem.config.js wins (doctor.js said 7895) |
| Worker Pool 7895 | **7897** | ecosystem.config.js wins |

### Protocol Types

- **HTTP** — synchronous request/response. Used by: API, EventBus, State, Tower, Gatekeeper, Pool, Metrics, Spine, Harness, all diagnostics
- **SSE (Server-Sent Events)** — streaming response over HTTP. Used by: Orchestrator `/api/stream`, `/api/orchestrate` (long-poll degraded fallback)
- **WebSocket** — full-duplex. Used by: Voice Coordinator (7781), Voice Bridge (7792)
- **TCP (raw JSON)** — 7778. Bridge connects here for low-latency control channel — bypasses HTTP overhead
- **Pub/Sub** — EventBus (7782) over HTTP. Agents publish atoms; subscribers receive via SSE or polling

### Access Points

| Interface | URL |
|---|---|
| CLI | `purpclaw` (any terminal) |
| TUI | `purpclaw tui` |
| WebUI | `http://localhost:3030` |
| Mission Control | `http://localhost:3030/mission` |
| Orchestrator health | `GET http://localhost:7784/api/system/health` (probes all 10 core services + PM2 truth) |

---

*Architecture as of 2026-06-23. v0.2.0. Author: Eddie Cannon (weemadscotsman).*

## Auto Provider Routing (v0.2.0)

Every chat surface flows through one brain (`unified_api :7780 /api/chat` → `lib/agent-loop runAgent`). On each message the stack runs `lib/model-router.js`, which classifies the job and routes to the best **NVIDIA NIM** model lane:

| Lane | Model | Job | Agent |
|---|---|---|---|
| code | `minimaxai/minimax-m3` | code / general / quick (default) | ROBOT |
| reason | `deepseek-ai/deepseek-v4-pro` | planning / architecture / reasoning | DRAGON |
| review | `z-ai/glm-5.1` | analysis / review / QA / audit | GHOST |
| longctx | `moonshotai/kimi-k2.6` | research / long-context / whole-repo | DUCK |

Lane definitions are imported from `agent_routing_matrix.js` (single source of truth), so chat auto-routing and the swarm's per-agent `modelForAgent()` bindings never drift — typing in chat picks the same model the matching swarm agent runs on. All lanes use the rotating 5+5 NIM key pool (`NVIDIA_API_KEY_PURP1..5` + backups + HERMES); `review` uses NIM GLM 5.1 unless `GLM_API_KEY` is set. Stateless raw multi-provider calls (e.g. the Bridge comparison lab) go through the one-door gateway `POST :7780/api/llm/raw` → `llm-provider.chat()`. Tools/memory stay on `/api/chat`→`runAgent`.
