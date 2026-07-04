# Runtime Crosswalk
**Date:** 2026-07-01
**Phase:** P7 Integration Truth Repair · Item 3

The spine. One file that maps service → capability → surface → API route → CLI command.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Required for boot |
| 🟡 | Starts with `safe-start --dark` |
| 🟢 | Optional / on-demand |
| ⚪ | External only |

---

## Service → Port → Capability Map

| Service | Port | PM2 Name | Capability | CLI Command | API Routes |
|---------|------|----------|-------------|-------------|------------|
| PURPCLAW API | 7780 | `purpclaw-api` | Core HTTP gateway — all chat, agent dispatch, memory, pool, spawning | `purpclaw ask`, `purpclaw chat`, `purpclaw run` | Many (see API Registry) |
| Orchestrator | 7784 | `purpclaw-orchestrator` | Task queue governance — holds/approves high-risk jobs | `purpclaw jobs`, `purpclaw approve`, `purpclaw reject` | `/api/orchestrate` |
| Agent Tower | 7790 | `purpclaw-tower` | Agent registry + spawn — 42 named personas | `purpclaw agents`, `purpclaw roster` | `/api/tower/*` |
| Voice Coordinator | 7781 | `purpclaw-voice` | Voice pipeline orchestration | `purpclaw voice` | Internal only |
| Voice Bridge | 7792 | `purpclaw-bridge` | STT → LLM → TTS bridge | `purpclaw voice` | `/api/voice/*` |
| Event Bus | 7782 | `purpclaw-eventbus` | Inter-service pub/sub messaging | — | `/api/eventbus/*` |
| State | 7783 | `purpclaw-state` | Distributed state store | — | `/api/state/*` |
| Cognitive Spine | 7880 | `purpclaw-cognitive` | Memory matrix, symbolic rules, AutoDream | `purpclaw memory`, `purpclaw dream` | `/api/cognitive/*` |
| Pool Service | 7885 | `purpclaw-pool` | Job queue — skill pool, task queue, worker queue | `purpclaw pool`, `purpclaw queue` | `/api/pool/*` |
| Reasoning Loop | 7892 | `purpclaw-reasoning` | Self-improvement tick, karpathy ratchet | `purpclaw evolve` | Internal only |
| Worker Service | 7897 | `purpclaw-workers` | Remote worker registration + dispatch | `purpclaw workers` | `/api/workers/*` |
| Swarm Coordinator | 7898 | `purpclaw-coordinator` | Multi-agent coordination | `purpclaw council` | Internal only |
| STT Service | 7896 | `purpclaw-stt` | Speech-to-text (slower-whisper) | — | — |
| Metrics | 7890 | `purpclaw-metrics` | System metrics aggregation | — | — |
| Drift Watcher | — | `purpclaw-drift-watcher` | Monitors config drift | — | — |
| Goop Playground | 7895 | `purpclaw-goop` | Experimental playground | — | — |
| Vision Monitor | — | `purpclaw-vision` | Screen capture + vision analysis | `purpclaw look` | — |
| Harness | — | `purpclaw-harness` | Autonomous productivity harness | `purpclaw harness` | — |
| Companion Chorus | — | `purpclaw-chorus` | Companion entity management | `purpclaw mochi` | `/api/mochi` |
| Gatekeeper | — | `purpclaw-gatekeeper` | Request gating + rate limiting | — | — |
| Voice Ingress | — | `purpclaw-voice-ingress` | Voice session ingress routing | — | — |
| Telegram Gateway | 7795 | `purpclaw-telegram` | Telegram bot interface | — | — |
| Avatar Bridge | 7777 | `purpclaw-avatar` | 3D avatar control | — | — |
| YOLO Service | 7779 | `purpclaw-yolo` | Object detection | — | — |
| Web UI (Next.js) | 3030 | `purpclaw-nextjs` | Web UI — MissionControl, settings, omni, mochi | `purpclaw tui`, `purpclaw open` | `/api/*` (85 routes) |

---

## CLI Command → Service Mapping

### Lifecycle (🔴 core)
| Command | Service | Port |
|---------|---------|------|
| `purpclaw start` | orchestrator | 7784 |
| `purpclaw stop` | orchestrator | 7784 |
| `purpclaw restart` | orchestrator | 7784 |
| `purpclaw safe-start` | pool, reasoning | 7885, 7892 |
| `purpclaw safe-stop` | pool, reasoning | 7885, 7892 |
| `purpclaw doctor` | api | 7780 |

### Chat / Agent (🔴 core)
| Command | Service | Port |
|---------|---------|------|
| `purpclaw ask` | api | 7780 |
| `purpclaw chat` | api | 7780 |
| `purpclaw run` | orchestrator | 7784 |
| `purpclaw bg` | orchestrator | 7784 |
| `purpclaw agents` | tower | 7790 |
| `purpclaw council` | coordinator | 7898 |
| `purpclaw roster` | tower | 7790 |

### Memory / Training (🔴 core)
| Command | Service | Port |
|---------|---------|------|
| `purpclaw memory` | cognitive | 7880 |
| `purpclaw dream` | cognitive | 7880 |
| `purpclaw training` | cognitive | 7880 |
| `purpclaw idle` | reasoning | 7892 |

### Skills / Pool
| Command | Service | Port |
|---------|---------|------|
| `purpclaw pool` | pool | 7885 |
| `purpclaw registry` | pool | 7885 |
| `purpclaw install` | pool | 7885 |
| `purpclaw search` | pool | 7885 |
| `purpclaw workflows` | pool | 7885 |

### Workers
| Command | Service | Port |
|---------|---------|------|
| `purpclaw workers` | worker | 7897 |

### Capabilities / Introspection
| Command | Service | Port |
|---------|---------|------|
| `purpclaw capabilities` | api | 7780 |
| `purpclaw surfaces` | api | 7780 |
| `purpclaw features` | api | 7780 |
| `purpclaw whoami` | api | 7780 |
| `purpclaw introspect` | api | 7780 |
| `purpclaw services` | api | 7780 |
| `purpclaw llm` | api | 7780 |

### Diagnostics
| Command | Service | Port |
|---------|---------|------|
| `purpclaw smoke` | api | 7780 |
| `purpclaw bughunt` | api | 7780 |
| `purpclaw ctx-viz` | api | 7780 |
| `purpclaw doctors` | api | 7780 |
| `purpclaw heal` | api | 7780 |
| `purpclaw drift` | drift-watcher | — |
| `purpclaw health` | api | 7780 |

### Config / Identity
| Command | Service | Port |
|---------|---------|------|
| `purpclaw config` | api | 7780 |
| `purpclaw identity` | cognitive | 7880 |
| `purpclaw souls` | cognitive | 7880 |
| `purpclaw onboard` | api | 7780 |
| `purpclaw setup` | api | 7780 |

### Telemetry / Analytics
| Command | Service | Port |
|---------|---------|------|
| `purpclaw telemetry` | metrics | 7890 |
| `purpclaw harvest` | api | 7780 |
| `purpclaw pool stats` | pool | 7885 |

### Planning / Execution
| Command | Service | Port |
|---------|---------|------|
| `purpclaw plan` | orchestrator | 7784 |
| `purpclaw workflow` | pool | 7885 |
| `purpclaw governance` | orchestrator | 7784 |

### Code / Dev
| Command | Service | Port |
|---------|---------|------|
| `purpclaw code` | tower | 7790 |
| `purpclaw claudecode` | tower | 7790 |
| `purpclaw architecture` | api | 7780 |
| `purpclaw overview` | api | 7780 |
| `purpclaw parity` | api | 7780 |

### UI
| Command | Service | Port |
|---------|---------|------|
| `purpclaw tui` | nextjs | 3030 |
| `purpclaw open` | nextjs | 3030 |
| `purpclaw mochi` | chorus | — |

### Infrastructure
| Command | Service | Port |
|---------|---------|------|
| `purpclaw gc` | api | 7780 |
| `purpclaw logs` | api | 7780 |
| `purpclaw rollback` | api | 7780 |
| `purpclaw teleport` | api | 7780 |
| `purpclaw ponytail` | omnicode | — |

---

## Unwired Commands (need wiring — see COMMAND_TRUTH.md)

| Command | Module | Status |
|---------|--------|--------|
| `purpclaw grow` | `lib/commands/grow.js` | routed — wire it |
| `purpclaw harness` | `lib/commands/harness.js` | routed — wire it |
| `purpclaw plan` | `lib/commands/plan.js` | routed — wire it |
| `purpclaw telemetry` | `lib/commands/telemetry.js` | routed — wire it |
| `purpclaw thringlets` | `lib/commands/thringlets.js` | routed — wire it |
| `purpclaw ponytail` | `lib/commands/ponytail.js` | routed — wire it |
| `purpclaw business` | `lib/commands/business.js` | deprecated-donor — Twilio required |
| `purpclaw deploy` | `lib/commands/deploy.js` | deprecated-donor — PM2 supersedes |
| `purpclaw open` | `lib/commands/open.js` | deprecated-donor — `purpclaw tui` serves this |

---

## Next
→ Item 4: API Ownership Registry (85 routes)
