# Cognitive Cluster Wake-Up Procedure

> Added: 2026-06-06. Surgeon mode — not raccoon mode.

## When to use

When the cognitive cluster (memory, rules, modal, neuro-symbolic, diagnostics, autodream) needs to be woken from the "defined but dark" state.

## Pre-flight

```bash
# Kill anything on the dark ports
for port in 7880 7787 7785 7884 7786 7895; do
  pid=$(netstat -ano | grep ":$port" | grep LISTENING | awk '{print $NF}' | head -1)
  [ -n "$pid" ] && taskkill //F //PID $pid 2>/dev/null
done

# Verify ports are free
netstat -ano | grep -E ":7880|:7787|:7785|:7884|:7786|:7895" | grep LISTENING
# Expected: EMPTY
```

## Preferred path: Cognitive Spine (single process)

```bash
cd PURPCLAW_DIR
python cognitive_spine.py --port 7880 &
sleep 3
curl -s http://localhost:7880/cognitive/health
```

This imports all 6 modules into ONE process. No port soup. If this works, skip the individual service boot below. The cognitive spine IS the dark cluster.

But verify that the spine's health endpoint shows all 6 modules healthy:
- memory: "healthy"
- rules: "healthy" (3 rules, 0 facts)
- modal: "healthy" (1 agent)
- diagnostics: "healthy" (5 diagnostic agents)
- neuro-symbolic: "healthy"
- autodream: "healthy"

## Fallback: Individual service boot (dependency order)

If the cognitive spine fails (import errors, port conflicts), boot individually:

| Order | Service | Port | Command |
|---|---|---|---|
| 1 | Memory Matrix v2 | 7880 | `python memory_matrix_v2.py` |
| 2 | Symbolic Rules | 7787 | `python symbolic_rules_engine.py --port 7787` |
| 3 | Modal Logic | 7785 | `python modal_logic_engine.py --port 7785` |
| 4 | Neuro-Symbolic Bridge | 7884 | `python neuro_symbolic_bridge.py --port 7884` |
| 5 | Diagnostics | 7786 | `python autonomous_diagnostics.py --port 7786` |
| 6 | AutoDream | 7895 | `python autoDream.py --server` |

**Wait 4 seconds between each boot.** Services have import chains. Rushing causes port conflicts.

PITFALL: `memory_matrix_v2.py` ignores `--port` — it's hardcoded to 7880. Just run `python memory_matrix_v2.py` with no args.

PITFALL: `autoDream.py` uses `--server` not `--port`. Its server is on port 7895 (hardcoded).

## Health verification

```bash
# Memory (uses /stats, not /health)
curl -s http://localhost:7880/stats
# → {"total_atoms": 0, "rules_connected": true, ...}

# Rules
curl -s http://localhost:7787/health
# → {"status": "healthy", "service": "rules_engine"}

# Modal
curl -s http://localhost:7785/health
# → {"status": "healthy", "service": "modal_logic_engine"}

# Neuro-Symbolic
curl -s http://localhost:7884/health
# → {"status": "healthy"}

# Diagnostics
curl -s http://localhost:7786/health
# → {"status": "healthy", "service": "diagnostics"}

# AutoDream
curl -s http://localhost:7895/health
# → {"ok": true, "service": "autodream"}
```

## Stay-alive check (60 seconds)

```bash
for i in 1 2 3 4; do
  sleep 15
  echo "t+$((i*15))s:"
  curl -s http://localhost:7880/stats | python -c "import sys,json; print(json.load(sys.stdin).get('total_atoms','DOWN'))"
  curl -s http://localhost:7787/health | python -c "import sys,json; print(json.load(sys.stdin).get('status','DOWN'))"
  curl -s http://localhost:7785/health | python -c "import sys,json; print(json.load(sys.stdin).get('status','DOWN'))"
  curl -s http://localhost:7884/health | python -c "import sys,json; print(json.load(sys.stdin).get('status','DOWN'))"
  curl -s http://localhost:7786/health | python -c "import sys,json; print(json.load(sys.stdin).get('status','DOWN'))"
  curl -s http://localhost:7895/health | python -c "import sys,json; print(json.load(sys.stdin).get('service','DOWN'))"
done
```

All must report healthy at t+15, t+30, t+45, t+60.

## Integration proof (one fact through the pipeline)

After all services are confirmed alive, push one fact end-to-end:

```bash
# 1. Ingest into memory
curl -s -X POST http://localhost:7880/ingest \
  -H "Content-Type: application/json" \
  -d '{"content":"dark cluster online","type":"event","valence":0.9,"source":"wake-test","importance":1.0}'

# 2. Recall from memory
curl -s -X POST http://localhost:7880/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"dark cluster","limit":3}'

# 3. Lift to neuro-symbolic
curl -s -X POST http://localhost:7884/lift/anomaly \
  -H "Content-Type: application/json" \
  -d '{"pattern_type":"cognitive_boot","confidence":0.95,"source":"wake-test","subject":"dark_cluster"}'

# 4. Assert into rules
curl -s -X POST http://localhost:7787/assert \
  -H "Content-Type: application/json" \
  -d '{"fact":"cognitive_cluster_active(dark_cluster)","provenance":"wake-test"}'

# 5. Query rules
curl -s -X POST http://localhost:7787/query \
  -H "Content-Type: application/json" \
  -d '{"query":"cognitive_cluster_active(X)"}'
# Expected: X=dark_cluster

# 6. Modal epistemic knowledge
curl -s -X POST http://localhost:7785/agent/epistemic/know \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"PURPCLAW_CORE","prop":"dark_cluster_online","value":true}'

# 7. Log diagnostics event
curl -s -X POST http://localhost:7786/event \
  -H "Content-Type: application/json" \
  -d '{"source":"wake-test","description":"Cognitive cluster integration proof passed","severity":"INFO"}'
```

Success criteria: all 7 steps return valid JSON with no errors. The fact flows:
```
Memory → Neuro (lift to symbolic) → Rules (assert + query) → Modal (belief) → Diagnostics (event log)
```

## Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Memory import hangs | sentence-transformers missing | `pip install sentence-transformers` or ignore (hash fallback works) |
| Rules can't import | Missing `--port` flag | It takes `--port 7787` — pass it |
| Modal 404 on /health | Wrong port | It uses 7785, not 7885 |
| Neuro "CozoDB not available" | CozoDB not installed | Safe to ignore — falls back to in-memory store |
| AutoDream can't find port | Wrong flag | Use `--server`, not `--port` |
| Any service port conflict | Cognitive spine still running | Kill it first (see pre-flight) |
| PM2 safe-start --dark fails | PM2 daemon has 0 apps | Boot manually (safe-start reads restart history from existing apps) |

## Related

- `references/port-collision-recovery.md` — port conflict diagnosis
- `references/webui-recovery.md` — .next cache corruption fix
- `cognitive_spine.py` — preferred single-process approach (imports all 6 modules)
