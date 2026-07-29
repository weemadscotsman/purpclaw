> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# CODEX PARITY — REAL GAP REPORT
**Date**: 2026-07-29
**Source**: Fresh audit of `github.com/openai/codex` at `E:/tmp/codex/` (depth-1 clone, 2026-07-29)
**PURPCLAW**: `bin/purpclaw.js` (7237 lines, 366KB)

---

## CODEX FULL COMMAND SURFACE (26 commands)

| # | Command | PURPCLAW Status |
|---|--------|----------------|
| 1 | `codex login` | ✅ built 2026-07-29 — `cmdLogin()` wired to credentials-store |
| 2 | `codex logout` | ✅ built 2026-07-29 — `cmdLogout()` wired to credentials-store |
| 3 | `codex exec` | ✅ partial — `case 'exec'` routes to `cmdReview()` for `review` subcommand |
| 4 | `codex review` | ✅ built — `purpclaw exec review` |
| 5 | `codex resume` | ⚠️ stub — `cmdResume()` lists sessions but doesn't resume TUI state |
| 6 | `codex delete` | ✅ built 2026-07-29 — `cmdDelete()` |
| 7 | `codex archive` | ✅ built 2026-07-29 — `cmdArchive()` |
| 8 | `codex unarchive` | ✅ built 2026-07-29 — `cmdArchive(args, true)` |
| 9 | `codex fork` | ✅ built 2026-07-29 — `cmdFork()` |
| 10 | `codex apply` | ⚠️ partial — uses unified diff format, not Codex `*** Begin Patch` format |
| 11 | `codex update` | ✅ built — `cmdUpdate()` with `--check/--force/--dry-run` |
| 12 | `codex doctor` | ✅ built — `cmdDoctor()` with multi-layer health checks |
| 13 | `codex sandbox` | ✅ built 2026-07-29 — `cmdSandbox()` wired to lib/sandbox.js |
| 14 | `codex completion` | ✅ built — `case 'completion'` generates bash/zsh/fish/ps completions |
| 15 | `codex debug` | ⚠️ partial — `debug models/providers`, `debug app-server`, `debug clear-memories` |
| 16 | `codex debug models` | ✅ built — `debug models` dumps model catalog |
| 17 | `codex mcp` | ✅ built — `loadCmd('mcp').run()` |
| 18 | `codex mcp-server` | ⚠️ stub — prints note, doesn't actually start stdio MCP server |
| 19 | `codex plugin` | ⚠️ partial mismatch — Codex uses `Add/Remove`, PURPCLAW uses `install/remove`; missing `Marketplace` |
| 20 | `codex remote` | ⚠️ partial — `remote list/stop` only, missing `start/pair` |
| 21 | `codex remote-control` | ✅ built 2026-07-29 — `cmdRemoteControl()` with `start/stop/pair` |
| 22 | `codex app` | **MISSING** — desktop launcher, no `case 'app'` |
| 23 | `codex app-server` | **MISSING** — internal, Codex-only |
| 24 | `codex features` | ✅ built — `loadCmd('feature').run()` |
| 25 | `codex cloud` | ✅ built 2026-07-29 — `cmdCloud()` (local job catalog) |
| 26 | `codex exec-server` | **MISSING** — internal, Codex-only |
| 27 | `codex execpolicy` | **MISSING** — internal execpolicy check tool |
| 28 | `codex responses-api-proxy` | **MISSING** — internal, Codex-only |
| 29 | `codex help` | ✅ — argparse default |
| 30 | `codex --version` | ✅ — clap default |
| 31 | `codex --cmds` | ✅ — PURPCLAW `--cmds` flag |

---

## MISSING TOOLS

| Tool | Status |
|------|--------|
| `apply_patch` (Codex format) | ✅ built — `lib/apply-patch.js` |
| `read` / `write` / `edit` | ✅ in tools/index.js (513 tools total) |
| bash / shell | ✅ exec-policy enforced |
| Web search | ✅ via exa/arxiv skills |
| Metrics/diagnostics | ✅ via `cmdDoctor` |

---

## COMPLETED — ALL 8 BUILT 2026-07-29

| Command | File | Notes |
|---------|------|-------|
| `purpclaw login` | cmdLogin at line ~4836 | Interactively stores API keys via credentials-store.js |
| `purpclaw logout` | cmdLogout | Removes keys, `--all` flag |
| `purpclaw delete <session>` | cmdDelete | Deletes from agent_work/sessions/ |
| `purpclaw archive <session>` | cmdArchive(args, false) | Moves to agent_work/archive/ |
| `purpclaw unarchive <session>` | cmdArchive(args, true) | Moves back to active sessions |
| `purpclaw fork [--last\|<id>]` | cmdFork | Copies session with new UUID |
| `purpclaw sandbox [--list\|--create\|--destroy\|--run]` | cmdSandbox | Full Docker lifecycle via lib/sandbox.js |
| `purpclaw remote-control [start\|stop\|pair]` | cmdRemoteControl | Pairing system with codes |
| `purpclaw cloud [list]` | cmdCloud | Local job catalog browser |

---

## REMAINING GAPS

### `codex app` — desktop launcher [HIGH]
Codex launches a desktop app (Electron-based GUI). PURPCLAW has no desktop launcher.
**Priority**: Requires Electron/desktop surface work.

### `codex mcp-server` — stdio MCP transport [MEDIUM]
PURPCLAW has `case 'mcp-server'` but it only prints a note. Should start a stdio JSON-RPC MCP server on stdin/stdout.
**Priority**: Implement stdio transport layer.

### `codex plugin marketplace` — marketplace subcommand [MEDIUM]
Codex uses `plugin add/remove`, PURPCLAW uses `plugin install/remove`. Also missing `marketplace` subcommand.
**Priority**: Rename subcommands + add `marketplace` tree.

### `codex apply` — Codex patch format [MEDIUM]
Current `apply` uses unified diff (`@@` hunks). Codex uses `*** Begin Patch` format with `*** Add File:`, `*** Update File:`, `*** Delete File:` and SEARCH/UPDATE blocks.
**Priority**: Wire `lib/apply-patch.js` into `case 'apply'`.

### Codex-only (skip) [N/A]
- `codex app-server` — internal Codex app server daemon
- `codex exec-server` — internal exec server service
- `codex execpolicy` — internal execpolicy check
- `codex responses-api-proxy` — internal API proxy

---

## SUMMARY

| Category | Count |
|----------|-------|
| ✅ Built (full) | 19 |
| ⚠️ Partial / Mismatch | 5 |
| **MISSING** | **2** (`app`, `mcp-server`) + Codex-only: 4 |

**Regression**: 12/12 pass (harness-reliability.smoke.js 2026-07-29)
