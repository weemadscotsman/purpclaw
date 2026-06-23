# PURPCLAW Stack Map (v3 — py imports + dynamic dispatch resolved)

## Roles
- skill: 172
- lib: 136
- module: 119
- service-daemon: 44
- cli-command: 42
- script: 24
- test: 20
- ui: 9
- cli-entry: 5

## TRUE orphans (live dir, no importer, no runtime, no dynamic dispatch): 62
- `_wire.js` [module]
- `boston_analysis.py` [module]
- `companion-chorus/main.js` [module]
- `companion-chorus/test-ai.js` [module]
- `companion-chorus/test-api.js` [module]
- `create_db.py` [module]
- `diag_audio.py` [module]
- `eslint.config.mjs` [module]
- `find_pulse.py` [module]
- `gacha.py` [module]
- `lib/__tests__/accuracy-fish/claim_extractor.test.js` [lib]
- `lib/agent-personas.js` [lib]
- `lib/agent-session.js` [lib]
- `lib/agent-tools-file.js` [lib]
- `lib/api-harness-kernel.js` [lib]
- `lib/code-tools.js` [lib]
- `lib/goop-playground/squirrel.js` [lib]
- `lib/governance-audit.js` [lib]
- `lib/llm-status.js` [lib]
- `lib/mallory/index.js` [lib]
- `lib/mochi-state.js` [lib]
- `lib/nvidia/nim-skills.js` [lib]
- `lib/odysseus-scorecard.js` [lib]
- `lib/omni/feature-registry.js` [lib]
- `lib/omni/generate-agent-docs.js` [lib]
- `lib/omni/patch-governor.js` [lib]
- `lib/omni/queue-action-required.js` [lib]
- `lib/omni/truth-scanner.js` [lib]
- `lib/orchestrator-hardening.js` [lib]
- `lib/persona-forge.js` [lib]
- `lib/personality.js` [lib]
- `lib/proactive-maintenance.js` [lib]
- `lib/providers/registry.js` [lib]
- `lib/rate-limit.js` [lib]
- `lib/recursive/agent-scores.js` [lib]
- `lib/runtime/policy-engine.js` [lib]
- `lib/runtime/preprompt-compiler.js` [lib]
- `lib/sampler.js` [lib]
- `lib/secret-redactor.js` [lib]
- `lib/self-evolution-loop.js` [lib]
- `lib/skill-bridge.js` [lib]
- `lib/snapshot.js` [lib]
- `lib/spaghetti-audit.js` [lib]
- `lib/supervisor.js` [lib]
- `lib/survivor_router.js` [lib]
- `lib/tools-cli-anything.js` [lib]
- `lib/tools-gui.js` [lib]
- `lib/training-ingest.js` [lib]
- `lib/verify-tools.js` [lib]
- `lib/workers/purp-worker.js` [lib]
- `mimi_speak.py` [module]
- `podcast_studio/launch.js` [module]
- `podcast_studio/podcast_runner.js` [module]
- `postcss.config.mjs` [module]
- `python/faiss_sidecar.py` [module]
- `replace.js` [module]
- `scrape_stdu.py` [module]
- `scrape_stdu_news.py` [module]
- `screen-manager.js` [module]
- `shaman_prompts.js` [module]
- `stress.cjs` [module]
- `voice_stt.py` [module]

## Detritus (scratch/legacy/catalog — cleanup candidates): 44

### `_api-mega-list/API-mega-list-main/settings/`
- fetch_apify_actors.js [module] detritus(scratch/legacy) →0 ←0
- generate_readme_clean.js [module] detritus(scratch/legacy) →0 ←0

### `_scratch/`
- dup_finder.py [module] detritus(scratch/legacy) →0 ←0
- gap-report.js [module] detritus(scratch/legacy) →1 ←0
- run_mission_direct.js [module] wired:module →1 ←0 ports:7790

### `_scratch/selftest/`
- hello.js [module] detritus(scratch/legacy) →0 ←0

### `_scratch/`
- test_db.js [test] wired:test →0 ←0
- test_hud.js [test] wired:test →0 ←0
- test_sandbox.js [test] wired:test →0 ←0

### `_scratch/turbovec-pack/purpclaw_turbovec_integration/bin/`
- purpclaw-vector-bench.js [module] detritus(scratch/legacy) →1 ←0

### `_scratch/turbovec-pack/purpclaw_turbovec_integration/lib/vector/providers/`
- turbovecProvider.js [module] wired:imported →0 ←1

### `_scratch/turbovec-pack/purpclaw_turbovec_integration/python/`
- turbovec_sidecar.py [module] detritus(scratch/legacy) →0 ←0

### `(root)/`
- _wire.js [module] ORPHAN? →0 ←0

### `ablation_probes/`
- refusal_weight_probe_7B.py [module] detritus(scratch/legacy) →0 ←0

### `(root)/`
- agent_routing_matrix.js [module] wired:imported →0 ←1
- agent_score.js [module] wired:imported →0 ←4
- agent_tower.js [service-daemon] wired:imported →4 ←4 ports:7790,7782,7880,7780

### `agent_work/bee/`
- postcss.config.mjs [module] detritus(scratch/legacy) →0 ←0

### `agent_work/`
- blast_radius_helper.js [module] detritus(scratch/legacy) →0 ←0

### `agent_work/robot/`
- dashboard_live_update_test.js [test] wired:test →0 ←0 ports:7790,7782,7783,7780

### `apis for agents/settings/`
- fetch_apify_actors.js [module] detritus(scratch/legacy) →0 ←0
- generate_readme_clean.js [module] detritus(scratch/legacy) →0 ←0

### `app/public/ui/`
- app.js [ui] wired:ui →0 ←0 ports:7780,7790
- chat-hooks.js [ui] wired:ui →0 ←0 ports:7780,7885
- cinematic.js [ui] wired:ui →0 ←0
- command-palette.js [ui] wired:ui →0 ←0
- data-hooks.js [ui] wired:ui →0 ←0 ports:7780,7782,7783,7784,7790,7791,7885,7890,7781
- extras.js [ui] wired:ui →0 ←0
- panels.js [ui] wired:ui →0 ←0 ports:7784,7782,7791,7885
- skyscraper.js [ui] wired:ui →0 ←0
- tweaks-panel.js [ui] wired:ui →0 ←0

### `(root)/`
- autoDream.py [module] wired:imported →1 ←2 ports:7880
- autonomous_diagnostics.py [module] wired:imported →0 ←1 ports:7779,7781,7780

### `bin/`
- MISSION.js [cli-entry] wired:cli-entry →0 ←0
- coding-eval.js [cli-entry] wired:cli-entry →0 ←0 ports:3030
- model-discover.js [cli-entry] wired:cli-entry →0 ←0
- purpclaw-vector-bench.js [cli-entry] wired:cli-entry →0 ←0
- purpclaw.js [cli-entry] wired:cli-entry →6 ←0 ports:7881,7784,7780,7790,7782,7783,7880,7885,7890,7781,7791,7889,7897

### `(root)/`
- boot.js [module] wired:module →4 ←0 ports:7782,7783,7780,7790,7781,7779,7784
- boston_analysis.py [module] ORPHAN? →0 ←0
- cognitive_spine.py [module] wired:module →6 ←0 ports:7880

### `companion-chorus/`
- bridge.js [module] wired:module →4 ←0 ports:7782
- main.js [module] ORPHAN? →5 ←0

### `companion-chorus/src/`
- constants.js [module] wired:imported →0 ←3
- gacha.js [module] wired:imported →1 ←2
- minimax.js [module] wired:imported →0 ←3
- sprites.js [module] wired:imported →0 ←1
- voice.js [module] wired:imported →0 ←2

### `companion-chorus/`
- test-ai.js [module] ORPHAN? →1 ←0
- test-api.js [module] ORPHAN? →0 ←0

### `(root)/`
- companion_swarm.js [module] wired:imported →0 ←1
- create_db.py [module] ORPHAN? →0 ←0
- diag_audio.py [module] ORPHAN? →0 ←0
- digital_shaman.js [module] wired:imported →1 ←1

### `docs/legacy/ghostbusters-2026-06-06/`
- ball_to_rig_bridge.js [module] detritus(scratch/legacy) →0 ←0
- browser_voice_commands.js [module] detritus(scratch/legacy) →1 ←0
- clap-detector.js [module] detritus(scratch/legacy) →0 ←0
- crossbar_integration.js [module] wired:module →0 ←0 ports:7782,7783
- dig_convos.py [module] detritus(scratch/legacy) →0 ←0
- dig_convos2.py [module] detritus(scratch/legacy) →0 ←0
- dig_convos3.py [module] detritus(scratch/legacy) →0 ←0
- ethics_hooks.js [module] detritus(scratch/legacy) →0 ←0
- kimi_client.js [module] detritus(scratch/legacy) →0 ←0
- launch_clean.js [module] wired:module →0 ←0 ports:7780,7790,7781,7779,7777
- loop_of_shame.py [module] detritus(scratch/legacy) →0 ←0
- memory_matrix.py [module] wired:module →0 ←0 ports:7780
- mood_engine.js [module] wired:imported →0 ←1
- playwright_compatibility.js [module] wired:imported →0 ←1
- process-leash.js [module] wired:module →0 ←0 ports:7782,7799
- purpclaw.js [module] wired:module →0 ←0 ports:7780,7790,7782,7783,7784,7781,7791
- purpclaw_turing_core.js [service-daemon] wired:service-daemon →2 ←0 ports:7780,7779,7781
- task_decomposer.js [module] detritus(scratch/legacy) →0 ←0
- turing_face_driver.js [module] wired:imported →0 ←1

### `docs/legacy/`
- launch_detached.js [module] wired:module →0 ←0 ports:7780,7781

### `docs/legacy/root-cleanup-2026-06-06/`
- _fix_quotes.js [module] detritus(scratch/legacy) →0 ←0
- gen_api.js [module] detritus(scratch/legacy) →0 ←0
- run_node.js [module] detritus(scratch/legacy) →0 ←0
- run_py.js [module] detritus(scratch/legacy) →0 ←0
- smart_demo.js [module] detritus(scratch/legacy) →0 ←0
- terminal-fly.js [service-daemon] wired:service-daemon →0 ←0 ports:7799,7782
- tool_diagnostic.js [service-daemon] wired:service-daemon →0 ←0 ports:7777
- visualizer_server.js [service-daemon] wired:service-daemon →0 ←0 ports:3030

### `docs/legacy/`
- voice_bridge_7779.js [service-daemon] wired:service-daemon →0 ←0 ports:7779,7780,7781

### `(root)/`
- ecosystem.config.js [module] wired:module →0 ←0 ports:3030,7890,7897,7790,7892,7885,7898,7784,7782,7880,7779,7777
- eslint.config.mjs [module] ORPHAN? →0 ←0

### `eval/`
- __init__.py [test] wired:test →0 ←0

### `eval/benches/`
- __init__.py [test] wired:test →0 ←0
- eventbus_bench.py [test] wired:test →0 ←0
- governance_bench.py [test] wired:test →0 ←0
- memory_bench.py [test] wired:test →0 ←0
- orchestrator_bench.py [test] wired:test →0 ←0
- pool_bench.py [test] wired:test →0 ←0

### `eval/`
- harness.py [test] wired:test →0 ←0

### `eval/suites/`
- __init__.py [test] wired:test →0 ←0
- chaos.py [test] wired:test →0 ←0
- regression.py [test] wired:test →0 ←0
- smoke.py [test] wired:test →0 ←0 ports:7784,7885,7880,7777,7779

### `(root)/`
- find_pulse.py [module] ORPHAN? →0 ←0
- gacha.py [module] ORPHAN? →0 ←0
- gatekeeper.js [service-daemon] wired:service-daemon →0 ←0 ports:7791
- harness_service.js [service-daemon] wired:service-daemon →1 ←0 ports:7798
- lcd_bridge_server.py [service-daemon] wired:service-daemon →0 ←0 ports:7780
- lcd_log_monitor.py [module] wired:module →0 ←0 ports:7780

### `lib/__tests__/accuracy-fish/`
- claim_extractor.test.js [lib] ORPHAN? →1 ←0

### `lib/`
- accuracy-fish.js [lib] wired:imported →0 ←2
- agent-loop.js [lib] wired:imported →6 ←4
- agent-personas.js [lib] ORPHAN? →0 ←0
- agent-session.js [lib] ORPHAN? →0 ←0
- agent-tools-file.js [lib] ORPHAN? →0 ←0
- api-harness-kernel.js [lib] ORPHAN? →8 ←0
- api-mega-list.js [lib] wired:imported →0 ←1
- ast-dependency-graph.js [lib] wired:imported →0 ←1
- autotune.js [lib] wired:imported →0 ←1

### `lib/business/`
- operations.js [lib] wired:imported →1 ←1
- store.js [lib] wired:imported →0 ←3
- twilio.js [lib] wired:imported →1 ←1

### `lib/`
- capability-registry.js [lib] wired:imported →0 ←1 ports:7782,7783,7780,7790,7784,7791,7898,7880,7779,7892,7792,7885,7881,7890,7897,7798,7799
- chaos-campaign.js [lib] wired:imported →1 ←2 ports:7780
- chat-agent.js [lib] wired:imported →3 ←1
- child-registry.js [lib] wired:imported →0 ←28
- code-tools.js [lib] ORPHAN? →0 ←0
- cognitive-client.js [lib] wired:imported →0 ←1 ports:7880

### `lib/commands/`
- architecture.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7780,7782,7783,7784,7790,7791,7881,7885,7890,7897,7880,7892,7779,7777,7889,7781,7792
- ask.js [cli-command] wired:dynamic-dispatch →5 ←0
- autofix-pr.js [cli-command] wired:dynamic-dispatch →0 ←0
- autoresearch.js [cli-command] wired:dynamic-dispatch →0 ←0
- bigboss.js [cli-command] wired:imported →5 ←1 ports:7780
- browser.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7780
- bughunt.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7791
- business.js [cli-command] wired:dynamic-dispatch →3 ←0
- claudecode.js [cli-command] wired:dynamic-dispatch →2 ←0
- code.js [cli-command] wired:imported →1 ←1
- cognition.js [cli-command] wired:dynamic-dispatch →0 ←0
- ctx-viz.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7782,7784,7790,7881,7885,7783,7890
- deploy.js [cli-command] wired:dynamic-dispatch →1 ←0 ports:7780,7790,7880
- evolve.js [cli-command] wired:dynamic-dispatch →2 ←0
- gc.js [cli-command] wired:dynamic-dispatch →0 ←0
- grow.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7885,7880
- harness.js [cli-command] wired:dynamic-dispatch →2 ←0 ports:7798
- harvest.js [cli-command] wired:dynamic-dispatch →3 ←0
- heal.js [cli-command] wired:dynamic-dispatch →1 ←0
- identity.js [cli-command] wired:dynamic-dispatch →1 ←0
- intelligence.js [cli-command] wired:dynamic-dispatch →0 ←0
- llm.js [cli-command] wired:dynamic-dispatch →0 ←0
- onboard.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7885
- open.js [cli-command] wired:dynamic-dispatch →1 ←0
- overview.js [cli-command] wired:dynamic-dispatch →0 ←0
- parity.js [cli-command] wired:dynamic-dispatch →0 ←0
- plan.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7784
- pocket.js [cli-command] wired:dynamic-dispatch →5 ←0 ports:7780
- ponytail.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7777
- remotion.js [cli-command] wired:dynamic-dispatch →2 ←0
- roster.js [cli-command] wired:dynamic-dispatch →0 ←0
- safe-start.js [cli-command] wired:imported →0 ←2
- safe-stop.js [cli-command] wired:dynamic-dispatch →1 ←0
- services.js [cli-command] wired:dynamic-dispatch →0 ←0
- setup.js [cli-command] wired:imported →1 ←1
- smoke.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7782,7784,7790,7780,7885,7881,7897,7880
- telemetry.js [cli-command] wired:dynamic-dispatch →1 ←0
- teleport.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7881,7885,7784
- thringlets.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7799
- tour.js [cli-command] wired:dynamic-dispatch →2 ←0 ports:7780
- training.js [cli-command] wired:dynamic-dispatch →1 ←0
- workers.js [cli-command] wired:dynamic-dispatch →0 ←0 ports:7897,7790

### `lib/`
- context-bus.js [service-daemon] wired:service-daemon →0 ←0 ports:7782,7881
- context-packet.js [lib] wired:imported →0 ←1
- deep-audit.js [lib] wired:imported →7 ←1 ports:7780,7782,7783,7784,7790,7791,7880,7881,7885,7890
- deep-research-group.js [lib] wired:imported →4 ←2
- delegation-status.js [lib] wired:imported →0 ←1

### `lib/demo/`
- product-factory.js [lib] wired:imported →3 ←1 ports:7784,7782,7780,7790,7791,7881

### `lib/`
- doctor.js [lib] wired:imported →1 ←1 ports:7780,7782,7783,7784,7790,7791,7881,7885,7890,7880,3030
- embeddings.js [lib] wired:imported →0 ←1

### `lib/evolution/`
- mutator.js [lib] wired:imported →0 ←3
- skill-forge.js [lib] wired:imported →1 ←1

### `lib/`
- feature-parity.js [lib] wired:imported →0 ←1
- gate-pipeline.js [lib] wired:imported →0 ←1

### `lib/gateways/`
- discord.js [service-daemon] wired:service-daemon →0 ←0 ports:7780
- email.js [service-daemon] wired:service-daemon →0 ←0 ports:7780,7798
- slack.js [service-daemon] wired:service-daemon →0 ←0 ports:7780
- telegram.js [service-daemon] wired:service-daemon →0 ←0 ports:7780

### `lib/goop-playground/`
- goop-playground.js [service-daemon] wired:service-daemon →2 ←0
- squirrel.js [lib] ORPHAN? →0 ←0

### `lib/`
- governance-audit.js [lib] ORPHAN? →0 ←0
- governance.js [lib] wired:imported →0 ←1

### `lib/harness/`
- benchmark.js [lib] wired:imported →3 ←2 ports:7798,7799
- engine.js [lib] wired:imported →7 ←4 ports:7790,7784,7783,7782,7780

### `lib/harvest/`
- crawler.js [lib] wired:imported →0 ←1
- extractors.js [lib] wired:imported →1 ←1
- indexer.js [lib] wired:imported →0 ←1

### `lib/`
- identity.js [lib] wired:imported →0 ←2
- idle-engine.js [lib] wired:imported →3 ←1 ports:7880

### `lib/imagegen/`
- gateway.js [service-daemon] wired:service-daemon →0 ←0
- video_engine.js [lib] wired:imported →0 ←1

### `lib/`
- intelligence-spine.js [lib] wired:lib →0 ←0 ports:7880,7885
- job-contract.js [lib] wired:imported →0 ←3
- llm-provider.js [lib] wired:imported →1 ←17
- llm-status.js [lib] ORPHAN? →1 ←0

### `lib/mallory/`
- index.js [lib] ORPHAN? →0 ←0

### `lib/`
- mcp.js [lib] wired:imported →2 ←2
- memory-client.js [lib] wired:imported →0 ←5 ports:7880
- memory-consistency.js [lib] wired:imported →0 ←2
- mochi-sprites.js [lib] wired:imported →0 ←2
- mochi-state.js [lib] ORPHAN? →2 ←0
- mochi-statusbar.js [lib] wired:lib →1 ←0 ports:7885,7892
- mochi.js [lib] wired:lib →1 ←0 ports:7885
- model-sentinel.js [lib] wired:imported →2 ←1

### `lib/nvidia/`
- nim-skills.js [lib] ORPHAN? →0 ←0

### `lib/`
- odysseus-scorecard.js [lib] ORPHAN? →0 ←0

### `lib/omni/`
- feature-registry.js [lib] ORPHAN? →0 ←0
- generate-agent-docs.js [lib] ORPHAN? →0 ←0
- omnicode-adapter.js [lib] wired:imported →0 ←1
- patch-governor.js [lib] ORPHAN? →1 ←0
- provider-integrity.js [lib] wired:lib →0 ←0 ports:3030
- queue-action-required.js [lib] ORPHAN? →0 ←0
- truth-scanner.js [lib] ORPHAN? →0 ←0

### `lib/`
- omnicode-bridge.js [lib] wired:imported →0 ←3
- orchestrator-hardening.js [lib] ORPHAN? →0 ←0
- parseltongue.js [lib] wired:imported →0 ←1
- paths.js [lib] wired:imported →0 ←10
- persona-forge.js [lib] ORPHAN? →0 ←0
- personality.js [lib] ORPHAN? →0 ←0
- pocket-updater.js [lib] wired:imported →2 ←1
- pocket-vault.js [lib] wired:imported →0 ←2
- proactive-maintenance.js [lib] ORPHAN? →0 ←0
- provider_health.js [lib] wired:imported →0 ←1 ports:7784

### `lib/providers/`
- anthropic-messages.js [lib] wired:imported →0 ←1
- hermes-cli.js [lib] wired:imported →0 ←1
- openai-responses.js [lib] wired:imported →0 ←1
- registry.js [lib] ORPHAN? →3 ←0

### `lib/`
- rate-limit.js [lib] ORPHAN? →0 ←0
- rate-limiter.js [lib] wired:imported →0 ←1
- reasoning-loop.js [service-daemon] wired:service-daemon →1 ←0 ports:7892
- reasoning-tick.js [lib] wired:imported →0 ←1 ports:7885

### `lib/recursive/`
- agent-scores.js [lib] ORPHAN? →0 ←0

### `lib/`
- release-sign.js [lib] wired:imported →0 ←1

### `lib/runtime/`
- computer-use.js [lib] wired:imported →5 ←3
- pipeline-telemetry.js [lib] wired:imported →1 ←2
- policy-engine.js [lib] ORPHAN? →0 ←0
- ports.js [lib] wired:imported →0 ←1 ports:7780,3030,7897,7781,7782,7783,7784,7790,7791,7799,7880,7885,7798
- preprompt-compiler.js [lib] ORPHAN? →2 ←0
- provider-config.js [lib] wired:imported →0 ←1
- provider-router.js [lib] wired:imported →2 ←1
- settings-registry.js [lib] wired:imported →2 ←3 ports:7799
- voice-router.js [lib] wired:imported →2 ←1 ports:7784,7782

### `lib/`
- sampler.js [lib] ORPHAN? →0 ←0

### `lib/scheduler/`
- calendar.js [lib] wired:imported →1 ←1
- nl-cron.js [lib] wired:imported →0 ←1
- runner.js [service-daemon] wired:service-daemon →1 ←0 ports:7780,7799

### `lib/`
- screen-look.js [lib] wired:imported →2 ←2 ports:7779
- secret-redactor.js [lib] ORPHAN? →0 ←0
- self-context.js [lib] wired:imported →0 ←2 ports:7780,7781,7782,7783,7784,7790,7792,7880,7890,7885
- self-evolution-loop.js [lib] ORPHAN? →3 ←0
- session-store.js [lib] wired:imported →0 ←2
- signed-manifest.js [lib] wired:imported →0 ←1
- skill-bridge.js [lib] ORPHAN? →1 ←0
- smith-neo.js [lib] wired:imported →0 ←3
- snapshot.js [lib] ORPHAN? →0 ←0
- space-governor.js [lib] wired:imported →0 ←1 ports:7777,7779,7780,7781,7782,7783,7784,7790,7791,7792,7880,7881,7885,7889,7890,7892,7897
- spaghetti-audit.js [lib] ORPHAN? →0 ←0
- spend-gate.js [lib] wired:imported →0 ←4
- stm.js [lib] wired:imported →0 ←1

### `lib/stt/`
- gateway.js [service-daemon] wired:service-daemon →0 ←0

### `lib/`
- supervisor.js [lib] ORPHAN? →1 ←0
- survivor_router.js [lib] ORPHAN? →1 ←0
- telemetry.js [lib] wired:imported →0 ←1

### `lib/thringlets/`
- archetypes.js [lib] wired:imported →0 ←1
- engine.js [lib] wired:imported →2 ←2
- runtime-observer.js [lib] wired:imported →1 ←1 ports:7782,7798,7780,7784,7790,7783,7791
- storage.js [lib] wired:imported →0 ←1 ports:7783

### `lib/`
- tools-cli-anything.js [lib] ORPHAN? →1 ←0
- tools-gui.js [lib] ORPHAN? →3 ←0
- tools-pc.js [lib] wired:imported →1 ←1
- tools-remotion.js [lib] wired:imported →1 ←1
- tools-windows-mcp.js [lib] wired:imported →1 ←1

### `lib/tools/`
- index.js [lib] wired:imported →11 ←10 ports:7799,7784
- skills-registry.js [lib] wired:imported →1 ←3

### `lib/`
- training-buffer.js [lib] wired:imported →0 ←2
- training-ingest.js [lib] ORPHAN? →0 ←0

### `lib/training/`
- personal-dataset.js [lib] wired:imported →0 ←1

### `lib/tts/`
- gateway.js [service-daemon] wired:service-daemon →0 ←0 ports:7799

### `lib/`
- user-feedback.js [lib] wired:imported →0 ←2

### `lib/vector/`
- index.js [lib] wired:imported →1 ←1

### `lib/vector/providers/`
- faissProvider.js [lib] wired:imported →0 ←1

### `lib/`
- verify-tools.js [lib] ORPHAN? →0 ←0
- voice-client.js [lib] wired:lib →0 ←0 ports:7781
- whoami.js [lib] wired:imported →2 ←2 ports:7780,7790,7880
- worker-auth.js [lib] wired:imported →0 ←2
- worker-pool.js [lib] wired:lib →2 ←0 ports:7782

### `lib/workers/`
- http-worker.js [lib] wired:lib →0 ←0 ports:7897
- purp-worker.js [lib] ORPHAN? →0 ←0
- ssh-worker.js [lib] wired:imported →0 ←1 ports:7790

### `lib/`
- workspace-awareness.js [lib] wired:imported →0 ←1

### `(root)/`
- locked_interfaces.js [module] wired:imported →0 ←1
- memory_matrix.py [module] wired:imported →0 ←3 ports:7780
- memory_matrix_v2.py [module] wired:imported →3 ←2 ports:7880
- metrics_aggregator.js [service-daemon] wired:service-daemon →1 ←0 ports:7890,7782
- mimi_speak.py [module] ORPHAN? →0 ←0

### `mochi/menu_mochi_extension/`
- background.js [module] detritus(scratch/legacy) →0 ←0
- content.js [module] detritus(scratch/legacy) →0 ←0
- popup.js [module] detritus(scratch/legacy) →0 ←0

### `mochi/`
- mochi-sprites.js [module] wired:imported →0 ←1
- mochi.js [module] wired:module →1 ←0 ports:7885

### `(root)/`
- modal_logic_engine.py [module] wired:imported →0 ←1
- music_analysis_service.py [service-daemon] wired:service-daemon →0 ←0 ports:7782
- neuro_symbolic_bridge.py [service-daemon] wired:imported →2 ←2 ports:7784

### `no-spaghett/`
- eslint.config.mjs [module] detritus(scratch/legacy) →0 ←0
- ls.js [module] detritus(scratch/legacy) →0 ←0
- ls2.js [module] detritus(scratch/legacy) →0 ←0
- ls3.js [module] detritus(scratch/legacy) →0 ←0
- postcss.config.mjs [module] detritus(scratch/legacy) →0 ←0

### `no-spaghett/skills/goop-sigil/`
- exorcise_module.js [module] detritus(scratch/legacy) →0 ←0

### `(root)/`
- orchestrator.js [service-daemon] wired:service-daemon →2 ←0 ports:7784,7782,7783,7780,7790,7781,7898

### `pocket/`
- detect.py [module] wired:module →0 ←0 ports:7780,7790,7880,7890

### `pocket/guide/`
- play.py [module] detritus(scratch/legacy) →0 ←0

### `podcast_studio/`
- config.js [module] wired:imported →0 ←4
- episode_manager.js [service-daemon] wired:imported →4 ←1 ports:7890
- launch.js [module] ORPHAN? →1 ←0
- llm_service.js [service-daemon] wired:imported →0 ←2
- podcast_runner.js [module] ORPHAN? →6 ←0
- shared_log.js [module] wired:imported →0 ←4
- topic_picker.js [module] wired:imported →2 ←2
- tts.js [module] wired:imported →1 ←1
- turn_manager.js [module] wired:imported →2 ←1
- utils.js [module] wired:imported →0 ←1

### `(root)/`
- pool_service.js [service-daemon] wired:service-daemon →0 ←0 ports:7885
- postcss.config.mjs [module] ORPHAN? →0 ←0

### `public/skyscraper/`
- data-hooks.js [module] wired:module →0 ←0 ports:7780,7782,7783,7784,7790,7791,7880,7889,7898

### `purpconsole/`
- __init__.py [module] detritus(scratch/legacy) →0 ←0
- __main__.py [module] detritus(scratch/legacy) →1 ←0
- _smoke.py [module] detritus(scratch/legacy) →1 ←0
- app.py [module] wired:imported →1 ←3
- features.py [module] wired:imported →0 ←1
- run.py [module] detritus(scratch/legacy) →1 ←0

### `puzzle-stream/apps/web/`
- postcss.config.js [module] detritus(scratch/legacy) →0 ←0
- tailwind.config.js [module] detritus(scratch/legacy) →0 ←0

### `python/`
- faiss_sidecar.py [module] ORPHAN? →0 ←0

### `refusal_ablation_probe/`
- config.py [module] detritus(scratch/legacy) →0 ←0

### `(root)/`
- replace.js [module] ORPHAN? →0 ←0
- scrape_stdu.py [module] ORPHAN? →0 ←0
- scrape_stdu_news.py [module] ORPHAN? →0 ←0
- scrape_zhihu.py [module] wired:module →0 ←0 ports:7890
- screen-manager.js [module] ORPHAN? →1 ←0

### `scripts/`
- benchmark-providers.js [script] wired:script →0 ←0
- build-binary-index.js [script] wired:script →0 ←0
- build-safe.js [script] wired:script →0 ←0
- checksum-vendor.js [script] wired:script →0 ←0
- code-index-fast.js [script] wired:script →0 ←0
- deep-audit.js [script] wired:script →0 ←0 ports:3030
- delegation-status.cjs [script] wired:script →1 ←0
- demo-factory.js [script] wired:script →1 ←0
- heartbeat.js [script] wired:script →0 ←0 ports:3030,7880
- init-undefined.js [script] wired:script →0 ←0
- lora-train.py [script] wired:script →0 ←0
- model-sentinel.js [script] wired:script →1 ←0
- nanoclaw.js [script] wired:script →0 ←0 ports:7784,7880
- panic-stop.js [script] wired:script →1 ←0 ports:7790
- pm2-names.js [script] wired:script →1 ←0
- tui-ask.js [script] wired:script →0 ←0 ports:7780
- tui-ng.js [script] wired:script →0 ←0 ports:7780,7790,7784
- tui.js [script] wired:script →0 ←0 ports:7780,7782,7783,7784,7790,7791,7881,7885,7890,7889,7880,7781
- verify-api-spine.cjs [script] wired:script →0 ←0 ports:7780
- verify-llm-fallback.cjs [script] wired:script →1 ←0

### `scripts/windows/`
- core-host.js [script] wired:script →1 ←0
- python-service-host.js [script] wired:script →2 ←0
- tray-agent.js [service-daemon] wired:service-daemon →3 ←0
- verify-windows-scripts.js [script] wired:script →0 ←0
- voice-session-host.js [script] wired:script →3 ←0 ports:7792,7781

### `(root)/`
- service_registry.js [module] wired:imported →0 ←4 ports:7782,7783,7780,7790,7784,7791,7890,7885,7881,3030,7898,7781,7792,7889,7779,7880,7777,7892,7798,7799
- shaman_evaluator.js [module] wired:imported →0 ←1
- shaman_prompts.js [module] ORPHAN? →0 ←0
- simple_bridge.py [module] wired:module →0 ←0 ports:7777

### `skills/arxiv/scripts/`
- search_arxiv.py [skill] wired:skill →0 ←0

### `skills/axolotl/`
- axolotl.js [skill] wired:skill →0 ←0

### `skills/bee/`
- bee.js [skill] wired:skill →0 ←0

### `skills/bunny/`
- bunny.js [skill] wired:skill →0 ←0

### `skills/cactus/`
- cactus.js [skill] wired:skill →0 ←0

### `skills/canvas/scripts/`
- canvas_api.py [skill] wired:skill →0 ←0

### `skills/chart/`
- chart.js [skill] wired:skill →0 ←0

### `skills/child-registry-no-spawn-leak/scripts/`
- spawn-audit.js [skill] wired:skill →0 ←0

### `skills/chonk/`
- chonk.js [skill] wired:skill →0 ←0

### `skills/ck/commands/`
- forget.mjs [skill] wired:skill →0 ←0
- info.mjs [skill] wired:skill →0 ←0
- init.mjs [skill] wired:skill →0 ←0
- list.mjs [skill] wired:skill →0 ←0
- migrate.mjs [skill] wired:skill →0 ←0
- resume.mjs [skill] wired:skill →0 ←0
- save.mjs [skill] wired:skill →0 ←0
- shared.mjs [skill] wired:skill →0 ←0

### `skills/ck/hooks/`
- session-start.mjs [skill] wired:skill →0 ←0

### `skills/claw/`
- claw.js [skill] wired:skill →0 ←0

### `skills/comfyui/scripts/`
- _common.py [skill] wired:imported →0 ←8
- auto_fix_deps.py [skill] wired:skill →2 ←0
- check_deps.py [skill] wired:imported →1 ←2
- extract_schema.py [skill] wired:imported →1 ←2
- fetch_logs.py [skill] wired:skill →1 ←0
- hardware_check.py [skill] wired:skill →0 ←0
- health_check.py [skill] wired:skill →3 ←0
- run_batch.py [skill] wired:skill →3 ←0
- run_workflow.py [skill] wired:imported →2 ←2
- ws_monitor.py [skill] wired:skill →1 ←0

### `skills/comfyui/tests/`
- conftest.py [skill] wired:skill →0 ←0
- test_check_deps.py [skill] wired:skill →0 ←0
- test_cloud_integration.py [skill] wired:skill →0 ←0
- test_common.py [skill] wired:skill →0 ←0
- test_extract_schema.py [skill] wired:skill →0 ←0
- test_run_workflow.py [skill] wired:skill →0 ←0

### `skills/`
- companion_swarm.js [skill] wired:skill →0 ←0

### `skills/continuous-learning-v2/scripts/`
- instinct-cli.py [skill] wired:skill →0 ←0
- test_parse_instinct.py [skill] wired:skill →0 ←0

### `skills/crow/`
- crow.js [skill] wired:skill →0 ←0

### `skills/darwinian-evolver/scripts/`
- parrot_openrouter.py [skill] wired:skill →0 ←0
- show_snapshot.py [skill] wired:skill →0 ←0

### `skills/darwinian-evolver/templates/`
- custom_problem_template.py [skill] wired:skill →0 ←0

### `skills/dcf-model/scripts/`
- validate_dcf.py [skill] wired:skill →0 ←0

### `skills/domain-intel/scripts/`
- domain_intel.py [skill] wired:skill →0 ←0

### `skills/dragon/`
- dragon.js [skill] wired:skill →0 ←0

### `skills/drug-discovery/scripts/`
- chembl_target.py [skill] wired:skill →0 ←0
- ro5_screen.py [skill] wired:skill →0 ←0

### `skills/duck/`
- duck.js [skill] wired:skill →0 ←0

### `skills/elephant/`
- elephant.js [skill] wired:skill →0 ←0

### `skills/evm/scripts/`
- evm_client.py [skill] wired:skill →0 ←0

### `skills/excalidraw/scripts/`
- upload.py [skill] wired:skill →0 ←0

### `skills/excel-author/scripts/`
- recalc.py [skill] wired:skill →0 ←0

### `skills/fastmcp/scripts/`
- scaffold_fastmcp.py [skill] wired:skill →0 ←0

### `skills/fastmcp/templates/`
- api_wrapper.py [skill] wired:skill →0 ←0
- database_server.py [service-daemon] wired:service-daemon →0 ←0
- file_processor.py [skill] wired:skill →0 ←0

### `skills/fitness-nutrition/scripts/`
- body_calc.py [skill] wired:skill →0 ←0
- nutrition_search.py [skill] wired:skill →0 ←0

### `skills/fox/`
- fox.js [skill] wired:skill →0 ←0

### `skills/ghost/`
- ghost.js [skill] wired:skill →0 ←0

### `skills/gitnexus-explorer/scripts/`
- proxy.mjs [service-daemon] wired:service-daemon →0 ←0

### `skills/godmode/scripts/`
- auto_jailbreak.py [skill] wired:skill →0 ←0
- godmode_race.py [skill] wired:skill →0 ←0
- load_godmode.py [skill] wired:skill →0 ←0
- parseltongue.py [skill] wired:skill →0 ←0

### `skills/google-workspace.bak/scripts/`
- _hermes_home.py [skill] wired:imported →0 ←3
- google_api.py [skill] wired:skill →1 ←0
- gws_bridge.py [skill] wired:skill →1 ←0
- setup.py [skill] wired:skill →1 ←0

### `skills/google-workspace/scripts/`
- _hermes_home.py [skill] wired:imported →0 ←3
- google_api.py [skill] wired:skill →1 ←0
- gws_bridge.py [skill] wired:skill →1 ←0
- setup.py [skill] wired:skill →1 ←0

### `skills/goop-sigil/`
- detect_spaghetti.js [skill] wired:skill →0 ←0
- exorcise_module.js [skill] wired:skill →0 ←0

### `skills/goose/`
- goose.js [skill] wired:skill →0 ←0

### `skills/gorilla/`
- gorilla.js [skill] wired:skill →0 ←0

### `skills/guardian/`
- security_control_api.js [service-daemon] wired:service-daemon →2 ←0 ports:7784,7779
- security_scanner.js [skill] wired:imported →0 ←2
- voice_security_handler.js [skill] wired:imported →1 ←1 ports:7779

### `skills/hawk/`
- hawk.js [skill] wired:skill →0 ←0

### `skills/hermes-tts-providers/scripts/`
- kokoro_tts.py [skill] wired:skill →0 ←0

### `skills/hyperliquid/scripts/`
- hyperliquid_client.py [skill] wired:skill →0 ←0

### `skills/innovator/`
- innovator.js [skill] wired:skill →0 ←0

### `skills/`
- interactive_shell.js [skill] wired:skill →0 ←0

### `skills/jellyfish/`
- jellyfish.js [skill] wired:skill →0 ←0

### `skills/kanban-video-orchestrator/scripts/`
- bootstrap_pipeline.py [skill] wired:skill →0 ←0
- monitor.py [skill] wired:skill →0 ←0

### `skills/karen/`
- karen.js [skill] wired:skill →0 ←0

### `skills/kernel-job-training-buffer/templates/`
- training-buffer.js [skill] wired:skill →0 ←0
- training-cli.js [skill] wired:skill →0 ←0

### `skills/kraken/`
- kraken.js [skill] wired:skill →0 ←0

### `skills/lemur/`
- lemur.js [skill] wired:skill →0 ←0

### `skills/linear/scripts/`
- linear_api.py [skill] wired:skill →0 ←0

### `skills/lunokio-avatar-control/scripts/`
- lunokio_manager.py [skill] wired:skill →0 ←0
- riko_control.py [skill] wired:skill →0 ←0

### `skills/mantis/`
- mantis.js [skill] wired:skill →0 ←0

### `skills/maps/scripts/`
- maps_client.py [skill] wired:skill →0 ←0

### `skills/meme-generation/scripts/`
- generate_meme.py [skill] wired:skill →0 ←0

### `skills/memento-flashcards/scripts/`
- memento_cards.py [skill] wired:skill →0 ←0
- youtube_quiz.py [skill] wired:skill →0 ←0

### `skills/moth/`
- moth.js [skill] wired:skill →0 ←0

### `skills/multi-service-runtime-boot-hardening/templates/`
- auto-discovery-probe.js [skill] wired:skill →0 ←0
- open.js [skill] wired:skill →0 ←0
- safe-start.js [skill] wired:skill →0 ←0

### `skills/mushroom/`
- mushroom.js [skill] wired:skill →0 ←0

### `skills/navigator/`
- tools.js [skill] wired:skill →0 ←0

### `skills/numbers/`
- numbers.js [skill] wired:skill →0 ←0

### `skills/ocr-and-documents/scripts/`
- extract_marker.py [skill] wired:skill →0 ←0
- extract_pymupdf.py [skill] wired:skill →0 ←0

### `skills/octopus/`
- octopus.js [skill] wired:skill →0 ←0

### `skills/openclaw-migration/scripts/`
- openclaw_to_hermes.py [skill] wired:skill →0 ←0

### `skills/osint-investigation/scripts/`
- _http.py [skill] wired:imported →0 ←9
- _normalize.py [skill] wired:imported →0 ←1
- build_findings.py [skill] wired:skill →0 ←0
- entity_resolution.py [skill] wired:skill →1 ←0
- fetch_courtlistener.py [skill] wired:skill →1 ←0
- fetch_gdelt.py [skill] wired:skill →1 ←0
- fetch_icij_offshore.py [skill] wired:skill →0 ←0
- fetch_nyc_acris.py [skill] wired:skill →1 ←0
- fetch_ofac_sdn.py [skill] wired:skill →1 ←0
- fetch_opencorporates.py [skill] wired:skill →1 ←0
- fetch_sec_edgar.py [skill] wired:skill →1 ←0
- fetch_senate_ld.py [skill] wired:skill →1 ←0
- fetch_usaspending.py [skill] wired:skill →0 ←0
- fetch_wayback.py [skill] wired:skill →1 ←0
- fetch_wikipedia.py [skill] wired:skill →1 ←0
- timing_analysis.py [skill] wired:skill →0 ←0

### `skills/oss-forensics/scripts/`
- evidence-store.py [skill] wired:skill →0 ←0

### `skills/owl/`
- owl.js [skill] wired:skill →0 ←0

### `skills/p5js/scripts/`
- export-frames.js [skill] wired:skill →0 ←0

### `skills/panda/`
- panda.js [skill] wired:skill →0 ←0

### `skills/parrot/`
- parrot.js [skill] wired:skill →0 ←0

### `skills/penguin/`
- penguin.js [skill] wired:skill →0 ←0

### `skills/phoenix/`
- phoenix.js [skill] wired:skill →0 ←0

### `skills/pixel-art/scripts/`
- __init__.py [skill] wired:skill →0 ←0
- palettes.py [skill] wired:imported →0 ←1
- pixel_art.py [skill] wired:imported →2 ←1
- pixel_art_video.py [skill] wired:imported →1 ←1

### `skills/polymarket/scripts/`
- polymarket.py [skill] wired:skill →0 ←0

### `skills/powerpoint/scripts/`
- __init__.py [skill] wired:skill →0 ←0
- add_slide.py [skill] wired:skill →0 ←0
- clean.py [skill] wired:skill →0 ←0

### `skills/powerpoint/scripts/office/helpers/`
- __init__.py [skill] wired:skill →0 ←0
- merge_runs.py [skill] wired:skill →0 ←0
- simplify_redlines.py [skill] wired:skill →0 ←0

### `skills/powerpoint/scripts/office/`
- pack.py [skill] wired:skill →0 ←0

### `skills/purpclaw-chat-gateway/templates/`
- stub.js [service-daemon] wired:service-daemon →0 ←0 ports:7780

### `skills/rabbit/`
- rabbit.js [skill] wired:skill →0 ←0

### `skills/raven/`
- raven.js [skill] wired:skill →0 ←0

### `skills/remotion/scripts/`
- verify_remotion_render.py [skill] wired:skill →0 ←0

### `skills/robot/`
- robot.js [skill] wired:skill →0 ←0

### `skills/scientist/`
- scientist.js [skill] wired:skill →0 ←0

### `skills/shark/`
- shark.js [skill] wired:skill →0 ←0

### `skills/`
- skill_manager.js [skill] wired:skill →0 ←0

### `skills/snake/`
- snake.js [skill] wired:skill →0 ←0

### `skills/socket-rig/references/`
- lunokio_bridge.py [skill] wired:skill →0 ←0

### `skills/`
- socket_rig.js [skill] wired:skill →0 ←0 ports:7777

### `skills/solana/scripts/`
- solana_client.py [skill] wired:skill →0 ←0

### `skills/spider/`
- spider.js [skill] wired:skill →0 ←0

### `skills/stocks/scripts/`
- stocks_client.py [skill] wired:skill →0 ←0

### `skills/`
- street_builder.js [skill] wired:skill →0 ←0
- task_manager.js [skill] wired:skill →0 ←0

### `skills/telephony/scripts/`
- telephony.py [skill] wired:skill →0 ←0

### `skills/`
- test_skill.js [skill] wired:skill →0 ←0

### `skills/trl-fine-tuning/templates/`
- basic_grpo_training.py [skill] wired:skill →0 ←0

### `skills/turtle/`
- turtle.js [skill] wired:skill →0 ←0

### `skills/void/`
- void.js [skill] wired:skill →0 ←0

### `skills/wallet-recovery/references/`
- scan_parallel.py [skill] wired:skill →0 ←0

### `skills/wallet-recovery/scripts/`
- scan_telegram.py [skill] wired:skill →0 ←0

### `skills/watchers/scripts/`
- _watermark.py [skill] wired:imported →1 ←4
- watch_github.py [skill] wired:skill →1 ←0
- watch_http_json.py [skill] wired:skill →1 ←0
- watch_rss.py [skill] wired:skill →1 ←0

### `skills/wolf/`
- wolf.js [skill] wired:skill →0 ←0

### `skills/youtube-content/scripts/`
- fetch_transcript.py [skill] wired:skill →0 ←0

### `(root)/`
- smoke_test.js [test] wired:test →0 ←0 ports:7782,7783,7780,7790,7781,7779
- spinUpAgent.js [module] wired:module →1 ←0 ports:7885
- start_purpclaw.js [module] wired:module →1 ←0 ports:7780,7781,7779
- stress.cjs [module] ORPHAN? →0 ←0
- swarm_coordinator.js [service-daemon] wired:imported →7 ←1 ports:7898,7790,7782
- swarm_scheduler.js [module] wired:module →1 ←0 ports:7780
- symbolic_rules_engine.py [module] wired:imported →0 ←2
- task_decomposer.js [module] wired:imported →2 ←1
- test_audio_pipeline.py [test] wired:test →0 ←0
- test_memory.py [test] wired:test →1 ←0
- test_rules_inline.py [test] wired:test →0 ←0
- thringlet_bridge.js [service-daemon] wired:service-daemon →2 ←0 ports:7799
- tmux-worktree-orchestrator.js [service-daemon] wired:service-daemon →1 ←0 ports:7782,7783,7790
- unified_api.js [service-daemon] wired:service-daemon →8 ←0 ports:7780,7880,3030,7782,7779,7784
- unified_bridge.js [module] wired:module →0 ←0 ports:7780,7777,7781,7779,7790,7782,7783
- unified_eventbus.js [service-daemon] wired:imported →0 ←1 ports:7782
- unified_state.js [service-daemon] wired:imported →0 ←1 ports:7783,7782
- vision_monitor.js [service-daemon] wired:service-daemon →0 ←0 ports:7781,7784,7779
- voice_bridge_7792.js [service-daemon] wired:service-daemon →1 ←0 ports:7792,7779,7777,7780,7782,7781
- voice_coordinator.js [service-daemon] wired:service-daemon →1 ←0 ports:7781,7780,7790
- voice_ingress.js [service-daemon] wired:service-daemon →0 ←0 ports:7784,7782
- voice_stt.py [module] ORPHAN? →0 ←0
- worker_service.js [service-daemon] wired:service-daemon →1 ←0 ports:7897,7790
- yolo_service.py [service-daemon] wired:service-daemon →0 ←0 ports:7779
