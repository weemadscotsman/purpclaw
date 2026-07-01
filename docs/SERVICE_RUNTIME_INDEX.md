# Service Runtime Index

Last verified: 2026-06-29 (v0.3.0)

This file documents the service boundary. It combines the intent from
`service_registry.js`, `lib/runtime/ports.js`, and `ecosystem.config.js`.

## Canonical Service Sources

| Source | Role |
|---|---|
| `service_registry.js` | CLI health expectations, launch profiles, required/optional grouping |
| `lib/runtime/ports.js` | Canonical port constants for code |
| `ecosystem.config.js` | PM2 process start commands |
| `node bin/purpclaw.js bughunt` | Runtime probe and pass/fail truth |

## Core Services

| Key | PM2 name | Script | Port | Health path | Keep reason |
|---|---|---|---:|---|---|
| `eventbus` | `purpclaw-eventbus` | `unified_eventbus.js` | 7782 | `/health` | service messaging |
| `state` | `purpclaw-state` | `unified_state.js` | 7783 | `/health` | state store |
| `api` | `purpclaw-api` | `unified_api.js` | 7780 | `/api/health` | unified runtime gateway |
| `tower` | `purpclaw-tower` | `agent_tower.js` | 7790 | `/tower/status` | agent registry and spawn loop |
| `orchestrator` | `purpclaw-orchestrator` | `orchestrator.js` | 7784 | `/api/health` | workflow/job orchestration |
| `gatekeeper` | `purpclaw-gatekeeper` | `gatekeeper.js --server` | 7791 | `/health` | safety and operator gates |
| `metrics` | `purpclaw-metrics` | `metrics_aggregator.js --port 7890` | 7890 | `/health` | telemetry |
| `pool` | `purpclaw-pool` | `pool_service.js` | 7885 | `/health` | worker/knowledge pool |
| `workers` | `purpclaw-workers` | `worker_service.js` | 7897 | `/health` | overflow worker lane for remote/local agent task dispatch |
| `context-bus` | `purpclaw-context` | `lib/context-bus.js` | 7881 | `/health` | context packet service |
| `goop` | `purpclaw-goop` | `lib/goop-playground/goop-playground.js` | 7895 | `/health` | default-deny API broker behind GOOP / Bridge |
| `nextjs` | `purpclaw-nextjs` | `next start -p 3030` | 3030 | `/` | cockpit and browser-facing API |
| `cognitive` | `purpclaw-cognitive` | `cognitive_spine.py --port 7880` | 7880 | `/cognitive/health` | memory spine |

## Optional Or Parked Services

| Key | PM2 name | Script | Port | Status rule |
|---|---|---|---:|---|
| `coordinator` | `purpclaw-coordinator` | `swarm_coordinator.js` | 7898 | Keep if swarm/multi-agent coordination is active |
| `harness` | `purpclaw-harness` | `harness_service.js` | 7798 | Optional unless always-on eval/harness service is required |
| `voice-coordinator` | `purpclaw-voice` | `voice_coordinator.js` | 7781 / health 8781 | Optional voice lane |
| `voice-bridge` | `purpclaw-bridge` | `voice_bridge_7792.js` | 7792 | Optional voice bridge |
| `voice-ingress` | `purpclaw-voice-ingress` | `voice_ingress.js` | none declared in registry | Optional transcript ingestion |
| `stt` | `purpclaw-stt` | `voice_stt.py --port 7896` | 7896 | Optional speech-to-text |
| `chorus` | `purpclaw-chorus` | `companion-chorus/bridge.js` | 7797 | Optional companion lane |
| `vision` | `purpclaw-vision` | `vision_monitor.js` | 7889 | Optional vision lane |
| `yolo` | `purpclaw-yolo` | `yolo_service.py --port 7779` | 7779 | Optional vision/model lane |
| `avatar` | `purpclaw-avatar` | `simple_bridge.py --port 7777` | 7777 | Optional avatar bridge |
| `thringlet` | `purpclaw-thringlet` | `thringlet_bridge.js` | 7799 | Optional/legacy bridge |
| `reasoning` | `purpclaw-reasoning` | `lib/reasoning-loop.js` | 7892 | Optional proactive reasoning loop |
| `telegram` | `purpclaw-telegram` | `lib/gateways/telegram.js` | 7795 | Optional gateway |
| `drift-watcher` | `purpclaw-drift-watcher` | `lib/drift-watcher.js --watch --fix --interval=60` | none | Optional registry/docs drift watcher |

## Service Classification Rule

Use this before promoting a module into PM2:

| Question | If yes |
|---|---|
| Does it need to run forever? | service |
| Does it need its own crash/restart boundary? | service |
| Does it expose a port or queue consumed by other processes? | service |
| Does it isolate Python, model, voice, browser, or hardware work? | service |
| Is it just a helper, adapter, persona, route, prompt, or skill? | module/config/registry entry |

## Current Known Drift

| Area | Truth |
|---|---|
| `docs/spec/STACK_SPEC.md` | Useful, but `service_registry.js` is the current CLI-facing source. |
| Harness | Defined in registry/ecosystem; may be parked when not running. |
| Voice health | Voice coordinator service port and health port differ in registry. |
| Optional lanes | Missing PM2 entries are warnings, not failures, unless intentionally started. |

## Live Work Ownership

| Runtime fact | Canonical source | UI consumer |
|---|---|---|
| Agent roster and currently working agents | `GET :7790/tower/status` | Mission Control `Tower` and `Agent Workforce` sections |
| Workflow queue, active workflows, completed workflows | `GET :7784/api/pipeline` | Mission Control `Workflow Flow` and overview cards |
| Swarm counts and active-agent memory | `GET :7784/api/swarm/status`, `GET :7784/api/swarm/memory` | Mission Control `Swarm` section |
| Kernel job intake | `GET /api/kernel/jobs?limit=20` | Mission Control `Workflow Flow` intake |
| Cockpit aggregate data | `GET /api/mission-data` | Mission shell and overview components |

Active-agent rows must represent live work only. `agent_tower.js` removes an
agent from `AGENT_TOWER.activeAgents` on completion, failure, or kill.
`orchestrator.js` records terminal agent events in completed history and does
not put them back into `SWARM_MEMORY.context.activeAgents`.

Blocking orchestration calls use `POST :7784/api/orchestrate` with
`{ "wait": true }`. The route now follows the terminal workflow state in
`completedWorkflows`; it does not return the first failed retry attempt as if
the job were finished. Retry attempts are counted as attempts, not new workflow
tasks.

## Required Update Rule

When changing service wiring, update all four:

1. `service_registry.js`
2. `lib/runtime/ports.js`
3. `ecosystem.config.js`
4. `docs/SERVICE_RUNTIME_INDEX.md`
