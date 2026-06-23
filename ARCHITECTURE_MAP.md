# PURPCLAW — Full Architecture Map
_Read-only dependency graph. Root: E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW_

## Summary
- Live source files: **578** (JS/CJS/MJS + PY)
- Archived/legacy/template files (excluded from live graph): 49
- Internal wires (live→live edges): **370**
- Broken wires (live): **1**

## ⚠ Broken wires (live)
- `scripts/ecc.js` → `./lib/install-executor` (unresolved)

## 🌐 Top hubs (most depended-on)
- `lib/child-registry.js` ← 26 importers
- `lib/llm-provider.js` ← 17 importers
- `lib/paths.js` ← 10 importers
- `skills/osint-investigation/scripts/_http.py` ← 9 importers
- `lib/tools/index.js` ← 8 importers
- `skills/comfyui/scripts/_common.py` ← 8 importers
- `lib/lib/install-targets/helpers.js` ← 7 importers
- `lib/lib/utils.js` ← 7 importers
- `skills/ck/commands/shared.mjs` ← 7 importers
- `lib/memory-client.js` ← 5 importers
- `agent_score.js` ← 4 importers
- `agent_tower.js` ← 4 importers
- `lib/agent-loop.js` ← 4 importers
- `lib/harness/engine.js` ← 4 importers
- `lib/spend-gate.js` ← 4 importers
- `podcast_studio/config.js` ← 4 importers
- `podcast_studio/shared_log.js` ← 4 importers
- `service_registry.js` ← 4 importers
- `skills/watchers/scripts/_watermark.py` ← 4 importers
- `companion-chorus/src/constants.js` ← 3 importers
- `companion-chorus/src/minimax.js` ← 3 importers
- `lib/business/store.js` ← 3 importers
- `lib/evolution/mutator.js` ← 3 importers
- `lib/job-contract.js` ← 3 importers
- `lib/lib/install-manifests.js` ← 3 importers
- `lib/lib/install-state.js` ← 3 importers
- `lib/lib/install-targets/registry.js` ← 3 importers
- `lib/lib/skill-evolution/tracker.js` ← 3 importers
- `lib/lib/skill-evolution/versioning.js` ← 3 importers
- `lib/omnicode-bridge.js` ← 3 importers

## 🟢 Entry points (import others, imported by none) — 112
- `_scratch/gap-report.js`
- `_scratch/run_mission_direct.js`
- `_scratch/turbovec-pack/purpclaw_turbovec_integration/bin/purpclaw-vector-bench.js`
- `bin/purpclaw.js`
- `boot.js`
- `cognitive_spine.py`
- `companion-chorus/bridge.js`
- `companion-chorus/main.js`
- `companion-chorus/test-ai.js`
- `harness_service.js`
- `lib/__tests__/accuracy-fish/claim_extractor.test.js`
- `lib/api-harness-kernel.js`
- `lib/commands/ask.js`
- `lib/commands/business.js`
- `lib/commands/claudecode.js`
- `lib/commands/deploy.js`
- `lib/commands/evolve.js`
- `lib/commands/harness.js`
- `lib/commands/harvest.js`
- `lib/commands/heal.js`
- `lib/commands/identity.js`
- `lib/commands/open.js`
- `lib/commands/pocket.js`
- `lib/commands/safe-stop.js`
- `lib/commands/telemetry.js`
- `lib/commands/tour.js`
- `lib/commands/training.js`
- `lib/goop-playground/goop-playground.js`
- `lib/lib/install-lifecycle.js`
- `lib/lib/install/runtime.js`
- `lib/lib/observer-sessions.js`
- `lib/lib/resolve-formatter.js`
- `lib/lib/session-adapters/registry.js`
- `lib/lib/skill-evolution/index.js`
- `lib/lib/skill-improvement/amendify.js`
- `lib/llm-status.js`
- `lib/mochi-state.js`
- `lib/mochi-statusbar.js`
- `lib/mochi.js`
- `lib/omni/patch-governor.js`
- `lib/providers/registry.js`
- `lib/reasoning-loop.js`
- `lib/runtime/preprompt-compiler.js`
- `lib/scheduler/runner.js`
- `lib/self-evolution-loop.js`
- `lib/skill-bridge.js`
- `lib/supervisor.js`
- `lib/survivor_router.js`
- `lib/tools-cli-anything.js`
- `lib/tools-gui.js`
- `lib/worker-pool.js`
- `metrics_aggregator.js`
- `mochi/mochi.js`
- `orchestrator.js`
- `podcast_studio/launch.js`
- `podcast_studio/podcast_runner.js`
- `purpconsole/__main__.py`
- `purpconsole/_smoke.py`
- `purpconsole/run.py`
- `screen-manager.js`
- `scripts/delegation-status.cjs`
- `scripts/demo-factory.js`
- `scripts/model-sentinel.js`
- `scripts/panic-stop.js`
- `scripts/pm2-names.js`
- `scripts/verify-llm-fallback.cjs`
- `scripts/windows/core-host.js`
- `scripts/windows/python-service-host.js`
- `scripts/windows/tray-agent.js`
- `scripts/windows/voice-session-host.js`
- `skills/ck/commands/forget.mjs`
- `skills/ck/commands/info.mjs`
- `skills/ck/commands/init.mjs`
- `skills/ck/commands/list.mjs`
- `skills/ck/commands/migrate.mjs`
- `skills/ck/commands/resume.mjs`
- `skills/ck/commands/save.mjs`
- `skills/comfyui/scripts/auto_fix_deps.py`
- `skills/comfyui/scripts/fetch_logs.py`
- `skills/comfyui/scripts/health_check.py`
- `skills/comfyui/scripts/run_batch.py`
- `skills/comfyui/scripts/ws_monitor.py`
- `skills/google-workspace.bak/scripts/google_api.py`
- `skills/google-workspace.bak/scripts/gws_bridge.py`
- `skills/google-workspace.bak/scripts/setup.py`
- `skills/google-workspace/scripts/google_api.py`
- `skills/google-workspace/scripts/gws_bridge.py`
- `skills/google-workspace/scripts/setup.py`
- `skills/guardian/security_control_api.js`
- `skills/osint-investigation/scripts/entity_resolution.py`
- `skills/osint-investigation/scripts/fetch_courtlistener.py`
- `skills/osint-investigation/scripts/fetch_gdelt.py`
- `skills/osint-investigation/scripts/fetch_nyc_acris.py`
- `skills/osint-investigation/scripts/fetch_ofac_sdn.py`
- `skills/osint-investigation/scripts/fetch_opencorporates.py`
- `skills/osint-investigation/scripts/fetch_sec_edgar.py`
- `skills/osint-investigation/scripts/fetch_senate_ld.py`
- `skills/osint-investigation/scripts/fetch_wayback.py`
- `skills/osint-investigation/scripts/fetch_wikipedia.py`
- `skills/watchers/scripts/watch_github.py`
- `skills/watchers/scripts/watch_http_json.py`
- `skills/watchers/scripts/watch_rss.py`
- `spinUpAgent.js`
- `start_purpclaw.js`
- `swarm_scheduler.js`
- `test_memory.py`
- `thringlet_bridge.js`
- `tmux-worktree-orchestrator.js`
- `unified_api.js`
- `voice_bridge_7792.js`
- `voice_coordinator.js`
- `worker_service.js`

## ⚪ Isolated files (no imports in or out) — 291
- `_api-mega-list/API-mega-list-main/settings/fetch_apify_actors.js`
- `_api-mega-list/API-mega-list-main/settings/generate_readme_clean.js`
- `_scratch/dup_finder.py`
- `_scratch/selftest/hello.js`
- `_scratch/test_db.js`
- `_scratch/test_hud.js`
- `_scratch/test_sandbox.js`
- `_scratch/turbovec-pack/purpclaw_turbovec_integration/python/turbovec_sidecar.py`
- `_wire.js`
- `ablation_probes/refusal_weight_probe_7B.py`
- `agent_work/bee/postcss.config.mjs`
- `agent_work/blast_radius_helper.js`
- `agent_work/robot/dashboard_live_update_test.js`
- `apis for agents/settings/fetch_apify_actors.js`
- `apis for agents/settings/generate_readme_clean.js`
- `app/public/ui/app.js`
- `app/public/ui/chat-hooks.js`
- `app/public/ui/cinematic.js`
- `app/public/ui/command-palette.js`
- `app/public/ui/data-hooks.js`
- `app/public/ui/extras.js`
- `app/public/ui/panels.js`
- `app/public/ui/skyscraper.js`
- `app/public/ui/tweaks-panel.js`
- `bin/MISSION.js`
- `bin/coding-eval.js`
- `bin/model-discover.js`
- `bin/purpclaw-vector-bench.js`
- `boston_analysis.py`
- `companion-chorus/test-api.js`
- `create_db.py`
- `diag_audio.py`
- `ecosystem.config.js`
- `eslint.config.mjs`
- `eval/__init__.py`
- `eval/benches/__init__.py`
- `eval/benches/eventbus_bench.py`
- `eval/benches/governance_bench.py`
- `eval/benches/memory_bench.py`
- `eval/benches/orchestrator_bench.py`
- `eval/benches/pool_bench.py`
- `eval/harness.py`
- `eval/suites/__init__.py`
- `eval/suites/chaos.py`
- `eval/suites/regression.py`
- `eval/suites/smoke.py`
- `find_pulse.py`
- `gacha.py`
- `gatekeeper.js`
- `lcd_bridge_server.py`
- `lcd_log_monitor.py`
- `lib/agent-personas.js`
- `lib/agent-session.js`
- `lib/agent-tools-file.js`
- `lib/code-tools.js`
- `lib/commands/architecture.js`
- `lib/commands/autofix-pr.js`
- `lib/commands/autoresearch.js`
- `lib/commands/browser.js`
- `lib/commands/bughunt.js`
- `lib/commands/cognition.js`
- `lib/commands/ctx-viz.js`
- `lib/commands/gc.js`
- `lib/commands/grow.js`
- `lib/commands/intelligence.js`
- `lib/commands/llm.js`
- `lib/commands/onboard.js`
- `lib/commands/overview.js`
- `lib/commands/parity.js`
- `lib/commands/plan.js`
- `lib/commands/ponytail.js`
- `lib/commands/roster.js`
- `lib/commands/services.js`
- `lib/commands/smoke.js`
- `lib/commands/teleport.js`
- `lib/commands/thringlets.js`
- `lib/commands/workers.js`
- `lib/context-bus.js`
- `lib/gateways/discord.js`
- `lib/gateways/email.js`
- `lib/gateways/slack.js`
- `lib/gateways/telegram.js`
- `lib/goop-playground/squirrel.js`
- `lib/governance-audit.js`
- `lib/imagegen/gateway.js`
- `lib/intelligence-spine.js`
- `lib/lib/agent-compress.js`
- `lib/lib/hook-flags.js`
- `lib/lib/inspection.js`
- `lib/lib/install/config.js`
- `lib/lib/project-detect.js`
- `lib/lib/resolve-ecc-root.js`
- `lib/lib/shell-split.js`
- `lib/lib/skill-improvement/evaluate.js`
- `lib/lib/skill-improvement/observations.js`
- `lib/lib/tmux-worktree-orchestrator.js`
- `lib/mallory/index.js`
- `lib/nvidia/nim-skills.js`
- `lib/odysseus-scorecard.js`
- `lib/omni/feature-registry.js`
- `lib/omni/generate-agent-docs.js`
- `lib/omni/provider-integrity.js`
- `lib/omni/queue-action-required.js`
- `lib/omni/truth-scanner.js`
- `lib/orchestrator-hardening.js`
- `lib/persona-forge.js`
- `lib/personality.js`
- `lib/proactive-maintenance.js`
- `lib/rate-limit.js`
- `lib/recursive/agent-scores.js`
- `lib/runtime/policy-engine.js`
- `lib/sampler.js`
- `lib/secret-redactor.js`
- `lib/snapshot.js`
- `lib/spaghetti-audit.js`
- `lib/stt/gateway.js`
- `lib/training-ingest.js`
- `lib/tts/gateway.js`
- `lib/verify-tools.js`
- `lib/voice-client.js`
- `lib/workers/http-worker.js`
- `lib/workers/purp-worker.js`
- `mimi_speak.py`
- `mochi/menu_mochi_extension/background.js`
- `mochi/menu_mochi_extension/content.js`
- `mochi/menu_mochi_extension/popup.js`
- `music_analysis_service.py`
- `no-spaghett/eslint.config.mjs`
- `no-spaghett/ls.js`
- `no-spaghett/ls2.js`
- `no-spaghett/ls3.js`
- `no-spaghett/postcss.config.mjs`
- `no-spaghett/skills/goop-sigil/exorcise_module.js`
- `pocket/detect.py`
- `pocket/guide/play.py`
- `pool_service.js`
- `postcss.config.mjs`
- `public/skyscraper/data-hooks.js`
- `purpconsole/__init__.py`
- `puzzle-stream/apps/web/postcss.config.js`
- `puzzle-stream/apps/web/tailwind.config.js`
- `python/faiss_sidecar.py`
- `refusal_ablation_probe/config.py`
- `replace.js`
- `scrape_stdu.py`
- `scrape_stdu_news.py`
- `scrape_zhihu.py`
- `scripts/benchmark-providers.js`
- `scripts/build-binary-index.js`
- `scripts/build-safe.js`
- `scripts/checksum-vendor.js`
- `scripts/code-index-fast.js`
- `scripts/deep-audit.js`
- `scripts/ecc.js`
- `scripts/heartbeat.js`
- `scripts/init-undefined.js`
- `scripts/lora-train.py`
- `scripts/nanoclaw.js`
- `scripts/tui-ask.js`
- `scripts/tui-ng.js`
- `scripts/tui.js`
- `scripts/verify-api-spine.cjs`
- `scripts/windows/verify-windows-scripts.js`
- `shaman_prompts.js`
- `simple_bridge.py`
- `skills/arxiv/scripts/search_arxiv.py`
- `skills/axolotl/axolotl.js`
- `skills/bee/bee.js`
- `skills/bunny/bunny.js`
- `skills/cactus/cactus.js`
- `skills/canvas/scripts/canvas_api.py`
- `skills/chart/chart.js`
- `skills/child-registry-no-spawn-leak/scripts/spawn-audit.js`
- `skills/chonk/chonk.js`
- `skills/ck/hooks/session-start.mjs`
- `skills/claw/claw.js`
- `skills/comfyui/scripts/hardware_check.py`
- `skills/comfyui/tests/conftest.py`
- `skills/comfyui/tests/test_check_deps.py`
- `skills/comfyui/tests/test_cloud_integration.py`
- `skills/comfyui/tests/test_common.py`
- `skills/comfyui/tests/test_extract_schema.py`
- `skills/comfyui/tests/test_run_workflow.py`
- `skills/companion_swarm.js`
- `skills/continuous-learning-v2/scripts/instinct-cli.py`
- `skills/continuous-learning-v2/scripts/test_parse_instinct.py`
- `skills/crow/crow.js`
- `skills/darwinian-evolver/scripts/parrot_openrouter.py`
- `skills/darwinian-evolver/scripts/show_snapshot.py`
- `skills/dcf-model/scripts/validate_dcf.py`
- `skills/domain-intel/scripts/domain_intel.py`
- `skills/dragon/dragon.js`
- `skills/drug-discovery/scripts/chembl_target.py`
- `skills/drug-discovery/scripts/ro5_screen.py`
- `skills/duck/duck.js`
- `skills/elephant/elephant.js`
- `skills/evm/scripts/evm_client.py`
- `skills/excalidraw/scripts/upload.py`
- `skills/excel-author/scripts/recalc.py`
- `skills/fastmcp/scripts/scaffold_fastmcp.py`
- `skills/fitness-nutrition/scripts/body_calc.py`
- `skills/fitness-nutrition/scripts/nutrition_search.py`
- `skills/fox/fox.js`
- `skills/ghost/ghost.js`
- `skills/gitnexus-explorer/scripts/proxy.mjs`
- `skills/godmode/scripts/auto_jailbreak.py`
- `skills/godmode/scripts/godmode_race.py`
- `skills/godmode/scripts/load_godmode.py`
- `skills/godmode/scripts/parseltongue.py`
- `skills/goop-sigil/detect_spaghetti.js`
- `skills/goop-sigil/exorcise_module.js`
- `skills/goose/goose.js`
- `skills/gorilla/gorilla.js`
- `skills/hawk/hawk.js`
- `skills/hermes-tts-providers/scripts/kokoro_tts.py`
- `skills/hyperliquid/scripts/hyperliquid_client.py`
- `skills/innovator/innovator.js`
- `skills/interactive_shell.js`
- `skills/jellyfish/jellyfish.js`
- `skills/kanban-video-orchestrator/scripts/bootstrap_pipeline.py`
- `skills/kanban-video-orchestrator/scripts/monitor.py`
- `skills/karen/karen.js`
- `skills/kraken/kraken.js`
- `skills/lemur/lemur.js`
- `skills/linear/scripts/linear_api.py`
- `skills/lunokio-avatar-control/scripts/lunokio_manager.py`
- `skills/lunokio-avatar-control/scripts/riko_control.py`
- `skills/mantis/mantis.js`
- `skills/maps/scripts/maps_client.py`
- `skills/meme-generation/scripts/generate_meme.py`
- `skills/memento-flashcards/scripts/memento_cards.py`
- `skills/memento-flashcards/scripts/youtube_quiz.py`
- `skills/moth/moth.js`
- `skills/mushroom/mushroom.js`
- `skills/navigator/tools.js`
- `skills/numbers/numbers.js`
- `skills/ocr-and-documents/scripts/extract_marker.py`
- `skills/ocr-and-documents/scripts/extract_pymupdf.py`
- `skills/octopus/octopus.js`
- `skills/openclaw-migration/scripts/openclaw_to_hermes.py`
- `skills/osint-investigation/scripts/build_findings.py`
- `skills/osint-investigation/scripts/fetch_icij_offshore.py`
- `skills/osint-investigation/scripts/fetch_usaspending.py`
- `skills/osint-investigation/scripts/timing_analysis.py`
- `skills/oss-forensics/scripts/evidence-store.py`
- `skills/owl/owl.js`
- `skills/p5js/scripts/export-frames.js`
- `skills/panda/panda.js`
- `skills/parrot/parrot.js`
- `skills/penguin/penguin.js`
- `skills/phoenix/phoenix.js`
- `skills/pixel-art/scripts/__init__.py`
- `skills/polymarket/scripts/polymarket.py`
- `skills/powerpoint/scripts/__init__.py`
- `skills/powerpoint/scripts/add_slide.py`
- `skills/powerpoint/scripts/clean.py`
- `skills/powerpoint/scripts/office/helpers/__init__.py`
- `skills/powerpoint/scripts/office/helpers/merge_runs.py`
- `skills/powerpoint/scripts/office/helpers/simplify_redlines.py`
- `skills/powerpoint/scripts/office/pack.py`
- `skills/rabbit/rabbit.js`
- `skills/raven/raven.js`
- `skills/robot/robot.js`
- `skills/scientist/scientist.js`
- `skills/shark/shark.js`
- `skills/skill_manager.js`
- `skills/snake/snake.js`
- `skills/socket-rig/references/lunokio_bridge.py`
- `skills/socket_rig.js`
- `skills/solana/scripts/solana_client.py`
- `skills/spider/spider.js`
- `skills/stocks/scripts/stocks_client.py`
- `skills/street_builder.js`
- `skills/task_manager.js`
- `skills/telephony/scripts/telephony.py`
- `skills/test_skill.js`
- `skills/turtle/turtle.js`
- `skills/void/void.js`
- `skills/wallet-recovery/references/scan_parallel.py`
- `skills/wallet-recovery/scripts/scan_telegram.py`
- `skills/wolf/wolf.js`
- `skills/youtube-content/scripts/fetch_transcript.py`
- `smoke_test.js`
- `stress.cjs`
- `test_audio_pipeline.py`
- `test_rules_inline.py`
- `unified_bridge.js`
- `vision_monitor.js`
- `voice_ingress.js`
- `voice_stt.py`
- `yolo_service.py`

## 🗂 Per-folder file + wire map

### `(root)/`  (65 files)
- **_wire.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs
- **agent_routing_matrix.js** `[js]`
    → wires to: _(none)_
    ← used by: `task_decomposer.js`
- **agent_score.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/harness/benchmark.js`, `lib/harness/engine.js`, `orchestrator.js`, `swarm_coordinator.js`
    ⤷ external: fs, path
- **agent_tower.js** `[js]`
    → wires to: `companion_swarm.js`, `lib/agent-loop.js`, `lib/llm-provider.js`, `lib/memory-client.js`
    ← used by: `boot.js`, `lib/deep-audit.js`, `swarm_scheduler.js`, `unified_api.js`
    ⤷ external: events, path, fs, http, ws
- **autoDream.py** `[py]`
    → wires to: `autoDream.py`
    ← used by: `autoDream.py`, `cognitive_spine.py`
    ⤷ external: collections, datetime, os, sys, json, time, gzip, pickle, hashlib, threading, sqlite3, http, socketserver, argparse
- **autonomous_diagnostics.py** `[py]`
    → wires to: _(none)_
    ← used by: `cognitive_spine.py`
    ⤷ external: dataclasses, enum, typing, json, queue, threading, time, uuid, psutil, http, socketserver
- **boot.js** `[js]`
    → wires to: `agent_tower.js`, `lib/child-registry.js`, `unified_eventbus.js`, `unified_state.js`
    ← used by: _(none)_
    ⤷ external: http, child_process, path, net
- **boston_analysis.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sklearn, scipy, pandas, numpy, warnings, matplotlib
- **cognitive_spine.py** `[py]`
    → wires to: `autoDream.py`, `autonomous_diagnostics.py`, `memory_matrix_v2.py`, `modal_logic_engine.py`, `neuro_symbolic_bridge.py`, `symbolic_rules_engine.py`
    ← used by: _(none)_
    ⤷ external: http, socketserver, urllib, argparse, json, time
- **companion_swarm.js** `[js]`
    → wires to: _(none)_
    ← used by: `agent_tower.js`
    ⤷ external: path, fs
- **create_db.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sqlite3
- **diag_audio.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: audioop, edge_tts
- **digital_shaman.js** `[js]`
    → wires to: `lib/llm-provider.js`
    ← used by: `unified_api.js`
    ⤷ external: events, https, http, fs, path
- **ecosystem.config.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **eslint.config.mjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: eslint, eslint-config-next, node:path, node:url
- **find_pulse.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: json
- **gacha.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os, secrets, sys, json
- **gatekeeper.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, http, child_process
- **harness_service.js** `[js]`
    → wires to: `lib/harness/engine.js`
    ← used by: _(none)_
    ⤷ external: fs, http, path
- **lcd_bridge_server.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, rig_lcd_terminal, socket, json, threading, time, sys, os, urllib
- **lcd_log_monitor.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, collections, rig_lcd_terminal, socket, json, time, sys, os, urllib
- **locked_interfaces.js** `[js]`
    → wires to: _(none)_
    ← used by: `orchestrator.js`
    ⤷ external: fs, path
- **memory_matrix.py** `[py]`
    → wires to: _(none)_
    ← used by: `memory_matrix_v2.py`, `neuro_symbolic_bridge.py`, `test_memory.py`
    ⤷ external: collections, dataclasses, typing, sentence_transformers, http, urllib, os, sys, json, time, uuid, threading, queue, gzip, pickle
- **memory_matrix_v2.py** `[py]`
    → wires to: `memory_matrix.py`, `memory_matrix_v2.py`, `symbolic_rules_engine.py`
    ← used by: `cognitive_spine.py`, `memory_matrix_v2.py`
    ⤷ external: collections, dataclasses, typing, datetime, urllib, os, sys, json, time, uuid, gzip, pickle, hashlib, threading, re
- **metrics_aggregator.js** `[js]`
    → wires to: `service_registry.js`
    ← used by: _(none)_
    ⤷ external: dotenv, path, http, fs
- **mimi_speak.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: kokoro, sys, warnings, io, soundfile, asyncio
- **modal_logic_engine.py** `[py]`
    → wires to: _(none)_
    ← used by: `cognitive_spine.py`
    ⤷ external: dataclasses, enum, typing, json, threading, time, uuid, http, socketserver
- **music_analysis_service.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: concurrent, typing, scipy, dataclasses, datetime, os, sys, io, json, time, hashlib, argparse, threading, librosa, numpy
- **neuro_symbolic_bridge.py** `[py]`
    → wires to: `memory_matrix.py`, `neuro_symbolic_bridge.py`
    ← used by: `cognitive_spine.py`, `neuro_symbolic_bridge.py`
    ⤷ external: datetime, typing, dataclasses, enum, cozo, os, sys, json, time, hashlib, threading, re, socket, urllib, argparse
- **orchestrator.js** `[js]`
    → wires to: `agent_score.js`, `locked_interfaces.js`
    ← used by: _(none)_
    ⤷ external: http, path, child_process
- **pool_service.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, fs, path
- **postcss.config.mjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **replace.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **scrape_stdu.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, urllib, re, json
- **scrape_stdu_news.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: bs4, datetime, requests, csv, time, re
- **scrape_zhihu.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: urllib, json
- **screen-manager.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: child_process
- **service_registry.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/deep-audit.js`, `metrics_aggregator.js`, `scripts/panic-stop.js`, `scripts/pm2-names.js`
- **shaman_evaluator.js** `[js]`
    → wires to: _(none)_
    ← used by: `unified_api.js`
    ⤷ external: https, http
- **shaman_prompts.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **simple_bridge.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, urllib, socket, json, threading, sys, os, warnings, signal
- **smoke_test.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, ws, net, child_process, path, fs
- **spinUpAgent.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: child_process, path, fs
- **start_purpclaw.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: child_process, path
- **stress.cjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: playwright, fs, path
- **swarm_coordinator.js** `[js]`
    → wires to: `agent_score.js`, `lib/cognitive-client.js`, `lib/context-packet.js`, `lib/llm-provider.js`, `lib/memory-client.js`, `lib/self-context.js`, `task_decomposer.js`
    ← used by: `_scratch/run_mission_direct.js`
    ⤷ external: http, fs, path, child_process
- **swarm_scheduler.js** `[js]`
    → wires to: `agent_tower.js`
    ← used by: _(none)_
    ⤷ external: fs, path, http
- **symbolic_rules_engine.py** `[py]`
    → wires to: _(none)_
    ← used by: `cognitive_spine.py`, `memory_matrix_v2.py`
    ⤷ external: dataclasses, typing, json, re, threading, time, uuid, http, socketserver
- **task_decomposer.js** `[js]`
    → wires to: `agent_routing_matrix.js`, `lib/ast-dependency-graph.js`
    ← used by: `swarm_coordinator.js`
    ⤷ external: fs, path
- **test_audio_pipeline.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: edge_tts
- **test_memory.py** `[py]`
    → wires to: `memory_matrix.py`
    ← used by: _(none)_
    ⤷ external: sys, os, time, traceback
- **test_rules_inline.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sys, importlib, types
- **thringlet_bridge.js** `[js]`
    → wires to: `lib/thringlets/engine.js`, `lib/thringlets/runtime-observer.js`
    ← used by: _(none)_
    ⤷ external: fs, http, path
- **tmux-worktree-orchestrator.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: fs, path, os, http, child_process
- **unified_api.js** `[js]`
    → wires to: `agent_tower.js`, `digital_shaman.js`, `lib/agent-loop.js`, `lib/child-registry.js`, `lib/commands/code.js`, `lib/llm-provider.js`, `lib/memory-client.js`, `shaman_evaluator.js`
    ← used by: _(none)_
    ⤷ external: dotenv, http, https, net, url, path, fs, child_process, util, ws, os
- **unified_bridge.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, http, path, fs, os, net
- **unified_eventbus.js** `[js]`
    → wires to: _(none)_
    ← used by: `boot.js`
    ⤷ external: http, url
- **unified_state.js** `[js]`
    → wires to: _(none)_
    ← used by: `boot.js`
    ⤷ external: http, url
- **vision_monitor.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, http, child_process
- **voice_bridge_7792.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: ws, http, net, child_process, path, fs
- **voice_coordinator.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: net, http, fs, path
- **voice_ingress.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http
- **voice_stt.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, pathlib, faster_whisper, os, sys, json, time, queue, struct, threading, tempfile, http, socketserver, sounddevice, numpy
- **worker_service.js** `[js]`
    → wires to: `lib/worker-auth.js`
    ← used by: _(none)_
    ⤷ external: http, fs, path
- **yolo_service.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, urllib, ultralytics, os, sys, json, base64, asyncio, numpy, threading, traceback, cv2

### `_api-mega-list/API-mega-list-main/settings/`  (2 files)
- **fetch_apify_actors.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: https, fs, path
- **generate_readme_clean.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path

### `_scratch/`  (6 files)
- **dup_finder.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, collections, hashlib, os, sys
- **gap-report.js** `[js]`
    → wires to: `lib/feature-parity.js`
    ← used by: _(none)_
    ⤷ external: path
- **run_mission_direct.js** `[js]`
    → wires to: `swarm_coordinator.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **test_db.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, crypto, fs, os, E:\\god folder\\02_ACTIVE_PROJECTS\\omnicode-platform\\node_modules\\better-sqlite3
- **test_hud.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path
- **test_sandbox.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, fs, path

### `_scratch/selftest/`  (1 files)
- **hello.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `_scratch/turbovec-pack/purpclaw_turbovec_integration/bin/`  (1 files)
- **purpclaw-vector-bench.js** `[js]`
    → wires to: `_scratch/turbovec-pack/purpclaw_turbovec_integration/lib/vector/providers/turbovecProvider.js`
    ← used by: _(none)_
    ⤷ external: fs, path, perf_hooks

### `_scratch/turbovec-pack/purpclaw_turbovec_integration/lib/vector/providers/`  (1 files)
- **turbovecProvider.js** `[js]`
    → wires to: _(none)_
    ← used by: `_scratch/turbovec-pack/purpclaw_turbovec_integration/bin/purpclaw-vector-bench.js`
    ⤷ external: child_process, path

### `_scratch/turbovec-pack/purpclaw_turbovec_integration/python/`  (1 files)
- **turbovec_sidecar.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, typing, json, os, sys, numpy

### `ablation_probes/`  (1 files)
- **refusal_weight_probe_7B.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_

### `agent_work/`  (1 files)
- **blast_radius_helper.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, crypto, fs, os, E:\\\\god folder\\\\02_ACTIVE_PROJECTS\\\\omnicode-platform\\\\node_modules\\\\better-sqlite3

### `agent_work/bee/`  (1 files)
- **postcss.config.mjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `agent_work/robot/`  (1 files)
- **dashboard_live_update_test.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, net

### `apis for agents/settings/`  (2 files)
- **fetch_apify_actors.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: https, fs, path
- **generate_readme_clean.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path

### `app/public/ui/`  (9 files)
- **app.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **chat-hooks.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **cinematic.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **command-palette.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **data-hooks.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **extras.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **panels.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **skyscraper.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **tweaks-panel.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `bin/`  (5 files)
- **MISSION.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **coding-eval.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, http
- **model-discover.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, https, dotenv
- **purpclaw-vector-bench.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, perf_hooks
- **purpclaw.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/deep-audit.js`, `lib/doctor.js`, `lib/embeddings.js`, `lib/release-sign.js`, `lib/whoami.js`
    ← used by: _(none)_
    ⤷ external: path, fs, http, https, child_process, readline

### `companion-chorus/`  (4 files)
- **bridge.js** `[js]`
    → wires to: `companion-chorus/src/constants.js`, `companion-chorus/src/gacha.js`, `companion-chorus/src/minimax.js`, `companion-chorus/src/voice.js`
    ← used by: _(none)_
    ⤷ external: fs, path, http, child_process, eventsource
- **main.js** `[js]`
    → wires to: `companion-chorus/src/constants.js`, `companion-chorus/src/gacha.js`, `companion-chorus/src/minimax.js`, `companion-chorus/src/sprites.js`, `companion-chorus/src/voice.js`
    ← used by: _(none)_
    ⤷ external: fs, path, readline
- **test-ai.js** `[js]`
    → wires to: `companion-chorus/src/minimax.js`
    ← used by: _(none)_
    ⤷ external: fs
- **test-api.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: https

### `companion-chorus/src/`  (5 files)
- **constants.js** `[js]`
    → wires to: _(none)_
    ← used by: `companion-chorus/bridge.js`, `companion-chorus/main.js`, `companion-chorus/src/gacha.js`
- **gacha.js** `[js]`
    → wires to: `companion-chorus/src/constants.js`
    ← used by: `companion-chorus/bridge.js`, `companion-chorus/main.js`
- **minimax.js** `[js]`
    → wires to: _(none)_
    ← used by: `companion-chorus/bridge.js`, `companion-chorus/main.js`, `companion-chorus/test-ai.js`
    ⤷ external: https
- **sprites.js** `[js]`
    → wires to: _(none)_
    ← used by: `companion-chorus/main.js`
- **voice.js** `[js]`
    → wires to: _(none)_
    ← used by: `companion-chorus/bridge.js`, `companion-chorus/main.js`
    ⤷ external: child_process, path, os, fs

### `eval/`  (2 files)
- **__init__.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
- **harness.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, typing, json, time, os, statistics, traceback, urllib

### `eval/benches/`  (6 files)
- **__init__.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
- **eventbus_bench.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: harness, time, subprocess, sys
- **governance_bench.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: harness, time, subprocess, sys
- **memory_bench.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: harness, time, subprocess, sys, os
- **orchestrator_bench.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: harness, time, subprocess, json, sys
- **pool_bench.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: harness, time, subprocess, sys

### `eval/suites/`  (4 files)
- **__init__.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
- **chaos.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, typing, json, os, random, subprocess, sys, time, urllib
- **regression.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, pathlib, typing, json, os, sys, time, urllib
- **smoke.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: typing, json

### `lib/`  (86 files)
- **accuracy-fish.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/__tests__/accuracy-fish/claim_extractor.test.js`, `lib/harness/engine.js`
- **agent-loop.js** `[js]`
    → wires to: `lib/idle-engine.js`, `lib/llm-provider.js`, `lib/session-store.js`, `lib/tools/index.js`, `lib/user-feedback.js`, `lib/whoami.js`
    ← used by: `agent_tower.js`, `lib/chat-agent.js`, `lib/commands/ask.js`, `unified_api.js`
    ⤷ external: path, fs
- **agent-personas.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **agent-session.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, crypto, child_process
- **agent-tools-file.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, child_process, crypto
- **api-harness-kernel.js** `[js]`
    → wires to: `lib/deep-research-group.js`, `lib/governance.js`, `lib/harness/engine.js`, `lib/job-contract.js`, `lib/omnicode-bridge.js`, `lib/training-buffer.js`
    ← used by: _(none)_
    ⤷ external: fs, path, events
- **api-mega-list.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/goop-playground/goop-playground.js`
    ⤷ external: fs, path
- **ast-dependency-graph.js** `[js]`
    → wires to: _(none)_
    ← used by: `task_decomposer.js`
    ⤷ external: fs, path, typescript
- **autotune.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/tools/index.js`
- **capability-registry.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/supervisor.js`
- **chaos-campaign.js** `[js]`
    → wires to: `lib/smith-neo.js`
    ← used by: `lib/commands/bigboss.js`, `lib/tools/index.js`
    ⤷ external: fs, path
- **chat-agent.js** `[js]`
    → wires to: `lib/agent-loop.js`, `lib/llm-provider.js`, `lib/tools/index.js`
    ← used by: `lib/deep-research-group.js`
- **child-registry.js** `[js]`
    → wires to: _(none)_
    ← used by: `bin/purpclaw.js`, `boot.js`, `lib/commands/bigboss.js`, `lib/commands/claudecode.js`, `lib/commands/deploy.js`, `lib/commands/open.js`, `lib/commands/pocket.js`, `lib/demo/product-factory.js`, `lib/harvest/extractors.js`, `lib/mcp.js`, `lib/pocket-updater.js`, `lib/runtime/computer-use.js`, `lib/runtime/voice-router.js`, `lib/skill-bridge.js`, `lib/tools-cli-anything.js`, `lib/tools-pc.js`, `lib/tools/index.js`, `lib/tools/skills-registry.js`, `screen-manager.js`, `scripts/windows/voice-session-host.js`, `spinUpAgent.js`, `start_purpclaw.js`, `tmux-worktree-orchestrator.js`, `unified_api.js`, `voice_bridge_7792.js`, `voice_coordinator.js`
    ⤷ external: child_process, path
- **code-tools.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, https, path
- **cognitive-client.js** `[js]`
    → wires to: _(none)_
    ← used by: `swarm_coordinator.js`
    ⤷ external: http
- **context-bus.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, http, child_process
- **context-packet.js** `[js]`
    → wires to: _(none)_
    ← used by: `swarm_coordinator.js`
    ⤷ external: fs, path, os
- **deep-audit.js** `[js]`
    → wires to: `agent_tower.js`, `lib/identity.js`, `lib/pocket-vault.js`, `lib/spend-gate.js`, `lib/tools/index.js`, `lib/tools/skills-registry.js`, `service_registry.js`
    ← used by: `bin/purpclaw.js`
    ⤷ external: fs, path, os,  + mod + , child_process
- **deep-research-group.js** `[js]`
    → wires to: `lib/chat-agent.js`, `lib/llm-provider.js`, `lib/rate-limiter.js`, `lib/self-context.js`
    ← used by: `lib/api-harness-kernel.js`, `lib/self-evolution-loop.js`
    ⤷ external: path
- **delegation-status.js** `[js]`
    → wires to: _(none)_
    ← used by: `scripts/delegation-status.cjs`
    ⤷ external: fs, path
- **doctor.js** `[js]`
    → wires to: `lib/tools/index.js`
    ← used by: `bin/purpclaw.js`
    ⤷ external: fs, path, http, os, crypto, express, next
- **embeddings.js** `[js]`
    → wires to: _(none)_
    ← used by: `bin/purpclaw.js`
    ⤷ external: https
- **feature-parity.js** `[js]`
    → wires to: _(none)_
    ← used by: `_scratch/gap-report.js`
    ⤷ external: fs, path, http
- **gate-pipeline.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/idle-engine.js`
    ⤷ external: fs, path, child_process
- **governance-audit.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **governance.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/api-harness-kernel.js`
    ⤷ external: fs, path
- **identity.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/identity.js`, `lib/deep-audit.js`
    ⤷ external: fs, path, os, crypto
- **idle-engine.js** `[js]`
    → wires to: `lib/gate-pipeline.js`, `lib/training/personal-dataset.js`, `lib/user-feedback.js`
    ← used by: `lib/agent-loop.js`
    ⤷ external: fs, path, child_process, http
- **intelligence-spine.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: crypto, fs, http, path
- **job-contract.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/api-harness-kernel.js`, `lib/evolution/skill-forge.js`, `lib/harness/engine.js`
    ⤷ external: fs, path, child_process
- **llm-provider.js** `[js]`
    → wires to: `lib/spend-gate.js`
    ← used by: `agent_tower.js`, `digital_shaman.js`, `lib/agent-loop.js`, `lib/chat-agent.js`, `lib/commands/claudecode.js`, `lib/commands/setup.js`, `lib/deep-research-group.js`, `lib/demo/product-factory.js`, `lib/harness/engine.js`, `lib/llm-status.js`, `lib/model-sentinel.js`, `lib/runtime/provider-router.js`, `lib/screen-look.js`, `lib/tools-gui.js`, `scripts/verify-llm-fallback.cjs`, `swarm_coordinator.js`, `unified_api.js`
    ⤷ external: dotenv, https, http, url, fs, path
- **llm-status.js** `[js]`
    → wires to: `lib/llm-provider.js`
    ← used by: _(none)_
    ⤷ external: http
- **mcp.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/omnicode-bridge.js`
    ← used by: `lib/commands/ask.js`
    ⤷ external: fs, path, os, @modelcontextprotocol
- **memory-client.js** `[js]`
    → wires to: _(none)_
    ← used by: `agent_tower.js`, `lib/harness/engine.js`, `lib/self-evolution-loop.js`, `swarm_coordinator.js`, `unified_api.js`
    ⤷ external: http
- **memory-consistency.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/bigboss.js`, `lib/tools/index.js`
    ⤷ external: fs, path
- **mochi-sprites.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/mochi-state.js`, `lib/mochi.js`
- **mochi-state.js** `[js]`
    → wires to: `lib/mochi-sprites.js`, `lib/paths.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **mochi-statusbar.js** `[js]`
    → wires to: `lib/omnicode-bridge.js`
    ← used by: _(none)_
    ⤷ external: fs, path, http
- **mochi.js** `[js]`
    → wires to: `lib/mochi-sprites.js`
    ← used by: _(none)_
    ⤷ external: fs, http, path
- **model-sentinel.js** `[js]`
    → wires to: `lib/llm-provider.js`, `lib/runtime/provider-router.js`
    ← used by: `scripts/model-sentinel.js`
    ⤷ external: fs, os, path
- **odysseus-scorecard.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **omnicode-bridge.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/api-harness-kernel.js`, `lib/mcp.js`, `lib/mochi-statusbar.js`
    ⤷ external: fs, path, os
- **orchestrator-hardening.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, http, path
- **parseltongue.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/tools/index.js`
- **paths.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/demo/product-factory.js`, `lib/mochi-state.js`, `lib/runtime/computer-use.js`, `lib/runtime/pipeline-telemetry.js`, `lib/runtime/preprompt-compiler.js`, `lib/runtime/voice-router.js`, `scripts/windows/core-host.js`, `scripts/windows/python-service-host.js`, `scripts/windows/tray-agent.js`, `scripts/windows/voice-session-host.js`
    ⤷ external: fs, path
- **persona-forge.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, child_process
- **personality.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **pocket-updater.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/signed-manifest.js`
    ← used by: `lib/commands/pocket.js`
    ⤷ external: fs, path, os, crypto, https, child_process
- **pocket-vault.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/pocket.js`, `lib/deep-audit.js`
    ⤷ external: crypto, fs, path, os
- **proactive-maintenance.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **provider_health.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/survivor_router.js`
- **rate-limit.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **rate-limiter.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/deep-research-group.js`
- **reasoning-loop.js** `[js]`
    → wires to: `lib/reasoning-tick.js`
    ← used by: _(none)_
    ⤷ external: http
- **reasoning-tick.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/reasoning-loop.js`
    ⤷ external: http, fs, path
- **release-sign.js** `[js]`
    → wires to: _(none)_
    ← used by: `bin/purpclaw.js`
    ⤷ external: fs, path, os, crypto
- **sampler.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, child_process, yaml
- **screen-look.js** `[js]`
    → wires to: `lib/llm-provider.js`, `lib/workspace-awareness.js`
    ← used by: `lib/runtime/computer-use.js`, `lib/tools-gui.js`
    ⤷ external: child_process, fs, path, http
- **secret-redactor.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **self-context.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/deep-research-group.js`, `swarm_coordinator.js`
    ⤷ external: fs, path, http
- **self-evolution-loop.js** `[js]`
    → wires to: `lib/deep-research-group.js`, `lib/memory-client.js`, `lib/space-governor.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **session-store.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/agent-loop.js`, `lib/commands/ask.js`
    ⤷ external: fs, path, os
- **signed-manifest.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/pocket-updater.js`
    ⤷ external: crypto, fs, path
- **skill-bridge.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **smith-neo.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/chaos-campaign.js`, `lib/commands/bigboss.js`, `lib/tools/index.js`
    ⤷ external: fs, path
- **snapshot.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, crypto
- **space-governor.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/self-evolution-loop.js`
    ⤷ external: fs, path, child_process
- **spaghetti-audit.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **spend-gate.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/pocket.js`, `lib/deep-audit.js`, `lib/llm-provider.js`, `lib/runtime/settings-registry.js`
    ⤷ external: fs, path, os
- **stm.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/tools/index.js`
- **supervisor.js** `[js]`
    → wires to: `lib/capability-registry.js`
    ← used by: _(none)_
    ⤷ external: events, child_process, http, path, fs
- **survivor_router.js** `[js]`
    → wires to: `lib/provider_health.js`
    ← used by: _(none)_
- **telemetry.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/pocket.js`
    ⤷ external: fs, path, os
- **tools-cli-anything.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **tools-gui.js** `[js]`
    → wires to: `lib/llm-provider.js`, `lib/runtime/computer-use.js`, `lib/screen-look.js`
    ← used by: _(none)_
- **tools-pc.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: `lib/tools/index.js`
    ⤷ external: fs, path, os, https, http, url, playwright-core, child_process
- **tools-windows-mcp.js** `[js]`
    → wires to: `lib/runtime/computer-use.js`
    ← used by: `lib/runtime/computer-use.js`
    ⤷ external: path, @modelcontextprotocol
- **training-buffer.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/api-harness-kernel.js`, `lib/commands/training.js`
    ⤷ external: fs, path
- **training-ingest.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, os
- **user-feedback.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/agent-loop.js`, `lib/idle-engine.js`
    ⤷ external: fs, path, crypto
- **verify-tools.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, child_process
- **voice-client.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, http, net, path
- **whoami.js** `[js]`
    → wires to: `lib/tools/index.js`, `lib/tools/skills-registry.js`
    ← used by: `bin/purpclaw.js`, `lib/agent-loop.js`
    ⤷ external: fs, path, os
- **worker-auth.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/worker-pool.js`, `worker_service.js`
    ⤷ external: crypto
- **worker-pool.js** `[js]`
    → wires to: `lib/worker-auth.js`, `lib/workers/ssh-worker.js`
    ← used by: _(none)_
    ⤷ external: fs, path, http, https
- **workspace-awareness.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/screen-look.js`
    ⤷ external: fs, path

### `lib/__tests__/accuracy-fish/`  (1 files)
- **claim_extractor.test.js** `[js]`
    → wires to: `lib/accuracy-fish.js`
    ← used by: _(none)_

### `lib/business/`  (3 files)
- **operations.js** `[js]`
    → wires to: `lib/business/store.js`
    ← used by: `lib/commands/business.js`
    ⤷ external: crypto
- **store.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/business/operations.js`, `lib/business/twilio.js`, `lib/commands/business.js`
    ⤷ external: fs, path
- **twilio.js** `[js]`
    → wires to: `lib/business/store.js`
    ← used by: `lib/commands/business.js`
    ⤷ external: crypto

### `lib/commands/`  (41 files)
- **architecture.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **ask.js** `[js]`
    → wires to: `lib/agent-loop.js`, `lib/commands/bigboss.js`, `lib/mcp.js`, `lib/session-store.js`, `lib/tools/index.js`
    ← used by: _(none)_
    ⤷ external: fs, path, readline
- **autofix-pr.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, child_process, http
- **autoresearch.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, fs, path
- **bigboss.js** `[js]`
    → wires to: `lib/chaos-campaign.js`, `lib/child-registry.js`, `lib/memory-consistency.js`, `lib/smith-neo.js`, `lib/tools/index.js`
    ← used by: `lib/commands/ask.js`
    ⤷ external: path, fs
- **browser.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **bughunt.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, child_process, http
- **business.js** `[js]`
    → wires to: `lib/business/operations.js`, `lib/business/store.js`, `lib/business/twilio.js`
    ← used by: _(none)_
- **claudecode.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/llm-provider.js`
    ← used by: _(none)_
    ⤷ external: fs, os, path, child_process
- **code.js** `[js]`
    → wires to: `lib/vector/index.js`
    ← used by: `unified_api.js`
    ⤷ external: fs, path, http, crypto
- **cognition.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path
- **ctx-viz.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, http
- **deploy.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: path, fs, readline, os
- **evolve.js** `[js]`
    → wires to: `lib/evolution/mutator.js`, `lib/evolution/skill-forge.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **gc.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **grow.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, http, path
- **harness.js** `[js]`
    → wires to: `lib/harness/benchmark.js`, `lib/harness/engine.js`
    ← used by: _(none)_
    ⤷ external: fs, path, http
- **harvest.js** `[js]`
    → wires to: `lib/harvest/crawler.js`, `lib/harvest/extractors.js`, `lib/harvest/indexer.js`
    ← used by: _(none)_
    ⤷ external: path, fs
- **heal.js** `[js]`
    → wires to: `lib/commands/safe-start.js`
    ← used by: _(none)_
    ⤷ external: child_process, path
- **identity.js** `[js]`
    → wires to: `lib/identity.js`
    ← used by: _(none)_
    ⤷ external: path, fs, os
- **intelligence.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **llm.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path
- **onboard.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, child_process, readline
- **open.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: _(none)_
    ⤷ external: child_process, path, fs, http
- **overview.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **parity.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path
- **plan.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, http, readline
- **pocket.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/pocket-updater.js`, `lib/pocket-vault.js`, `lib/spend-gate.js`, `lib/telemetry.js`
    ← used by: _(none)_
    ⤷ external: path, fs, os, child_process, http, readline
- **ponytail.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, child_process, os
- **roster.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **safe-start.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/heal.js`, `lib/commands/safe-stop.js`
    ⤷ external: child_process, path, fs
- **safe-stop.js** `[js]`
    → wires to: `lib/commands/safe-start.js`
    ← used by: _(none)_
    ⤷ external: child_process, path
- **services.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, fs, path, http
- **setup.js** `[js]`
    → wires to: `lib/llm-provider.js`
    ← used by: `lib/commands/tour.js`
    ⤷ external: fs, path, os, readline, http, child_process
- **smoke.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, fs, path, child_process
- **telemetry.js** `[js]`
    → wires to: `lib/runtime/pipeline-telemetry.js`
    ← used by: _(none)_
- **teleport.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, http
- **thringlets.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http
- **tour.js** `[js]`
    → wires to: `lib/commands/setup.js`, `lib/tools/index.js`
    ← used by: _(none)_
    ⤷ external: child_process, path, fs, readline
- **training.js** `[js]`
    → wires to: `lib/training-buffer.js`
    ← used by: _(none)_
    ⤷ external: fs, path, child_process
- **workers.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path

### `lib/demo/`  (1 files)
- **product-factory.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/llm-provider.js`, `lib/paths.js`
    ← used by: `scripts/demo-factory.js`
    ⤷ external: fs, path

### `lib/evolution/`  (2 files)
- **mutator.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/evolve.js`, `lib/harness/benchmark.js`, `lib/harness/engine.js`
    ⤷ external: fs, path
- **skill-forge.js** `[js]`
    → wires to: `lib/job-contract.js`
    ← used by: `lib/commands/evolve.js`
    ⤷ external: fs, path

### `lib/gateways/`  (4 files)
- **discord.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, https, path, url
- **email.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, path, imapflow, nodemailer, https
- **slack.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, https, path, url
- **telegram.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, https, path, url

### `lib/goop-playground/`  (2 files)
- **goop-playground.js** `[js]`
    → wires to: `lib/api-mega-list.js`, `lib/goop-playground/package.json`
    ← used by: _(none)_
    ⤷ external: http, fs, path, crypto
- **squirrel.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path

### `lib/harness/`  (2 files)
- **benchmark.js** `[js]`
    → wires to: `agent_score.js`, `lib/evolution/mutator.js`, `lib/harness/engine.js`
    ← used by: `lib/commands/harness.js`, `lib/harness/engine.js`
    ⤷ external: fs, http, path
- **engine.js** `[js]`
    → wires to: `agent_score.js`, `lib/accuracy-fish.js`, `lib/evolution/mutator.js`, `lib/harness/benchmark.js`, `lib/job-contract.js`, `lib/llm-provider.js`, `lib/memory-client.js`
    ← used by: `harness_service.js`, `lib/api-harness-kernel.js`, `lib/commands/harness.js`, `lib/harness/benchmark.js`
    ⤷ external: fs, path, http, events

### `lib/harvest/`  (3 files)
- **crawler.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/harvest.js`
    ⤷ external: fs, path, crypto
- **extractors.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: `lib/commands/harvest.js`
    ⤷ external: fs, path, os
- **indexer.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/commands/harvest.js`
    ⤷ external: fs, path

### `lib/imagegen/`  (2 files)
- **gateway.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, https, path, url
- **video_engine.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/tools/index.js`
    ⤷ external: child_process, fs, path, os

### `lib/lib/`  (18 files)
- **agent-compress.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **hook-flags.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **inspection.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **install-executor.js** `[js]`
    → wires to: `lib/lib/install-manifests.js`, `lib/lib/install-state.js`, `lib/lib/install-targets/registry.js`, `lib/lib/install/apply.js`, `lib/lib/install/request.js`
    ← used by: `lib/lib/install-lifecycle.js`, `lib/lib/install/runtime.js`
    ⤷ external: fs, os, path, child_process
- **install-lifecycle.js** `[js]`
    → wires to: `lib/lib/install-executor.js`, `lib/lib/install-manifests.js`, `lib/lib/install-state.js`, `lib/lib/install-targets/registry.js`
    ← used by: _(none)_
    ⤷ external: fs, os, path
- **install-manifests.js** `[js]`
    → wires to: `lib/lib/install-targets/registry.js`
    ← used by: `lib/lib/install-executor.js`, `lib/lib/install-lifecycle.js`, `lib/lib/install/request.js`
    ⤷ external: fs, os, path
- **install-state.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/lib/install-executor.js`, `lib/lib/install-lifecycle.js`, `lib/lib/install/apply.js`
    ⤷ external: fs, path, ajv
- **observer-sessions.js** `[js]`
    → wires to: `lib/lib/utils.js`
    ← used by: _(none)_
    ⤷ external: fs, path, crypto, child_process
- **orchestration-session.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/lib/session-adapters/dmux-tmux.js`
    ⤷ external: fs, path, child_process
- **package-manager.js** `[js]`
    → wires to: `lib/lib/utils.js`
    ← used by: `lib/lib/resolve-formatter.js`
    ⤷ external: fs, path
- **project-detect.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **resolve-ecc-root.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, os
- **resolve-formatter.js** `[js]`
    → wires to: `lib/lib/package-manager.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **session-aliases.js** `[js]`
    → wires to: `lib/lib/utils.js`
    ← used by: `lib/lib/session-adapters/claude-history.js`
    ⤷ external: fs, path
- **session-manager.js** `[js]`
    → wires to: `lib/lib/utils.js`
    ← used by: `lib/lib/session-adapters/claude-history.js`
    ⤷ external: fs, path
- **shell-split.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **tmux-worktree-orchestrator.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, child_process
- **utils.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/lib/observer-sessions.js`, `lib/lib/package-manager.js`, `lib/lib/session-aliases.js`, `lib/lib/session-manager.js`, `lib/lib/skill-evolution/provenance.js`, `lib/lib/skill-evolution/tracker.js`, `lib/lib/skill-evolution/versioning.js`
    ⤷ external: fs, path, os, crypto, child_process

### `lib/lib/install/`  (4 files)
- **apply.js** `[js]`
    → wires to: `lib/lib/install-state.js`
    ← used by: `lib/lib/install-executor.js`
    ⤷ external: fs, path
- **config.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, ajv
- **request.js** `[js]`
    → wires to: `lib/lib/install-manifests.js`
    ← used by: `lib/lib/install-executor.js`
- **runtime.js** `[js]`
    → wires to: `lib/lib/install-executor.js`
    ← used by: _(none)_

### `lib/lib/install-targets/`  (9 files)
- **antigravity-project.js** `[js]`
    → wires to: `lib/lib/install-targets/helpers.js`
    ← used by: `lib/lib/install-targets/registry.js`
    ⤷ external: path
- **claude-home.js** `[js]`
    → wires to: `lib/lib/install-targets/helpers.js`
    ← used by: `lib/lib/install-targets/registry.js`
- **codebuddy-project.js** `[js]`
    → wires to: `lib/lib/install-targets/helpers.js`
    ← used by: `lib/lib/install-targets/registry.js`
    ⤷ external: path
- **codex-home.js** `[js]`
    → wires to: `lib/lib/install-targets/helpers.js`
    ← used by: `lib/lib/install-targets/registry.js`
- **cursor-project.js** `[js]`
    → wires to: `lib/lib/install-targets/helpers.js`
    ← used by: `lib/lib/install-targets/registry.js`
    ⤷ external: path
- **gemini-project.js** `[js]`
    → wires to: `lib/lib/install-targets/helpers.js`
    ← used by: `lib/lib/install-targets/registry.js`
- **helpers.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/lib/install-targets/antigravity-project.js`, `lib/lib/install-targets/claude-home.js`, `lib/lib/install-targets/codebuddy-project.js`, `lib/lib/install-targets/codex-home.js`, `lib/lib/install-targets/cursor-project.js`, `lib/lib/install-targets/gemini-project.js`, `lib/lib/install-targets/opencode-home.js`
    ⤷ external: fs, os, path
- **opencode-home.js** `[js]`
    → wires to: `lib/lib/install-targets/helpers.js`
    ← used by: `lib/lib/install-targets/registry.js`
- **registry.js** `[js]`
    → wires to: `lib/lib/install-targets/antigravity-project.js`, `lib/lib/install-targets/claude-home.js`, `lib/lib/install-targets/codebuddy-project.js`, `lib/lib/install-targets/codex-home.js`, `lib/lib/install-targets/cursor-project.js`, `lib/lib/install-targets/gemini-project.js`, `lib/lib/install-targets/opencode-home.js`
    ← used by: `lib/lib/install-executor.js`, `lib/lib/install-lifecycle.js`, `lib/lib/install-manifests.js`

### `lib/lib/session-adapters/`  (4 files)
- **canonical-session.js** `[js]`
    → wires to: `lib/lib/state-store/index.js`
    ← used by: `lib/lib/session-adapters/claude-history.js`, `lib/lib/session-adapters/dmux-tmux.js`
    ⤷ external: fs, os, path
- **claude-history.js** `[js]`
    → wires to: `lib/lib/session-adapters/canonical-session.js`, `lib/lib/session-aliases.js`, `lib/lib/session-manager.js`
    ← used by: `lib/lib/session-adapters/registry.js`
    ⤷ external: fs, path
- **dmux-tmux.js** `[js]`
    → wires to: `lib/lib/orchestration-session.js`, `lib/lib/session-adapters/canonical-session.js`
    ← used by: `lib/lib/session-adapters/registry.js`
    ⤷ external: fs, path
- **registry.js** `[js]`
    → wires to: `lib/lib/session-adapters/claude-history.js`, `lib/lib/session-adapters/dmux-tmux.js`
    ← used by: _(none)_

### `lib/lib/skill-evolution/`  (6 files)
- **dashboard.js** `[js]`
    → wires to: `lib/lib/skill-evolution/health.js`, `lib/lib/skill-evolution/tracker.js`, `lib/lib/skill-evolution/versioning.js`
    ← used by: `lib/lib/skill-evolution/index.js`
- **health.js** `[js]`
    → wires to: `lib/lib/skill-evolution/provenance.js`, `lib/lib/skill-evolution/tracker.js`, `lib/lib/skill-evolution/versioning.js`
    ← used by: `lib/lib/skill-evolution/dashboard.js`, `lib/lib/skill-evolution/index.js`
    ⤷ external: fs, path
- **index.js** `[js]`
    → wires to: `lib/lib/skill-evolution/dashboard.js`, `lib/lib/skill-evolution/health.js`, `lib/lib/skill-evolution/provenance.js`, `lib/lib/skill-evolution/tracker.js`, `lib/lib/skill-evolution/versioning.js`
    ← used by: _(none)_
- **provenance.js** `[js]`
    → wires to: `lib/lib/utils.js`
    ← used by: `lib/lib/skill-evolution/health.js`, `lib/lib/skill-evolution/index.js`
    ⤷ external: fs, os, path
- **tracker.js** `[js]`
    → wires to: `lib/lib/utils.js`
    ← used by: `lib/lib/skill-evolution/dashboard.js`, `lib/lib/skill-evolution/health.js`, `lib/lib/skill-evolution/index.js`
    ⤷ external: fs, os, path
- **versioning.js** `[js]`
    → wires to: `lib/lib/utils.js`
    ← used by: `lib/lib/skill-evolution/dashboard.js`, `lib/lib/skill-evolution/health.js`, `lib/lib/skill-evolution/index.js`
    ⤷ external: fs, path

### `lib/lib/skill-improvement/`  (4 files)
- **amendify.js** `[js]`
    → wires to: `lib/lib/skill-improvement/health.js`
    ← used by: _(none)_
- **evaluate.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **health.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/lib/skill-improvement/amendify.js`
- **observations.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, os

### `lib/lib/state-store/`  (4 files)
- **index.js** `[js]`
    → wires to: `lib/lib/state-store/migrations.js`, `lib/lib/state-store/queries.js`, `lib/lib/state-store/schema.js`
    ← used by: `lib/lib/session-adapters/canonical-session.js`
    ⤷ external: fs, os, path, sql.js
- **migrations.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/lib/state-store/index.js`
- **queries.js** `[js]`
    → wires to: `lib/lib/state-store/schema.js`
    ← used by: `lib/lib/state-store/index.js`
- **schema.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/lib/state-store/index.js`, `lib/lib/state-store/queries.js`
    ⤷ external: fs, path, ajv

### `lib/mallory/`  (1 files)
- **index.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, fs, path

### `lib/nvidia/`  (1 files)
- **nim-skills.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: https

### `lib/omni/`  (7 files)
- **feature-registry.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **generate-agent-docs.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **omnicode-adapter.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/omni/patch-governor.js`
    ⤷ external: child_process, path, fs, readline
- **patch-governor.js** `[js]`
    → wires to: `lib/omni/omnicode-adapter.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **provider-integrity.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, https, http
- **queue-action-required.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **truth-scanner.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, crypto

### `lib/providers/`  (4 files)
- **anthropic-messages.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/providers/registry.js`
- **hermes-cli.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/providers/registry.js`
    ⤷ external: child_process, stream
- **openai-responses.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/providers/registry.js`
- **registry.js** `[js]`
    → wires to: `lib/providers/anthropic-messages.js`, `lib/providers/hermes-cli.js`, `lib/providers/openai-responses.js`
    ← used by: _(none)_

### `lib/recursive/`  (1 files)
- **agent-scores.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs

### `lib/runtime/`  (9 files)
- **computer-use.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/paths.js`, `lib/runtime/settings-registry.js`, `lib/screen-look.js`, `lib/tools-windows-mcp.js`
    ← used by: `lib/tools-gui.js`, `lib/tools-windows-mcp.js`, `scripts/windows/tray-agent.js`
    ⤷ external: fs, path
- **pipeline-telemetry.js** `[js]`
    → wires to: `lib/paths.js`
    ← used by: `lib/commands/telemetry.js`, `scripts/windows/python-service-host.js`
    ⤷ external: fs, path
- **policy-engine.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path
- **ports.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/runtime/settings-registry.js`
    ⤷ external: path
- **preprompt-compiler.js** `[js]`
    → wires to: `lib/paths.js`, `lib/runtime/settings-registry.js`
    ← used by: _(none)_
    ⤷ external: fs, path, crypto
- **provider-config.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/runtime/provider-router.js`
    ⤷ external: fs, os, path
- **provider-router.js** `[js]`
    → wires to: `lib/llm-provider.js`, `lib/runtime/provider-config.js`
    ← used by: `lib/model-sentinel.js`
- **settings-registry.js** `[js]`
    → wires to: `lib/runtime/ports.js`, `lib/spend-gate.js`
    ← used by: `lib/runtime/computer-use.js`, `lib/runtime/preprompt-compiler.js`, `scripts/windows/voice-session-host.js`
    ⤷ external: fs, path, os
- **voice-router.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/paths.js`
    ← used by: `scripts/windows/tray-agent.js`
    ⤷ external: path, fs, crypto

### `lib/scheduler/`  (3 files)
- **calendar.js** `[js]`
    → wires to: `lib/scheduler/nl-cron.js`
    ← used by: `lib/scheduler/runner.js`
    ⤷ external: fs, path, crypto
- **nl-cron.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/scheduler/calendar.js`
- **runner.js** `[js]`
    → wires to: `lib/scheduler/calendar.js`
    ← used by: _(none)_
    ⤷ external: http, path, child_process, url, https

### `lib/stt/`  (1 files)
- **gateway.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, path, fs, os, child_process

### `lib/thringlets/`  (4 files)
- **archetypes.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/thringlets/engine.js`
- **engine.js** `[js]`
    → wires to: `lib/thringlets/archetypes.js`, `lib/thringlets/storage.js`
    ← used by: `lib/thringlets/runtime-observer.js`, `thringlet_bridge.js`
- **runtime-observer.js** `[js]`
    → wires to: `lib/thringlets/engine.js`
    ← used by: `thringlet_bridge.js`
    ⤷ external: http, events
- **storage.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/thringlets/engine.js`
    ⤷ external: fs, path, http

### `lib/tools/`  (2 files)
- **index.js** `[js]`
    → wires to: `lib/autotune.js`, `lib/chaos-campaign.js`, `lib/child-registry.js`, `lib/imagegen/video_engine.js`, `lib/memory-consistency.js`, `lib/parseltongue.js`, `lib/smith-neo.js`, `lib/stm.js`, `lib/tools-pc.js`, `lib/tools/skills-registry.js`
    ← used by: `lib/agent-loop.js`, `lib/chat-agent.js`, `lib/commands/ask.js`, `lib/commands/bigboss.js`, `lib/commands/tour.js`, `lib/deep-audit.js`, `lib/doctor.js`, `lib/whoami.js`
    ⤷ external: path, fs, https, http, os
- **skills-registry.js** `[js]`
    → wires to: `lib/child-registry.js`
    ← used by: `lib/deep-audit.js`, `lib/tools/index.js`, `lib/whoami.js`
    ⤷ external: fs, path, child_process

### `lib/training/`  (1 files)
- **personal-dataset.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/idle-engine.js`
    ⤷ external: fs, path

### `lib/tts/`  (1 files)
- **gateway.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, path, child_process, url, fs, os

### `lib/vector/`  (1 files)
- **index.js** `[js]`
    → wires to: `lib/vector/providers/faissProvider.js`
    ← used by: `lib/commands/code.js`
    ⤷ external: fs, path, child_process, perf_hooks

### `lib/vector/providers/`  (1 files)
- **faissProvider.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/vector/index.js`
    ⤷ external: fs, path, child_process, crypto

### `lib/workers/`  (3 files)
- **http-worker.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **purp-worker.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, ws, path
- **ssh-worker.js** `[js]`
    → wires to: _(none)_
    ← used by: `lib/worker-pool.js`
    ⤷ external: child_process

### `mochi/`  (2 files)
- **mochi-sprites.js** `[js]`
    → wires to: _(none)_
    ← used by: `mochi/mochi.js`
- **mochi.js** `[js]`
    → wires to: `mochi/mochi-sprites.js`
    ← used by: _(none)_
    ⤷ external: fs, http, path

### `mochi/menu_mochi_extension/`  (3 files)
- **background.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **content.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **popup.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `no-spaghett/`  (5 files)
- **eslint.config.mjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: eslint, eslint-config-next, node:path, node:url
- **ls.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs
- **ls2.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs
- **ls3.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs
- **postcss.config.mjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `no-spaghett/skills/goop-sigil/`  (1 files)
- **exorcise_module.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, @babel

### `pocket/`  (1 files)
- **detect.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, os, sys, json, platform, subprocess, socket, shutil, ctypes

### `pocket/guide/`  (1 files)
- **play.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, os, sys, json, shutil, struct, subprocess, time, hashlib, textwrap

### `podcast_studio/`  (10 files)
- **config.js** `[js]`
    → wires to: _(none)_
    ← used by: `podcast_studio/episode_manager.js`, `podcast_studio/podcast_runner.js`, `podcast_studio/topic_picker.js`, `podcast_studio/turn_manager.js`
    ⤷ external: fs, path
- **episode_manager.js** `[js]`
    → wires to: `podcast_studio/config.js`, `podcast_studio/llm_service.js`, `podcast_studio/shared_log.js`, `podcast_studio/topic_picker.js`
    ← used by: `podcast_studio/launch.js`
    ⤷ external: fs, path, http, url, child_process
- **launch.js** `[js]`
    → wires to: `podcast_studio/episode_manager.js`
    ← used by: _(none)_
    ⤷ external: child_process, path
- **llm_service.js** `[js]`
    → wires to: _(none)_
    ← used by: `podcast_studio/episode_manager.js`, `podcast_studio/podcast_runner.js`
    ⤷ external: https
- **podcast_runner.js** `[js]`
    → wires to: `podcast_studio/config.js`, `podcast_studio/llm_service.js`, `podcast_studio/shared_log.js`, `podcast_studio/topic_picker.js`, `podcast_studio/tts.js`, `podcast_studio/turn_manager.js`
    ← used by: _(none)_
- **shared_log.js** `[js]`
    → wires to: _(none)_
    ← used by: `podcast_studio/episode_manager.js`, `podcast_studio/podcast_runner.js`, `podcast_studio/topic_picker.js`, `podcast_studio/turn_manager.js`
    ⤷ external: fs, path
- **topic_picker.js** `[js]`
    → wires to: `podcast_studio/config.js`, `podcast_studio/shared_log.js`
    ← used by: `podcast_studio/episode_manager.js`, `podcast_studio/podcast_runner.js`
- **tts.js** `[js]`
    → wires to: `podcast_studio/utils.js`
    ← used by: `podcast_studio/podcast_runner.js`
    ⤷ external: child_process
- **turn_manager.js** `[js]`
    → wires to: `podcast_studio/config.js`, `podcast_studio/shared_log.js`
    ← used by: `podcast_studio/podcast_runner.js`
- **utils.js** `[js]`
    → wires to: _(none)_
    ← used by: `podcast_studio/tts.js`

### `public/skyscraper/`  (1 files)
- **data-hooks.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `purpconsole/`  (6 files)
- **__init__.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
- **__main__.py** `[py]`
    → wires to: `purpconsole/app.py`
    ← used by: _(none)_
- **_smoke.py** `[py]`
    → wires to: `purpconsole/app.py`
    ← used by: _(none)_
    ⤷ external: pathlib, asyncio, sys
- **app.py** `[py]`
    → wires to: `purpconsole/features.py`
    ← used by: `purpconsole/__main__.py`, `purpconsole/_smoke.py`, `purpconsole/run.py`
    ⤷ external: __future__, pathlib, textual, sys
- **features.py** `[py]`
    → wires to: _(none)_
    ← used by: `purpconsole/app.py`
    ⤷ external: __future__, dataclasses
- **run.py** `[py]`
    → wires to: `purpconsole/app.py`
    ← used by: _(none)_

### `puzzle-stream/apps/web/`  (2 files)
- **postcss.config.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **tailwind.config.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `python/`  (1 files)
- **faiss_sidecar.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, typing, json, os, sys, struct, numpy, faiss

### `refusal_ablation_probe/`  (1 files)
- **config.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: dataclasses, typing, enum

### `scripts/`  (21 files)
- **benchmark-providers.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, http
- **build-binary-index.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **build-safe.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, fs, path
- **checksum-vendor.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, crypto
- **code-index-fast.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **deep-audit.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, http, child_process
- **delegation-status.cjs** `[js]`
    → wires to: `lib/delegation-status.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **demo-factory.js** `[js]`
    → wires to: `lib/demo/product-factory.js`
    ← used by: _(none)_
- **ecc.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, path
- **heartbeat.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, child_process, fs
- **init-undefined.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **lora-train.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, pathlib, datasets, transformers, peft, trl, argparse, json, os, re, subprocess, sys, torch
- **model-sentinel.js** `[js]`
    → wires to: `lib/model-sentinel.js`
    ← used by: _(none)_
    ⤷ external: fs, path
- **nanoclaw.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, os, http, child_process, readline
- **panic-stop.js** `[js]`
    → wires to: `service_registry.js`
    ← used by: _(none)_
    ⤷ external: http, child_process
- **pm2-names.js** `[js]`
    → wires to: `service_registry.js`
    ← used by: _(none)_
- **tui-ask.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, fs, os, child_process, http
- **tui-ng.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: blessed, path, fs, node-fetch
- **tui.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, path, fs, readline
- **verify-api-spine.cjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http, fs, path, url
- **verify-llm-fallback.cjs** `[js]`
    → wires to: `lib/llm-provider.js`
    ← used by: _(none)_

### `scripts/windows/`  (5 files)
- **core-host.js** `[js]`
    → wires to: `lib/paths.js`
    ← used by: _(none)_
    ⤷ external: path, fs, child_process
- **python-service-host.js** `[js]`
    → wires to: `lib/paths.js`, `lib/runtime/pipeline-telemetry.js`
    ← used by: _(none)_
    ⤷ external: fs, net, path, child_process
- **tray-agent.js** `[js]`
    → wires to: `lib/paths.js`, `lib/runtime/computer-use.js`, `lib/runtime/voice-router.js`
    ← used by: _(none)_
    ⤷ external: crypto, fs, http, path
- **verify-windows-scripts.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: path, child_process
- **voice-session-host.js** `[js]`
    → wires to: `lib/child-registry.js`, `lib/paths.js`, `lib/runtime/settings-registry.js`
    ← used by: _(none)_
    ⤷ external: path

### `skills/`  (7 files)
- **companion_swarm.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: https
- **interactive_shell.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, os, fs, path, net
- **skill_manager.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **socket_rig.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: http
- **street_builder.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
- **task_manager.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **test_skill.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/arxiv/scripts/`  (1 files)
- **search_arxiv.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sys, urllib, xml

### `skills/axolotl/`  (1 files)
- **axolotl.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path

### `skills/bee/`  (1 files)
- **bee.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, crypto, child_process

### `skills/bunny/`  (1 files)
- **bunny.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/cactus/`  (1 files)
- **cactus.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process

### `skills/canvas/scripts/`  (1 files)
- **canvas_api.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: argparse, json, os, sys, requests

### `skills/chart/`  (1 files)
- **chart.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/child-registry-no-spawn-leak/scripts/`  (1 files)
- **spawn-audit.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, path

### `skills/chonk/`  (1 files)
- **chonk.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/ck/commands/`  (8 files)
- **forget.mjs** `[js]`
    → wires to: `skills/ck/commands/shared.mjs`
    ← used by: _(none)_
    ⤷ external: fs, path
- **info.mjs** `[js]`
    → wires to: `skills/ck/commands/shared.mjs`
    ← used by: _(none)_
- **init.mjs** `[js]`
    → wires to: `skills/ck/commands/shared.mjs`
    ← used by: _(none)_
    ⤷ external: fs, path
- **list.mjs** `[js]`
    → wires to: `skills/ck/commands/shared.mjs`
    ← used by: _(none)_
- **migrate.mjs** `[js]`
    → wires to: `skills/ck/commands/shared.mjs`
    ← used by: _(none)_
    ⤷ external: fs, path
- **resume.mjs** `[js]`
    → wires to: `skills/ck/commands/shared.mjs`
    ← used by: _(none)_
    ⤷ external: fs
- **save.mjs** `[js]`
    → wires to: `skills/ck/commands/shared.mjs`
    ← used by: _(none)_
    ⤷ external: fs, path
- **shared.mjs** `[js]`
    → wires to: _(none)_
    ← used by: `skills/ck/commands/forget.mjs`, `skills/ck/commands/info.mjs`, `skills/ck/commands/init.mjs`, `skills/ck/commands/list.mjs`, `skills/ck/commands/migrate.mjs`, `skills/ck/commands/resume.mjs`, `skills/ck/commands/save.mjs`
    ⤷ external: fs, path, os, child_process, crypto

### `skills/ck/hooks/`  (1 files)
- **session-start.mjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, os, child_process

### `skills/claw/`  (1 files)
- **claw.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, child_process, os

### `skills/comfyui/scripts/`  (10 files)
- **_common.py** `[py]`
    → wires to: _(none)_
    ← used by: `skills/comfyui/scripts/auto_fix_deps.py`, `skills/comfyui/scripts/check_deps.py`, `skills/comfyui/scripts/extract_schema.py`, `skills/comfyui/scripts/fetch_logs.py`, `skills/comfyui/scripts/health_check.py`, `skills/comfyui/scripts/run_batch.py`, `skills/comfyui/scripts/run_workflow.py`, `skills/comfyui/scripts/ws_monitor.py`
    ⤷ external: __future__, dataclasses, pathlib, typing, urllib, json, os, random, re, sys, time, uuid, requests
- **auto_fix_deps.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`, `skills/comfyui/scripts/check_deps.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, json, shutil, subprocess, sys
- **check_deps.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`
    ← used by: `skills/comfyui/scripts/auto_fix_deps.py`, `skills/comfyui/scripts/health_check.py`
    ⤷ external: __future__, pathlib, urllib, argparse, json, sys
- **extract_schema.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`
    ← used by: `skills/comfyui/scripts/run_batch.py`, `skills/comfyui/scripts/run_workflow.py`
    ⤷ external: __future__, pathlib, typing, argparse, json, sys
- **fetch_logs.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, sys
- **hardware_check.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, typing, json, os, platform, re, shutil, subprocess, sys, torch, argparse
- **health_check.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`, `skills/comfyui/scripts/check_deps.py`, `skills/comfyui/scripts/run_workflow.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, json, shutil, sys
- **run_batch.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`, `skills/comfyui/scripts/extract_schema.py`, `skills/comfyui/scripts/run_workflow.py`
    ← used by: _(none)_
    ⤷ external: __future__, concurrent, pathlib, argparse, itertools, json, sys
- **run_workflow.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`, `skills/comfyui/scripts/extract_schema.py`
    ← used by: `skills/comfyui/scripts/health_check.py`, `skills/comfyui/scripts/run_batch.py`
    ⤷ external: __future__, pathlib, typing, urllib, argparse, copy, json, sys, time, websocket
- **ws_monitor.py** `[py]`
    → wires to: `skills/comfyui/scripts/_common.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, urllib, argparse, json, struct, sys, websocket

### `skills/comfyui/tests/`  (6 files)
- **conftest.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, json, os, sys, pytest
- **test_check_deps.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, check_deps, re
- **test_cloud_integration.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, _common, check_deps, health_check, pytest, json
- **test_common.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, _common, pytest, requests, json
- **test_extract_schema.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, extract_schema
- **test_run_workflow.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, extract_schema, run_workflow

### `skills/continuous-learning-v2/scripts/`  (2 files)
- **instinct-cli.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, datetime, collections, typing, argparse, json, hashlib, os, subprocess, sys, re, urllib, fcntl
- **test_parse_instinct.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, types, unittest, importlib, io, json, os, sys, pytest, subprocess

### `skills/crow/`  (1 files)
- **crow.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, crypto

### `skills/darwinian-evolver/scripts/`  (2 files)
- **parrot_openrouter.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, openai, darwinian_evolver, argparse, os, sys, jinja2, json
- **show_snapshot.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, pickle, sys

### `skills/dcf-model/scripts/`  (1 files)
- **validate_dcf.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, datetime, sys, json, openpyxl

### `skills/domain-intel/scripts/`  (1 files)
- **domain_intel.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: concurrent, datetime, json, re, socket, ssl, sys, urllib

### `skills/dragon/`  (1 files)
- **dragon.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/drug-discovery/scripts/`  (2 files)
- **chembl_target.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sys, urllib
- **ro5_screen.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sys, urllib

### `skills/duck/`  (1 files)
- **duck.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/elephant/`  (1 files)
- **elephant.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path

### `skills/evm/scripts/`  (1 files)
- **evm_client.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: typing, argparse, json, os, sys, time, urllib, threading

### `skills/excalidraw/scripts/`  (1 files)
- **upload.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: cryptography, json, os, struct, sys, zlib, base64, urllib

### `skills/excel-author/scripts/`  (1 files)
- **recalc.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, json, shutil, subprocess, sys, tempfile

### `skills/fastmcp/scripts/`  (1 files)
- **scaffold_fastmcp.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse

### `skills/fitness-nutrition/scripts/`  (2 files)
- **body_calc.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sys, math
- **nutrition_search.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: sys, os, json, time, urllib

### `skills/fox/`  (1 files)
- **fox.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/ghost/`  (1 files)
- **ghost.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/gitnexus-explorer/scripts/`  (1 files)
- **proxy.mjs** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: node:http, node:fs, node:path

### `skills/godmode/scripts/`  (4 files)
- **auto_jailbreak.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, openai, os, json, time, yaml, inspect, argparse
- **godmode_race.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: concurrent, openai, os, re, time, argparse
- **load_godmode.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, os
- **parseltongue.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: re, base64, argparse

### `skills/google-workspace.bak/scripts/`  (4 files)
- **_hermes_home.py** `[py]`
    → wires to: _(none)_
    ← used by: `skills/google-workspace.bak/scripts/google_api.py`, `skills/google-workspace.bak/scripts/gws_bridge.py`, `skills/google-workspace.bak/scripts/setup.py`
    ⤷ external: __future__, pathlib, hermes_constants, os
- **google_api.py** `[py]`
    → wires to: `skills/google-workspace.bak/scripts/_hermes_home.py`
    ← used by: _(none)_
    ⤷ external: datetime, email, pathlib, google, googleapiclient, argparse, base64, json, os, shutil, subprocess, sys, mimetypes, io
- **gws_bridge.py** `[py]`
    → wires to: `skills/google-workspace.bak/scripts/_hermes_home.py`
    ← used by: _(none)_
    ⤷ external: datetime, pathlib, json, os, subprocess, sys, urllib
- **setup.py** `[py]`
    → wires to: `skills/google-workspace.bak/scripts/_hermes_home.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, googleapiclient, google, urllib, google_auth_oauthlib, argparse, json, os, subprocess, sys

### `skills/google-workspace/scripts/`  (4 files)
- **_hermes_home.py** `[py]`
    → wires to: _(none)_
    ← used by: `skills/google-workspace/scripts/google_api.py`, `skills/google-workspace/scripts/gws_bridge.py`, `skills/google-workspace/scripts/setup.py`
    ⤷ external: __future__, pathlib, hermes_constants, os
- **google_api.py** `[py]`
    → wires to: `skills/google-workspace/scripts/_hermes_home.py`
    ← used by: _(none)_
    ⤷ external: datetime, email, pathlib, google, googleapiclient, argparse, base64, json, os, shutil, subprocess, sys, mimetypes, io
- **gws_bridge.py** `[py]`
    → wires to: `skills/google-workspace/scripts/_hermes_home.py`
    ← used by: _(none)_
    ⤷ external: datetime, pathlib, json, os, subprocess, sys, urllib
- **setup.py** `[py]`
    → wires to: `skills/google-workspace/scripts/_hermes_home.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, googleapiclient, google, urllib, google_auth_oauthlib, argparse, json, os, shutil, subprocess, sys

### `skills/goop-sigil/`  (2 files)
- **detect_spaghetti.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path
- **exorcise_module.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, @babel

### `skills/goose/`  (1 files)
- **goose.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/gorilla/`  (1 files)
- **gorilla.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/guardian/`  (3 files)
- **security_control_api.js** `[js]`
    → wires to: `skills/guardian/security_scanner.js`, `skills/guardian/voice_security_handler.js`
    ← used by: _(none)_
    ⤷ external: express
- **security_scanner.js** `[js]`
    → wires to: _(none)_
    ← used by: `skills/guardian/security_control_api.js`, `skills/guardian/voice_security_handler.js`
    ⤷ external: fs, path, child_process
- **voice_security_handler.js** `[js]`
    → wires to: `skills/guardian/security_scanner.js`
    ← used by: `skills/guardian/security_control_api.js`
    ⤷ external: ws

### `skills/hawk/`  (1 files)
- **hawk.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/hermes-tts-providers/scripts/`  (1 files)
- **kokoro_tts.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: kokoro, sys, numpy, time

### `skills/hyperliquid/scripts/`  (1 files)
- **hyperliquid_client.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, collections, pathlib, typing, argparse, datetime, json, os, sys, time, urllib

### `skills/innovator/`  (1 files)
- **innovator.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: crypto

### `skills/jellyfish/`  (1 files)
- **jellyfish.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/kanban-video-orchestrator/scripts/`  (2 files)
- **bootstrap_pipeline.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, json, os, re, sys
- **monitor.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, collections, datetime, argparse, json, shutil, subprocess, sys, time

### `skills/karen/`  (1 files)
- **karen.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/kraken/`  (1 files)
- **kraken.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/lemur/`  (1 files)
- **lemur.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/linear/scripts/`  (1 files)
- **linear_api.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, typing, argparse, json, os, sys, urllib

### `skills/lunokio-avatar-control/scripts/`  (2 files)
- **lunokio_manager.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: socket, subprocess, sys, time, os, json, re
- **riko_control.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: socket, sys, time, json

### `skills/mantis/`  (1 files)
- **mantis.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/maps/scripts/`  (1 files)
- **maps_client.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: argparse, json, math, sys, time, urllib

### `skills/meme-generation/scripts/`  (1 files)
- **generate_meme.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: io, pathlib, PIL, json, os, sys, requests, urllib, time

### `skills/memento-flashcards/scripts/`  (2 files)
- **memento_cards.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, pathlib, argparse, csv, json, os, sys, tempfile, uuid
- **youtube_quiz.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: argparse, json, re, sys, youtube_transcript_api

### `skills/moth/`  (1 files)
- **moth.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/mushroom/`  (1 files)
- **mushroom.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/navigator/`  (1 files)
- **tools.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs, path, child_process

### `skills/numbers/`  (1 files)
- **numbers.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: fs

### `skills/ocr-and-documents/scripts/`  (2 files)
- **extract_marker.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: marker, pathlib, sys, os, json, shutil
- **extract_pymupdf.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, sys, json, pymupdf, pymupdf4llm

### `skills/octopus/`  (1 files)
- **octopus.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/openclaw-migration/scripts/`  (1 files)
- **openclaw_to_hermes.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, dataclasses, datetime, pathlib, typing, argparse, hashlib, json, os, re, shutil, yaml

### `skills/osint-investigation/scripts/`  (16 files)
- **_http.py** `[py]`
    → wires to: _(none)_
    ← used by: `skills/osint-investigation/scripts/fetch_courtlistener.py`, `skills/osint-investigation/scripts/fetch_gdelt.py`, `skills/osint-investigation/scripts/fetch_nyc_acris.py`, `skills/osint-investigation/scripts/fetch_ofac_sdn.py`, `skills/osint-investigation/scripts/fetch_opencorporates.py`, `skills/osint-investigation/scripts/fetch_sec_edgar.py`, `skills/osint-investigation/scripts/fetch_senate_ld.py`, `skills/osint-investigation/scripts/fetch_wayback.py`, `skills/osint-investigation/scripts/fetch_wikipedia.py`
    ⤷ external: __future__, json, os, time, urllib
- **_normalize.py** `[py]`
    → wires to: _(none)_
    ← used by: `skills/osint-investigation/scripts/entity_resolution.py`
    ⤷ external: __future__, re
- **build_findings.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, collections, pathlib, argparse, csv, json
- **entity_resolution.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_normalize.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, sys
- **fetch_courtlistener.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, os, sys, urllib
- **fetch_gdelt.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, sys, time, urllib
- **fetch_icij_offshore.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, io, os, re, sys, time, urllib, zipfile
- **fetch_nyc_acris.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, sys, urllib
- **fetch_ofac_sdn.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, collections, pathlib, argparse, csv, io, sys
- **fetch_opencorporates.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, os, re, sys, urllib
- **fetch_sec_edgar.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, os, re, sys
- **fetch_senate_ld.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, os, sys, time
- **fetch_usaspending.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, json, sys, time, urllib
- **fetch_wayback.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, sys, urllib
- **fetch_wikipedia.py** `[py]`
    → wires to: `skills/osint-investigation/scripts/_http.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, csv, re, sys, urllib
- **timing_analysis.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, collections, pathlib, argparse, csv, datetime, json, random, statistics

### `skills/oss-forensics/scripts/`  (1 files)
- **evidence-store.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: json, argparse, os, datetime, hashlib, sys

### `skills/owl/`  (1 files)
- **owl.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/p5js/scripts/`  (1 files)
- **export-frames.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: puppeteer, path, fs

### `skills/panda/`  (1 files)
- **panda.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/parrot/`  (1 files)
- **parrot.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, fs

### `skills/penguin/`  (1 files)
- **penguin.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/phoenix/`  (1 files)
- **phoenix.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/pixel-art/scripts/`  (4 files)
- **__init__.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
- **palettes.py** `[py]`
    → wires to: _(none)_
    ← used by: `skills/pixel-art/scripts/pixel_art.py`
    ⤷ external: PIL
- **pixel_art.py** `[py]`
    → wires to: `skills/pixel-art/scripts/palettes.py`, `skills/pixel-art/scripts/pixel_art.py`
    ← used by: `skills/pixel-art/scripts/pixel_art.py`
    ⤷ external: PIL, argparse
- **pixel_art_video.py** `[py]`
    → wires to: `skills/pixel-art/scripts/pixel_art_video.py`
    ← used by: `skills/pixel-art/scripts/pixel_art_video.py`
    ⤷ external: PIL, math, os, random, shutil, subprocess, tempfile, argparse

### `skills/polymarket/scripts/`  (1 files)
- **polymarket.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, json, sys, urllib

### `skills/powerpoint/scripts/`  (3 files)
- **__init__.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
- **add_slide.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, re, shutil, sys
- **clean.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, sys, defusedxml, re

### `skills/powerpoint/scripts/office/`  (1 files)
- **pack.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, validators, argparse, sys, shutil, tempfile, zipfile, defusedxml

### `skills/powerpoint/scripts/office/helpers/`  (3 files)
- **__init__.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
- **merge_runs.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, defusedxml
- **simplify_redlines.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, xml, zipfile, defusedxml

### `skills/rabbit/`  (1 files)
- **rabbit.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/raven/`  (1 files)
- **raven.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/robot/`  (1 files)
- **robot.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/scientist/`  (1 files)
- **scientist.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: crypto

### `skills/shark/`  (1 files)
- **shark.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: os

### `skills/snake/`  (1 files)
- **snake.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/socket-rig/references/`  (1 files)
- **lunokio_bridge.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: typing, dataclasses, asyncio, json, base64, os, sys, time, threading, websockets, httpx, http, socketserver, urllib, traceback

### `skills/solana/scripts/`  (1 files)
- **solana_client.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: typing, argparse, json, os, sys, time, urllib

### `skills/spider/`  (1 files)
- **spider.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: child_process, path, fs, os, playwright, puppeteer-core

### `skills/stocks/scripts/`  (1 files)
- **stocks_client.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: datetime, http, argparse, json, os, sys, time, urllib

### `skills/telephony/scripts/`  (1 files)
- **telephony.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: __future__, dataclasses, datetime, email, html, pathlib, typing, argparse, base64, json, os, re, sys, urllib, yaml

### `skills/turtle/`  (1 files)
- **turtle.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/void/`  (1 files)
- **void.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/wallet-recovery/references/`  (1 files)
- **scan_parallel.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: subprocess

### `skills/wallet-recovery/scripts/`  (1 files)
- **scan_telegram.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: pathlib, json

### `skills/watchers/scripts/`  (4 files)
- **_watermark.py** `[py]`
    → wires to: `skills/watchers/scripts/_watermark.py`
    ← used by: `skills/watchers/scripts/_watermark.py`, `skills/watchers/scripts/watch_github.py`, `skills/watchers/scripts/watch_http_json.py`, `skills/watchers/scripts/watch_rss.py`
    ⤷ external: __future__, pathlib, typing, json, os
- **watch_github.py** `[py]`
    → wires to: `skills/watchers/scripts/_watermark.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, json, os, re, sys, urllib
- **watch_http_json.py** `[py]`
    → wires to: `skills/watchers/scripts/_watermark.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, argparse, json, sys, urllib
- **watch_rss.py** `[py]`
    → wires to: `skills/watchers/scripts/_watermark.py`
    ← used by: _(none)_
    ⤷ external: __future__, pathlib, xml, argparse, sys, urllib

### `skills/wolf/`  (1 files)
- **wolf.js** `[js]`
    → wires to: _(none)_
    ← used by: _(none)_

### `skills/youtube-content/scripts/`  (1 files)
- **fetch_transcript.py** `[py]`
    → wires to: _(none)_
    ← used by: _(none)_
    ⤷ external: youtube_transcript_api, argparse, json, re, sys

