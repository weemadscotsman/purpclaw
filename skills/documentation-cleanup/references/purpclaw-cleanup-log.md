# PURPCLAW Documentation Cleanup — Session Reference

> Date: 2026-06-06 · Context: v0.1.0 ship documentation audit

## What was archived

### Root-level (14 files → docs/legacy/)
| File | Date | Why |
|---|---|---|
| AGENTS.md | 2026-04-18 | 9 divisions, 26 agents → now 5 divisions, 152 dirs (35 deployable) |
| AGENT_DIRECTORY.md | 2026-06-05 | 26 agents listed → now 152 |
| agent-frameworks-INTEGRATION.md | 2026-04-20 | Service counts stale |
| BUGS.md | 2026-06-06 | All critical bugs fixed |
| CAPTAINS_LOG.md | 2026-05-24 | Last entry pre-ship |
| eddie_cannon_bio.md | 2026-05-28 | Personal, not project |
| glitch_manifest.md | 2026-05-24 | Decorative |
| GOOP_SIGIL_EXORCISM_PLAN.md | 2026-05-29 | Plan never executed |
| keyboard_commands_reference.md | 2026-04-14 | Generic Windows, not PurPClaw |
| NEUROSYMBOLIC_TASKS.md | 2026-06-05 | All tasks DONE |
| pc_control_abilities.md | 2026-04-14 | Status stale |
| persistent_vision_framework.md | 2026-04-14 | Status stale |
| project_architecture.md | 2026-04-14 | Generic template |
| PURPCLAW_COMPLETE_ARCHITECTURE.md | 2026-05-25 | 18 services, 30 agents → now 25/152 |
| PURPCLAW_Runbook.md | 2026-05-25 | pm2 start directly → replaced by docs/RECOVERY.md |
| PURPCLAW_Tool_Schema.md | 2026-06-05 | 66 tools → now 110 |
| TEAM_HANDOVER.md | 2026-06-05 | All tasks DONE |

### docs/ sub-archive (16 files → docs/legacy/)
All dated April 2026 or earlier. Architecture proposals, PR reviews, phase plans, session adapter specs.

### Legacy launchers (2 files → docs/legacy/)
- `launch_detached.js` — self-marked LEGACY, replaced by PM2 ecosystem.config.js
- `start_purpclaw.sh` — Kimmi-era, old ports (3001), exposed API key, pre-unification

## What was created

| File | Purpose |
|---|---|
| ARCHITECTURE.md | Full 25-service topology, 7-layer world model, agent breakdown |
| docs/INDEX.md | Navigation hub with folder map + quick-answer table |
| docs/current/README.md | Folder manifest |
| docs/shipped/README.md | Folder manifest |
| docs/experimental/README.md | Folder manifest |
| docs/legacy/README.md | Archive manifest with date + reason for every file |
| docs/artifacts/README.md | Fossil record manifest |

## What was rewritten

| File | Key changes |
|---|---|
| QUICKSTART.md | 25-service table, correct ports, cognitive spine note, one-line install |
| CLAUDE.md | Date → 2026-06-06, spawn section: banned patterns list, cognitive spine, honest gaps |
| CHANGELOG.md | 2026-06-06 ship entry (npm publish, spawn fix, cognitive spine, Smith+Neo, doc cleanup) |

## Terminology fixes applied

| Old term | New term | Why |
|---|---|---|
| 7 Memory Layers | 7-Layer World Model | Stores memory, time, rules, beliefs, counterfactuals, inference |
| 152 agents | 35 deployable (152 directories) | Prevents "agent count fake?" issues |
| memory matrix | world model / cognitive spine | Reflects consolidation |
| cognitive cluster (6 services) | cognitive_spine.py (1 process) | Modular code, not modular processes |

## Three eras identified

1. **Kimmi/Xiaozhi era** (April) — separate services, old ports, Kimmi spelling
2. **Multi-service expansion era** (May) — 25 PM2 services, agent tower, voice bridges
3. **Unified cognitive spine era** (June) — consolidation, npm publish, Smith+Neo, spawn safety

All three were haunting the repo simultaneously. Now separated into docs/legacy/ (eras 1-2) and current docs (era 3).
