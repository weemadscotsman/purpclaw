# Path Sweep Methodology

## When to use
Dashboard shows `502 Bad Gateway`, `ERR_CONNECTION_REFUSED`, `400 Bad Request` floods in the browser console, or "services offline" when they're actually running.

## The problem
The MissionControl dashboard polls 30 services every 2-5 seconds via `/api/service-proxy?port=N&path=P`. If the service config doesn't match what's actually running, the console fills with errors even though the backend is healthy.

## The method

### Step 1: Extract all service config entries
```bash
grep -E "name:|port:|path:" app/hooks/useMissionData.ts
```

### Step 2: Cross-reference every port+path against reality
```bash
for entry in "7782:/health:eventbus" "7780:/api/health:api" "7790:/tower/status:tower"; do
  port=$(echo $entry | cut -d: -f1)
  path=$(echo $entry | cut -d: -f2)
  name=$(echo $entry | cut -d: -f3)
  code=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" "http://localhost:$port$path")
  [ "$code" = "200" ] && echo "✅ $name" || echo "❌ $name → $code"
done
```

### Step 3: Fix mismatches
- Services that ARE responding → keep `optional: false`
- Services that are OFFLINE → change to `optional: true` (they show as grey "optional" in dashboard, not red "offline")
- Services with no HTTP health endpoint → `port: -1` (NOT `port: 0` — port 0 causes the proxy to poll `:0/health` producing 400s)

### Step 4: Fix health paths
Some services use non-standard health paths:
- `unified_api.js:7780` → `/api/health` (not `/health`)
- `agent_tower.js:7790` → `/tower/status` (not `/health`)
- `Next.js:3000` → no health endpoint at all, use `/`

The service config MUST match the actual endpoint path or the proxy returns 404/502.

## Common traps

### port: 0 spams 400s
Two services (Companion Chorus, Terminal Fly) have no HTTP health port. Setting `port: 0` causes hundreds of `GET :0/health → 400` errors. Fix: `port: -1`.

### Duplicate entries
After multiple edits, the SERVICE_CONFIG array can accumulate duplicate entries (e.g., two "Knowledge Pool" entries). Deduplicate by key.

### optional: false on dark services
The cognitive cluster (memory, neuro-symbolic, modal logic, diagnostics, rules engine) is frequently offline. Marking them `optional: false` means the dashboard shows red "offline" and the proxy keeps hammering dead ports. Mark them `optional: true` until the cluster is booted.

## Verified 2026-06-06
After path sweep, only 8 services confirmed responding and kept as `optional: false`:
eventbus(:7782), state(:7783), api(:7780), tower(:7790), orchestrator(:7784), gatekeeper(:7791), metrics(:7890), context(:7881).

14 dark services changed to `optional: true` including the entire cognitive cluster.
