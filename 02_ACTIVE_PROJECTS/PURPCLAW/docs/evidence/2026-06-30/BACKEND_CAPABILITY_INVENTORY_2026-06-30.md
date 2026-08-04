# BACKEND CAPABILITY INVENTORY — 2026-06-30

## Chat & Sessions

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Send chat message | `/api/chat` | GET | unified_api.js:318 `case 'chat'` | ACTIVE |
| Chat completions | `/api/chat` alt | GET | llm-provider.js:247 `chat()` | ACTIVE |
| Swarm chat | `/api/chat/swarm` | GET | unified_api.js:322 `case 'chat/swarm'` | ACTIVE |
| Orchestrate | `/api/orchestrate` | POST | unified_api.js:319 `case 'orchestrate'` | ACTIVE |
| List sessions | `/api/sessions` | GET | unified_api.js:323 `case 'sessions'` | ACTIVE |
| Load session | `/api/sessions/[id]` | GET | unified_api.js:323 `case 'sessions'` | ACTIVE |
| Save session | `/api/sessions/[id]` | GET | unified_api.js:323 `case 'sessions'` | ACTIVE |
| Delete session | `/api/sessions/[id]` | GET | unified_api.js:323 `case 'sessions'` | ACTIVE |
| Export chat | `/api/output` | GET | unified_api.js:320 `case 'output'` | ACTIVE |

## AWAKEN Runtime

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| AWAKEN status/feeds | `/api/awaken/status` | GET | unified_api.js:301 `case 'awaken'` | ACTIVE |
| AWAKEN start | `/api/awaken/start` | POST | unified_api.js:302 `case 'awaken/start'` | ACTIVE |
| AWAKEN stop | `/api/awaken/stop` | POST | unified_api.js:303 `case 'awaken/stop'` | ACTIVE |
| Governor status | `/api/governor/status` | GET | unified_api.js:307 `case 'governor'` | ACTIVE |
| Governor policy | `/api/governance/policy` | GET | unified_api.js:308 `case 'governance'` | ACTIVE |
| Gatekeeper status | `/api/gatekeeper-status` | GET | unified_api.js:309 `case 'gatekeeper'` | ACTIVE |

## Agents & Workforce

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Agent manifest | `/api/manifest` | GET | unified_api.js:304 `case 'manifest'` | ACTIVE |
| Agent scores | `/api/agent-scores` | GET | unified_api.js:305 `case 'agent-scores'` | ACTIVE |
| Tower stream | `/api/tower/stream` | GET | unified_api.js:326 `case 'tower/stream'` | ACTIVE |
| Tower status | `/api/service-proxy:7790` | GET | agent_tower.js health endpoint | ACTIVE |
| Delegation status | `/api/delegation/status` | GET | unified_api.js:306 `case 'delegation'` | ACTIVE |
| Swarm agents | `/api/service-proxy:7784` | GET | orchestrator.js :7784 health | ACTIVE |

## Harness & Missions

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| List missions | `/api/harness/missions` | GET | unified_api.js:310 `case 'harness/missions'` | ACTIVE |
| Mission status | `/api/harness/missions/[id]` | GET | unified_api.js:310 `case 'harness/missions'` | ACTIVE |
| Mission abort | `/api/harness/missions/[id]/abort` | POST | unified_api.js:311 `case 'harness/missions/*/abort'` | ACTIVE |
| Mission stream | `/api/harness/missions/[id]/stream` | GET | unified_api.js:312 `case 'harness/missions/*/stream'` | ACTIVE |
| Harness start | `/api/harness/start` | POST | unified_api.js:313 `case 'harness/start'` | ACTIVE |
| Harness status | `/api/harness/status` | GET | unified_api.js:314 `case 'harness/status'` | ACTIVE |
| Harness benchmarks | `/api/harness-benchmarks` | GET | unified_api.js:315 `case 'harness-benchmarks'` | ACTIVE |

## Kernel & Jobs

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Kernel jobs | `/api/kernel/jobs` | GET | unified_api.js:316 `case 'kernel/jobs'` | ACTIVE |
| Job detail | `/api/kernel/jobs/[id]` | GET | unified_api.js:316 `case 'kernel/jobs'` | ACTIVE |
| LLM plan | `/api/llm/plan` | POST | unified_api.js:317 `case 'llm/plan'` | ACTIVE |
| Stack whoami | `/api/stack-whoami` | GET | unified_api.js:296 `case 'stack-whoami'` | ACTIVE |
| Pulse | `/api/pulse` | GET | unified_api.js:297 `case 'pulse'` | ACTIVE |

## Pipeline & Traces

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Pipeline status | `/api/pipeline` | GET | unified_api.js:327 `case 'pipeline'` | ACTIVE |
| Event timeline | `/api/event-timeline` | GET | unified_api.js:328 `case 'event-timeline'` | ACTIVE |
| Trace recent | `/api/trace/recent` | GET | unified_api.js:329 `case 'trace/recent'` | ACTIVE |
| Trace stream | `/api/trace/stream` | GET | unified_api.js:330 `case 'trace/stream'` | ACTIVE |
| Event stream | `/api/eventbus/stream` | GET | unified_api.js:331 `case 'eventbus/stream'` | ACTIVE |
| Log stream | `/api/logs/stream` | GET | unified_api.js:332 `case 'logs/stream'` | ACTIVE |

## Providers & Models

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Providers list | `/api/providers` | GET | unified_api.js:333 `case 'providers'` | ACTIVE |
| LLM config | `/api/llm-config` | GET | unified_api.js:334 `case 'llm-config'` | ACTIVE |
| LLM status | `/api/llm-status` | GET | unified_api.js:335 `case 'llm-status'` | ACTIVE |
| Models list | `/api/models` | GET | unified_api.js:336 `case 'models'` | ACTIVE |
| LLM ledger | `/api/llm-ledger` | GET | unified_api.js:337 `case 'llm-ledger'` | ACTIVE |
| Ollama gateway | `/api/ollama` | GET | unified_api.js:338 `case 'ollama'` | ACTIVE |
| OmniCode status | `/api/omnicode/status` | GET | unified_api.js:339 `case 'omnicode'` | ACTIVE |

## Memory & Cognitive

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Memory recall | `/api/memory` POST | POST | unified_api.js:340 `case 'memory'` | ACTIVE |
| Memory search | `/api/memory` GET | GET | unified_api.js:340 `case 'memory'` | ACTIVE |
| Spine health | `/api/spine-health` | GET | cognitive_spine.py:health `:7880` | ACTIVE |
| Session memory | `/api/mission-data` | GET | unified_api.js:341 `case 'mission-data'` | ACTIVE |

## Mochi & Companions

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Mochi state | `/api/mochi` | GET | unified_api.js:342 `case 'mochi'` | ACTIVE |
| Mochi action | `/api/mochi-action` | POST | unified_api.js:343 `case 'mochi-action'` | ACTIVE |
| Thringlets colony | `/api/thringlets` | GET | unified_api.js:344 `case 'thringlets'` | ACTIVE |
| Thringlet interact | `/api/thringlets/[id]/interact` | POST | unified_api.js:344 | ACTIVE |
| Colony mood | `/api/thringlets/colony-mood` | GET | unified_api.js:344 | ACTIVE |

## Evolution & Self-Improvement

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Evolution status | `/api/evolution/status` | GET | unified_api.js:345 `case 'evolution'` | ACTIVE |
| Skill amendments | `/api/skill-amendments` | GET | unified_api.js:346 `case 'skill-amendments'` | ACTIVE |
| Auto-research | `/api/research/group` | POST | unified_api.js:347 `case 'research'` | ACTIVE |
| Features registry | `/api/features` | GET | unified_api.js:348 `case 'features'` | ACTIVE |
| Capabilities | `/api/capabilities` | GET | unified_api.js:349 `case 'capabilities'` | ACTIVE |

## System & Infrastructure

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Health check | `/api/health` | GET | unified_api.js:294 `case 'health'` | ACTIVE |
| Host telemetry | `/api/host-telemetry` | GET | unified_api.js:295 `case 'host-telemetry'` | ACTIVE |
| Services list | `/api/services` | GET | unified_api.js:298 `case 'services'` | ACTIVE |
| Service proxy | `/api/service-proxy` | GET | unified_api.js:299 `case 'service-proxy'` | ACTIVE |
| Registry | `/api/registry` | GET | unified_api.js:300 `case 'registry'` | ACTIVE |
| Discovery | `/api/discover` | GET | unified_api.js:325 `case 'discover'` | ACTIVE |
| Setup | `/api/setup` | GET | unified_api.js:350 `case 'setup'` | ACTIVE |
| Preprompt | `/api/preprompt` | GET | unified_api.js:351 `case 'preprompt'` | ACTIVE |
| Personality | `/api/personality` | GET | unified_api.js:352 `case 'personality'` | ACTIVE |
| Settings | `/api/settings` | GET | unified_api.js:353 `case 'settings'` | ACTIVE |
| Whoami | `/api/whoami` | GET | unified_api.js:354 `case 'whoami'` | ACTIVE |
| Heartbeat | `/api/heartbeat` | GET | unified_api.js:355 `case 'heartbeat'` | ACTIVE |

## Voice & Bridge

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Voice command | `/api/voice-command` | POST | unified_api.js:356 `case 'voice-command'` | PARTIAL |
| Bridge | `/api/bridge` | GET | unified_api.js:357 `case 'bridge'` | ACTIVE |
| Computer use | `/api/computer-use` | GET | unified_api.js:358 `case 'computer-use'` | ACTIVE |
| Playwright | `/api/playwright` | POST | unified_api.js:359 `case 'playwright'` | ACTIVE |

## Evidence & Proof

| Capability | Route | Method | Evidence | State |
|---|---|---|---|---|
| Proof verify | `/api/proof` | GET | unified_api.js:360 `case 'proof'` | ACTIVE |
| Benchmark | `/api/benchmark/odysseus` | GET | unified_api.js:361 `case 'benchmark'` | ACTIVE |
| API mega list | `/api/api-mega-list` | GET | unified_api.js:362 `case 'api-mega-list'` | ACTIVE |
| Upload | `/api/upload` | POST | unified_api.js:363 `case 'upload'` | ACTIVE |
| Yo (ping) | `/api/yo` | GET | unified_api.js:364 `case 'yo'` | ACTIVE |
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
