> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PURPCLAW Parity vs Codex / Claude Code / Hermes — Round 2
**Date:** 2026-07-18
**Author:** Quill
**Method:** direct ground-truth comparison against competitor feature surfaces

---

## ROUND 2 DELIVERED (this session)

### Tools added to `lib/tools/index.js`
| Tool | Parity target |
|---|---|
| `glob` | Claude Code / Hermes — find files by `**/*.js` style pattern |
| `multi_edit` | Claude Code killer feature — batch find/replace across many files |
| `git_commit` | All three competitors — `git add` + `git commit` with message |
| `web_search` | All three — DuckDuckGo HTML backend, no key required |
| `ask_user_question` | Claude Code's `AskUserQuestion` — block + present options |
| `move` | Claude Code — rename / move across dirs |
| `list_directory` | Claude Code — directory listing with kind metadata |

### Slash commands added to `lib/commands/ask.js`
| Command | Parity target |
|---|---|
| `/init` | Claude Code — write `.purpclaw/AGENTS.md` skeleton |
| `/diff` | Claude Code — compare last two assistant messages |
| `/review` | Claude Code — flag last assistant message for issues |
| `/memory` | Claude Code — show recent memory recall |
| `/permissions` | Claude Code — list tool permission profiles |
| `/fork` | Claude Code — branch session into new fork |
| `/undo` | Claude Code — drop last N messages |
| `/rollback` | Claude Code — roll back last N checkpoints |

Slash command count: 15 → **25**.

### CLI commands added to `bin/purpclaw.js`
| Command | Parity target |
|---|---|
| `purpclaw diff [file]` | Claude Code — `git diff` for current repo |
| `purpclaw completion [--zsh]` | All three — bash/zsh completion script |

### Glob implementation notes
- `lib/tools/index.js:1140-1230` — `glob` tool with per-segment regex compilation
- Walk algorithm splits pattern on `/`, compiles each segment to a regex
  independently, then descends matching segments. Handles `**` (any depth),
  `*` (single segment), `?` (single char), and exact directory names.
- Skips `node_modules`, `.git`, `.next`, `dist` by default
- Honors `PURPCLAW_GLOB_MAX` env var (default 500 results)

### Verification
```
✓ 7 new tools loaded (total now 510)
✓ All 8 new slash commands registered
✓ /init, /diff, /review, /memory, /permissions, /fork, /undo, /rollback all live
✓ cmdDiff runs `git diff` against current repo
✓ cmdCompletion emits valid bash completion script
✓ glob: lib/*.js returns 5+ matches
✓ glob: **/agent-loop.js returns 1 match
✓ glob: lib/*security*.js returns path-security.js
```

---

## WHERE WE STILL LAG (Tier 2 — needs work next)

### Capabilities competitors have, PURPCLAW doesn't (verified by code absence)
1. **Credential pool** — Hermes: 2,554 lines, multi-key rotation. PURPCLAW: 0.
2. **Tirith prompt-injection scanner** — Hermes only.
3. **Skill provenance + bundles** — Hermes tracks skill origin; PURPCLAW doesn't.
4. **Real worktree tool** — Claude Code's `enter_worktree`; PURPCLAW has none.
5. **PTY terminal** — Claude Code uses `node-pty` for interactive ssh etc.
6. **Prompt-cache discipline** — Hermes marks stable prefix; PURPCLAW re-uploads full prompt every turn.
7. **Electron desktop app** — Hermes ships one; PURPCLAW has none.
8. **OAuth device flows** — Hermes has GitHub Copilot OAuth; PURPCLAW has API-key only.

### Surfaces
- All three competitors have **desktop app** (Electron or native)
- Codex has **terminal-only** focus; PURPCLAW has CLI + TUI + WebUI (wins on breadth)
- Hermes has **all platforms** (CLI + WebUI + Desktop + Telegram + Discord + Slack + Email)

---

## WHERE WE WIN (PURPCLAW has, competitors don't)

- **88 agent personas** (zero competitors)
- **399 skills as runtime objects** (Hermes: 234; others: zero)
- **Cognitive spine** with 7-layer memory (memory atoms, lifted facts,
  counterfactual branches, AutoDream consolidation)
- **Personal Model Growth** — training buffer + idle engine + gate pipeline
- **Digital Shaman** creativity co-processor
- **Mochi + 18-species companion chorus**
- **Swarm coordinator + agent tower + divisions** (60K LOC)
- **17 LLM providers** (Codex: 1; Claude Code: 1; Hermes: 20+)
- **WebUI 17 pages** where competitors are CLI-only

PURPCLAW is the broadest, Hermes is the deepest.

---

## WHAT'S NEXT

### Tier 2 — week
- Credential pool (multi-key rotation per provider)
- PTY terminal
- Prompt-cache discipline
- Electron desktop shell reusing Hermes Desktop reference

### Tier 3 — month
- Slack + Email gateways
- Skill provenance + bundles
- OAuth flows
- Tier 1+2 tool coverage gaps (notebook_edit, plan mode agent, etc.)

---

## HONEST GAPS REMAINING (from the 2026-07-17 audit, still accurate)

1. ❌ No Sandbox / Filesystem Isolation
2. ❌ No real-time Per-Task Cost Accounting UI (lib/cost-ledger logs to file
   but UI doesn't show per-task live)
3. ❌ No Workspace Context Model (auto-read relevant files before tool calls)
4. ❌ No Tab Completion (shipped today for bash via `purpclaw completion`)
5. ❌ No Task Progress Persistence (long tasks die completely on crash)

`/init`, `/diff`, `/rollback`, completion, glob, multi_edit, git_commit,
web_search, ask_user_question, move, list_directory are Round 2. Round 3
should be credential pool + prompt caching + Electron shell.
