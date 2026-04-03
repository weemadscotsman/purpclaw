# Port Collision Recovery — Python Hardcoded vs PM2 Config
> From 2026-06-06 deep audit. Root cause of the :7780 port collision.

## The bug

Two services were listening on port 7780 simultaneously:
- `purpclaw-api` (unified_api.js, PID 5424) — expected to own :7780
- Python memory_matrix_v2.py (PID 14980, then PID 24836) — ALSO binding to :7780

This caused intermittent connection errors and the dashboard showing "OFFLINE" for the API.

## Root cause

`memory_matrix_v2.py` hardcodes `PORT = 7780` on line 948:
```python
PORT = 7780
...
print("\n[MEMv2] Starting server on port 7780...")
run_v2_server(7780)
```

But `ecosystem.config.js` passes `--port 7880` as an arg:
```js
{ name: 'purpclaw-memory', script: './memory_matrix_v2.py', args: '--port 7880', ... }
```

The Python script ignores the CLI argument because the port is hardcoded.

## Detection

```bash
netstat -ano | grep ":7780" | grep LISTENING
# Shows TWO PIDs:
#   TCP    0.0.0.0:7780    LISTENING    5424   (node — API)
#   TCP    0.0.0.0:7780    LISTENING    14980  (python — memory!)
```

## Recovery

1. Kill the conflicting PID: `taskkill //PID 14980 //F`
2. Fix the hardcoded port: change `PORT = 7780` to `PORT = 7880` in memory_matrix_v2.py
3. Stop the PM2 service: `pm2 stop purpclaw-memory`
4. Delete the stale process: `pm2 delete purpclaw-memory`
5. Restart fresh: `pm2 start ecosystem.config.js --only purpclaw-memory`
6. Verify: `netstat -ano | grep ":7780"` — should show only 1 listener

## Pattern to check for

Any Python service that hardcodes a port number in its source rather than reading from `--port` or env vars. The ecosystem.config.js passes `--port` args, but if the script ignores them, the port is silently wrong.
