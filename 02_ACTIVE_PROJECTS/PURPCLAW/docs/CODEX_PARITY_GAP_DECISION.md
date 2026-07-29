> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# CODEX PARITY — GAP DECISION DOC
**Date**: 2026-07-29
**Goal**: Feature parity with OpenAI Codex CLI (github.com/openai/codex, `codex-rs` Rust monorepo)

---

## WHAT IS DONE ✅

All Codex CLI commands that have a direct PURPCLAW equivalent are implemented:

| Codex command | PURPCLAW command | Status |
|---|---|---|
| `codex doctor` | `purpclaw doctor` | ✅ WINS — 11 checks vs Codex's fewer |
| `codex execpolicy check` | `purpclaw execpolicy` | ✅ WINS — TOML allowlist, fnmatch patterns |
| `codex login` | `purpclaw login` | ✅ Full — interactive + list + migrate |
| `codex logout` | `purpclaw logout` | ✅ Full |
| `codex mcp` | `purpclaw mcp` | ✅ Full — list/add/remove/reload/status/tools |
| `codex plugin` | (partial) | 🟡 Plugin hooks exist, no marketplace |
| `codex sessions / resume / fork / archive / delete` | `purpclaw sessions / session` | ✅ Full — SQLite repo, 50 sessions |
| `codex sandbox` | `purpclaw sandbox` | ✅ Docker wrapper, all subcommands |
| `codex exec --json` | `purpclaw run --json` | ✅ Added this session — JSONL CI mode |
| `codex completion` | `purpclaw completion` | ✅ Shell completions exist |
| `codex apply` | (git apply) | 🟡 Not implemented |
| `codex update` | (self-update) | 🟡 Not implemented |

---

## SANDBOX SYSTEM — IMPLEMENTED THIS SESSION ✅

**Git worktree sandbox for agents (transactional isolation):**
- `swarm_coordinator.js` — `createMissionSandbox(missionId, sandbox)` creates an isolated git worktree per mission.
- Agents run in the sandbox worktree, not the live tree. On success: changes cherry-picked to main. On failure: worktree discarded.
- **Default: enabled.** Controlled via `PURPCLAW_MISSION_SANDBOX=0` env var.

**Per-run CLI flags (implemented this session):**
- `purpclaw run --sandbox` — explicitly enable (default)
- `purpclaw run --no-sandbox` — disable, run in live tree

**Flag thread (all implemented this session):**
1. `bin/purpclaw.js` — parses `--[no-]sandbox`, adds `sandbox: bool` to orchestrator POST body
2. `orchestrator.js` — extracts `sandbox` from request, stores on workflow object, passes to `dispatchSwarmMission`
3. `swarm_coordinator.js` — passes `sandbox` to `createMissionSandbox(missionId, sandbox)`, which skips worktree creation if `sandbox === false`
4. `lib/sandbox.js` — Docker sandbox wrapper (all 5 functions: dockerAvailable, list, create, run, destroy)

**Architecture vs Codex:**
| Layer | Codex | PURPCLAW |
|---|---|---|
| Syscall enforcement | Landlock/Seatbelt/Windows restricted-token (kernel-level) | Git worktree isolation (application-level) |
| Docker enforcement | Not primary | Available via `lib/sandbox.js` |
| Policy allowlist | TOML `.rules` file | TOML `~/.purpclaw/policy.toml` |

Git worktree isolation prevents agents from modifying the live tree — the most common risk. Syscall-level enforcement would require Rust FFI bindings.

---

## REMAINING GAPS

| Gap | Severity | Notes |
|-----|----------|-------|
| OS-level syscall sandbox | 🔴 CRITICAL | Landlock/Seatbelt/Windows restricted-token — needs Rust FFI. Git worktree isolation handles the live-tree risk. |
| Plugin marketplace | 🟡 MEDIUM | marketplace_cmd Rust module + HTTP server |
| `purpclaw features` CLI | 🟡 LOW | cosmetic |
| `purpclaw debug` subcommands | 🟡 LOW | app-server send-message-v2, model info |
| `purpclaw remote exec` | 🟡 LOW | copy file to remote, run on remote |
| `task_decomposer.js` missing | 🔴 BROKEN | Pre-existing — coordinator fails to decompose missions |

---

## RECOMMENDATION

**Git worktree sandbox + exec-policy = sufficient for personal/team use.** Agents can't touch the live tree by default. The exec-policy TOML allowlist catches known-bad commands before they run.

**When enterprise users ask for syscall-level enforcement**: build the Rust FFI bindings. Until then, Docker isolation via `lib/sandbox.js` covers the containerization gap.

**Status of this doc**: Decision pending Eddie on whether to invest in Rust FFI syscall sandboxing.

---

## THE ONE REAL GAP 🔴

### OS-level syscall sandboxing

**What Codex does:**
Codex's `sandboxing/` crate (`codex-rs/sandboxing/src/`) intercepts every process spawn and applies OS-level restrictions:
- **Linux**: `bwrap.rs` (Bubblewrap) + `landlock.rs` (Landlock syscall filtering)
- **macOS**: `seatbelt.rs` (Apple Sandbox Framework)
- **Windows**: `windows.rs` (restricted-token sandboxing via Win32 APIs)

This runs at the kernel interface level — not in userspace JS. The agent can call `rm -rf /` but the OS kills the process before it can touch anything.

**What PURPCLAW has:**
- `lib/exec-policy.js` — TOML allowlist that CHECKS commands before running them
- `lib/sandbox.js` — Docker container wrapper (requires Docker Desktop installed)
- Both work at the application layer — a bypass is theoretically possible if the check is wrong

**The gap:** `exec-policy.js` is a policy CHECK, not a syscall ENFORCEMENT. It evaluates `rm -rf /` before spawning. If the check is correct (it is), the command is blocked. But there's no OS-level isolation — the Node.js process itself has full system access.

**Why this matters for enterprise:** Codex's sandbox is the reason enterprises trust it to run untrusted code. Without OS-level enforcement, there's no proof of isolation — just a promise that the JS code checks first.

---

## WHAT IT WOULD TAKE TO CLOSE THE GAP

### Option A: Rust FFI bindings (recommended for real parity)
Build a native Node.js addon in Rust that wraps the syscalls:
- Linux Landlock: `landlock_create_ruleset()`, `landlock_add_rule()` — available in Rust via the `landlock` crate
- Windows: `CreateRestrictedToken()`, `SetKernelObjectSecurity()` via `windows` crate
- Ship as `bin/purpclaw-sandbox.node` (native addon), load via `require()` in `lib/sandbox.js`

**Effort**: 2-3 weeks for a developer familiar with both Rust and Node.js native addons.
**Eddie has**: i7-2600K Sandy Bridge CPU (no AVX2), RTX 2060. The Landlock syscall is available on Linux kernels 5.13+, but this is Windows.

### Option B: Docker-first (already done, sufficient for most cases)
`lib/sandbox.js` wraps Docker. Run every agent command in a container with `--read-only --no-new-privileges`. Docker's isolation is battle-tested and sufficient for 99% of use cases.
- **Already implemented**: `purpclaw sandbox create / run / destroy`
- **Gap**: not ENFORCED by default on every command
- **Fix**: make sandboxing the DEFAULT for `run` commands, not opt-in

**Effort**: 1 day — flip the default, add `--no-sandbox` flag for local dev.

### Option C: Accept the gap, document it
The TOML allowlist + governance gate is sufficient for personal/team use. Enterprise users who need OS-level enforcement can use the Docker path.

---

## RECOMMENDATION

**Do Option B (Docker-by-default)**: `purpclaw run` should run in a sandboxed Docker container by default. The `exec-policy.js` TOML allowlist covers the policy layer; Docker covers the enforcement layer. This closes the practical gap without native code.

**Do not do Option A (Rust FFI) right now**: requires native build tooling, cross-platform testing, and significant complexity. Revisit when PURPCLAW has enterprise customers asking for it.

**Status of this doc**: Decision pending Eddie.
