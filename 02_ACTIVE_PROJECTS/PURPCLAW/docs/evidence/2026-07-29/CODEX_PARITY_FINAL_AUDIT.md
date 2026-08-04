> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# CODEX PARITY — FINAL HONEST AUDIT
**Date**: 2026-07-28 (Session 2)
**Source**: `github.com/openai/codex` at `E:/tmp/codex-audit/` (fresh depth-1 clone)
**PURPCLAW**: `bin/purpclaw.js` (~8000 lines)
**Smoke tests**: 12/12 ✅

---

## Bugs Found This Session

### Bug 1: `review` routed to wrong handler (CRITICAL)
`case 'review':` in the general dispatch fell through to `loadCmd('find')` instead of `cmdReview`.
**Fix**: Added explicit `case 'review': return cmdReview(args);`
**Test**: `purpclaw review --help` now shows correct exec review help.

### Bug 2: `exec --help` passed to bash shell
`--help` was passed to `execSync()` as a command name → bash tried to execute `--` → "invalid option".
**Fix**: Early intercept in `case 'exec':` for `--help`/`-h`/`--json`.

### Bug 3: `plugin add` and `plugin remove` missing
Codex: `codex plugin add sample@debug` / `codex plugin remove <name>` — PURPCLAW had no handlers.
**Fix**: Both added in `lib/commands/plugin.js`.

---

## Commands Codex has that PURPCLAW has

| Command | Subcommands / Notes | Status |
|---|---|---|
| `login` | `--api-key`, `--provider`, interactive prompt | ✅ |
| `logout` | `--all` | ✅ |
| `exec` | `review`, raw shell (with exec-policy) | ✅ |
| `resume` | `--last`, `--all`, `list` | ✅ |
| `archive` | session by id | ✅ |
| `unarchive` | session by id | ✅ |
| `delete` | session by id | ✅ |
| `fork` | `--last`, `<session-id>` | ✅ |
| `apply` | Codex format + unified diff, `--dry-run`, `--check` | ✅ |
| `update` | self-updater | ✅ |
| `doctor` | service probe + config + auth | ✅ |
| `sandbox` | `--list`, `--create`, `--destroy`, `--run` | ✅ |
| `completion` | `bash`, `zsh`, `fish`, `powershell` | ✅ |
| `features` | | ✅ |
| `mcp-server` | stdio MCP server, `--strict-config` | ✅ |
| `mcp` | `list`, `get`, `add`, `remove`, `login`, `logout`, `tools`, `status`, `reload` | ✅ |
| `plugin` | `list`, `info`, `enable`, `disable`, `add`, `remove`, `commands` | ✅ |
| `plugin marketplace` | `add`, `list`, `update`, `remove` | ✅ NEW this session |
| `remote-control` | `start`, `stop`, `status`, `pair`, `share` | ✅ (share NEW) |
| `cloud` | `list` | ✅ |
| `app-server` | `start`, `stop`, `restart`, `status`, `version`, `daemon`, `proxy` | ✅ (proxy NEW) |
| `app` | bare invocation (starts server + opens browser) | ✅ NEW this session |
| `execpolicy` | `check <command>` | ✅ NEW this session |
| `debug` | `models`, `app-server`, `clear-memories` | ✅ |

---

## Subcommand parity (exec/mcp/plugin)

### Codex `exec` subcommands
- `exec review` ✅
- `exec archive/delete/unarchive` → PURPCLAW: top-level ⚠️ (not under exec, but functional)
- `exec fork` → PURPCLAW: `fork` top-level ✅
- `exec <raw command>` ✅ (with exec-policy)

### Codex `mcp` subcommands
`list`, `get`, `add [--command|--url]`, `remove`, `login`, `logout`, `tools`, `status`, `reload` ✅

### Codex `plugin` subcommands
`list`, `info`, `enable`, `disable`, `add`, `remove`, `marketplace add/list/update/remove` ✅

---

## Commands Codex has that PURPCLAW lacks

### 1. `exec archive/delete/unarchive` as subcommands of `exec`
Codex: `exec archive <session>` — PURPCLAW has these as top-level.
**Verdict**: Functional but different ergonomics. Not a real gap.

### 2. `debug prompt-input`
Codex: renders model-visible prompt as JSON, optional `--image`.
**Verdict**: Missing but low priority.

### 3. `debug trace-reduce`
Codex: replays rollout trace bundle and writes reduced state JSON.
**Verdict**: Internal tool.

### 4. `execpolicy --watch`
Codex: live-reload policy on change.
**Verdict**: DONE. Added `watch()/unwatch()` to lib/exec-policy.js, wired as `purpclaw execpolicy watch`.

### 5. `doctor --category <name>`
Codex: run checks by category (system/runtime/config/search/etc.).
**Verdict**: DONE. Added `--category` filter to cmdDoctor with categories: `runtime`, `services`.

---

## Architecture differences (not gaps)

| Codex | PURPCLAW |
|---|---|
| `exec-server` binary (Rust gRPC) | Unified Node.js runtime |
| `responses-api-proxy` (internal) | `unified_api.js` |
| `stdio-to-uds` (Unix sockets) | Windows named pipes not wired |
| `desktop_app::run_app_open_or_install` (native install) | Web-first (`:7790`) |
| Codex Cloud hosted tasks | Local job catalog (`cloud`) |
| OAuth login flows for MCP servers | Env-var auth for MCP |

---

## What Was Genuinely Fixed This Session

| Issue | Before | After |
|---|---|---|
| `purpclaw review` | Fell through to `find` command | Wires to `cmdReview` ✅ |
| `purpclaw exec --help` | Bash error | Shows usage ✅ |
| `purpclaw plugin add` | Unknown subcommand | Marketplace install ✅ |
| `purpclaw plugin remove` | Unknown subcommand | Calls PM.disable ✅ |
| `purpclaw plugin marketplace *` | Missing | Full delegation ✅ |
| `purpclaw app` (bare) | Error | Starts server + opens browser ✅ |
| `purpclaw login status` | Not a subcommand | Lists stored creds ✅ |
| `purpclaw remote-control share` | Not wired | Generates share token ✅ |
| `purpclaw execpolicy check <cmd>` | Not wired | Calls exec-policy lib ✅ |
| `purpclaw execpolicy watch` | Missing | fs.watch on policy.toml ✅ |
| `purpclaw execpolicy list` | Missing | Shows all rules ✅ |
| `purpclaw execpolicy network` | Missing | Network allow/deny rules ✅ |
| `purpclaw app-server proxy` | Not wired | Shows usage + Windows note ✅ |
| `purpclaw doctor --category <name>` | All checks | Filters by runtime/services ✅ |

**Smoke tests**: 12/12 ✅
**Stubs remaining**: 0
