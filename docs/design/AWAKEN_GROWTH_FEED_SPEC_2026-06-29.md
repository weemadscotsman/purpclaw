# AWAKEN Growth Feed — Specification
**Date:** 2026-06-29
**Classification:** `DESIGN_SPEC / AWAKEN_FEATURE`
**Status:** Awaiting P6 implementation

---

## Purpose

When AWAKEN runs, it must show the state of every Autonomous Growth component in a dedicated `GROWTH` section of the scan report. This section answers the question: **is the machine learning, or just running?**

---

## GROWTH Section in AWAKEN Report

The section appears in `report.md` after the `SYSTEM` section and before `COMPANIONS`:

```markdown
## GROWTH — Autonomous Growth Layer

| Component | Status | Detail |
|---|---|---|
| Auto Research | ACTIVE / LOADED / MISSING | state file age / queue depth |
| Self-Evolution | ACTIVE / LOADED / RUNNING | ticks: N / last: ISO date |
| Auto Evolve | LOADED / READY | proposals: N pending |
| Skill Forge | LOADED / READY | forged: N |
| Donor Archaeology | ACTIVE | donors: N / pending: N |
| Idle Engine | ACTIVE | sessions: N / cycles: N |
| Gate Pipeline | ACTIVE | last run: ISO / quarantined: N |
| Drift Watcher | LOADED / ACTIVE | last scan: ISO / drifts: N |
| Model Sentinel | ACTIVE / UNKNOWN | last run: ISO |
| Grow Health | ACTIVE / STALE | all components responding |

### Pending Proposals
| ID | Component | Risk | Created |
|---|---|---|---|
| mut_xxx | Auto Evolve | MEDIUM | 2026-06-29 |

### Recent Mutations
| ID | Applied | Result |
|---|---|---|
| — | None | — |

### Growth Verdict
- Growth engine: LOADED ⚠️
- Auto-research: queue empty
- Evolution: not running
- Recommendation: `purpclaw evolve pass --dry-run`
```

---

## AWAKEN Preflight Additions

Add three new preflight checks:

### 6. checkAutoResearch()
```
if (fs.existsSync('E:/training/lib/autoresearch-orchestrator.js')) {
  return { ok: true, component: 'auto_research', status: 'loaded' };
}
return { ok: false, component: 'auto_research', status: 'missing', detail: 'orchestrator not found' };
```

### 7. checkGrowthHealth()
```
Call lib/commands/grow.js health probe.
Return aggregated status of all 9 growth components.
Badge each as: healthy | degraded | missing
```

### 8. checkProposalQueue()
```
if (fs.existsSync('agent_work/evolution/proposals/')) {
  const pending = fs.readdirSync('agent_work/evolution/proposals/').filter(f => f.endsWith('.json'));
  return { ok: true, pending: pending.length };
}
return { ok: false, pending: 0, detail: 'proposals dir missing' };
```

---

## AWAKEN Scan Additions (Phase 3)

When scanning, AWAKEN should:

1. **Probe grow health**: run `node lib/commands/grow.js --json` or equivalent
2. **Count proposals**: `agent_work/evolution/proposals/*.json`
3. **Count mutations**: `agent_work/evolution/mutations/*.json`
4. **Count forged**: `agent_work/evolution/forged/*.json`
5. **Read evolution log**: last 3 ticks from `agent_work/evolution-log.jsonl`
6. **Read drift state**: `agent_work/drift-watcher-state.json` if exists

---

## AWAKEN Badge Rules

| Badge | Meaning | When |
|---|---|---|
| `✅ ACTIVE` | Component running and healthy | Idle engine cycles > 0, evolution ticks > 0, donor artifacts > 0 |
| `🟡 LOADED` | Code present, not running | All other cases |
| `🔴 WARNING` | Degraded or partial | State file old (>7 days), queue growing |
| `❌ MISSING` | Orchestrator not found | File path does not exist |
| `🔴 ERROR` | Last run failed | Error in state file |

---

## Monster Mode Additions

When AWAKEN runs in Monster mode, it should additionally:

```javascript
// After scanning:
// 1. Run grow health check
// 2. If Auto Evolve has proposals and AUTO_EVOLVE_ENABLED=1, surface them
// 3. If Drift Watcher found drifts, queue repair proposals
// 4. If Idle Engine has not run in 24h, surface alert
// 5. Do NOT auto-apply any mutations — queue for approval
```

---

## File Locations Required

```txt
agent_work/evolution/
├── proposals/           ← create if missing
├── mutations/
└── forged/

agent_work/drift-watcher-state.json  ← write on each drift scan
agent_work/.idle_engine_state.json   ← already exists
agent_work/evolution-log.jsonl       ← already exists
registry/donor-artifacts.json         ← already exists
```

---

## CLI Commands that Feed AWAKEN

| Command | What it probes |
|---|---|
| `purpclaw grow --json` | All growth components |
| `purpclaw autoresearch status` | Auto Research queue |
| `purpclaw evolve status` | Proposals + mutations |
| `purpclaw drift --json` | Drift Watcher last scan |
| `purpclaw idle status` | Idle Engine cycles |
| `purpclaw donor` | Donor Archaeology registry |

---

## AWAKEN Feed — Required Field Names

Per the AWAKEN Feed Specification, each audit must emit structured JSON with these exact fields:

### Autonomous Growth Feed
```json
{
  "auto_research_active": "idle | running | missing",
  "research_queue_length": 0,
  "auto_evolve_active": "idle | running | loaded",
  "pending_evolution_proposals": 0,
  "idle_engine_sessions": 927,
  "idle_engine_cycles": 355,
  "drift_watcher_status": "loaded | active | missing",
  "model_discovery_list": ["..."],
  "last_training_feedback_time": "ISO timestamp",
  "donor_pending": 1,
  "skill_forge_count": 0,
  "mutations_applied": 0,
  "gate_pipeline_quarantined": 0
}
```

### Self-Improving Feed
```json
{
  "pending_confirmation": 0,
  "memory_hot_lines": 0,
  "self_reflection_count": 0,
  "heartbeat_last_run": "ISO timestamp",
  "security_boundary_violations": 0,
  "corrections_total": 0,
  "corrections_accepted": 0
}
```

### Companion/Cognitive Feed
```json
{
  "Mochi_phase": 2,
  "Mochi_bond": 100,
  "Mochi_mood": "proud",
  "Chorus_phase": 1,
  "Shaman_status": "loaded | partial | missing",
  "CognitiveSpine_alive": true,
  "MemoryMatrix_loaded": true,
  "RulesEngine_facts": 0,
  "ModalLogic_agents": 0,
  "AutoDream_cycles": 0
}
```

### STRESS Historical Feed
```json
{
  "old_service_count": 14,
  "current_service_count": 27,
  "old_tool_count": 456,
  "current_tool_count": 78,
  "resolved_blockers": ["enforceExactFileProof"],
  "unresolved_blockers": ["OBLITERATUS theatrical"],
  "doctrine_status": "gated_not_gutted",
  "drift_warnings": ["OBLITERATUS", "stub_routes"]
}
```

---

## Companion Reactions for GROWTH Section

When AWAKEN finds GROWTH findings:

```
Mochi: "The engine is warming up."
Chorus: hums (system improving)
Shaman: notes growth state
Weatherman: reports growth pressure
Duck: observes growth rate
Smith: checks mutation safety
Neo: verifies evidence trail
```

---

**AWAKEN is the front door. The GROWTH section is the engine room window. Build it so operators can see whether the machine is learning or just breathing.**