# PURPCLAW — Quick Start

**PURPCLAW** is a terminal-first AI operating system — 17 LLM providers, 110+ tools, 152 agent directories, a 7-layer memory architecture, and a self-improving training ratchet. One command to install. One command to boot.

---

## One-Line Install

```bash
npm install -g purpclaw
```

That's it. Already published to npm as `purpclaw` v0.1.0.

---

## First Boot

```bash
purpclaw setup --wizard
```

Walks through:
1. **Pick your LLM provider** — Anthropic, OpenAI, DeepSeek, MiniMax, Kimi, Groq, OpenRouter, Ollama (local), Gemini, GitHub Models, Codex, Atomic Chat, or any OpenAI-compatible endpoint
2. **Paste your API key** — stored locally in `~/.purpclaw/.env`
3. **Boot the swarm** — PM2 starts core services, WebUI comes online at `:3000`

---

## Core Commands

```bash
# Boot and shutdown
purpclaw start              Boot the full 25-service stack
purpclaw safe-start         Boot one service at a time (Windows-safe)
purpclaw safe-start --dark  Wake the cognitive cluster (memory, rules, modal, etc.)
purpclaw stop               Shut down gracefully
purpclaw status             Live dashboard

# The work loop
purpclaw run "build a landing page"    Run through orchestrator
purpclaw ask "what does this code do"  Direct LLM conversation
purpclaw bg "refactor auth module"     Fire and forget, results in agent_work/

# Agents and swarm
purpclaw agents list         List all 35 runtime agents
purpclaw swarm "audit security"  Fan-out to Planner+Builder+Auditor+Security
purpclaw chat                 NanoClaw REPL (swarm-aware)

# Self-improvement
purpclaw lora train           Fine-tune on your own agent work
purpclaw training status      Check training buffer stats
purpclaw ratchet run          Run Karpathy self-improvement cycle

# Diagnostics
purpclaw doctor               Health check (all 25 services)
purpclaw heal                  Auto-recover from common failures
purpclaw spaghetti audit       Code health scores
purpclaw logs [service]        Stream service logs
```

---

## Service Architecture (25 total)

### Core (always running)
| Service | Port | What it does |
|---|---|---|
| eventbus | 7782 | Pub/sub between all services |
| state | 7783 | Shared state store |
| api | 7780 | Main HTTP gateway |
| tower | 7790 | Agent spawner (152 agent dirs) |
| orchestrator | 7784 | Task routing + governance gate |
| gatekeeper | 7791 | Security policies |
| metrics | 7890 | Telemetry + health |

### Runtime
| Service | Port | What it does |
|---|---|---|
| context | 7881 | Context bus |
| pool | 7885 | Knowledge pool (skills + agents) |
| workers | 7897 | Worker service |
| reasoning | 7892 | Proactive reasoning loop |

### Media + Interface
| Service | Port | What it does |
|---|---|---|
| nextjs | 3000 | Mission Control WebUI |
| voice | 7781 | Voice command coordinator |
| bridge | 7792 | Voice bridge (WebSocket) |
| chorus | — | Companion chorus bridge |
| vision | — | YOLO object detection monitor |
| stt | 7896 | Whisper speech-to-text |
| yolo | 7779 | YOLO service |
| avatar | 7777 | Simple bridge |

### Cognitive (defined but dark by default)
Wake with `purpclaw safe-start --dark` or boot `cognitive_spine.py` directly:

| Service | Port | What it does |
|---|---|---|
| memory | 7880 | Memory Matrix v2 (temporal + counterfactual) |
| rules | 7787 | Datalog symbolic rules engine |
| modal | 7785 | Kripke modal logic (epistemic/temporal/doxastic/deontic) |
| diagnostics | 7786 | Autonomous diagnostic orchestrator |
| bridge-ns | 7884 | Neuro-symbolic bridge |
| autodream | — | Memory consolidation engine |

**Or better: boot just `python cognitive_spine.py --port 7880`** — it imports all six cognitive modules directly into one process. One port. No port soup.

---

## Interfaces

- **CLI**: `purpclaw` — the terminal front door
- **TUI**: `purpclaw tui` — full-screen terminal UI with Mochi sprites, slash commands, streaming
- **WebUI**: `http://localhost:3000` — Mission Control dashboard
- **WebUI Mission**: `http://localhost:3000/mission` — Full MissionControl with 17 tabs

---

## File Layout

```
PURPCLAW/
  bin/purpclaw.js          CLI front door (npm binary)
  unified_api.js           Main HTTP API (7780)
  orchestrator.js          Task router + governance
  agent_tower.js           Agent spawning
  boot.js                  Unified boot sequence
  cognitive_spine.py       Single cognitive surface (memory+rules+modal+neuro+diagnostics+autodream)
  ecosystem.config.js      PM2 service definitions (25 services)
  lib/child-registry.js    Spawn tracker — no more cmd-window cascade
  lib/llm-provider.js      17-provider abstraction
  lib/training-buffer.js   Agent work → training data
  skills/                  139 skill directories
  agents/                  152 agent directories (54 with executable code)
  docs/                    Architecture + recovery + roadmap
  agent_work/              Job history + training exports
```

---

## Recovery

```bash
purpclaw doctor              # Quick health check
purpclaw heal                 # Auto-recover: port collisions, zombie PIDs, .next corruption
purpclaw logs <service>       # Stream service logs
```

See `docs/RECOVERY.md` for common failure patterns and fixes.

---

## FAQ

**What's the minimum to run?**

`npm install -g purpclaw` then `purpclaw ask "hello"` — the CLI auto-starts what it needs.

**Do I need all 25 services?**

No. 9 core services handle most workflows. The cognitive cluster is optional. The media services (vision, voice, yolo) need hardware.

**Why Python AND Node?**

Python for ML workloads (Whisper, YOLO, cognitive engines). Node for the CLI, API, orchestration, and WebUI. They talk over HTTP.

**How do I add a skill?**

Drop a `SKILL.md` in `skills/<name>/` and run `purpclaw pool reindex`.

**What about the spawn cascade?**

Fixed. All spawns now go through `lib/child-registry.js` — zero `detached: true`, zero `shell: true`, zero `cmd /c start`. See `docs/RECOVERY.md` if anything leaks.

---

*Built by Eddie Cannon (weemadscotsman). Ship date: 2026-06-06. v0.1.0.*
