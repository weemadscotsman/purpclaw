# Cognitive Cluster Wake-Up Procedure (2026-06-06)

Surgical wake of the dark cluster. Dependency order matters. Verify each step before moving on.

## When to use

- After PM2 restart when cognitive services are down
- When `safe-start --dark` fails (common with empty PM2 — no restart history to read)
- When `cognitive_spine.py` isn't running (the consolidated alternative)

## Dependency order

```
1. Memory Matrix v2   (7880)  — base storage/recall
2. Symbolic Rules     (7787)  — inference layer
3. Modal Logic        (7785)  — belief/time/permission reasoning
4. Neuro-Symbolic     (7884)  — lift/ground between memory and rules
5. Diagnostics        (7786)  — watches the above
6. AutoDream          (7895)  — consolidation after memory is alive
```

## Manual boot (when safe-start fails)

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"

# Use system Python, NOT venv Python
PY=C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe

# 1. Memory Matrix v2 (hardcoded to port 7880, no --port flag)
$PY memory_matrix_v2.py &

# 2. Symbolic Rules
$PY symbolic_rules_engine.py --port 7787 &

# 3. Modal Logic
$PY modal_logic_engine.py --port 7785 &

# 4. Neuro-Symbolic Bridge
$PY neuro_symbolic_bridge.py --port 7884 &

# 5. Diagnostics
$PY autonomous_diagnostics.py --port 7786 &

# 6. AutoDream (port 7895, not 7786)
$PY autoDream.py --server &
```

## Health verification

```bash
curl -s http://localhost:7880/stats     # memory (uses /stats, not /health)
curl -s http://localhost:7787/health    # rules
curl -s http://localhost:7785/health    # modal
curl -s http://localhost:7884/health    # neuro
curl -s http://localhost:7786/health    # diagnostics
curl -s http://localhost:7895/health    # autodream
```

## Stay-alive verification (60 seconds)

```bash
for i in 1 2 3 4; do
  sleep 15
  curl -s http://localhost:7880/stats | python -c "import sys,json; print(json.load(sys.stdin)['total_atoms'])"
  curl -s http://localhost:7787/health | python -c "import sys,json; print(json.load(sys.stdin)['status'])"
  curl -s http://localhost:7785/health | python -c "import sys,json; print(json.load(sys.stdin)['status'])"
  curl -s http://localhost:7884/health | python -c "import sys,json; print(json.load(sys.stdin)['status'])"
  curl -s http://localhost:7786/health | python -c "import sys,json; print(json.load(sys.stdin)['status'])"
  curl -s http://localhost:7895/health | python -c "import sys,json; print(json.load(sys.stdin)['service'])"
done
```

## Integration proof

After all 6 are healthy, prove the pipeline works:

```bash
# 1. Ingest a memory
curl -s -X POST http://localhost:7880/ingest \
  -H "Content-Type: application/json" \
  -d '{"content":"dark cluster booted","type":"event","valence":0.9,"source":"wake","importance":1.0}'

# 2. Lift to neuro-symbolic fact
curl -s -X POST http://localhost:7884/lift/anomaly \
  -H "Content-Type: application/json" \
  -d '{"pattern_type":"cluster_boot","confidence":0.95,"source":"wake","subject":"dark_cluster"}'

# 3. Assert into rules engine
curl -s -X POST http://localhost:7787/assert \
  -H "Content-Type: application/json" \
  -d '{"fact":"cognitive_cluster_active(dark_cluster)","provenance":"wake"}'

# 4. Query rules
curl -s -X POST http://localhost:7787/query \
  -H "Content-Type: application/json" \
  -d '{"query":"cognitive_cluster_active(X)"}'

# 5. Modal knowledge
curl -s -X POST http://localhost:7785/agent/epistemic/know \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"PURPCLAW_CORE","prop":"dark_cluster_online","value":true}'

# 6. Log diagnostics event
curl -s -X POST http://localhost:7786/event \
  -H "Content-Type: application/json" \
  -d '{"source":"wake","description":"Integration proof passed","severity":"INFO"}'
```

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `safe-start --dark` returns "Could not read PM2 state" | PM2 daemon running but has 0 apps — no restart history | Manual boot (see above) |
| `memory_matrix_v2.py --port 7880` hangs | Script ignores `--port` flag, hardcoded to 7880 | Just run `memory_matrix_v2.py` with no args |
| `/health` returns 404 on memory | Memory uses `/stats` not `/health` | Use `/stats` |
| `ModuleNotFoundError: No module named 'sentence_transformers'` | Optional dependency missing | Non-fatal — falls back to hash embedder |
| `ModuleNotFoundError: numpy` | Bare `python` resolved to venv Python | Use absolute path to system Python |
| Port collision on 7880 | Cognitive spine or stale process still running | `taskkill` the PID, verify with `netstat -ano` |

## Cognitive Spine alternative

Instead of 6 separate services, boot one process:

```bash
python cognitive_spine.py --port 7880
```

This imports all 6 modules directly. Same endpoints at `/memory/*`, `/rules/*`, `/modal/*`, `/diagnostics/*`, `/neuro-symbolic/*`, `/autodream/*` — all on one port. Health at `/cognitive/health`.

Trade-off: single process means one crash kills everything. But for local dev, the simplicity wins.
