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

## Interfaces

| Interface | Command | Port |
|---|---|---|
| CLI | `purpclaw` | — |
| TUI | `purpclaw tui` | 9120 |
| WebUI | `http://localhost:3000` | 3000 |
| Mission Control | `http://localhost:3000/mission` | 3000 |
| API | `http://localhost:7780` | 7780 |
| Cognitive Spine | `http://localhost:7880/cognitive/health` | 7880 |
| Knowledge Pool | `http://localhost:7885` | 7885 |

---

*Architecture as of 2026-06-06. v0.1.0. Author: Eddie Cannon (weemadscotsman).*
