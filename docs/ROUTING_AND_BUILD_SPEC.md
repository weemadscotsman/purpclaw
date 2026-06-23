# Routing And Build Spec

Last verified: 2026-06-19

This is the operator spec for routes, proxies, builds, restarts, and health
checks.

## Runtime Layers

```text
Browser
  -> Next page in app/
  -> Next API route in app/api/
  -> local module OR internal service OR provider router
  -> result back to browser
```

Long-running services talk to each other through HTTP, event bus, queues, or
shared clients. Browser UI should not know internal service routes unless a Next
adapter intentionally exposes them.

## Main URLs

| URL | Owner | Purpose |
|---|---|---|
| `http://127.0.0.1:3030/mission` | Next.js | Mission Control cockpit |
| `http://127.0.0.1:3030/omni` | Next.js | OMNI cockpit |
| `http://127.0.0.1:3030/api/*` | Next.js | Browser-facing API layer |
| `http://127.0.0.1:7780` | `unified_api.js` | Internal unified API service |
| `http://127.0.0.1:7790/tower/status` | `agent_tower.js` | Agent tower canonical status |
| `http://127.0.0.1:7784` | `orchestrator.js` | Workflow/job orchestration |
| `http://127.0.0.1:7898` | `swarm_coordinator.js` | Multi-agent mission coordinator |
| `http://127.0.0.1:7880` | `cognitive_spine.py` | Cognitive memory spine |

## Live Work Reporting Contract

These are the canonical truth routes for "who is alive, who is working, and
what finished":

| Need | Route | Owner | Notes |
|---|---|---|---|
| Tower roster and live agent rows | `GET :7790/tower/status` | `agent_tower.js` | `activeAgents` must contain only currently working agents. Completed/killed agents are removed. |
| Workflow queue, active workflows, recent completed workflows | `GET :7784/api/pipeline` | `orchestrator.js` | Main Mission Control ribbon source. |
| Swarm summary counts | `GET :7784/api/swarm/status` | `orchestrator.js` | Uses orchestrator memory, not PM2 guesses. |
| Swarm active/completed event memory | `GET :7784/api/swarm/memory` | `orchestrator.js` | Alias for `GET :7784/api/memory`; active rows ignore replayed stale events. |
| Browser-facing kernel jobs | `GET /api/kernel/jobs?limit=20` | Next.js | Same-origin route. Do not proxy this through `:7780`. |
| Browser aggregate cockpit feed | `GET /api/mission-data` | Next.js | Aggregates tower, pipeline, kernel jobs, LLM, research, OMNI, and scores. |

Completion event flow:

```text
orchestrator workflow
  -> swarm coordinator :7898 /api/coordinate
  -> tower :7790 /api/spawn/await
  -> agent_tower publishes agent.spawned / agent.completed or agent.failed
  -> orchestrator updates /api/pipeline and /api/swarm/* views
  -> Mission Control reads /api/mission-data plus live service routes
```

Hard rule: terminal agent events (`agent.completed`, `agent.failed`,
`agent.killed`) must remove the agent from active ribbons. They may be recorded
in completed history, but they must not re-enter `activeAgents`.

## Proxy Policy

The route `app/api/service-proxy/route.ts` is a service boundary adapter. Use it
for service health probes or deliberate cross-service reads.

Do use it for:

- soft health probes against service ports,
- status reads from services that are not Next routes,
- optional/dark services where UI should not spam hard console errors.

Do not use it for:

- `/api/kernel/jobs`,
- `/api/governance/policy`,
- `/api/evolution/status`,
- `/api/omnicode/status`,
- `/api/benchmark/odysseus`,
- any other route that already exists under `app/api`.

Correct:

```ts
fetch('/api/kernel/jobs?limit=20')
```

Wrong:

```ts
fetch('/api/service-proxy?port=7780&path=%2Fapi%2Fkernel%2Fjobs')
```

## Soft Service Probes

For optional services, use `soft=1`:

```text
/api/service-proxy?port=3030&path=%2F&soft=1
```

The response shape is:

```json
{
  "status": "online",
  "upstreamStatus": 200,
  "target": { "port": 3030, "path": "/" },
  "data": {}
}
```

UI health code must read `status`, not only `res.ok`, because soft failures may
return HTTP 200 to avoid browser-console noise.

## Build Modes

| Mode | Command | Use |
|---|---|---|
| Next dev | `npm run dev` | Local UI development on port `3030` |
| Next production build | `npm run build` | Compile the cockpit and API routes |
| Next production PM2 | `pm2 restart purpclaw-nextjs --update-env` | Serve built app on port `3030` |
| Full PM2 ecosystem | `pm2 start ecosystem.config.js` | Only when intentionally starting everything |
| Safe service start | `node bin/purpclaw.js safe-start --core` | Preferred Windows-safe boot path |

## Build Runbook

After changing anything in `app/`:

```powershell
npm run build
pm2 restart purpclaw-nextjs --update-env
```

If `next build` fails during optimization with an unstacked cache error, clear
only the build cache inside the workspace and rerun:

```powershell
$target = Resolve-Path '.next\cache'
$root = Resolve-Path '.'
if (-not ($target.Path.StartsWith($root.Path, [System.StringComparison]::OrdinalIgnoreCase))) { throw "bad path" }
Remove-Item -LiteralPath $target.Path -Recurse -Force
npm run build
```

Do not delete `.next/` recursively unless you have verified the resolved path is
inside the repository.

## Health Runbook

After changing services, ports, routes, or build wiring:

```powershell
node bin\purpclaw.js status
node bin\purpclaw.js doctor
node bin\purpclaw.js bughunt
pm2 list
```

Expected current bughunt baseline after the health redirect fix:

```text
38 ok / 11 warn / 0 fail
```

Warnings for defined-but-dark optional services are allowed when those lanes are
not intentionally started.

## New Next API Route Checklist

1. Put it in `app/api/<name>/route.ts`.
2. Add `export const runtime = 'nodejs'` if it uses Node modules.
3. Add `export const dynamic = 'force-dynamic'` if it reads live runtime state.
4. Use local modules for same-process reads.
5. Use service clients or `service-proxy` only for true service boundaries.
6. Gate mutating methods with `checkOperator()` and `checkRateLimit()`.
7. Add it to `docs/ROUTE_INDEX.md`.
8. Run `npm run build`.
9. Smoke-test with `Invoke-WebRequest`.

## New Service Checklist

1. Add root/service entrypoint or service module.
2. Add PM2 entry in `ecosystem.config.js`.
3. Add service metadata in `service_registry.js`.
4. Add or update port constant in `lib/runtime/ports.js`.
5. Add health endpoint.
6. Add it to `docs/SERVICE_RUNTIME_INDEX.md`.
7. Run `node bin\purpclaw.js bughunt`.
