# COORDINATOR LIB WIRE CERT GATE — CONTRACT

**Cert ID:** `agent_work/cert_gates/coordinator_lib_wire/`
**Date opened:** 2026-08-17
**Slice:** T06 — wire the 5 `lib/` modules to `services/swarm/coordinator.js` via patched require paths
**Status:** open

---

## What this cert certifies

The 5 `lib/` modules + 2 swarm-local helpers (task_decomposer, agent_score) all load cleanly from `services/swarm/coordinator.js` via patched require paths. The coordinator boots end-to-end without "module is missing" errors:

```
[COORDINATOR] Task decomposer loaded
[COORDINATOR] Agent score registry loaded
[COORDINATOR] Context packet engine loaded
[COORDINATOR] LLM provider layer loaded
[COORDINATOR] Self-context loaded — agents will know the stack
[COORDINATOR] Memory client loaded
[COORDINATOR] Cognitive client loaded — rules/diagnostics wired to swarm path
```

**The pattern fixed:** the coordinator's requires were `./lib/X.js` which resolved relative to `services/swarm/`. The lib files live at `lib/X.js` at the project root. Patched to `../../lib/X.js`. No copying, no duplication.

**The lib modules (all loaded real, not stubs):**
- `lib/context-packet.js` (8.7KB) — `write`, `read`, `readAll`, `readHandoff`, `formatHandoff`, `synthesize`, `init`, `hasOutput`
- `lib/llm-provider.js` (41.6KB) — `chat`, `streamChat`, `swarm`, `complete`, `getProviderInfo`, `listProviders`, `PROVIDERS`, `chatOpenAI`
- `lib/self-context.js` (17.4KB) — `buildSelfContext`, `buildSelfContextAsync`
- `lib/memory-client.js` (9.8KB) — `recall`, `ingest`, `react`, `getContext`, `getLiftedFacts`, `isOnline`, `stats`, `formatForPrompt`
- `lib/cognitive-client.js` (11.7KB) — `diagnose`, `diagnoseAgent`, `reportEvent`, `formatFindings`, `assertFact`, `retractFact`, `queryFacts`, `checkConstraint`

**Sister slice: `agent_score.js` (9.3KB)** — needed by the coordinator at line 169, also copied from project root to `services/swarm/` (same pattern as task_decomposer).

**One more require patched in `task_decomposer.js`:** `./lib/ast-dependency-graph.js` → `../../lib/ast-dependency-graph.js` (same pattern).

## What this cert does NOT certify (honest scope)

- **The live coordinator lane is still not Tesco-testable.** All dependencies load, but:
  - The EventBus service on port 7782 is still not running
  - The LLM provider needs API keys for actual chat (loaded but offline-mode)
  - The cognitive services need their sidecar running
  - The Tower service (port 7790) needs to be up
  - The 1-mile mode still requires Eddie to start the EventBus + Tower
- **The cert proves the require path is correct.** It does NOT prove a full `/api/coordinate` round-trip works.
- **`task_decomposer.js` and `agent_routing_matrix.js` are duplicated** (root + services/swarm). The next slice reconciles which is canonical.

## Run

```
node --test tests/coordinator_lib_wire/test_wire.js
```

From project root. 10/10 tests must pass.

## Assertion criteria (10/10 required for PASS)

| # | Assertion | Why it matters |
|---|---|---|
| T01 | `lib/context-packet.js` resolves, has `write/read/readAll/synthesize` | The require path is real |
| T02 | `lib/llm-provider.js` resolves, has `chat/streamChat/complete` + `PROVIDERS` registry | The LLM layer is loadable |
| T03 | `lib/self-context.js` resolves, has `buildSelfContext[Async]` | The self-context layer is loadable |
| T04 | `lib/memory-client.js` resolves, has `recall/ingest/isOnline` | The memory layer is loadable |
| T05 | `lib/cognitive-client.js` resolves, has `assertFact/retractFact/queryFacts/diagnose` | The cognitive layer is loadable |
| T06 | All 5 modules export non-null objects with the expected per-module minimum keys | No empty stubs |
| T07 | `services/swarm/coordinator.js` loads without throwing AND emits all 6 "loaded" log lines AND no "unavailable" lines | The full coordinator boot smoke |
| T08 | `services/swarm/task_decomposer.js` still loads (regression check) | The decomposer + lib patches didn't break the decomposer |
| T09 | `services/swarm/agent_score.js` still loads (regression check) | The agent_score copy is intact |
| T10 | Coordinator exports the full mission surface: `coordinateMission/startMission/listMissions/getMission/abortMission/createCoordinatorServer` | The public API is intact |

## Cert verdict format

`agent_work/cert_gates/coordinator_lib_wire/result.json`:
```json
{
  "schema": "purpclaw.cert-gate.coordinator-lib-wire.v1",
  "cert_id": "agent_work/cert_gates/coordinator_lib_wire/",
  "verdict": "PASS",
  "tests_total": 10,
  "tests_pass": 10,
  "tests_fail": 0,
  "pattern_fixed": "5 lib/ require paths + 1 task_decomposer inner require path + 1 agent_score copy",
  "remaining_to_tesco_testable": [
    "EventBus service on port 7782 must be started",
    "LLM provider needs API keys for actual chat (loads offline)",
    "Tower service on port 7790 must be started"
  ]
}
```
