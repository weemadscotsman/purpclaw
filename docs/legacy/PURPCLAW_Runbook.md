# PURPCLAW Runbook  ⚠️ DEPRECATED — see [docs/RECOVERY.md](./docs/RECOVERY.md)

> **This file is from 2026-04-25 and predates the Windows cmd-window
> cascade incident of 2026-05-25 and the `safe-start` / `heal` guardrails
> that followed. Use [docs/RECOVERY.md](./docs/RECOVERY.md) for current
> recovery procedures and `purpclaw heal` as the entry point.**
>
> The boot advice below uses `pm2 start ecosystem.config.js --only $core`
> directly — that pattern is what triggered the cascade. **Use
> `purpclaw safe-start --core` instead.** The content is preserved here
> for historical reference only.

---

Purpclaw should boot core command services first. Optional voice, companion, vision, and cognitive services are started deliberately after the core flow is stable.

Do not run `pm2 start ecosystem.config.js` without `--only`.

## Safe Core Boot

```powershell
cd C:\Users\Admin\Desktop\PURPCLAW
$core = node scripts/pm2-names.js core
pm2 start ecosystem.config.js --only $core
pm2 list
```

Mission Control:

```text
http://localhost:3000/mission
```

## Safe Restarts

Restart one changed service:

```powershell
pm2 restart purpclaw-api
```

Restart the core services only:

```powershell
$core = node scripts/pm2-names.js core
pm2 restart $core
```

Stop optional stacks and active Tower workers if anything starts running away:

```powershell
npm run panic-stop
```

## Optional Service Groups

Print group names before starting or stopping them:

```powershell
npm run pm2:names:voice
npm run pm2:names:companions
npm run pm2:names:vision
npm run pm2:names:cognitive
npm run pm2:names:optional
```

Start a single optional group:

```powershell
$voice = node scripts/pm2-names.js voice
pm2 start ecosystem.config.js --only $voice
```

Stop all optional services:

```powershell
$optional = node scripts/pm2-names.js optional
pm2 stop $optional
```

## Core Health Checks

| Service | PM2 name | Port | Health or status endpoint |
| --- | --- | ---: | --- |
| Mission Control UI | `purpclaw-nextjs` | 3000 | `GET /mission` |
| Unified API | `purpclaw-api` | 7780 | `GET /api/health` |
| EventBus | `purpclaw-eventbus` | 7782 | `GET /health` |
| State Store | `purpclaw-state` | 7783 | `GET /health` |
| Orchestrator | `purpclaw-orchestrator` | 7784 | `GET /api/health` |
| Agent Tower | `purpclaw-tower` | 7790 | `GET /tower/health`, `GET /tower/status` |
| Gatekeeper | `purpclaw-gatekeeper` | 7791 | `GET /health` |
| Metrics Aggregator | `purpclaw-metrics` | 7890 | `GET /health`, `GET /metrics` |

PowerShell check:

```powershell
Invoke-RestMethod http://127.0.0.1:7780/api/health
Invoke-RestMethod http://127.0.0.1:7790/tower/status
Invoke-RestMethod http://127.0.0.1:7890/health
```

## Command Flow

```text
Mission Control / Voice / API
  -> Unified API :7780
  -> Orchestrator :7784
  -> Agent Tower :7790
  -> EventBus :7782
  -> State Store :7783
  -> Gatekeeper :7791
  -> Metrics :7890
  -> Mission Control UI :3000
```

Mission Control can send commands through:

- Chat Stack: `POST http://localhost:7780/api/chat`
- API Command: `POST http://localhost:7780/api/command`
- Allocate Job: `POST http://localhost:7784/api/orchestrate`
- Single Agent: `POST http://localhost:7790/api/spawn`

## Safety Limits

Agent Tower defaults:

- `PURPCLAW_MAX_ACTIVE_AGENTS=4`
- `PURPCLAW_MAX_ACTIVE_PER_DIVISION=2`
- `PURPCLAW_SPAWN_COOLDOWN_MS=2500`

Orchestrator defaults:

- `PURPCLAW_MAX_QUEUE_DEPTH=20`
- `PURPCLAW_MAX_ACTIVE_WORKFLOWS=3`
- `PURPCLAW_WORKFLOW_RETRIES=1`

These limits exist so boot and command tests cannot accidentally create a spawn storm.

## Service Registry

`service_registry.js` is the source of truth for service ports, health endpoints, PM2 names, and whether a service is required core or optional.

Consumers:

- `metrics_aggregator.js`
- `unified_api.js`
- `scripts/pm2-names.js`
- `scripts/panic-stop.js`

When adding a service, update the registry first, then wire consumers to it. Avoid separate hardcoded service maps.

## EventBus Smoke Test

Subscribe:

```powershell
curl.exe -N http://127.0.0.1:7782/events/system.health
```

Publish:

```powershell
curl.exe -X POST http://127.0.0.1:7782/publish -H "Content-Type: application/json" -d "{\"topic\":\"system.health\",\"payload\":{\"service\":\"manual-smoke\",\"status\":\"ok\"}}"
```

## Cleanup Rules

- Keep core and optional startup paths separate.
- Do not add full-stack auto-start scripts.
- Do not show optional offline services as healthy.
- Keep old UI components only when they are referenced or useful for rollback.
- Remove duplicate service maps when `service_registry.js` can be used.
- Leave generated cache, PID, and artifact cleanup to a deliberate cleanup pass after active processes are confirmed stopped.

## Troubleshooting

If Mission Control shows refused connections for optional ports like `7786`, `7787`, `7880`, or `7881`, that is acceptable when those optional services are not running. They should display offline/config-needed, not healthy.

If core services fail:

```powershell
pm2 logs purpclaw-api --lines 50 --nostream
pm2 logs purpclaw-tower --lines 50 --nostream
pm2 logs purpclaw-orchestrator --lines 50 --nostream
```

If agents are unexpectedly active:

```powershell
npm run panic-stop
```
