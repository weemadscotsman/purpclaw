# PURPCLAW — Project Context for AI Agents

> Last updated: 2026-06-21 (UI consolidation freeze added).
> Canonical architecture: **[ARCHITECTURE.md](./ARCHITECTURE.md)**
> Recovery runbook: **[docs/RECOVERY.md](./docs/RECOVERY.md)**
> **UI consolidation freeze: [docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/FREEZE.md](./docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/FREEZE.md)** ← binding, do not bypass

---

## ❄️ UI Consolidation Freeze (2026-06-21)

**No new Mission UI pages, panels, drawers, nav stacks, or duplicate surfaces.** The Mission UI was freezing into spaghetti (drawer, sections, sessions, stack pages, Mochi outputs, chat, composer, trace terminal all competing in the same viewport). This freeze is binding.

Canonical shell (only one of each):
- `MissionShell` + `TopStatusBar` + `MissionIconRail` (56–72px) + `MissionDrawer` (closed by default) + `MainWorkArea` + `TraceTerminalDock` (right on desktop, bottom drawer on narrow)
- One shared theme provider. One route registry. One navigation source of truth. One log stream source. No alternate UI shells.

Canonical routes (18, the only allowed top-level destinations):
Mission Spine · Control Room · Asher · Execution Harness · Agent Workforce · Tower State · Delegation Graph · Workflow Flow · Event Lens · Live Metrics · Raw Signals · Dream Swarm · Risk Gate · Abliterator · Cognitive Mesh · Self-Evolution · System Map · Settings

Working rules live in [docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/](./docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/):
- `FREEZE.md` — binding spec, route list, component list, acceptance criteria
- `CANONICAL_LAYOUT.md` — visual zones & one-screen rule
- `DUPLICATE_PURGE_MAP.md` — merge/delete/archive classification
- `TRACE_TERMINAL_CONSOLIDATION.md` — terminal dedupe + dock behaviour
- `AGENT_RULES.md` — hard rules + before/during/after workflow for any agent touching UI

**Before adding or editing any UI file, read `AGENT_RULES.md`.** Codex execution plan is in `FREEZE.md`. Anything outside the canonical shell is KEEP / MERGE / DELETE / ARCHIVE — and that decision lives in `DUPLICATE_PURGE_MAP.md`.

---

## What Is This?

PURPCLAW is a persistent AI orchestration runtime — a 26-service distributed agent platform that runs locally under PM2 supervision, dispatches to 42 named agent personas, and presents itself through a CLI front door (`purpclaw`), a Next.js Mission Control UI, and a full-screen TUI cockpit (`purpclaw tui`). 17 LLM providers. 31 native tools (76 with OmniCode MCP). Self-improving via Karpathy ratchet.

It is **not** a chatbot. It is a governed operational kernel for software, automation, and cognition workflows.

## Stack Topology

### Service ports (25 total: 16 core + 9 dark)

**Core (always-on baseline):**

| Port | Service | PM2 Name |
|---|---|---|
| 3000 | Mission Control UI | purpclaw-nextjs (dev mode) |
| 7780 | Unified API | purpclaw-api |
| 7782 | EventBus | purpclaw-eventbus |
| 7783 | State Store | purpclaw-state |
| 7784 | Orchestrator | purpclaw-orchestrator |
| 7790 | Agent Tower | purpclaw-tower |
| 7791 | Gatekeeper | purpclaw-gatekeeper |
| 7881 | Context Bus | purpclaw-context |
| 7885 | Knowledge Pool | purpclaw-pool |
| 7890 | Metrics Aggregator | purpclaw-metrics |
| 7897 | Worker Pool (overflow lane) | purpclaw-workers |

**Cognitive Spine (single process on 7880 — boot with `python cognitive_spine.py`):**
Imports memory, rules, modal logic, diagnostics, neuro-symbolic bridge, and autodream directly. One port. No port soup.

**Defined-but-dark cluster (off by default — `purpclaw safe-start --dark` to wake):**
voice (7781), bridge (7792), chorus, vision (7889), reasoning (7892), stt (7896), yolo (7779), avatar (7777).

## ⚠️ CRITICAL — Spawn Safety (NO detached, NO shell:true, NO cmd /c start)

**On 2026-06-06 the spawn cascade was SLAUGHTERED.** All 11 files now use `lib/child-registry.js`. Every spawn is tracked, time-bounded, and auto-killed on SIGINT/SIGTERM.

**Must-use patterns:**

```javascript
const { trackedSpawn, execSafe, installCleanup } = require('./lib/child-registry');

// At process startup, ONCE:
installCleanup();

// For any spawn:
const child = trackedSpawn('node', ['script.js'], {
  tag: 'my-worker',          // debug label
  timeoutMs: 30_000,         // hard kill after 30s
});

// For shell commands:
const r = await execSafe('git', ['log', '--oneline'], { timeoutMs: 30_000 });
// → { ok, code, stdout, stderr }

// For opening URLs/files (NOT cmd /c start):
trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', url]);
```

**BANNED patterns (will be rejected in code review):**
- `spawn(cmd, args, { detached: true })` — process survives parent, never cleaned up
- `spawn(cmd, args, { shell: true })` — spawns cmd.exe wrapper on Windows
- `exec('cmd /c start ...')` — opens new console window, never tracked
- `spawn('cmd.exe', ['/k', ...])` — persistent cmd window
- `proc.unref()` without child-registry tracking

**`safe-start` still works** — it's now backed by `trackedSpawn`, so even if a service crash-loops, the registry cleans up.

## Key CLI Commands (the AI should know these by heart)

```bash
purpclaw                           # drop into chat REPL (stack-aware, session-persistent)
purpclaw help                      # full command cathedral
purpclaw architecture              # live runtime overview
purpclaw overview                  # canonical doc (docs/SYSTEM_OVERVIEW.md)
purpclaw doctor                    # health check with PM2 cross-reference
purpclaw smoke                     # 13-check end-to-end self-test (CI-ready)
purpclaw heal                      # diagnose stack state, print recovery plan
purpclaw heal --execute            # apply the plan via safe-start
purpclaw safe-start --core         # wake the 16-service baseline
purpclaw safe-stop --dark          # put the dark cluster back to sleep
purpclaw status                    # live dashboard
purpclaw run "<task>"              # dispatch to the swarm (streams progress live)
purpclaw roster                    # tower agents vs persona files
purpclaw gc                        # garbage-collect agent_work/
purpclaw workers status            # worker pool state
purpclaw workers secret            # generate fresh HMAC worker secret
purpclaw pool query "<text>"       # keyword-search the skill index
purpclaw memory [query]            # recall from memory matrix
purpclaw spaghetti audit           # code quality enforcement
purpclaw teleport create [name]    # bundle state for handoff
purpclaw tui                       # full-screen cockpit
purpclaw mochi                     # chat with the companion
purpclaw forge [name]              # gacha-style agent generation
```

## Auto Provider Routing (v0.2.0)

Every chat surface — web `/api/chat`, CLI `purpclaw ask`/REPL, and `purpclaw tui ask` — runs `lib/model-router.js` on each message: it classifies the job and routes to the best **NVIDIA NIM** lane (all on the rotating 5+5 key pool). No manual model picking.

| Lane | Model | Job | Agent |
|---|---|---|---|
| code | `minimaxai/minimax-m3` | code / general / quick (default) | ROBOT |
| reason | `deepseek-ai/deepseek-v4-pro` | planning / architecture / reasoning | DRAGON |
| review | `z-ai/glm-5.1` | analysis / review / QA / audit | GHOST |
| longctx | `moonshotai/kimi-k2.6` | research / long-context / whole-repo | DUCK |

- Lane models are imported from `agent_routing_matrix.js` (single source of truth) so chat routing matches the swarm's per-agent `modelForAgent()` bindings — no drift.
- Routing respects an explicit `model`/`lane` (CLI `--model`, request body `lane`/`model`); pass `autoRoute:false` to use the global default.
- Stateless raw multi-provider calls (the Bridge comparison lab) use the one-door gateway `POST :7780/api/llm/raw` → `lib/llm-provider.chat()`. Tools/memory stay on `/api/chat`→`runAgent`.
- `chat()` and `streamChat()` both draw from the NIM key pool now (was streamChat-only).

## Critical Patterns

### PM2 invocation from CLI

The `pm2()` wrapper in `bin/purpclaw.js` now uses `trackedSpawn` with no shell on all platforms. `lib/commands/safe-start.js` and `safe-stop.js` do the same. **Never bypass these** — direct `npx pm2 start` calls don't get the same tracking and can still spawn visible windows.

### Secret redaction

`process.stdout` and `process.stderr` are wrapped at CLI startup by `lib/secret-redactor.js`. Every print goes through pattern matchers that mask API keys, JWTs, hex blobs, bearer tokens, and URL-embedded tokens. Opt out with `PURPCLAW_NO_REDACT=1` for debugging.

### EventBus reconnection (prevent DOS)

Services connecting to EventBus (:7782) MUST use exponential backoff:

```javascript
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;
// delay = min(BASE * 2^attempts, MAX)
```

Fixed-delay reconnects in companion-chorus historically caused EventBus DOS — fixed by this pattern.

## Environment Variables

`.env` must exist at project root. Key vars:

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | minimax / anthropic / gemini / openai / kimi / groq / deepseek / openrouter / ollama / custom |
| `LLM_API_KEY` | Provider API key (auto-sanitised by wizard) |
| `LLM_MODEL` | e.g. `MiniMax-M2.7` |
| `XIAOZHI_MCP_URL` | Optional, for the AI ball |
| `WORKER_SECRET` | HMAC secret for worker pool auth |
| `PYTHON_BIN` | Python 3.11 path (auto-detected if unset) |

`purpclaw init --wizard` walks through setup with key sanitisation (catches doubled paste, asterisk bleed, etc.) — see `lib/secret-redactor.js`.

## Operational Rules (for the agent working in this repo)

- **You CAN kill processes** if you can verify they're not the agent's own process or PM2's daemon. Use `taskkill /F /PID <pid>` on Windows after confirming PID identity via `tasklist /FI "PID eq <pid>"`. Some processes may be elevation-protected — those need an admin terminal.
- **NEVER skip git hooks** (`--no-verify`, `--no-gpg-sign`) unless explicitly asked.
- **NEVER commit `.env` or `agent_work/`** — both are in `.gitignore`.
- **PREFER `purpclaw safe-start` over `pm2 start`** — always, no exceptions.
- **VERIFY with `purpclaw smoke`** after any service-state change.

## Recent Major Work (last session — 2026-06-06)

v0.1.0 shipped:
- npm publish (`purpclaw` v0.1.0, weemadscotsman/purpclaw)
- Spawn cascade fixed (11 files, zero detached/shell/cmd leaks)
- Cognitive Spine booted live (1 process, 6 modules, port 7880)
- Smith + Neo adversarial pair (8 attack classes, reliability ledger)
- 110 tools confirmed, 17 providers, 7 memory layers ⚠️ v0.1.0 — tools-pc.js was later deleted
- Documentation cleanup (34 docs archived, QUICKSTART/ARCHITECTURE created)

## Documentation Index

| File | Status | Purpose |
|---|---|---|
| `README.md` | ✅ CURRENT (2026-06-06) | Project overview + honest numbers |
| `ARCHITECTURE.md` | ⚠️ STALE (2026-06-06) | Claims 25 services, 152 agents, 110 tools — update needed |
| `QUICKSTART.md` | ✅ CURRENT (2026-06-06) | One-line install + core commands + service table |
| `CLAUDE.md` (this file) | ✅ CURRENT (2026-06-06) | What every AI session reads on entry |
| `CHANGELOG.md` | ✅ CURRENT (2026-06-06) | Curated change history through ship |
| `docs/RECOVERY.md` | ✅ CURRENT | Operator runbook for crash recovery |
| `docs/INDEX.md` | ✅ CURRENT (2026-06-06) | Documentation navigation map |
| `docs/legacy/` | 📦 ARCHIVED (2026-06-06) | 34 pre-June docs, see legacy/README.md |

## Known Gaps (as of 2026-06-06)

1. **Cognitive Spine is built but not integrated.** It boots and responds to HTTP, but agent decisions don't yet flow through Memory → Neuro-Symbolic → Rules → Modal → Action. The code exists. The integration doesn't.
2. **PM2 is empty.** 0 apps running. Services run via boot.js or manually. Full PM2 deployment needs `purpclaw safe-start --core`.
3. **LoRA training gets SIGTERM** at 0/2 iterations — environment issue, not code. Pipeline is built.
4. **7-layer world model exists in code** (1,133 lines across 6 modules) but only Layer 1 (episodic) is online. Layers 2-7 need integration audit.

## What NOT To Do

- **Never** use `detached: true`, `shell: true`, or `cmd /c start` in any spawn — use `lib/child-registry.js`.
- **Never** call `pm2 start ecosystem.config.js` directly — use `purpclaw safe-start`.
- **Never** commit secrets, agent_work/, or `.next` cache.
- **Never** run `npm run build` while `next dev` is running — corrupts `.next` cache.
- **Never** trust port reachability alone — always cross-reference with PM2 to catch orphans.
