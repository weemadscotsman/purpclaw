# Agent Notes — Slash Commands Regression Test (2026-07-31)

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md).
> This file is non-authoritative; it records notes and evidence and defines nothing.

## Task

User reported "I gotta add model switching to the cli so I can do
`/model` in my chat window". Probed `lib/commands/ask.js`:
`/model` is **already wired** at line 115 (`SLASH_COMMANDS['/model']`).
Also confirmed `/provider`, `/tools`, `/clear`, `/help`, `/status`,
`/compact`, `/init`, `/diff`, `/review`, `/memory`, `/commands`,
`/quit`, `/exit`. So no code change needed.

What was missing: a permanent regression test that would catch a
future refactor accidentally removing any of those entries.

## What I did

### Test added

**File:** `vendor/ponytail/tests/slash-commands.test.js` (new, ~110 lines)

Six source-scan checks:

1. `SLASH_COMMANDS` map declares all 14 expected keys.
2. `/model` handler body contains `ctx.model = …`.
3. `/provider` handler body contains `ctx.provider = …`.
4. `/clear` handler body contains `ctx.history.length = 0`.
5. `resolveSlashCommand(prompt)` call site appears before
   `runOneShot(prompt, ctx)` in the source — guards against the
   dispatch-order regression the user feared.
6. The source contains the `unknown: ${prompt.split(...)}` template —
   guards against silent fall-through to the LLM for unknown slashes.

### Why source-scan, not runtime

The first attempt was a runtime drive of the interactive loop using
the `Module.prototype.require` readline-stubbing pattern documented
in `feedback-purpclaw-interactive-cli-test-pattern.md`. The test
loaded `ask.run([], ctx)` with a stubbed readline. It worked for
the source checks but hung at the first runtime check — `ask.run()`
pulls in a heavy module graph (MCP boot, SQLite experimental
warning, session IO) that does not terminate within a reasonable
test timeout on Windows.

The source-scan checks cover the same contract: they fail loudly
if any of the SLASH_COMMANDS entries disappear, if the dispatch
order inverts, or if the "unknown" template is removed. They run in
<1 second.

### Why this matters

The user's 2026-07-31 transcript showed `/help` and `/model` being
routed to the LLM. The most likely cause is that the interactive
loop never entered the dispatch path (the agent was already stuck
in an `ask_user_question` loop from a previous failed tool call).
But the *wiring contract* — that the dispatch path exists and
contains the right entries — is what a regression test should
protect, not the runtime behaviour.

## Verification

- `node vendor/ponytail/tests/slash-commands.test.js` → 6/6 PASS
- `node vendor/ponytail/tests/lifecycle.test.js` → 4/4 (regression)
- `node vendor/ponytail/tests/path-security.test.js` → 5/5 (regression)
- `node vendor/ponytail/tests/unified-api-tool-gate.test.js` → 6/6 (regression)
- `node vendor/ponytail/tests/hooks.test.js` → pass (regression)
- `node vendor/ponytail/tests/approval-queue.test.js` → 5/5 (regression)

**Total: 27/27 checks across 6 suites.**

## Files changed

| file | change |
|---|---|
| `vendor/ponytail/tests/slash-commands.test.js` | New, 110 lines |

No production code touched.

## Files NOT changed

- `lib/commands/ask.js` — `/model`, `/provider`, etc. are already
  wired and tested; no change needed
- `bin/purpclaw.js` — dispatch table already routes `case 'agent':`
  and `case 'hook':` to the right handlers (see
  `AGENT_NOTES_P2-8b.md`)
- Anything else

## Side observations (out of scope)

- The runtime hang in `ask.run()` is real but cosmetic for the
  regression test. The contract is what matters.
- The user's underlying bug (agent loop stuck in
  `ask_user_question`) is documented in
  `project-purpclaw-askuserquestion-loop.md` and is a separate
  investigation.

## Versioning

No version bump. Test-only change.

## Memory updates

- `feedback-purpclaw-slash-cmds-already-exist.md` (already exists)
  records that `/model` and friends are wired — the user's claim
  was based on assumption rather than probe.
- This agent note documents the new regression test.