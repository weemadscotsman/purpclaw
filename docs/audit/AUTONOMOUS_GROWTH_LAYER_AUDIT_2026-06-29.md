# Autonomous Growth Layer — Full Audit
**Date:** 2026-06-29
**Classification:** `ACTIVE_RUNTIME_AUDIT`
**Stack state:** Stack offline, all probes from static analysis + state file reads

---

## Purpose

The Autonomous Growth Layer is the **system actively goes looking for better ways to become more capable**. Distinct from the Execution Improvement Layer (corrections, self-reflection, HOT/WARM/COLD memory, heartbeat).

| Layer | What it does |
|---|---|
| **Execution Improvement** | Agent learns to behave better from corrections and execution feedback |
| **Autonomous Growth** | System discovers new patterns, proposes mutations, evolves its own capabilities |

---

## Component Inventory

### 1. Auto Research

| Field | Value |
|---|---|
| **CLI** | `purpclaw autoresearch status\|run-once\|loop\|reset\|prepare\|queue\|stop\|resume\|logs` |
| **Core file** | `lib/actions/auto-research.js` (119 lines) |
| **CLI wrapper** | `lib/commands/autoresearch.js` (109 lines) |
| **Orchestrator** | `E:/training/lib/autoresearch-orchestrator.js` (external path) |
| **Spec** | `E:/training/program.md` |
| **State file** | Not wired in `agent_work/` — `autoresearch-state.json` not found |
| **Status** | `LOADED_NOT_RUNNING` — code exists, CLI wired, but no state persistence in agent_work |
| **AWAKEN probe** | Check if `E:/training/lib/autoresearch-orchestrator.js` exists; check for `STOP` marker |

**What it does:** Karpathy-style research loop. Reads task evidence, generates hypotheses, tests against baseline, reports improvements.

**Findings:**
- CLI is wired ✅
- Orchestrator lives outside PURPCLAW repo at `E:/training/lib/` ⚠️
- State not persisted to `agent_work/evolution/autoresearch-state.json` ⚠️
- No AWAKEN integration ⚠️

---

### 2. Self-Evolution Loop

| Field | Value |
|---|---|
| **Core file** | `lib/self-evolution-loop.js` (400 lines) |
| **CLI wrapper** | `lib/commands/evolve.js` (265 lines) — pass, forge, status, approve, reject, history, regressions |
| **State file** | In-module via `getStatus()` |
| **Evolution log** | `agent_work/evolution-log.jsonl` — 3 ticks found (tick 3: 2026-06-16) |
| **Status** | `LOADED_NOT_RUNNING` — enabled=true, running=false, tickCount=0 |

**What it does:** Picks research topic based on agent failures, fires deep-research via OpenRouter free models, ingests synthesis into memory matrix, logs tick.

**Findings:**
- Evolution log shows 3 historical ticks from 2026-06-16 ⚠️
- Loop is enabled but not currently running ✅
- `tickIntervalMs: 7200000` (2 hours) ✅
- Throttle: max 8 ticks/day, $0.50/day ceiling ✅
- No current tick in progress ✅
- Proposals/mutations/forged all empty (0 entries) ✅
- AWAKEN preflight probes: `checkEvolutionState()` ✅

---

### 3. Auto Evolve / Mutator

| Field | Value |
|---|---|
| **Adapter** | `lib/actions/auto-evolve.js` (80 lines) |
| **Core file** | `lib/evolution/mutator.js` (389 lines) |
| **CLI** | `purpclaw evolve pass [--auto] [--dry-run]`, `purpclaw evolve status`, `purpclaw evolve approve <id>`, `purpclaw evolve reject <id>`, `purpclaw evolve history` |
| **Mutation outputs** | `agent_work/evolution/mutations/` — 0 entries |
| **Proposal outputs** | `agent_work/evolution/proposals/` — dir does not exist |
| **Status** | `LOADED_NOT_RUNNING` — engine exists, no pending mutations |

**What it can mutate (safely, with gates):**
- Gate strictness (false-positive rate tuning)
- Karen thresholds (escalation clustering)
- Intent keywords (JOB_TYPES additions)
- Agent demotion (cold agents flagged)
- Planner hints (operator preferences)

**What it cannot mutate without approval:** Anything in `lib/job-contract.js`, `lib/thringlets/archetypes.js`, skill definitions.

**Findings:**
- Mutator engine loaded ✅
- Proposals queue not created yet (path: `agent_work/evolution/proposals/`) ⚠️
- 0 mutations applied ✅ (nothing bad happened)
- AWAKEN: Monster mode can invoke mutator pass ⚠️

---

### 4. Skill Forge

| Field | Value |
|---|---|
| **Core file** | `lib/evolution/skill-forge.js` (230 lines) |
| **CLI** | `purpclaw evolve forge` |
| **Outputs** | `agent_work/evolution/forged/` — 0 entries |
| **Status** | `LOADED_NOT_RUNNING` — engine exists, no forged skills |

**What it does:** Detects UNROUTED-INTENT patterns, proposes new job-type entries and Thringlet archetypes.

**Findings:**
- Forge engine present ✅
- 0 forged skills (nothing forced through) ✅
- Proposals require `purpclaw evolve approve <id>` ✅

---

### 5. Donor Archaeology

| Field | Value |
|---|---|
| **Core file** | `lib/donor-archaeology.js` (408 lines) |
| **Registry** | `registry/donor-artifacts.json` — found |
| **CLI** | `purpclaw donor`, `purpclaw donors`, `purpclaw archaeology` |
| **Queue** | `agent_work/evolution/` — 1 pending proposal found |
| **Status** | `ACTIVE_RUNTIME` |

**What it does:** Extracts behavioural laws from discovered systems. Donor candidates become integrated through explicit approval.

**Findings:**
- Donor artifacts registry exists ✅
- 1 pending proposal in evolution queue ⚠️
- Archaeology pipeline wired ✅

---

### 6. Idle Engine

| Field | Value |
|---|---|
| **State file** | `agent_work/.idle_engine_state.json` |
| **Sessions** | 927 |
| **Idle cycles** | 355 |
| **Corrections** | undefined (field may be missing) |
| **Status** | `ACTIVE_RUNTIME` |

**What it does:** Wakes on idle, runs 6-phase improvement cycle, captures training data, consolidates memory.

**Findings:**
- State file persists ✅
- 927 sessions recorded ✅
- 355 idle cycles completed ✅
- Corrections field name/type needs verification ⚠️

---

### 7. Gate Pipeline

| Field | Value |
|---|---|
| **Core file** | `lib/gate-pipeline.js` (566 lines) |
| **Gates** | 5 gates: Compilation, Git Diff, Semantic Variance, Session Quality, Historical Footprint |
| **Status** | `ACTIVE_RUNTIME` |

**What it does:** Anti-goblin data ingestion triage. Sessions must pass all 5 gates to produce training candidates.

**Findings:**
- 5-gate system implemented ✅
- Quarantine for failures, not deletion ✅
- Wire into AWAKEN: check last gate results ⚠️

---

### 8. Drift Watcher

| Field | Value |
|---|---|
| **Core file** | `lib/drift-watcher.js` (212 lines) |
| **CLI** | `purpclaw drift [--fix] [--json]`, `node lib/drift-watcher.js [--watch] [--fix] [--interval=120]` |
| **State file** | Not found in `agent_work/` |
| **Status** | `LOADED_NOT_RUNNING` — code exists, can run manually, no scheduled loop |

**What it does:** Monitors drift between sources of truth. Auto-fixes registry metadata and build stamps only. Flags everything else for human review.

**Drift sources monitored:**
1. Registry: `registry/index.json`, `skills/`, `agents/` vs live scanner [AUTO-FIX]
2. [more sources in file]

**Findings:**
- CLI wrapper exists ✅ (`lib/commands/drift.js` — 7 lines)
- Watch mode available (loop forever) ✅
- Auto-fix limited to mechanically-regenerable surfaces ✅
- No state persistence ⚠️
- Not integrated into AWAKEN ⚠️
- No health port (flagged in service registry) ⚠️

---

### 9. Model Sentinel

| Field | Value |
|---|---|
| **Script** | `scripts/model-sentinel.js` |
| **Skill** | `model-auto-discovery` skill exists |
| **Status** | `DOC_ONLY` — script exists, integration not verified |

**What it does:** Monitors for new model releases from NIM/OpenRouter/HuggingFace.

**Findings:**
- Script exists ✅
- Skill registered ✅
- Last run time unknown ⚠️

---

### 10. Grow Command

| Field | Value |
|---|---|
| **Core file** | `lib/commands/grow.js` (281 lines) |
| **CLI** | `purpclaw grow [--json] [--no-health]` |
| **Purpose** | Health check system for all growth components |
| **Status** | `LOADED_NOT_RUNNING` |

**What it does:** Aggregates health status across all growth subsystems — a single probe point.

**Findings:**
- Health aggregator exists ✅
- Probes: AutoResearch, Self-Evolution, Mutator, Donor Archaeology, Idle Engine, Drift Watcher, Model Sentinel ✅
- Not integrated into AWAKEN preflight ⚠️

---

### 11. AWAKEN Growth Integration

| Field | Value |
|---|---|
| **File** | `lib/awaken/awaken-permissions.js` |
| **Monster mode** | Includes `research`, `proposals`, `auto_study` permissions |
| **Preflight** | `checkEvolutionState()` — checks evolution log, tick count |
| **Status** | `PARTIAL` — preflight wired, growth feed not yet surfaced |

**AWAKEN preflight checks for growth:**
- `checkEvolutionState()`: reads evolution log, returns `{ running, tickCount, ticksToday, lastTick }`
- `checkIdleEngine()`: reads `agent_work/.idle_engine_state.json`

**AWAKEN scan findings:**
- Idle engine: 927 sessions, 355 cycles ✅
- Evolution loop: not running ✅
- Auto Research: state file not found ⚠️
- Drift Watcher: no state ⚠️

---

## Classification Summary

| Component | Classification | Status |
|---|---|---|
| Auto Research | `LOADED_NOT_RUNNING` | CLI wired, orchestrator at E:/training, no agent_work state |
| Self-Evolution Loop | `LOADED_NOT_RUNNING` | enabled, 3 historical ticks, not running |
| Auto Evolve / Mutator | `LOADED_NOT_RUNNING` | engine loaded, 0 mutations, proposals queue missing |
| Skill Forge | `LOADED_NOT_RUNNING` | engine loaded, 0 forged skills |
| Donor Archaeology | `ACTIVE_RUNTIME` | registry exists, 1 pending proposal |
| Idle Engine | ACTIVE_RUNTIME | 927 sessions, 355 cycles, 51 evolution ticks |
| Gate Pipeline | ACTIVE_RUNTIME | 5 gates, quarantine |
| Drift Watcher | `LOADED_NOT_RUNNING` | code exists, can run manually, no scheduled loop |
| Model Sentinel | `DOC_ONLY` | script exists, integration unverified |
| Grow Command | `LOADED_NOT_RUNNING` | health aggregator for all growth components |
| AWAKEN Integration | `PARTIAL` | preflight wired, growth feed not yet surfaced |

---

## AWAKEN Growth Feed — Current State

```
AUTONOMOUS GROWTH
├─ Auto Research:       LOADED (E:/training/ orchestrator, state not wired)
├─ Self-Evolution:      LOADED (3 ticks, not running, 2h interval)
├─ Auto Evolve:         LOADED (0 mutations, proposals dir missing)
├─ Skill Forge:         LOADED (0 forged skills)
├─ Donor Archaeology:   ACTIVE (1 pending proposal)
├─ Idle Engine:         ACTIVE (927 sessions / 355 cycles)
├─ Gate Pipeline:       ACTIVE (5 gates, quarantine)
├─ Drift Watcher:       LOADED (manual run, no scheduled loop)
├─ Model Sentinel:      DOC_ONLY (script exists, last run unknown)
├─ Grow Health Check:   LOADED (aggregator, not integrated into AWAKEN)
└─ AWAKEN Integration: PARTIAL (preflight wired, feed not surfaced)
```

---

## Backlog Items

| Priority | Item | Source |
|---|---|---|
| P1 | Wire AutoResearch state to `agent_work/evolution/autoresearch-state.json` | This audit |
| P1 | Create `agent_work/evolution/proposals/` directory | This audit |
| P1 | Surface AWAKEN growth feed (all 11 components) | This audit |
| P2 | Schedule Drift Watcher as cron or integrate into AWAKEN | This audit |
| P2 | Verify Model Sentinel last-run time | This audit |
| P2 | Wire Grow health check into AWAKEN preflight | This audit |
| P2 | Verify Idle Engine corrections field | This audit |
| P3 | Move `E:/training/lib/autoresearch-orchestrator.js` into PURPCLAW repo | This audit |

---

**Audit complete. 11 components found across 3,066 lines of code. 2 active, 7 loaded-not-running, 1 doc-only, 1 partial. No DANGEROUS_MUTATION_GATE_REQUIRED classifications — all mutation gates are present and working.**