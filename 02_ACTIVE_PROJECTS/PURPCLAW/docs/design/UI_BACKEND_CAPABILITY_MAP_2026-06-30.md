# UI_BACKEND_CAPABILITY_MAP — 2026-06-30

The contract between what the UI shows and what the backend proves.

Legend:
- `Status`: ACTIVE = live proof / PARTIAL = some gap / UNKNOWN = no data / FAKE_OR_STALE = claim not backed / UI_ONLY_DONOR = design idea only / UI_MISSING = backend exists no UI
- `Evidence`: exact route/API/feed/file that backs the claim
- `Destination`: where it lives in the consolidated UI

## CHAT & COMMAND

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Chat input/send | CommandPanel | `/api/chat` | unified_api.js case 'chat' | ACTIVE | `/mission` — CommandPanel |
| Chat stream (SSE) | CommandPanel | `/api/chat` streaming | unified_api.js → llm-provider | ACTIVE | `/mission` — CommandPanel |
| Provider/model select | CommandPanel | LLM env vars | lib/llm-provider.js | PARTIAL — selector in UI not wired | `/mission` |
| Swarm chat | `/chat/swarm` | `/api/chat/swarm` | unified_api.js swarm path | ACTIVE | `/mission` |
| Orchestrate | CommandPanel | `/api/orchestrate` | unified_api.js | ACTIVE | `/mission` |
| Session list | SessionSidebar | `/api/sessions` | unified_api.js case 'sessions' | ACTIVE | `/mission` — SessionSidebar |
| Session load | SessionSidebar | `/api/sessions/[id]` | unified_api.js | ACTIVE | `/mission` — SessionSidebar |
| Session save | SessionSidebar | `/api/sessions/[id]` | unified_api.js | ACTIVE | `/mission` — SessionSidebar |
| Session delete | SessionSidebar | `/api/sessions/[id]` | unified_api.js | ACTIVE | `/mission` — SessionSidebar |
| Export chat | SessionSidebar | `/api/output` | unified_api.js case 'output' | ACTIVE | `/mission` — SessionSidebar |
| Chat model indicator | CommandPanel | `/api/llm-status` | provider health | ACTIVE | `/mission` — header |

## AWAKEN RUNTIME

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Big red AWAKEN button | `/awaken` | `/api/awaken/start` | awakens runtime | ACTIVE | `/awaken` |
| AWAKEN stop | `/awaken` | `/api/awaken/stop` | terminates runtime | ACTIVE | `/awaken` |
| AWAKEN status badge | `/awaken` | `/api/awaken/status` | state.json reads | ACTIVE | `/awaken` |
| Growth feed | `/awaken` | `/api/awaken/status` | growth section | ACTIVE | `/awaken` + `/evolution` |
| Companion cognitive feed | `/awaken` | `/api/awaken/status` | companion_cognitive | ACTIVE | `/awaken` |
| Stress feed | `/awaken` | `/api/awaken/status` | stress section | ACTIVE | `/awaken` |
| Self-improving feed | `/awaken` | `/api/awaken/status` | self_improving | ACTIVE | `/awaken` + `/evolution` |
| Mode selector (work/auto/safe) | `/awaken` | `/api/awaken/start` payload | mode passed to runtime | ACTIVE | `/awaken` |
| Governor status | `/awaken` | `/api/governor/status` | agent_work/governor/state.json | ACTIVE | `/awaken` + `/omni` |
| Gatekeeper panel | `/awaken` or GK tab | `/api/gatekeeper-status` | gatekeeper state | ACTIVE | `/awaken` + `/omni` |

## ENTHEA VISUAL LAYER

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| ENTHEA background | MissionControl | `public/enthea.html` | WebGL visualizer file | RESTORED — needs lazy-mount | `/mission` — background |
| AmbientTabVisualizer fallback | MissionControl | CSS/canvas fallback | AmbientTabVisualizer.tsx | ACTIVE | `/mission` — fallback |
| Dream Swarm full opacity | MissionControl DR tab | ENTHEA fullscreen | tab === 'dream' | ACTIVE | `/mission` — DR panel |

## AGENTS & WORKFORCE

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Agent manifest/roster | MissionControl AG tab, `/agents` | `/api/manifest` | bin/purpclaw.js | ACTIVE | `/mission` + `/agents` |
| Agent status (working/idle/error) | MissionControl AG tab | `/api/manifest` | agent.status field | ACTIVE | `/agents` |
| Agent scores | `/awaken` | `/api/agent-scores` | agent_work/scores/ | ACTIVE | `/agents` + `/awaken` |
| Tower stream | MissionControl TW tab | `/api/tower/stream` | agent_tower.js :7790 | ACTIVE | `/mission` + `/agents` — TW panel |
| Tower spawn/kill | TW panel | `/api/tower/*` | tower runtime | ACTIVE | `/agents` — TW panel |
| Delegation graph | MissionControl DG tab | `/api/delegation/status` | orchestrator :7784 | ACTIVE | `/mission` — DG panel |
| Division activity | DivisionActivityPanel | `/api/manifest` | divisions from agents | PARTIAL — panel archived | `/agents` — divisions |
| Work radar | AgentWorkDock | `/api/eventbus/stream` | agent events | PARTIAL — not real-time | `/agents` — work radar |
| Agent count | MissionControl vitals | `/api/manifest` | unique agents count | ACTIVE | `/mission` — vitals |

## HARNESS & MISSIONS

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| List harness missions | MissionControl HX tab | `/api/harness/missions` | agent_work/harness/ | ACTIVE | `/mission` — HX panel |
| Mission status/result | MissionControl HX tab | `/api/harness/missions/[id]` | mission state files | ACTIVE | `/mission` — HX panel |
| Mission abort | MissionControl HX tab | `/api/harness/missions/[id]/abort` | kill process | ACTIVE | `/mission` — HX panel |
| Mission SSE stream | MissionControl HX tab | `/api/harness/missions/[id]/stream` | SSE progress | ACTIVE | `/mission` — HX panel |
| Start new mission | `/mission/harness` | `/api/harness/start` | spawn mission | ACTIVE | `/mission` — HX panel |
| Harness benchmarks | MissionControl | `/api/harness-benchmarks` | benchmark results | ACTIVE | `/mission` — HX panel |

## PIPELINE & TRACES

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Pipeline runs | MissionControl WF tab, `/pipeline` | `/api/pipeline` | pipeline state | ACTIVE | `/mission` + `/pipeline` |
| Pipeline abort | `/pipeline` | `/api/pipeline` | abort signal | PARTIAL | `/pipeline` |
| Event timeline | MissionControl EL tab | `/api/event-timeline` | eventbus state | ACTIVE | `/mission` — EL panel |
| Trace recent | MissionControl | `/api/trace/recent` | trace store | ACTIVE | `/mission` — trace |
| Trace stream (SSE) | MissionControl | `/api/trace/stream` | SSE trace | ACTIVE | `/mission` |
| Log stream (SSE) | MissionControl LG tab | `/api/logs/stream` | SSE logs | ACTIVE | `/mission` — LG panel |
| Event stream (SSE) | MissionControl | `/api/eventbus/stream` | SSE events | ACTIVE | `/mission` |

## PROVIDERS & MODELS

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Provider list | `/providers` | `/api/providers` | lib/llm-provider.js | ACTIVE | `/providers` |
| Provider health | `/providers` | `/api/llm-status` | provider ping | ACTIVE | `/providers` |
| Model list | `/providers` | `/api/models` | provider model lists | ACTIVE | `/providers` |
| LLM ledger/spend | `/providers` | `/api/llm-ledger` | spend records | ACTIVE | `/providers` |
| Sentinel routing | `/providers` | `/api/providers` | routing config | PARTIAL | `/providers` |
| Fallback state | `/providers` | `/api/providers` | fallback chain | PARTIAL | `/providers` |

## MEMORY & COGNITIVE

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Memory recall/ingest | `/memory` | `/api/memory` POST | cognitive_spine.py :7880 | ACTIVE | `/memory` |
| Memory search | `/memory` | `/api/memory` GET | FAISS vector search | ACTIVE | `/memory` |
| Spine health | `/memory` | `/api/spine-health` | cognitive_spine.py health | ACTIVE | `/memory` |
| Session memory | MissionControl | `/api/mission-data` | session-scoped memory | ACTIVE | `/mission` |
| Cognitive mesh panel | MissionControl CG tab | `/api/memory` | recall + weave | ACTIVE | `/mission` — CG panel |

## MOCHI & COMPANIONS

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Mochi state | `/mochi`, MissionControl ✦ | `/api/mochi` | thringlets colony | ACTIVE | `/mission` + `/mochi` |
| Mochi actions (feed/play/clean/sleep/pet) | `/mochi` | `/api/mochi-action` | companion interaction | ACTIVE | `/mochi` |
| Mochi mood/bond/stats | `/mochi` | `/api/mochi` | mood/bond from state | ACTIVE | `/mochi` |
| Thringlets colony | `/mochi` | `/api/thringlets` | colony state | ACTIVE | `/mochi` |
| Thringlet interact | `/mochi` | `/api/thringlets/[id]/interact` | single thringlet | ACTIVE | `/mochi` |
| Colony mood aggregate | `/mochi` | `/api/thringlets/colony-mood` | mood summary | ACTIVE | `/mochi` |
| MochiWidget mini | MissionControl | `/api/mochi` | companion mini card | ACTIVE | `/mission` — MochiWidget |

## EVOLUTION & SELF-IMPROVEMENT

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Evolution status | `/evolution` | `/api/evolution/status` | lib/evolution/ | ACTIVE | `/evolution` |
| Self-evolution panel | MissionControl EV tab | `/api/evolution/status` | same feed | ACTIVE | `/mission` — EV panel |
| Skill amendments | `/evolution` | `/api/skill-amendments` | proposals | ACTIVE | `/evolution` |
| Auto-research | `/evolution` | `/api/research/group` | autonomous research | ACTIVE | `/evolution` |
| Growth loop status | `/evolution` | `/api/awaken/status` growth | from AWAKEN | ACTIVE | `/evolution` |
| Donor archaeology | `/evolution` | skill registry | docs/archive/ | UI_ONLY_DONOR | `/evolution` — reference |
| Mutation proposal | `/evolution` | `/api/skill-amendments` | proposal workflow | ACTIVE | `/evolution` |

## SYSTEM MAP

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| LiveSystemMap | `/system-map` | `/api/services` + `/api/manifest` | topology | ACTIVE | `/system-map` |
| Service health grid | MissionControl SP tab, `/system-map` | `/api/services` | service status | ACTIVE | `/mission` + `/system-map` |
| Host telemetry (CPU/RAM/disk) | MissionControl | `/api/host-telemetry` | system metrics | ACTIVE | `/mission` — vitals |
| Service ports | `/system-map` | `/api/services` | port mappings | ACTIVE | `/system-map` |
| System graph (nodes/edges) | MissionControl SM tab | `/api/services` + `/api/manifest` | topology | ACTIVE | `/mission` — SM panel |
| API mega list | `/system-map` | `/api/api-mega-list` | all routes | ACTIVE | `/system-map` |

## OMNI (Truth & Governance)

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Truth scan | `/omni` | OmniCode MCP tools | omni_truth_scan | ACTIVE | `/omni` |
| Feature registry | `/omni` | `/api/features` | feature gates | ACTIVE | `/omni` |
| Patch governance | `/omni` | `/api/governance/policy` | policy files | ACTIVE | `/omni` |
| OmniCode status | `/omni` | `/api/omnicode/status` | MCP server health | ACTIVE | `/omni` |
| Integrity status | `/omni` | OmniCode tools | provider_integrity | ACTIVE | `/omni` |
| Abliterator panel | MissionControl AB tab | no backend (local purge) | local state only | ACTIVE | `/mission` — AB panel |
| Gatekeeper panel | MissionControl GK tab | `/api/gatekeeper-status` | gatekeeper state | ACTIVE | `/mission` — GK panel |

## VOICE

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Voice command | `/voice` | `/api/voice-command` | STT → action | PARTIAL — TTS broken | `/voice` |
| Voice bridge status | `/voice` | `/api/bridge` | bridge state | ACTIVE | `/voice` |
| STT/TTS config | `/voice` | `/api/settings` | voice settings | PARTIAL | `/voice` |
| Ingress status | `/voice` | `/api/voice-command` | command ingress | PARTIAL | `/voice` |

## SETTINGS

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Settings panel | `/settings` | `/api/settings` | user config | ACTIVE | `/settings` |
| Preprompt editor | `/preprompt` | `/api/preprompt` | system prompt | ACTIVE | `/settings` |
| Personality dial | PersonalityDial | `/api/personality` | personality config | ACTIVE | `/settings` |
| Sovereign mode | `/settings` | env/config | local-only mode | UI_ONLY_DONOR | `/settings` |
| Provider API keys | `/settings` | env vars | key management | ACTIVE | `/settings` |
| Spend limits | `/settings` | spend config | ~/.purpclaw/pocket/spend-config.json | ACTIVE | `/settings` |

## SAMPLER & METRICS

| UI Feature | Found In | Backend Match | Evidence | Status | Destination |
|---|---|---|---|---|---|
| Sampler panel | MissionControl SP tab | `/api/sampler` | shell metrics | ACTIVE | `/mission` — SP panel |
| Live metrics dashboards | SP tab | `/api/sampler` | config/samplers.yml | ACTIVE | `/mission` — SP panel |

## MISSING UI (Backend exists)

| Backend Capability | Route | State | UI Destination |
|---|---|---|---|
| ZK Proof verification | `/api/proof` | ACTIVE | `/omni` — add proof panel |
| Auto-research trigger | `/api/research/group` | ACTIVE | `/evolution` — add trigger button |
| Skill amendment approve | `/api/skill-amendments` | ACTIVE | `/evolution` — add approve/reject |
| Playwright browser automation | `/api/playwright` | ACTIVE | No UI — developer tool only |
| Benchmark run | `/api/benchmark/odysseus` | ACTIVE | `/system-map` or `/providers` |
| Ollama local models | `/api/ollama` | ACTIVE | `/providers` — already shown |
| Governor policy editor | `/api/governance/policy` | ACTIVE | `/omni` — add policy panel |
| Upload file | `/api/upload` | ACTIVE | `/settings` or `/mission` |
| Trace inspect (deep) | `/api/trace/recent` | ACTIVE | `/pipeline` — add deep trace |

## UI FEATURES WITH NO BACKEND (FAKE_OR_STALE)

| UI Feature | Found In | Issue |
|---|---|---|
| "Agents active: 152" dashboard stat | MissionControl overview | 152 is registry count, not live agents |
| Service health "12/12 ACTIVE" | old overview cards | May not reflect actual service state |
| "Memory: 99.2% healthy" | old cognitive panels | No evidence path traced |
| Fancy gradient agent cards | old AgentTower | Decorative, no real data |

## SUMMARY

| Category | Active | Partial | Fake/Stale | Missing UI | Donor |
|---|---|---|---|---|---|
| Chat & Sessions | 13 | 1 | 0 | 0 | 0 |
| AWAKEN Runtime | 9 | 0 | 0 | 0 | 0 |
| ENTHEA | 2 | 0 | 0 | 0 | 1 |
| Agents | 8 | 1 | 1 | 0 | 0 |
| Harness | 6 | 0 | 0 | 0 | 0 |
| Pipeline | 7 | 0 | 0 | 1 | 0 |
| Providers | 5 | 2 | 0 | 0 | 0 |
| Memory | 5 | 0 | 0 | 0 | 0 |
| Mochi | 7 | 0 | 0 | 0 | 0 |
| Evolution | 6 | 0 | 0 | 2 | 1 |
| System Map | 6 | 0 | 1 | 1 | 0 |
| OMNI | 5 | 0 | 0 | 2 | 0 |
| Voice | 2 | 2 | 0 | 0 | 0 |
| Settings | 4 | 0 | 0 | 0 | 1 |
| Sampler | 2 | 0 | 0 | 0 | 0 |
| **TOTAL** | **87** | **6** | **2** | **6** | **3** |

**Key finding**: 87 backend capabilities have active UI. 6 are partial. 6 backend capabilities have no UI. 2 UI claims are fake/stale. 3 UI features are design donors only.
