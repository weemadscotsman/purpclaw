# PURPCLAW Development Session — May 24 2026
**Source:** `purpclaw-development` skill (agentic-engineering) — absorbed into `purpclaw-harness` as this reference.

## What Was Done This Session

Systematic archaeology and wiring of dormant modules into the PURPCLAW orchestrator. Working directory: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/`.

## PM2 Ecosystem Deduplication

Previous state: purpclaw-diagnostics and purpclaw-rules each appeared TWICE in ecosystem.config.js. Fixed — one entry per service, alphabetical order.

**Rule:** Always write the full clean array when patching ecosystem.config.js, not a partial patch that leaves old entries behind. Verify with `node -c ecosystem.config.js`.

## Context-Packet Write Bug (FIXED)

**Location:** `orchestrator.js` inside `spawnTeamIndividually()`, after each `/api/spawn/await` success response.

**Bug:** Orchestrator read handoffs correctly but NEVER WROTE agent outputs back. Support agents got empty prior context.

**Fix:** Added after `result.success` check:
```javascript
if (contextPacket) {
  contextPacket.write(workflowId, agentName, result.output || '', {
    intent, role, success: true,
  });
}
```

## Lifecycle Hooks — Where to Wire Post-Task Calls

| Function | Trigger | Typical wire-in |
|---|---|---|
| `completeWorkflow()` | Task succeeded | Memory ingest, cognitive assert, governance log, proactive proposal, autoDream trigger, digital shaman |
| `failWorkflow()` | Task failed | Cognitive diagnostics event, governance log, proactive maintenance on failure |
| `spawnAgent()` | Before agent dispatch | Companion swarm personality injection, ethics preflight, locked interfaces tier check |
| `spawnTeam()` | Sequential team dispatch | contextPacket.write() after each agent, contextPacket.synthesize() after all |

## Tier Assignment (for locked interfaces)

- **TIER 1:** robot, bee, turtle, chonk, cactus, rabbit, duck, goose, bunny, crow, panda
- **TIER 3:** dragon, wolf, snake, guardian, scientist

## Orphan Classification — Audit Results

### Deleted (unreferenced, no value)
- `lib/puppeteer.ts` — superseded by agent_tower.js
- `lib/utils.ts` — 6-line clsx/twMerge, no imports anywhere
- `hooks/hooks.json` — Claude Code pre-tool hooks, not PURPCLAW
- `data/transcript.ts` — static audio transcript, no reference
- `autoDream/autoDream/` — TypeScript source; `autoDream.py` (root) is the wired Python version
- `mochi/mochi/` — Genmo Mochi video diffusion pipeline
- `mochi/pipeline_mochi.py` + siblings — duplicate Mochi pipeline
- `companion-chorus/main.js` + `companion-chorus/src/` (8 files) — `bridge.js` is the PM2 entry
- `scripts/convert_animal_skills.py`
- `swarm_jobs/`, `swarm_job_allocation/` — empty dirs

### Archived to `.archive/`
- `companion/` — independent pet engine, never loaded into PURPCLAW
- `buddy_TAMAGOTCHI/` — tamagotchi UI, ported to `lib/mochi-sprites.js`
- `claude-code-tamagotchi/` — 87-file npm package, never wired
- `harvested/` — external projects, never wired

### Keep (intentionally off or documented)
- `lib/xiaozhi_bridge.ts` — documented in unified_api.js §2.5
- `disabled-commands/` — 5 commands intentionally disabled

### DreamTask.ts Fix
`DreamTask/DreamTask.ts` had 4 broken imports (ECC task registry paths that don't exist in PURPCLAW). Fixed by replacing imports with no-op stubs:
- `../../services/autoDream/consolidationLock.js` → stub `rollbackConsolidationLock()`
- `../../Task.js` → stub `createTaskStateBase()`, `generateTaskId()`
- `../../utils/task/framework.js` → stub `registerTask()`, `updateTaskState()`

## Services Started This Session

Python cognitive services — hardcoded system Python path (NOT Hermes venv):
```bash
"C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe" symbolic_rules_engine.py --port 7787 &
"C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe" autonomous_diagnostics.py --port 7786 &
"C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe" modal_logic_engine.py --port 7785 &
```

## Key Hard Lessons From This Session

1. **Many modules already wired.** `grep` before wiring — the call is often already present, PM2 just hadn't started the service.
2. **Windows Python PATH.** Bare `python` resolves to Hermes venv, not system Python. Always use absolute path.
3. **PM2 logs are append-only.** Old errors persist after fixes. Check `pm2 list` uptime before panic.
4. **Don't spawn 19 PM2 processes.** Ted's PC freezes. Use `--only` for targeted restarts.
