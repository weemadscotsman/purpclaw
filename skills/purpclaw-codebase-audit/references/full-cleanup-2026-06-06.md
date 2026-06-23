# PURPCLAW Full Cleanup — 2026-06-06

## What happened

Massive root directory cleanup of the PURPCLAW project. Original root had ~175 items, ~1.35GB of dead weight removed, ended at ~105 items.

## Process

### Phase 1: Dashboard slaughter
10 dead HTML dashboards in root (`brain_dashboard.html`, `command_center.html`, `command_center_v2.html`, `diagnostics_ops.html`, `memory_explorer.html`, `mission_control.html`, `spectacular.html`, `swarm_dashboard.html`, `thought_visualizer.html`, `void.html`). All pre-Next.js prototypes. → `docs/legacy/html-graveyard/`

### Phase 2: Temp/stub file cleanup
37 temp files moved to `docs/legacy/root-cleanup-2026-06-06/`: diff ghosts, build logs, stub JS files (`gen_api.js` at 118 bytes), `run_gacha.bat`, `smart_demo.js`, `tsconfig.tsbuildinfo`, `cognitive_tasks.json`, contradictory state dumps, `run_node.js` and `run_py.js`.

### Phase 3: The great folder massacre (and reversal)
18 "0 ref" folders moved to `docs/legacy/disconnected-folders/`. User corrected and 12 were restored:

**Restored (not dead):**
- `accuracy_fish/` → claim extractor, wired into `lib/harness/engine.js`. Content moved to `lib/accuracy-fish.js`.
- `NEW MASTER UI/` → secondary UI theme. Moved to `public/skyscraper/`.
- `purpconsole/` → Python TUI for Hermes
- `podcast_studio/` → multi-agent podcast
- `contexts/` → Claude Code mode presets
- `no-spaghett/` → Gemini code analysis tool
- `schemas/` → ECC install schemas
- `trip_logs/` → agent journey logs
- `Samantha's Daily Log/` → AI journal
- `DreamTask/` → auto-dream task
- `_scratch/` → STRATEGY.md
- `steering/` → dev guides
- `hooks/` → React hooks (useAgentTower.ts)
- `TASKS/` → task files

**Confirmed dead:**
- `installers/` — duplicate install scripts
- `Open-Higgsfield-AI-main/` — cloned repo (18MB)
- `tesseract-ocr-tesseract-9c516f4/` — cloned source (9.5MB)
- `scratch/` — empty

### Phase 4: Ghost busting
14 orphan files with zero core references moved to `docs/legacy/ghostbusters-2026-06-06/`:
- `memory_matrix.py` (v1, superseded by v2)
- `purpclaw.js` (root v1 CLI, real one is `bin/purpclaw.js`)
- `launch_clean.js`, `ball_to_rig_bridge.js`, `browser_voice_commands.js`, `clap-detector.js`, `crossbar_integration.js`, `ethics_hooks.js`, `mood_engine.js`, `playwright_compatibility.js`, `process-leash.js`, `purpclaw_turing_core.js`, `task_decomposer.js`, `turing_face_driver.js`

### Phase 5: Documentation reorganization
- 34 stale docs → `docs/legacy/`
- Created 4-folder structure: `current/`, `shipped/`, `experimental/`, `legacy/`
- Created `docs/artifacts/` for historical fossil record
- Rewrote `QUICKSTART.md`, `CLAUDE.md`, `CHANGELOG.md`
- Created `ARCHITECTURE.md` with full topology
- Renamed "7 Memory Layers" → "7-Layer World Model"

## Key realizations

1. **Folder names lie.** A folder called `disabled-commands` contained five empty directories that shadowed real commands in `lib/commands/`.
2. **Grep refs mean nothing.** `hooks/` had zero grep refs but `useAgentTower.ts` connects to the agent tower at `:7790`.
3. **WIRING_GUIDE.md is the truth source.** The NEW MASTER UI's wiring guide (341 lines) documented every endpoint, port, and data contract. Reading it before touching would have prevented the false deletion.
4. **Eddie builds in unconventional places.** Side projects (podcast_studio, no-spaghett) live in the PURPCLAW root because he builds everything in one workspace.
5. **"99 percent of it is bloody needed."** Assume every folder has purpose until proven otherwise by reading the actual files.
