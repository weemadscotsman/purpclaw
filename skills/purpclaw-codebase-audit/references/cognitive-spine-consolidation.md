# Cognitive Spine Consolidation (2026-06-06)

6 separate Python services collapsed into 1 cognitive_spine.py process on port 7880.

## Before (ports soup)

| PM2 name | Script | Port |
|---|---|---|
| purpclaw-memory | memory_matrix_v2.py | 7880 |
| purpclaw-bridge-ns | neuro_symbolic_bridge.py | 7884 |
| purpclaw-modal | modal_logic_engine.py | 7785 |
| purpclaw-diagnostics | autonomous_diagnostics.py | 7786 |
| purpclaw-rules | symbolic_rules_engine.py | 7787 |
| purpclaw-autodream | autoDream.py | 7895 |

## After (one brain)

| PM2 name | Script | Port |
|---|---|---|
| purpclaw-cognitive | cognitive_spine.py | 7880 |

## Route map on :7880

| Prefix | Engine |
|---|---|
| `/memory/*` | Memory Matrix v2 (temporal + counterfactual) |
| `/rules/*` | Datalog symbolic rules |
| `/modal/*` | Kripke modal logic (epistemic/temporal/doxastic/deontic) |
| `/diagnostics/*` | Autonomous diagnostics (5 agents) |
| `/neuro-symbolic/*` | Neuro-symbolic bridge |
| `/autodream/*` | AutoDream consolidation |
| `/cognitive/health` | All 6 engines health check |

## Config files updated

1. `ecosystem.config.js` — replaced 6 entries with 1
2. `service_registry.js` — replaced 5 entries with 1, cognitive launch profile updated
3. `app/hooks/useMissionData.ts` — replaced 5 WebUI health check entries with 1
4. `lib/cognitive-client.js` — all ports set to 7880
5. `lib/memory-client.js` — all paths prefixed with `/memory/`

## Known split-brain patterns

| Client says | Server expects | Fix |
|---|---|---|
| `:7785` (modal) | `:7880` (spine) | Point all to 7880 |
| `:7786` (diag) | `:7880` (spine) | Point all to 7880 |
| `:7787` (rules) | `:7880` (spine) | Point all to 7880 |
| `:7884` (neuro) | `:7880` (spine) | Point all to 7880 |
| `POST /recall` | `POST /memory/recall` | Add `/memory/` prefix |
| `POST /ingest` | `POST /memory/ingest` | Add `/memory/` prefix |
| `/modal/update` | `/modal/agent/epistemic/know` | Remap calls |
| `/modal/evaluate` | GET `/modal/agent/:agent_id` | Switch to GET + return state |
