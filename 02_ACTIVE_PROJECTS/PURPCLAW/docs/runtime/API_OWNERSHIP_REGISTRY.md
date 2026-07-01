# API Ownership Registry
**Date:** 2026-07-01
**Phase:** P7 Integration Truth Repair · Item 4
**Total routes:** 85 (verified by `find app/api -name route.ts`)

Format: `owner | purpose | capability | auth/safety | surface | status`

---

## Chat / Agent Core 🔴

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET,POST /api/chat` | `unified_api.js` | Primary chat interface — LLM routing, streaming, agent spawning | Chat / agent loop | Rate-limited, gatekeeper | MissionControl chat panel | ✅ active |
| `GET,POST /api/chat/swarm` | `unified_api.js` | Multi-agent swarm chat dispatch | Swarm orchestration | Rate-limited | Chat swarm mode | ✅ active |
| `GET,POST /api/orchestrate` | `orchestrator.js` | Task governance — holds, approves, rejects high-risk jobs | Job governance | Auth-gated | Jobs panel | ✅ active |

---

## Agent / Tower

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/agent-scores` | `agent-router.js` | Live agent performance scores | Agent intelligence | Read-only | Dashboard | ✅ active |
| `GET /api/tower/stream` | `agent_tower.js` | SSE stream of tower agent events | Agent monitoring | Read-only | MissionControl | ✅ active |
| `GET,POST /api/delegation/status` | `delegation-status.js` | Delegation board status | Delegation governance | Read-only | — | ✅ active |

---

## Memory / Cognitive Spine 🔴

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/spine-health` | `cognitive_spine.py` | Cognitive spine health check | Memory matrix | Read-only | Vitals panel | ✅ active |
| `GET /api/manifest` | `unified_api.js` | Tool + agent capability manifest | Capability registry | Read-only | Many surfaces | ✅ active |
| `GET,POST /api/discover` | `unified_api.js` | Intent-based capability matching (ARD) | Capability routing | Read-only | Chat completions | ✅ active |
| `GET,POST /api/personality` | `personality.js` | Persona state + management | Persona layer | Read-only | Mochi, chat | ✅ active |
| `GET /api/sessions` | `unified_api.js` | Chat session list | Memory | Authenticated | Settings | ✅ active |
| `GET /api/sessions/[id]` | `unified_api.js` | Single session by ID | Memory | Authenticated | Session restore | ✅ active |

---

## Skills / Pool

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/registry` | `curator.js` | Skill + agent registry | Skill management | Read-only | Registry browser | ✅ active |
| `GET,POST /api/pool` | `pool_service.js` | Skill pool + task queue operations | Pool management | Rate-limited | Pool panel | ✅ active |
| `GET,POST /api/pipeline` | `pipeline-registry.js` | Workflow pipeline registry | Workflow | Rate-limited | Pipeline panel | ✅ active |
| `GET,POST /api/preprompt` | `unified_api.js` | Preprompt template management | Prompt engineering | Rate-limited | Settings | ✅ active |
| `GET,POST /api/skill-amendments` | `curator.js` | Skill amendment patch management | Skill registry | Rate-limited | Registry | ✅ active |

---

## Mission / Harness

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/harness/status` | `harness_service.js` | Harness service health | Harness | Read-only | MissionControl | ✅ active |
| `POST /api/harness/start` | `harness_service.js` | Start autonomous mission | Autonomous harness | Admin | Mission panel | ✅ active |
| `GET,POST /api/harness/missions` | `harness_service.js` | Mission CRUD | Harness missions | Admin | Mission panel | ✅ active |
| `GET /api/harness/missions/[id]` | `harness_service.js` | Single mission detail | Harness | Admin | Mission panel | ✅ active |
| `POST /api/harness/missions/[id]/abort` | `harness_service.js` | Abort running mission | Harness | Admin | Mission panel | ✅ active |
| `GET /api/harness/missions/[id]/stream` | `harness_service.js` | Mission event stream (SSE) | Harness | Admin | Mission panel | ✅ active |
| `GET /api/harness-benchmarks` | `harness_service.js` | Harness benchmark results | Benchmark | Read-only | MissionControl | ✅ active |
| `GET /api/mission-data` | `unified_api.js` | Mission context data | Memory | Authenticated | Chat panel | ✅ active |

---

## Evolution / Research

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `POST /api/awaken/start` | `awaken.js` | Start autonomous evolution cycle | Self-evolution | Admin | Evolution panel | ✅ active |
| `GET /api/awaken/status` | `awaken.js` | Evolution cycle status | Self-evolution | Read-only | Evolution panel | ✅ active |
| `POST /api/awaken/stop` | `awaken.js` | Stop evolution cycle | Self-evolution | Admin | Evolution panel | ✅ active |
| `GET /api/evolution/status` | `self-evolution-loop.js` | Evolution loop status | Self-evolution | Read-only | Evolution panel | ✅ active |
| `POST /api/evolution/research` | `evolution.js` | Research task dispatch | Intelligence | Rate-limited | Evolution | ✅ active |
| `POST /api/evolution/skills` | `evolution.js` | Skill evolution dispatch | Self-improvement | Rate-limited | Evolution | ✅ active |
| `POST /api/evolution/steering` | `evolution.js` | Evolution steering inputs | Self-evolution | Rate-limited | Evolution | ✅ active |
| `GET,POST /api/research/group` | `deep-research-group.js` | Research group coordination | Research | Rate-limited | — | ✅ active |

---

## Providers / LLM

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/providers` | `llm-provider.js` | Available LLM providers | LLM routing | Read-only | Providers panel | ✅ active |
| `GET,POST /api/models` | `llm-provider.js` | Model list + selection | LLM routing | Rate-limited | Providers | ✅ active |
| `GET /api/llm-config` | `llm-provider.js` | Active LLM configuration | LLM routing | Read-only | Settings | ✅ active |
| `GET /api/llm-status` | `llm-status.js` | LLM provider health status | Provider health | Read-only | Vitals | ✅ active |
| `GET /api/llm-ledger` | `unified_api.js` | LLM usage ledger | Usage tracking | Read-only | Metrics | ✅ active |
| `POST /api/llm/plan` | `reasoning-loop.js` | LLM planning request | Reasoning | Rate-limited | — | ✅ active |
| `GET,POST /api/ollama` | `llm-provider.js` | Ollama-specific proxy | LLM routing | Rate-limited | Providers | ✅ active |

---

## Capabilities / Features

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/capabilities` | `capability-registry.js` | Full capability registry | Capability mapping | Read-only | Omni panel | ✅ active |
| `GET /api/features` | `feature-parity.js` | Feature parity status | Feature tracking | Read-only | Omni | ✅ active |
| `GET,POST /api/api-mega-list` | `api-mega-list.js` | API mega-list assignments | API mapping | Read-only | Omni | ✅ active |
| `GET,POST /api/discover` | `unified_api.js` | ARD capability discovery | Capability routing | Read-only | Chat | ✅ active |

---

## Mochi / Companion Chorus

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/mochi` | `mochi.js` | Mochi companion state | Companion | Read-only | Mochi page | ✅ active |
| `GET,POST /api/mochi-action` | `mochi.js` | Mochi action dispatch | Companion | Authenticated | Mochi page | ✅ active |
| `GET /api/companion-chorus/roster` | `companion-chorus` | Companion roster | Companion | Read-only | Mochi | ✅ active |

---

## Thringlets

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/thringlets` | `lib/thringlets.js` | Thringlet registry | Colony lens | Read-only | — | ✅ active |
| `GET /api/thringlets/[id]` | `lib/thringlets.js` | Single thringlet detail | Colony lens | Read-only | — | ✅ active |
| `POST /api/thringlets/[id]/interact` | `lib/thringlets.js` | Interact with thringlet | Colony lens | Authenticated | — | ✅ active |
| `GET /api/thringlets/colony-mood` | `lib/thringlets.js` | Colony aggregate mood | Colony lens | Read-only | — | ✅ active |

---

## System / Health

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/health` | `unified_api.js` | Overall stack health | System health | Read-only | All panels | ✅ active |
| `GET /api/status` | `unified_api.js` | Detailed status | System status | Read-only | Dashboard | ✅ active |
| `GET /api/heartbeat` | `unified_api.js` | Heartbeat ping | System health | Read-only | All panels | ✅ active |
| `GET /api/pulse` | `pulse.js` | Pulse system metrics | Pulse | Read-only | Dashboard | ✅ active |
| `GET /api/host-telemetry` | `metrics_aggregator.js` | Host-level telemetry | Telemetry | Read-only | Vitals | ✅ active |
| `GET /api/stack-whoami` | `whoami.js` | Live stack self-description | Introspection | Read-only | Settings | ✅ active |
| `GET /api/governor/status` | `governor-bridge.js` | Governor status | Governance | Read-only | — | ✅ active |
| `GET,POST /api/governance/policy` | `governance.js` | Governance policy CRUD | Governance | Admin | — | ✅ active |
| `GET /api/gatekeeper-status` | `gatekeeper.js` | Gatekeeper health | Request gating | Read-only | — | ✅ active |

---

## Trace / Output / Logs

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/trace/recent` | `trace-store.js` | Recent trace entries | Trace | Read-only | Trace panel | ✅ active |
| `GET /api/trace/stream` | `trace-store.js` | Trace SSE stream | Trace | Read-only | Trace panel | ✅ active |
| `GET,POST /api/output` | `output-vault.js` | Output vault storage | Trace | Authenticated | — | ✅ active |
| `GET /api/logs/stream` | `unified_api.js` | Log stream (SSE) | Logging | Read-only | Logs panel | ✅ active |
| `GET /api/event-timeline` | `events.js` | Event timeline | Event bus | Read-only | Timeline | ✅ active |
| `GET /api/eventbus/stream` | `unified_eventbus.js` | Event bus SSE stream | Pub/sub | Read-only | — | ✅ active |

---

## Benchmark / Proof

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/benchmark/ledger` | `omnicode-bridge.js` | OmniCode benchmark ledger | Benchmark | Read-only | Omni | ✅ active |
| `GET /api/benchmark/odysseus` | `odysseus-scorecard.js` | Odysseus scorecard | Benchmark | Read-only | Omni | ✅ active |
| `GET /api/proof` | `proof-ledger.js` | Proof ledger | Proof | Read-only | — | ✅ active |

---

## Compute / Execution

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET,POST /api/action` | `action-dispatcher.js` | Action dispatch | Tool execution | Rate-limited, gatekeeper | — | ✅ active |
| `GET,POST /api/computer-use` | `computer-use.js` | Browser compute use | Tool execution | Rate-limited | — | ✅ active |
| `GET,POST /api/playwright` | `puppeteer.ts` | Playwright browser automation | Tool execution | Rate-limited | — | ✅ active |
| `GET,POST /api/sampler` | `sampler.js` | Prompt sampling | Tool execution | Rate-limited | — | ✅ active |
| `POST /api/voice-command` | `voice_coordinator.js` | Voice command dispatch | Voice | Authenticated | Voice pipeline | ✅ active |

---

## Service / Kernel

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/services` | `unified_api.js` | Service health list | Service discovery | Read-only | Dashboard | ✅ active |
| `GET /api/internal/check` | `unified_api.js` | Internal health check | System health | Internal | — | ✅ active |
| `GET,POST /api/kernel/jobs` | `api-harness-kernel.js` | Kernel job management | Job kernel | Admin | — | ✅ active |
| `GET /api/kernel/jobs/[id]` | `api-harness-kernel.js` | Single kernel job | Job kernel | Admin | — | ✅ active |
| `GET,POST /api/bridge` | `unified_api.js` | Bridge proxy | Bridge | Rate-limited | — | ✅ active |
| `GET,POST /api/service-proxy` | `unified_api.js` | Service proxy | Bridge | Rate-limited | — | ✅ active |
| `GET /api/services` | `unified_api.js` | Service registry | Service | Read-only | — | ✅ active |
| `GET /api/rules/refusal-weights` | `governance.js` | Refusal weight configuration | Governance | Admin | — | ✅ active |

---

## Settings / Config

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET,POST /api/settings` | `unified_api.js` | User settings CRUD | Settings | Authenticated | Settings page | ✅ active |
| `POST /api/setup` | `setup.js` | First-run setup | Onboarding | Public | Onboarding | ✅ active |

---

## Upload

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `POST /api/upload` | `unified_api.js` | File upload | Storage | Authenticated, size-limited | Settings | ✅ active |
| `GET /api/upload` | `unified_api.js` | Upload status/check | Storage | Authenticated | — | ✅ active |

---

## OmniCode Integration

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/omnicode/status` | `omnicode-bridge.js` | OmniCode MCP status | OmniCode | Read-only | Omni panel | ✅ active |

---

## Misc / Unclassified

| Route | Owner | Purpose | Capability | Auth | Surface | Status |
|-------|-------|---------|------------|------|---------|--------|
| `GET /api/yo` | `unified_api.js` | Yo endpoint (unknown) | Unknown | ? | — | ⚠️ unknown |
| `POST /api/yo` | `unified_api.js` | Yo endpoint (unknown) | Unknown | ? | — | ⚠️ unknown |

---

## Verification

```bash
find app/api -name route.ts | wc -l
# → 85
```

---

## Next
→ Item 5: Root Script Classification
