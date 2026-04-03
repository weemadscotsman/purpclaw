# PM2 Service Recovery (2026-06-06)

## Symptom
Mission Control dashboard shows all 9 services OFFLINE with a red CRITICAL ALERT banner.
Unified API at `:7780` responds 200, but dashboard at `:3000` shows everything red.

## Root cause
PM2 daemon was alive (`pm2 ping` → `pong`) but the **process table was stale**.
The daemon was running but not managing any processes — it had lost track of the
process table between restarts or after a crash. Running `pm2 list` showed only
`purpclaw-api` (the one service started manually) — the other 24 services existed
in the ecosystem config but weren't loaded into PM2's active process table.

## Diagnosis steps

```
# 1. Check PM2 daemon health
$ pm2 ping
{ msg: 'pong' }

# 2. List running services
$ pm2 list
# Only 1 service shows — the process table is stale

# 3. Check if dump file exists (source of truth for resurrect)
$ ls ~/.pm2/dump.pm2
# If this exists, resurrect can restore it
```

## Fix

```
# 1. Resurrect the saved process table
$ pm2 resurrect

# 2. Verify services came back
$ pm2 list | grep online | wc -l
# Should match the number of services in your ecosystem config

# 3. Save the current state so resurrect works next time
$ pm2 save

# 4. Refresh Mission Control dashboard at :3000
```

## If resurrect doesn't work

If `pm2 resurrect` fails or the dump doesn't contain all services:

```
# Start core services using safe-start
$ node bin/purpclaw.js safe-start --core --force

# Then start dark-cluster services one at a time if needed
$ pm2 start ecosystem.config.js --only purpclaw-vision

# Save state
$ pm2 save
```

## Known service issues

| Service | Port | Status | Notes |
|---|---|---|---|
| `purpclaw-vision` | 7781 | crash-loops | Has known Windows flakiness. Reset with `pm2 reset purpclaw-vision` then `pm2 start purpclaw-vision`. May need multiple attempts. |
| `purpclaw-nextjs` | 3000 | slow first boot | Dev mode compiles pages on first request. Takes 5-15s after `online` status. |
| `purpclaw-avatar` | — | needs config | May not start without environment configuration. |

## After recovery

- The Mission Control WebUI at `:3000` should show green across all services
- The Tower at `:7790/tower/status` should return 200
- Dashboard service polling updates every 5-10 seconds