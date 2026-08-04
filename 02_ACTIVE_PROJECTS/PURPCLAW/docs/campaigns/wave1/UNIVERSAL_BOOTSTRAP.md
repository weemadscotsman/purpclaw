# PURPCLAW Multi-CLI Gauntlet Bootstrap

## OVERVIEW
This is the universal campaign prompt used by all 9 PURPCLAW Wave 1 CLI slots.
Each slot sets `CLI_SLOT=N` (0–8) to activate its specific role and constraints.

## CAMPAIGN: Wave 1 — Canonical Runtime

**Objective:** Make PURPCLAW's canonical runtime bootable, persistent,
permission-governed, and controlled by genuine provider settings.

**Governance:** `docs/parity/WAVE1_CAMPAIGN_GOVERNANCE.md`
**Canonical parity authority:** `docs/parity/CANONICAL_PARITY_PRIORITY.md`
**Audit evidence:** `docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md`
**Campaign state:** `.purpclaw/CAMPAIGN_STATE.md`

---

## NINE FIXED ROLES

| Slot | Role | Reasoning |
|------|------|-----------|
| 0 | Chief, decomposition, worktrees, integration | Max/Ultra |
| 1 | Runtime-audit verifier | Standard/High |
| 2 | P0-A persistence Builder | High |
| 3 | P0-A blind critic | High |
| 4 | P0-B permissions Builder | High |
| 5 | P0-B blind critic | High |
| 6 | P0-C provider-routing Builder | High |
| 7 | P0-C blind critic | High |
| 8 | Final conformance critic | Max/Ultra |

---

## RESOURCE BUDGET POLICY

Child agents do not inherit the parent agent's reasoning mode.

**Privileged roles** (only these may use Max/Ultra):
- Slot 0 chief: decomposition, dependency decisions, conflict resolution, final campaign decisions
- Main architecture / integration agents (any slot doing cross-component work)
- Slot 8 final conformance critic

**Default subagent policy:**
- File discovery, grep, inventory, status checks: Standard model, Low/Standard reasoning
- Documentation cleanup, mechanical edits: Standard model, Standard reasoning
- Focused feature implementation: Standard/strong coding model, High reasoning
- Unit-test writing, ordinary code review: Standard model, Standard or High reasoning
- Blind critic for one isolated component: Strong model, High reasoning
- Architecture investigation across several systems: Strong model, High reasoning

**Escalation rule:**
- A subagent may NOT select Max/Ultra for itself
- Escalation requires the chief to record: exact problem, evidence from previous attempt,
  why Standard/High was insufficient, specific next task
- Escalate only that task, not the entire agent lane

**Limits:**
- Maximum one Max/Ultra subagent running at a time
- No Max/Ultra for: repository scans, summaries, formatting, test execution, file copying,
  Git inspection, or documentation
- Critics inspect evidence; they do not rewrite the builder's explanation
- Prefer several small Standard/High tasks over one enormous Max/Ultra task

---

## WORKTREE ISOLATION

Each role works on its own Git branch. Branches must not overlap in writable files.

| Slot | Branch name |
|------|-------------|
| 0 | `main` (chief — coordinates only) |
| 1 | `audit/runtime-verification` |
| 2 | `fix/p0a-persistence` |
| 3 | `critic/p0a-blind` |
| 4 | `fix/p0b-permissions` |
| 5 | `critic/p0b-blind` |
| 6 | `fix/p0c-provider-routing` |
| 7 | `critic/p0c-blind` |
| 8 | `集成/conformance-final` |

**Rule:** If your worktree already has changes from a prior run, `git stash` before
starting new work. Always check `git status` and `git diff --name-only` before staging.

---

## EXCLUSIVE WRITABLE PATHS

Each slot may only modify files within its authorised scope. Read the Builder brief
for your slot before beginning.

| Slot | Exclusive writable paths |
|------|------------------------|
| 2 | `lib/session-repository.js`, `lib/agent-loop.js`, session tests |
| 3 | Critic only — no file modifications |
| 4 | `unified_api.js`, `lib/mcp-server.js`, `lib/tool-runtime.js`, denial tests |
| 5 | Critic only — no file modifications |
| 6 | `lib/llm-provider.js`, `lib/runtime/provider-config.js`, `app/settings/page.tsx`, `lib/commands/provider.js` |
| 7 | Critic only — no file modifications |
| 8 | All above — integration only |

---

## ACCEPTED WORK ORDER

P0-A → P0-B → P0-C → integration

Each P0 has three phases:
1. Builder brief (written by chief)
2. Builder executes
3. Blind critic verifies

A P0 is NOT complete until the blind critic returns PASS.
Do not begin the next P0 until the current one passes.

---

## CRITIC HANDOFF PROTOCOL

**Builder → Critic handoff requires:**
1. Builder commits its changes
2. Builder writes a clean summary: what changed, why, what was tested
3. Builder provides: commit SHA, diff, test output, evidence
4. **Builder does NOT provide:** opinions, interpretations, self-assessments

**Critic receives:**
1. Original Builder brief
2. Acceptance criteria
3. Commit SHA
4. Raw diff (not Builder's interpretation of it)
5. Raw test evidence

**Critic must NOT receive:**
- Builder's explanation or reasoning
- Self-review or self-assessment
- Priority reordering proposals

**Critic verdict:** PASS / FAIL / BLOCKED — with exact evidence.

---

## PRE-EXISTING BLOCKERS

These are KNOWN defects that are NOT part of the current P0 work. If they block
your tests, record as `BLOCKED_BY_PREEXISTING_RUNTIME_DEFECT` and continue
with what can be isolated.

1. `lib/session-store.js` has no `createSession` — `work-engine.js:88` calls it.
   Use `purpclaw ask --new` as workaround. Pre-existing structural gap, not P0-A.
2. 16 duplicate implementations in the codebase (audit finding, separate P0).

---

## CAMPAIGN STATE

Before starting work, read `.purpclaw/CAMPAIGN_STATE.md`.
After completing work, append to it:
- Role, model, reasoning tier, task, status, escalation reason (if any)
- Commit SHA
- What was verified

---

## ENVIRONMENT

```bash
cd E:/god\ folder/02_ACTIVE_PROJECTS/PURPCLAW
git checkout <your-branch>
```

---

## YOUR SLOT

Set `CLI_SLOT=<your-slot-number>` at the top of your session.
Read `.purpclaw/CAMPAIGN_STATE.md` and your Builder brief before beginning.

**Chief (Slot 0):** Co-ordinates only. Does not write implementation code.
**Builders (Slots 2, 4, 6):** Execute only their P0. No feature parity work.
**Critics (Slots 3, 5, 7, 8):** Verify only. No file modifications.
**Runtime-audit verifier (Slot 1):** Audit runtime state. Report only.

---

*Generated 2026-07-29. Governance: docs/parity/WAVE1_CAMPAIGN_GOVERNANCE.md*
