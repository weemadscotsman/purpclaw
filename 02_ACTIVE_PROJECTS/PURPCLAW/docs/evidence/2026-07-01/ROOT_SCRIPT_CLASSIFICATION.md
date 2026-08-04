# Root Script Classification
**Date:** 2026-07-01
**Phase:** P7 Integration Truth Repair · Item 5

**Rule:** Not MOVE. Just classify. Moving after classification is a separate decision.

Categories: `active-service` | `dev-tool` | `legacy` | `generated` | `donor` | `archive` | `unknown`

---

## Root Level Files (PURPCLAW root = `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\`)

### ✅ Active Service (PM2 runtime)
| File | Role | Evidence |
|------|------|----------|
| `ecosystem.config.js` | PM2 service definitions — all 27 services | `pm2 start ecosystem.config.js` |
| `bin/purpclaw.js` | Primary CLI entry point — 148 wired commands | `purpclaw --help` |
| `unified_api.js` | Core HTTP API — :7780 | PM2 `purpclaw-api` |
| `unified_eventbus.js` | Event bus — :7782 | PM2 `purpclaw-eventbus` |
| `unified_state.js` | State store — :7783 | PM2 `purpclaw-state` |
| `orchestrator.js` | Task governance — :7784 | PM2 `purpclaw-orchestrator` |
| `agent_tower.js` | Agent registry + spawn — :7790 | PM2 `purpclaw-tower` |
| `voice_coordinator.js` | Voice pipeline — :7781 | PM2 `purpclaw-voice` |
| `voice_bridge_7792.js` | Voice bridge — :7792 | PM2 `purpclaw-bridge` |
| `voice_ingress.js` | Voice ingress — STT routing | PM2 `purpclaw-voice-ingress` |
| `harness_service.js` | Autonomous harness service | PM2 `purpclaw-harness` |
| `gatekeeper.js` | Request gating + rate limiting | PM2 `purpclaw-gatekeeper` |
| `pool_service.js` | Job queue — skill pool, task queue | PM2 `purpclaw-pool` |
| `worker_service.js` | Worker registration + dispatch | PM2 `purpclaw-workers` |
| `swarm_coordinator.js` | Multi-agent coordination | PM2 `purpclaw-coordinator` |
| `metrics_aggregator.js` | System metrics aggregation | PM2 `purpclaw-metrics` |
| `vision_monitor.js` | Screen capture + vision | PM2 `purpclaw-vision` |
| `boot.js` | Boot sequence for the harness | Imported by `bin/purpclaw.js` |
| `healthcheck.js` | Health check endpoint | Imported by services |

### 📄 Configuration / Docs (do not move)
| File | Category | Notes |
|------|----------|-------|
| `package.json` | generated | pnpm workspace root |
| `package-lock.json` | generated | lockfile |
| `pnpm-lock.yaml` | generated | pnpm lockfile |
| `pnpm-workspace.yaml` | generated | workspace config |
| `tsconfig.json` | generated | TypeScript config |
| `AGENT.md` | active-service | Claude Code agent instructions |
| `CLAUDE.md` | active-service | Primary agent instructions |
| `README.md` | active-service | Product documentation |
| `SECURITY.md` | active-service | Security policy |
| `QUICKSTART.md` | active-service | Onboarding guide |
| `LAUNCH.md` | active-service | Launch documentation |
| `CHANGELOG.md` | active-service | Version history |

### ⚠️ Legacy / Superseded
| File | Status | Superseded By |
|------|--------|---------------|
| `agent_routing_matrix.js` | legacy | `lib/agent-router.js` |
| `agent_score.js` | legacy | `lib/agent-router.js` (scores now in agent_work/agent-scores/) |
| `agent_score.json` | legacy | Generated output, not source |
| `swarm_scheduler.js` | legacy | `swarm_coordinator.js` + `task_decomposer.js` |
| `task_decomposer.js` | legacy | `lib/task-decomposer.js` (the one in root is old, the one at root is newer) |
| `companion_swarm.js` | legacy | `lib/companion-swarm.js` |
| `unified_bridge.js` | legacy | `apps/companion-chorus/bridge.js` |

### ❓ Unknown (needs investigation)
| File | Notes |
|------|-------|
| `purpclaw.config.example.json` | Example config? Never seen referenced |

---

## bin/ Scripts

### ✅ Active Service
| File | Evidence |
|------|----------|
| `purpclaw.js` | Primary CLI, sourced by pnpm/npm |

### 📦 Standalone Dev Tools (wired via `bin/` directly or cron)
| File | Category | Evidence |
|------|----------|----------|
| `model-discover.js` | dev-tool | `0 6 * * * node bin/model-discover.js --check` daily cron. Rename to `model-sync.js` (see PROJECT_PHASE_TRUTH.md) |
| `purpclaw-vector-bench.js` | dev-tool | Benchmark script — run manually |

### 📦 Standalone Dev Tools (unwired — need wiring or archiving)
| File | Category | Evidence |
|------|----------|----------|
| `coding-eval.js` | dev-tool | 16KB — code evaluation harness |
| `MISSION.js` | donor | 393 bytes — comment-only, no real code |
| `AGENT.md` | donor | Agent instructions — reference only |
| `model-sentinel.js` | dev-tool | 4165 bytes — model health sentinel (not wired in CLI) |

### ❓ Unknown
| File | Notes |
|------|-------|
| `coding-eval.js` | Needs audit — is it used? |

---

## scripts/ Directory (66 files + subdirs)

### ✅ Active Service / Cron
| File | Category | Evidence |
|------|----------|----------|
| `heartbeat.js` | active-service | Runtime heartbeat |
| `model-sentinel.js` | active-service | Model health monitoring |
| `nanoclaw.js` | active-service | NanoClaw CLI integration |
| `sync-agents.js` | active-service | Agent registry sync |
| `sync-registry.js` | active-service | Skill registry sync |
| `verify-status.js` | active-service | Status verification |
| `verify-hivemind.js` | active-service | Hivemind verification |

### 🧪 Dev Tools
| File | Category | Evidence |
|------|----------|----------|
| `deep-audit.js` | dev-tool | Deep code audit |
| `demo-factory.js` | dev-tool | Demo factory |
| `benchmark-providers.js` | dev-tool | Provider benchmarking |
| `build-binary-index.js` | dev-tool | Binary index builder |
| `build-safe.js` | dev-tool | Safe build |
| `code-index-fast.js` | dev-tool | Fast code indexer |
| `backfill-memory-retention.js` | dev-tool | Memory retention backfill |
| `checksum-vendor.js` | dev-tool | Vendor checksum |
| `format.sh` | dev-tool | Code formatter |
| `quality-gate.sh` | dev-tool | Quality gate |
| `security-audit.sh` | dev-tool | Security audit |
| `deploy-checklist.sh` | dev-tool | Deploy checklist |
| `backup-config.sh` | dev-tool | Config backup |
| `verify-env.sh` | dev-tool | Env verification |
| `void-init.sh` | dev-tool | Void init |
| `validate-docs.js` | dev-tool | Doc validation |
| `test_memory.py` | dev-tool | Memory tests |
| `test_rules_inline.py` | dev-tool | Rules tests |
| `test_audio_pipeline.py` | dev-tool | Audio pipeline tests |
| `music_analysis_service.py` | dev-tool | Music analysis |
| `diag_audio.py` | dev-tool | Audio diagnostics |
| `find_pulse.py` | dev-tool | Pulse finder |
| `mem_guard.py` | dev-tool | Memory guard |
| `spring_doctrine.py` | dev-tool | Spring doctrine |
| `lora-train.js` | dev-tool | LoRA training |
| `lora-eval.js` | dev-tool | LoRA evaluation |
| `gacha.py` | dev-tool | Gacha system |
| `ui-shot.js` | dev-tool | UI screenshot |

### 🧪 Dev Tools (unwired — need wiring or archive)
| File | Category | Evidence |
|------|----------|----------|
| `init-undefined.js` | dev-tool | Init undefined? |
| `tui.js` | dev-tool | TUI launcher (wired via lib/commands/tui.js?) |
| `tui-ask.js` | dev-tool | TUI ask (wired via loadCmd('ask')) |
| `tui-ng.js` | dev-tool | Next-gen TUI |
| `delegation-status.cjs` | dev-tool | Delegation status |
| `verify-llm-fallback.cjs` | dev-tool | LLM fallback verification |
| `verify-api-spine.cjs` | dev-tool | API spine verification |
| `manifest.js` | dev-tool | Manifest builder |

### ⚙️ Infrastructure / Ops
| File | Category | Evidence |
|------|----------|----------|
| `install.sh` | infrastructure | Install script |
| `install.ps1` | infrastructure | Windows install |
| `clean-foreign-logs.ps1` | infrastructure | Log cleanup |
| `admin-orphan-cleanup.ps1` | infrastructure | Orphan cleanup |
| `purpclaw-watchdog.ps1` | infrastructure | Watchdog |
| `pm2-names.js` | infrastructure | PM2 name lookup |

### 🗂️ Archive / Donor
| File | Category | Notes |
|------|----------|-------|
| `scripts/archive/` | archive | Archive directory — contents unknown, needs listing |
| `phoenix_smoke.py` | archive | Superseded by `phoenix_smoke.sh` + Node.js tests |
| `phoenix_smoke.md` | archive | Documentation for archived file |

### ❓ Unknown
| File | Notes |
|------|-------|
| `lcd_bridge_server.py` | LCD bridge? Not seen in ecosystem |
| `lcd_log_monitor.py` | LCD log monitor? Not seen in ecosystem |
| `AGENT.md` | Agent instructions in scripts dir? |

---

## Subdirectories in scripts/

| Dir | Category | Notes |
|-----|----------|-------|
| `scripts/cognitive/` | active-service | Cognitive spine scripts |
| `scripts/swarm/` | active-service | Swarm scripts |
| `scripts/tasks/` | active-service | Task scripts |
| `scripts/windows/` | infrastructure | Windows-specific scripts |
| `scripts/one-off/` | dev-tool | One-off utilities |
| `scripts/archive/` | archive | Archived scripts |

---

## Next
→ Folder Quarantine (Item 6 — after Items 1-5 complete)
