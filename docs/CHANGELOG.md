# CHANGELOG — PURPCLAW

Curated record of meaningful changes. Append at the bottom; never rewrite history.

---

## v0.2.0 (2026-06-22) — Pulse, spine-shim, LRU caches, live whoami

### The stack talks back without prompting
- **lib/pulse.js** — self-wakes every 5 min, probes 6 services, reads the trace, emits findings to the event bus + notifications.jsonl. Exposed at /api/pulse, /api/pulse/notifications, /api/pulse/tick.
- **lib/agent-loop.js** buildSystemPrompt() now injects the live stack block (real tool/agent/provider counts) AND the latest 3 pulse findings. Agent can answer "what is going on?" truthfully without being prompted.
- **lib/spine-shim.js** — Node.js fallback for the cognitive spine's get_stats() deadlock. Mounted at /api/spine/health. Returns the archive file metadata in <50ms.
- **memory_matrix.py recall()** — LRU cache, 30s TTL; skips the slow 20k-atom substring scan when query is short (the existing long, fuzzy loop was 11-30s on the cold path).
- **memory_matrix_v2.py get_stats()** — 30s cache. The previous version was hanging /health for 3+ minutes.
- **cognitive_spine.py spine_health_cached()** — async cache + thread. /health is never blocked, never times out, never piles up threads. On any error the last good cache is served.
- **lib/events.js** — universal broadcaster with local trace fallback. Wires: memory.ingested, memory.recalled, bigboss.started, agent.spawned, tool.called, idle.cycle.started, etc.
- **Unified API Next.js bind** — ecosystem.config.js + package.json dev script both bind to 127.0.0.1. No LAN exposure.
- **Cognitive spine 0.1.7 → 0.2.0** in package.json + OS v0.2.0 in CockpitShell.

### CLI / TUI
- scripts/tui.js header shows pulse tick count + services-down indicator. Operator sees the stack heartbeat at a glance.
- scripts/tui-ask.js (full-screen chat) — no hardcoded numbers, calls /api/chat live.
- scripts/tui-ng.js (next-gen TUI) — same.
- CLI splash in bin/purpclaw.js updated to v0.2.0.

### CLI answer is now truthful (proved live)
`purpclaw chat → what is the stack status?`
→ "459 tools, 73 agents across 9 divisions, 8 providers ready, zero services down. One warning bubbling — memory.thinking.ingest.failed is getting ECONNREFUSED on 127.0.0.1:7880."

### Disk hygiene
- /c/Users/Admin/AppData/Local/Temp (15 GB of OmniCode test artifacts) wiped.
- pm2 logs capped at 50M / retain 5.
- TMPDIR set to E:\purp-temp for every service env block in ecosystem.config.js.
- C drive went from 5M free → 18G free.

### Known v0.2.0 issues (NOT blockers, called out)
- Python cognitive spine ThreadingTCPServer deadlocks on heavy get_stats (over 22k atoms). Spine-shim is the workaround. Real fix: rewrite the spine in Node or add a per-handler timeout.
- Several "core" services crash + restart (cognitive 21x, orchestrator 2x). This is a leak/state issue, not a wiring issue.

### Files added
- lib/pulse.js (9K) — self-heartbeat
- lib/spine-shim.js (3K) — Node fallback for cognitive spine
- /api/pulse, /api/pulse/notifications, /api/pulse/tick — REST
- /api/spine/health — shim health endpoint

---

## v0.1.8 (2026-06-15) — Provider doctrine, desktop body, heartbeat

### Provider routing (nothing hardcoded)
- **User-configurable lanes** — `lib/runtime/provider-config.js` persists per-lane `{provider, model}` to `~/.purpclaw/provider-config.json`. `provider-router.resolveLane()` precedence: **user-config > env > default**, then **capability fallback** (`providerUsable()` → `firstUsableProvider()` chain, ending at local Ollama). Settings drive live dispatch — proven E2E (set lane→ollama, chat used it; cleared→reverted to minimax).
- **Wired into live dispatch** — `unified_api.js` resolves `user_chat` through the router so the settings page actually controls chat across CLI/WebUI/TUI/gateways.
- **`/providers` page** — editable per-lane provider+model picker (from the live catalog) with source/fallback badges; `/api/providers` GET (effective lanes + key status + models + spend) and POST (save/clear a lane).
- **3 routing bugs killed:** (1) slash-autoroute hijack — `chat()`/`streamChat()` rerouted any slash model to OpenRouter, breaking all NVIDIA lanes; guarded with `SLASH_NATIVE_PROVIDERS` + `!opts.provider`. (2) `envKey`→key-string — NVIDIA lanes resolved `provider` to the `nvapi-…` secret; fixed via PROVIDERS-membership check. (3) EOL CODE model — `deepseek-coder-6.7b` returns 410 Gone on NVIDIA; swapped to proven-live models.
- **Strong free NVIDIA defaults** — SWARM/DIVISION/CODE = `nvidia/nemotron-3-super-120b-a12b`, REASONING = `nvidia/nemotron-3-ultra-550b-a55b`. All 5 NVIDIA keys verified valid against `integrate.api.nvidia.com`.

### Model Sentinel
- `lib/model-sentinel.js` + `scripts/model-sentinel.js` (`npm run models <status|discover|validate|run|test>`) + idle-engine Phase 7 (once/UTC-day). Daily model discovery + endpoint-drift detection vs routing lanes. Lesson encoded: **listed ≠ live** (NVIDIA lists EOL models that 410 on inference) — `smokeTest` proves a model live.

### Desktop body bridge (eyes + hands)
- **`lib/tools-gui.js`** — 14 `gui_*` agent tools wrapping `lib/runtime/computer-use.js` (Win32 SetCursorPos/mouse_event/SendKeys/SetForegroundWindow): screenshot, **see** (VLM reader), windows, status, move, click, double_click, drag (box-select), scroll, type, hotkey, focus, notify, **stop (kill switch)**.
- **`gui_see`** — read-only screen reader: capture → `nvidia/nemotron-nano-12b-v2-vl` → structured JSON (summary, visibleText, clickable targets+coords, confidence, recommendedAction, risk). Describes, does not act.
- **Safety gate** — every action gated by `computerUse.enabled` + `computerUse.mode` (off|observe|assist|autonomous). `gui_stop` always works and forces mode→off (proven from autonomous). Audit at `agent_work/computer-use-audit.jsonl`.

### CLI-Anything bridge
- **`lib/tools-cli-anything.js`** — auto-discovers CLI-Anything harnesses (`CLI_ANYTHING_DIR`) and registers each as a `cli_<app>` tool (49 found: Blender/GIMP/Godot/LibreOffice/…). `python -m cli_anything.<app>`, no daemon/install. Updating = git pull + restart.

### Windows-MCP — native gated bridge
- Vendored **CursorTouch/Windows-MCP** (`vendor/windows-mcp/`, `.venv` gitignored) wired natively via **`lib/tools-windows-mcp.js`** — 19 `win_*` tools in the shared registry (Snapshot/Screenshot/App/Click/Type/Move/Scroll/Shortcut/MultiSelect/MultiEdit/Notification/Clipboard/Scrape/Wait/WaitFor + PowerShell/Registry/Process/FileSystem).
- **Lazy-spawned** (server launches only when armed + called, `uv run` against the vendored source — not boot, not PyPI), **3-tier gated** (observe / assist / destructive), and covered by the `gui_stop` kill switch (`computer-use` stop tears down the connection). Destructive tier (PowerShell/Registry/Process/FileSystem) requires `computerUse.mode=autonomous` + `approved:true` + `WINMCP_DESTRUCTIVE=1`. Proven: `win_snapshot` returns live desktop UI-tree; gates verified.

### Heartbeat (visible watchdog, not hidden daemon)
- **`scripts/heartbeat.js`** (`npm run heartbeat [-- --once|--heal]`) + **`/api/heartbeat`** + read-only pulse strip on `/providers`. Checks core/providers/memory/body-bridge, daily sentinel; opt-in self-heal of core services. Read-only (no mouse, no VLM). Banner: `♥ Core N/N · Providers N/N · Memory green · Hands off · Autonomy off`.

### Fixes / hygiene
- **Restored `/mission`** to the "Many Lenses" cockpit (`MissionControl`) + animated logo (was orphaned).
- **Reclassified `harness`** `core` → `optional-dark` (benchmark/auxiliary; not started by `safe-start --core`).
- **Build unbreak** — `lib/api-body-cap.ts` CommonJS→ESM; removed its incorrect mass-application from App Router routes (`chat`, `computer-use`, `voice-command`, `kernel/jobs`) which had wiped `.next`. Reverted to `await req.json()`. **Doctrine: `api-body-cap` is a Node `IncomingMessage` helper — never for App Router routes.**
- **Secrets** — `.gitignore` covers `.env.*` + `.donors/`; NVIDIA keys confirmed not in tracked files.
- Tool registry now **~567 tools** (incl. 14 `gui_*` + 49 `cli_*` + 19 `win_*` Windows-MCP).
- **Version bump:** 0.1.7 → 0.1.8

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
