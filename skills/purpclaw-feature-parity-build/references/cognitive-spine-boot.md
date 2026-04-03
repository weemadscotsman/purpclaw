# Cognitive Spine — One brain, one port

## The discovery (2026-06-06)

The PURPCLAW cognitive stack has 6 Python engines:

| Engine | File | Old port | Lines |
|---|---|---|---|
| Memory Matrix v2 | `memory_matrix_v2.py` | 7880 | temporal projection, counterfactual, symbolic bridge |
| Symbolic Rules | `symbolic_rules_engine.py` | 7787 | Datalog, forward chaining, constraints, provenance |
| Modal Logic | `modal_logic_engine.py` | 7785 | epistemic/temporal/doxastic/deontic Kripke models |
| Neuro-Symbolic | `neuro_symbolic_bridge.py` | 7884 | neural→symbolic lifting, grounding, entity extraction |
| Diagnostics | `autonomous_diagnostics.py` | 7786 | 5 specialist diag agents, event bus, vote tally |
| AutoDream | `autoDream.py` | server | memory consolidation, rule extraction, archiving |

They're all configured in `ecosystem.config.js` as separate PM2 services — but in the "defined-but-dark" cluster, meaning they were **never actually started**.

The file `cognitive_spine.py` already exists and imports all 6 modules directly. It exposes a single HTTP surface on port 7880 with a full REST API.

## Why one service beats six

For a local v0.1.0 runtime, the cognitive layer should be ONE process:

- **No port soup:** 6 services → 1 port (7880)
- **No PM2 drift:** 6 dark entries → 0 (or 1 running)
- **No inter-service latency:** modules call each other in-process
- **No CORS/health-check hell:** one surface to probe
- **No boot-order dependency:** all or nothing

## Boot it

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
python cognitive_spine.py --port 7880
```

## Verify

```bash
curl http://localhost:7880/cognitive/health
```

Returns all 6 module statuses in one JSON response:

```json
{
  "status": "healthy",
  "service": "cognitive_spine",
  "port": 7880,
  "uptime": 6.6,
  "services": {
    "memory": { "status": "healthy", "base_available": true, "stats": {...} },
    "rules": { "status": "healthy", "facts": 0, "rules": 3 },
    "modal": { "status": "healthy", "agents": 1 },
    "diagnostics": { "status": "healthy", "agents": ["MemoryDiag","VisionDiag",...] },
    "neuro-symbolic": { "status": "healthy", "cozo_enabled": false },
    "autodream": { "status": "healthy", "entries": 0 }
  }
}
```

## API surface

All endpoints under `http://localhost:7880/`:

### Memory
- `GET /memory/health`, `/memory/stats`, `/memory/context`, `/memory/lifted`
- `GET /memory/counterfactual/branches`, `/memory/timeline/<entity>`
- `POST /memory/ingest` — `{content, type, valence, source, importance, metadata}`
- `POST /memory/recall` — `{query, limit, emotional_filter}`
- `POST /memory/project` — `{query, target_time}`
- `POST /memory/what_if/forgotten` — `{memory_id, query}`
- `POST /memory/what_if/noticed` — `{entity, start_time, end_time, query}`
- `POST /memory/lift` — `{memory_id}`
- `POST /memory/ground` — `{query, limit}`
- `POST /memory/react` — `{stimulus, source}`

### Rules
- `GET /rules/health`, `/rules/facts`, `/rules/rules`, `/rules/stats`
- `GET /rules/infer` — run forward chaining
- `POST /rules/assert` — `{fact, provenance}`
- `POST /rules/query` — `{query}`
- `POST /rules/rule` — `{rule}`
- `POST /rules/check` — constraint violations
- `POST /rules/counterfactual` — `{hypothesis, assumptions}`

### Modal
- `GET /modal/health`, `/modal/engine/stats`
- `GET /modal/agent/<id>` — agent state
- `POST /modal/agent/epistemic/know` — `{agent_id, prop, value}`
- `POST /modal/agent/temporal/event` — `{agent_id, label, timestamp, duration}`
- `POST /modal/agent/doxastic/belief` — `{agent_id, prop, confidence}`
- `POST /modal/agent/deontic/permit` — `{agent_id, action}`

### Diagnostics
- `GET /diagnostics/health`, `/diagnostics/findings`, `/diagnostics/vote`, `/diagnostics/stats`
- `POST /diagnostics/diagnose` — `{agent}`
- `POST /diagnostics/event` — `{source, description, severity, metadata}`

### Neuro-Symbolic
- `GET /neuro-symbolic/health`, `/neuro-symbolic/stats`
- `POST /neuro-symbolic/lift/anomaly` — `{pattern_type, confidence, source, subject, metadata}`
- `POST /neuro-symbolic/query` — `{fact_type, subject, predicate, obj, source, min_confidence}`

### AutoDream
- `GET /autodream/health`, `/autodream/status`
- `POST /autodream/dream` — run consolidation cycle

## The rule

> If it's **reasoning state**, put it in the cognitive spine.
> If it's **heavy hardware/model work**, keep it separate.

So: memory + rules + modal + diagnostics + neuro-symbolic + autodream = **one brain** (cognitive_spine.py, port 7880).

YOLO + voice/TTS + ratchet/training = **separate organs** (own services, own ports).

## Integration audit pattern

The cognitive spine boot is the first step. The real audit is proving agents consume it:

```bash
# 1. Boot the spine
python cognitive_spine.py --port 7880 &

# 2. Ingest a memory
curl -X POST localhost:7880/memory/ingest \
  -H 'Content-Type: application/json' \
  -d '{"content":"swarm decision: deploy hotfix to production","type":"decision","source":"agent_tower","importance":0.9}'

# 3. Recall it
curl -X POST localhost:7880/memory/recall \
  -H 'Content-Type: application/json' \
  -d '{"query":"hotfix deployment"}'

# 4. Lift to symbolic
curl -X POST localhost:7880/memory/lift \
  -H 'Content-Type: application/json' \
  -d '{"memory_id":"<id from ingest>"}'

# 5. Assert a rule
curl -X POST localhost:7880/rules/assert \
  -H 'Content-Type: application/json' \
  -d '{"fact":"deployed(hotfix,production)","provenance":"agent_tower"}'

# 6. Run inference
curl localhost:7880/rules/infer

# 7. Check if the spine health reflects all of this
curl localhost:7880/cognitive/health | python -m json.tool
```

That's the flow that proves the seven-layer thesis is alive.
