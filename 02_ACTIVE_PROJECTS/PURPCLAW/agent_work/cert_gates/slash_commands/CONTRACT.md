# SLASH COMMANDS CERT GATE — CONTRACT

**Cert ID:** `agent_work/cert_gates/slash_commands/`
**Date opened:** 2026-08-17
**Slice:** slash command surface in `bin/purpclaw.js` (parity with Claude Code / Antigravity CLI / Kimi CLI)
**Status:** open

---

## What this cert certifies

The `purpclaw` CLI now accepts the modern `/`-prefix ergonomics used by every other major agent CLI:

1. **Slash prefix is transparent** — `purpclaw /status` is equivalent to `purpclaw status`. All 148 existing case statements now work with or without the `/` prefix.
2. **`/plan <goal>`** — new command. Returns a structured plan: the goal, the first 6 available personas, the live parity snapshot, and a deterministic 4-step scaffold (Inspect / Wire / Cert / Voice). No LLM call yet; the scaffold is real, the plan suggestion is deterministic.
3. **`/clear`** — new command. Clears transient session state (transient JSONL journals in `agent_work/`, `.next` build cache). **Preserves durable state** (memory, skills, personas, cert results, receipts).
4. **`/compact [--days=N]`** — new command. Prunes JSONL journal entries older than N days (default 7). **Preserves durable state** by file-name pattern (anything matching `memory|skill|registry|agent|ledger|receipt|audio_walker|harness_lessons` is skipped).
5. **Bare `/`** is treated as help.
6. **8/8 tests pass** at `tests/slash_commands/test_slash_commands.js`, no mocks. Real subprocess spawning of `node bin/purpclaw.js /<cmd>`.

## What this cert does NOT certify (honest scope)

- **`/plan` is a scaffold, not an LLM plan.** The 4-step structure is real, the persona probe is real, the parity snapshot is real, but the plan body is a deterministic suggestion. Future: wire to the cognitive spine for LLM-generated plans.
- **The 148 existing case statements are NOT re-tested.** Only the 3 new ones (`/plan`, `/clear`, `/compact`) and the slash-prefix alias behavior are tested. The existing case statements are unchanged.
- **`/compact` and `/clear` write to disk.** They touch files. Run with caution in production. The cert runs against `agent_work/` only.
- **In-chat `/` parsing** (Claude Code REPL style) is not implemented. This is the CLI surface, not the chat surface.

## Run

```
node --test tests/slash_commands/test_slash_commands.js
```

From project root. All 8 tests must pass.

## Assertion criteria (8/8 required for PASS)

| # | Assertion | Why it matters |
|---|---|---|
| T01 | `purpclaw /status` runs cleanly | Slash prefix is transparent |
| T02 | `purpclaw /plan "<goal>"` returns the structured plan | New command works |
| T03 | `purpclaw /plan` (no goal) fails with usage hint | Input validation |
| T04 | `purpclaw /clear` runs and reports cleared/preserved | New command works |
| T05 | `purpclaw /compact --days=30` runs and reports pruning | New command works |
| T06 | `/status` and `status` produce equivalent shape | Slash is transparent alias |
| T07 | bare `/` is treated as help | Edge case handled |
| T08 | `/help` runs | Existing help still works |

## Cert verdict format

`agent_work/cert_gates/slash_commands/result.json`:
```json
{
  "schema": "purpclaw.cert-gate.slash-commands.v1",
  "cert_id": "agent_work/cert_gates/slash_commands/",
  "verdict": "PASS",
  "tests_total": 8,
  "tests_pass": 8,
  "parity_gaps_closed": [
    "Claude Code slash commands (/plan, /compact, /clear)",
    "Antigravity CLI slash ergonomics",
    "Kimi CLI slash surface"
  ]
}
```
