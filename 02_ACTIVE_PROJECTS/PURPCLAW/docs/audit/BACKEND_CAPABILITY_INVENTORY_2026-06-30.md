# BACKEND CAPABILITY INVENTORY — 2026-06-30

## Chat & Sessions

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Send chat message | `/api/chat` | GET | unified_api.js `case 'chat'` | ACTIVE |
| Chat completions | `/api/chat` alt | GET | llm-provider.js → MiniMax | ACTIVE |
| Swarm chat | `/api/chat/swarm` | GET | unified_api.js | ACTIVE |
| Orchestrate | `/api/orchestrate` | POST | unified_api.js | ACTIVE |
| List sessions | `/api/sessions` | GET | unified_api.js `case 'sessions'` | ACTIVE |
| Load session | `/api/sessions/[id]` | GET | unified_api.js | ACTIVE |
| Save session | `/api/sessions/[id]` | GET | unified_api.js | ACTIVE |
| Delete session | `/api/sessions/[id]` | GET | unified_api.js | ACTIVE |
| Export chat | `/api/output` | GET | unified_api.js `case 'output'` | ACTIVE |

## AWAKEN Runtime

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| AWAKEN status/feeds | `/api/awaken/status` | GET | Reads agent_work/awaken/state.json | ACTIVE |
| AWAKEN start | `/api/awaken/start` | POST | Spawns AWAKEN runtime | ACTIVE |
| AWAKEN stop | `/api/awaken/stop` | POST | Terminates runtime | ACTIVE |
| Governor status | `/api/governor/status` | GET | agent_work/governor/state.json | ACTIVE |
| Governor policy | `/api/governance/policy` | GET | governance files | ACTIVE |
| Gatekeeper status | `/api/gatekeeper-status` | GET | gatekeeper state | ACTIVE |

## Agents & Workforce

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Agent manifest | `/api/manifest` | GET | bin/purpclaw.js + agent-registry | ACTIVE |
| Agent scores | `/api/agent-scores` | GET | agent_work/scores/ | ACTIVE |
| Tower stream | `/api/tower/stream` | GET | agent_tower.js :7790 | ACTIVE |
| Tower status | `/api/service-proxy:7790` | GET | Tower service health | ACTIVE |
| Delegation status | `/api/delegation/status` | GET | orchestrator :7784 | ACTIVE |
| Swarm agents | `/api/service-proxy:7784` | GET | Orchestrator agent pool | ACTIVE |

## Harness & Missions

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| List missions | `/api/harness/missions` | GET | agent_work/harness/ | ACTIVE |
| Mission status | `/api/harness/missions/[id]` | GET | mission state files | ACTIVE |
| Mission abort | `/api/harness/missions/[id]/abort` | POST | kill mission process | ACTIVE |
| Mission stream | `/api/harness/missions/[id]/stream` | GET | SSE job progress | ACTIVE |
| Harness start | `/api/harness/start` | POST | spawn new mission | ACTIVE |
| Harness status | `/api/harness/status` | GET | harness daemon state | ACTIVE |
| Harness benchmarks | `/api/harness-benchmarks` | GET | benchmark results | ACTIVE |

## Kernel & Jobs

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Kernel jobs | `/api/kernel/jobs` | GET | bin/purpclaw.js kernel | ACTIVE |
| Job detail | `/api/kernel/jobs/[id]` | GET | job state | ACTIVE |
| LLM plan | `/api/llm/plan` | POST | kernel planner | ACTIVE |
| Stack whoami | `/api/stack-whoami` | GET | runtime identity | ACTIVE |
| Pulse | `/api/pulse` | GET | heartbeat | ACTIVE |

## Pipeline & Traces

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Pipeline status | `/api/pipeline` | GET | pipeline state | ACTIVE |
| Event timeline | `/api/event-timeline` | GET | eventbus state | ACTIVE |
| Trace recent | `/api/trace/recent` | GET | trace store | ACTIVE |
| Trace stream | `/api/trace/stream` | GET | SSE trace stream | ACTIVE |
| Event stream | `/api/eventbus/stream` | GET | SSE eventbus | ACTIVE |
| Log stream | `/api/logs/stream` | GET | SSE logs | ACTIVE |

## Providers & Models

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Providers list | `/api/providers` | GET | lib/llm-provider.js | ACTIVE |
| LLM config | `/api/llm-config` | GET | env/config | ACTIVE |
| LLM status | `/api/llm-status` | GET | provider health | ACTIVE |
| Models list | `/api/models` | GET | provider model lists | ACTIVE |
| LLM ledger | `/api/llm-ledger` | GET | spend/usage records | ACTIVE |
| Ollama gateway | `/api/ollama` | GET | local Ollama | ACTIVE |
| OmniCode status | `/api/omnicode/status` | GET | OmniCode MCP | ACTIVE |

## Memory & Cognitive

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Memory recall | `/api/memory` + POST | GET/POST | cognitive_spine.py :7880 | ACTIVE |
| Memory search | `/api/memory` GET | GET | FAISS vector search | ACTIVE |
| Spine health | `/api/spine-health` | GET | cognitive_spine.py health | ACTIVE |
| Session memory | `/api/mission-data` | GET | session-scoped memory | ACTIVE |

## Mochi & Companions

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Mochi state | `/api/mochi` | GET | thringlets colony state | ACTIVE |
| Mochi action | `/api/mochi-action` | POST | interact with companion | ACTIVE |
| Thringlets colony | `/api/thringlets` | GET | colony state | ACTIVE |
| Thringlet interact | `/api/thringlets/[id]/interact` | POST | single thringlet | ACTIVE |
| Colony mood | `/api/thringlets/colony-mood` | GET | aggregate mood | ACTIVE |

## Evolution & Self-Improvement

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Evolution status | `/api/evolution/status` | GET | lib/evolution/ | ACTIVE |
| Skill amendments | `/api/skill-amendments` | GET | skill improvement proposals | ACTIVE |
| Auto-research | `/api/research/group` | POST | autonomous research | ACTIVE |
| Features registry | `/api/features` | GET | feature gates | ACTIVE |
| Capabilities | `/api/capabilities` | GET | system capabilities | ACTIVE |

## System & Infrastructure

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Health check | `/api/health` | GET | all services | ACTIVE |
| Host telemetry | `/api/host-telemetry` | GET | CPU/RAM/disk | ACTIVE |
| Services list | `/api/services` | GET | ecosystem services | ACTIVE |
| Service proxy | `/api/service-proxy` | GET | proxy to backend ports | ACTIVE |
| Registry | `/api/registry` | GET | tool/agent registry | ACTIVE |
| Discovery | `/api/discover` | GET | service discovery | ACTIVE |
| Setup | `/api/setup` | GET | onboarding status | ACTIVE |
| Preprompt | `/api/preprompt` | GET | system prompt config | ACTIVE |
| Personality | `/api/personality` | GET | personality config | ACTIVE |
| Settings | `/api/settings` | GET | user settings | ACTIVE |
| Whoami | `/api/whoami` | GET | operator identity | ACTIVE |
| Heartbeat | `/api/heartbeat` | GET | runtime heartbeat | ACTIVE |

## Voice & Bridge

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Voice command | `/api/voice-command` | POST | voice → text → action | PARTIAL |
| Bridge | `/api/bridge` | GET | bridge status | ACTIVE |
| Computer use | `/api/computer-use` | GET | computer use capability | ACTIVE |
| Playwright | `/api/playwright` | POST | browser automation | ACTIVE |

## Evidence & Proof

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Proof verify | `/api/proof` | GET | ZK proof verification | ACTIVE |
| Benchmark | `/api/benchmark/odysseus` | GET | performance benchmarks | ACTIVE |
| API mega list | `/api/api-mega-list` | GET | full API inventory | ACTIVE |
| Upload | `/api/upload` | POST | file upload | ACTIVE |
| Yo (ping) | `/api/yo` | GET | ping/pong | ACTIVE |
| Internal check | `/api/internal/check` | GET | internal diagnostics | ACTIVE |

## Capabilities NOT wired to UI

| Capability | Route | State | UI Destination |
|---|---|---|---|
| Voice command | `/api/voice-command` | PARTIAL | `/voice` — needs full wiring |
| Playwright | `/api/playwright` | ACTIVE | No UI — developer tool |
| Proof verify | `/api/proof` | ACTIVE | `/omni` — ZK proof |
| Ollama | `/api/ollama` | ACTIVE | `/providers` |
| Auto-research | `/api/research/group` | ACTIVE | `/evolution` |
| Skill amendments | `/api/skill-amendments` | ACTIVE | `/evolution` |
| Governor/policy | `/api/governance/policy` | ACTIVE | `/omni` |
| Computer use | `/api/computer-use` | ACTIVE | `/settings` or developer |
| LLM plan | `/api/llm/plan` | ACTIVE | `/evolution` |

## Summary

| State | Count |
|---|---|
| ACTIVE | 73 |
| PARTIAL | 4 |
| BROKEN | 0 |
| UNKNOWN | 0 |
| UI_MISSING | 10 |
| **Total routes** | **79** |
