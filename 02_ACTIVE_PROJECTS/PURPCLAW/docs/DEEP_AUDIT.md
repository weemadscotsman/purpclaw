# PURPCLAW DEEP AUDIT
**Date:** 2026-07-29T15:18:55.074Z

## PM2 Ecosystem
Apps defined: 34
Scripts:
- ./unified_eventbus.js: EXISTS
- ./unified_state.js: EXISTS
- ./unified_api.js: EXISTS
- ./agent_tower.js: EXISTS
- ./voice_coordinator.js: EXISTS
- ./voice_bridge_7792.js: EXISTS
- ./lib/xiaozhi_bridge.js: EXISTS
- ./lib/goop-playground/goop-playground.js: EXISTS
- ./harness_service.js: EXISTS
- ./bin/purpclaw.js: EXISTS
- ./static-server.js: EXISTS
- lib/cowork-overlay.js: EXISTS
- lib/tts/gateway.js: EXISTS
- ./node_modules/next/dist/bin/next: EXISTS
- ./gatekeeper.js: EXISTS
- ./orchestrator.js: EXISTS
- ./apps/companion-chorus/bridge.js: EXISTS
- ./vision_monitor.js: EXISTS
- ./metrics_aggregator.js: EXISTS
- ./lib/drift-watcher.js: EXISTS
- ./pool_service.js: EXISTS
- ./lib/context-bus.js: EXISTS
- ./worker_service.js: EXISTS
- ./lib/reasoning-loop.js: EXISTS
- ./swarm_coordinator.js: EXISTS
- ./voice_ingress.js: EXISTS
- ./voice_stt.py: EXISTS
- ./cognitive_gateway.js: EXISTS
- ./yolo_service.py: EXISTS
- ./simple_bridge.py: EXISTS
- ./lib/gateways/telegram.js: EXISTS
- ./lib/gateways/discord.js: EXISTS
- ./lib/gateways/slack.js: EXISTS
- ./lib/gateways/email.js: EXISTS

## Root Files (87)

| File | Size | Wired |
|------|------|-------|
| .env | 8KB | NO |
| .env.example | 7KB | NO |
| .env.nvidia | 0KB | NO |
| .eslintignore | 0KB | NO |
| .eslintrc.json | 0KB | NO |
| .gitignore | 1KB | NO |
| .purpclawrules | 0KB | NO |
| .robot_shell_probe.js | 1KB | NO |
| .smoke_report.json | 17KB | NO |
| .tmp-pm2g.json | 321KB | NO |
| .tmp_diag_s5.js | 0KB | NO |
| AGENT.md | 1KB | NO |
| ARCHITECTURE.md | 1KB | NO |
| CHANGELOG.md | 7KB | NO |
| DOCS_INDEX.md | 1KB | NO |
| LAUNCH.md | 1KB | NO |
| LICENSE | 1KB | NO |
| MEMORY.md | 1KB | NO |
| NEXT_FEATURES.md | 1KB | NO |
| PRODUCT.md | 1KB | NO |
| QUICKSTART.md | 1KB | NO |
| README.md | 3KB | NO |
| RELEASE_CHECKLIST.md | 1KB | NO |
| SECURITY.md | 1KB | NO |
| SOUL.md | 1KB | NO |
| STATUS.md | 1KB | NO |
| TEST_APPLY_TARGET.txt | 0KB | NO |
| USER.md | 1KB | NO |
| _audit_routes.js | 1KB | NO |
| _fix_apply.js | 6KB | NO |
| _missing_cmds.js | 15KB | NO |
| agent_routing_matrix.js | 21KB | NO |
| agent_score.js | 9KB | NO |
| agent_score.json | 10KB | NO |
| agent_tower.js | 52KB | YES |
| autoDream.py | 20KB | NO |
| autonomous_diagnostics.py | 34KB | NO |
| cognitive_gateway.js | 10KB | YES |
| cognitive_spine.py | 20KB | NO |
| companion_swarm.js | 3KB | NO |
| desktop-screenshot.png | 226KB | NO |
| ecosystem.config.js | 22KB | NO |
| find-siblings.ps1 | 0KB | NO |
| gatekeeper.js | 18KB | YES |
| harness_service.js | 10KB | YES |
| memory_archive.json.gz | 1771KB | NO |
| memory_archive.json.gz.bak | 1754KB | NO |
| memory_archive.json.gz.tmp.22904.32272 | 1383KB | NO |
| memory_matrix_v2.py | 59KB | NO |
| metrics_aggregator.js | 13KB | YES |
| middleware.ts | 3KB | NO |
| modal_logic_engine.py | 35KB | NO |
| neuro_symbolic_bridge.py | 37KB | NO |
| next-env.d.ts | 0KB | NO |
| next.config.js | 1KB | NO |
| orchestrator.js | 89KB | YES |
| package-lock.json | 464KB | NO |
| package.json | 6KB | NO |
| pnpm-lock.yaml | 278KB | NO |
| pnpm-workspace.yaml | 0KB | NO |
| pool_service.js | 19KB | YES |
| post_gigs.bat | 2KB | NO |
| purpclaw.config.example.json | 1KB | NO |
| service_registry.js | 7KB | NO |
| simple_bridge.py | 5KB | YES |
| spring_doctrine.py | 5KB | NO |
| static-server.js | 8KB | YES |
| swarm_coordinator.js | 57KB | YES |
| symbolic_rules_engine.py | 26KB | NO |
| task_decomposer.js | 10KB | NO |
| test-desktop.cjs | 5KB | NO |
| test-fuzzy.js | 1KB | NO |
| test-path.js | 0KB | NO |
| tool_diagnostic.js | 2KB | NO |
| tsconfig.json | 1KB | NO |
| tsconfig.tsbuildinfo | 573KB | NO |
| unified_api.js | 264KB | YES |
| unified_eventbus.js | 8KB | YES |
| unified_state.js | 13KB | YES |
| vision_monitor.js | 15KB | YES |
| voice_bridge_7792.js | 25KB | YES |
| voice_coordinator.js | 20KB | YES |
| voice_ingress.js | 4KB | YES |
| voice_stt.py | 14KB | YES |
| worker_service.js | 14KB | YES |
| yolo_service.py | 6KB | YES |
| yolov8n.pt | 6396KB | NO |

## Root Directories (69)

| Dir | Items | Wired |
|-----|-------|-------|
| .agents/ | 0 | NO |
| .archive/ | 6 | NO |
| .cactus/ | 3 | NO |
| .claude/ | 4 | NO |
| .donors/ | 5 | NO |
| .git/ | 1 | NO |
| .github/ | 4 | NO |
| .guardian/ | 0 | NO |
| .hermes/ | 4 | NO |
| .kiro/ | 7 | NO |
| .next/ | 11 | NO |
| .omnicode/ | 5 | NO |
| .purpclaw/ | 29 | NO |
| .pytest_cache/ | 4 | NO |
| .tmp/ | 30 | NO |
| .tmp-billy-go-ham/ | 9 | NO |
| .tmp-checkpoint-test/ | 1 | NO |
| .trash/ | 0 | NO |
| .versioning/ | 4 | NO |
| DreamTask/ | 1 | NO |
| Samantha's Daily Log/ | 1 | NO |
| TASKS/ | 12 | NO |
| __pycache__/ | 37 | NO |
| _api-mega-list/ | 1 | NO |
| agent_work/ | 411 | NO |
| agents/ | 89 | NO |
| apis for agents/ | 22 | NO |
| app/ | 35 | NO |
| apps/ | 2 | NO |
| bin/ | 17 | NO |
| components/ | 0 | NO |
| config/ | 2 | NO |
| contexts/ | 3 | NO |
| data/ | 3 | NO |
| deploy/ | 5 | NO |
| divisions/ | 9 | NO |
| docs/ | 137 | NO |
| eval/ | 9 | NO |
| harness/ | 2 | NO |
| hooks/ | 13 | NO |
| infra/ | 5 | NO |
| lib/ | 338 | NO |
| logs/ | 1 | NO |
| mochi/ | 9 | NO |
| models/ | 1 | NO |
| node_modules/ | 709 | NO |
| parity/ | 15 | NO |
| pocket/ | 6 | NO |
| podcast_studio/ | 28 | NO |
| prompts/ | 17 | NO |
| public/ | 12 | NO |
| recipes/ | 1 | NO |
| references/ | 1 | NO |
| registry/ | 18 | NO |
| reports/ | 1 | NO |
| research/ | 3 | NO |
| rules/ | 16 | NO |
| schemas/ | 10 | NO |
| scripts/ | 155 | NO |
| settings/ | 1 | NO |
| skills/ | 400 | NO |
| steering/ | 16 | NO |
| swarm_mission/ | 5 | NO |
| tests/ | 7 | NO |
| trip_logs/ | 0 | NO |
| types/ | 1 | NO |
| vendor/ | 4 | NO |
| workflows/ | 1 | NO |
| workspace/ | 16 | NO |

## Subsystems

### bin/ (17 items)
```
[10KB] add-cases.py
[1KB] AGENT.md
[16KB] coding-eval.js
[1KB] fix-app-server.py
[3KB] fix-completion.py
[1KB] fix-mcp-server.py
[1KB] fix_cases.py
[0KB] MISSION.js
[9KB] model-sync.js
[3KB] purpclaw-vector-bench.js
[296150KB] purpclaw.exe
[413KB] purpclaw.js
[401KB] purpclaw.js.debug
[3KB] wire-app-server.py
[3KB] wire-commands.py
[2KB] wire-mcp-server.py
[1KB] wire-mcp.py
```

### lib/ (338 items)
```
[7KB] a2a-runtime.js
[9KB] abliterator.js
[7KB] accuracy-fish.js
[2KB] acp-server.js
[11KB] action-dispatcher.js
[DIR] actions
[8KB] agent-component.js
[3KB] agent-contract.js
[10KB] agent-gateway-server.js
[47KB] agent-gateway.js
[4KB] agent-health.js
[39KB] agent-loop.js
[4KB] agent-personas.js
[2KB] agent-registry.js
[7KB] agent-router.js
[3KB] agent-runtime.js
[8KB] agent-session.js
[3KB] agent-sync.js
[16KB] agent-tools-file.js
[6KB] AGENT.md
```

### skills/ (400 items)
```
[DIR] .skill-scan-cache
[DIR] 1password
[DIR] 3-statement-model
[DIR] accelerate
[DIR] adversarial-self-testing
[DIR] adversarial-ux-test
[DIR] agent-eval
[DIR] agent-harness-construction
[DIR] agent-loop-pattern
[DIR] agent-payment-x402
[3KB] AGENT.md
[DIR] agentic-engineering
[DIR] agentmail
[DIR] ai-composer-pattern
[DIR] ai-first-engineering
[DIR] ai-regression-testing
[DIR] ai-runtime-governance
[DIR] airtable
[DIR] android-clean-architecture
[DIR] antigravity-cli
```

### agents/ (89 items)
```
[5KB] AGENT.md
[15KB] AGENTS_INDEX.md
[181KB] AGENT_REGISTRY.json
[10KB] archetypes.toml
[6KB] architect.md
[1KB] axolotl.md
[1KB] bee.md
[4KB] build-error-resolver.md
[1KB] bunny.md
[1KB] cactus.md
[1KB] chart.md
[6KB] chief-of-staff.md
[1KB] chonk.md
[1KB] claw.md
[9KB] code-reviewer.md
[3KB] cpp-build-resolver.md
[3KB] cpp-reviewer.md
[1KB] crow.md
[5KB] csharp-reviewer.md
[7KB] dart-build-resolver.md
```

### workflows/ (1 items)
```
[0KB] parity-contract.yaml
```

### divisions/ (9 items)
```
[DIR] creative
[DIR] engineering
[DIR] infrastructure
[DIR] intelligence
[DIR] management
[DIR] media-operations
[DIR] operations
[DIR] science
[DIR] security
```

### registry/ (18 items)
```
[14KB] council-profiles.json
[36KB] council-votes.json
[4KB] donor-artifacts.json
[2KB] harness-conformance.json
[180KB] index.json
[10KB] meeting-memories.json
[3KB] presence.json
[34KB] private-conversations.json
[9KB] residue.json
[430KB] soul-interviews.json
[187KB] souls.json
[4KB] studio-memory.json
[6KB] studio-modes.json
[22KB] studio-session-log.json
[0KB] studio-world-state.json
[3KB] surface-capabilities.json
[75KB] timeline.json
[9KB] workflows.json
```

### scripts/ (155 items)
```
[9KB] admin-orphan-cleanup.ps1
[1KB] AGENT.md
[DIR] archive
[35KB] audit-agents.mjs
[4KB] audit-deep.js
[7KB] audit-parity.mjs
[5KB] audit-showcase-claims.mjs
[7KB] AUDIT_PROOF.sh
[3KB] backfill-memory-retention.js
[8KB] backup-config.sh
[8KB] benchmark-providers.js
[2KB] build-binary-index.js
[2KB] build-safe.js
[13KB] build-status.mjs
[4KB] build-steering-registry.js
[1KB] checksum-vendor.js
[2KB] clean-foreign-logs.ps1
[5KB] code-index-fast.js
[DIR] cognitive
[13KB] deep-audit.js
```

### app/ (35 items)
```
[DIR] abliterator
[6KB] AGENT.md
[DIR] agents
[DIR] api
[DIR] awaken
[DIR] bridge
[DIR] chat
[DIR] components
[DIR] dawn
[DIR] evolution
[DIR] frameworks
[DIR] gallery
[6KB] globals.css
[DIR] hooks
[1KB] layout.tsx
[DIR] lib
[DIR] liveforge
[DIR] market-lab
[DIR] memory
[DIR] mission
```

### public/ (12 items)
```
[DIR] board
[DIR] brand
[1KB] debug.html
[1KB] debug_preload.html
[218KB] enthea.html
[13KB] favicon.ico
[124KB] mission.html
[DIR] mochi-assets
[DIR] proofmesh
[DIR] purpclaw-demo
[DIR] showcase
[DIR] _archive
```

### docs/ (137 items)
```
[1KB] AGENTS.md
[8KB] AGENT_ROOT_INDEX.md
[2KB] AGENT_TRUTH_AUDIT.md
[0KB] ARCHITECTURE.md
[106KB] ARCHITECTURE_MAP.md
[DIR] archive
[DIR] artifacts
[DIR] audit
[16KB] AUDIT_2026-06-10.md
[10KB] AUDIT_2026-07-12.md
[8KB] AUDIT_CLOSURE.md
[8KB] AUDIT_PROOF_OUTPUT.txt
[7KB] AUDIT_REPORT.md
[DIR] benchmark
[8KB] BILLING_LIFECYCLE_IMPL.md
[DIR] bios-reports
[2KB] boundaries.md
[DIR] business
[2KB] CANONICAL_MAP.md
[17KB] codex-parity-gap-report.md
```


## Hidden Items

- .env: 8KB
- .env.example: 7KB
- .env.nvidia: 0KB
- .eslintignore: 0KB
- .eslintrc.json: 0KB
- .gitignore: 1KB
- .purpclawrules: 0KB
- .robot_shell_probe.js: 1KB
- .smoke_report.json: 17KB
- .tmp-pm2g.json: 321KB
- .tmp_diag_s5.js: 0KB

## Orphaned Root Files

- `ARCHITECTURE.md` (1KB) — NOT wired to ecosystem or bin
- `CHANGELOG.md` (7KB) — NOT wired to ecosystem or bin
- `DOCS_INDEX.md` (1KB) — NOT wired to ecosystem or bin
- `STATUS.md` (1KB) — NOT wired to ecosystem or bin
- `TEST_APPLY_TARGET.txt` (0KB) — NOT wired to ecosystem or bin
- `_audit_routes.js` (1KB) — NOT wired to ecosystem or bin
- `_fix_apply.js` (6KB) — NOT wired to ecosystem or bin
- `_missing_cmds.js` (15KB) — NOT wired to ecosystem or bin
- `agent_routing_matrix.js` (21KB) — NOT wired to ecosystem or bin
- `agent_score.js` (9KB) — NOT wired to ecosystem or bin
- `agent_score.json` (10KB) — NOT wired to ecosystem or bin
- `autoDream.py` (20KB) — NOT wired to ecosystem or bin
- `autonomous_diagnostics.py` (34KB) — NOT wired to ecosystem or bin
- `cognitive_spine.py` (20KB) — NOT wired to ecosystem or bin
- `companion_swarm.js` (3KB) — NOT wired to ecosystem or bin
- `desktop-screenshot.png` (226KB) — NOT wired to ecosystem or bin
- `find-siblings.ps1` (0KB) — NOT wired to ecosystem or bin
- `memory_archive.json.gz` (1771KB) — NOT wired to ecosystem or bin
- `memory_archive.json.gz.bak` (1754KB) — NOT wired to ecosystem or bin
- `memory_archive.json.gz.tmp.22904.32272` (1383KB) — NOT wired to ecosystem or bin
- `memory_matrix_v2.py` (59KB) — NOT wired to ecosystem or bin
- `middleware.ts` (3KB) — NOT wired to ecosystem or bin
- `modal_logic_engine.py` (35KB) — NOT wired to ecosystem or bin
- `neuro_symbolic_bridge.py` (37KB) — NOT wired to ecosystem or bin
- `pnpm-workspace.yaml` (0KB) — NOT wired to ecosystem or bin
- `post_gigs.bat` (2KB) — NOT wired to ecosystem or bin
- `purpclaw.config.example.json` (1KB) — NOT wired to ecosystem or bin
- `service_registry.js` (7KB) — NOT wired to ecosystem or bin
- `spring_doctrine.py` (5KB) — NOT wired to ecosystem or bin
- `symbolic_rules_engine.py` (26KB) — NOT wired to ecosystem or bin
- `task_decomposer.js` (10KB) — NOT wired to ecosystem or bin
- `test-desktop.cjs` (5KB) — NOT wired to ecosystem or bin
- `test-fuzzy.js` (1KB) — NOT wired to ecosystem or bin
- `test-path.js` (0KB) — NOT wired to ecosystem or bin
- `tool_diagnostic.js` (2KB) — NOT wired to ecosystem or bin
- `tsconfig.tsbuildinfo` (573KB) — NOT wired to ecosystem or bin
- `yolov8n.pt` (6396KB) — NOT wired to ecosystem or bin
