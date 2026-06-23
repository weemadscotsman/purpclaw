# PurpClaw Nightly Cold-Start Post-Mortem — 2026-05-27

## What Happened

Python services died sometime overnight:
- `purpclaw-modal` :7785 — DEAD
- `purpclaw-diagnostics` :7786 — DEAD
- `purpclaw-rules` :7787 — DEAD
- `purpclaw-memory` :7880 — DEAD
- `purpclaw-bridge-ns` :7884 — DEAD
- `purpclaw-thringlet-bridge` :7799 — DEAD (colony lost)

Node.js services survived (eventbus, gatekeeper, orchestrator, state, tower — all 10h uptime).

## Root Cause

Python services are registered in `ecosystem.config.js` BUT they are not in the Windows Task Scheduler startup registry. When Ted's PC reboots or the Python processes crash, they stay down. PM2 only manages what it can see.

The Node.js services ([eventbus, state, tower, orchestrator, gatekeeper]) appear to be running via a different mechanism — possibly a persistent PM2 process list that survives a new terminal session, or a different startup trigger.

## Fix — Manual Revive Sequence

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"

# Revive Python services one by one ( sequential avoids PC freeze )
pm2 start ecosystem.config.js --only purpclaw-modal
sleep 2
pm2 start ecosystem.config.js --only purpclaw-diagnostics
sleep 2
pm2 start ecosystem.config.js --only purpclaw-rules
sleep 2
pm2 start ecosystem.config.js --only purpclaw-memory
sleep 2
pm2 start ecosystem.config.js --only purpclaw-bridge-ns
sleep 2
pm2 start ecosystem.config.js --only purpclaw-thringlet-bridge

# Verify all Python services are up
curl -s --max-time 3 http://localhost:7785/health && echo "modal OK"
curl -s --max-time 3 http://localhost:7786/health && echo "diagnostics OK"
curl -s --max-time 3 http://localhost:7787/health && echo "rules OK"
curl -s --max-time 3 http://localhost:7880/health && echo "memory OK"
curl -s --max-time 3 http://localhost:7884/health && echo "bridge-ns OK"
curl -s --max-time 3 http://localhost:7799/health && echo "thringlet-bridge OK"
```

## Key Observations

- Orchestrator (:7784) survived 10h — it's fine
- Python services are the fragile ones — they die when process crashes
- PM2 list only showed 5/11 services (only the Node.js ones)
- `pm2 list` exit code 0 even though Python services are missing — PM2 doesn't flag "only some services from ecosystem.config.js are not running"
- Health-check pattern confirmed: `curl --max-time 3` returns empty body on dead service (exit code 7 = connection failed)
- Thringlet bridge lost colony state (4 thringlets gone) — colony rebuilt on restart

## Longer-Term Fix

Investigate whether a Windows Task Scheduler task or PM2 startup script can trigger `pm2 start ecosystem.config.js` on login/logon. The current `Hermes_Gateway` scheduled task starts the gateway, but PURPCLAW's full service set needs a separate trigger.

Until then: check Python services at every session start.
