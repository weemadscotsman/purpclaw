# CHANGELOG — PURPCLAW

Curated record of meaningful changes. Append at the bottom; never rewrite history.

---

## v0.3.0 (2026-06-29) - Organisation runtime, Council ecology, donor-to-evolve bridge

### New architecture
- Promoted PURPCLAW from agent-framework framing to a local-first AI organisation runtime.
- Added canonical docs for the current 0.3.0 shape: identity, governance, workflow, Studio, ecology, and evolution layers.
- Added full folder integration audit at `docs/audit/FOLDER_INTEGRATION_AUDIT_2026-06-29.md`.

### Identity and governance
- Soul Registry now contains 95 souls.
- Soul Interviews now contain 95 interview records.
- Council Mode supports dynamic attendance, domain chairs, votes, reputation, and bounded interrupts.
- Podcast Studio is treated as the Council/Studio substrate rather than a separate entertainment toy.

### Studio ecology
- Studio has 11 behavioural modes.
- Added or documented Timeline, Presence, Residue, meeting memory, private conversations, world state, and ambient life as institutional continuity layers.
- Recorded the repair direction: make Timeline the shared operational event spine.

### Evolution
- Confirmed AutoResearch already exists and routes through `lib/commands/autoresearch.js` to `E:/training/lib/autoresearch-orchestrator.js`.
- Wired Donor Archaeology into the existing Auto-Evolve mutator queue instead of building a second evolution engine.
- Added donor promotion gate: no candidate becomes integrated without behavioural law, destination, rejected mechanics, validation note, and Timeline event.
- Queued donor proposal `mut_mqzfx4n6_byc9q4` from `ambient_tension_from_environment`; it remains pending and was not auto-approved.

### Docs
- Rewrote `README.md`, `ARCHITECTURE.md`, `STATUS.md`, `QUICKSTART.md`, and `DOCS_INDEX.md` for 0.3.0.
- Marked stale/high-risk docs that still need reconciliation.

### Version
- 0.2.0 -> 0.3.0

---

## v0.2.0 (2026-06-23) — Auto provider routing, one-door provider gateway, stack hardening

### New abilities
- **Auto model routing** (`lib/model-router.js`, NEW). The stack reads the user's message, classifies the job, and routes it to the best **NVIDIA NIM** model lane — no manual model picking. Wired into both `/api/chat` paths in `unified_api.js` (SSE emits a `routed` event `{lane, model, reason}`; JSON path mirrors it). `runAgent` already accepts `{model, provider}`. Honors explicit `lane`/`model` in the request body; `autoRoute:false` disables.
- **Four NIM model lanes** (all on provider `nvidia`, IDs verified live vs NIM `/v1/models`; lane→agent matches the tower's `agent_routing_matrix.js` so chat and swarm never drift): `code` = `minimaxai/minimax-m3` (code/general, default → ROBOT) · `reason` = `deepseek-ai/deepseek-v4-pro` (planning/architecture → DRAGON) · `review` = `z-ai/glm-5.1` (analysis/review/QA → GHOST) · `longctx` = `moonshotai/kimi-k2.6` (research/long-context → DUCK). `lib/model-router.js` imports lane models from the matrix (single source of truth).
- **One-door provider gateway** — `POST :7780/api/llm/raw {provider, model, baseUrl, messages, maxTokens}` → `lib/llm-provider.chat()`. Single stateless multi-provider entry (no tools/memory — that stays on `/api/chat`→`runAgent`).
- **Buttery graceful fallback** (`lib/agent-router.js`, NEW — `runAgentRouted`). One shared wrapper does routing + an ordered NIM fallback chain: if a lane's primary model rate-limits/errors **before the first token streams**, it glides to the next NIM sibling instead of hard-failing (emits a `route` event with `fallback:true`). DeepSeek V4 Pro (429-prone on NIM free tier) chains → V4 Flash → Kimi → MiniMax. Web SSE, web JSON, and CLI `ask` all route through this one helper (TUI pending). Lane fallback chains live in `lib/model-router.js`.

### Unification (one engine, many faces)
- **Bridge** (`app/api/bridge/route.ts`) now routes through `/api/llm/raw` instead of its own provider/key logic. This also **fixed a real bug**: the `nextjs` process carries no LLM keys, so the bridge's cloud providers were silently failing — the `api` process has them.
- **companion-chorus** (`companion-chorus/src/minimax.js`) folded onto `lib/llm-provider` (was a standalone MiniMax client). Removed a **hardcoded API key** from source (⚠ still in git history — rotate it).

### Pipeline spine (call → stop → log → health)
- **`lib/pipeline-registry.js`** (NEW) — the unified pipeline spine, so kernel jobs / orchestrator workflows / harness missions stop being separate soup and share ONE contract. The doctrine's One Rule made real: no pipeline without a call/stop/log/output/proof path. API: `GET /api/pipeline/jobs`, `GET /api/pipeline/health`, `POST /api/pipeline/start`, `POST /api/pipeline/stop`.
  - **Spine schema** per run: job_id, pipeline_name, project, lane, trigger, status, current_step, started/ended, inputs, outputs, tools_used, files_touched, proof, rollback, risk, operator_approval, heartbeat.
  - **Stop controls** (the part most stacks skip): `requestStop(id, pause|cancel|kill|quarantine|rollback)` + runner-side `shouldStop()`.
  - **Health scanner** (`/api/pipeline/health`) classifies every job green/amber/red/purple and flags failure modes: **leak / seek / hide / die / loop / fake-green / black-hole**. Validated: clean run → green, complete-without-proof → red [fake-green, black-hole], stale heartbeat → die.
  - `finish()` auto-writes a proof-ledger row, so the evidence trail is automatic.

### Black-box recorder (proof ledger)
- **`lib/proof-ledger.js`** (NEW) — evidence-grade append-only ledger. Where `trace-store.js` logs *what happened*, this logs the *proof*: every meaningful action records `{agent, tool, project, taskId, risk, claim, evidence[], filesTouched[], verification{ran,result,detail}, rollback, model, provider, tokensEstimate, status}`. Controlled vocabularies (risk/status/verification), durable rotation to `.bak` (never truncates history), zero heavy deps. `stats()` computes a **fake-green count** (rows claiming verified/applied whose `verification.result !== pass`) — the no-fake-green doctrine made physical. Wired at `GET/POST :7780/api/proof` (filters: project/taskId/agent/status/risk). Feeds the planned Truth/Patches/Bench cockpit tabs.

### Robustness — no leaky drawers
- **`mem_guard.py`** (NEW, dependency-free) — self memory watchdog every python service installs (cognitive, voice-stt, yolo, avatar, music). A daemon thread checks the process's own RSS and cleanly exits (2 consecutive breaches) if it exceeds a per-service cap, so even an **orphan** that escaped PM2's `max_memory_restart` (e.g. after a daemon death) dies instead of growing to 7GB. Measures RSS via psutil if present, else Windows ctypes / Linux `/proc` / POSIX `resource` — zero install assumptions (works on potato PCs, USB, mobile hosts). Caps env-overridable (`COGNITIVE_MEM_LIMIT_MB`=1500, `STT_MEM_LIMIT_MB`=1300, `YOLO_MEM_LIMIT_MB`=2500, `AVATAR_MEM_LIMIT_MB`=400, `MUSIC_MEM_LIMIT_MB`=1500; `PURPCLAW_MEM_GUARD=0` disables). Root cause of the 7GB incident: an orphaned cognitive_spine (pre-`allow_reuse_address` fix) ran ~16h unsupervised holding the growing 23k-atom archive.

### Fixes
- **NIM key pool parity** — `chat()` (and thus the gateway + bridge) only ever used the single `NVIDIA_API_KEY`; only `streamChat()` pooled. Added the rotating 5+5 pool draw to `chat()` so chat/gateway/bridge share resilient key handling.
- **Cognitive spine un-hung** — root cause was multiple processes co-binding port 7880 (`allow_reuse_address` on Windows). Set `allow_reuse_address=False` + `daemon_threads=True`; folded the neuro bridge to single-writer mode (was double-loading the 23k-atom archive); fixed a dead-code stats cache.
- **Agent dispatch** no longer routes to a phantom `unknown` agent (`lib/harness/engine.js`) — failed-workflow score records were teaching the router a fake agent.
- **cmd-window cascade** — added `windowsHide` to every live `spawn`/`exec` that flashed a console window (orchestrator `pm2 jlist` on every health poll, clipboard tools, vision python, agent-session git, mallory, generic exec).
- **orchestrator** `/api/system/health` `ReferenceError: pm2 is not defined` fixed.
- **GOOP** broker wired into PM2 (`purpclaw-goop`, port 7895) behind the `/bridge` surface.
- **Build + typecheck clean** — fixed illegal non-handler exports in `app/api/bridge/route.ts` (build crash); narrowed `tsconfig.json` scope (excludes archive/vendor/donor/side-app); fixed `SwarmPanel`/`GatekeeperPanel` types; removed dead `SettingsSpine.tsx`.
- **UI** — `/mission` single sidebar (CockpitShell `hideRail`), shell locked to `100vh` so the chat scrolls inside its own pane instead of moving the page.

### Removed
- Dead orphan sub-apps: `puzzle-stream/`, `no-spaghett/`, `agent_work/bee/`, `build/bee-app/`.

### Version
- **0.1.7 → 0.2.0**

## 2026-06-21 — UI Consolidation Freeze declared

### Big moves
- **UI consolidation freeze is binding.** No new Mission UI pages, panels, drawers, nav stacks, or duplicate surfaces. Mission UI was freezing into spaghetti (drawer + sections + sessions + stack pages + Mochi outputs + chat + composer + trace terminal all competing in the same viewport). This freeze stops it.
- **Canonical shell locked** — exactly one of each: `MissionShell`, `TopStatusBar`, `MissionIconRail`, `MissionDrawer` (closed by default), `MainWorkArea`, `TraceTerminalDock`. One shared theme provider. One route registry. One navigation source of truth. One log stream source. No alternate UI shells.
- **Canonical route list (18, the only allowed top-level destinations):** Mission Spine · Control Room · Asher · Execution Harness · Agent Workforce · Tower State · Delegation Graph · Workflow Flow · Event Lens · Live Metrics · Raw Signals · Dream Swarm · Risk Gate · Abliterator · Cognitive Mesh · Self-Evolution · System Map · Settings
- **Trace Terminal fix** — dock instead of floating, dedupe repeated identical events within a short window (collapse `fetch failed x8` instead of rendering 8 lines), cap visible logs, virtualize, pause really pauses, clear only clears UI buffer unless backend clear is explicit.
- **Theme consolidation** — one PURPCLAW theme provider. All Mission UI surfaces must use shared tokens (`background`, `panel`, `border`, `accent`, `warning`, `danger`, `success`, `muted`, `active-chip`, `terminal`). Local hardcoded theme islands get deleted or migrated. CRT/glitch identity stays, layout must be readable.

### Files
- `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/FREEZE.md` (NEW) — binding spec, route list, component list, acceptance criteria, validation commands
- `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/CANONICAL_LAYOUT.md` (NEW) — visual zones, one-screen rule, visual priority, kill switch
- `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/DUPLICATE_PURGE_MAP.md` (NEW) — KEEP / MERGE / DELETE / ARCHIVE classification table
- `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/TRACE_TERMINAL_CONSOLIDATION.md` (NEW) — event shape, dedupe rule, display rule, dock behaviour
- `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/AGENT_RULES.md` (NEW) — hard rules + before/during/after workflow for any agent touching UI
- `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/manifest.json` (NEW) — freeze pack metadata
- `CLAUDE.md` — added "UI Consolidation Freeze" section near top, points to freeze doc, lists canonical routes
- `AGENTS.md` — added freeze as Root Law #6, freeze doc in the Map

### Next move (Codex execution, not yet started)
Codex to read `FREEZE.md`, scan all UI files, classify every page/component as KEEP/MERGE/DELETE/ARCHIVE per `DUPLICATE_PURGE_MAP.md`, and emit `docs/generated/purpclaw-ui-consolidation-report.md` with files touched, duplicates found, components deleted/merged, final route list, final shared component list, build/test result, and Playwright screenshots at 1536×710 and 1920×1080.

### Acceptance criteria
Drawer closed by default · only slim icon rail visible on left · main chat/work area dominant · Trace Terminal docked not floating · no duplicate sessions panel outside drawer · no duplicate stack page list outside drawer · no duplicate terminal log rendering · no overlapping panels at 1536×710 · no horizontal page overflow · composer always visible · theme consistent across all Mission pages · all pages route through canonical shell · no new disconnected UI pages · build passes · Playwright proof at both viewports.

---

## v0.1.7 (2026-06-08)

- **Portable Identity**: export/import/diff identity.json (profile, style, memory, providers, budget, agents, skills, routing, preferences)
- **`purpclaw health`**: compact scorecard across 9 subsystems (tools, services, vault, spend, memory, providers, deps, skills, updates)
- **Skill missing-dep detection**: `requires: [package]` in SKILL.md → degraded tools return install guidance instead of crashing
- **Audio guide checksum sidecar**: WAV-generated-at SHA-256 tracked alongside clip; tamper detection on play
- **README rewrite**: positioning, comparison table, architecture, truth-telling
- **Version bump**: 0.1.6 → 0.1.7

---

## 2026-06-05 — Composer V1 Ship + Streaming + LoRA Pipeline

### Big moves
- **Composer V1 realized** — full 10-element spec shipped: attachment launcher, mode toggle (Chat/Plan/Execute/Swarm), model control (Speed/Intelligence/Provider), access control (Read Only/Review/Agent/Full System), agent bar, workspace bar, memory bar, quick chips, send area, **Active Context Panel**. All visible. All real. `app/components/composer/ComposerInput.tsx` (509 lines) + `types.ts` + `utils.ts` + `index.ts`.
- **Real-time token streaming** — `streamChat()` async iterator in `lib/llm-provider.js`, `handleChatStream` and `handlePlanStream` SSE handlers in `unified_api.js`, `streamChatSend` / `streamPlanSend` / `streamReadSSE` consumers in `CommandPanel.tsx`. Every chat message + every plan step streams token-by-token like Claude Code.
- **Plan-then-act with multi-model fanout** — `mode: single|fanout`. 3 models propose in parallel, judge model merges into best plan. Real codebase context (sem search top-5 files) injected into prompt.
- **Active Context Panel backend** — `/api/composer/context`. Reads real files, computes real token count (`chars/4`), detects secrets (`sk-...`, `api_key=...`), warns on size, builds the actual prompt that will be sent.
- **Real swarm mode** — `/api/chat/swarm`. Fans out to Planner, Researcher, Builder in parallel with distinct system prompts. Each agent streams its own tokens via SSE. Final synthesis merges all outputs.
- **Live cognitive event feed foundation** — waveform already real (5-min event histogram). Token counter live in `useMemo` of CommandPanel.
- **LoRA fine-tuning pipeline** — `scripts/lora-train.py` (420 lines). peft+trl+bitsandbytes, 4-bit QLoRA on RTX 2060/GTX 1660 (12GB total VRAM), 15-example smoke test loads, training kicked off in background.
- **Semantic + symbol code search** — `lib/commands/code.js` (750 lines, 31KB). Binary Float32Array index (`vectors.bin` 90MB) + meta JSON. Sub-1s search across 3961 files / 30975 chunks / 12715 symbols. Inlined dot product, in-memory cache, pre-normalized vectors.
- **Code search CLI** — `purpclaw code search|symbol|stats|reindex`. `scripts/build-binary-index.js` to rebuild the binary cache.
- **LoRA CLI** — `purpclaw lora status|help|train`. Spawns Python, captures output, exits with code 0/1.

### Fakery killed
- Removed fake `pulse 1.6s ease-in-out infinite` animation on cognitive panel center orb (was faking life).
- Replaced fake sine-wave `Math.sin((i + seed) * 0.72)` waveform with real 5-minute event histogram (32 buckets, counts of events per 9s window).
- Replaced hardcoded numbers in cognitive panel with real probes: `47% signal` is now `Math.min(1, (active + workflows + recentLogs.length/8 + serviceCounts.online/2) / 18)`.
- Killed chat endpoint fakery — was returning `provider: 'local-controller'` / `providerStatus: 'not-configured'` with "Received by Purpclaw command bus" stub. Now uses real `lib/llm-provider.js`.

### Bug fixes
- 5 Python services were marked `disabled: true` in `ecosystem.config.js` (modal, diagnostics, rules, bridge-ns). Brought them back up. safe-start now keeps them running.
- TRL 0.18+ API rename: `SFTConfig` no longer accepts `max_seq_length` — use `max_length`. Fixed in `lora-train.py`.
- `llm-provider` auto-route: when the model has `/` in it (OpenRouter ID) and the active provider isn't OpenRouter, switch automatically.
- Defensive JSON parsing in CommandPanel `send()`: when upstream returns HTML (404 page) instead of JSON, show `"<route> returned non-JSON (HTTP 404): <pre>missing..."` instead of crashing with `Unexpected token '<'`.

### Documentation
- `SKILL.md: sse-streaming-pattern` — covers SSE helpers, async iterator, event vocabulary, frontend consumer, pitfalls.
- `workspace/IDENTITY.md` — keep current with new stack state.
- `workspace/SKILL_SUMMARY.md` — refresh with new commands.
- `memory` — 11 entries covering crons, C drive, OmniCode, TTS, workspace, rate limiter, chat endpoint, stack state, training buffer, Eddie, Ted=Eddie, Quill, **PURPCLAW COMPOSER V1 spec**.

### Known issues
- LoRA training is killed by something on the box (env issue, not code). Each attempt gets SIGTERM at 0/2 iters. Pipeline is built, just needs to run uninterrupted.
- OpenRouter free models rate-limit (429) frequently. Plan endpoint falls back to first successful proposal.
- Some subagent edits to `unified_api.js` need re-verification after each restart (use a fresh build before declaring the system "shipped").

### Files changed/created tonight
- `lib/commands/code.js` — semantic + symbol search, binary cache, inlined dot product
- `lib/llm-provider.js` — `streamChat()` async iterator, auto-route OpenRouter models
- `unified_api.js:413-560` — `handleChatStream`, `handleChatPlanStream`, `handleChatSwarm`
- `unified_api.js:232-359` — `composerContextHandler` for active context panel
- `unified_api.js:3056-3100` — `/api/chat/swarm` JSON endpoint
- `unified_api.js:187-220` — `parsePlanJson` helper
- `unified_api.js:1085-1115` — moved to top-level (was inside template string)
- `app/components/CommandPanel.tsx:1360-1430` — `streamReadSSE`, `streamChatSend`, chat route now uses SSE
- `app/components/CommandPanel.tsx:1285-1360` — `streamPlanSend` (already done)
- `app/components/composer/ComposerInput.tsx` (NEW, 509 lines) — full composer spec
- `app/components/composer/types.ts` (NEW) — all 9 type enums
- `app/components/composer/utils.ts` (NEW)
- `app/components/composer/index.ts` (NEW)
- `bin/purpclaw.js` — `cmdLora()` (status/help/train)
- `scripts/lora-train.py` (NEW, 420 lines) — full QLoRA pipeline
- `scripts/build-binary-index.js` (NEW) — vectors.bin builder
- `scripts/code-index-fast.js` (NEW) — keyword index in <2s
- `E:/code-index/vectors.{bin,meta.json}` (NEW) — 90MB binary + 15KB meta
- `E:/code-index/symbols.json` (NEW) — 480KB symbol lookup
- `E:/training/adapters/Qwen_Qwen2.5-1.5B-Instruct/` (training output)
- `E:/training/lora-final.log` — most recent training log

---

## 2026-06-06 — v0.1.0 Ship: npm Publish, Chaos Campaign, Spawn Cascade Fixed, Cognitive Spine Live

### Big moves
- **npm publish** — `purpclaw` v0.1.0 published to npm. `npm install -g purpclaw`. 338 files, 3.4MB package. npm username: rojoedjhdopdrhjzdhfojzdopthj. GitHub: weemadscotsman/purpclaw.
- **Spawn cascade SLAUGHTERED** — 11 files fixed. All spawns now go through `lib/child-registry.js`. Zero `detached: true`. Zero `shell: true`. Zero `cmd /c start`. Zero `cmd /k`. The infinite cmd-window cascade that killed Eddie's PC is dead.
  - `bin/purpclaw.js`: `exec(&amp;)` background dispatch → `trackedSpawn`. `detached:true` boot → `trackedSpawn`. All 7 spawn points replaced.
  - `voice_bridge_7792.js`: 2x `cmd.exe /c start /min` → `rundll32 url.dll,FileProtocolHandler`
  - `screen-manager.js`: `cmd /k` + `detached:true` → `trackedSpawn`
  - `spinUpAgent.js`, `tmux-worktree-orchestrator.js`: `detached:true` + `unref()` → `trackedSpawn`
  - `voice_coordinator.js`: `exec(cmd)` → `trackedSpawn`
  - `boot.js`, `agent_tower.js`, `start_purpclaw.js`: `shell:true` + raw spawns → `trackedSpawn` + `installCleanup()`
  - `launch_detached.js`: 3x `detached:true` → `trackedSpawn`
  - `purpclaw.js` (root): `shell:true` exec → `trackedSpawn`
- **Cognitive Spine booted live** — `cognitive_spine.py --port 7880` runs as one process importing all 6 cognitive modules directly. Health endpoint confirms: memory (temporal + counterfactual), rules (Datalog, 3 axioms), modal (Kripke, 4 logics, 1 agent), diagnostics (5 diagnostic agents), neuro-symbolic (memory bridge connected), autodream (7 cycles run). One port. No port soup.
- **Smith + Neo adversarial pair shipped** — 8 attack classes detected. Reliability ledger tracks every attack + whether Neo caught it. Memory consistency checker validates against adversarial corruption.
- **110 tools confirmed** — 8 built-in + 42 OmniCode MCP + 4 G0DM0D3 + 5 SmithNeo + 49 PC control + 2 MCP servers.
- **17 providers** — Added DeepSeek v4 Pro as primary, GitHub Models, Codex OAuth, Atomic Chat, Qwen.
- **README rewritten** — 482 lines covering every surface. Honest numbers: what's running vs. what's built vs. what's integrated.

### Documentation cleanup
- **34 stale docs archived** → `docs/legacy/`. All pre-June 2026 docs moved.
- `QUICKSTART.md` rewritten — 25-service architecture, current ports, one-line install.
- `ARCHITECTURE.md` created — full service topology diagram, 7-layer memory, agent divisions, tool taxonomy, provider system, ratchet, Smith+Neo.
- `CLAUDE.md` updated — spawn safety section, cognitive spine, current architecture.
- `docs/INDEX.md` created — navigation map for all documentation.
- `PURPCLAW_Runbook.md` deleted — replaced by `docs/RECOVERY.md`.

### Bug fixes
- Stale slash_worker session (20260606_085842) killed — was eating 2 Python processes since morning.
- PM2 confirmed empty — 0 apps running. Cognitive cluster had never been booted (all 6 ports DOWN).

### Architecture decisions
- **Cognitive consolidation**: memory + rules + modal + diagnostics + neuro-symbolic + autodream → one `cognitive_spine.py` process. Modular code, not modular processes. If it's reasoning state, put it in one brain. If it's heavy hardware/model work, keep it separate.
- **Documentation truth standard**: every doc now distinguishes Built (code exists) vs. Running (process alive) vs. Integrated (participating in agent decisions).

---

## Earlier history

- `AGENT_DIRECTORY.md` was archived — agent count wrong (26 → 152 actual).
- `PURPCLAW_COMPLETE_ARCHITECTURE.md` was archived — 18-service/30-agent → 25-service/152-agent reality.
- `TEAM_HANDOVER.md` was archived — all tasks now DONE (except CozoDB).
- `CAPTAINS_LOG.md` was archived — last entry May 24, missed the entire ship.

## Earlier history
(pre-2026-06-05 changes are in git log / session_search; not curated here yet)
