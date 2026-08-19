# CHANGELOG — PURPCLAW

Curated record of meaningful changes. Append at the bottom; never rewrite history.

---

## 2026-08-18 — Phase 1: Stabilize (Finish-Line Sweep)

### Boot repaired — 5 dead PM2 paths + 3 missing entries
- `ecosystem.config.js`: chorus bridge → `apps/companion-chorus/bridge.js`; avatar → `services/gateway/simple_bridge.py`; stt → `services/voice/stt.py`; cognitive → `services/cognitive/spine.py` (module form, see below); yolo → `services/vision/yolo.py`. All 26 defined apps now resolve to real files (validated by script).
- New PM2 entries: `purpclaw-coordinator` (:7898), `purpclaw-cowork-overlay` (:7791), `purpclaw-tts-gateway` (:7799) per `.purpclaw/COWORK_TODO.md` TODO-1.
- **cognitive spine module form**: `services/cognitive/spine.py` uses package-relative imports (`from .memory_matrix import ...`), so it must run as `python -m services.cognitive.spine` from the repo root. PM2 entry + `services/cognitive/gateway.js` spawn both converted. Running it as a bare script crash-loops with `ImportError: attempted relative import with no known parent package`.
- `lib/commands/safe-start.js`: coordinator added to CORE_SERVICES (proven live-stable by coordinator_live_boot cert); cowork-overlay + tts-gateway added to DARK_SERVICES (opt-in ambient layer).
- Live boot verified: `safe-start --core` → 13/13 online, zero dead-path errors.

### CLI correctness (narrow fixes, no refactor yet)
- 7 duplicate case labels removed from `bin/purpclaw.js` (`status`, `doctor`, `parity`, `release`, `roster`, `search`, `onboard`) — JS kept the first of each pair; the seconds were unreachable dead code.
- Shadowed `cmdStatus` (chaos-campaign view, hardcoded port list + marketing numbers) deleted; the registry-driven dashboard is now the single authority.
- Hardcoded "v0.1.1" in the first-run banner now reads `package.json`.
- `"undefined": "^0.1.0"` dependency removed from `package.json`, lockfile, and `node_modules` (nothing required it).

### Coordinator lane closed end-to-end (T08 root causes)
Three real defects were found behind the "output-too-short" validation failure; none was fixed by lowering thresholds:
1. **`agent_tower.js` listened for a `tool-exec` event the agent-loop never emits** (it yields `tool-call`/`tool-result`), so recorded tool calls were always empty and the agent's final text was discarded — output collapsed to the literal `'Task completed.'` (17 chars). Fixed event handling; final answer is now the post-`<think>`-stripped last turn, with the tool digest as fallback.
2. **`spawnAgent` returned `{ success, agent }` but the coordinator validated `result.output`** — the field never existed at the top level, so every mission's output arrived as `undefined` → guaranteed `output-too-short`. Return contract now carries `output`, `toolCalls`, `provider`, `model`.
3. **Mission sandbox committed line-ending churn as "changes"** (worktree checkout rewrites CRLF↔LF; 3,828 ins/3,848 del across 9 untouched files) and a cherry-pick conflict failed the whole mission. Sandbox now stages with `--ignore-cr-at-eol` detection (EOL-only churn → no commit, no merge) and a merge conflict no longer fails a validated mission — the commit hash is preserved and reported via `mission.sandboxResult`.

**Result**: `tests/coordinator_live_boot` 8/8 PASS with T08 a genuine full round-trip (request → decomposition → execution → validated output → response; mission `decompose-1787054446740` completed, sandbox clean).

### Retirement record
- None. All previously-dead services were recovered via their relocated `services/` homes; nothing was removed.


## 2026-08-17 — Parity Gap Fill + Legacy Reintegration + Live Coordinator Revival

### Big moves
- **packages/swarm/ shipped** — sub-agent dispatch + parallel coordination. Closes Kimi 300 / Antigravity 5 / Claude Task parity. Real registry, real agent-runtime, no mocks. 8/8 tests PASS at `tests/swarm/dispatcher.test.js`. Cert at `agent_work/cert_gates/swarm/`. Honest scope: 2-3 sub-agents in cert; Kimi 300 ceiling and Antigravity Manager View UI not yet tested.
- **services/console/ shipped** — parity dashboard (rewritten from `legacy/reintegrate-2026-08-17/purpconsole/`). Textual TUI or text fallback. CLI surface: `purpclaw parity [--json] [--by-id NN]`. 10/10 tests PASS. Cert at `agent_work/cert_gates/console/`. Honest label: plain-text fallback certified; Textual TUI visual cert deferred until `textual` is installed.
- **apps/extensions/menu-mochi/ shipped** — Chrome extension v1.2 (real working Tamagotchi-style browser pet, manifest v3, MV3 service worker, content script, popup UI, 4 icon sizes). 12 source files + co-located marketing toolkit (8 files). 18 passes / 0 fails structure cert. Cert at `agent_work/cert_gates/menu_mochi/`. Honest label: structure cert only; runtime cert requires loading the unpacked extension in Chrome/Edge.
- **Slash commands shipped** — `bin/purpclaw.js` now transparently accepts `/`-prefix on all 148 existing case statements. Three new commands: `/plan <goal>`, `/clear`, `/compact [--days=N]`. 8/8 tests PASS at `tests/slash_commands/test_slash_commands.js` (real subprocess spawning, no mocks). Cert at `agent_work/cert_gates/slash_commands/`. Honest label: `/plan` body is a deterministic scaffold, not yet LLM-generated.
- **The missing-organ bug FIXED** — `services/swarm/coordinator.js:161` was doing `require('./task_decomposer.js')` (relative to its own location at `services/swarm/`). The file existed at the project root, not at `services/swarm/`. The file itself opens with "PURPCLAW TASK DECOMPOSER — The missing organ." Fix: copied `task_decomposer.js` (21KB) + `agent_routing_matrix.js` (15KB) from root to `services/swarm/`. 8/8 tests PASS. Cert at `agent_work/cert_gates/coordinator_decomposer/`.
- **T06 done — all 5 lib/ modules + 2 swarm helpers wired to coordinator** — patched require paths (no copying): `require('./lib/X.js')` → `require('../../lib/X.js')`. All 7 dependencies now load: Task decomposer, Agent score, Context packet, LLM provider, Self-context, Memory client, Cognitive client. 10/10 tests PASS. Cert at `agent_work/cert_gates/coordinator_lib_wire/`. **3 remaining to Tesco-testable**: EventBus on 7782 must be running, LLM provider needs API keys for chat (loads offline), Tower on 7790 must be up.

### Legacy reintegration (rewrite, not archive)
- 6 directories restored from `archive/2026-08-17-cleanup/` to `legacy/reintegrate-2026-08-17/` with rewrite checklist README
- 2 DONE: `purpconsole/` → `services/console/`, `menu_mochi_extension/` → `apps/extensions/menu-mochi/`
- 1 TODO: `DreamTask.ts` (real UI surfacing layer for auto-dream agent, needs real task registry)
- 3 KEPT as reference: `Samantha's Daily Log/`, `PURPCLAW_OLD/`, `lib-lib-abandoned-installer-20260617/`
- Memory rule added: **NO DEAD CODE / NO ABANDONED** (Eddie correction 2026-08-17 12:30) — this build was never finished; everything is being fixed, reorganized, and integrated. The right question is never "is this dead?" — it is "where does this belong, and what real wiring does it need?"

### Memory rule added
- **REWRITE-NOT-ARCHIVE RULE** — Don't archive good code to make the tree tidy. **REWRITE it to fit the current stack** (`packages/*`, `services/*`, `lib/control/drivers/*`, `bin/purpclaw.js`). Archive ONLY for: leaked package caches (lib/site-packages), build artifacts (.next.old/N), and EMPTY directories. Everything else goes to `legacy/reintegrate-<date>/` with a README so the next session can rewrite it visibly.

### Parity gaps closed (partial or full)
| Tool / Feature | Parity target | Status |
|---|---|---|
| Kimi Agent Swarm (300 sub-agents) | parallel sub-agent dispatch | partial (2-3 in cert, ceiling untested) |
| Antigravity 2.0 Manager View (5 parallel) | parallel agent panel | partial (terminal cert, UI in apps/desktop/src/manager/ TODO) |
| Claude Code Task tool | sub-agents inline | full (persona-resolved dispatch, registry-driven) |
| Claude Code /plan, /compact, /clear | slash ergonomics | full |
| Antigravity CLI slash surface | transparent alias | full |
| Kimi CLI slash commands | same surface | full |
| Hermes Harness function calling | JSON-output SwarmReport | full |
| ChatGPT app custom GPTs | user-creatable agents | deferred |
| DeepSeek Harness Cordis | plugin kernel | deferred |
| DeepSeek resume/fork/search | event stream replay | deferred |
| MCP client (Kimi/Claude/Antigravity) | protocol | TODO |
| Voice mode loop (ChatGPT app) | STT + TTS + WebRTC | TODO |
| Manager View UI (Antigravity) | visual panel | TODO |

### Items still on the cleanup roadmap
- 154 root .js files — many duplicates or misplaced; triage pending
- 3 6/10/2026 legacy dump dirs (`.omnicode`, `components`, `config`) — inspection pending
- `find_pulse.py` at root (stale, manual delete) + `lib/util/mem_guard.py` (stale duplicate)
- DreamTask.ts integration (real UI surfacing layer for auto-dream, needs real task registry)
- Live coordinator lane Tesco-testable (start EventBus on 7782 + Tower on 7790)
- Build packages/mcp-client/ for cross-tool integration
- Build voice mode loop (STT + TTS + WebRTC bidirectional)
- Build Manager View UI (Antigravity 5-parallel panel in apps/desktop/)

### New files / certs
- `packages/swarm/{package.json, index.js, dispatcher.js}` + `tests/swarm/dispatcher.test.js`
- `services/console/{app.py, features.py, text_report.py, __main__.py, ...}` + `tests/console/test_console.py`
- `apps/extensions/menu-mochi/{manifest.json, popup.html, popup.js, content.js, background.js, icons/, marketing/}`
- `tests/{slash_commands, menu_mochi, coordinator_decomposer, coordinator_lib_wire}/`
- `agent_work/cert_gates/{swarm, console, slash_commands, menu_mochi, coordinator_decomposer, coordinator_lib_wire}/` (6 new certs, all PASS)
- `legacy/reintegrate-2026-08-17/` with rewrite-checklist README

### Documentation
- `agent_work/architecture/` — 9 canonical arch docs (unchanged in this session, all referenced)
- `MEMORY.md` — 8 new entries covering all 2026-08-17 work
- `legacy/reintegrate-2026-08-17/README.md` — rewrite checklist
- `README.md` — new "What's New — 2026-08-17" section + slash command quick reference

### Honest scope for this session
- **6 cert gates PASS, 60/60 tests green total** (8+10+8+18+8+10)
- **The live coordinator lane is 1/3 away from Tesco-testable** — dependencies load, but EventBus on 7782 + Tower on 7790 must be running for actual /api/coordinate round-trip
- **No mocks in any test** — every cert is a real subprocess / real require resolution
- **Zero "module is missing" errors** after the T06 fix

---

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

---

## 2026-08-19 — Phase 2: CLI to Top Standard (Finish-Line Sweep)

### Canonical command registry + dual dispatch
- New `lib/cli/registry.js`: all 151 commands with aliases, module routing, categories, `--json` flags. One source of truth for dispatch, help, and completion. Generated from the extracted switch map (`artifacts/finish-sweep/switch-map.json`) plus curated metadata.
- `bin/purpclaw.js` dispatches registry-first; switch-handled commands fall through unchanged, so the CLI never broke mid-migration. A mechanical test compares switch case labels against the registry and fails on drift.
- Unknown commands now error to stderr with a Levenshtein did-you-mean (top 3) and exit 2. The old silent natural-language fallthrough (`purpclaw fix the auth bug` → `run`) is gone — natural language belongs to `purpclaw run` / `purpclaw ask`. The switch default is now a dispatch-drift guard.
- Git Bash MSYS path-munging guard: `/status` rewritten to `C:/Program Files/Git/status` is detected and restored.
- 16 orphan modules wired (council, autoresearch, mcp, remote, workflow, registry-audit, feature, hivemind, vault, secrets, provider, stats, telemetry, weather, completion); every remaining orphan classified in `artifacts/finish-sweep/orphan-classification.md`.

### Help + completion from the registry
- `purpclaw help <command>` prints registry detail (aliases, category, module, --json).
- Full command index generated by category after the curated sections — no command can go undocumented.
- New `purpclaw completion bash|zsh|powershell` — all derive from the registry.

### npm packaging hygiene
- `files` array tightened with negation globs: tarball went 17.7 MB / 1889 files → 2.0 MB / 773 files. Removed: nested `node_modules` (1,049 files incl. 11.7 MB `esbuild.exe`), 28 Python launcher `.exe`, `__pycache__`, `.bak`, and two mid-name `.debug` copies.

### Tests
- New `tests/cli/test_cli.js`: 10/10 green — dispatch parity, registry completeness, unknown-command exit 2, help detail + index, completion derivation, orphan response, version contract.
