# PURPCLAW Architecture

> v0.2.0 · 2026-06-22 — live counts only. Use /api/whoami, /api/pulse, /api/services. 73 agents (35 hardcoded + 41 personas − 3 dupes), 459 tools (82 real + 377 Hermes skill wrappers), 7-8 env providers. New: pulse (self-heartbeat), spine-shim (Node fallback when Python spine deadlocks), LRU caches on recall() + get_stats().

---

## Thesis

PURPCLAW is an **AI operating system**, not an AI application. Every layer maps to an OS primitive:

| OS Primitive | PURPCLAW Component |
|---|---|
| Shell | `purpclaw` CLI + TUI + WebUI |
| Processes | 73 runtime agents (35 hardcoded animals + 41 personas − 3 dupes) |
| Persistent storage | Memory Matrix v2 (7 layers, recall() + get_stats() LRU-cached) |
| IPC | EventBus (pub/sub) |
| Scheduler | Orchestrator (task routing + governance) |
| CPUs | 7-8 LLM providers (count from /api/pulse — env-driven) |
| Multiprocessing | Swarm mode (parallel agent fan-out) |
| Software evolution | Karpathy ratchet (self-training) |

---

## Service Topology (25 services)

```
                    ┌─────────────────────────────────┐
                    │         MISSION CONTROL          │
                    │         :3030 (Next.js)          │
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
| WebUI | `http://127.0.0.1:3030` | 3030 |
| Mission Control | `http://127.0.0.1:3030/mission` | 3030 |
| API | `http://localhost:7780` | 7780 |
| Cognitive Spine | `http://localhost:7880/cognitive/health` | 7880 |
| Knowledge Pool | `http://localhost:7885` | 7885 |

---

*Architecture as of 2026-06-22. v0.2.0. Author: Eddie Cannon (weemadscotsman). All counts are live; marketing numbers (152/110) were stale.*


---

## v0.2.0 Changes (2026-06-22)

### What the stack does by itself

- **Pulse** (`lib/pulse.js`) — wakes every 5 min, probes 6 core services, reads the trace,
  detects service-down + recent errors, broadcasts findings to the event bus,
  writes to `agent_work/trace/notifications.jsonl`, exposed at `/api/pulse`.
- **Spine shim** (`lib/spine-shim.js`) — Node.js fallback for the Python cognitive
  spine when its get_stats() deadlocks the ThreadingTCPServer. Routes the
  agent and the UI to a fast, lightweight health response.
- **LRU caches** in `memory_matrix.py` (recall 30s) and `memory_matrix_v2.py`
  (get_stats 30s) so heavy read paths don't time out under load.
- **spine_health_cached()** in `cognitive_spine.py` — async cache + thread
  so /health is never blocked. On any error, the last good cache is served.

### What the agent can do without being prompted

- Reads live stack state via `buildSystemPrompt()` and surfaces:
  - 459 tools (82 real + 377 Hermes skill wrappers, live count from registry)
  - 73 agents (35 hardcoded + 41 personas minus 3 dupes, live count from agent_tower)
  - 7-8 LLM providers (live count from env via _liveProviderCount())
  - Pulse findings (services down, recent errors, latest 3 notifications)
- Speaks truth. If cognitive is down, the agent says so. If the spine is hung,
  the agent knows because the spine-shim took over.

### What's still broken (not v0.2.0 blockers, but called out)

- The Python cognitive spine's ThreadingTCPServer deadlocks on heavy
  endpoints (get_stats over 22k atoms). The shim is a workaround. The real
  fix is rewriting the spine in Node or adding a per-handler timeout.
- Several "core" services crash and restart (cognitive 21x, orchestrator 2x).
  This is a leak / state issue, not a wiring issue.
- The /tmp on git-bash is unmovable. Files that Windows .NET holds are
  eternal. Workaround: keep ALL work on E:.

### Files added in v0.2.0

- `lib/pulse.js` — self-heartbeat (9K, pure Node, no deps)
- `lib/spine-shim.js` — Node.js fallback for the cognitive spine (3K)
- `lib/spine-shim-mount.js` — mount helper
- `app/api/pulse/route.ts` — Next.js proxy for /api/pulse (planned)
- `/api/pulse`, `/api/pulse/notifications`, `/api/pulse/tick` on unified_api
- `/api/spine/health` — lightweight shim endpoint on unified_api

### Files modified in v0.2.0

- `lib/agent-loop.js` — buildSystemPrompt() injects pulse findings, drops hardcoded "110+/152"
- `unified_api.js` — requires lib/pulse at boot, exposes pulse routes, Next.js bind to 127.0.0.1
- `lib/memory-client.js` — announces memory.ingested and memory.recalled on the bus
- `lib/events.js` — universal broadcaster with local trace fallback
- `lib/idle-engine.js` — cycle + phase announcements
- `agent_tower.js` — spawn + toolResult announcements
- `bin/purpclaw.js` — version 0.2.0 in splash, TUI passes pulse fields through
- `scripts/tui.js` — header shows pulse tick count + services-down indicator
- `package.json` — 0.1.7 → 0.2.0
- `app/components/CockpitShell.tsx` — "OS v0.2.0" label

