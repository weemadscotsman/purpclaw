# PURPCLAW Stack Audit - 2026-05-23

## Executive verdict

PURPCLAW is currently a CLI-first orchestration stack with a Next.js Mission Control UI, PM2-managed local services, voice/Xiaozhi bridges, screen-look context capture, and optional cognitive/vision services.

The valuable system is real, but the repo is carrying three layers at once:

1. Current runtime stack: CLI, PM2 services, Mission Control, API/orchestrator/tower/eventbus/state, screen-look, voice/config surfaces.
2. Integration backlog: cognitive services, vision-to-symbolic lift, companion chorus, avatar bridge, Xiaozhi/OpenClaw surfaces.
3. Harvest/archive bulk: copied docs, extracted frameworks, old dashboards, generated caches, stale deleted files, and large ISO artifacts.

The next cleanup should not be "delete random stuff." It should be a staged separation:

- Keep runtime and source-of-truth files in root/app/lib/scripts.
- Move harvest/archive material out of the runtime root.
- Decide which optional services become supported stack features.
- Delete only generated artifacts and confirmed dead one-off files after a backup/export pass.

## What is the stack

### Control surfaces

- CLI: `bin/purpclaw.js`
- Web UI: `app/mission/page.tsx` -> `app/components/MissionControl.tsx`
- API: `unified_api.js` on port 7780
- Programmatic API proxy: `app/api/service-proxy/route.ts`
- Voice shorthand: `purpclaw voice "<command>"`
- Screen look: `purpclaw look`, backed by `lib/screen-look.js`
- Workspace memory: `purpclaw look --workspace`, backed by `lib/workspace-awareness.js`
- Config TUI: `purpclaw config`
- Doctor: `purpclaw doctor`, read-only setup and service checks
- Xiaozhi/OpenClaw bridge surfaces: `lib/xiaozhi_bridge.ts`, `unified_api.js`, `companion-chorus/bridge.js`

### Core PM2 services

Source of truth should be `service_registry.js`, consumed by `scripts/pm2-names.js`, `scripts/panic-stop.js`, and `metrics_aggregator.js`.

| Service | PM2 name | Port | Role |
| --- | --- | ---: | --- |
| EventBus | `purpclaw-eventbus` | 7782 | Pub/sub |
| State Store | `purpclaw-state` | 7783 | Shared state |
| Unified API | `purpclaw-api` | 7780 | Main HTTP/API/tool surface |
| Agent Tower | `purpclaw-tower` | 7790 | Agent registry/spawning |
| Orchestrator | `purpclaw-orchestrator` | 7784 | Workflow queue/routing |
| Gatekeeper | `purpclaw-gatekeeper` | 7791 | Validation/security checks |
| Metrics | `purpclaw-metrics` | 7890 | Health and telemetry |
| Mission Control UI | `purpclaw-nextjs` | 3000 | Operator dashboard |

### Optional services

| Group | Services | Verdict |
| --- | --- | --- |
| voice | `purpclaw-voice`, `purpclaw-bridge` | Keep, but keep health ports explicit: 8781/8792 |
| vision | `purpclaw-vision`, `purpclaw-yolo` | Keep, but support as optional feature with dependency checks |
| cognitive | memory, neuro-symbolic, modal, diagnostics, rules | Keep as integration backlog, not core boot |
| companions | `purpclaw-chorus` | Keep if tied to EventBus/UI, otherwise archive |
| avatar | `purpclaw-avatar` | Optional bridge; keep only if still used by the live avatar |

## What I fixed

- Aligned Orchestrator registry truth to port 7784 in `service_registry.js`.
- Aligned Mission Control mission-data pipeline fetch from 7788 to 7784 in `app/api/mission-data/route.ts`.
- Aligned Mission Control orchestrator health, SSE, workflow detail, and orchestrate actions from stale port 7788 to 7784.
- Aligned the Unified API orchestrator proxy fallback from stale port 7788 to 7784.
- Removed stale port 7788 from the Mission Control service proxy allowlist.
- Added workspace awareness persistence on top of `purpclaw look`.
- Added `purpclaw doctor` for read-only dependency and service checks.
- Added bounded CLI launch profiles so `purpclaw start` boots the harness, not every optional service.
- Added `purpclaw profiles` and `--dry-run` launch previews for start/stop/restart.
- Restored local dependencies with `npm install` because `node_modules/next/dist/bin/next` was missing.

## CLI launch profiles

`purpclaw start` now defaults to the bounded `harness` profile. The full nineteen-service stack is only launched with `purpclaw start --all`.

| Profile | Services | Use |
| --- | ---: | --- |
| `minimal` | 6 | CLI/API/UI harness without gatekeeper/metrics |
| `harness` | 8 | Default local agent harness |
| `voice` | 8 | Harness plus voice coordinator/bridge |
| `vision` | 8 | Harness plus screen/YOLO services |
| `cognitive` | 11 | Harness plus memory/symbolic services |
| `all` | 19 | Explicit full stack only |

## Verification

- `node scripts/pm2-names.js core` returns:
  `purpclaw-eventbus,purpclaw-state,purpclaw-api,purpclaw-tower,purpclaw-orchestrator,purpclaw-gatekeeper,purpclaw-metrics,purpclaw-nextjs`
- `node scripts/pm2-names.js optional` returns the voice, companion, vision, cognitive, and avatar services.
- `node bin/purpclaw.js start --dry-run` previews the 8-service harness launch without starting processes.
- `node bin/purpclaw.js start --profile=minimal --dry-run` previews the 6-service minimal launch without starting processes.
- `npm run build` passes with Next.js 15.5.14 and generates 13 routes.
- `npm audit` reports 0 vulnerabilities after dependency restore.

## Still to connect

### Highest value

1. Persistent workspace awareness:
   - Extend `agent_work/.screen_context.json` into a small workspace state file.
   - Track monitor role, app/window identity, last observed task, and changed-since-last-look.
   - Feed that state into `purpclaw run`, `purpclaw voice`, and Agent Tower task prompts.

2. Single service truth:
   - Make CLI `PORTS` read `service_registry.js` instead of hardcoding ports.
   - Make Mission Control use the registry through one API route.
   - Keep future service additions registered in one place instead of hardcoding new ports across UI/API files.

3. Vision/cognitive bridge proof:
   - Prove one flow end to end: `purpclaw look` -> context saved -> agent prompt reads it.
   - Then prove optional flow: vision/yolo -> neuro-symbolic bridge -> memory/rules query.

4. Mission Control service status:
   - Show core vs optional clearly.
   - Offline optional services should display `offline/config-needed`, not failure.

### Medium value

- Wire `purpclaw config` settings into service startup checks.
- Add a `purpclaw doctor` command that checks dependencies, ports, PM2 group names, Python packages, and API keys.
- Add smoke tests for `/api/health`, `/tower/status`, `/api/mission-data`, `/api/look/context`.

## Garbage / move candidates

### Delete after backup or confirmation

- `.next/` - generated Next build output.
- `build/` - generated build output unless it contains deliberate release artifacts.
- `tsconfig.tsbuildinfo` - generated TypeScript cache.
- `agent_work/**/*.pid` - stale worker PID files after confirming no matching process is live.
- `__pycache__/` entries shown as deleted in Git status - generated Python cache.
- Old one-off HTML dashboards if not referenced: `brain_dashboard.html`, `command_center.html`, `diagnostics_ops.html`, `memory_explorer.html`, `swarm_dashboard.html`, `thought_visualizer.html`, `void.html`, `spectacular.html`.

### Move out of runtime root

- `harvested/` - about 5 GB, mostly ISO/bootstrap material. Keep as archive, but not inside active runtime.
- `docs/ja-JP`, `docs/ko-KR`, `docs/zh-CN`, `docs/zh-TW` - translated upstream docs. Useful as reference, but not PURPCLAW runtime.
- `kiro_EXTRACTED/` and `.kiro/` - likely extracted/reference material; archive unless current code imports it.
- `claude-code-tamagotchi/` and `buddy_TAMAGOTCHI/` - separate companion source/history; keep only the parts wired into `companion-chorus`.
- `openclaw-persona-forge-references/`, `steering/`, `rules/`, `prompts/`, large copied `skills/` corpus - useful framework/reference material, but should be separated from runtime source.

### Keep in runtime

- `bin/purpclaw.js`
- `lib/screen-look.js`
- `lib/llm-provider.js`
- `service_registry.js`
- `scripts/pm2-names.js`
- `scripts/panic-stop.js`
- `ecosystem.config.js`
- `unified_api.js`
- `orchestrator.js`
- `agent_tower.js`
- `unified_eventbus.js`
- `unified_state.js`
- `gatekeeper.js`
- `metrics_aggregator.js`
- `voice_coordinator.js`
- `voice_bridge_7792.js`
- `vision_monitor.js`
- `yolo_service.py`
- `memory_matrix_v2.py`
- `neuro_symbolic_bridge.py`
- `modal_logic_engine.py`
- `autonomous_diagnostics.py`
- `symbolic_rules_engine.py`
- `app/`
- `companion-chorus/` if companion reactions remain part of Mission Control.

## Dirty-worktree warning

The repo is already heavily divergent:

- About 120 modified paths.
- About 884 deleted paths.
- About 256 untracked paths.

Several current stack files are untracked from Git's perspective, including `service_registry.js`, `app/api/mission-data/route.ts`, and `node_modules/`. Do not run broad reset/checkout cleanup here. Clean by moving/deleting explicit categories only.

## Recommended next pass

1. Make CLI ports consume `service_registry.js`.
2. Feed workspace awareness into `purpclaw run`, `purpclaw voice`, and Agent Tower prompts.
3. Move `harvested/` and translated upstream docs to an archive root.
4. Delete generated caches and stale PID files after process confirmation.
5. Run core PM2 boot only, then verify live endpoints.
