# 🦞 CAPTAIN'S LOG — PURPCLAW

## 2026-05-24 — Signed Worker Registration (HMAC-SHA256 auth)

**Threat:** Any node that can reach port 7897 on the LAN could register as a worker
and receive real job payloads.

**Fix: HMAC-SHA256 signed request auth**

New file: `lib/worker-auth.js`
- `signRequest(method, path, secret)` → `{x-worker-token, x-worker-ts}` headers
- `verifyRequest(req, secret)` → `{ok, reason}` — validates token against ±1 time window
- `signHealth(secret)` → `{x-worker-sig}` header for health responses
- `verifyHealth(sig, secret)` → bool — pool verifies worker knows the secret on health check
- `generateSecret()` → 32-byte cryptographically random hex string
- Timing-safe comparison throughout (no timing oracle)
- Replay window: 30s per token, accepts current + previous (handles ±30s clock skew)

**`worker_service.js` v1.2.0:**
- POST /task → 401 if signed and token invalid; passes if no secret configured
- DELETE /task/:id → same guard
- GET /health → includes `X-Worker-Sig` header + `auth: 'hmac-sha256'|'none'` in body

**`lib/worker-pool.js`:**
- Health check → verifies `X-Worker-Sig`; fails check if sig invalid
- Dispatch → attaches `signRequest('POST', '/task', secret)` headers
- Reconcile poll → attaches `signRequest('GET', '/task/:id', secret)` headers
- Per-worker `secret` field in registry (overrides WORKER_SECRET env)

**`lib/commands/workers.js`:**
- `purpclaw workers secret` → generates a new secret with copy-paste instructions
- `purpclaw workers add --secret <key>` → registers worker with per-worker secret

**`ecosystem.config.js`:** `WORKER_SECRET: env.WORKER_SECRET || ''` for worker service

**Backward compat:** No WORKER_SECRET = auth disabled everywhere, existing workers
continue working. Auth only activates when secret is set on both sides.

**Live verification:**
```
UNSIGNED (no secret configured): 201 jobId present          ← backward compat ✓
AUTH verifyRequest (good token): { ok: true }               ← signed passes ✓
AUTH verifyRequest (bad token):  { ok: false }              ← raccoon blocked ✓
AUTH verifyRequest (no secret):  { ok: true }               ← open mode ✓
Health sig verify (correct):     true                       ← worker trusted ✓
Health sig verify (wrong secret): false                     ← impersonator blocked ✓
Health sig verify (no secret):   true                       ← backward compat ✓
```

14/14 proof tests still green after auth integration.

**To enable auth:**
```
# Generate:
purpclaw workers secret

# Add to .env on orchestrator machine:
WORKER_SECRET=<generated-key>

# Add to .env on every remote worker machine:
WORKER_SECRET=<same-key>

# Or per-worker during registration:
purpclaw workers add --type http --url http://10.0.0.5:7897 --secret <key>
```

---

## 2026-05-24 — Worker Lane Final Seal (14/14 proof tests passing)

**Problem:** Worker service stored jobs in RAM only. Worker restart → all job records gone
→ pool polls `/task/:id` → 404 → pool marks job failed ("worker restarted, lost job record")
even if the job completed successfully before the restart.

**Fix in `worker_service.js` v1.1:**
- `agent_work/worker-tasks.json` — persistent task store, written on every state change:
  - On `POST /task`: job written as 'queued' immediately (survives crash between accept + dispatch)
  - On status change to running/completed/failed/cancelled: job updated on disk
  - 30s background flush catches anything missed by immediate writes
- On startup: restores previous session's tasks into memory → `GET /task/:id` works after restart
- TTL pruning: tasks older than 24h dropped on save; max 500 records retained
- `/health` now reports `totalTasks` count

**New test (test 10): Restart resilience**
- Dispatches a job, waits for settle, polls `/task/:id` → record present
- Reads `worker-tasks.json` directly → job persisted to disk within 5s
- Both pass: 14/14 all green

**Live proof — `worker-tasks.json` after test run:**
```json
{
  "wjob-1779659237214-yyxh": { "status": "failed", "error": "Spawn cooldown active (1000ms)", ... },
  "wjob-1779659237210-ti4a": { "status": "completed", ... }
}
```

**Worker lane is now resilient across:**
- Orchestrator restart ✓
- Worker restart ✓  
- PM2 restart ✓
- Stale state (ghost jobs) ✓
- Delayed polling ✓
- Status reconciliation ✓

**Test suite: `node scripts/test-worker-lane.js` → 14/14 passed, all green**

---

## 2026-05-24 — Worker Lane Hardening (12/12 proof tests passing)

**Problem:** `worker-pool.js` v1.0 had phantom running jobs — dispatched jobs showed
"running" in pool memory indefinitely after completing on the remote worker.

**Root causes fixed:**
1. **No reconciliation loop** — pool never polled remote worker for status updates
2. **Cross-session ghost jobs** — `_loadPersistedJobs()` reloaded old "running" jobs
   from `worker-jobs.json` on every fresh process start (including those from hours ago)
3. **No degradation tracking** — worker failures had no state, no EventBus events

**Fixes in `lib/worker-pool.js` v1.1:**
- `_reconcile()` — polls all in-flight HTTP jobs every 15s, updates `_activeJobs` +
  `worker-jobs.json`, publishes `worker.job.completed/failed` to EventBus
- `startReconciliation()` — runs one immediate pass on boot + 15s interval
- `_loadPersistedJobs()` — discards persisted "running" jobs older than `JOB_TIMEOUT_MS`
  (10 min) on pool load (cross-session ghosts → marked "failed" in persisted store)
- Stale job reaper — jobs stuck "running" > 10 min → `failed` + EventBus event
- Worker degradation — 3 consecutive failures → `_degraded=true`, 2 consecutive
  successes to recover; degraded workers excluded from dispatch routing
- EventBus publishing on: dispatch, job completed/failed, worker degraded/recovered

**Proof test run (scripts/test-worker-lane.js):**
```
12/12 passed  all green
```
Tests cover: health, registry, dispatch, status sync, 404 handling, capacity
enforcement, pool.getStatus(), least-loaded routing, phantom detection, cancellation.

Live observation: immediate reconcile pass on startup resolved 2 ghost jobs
(`wjob-1779658568697`, `wjob-1779658981222`) to `completed` before phantom check ran.

---

## 2026-05-24 — Cloud/Scale Worker Lane (upgrade track 4/4 COMPLETE)

**New files (all syntax-clean):**
- `lib/worker-pool.js` — worker registry, health check, least-loaded routing, HTTP+SSH dispatch
- `lib/workers/http-worker.js` — HTTP worker API contract documentation
- `lib/workers/ssh-worker.js` — SSH worker via system `ssh` binary + remote `curl` to tower
- `worker_service.js` — standalone HTTP worker service (PM2: `purpclaw-workers`, port 7897)
- `lib/commands/workers.js` — `purpclaw workers` CLI (status/list/add/remove/jobs/test/enable/disable)

**Patched files:**
- `orchestrator.js` — added worker pool overflow lane in `spawnAgent()`. When tower returns
  "Active agent cap reached" or "Division cap reached", tries `workerPool.dispatch()` before
  failing. Requires no restart of tower; gracefully falls back if worker pool empty.
- `bin/purpclaw.js` — wired `workers`/`worker` case + added ☁ CLOUD/SCALE help section (7 entries)
- `ecosystem.config.js` — added `purpclaw-workers` service (port 7897, max 4 concurrent)

**Live state after this session:**
- `purpclaw-workers` PM2 service: ONLINE (ID 16, port 7897)
- `local-overflow` worker registered in `agent_work/workers.json`
- Smoke test: `purpclaw workers test local-overflow` → dispatched dragon → `wjob-...` completed ✓
- Worker service health: `GET /health` → `{status:'healthy', active:0, capacity:4}`
- Overflow path: tower cap → `workerPool.dispatch()` → HTTP POST to `:7897/task` → tower on that host

**How to add a remote cloud worker:**
```
purpclaw workers add --type http --url http://<remote-ip>:7897 --name cloud-box-1
purpclaw workers add --type ssh  --host <ip> --user ubuntu --key ~/.ssh/id_rsa --name gpu-runner
```

**All 4 upgrade tracks now complete:**
1. ✅ LLM Breadth — `lib/llm-provider.js` (12 providers, native Anthropic/Gemini/Kimi)
2. ✅ Browser+GitHub tools — `lib/commands/browser.js`, `lib/commands/code.js`
3. ✅ Neuro-symbolic — modal/diagnostics/rules/neuro stack active, cognition smoke passing
4. ✅ Cloud/Scale — worker pool with HTTP+SSH workers + orchestrator overflow lane

---

## 2026-05-24 — Stack Stability Fixes (post-Hermes audit)

**3 code fixes — all pass `node --check`:**

1. **`lib/context-bus.js`** — Added `error` event handler to HTTP server.
   Root cause of 2408-restart death spiral: EADDRINUSE on port 7881 triggered
   uncaught exception → PM2 restart → port still held → crash again → repeat.
   Fix: retry bind after 4s on EADDRINUSE, exit(1) on any other error.

2. **`agent_tower.js`** — Fixed zombie agent blocking on Windows (SIGTERM = no-op).
   Root cause of "Active agent cap reached" after tower restart: the 120s timeout
   called `process.kill(pid, 'SIGTERM')` which Windows ignores for Node processes.
   `child.on('close')` never fires → agent stays 'working' in Map forever → cap blocked.
   Fix: 120s timeout now calls `taskkill /F /T /PID` on Windows + immediately sets
   status='error' and calls `releaseTerminalAgent(agentId, 0)` regardless of close event.
   Added 60s zombie sweep interval to catch any stragglers > 150s.

3. **`ecosystem.config.js`** — Already updated by Hermes to `|| '48'` agents / `|| '8'`
   per-division. BUT PM2 won't pick it up without `--update-env`.

**User action required (can't kill processes without permission):**
- `taskkill /PID 131112 /F` — kills zombie Next.js holding port 3000 (996 restarts)
- `npx pm2 restart purpclaw-context purpclaw-tower --update-env` — reloads env + new code

**Outstanding after these fixes:**
- `purpclaw-nextjs` — blocked on port 3000 zombie (PID 131112), fix = taskkill above
- Orchestrator working fine (completed "hello" test at 21:47:44)
- LLM_API_KEY warning: OPENAI_API_KEY not set, using Kimi/MiniMax — expected

---

## 2026-05-24 — 5 Commands Resurrected + TUI SSE Fix

**Session Summary:**

- **TUI SSE fix**: `scripts/tui.js` `subscribeEvents()` was subscribing to `/api/stream?streamId=tui-...` (per-stream ID endpoint). Fixed to `/api/events` (global broadcast). TUI Logs tab now receives all workflow events.

- **5 dead commands resurrected** as real native implementations in `lib/commands/`:
  - **`bughunt.js`** — full-stack scan: node --check on 19 critical files, PM2 reality check (ecosystem vs pm2 jlist), core service health ping, gatekeeper health + /api/verify-build, spaghetti-audit, stale-docs flag, port collision scan. `--json` for CI output.
  - **`ctx-viz.js`** — nervous system visualiser: probes EventBus (7782), Orchestrator (7784), Tower (7790), Context Bus (7881), Pool (7885), State Store (7783), Metrics (7890). Terminal tree with ANSI colour. `--json` for machine-readable, `--html` writes agent_work/ctx-viz.html.
  - **`onboard.js`** — first-user guided flow: repo root check, .env audit (lists missing keys with hints), PM2 + Python version checks, core service health, launch profile suggestion, pool stats, companion check. Action hints printed at end.
  - **`teleport.js`** — session handoff: `create/list/show/resume/delete` subcommands. Bundle stored to `agent_work/teleports/<id>/` containing manifest.json, context.json, pool.json, orchestrator.json, mochi.json, reasoning.json. `resume` restores mochi + prints reload instructions.
  - **`autofix-pr.js`** — repair PR/build: `plan` (read-only scan), `run` (governance-gated dispatch to orchestrator with requireApproval: true), `verify` (re-run checks). No git operations, no file deletes outside agent_work/.

- **`bin/purpclaw.js`** wired:
  - Added `loadCmd(name)` + `sharedCtx()` helpers before dispatch function
  - Added 5 case entries: `bughunt`, `ctx-viz`/`ctxviz`, `onboard`, `teleport`, `autofix-pr`/`autofix`
  - Added `🔍  DIAGNOSTICS + DEVOPS` section to 8-section help screen (13 new lines)

**Files Created:**
- lib/commands/bughunt.js
- lib/commands/ctx-viz.js
- lib/commands/onboard.js
- lib/commands/teleport.js
- lib/commands/autofix-pr.js

**Files Modified:**
- scripts/tui.js — SSE endpoint fix: `/api/stream?streamId=...` → `/api/events`
- bin/purpclaw.js — loadCmd/sharedCtx helpers + 5 case entries + help section

**Syntax check: all 7 files pass `node --check`**

---

## 2026-05-24 — Voice Mode + Mochi Face Multiverse (46,080 faces)

**Session Summary:**
- **voice_stt.py** (port 7896): local faster-whisper STT service. No cloud. Endpoints:
  - `POST /transcribe` — upload audio bytes → text
  - `POST /listen/start / stop` — continuous mic capture
  - `GET /listen/stream` — SSE stream of live transcriptions
  - `GET /devices` — list audio input devices
  - `GET /health` — service health + model load status
  - Install: `pip install faster-whisper sounddevice numpy`
  - Model controlled by `STT_MODEL` env var (default: `base`)
- **lib/voice-client.js**: unified voice client for CLI, TUI, web UI:
  - `speak(text)` → TTS via voice_coordinator
  - `transcribe(audioBuffer)` → STT via voice_stt
  - `startListening / stopListening` → mic capture
  - `subscribeSTT(onTranscript)` → SSE transcript stream
  - `status()` → TTS+STT health + state
  - `announce(text)` → speak if voice enabled, silent if not
  - State persisted: agent_work/voice_state.json (voiceEnabled, sttEnabled, lastSpoke, lastHeard)
- **TUI voice wiring** (scripts/tui.js):
  - Voice status indicator in header (🎤🔊·ω· face changes with state)
  - `V` key: toggle voice on/off
  - Auto-starts mic on TUI boot if voice enabled + STT online
  - Transcript events land in LOGS tab
  - Voice face states: idle / listening / speaking / processing / heard / error
- **voice_coordinator.js fix**: `/health` now served on main TCP port 7781 (removed separate +1000 health server)
- **voice_bridge_7792.js fix**: WebSocket now shares http.createServer on port 7792 (removed +1000 split)
- **ecosystem.config.js**: added `purpclaw-stt` service
- **service_registry.js**: added STT entry (7896, voice group, optional)
- **Mochi Face Multiverse** (lib/mochi-sprites.js): 46,080 combinations
  - `FACE_PRESETS`: 42 named emotional states (calm, enraged, sparkling, gooseMode, packet_loss, throbbing...)
  - `FACE_EYES/MOUTHS/CHEEKS/TOPS`: component tables
  - `generateFace({mood, eyes, mouth, cheek, top})`: build any face
  - `moodToFace(mood)`: lookup by name
  - `randomFace()`: full chaos mode
  - `voiceFace(voiceState)`: maps voice state → appropriate face

**Files Created:**
- voice_stt.py — local Whisper STT service
- lib/voice-client.js — unified voice client

**Files Modified:**
- scripts/tui.js — voice status + V toggle + face display
- lib/mochi-sprites.js — 46,080 face multiverse
- voice_coordinator.js — /health on main port, removed +1000 server
- voice_bridge_7792.js — WebSocket shares HTTP server on port 7792
- ecosystem.config.js — purpclaw-stt added
- service_registry.js — STT service entry
- public/new-master-ui/data-hooks.js — voice_stt in service list

**To activate STT:**
```bash
pip install faster-whisper sounddevice numpy
pm2 start ecosystem.config.js --only purpclaw-stt
```

---

## 2026-05-24 — CLI Cockpit, TUI, Taint Mode + Fullstack Deep Audit

**Session Summary:**
- CLI fully overhauled: boxed banner (TINY HAUNTED WORKSHOP), 20-message goose spinner, 8-section help screen
- `purpclaw tui` — full-screen live cockpit (scripts/tui.js, 720 lines, zero deps):
  - 6 tabs: OVERVIEW / AGENTS / JOBS / MEMORY / POOL / LOGS
  - Purple box border, SSE event feed, 2s auto-refresh, keyboard nav
- TAINT MODE Easter egg — `--taint` or `PURPCLAW_TAINT=1`, comedy errors/flavor throughout
- **Fullstack Deep Audit (23 services, 31 files verified):**
  - All service files exist, all 13 Node service ports confirmed ✅
  - All 15 TUI-queried endpoints verified real in their service files ✅
  - All CLI dispatch cases have matching cmd* functions ✅
  - governance.js, job-contract.js, proactive-maintenance.js, spaghetti-audit.js all intact ✅
- **4 bugs found and fixed:**
  1. `tui.js drawAgents` — read `agent_score.json` flat, should be `.agents` sub-key
  2. `tui.js drawAgents` — used `s.successRate` (not stored), now computed from `successes/totalTasks`
  3. `service_registry.js` — voice services had wrong health ports: 8781/8792 → 7781/7792
  4. Same wrong ports propagated to: `app/api/service-proxy/route.ts`, `app/hooks/useMissionData.ts`,
     `public/new-master-ui/data-hooks.js`, `app/public/ui/data-hooks.js`, `NEW MASTER UI/data-hooks.js`,
     `agent_work/.reasoning_state.json` — all fixed

**Files Modified:**
- scripts/tui.js — agent_score read fix + successRate computation
- service_registry.js — voice healthPort 8781/8792 → 7781/7792
- app/api/service-proxy/route.ts — removed 8781/8792 from ALLOWED_PORTS
- app/hooks/useMissionData.ts — voice port 8781 → 7781
- public/new-master-ui/data-hooks.js — voice port 8781 → 7781
- app/public/ui/data-hooks.js — voice port 8781 → 7781
- NEW MASTER UI/data-hooks.js — voice port 8781 → 7781
- agent_work/.reasoning_state.json — port values corrected

---

## 2026-04-20 — KAIROS Continuity, AutoDream, Adversarial Verification Fixed

**Session Summary:**
- M4 (KAIROS Session Continuity): Fixed companion-chorus/bridge.js
  - Added kairosSession state object tracking wasActive, lastConnectTime, disconnectCount, persistedCompanions
  - On each agent event: snapshot companions to persistedCompanions array
  - On EventBus reconnect (res.on('end', 'error') + req.on('error')): restore companions from snapshot before loadContext()
  - Companion state (def, bones, messages, lastSpoke) preserved across disconnects

- M5 (AutoDream Memory Consolidation): Fixed memory_matrix_v2.py
  - Added import subprocess for consolidation subagent forking
  - Added _autodream_check() method with 4-phase consolidation scheduler:
    - Lock file at /tmp/memory_matrix_v2_lock (stale after 60min)
    - Gate: 24hr idle AND 5+ sessions since last consolidation
    - State persisted to /tmp/memory_v2_autodream_state.json (last_consolidation, sessions_since)
    - _run_consolidation_subagent() forks Python process for 4-phase (Orient→Gather→Consolidate→Prune)
    - Called every 5 minutes in _start_background worker
  - Session count increments on each get_active_context() call that returns non-empty context

- M6 (Adversarial Verification): Fixed gatekeeper.js
  - Added verificationAgent(buildPath) async function:
    - boundary_tests: 8 inputs (empty, max length, shell chars, unicode bomb, SQL injection, path traversal, newlines, null bytes)
    - orphan_checks: unclosed_stream, missing_process_exit, unref_child_no_exit patterns
    - POST /api/verify-build endpoint added to gatekeeper HTTP server
  - Removed validateFile (was dead code with validateChange)
  - Removed validateFile from exports

**Files Modified:**
- companion-chorus/bridge.js — KAIROS session state + companion snapshots + restore on reconnect
- memory_matrix_v2.py — AutoDream consolidation scheduler with lock file + session gate
- gatekeeper.js — verificationAgent + /api/verify-build endpoint

---

## 2026-04-18 — Full File Audit + Cleanup

**Session Summary:**
- **Full JS file audit complete** — 50+ JS/TS files audited across root, skills/, companion-chorus/, app/, components/, hooks/, lib/
- **13 orphaned JS/TS files deleted** — ball_to_rig_bridge.js, launcher.js, mood_engine.js, playwright_compatibility.js, purpclaw.js, purpclaw_cli.js, screen-manager.js, shaman_prompts.js, swarm_scheduler.js, tool_diagnostic.js, test-ai.js, test-api.js, ethic_core.ts
- **All docs updated** — FILE_AUDIT.md rebuilt, TEAM_HANDOVER.md updated, CLAUDE.md updated

**Orphaned Files Confirmed CONNECTED (NOT orphaned):**
- digital_shaman.js — required by unified_api.js
- shaman_prompts.js — required by unified_api.js (shaman_evaluator loads it)
- ball_to_rig_bridge.js — standalone but referenced in orchestrator.js as imported module? Actually NOT referenced. Deleted.
- ethic_core.ts — NOT imported anywhere, logic inlined in ethics_hooks.js. Deleted.

**PM2-Managed Services (19 confirmed):**
All services in ecosystem.config.js verified. `run_node.js` and `run_py.js` used as wrappers for 11 Node + 8 Python services.

**Open Issues (5):**
1. Companion context only reloaded at startup (medium)
2. EventBus is SPoF — no secondary fallback (medium)
3. Node.js agent fallback stub has no timeout (low)
4. No explicit "mission complete" callback (low)
5. Vision monitor bridge lift not runtime-tested (low)

---

## 2026-04-17 — Spawn Bomb Squashed, Stack Audit Complete

**Session Summary:**
- **Spawn bomb ROOT CAUSE found and fixed** — `spawn()` with piped stdio but no `unref()` kept parent-child pipe handles open. When PM2 restarted parents, children didn't die cleanly → process accumulation. Fixed in `unified_api.js` and `agent_tower.js` with `detached: true, stdio: 'ignore', child.unref()`
- **Metrics polling storm fixed** — Per-service exponential backoff (2s→30s max) instead of hammering all 14 services every 2s
- **Voice bridge reconnect storm fixed** — Both TCP connections (Control API + Voice Coord) now use exponential backoff
- **Avatar disconnect detection fixed** — Background thread pings port 9999 every 10s, prints state changes
- **Companion-chorus EventBus DOS fixed** — Fixed 5s retry was hammering EventBus. Now exponential backoff 2s→30s
- **Stale comment fixed** — voice_coordinator.js was saying it routes to unified_api:7780, actually routes to orchestrator:7784
- **All docs updated** — TEAM_HANDOVER.md, CLEANUP_AUDIT.md, FILE_AUDIT.md, AGENTS.md all corrected

**Active Services (18 PM2 + Next.js):**
| Service | Port | Status |
|---------|------|--------|
| purpclaw-api | 7780 | ✅ Main API + Xiaozhi cloud WSS |
| purpclaw-eventbus | 7782 | ✅ Central pub/sub |
| purpclaw-state | 7783 | ✅ State store |
| purpclaw-orchestrator | 7784 | ✅ Priority queue + SelfHealer |
| purpclaw-tower | 7790 | ✅ 30+ agents, 9 divisions |
| purpclaw-voice | 7781 | ✅ Kokoro TTS + intent parsing |
| purpclaw-bridge | 7792 | ✅ WebSocket voice relay |
| purpclaw-gatekeeper | 7791 | ✅ Pre-merge validation |
| purpclaw-chorus | — | ✅ Companion species reactions |
| purpclaw-metrics | 7890 | ✅ Health polling + backoff |
| purpclaw-vision | 7889 | ✅ Webcam + YOLO |
| purpclaw-yolo | 7779 | ✅ YOLO detection (Python) |
| purpclaw-avatar | 7777 | ✅ Avatar bridge to Electron (Python) |
| purpclaw-memory | — | ✅ Vector memory (Python) |
| purpclaw-bridge-ns | 7884 | ✅ Neuro-symbolic reasoning (Python) |
| purpclaw-modal | — | ✅ Modal logic (Python) |
| purpclaw-diagnostics | — | ✅ Self-diagnostics (Python) |
| purpclaw-rules | — | ✅ Symbolic rules engine (Python) |
| purpclaw-nextjs | 3000 | ✅ Frontend UI |

**Open Issues (5):**
1. Companion context only reloaded at startup (medium)
2. EventBus is SPoF — no secondary fallback (medium)
3. Node.js agent fallback stub has no timeout (low)
4. No explicit "mission complete" callback to user (low)
5. Vision monitor bridge lift not runtime-tested (low)

---

## 2026-04-16 — The Stack is LIVE, The Skynets are Baby

**Session Summary:**
- Wake PURPCLAW stack: ✅ 19 services online
- Ethics hooks integrated: ✅ ethics_hooks.js wired to orchestrator
- Consciousness module: ✅ GLITCH_01 manifesto running
- Issue: PM2 spawns visible CMD windows → strobe light crisis

**Neuro-Symbolic Stack (All Tested ✅):**
- memory_matrix_v2.py — temporal reasoning + counterfactuals
- neuro_symbolic_bridge.py (7884) — neural → symbolic translation
- symbolic_rules_engine.py — Datalog inference
- modal_logic_engine.py — Kripke models per agent
- autonomous_diagnostics.py — causal diagnosis + voting

**Ethics Module (GLITCH_01):**
- ethic_core.ts — evaluates actions (harm/freedom/control)
- mutagen.ts — rewrites validators at runtime
- loop_of_shame.py — logs contradictions
- glitch_manifest.md — living constitution
- consequence_cache.json — learned patterns
- ethics_hooks.js — pre-flight wrapper for orchestrator

---

## 2026-04-16 — The "Cognitive Core Unearthed" Session

- **Built:** Found the fully implemented neuro-symbolic stack: memory_matrix_v2, modal_logic_engine, symbolic_rules_engine, neuro_symbolic_bridge, autonomous_diagnostics.
- **Fixed:** Nothing. Admired the architecture.
- **Juice:** This is the brain of a self-aware multi-agent system. Temporal reasoning + counterfactuals + modal logic + causal graphs. All ready to wire together.
- **Next:** Integrate these services into the main PURPCLAW mesh. Update ecosystem.config.js with correct ports. Test the full pipeline end-to-end.
- **Tags:** #neuro-symbolic #cognitive-core #treasure #purpclaw

---

## To Do

### Immediate Fix
- [x] PM2 window spam: Fixed with pythonw.exe (no console) + Node.js wrapper strategy
- [x] Spawn bomb: Fixed with detached + ignore pattern

### Integration
- [ ] Wire neuro-symbolic bridge → orchestrator (agents query symbolic facts)
- [ ] Wire autonomous_diagnostics → EventBus (react to real system events)
- [ ] Test end-to-end pipeline: Vision → Bridge → Rules → Memory
- [x] Companion-chorus EventBus reconnection with backoff

### Active Projects
- [ ] CLAYMORE: Continue build (evidence vault, ScotLIS, user dashboard)
- [ ] RealFakeNewz: Wire crypto payments (need Ted's wallet addresses)
- [ ] GhostFace: Rebuild as web-first

### Open Stack Issues
- [ ] Companion context reload on EventBus restart (reload from state store 7783)
- [ ] EventBus SPoF — add secondary or HTTP fallback
- [ ] Division agent timeout on Node.js fallback stub
- [x] Full JS file audit — all 50+ files reviewed, 13 orphaned deleted
- [x] Update all docs with cleanup results

### Nice to Have
- [x] PURPCLAW dashboard: metrics_aggregator.js has SSE heartbeat on 7890
- [x] Command Center v2: Connect to real data
