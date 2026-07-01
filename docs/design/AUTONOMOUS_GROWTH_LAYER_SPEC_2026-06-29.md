# Autonomous Growth Layer — Design Specification
**Date:** 2026-06-29
**Classification:** `DESIGN_SPEC`
**Status:** Runtime verified

---

## Purpose

The Autonomous Growth Layer is the **engine room** — the set of systems that let PURPCLAW research new patterns, propose mutations, evolve its own capabilities, and grow without requiring a human to initiate every improvement.

It is distinct from the Execution Improvement Layer (which handles corrections, preferences, self-reflection, and HOT/WARM/COLD learning).

---

## Architectural Distinction

| Layer | Trigger | Example |
|---|---|---|
| **Execution Improvement** | Human correction | Eddie says "stop making shit up" → logs correction → promotes rule |
| **Autonomous Growth** | System discovery | AutoResearch finds pattern → Donor Archaeology extracts law → Auto Evolve proposes mutation → approval gate → runtime |

---

## Component Map

```
AUTONOMOUS GROWTH LAYER
│
├── RESEARCH ENGINE
│   ├── Auto Research (Karpathy-style loop)
│   │   └── lib/actions/auto-research.js + lib/commands/autoresearch.js
│   ├── Research Orchestrator (external: E:/training/lib/autoresearch-orchestrator.js)
│   ├── Research Queue (hypothesis queue)
│   └── Self-Evolution Loop (research → memory ingest → recall)
│       └── lib/self-evolution-loop.js
│
├── MUTATION ENGINE
│   ├── Auto Evolve / Mutator
│   │   └── lib/evolution/mutator.js
│   ├── Skill Forge (proposes new job-types / Thringlet archetypes)
│   │   └── lib/evolution/skill-forge.js
│   ├── Proposals Queue (agent_work/evolution/proposals/)
│   └── Mutations Log (agent_work/evolution/mutations/)
│
├── DISCOVERY ENGINE
│   ├── Donor Archaeology (extracts behavioural laws)
│   │   └── lib/donor-archaeology.js
│   ├── Drift Watcher (detects code/doc drift)
│   │   └── lib/drift-watcher.js
│   └── Model Sentinel (new model discovery)
│       └── scripts/model-sentinel.js
│
├── IMPROVEMENT ENGINE
│   ├── Idle Engine (background improvement cycles)
│   │   └── agent_work/.idle_engine_state.json
│   └── Gate Pipeline (5-gate anti-goblin triage)
│       └── lib/gate-pipeline.js
│
├── HEALTH AGGREGATOR
│   └── Grow Command (aggregates all growth component health)
│       └── lib/commands/grow.js
│
└── AWAKEN INTEGRATION
    ├── Preflight checks (checkEvolutionState, checkIdleEngine)
    └── Growth Feed (AWAKEN scan output section)
```

---

## Capability Contract

| Component | CLI | TUI | Web | Mobile | AWAKEN |
|---|---|---|---|---|---|
| Auto Research | ✅ `autoresearch` | ⬜ | ✅ API | ⬜ | ✅ preflight |
| Self-Evolution | ✅ `evolve` | ⬜ | ⬜ | ⬜ | ✅ preflight |
| Auto Evolve | ✅ `evolve pass` | ⬜ | ⬜ | ⬜ | ✅ monster |
| Skill Forge | ✅ `evolve forge` | ⬜ | ⬜ | ⬜ | ✅ monster |
| Donor Archaeology | ✅ `donor`/`archaeology` | ⬜ | ⬜ | ⬜ | ✅ preflight |
| Drift Watcher | ✅ `drift` | ⬜ | ⬜ | ⬜ | ⬜ |
| Model Sentinel | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Idle Engine | ✅ `idle` | ⬜ | ⬜ | ⬜ | ✅ preflight |
| Grow Health | ✅ `grow` | ⬜ | ⬜ | ⬜ | ⬜ |
| Gate Pipeline | Internal | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Mutation Safety Rules

Mutations are classified by risk:

| Risk | Examples | Gate Required |
|---|---|---|
| **LOW** | Gate FP threshold, Karen escalation count | `purpclaw evolve pass --auto` |
| **MEDIUM** | Intent keyword additions, planner hints | `purpclaw evolve approve <id>` |
| **HIGH** | Agent demotion, new job-type, new archetype | `purpclaw evolve approve <id>` + 2-day cooldown |
| **BLOCKED** | Core loop changes, auth changes, service definitions | Cannot mutate — requires operator commit |

**Never auto-apply HIGH-risk mutations. Never auto-apply BLOCKED mutations. Never mutate without evidence trail.**

---

## State Files

```
agent_work/
├── evolution/
│   ├── proposals/          # pending mutation proposals (JSON)
│   ├── mutations/         # applied mutations (JSON)
│   └── forged/            # skill forge outputs (JSON)
├── evolution-log.jsonl    # self-evolution loop ticks
├── donor-artifacts.json   # donor archaeology registry
├── drift-watcher-state.json  # last drift scan results
└── .idle_engine_state.json   # idle engine sessions/cycles

E:/training/
├── raw/                   # training data (NDJSON, per-day)
├── baseline-tasks.json     # evaluation tasks
└── lib/
    └── autoresearch-orchestrator.js  # Karpathy research loop
```

---

## AWAKEN Integration Points

### Preflight (Phase 1)
- `checkEvolutionState()`: evolution log → `{ running, tickCount, ticksToday, lastTick }`
- `checkIdleEngine()`: `.idle_engine_state.json` → `{ sessionCount, idleCycles }`
- `checkAutoResearch()`: state file exists → `loaded | missing`
- `checkDriftWatcher()`: state file exists → `loaded | missing`

### Scan (Phase 3)
- Probe `grow` health aggregator
- Check proposal queue count
- Check mutation log count
- Check forged skills count
- Check donor pending count

### Report (Phase 6)
- Surface GROWTH section in `report.md`
- Badge each component: `ACTIVE | LOADED | WARNING | ERROR`
- Flag any component with `missing` state

---

**This spec is authoritative. When AWAKEN scans, this doc is the expected state. Any drift from this spec is a findings item.**