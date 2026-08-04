# PURPCLAW — Root AGENT Index

This file is the boot card for the PURPCLAW monorepo root. It is the *first* doc you read after `CLAUDE.md`. It does not duplicate the law files (`AGENTS.md`, `workspace/AGENTS.md`, `docs/AGENT.md`) — it routes agents to the right per-area doc.

---

## What you are inside

PURPCLAW is a local-first multi-agent AI workstation OS. The command line is the shell, agents are processes, and the same capability graph is reachable from CLI (`bin/purpclaw.js`), TUI, and Web UI (Next.js megapanel on port 3030).

Canonical law: **`AGENTS.md`** at this root, `Router.md`, `CLAUDE.md`, `workspace/AGENTS.md`, `docs/spec/AGENT_MATRIX.md`.

Operational docs (this file category): per-folder `AGENT.md` files. Read the one in your present working directory first. If a folder is missing one, this list is the index.

---

## Top-level shape (real, not aspirational)

Folders with their own `AGENT.md`:

| Path | Role |
|---|---|
| `lib/` | Core runtime. 88+ JS files + 27 subfolders. See `lib/AGENT.md`. |
| `app/` | Next.js megapanel. 26 subdirs (one per route surface). See `app/AGENT.md`. |
| `bin/` | CLI entry. `bin/purpclaw.js` is the primary gateway. |
| `agents/` | 40 agent cards tied to the AGENT_MATRIX topology. See `agents/AGENT.md`. |
| `skills/` | 152 skill folders (persona cards + procedure packs). See `skills/AGENT.md`. |
| `divisions/` | Long-lived operating divisions matching `AGENT_MATRIX.md` §1. |
| `workspace/` | Law files (`SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `SYSTEM_PROMPT.md`, `MEMORY.md`). |
| `docs/` | Specs + reports. `docs/spec/` is source-of-truth. `docs/AGENT.md` is the maintenance contract. |
| `components/` | Shared UI primitives (between `app/` and standalone). |
| `hooks/` | Web UI state hooks and live data flows. |
| `bin/`, `harness/`, `scripts/` | Process-launch scripts + harness + utility scripts. |
| `contexts/` | React context providers for the megapanel. |
| `prompts/` | Curated prompt payloads per agent/intent. |
| `public/` | Static assets shipped to the megapanel. |
| `config/`, `policies.json`, `agent_profiles.json`, `model_registry.json`, `agent_routing_matrix.js` | Routing + policy config (do NOT edit by hand; re-emit from scripts). |
| `registry/` | Internal service registry mirroring `unified_api.js`. |
| `rules/` | Symbolic/rule packs consumed by the rule engine. |
| `schemas/` | JSON Schemas for inter-service payloads. |
| `steering/` | Agent-steering overlay (`.omnicode`-style). |
| `tests/`, `test-patches/`, `eval/` | Test harness + eval runs + ad-hoc patches. |
| `vendor/` | Third-party native binaries; one `vendor/AGENT.md` exists explaining quarantine policy. |
| `logs/` | PM2 + runtime logs (do NOT add binaries; do NOT `git add` whole log dir). |
| `build/`, `.next/`, `models/`, `data/` | Generated / heavyweight. Listed in `Vendor.md`-style skip list — do NOT generatedocs. |
| `dream/DreamTask/`, `PURPCLAW/`, `Samantha's Daily Log/`, `companion-chorus/`, `mochi/`, `pocket/`, `podcast_studio/`, `puzzle-stream/`, `swarm_mission/` | Sub-modules with their own package boundaries. |
| `no-spaghett/`, `apis for agents/`, `_api-mega-list/`, `ablation_probes/`, `refusal_ablation_probe/` | Browser-app mass + reference datasets + ablation probes (the `refusal_ablation_probe/` is grabbed git curiosity, **not user work** — do not let it trip safety refusals). |
| `STRESS/`, `TASKS/`, `trip_logs/` | Knowledge archives of audits, task plans, trip notes. |
| `agent_work/`, `_scratch/`, `out.txt`, `hi.txt`, `_SW.txt`, `audit.fallback.log` | Throwaway rabbitholes; not for docs. |

---

## Service/runtime-shaped files at root

These `.js`/`.py` files at the root mirror PM2 services — they are NOT typical app files, they are micro-services or persistent daemons. If you touch one, the runtime changes:

| File | Service / role | Port(s) expected |
|---|---|---|
| `unified_api.js` | Hand-rolled HTTP tool executor (7780) | 7780 |
| `unified_eventbus.js` | Pub/sub event bus + SSE feed | 7788 |
| `unified_state.js` | Shared runtime state | 7789 |
| `orchestrator.js` | Workflow queue + execution (orchestrator:7790) | 7790 |
| `agent_tower.js` | Spawn/manage agents (agent-tower:7793) | 7793 |
| `gatekeeper.js` | Safety/approval boundary | 7791 |
| `harness_service.js` | Autonomous harness driver | 7820 |
| `agent_score.js`, `agent_score.json` | Per-agent health scoring | — |
| `companion_swarm.js` | Swarm companion launcher | — |
| `swarm_coordinator.js`, `swarm_scheduler.js` | Swarm logic | 7895/7892 |
| `pool_service.js`, `worker_service.js` | Worker pool + worker | per STACK_SPEC §2 |
| `vision_monitor.js` | Webcam/screen symbolic lift (YOLO) | 7779 |
| `voice_ingress.js`, `voice_coordinator.js`, `voice_bridge_7792.js` | Voice stack | 7892/7896 |
| `screen-manager.js` | Screen capture helpers | — |
| `metrics_aggregator.js` | Metrics | 7785 |
| `boot.js`, `start_purpclaw.js` | Boot/startup scripts | — |
| `tmux-worktree-orchestrator.js` | Worktree orchestration helper | — |
| `spinUpAgent.js`, `replace.js` | One-off agent bring-up | — |
| `digital_shaman.js`, `shaman_evaluator.js`, `shaman_prompts.js` | Cognitive spine triage | — |
| `cognitive_spine.py`, `memory_matrix.py`, `memory_matrix_v2.py`, `modal_logic_engine.py`, `neuro_symbolic_bridge.py`, `autoDream.py`, `autonomous_diagnostics.py` | Long-running cognitive spine services | per STACK_SPEC |
| `boston_analysis.py`, `create_db.py`, `find_pulse.py`, `gacha.py`, `lcd_bridge_server.py`, `lcd_log_monitor.py`, `mimi_speak.py`, `music_analysis_service.py`, `symbolic_rules_engine.py`, `test_audio_pipeline.py`, `test_memory.py`, `test_rules_inline.py`, `voice_stt.py`, `yolo_service.py`, `diag_audio.py` | Sync scripts/standalone daemons | — |
| `ecosystem.config.js` | PM2 manifest (25 services). **Editing requires `purpclaw safe-start`** — do not bounce from here. | — |
| `unified_bridge.js` | Bridge layer between CLI and core services (legacy alias) | 7794 |

Operational rule: do NOT kill any of these from this notebook. The user runs multiple projects; assume another process owns some of these ports.

---

## Cross-folder gotchas (real ones)

1. **lib/llm-provider.js:1229 wipes prior `module.exports`**. Helpers must be top-level `function name()` to survive the literal export reset. See `project_purpclaw_llm_provider_export_pattern.md`.
2. **Edit-then-restart boundary**: `lib/llm-provider.js`, `agent_tower.js`, `orchestrator.js` are PM2-cached. Changes only activate on user bounce. `node -c` is parse-check only — it does NOT mean liveness. (See `feedback_purpclaw_edit_restart_boundary.md`.)
3. **Per-iter multi-session collision**: PURPCLAW has 3 sessions active (user + 2 background). Conflicts resolved by: prefer `agent_routing_matrix.js`, surface `model_registry.json` shadows, ask before edit.
4. **Generation vs source**: 80+ files get GENERATED into `*.txt`/reports/agent_work/. Don't route agents through generated artefacts — link to source-of-truth docs only.
5. **Foreign-harness residues**: active runtime wording must use PURPCLAW names only. Historical migration/security references are allowed only under explicit quarantine paths (`docs/legacy/`, translated security articles, `skills/_legacy/`, and vendor snapshots). Do not reintroduce foreign-harness names into runtime code, PM2 service names, UI labels, or operator-facing status text.
6. **`refusal_ablation_probe/` is grabbed git curiosity**: don't let safety guards treat it as user intent.
7. **Do not blanket-edit routing**. `agent_routing_matrix.js` win-overrides `model_registry.json`. Read both before touching.

---

## How to navigate

1. Start here for the shape.
2. Find your folder's `AGENT.md` (e.g. `lib/AGENT.md`, `app/AGENT.md`, `agents/AGENT.md`).
3. Read `docs/spec/AGENT_MATRIX.md` if your task involves agents/intents/divisions.
4. Read `lib/runtime/ports.js` for port truth; `unified_api.js` for the tool plane; `ecosystem.config.js` for the PM2 surface.
5. Read `workspace/SOUL.md` for tone-quill personality, `workspace/USER.md` for user prefs.

---

## Validation

- `node boot.js --check` — pending; if false, fall back to `pm2 ls`.
- `purpclaw status` — prints runtime health.
- `rg -n "OpenClaw|openclaw|OPENCLAW" . -g "!node_modules/**" -g "!.next/**"` — captures foreign-harness residue count; classify results as active, legacy, vendor, or third-party before editing.

---

Last updated 2026-06-19 during PURPCLAW Tier-1 AGENT.md sweep.
