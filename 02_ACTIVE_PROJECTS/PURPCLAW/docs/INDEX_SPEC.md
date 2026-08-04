# INDEX_SPEC.md — PURPCLAW Live Capability Map (auto-generated)

> Generated from lib/system-manifest.js — the single source of truth. Do NOT hand-edit; run the generator. Numbers here are REAL, read from the running registry.

## Scale
- Services: 22
- Agents: 45 across 9 divisions
- Tools: 182
- Provider lanes: 10

## Services
| key | port | pm2 |
|---|---|---|
| eventbus | 7782 | purpclaw-eventbus |
| state | 7783 | purpclaw-state |
| api | 7780 | purpclaw-api |
| tower | 7790 | purpclaw-tower |
| orchestrator | 7784 | purpclaw-orchestrator |
| gatekeeper | 7791 | purpclaw-gatekeeper |
| metrics | 7890 | purpclaw-metrics |
| pool | 7885 | purpclaw-pool |
| context-bus | 7881 | purpclaw-context |
| nextjs | 3030 | purpclaw-nextjs |
| coordinator | 7898 | purpclaw-coordinator |
| voice-coordinator | 7781 | purpclaw-voice |
| voice-bridge | 7792 | purpclaw-bridge |
| voice-ingress | - | purpclaw-voice-ingress |
| chorus | - | purpclaw-chorus |
| vision | 7889 | purpclaw-vision |
| yolo | 7779 | purpclaw-yolo |
| cognitive | 7880 | purpclaw-cognitive |
| avatar | 7777 | purpclaw-avatar |
| reasoning | 7892 | purpclaw-reasoning |
| harness | 7798 | purpclaw-harness |
| thringlet | 7799 | purpclaw-thringlet |

## Provider Lanes (model routing)
| lane | provider | model |
|---|---|---|
| PRIMARY_CHAT | nvidia | minimaxai/minimax-m3 |
| PRIMARY_TOOL | nvidia | minimaxai/minimax-m3 |
| PRIMARY_DELEGATION | nvidia | minimaxai/minimax-m3 |
| CODE | nvidia | deepseek-ai/deepseek-v4-flash |
| SWARM | nvidia | deepseek-ai/deepseek-v4-flash |
| DIVISION | nvidia | deepseek-ai/deepseek-v4-pro |
| REASONING | nvidia | deepseek-ai/deepseek-v4-pro |
| FALLBACK | nvidia | minimaxai/minimax-m3 |
| LOCAL | - | - |
| PRIVATE_MODE | - | - |

## Divisions
- MEDIA_OPERATIONS (4 agents)
- INTELLIGENCE (8 agents)
- ENGINEERING (8 agents)
- SECURITY (7 agents)
- INFRASTRUCTURE (2 agents)
- MANAGEMENT (4 agents)
- OPERATIONS (5 agents)
- CREATIVE (3 agents)
- SCIENCE (4 agents)

## Discovery
Agents find capabilities by INTENT (ARD), not by carrying all 182 tools:
- Tool: discover { intent } -> ranked tools/agents
- HTTP: GET /api/discover?intent=...

_generated 2026-06-19_
