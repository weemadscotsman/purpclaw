# Agent Notes — Hooks Double-Fire Fix (2026-07-31)

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md).
> This file is non-authoritative; it records notes and evidence and defines nothing.

## Task
AUDIT_WAVE1_UNIFIED_RUNTIME.md FAIL item: *Hooks — agent loop emits to two
buses, no canonical hook contract*. Verify and fix.

## What I found

`lib/agent-loop.js` calls **two APIs** at every lifecycle event point:

1. `LIFECYCLE.sessionStart(...)` / `sessionEnd(...)` / `postToolUse(...)`
   directly (lines 433, 533, 548, 603, 708, 803).
2. `PARITY_HOOKS.emit('SessionStart', ...)` / etc.
   immediately after (lines 437, 534, 549, 604, 710, 804).

The comment at line 709 (*"emit after LIFECYCLE so both buses fire"*)
admitted the duplication.

But it's worse than that: there is **only one bus**. `parity/hooks/engine.js`
is an OC-shape adapter that delegates every `emit()` to `LIFECYCLE.emit()`
(line 370-372). So `agent-loop` was firing the same event twice to the same
`LIFECYCLE` bus. Every registered hook listener received each lifecycle
event twice.

## Probe (before fix)

```text
bus.sessionStart('s', ...)           // direct LIFECYCLE
parity.emit('SessionStart', {...})   // engine → LIFECYCLE (again)
bus.sessionEnd('s', 'completed')     // direct LIFECYCLE
parity.emit('SessionEnd', {...})     // engine → LIFECYCLE (again)
```

→ listeners received `[SessionStart, SessionStart, SessionEnd, SessionEnd]`.

## Probe (after fix)

Replaced each `LIFECYCLE.x()` call with a comment noting it is now reached
via the PARITY_HOOKS → engine → LIFECYCLE chain. Result: 6 events delivered
to LIFECYCLE listeners, each appearing exactly once.

## What I changed

`lib/agent-loop.js` only. Six edits, all removals of `if (LIFECYCLE) ...`
calls that were redundant with the immediately-following PARITY_HOOKS.emit:

| Was (line numbers pre-fix) | Kept | Removed (redundant) |
|---|---|---|
| 432-435 | `LIFECYCLE.promptSubmit` (different topic) | `LIFECYCLE.sessionStart` |
| 533 | — | `LIFECYCLE.sessionEnd('priority-steer')` |
| 548 | — | `LIFECYCLE.sessionEnd('SIGINT')` |
| 603 | — | `LIFECYCLE.sessionEnd('error')` |
| 708 | — | `LIFECYCLE.postToolUse` |
| 767 | `LIFECYCLE.turnStop` (no PARITY_HOOKS counterpart) | — |
| 803 | — | `LIFECYCLE.sessionEnd('completed')` |

`LIFECYCLE.promptSubmit` (S1 Steering vNext topic — different from OC
`UserPromptSubmit`) and `LIFECYCLE.turnStop` (no PARITY_HOOKS counterpart)
are **kept** — they were never duplicated.

## Diff size
8 insertions, 11 deletions. Single file.

## Verification

- `node -c lib/agent-loop.js` → clean
- `node vendor/ponytail/tests/hooks.test.js` → "hook compatibility checks passed"
- Single-fire probe (6/6 events delivered once) → PASS
- Diff `git status --short lib/agent-loop.js` → only my changes
  (the file also contains two unrelated pre-existing modifications:
  `done`→`error` yield at line 615 and `getQueue`→`peekQueue` at line 784,
  both from prior agents — not touched by this patch.)

## Side effects

- The `result.ok` shortcut field that `LIFECYCLE.postToolUse()` (lifecycle-bus
  convenience wrapper) added to payloads is no longer present. PARITY_HOOKS
  payloads send the raw `result` object. Any listener that depended on
  `payload.ok` should now read `payload.result?.ok`.
- Grep of `lib/` and `apps/` shows no internal callers of `bus.register()`
  for `SessionStart`/`SessionEnd`/`PostToolUse`, so no listener breakage.
- The HOOK_TOPICS entry in `lib/hooks/lifecycle-bus.js:31` for
  `PreCompact`/`PostCompact`/`Error` is still listed as "topics PARITY_HOOKS
  emits" — but the engine's OC_EVENTS filter actually drops these. PreCompact
  reaches no listener at all today (separate dead-code finding, out of scope).

## Versioning

No version bump. Internal hook-bus correctness fix, no user-facing API change.

## Files changed
- `lib/agent-loop.js` (8 insertions, 11 deletions)
- `docs/parity/AGENT_NOTES_HOOKS_DOUBLEFIRE.md` (this file)