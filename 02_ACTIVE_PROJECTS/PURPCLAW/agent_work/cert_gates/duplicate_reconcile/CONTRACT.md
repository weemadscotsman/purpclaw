# DUPLICATE RECONCILE CERT GATE — CONTRACT

**Cert ID:** `agent_work/cert_gates/duplicate_reconcile/`
**Date opened:** 2026-08-17
**Slice:** T07 — reconcile the duplicated `task_decomposer.js` / `agent_routing_matrix.js`
**Status:** open

---

## What this cert certifies

The duplicate copies of two files (`task_decomposer.js`, `agent_routing_matrix.js`) at the project root and at `services/swarm/` have been **reconciled**. After T07, there is **one canonical copy** (at the project root) and **one shim** (at `services/swarm/`) for each.

**The pattern:**
- Canonical: `/task_decomposer.js` (project root, 21KB — the real logic)
- Shim: `/services/swarm/task_decomposer.js` (~770B — `module.exports = require('../../task_decomposer.js')`)
- Canonical: `/agent_routing_matrix.js` (project root, 15KB — the real logic)
- Shim: `/services/swarm/agent_routing_matrix.js` (~610B — `module.exports = require('../../agent_routing_matrix.js')`)

**Why root canonical, not services/swarm/:**
- Root has 6+ live consumers: `pool_service.js`, `restore-personas.js`, `sync-agents.js`, `lib/agent-health.js`, `lib/stack-truth.js`, `task_decomposer.js` (self), and `swarm_coordinator.js` (root).
- services/swarm/ has 1 live consumer: `services/swarm/coordinator.js`.
- This matches the lib/ pattern in the rest of the repo: root is source, services/ consumes from root.

**The reconcile also caught a related bug:** root `swarm_coordinator.js` (a separate, older copy at the project root) was ALSO using `require('./task_decomposer.js')` and would have had the same missing-organ bug. The T08 test asserts the root file still loads cleanly.

## What this cert does NOT certify (honest scope)

- **The two coordinator files are NOT reconciled.** `swarm_coordinator.js` (root, 1125 lines) and `services/swarm/coordinator.js` (swarm, 1178 lines) are both kept — they're different enough that a real reconcile needs its own slice. Both currently load the canonical decomposer + lib modules cleanly.
- **`agent_score.js` is also a duplicate** (root + services/swarm/). Same pattern as the two above. Could be shimmed in a follow-up slice if the consumer list justifies it. Not in T07's scope.
- **The `nul` Windows reserved-name file in `legacy/reintegrate-2026-08-17/PURPCLAW_OLD/backups/.../app/ui-shells/`** is still a blocker for staging that path into git. Skipped from the commit.

## Run

```
node --test tests/duplicate_reconcile/test_canonical.js
```

From project root. 8/8 tests must pass.

```
node --test tests/coordinator_decomposer/test_wire.js
node --test tests/coordinator_lib_wire/test_wire.js
```

Both must still PASS (no regression).

## Assertion criteria (8/8 required for PASS)

| # | Assertion | Why it matters |
|---|---|---|
| T01 | `/task_decomposer.js` resolves, has `decomposeTask()` | Canonical is real |
| T02 | `/agent_routing_matrix.js` resolves with real exports | Canonical is real |
| T03 | `services/swarm/task_decomposer.js` (shim) resolves | The shim works |
| T04 | `services/swarm/agent_routing_matrix.js` (shim) resolves with same keys as root | The shim is faithful |
| T05 | `root === swarm` for both files (same module instance) | Single source of truth, no duplicate state |
| T06 | The shims are < 1.5KB and contain `SHIM` markers; no second logic copy | Pure shims, not stale copies |
| T07 | Coordinator still boots with all 7 dependencies loaded (no regression) | The T06 lib wire fix still works |
| T08 | Root `swarm_coordinator.js`'s require patterns still work; root and shim task_decomposer are the same instance | Old consumers not broken |

## Cert verdict format

`agent_work/cert_gates/duplicate_reconcile/result.json`:
```json
{
  "schema": "purpclaw.cert-gate.duplicate-reconcile.v1",
  "verdict": "PASS",
  "tests_total": 8,
  "tests_pass": 8,
  "tests_fail": 0,
  "reconciled_files": [
    "task_decomposer.js",
    "agent_routing_matrix.js"
  ],
  "canonical_home": "project root",
  "shim_home": "services/swarm/",
  "no_regression": ["coordinator_lib_wire", "coordinator_decomposer"]
}
```
