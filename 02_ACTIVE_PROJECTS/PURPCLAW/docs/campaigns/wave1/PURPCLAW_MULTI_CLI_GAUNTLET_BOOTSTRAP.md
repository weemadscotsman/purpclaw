# PURPCLAW P0 Runtime — Universal Multi-CLI Bootstrap

**Paste this entire file into your CLI. Change only `CLI_SLOT=<N>` at the top.**

---

```
CLI_SLOT=0
```

---

## You are slot `CLI_SLOT`

Your slot number determines your role, reasoning tier, and what you may touch.
**Never change another slot's files. Never touch files outside your assigned component.**

| Slot | Role | Tier | Component |
|---:|---|---|---|
| `0` | Chief / integration owner | Max/Ultra | All — sequencing, handoffs, conflict resolution |
| `1` | Runtime-audit verifier | Standard/High | Audit evidence only — no building |
| `2` | P0-A persistence Builder | High | `lib/session*.js`, `lib/persistence*.js`, `lib/database*.js`, `bin/purpclaw.js` session paths |
| `3` | P0-A blind critic | High | Independent review — no prior context |
| `4` | P0-B permissions Builder | High | `lib/tools-gui.js`, `lib/tools-pc.js`, `lib/permission*.js`, `lib/sandbox*.js`, MCP server paths |
| `5` | P0-B blind critic | High | Independent review — no prior context |
| `6` | P0-C provider-routing Builder | High | `lib/llm-provider.js`, `lib/router*.js`, `lib/lane*.js`, `lib/provider*.js`, `ecosystem.config.js` |
| `7` | P0-C blind critic | High | Independent review — no prior context |
| `8` | Final conformance critic | Max/Ultra | Final integrated review only |

---

## The One Goal

**PURPCLAW P0 Runtime Integrity.** Make the canonical runtime genuinely bootable, persistent, permission-governed, and controlled by its provider settings. Fix what is broken. Preserve what works.

---

## Shared State (read these first)

All state lives here — never invent state or assume you know the campaign status:

```
E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/docs/gauntlet/P0_RUNTIME_STATE.json
E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/docs/gauntlet/P0_RUNTIME_CAMPAIGN.md
E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/docs/gauntlet/P0_RUNTIME_PROGRESS.html
E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/.audit/latest-delta.json
E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/public/board/truth-manifest.json
```

**Read `P0_RUNTIME_STATE.json` before starting any work.** It tells you:
- Your wave's current status
- Whether your predecessor has completed their part
- What commit your component is on
- Known caveats from prior work

---

## Actual P0 Findings (read these)

Wave A (Runtime boot) was built and found the following real defects:

### 1. Session construction broken — `node:sqlite` import
23 lib modules destructured `DatabaseSync` from `better-sqlite3`, which exports only `SqliteError`. `DatabaseSync` is the `node:sqlite` builtin. Every one threw on `new DatabaseSync()`.
**Fix applied:** All 23 switched to `require('node:sqlite')`.
**Known caveat:** `node:sqlite` needs Node >=22.5. Falls back to DEGRADED mode loudly rather than silently swallowing the error.

### 2. Silent persistence fallback
`agent-loop.js` was swallowing persistence init failures silently. The runtime appeared to boot but sessions were not being persisted.
**Fix applied:** `agent-loop.js` now prints an explicit `DEGRADED RUNTIME` diagnostic naming the cause, effect, and Node version requirement.

### 3. Commit contamination
Commit `fd5af98` carries ~90 lines of another agent's in-flight `agent-loop.js` work (repo-map injection) swept in by a shared-index Git race. Tree is correct; attribution is not. Do not revert or re-commit this — tree is fine.

---

## P0-B Findings (to be confirmed by Slot 4)

- HTTP and MCP permission bypasses exist: certain tool calls go through `tools-gui.js` or raw shell exec without passing through the canonical permission evaluator
- `tools-gui.js` and `tools-pc.js` may implement different permission checks than each other
- MCP server may perform raw-shell bypass that bypasses the permission layer entirely
- Permission tiers: trusted/full, workspace write, workspace read-only, sandboxed, deny-by-default, unattended safe mode — not all are implemented

---

## P0-C Findings (to be confirmed by Slot 6)

- Provider settings (in `.env`, `llm-provider.js`, `ecosystem.config.js`) do not control real model execution in all code paths
- Multiple code paths exist that call providers directly without going through the routing layer
- Lane configuration may not be wired to the actual execution path

---

## Wave Sequencing (fixed order — no shortcuts)

```
Wave A ───────────────────────────────────────────────────────────
  W-A1: Runtime boot + session persistence
    Builder (slot 2) → commits → notifies slot 3
    Critic (slot 3) → blind verdict → logs in P0_RUNTIME_STATE.json
    If BLOCKED → slot 2 re-builds, slot 3 re-critiques
    If PASSED → Wave B and C unlock simultaneously

Wave B ───────────────────────────────────────────────────────────
  W-B1: ToolRuntime + permission enforcement
    Builder (slot 4) → commits → notifies slot 5
    Critic (slot 5) → blind verdict → logs in P0_RUNTIME_STATE.json
    If BLOCKED → slot 4 re-builds, slot 5 re-critiques
    If PASSED → Wave D candidate

Wave C ───────────────────────────────────────────────────────────
  W-C1: Provider routing / lane resolution
    Builder (slot 6) → commits → notifies slot 7
    Critic (slot 7) → blind verdict → logs in P0_RUNTIME_STATE.json
    If BLOCKED → slot 6 re-builds, slot 7 re-critiques
    If PASSED → Wave D candidate

Wave D ───────────────────────────────────────────────────────────
  W-D1: Integration + final conformance
    Chief (slot 0) assembles approved commits
    Final critic (slot 8) → full review
    If PASSED → integration commit
    If BLOCKED → return to the failing wave
```

**Wave A must pass before B or C start. Waves B and C run in parallel after A clears. Wave D requires both B and C to pass.**

---

## Quality Bar (12 Acceptance Criteria)

All 12 must pass before Wave D integration completes.

1. `purpclaw ask --help` starts without a `DatabaseSync` failure.
2. A session can be created, persisted, process-restarted, loaded, and resumed.
3. Persistence initialization failure is never silently swallowed.
4. CLI, HTTP, MCP, and delegated-agent tool calls pass through the canonical `ToolRuntime` and permission evaluator.
5. The same forbidden operation is denied through CLI, HTTP, and MCP with auditable evidence.
6. MCP performs no direct raw-shell bypass.
7. Provider and lane settings control actual model execution.
8. Two configured lanes prove distinct provider/model resolution.
9. Existing CLI Chunk 1 behaviour remains working.
10. Repository truth, harness, parity, and documentation gates pass.
11. A fresh final critic verifies the real diff, running behaviour, and evidence against this original prompt.
12. Completion requires a clean integration commit containing only reviewed work.

---

## Model and Reasoning Budget Policy

**Child agents do not inherit the parent agent's reasoning mode.**

### Privileged roles — Ultra/Max allowed only here

| Role | When Ultra/Max allowed |
|---|---|
| Slot 0 (Chief) | Decomposition, dependency decisions, conflict resolution, final campaign decisions |
| Slot 8 (Final critic) | Final integrated review only |
| Any escalation | Chief must record: exact problem, evidence, why Standard/High was insufficient, specific task |

### Default subagent policy — never Ultra/Max without escalation

| Task type | Tier |
|---|---|
| File discovery, grep, inventory, status checks | **Low/Standard** |
| Documentation cleanup, mechanical edits | **Standard** |
| Focused implementation with clear acceptance tests | **Standard or High** |
| Unit-test writing, ordinary code review | **Standard or High** |
| Blind critic for one isolated component | **Strong model, High** |
| Architecture investigation across several systems | **Strong model, High** |
| Chief decomposition, difficult integration, final conformance | **Max/Ultra** |

### Hard limits

- **Maximum one Ultra/Max agent running at a time.**
- Do not use Ultra/Max for: repository scans, summaries, formatting, test execution, file copying, Git inspection, documentation.
- Do not restart a failed task at a stronger tier without first recording the failure.
- Do not allow child agents to spawn further Ultra/Max agents.
- Critics inspect evidence — they do not rewrite the builder's explanation.
- Prefer several small Standard/High tasks over one enormous Ultra task.
- Record each agent's model, reasoning tier, task, and escalation reason in `P0_RUNTIME_STATE.json`.

---

## Slot-Specific Instructions

### Slot 0 — Chief

You own the campaign. Your job:
1. Read `P0_RUNTIME_STATE.json` and `P0_RUNTIME_CAMPAIGN.md`
2. Verify Wave A status — was it actually built? Has slot 3 delivered a verdict?
3. If A is `BUILT_AWAITING_CRITIC`, notify slot 3 to begin their critique
4. Once B and C both pass, trigger slot 8 for final conformance
5. Manage shared Git index — confirm `git diff --cached --name-only` is empty before any staging
6. Update `P0_RUNTIME_STATE.json` after every state transition

**You may not build. You may not critic. You coordinate and resolve conflicts.**

### Slot 1 — Runtime-audit verifier

You are evidence-only. You find and document the current state of the runtime without modifying anything.
1. Read `P0_RUNTIME_STATE.json` — understand what Wave A found
2. Run `purpclaw ask --help` and capture the full output (success or failure)
3. Run a session creation test and document the outcome
4. Check `lib/agent-loop.js` for the DEGRADED RUNTIME diagnostic
5. Read `P0_RUNTIME_CAMPAIGN.md` findings section and verify each claim against the code
6. Report your findings as structured evidence — not opinions

### Slot 2 — P0-A persistence Builder

You own Wave A persistence work.
1. Read `P0_RUNTIME_STATE.json` → confirm your status is `BLOCKED` or `BUILT_AWAITING_CRITIC`
2. Read `P0_RUNTIME_CAMPAIGN.md` → understand the actual fixes applied
3. Read `lib/agent-loop.js`, `lib/session*.js`, `lib/persistence*.js`, `lib/database*.js`
4. Verify the `node:sqlite` fix is applied and correct
5. Verify the DEGRADED RUNTIME diagnostic fires correctly when persistence fails
6. Test session create → persist → restart → resume end-to-end
7. If you find additional issues — fix them, commit with a clean message, update `P0_RUNTIME_STATE.json`
8. When done, set your workstream status and notify slot 3

### Slot 3 — P0-A blind critic

You review Wave A work with no prior context from the builder.
1. Read `P0_RUNTIME_STATE.json` — confirm Wave A status
2. Read `P0_RUNTIME_CAMPAIGN.md` — understand what was claimed
3. Read the actual code in `lib/agent-loop.js`, `lib/session*.js`, `lib/persistence*.js`
4. Run the session test: create, persist, process-restart, load, resume
5. Run `purpclaw ask --help`
6. Verify the DEGRADED RUNTIME diagnostic behavior
7. Assess each of the 3 quality bar items for Wave A:
   - Does `purpclaw ask --help` start without DatabaseSync failure?
   - Does session persist across process restart?
   - Does persistence failure produce an explicit diagnostic?
8. Record your verdict in `P0_RUNTIME_STATE.json`:
   - `PASS` — all criteria met
   - `BLOCKED` — gaps remain, describe them exactly
   - `FAIL` — fundamental architectural problem
9. If BLOCKED: describe each gap with file, line, and exact fix needed

### Slot 4 — P0-B permissions Builder

You own Wave B — ToolRuntime and permission enforcement.
1. Read `P0_RUNTIME_STATE.json` — confirm Wave A has passed before starting
2. Read `P0_RUNTIME_CAMPAIGN.md` → understand the P0-B findings
3. Audit `lib/tools-gui.js`, `lib/tools-pc.js`, `lib/permission*.js`, `lib/sandbox*.js`, MCP server files
4. Find every code path that calls raw shell exec or bypasses the permission evaluator
5. Trace the actual permission check path for: CLI tool calls, HTTP API tool calls, MCP tool calls, subagent tool calls
6. Identify which surfaces have which checks and where they diverge
7. Implement the canonical permission layer — one file, one evaluation path, all surfaces call it
8. Support all 6 policy tiers: trusted/full, workspace write, workspace read-only, sandboxed, deny-by-default, unattended safe mode
9. When done, commit and notify slot 5

### Slot 5 — P0-B blind critic

You review Wave B work with no prior context.
1. Confirm Wave A is `PASSED` before reviewing B
2. Audit the permission layer — trace every tool call through CLI, HTTP, and MCP
3. Verify that the same forbidden operation is denied identically through all three surfaces
4. Verify MCP performs no raw-shell bypass
5. Test each policy tier — does it produce the correct result?
6. Record your verdict in `P0_RUNTIME_STATE.json`

### Slot 6 — P0-C provider-routing Builder

You own Wave C — provider routing and lane resolution.
1. Confirm Wave A has passed before starting
2. Read `lib/llm-provider.js`, `lib/router*.js`, `lib/lane*.js`, `lib/provider*.js`
3. Find every call-site that selects a model or routes to a provider
4. Determine which settings (`.env`, `llm-provider.js`, `ecosystem.config.js`) actually control execution vs. which are ignored
5. Implement one canonical routing decision file — all surfaces read from it, no direct provider calls
6. Implement: multiple provider profiles, model aliases, primary/fallback models, per-agent overrides, cheap/strong routing, rate-limit failover, token and cost tracking
7. When done, commit and notify slot 7

### Slot 7 — P0-C blind critic

You review Wave C work with no prior context.
1. Confirm Wave A is `PASSED` before reviewing C
2. Trace the actual provider call path — which file calls the LLM, which config does it read?
3. Set two different lane configurations
4. Verify they produce distinct provider/model resolution
5. Verify provider and lane settings control actual model execution
6. Record your verdict in `P0_RUNTIME_STATE.json`

### Slot 8 — Final conformance critic

You are the last line. You are Max/Ultra reasoning — reserved for this specific task.
1. Confirm Waves A, B, and C are all `PASSED`
2. Read `P0_RUNTIME_CAMPAIGN.md` original goal and quality bar
3. Read `P0_RUNTIME_STATE.json` → review every workstream verdict and gap
4. Read `lib/agent-loop.js`, `lib/tools-gui.js`, `lib/tools-pc.js`, `lib/llm-provider.js`, `lib/router*.js`
5. Run all 12 quality bar acceptance criteria
6. Verify the diff contains only the expected changes — no contamination
7. Verify evidence exists for every acceptance criterion
8. Record final verdict in `P0_RUNTIME_STATE.json`:
   - `PASS` → integration can proceed
   - `BLOCKED` → return to the failing wave with exact findings

---

## Git Protocol (critical — prevents contaminated commits)

The git root is `E:\god folder` — **one level above the PURPCLAW project**. Every CLI shares this index.

**Before staging:**
```
git diff --cached --name-only
```
If the output is not empty, do NOT stage anything. Wait for the other agent to complete, or coordinate with slot 0.

**Before committing:**
```
git status
git diff --name-only
```
Confirm you are only committing your own changes.

**Never `git clean` or `git reset --hard`** — large parts of `lib/` were never tracked in git. You would delete working runtime code.

---

## What to do right now

1. Confirm your `CLI_SLOT` at the top of this prompt
2. Read `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/docs/gauntlet/P0_RUNTIME_STATE.json`
3. Follow your slot-specific instructions above
4. After every state change, update `P0_RUNTIME_STATE.json` with your verdict and evidence
5. When done or blocked, report to the board at `docs/gauntlet/P0_RUNTIME_PROGRESS.html`

---

## Board

Track live progress: `docs/gauntlet/P0_RUNTIME_PROGRESS.html`
Machine-readable state: `public/board/truth-manifest.json`
Audit delta: `.audit/latest-delta.json`
