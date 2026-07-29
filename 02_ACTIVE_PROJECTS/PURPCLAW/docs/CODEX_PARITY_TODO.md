> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# Codex Parity TODO — PURPCLAW
**Status: NEARLY DONE** | **Date: 2026-07-29**

---

## MUST FIX — BROKEN / MISSING

### ✅ T-1: exec-policy NOT enforced in agent loop [CRITICAL]
**Status**: ✅ FIXED 2026-07-29 — exec-policy.check() now called in lib/tools/index.js at bash tool (line 217) and git tool (line 1522). Both spawn paths denied by policy before execution.

### ✅ T-2: `purpclaw mcp` CLI missing [HIGH]
**Status**: ALREADY EXISTS — `cmdMcp()` at bin/purpclaw.js:5967, fully wired with list/add/remove/reload/status/tools subcommands.

### ✅ T-3: `purpclaw login` / `purpclaw logout` missing [HIGH]
**Status**: ALREADY EXISTS — `cmdLogin()` at :5865, `cmdLogout()` at :5983, `lib/credentials-store.js` fully built.

### ✅ T-4: `purpclaw session` not wired as CLI [MEDIUM]
**Status**: ALREADY EXISTS — `cmdSessions()` at :1170 with full list/search/fork/archive/delete/resume.

### ✅ T-5: `purpclaw sandbox` CLI missing [MEDIUM]
**Status**: ALREADY EXISTS — `cmdSandbox()` at :5478, `lib/sandbox.js` with Docker integration.

### ✅ T-6: `purpclaw update` self-update [MEDIUM]
**Status**: ✅ BUILT 2026-07-29 — `cmdUpdate()` added to bin/purpclaw.js:5625.
- `purpclaw update --check` — compare local vs remote version
- `purpclaw update --version` — show current version
- `purpclaw update` — download + install latest from GitHub, with backup
**Files**: bin/purpclaw.js (150 lines), scripts/install.sh (existing)

---

## SHOULD FIX — SIGNIFICANT GAPS

### ✅ S-1: Docker sandbox missing [CRITICAL]
**Status**: ALREADY EXISTS — `lib/sandbox.js` + `cmdSandbox()` in bin/purpclaw.js:5478.

### ⬜ S-2: 390 Hermes skills NOT in PURPCLAW [HIGH]
**Problem**: skills/ directory has ~12 skills. The 390 Hermes skills live in
`~/AppData/Local/hermes/skills/` — not accessible to PURPCLAW.
**Fix**: Create `~/.purpclaw/skills/` and port key skills, OR make PURPCLAW
consume the Hermes skills directory via env var

### ✅ S-3: credentials.toml missing [MEDIUM]
**Status**: ALREADY EXISTS — `lib/credentials-store.js` with TOML storage + migration from .env. Wired into `llm-provider.js` at line 352.

### ⬜ S-4: `purpclaw features` CLI partial [LOW]
**Status**: Already wired — `case 'features': return loadCmd('feature').run(args, sharedCtx());`

---

## NICE TO HAVE — PARITY POLISH

### ✅ N-1: `purpclaw plugin` CLI [LOW]
**Status**: EXISTS — `cmdPlugins()` at bin/purpclaw.js:3573, `plugins list` works. Missing install/remove/enable/disable.

### ✅ N-2: `purpclaw remote` CLI [LOW]
**Status**: EXISTS — `cmdRemote()` at bin/purpclaw.js:5771 with list/status/add/remove/exec subcommands. Remote execution works.

### ✅ N-3: `purpclaw exec --review` non-interactive review [MEDIUM]
**Status**: ✅ BUILT 2026-07-29 — `cmdReview()` at bin/purpclaw.js.
- `purpclaw exec review --uncommitted` — review staged + unstaged + untracked
- `purpclaw exec review --base <branch>` — review changes against branch
- `purpclaw exec review --commit <sha>` — review changes in a commit
- `purpclaw exec review --prompt <text>` — free-form review against diff
- Size-coded output: green/yellow/red by change magnitude
- Fixed Windows spawn bug: `bare git diff --stat` hangs, uses `git diff --stat HEAD`
- Fixed Git Bash shell: `shell: 'C:/Program Files/Git/bin/bash.exe'` for all git calls
- Untracked capped at 50 files + total count

### ✅ N-4: Harness reliability regression suite [NEW]
**Status**: ✅ BUILT 2026-07-29 — `tests/harness-reliability.smoke.js`
- 12 adversarial fixtures: timeout, crash, partial patch, dirty worktree, conflicting edit, malformed response, missing dep, interrupted run, stale context, false success, unavailable model, invalid approval
- **All 12 pass** — evidence captured to /tmp/purpclaw-evidence-*.json
- Run: `node tests/harness-reliability.smoke.js`

### ✅ N-6: `apply_patch` tool [MEDIUM]
**Status**: ✅ BUILT 2026-07-29 — `lib/apply-patch.js` + wired into tools/index.js (tool #513).
- Parses Codex unified-diff patch format: `*** Begin Patch / *** End Patch` with `*** Add/Update/Delete File:` markers
- `@@` context hints for multi-change hunks
- Safe application: exact match required before replacing; rollback on failure; `.bak` files created
- `dry_run` mode validates without applying
- Registered as `apply_patch` tool in the tools registry

### ✅ N-5: `purpclaw plugins` full lifecycle [LOW]
**Status**: ✅ BUILT 2026-07-29 — enhanced `cmdPlugins()` at bin/purpclaw.js.
- `purpclaw plugins list` — shows enabled/disabled status + version + manifest validity
- `purpclaw plugins install <name> --path <dir>` — copy from local dir or skills/
- `purpclaw plugins install <name> --git <url>` — git clone with bash shell
- `purpclaw plugins remove <name>` — recursive delete
- `purpclaw plugins enable <name>` — creates `.enabled` marker
- `purpclaw plugins disable <name>` — removes `.enabled` marker

---

## ALREADY MATCHED / ADEQUATE

- ✅ `purpclaw model` — fully implemented with list/use/test/reload
- ✅ `purpclaw doctor` — more comprehensive than Codex
- ✅ `purpclaw execpolicy` — CLI works, just not enforced
- ✅ `purpclaw status` — live service probes
- ✅ `purpclaw chat` — NanoClaw REPL
- ✅ `purpclaw start/stop/restart` — PM2 lifecycle
- ✅ Session repository (FTS5) — superior to Codex
- ✅ MCP integration — fully wired
- ✅ Multi-provider routing — Codex doesn't have this
- ✅ Agent scoring — Codex doesn't have this

---

## LEGEND
- ✅ DONE
- 🔥 IN PROGRESS
- ⬜ TODO
