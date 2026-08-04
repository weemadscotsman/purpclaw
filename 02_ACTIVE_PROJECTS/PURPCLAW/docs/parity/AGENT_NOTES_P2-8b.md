# Agent Notes — P2-8b (2026-07-30)

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md).
> This file is non-authoritative; it records notes and evidence and defines nothing.

## Task
P2-8b from the parity queue: `purpclaw agent` and `purpclaw hook` top-level
subcommands were missing. Both fell through to the default workflow runner.

## What I did

### 1. `purpclaw agent <name>` (singular)
- Added `cmdAgent(args)` in `bin/purpclaw.js` (~line 2661).
- With no name: delegates to `cmdAgents()` (roster view).
- With a name: prints division / role / capabilities / model / score /
  pool status from `agent_routing_matrix.js` + `AGENT_SCORE` json +
  `/api/agents` on the orchestrator port.
- Wired `case 'agent': return cmdAgent(args);` into the dispatch table
  next to the existing `case 'agents':`.

### 2. `purpclaw hook <sub>` (singular)
- Added `cmdHook(args)` in `bin/purpclaw.js` (~line 2724).
- Subcommands: `list`, `ls`, `add`, `enable`, `disable`, `run`, `events`,
  `show <name>`. `list/ls/add/enable/disable/run/events` forward straight
  to `lib/commands/hooks.js`.
- `show <name>` reads `hooks/*.kiro.hook` and `settings/hooks/*.kiro.hook`
  directly (duplicated the loader minimally because `loadCmd` lives inside
  the `dispatch()` closure and is not in scope from top-level `cmd*`
  functions). Falls back to the raw `when.type` when the OC event map
  doesn't have a hit (some hooks still use `fileEdited`).
- Wired `case 'hook': return cmdHook(args);` next to existing
  `case 'hooks':`.

### Scope-bug to remember
`cmd*` functions at module top level cannot see `loadCmd` or `sharedCtx`
— both live in the `main() → dispatch()` closure. Anything new at top
level must `require()` modules directly and pass `{}` for ctx. This is
called out at `bin/purpclaw.js:2732` (existing comment).

## Verification

All four paths smoke-tested against the live repo:

- `purpclaw agent`               → roster (CREATIVE / ENGINEERING / …)
- `purpclaw agent dragon`        → `dragon — Chief Architect`, ENGINEERING, idle
- `purpclaw agent bogus-agent`   → `Unknown agent: bogus-agent`
- `purpclaw hook` / `hook list`  → 10 registered hooks
- `purpclaw hook events`         → 11 OC events
- `purpclaw hook show auto-format` → ON, event fileEdited, action askAgent
- `purpclaw hook show nope`      → `No hook named 'nope'.`

Syntax: `node -c bin/purpclaw.js` → clean.

## Files changed
- `bin/purpclaw.js` — added `cmdAgent` and `cmdHook`, plus two new
  `case` entries in the dispatch table. No other files touched.

## Versioning
No version bump. `package.json` stays at `0.3.0`. The dispatch table
grew by two entries; this is a parity patch, not a release.