# HARMFUL DOCS REVIEW (Stage 1 output)


> Generated: 2026-06-25 · Source: docs/DOC_STATUS_LEDGER.json


> Definition: a doc is HARMFUL if it is currently being read as authoritative (root-level
>  or status:CURRENT) but contains claims that conflict with live runtime truth.


> Action: quarantine to docs/harmful-review/ until corrected, OR correct in place.



| Path | Drift | Risk | Proposed Action |
|---|---|---|---|
| ARCHITECTURE.md | claims 110 tools (current: 459) | MEDIUM (root-level, often referenced) | update in place, then re-verify |
| CLAUDE.md | claims 5 NVIDIA keys (current: 10) | MEDIUM (root-level, often referenced) | update in place, then re-verify |
| LAUNCH.md | claims 152 agents (current: 73 live) | MEDIUM (root-level, often referenced) | update in place, then re-verify |
| STATUS.md | may reference the 18/18 runtime proof target (no proof actually run yet) | MEDIUM (root-level, often referenced) | update in place, then re-verify |
| swarm_mission_robot_security_audit.md | claims 5 NVIDIA keys (current: 10) | MEDIUM (root-level, often referenced) | update in place, then re-verify |


## Note on STATUS.md

STATUS.md has the only-version-header, is CURRENT, but its drift line says: "may reference the 18/18 runtime proof target (no proof actually run yet)". This is NOT strictly a contradiction (it is forward-looking), but it is misleading until 18/18 is actually proven live.

Recommendation: keep STATUS.md as CURRENT but update its proof line to only claim what is actually proven in the most recent live gauntlet.
