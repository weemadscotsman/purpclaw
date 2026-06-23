# PURPCLAW Cognitive Spine Integration Proof

Executed 2026-06-06. One fact flowed through the entire pipeline:

## Pipeline trace

```
memory ingest → memory_id: 3f93d46d-6de
     ↓
neuro lift → fact_id: 24e1d2c9, type: anomaly_event, confidence: 0.95, subject: dark_cluster, predicate: exhibits, object: cognitive_boot
     ↓
rules assert → cognitive_cluster_active(dark_cluster), id: 78a92656
     ↓
rules query → X = dark_cluster ← bindings returned, query works
     ↓
modal know → PURPCLAW_CORE learns: dark_cluster_online = true
     ↓
diagnostics event → evt_1 logged in diagnostics ledger
```

## Verification commands

```bash
# Memory ingest
curl -s -X POST http://localhost:7880/ingest \
  -H "Content-Type: application/json" \
  -d '{"content":"Cognitive cluster booted successfully","type":"event","valence":0.9,"source":"test","importance":1.0}'
# → {"memory_id":"3f93d46d-6de"}

# Memory recall
curl -s -X POST http://localhost:7880/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"cognitive","limit":3}'
# → {"results":[{"id":"3f93d46d-6de","content":"...","similarity":0.25,...}]}

# Neuro lift
curl -s -X POST http://localhost:7884/lift/anomaly \
  -H "Content-Type: application/json" \
  -d '{"pattern_type":"cognitive_boot","confidence":0.95,"source":"test","subject":"dark_cluster"}'

# Rules assert
curl -s -X POST http://localhost:7787/assert \
  -H "Content-Type: application/json" \
  -d '{"fact":"cognitive_cluster_active(dark_cluster)","provenance":"test"}'

# Rules query
curl -s -X POST http://localhost:7787/query \
  -H "Content-Type: application/json" \
  -d '{"query":"cognitive_cluster_active(X)"}'

# Modal epistemic
curl -s -X POST http://localhost:7785/agent/epistemic/know \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"PURPCLAW_CORE","prop":"dark_cluster_online","value":true}'

# Diagnostics event
curl -s -X POST http://localhost:7786/event \
  -H "Content-Type: application/json" \
  -d '{"source":"test","description":"Full cognitive pipeline proof completed","severity":"INFO"}'
```

## Expected result

All 7 commands return HTTP 200 with meaningful JSON responses. The memory stores, recalls, the neuro bridge lifts to symbolic, rules assert and query, modal learns, diagnostics logs.

## Port reachability (post-boot)

```bash
# Check all cognitive services
for port in 7880 7787 7785 7884 7786 7895; do
  curl -s -o /dev/null -w "port $port: %{http_code}\n" http://localhost:$port/health 2>/dev/null || echo "port $port: DOWN"
done
```

All should return 200. If any is DOWN, check startup order: memory → rules → modal → neuro → diagnostics → autodream. Earlier services must be healthy before later ones can connect.
