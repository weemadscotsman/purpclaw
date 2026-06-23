# PURPCLAW — Agent Team Handover
**Last Updated:** 2026-04-15
**Session:** Neuro-Symbolic Cognitive System Build-Out (v8.3+)

---

## WHAT IS DONE ✅

### Neuro-Symbolic Stack (Tasks #8–#15, all ✅ DONE)

| Task | File(s) | Status |
|------|---------|--------|
| #8 Neuro-Symbolic Integration Layer | `neuro_symbolic_bridge.py` (port 7784) | ✅ DONE |
| #9 Modal Logic Engine | `modal_logic_engine.py` (port 7785) | ✅ DONE |
| #10 Autonomous Diagnostics | `autonomous_diagnostics.py` (port 7786) | ✅ DONE |
| #11 Symbolic Rules Engine | `symbolic_rules_engine.py` (port 7787) | ✅ DONE |
| #12 Memory Matrix v2 | `memory_matrix_v2.py` (port 7780) | ✅ DONE |
| #13 Command Center v2 | `command_center_v2.html` | ✅ DONE |
| #14 Persistent Vision Integration | `vision_monitor.js` (port 7781) | ✅ DONE |
| #15 Unified PC Control Schema | `PURPCLAW_Tool_Schema.md` | ✅ DONE |

---

## WHAT EACH SERVICE DOES

### Ports Reference

| Port | Service | Language | Key Responsibility |
|------|---------|----------|-------------------|
| 7780 | Memory Matrix v2 | Python | Neuro-symbolic memory, temporal projection, counterfactual reasoning |
| 7781 | Vision Monitor | Node.js | Continuous webcam capture, YOLO object detection, scene change detection |
| 7782 | Music Analysis | Python | Librosa-based audio feature extraction |
| 7784 | Neuro-Symbolic Bridge | Python | Lift neural→symbolic facts; ground symbolic→neural queries |
| 7785 | Modal Logic Engine | Python | Kripke models per agent; epistemic/temporal/deontic/doxastic operators |
| 7786 | Autonomous Diagnostics | Python | Multi-agent causal diagnostics; vote aggregation; DOT causal graph |
| 7787 | Symbolic Rules Engine | Python | Datalog forward-chaining; inequality constraints; sibling rule with X!=Y |

### Service Architecture
```
Vision Monitor (7781) ──lifts──> Neuro-Symbolic Bridge (7784) ──facts──> Symbolic Rules (7787)
                                         │                              │
Memory Matrix v2 (7780) <──ground/lift──┘                              │
      │                                                                 │
      └────────── TemporalProjectionEngine ────────────────────────────┘
      └────────── CounterfactualMemoryEngine ───────────────────────────┘
      └────────── NeuroSymbolicMemoryBridge ────────────────────────────┘

Modal Logic Engine (7785) ←── epistemic/temporal queries ──────────────┐
                                                                      │
Autonomous Diagnostics (7786) ──vote aggregation──> Command Center v2 ◄┘
```

---

## KEY IMPLEMENTATION NOTES (For the Next Agent)

### Symbolic Rules Engine — Key Fixes Applied
1. **Infinite loop bug (duplicate sibling(bob,bob))**: Fixed by adding global `seen_keys` tracking across all `run_inference()` iterations AND adding inequality constraint support (`X != Y`) to `_apply_rule()`.
2. **Inequality constraint parsing**: `add_rule_str()` now parses `X != Y` using regex `r'(\w+)\s*!=\s*(\w+)'` and stores as `('!=', (X, Y))`.
3. **Bootstrap sibling rule**: `"sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y"` — the `X != Y` is REQUIRED or you get reflexive facts.
4. **Rules are NOT auto-loaded on startup** — call `symbolic_rules_engine.py` standalone to bootstrap the KB, OR add explicit `engine.add_rule_str(...)` calls in code.

### Memory Matrix v2 — Key Components
- **TemporalProjectionEngine**: `was_present()`, `what_was_active()`, `state_at()`, `what_happened_between()`, `who_was_mentioned()`, `temporal_project()` — queries over historical memory state
- **CounterfactualMemoryEngine**: `what_if_forgotten()`, `what_if_noticed()` — creates hypothetical memory branches for reasoning
- **NeuroSymbolicMemoryBridge**: `lift()` (memory atom → symbolic), `ground()` (symbolic → memory retrieval), `react_to_stimulus()` (full pipeline), `_SimpleEntityExtractor` (PERSON/ORGANIZATION/TOPIC NER)
- **Component tests** pass individually: quantize OK (max_err~0.002), cosine similarity = 1.0, entity extraction finds names/orgs

### Vision Monitor Integration (Task #14)
- On every detection cycle, each new object class is lifted to the bridge via `POST /lift/entity` (entity_type, entity_text, confidence, source, metadata)
- Scene patterns are lifted via `POST /lift/pattern` (pattern_name, confidence, source, subject, context, metadata)
- Deduplication: same object class only lifted once per 10-second window
- Bridge health checked every 30s; if bridge is down, vision continues normally (graceful degradation)
- New `/bridge` endpoint on vision_monitor shows bridge connection status

### Neuro-Symbolic Bridge Endpoints (port 7784)
- `POST /lift/anomaly` — lift anomaly event
- `POST /lift/pattern` — lift pattern detection
- `POST /lift/memory` — lift memory recall
- `POST /lift/entity` — lift entity extraction
- `POST /lift/causal` — lift causal link
- `GET /query` — ground symbolic query to neural retrieval
- `GET /stats` — bridge statistics
- `GET /health` — health check

### Command Center v2 (`command_center_v2.html`)
- 7 tabs: OVERVIEW, DIAGNOSTICS, AGENTS, MEMORY, SYMBOLIC, SERVICES, LOGS
- Services tab: health-checks 8 services (7780/7781/7782/7784/7785/7786/7787/7779) with timeout 800ms
- Diagnostics tab: polls `/causal-graph/dot` from autonomous_diagnostics, renders as SVG; vote tally with progress bars
- Agents tab: modal logic agent cards with epistemic/temporal/doxastic/deontic badges
- Memory tab: Memory Matrix v2 stats, lifted facts, temporal projection query
- Symbolic tab: rules engine stats, constraint checker, query input, counterfactual reasoning
- Mini-charts: CPU/memory/latency bars updated every 5s with random data (stub)

### Autonomous Diagnostics (port 7786)
- `GET /diagnose` — run full diagnosis cycle, returns `findings[]` with votes
- `GET /causal-graph/dot` — DOT format causal graph (render in browser as SVG)
- `GET /vote-tally` — aggregated votes from diagnostic agents
- `GET /health` — service health

### Modal Logic Engine (port 7785)
- Epistemic operators: `Kt`, `Kt_agent`, `BELIEF`, `COMMON_KNOWLEDGE`
- Temporal operators: `EVER`, `POREVER`, `NEXT`, `UNTIL`, `SINCE`, `BECOME`
- Deontic operators: `MUST`, `MAY`, `MUST_NOT`, `SHALL`, `O`
- Doxastic operators: `BELIEF_LEVEL`, `EXPECTED_UTILITY`
- `POST /eval` — evaluate modal formula against a world ID
- `GET /stats` — engine statistics

---

## WHAT IS STILL PENDING

No neuro-symbolic tasks remain from the original manifest. All #8–#15 are complete.

### Potential Next Areas (Not Started)

1. **CozoDB Integration** — The symbolic rules engine and Memory Matrix v2 both note "CozoDB optional, using in-memory". A real CozoDB backend would add persistent Datalog queries with vector search.

2. **Real-time Streaming in Command Center v2** — The LOGS tab has a `clear()` button and `fetchEvents()` stub but no actual SSE/WS stream. Mini-charts use random data (not real metrics).

3. **Memory Matrix v2 — Full Shadow Protocol Integration** — The v2 `react_to_stimulus()` pipeline is scaffolded but the actual Shadow Protocol event hookup to the symbolic layer is partial.

4. **vision_monitor.js → bridge integration** — The lift code is written but has NOT been runtime-tested. Verify that `POST /lift/entity` and `POST /lift/pattern` actually succeed when both services are running.

5. **Test the full neuro-symbolic pipeline end-to-end** — No integration test exists that: (1) Vision detects object → (2) Bridge lifts to fact → (3) Rules engine derives new facts → (4) Memory Matrix v2 temporal query sees it.

6. **Voice/Agent Layer integration** — The orchestrator.js, agent_tower.js, and voice_coordinator.js have NOT been wired into the neuro-symbolic stack. The bridge could be used to let agent reasoning query memory symbolically.

---

## HOW TO TEST THE STACK

```bash
# Start all Python services
cd C:/Users/Admin/Desktop/PURPCLAW

# Terminal 1 — Memory Matrix v2 (port 7780)
python memory_matrix_v2.py

# Terminal 2 — Neuro-Symbolic Bridge (port 7784)
python neuro_symbolic_bridge.py

# Terminal 3 — Symbolic Rules Engine (port 7787)
python symbolic_rules_engine.py

# Terminal 4 — Modal Logic Engine (port 7785)
python modal_logic_engine.py

# Terminal 5 — Autonomous Diagnostics (port 7786)
python autonomous_diagnostics.py

# Terminal 6 — Vision Monitor (port 7781)
node vision_monitor.js

# Open Command Center v2 in browser
# file:///C:/Users/Admin/Desktop/PURPCLAW/command_center_v2.html
```

### Quick smoke test
```bash
# Check symbolic rules engine inline test
python test_rules_inline.py

# Check Memory Matrix v2 component tests
python -c "
import sys; sys.path.insert(0, '.')
from memory_matrix_v2 import MemoryMatrixV2
mm = MemoryMatrixV2()
print(mm.run_tests())
"
```

---

## FILE MANIFEST

```
PURPCLAW/
├── neuro_symbolic_bridge.py   # Port 7784 — lift/ground API
├── modal_logic_engine.py       # Port 7785 — Kripke models
├── autonomous_diagnostics.py  # Port 7786 — causal diagnostics
├── symbolic_rules_engine.py    # Port 7787 — Datalog engine
├── memory_matrix_v2.py         # Port 7780 — neuro-symbolic memory
├── vision_monitor.js           # Port 7781 — webcam + YOLO + bridge lift
├── music_analysis_service.py   # Port 7782 — audio features
├── yolo_service.py             # Port 7779 — YOLO object detection
├── command_center_v2.html      # Browser dashboard (open directly)
├── PURPCLAW_Tool_Schema.md     # All agent tools documented
├── TASKS/NEUROSYMBOLIC_TASKS.md # Task manifest (all #8–#15 DONE)
└── TEAM_HANDOVER.md            # This file
```

---

## CRITICAL REMINDERS FOR NEXT AGENT

- **DO NOT use `node --check`** on `vision_monitor.js` if you have modified it — the inline Python script uses `${this.frameCount}` which node would misinterpret in a syntax check. The `--check` passed because the Python template is a string literal.
- **The symbolic rules engine infinite loop** (Task #11 initial version) was caused by: (a) no global deduplication across iterations, (b) no inequality constraint support. Both were fixed.
- **Vision monitor dedup key** uses 10-second windows: `\`${objType}_${Math.floor(now / 10000)}\``. If you change this interval, update the comment.
- **Bridge payloads** must match what `neuro_symbolic_bridge.py`'s lift methods expect — check `lift_entity` (`entity_type`, `entity_text`) and `lift_pattern` (`pattern_name`, `confidence`, `source`, `subject`, `context`, `metadata`) before modifying.
- **Windows encoding** — Python files reading with `open(path)` on Windows may hit `UnicodeDecodeError: 0x90`. Always use `encoding='utf-8'`.
