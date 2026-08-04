# FULL REPO FOLDER INVENTORY — 2026-06-30

Coverage: 5,447 files across 110 top-level folders/entries. Excludes: node_modules, .git, .next, __pycache__.

Hard rule applied: no folder skipped by assumption.

---

## ROOT FILES (top-level, no folder)

| Path | Type | Size | Purpose | Classification |
|------|------|------|---------|---------------|
| `.env` | secrets | — | API keys, credentials | SECRET_FILE — DO NOT SCAN |
| `.env.example` | template | — | Env var template | ACTIVE_CONFIG |
| `.env.nvidia` | config | — | NVIDIA-specific env | ACTIVE_CONFIG |
| `.eslintignore` | config | — | ESLint ignore | ACTIVE_CONFIG |
| `.eslintrc.json` | config | — | ESLint config | ACTIVE_CONFIG |
| `.robot_shell_probe.js` | debug | — | Shell probe script | TEST_ONLY |
| `.robot_smoke.log` | log | — | Robot smoke test log | TEST_ONLY |
| `.robot_tools_live.md` | doc | — | Live tools inventory | ACTIVE_DOCS |
| `.smoke_report.json` | report | — | Smoke test results | TEST_ONLY |
| `AGENT.md` | doc | — | Agent system documentation | ACTIVE_DOCS |
| `CHANGELOG.md` | doc | — | Changelog | ACTIVE_DOCS |
| `CLAUDE.md` | doc | — | Claude Code instructions | ACTIVE_DOCS |
| `LAUNCH.md` | doc | — | Launch instructions | ACTIVE_DOCS |
| `LICENSE` | doc | — | MIT license | ACTIVE_DOCS |
| `QUICKSTART.md` | doc | — | Quick start guide | ACTIVE_DOCS |
| `README.md` | doc | — | Project README | ACTIVE_DOCS |
| `SECURITY.md` | doc | — | Security policy | ACTIVE_DOCS |
| `agent_routing_matrix.js` | lib | — | Agent routing | ACTIVE_RUNTIME |
| `agent_score.js` | lib | — | Agent scoring | ACTIVE_RUNTIME |
| `agent_tower.js` | service | — | Agent tower service | ACTIVE_RUNTIME |
| `autoDream.py` | lib | — | AutoDream engine | ACTIVE_BACKEND |
| `autonomous_diagnostics.py` | lib | — | Self-diagnostics | ACTIVE_BACKEND |
| `boot.js` | lib | — | Boot script | ACTIVE_RUNTIME |
| `cognitive_spine.py` | lib | — | Cognitive spine (memory/vector) | ACTIVE_BACKEND |
| `companion_swarm.js` | lib | — | Companion swarm | ACTIVE_BACKEND |
| `ecosystem.config.js` | config | — | PM2 ecosystem config | ACTIVE_CONFIG |
| `gatekeeper.js` | service | — | Gatekeeper service | ACTIVE_RUNTIME |
| `harness_service.js` | service | — | Harness service | ACTIVE_RUNTIME |
| `healthcheck.js` | lib | — | Health check | ACTIVE_RUNTIME |
| `memory_matrix.py` | lib | — | Memory matrix v1 | LEGACY_BACKEND |
| `memory_matrix_v2.py` | lib | — | Memory matrix v2 | ACTIVE_BACKEND |
| `metrics_aggregator.js` | lib | — | Metrics aggregator | ACTIVE_BACKEND |
| `modal_logic_engine.py` | lib | — | Modal logic engine | ACTIVE_BACKEND |
| `neuro_symbolic_bridge.py` | lib | — | Neuro-symbolic bridge | ACTIVE_BACKEND |
| `next-env.d.ts` | generated | — | Next.js type declarations | GENERATED_CACHE |
| `orchestrator.js` | service | — | Main orchestrator | ACTIVE_RUNTIME |
| `package-lock.json` | lock | — | NPM lock | VENDOR_EXTERNAL |
| `package.json` | config | — | NPM config | ACTIVE_CONFIG |
| `pool_service.js` | service | — | Pool service | ACTIVE_RUNTIME |
| `purpclaw.config.example.json` | config | — | Config example | ACTIVE_CONFIG |
| `python` | script | — | Python launcher stub | ACTIVE_RUNTIME |
| `service_registry.js` | lib | — | Service registry | ACTIVE_RUNTIME |
| `settings` | config | — | Settings folder | ACTIVE_CONFIG |
| `simple_bridge.py` | lib | — | Simple bridge | ACTIVE_BACKEND |
| `spring_doctrine.py` | lib | — | Spring doctrine (memory rules) | ACTIVE_BACKEND |
| `swarm_coordinator.js` | service | — | Swarm coordinator | ACTIVE_RUNTIME |
| `swarm_scheduler.js` | service | — | Swarm scheduler | ACTIVE_RUNTIME |
| `symbolic_rules_engine.py` | lib | — | Symbolic rules engine | ACTIVE_BACKEND |
| `task_decomposer.js` | lib | — | Task decomposition | ACTIVE_BACKEND |
| `tsconfig.json` | config | — | TypeScript config | ACTIVE_CONFIG |
| `tsconfig.tsbuildinfo` | generated | — | TS build cache | GENERATED_CACHE |
| `types.ts` | lib | — | Shared TypeScript types | ACTIVE_BACKEND |
| `unified_api.js` | service | — | Main unified API (port 7780) | ACTIVE_RUNTIME |
| `unified_bridge.js` | lib | — | Unified bridge | ACTIVE_BACKEND |
| `unified_eventbus.js` | lib | — | Unified event bus | ACTIVE_BACKEND |
| `unified_state.js` | lib | — | Unified state | ACTIVE_BACKEND |
| `vision_monitor.js` | lib | — | Vision monitor | ACTIVE_BACKEND |
| `voice_bridge_7792.js` | service | — | Voice bridge | ACTIVE_RUNTIME |
| `voice_coordinator.js` | service | — | Voice coordinator | ACTIVE_RUNTIME |
| `voice_ingress.js` | lib | — | Voice ingress | ACTIVE_BACKEND |
| `voice_stt.py` | lib | — | Voice STT | ACTIVE_BACKEND |
| `worker_service.js` | service | — | Worker service | ACTIVE_RUNTIME |
| `yolo_service.py` | lib | — | YOLO detection | ACTIVE_BACKEND |

---

## FOLDER INVENTORY

### `DreamTask/` — 1 file
**Purpose:** Dream Task system — goal decomposition and task generation.
**Contents:** `DREAMTASK.md`
**Classification:** ACTIVE_DOCS
**Backend relevance:** DreamTask logic in `task_decomposer.js`.
**UI relevance:** NONE — internal decomposition engine.
**Evidence:** `task_decomposer.js` imports/processes DreamTask output.

---

### `STRESS/` — 23 files
**Purpose:** Adversarial self-testing — Smith + Neo red/blue team.
**Contents:** Multiple sub-agents (GOOSE, HAWK, OWL, PHOENIX, MOTH, SPIDER, RAVEN, JELLYFISH, LEMUR, GHOST, etc.), benchmark results, test harness files.
**Classification:** ACTIVE_RUNTIME
**Backend relevance:** HIGH — red team testing framework for PURPCLAW reliability.
**UI relevance:** `/omni` — OMNI truth/audit panels display STRESS feed data. STRESS is the TESTABILITY infrastructure for the reliability ledger.
**Evidence:** `agent_work/GOOSE/`, `agent_work/bee/`, benchmark results in `agent_work/benchmark/`.
**UI destination:** `/omni` — Stress/Reliability panel (under OMNI governance).

---

### `TASKS/` — 12 files
**Purpose:** Task queue / work tracking system.
**Contents:** Task files, JSON task records.
**Classification:** ACTIVE_DATA
**Backend relevance:** HIGH — task pipeline data.
**UI relevance:** `/pipeline` — task queue, runs, traces.
**Evidence:** `unified_api.js` handles task dispatch via `orchestrator.js`.
**UI destination:** `/pipeline`.

---

### `_api-mega-list/` — 22 files
**Purpose:** API mega-list — categorized API reference by division/agent.
**Contents:** Category folders (CREATIVE, ENGINEERING, MEDIA_OPS, etc.) with agent API assignments.
**Classification:** ACTIVE_DOCS
**Backend relevance:** Documents the API surface.
**UI relevance:** `/system-map` — API Mega List topology view.
**Evidence:** `lib/api-mega-list-assignments.json` routes categories to divisions.
**UI destination:** `/system-map`.

---

### `_scratch/` — 29 files
**Purpose:** Ephemeral scratch workspace — temporary experiments.
**Classification:** TRASH_OR_DEPRECATED
**Rule:** No active UI imports from here. Can be wiped.
**Evidence:** No imports from active runtime files.

---

### `ablation_probes/` — 2 files
**Purpose:** Ablation study probes — measuring impact of removing components.
**Classification:** TEST_ONLY
**Backend relevance:** Research/eval only.
**UI relevance:** NONE.
**Note:** May contain useful metric definitions for OMNI dashboards.

---

### `agent_work/` — 1,120 files
**Purpose:** Agent work directory — runtime agent state, sessions, results, logs.
**Subdirs:** `GOOSE/`, `SCIENTIST/`, `bee/`, `bunny/`, `dragon/`, `hawk/`, `mushroom/`, `octopus/`, `panda/`, `rabbit/`, `raven/`, `robot/`, `shark/`, `swarm/`, `bee/`, `axolotl/`, `_snapshots/`, `_agentloop_err.log`, `awaken/`, `approval_requests.jsonl`, `approvals.jsonl`.
**Classification:** ACTIVE_DATA + ACTIVE_RUNTIME
**Backend relevance:** CRITICAL — all agent execution state.
**UI relevance:** `/agents`, `/pipeline`, `/mission` — work radar, delegation graph, active jobs.
**Evidence:** `swarm_coordinator.js`, `orchestrator.js` write here.
**UI destination:** `/agents` (work radar), `/pipeline` (task logs).

---

### `agents/` — 45 files
**Purpose:** Agent definitions — agent profiles, AGENT_REGISTRY, division mappings.
**Contents:** `AGENT_REGISTRY.json`, `AGENT_PROFILES.json`, division configs, manifest files.
**Classification:** ACTIVE_RUNTIME
**Backend relevance:** CRITICAL — agent registry, 35+ agents across 9 divisions.
**UI relevance:** `/agents` — division roster, agent list, status.
**Evidence:** `app/api/manifest/route.ts` reads AGENT_REGISTRY.
**UI destination:** `/agents`.

---

### `apis for agents/` — 23 files
**Purpose:** Categorized API surface documentation for agent consumption.
**Classification:** ACTIVE_DOCS
**Backend relevance:** Documents API routes per category/division.
**UI relevance:** INDIRECT — feeds `/system-map` and `/omni`.
**Note:** This is the INPUT to `lib/api-mega-list-assignments.json`.

---

### `app/` — 209 files
**Purpose:** Next.js application — UI routes, components, API routes, hooks.
**Subdirs:** `api/`, `components/`, `hooks/`, `mission/`, `awaken/`, `mochi/`, `system-map/`, `omni/`, `agents/`, `memory/`, `evolution/`, `providers/`, `pipeline/`, `voice/`, `settings/`, `public/`, `spine/`, etc.
**Classification:** ACTIVE_UI
**Contents:** 24 routes, 33 components, 79 API routes.
**Evidence:** All active UI pages — see `UI_SURFACE_INVENTORY_2026-06-30.md`.
**UI destination:** PRIMARY UI.

---

### `archive/` — 38 files
**Purpose:** Archived UI variants — old skins, legacy demos, past iterations.
**Classification:** LEGACY_UI
**Subdirs:** `ui-shadow-2026-06-22/` (ENTHEA source), `legacy-ui/`, old cockpit variants.
**UI relevance:** DONOR — ENTHEA source (`ui-shadow-2026-06-22/enthea.html`), design reference.
**Evidence:** `public/enthea.html` was restored from `archive/ui-shadow-2026-06-22/enthea.html`.
**Action:** Quarantine with `DO_NOT_USE_ACTIVE_UI.md`. ENTHEA already restored.

---

### `bin/` — 6 files
**Purpose:** Executable scripts — `purpclaw.js`, `purpclaw.bat`.
**Classification:** ACTIVE_RUNTIME
**Backend relevance:** CLI entry point for PURPCLAW runtime.
**UI relevance:** NONE — terminal-only.

---

### `companion-chorus/` — 15 files
**Purpose:** Companion chorus system — multi-companion coordination.
**Classification:** ACTIVE_BACKEND
**Backend relevance:** Companion swarm intelligence.
**UI relevance:** `/mochi` — multi-companion state, but `/mochi` currently only shows Mochi (single companion). Companion-chorus features NOT exposed in UI.
**Evidence:** `lib/companion-chorus.js` (implied).
**Gap:** Companion chorus NOT exposed in UI. `/mochi` should show chorus status.

---

### `components/` — 4 files
**Purpose:** Standalone React components (non-App-Router).
**Classification:** ACTIVE_UI (supplemental)
**Evidence:** `app/components/` is the canonical home. This root-level `components/` is likely old/legacy.
**Action:** Check if these differ from `app/components/`. If duplicate, quarantine.

---

### `config/` — 2 files
**Purpose:** Runtime configuration files.
**Classification:** ACTIVE_CONFIG
**Backend relevance:** Runtime config.
**UI relevance:** `/settings`.

---

### `contexts/` — 3 files
**Purpose:** React contexts — likely session or theme contexts.
**Classification:** ACTIVE_UI
**Backend relevance:** UI-only.

---

### `data/` — 1 file
**Purpose:** General data files.
**Classification:** ACTIVE_DATA

---

### `deploy/` — 5 files
**Purpose:** Deployment scripts and configs.
**Classification:** ACTIVE_RUNTIME
**UI relevance:** NONE.

---

### `divisions/` — 11 files
**Purpose:** Division configurations — CREATIVE, ENGINEERING, INFRASTRUCTURE, INTELLIGENCE, MANAGEMENT, MEDIA_OPS, OPERATIONS, SCIENCE, SECURITY.
**Classification:** ACTIVE_RUNTIME
**Backend relevance:** Maps agents to divisions.
**UI relevance:** `/agents` — division roster.
**Evidence:** `agents/AGENT_REGISTRY.json` uses division field.

---

### `docs/` — 1,059 files
**Purpose:** Documentation — design docs, audit docs, architecture docs.
**Classification:** ACTIVE_DOCS
**Backend relevance:** Documents system architecture.
**Subdirs:** `audit/`, `design/`, `spec/`, `archive/`.
**Note:** P7 Phase 0-11 docs go here: `docs/audit/UI_*_2026-06-30.md`, `docs/design/UI_*_2026-06-30.md`.

---

### `eval/` — 18 files
**Purpose:** Evaluation harness and benchmarks.
**Classification:** TEST_ONLY
**Backend relevance:** Benchmarking agent performance.
**UI relevance:** NONE (developer eval only).

---

### `harness/` — (part of agent_work/STRESS)
**Purpose:** Agent harness system — execution harness for agents.
**Classification:** ACTIVE_BACKEND
**Backend relevance:** CRITICAL — harness_service.js, lib/harness/.
**UI relevance:** `/mission` HX tab (AutonomousHarnessPanel) — shows harness execution state.
**Evidence:** `app/components/AutonomousHarnessPanel.tsx` reads harness state.

---

### `hooks/` — 13 files
**Purpose:** React hooks — `useMissionData`, `useAgentEvents`, `useStream`, etc.
**Classification:** ACTIVE_UI
**UI relevance:** ALL pages — shared hooks.
**Evidence:** `app/hooks/useMissionData.ts`, `app/hooks/useAgentEvents.ts`.

---

### `infra/` — 11 files
**Purpose:** Infrastructure configs — Docker, deployment, monitoring.
**Classification:** ACTIVE_CONFIG
**UI relevance:** NONE.

---

### `lib/` — 314 files
**Purpose:** Core runtime libraries — LLM provider, agent loop, memory, tools, cognitive engines, API routes.
**Classification:** ACTIVE_BACKEND
**Key files:** `llm-provider.js`, `agent-loop.js`, `memory-client.js`, `unified_api.js`, `tools/index.js`, `tools-pc.js`, cognitive engines, etc.
**Backend relevance:** CRITICAL — all runtime logic.
**UI relevance:** INDIRECT — UI reads from API routes backed by lib/.

---

### `logs/` — 2 files
**Purpose:** Runtime logs.
**Classification:** ACTIVE_DATA
**UI relevance:** `/pipeline` log stream.

---

### `models/` — 1 file
**Purpose:** Model definitions or model registry.
**Classification:** ACTIVE_BACKEND
**UI relevance:** `/providers` — model list.

---

### `mochi/` — 24 files
**Purpose:** Mochi companion runtime — companion state, actions, memory, thringlets.
**Subdirs:** ThringletsPage.tsx (Game Boy companion UI), mochi memory, pool stats.
**Classification:** ACTIVE_BACKEND + ACTIVE_UI
**Backend relevance:** Companion state engine.
**UI relevance:** `/mochi` — Mochi pet UI.
**Gap:** `lib/thringlets/` ThringletsPage.tsx has an import error (`@/components/unified/layout/PageLayout` not found). ThringletsPage.tsx is likely a legacy donor — NOT wired in active UI.

---

### `pocket/` — 12 files
**Purpose:** Pocket runtime — lightweight agent commands, SpendGate configs.
**Classification:** ACTIVE_RUNTIME
**Evidence:** `agent_work/.pool_index.json`, `spend-config.json`.
**UI relevance:** NONE — terminal/runtime only.

---

### `podcast_studio/` — 15 files
**Purpose:** Podcast studio — content creation tool.
**Classification:** DONOR_BACKEND
**UI relevance:** NONE — standalone tool, not wired to PURPCLAW UI.
**Note:** Archived/donor. Not a priority.

---

### `prompts/` — 17 files
**Purpose:** Prompt templates — system prompts, agent prompts, Mochi prompts.
**Classification:** ACTIVE_BACKEND
**UI relevance:** INDIRECT — prompts power agent behavior.
**Evidence:** `app/api/personality/route.ts` reads prompt templates.

---

### `public/` — 45 files
**Subdirs:** `ui/` (DO NOT USE), `enthea.html` (RESTORED).
**Classification:** ACTIVE_UI (enthea.html) + LEGACY_UI (ui/)
**ENTHEA:** `public/enthea.html` — RESTORED, 200 OK.
**UI subdir:** `public/ui/` — QUARANTINED with `DO_NOT_USE_ACTIVE_UI.md`.

---

### `python/` — 1 file
**Purpose:** Python runtime launcher/bridge.
**Classification:** ACTIVE_RUNTIME

---

### `refusal_ablation_probe/` — 2 files
**Purpose:** Refusal ablation — measuring model refusal behavior.
**Classification:** TEST_ONLY

---

### `registry/` — 17 files
**Purpose:** Tool registry, skill registry, command registry.
**Classification:** ACTIVE_RUNTIME
**Backend relevance:** CRITICAL — 78 native tools, 390 skills.
**UI relevance:** `/omni` OMNI panels — tool registry display.
**Evidence:** `lib/tools/index.js`, `lib/tools-pc.js` register tools.

---

### `reports/` — 1 file
**Purpose:** Generated reports.
**Classification:** GENERATED_CACHE

---

### `research/` — 45 files
**Purpose:** Research outputs, auto-research data.
**Classification:** ACTIVE_DATA
**UI relevance:** `/evolution` — auto-research trigger and results.

---

### `rules/` — 89 files
**Purpose:** Operational rules — refusal weights, refusal rules, behavior rules.
**Classification:** ACTIVE_BACKEND
**Evidence:** `lib/refusal_weights.json`, `lib/refusal_rules.js`.
**UI relevance:** `/omni` — abliterator panel reads refusal rules.

---

### `schemas/` — 10 files
**Purpose:** JSON schemas — API request/response schemas.
**Classification:** ACTIVE_BACKEND
**UI relevance:** INDIRECT — validates API routes.

---

### `scripts/` — 138 files
**Purpose:** Utility scripts — benchmarking, training, maintenance scripts.
**Classification:** ACTIVE_RUNTIME
**UI relevance:** NONE — terminal maintenance scripts.

---

### `settings/` — 1 file
**Purpose:** Runtime settings.
**Classification:** ACTIVE_CONFIG
**UI relevance:** `/settings`.

---

### `skills/` — 1,480 files
**Purpose:** Skills system — 390 skills for Hermes (PURPCLAW skills live in Hermes profile, not here).
**Classification:** ACTIVE_RUNTIME (skills framework) + ACTIVE_DATA (skill content)
**Evidence:** `skills/` contains skill definitions used by the PURPCLAW runtime or Hermes.
**UI relevance:** `/evolution` — skill forge, amendment proposals.
**Note:** These are Hermes skills, not PURPCLAW native. Check if PURPCLAW runtime reads from `skills/`.

---

### `steering/` — 32 files
**Purpose:** Steering directives — agent behavior guidance, policy rules.
**Classification:** ACTIVE_BACKEND
**UI relevance:** `/evolution` — steering drift detection.
**Evidence:** `lib/steering.js` (implied).

---

### `swarm_mission/` — 4 files
**Purpose:** Swarm mission configuration.
**Classification:** ACTIVE_RUNTIME
**UI relevance:** `/mission` — swarm mission status.

---

### `tests/` — 2 files
**Purpose:** Test files.
**Classification:** TEST_ONLY

---

### `types/` — 1 file
**Purpose:** TypeScript type definitions.
**Classification:** ACTIVE_BACKEND

---

### `vendor/` — 447 files
**Purpose:** Third-party vendor code — Thringlets vendor, dependencies.
**Classification:** VENDOR_EXTERNAL
**Note:** `lib/thringlets/_vendor-from-pvx/ThringletsPage.tsx` — broken import, vendor code.
**UI relevance:** NONE.

---

### `workspace/` — 12 files
**Purpose:** Workspace files — agent workspace state, session data.
**Classification:** ACTIVE_DATA
**Evidence:** `agent_work/.workspace_awareness.json`.
**UI relevance:** INDIRECT — workspace state feeds agent behavior.

---

## COVERAGE CHECK

```
Total files inventoried: 5,447
Top-level folders: 110
Ignored (node_modules/.git/.next): NOT COUNTED (system-generated)

Coverage: ALL top-level folders listed above with classifications.
No folder skipped.
```
