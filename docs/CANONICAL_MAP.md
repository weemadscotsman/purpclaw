# PURPCLAW Canonical Map

Last verified: 2026-06-19

## What This File Is

This is the short map for the current local PURPCLAW repository. It answers:

- what is authoritative,
- what the major folders mean,
- what runs as a service,
- what is only a module/config/registry entry,
- and what to check before changing routes or build wiring.

## Authority Order

When two docs disagree, use this order:

| Rank | Source | Why |
|---:|---|---|
| 1 | Running code and live probes | Reality wins. |
| 2 | `service_registry.js` | Canonical service list used by CLI health paths. |
| 3 | `lib/runtime/ports.js` | Canonical port constants and service URL helpers. |
| 4 | `ecosystem.config.js` | PM2 process definitions and production start commands. |
| 5 | `app/api/**/route.ts` and `app/**/page.tsx` | Canonical Next.js route definitions. |
| 6 | `docs/CANONICAL_MAP.md`, `docs/ROUTING_AND_BUILD_SPEC.md`, `docs/SERVICE_RUNTIME_INDEX.md` | Curated human map. |
| 7 | Older README, STRESS, audit, and generated docs | Evidence and history. Useful, but may be stale. |

## Current System Shape

PURPCLAW is a hybrid:

```text
microservice core + modular capabilities
```

That means:

| Thing | Correct shape | Current home |
|---|---|---|
| Long-running runtime organs | PM2 services | root service entrypoints plus `ecosystem.config.js` |
| Browser cockpit and BFF routes | Next.js app | `app/` |
| Shared behavior | modules | `lib/` |
| CLI commands | command modules | `bin/purpclaw.js`, `lib/commands/`, `scripts/` |
| Agents | configs/personas | `agents/`, `divisions/`, `agent_profiles.json`, `agent_routing_matrix.js` |
| Skills | registry/tool adapters | `skills/`, tool registry modules |
| Provider routing | runtime modules/config | `lib/llm-provider.js`, `lib/providers/`, model config |
| Memory spine | service plus clients | `cognitive_spine.py`, `lib/memory-client.js`, `lib/cognitive-client.js` |
| Evidence/audit logs | reports | `STRESS/`, `agent_work/`, `reports/` |

## Main Runtime Entry Points

| Surface | Entrypoint | Purpose |
|---|---|---|
| CLI | `node bin/purpclaw.js <cmd>` | Operator commands, health checks, orchestration commands |
| Web cockpit | `http://127.0.0.1:3030/mission` | Mission Control UI |
| OMNI cockpit | `http://127.0.0.1:3030/omni` | OMNI truth and provider views |
| Next API layer | `app/api/**/route.ts` | Browser-facing API and route adapters |
| Unified API service | `unified_api.js` on port `7780` | Main internal API/runtime gateway |
| Agent tower | `agent_tower.js` on port `7790` | Agent registry, spawn, tower status |
| Orchestrator | `orchestrator.js` on port `7784` | Job/workflow dispatch |
| Cognitive spine | `cognitive_spine.py` on port `7880` | Memory and cognitive service |

## Source-Of-Truth Files

| Need | Open |
|---|---|
| What PM2 should run | `ecosystem.config.js` |
| What services the CLI expects | `service_registry.js` |
| What ports code should import | `lib/runtime/ports.js` |
| What the cockpit calls | `app/hooks/useMissionData.ts`, `app/components/CommandPanel.tsx` |
| What Next API routes exist | `docs/ROUTE_INDEX.md`, then `app/api/**/route.ts` |
| How to build/restart safely | `docs/ROUTING_AND_BUILD_SPEC.md` |
| Where a new thing belongs | `docs/WHERE_THINGS_GO.md` |
| Which service owns which port | `docs/SERVICE_RUNTIME_INDEX.md` |

## Hard Rules

1. Do not add new hard-coded localhost ports in feature code. Import from `lib/runtime/ports.js` or use `service_registry.js` data.
2. Do not send same-origin Next routes through `/api/service-proxy?port=7780`. Browser UI should call `/api/...` directly when the route lives in `app/api`.
3. Use `/api/service-proxy` only for real cross-service probes or adapters.
4. New mutating Next routes must use `checkOperator()` and a rate limit.
5. Next production changes require `npm run build` and `pm2 restart purpclaw-nextjs --update-env`.
6. Service changes require `node bin/purpclaw.js status`, `doctor`, and `bughunt`.
7. Do not delete or merge services because a doc feels noisy. Mark them `Keep`, `Check`, `Merge later`, or `CLI-only later` first.

## Basic Verification Path

Use this whenever routing or build behavior feels wrong:

```powershell
node bin\purpclaw.js status
node bin\purpclaw.js doctor
node bin\purpclaw.js bughunt
npm run build
pm2 restart purpclaw-nextjs --update-env
```

For browser-facing route checks:

```powershell
Invoke-WebRequest http://127.0.0.1:3030/api/mission-data -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3030/api/services -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3030/api/kernel/jobs?limit=2 -UseBasicParsing
```

