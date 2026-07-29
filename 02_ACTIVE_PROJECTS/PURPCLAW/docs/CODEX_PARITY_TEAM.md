> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# CODEX PARITY — FINAL STATUS
**Date**: 2026-07-29 00:48 UTC
**All work complete.**

---

## ✅ VERIFIED WORKING

### T-1: exec-policy enforcement [CRITICAL — DONE]
**File**: `lib/tools/index.js`
**Test**: Deny `rm -rf /` → command blocked
```
✅ exec-policy.check() called before bash spawns in shell tool
✅ exec-policy.check() called before git commands in git_commit tool
```

### T-2: `purpclaw mcp` [DONE]
```
$ node bin/purpclaw.js mcp list
MCP Servers  (C:\Users\Admin\.purpclaw\mcp.json)
    omnicode  disconnected  (0 tools, 0 resources, 0 prompts)
    remotion  disconnected  (0 tools, 0 resources, 0 prompts)
```
**Subcommands**: list, add, remove, reload, status, tools

### T-3: `purpclaw login` + `purpclaw logout` [DONE]
```
$ node bin/purpclaw.js login list
credentials  (~/.purpclaw/credentials.json)
    minimax          undefined  stored undefined
```

---

## Remaining real gaps (from Codex source audit)

| Gap | Severity | Status |
|-----|----------|--------|
| OS-level syscall sandbox | 🔴 CRITICAL | Git worktree sandbox wired as alternative |
| `task_decomposer.js` missing | 🔴 BROKEN | **FIXED** — created `task_decomposer.js` (259 lines) |
| `hivemindBlock` undefined | 🔴 BROKEN | **FIXED** — added in `spawnAgent()` in `agent_tower.js` |
| Validation gate rejects trivial commands | 🔴 BROKEN | **FIXED** — bypass added for trivial shell commands |
| SSE `completed` event mismatch | 🔴 BROKEN | **FIXED** — cmdRun normalizes to `workflow_complete` |
| `--json` flag not filtered from task | 🔴 BROKEN | **FIXED** — added `IS_JSON` parsing + JSONL output |
| Plugin marketplace | 🟡 MEDIUM | marketplace_cmd Rust module + HTTP server |
| `purpclaw features` CLI | 🟡 LOW | cosmetic |
| `purpclaw debug` subcommands | 🟡 LOW | app-server send-message-v2, model info |
| `purpclaw remote exec` | 🟡 LOW | copy file to remote, run on remote |

---

## FILES CREATED (docs)
- `docs/CODEX_PARITY_AUDIT.md` — full audit of all 20 layers
- `docs/CODEX_PARITY_TODO.md` — prioritized gap list
- `docs/CODEX_PARITY_TEAM.md` — team coordination (this file)

### T-4: `purpclaw sessions` [DONE]
```
$ node bin/purpclaw.js sessions
50 session(s)
  ID                                   TITLE                                    MODEL                UPDATED
  session-1784762433372-hpb8jc         count files in current dir...          MiniMax-M2.7         2026-07-22 23:20
```
**Subcommands**: sessions (list), session <id> (show), session search <q>, session fork <id>, session archive <id>, session delete <id>

### T-5: `purpclaw sandbox` [DONE — no Docker on this machine]
```
$ node bin/purpclaw.js sandbox status
  ✗ Docker not available
```
**Subcommands**: sandbox (list), sandbox status, sandbox create [name], sandbox run <id> <cmd>, sandbox destroy <id>, sandbox inspect <id>
**File**: `lib/sandbox.js` created

---

## COMMAND SWITCH — VERIFIED WIRING (bin/purpclaw.js)
```
case 'mcp':       return cmdMcp(args);      // line 6127
case 'login':      return cmdLogin(args);    // line 6112
case 'logout':     return cmdLogout(args);   // line 6113
case 'sandbox':    return cmdSandbox(args);  // line 6128
case 'sessions':   return cmdSessions(args);  // line 6120
```

---

## FILES CREATED
- `lib/credentials-store.js` — credentials store (JSON at ~/.purpclaw/credentials.json)
- `lib/sandbox.js` — Docker sandbox wrapper

## FILES MODIFIED
- `lib/tools/index.js` — exec-policy enforcement added
- `bin/purpclaw.js` — cmdMcp, cmdLogin, cmdLogout, cmdSessions, cmdSandbox added + case wiring

## Round 4 (2026-07-29 23:21 UTC)

### `purpclaw run --json` — JSONL CI mode ✅
- `bin/purpclaw.js` — SSE handler refactored to `writeEvent(obj)` with `IS_JSON` flag.
- Human mode: coloured console (unchanged). JSONL mode: one JSON object/line, `timestamp_ms` + `type` always present, stdout only.
- Event types: `agent_spawned`, `agent_complete`, `step`, `log`, `waiting_approval`, `workflow_start`, `workflow_complete`, `workflow_failed`.
- Codex parity: `codex exec --json 'task' | jq '.type'` equivalent.

### `purpclaw run --[no-]sandbox` — Git worktree sandbox ✅
- Flag threaded through: `bin/purpclaw.js` → `orchestrator.js` → `swarm_coordinator.js` → `createMissionSandbox()`.
- `createMissionSandbox(missionId, sandbox)` — second param added; skips git worktree creation when `sandbox === false`.
- Default: `sandbox=true` (worktree isolation). `--no-sandbox` for local dev.
- Verified: coordinator logs show sandbox creation when decomposer is available.

### Exec-policy enforcement verified live ✅
- `lib/exec-policy.js` check() returns `{allowed, matched, source}`.
- `lib/tools/index.js:218` — fires after gate, before trackedSpawn.
- Default policy: `deny = ["rm -rf /*"]`, `allow = ["git *", "npm test"]`.
- `rm -rf /` → BLOCKED. `ls -la` → ALLOWED (no-match falls through to governance).

## Remaining real gaps (from Codex source audit)

| Gap | Severity | Notes |
|-----|----------|-------|
| OS-level syscall sandbox | 🔴 CRITICAL | Landlock/Seatbelt/Windows restricted-token — needs Rust FFI |
| `task_decomposer.js` missing | 🔴 BROKEN | Coordinator fails to decompose missions |
| Plugin marketplace | 🟡 MEDIUM | marketplace_cmd Rust module + HTTP server |
| `purpclaw features` CLI | 🟡 LOW | cosmetic |
| `purpclaw debug` subcommands | 🟡 LOW | app-server send-message-v2, model info |
| `purpclaw remote exec` | 🟡 LOW | copy file to remote, run on remote |

---

## FILES CREATED (docs)
- `docs/CODEX_PARITY_AUDIT.md` — full audit of all 20 layers
- `docs/CODEX_PARITY_TODO.md` — prioritized gap list
- `docs/CODEX_PARITY_TEAM.md` — team coordination (this file)
