# FULL REPO ROOT STRUCTURE — 2026-06-30

Tree view of the complete PURPCLAW root. Every entry shown. Generated from FULL_REPO_FILE_INVENTORY.csv.

**Total: 5,447 files across 110 top-level folders/entries**

```
PURPCLAW/
├── .env/                               [SECRET_FILE — DO NOT SCAN]
├── .env.example/                       [ACTIVE_CONFIG — env template]
├── .env.nvidia/                        [ACTIVE_CONFIG — NVIDIA env]
├── .eslintignore                       [ACTIVE_CONFIG]
├── .eslintrc.json                      [ACTIVE_CONFIG]
├── .robot_shell_probe.js               [TEST_ONLY — debug probe]
├── .robot_smoke.log                    [TEST_ONLY — smoke results]
├── .robot_tools_live.md                [ACTIVE_DOCS — live tools]
├── .smoke_report.json                  [TEST_ONLY]
│
├── AGENT.md                            [ACTIVE_DOCS]
├── CHANGELOG.md                        [ACTIVE_DOCS]
├── CLAUDE.md                           [ACTIVE_DOCS — Claude Code instructions]
├── LAUNCH.md                           [ACTIVE_DOCS]
├── LICENSE                             [ACTIVE_DOCS — MIT]
├── QUICKSTART.md                       [ACTIVE_DOCS]
├── README.md                           [ACTIVE_DOCS]
├── SECURITY.md                         [ACTIVE_DOCS]
│
├── DreamTask/                          [ACTIVE_DOCS — DreamTask decomposition]
│   └── DREAMTASK.md
│
├── STRESS/                             [ACTIVE_RUNTIME — adversarial testing]
│   ├── GOOSE/                         [adversarial test runner]
│   ├── bee/                           [test runner]
│   ├── bunny/
│   ├── dragon/
│   ├── hawk/
│   ├── jellyfish/
│   ├── lemur/
│   ├── moth/
│   ├── owl/
│   ├── panda/
│   ├── phoenix/
│   ├── rabbit/
│   ├── raven/
│   ├── robot/
│   ├── shark/
│   ├── spider/
│   ├── benchmark/                     [benchmark harness]
│   ├── harness/                       [test harness]
│   ├── STRESS.md
│   └── [other test runners]
│
├── TASKS/                              [ACTIVE_DATA — task queue]
│   ├── [task files]
│   └── [task JSON records]
│
├── _api-mega-list/                     [ACTIVE_DOCS — API reference by division]
│   ├── CREATIVE/
│   ├── ENGINEERING/
│   ├── INFRASTRUCTURE/
│   ├── INTELLIGENCE/
│   ├── MANAGEMENT/
│   ├── MEDIA_OPS/
│   ├── OPERATIONS/
│   ├── SCIENCE/
│   ├── SECURITY/
│   └── _index.json
│
├── _scratch/                           [TRASH_OR_DEPRECATED — wipe safe]
│   ├── [ephemeral experiment files]
│   └── [temp work]
│
├── ablation_probes/                    [TEST_ONLY — ablation studies]
│   └── [probe definitions]
│
├── agent_work/                         [ACTIVE_RUNTIME — 1,120 files]
│   ├── GOOSE/
│   ├── SCIENTIST/
│   ├── bee/
│   ├── bunny/
│   ├── dragon/
│   ├── hawk/
│   ├── mushroom/
│   ├── octopus/
│   ├── panda/
│   ├── rabbit/
│   ├── raven/
│   ├── robot/
│   ├── shark/
│   ├── swarm/
│   ├── bee/
│   ├── axolotl/
│   ├── _snapshots/
│   ├── _agentloop_err.log
│   ├── awaken/
│   ├── benchmark/
│   ├── approvals.jsonl
│   ├── approval_requests.jsonl
│   ├── apih_*/                        [API harness job dirs]
│   ├── .pool_index.json
│   ├── .gate_pipeline_state.json
│   ├── .idle_engine_state.json
│   ├── .workspace_awareness.json
│   └── [agent session/state files]
│
├── agents/                             [ACTIVE_RUNTIME — 45 files]
│   ├── AGENT_REGISTRY.json            [35+ agents, 9 divisions]
│   ├── AGENT_PROFILES.json
│   ├── divisions/
│   └── [agent manifest/profile files]
│
├── apis for agents/                    [ACTIVE_DOCS — API surface for agents]
│   ├── CREATIVE/
│   ├── ENGINEERING/
│   └── [category folders]
│
├── app/                                [ACTIVE_UI — 209 files]
│   ├── api/                           [79 API routes]
│   │   ├── awaken/
│   │   ├── chat/
│   │   ├── eventbus/
│   │   ├── governance/
│   │   ├── harness/
│   │   ├── kernel/
│   │   ├── llm/
│   │   ├── manifest/
│   │   ├── memory/
│   │   ├── mission-data/
│   │   ├── mochi/
│   │   ├── omnicode/
│   │   ├── providers/
│   │   ├── services/
│   │   ├── sessions/
│   │   ├── setup/
│   │   ├── spine-health/
│   │   ├── stack-whoami/
│   │   ├── thringlets/
│   │   ├── tower/
│   │   ├── trace/
│   │   └── [other routes]
│   ├── components/
│   │   ├── CockpitShell.tsx           [CANONICAL SHELL — P7]
│   │   ├── [other components]
│   │   └── MissionControl.tsx         [BARE PANEL — P7]
│   ├── hooks/
│   │   ├── useMissionData.ts
│   │   ├── useAgentEvents.ts
│   │   ├── useStream.ts
│   │   └── [other hooks]
│   ├── mission/
│   │   └── page.tsx                  [BARE — MissionControl only]
│   ├── awaken/
│   │   └── page.tsx                  [CockpitShell wrapped]
│   ├── mochi/
│   │   └── page.tsx                  [CockpitShell wrapped]
│   ├── memory/
│   │   └── page.tsx
│   ├── providers/
│   │   └── page.tsx
│   ├── pipeline/
│   │   └── page.tsx
│   ├── evolution/
│   │   └── page.tsx
│   ├── omni/
│   │   └── page.tsx
│   ├── agents/
│   │   └── page.tsx
│   ├── system-map/
│   │   └── page.tsx
│   ├── settings/
│   │   └── page.tsx
│   ├── spine/
│   │   └── page.tsx                  [redirect → /mission]
│   ├── public/
│   │   ├── ui/                      [QUARANTINED — DO NOT USE]
│   │   └── [other static assets]
│   ├── layout.tsx                    [CockpitShell — P7 canonical]
│   └── not-found.tsx                 [PURPCLAW themed]
│
├── archive/                            [LEGACY_UI — donor/reference]
│   ├── ui-shadow-2026-06-22/         [ENTHEA source — RESTORED]
│   │   └── enthea.html               [→ public/enthea.html]
│   ├── legacy-ui/                    [old UI variants]
│   └── [other archived files]
│
├── bin/                                [ACTIVE_RUNTIME — 6 files]
│   ├── purpclaw.js                   [CLI entry point]
│   └── [other bin scripts]
│
├── companion-chorus/                   [ACTIVE_BACKEND — 15 files]
│   └── [companion swarm coordination]
│   [UI GAP: chorus NOT exposed in /mochi]
│
├── components/                         [LEGACY_UI — root-level old components]
│   └── [old standalone React — check vs app/components/]
│
├── config/                             [ACTIVE_CONFIG — 2 files]
│
├── contexts/                           [ACTIVE_UI — React contexts]
│   └── [session/theme contexts]
│
├── data/                               [ACTIVE_DATA — 1 file]
│
├── deploy/                             [ACTIVE_RUNTIME — 5 files]
│   └── [deployment scripts]
│
├── divisions/                          [ACTIVE_RUNTIME — 11 files]
│   ├── CREATIVE/
│   ├── ENGINEERING/
│   ├── INFRASTRUCTURE/
│   ├── INTELLIGENCE/
│   ├── MANAGEMENT/
│   ├── MEDIA_OPS/
│   ├── OPERATIONS/
│   ├── SCIENCE/
│   └── SECURITY/
│
├── docs/                               [ACTIVE_DOCS — 1,059 files]
│   ├── audit/                        [P7 audit docs]
│   │   ├── FULL_REPO_FOLDER_INVENTORY_2026-06-30.md
│   │   ├── FULL_REPO_FILE_INVENTORY_2026-06-30.csv
│   │   ├── UI_SURFACE_INVENTORY_2026-06-30.md
│   │   ├── BACKEND_CAPABILITY_INVENTORY_2026-06-30.md
│   │   ├── UI_RELEVANCE_CLASSIFICATION_2026-06-30.md
│   │   └── UI_CONSOLIDATION_PASS_2026-06-30.md
│   ├── design/                       [P7 design docs]
│   │   ├── UI_BACKEND_CAPABILITY_MAP_2026-06-30.md
│   │   ├── UI_FEATURE_MERGE_MATRIX_2026-06-30.md
│   │   ├── CANONICAL_PURPCLAW_UI_MAP_2026-06-30.md
│   │   └── UI_EXPOSURE_COVERAGE_MATRIX_2026-06-30.md
│   ├── archive/
│   └── spec/
│
├── eval/                               [TEST_ONLY — 18 files]
│   └── [evaluation harness]
│
├── hooks/                             [ACTIVE_UI — 13 files]
│   └── [React hooks]
│
├── infra/                             [ACTIVE_CONFIG — 11 files]
│   └── [Docker, monitoring configs]
│
├── lib/                               [ACTIVE_BACKEND — 314 files]
│   ├── llm-provider.js               [Multi-provider LLM routing]
│   ├── agent-loop.js                 [Agent execution loop]
│   ├── memory-client.js               [Cognitive spine client]
│   ├── tools/
│   │   ├── index.js                  [28 native tools]
│   │   └── tools-pc.js               [49 native tools]
│   ├── cognitive_spine.py             [:7880 — FAISS vector]
│   ├── autoDream.py                   [Dream research]
│   ├── memory_matrix_v2.py            [Memory matrix]
│   ├── spring_doctrine.py              [Memory rules]
│   ├── symbolic_rules_engine.py        [Symbolic reasoning]
│   ├── modal_logic_engine.py           [Modal logic]
│   ├── neuro_symbolic_bridge.py        [Neuro-symbolic]
│   ├── autonomous_diagnostics.py       [Self-diagnostics]
│   ├── refusal_weights.json            [Refusal weights]
│   ├── api-mega-list-assignments.json  [Category→Division map]
│   ├── unified_api.js                  [Main HTTP :7780]
│   ├── agent_tower.js                  [:7790 — Agent tower]
│   ├── orchestrator.js                 [:7784 — Orchestrator]
│   ├── swarm_coordinator.js            [Swarm coordination]
│   ├── voice_bridge_7792.js            [Voice bridge]
│   ├── harness/                        [Harness service]
│   │   ├── engine.js
│   │   └── [other harness files]
│   ├── thringlets/                    [Mochi companion]
│   │   ├── colony.ts
│   │   └── _vendor-from-pvx/          [vendor — broken import]
│   └── [other lib files]
│
├── logs/                              [ACTIVE_DATA — 2 files]
│
├── models/                            [ACTIVE_BACKEND — 1 file]
│   └── [model definitions]
│
├── mochi/                            [DONOR_UI — 24 files]
│   ├── ThringletsPage.tsx            [BROKEN — wrong import]
│   ├── [companion state/memory files]
│   [GAP: companion-chorus NOT wired to /mochi]
│
├── pocket/                           [ACTIVE_RUNTIME — 12 files]
│   ├── spend-config.json             [SpendGate config]
│   └── [pocket runtime files]
│
├── podcast_studio/                   [DONOR_UI — 15 files]
│   └── [podcast creation — not wired]
│
├── prompts/                          [ACTIVE_BACKEND — 17 files]
│   └── [prompt templates]
│
├── public/                           [ACTIVE_UI — 45 files]
│   ├── enthea.html                   [RESTORED — WebGL visualizer]
│   └── ui/                          [QUARANTINED — DO NOT USE]
│       └── DO_NOT_USE_ACTIVE_UI.md
│
├── python/                           [ACTIVE_RUNTIME — 1 file]
│
├── registry/                         [ACTIVE_RUNTIME — 17 files]
│   ├── tools/
│   │   ├── registry.json
│   │   └── [tool definitions]
│   ├── skills/
│   │   └── [skill definitions]
│   └── commands/
│       └── [command registry]
│
├── research/                        [ACTIVE_DATA — 45 files]
│   └── [auto-research outputs]
│   [UI GAP: results NOT shown in /evolution]
│
├── rules/                           [ACTIVE_BACKEND — 89 files]
│   ├── refusal_weights.json
│   ├── refusal_rules.js
│   └── [behavior rules]
│   [UI GAP: editor NOT built in /omni]
│
├── schemas/                         [ACTIVE_BACKEND — 10 files]
│   └── [JSON schemas]
│
├── scripts/                         [ACTIVE_RUNTIME — 138 files]
│   ├── benchmark-providers.js
│   ├── training/
│   └── [maintenance/utility scripts]
│
├── settings/                        [ACTIVE_CONFIG — 1 file]
│
├── skills/                          [ACTIVE_DATA — 1,480 files]
│   └── [390 skills for Hermes runtime]
│   [UI GAP: skill forge NOT wired in /evolution]
│
├── steering/                       [ACTIVE_BACKEND — 32 files]
│   └── [steering directives]
│   [UI GAP: drift watcher NOT wired in /evolution]
│
├── swarm_mission/                  [ACTIVE_RUNTIME — 4 files]
│
├── tests/                         [TEST_ONLY — 2 files]
│
├── types.ts                       [ACTIVE_BACKEND — shared types]
│
├── unified_api.js                  [ACTIVE_RUNTIME — main :7780 server]
│
├── vendor/                        [VENDOR_EXTERNAL — 447 files]
│   └── [third-party dependencies]
│
├── workspace/                      [ACTIVE_DATA — 12 files]
│   └── [workspace state]
│
├── agent_routing_matrix.js         [ACTIVE_BACKEND]
├── agent_score.js                  [ACTIVE_BACKEND]
├── agent_tower.js                  [ACTIVE_RUNTIME — :7790]
├── autoDream.py                    [ACTIVE_BACKEND]
├── autonomous_diagnostics.py        [ACTIVE_BACKEND]
├── boot.js                         [ACTIVE_RUNTIME]
├── cognitive_spine.py               [ACTIVE_BACKEND — :7880]
├── companion_swarm.js               [ACTIVE_BACKEND]
├── ecosystem.config.js              [ACTIVE_CONFIG — PM2]
├── gatekeeper.js                   [ACTIVE_RUNTIME]
├── harness_service.js              [ACTIVE_RUNTIME]
├── healthcheck.js                  [ACTIVE_RUNTIME]
├── memory_matrix.py                [LEGACY_BACKEND]
├── memory_matrix_v2.py             [ACTIVE_BACKEND]
├── metrics_aggregator.js            [ACTIVE_BACKEND]
├── modal_logic_engine.py           [ACTIVE_BACKEND]
├── neuro_symbolic_bridge.py        [ACTIVE_BACKEND]
├── orchestrator.js                 [ACTIVE_RUNTIME — :7784]
├── pool_service.js                 [ACTIVE_RUNTIME]
├── service_registry.js             [ACTIVE_RUNTIME]
├── simple_bridge.py               [ACTIVE_BACKEND]
├── spring_doctrine.py              [ACTIVE_BACKEND]
├── swarm_coordinator.js           [ACTIVE_RUNTIME]
├── swarm_scheduler.js             [ACTIVE_RUNTIME]
├── symbolic_rules_engine.py       [ACTIVE_BACKEND]
├── task_decomposer.js            [ACTIVE_BACKEND]
├── unified_bridge.js             [ACTIVE_BACKEND]
├── unified_eventbus.js           [ACTIVE_BACKEND]
├── unified_state.js              [ACTIVE_BACKEND]
├── vision_monitor.js              [ACTIVE_BACKEND]
├── voice_bridge_7792.js           [ACTIVE_RUNTIME]
├── voice_coordinator.js           [ACTIVE_RUNTIME]
├── voice_ingress.js               [ACTIVE_BACKEND]
├── voice_stt.py                   [ACTIVE_BACKEND]
├── worker_service.js             [ACTIVE_RUNTIME]
├── yolo_service.py              [ACTIVE_BACKEND]
├── package.json                   [ACTIVE_CONFIG]
├── package-lock.json             [VENDOR_EXTERNAL]
├── tsconfig.json                 [ACTIVE_CONFIG]
├── next-env.d.ts                 [GENERATED_CACHE]
├── tsconfig.tsbuildinfo           [GENERATED_CACHE]
├── memory_archive.json.gz         [ACTIVE_DATA — archived memory]
├── memory_archive.json.gz.bak     [ACTIVE_DATA]
├── purpclaw.config.example.json  [ACTIVE_CONFIG]
├── agent_tower.js               [ACTIVE_RUNTIME]
├── memory_matrix.py             [LEGACY_BACKEND]
└── [other root-level JS/PY files]
```

## EXCLUDED FROM SCAN (intentionally)

| Path | Count | Reason |
|------|-------|--------|
| `node_modules/` | — | NPM vendor dependencies |
| `.git/` | — | Git repository data |
| `.next/` | — | Next.js build cache |
| `__pycache__/` | — | Python bytecode cache |

These are listed here as exclusion proof — they exist but are intentionally not inventoried as they contain no PURPCLAW source code.
