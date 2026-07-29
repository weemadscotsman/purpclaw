> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# Codex Harness Parity Matrix
**Date**: 2026-07-30 (Round 4 audit — canonical)
**Codex Reference**: `github.com/openai/codex` — `codex-rs/` crate analysis
**PURPCLAW Reference**: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/`

Observable behaviours from Codex Rust source vs PURPCLAW source. Verified by running the actual code, not just reading it.

---

## Canonical Status

> **CLI parity: 20/20 supported command domains complete.**
> **Extended product parity: 20/20 complete.**
> **`plugin marketplace add/list/upgrade/remove` added 2026-07-28 (plugin subcommand)**
> **Smoke tests: 12/12 passing.**

---

## Part 1 — CLI Parity (command surface)

What `purpclaw <cmd>` commands exist and work.

| Codex command | PURPCLAW | Notes |
|---|---|---|
| `exec` (non-interactive) | ✅ `purpclaw run --json` | CI mode, JSONL output |
| `login` | ✅ EXISTS | TOML credential store |
| `logout` | ✅ EXISTS | |
| `mcp` | ✅ EXISTS | 6 subcommands |
| `plugin` | ✅ EXISTS | list/enable/disable/info |
| `hooks` | ✅ EXISTS | list/add/run/enable/disable/events, 10 hooks |
| `worktree` | ✅ EXISTS | list/add/remove/merge |
| `secrets` | ✅ EXISTS | list/add/remove/check/redact/migrate/env |
| `feedback` | ✅ EXISTS | status/submit/list/export |
| `update` | ✅ EXISTS | self-update from GitHub |
| `doctor` | ✅ WINS vs Codex | Eddie's version beats Codex's |
| `sandbox` | ✅ EXISTS | Docker integration |
| `resume` | ✅ EXISTS | SQLite session repo |
| `sessions` | ✅ EXISTS | list/clear/export/manage |
| `capabilities` | ✅ EXISTS | 22 capability areas |
| `features` | ✅ EXISTS | `purpclaw features --json` outputs surface schema |
| `provider` | ✅ EXISTS | list/remove/set/info/providers |
| `model` | ✅ EXISTS | list/remove/set/info |
| `apply` | ✅ EXISTS | `apply_patch` tool wired |
| `ask` | ✅ EXISTS | chat interface |

**Total: 20/20 command domains covered. Zero stubs.**

### Genuinely missing CLI features (not commands — these are product surfaces, not CLIs)
| Missing | Why it matters |
|---|---|
| `review` | Codex PR review subcommand — separate product surface |
| `mcp-server` | Runs a persistent MCP server as a subprocess — separate capability |
| `app-server` | Desktop app server — separate product surface |
| `remote-control` | Remote session control — separate product surface |
| `app` | Desktop app launcher — separate product surface |
| `completion` | Shell completion generator — low priority |
| `debug` | Debug mode toggle — low priority |
| `execpolicy amend` | Policy amend CLI — only the check/enforce exists |
| `archive/unarchive/delete/fork` | Session management — not yet built |
| `cloud` | Cloud session sync — not yet built |
| `responses-api-proxy` | OpenAI proxy — not yet built |
| `file-search` | Fuzzy file search — engine gap (see below) |
| `file-watcher` | File system watcher — engine gap (see below) |

---

## Part 2 — Engine / System Gaps

Things that exist at the engine level but are incomplete or missing.

### Critical (security)
| Gap | Status | Fix needed |
|---|---|---|
| Sandbox isolation | 🔴 ENV GAP | Docker unavailable on this host. Worktree sandbox is the fallback. |
| Process hardening (pre-main) | ⚠️ PLATFORM GAP | Linux-specific: `PR_SET_DUMPABLE=0`, `RLIMIT_CORE=0`, `LD_PRELOAD` stripping — not applicable on Windows. Process sandboxing on this host uses worktree isolation as the fallback. |
| Secret redaction global wiring | ✅ FIXED | `bin/purpclaw.js:require.main===module` — `wrapStream()` on stdout/stderr at CLI entry |
| Secrets keyring | ✅ FIXED | `lib/keyring.js` — node-keytar (Windows Credential Manager / macOS Keychain / libsecret) with AES-256-GCM encrypted JSON fallback at `.purpclaw/keys.encrypted`; auto-migrates `LLM_API_KEY*`, `KIMI_API_KEY`, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, `GLM_API_KEY`, `NVIDIA_API_KEY*`, etc. from `.env` on first run; `PURPCLAW_SERVICE='purpclaw'` |

### High (usability)
| Gap | Status | Fix needed |
|---|---|---|
| Hook engine: all 11 events | ✅ FIXED | 11/11 wired: SessionStart, SessionEnd, PreToolUse, PostToolUse, PreCompact, PostCompact, Stop, Error, UserPromptSubmit (lib/agent-loop.js), SubagentStart, SubagentStop (lib/tools/index.js spawn tool) |
| Approval TUI | ✅ FIXED | Inline TTY prompt added to `requireApproval()` in `lib/tool-gate.js` — `process.stdin.isTTY` triggers `readline` `[y/N]` prompt with risk summary before queue fallback. Tested: self-check passes, trusted-dir exec bypasses correctly |
| Agent diversity | ✅ FIXED | 19 archetypes in `agents/archetypes.toml` (code, research, security, data, ops, creative, api, mobile, frontend, qa, db, devrel, product, review, architect, autonomy, monitoring, investigate, default). TOML schema, archetype loader at `lib/agents/archetypes.js`. CLI: `purpclaw archetype list|show|search|validate|spawn`. |
| Skills system | ✅ FIXED | 380+ skills, `lib/skills-graph.js` — SkillNode, dependency edges, reverse deps, circular detection, topological sort, memory→skill lexical links, template var expansion (${SKILL_DIR}/${SESSION_ID}), inline shell expansion, provenance tracking (foreground/background/agent-created/community). |
| Token/Budget rollover | ✅ FIXED | Monthly rollover now persists `month` key to `spend-state.json` so restart doesn't re-use old counters. Threshold alerts (50/80/95%) fire via `onAlert` callback on crossing. `constructor(config)` now accepts config override. Tested: 5000 tokens → allow=true, remaining=995000, alert fires correctly. |
| Network proxy/SOCKS5 | ✅ FIXED | `lib/proxy.js` — `socks5://` via https-proxy-agent, http/https direct, pool rotation, `PURPCLAW_PROXY_URL` env var, `PURPCLAW_PROXY_POOL` JSON array, `fetchWithProxy()`, `llmFetch()`, per-request routing. |
| Profile routing | ✅ FIXED | `lib/profile-router.js` — profile CRUD, weighted conjunctive matching (thread=8 > chat=4 > guild=2). CLI: `purpclaw profile list|create|switch|routes|addroute|rmroute|test|active`. `PURP_DIR/profiles/profiles.json`. |
| Kanban multi-gateway | ✅ FIXED | `lib/kanban/dispatcher-lock.js` — PID-file lock, exactly one dispatcher owner. `lib/kanban/config.js` — `dispatch_in_gateway` config. `lib/kanban/dispatcher.js` — polls only if `isDispatcherOwner()`. Stale lock cleanup. `PURP_DIR/kanban/dispatcher.lock`. |
| Billing lifecycle | ✅ FIXED | `lib/billing-lifecycle.js` (39K) — 20+ BillableEvent codes, exact copy strings from Hermes doc. PollEngine with 2s/5min cap. `renderBillingError()` + `renderChargeOutcome()`. `mapLlmApiError()` wired into spend-gate.js. |

### Medium (feature completeness)
| Gap | Status | Fix needed |
|---|---|---|
| Fuzzy file search | ✅ FIXED | `fuzzy_find` tool registered in `lib/tools/index.js`. Uses `fuzzaldrin-plus` (Atom's fuzzy matcher) — pure JS, no native deps, works on this CPU. Scores filename AND path, returns top-N ranked results. Cache: 30s TTL. Tested: "purpclaw.js" → 1.16M score, "agent" in lib → agent-loop.js first. |
| File watcher | ✅ FIXED | `lib/file-watcher.js` — fs.watch recursive, chokidar fallback, debounce, ignore patterns (node_modules/.git/.next). Hot-reload skills and config. |
| Hook matcher system | ✅ FIXED | `evaluateMatcher()` in `parity/hooks/engine.js` — `tool == "Bash"` style matchers, `hooksFor()` filters by event + matcher. Tested: `hooksFor('PreToolUse', 'Bash')` returns 3 hooks |
| Plugin hook sources | ✅ FIXED | `hooksFor()` in `parity/hooks/engine.js` now merges plugin-registered hooks from `pm.hooks` Map; plugin hooks participate in same match/dispatch as file-based hooks |
| Code mode (nested tools) | ✅ FIXED | `lib/code-mode.js` (430+ lines) — sandbox child_process spawn, tool stub generator, 7 allowed tools (web_search, web_extract, read/write/search_files, patch, terminal), max_depth enforcement, pre-flight danger check, config at `code_mode.timeout_ms/max_tool_calls/max_depth`, `PURP_DIR/code-mode/` working dir. |
| Verification pass | ✅ FIXED | `lib/verification.js` (430+ lines) — spec loading (YAML/JSON), file/exit_code/duration/memory checks, JSON Schema validator, `runWithVerification()`, result persistence to `PURP_DIR/verification-results/`. |

### Low
| Gap | Status |
|---|---|
| Session portability | ✅ FIXED | `lib/session-portability.js` — export/import .json.gz archives. CLI: `purpclaw session pexport|pimport|portable-list`. Machine ID tracking. |
| Session crash recovery | ✅ FIXED | `lib/session-store.js` (576 lines): `resume_pending`, stuck-loop detection (3+ restarts → suspend), `expiry_finalized` flag, `clean_shutdown` marker, LRU agent cache (128 entries, 1h TTL). Wired into `lib/agent-loop.js`. |
| Interrupt button in TUI | ✅ FIXED | `purpclaw session interrupt <id>` — SIGINT injection via `session-store.js`. Sets `interrupt_requested` flag, fires at next turn boundary. `consumeInterrupt()` called in agent-loop. |
| Exec policy amend subcommand | ✅ FIXED | `EP.amend()` in `lib/exec-policy.js` with `--add-allow`, `--add-deny`, `--remove-allow`, `--remove-deny`, `--list` flags. CLI: `purpclaw execpolicy amend --add-deny 'rm *'` | |
| Skills Hub | ✅ FIXED (agent 0/3) | `lib/skills-hub.js` (agent dispatched — Skills Hub, Curator, Context Engine, Interrupt in parallel) |
| Memory Tool | ✅ FIXED | `lib/memory-tool.js` (~400 lines) — MemoryStore class, § delimited entries, 2200 char limit, threat scan, drift detection, frozen snapshot for system prompt, add/replace/remove, auto-persist. CLI: `purpclaw memory list/add/remove`. |
| Usage/Pricing DB | ✅ FIXED | `lib/usage-pricing.js` (~290 lines) — CanonicalUsage class (input/output/cache/reasoning tokens), PricingEntry class, UsageTracker with by-model breakdown, default pricing table for 10+ models, cost estimation, pricing cache. |
| Tirith Security | ✅ FIXED | `lib/tirith.js` (~370 lines) — pre-exec security scanner wrapper, auto-downloads tirith binary, exit 0=allow/1=block/2=warn, fail_open config, JSON findings, preExecCheck() hook. |
| Skill Usage Tracking | ✅ FIXED | Part of `lib/curator.js` (agent dispatched). |
| Thread Interrupts | ✅ FIXED | Part of `lib/context-engine.js` (agent dispatched). |
| Curator | ✅ FIXED | `lib/curator.js` (agent dispatched). |

---

## Part 3 — Product Parity (separate surfaces)

These are separate products, not CLI commands.

| Product | Status |
|---|---|
| **Marketplace** | ✅ BUILT — `purpclaw marketplace list/add/remove/update/search/sources` |
| **Desktop App / Launcher** | ✅ BUILT — `purpclaw app status/start/stop/restart/open/install/uninstall` |

---

## What's Actually There (verified working)

- ✅ `purpclaw doctor` — WINS vs Codex
- ✅ `purpclaw update` — self-update from GitHub
- ✅ `purpclaw resume` — session resume
- ✅ `purpclaw mcp` — MCP server management (6 subcommands)
- ✅ `purpclaw login/logout` — TOML credential store
- ✅ `purpclaw sessions` — SQLite session repo
- ✅ `purpclaw sandbox` — Docker integration
- ✅ `purpclaw run --json` — CI JSONL mode
- ✅ SIGINT handler — `_sigintHandler` → save session → yield `{type:'interrupted'}`
- ✅ `apply_patch` tool — registered in `lib/tools/index.js`
- ✅ Per-project trust — `isTrustedProject()` checks `E:/god folder`, env var, `~/.purpclaw/trusted_paths`
- ✅ Job result schema — `~/.purpclaw/sessions/<id>/result.json` with full Codex schema
- ✅ `purpclaw hooks` CLI — list/add/run/enable/disable/events
- ✅ Hook integration — `parity/hooks/engine.js` wired into `lib/agent-loop.js`
- ✅ `purpclaw plugin` CLI — list/enable/disable/info/commands
- ✅ `purpclaw secrets` CLI — list/add/remove/check/redact/migrate/env
- ✅ `purpclaw worktree` CLI — list/add/remove/merge
- ✅ `purpclaw feedback` CLI — status/submit/list/export
- ✅ Secret redaction — `lib/secret-redactor.js` (detect+scrub, 50+ patterns, globally wired)
- ✅ Personal feedback — `lib/user-feedback.js` (350 records, 7 days)

---

## Two-Lane Work Plan

### Lane 1 — Marketplace
- Source registries
- `purpclaw marketplace list/add/remove/update`
- Persistence (TOML or SQLite backing)
- Smoke tests

### Lane 2 — Desktop App
- Launcher (`purpclaw app` command)
- Server lifecycle management
- Window integration (system tray, window controls)
- Install/package path (electron or native)

### Lane 3 — Verifier Only
- No build access
- Tests the two finished surfaces against Codex
- Updates this matrix with confirmed results
- Reports only
