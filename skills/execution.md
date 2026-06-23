# skills/execution.md — Execution Skill

## When to use
Use this skill when you have a clear task and need to execute it correctly.

## Execution protocol

### Step 1 — Verify preconditions
- Read `divisions/<div>/AGENTS.md` for the current division
- Read `skills/routing.md` to confirm routing
- Check `divisions/<div>/memory/pickup-<div>.md` for any in-progress state

### Step 2 — Execute
- Perform the task
- Log all significant decisions to `divisions/<div>/memory/handoff-<div>.md`
- Never leave mid-task without a handoff

### Step 3 — Verify output
- Check the output is complete and correct
- If incomplete, note what is missing in the handoff

### Step 4 — Handoff
- Write `divisions/<div>/memory/handoff-<div>.md`
- Include: state, progress, decisions, open_tasks, next_moves

## Output format

```
## Handoff: <Division>

**State:** <current state>
**Progress:** <what was done>
**Decisions:** <key decisions made>
**Open Tasks:** <N tasks remaining>
**Next Moves:** <what the next agent should do>
**Blockers:** <anything blocking progress>
```

---

*Execution Skill — built 2026-06-19*
