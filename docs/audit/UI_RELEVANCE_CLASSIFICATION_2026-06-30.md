# UI RELEVANCE CLASSIFICATION — 2026-06-30

Every top-level folder classified by UI relevance. No assumption skips.

---

## ACTIVE_UI — Directly renders in browser

| Folder | Files | UI Surface | Notes |
|--------|-------|-----------|-------|
| `app/` | 209 | ALL active pages | Primary UI. 24 routes, 33 components. |
| `public/` | 45 | Static assets, ENTHEA | `enthea.html` = RESTORED. `ui/` = QUARANTINED. |
| `components/` | 4 | Standalone React (root) | OLD donor — check vs `app/components/`. Likely legacy. |

---

## ACTIVE_BACKEND — Runs server-side, powers UI

| Folder | Files | Backend Ability | UI Destination |
|--------|-------|---------------|---------------|
| `lib/` | 314 | Core runtime: llm-provider, agent-loop, memory, tools, cognitive engines | All pages via API routes |
| `unified_api.js` | 1 | Main HTTP server on :7780 | All pages |
| `cognitive_spine.py` | 1 | Vector memory/FAISS on :7880 | `/memory` |
| `autoDream.py` | 1 | Dream research engine | `/evolution` |
| `memory_matrix_v2.py` | 1 | Memory matrix v2 | `/memory` |
| `spring_doctrine.py` | 1 | Memory rules doctrine | `/memory` |
| `symbolic_rules_engine.py` | 1 | Symbolic reasoning | `/evolution` |
| `modal_logic_engine.py` | 1 | Modal logic | `/evolution` |
| `neuro_symbolic_bridge.py` | 1 | Neuro-symbolic bridge | `/evolution` |
| `autonomous_diagnostics.py` | 1 | Self-diagnostics | `/omni` |
| `voice_stt.py` | 1 | Speech-to-text | `/voice` |
| `simple_bridge.py` | 1 | Simple bridge | `/voice` |
| `memory_matrix.py` | 1 | Legacy memory matrix | `/memory` (legacy, donor) |
| `companion_swarm.js` | 1 | Companion swarm | `/mochi` (INCOMPLETE — chorus NOT exposed) |
| `unified_bridge.js` | 1 | Unified bridge | `/mission` |
| `unified_eventbus.js` | 1 | Event bus | All pages |
| `unified_state.js` | 1 | State management | All pages |
| `metrics_aggregator.js` | 1 | Metrics collection | `/system-map` |
| `vision_monitor.js` | 1 | Vision monitoring | `/system-map` |
| `agent_routing_matrix.js` | 1 | Agent routing | `/agents` |
| `agent_score.js` | 1 | Agent scoring | `/agents` |
| `yolo_service.py` | 1 | YOLO detection | `/system-map` |
| `prompts/` | 17 | Prompt templates | INDIRECT — agent behavior |
| `rules/` | 89 | Refusal weights, behavior rules | `/omni` (abliterator) |
| `schemas/` | 10 | JSON schemas | API validation only |

---

## ACTIVE_RUNTIME — Services that must run

| Folder | Files | Service | UI Depends On |
|--------|-------|---------|--------------|
| `bin/purpclaw.js` | 6 | CLI entry point | All |
| `orchestrator.js` | 1 | Main orchestrator | All |
| `agent_tower.js` | 1 | Agent tower service | `/agents`, `/mission` |
| `swarm_coordinator.js` | 1 | Swarm coordination | `/agents` |
| `swarm_scheduler.js` | 1 | Swarm scheduling | `/agents` |
| `gatekeeper.js` | 1 | Gatekeeper service | `/omni` |
| `harness_service.js` | 1 | Harness service | `/mission` HX |
| `pool_service.js` | 1 | Pool service | `/mission` |
| `worker_service.js` | 1 | Worker service | `/pipeline` |
| `voice_coordinator.js` | 1 | Voice coordinator | `/voice` |
| `voice_bridge_7792.js` | 1 | Voice bridge | `/voice` |
| `healthcheck.js` | 1 | Health checks | `/system-map` |
| `service_registry.js` | 1 | Service registry | `/system-map` |
| `agent_work/` | 1120 | Agent work state | `/agents`, `/pipeline` |
| `agents/` | 45 | Agent definitions/registry | `/agents` |
| `divisions/` | 11 | Division configs | `/agents` |
| `swarm_mission/` | 4 | Swarm mission state | `/mission` |
| `pocket/` | 12 | Pocket runtime | INTERNAL |
| `steering/` | 32 | Steering directives | `/evolution` |
| `STRESS/` | 23 | Adversarial testing | `/omni` (reliability ledger) |

---

## ACTIVE_DATA — Data stores, queues, logs

| Folder | Files | Data Type | UI Destination |
|--------|-------|-----------|---------------|
| `TASKS/` | 12 | Task queue | `/pipeline` |
| `workspace/` | 12 | Workspace state | INDIRECT |
| `research/` | 45 | Research outputs | `/evolution` |
| `logs/` | 2 | Runtime logs | `/pipeline` (log stream) |
| `data/` | 1 | General data | — |

---

## ACTIVE_DOCS — Documentation

| Folder | Files | Contents | Notes |
|--------|-------|---------|-------|
| `docs/` | 1059 | Architecture, design, audit, specs | P7 docs here |
| `apis for agents/` | 23 | API reference by category | `/system-map` input |
| `_api-mega-list/` | 22 | API mega list by division | `/system-map` |
| `DreamTask/` | 1 | DreamTask documentation | Internal reference |

---

## LEGACY_UI — Old UI, quarantine candidates

| Folder | Files | Status | Action |
|--------|-------|--------|--------|
| `components/` (root) | 4 | Old standalone React components | CHECK vs `app/components/` — if identical, DELETE |
| `archive/` | 38 | Old UI variants, old cockpit skins | QUARANTINE — donor only |
| `public/ui/` | ? | Old static UI copies | QUARANTINED — DO_NOT_USE_ACTIVE_UI.md added |

---

## DONOR_UI — Not active, reference only

| Folder | Files | Donor Value | Notes |
|--------|-------|-----------|-------|
| `archive/ui-shadow-2026-06-22/` | ? | ENTHEA source | ALREADY RESTORED — `public/enthea.html` |
| `app/public/ui/` | ? | Old public UI | QUARANTINE |
| `podcast_studio/` | 15 | Podcast creation UI ideas | Donor only, not wired |
| `mochi/` (root) | 24 | Companion runtime (includes ThringletsPage.tsx) | PARTIAL — `/mochi` uses `app/mochi/page.tsx`, but `mochi/ThringletsPage.tsx` has broken import |
| `components/` (root) | 4 | Old component styles | Donor only |

---

## GAPS IDENTIFIED (UI relevance found but NOT wired)

| Folder | Gap | Priority | Destination |
|--------|-----|---------|------------|
| `companion-chorus/` | Multi-companion chorus NOT exposed in `/mochi` | MEDIUM | `/mochi` — chorus status panel |
| `steering/` | Steering drift NOT shown in `/evolution` | MEDIUM | `/evolution` — drift watcher |
| `research/` | Auto-research results NOT shown in `/evolution` | MEDIUM | `/evolution` — research panel |
| `STRESS/` | STRESS feed NOT displayed in `/omni` | MEDIUM | `/omni` — reliability ledger panel |
| `mochi/ThringletsPage.tsx` | Thringlets UI has broken import | LOW | `/mochi` — needs fix or quarantine |
| `rules/` | Refusal rules NOT editable in UI | LOW | `/omni` — abliterator editor |
| `skills/` | Skill forge NOT wired in `/evolution` | MEDIUM | `/evolution` — skill forge |

---

## VENDOR / GENERATED / TRASH

| Folder | Files | Classification | Action |
|--------|-------|---------------|--------|
| `vendor/` | 447 | VENDOR_EXTERNAL | Do not touch |
| `node_modules/` | — | VENDOR_EXTERNAL | Excluded from scan |
| `.next/` | — | GENERATED_CACHE | Excluded from scan |
| `__pycache__/` | — | GENERATED_CACHE | Excluded from scan |
| `tsconfig.tsbuildinfo` | 1 | GENERATED_CACHE | Safe to regenerate |
| `next-env.d.ts` | 1 | GENERATED_CACHE | Safe to regenerate |
| `package-lock.json` | 1 | VENDOR_EXTERNAL | NPM managed |
| `_scratch/` | 29 | TRASH_OR_DEPRECATED | Safe to wipe |
| `refusal_ablation_probe/` | 2 | TEST_ONLY | Not UI relevant |
| `ablation_probes/` | 2 | TEST_ONLY | Not UI relevant |
| `eval/` | 18 | TEST_ONLY | Not UI relevant |
| `tests/` | 2 | TEST_ONLY | Not UI relevant |
| `.robot_shell_probe.js` | 1 | TEST_ONLY | Debug only |
| `.robot_smoke.log` | 1 | TEST_ONLY | Debug only |
| `.smoke_report.json` | 1 | TEST_ONLY | Debug only |

---

## SUMMARY

| Classification | Count | Folders |
|---|---|---|
| ACTIVE_UI | 3 | `app/`, `public/`, `components/` (root) |
| ACTIVE_BACKEND | 25+ | `lib/`, cognitive engines, `prompts/`, `rules/`, `schemas/` |
| ACTIVE_RUNTIME | 20+ | services, `agent_work/`, `agents/`, `STRESS/`, `pocket/`, `steering/` |
| ACTIVE_DATA | 5 | `TASKS/`, `workspace/`, `research/`, `logs/`, `data/` |
| ACTIVE_DOCS | 3 | `docs/`, `apis for agents/`, `_api-mega-list/`, `DreamTask/` |
| LEGACY_UI | 3 | `archive/`, `public/ui/`, `components/` (root) |
| DONOR_UI | 5+ | `app/public/ui/`, `podcast_studio/`, `mochi/` root-level |
| GAPS (not wired) | 7 | `companion-chorus/`, `steering/`, `research/`, `STRESS/`, skills, rules, thringlets |
| VENDOR_EXTERNAL | 2 | `vendor/`, `node_modules/` |
| GENERATED_CACHE | 4 | `.next/`, `__pycache__/`, tsconfig.tsbuildinfo, next-env.d.ts |
| TEST_ONLY | 5 | `eval/`, `tests/`, `refusal_ablation_probe/`, `ablation_probes/`, `.robot_*` |
| TRASH_OR_DEPRECATED | 1 | `_scratch/` |
| SECRET_FILE | 1 | `.env` |

**Key finding:** 7 folders have active UI/backend abilities that are NOT currently exposed in the PURPCLAW UI. These are the "goblin basement" surfaces Eddie warned about.
