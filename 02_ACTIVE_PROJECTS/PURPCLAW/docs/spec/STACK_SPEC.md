# STACK_SPEC — canonical PURPCLAW runtime topology

> Source of truth for every service port, class, protocol, and dependency
> edge in the stack. Auto-imported from `lib/runtime/ports.js` and
> `ecosystem.config.js`. The BIOS reads this file to know what "expected"
> looks like before probing reality.

**Version:** 2026-06-19-v1
**Status:** seed (doctrinal). Drift audit runs on every BIOS run.

---

## 1. Service classes

| Class | Meaning | BIOS treatment |
|---|---|---|
| `core` | on the boot critical path. Must be alive for stack to serve `/api/chat`. | probe on every BIOS run |
| `optional-dark` | defined but failure-tolerant. Allowed to be down without flipping verdict. | probe on `core-safe`, optional on `bios-only` |
| `deprecated` | legacy endpoints kept around for back-compat. Probe surfaces truth; does not block verdict. | probe only when `full-chaos` profile runs |

## 2. Service catalogue

Ports come from `lib/runtime/ports.js`. PM2 names come from `ecosystem.config.js`. Where the two disagree, `ports.js` is canonical and `ecosystem.config.js` is flagged for drift.

| service_id | pm2 name | port | class | protocol | depends_on |
|---|---|---|---|---|---|
| web-ui-pm2 | `purpclaw-nextjs` | 3030 | core | http | unified-api |
| unified-api | `purpclaw-api` | 7780 | core | http | eventbus, state, agent-tower, gatekeeper |
| unified-api-tcp | (embedded in api) | 7778 | core | tcp | unified-api |
| eventbus | `purpclaw-eventbus` | 7782 | core | http | — |
| state | `purpclaw-state` | 7783 | core | http | — |
| agent-tower | `purpclaw-tower` | 7790 | core | http | eventbus, llm-provider keys |
| gatekeeper | `purpclaw-gatekeeper` | 7791 | core | http | — |
| metrics | `purpclaw-metrics` | 7890 | core | http | — |
| pool | `purpclaw-pool` | 7885 | core | http | — |
| harness | `purpclaw-harness` | 7798 | core | http | agent-tower |
| memory | `purpclaw-cognitive` | 7880 | core | http | — |
| voice-coordinator | `purpclaw-voice` | 7781 | optional-dark | http+websocket | unified-api-tcp |
| voice-bridge | `purpclaw-bridge` | 7792 | optional-dark | http+websocket | unified-api-tcp |
| voice-ingress | `purpclaw-voice-ingress` | 7896 | optional-dark | http | orchestrator |
| orchestrator | `purpclaw-orchestrator` | 7784 | core | http+sse | agent-tower |
| reasoning | `purpclaw-reasoning` | 7892 | core | http | pool, agent-tower |
| coordinator | `purpclaw-coordinator` | 7898 | core | http | agent-tower |
| workers | `purpclaw-workers` | 7897 | core | http | agent-tower |
| vision-monitor | `purpclaw-vision` | 7889 | optional-dark | http | — |
| chorus | `purpclaw-chorus` | 7797 | optional-dark | http | — |
| thringlet | `purpclaw-thringlet` | 7799 | deprecated | http | — |
| stt | `purpclaw-stt` | 7896 | optional-dark | http | voice-ingress |
| yolo | `purpclaw-yolo` | 7779 | optional-dark | http | — |
| avatar | `purpclaw-avatar` | 7777 | optional-dark | http | — |
| telegram | `purpclaw-telegram` | 7795 | optional-dark | http | unified-api |
| context-bus | `purpclaw-context` | (in-process) | core | http | — |

### Drift table

| Item | spec says | runtime says | source | fix |
|---|---|---|---|---|
| autodream endpoint | 7880 `/autodream/*` | consolidated inside `purpclaw-cognitive`; `7895` is GOOP | `cognitive_spine.py`, `service_registry.js` | keep AutoDream as a cognitive endpoint, not a PM2 service |
| voice-ingress / stt port | both declared 7896 | shared port requires co-host | ports.js portsVOICE_INGRESS+STT | confirmed shared; BIOS reports collisions |
| cognitive migration | `purpclaw-cognitive` (memory+modal+rules+neuro+autodream+diagnostics) | consolidated into one process | ecosystem.config.js:407 | spec lists under `memory`; add migration note |

## 3. State taxonomy (12 states)

| state | meaning |
|---|---|
| `BOOTING` | process exists, /health not yet 2xx |
| `ONLINE` | /health 2xx + /ready endpoint 2xx (or `/healthz` returns `status: ok`) |
| `DEGRADED` | /health 2xx but another required endpoint 5xx OR warning flags set |
| `OFFLINE_INTENTIONAL` | process not present in PM2 list AND port open AND gated by feature flag |
| `OFFLINE_UNEXPECTED` | port closed, no PM2 entry, no reason found in spec |
| `WRONG_PORT` | PM2 entry present but listening on a port not in spec |
| `WRONG_PROTOCOL` | port open but replies with non-matching protocol (e.g. http server on a ws port) |
| `AUTH_FAILED` | endpoint returns 401/403 |
| `ROUTE_FAILED` | service responds 2xx on `/health` but every `/api/<core>` returns 5xx |
| `STALE` | PM2 says running for >X days without restart; restart metric > 24h uptime |
| `SAFE_MODE` | service explicitly started in safe mode (env flag) |
| `HALT` | service crashed-loop > N times in window (PM2 unstable) |

## 4. Verdict rules

- All `core` services must resolve to `ONLINE` OR a SET of `DEGRADED` whose degraded children are also `OFFLINE_INTENTIONAL` or `optional-dark`. → verdict `READY`.
- If any `core` service is `OFFLINE_UNEXPECTED`, `WRONG_PORT`, `WRONG_PROTOCOL`, `HALT` → verdict `NOT_READY`. Show offending rows.
- If all `core` are ONLINE/DEGRADED, but > 50% `optional-dark` are down → verdict `DEGRADED_READY`. Cosmetic; the system still serves.
- If spec drift > 0 unresolved entries → verdict `READY_WITH_DRIFT`. Show drift table.

## 5. Probe protocol

- Probe window: `bios-only` = 600 ms, `core-safe` = 1500 ms, `voice` / `vision` / `swarm` / `full-chaos` = 3000 ms.
- HTTP probes use `AbortSignal.timeout`. TCP probes use raw `net.createConnection`.
- All probe results are sorted by service_id, then port, then state. Determinism > raw wall-clock order.

## 6. Failure modes of THIS doc

- Ports drift. The doc MUST be regenerated from `lib/runtime/ports.js` whenever that file changes.
- PM2 names drift. The doc MUST be regenerated from `ecosystem.config.js`.
- New services introduced without spec update → BIOS returns `SPEC_INCOMPLETE` and refuses to give verdict.
