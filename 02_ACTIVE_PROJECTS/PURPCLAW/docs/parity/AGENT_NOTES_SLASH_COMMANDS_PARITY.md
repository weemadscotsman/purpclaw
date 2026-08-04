# Agent Notes — Slash Commands Parity Lock-In (2026-07-31)

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md).
> This file is non-authoritative; it records notes and evidence and defines nothing.

## Task

User reported "model switching in chat is missing — need to add /model".
Audit verified the feature is already wired. The real bug in the user's
transcript was an `ask_user_question` infinite loop elsewhere; the slash
command itself was fine. To prevent future agents from chasing the same
ghost, add a permanent regression test that locks in the slash-command
parity claim.

## What I did

**File added:** `vendor/ponytail/tests/slash-commands.test.js`

Six checks, all source-scan based (the SLASH_COMMANDS map is internal
to `lib/commands/ask.js` and not exported):

1. `SLASH_COMMANDS` declares every expected slash key:
   `/model /provider /tools /clear /help /status /quit` (and 7 more).
2. `/model` handler assigns `ctx.model = name` within its body.
3. `/provider` handler assigns `ctx.provider = name` within its body.
4. `/clear` handler does `ctx.history.length = 0`.
5. Interactive loop calls `resolveSlashCommand` BEFORE `runOneShot`
   (cheap anchored check on source-file offsets).
6. Interactive loop prints `unknown:` message for unrecognised slash
   commands rather than silently sending them to the LLM.

Pattern: source-scan assertions, no runtime invocation of the
interactive loop. The interactive loop uses readline which is hard to
test deterministically; the source-scan approach proves the structural
contract that the loop relies on.

## Verification

```
node vendor/ponytail/tests/slash-commands.test.js
→ 6/6 ok
→ "slash-commands checks passed"
```

## Findings (no code changes)

- All 14 slash commands already wired and listed in `/help`.
- `resolveSlashCommand(prompt)` IS called before `runOneShot(prompt, ctx)`
  in the interactive loop (offsets 1105 vs 1119).
- `/model` handler at `lib/commands/ask.js:115-138` is more featureful
  than the audit suggested — it lists available lane defaults when
  called bare (`/model` with no arg), so users can see what to pick.
- `/model <name>` sets `ctx.model = name` AND `ctx.autoRoute = false`
  (turning off auto-routing for the explicit pick) and confirms
  "applies from the next message".

The actual user-reported bug (`/model` not working, agent loop wedged)
is almost certainly the `ask_user_question` infinite loop noted in
`project-purpclaw-askuserquestion-loop.md`, NOT a missing slash command.

## Files modified

| file | change |
|---|---|
| `vendor/ponytail/tests/slash-commands.test.js` | New, ~140 lines |
| `docs/parity/AGENT_NOTES_SLASH_COMMANDS_PARITY.md` | This file |

## Files NOT modified

- `lib/commands/ask.js` — already correct, slash dispatch verified.

## Out of scope

- The actual `ask_user_question` infinite loop (state machine bug,
  different file, different plan)
- Adding new slash commands (none requested)
- TUI/Web parity for slash commands (different code paths)

## Versioning

No version bump. Verification-only addition.