# PURPCLAW Full Stack Audit — 2026-05-24

## PORT MAP (all services)

| Port | Service | PM2 Name | Status |
|------|---------|----------|--------|
| 7780 | Unified API | purpclaw-api | LIVE |
| 7781 | Voice Coordinator | purpclaw-voice | LIVE |
| 7782 | Event Bus | purpclaw-eventbus | LIVE |
| 7783 | State Store | purpclaw-state | LIVE |
| 7784 | Orchestrator | purpclaw-orchestrator | LIVE |
| 7785 | Modal Logic Engine | purpclaw-modal | LIVE ✓ |
| 7786 | Autonomous Diagnostics | purpclaw-diagnostics | LIVE ✓ |
| 7787 | Symbolic Rules Engine | purpclaw-rules | LIVE ✓ |
| 7790 | Agent Tower | purpclaw-tower | LIVE |
| 7791 | Gatekeeper | purpclaw-gatekeeper | LIVE |
| 7792 | Voice Bridge | purpclaw-bridge | LIVE |
| 7881 | Context Bus | purpclaw-context | LIVE |
| 7885 | Pool Service | purpclaw-pool | LIVE |
| 7889 | Vision Monitor | purpclaw-vision | LIVE (health fails — camera dep missing) |
| 7890 | Metrics Aggregator | purpclaw-metrics | LIVE |
| 7892 | Reasoning Loop | purpclaw-reasoning | LIVE |
| 7880 | Memory Matrix | purpclaw-memory | DORMANT — needs faiss + sentence-transformers |
| 7884 | Neuro-Symbolic Bridge | purpclaw-bridge-ns | DORMANT — needs cozo, memory_matrix |
| 7779 | YOLO Service | purpclaw-yolo | DORMANT — needs numpy, cv2, ultralytics |
| 7777 | Avatar Bridge | purpclaw-avatar | DORMANT — needs Electron/3D deps |

---

## CORE SERVICES (all in PM2, all live)

Every PM2-registered service has a corresponding running process. No orphaned services.

```
unified_eventbus.js     7782  ✓ purpclaw-eventbus    referenced by orchestrator
unified_state.js        7783  ✓ purpclaw-state        referenced by orchestrator
unified_api.js          7780  ✓ purpclaw-api          referenced by orchestrator
agent_tower.js          7790  ✓ purpclaw-tower        referenced by orchestrator
voice_coordinator.js   7781  ✓ purpclaw-voice        referenced by orchestrator
voice_bridge_7792.js    7792  ✓ purpclaw-bridge        referenced by gatekeeper
vision_monitor.js      7889  ✓ purpclaw-vision       health check fails (no camera)
metrics_aggregator.js   7890  ✓ purpclaw-metrics      returns degraded (6/17 services down)
gatekeeper.js          7791  ✓ purpclaw-gatekeeper   pre-merge validation
orchestrator.js         7784  ✓ purpclaw-orchestrator central nervous system
pool_service.js         7885  ✓ purpclaw-pool        shared memory organ
lib/context-bus.js      7881  ✓ purpclaw-context      cross-agent communication
lib/reasoning-loop.js   7892  ✓ purpclaw-reasoning    proactive heartbeat
```

**Vision** — health check fails because the service tries to initialize camera but no cam on this PC. Non-fatal. The service starts, port opens, but `/health` returns degraded. Not a wiring issue.

**Metrics** — shows 6 down services. Likely: memory_matrix (7880), neuro-symbolic (7884), yolo (7779), avatar (7777), plus any stopped services. Expected given missing Python deps.

---

## LIB MODULES (all wired somewhere)

All 23 lib/ and root JS modules have `module.exports`. Every one is required by at least one other file. Zero orphans in the lib layer.

```
lib/context-packet.js         ✓ orchestrator.js         — context-packet.write() wired this session
lib/memory-client.js          ✓ orchestrator.js         — preTask/postTask wired
lib/cognitive-client.js       ✓ orchestrator.js         — assertFact/reportEvent wired
lib/llm-provider.js           ✓ orchestrator.js         — multi-provider LLM
lib/job-contract.js          ✓ orchestrator.js         — typed routing + verification gates
lib/governance.js            ✓ orchestrator.js         — approval ledger wired this session
lib/proactive-maintenance.js ✓ orchestrator.js         — proposal/record wired this session
lib/snapshot.js              ✓ orchestrator.js         — rollback snapshots
lib/mochi.js                 ✓ bin/purpclaw.js         — CLI companion (on-demand load)
lib/mochi-sprites.js         ✓ bin/purpclaw.js         — sprite art
lib/mochi-statusbar.js       ✓ bin/purpclaw.js         — status bar rendering
lib/workspace-awareness.js    ✓ screen-look.js          — filesystem watching
lib/screen-look.js           ✓ bin/purpclaw.js         — purpclaw look CLI
agent_score.js              ✓ orchestrator.js         — agent scoring + routing
agent_routing_matrix.js     ✓ orchestrator.js         — INTENT_AGENT_MAP + TEAM_TEMPLATES
task_decomposer.js          ✓ orchestrator.js         — task decomposition
ethics_hooks.js             ✓ orchestrator.js         — conscience preflight check
locked_interfaces.js        ✓ orchestrator.js         — tier enforcement wired this session
companion_swarm.js           ✓ orchestrator.js         — buildAgentPrompt wired this session
digital_shaman.js            ✓ orchestrator.js         — coherence evaluation wired this session
kimi_client.js              ✓ agent_tower.js, unified_api.js — Kimi API client
service_registry.js         ✓ reasoning-tick.js, bin/purpclaw.js — service discovery
shaman_evaluator.js         ✓ unified_api.js          — auto-shaman for unattended trips
lib/spaghetti-audit.js       ✓ bin/purpclaw.js         — purpclaw spaghetti CLI
```

---

## PYTHON SERVICES

```
modal_logic_engine.py    7785  ✓ ONLINE — full Kripke epistemic logic
autonomous_diagnostics.py 7786  ✓ ONLINE — causal fault analysis
symbolic_rules_engine.py  7787  ✓ ONLINE — Datalog forward-chaining

memory_matrix_v2.py      7880  PM2 ✓ — needs: pip install faiss-cpu sentence-transformers
neuro_symbolic_bridge.py 7884  PM2 ✓ — needs: pip install cozo (CozoDB)
yolo_service.py          7779  PM2 ✓ — needs: pip install numpy opencv-python ultralytics
simple_bridge.py         7777  PM2 ✓ — needs: Electron / 3D runtime deps (soft)

autoDream.py            7895  PM2 ✓ — standalone consolidation (not a web server)
loop_of_shame.py        —     no PM2 — conscience logging utility, fires on contradictions
gacha.py               —     no PM2 — soul generator, called by companion-chorus on demand
```

---

## SUB-PROJECTS

```
companion/              LIVE — PetEngine, StateManager, xiaozhi hardware bridge
companion-chorus/       LIVE — PM2 service, reacts to agent.spawned events, gacha spawner
mochi/                  DORMANT — CLI companion loaded on-demand by bin/purpclaw.js. No PM2.
                          State file: agent_work/mochi.json. Works fine, just not a service.
DreamTask/              BROKEN — import paths don't exist (../../services/autoDream/, ../../Task.js)
podcast_studio/         ORPHANED — no PM2, no references, full podcast generation pipeline unused
buddy_TAMAGOTCHI/       ORPHANED — no references, superseded by mochi/ and companion-chorus/
claude-code-tamagotchi/ ORPHANED — independent npm package, not integrated
autoDream/autoDream/    ORPHANED — TypeScript reimpl of autoDream, no callers, nested dead code
harvested/              ORPHANED — ISO files, boot scripts, raw storage, no execution
disabled-commands/      ORPHANED — 5 stub directories with empty index.js files
hooks/                  LIVE (unused) — useAgentTower.ts connects to port 7790, no active consumer
```

---

## WHAT GOT WIRED THIS SESSION

1. **context-packet.write()** → orchestrator.js line ~2010 — agents save output after completing
2. **governance.appendApproval()** → completeWorkflow() + failWorkflow() — full ledger logging
3. **proactiveMaintenance** → completeWorkflow() + failWorkflow() — maintenance proposal on every task end
4. **ecosystem.config.js** → deduplicated modal/diagnostics/rules triple-register
5. **companion_swarm.buildAgentPrompt()** → spawnAgent task build — personality files injected every dispatch
6. **autoDream.py --once** → completeWorkflow() — detached consolidation cycle every 10+ min
7. **locked_interfaces.checkAccess()** → spawnAgent pre-flight — tool-tier enforcement on dangerous ops
8. **digital_shaman.analyzeMessage()** → completeWorkflow() result evaluation — coherence nudge on too-structured output

---

## STILL COLD — NEEDS ATTENTION

| Item | Effort | What |
|------|--------|------|
| memory_matrix_v2.py | pip install | `pip install faiss-cpu sentence-transformers` — unlocks RAG recall on every spawn |
| neuro_symbolic_bridge.py | pip install | `pip install cozo` — bidirectional memory↔rules lift |
| yolo_service.py | pip install | `pip install numpy opencv-python ultralytics` — screen intelligence |
| DreamTask/ broken imports | 30 min | Fix relative paths to match actual directory structure |
| mochi PM2 service | 1 hr | If you want mochi running as a persistent daemon instead of on-demand CLI load |

---

## WIRED INTO ORCHESTRATOR THIS SESSION (reference)

```
Line ~2010   contextPacket.write() after each team agent completes
Line ~1490   governance.appendApproval() on workflow completion
Line ~1510   proactiveMaintenance.proposeMaintenanceJobs() on completion
Line ~1756   companionSwarm.buildAgentPrompt() on single-agent dispatch
Line ~1790   ethicsHooks.preflightCheck() before agent spawn
Line ~1808   lockedInterfaces.checkAccess() before agent spawn
Line ~1525   digital_shaman.analyzeMessage() on workflow result
Line ~1548   autoDream.py --once spawn as detached background process
```