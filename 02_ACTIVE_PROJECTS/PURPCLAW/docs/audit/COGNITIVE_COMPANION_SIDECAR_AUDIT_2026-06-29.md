# PURPCLAW Cognitive + Companion Sidecar Audit — 2026-06-29

> **Auditor:** Quill
> **Scope:** 16 files — cognitive organs, companion engines, support scripts.
> **Rule:** Read before claim. Verify before classify.

---

## 1. The Big Picture

The repo has three distinct organ layers hiding in plain sight:

```
Cognitive Spine (Python)
├─ memory_matrix_v2    — temporal/counterfactual memory
├─ symbolic_rules_engine — Datalog inference + constraints
├─ modal_logic_engine  — per-agent epistemic/temporal/deontic/doxastic reasoning
├─ neuro_symbolic_bridge — neural ↔ symbolic lift/ground
├─ autoDream           — consolidation / rule extraction / archival
├─ DiagnosticOrchestrator — per-agent diagnostics
└─ mem_guard           — memory watchdog (installed in cognitive_spine)

Companion / Experience Engine
├─ shaman_evaluator.js  — auto-shaman for trips
├─ shaman_prompts.js    — ritual/trip prompt library
├─ gacha.py            — LOBSTER GACHA prototype (donor artifact)
└─ companion-chorus/   — 18-species gacha + sprites + chorus (standalone)

Support Organs
├─ spring_doctrine.py  — provenance/trust bridge to Hivemind
├─ music_analysis_service.py — audio/mood analysis sidecar
├─ find_pulse.py       — conversation search utility
└─ boston_analysis.py  — dataset analysis scratch
```

---

## 2. Canonical Memory Question

### Decision required: Which memory file is canonical?

```
memory_matrix.py       — first version, port 7880
memory_matrix_v2.py    — neuro-symbolic upgrade, port 7880
```

**Evidence:**
- `cognitive_spine.py` imports `from memory_matrix_v2 import MemoryMatrixV2` — v2 is the import
- v1 (`memory_matrix.py`) is NOT imported by cognitive_spine
- `memory_matrix_v2.py` has temporal projection, counterfactual memory, neuro-symbolic integration
- v1 has NO imports from v2

**Verdict: `memory_matrix_v2.py` is canonical. `memory_matrix.py` is legacy.**

Classification of `memory_matrix.py`: `LEGACY` — first-gen memory, superseded by v2, not imported by cognitive spine.

---

## 3. File-by-File Classification

### 3.1 cognitive_spine.py

| Attribute | Value |
|---|---|
| **Classification** | `ACTIVE_RUNTIME` |
| **Type** | Unified cognitive HTTP spine |
| **Port** | 7880 |
| **Ecosystem** | `purpclaw-cognitive` registered in ecosystem.config.js |
| **Doctor status** | `OK — optional/config-needed :7880/cognitive/health` |
| **Imports** | memory_matrix_v2, symbolic_rules_engine, modal_logic_engine, neuro_symbolic_bridge, autoDream, DiagnosticOrchestrator, spring_doctrine, realtime_bridge (optional) |
| **mem_guard** | Installed at startup with 1500MB limit |
| **Children** | Rules engine, Modal engine, NeuroBridge, AutoDream, Diagnostics — all run in-process |

**What it exposes at `/cognitive/health`:**
```json
{
  "status": "healthy",
  "service": "cognitive_spine",
  "port": 7880,
  "services": {
    "memory": { "status": "healthy", "service": "memory_matrix_v2" },
    "rules": { "status": "healthy", "service": "rules_engine" },
    "modal": { "status": "healthy", "service": "modal_logic_engine" },
    "diagnostics": { "status": "healthy", "service": "diagnostics" },
    "neuro-symbolic": { "status": "healthy", "service": "neuro_symbolic_bridge" },
    "autodream": { "status": "healthy", "service": "autodream" }
  }
}
```

**Architecture:** Single process, ThreadingTCPServer, in-process engines, one HTTP surface.

---

### 3.2 memory_matrix_v2.py

| Attribute | Value |
|---|---|
| **Classification** | `ACTIVE_COGNITIVE_CORE` |
| **Imported by** | cognitive_spine.py (canonical) |
| **Features** | 3-layer memory (Sensory/Working/Long-Term), temporal projection, counterfactual memory, NeuroSymbolicBridge integration |
| **Port** | Runs inside cognitive_spine :7880 |

**Classification: `ACTIVE_COGNITIVE_CORE` — canonical memory engine.**

---

### 3.3 symbolic_rules_engine.py

| Attribute | Value |
|---|---|
| **Classification** | `ACTIVE_COGNITIVE_CORE` |
| **Type** | Datalog-style rules engine with facts, rules, constraints, counterfactuals |
| **Port** | Runs inside cognitive_spine :7880 |
| **Features** | assert, retract, query, rule, counterfactual, check — HTTP API documented at port 7787 (but serves inside spine) |
| **Preloaded rules** | `sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y`, `ancestor(X,Y)`, `ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)` |

**Classification: `ACTIVE_COGNITIVE_CORE`**

---

### 3.4 modal_logic_engine.py

| Attribute | Value |
|---|---|
| **Classification** | `ACTIVE_COGNITIVE_CORE` |
| **Type** | Per-agent epistemic, temporal, deontic, doxastic reasoning via Kripke models |
| **Port** | Runs inside cognitive_spine :7880 |
| **Features** | KNOW, BELIEVES, MAY, MUST, BEFORE, AFTER, DURING per agent/world |
| **Multi-agent** | Supported — knowledge transfer between agents |

**Classification: `ACTIVE_COGNITIVE_CORE`**

---

### 3.5 neuro_symbolic_bridge.py

| Attribute | Value |
|---|---|
| **Classification** | `ACTIVE_COGNITIVE_CORE` |
| **Type** | Neural ↔ symbolic lift/ground bridge |
| **Port** | Runs inside cognitive_spine :7880 |
| **Features** | Lift neural outputs to symbolic facts, ground symbolic queries to neural retrieval, entity/relation extraction, temporal reasoning |

**Classification: `ACTIVE_COGNITIVE_CORE`**

---

### 3.6 autoDream.py

| Attribute | Value |
|---|---|
| **Classification** | `ACTIVE_MEMORY_MAINTENANCE` |
| **Type** | Memory consolidation engine — dedup, rule extraction, archival, vector-symbolic sync |
| **State file** | `autodream_state.json` |
| **State: cycles** | 150 total consolidation cycles |
| **State: lastConsolidation** | 2026-06-24T20:23:50 |
| **State: entriesMerged** | 0 (last cycle) |
| **State: rulesExtracted** | 0 (last cycle) |
| **Trigger** | Every 30 minutes or when threshold exceeded |
| **Wired to** | memory_matrix_v2 at port 7880 |

**Classification: `ACTIVE_MEMORY_MAINTENANCE`**

---

### 3.7 autodream_state.json

| Attribute | Value |
|---|---|
| **Classification** | `RUNTIME_STATE` — do not commit as source truth |
| **Location** | Root of repo |
| **Contents** | Last consolidation timestamp, cycle count, merge count, archive bytes |
| **Mtime** | 2026-06-24 |

**Classification: `RUNTIME_STATE` — not source. Should not be committed to git.**

---

### 3.8 mem_guard.py

| Attribute | Value |
|---|---|
| **Classification** | `RUNTIME_SAFETY` |
| **Type** | Dependency-free memory watchdog for Python services |
| **No dependencies** | Uses ctypes / /proc / resource module — zero pip deps |
| **How it works** | Daemon thread checks own RSS every N seconds; exits cleanly if over limit → PM2 restarts |
| **Installed in** | cognitive_spine.py at startup |
| **Env vars** | `PURPCLAW_MEM_LIMIT_MB`, `PURPCLAW_MEM_GUARD=0` (disable) |
| **Purpose** | Prevents runaway Python services from eating RAM on i7-2600K / eventual mobile/browser hosts |

**Classification: `RUNTIME_SAFETY` — operational survival organ.**

---

### 3.9 spring_doctrine.py

| Attribute | Value |
|---|---|
| **Classification** | `TRUTH_PROVENANCE_BRIDGE` |
| **Type** | Provenance/trust bridge to Hivemind |
| **No daemon** | Read-only bridge — no persistent service |
| **Source dir** | Reads `.purpclaw/hivemind/spring-index.json` |
| **Target dirs** | `.purpclaw/hivemind/doctrine/`, `.purpclaw/hivemind/principles/` |
| **Trust ranks** | verified_execution(1) → failed_execution(8) |
| **Purpose** | Validates whether a knowledge piece is `ok_to_promote` based on provenance |

**Classification: `TRUTH_PROVENANCE_BRIDGE`**

---

### 3.10 music_analysis_service.py

| Attribute | Value |
|---|---|
| **Classification** | `OPTIONAL_MEDIA_SERVICE` |
| **Type** | Audio/music analysis HTTP sidecar |
| **Port** | 7782 (shares port with EventBus — NOT an HTTP server, this is a conflict) |
| **Features** | Tempo, pitch, spectral features, mood detection, genre classification, audio fingerprinting |
| **Fallback** | Works without Librosa — graceful degradation |
| **Wiring** | EventBus on 7782 — can receive events but is not the HTTP server |
| **Use cases** | Studio mood feed, Weatherman soundtrack, Companion mood reactions, Mochi reactions |

**Classification: `OPTIONAL_MEDIA_SERVICE` — candidate for Studio/Trips integration, not core runtime.**

---

### 3.11 shaman_evaluator.js

| Attribute | Value |
|---|---|
| **Classification** | `COMPANION_TRIPS_PARTIAL` |
| **Type** | Auto-shaman for unattended trips — monitors coherence/entropy, triggers phase transitions |
| **Trip phases** | `come_up → peak → comedown → integration` |
| **Archetypes** | Oracle, Alchemist, Trickster, Bard, Wild Scientist |
| **Auto-triggers** | Phase transitions based on coherence/entropy pattern analysis |
| **Wired to** | Nothing — standalone file |
| **Dependencies** | None listed — no imports from lib/ |

**Classification: `COMPANION_TRIPS_PARTIAL`**

---

### 3.12 shaman_prompts.js

| Attribute | Value |
|---|---|
| **Classification** | `COMPANION_TRIPS_PARTIAL` |
| **Type** | Ritual/trip prompt library |
| **Content** | Vision quest prompts, archetype masks, phase prompts, Shaman whispers nudges |
| **Wired to** | Nothing — standalone file |
| **Dependencies** | None |

**Classification: `COMPANION_TRIPS_PARTIAL`**

---

### 3.13 gacha.py

| Attribute | Value |
|---|---|
| **Classification** | `EXPERIENCE_PROTOTYPE` |
| **Type** | LOBSTER GACHA — random soul/persona generator |
| **Label** | "PURPCLAW LOBSTER GACHA — Random Soul抽卡机" |
| **Source** | Copied from claude-code-system and adapted |
| **Combinations** | 8,000,000 across 5 dimensions: former_life, reason, vibe, speech_style, prop |
| **Former lives** | 40 options (过气摇滚贝斯手, 被裁中年项目经理, etc.) |
| **Output** | Writes result to `gacha_result.txt` |
| **Wired to** | Nothing — standalone |
| **NOT the drops system** | This is a random soul generator, not the earned reward ledger |

**Classification: `EXPERIENCE_PROTOTYPE` — donor artifact from claude-code-system. Do not confuse with the future earned-drops system.**

---

### 3.14 find_pulse.py

| Attribute | Value |
|---|---|
| **Classification** | `RESEARCH_UTILITY` |
| **Type** | Conversation search utility |
| **Purpose** | Search through conversation history |
| **Wired to** | Nothing |

**Classification: `RESEARCH_UTILITY`**

---

### 3.15 boston_analysis.py

| Attribute | Value |
|---|---|
| **Classification** | `SCRATCH` |
| **Type** | Dataset analysis script |
| **Purpose** | Boston dataset analysis — research scratch |
| **Wired to** | Nothing |

**Classification: `SCRATCH` — archive or label**

---

## 4. Wiring Audit

### 4.1 What cognitive_spine already wires

```
cognitive_spine.py (port 7880)
  ├─ memory_matrix_v2        ✅ imported
  ├─ symbolic_rules_engine   ✅ imported
  ├─ modal_logic_engine      ✅ imported
  ├─ neuro_symbolic_bridge   ✅ imported
  ├─ autoDream               ✅ imported
  ├─ DiagnosticOrchestrator  ✅ imported
  ├─ spring_doctrine         ✅ imported
  ├─ mem_guard               ✅ installed
  └─ realtime_bridge         ✅ optional import
```

### 4.2 What cognitive_spine does NOT wire

```
shaman_evaluator.js         ❌ not imported — standalone JS file
shaman_prompts.js           ❌ not imported — standalone JS file
gacha.py                    ❌ not imported — standalone
music_analysis_service.py   ❌ standalone service
spring_doctrine.py          ✅ imported by cognitive_spine
```

### 4.3 Ecosystem registration

```
purpclaw-cognitive ✅ registered ✅ running ✅ doctor-verified
```

---

## 5. Service Health Map

| Service | Port | Registered | Doctor Status | mem_guard |
|---|---|---|---|---|
| Cognitive Spine | 7880 | ✅ ecosystem | OK (optional) | ✅ 1500MB |
| Symbolic Rules | inside 7880 | — | via spine | — |
| Modal Logic | inside 7880 | — | via spine | — |
| Neuro-Symbolic | inside 7880 | — | via spine | — |
| AutoDream | inside 7880 | — | via spine | — |
| Spring Doctrine | no daemon | — | — | — |
| Music Analysis | 7782 (conflicts) | ❌ | ❌ | — |
| Gacha | no daemon | ❌ | ❌ | — |
| Shaman | no daemon | ❌ | ❌ | — |

---

## 6. Decisions Required (from audit)

| # | Question | Recommendation |
|---|---|---|
| **D1** | Which memory file is canonical? | `memory_matrix_v2.py` — v1 not imported, superseded |
| **D2** | Is cognitive_spine registered as canonical cognitive HTTP service? | **YES** — ecosystem registered, doctor-verified, port 7880 |
| **D3** | Is gacha.py a donor/prototype or active drops engine? | **PROTOTYPE** — labelled LOBSTER GACHA, copied from claude-code-system, writes to gacha_result.txt. NOT the drops engine. Convert to earned drops or archive. |
| **D4** | Are shaman_evaluator.js and shaman_prompts.js the canonical Shaman layer? | **YES** — these are the files. Need wiring to CLI, Studio, Trips. |
| **D5** | Should music_analysis_service.py be optional service or Studio dependency? | **OPTIONAL** — event bus listener, not HTTP server. Mark optional, wire to Studio mood feed. |
| **D6** | Which files are runtime state and should not be committed? | `autodream_state.json` — runtime state only. Do not commit. Add to .gitignore. |

---

## 7. Do-Not-Touch List

| File | Reason |
|---|---|
| `cognitive_spine.py` | Active runtime — 7880 spine, ecosystem-registered |
| `memory_matrix_v2.py` | Active cognitive core — canonical memory |
| `symbolic_rules_engine.py` | Active cognitive core — inside cognitive_spine |
| `modal_logic_engine.py` | Active cognitive core — inside cognitive_spine |
| `neuro_symbolic_bridge.py` | Active cognitive core — inside cognitive_spine |
| `autoDream.py` | Active memory maintenance — inside cognitive_spine |
| `mem_guard.py` | Runtime safety — dependency-free watchdog |
| `shaman_evaluator.js` | Companion partial — needs wiring, not deletion |
| `shaman_prompts.js` | Companion partial — needs wiring, not deletion |

---

## 8. Archive/Scratch List

| File | Classification | Action |
|---|---|---|
| `memory_matrix.py` | `LEGACY` | Archive to docs/archive/legacy/ |
| `boston_analysis.py` | `SCRATCH` | Archive to docs/archive/research/ or delete |
| `gacha.py` | `EXPERIENCE_PROTOTYPE` | Move to .donors/ or archive — NOT active drops engine |
| `find_pulse.py` | `RESEARCH_UTILITY` | Archive to docs/archive/research/ |

---

*Spec: `docs/design/COGNITIVE_COMPANION_UI_SPEC_2026-06-29.md`*
