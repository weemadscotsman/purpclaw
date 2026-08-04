# Root File Audit — 2026-06-30
**Classification:** `ARCHITECTURE_TRUTH`
**Purpose:** Documents where every file at project root lives and why.

---

## Canonical Root Files (33) — These Stay

These files are at root because ecosystem.config.js, bin/purpclaw.js, or Next.js require them from here.

### PM2 Services (ecosystem.config.js references from root)
```
unified_api.js           243KB   Unified API server (:7780)
orchestrator.js           88KB   Workflow/orchestration engine (:7784)
agent_tower.js            49KB   Agent spawn/speak (:7790)
swarm_coordinator.js      60KB   Swarm coordination (:7898)
swarm_scheduler.js        14KB   Task scheduling
pool_service.js           19KB   Memory/vector pool (:7885)
voice_coordinator.js       20KB   Voice routing (:8781)
voice_bridge_7792.js      23KB   Voice bridge (:7792)
voice_ingress.js           4KB   Voice ingress
metrics_aggregator.js     13KB   Metrics collection (:7890)
gatekeeper.js             18KB   Permission/auth (:7791)
worker_service.js         14KB   Worker dispatch (:7897)
unified_eventbus.js        8KB   Event bus (:7782)
unified_state.js          13KB   State store (:7783)
unified_bridge.js         19KB   Bridge service
vision_monitor.js          15KB   Vision monitoring
harness_service.js        10KB   Test harness
healthcheck.js             3KB   Health checks
```

### Configuration (required by Node.js / Next.js)
```
ecosystem.config.js       18KB   PM2 process manager config
package.json               3KB   npm package manifest
AGENT.md                   3KB   Agent system documentation
boot.js                   22KB   Manual standalone boot script
```

### CLI + Config (required from root by bin/purpclaw.js)
```
service_registry.js        7KB    Service registry (required by bin/purpclaw.js)
agent_score.js            9KB    Agent scoring logic
agent_score.json          38KB    Agent score data (referenced bin/purpclaw.js:783)
agent_routing_matrix.js  19KB    Model routing matrix (referenced lib/model-router.js)
purpclaw.config.example.json  1KB   Example config
```

### Project Documentation (root-level only — canonical for git, not in docs/)
```
CHANGELOG.md              28KB   Changelog — lives here for git visibility
CLAUDE.md                 12KB   Claude Code instructions — lives here for git visibility
LAUNCH.md                  2KB   Launch overview
QUICKSTART.md              2KB   Quick start guide
README.md                  4KB   Root README (full product doc, larger than docs/README)
SECURITY.md               640B   Security policy
```

---

## Moved Files — Where They Went

### → scripts/cognitive/ (8 files)
```
memory_matrix.py           56KB   Replaced by memory_matrix_v2.py
memory_matrix_v2.py        55KB   Canonical cognitive spine
neuro_symbolic_bridge.py   38KB   Cognitive engine component
modal_logic_engine.py      36KB   Cognitive engine component
autonomous_diagnostics.py  34KB   Diagnostic system
symbolic_rules_engine.py   27KB   Rules engine component
cognitive_spine.py         18KB   Cognitive spine entry point
autoDream.py              20KB   Dream/memory maintenance
```

### → scripts/swarm/ (3 files)
```
hivemind_cli.js           3KB    Hive mind CLI
companion_swarm.js        3KB    Companion swarm logic
digital_shaman.js        19KB   Digital shaman system
```

### → scripts/tasks/ (7 files)
```
task_decomposer.js       21KB    Task decomposition
spinUpAgent.js           11KB    Agent spawn utility
start_purpclaw.js         4KB    Standalone launcher
demo-provider.js           5KB    Demo provider
locked_interfaces.js      9KB    Interface locking
screen-manager.js         4KB    Screen management
```

### → scripts/ (utilities)
```
voice_stt.py              13KB   Voice STT
lcd_bridge_server.py      11KB   LCD bridge
gacha.py                   6KB   Gacha system
lcd_log_monitor.py         5KB   LCD log monitoring
diag_audio.py             4KB   Audio diagnostics
test_audio_pipeline.py     4KB   Audio pipeline tests
simple_bridge.py           4KB   Simple bridge
test_rules_inline.py       2KB   Rules tests
test_memory.py             1KB   Memory tests
find_pulse.py              1KB   Pulse finder
mem_guard.py               5KB   Memory guard
music_analysis_service.py  42KB   Music analysis
spring_doctrine.py         5KB   Spring doctrine
yolo_service.py            5KB   YOLO service
```

### → scripts/one-off/ (debug/temp scripts)
```
_fix_chat.js              5KB    Chat fix script
_wire.js                  2KB    Wire script
_fix3.py                   1KB    Fix v3
_fix2.py                   1KB    Fix v2
_fix_spine.py              1KB    Spine fix
_find_spine.py             1KB    Find spine
_inspect_spine.py          1KB    Inspect spine
```

### → scripts/archive/companion/
```
shaman_evaluator.js       11KB    Shaman evaluator
shaman_prompts.js         12KB    Shaman prompts
autodream_state.json       1KB    AutoDream state
shaman_state.json          1KB    Shaman state
```

### → scripts/archive/memory/
```
memory_archive.json.gz    14MB    Compressed memory archive
memory_archive.json.gz.bak 14MB    Backup
memory_archive.json.gz.tmp.27520.13476 9MB   Partial tmp archive
```

### → scripts/archive/build/ (build config, not runtime)
```
tsconfig.tsbuildinfo     231KB   TypeScript build cache
tsconfig.json             1KB    TypeScript config
eslint.config.mjs        325B    ESLint config
postcss.config.mjs        177B    PostCSS config
next.config.ts           1903B   Next.js config
next-env.d.ts             268B    Next.js types
_meta.json                134B    Meta config
policies.json            1933B    Policies data
package-lock.json        340KB    npm lock (MUST stay in git root for npm)
```

### → scripts/archive/installers/
```
Dockerfile                5694B   Docker image definition
docker-compose.yml        9212B   Docker compose
install.sh               4459B   Unix installer
install.ps1               7KB    PowerShell installer
purpclaw_install.sh       2KB    PURPCLAW installer
PURPCLAW_INSTALLER.bat    2KB    Windows batch installer
purpclaw_health_check.ps1 3KB    Health check script
smoke_test.sh             92B    Smoke test
apply_spring_patch.sh     395B   Patch applier
```

### → scripts/archive/patches/
```
PURP*.diff               259KB   Spring doctrine runtime patch
PURP*.md (11 files)     varying Patch manifests + validation reports
HIVE_PATCH_MANIFEST.json  1KB   Hive patch manifest
```

### → scripts/archive/old-docs/ (24 files — all superseded by docs/ versions)
```
AGENT.md, AGENTS.md, STACK_MAP.md, AGENT_ROOT_INDEX.md, METRICS.md,
Router.md, scaling.md, TROUBLESHOOTING.md, CONTRIBUTING.md,
FIRST_RUN.md, ONBOARDING_FLOW.md, setup.md, STATUS.md,
INDEX_SPEC.md, boundaries.md, corrections.md, learning.md,
memory.md, memory-template.md, reflections.md, operations.md,
DOCS_INDEX.md, openclaw-heartbeat.md, heartbeat-rules.md,
heartbeat-state.md, HEARTBEAT.md, SKILL.md
```
All have larger/newer versions in docs/.

### → scripts/archive/ (misc)
```
audit.fallback.log        21KB    Fallback audit log
hello.txt                  20B    Test file
echo                       20B    Test file
boston_analysis.py         3KB    Boston analysis (scraped)
create_db.py               1KB    Database creation
scrape_stdu.py             2KB    Scrape script
scrape_stdu_news.py        3KB    News scraper
scrape_zhihu.py            1KB    Zhihu scraper
scrape_stdu.ps1            1KB    PowerShell scraper
mimi_speak.py              1KB    Mimi speak
stress.cjs                14KB    Stress test (not referenced anywhere)
replace.js                 1KB    Replace utility
```

---

## Collision Resolution (root vs docs/)

When a file existed both at root AND in docs/, the larger/newer version was kept, the older/smaller was archived.

| File | Root kept | docs/ kept | Archive reason |
|------|-----------|------------|---------------|
| CHANGELOG.md | ✅ 28KB Jun 30 (LIVE edits) | archived 19KB | root has session edits |
| CLAUDE.md | ✅ 12KB | archived 9KB | root larger |
| AGENT.md | archived 2KB | ✅ 5KB Jun 23 | docs newer |
| LAUNCH.md | archived 2KB | ✅ 2KB Jun 29 | docs newer |
| QUICKSTART.md | archived 2KB | ✅ 6KB | docs larger |
| README.md | ✅ 4KB (full product) | archived 1KB | root is real README |
| SECURITY.md | ✅ 640B | archived 640B (identical) | root kept |

---

## Doctrine

Files at root MUST be either:
1. Required by ecosystem.config.js (PM2 services)
2. Required by bin/purpclaw.js from root path
3. npm/Node.js standard (package.json, tsconfig.json, .mjs configs)
4. Root-level project documentation (CHANGELOG.md, CLAUDE.md, README.md, etc.)
5. PM2 process config (ecosystem.config.js)

Files not meeting these criteria belong in lib/, scripts/, or docs/.

---

## Post-Consolidation Root Inventory

```
33 canonical root files
  ├── 19 PM2 services (all ecosystem.config.js references)
  ├── 5 configuration files
  ├── 7 project documentation files
  └── 2 CLI/task scripts

155 files moved to scripts/
  ├── scripts/cognitive/       8 cognitive/Python engines
  ├── scripts/swarm/           3 swarm agents
  ├── scripts/tasks/           7 task utilities
  ├── scripts/                  14 general utilities
  ├── scripts/one-off/         7 debug scripts
  ├── scripts/archive/          9 misc + data
  ├── scripts/archive/companion/ 4 companion files
  ├── scripts/archive/memory/   3 memory archives (38MB)
  ├── scripts/archive/build/    8 build configs
  ├── scripts/archive/installers/ 8 installers
  ├── scripts/archive/patches/ 5 patch files
  └── scripts/archive/old-docs/ 24 obsolete docs
```
