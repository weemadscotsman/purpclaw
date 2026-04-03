# Cognitive Cluster Wake-Up Procedure

> Dark-cluster boot: 6 cognitive services in dependency order. Surgeon mode — no `pm2 resurrect`, no "while we're here."

## Architecture

The cognitive layer imports 6 Python modules. They can run as separate HTTP services (PM2 dark cluster) or as one consolidated process (`cognitive_spine.py`). The standalone services are defined in `ecosystem.config.js` as the "dark cluster."

## Boot order (dependency chain)

| Order | Service | Port | Depends on |
|---|---|---|---|
| 1 | Memory Matrix v2 | 7880 | (none — base storage) |
| 2 | Symbolic Rules | 7787 | Memory (for facts) |
| 3 | Modal Logic | 7785 | Rules (for belief reasoning) |
| 4 | Neuro-Symbolic Bridge | 7884 | Memory + Rules (lift/ground) |
| 5 | Diagnostics | 7786 | All above (watches them) |
| 6 | AutoDream | 7895 | Memory (consolidation) |

## Procedure

### 1. Clear ports
```bash
netstat -ano | grep -E ":7880|:7787|:7785|:7884|:7786|:7895"
# Kill anything holding them
```

### 2. Boot one at a time
Each service is a Python script. Boot directly (PM2 `safe-start --dark` may not work with empty PM2 state):
```bash
cd PURPCLAW_ROOT
python memory_matrix_v2.py &         # hardcoded to port 7880
python symbolic_rules_engine.py --port 7787 &
python modal_logic_engine.py --port 7785 &
python neuro_symbolic_bridge.py --port 7884 &
python autonomous_diagnostics.py --port 7786 &
python autoDream.py --server &       # starts on port 7895
```

### 3. Health check each
Wait 3-4 seconds after each boot, then:
```bash
curl -s http://localhost:7880/stats      # memory (no /health endpoint)
curl -s http://localhost:7787/health      # rules
curl -s http://localhost:7785/health      # modal
curl -s http://localhost:7884/health      # neuro
curl -s http://localhost:7786/health      # diagnostics
curl -s http://localhost:7895/health      # autodream
```

### 4. Stay-alive verify (60 seconds)
Poll all 6 every 15 seconds for 60 seconds. All must remain healthy across 4 checks.

### 5. Integration proof
Push one fact through the full pipeline to prove connectivity:
```bash
# 1. Memory ingest
curl -X POST :7880/ingest -d '{"content":"test","type":"event","valence":0.9,"source":"integration-test"}'

# 2. Neuro lift
curl -X POST :7884/lift/anomaly -d '{"pattern_type":"test","confidence":0.95,"source":"integration-test","subject":"test"}'

# 3. Rules assert
curl -X POST :7787/assert -d '{"fact":"test_fact(test_subject)","provenance":"integration-test"}'

# 4. Rules query
curl -X POST :7787/query -d '{"query":"test_fact(X)"}'

# 5. Modal epistemic
curl -X POST :7785/agent/epistemic/know -d '{"agent_id":"PURPCLAW_CORE","prop":"test_pass","value":true}'

# 6. Diagnostics event
curl -X POST :7786/event -d '{"source":"integration-test","description":"Pipeline proof complete","severity":"INFO"}'
```

## Expected results (2026-06-06 live test)

```
memory ingest → memory_id: 3f93d46d-6de
neuro lift → fact_id: 24e1d2c9, type: anomaly_event, confidence: 0.95
rules assert → cognitive_cluster_active(dark_cluster) #78a92656
rules query → X = dark_cluster ✓
modal know → PURPCLAW_CORE believes: dark_cluster_online = true
diagnostics event → evt_1 logged
```

## Known pitfalls

- **`safe-start --dark` fails with empty PM2**: PM2 must have prior restart history for safe-start to work. If PM2 is empty (0 apps), boot services directly.
- **Memory endpoint**: memory_matrix_v2.py has no `/health` endpoint. Use `/stats` instead.
- **Port hardcoding**: memory_matrix_v2.py hardcodes port 7880 (no `--port` flag). Others accept `--port`.
- **Import failures**: sentence-transformers unavailable → hash fallback (OK). CozoDB unavailable → in-memory store (OK).
- **cognitive_spine.py alternative**: Can boot all 6 as one process on port 7880. This is the consolidated approach Eddie prefers. But if you need individual health checks per service, boot them separately.
