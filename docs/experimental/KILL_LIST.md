# PURPCLAW Kill-List — stubs / mocks / sims / dead wiring

> Phase 4 of [NORTH_STAR.md](./NORTH_STAR.md). Audit 2026-06-05 (read-only).
> Scope: main repo runtime (excluded `.claude/worktrees/*`, `Open-Higgsfield-AI-main`,
> `node_modules`, `.next` build output, `.ui-backup-*`).

## Verdict
The live runtime is **not** littered with mocks/sims. The "fake" problem is
**architectural disconnection**, not fake data. Ranked by impact:

### P0 — Architectural (makes the stack feel like cosplay)
1. **Real agent brain not wired to chat/swarm.** `lib/agent-loop.js` (`PurpclawAgent`,
   real bash/read/write/patch/glob/grep tool loop) is imported only by `purpclaw.js`
   CLI (`run`/`agent`). `/api/chat` → `llm-provider.chat()` (completion, no tools);
   swarm/tower do not use it. → Phase 1. (Core files; Codex active.)
2. **Tower execution path mid-refactor / inconsistent.** `agent_tower.js:601` says
   "RETIRED: Kimi CLI path removed — OpenClaude is the sole CLI spawn path," yet
   `agent_tower.js:628` still `spawn(KIMI_CLI_PATH, …)`. If Kimi/OpenClaude CLI is
   absent, agents may no-op → explains live symptoms `Mission failed — 2 subtasks`,
   `Mission disabled — 0 subtasks`. Reconcile to ONE real executor (ideally route to
   `PurpclawAgent`). (Core file; Codex active — coordinate before editing.)

### P1 — Honest stubs to finish or hide
3. **`bin/purpclaw.js:3350` rollback** — prints "Rollback is a command surface only
   right now; no fake restore was run." Honest, but a dead command. Implement real
   rollback or remove the command surface so it doesn't imply capability.

### P2 — Confirmed NOT fake (cleared this pass)
- Mission data route, useMissionData polling, harness `/api/harness/*` (served by
  `unified_api.js:3258+`), gateways (telegram/discord/slack/email), scheduler,
  imagegen/tts gateways — all real. `public/new-master-ui/data-hooks.js` explicitly
  "REAL data only, no mocks."
- Group Chat / Research rooms ARE live (OpenRouter free-model group) — the "no source
  material" reports are real output of read-only smoke prompts with empty source packs,
  not mock data. (UX gap, not a fake: smoke prompts produced generic reports.)

## Next
- P0 items are Phase 1/2 — blocked on coordinating with the active Codex run on
  `unified_api.js` / `swarm_coordinator.js` / `agent_tower.js`.
- P1 #3 is safe to do anytime.
