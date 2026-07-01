# PURPCLAW Documentation Index

Last verified: 2026-06-19

This file is the front door for the docs. Older docs still exist, but the
documents below are the canonical navigation layer for the current local stack.
If an older audit, root README, or STRESS note disagrees with these files, treat
the code and the canonical docs as the newer source until the old doc is updated.

## Start Here

| File | Use it for |
|---|---|
| [CANONICAL_MAP.md](CANONICAL_MAP.md) | One-page map of the current system and source-of-truth rules |
| [WHERE_THINGS_GO.md](WHERE_THINGS_GO.md) | Folder placement rules: what belongs where |
| [ROUTING_AND_BUILD_SPEC.md](ROUTING_AND_BUILD_SPEC.md) | Runtime routing, proxy policy, build, restart, and health commands |
| [ROUTE_INDEX.md](ROUTE_INDEX.md) | Current Next.js page/API route index |
| [SERVICE_RUNTIME_INDEX.md](SERVICE_RUNTIME_INDEX.md) | PM2 services, ports, scripts, health paths, and service ownership |

## Audit Reports (2026-06-29)

|| File | Classification | Notes |
|---|---|---|
| [audit/STRESS_PACK_ACCOUNTING_2026-06-29.md](audit/STRESS_PACK_ACCOUNTING_2026-06-29.md) | `ACTIVE_EVIDENCE / HISTORICAL_STRESS_PACK` | 22 STRESS docs classified. Dark cluster, provider routing, and orchestrator hardening still valid. |
| [audit/COMPANION_ECOLOGY_AUDIT_2026-06-29.md](audit/COMPANION_ECOLOGY_AUDIT_2026-06-29.md) | `ACTIVE_EVIDENCE / COMPANION_ECOLOGY` | Phase 2 (Mochi) real+operational. Phase 1/3b real partial. Phase 4 not started. |
| [audit/SELF_IMPROVING_SKILL_AUDIT_2026-06-29.md](audit/SELF_IMPROVING_SKILL_AUDIT_2026-06-29.md) | `ACTIVE_EVIDENCE / SELF_IMPROVING_LAYER` | PURPCLAW has 7/8 components. 355 idle cycles, 4329 smith-neo entries. Skill adds doctrine + UI. |
| [design/SELF_IMPROVING_LAYER_SPEC_2026-06-29.md](design/SELF_IMPROVING_LAYER_SPEC_2026-06-29.md) | `DESIGN_SPEC / EXECUTION_IMPROVEMENT_LAYER` | Full spec: tier architecture, CLI commands, UI layout, heartbeat rules, anti-creep rules, adapter module. 14 items not yet started. |
| [design/PURPCLAW_LAYER_BOUNDARIES_2026-06-29.md](design/PURPCLAW_LAYER_BOUNDARIES_2026-06-29.md) | `DOCTRINE / ARCHITECTURE_CONSTRAINT` | Seven-layer map, six-pillar doctrine, boundary definitions for all entities. Red flags, file placement rules, violation detection. |
| [design/AWAKEN_SPEC_2026-06-29.md](design/AWAKEN_SPEC_2026-06-29.md) | `DESIGN_SPEC / AWAKEN_FEATURE` | Big Red Button runtime verified — 83 items scanned, 27 clean, 35 warnings, 0 errors. Four modes, permission tiers, event stream, evidence outputs. |
| [audit/AUTONOMOUS_GROWTH_LAYER_AUDIT_2026-06-29.md](audit/AUTONOMOUS_GROWTH_LAYER_AUDIT_2026-06-29.md) | `ACTIVE_RUNTIME_AUDIT` | 11 components, 3,066 lines of code. AutoResearch, Self-Evolution, Mutator, Skill Forge, Donor Archaeology, Idle Engine, Gate Pipeline, Drift Watcher, Model Sentinel. 2 active, 7 loaded-not-running. |
| [design/AUTONOMOUS_GROWTH_LAYER_SPEC_2026-06-29.md](design/AUTONOMOUS_GROWTH_LAYER_SPEC_2026-06-29.md) | `DESIGN_SPEC` | Full component map, capability contract, mutation safety rules (LOW/MEDIUM/HIGH/BLOCKED), state file paths, AWAKEN integration points. |
| [design/AWAKEN_GROWTH_FEED_SPEC_2026-06-29.md](design/AWAKEN_GROWTH_FEED_SPEC_2026-06-29.md) | `DESIGN_SPEC / AWAKEN_FEATURE` | GROWTH section spec for AWAKEN report: 3 new preflight checks, badge rules, Monster mode additions, file locations required, companion reactions. |
| [design/AWAKEN_SPEC_2026-06-29.md](design/AWAKEN_SPEC_2026-06-29.md) | `DESIGN_SPEC / AWAKEN_FEATURE` | AWAKEN runtime: 4 modes (watch/work/monster/ritual), permission tiers, 83 items scanned, 27 clean, 35 warnings, 0 errors. |
| [design/COMPANION_SOUL_DOCTRINE_2026-06-30.md](design/COMPANION_SOUL_DOCTRINE_2026-06-30.md) | `DOCTRINE` | LOCKED: Companions may react, must not emotionally burden. Twagger parked as neural donor. Souls are flavour, not fake autonomy. Four controls: Emotion/Policy/Evidence/Approval never swap. |
| [releases/PURPCLAW_AWAKEN_MILESTONE_2026-06-30.md](releases/PURPCLAW_AWAKEN_MILESTONE_2026-06-30.md) | `RELEASE_RECEIPT` | P0–P6.1 complete. AWAKEN live at /awaken. Doctrines locked. Root consolidated to 32 files....[truncated]
| [UI /api/awaken/status](../app/api/awaken/status/route.ts) | API | `GET` — reads all 4 structured feeds from filesystem |
| [UI /api/awaken/start](../app/api/awaken/start/route.ts) | API | `POST` — spawns `purpclaw awaken --mode X` detached |
| [UI /api/awaken/stop](../app/api/awaken/stop/route.ts) | API | `POST` — writes `.STOP` file |
| [app/awaken/page.tsx](../app/awaken/page.tsx) | UI | Forbidden red button UI: hold-to-press, 4 modes, 5 feed tabs, live polling |

## Execution Improvement

|| File | Notes |
|---|---|---|
| [agent_work/self-improving/memory.md](../../agent_work/self-improving/memory.md) | HOT tier — execution rules, confirmed preferences. ≤100 lines. |

## Existing Reference Docs

| Folder/File | Status | Notes |
|---|---|---|
| [current/](current/) | Active reference | Narrative and troubleshooting docs. Some counts may lag the live stack. |
| [spec/](spec/) | Active reference | Stack, port, BIOS, and agent matrix specs. |
| [shipped/](shipped/) | Stable reference | Completed feature boards and shipped contracts. |
| [audit/](audit/) | Historical evidence | Useful for archaeology, not the current source of truth. |
| [experimental/](experimental/) | Aspirational | Ideas and debt lists, not guaranteed live behavior. |
| [../STRESS/](../STRESS/) | Audit log | Deep working notes and proof logs. Good evidence, noisy navigation. |
| [../README.md](../README.md) | Public overview | Marketing/project overview. Verify numbers against runtime docs. |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Root architecture | Useful longform overview. May duplicate newer docs. |
| [../purpclaw-service-map.md](../purpclaw-service-map.md) | Service sketch | Kept for quick reference; canonical service table is now in `SERVICE_RUNTIME_INDEX.md`. |

## Rule For Future Docs

New operational docs go in `docs/`. New evidence or one-off audit output goes
in `STRESS/` or `agent_work/`. New generated build/runtime artifacts do not go
in `docs/` unless they are intentionally curated.

