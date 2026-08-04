# PURPCLAW — MISSING FILE MANIFEST

Generated 2026-08-04T17:54:37Z after the 2026-08-04 re-org.

**Incident:** the core runtime does not load. `require('./lib/tool-runtime.js')` fails with
`Cannot find module '../child-registry'`. 162 local requires no longer resolve.

**Recovery avenues already checked and exhausted:**

- Recycle bin (E:) — holds only tidy-up: `.tmp*`, `.trash`, `test_*.js`, `debug_*.cjs`, LICENSE. None of the missing modules.
- VS Code / Cursor / Windsurf local history — empty / not present.
- `archive/` — contains only DO_NOT_INSTALL_HERE.md.
- git — these files were UNTRACKED, so there is no history to restore from.
- Project-wide and sibling-project search — no copies.

**Still untried (needs admin):** Volume Shadow Copy / Previous Versions.
Right-click the PURPCLAW folder in Explorer, Properties, Previous Versions.

**Already recovered** (from the ChatGPT library, in the 2026-08-04 evidence ZIP):

- `worker_service.js` — 350 lines, sha256 verified, syntax OK
- `orchestrator.js` — 2026-06-28 candidate extracted from PURPCLAW_HIVEMIND_RUNTIME_PATCH.diff

Note: `worker_service.js` cannot run yet — it requires `lib/runtime/telemetry-console`
and `lib/worker-auth.js`, both of which are also missing.

```
scanned 262 source files
unresolved local requires: 162

refs  missing target                                referenced by
10    lib/child-registry                            bin/purpclaw.js, lib/commands/bigboss.js
6     lib/schema-validator                          lib/agent-component.js, lib/agent-gateway.js
5     lib/whoami                                    bin/purpclaw.js, lib/agent-loop.js
5     lib/mcp                                       lib/agent-gateway.js, lib/api-harness-kernel.js
5     lib/permission-manager                        lib/agent-gateway.js, lib/commands/ask.js
4     lib/governance                                lib/api-harness-kernel.js, lib/tool-gate.js
3     lib/guardrail-manager                         lib/agent-component.js, lib/agent-gateway.js
3     lib/provider-registry                         lib/agent-gateway.js, lib/commands/ask.js
3     lib/checkpoint-manager                        lib/agent-gateway.js, lib/commands/ask.js
3     lib/events                                    lib/agent-loop.js, lib/memory-client.js
2     lib/cost-ledger                               bin/purpclaw.js, lib/tools/index.js
2     lib/steering-router                           bin/purpclaw.js, unified_api.js
2     lib/job-chain                                 bin/purpclaw.js, lib/api-harness-kernel.js
2     lib/proof-ledger                              bin/purpclaw.js, unified_api.js
2     lib/session-store                             bin/purpclaw.js, lib/agent-loop.js
2     lib/retrieval-engine                          lib/agent-component.js, lib/agent-gateway.js
2     lib/messaging-registry                        lib/agent-gateway.js, lib/messaging-runtime.js
2     lib/user-feedback                             lib/agent-loop.js, lib/self-evolution-loop.js
2     lib/cognitive-client                          lib/agent-loop.js, lib/doctor.js
2     lib/file-watcher                              lib/agent-loop.js, lib/commands/watch.js
2     lib/pulse                                     lib/agent-loop.js, unified_api.js
2     lib/pipeline-registry                         lib/agent-router.js, unified_api.js
2     lib/job-contract                              lib/api-harness-kernel.js, lib/harness/engine.js
2     lib/training-buffer                           lib/api-harness-kernel.js, lib/commands/training.js
2     lib/awaken/awaken-state                       lib/awaken/awaken-preflight.js, lib/commands/awaken.js
2     lib/memory-consistency                        lib/commands/bigboss.js, lib/tools/index.js
2     lib/harness/benchmark                         lib/commands/harness.js, lib/harness/engine.js
2     lib/harvest/crawler                           lib/commands/harvest.js, unified_api.js
2     lib/harvest/extractors                        lib/commands/harvest.js, unified_api.js
2     lib/harvest/indexer                           lib/commands/harvest.js, unified_api.js
2     lib/spend-gate                                lib/commands/pocket.js, lib/llm-provider.js
2     lib/scheduler/nl-cron                         lib/commands/schedule.js, lib/cron-manager.js
2     lib/spine/session-store                       lib/core/work-engine.js, unified_api.js
2     lib/workflow-state                            lib/graph-runtime.js, lib/workflow-manager.js
2     agent_score.js                                lib/harness/engine.js, swarm_coordinator.js
2     lib/system-manifest                           lib/tools/index.js, unified_api.js
2     podcast_studio/shared_log                     podcast_studio/podcast_runner.js, podcast_studio/turn_manager.js
2     lib/runtime/telemetry-console                 pool_service.js, unified_api.js
1     .p0b_tests/lib/tool-runtime                   .p0b_tests/test_bypass_closure.js
1     .p0b_tests/tools                              .p0b_tests/test_bypass_closure.js
1     .p0b_tests/tools/index                        .p0b_tests/test_bypass_closure.js
1     companion_swarm.js                            agent_tower.js
1     agent_routing_matrix                          agent_tower.js
1     apps/lib/llm-provider                         apps/companion-chorus/src/minimax.js
1     lib/deep-audit                                bin/purpclaw.js
1     lib/embeddings                                bin/purpclaw.js
1     lib/release-sign                              bin/purpclaw.js
1     lib/profile-router                            bin/purpclaw.js
1     lib/agents/archetypes                         bin/purpclaw.js
1     lib/usage-pricing                             bin/purpclaw.js
1     lib/trace-store                               bin/purpclaw.js
1     lib/insight                                   bin/purpclaw.js
1     lib/purpflow                                  bin/purpclaw.js
1     lib/cloud-sync                                bin/purpclaw.js
1     lib/studio                                    bin/purpclaw.js
1     lib/erosion                                   bin/purpclaw.js
1     lib/session-portability                       bin/purpclaw.js
1     lib/profile-manager                           lib/agent-gateway.js
1     lib/delegation-manager                        lib/agent-gateway.js
1     lib/repo-map                                  lib/agent-gateway.js
1     lib/verification-runner                       lib/agent-gateway.js
1     lib/output-contract                           lib/agent-gateway.js
1     lib/run-context                               lib/agent-gateway.js
1     lib/usage-limits                              lib/agent-gateway.js
1     lib/component-pipeline                        lib/agent-gateway.js
1     lib/goal-controller                           lib/agent-gateway.js
1     lib/recipe-manager                            lib/agent-gateway.js
1     lib/execution-runtime                         lib/agent-gateway.js
1     lib/prompt-builder                            lib/agent-loop.js
1     lib/context-compressor                        lib/agent-loop.js
1     lib/continuity                                lib/agent-loop.js
1     lib/priority-steer                            lib/agent-loop.js
1     lib/verification-gate                         lib/agent-loop.js
1     lib/phase-router                              lib/agent-loop.js
1     lib/idle-engine                               lib/agent-loop.js
1     lib/runtime/privacy-policy                    lib/agent-loop.js
1     lib/omnicode-bridge                           lib/api-harness-kernel.js
1     lib/deep-research-group                       lib/api-harness-kernel.js
1     lib/user-commands                             lib/commands/ask.js
1     lib/config-loader                             lib/commands/ask.js
1     lib/awaken/awaken-permissions                 lib/commands/awaken.js
1     lib/awaken/awaken-loop                        lib/commands/awaken.js
1     lib/awaken/awaken-events                      lib/commands/awaken.js
1     lib/mochi                                     lib/commands/buddy.js
1     lib/mochi-sprites                             lib/commands/buddy.js
1     lib/business/operations                       lib/commands/business.js
1     lib/business/twilio                           lib/commands/business.js
1     lib/business/store                            lib/commands/business.js
1     lib/vector                                    lib/commands/code.js
1     lib/crew                                      lib/commands/crew.js
1     lib/drift-watcher.js                          lib/commands/drift.js
1     lib/evolution/skill-forge                     lib/commands/evolve.js
1     lib/file-index                                lib/commands/find.js
1     parity/cli/router.js                          lib/commands/help.js
1     lib/identity                                  lib/commands/identity.js
1     lib/liveforge                                 lib/commands/liveforge.js
1     lib/marketplace                               lib/commands/marketplace.js
1     parity/memory/scoped.js                       lib/commands/memory.js
1     lib/mycelium                                  lib/commands/mycelium.js
1     lib/oracle.js                                 lib/commands/oracle.js
1     lib/pocket-vault                              lib/commands/pocket.js
1     lib/telemetry                                 lib/commands/pocket.js
1     lib/pocket-updater                            lib/commands/pocket.js
1     lib/agent-registry                            lib/commands/roster.js
1     lib/core/provider-status                      lib/commands/setup.js
1     lib/skills-deps                               lib/commands/skills.js
1     lib/skills-guard                              lib/commands/skills.js
1     lib/skills-hub                                lib/commands/skills.js
1     lib/skill-usage                               lib/commands/skills.js
1     lib/spinebus                                  lib/commands/spinebus.js
1     lib/team-router                               lib/commands/team.js
1     lib/runtime/pipeline-telemetry                lib/commands/telemetry.js
1     lib/weatherman.js                             lib/commands/weather.js
1     lib/core/lib/core/work-engine                 lib/core/work-engine.js
1     lib/timeline                                  lib/donor-archaeology.js
1     lib/harness/lib/harness/engine                lib/harness/engine.js
1     lib/canonical-memory-sync                     lib/harness/engine.js
1     lib/accuracy-fish                             lib/harness/engine.js
1     lib/kanban/config                             lib/kanban/db-schema.js
1     lib/lib/llm-provider                          lib/llm-provider.js
1     lib/lib/memory-client                         lib/memory-client.js
1     lib/omni/omnicode-adapter                     lib/omni/truth-scanner.js
1     lib/plugin-isolator                           lib/plugin-manager.js
1     lib/signature-adapter                         lib/program-optimizer.js
1     lib/runtime/lib/runtime/autonomy-runner       lib/runtime/autonomy-runner.js
1     lib/runtime/computer-use                      lib/runtime/autonomy-runner.js
1     lib/lib/screen-look                           lib/screen-look.js
1     lib/workspace-awareness.js                    lib/screen-look.js
1     lib/pty                                       lib/tools/index.js
1     lib/tool-cache                                lib/tools/index.js
1     lib/parseltongue                              lib/tools/index.js
1     lib/autotune                                  lib/tools/index.js
1     lib/stm                                       lib/tools/index.js
1     lib/imagegen/video_engine                     lib/tools/index.js
1     lib/user-agents                               lib/tools/index.js
1     lib/pxpipe                                    lib/tools/index.js
1     lib/tools-parity                              lib/tools/index.js
1     lib/tools-gui                                 lib/tools/index.js
1     lib/tools/skills-registry                     lib/tools/index.js
1     lib/tools-remotion                            lib/tools/index.js
1     lib/tools/web-search-rate-limit               lib/tools/index.js
1     packages/harness-claude/result-schema         packages/harness-claude/index.js
1     packages/harness-claude/memory-audit          packages/harness-claude/index.js
1     packages/harness-claude/task-schema           packages/harness-claude/index.js
1     packages/harness-core/packages/harness-core   packages/harness-core/index.js
1     packages/memory/context/memory-client         packages/memory/context/scoped-memory.js
1     podcast_studio/topic_picker                   podcast_studio/podcast_runner.js
1     podcast_studio/tts                            podcast_studio/podcast_runner.js
1     task_decomposer.js                            swarm_coordinator.js
1     lib/context-packet.js                         swarm_coordinator.js
1     lib/self-context.js                           swarm_coordinator.js
1     lib/cognitive-client.js                       swarm_coordinator.js
1     lib/hooks/execution-envelope                  tests/hooks/execution-envelope.probe.js
1     digital_shaman.js                             unified_api.js
1     shaman_evaluator.js                           unified_api.js
1     lib/spine/envelope                            unified_api.js
1     lib/spine/contract                            unified_api.js
1     ../companion_swarm.js                         unified_api.js
1     lib/narrator/eventbus-bridge                  unified_api.js
1     lib/spine-shim                                unified_api.js
1     lib/output-vault                              unified_api.js
1     shaman_prompts.js                             unified_api.js
```

## TRIAGE — hard blockers vs optional (added 18:20Z)

Git recovery is IMPOSSIBLE for these. Verified: `git rev-list --all -- <path>` returns
nothing for child-registry, schema-validator and events — **no commit ever touched them**.
`lib/memory-client.js` came back only because it *was* tracked.

```
HARD (crash on load): 111
SOFT (degrade to null): 43

=== BLOCKERS — these must be recovered or stubbed ===
 11  lib/child-registry                      bin/purpclaw.js:64, lib/commands/bigboss.js:11
  6  lib/schema-validator                    lib/agent-component.js:1, lib/agent-gateway.js:23
  4  lib/permission-manager                  lib/agent-gateway.js:331, lib/commands/ask.js:434
  4  lib/governance                          lib/api-harness-kernel.js:53, lib/tool-gate.js:22
  4  lib/pulse                               unified_api.js:59, unified_api.js:3449
  3  lib/trace-store                         bin/purpclaw.js:5695, bin/purpclaw.js:5747
  3  lib/erosion                             bin/purpclaw.js:7770, bin/purpclaw.js:7782
  3  lib/mcp                                 lib/agent-gateway.js:14, lib/commands/ask.js:101
  3  lib/recipe-manager                      lib/agent-gateway.js:403, lib/agent-gateway.js:404
  3  lib/events                              lib/agent-loop.js:33, lib/memory-client.js:24
  3  lib/awaken/awaken-loop                  lib/commands/awaken.js:96, lib/commands/awaken.js:178
  3  lib/pxpipe                              lib/tools/index.js:1361, lib/tools/index.js:1378
  2  lib/whoami                              bin/purpclaw.js:1161, lib/commands/tour.js:3
  2  lib/steering-router                     bin/purpclaw.js:5739, bin/purpclaw.js:5817
  2  lib/job-chain                           bin/purpclaw.js:5765, bin/purpclaw.js:5866
  2  lib/studio                              bin/purpclaw.js:7651, bin/purpclaw.js:7696
  2  lib/provider-registry                   lib/agent-gateway.js:6, lib/plugin-manager.js:106
  2  lib/checkpoint-manager                  lib/agent-gateway.js:10, lib/tool-runtime.js:10
  2  lib/messaging-registry                  lib/agent-gateway.js:15, lib/messaging-runtime.js:4
  2  lib/guardrail-manager                   lib/agent-gateway.js:22, lib/tool-runtime.js:9
  2  lib/execution-runtime                   lib/agent-gateway.js:407, lib/agent-gateway.js:409
  2  lib/job-contract                        lib/api-harness-kernel.js:52, lib/harness/engine.js:52
  2  lib/memory-consistency                  lib/commands/bigboss.js:275, lib/tools/index.js:931
  2  lib/file-index                          lib/commands/find.js:13, lib/commands/find.js:82
  2  lib/harness/benchmark                   lib/commands/harness.js:427, lib/commands/harness.js:451
  2  lib/harvest/crawler                     lib/commands/harvest.js:8, unified_api.js:3362
  2  lib/harvest/extractors                  lib/commands/harvest.js:9, unified_api.js:3371
  2  lib/identity                            lib/commands/identity.js:18, lib/commands/identity.js:157
  2  lib/scheduler/nl-cron                   lib/commands/schedule.js:102, lib/cron-manager.js:5
  2  lib/weatherman.js                       lib/commands/weather.js:4, lib/commands/weather.js:7
  2  lib/workflow-state                      lib/graph-runtime.js:1, lib/workflow-manager.js:2
  2  lib/tool-cache                          lib/tools/index.js:451, lib/tools/index.js:516
  2  lib/parseltongue                        lib/tools/index.js:807, lib/tools/index.js:850
  2  lib/autotune                            lib/tools/index.js:822, lib/tools/index.js:851
  2  podcast_studio/shared_log               podcast_studio/podcast_runner.js:6, podcast_studio/turn_manager.js:6
  2  lib/runtime/telemetry-console           pool_service.js:3, unified_api.js:17
  2  lib/spine/envelope                      unified_api.js:414, unified_api.js:4367
  2  lib/spine/contract                      unified_api.js:415, unified_api.js:4368
  1  .p0b_tests/lib/tool-runtime             .p0b_tests/test_bypass_closure.js:111
  1  .p0b_tests/tools                        .p0b_tests/test_bypass_closure.js:160
  1  lib/deep-audit                          bin/purpclaw.js:1053
  1  lib/embeddings                          bin/purpclaw.js:1116
  1  lib/release-sign                        bin/purpclaw.js:1186
  1  lib/insight                             bin/purpclaw.js:5833
  1  lib/proof-ledger                        bin/purpclaw.js:5897
  1  lib/purpflow                            bin/purpclaw.js:5931
  1  lib/profile-manager                     lib/agent-gateway.js:8
  1  lib/delegation-manager                  lib/agent-gateway.js:12
  1  lib/repo-map                            lib/agent-gateway.js:19
  1  lib/verification-runner                 lib/agent-gateway.js:20
  1  lib/output-contract                     lib/agent-gateway.js:26
  1  lib/run-context                         lib/agent-gateway.js:28
  1  lib/usage-limits                        lib/agent-gateway.js:29
  1  lib/retrieval-engine                    lib/agent-gateway.js:31
  1  lib/component-pipeline                  lib/agent-gateway.js:32
  1  lib/goal-controller                     lib/agent-gateway.js:361
  1  lib/prompt-builder                      lib/agent-loop.js:30
  1  lib/context-compressor                  lib/agent-loop.js:31
  1  lib/runtime/privacy-policy              lib/agent-loop.js:119
  1  lib/awaken/awaken-permissions           lib/commands/awaken.js:38
  1  lib/awaken/awaken-state                 lib/commands/awaken.js:180
  1  lib/awaken/awaken-events                lib/commands/awaken.js:227
  1  lib/mochi                               lib/commands/buddy.js:41
  1  lib/mochi-sprites                       lib/commands/buddy.js:42
  1  lib/business/operations                 lib/commands/business.js:3
  1  lib/business/twilio                     lib/commands/business.js:4
  1  lib/business/store                      lib/commands/business.js:5
  1  lib/crew                                lib/commands/crew.js:11
  1  lib/drift-watcher.js                    lib/commands/drift.js:4
  1  lib/evolution/skill-forge               lib/commands/evolve.js:46
  1  lib/harvest/indexer                     lib/commands/harvest.js:10
  1  parity/cli/router.js                    lib/commands/help.js:11
  1  lib/liveforge                           lib/commands/liveforge.js:4
  1  lib/marketplace                         lib/commands/marketplace.js:15
  1  parity/memory/scoped.js                 lib/commands/memory.js:7
  1  lib/mycelium                            lib/commands/mycelium.js:4
  1  lib/oracle.js                           lib/commands/oracle.js:4
  1  lib/pocket-vault                        lib/commands/pocket.js:339
  1  lib/spend-gate                          lib/commands/pocket.js:459
  1  lib/telemetry                           lib/commands/pocket.js:530
  1  lib/pocket-updater                      lib/commands/pocket.js:588
  1  lib/skills-deps                         lib/commands/skills.js:35
  1  lib/skills-guard                        lib/commands/skills.js:37
  1  lib/skills-hub                          lib/commands/skills.js:40
  1  lib/spinebus                            lib/commands/spinebus.js:4
  1  lib/team-router                         lib/commands/team.js:66
  1  lib/runtime/pipeline-telemetry          lib/commands/telemetry.js:3
  1  lib/training-buffer                     lib/commands/training.js:22
  1  lib/file-watcher                        lib/commands/watch.js:11
  1  lib/core/lib/core/work-engine           lib/core/work-engine.js:13
  1  lib/cognitive-client                    lib/doctor.js:153
  1  lib/timeline                            lib/donor-archaeology.js:5
  1  lib/harness/lib/harness/engine          lib/harness/engine.js:26
  1  lib/kanban/config                       lib/kanban/db-schema.js:5
  1  lib/lib/llm-provider                    lib/llm-provider.js:52
  1  lib/lib/memory-client                   lib/memory-client.js:10
  1  lib/runtime/lib/runtime/autonomy-runner lib/runtime/autonomy-runner.js:18
  1  lib/runtime/computer-use                lib/runtime/autonomy-runner.js:23
  1  lib/lib/screen-look                     lib/screen-look.js:15
  1  lib/workspace-awareness.js              lib/screen-look.js:26
  1  lib/pty                                 lib/tools/index.js:307
  1  lib/cost-ledger                         lib/tools/index.js:789
  1  lib/stm                                 lib/tools/index.js:837
  1  lib/tools/web-search-rate-limit         lib/tools/index.js:1906
  1  podcast_studio/topic_picker             podcast_studio/podcast_runner.js:8
  1  podcast_studio/tts                      podcast_studio/podcast_runner.js:9
  1  lib/hooks/execution-envelope            tests/hooks/execution-envelope.probe.js:12
  1  lib/spine/session-store                 unified_api.js:416
  1  lib/pipeline-registry                   unified_api.js:3760
  1  digital_shaman.js                       unified_api.js:4949
  1  shaman_prompts.js                       unified_api.js:4960
```
