# Agent Notes — Lifecycle Event Contract (2026-07-31)

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md).
> This file is non-authoritative; it records notes and evidence and defines nothing.

## Task

Finish the unfinished edge of the 2026-07-31 hook repair.
Three lifecycle topics — `PreCompact`, `PostCompact`, `Error` —
were listed in `lib/hooks/lifecycle-bus.js` HOOK_TOPICS but
rejected by `parity/hooks/engine.js`'s OC_EVENTS filter, so
listeners never received them.

## What I did

### 1. Allowlisted the three dropped topics in the parity engine

**File:** `parity/hooks/engine.js` (lines 31-46)

Added `PreCompact`, `PostCompact`, `Error` to `OC_EVENTS`.
This is the only code change. The engine's own self-described
intent (per the lifecycle-bus.js comment at lines 29-31) was
that these events ARE forwarded; the filter disagreed.

### 2. Permanent test suite

**File:** `vendor/ponytail/tests/lifecycle.test.js` (new, ~140 lines)

Four checks:

1. All nine lifecycle topics fire exactly once via PARITY_HOOKS
   (the canonical single-fire path post-double-fire-fix).
2. `agent-loop.js` does not call `LIFECYCLE.sessionStart` /
   `sessionEnd` / `postToolUse` directly — guards the double-fire
   regression.
3. `lifecycle-bus.js` HOOK_TOPICS contains all nine topics.
4. `parity/hooks/engine.js` OC_EVENTS allowlists the three
   formerly dropped topics.

Style matches `vendor/ponytail/tests/hooks.test.js`: minimal
`assert`, no Jest/Mocha, prints `lifecycle checks passed`.

## Verification

- `node vendor/ponytail/tests/lifecycle.test.js` → exit 0,
  `lifecycle checks passed`
- `node vendor/ponytail/tests/hooks.test.js` → exit 0
  (regression check)
- `node -c parity/hooks/engine.js` → clean
- `node -c lib/agent-loop.js` → clean
- `node bin/purpclaw.js hook show auto-format` → works
  (regression check on hooks module)
- End-to-end probe (deleted after verification): 9/9 topics
  received once each.

## Files changed

| file | change |
|---|---|
| `parity/hooks/engine.js` | 3 strings added to OC_EVENTS (8 → 11 entries) |
| `vendor/ponytail/tests/lifecycle.test.js` | New test file |
| `docs/parity/AGENT_NOTES_LIFECYCLE_CONTRACT.md` | This file |
| `~/.openclaude/memory/MEMORY.md` | Mark dead-topics entry resolved |

## Files NOT changed

- `lib/agent-loop.js` — already correct after the 2026-07-31
  double-fire fix
- `lib/hooks/lifecycle-bus.js` — HOOK_TOPICS already correct
- `unified_api.js`, `lib/tool-runtime.js`, `lib/chat-agent.js`
  — permission/tool-routing work is the next sprint item, out of
  scope here

## Side benefit

List of listener-registered events now matches reality: a hook
author can register for `PreCompact` / `PostCompact` / `Error`
and the engine will actually deliver the event. Previously
those listeners were silently unreachable.

## Open follow-ups (next sprint, not in this patch)

Per the auditor's `Top 10 highest-impact open gaps` list,
the next items are:

1. **Canonical tool/permission execution path** —
   route every effectful tool through ToolRuntime, remove
   the `PURPCLAW_API_TOOL_GATE=0` bypass.
2. **Read-only tool scopes** — already passes 6/6; audit
   finding is stale (probe earlier in this session).
3. **Memory convergence** — multiple memory clients, no
   canonical contract.
4. **Configuration authority** — multiple competing sources.
5. **Session lifecycle completeness** — fork/rename/archive/
   export/attach/cancel.

Each will be its own plan/sprint.

## Versioning

No version bump. Internal hook-lifecycle correctness fix,
no user-facing API change.

## Memory updates

- `project-purpclaw-dead-lifecycle-topics.md` → topics now
  reachable; entry to be marked resolved in this same commit.