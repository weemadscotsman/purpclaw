# PURPCLAW File Audit — 2026-04-18

## SUMMARY

| Category | Count |
|----------|-------|
| PM2-managed services | 19 |
| Integrated files (imported by PM2 files) | ~10 |
| Skills (loaded via unified_api skill system) | 6 |
| Companion-chorus core modules | 8 |
| Orphaned / Legacy / Test | 0 (cleaned 2026-04-18) |
| **Total root .js files** | ~30 |

---

## PM2-MANAGED SERVICES ✅

| File | Service | Port | Stack |
|------|---------|------|-------|
| unified_eventbus.js | purpclaw-eventbus | 7782 | Node |
| unified_state.js | purpclaw-state | 7783 | Node |
| unified_api.js | purpclaw-api | 7780 | Node |
| agent_tower.js | purpclaw-tower | 7790 | Node |
| voice_coordinator.js | purpclaw-voice | 7781 | Node |
| voice_bridge_7792.js | purpclaw-bridge | 7792 | Node |
| gatekeeper.js | purpclaw-gatekeeper | 7791 | Node |
| orchestrator.js | purpclaw-orchestrator | 7784 | Node |
| companion-chorus/bridge.js | purpclaw-chorus | — | Node |
| vision_monitor.js | purpclaw-vision | 7881 | Node |
| metrics_aggregator.js | purpclaw-metrics | 7890 | Node |
| memory_matrix_v2.py | purpclaw-memory | 7880 | Python |
| neuro_symbolic_bridge.py | purpclaw-bridge-ns | 7884 | Python |
| modal_logic_engine.py | purpclaw-modal | 7785 | Python |
| autonomous_diagnostics.py | purpclaw-diagnostics | 7786 | Python |
| symbolic_rules_engine.py | purpclaw-rules | 7787 | Python |
| yolo_service.py | purpclaw-yolo | 7779 | Python |
| simple_bridge.py | purpclaw-avatar | 7777 | Python |
| next dev (port 3000) | purpclaw-nextjs | 3000 | Node/Next |

Plus service wrappers: `run_node.js`, `run_py.js` (used by PM2 ecosystem).

---

## INTEGRATED FILES ✅

Required by PM2-managed files but not PM2 services themselves:

| File | Imported By | Role |
|------|-------------|------|
| kimi_client.js | unified_api.js, agent_tower.js | Kimi API client |
| companion_swarm.js | agent_tower.js | Personality file loader |
| digital_shaman.js | unified_api.js | Trip state / phase transitions |
| shaman_evaluator.js | unified_api.js | Shaman layer evaluator |
| shaman_prompts.js | unified_api.js | Ritual prompt templates |
| agent_score.js | orchestrator.js, agent_tower.js, gatekeeper.js | Agent performance metrics |
| locked_interfaces.js | orchestrator.js | Tier-based tool permissions |
| ethics_hooks.js | orchestrator.js | Pre-flight ethical checks |
| ecosystem.config.js | PM2 directly | Service orchestration config |

---

## SKILLS SYSTEM ✅

Loaded dynamically via unified_api.js skill system (skills/*):

| File | Role |
|------|------|
| skills/interactive_shell.js | Persistent shell session manager |
| skills/companion_swarm.js | MiniMax AI companion sub-agent invocation |
| skills/skill_manager.js | Dynamic skill creation/testing/approval |
| skills/socket_rig.js | 3D avatar control (speak, animate, switch) |
| skills/street_builder.js | Virtual street environment builder |
| skills/task_manager.js | Multi-step cognitive task planner |
| skills/test_skill.js | Example test skill |

---

## COMPANION-CHORUS MODULES ✅

Loaded by bridge.js or main.js:

| File | Imported By | Role |
|------|-------------|------|
| companion-chorus/main.js | bridge.js | 18 terminal companions, gacha, sprites |
| companion-chorus/src/ChatRenderer.js | main.js | Blessed terminal UI renderer |
| companion-chorus/src/CompanionSpawner.js | main.js | Companion spawning and response generation |
| companion-chorus/src/ContextBus.js | main.js, ChatRenderer, Spawner | Shared context state |
| companion-chorus/src/constants.js | main.js, gacha, sprites, voice | Rarities, species, ASCII sprites |
| companion-chorus/src/gacha.js | bridge.js, main.js | Gacha roll system |
| companion-chorus/src/minimax.js | bridge.js, main.js | MiniMax AI API integration |
| companion-chorus/src/sprites.js | main.js | ASCII art for 18 species |
| companion-chorus/src/voice.js | bridge.js, main.js | Kokoro TTS voice presets |

---

## ORPHANED — CLEANED 2026-04-18 ✅

All orphaned files removed:

| File | Reason |
|------|--------|
| ball_to_rig_bridge.js | Not PM2, not required |
| launcher.js | PM2 uses run_node.js instead |
| mood_engine.js | Not PM2, not required |
| playwright_compatibility.js | Not PM2, not required |
| purpclaw.js | Manual CLI only |
| purpclaw_cli.js | Manual CLI only |
| screen-manager.js | Not PM2, not required |
| shaman_prompts.js | NOT orphaned — required by unified_api.js |
| swarm_scheduler.js | Not PM2, not required |
| tool_diagnostic.js | Manual diagnostic only |
| companion-chorus/test-ai.js | Manual test script |
| companion-chorus/test-api.js | Manual test script |
| ethic_core.ts | Not imported — logic inlined in ethics_hooks.js |
| browser_voice_commands.js | Previous cleanup |
| clap-detector.js | Previous cleanup |
| clap_listener.py | Previous cleanup |
| music_analysis_service.py | Previous cleanup |
| lcd_bridge_server.py | Previous cleanup |
| gen_api.js | Previous cleanup |
| launch_detached.js | Previous cleanup |
| metadata.json | Previous cleanup |
| loop_state.json | Previous cleanup |
| replace.js | Previous cleanup |
| visualizer_server.js | Previous cleanup |

---

## CLEANED DIRECTORIES ✅

| Directory | Removed |
|-----------|---------|
| Open-Higgsfield-AI-main/ | 2026-04-18 |
| Samantha's Daily Log/ | 2026-04-18 |
| tesseract-ocr-tesseract-9c516f4/ | 2026-04-18 |
| html to combine as a beter fuller ui/ | 2026-04-18 |
| __pycache__/ | 2026-04-18 |

---

## REMAINING CLUTTER (non-blocking)

| File/Dir | Status |
|----------|--------|
| build/ | Empty directory |
| swarm_job_allocation/ | Empty directory |
| swarm_jobs/ | Empty directory |
| companion-chorus/companions/ | Empty directory |
| companion-chorus/context/ | Empty directory |
| agent_work/ | Old agent directories |
| glitch_manifest.md | June 2025 runtime directives (not referenced) |
| consequence_cache.json | June 2025 cache |
| loop_of_shame.py | June 2025 debug file |
| TASKS/ | Old task docs (STACK_AUDIT, NEUROSYMBOLIC_TASKS, etc.) |
| yolov8n.pt | YOLO model (used by yolo_service.py — keep) |
| agent tower looks and options.jpg | Keep |
| test_screenshot.png | Keep |

---

## DOCUMENTATION FILES

| File | Status |
|------|--------|
| README.md | Current |
| CLAUDE.md | Current |
| TEAM_HANDOVER.md | Current |
| CAPTAINS_LOG.md | Current |
| CLEANUP_AUDIT.md | Current |
| FILE_AUDIT.md | This file |
| AGENTS.md | Current |
| keyboard_commands_reference.md | Keep |
| pc_control_abilities.md | Keep |
| persistent_vision_framework.md | Keep |
| project_architecture.md | Keep |
| boot-sequence.json | Keep (used by system) |
| cognitive_tasks.json | Keep (used by swarm_scheduler) |
| samantha_memory.json | Keep |
| agent_score.json | Keep |
| loop_state.json | Keep |
| purpclaw_settings.json | Keep |
| agent_score.js | Keep (integrated) |
| digital_shaman.js | Keep (integrated) |
