# PURPCLAW Backend Flow and Safe Boot

This document is the operator map for keeping Purpclaw connected without starting every optional stack at once.

## Core Boot

Core services are the only services that should start by default:

- EventBus: `purpclaw-eventbus` on `7782`
- State Store: `purpclaw-state` on `7783`
- Unified API: `purpclaw-api` on `7780`
- Agent Tower: `purpclaw-tower` on `7790`
- Orchestrator: `purpclaw-orchestrator` on `7784`
- Gatekeeper: `purpclaw-gatekeeper` on `7791`
- Metrics Aggregator: `purpclaw-metrics` on `7890`
- Mission Control UI: `purpclaw-nextjs` on `3000`

Optional groups must be started deliberately:

- Voice: `purpclaw-voice`, `purpclaw-bridge`
- Companions: `purpclaw-chorus`
- Vision: `purpclaw-vision`, `purpclaw-yolo`
- Cognitive: `purpclaw-memory`, `purpclaw-bridge-ns`, `purpclaw-modal`, `purpclaw-diagnostics`, `purpclaw-rules`
- Avatar/other: `purpclaw-avatar`

The shared service map is in `service_registry.js`. Metrics and the API consume that file so service definitions do not drift.

## Safe Commands

Print PM2 process names for a group:

```powershell
npm run pm2:names:core
npm run pm2:names:voice
npm run pm2:names:cognitive
npm run pm2:names:optional
```

Start core only:

```powershell
$core = node scripts/pm2-names.js core
pm2 start ecosystem.config.js --only $core
```

Stop optional services:

```powershell
$optional = node scripts/pm2-names.js optional
pm2 stop $optional
```

Emergency stop for optional stacks and active Tower workers:

```powershell
npm run panic-stop
```

## Command Flow

1. Mission Control sends chat/API/orchestrator/tower commands.
2. Unified API validates/records command input.
3. Orchestrator classifies the command and creates a workflow.
4. Agent Tower receives explicit spawn requests only.
5. Agent Tower emits agent lifecycle events.
6. EventBus broadcasts workflow/agent/system events.
7. State Store records workflow and agent state.
8. Gatekeeper validates final artifacts/results.
9. Metrics reads the service registry, polls real health endpoints with backoff, and reports core vs optional status.
10. Mission Control renders state/events without faking green health.

## Safety Limits

Tower defaults:

- `PURPCLAW_MAX_ACTIVE_AGENTS=4`
- `PURPCLAW_MAX_ACTIVE_PER_DIVISION=2`
- `PURPCLAW_SPAWN_COOLDOWN_MS=2500`

Orchestrator defaults:

- `PURPCLAW_MAX_QUEUE_DEPTH=20`
- `PURPCLAW_MAX_ACTIVE_WORKFLOWS=3`
- `PURPCLAW_WORKFLOW_RETRIES=1`

These defaults are intentionally conservative. Increase them only after core flow is stable.

## Cleanup Rules

- Remove hardcoded service maps when a caller can use `service_registry.js`.
- Keep optional stacks disabled unless a feature explicitly needs them.
- Do not add another startup path that launches all services.
- Do not show optional offline services as healthy.
- Do not delete old UI components unless a reference search proves they are unused.
- Prefer bounded queues, cooldowns, and explicit groups over auto-spawning behavior.

## Smoke Test

1. Core PM2 services are online.
2. `GET http://localhost:7780/api/services/registry` returns service definitions.
3. `GET http://localhost:7890/health` reports `healthy` or `degraded`, not fake green.
4. `GET http://localhost:7790/tower/status` reports Tower limits and registered agents.
5. Submit `status` through Mission Control.
6. Confirm EventBus/State/Timeline update.
7. Run `npm run panic-stop` if optional services or agents start unexpectedly.
