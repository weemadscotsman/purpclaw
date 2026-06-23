---
name: cognitive-spine-deployment
description: Boot, verify, and integrate the PURPCLAW cognitive dark cluster — Memory Matrix, Symbolic Rules, Modal Logic, Neuro-Symbolic Bridge, Diagnostics, and AutoDream — in dependency order. One-off individual services OR consolidated cognitive_spine.py. Use when waking the cognitive layer, proving integration, or fixing split-brain between JS clients and the Python spine.
when_to_use: User says 'wake the brain', 'dark cluster', 'cognitive spine', 'boot the cognitive layer', or when agent decisions need to flow through Memory → Neuro → Rules → Modal → Diagnostics.
---

# Cognitive Spine Deployment

## Architecture

The cognitive layer has TWO deployment modes:

### Mode A: Individual PM2 services (ecosystem.config.js)
Each cognitive engine runs as its own process on its own port:
- `purpclaw-memory` → `memory_matrix_v2.py` → port 7880
- `purpclaw-modal` → `modal_logic_engine.py` → port 7785
- `purpclaw-diagnostics` → `autonomous_diagnostics.py` → port 7786
- `purpclaw-rules` → `symbolic_rules_engine.py` → port 7787
- `purpclaw-bridge-ns` → `neuro_symbolic_bridge.py` → port 7884
- `purpclaw-autodream` → `autoDream.py` → server mode, port 7895

### Mode B: Unified Cognitive Spine (recommended)
`cognitive_spine.py` imports all 6 modules directly and exposes them on ONE port (7880) with namespace-prefixed routes:
- `/memory/*`, `/rules/*`, `/modal/*`, `/diagnostics/*`, `/neuro-symbolic/*`, `/autodream/*`

## Boot order (dependency chain — must start in this order)

```
1. Memory Matrix v2  (7880) — base storage/recall, no deps
2. Symbolic Rules    (7787) — inference layer, no deps
3. Modal Logic       (7785) — belief/time/permission, no deps
4. Neuro-Symbolic    (7884) — lift/ground, needs memory + rules
5. Diagnostics       (7786) — watches the above, needs everything
6. AutoDream         (7895) — consolidation, needs memory alive
```

## Boot procedure

### Option 1: `safe-start --dark` (if PM2 is running)
```bash
purpclaw safe-start --dark
```

**Troubleshooting:** If safe-start fails with "Could not read PM2 state" when PM2 has 0 apps, it's because safe-start checks restart history for circuit-breaking. Bypass by starting each service individually:
```bash
npx pm2 start ecosystem.config.js --only purpclaw-memory
# ... one at a time
```

### Option 2: Direct Python boot (one service per foreground process)
```bash
python memory_matrix_v2.py --port 7880        # or just: python memory_matrix_v2.py
python symbolic_rules_engine.py --port 7787
python modal_logic_engine.py --port 7785
python neuro_symbolic_bridge.py --port 7884
python autonomous_diagnostics.py --port 7786
python autoDream.py --server                  # uses port 7895
```

### Option 3: Unified Cognitive Spine (one process, one port)
Safest. Kill any existing processes on 7785/7786/7787/7884/7895 first:
```bash
taskkill /F /PID $(netstat -ano | grep ":7880" | grep LISTENING | awk '{print $NF}') 2>/dev/null
python cognitive_spine.py --port 7880
```

This single process serves all 6 modules on port 7880.

## Verification

### Health checks (post-boot)
```bash
# Memory (individual)
curl http://localhost:7880/stats
# → {"total_atoms":0,"rules_connected":true,...}

# Rules
curl http://localhost:7787/health
# → {"status":"healthy","service":"rules_engine","port":7787}

# Modal
curl http://localhost:7785/health
# → {"status":"healthy","service":"modal_logic_engine","port":7785}

# Neuro-Symbolic
curl http://localhost:7884/health
# → {"status":"healthy"}

# Diagnostics
curl http://localhost:7786/health
# → {"status":"healthy","service":"diagnostics","port":7786}

# AutoDream
curl http://localhost:7895/health
# → {"ok":true,"service":"autodream"}
```

For the unified Cognitive Spine (port 7880):
```bash
curl http://localhost:7880/cognitive/health
# → {"status":"healthy","service":"cognitive_spine",
#     "services":{"memory":{...},"rules":{...},"modal":{...},"diagnostics":{...},"neuro-symbolic":{...},"autodream":{...}}}
```

### Stay-alive verification (60s)
Poll all services every 15s for 60s. Each must respond with healthy status on every check.

## Integration proof (pipeline)

The seven-layer thesis is not alive until one fact flows through the entire pipeline:

```bash
# 1. MEMORY: Ingest a fact
curl -s -X POST http://localhost:7880/ingest \
  -H "Content-Type: application/json" \
  -d '{"content":"Cognitive cluster booted","type":"event","valence":0.9,"source":"test","importance":1.0}'
# → {"memory_id":"..."}

# 2. MEMORY: Recall it
curl -s -X POST http://localhost:7880/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"cognitive","limit":3}'
# → {"results":[{...}]}

# 3. NEURO: Lift to symbolic fact
curl -s -X POST http://localhost:7884/lift/anomaly \
  -H "Content-Type: application/json" \
  -d '{"pattern_type":"cognitive_boot","confidence":0.95,"source":"test","subject":"cluster"}'

# 4. RULES: Assert the fact
curl -s -X POST http://localhost:7787/assert \
  -H "Content-Type: application/json" \
  -d '{"fact":"cognitive_cluster_active(cluster)","provenance":"test"}'
# → {"fact":"cognitive_cluster_active(cluster)","id":"..."}

# 5. RULES: Query
curl -s -X POST http://localhost:7787/query \
  -H "Content-Type: application/json" \
  -d '{"query":"cognitive_cluster_active(X)"}'
# → {"results":[{"terms":["cluster"],...}]}

# 6. MODAL: Learn proposition
curl -s -X POST http://localhost:7785/agent/epistemic/know \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"PURPCLAW_CORE","prop":"cluster_online","value":true}'

# 7. DIAGNOSTICS: Log event
curl -s -X POST http://localhost:7786/event \
  -H "Content-Type: application/json" \
  -d '{"source":"test","description":"Pipeline integration proof","severity":"INFO"}'
```

Pass condition: every step returns 200 with a valid response body.

## Detecting and fixing cognitive spine split-brain

The most common integration failure: **JS clients speak a different API than the spine serves.**

### Symptoms
- `cognitive-client.js` tries to reach modal on port 7785 → spine is on 7880
- `memory-client.js` sends `POST /recall` → spine expects `POST /memory/recall`
- `cognitive-client.js` calls `/modal/update` → that route doesn't exist on the spine

### Diagnostic checklist

Check these 4 files for consistency:

| File | What to check |
|---|---|
| `lib/cognitive-client.js` | Target ports (should all be 7880 for spine mode) |
| `lib/memory-client.js` | Route paths (should use `/memory/` prefix) |
| `ecosystem.config.js` | Cognitive entries (should match reality) |
| `service_registry.js` | Cognitive service definitions |
| `cognitive_spine.py` | Actual route handlers (the truth) |

### Common fixes

1. **Wrong ports**: `cognitive-client.js` PORTS object should map all cognitive services to 7880:
   ```javascript
   const PORTS = { spine: 7880, modal: 7880, diagnostics: 7880, rules: 7880, neuro: 7880 };
   ```

2. **Missing `/memory/` prefix**: `memory-client.js` calls to `/recall`, `/ingest`, `/react`, `/context`, `/lifted`, `/stats` need `/memory/` prefix

3. **Dead modal paths**: `/modal/update` → map to `/modal/agent/epistemic/know` (or `/doxastic/belief`, `/deontic/permit`). `/modal/evaluate` → use `GET /modal/agent/:agentName`

4. **Orphan services not in PM2**: Check `ecosystem.config.js` and `service_registry.js` and `app/hooks/useMissionData.ts` for missing entries (e.g., `thringlet_bridge`, `harness_service`)

5. **Missing `/state/set` handler**: `thringlets/storage.js` and `harness/engine.js` send `POST /state/set` — if `unified_state.js` doesn't handle it, add a compatibility shim.

## Pitfalls

- **Port conflicts with old manual processes.** Kill any orphan Python processes on cognitive ports before starting.
- **Paste artifacts in config files.** `pool_service.js` once had garbage chars `'7880',10);` appended to its port line — broke startup. Syntax-check all modified files.
- **safe-start --dark fails on empty PM2.** safe-start checks restart history. On first boot with 0 apps, it can't read restart state. Bypass: start services directly.
- **memory_matrix_v2.py doesn't accept --port.** It's hardcoded to 7880. Only cognitive_spine.py accepts --port.
- **AutoDream runs on port 7895** (not 7786 like the other diagnostics).
- **WS connection mode.** The cognitive services don't support WebSocket by default. They use HTTP request-response. SSE streaming needs a separate bridge.
- **No auth on cognitive endpoints.** Anyone on localhost can read/write memory. Add `PURPCLAW_API_KEY` enforcement for production.
