# skills/debugging.md — Debugging Skill

## When to use
Use this skill when something is broken, slow, erroring, or behaving unexpectedly.

## Diagnostic protocol

### Step 1 — Isolate the failure
```
1. What is the expected behaviour?
2. What is the actual behaviour?
3. When did it break? (last known good state)
4. What changed since then?
```

### Step 2 — Find the fault surface
- Check logs: `logs/` directory
- Check metrics: GET http://localhost:7890/metrics
- Check service health: GET http://localhost:7784/api/system/health
- Run diagnostics: `purpclaw doctor`

### Step 3 — Identify root cause
Use the orchestrator's truth ledger:
```
GET http://localhost:7784/api/system/health
```
Cross-reference PM2 status against HTTP health. A service that is "online" in PM2 but returns non-200 HTTP is **lying**.

### Step 4 — Fix
- Apply the smallest fix that resolves the root cause
- Document the fix in the handoff

### Step 5 — Verify
- Re-run the truth ledger
- Confirm service is `online`, not `degraded`
- Confirm the broken behaviour is resolved

## Common failure patterns

| Pattern | Indicator | Fix |
|---|---|---|
| Port conflict | EADDRINUSE | Kill the process on that port |
| Token expired | 401 Unauthorized | Rotate the token |
| Memory pressure | OOM crash | Increase max_memory in ecosystem.config.js |
| Storm restart | >5 restarts | Find the boot-time crash in logs |
| Zombie agent | Agent alive in UI, no process | `purpclaw agent kill <id>` |

---

*Debugging Skill — built 2026-06-19*
