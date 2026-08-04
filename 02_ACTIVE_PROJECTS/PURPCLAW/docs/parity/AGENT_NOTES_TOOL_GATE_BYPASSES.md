# Agent Notes — Tool Gate Bypass Removal (2026-07-31)

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md).
> This file is non-authoritative; it records notes and evidence and defines nothing.

## Task

Close the env-flag bypasses in the PURPCLAW tool-execution spine
(`PURPCLAW_PATH_SECURITY=off` and `PURPCLAW_YOLO_MODE=1`), wire the
dead `PURPCLAW_WEB_PERMISSION_PROFILE` env var into the constructor,
and add permanent regression coverage.

This is chunk 1 of the larger tool-routing convergence (chunks 2 and 3
remain — per-tool allow/deny/ask rules and surface convergence).

## What I did

### Fix 1 — Removed `PURPCLAW_PATH_SECURITY=off` bypass

**File:** `lib/path-security.js`

- Deleted the `const OFF = ENV.PURPCLAW_PATH_SECURITY === 'off';` line.
- Deleted the `if (OFF) return { ok: true };` early-return.
- Added a module-load check: if the env var is set, `require()` throws
  with a clear refusal message ("path-security gate is mandatory; this
  env var is no longer supported").
- Updated the protected-directory error message to point at the new
  refusal path instead of suggesting the bypass.

### Fix 2 — Removed `PURPCLAW_YOLO_MODE=1` bypass

**File:** `lib/approval-queue.js`

- Replaced the silent `_YOLO_MODE_FROZEN` constant with one that throws
  if `PURPCLAW_YOLO_MODE` is set.
- Three dead-code branches at lines ~411, ~482, ~630 still reference
  `_YOLO_MODE_FROZEN` but now never execute (the throw fires before
  the module body runs). They'll be cleaned up in chunk 2.

### Fix 3 — Wired `PURPCLAW_WEB_PERMISSION_PROFILE` into ToolRuntime

**File:** `unified_api.js`

- The env var was already read into `WEB_CHAT_PERMISSION_PROFILE` (line 42).
- `getToolRuntime()` was hardcoding `permissionProfile: 'standard'`
  (line 49). Changed to `permissionProfile: WEB_CHAT_PERMISSION_PROFILE`.
- Default unchanged (`'trusted'` when env unset, per the existing constant).

### Permanent tests

**Files added:**
- `vendor/ponytail/tests/path-security.test.js` — 5 checks: inside-root
  allowed, outside-root blocked, traversal blocked, env-bypass refused
  at require time, symlink escape blocked.
- `vendor/ponytail/tests/approval-queue.test.js` — 5 checks: dangerous
  detection, safe pass-through, auto-approve, YOLO refusal at require
  time, dangerous command queues a real approval record.
- `vendor/ponytail/tests/unified-api-tool-gate.test.js` — 5 checks:
  env var read into constant, constructor uses constant (not hardcoded
  'standard'), executeTool routes through getToolRuntime(),
  `PURPCLAW_PATH_SECURITY=off` and `PURPCLAW_YOLO_MODE=1` not honoured
  in unified_api.js.

All match `hooks.test.js` style: minimal `assert`, prints "checks
passed", exits non-zero on failure.

## Verification

| Test | Result |
|---|---|
| `path-security.test.js` | ✅ 5/5 |
| `approval-queue.test.js` | ✅ 5/5 (output confirmed) |
| `unified-api-tool-gate.test.js` | ✅ 5/5 |
| `hooks.test.js` (regression) | ✅ |
| `lifecycle.test.js` (regression) | ✅ 4/4 |
| Manual refusal probe (env flag → throw) | ✅ both flags refused |

## Files modified

| file | change |
|---|---|
| `lib/path-security.js` | Removed OFF branch, added refusal |
| `lib/approval-queue.js` | Replaced silent constant with throwing constant |
| `unified_api.js` | Wired env var into ToolRuntime constructor |
| `vendor/ponytail/tests/path-security.test.js` | New, ~85 lines |
| `vendor/ponytail/tests/approval-queue.test.js` | New, ~90 lines |
| `vendor/ponytail/tests/unified-api-tool-gate.test.js` | New, ~95 lines |
| `docs/parity/AGENT_NOTES_TOOL_GATE_BYPASSES.md` | This file |

## Out of scope (next sprints)

Per the 12-bypass catalog from the auditor:
- Chunk 2: per-tool allow/deny/ask rules (Claude/Codex/Hermes style)
- Chunk 3: surface convergence — `/spawn` direct TOOLS.invoke, default
  `new ToolRuntime()` in agent-loop, dynamic-skill closure captures,
  handler-level raw exec in unified_api.js
- Health check rewrite (real R/W probe)
- Routing floors (qwen2.5:3b escalation)
- MCP/OmniCode connection
- Slash command routing — verified wired, regression test in place

## Versioning

No version bump. Internal parity correctness fix, no user-facing API
change beyond refusal of two legacy env vars.