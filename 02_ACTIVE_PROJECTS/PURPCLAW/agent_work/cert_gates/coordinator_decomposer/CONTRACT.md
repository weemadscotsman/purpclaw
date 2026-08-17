# COORDINATOR DECOMPOSER CERT GATE — CONTRACT

**Cert ID:** `agent_work/cert_gates/coordinator_decomposer/`
**Date opened:** 2026-08-17
**Slice:** The missing-organ bug fix — `task_decomposer.js` wired to `services/swarm/coordinator.js`
**Status:** open

---

## What this cert certifies

The live `services/swarm/coordinator.js` was failing end-to-end with `task_decomposer.js module is missing` (logged earlier today, 01:02–01:32 the live coordinator failed every mission for this reason). The root cause was a require-path bug, not a missing module:

- `coordinator.js:161` does `require('./task_decomposer.js')`
- The require resolves relative to the coordinator's location at `services/swarm/`
- The file existed at the project root, not at `services/swarm/`
- So the require always failed

**The fix:** copied `task_decomposer.js` (21,094 bytes, the cognitive planning layer) and `agent_routing_matrix.js` (15,400 bytes, the routing dependency) from the project root to `services/swarm/`. The coordinator now loads the decomposer cleanly:

```
[COORDINATOR] Task decomposer loaded
```

The same pattern was found for 5 other "missing" modules reported by the coordinator (`context-packet.js`, `llm-provider.js`, `self-context.js`, `memory-client.js`, `cognitive-client.js`) — those exist in `lib/` but the coordinator's require paths are wrong. They are flagged for the next slice.

## What this cert does NOT certify (honest scope)

- **The live coordinator lane is not yet Tesco-testable.** The decomposer + routing matrix load, but the 5 lib/ modules still need to be wired the same way. Also, the EventBus on port 7782 is still not running (out of scope for this cert).
- **The copied files are non-destructive.** The original `task_decomposer.js` and `agent_routing_matrix.js` remain at the project root. The next slice can decide: keep both (canonical at one place, copy at the other) or remove the duplicates.
- **Decomposition behavior is tested at the function level**, not the mission level. The cert proves the file loads, exports the right shape, and the functions are callable. It does NOT prove a full /api/coordinate round-trip works.

## Run

```
node --test tests/coordinator_decomposer/test_wire.js
```

From project root. 8/8 tests must pass.

## Assertion criteria (8/8 required for PASS)

| # | Assertion | Why it matters |
|---|---|---|
| T01 | `services/swarm/task_decomposer.js` exists, >1KB | File landed at the right home |
| T02 | `services/swarm/agent_routing_matrix.js` exists, >1KB | Routing matrix landed too |
| T03 | `task_decomposer` is requireable from the coordinator's location, exports the documented functions | The require pattern the coordinator uses now works |
| T04 | `decomposeTask`, `isComplexTask`, `splitIntoClauses` are functions with the right gating behaviour | The decomposer's public API is intact |
| T04b | `splitIntoClauses` produces multiple clauses from a comma/and/then/plus-splittable task | The clause splitter works |
| T05 | The coordinator can load the decomposer (the missing-organ fix) | The original bug is fixed |
| T06 | Root `task_decomposer.js` is preserved (copy, not move) | Non-destructive integration |
| T07 | The 5 lib/ modules exist (next slice will wire them) | The pattern is ready to repeat |

## Origin of the find

**2026-08-17 13:11** — the `coordinator.js:161` `require('./task_decomposer.js')` was identified as the bug. The file `task_decomposer.js` (21KB) at the project root was found to be exactly the "missing organ" the file itself names in its header comment: "PURPCLAW TASK DECOMPOSER — The missing organ. Sits between parseCommand() and buildExecutionPlan() in orchestrator.js."

## Cert verdict format

`agent_work/cert_gates/coordinator_decomposer/result.json`:
```json
{
  "schema": "purpclaw.cert-gate.coordinator-decomposer.v1",
  "cert_id": "agent_work/cert_gates/coordinator_decomposer/",
  "verdict": "PASS",
  "tests_total": 8,
  "tests_pass": 8,
  "tests_fail": 0,
  "bug_class": "require-path mismatch",
  "fix": "copied task_decomposer.js + agent_routing_matrix.js from project root to services/swarm/",
  "remaining_in_same_pattern": [
    "lib/context-packet.js",
    "lib/llm-provider.js",
    "lib/self-context.js",
    "lib/memory-client.js",
    "lib/cognitive-client.js"
  ]
}
```
