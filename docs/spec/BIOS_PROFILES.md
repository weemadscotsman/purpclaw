# BIOS_PROFILES — scan profiles

> Source of truth for which probe runs under each profile, and the verdict
> thresholds. Auto-derived from `lib/bios.js` when that file is built;
> this doc is the spec, the lib is the implementor.

**Version:** 2026-06-19-v1
**Status:** seed (doctrinal).

---

## 1. Profile matrix

| profile | probe scope | probe window | total budget | use case |
|---|---|---|---|---|
| `bios-only` | core only (HTTP health) | 600 ms | 4 s | fast smoke test, dev loop |
| `core-safe` | core + state + ready | 1500 ms | 12 s | standard BIOS boot |
| `voice` | core + voice-*, stt | 3000 ms | 20 s | voice path validation |
| `vision` | core + vision, yolo, avatar | 3000 ms | 20 s | vision path validation |
| `swarm` | core + coordinator + reasoning + workers | 3000 ms | 30 s | swarm coordination check |
| `full-chaos` | everything: core + optional-dark + deprecated | 5000 ms | 90 s | post-deploy soak |

## 2. Probe step definition (per service)

```yaml
- id: agent-tower
  class: core
  probe: http
  endpoint: /
  port: 7790
  expect_status_in: [200, 404]    # tower has / but no /health by default
  expect_keys_when_200: []
  timeout_ms: 1500
  depends_on: [eventbus, llm-provider keys]
```

## 3. Verdict thresholds

| verdict | rule |
|---|---|
| `READY` | all `core` services are ONLINE OR DEGRADED with degraded children = OFFLINE_INTENTIONAL or optional-dark. drift.all = 0 |
| `READY_WITH_DRIFT` | all `core` services satisfy READY, BUT drift.all > 0. Show drift table inline. |
| `DEGRADED_READY` | all `core` services satisfy READY, BUT > 50% `optional-dark` are down. |
| `SPEC_INCOMPLETE` | a service in PM2 has no entry in STACK_SPEC. Refuse to give verdict until spec updated. |
| `NOT_READY` | any `core` is OFFLINE_UNEXPECTED, WRONG_PORT, WRONG_PROTOCOL, HALT, AUTH_FAILED, or ROUTE_FAILED. |
| `INVALID_PROFILE` | profile name is unknown. |

## 4. Profile → endpoint mapping

| profile | endpoint |
|---|---|
| `bios-only` | `POST /api/boot/profile/bios-only` |
| `core-safe` | `POST /api/boot/profile/core-safe` |
| `voice` | `POST /api/boot/profile/voice` |
| `vision` | `POST /api/boot/profile/vision` |
| `swarm` | `POST /api/boot/profile/swarm` |
| `full-chaos` | `POST /api/boot/profile/full-chaos` |

## 5. Profile output JSON

```json
{
  "profile": "core-safe",
  "started_at": "2026-06-19T19:45:00.000Z",
  "ended_at":   "2026-06-19T19:45:14.000Z",
  "verdict": "READY_WITH_DRIFT",
  "lag_ms": 14050,
  "rows": [
    {"service_id":"web-ui-pm2","port":3030,"expected_state":"ONLINE","actual_state":"ONLINE","latency_ms":120},
    {"service_id":"agent-tower","port":7790,"expected_state":"ONLINE","actual_state":"OFFLINE_UNEXPECTED","latency_ms":1500}
  ],
  "drift": [
    {"field":"STACK_SPEC.port","spec":7895,"runtime":7897,"source":"ecosystem.config.js","fix":"update STACK_SPEC"}
  ]
}
```

## 6. Profile rule: `core-safe` (the default)

1. Boot eventbus + state (depth=2 fanout parallel).
2. Boot agent-tower + gatekeeper + memory (depth=3 fanout parallel).
3. Boot unified-api + orchestrator (depth=3).
4. Boot coordinator + workers + reasoning + metrics (depth=4).
5. Boot web-ui-pm2 last (depth=1).
6. Drift audit runs in the same loop.
7. Total budget = `O(log_2 n)` services × timeout, ceiling 12 s.

## 7. Failure modes of THIS doc

- A service in spec but not in profile → BIOS skips it; logs `NOT_PROBED`.
- A service in profile but not in spec → BIOS returns `SPEC_INCOMPLETE`.
- Verdict thresholds drift → regenerate this doc whenever `lib/bios.js` constants change.
