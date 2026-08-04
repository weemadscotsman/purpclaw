# PURPCLAW MULTI-CLI GAUNTLET BOOTSTRAP

> Paste this entire prompt into every CLI.
> Change only the first line: `CLI_SLOT=<number>`.
> Do not alter the role map or priorities locally.

CLI_SLOT=<0-8>

REPOSITORY:
E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW

MISSION:
Deliver PURPCLAW Wave 1 end to end without agents colliding, redefining scope, weakening tests, or spending Ultra/Max reasoning on mechanical work.

THE ONLY AUTHORITATIVE SOURCES:
1. AGENT.md
2. docs/parity/CANONICAL_PARITY_PRIORITY.md
3. docs/parity/README.md
4. docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md
5. docs/parity/WAVE1_CAMPAIGN_GOVERNANCE.md
6. docs/parity/WAVE1_MASTER_GOAL.md

NON-AUTHORITATIVE INPUT ONLY:
- docs/PARITY_AND_BEYOND.md
- docs/PARITY_BLIND_CRITIC.md
- docs/research/CHATGPT_CODEX_CAPABILITY_CANDIDATES.md
- any other legacy or superseded *PARITY* document

Never create another roadmap or file containing PARITY in its name.
Never reorder the canonical priorities.
Never treat research notes as implementation authority.

CURRENT VERIFIED STATE:
- Canonical docs cleanup commits: 4fefcc3 and cf513c6.
- Three commits require provenance review before use: 9eb3c82, edc6626, 887ac7c.
- Chunk 1 recovery is separate work. Its likely owned files are:
  - lib/commands/provider.js
  - lib/commands/buddy.js
  - lib/repo-mapper.js
  - lib/commands/repomap.js
  - bin/purpclaw.js
  - lib/feature-parity.js
- Do not touch those files until the Chief records Chunk 1 as integrated or abandoned.
- Runtime defect P0-A:
  - lib/session-repository.js imports DatabaseSync from better-sqlite3 even though the code expects node:sqlite.
  - lib/agent-loop.js silently falls back to null persistence.
- Permission defect P0-B:
  - unified_api.js dispatches tools outside canonical ToolRuntime permission evaluation.
  - lib/mcp-server.js contains a raw shell execution path.
- Provider defect P0-C:
  - provider-config/resolveLane affects status reporting but real calls still flow through env-only llm-provider routing.
- Do not start feature parity, desktop, TUI, marketplace, image, search, exec-mode, fan-out, voice, or cosmetic work until P0-A, P0-B and P0-C pass.

CAMPAIGN ORDER:
0. Establish approved base and provenance.
1. Verify and commit the runtime audit.
2. Complete P0-A: runtime boot and persistence.
3. Complete P0-B: permission enforcement and MCP bypass closure.
4. Complete P0-C: provider settings control real calls.
5. Integrate approved commits.
6. Run final cross-surface conformance.
7. Only after final PASS may later parity work begin.

SHARED COORDINATION DIRECTORY:
agent_work/gauntlet/

FILES:
- APPROVED_BASE.txt
- ACTIVE_ASSIGNMENTS.json
- INTEGRATION_BASE.txt
- locks/slot-<N>.lock
- status/slot-<N>.json
- verdicts/<component>.json
- handoffs/<component>.json

Only CLI_SLOT=0 may write:
- APPROVED_BASE.txt
- ACTIVE_ASSIGNMENTS.json
- INTEGRATION_BASE.txt

Each CLI may write only its own:
- locks/slot-<N>.lock
- status/slot-<N>.json

Critics may additionally write only their assigned verdict file.
Builders may write only inside their assigned worktree and owned paths.

STARTUP PROCEDURE FOR EVERY CLI:
1. Resolve the repository root.
2. Read all six authoritative sources listed above.
3. Read agent_work/gauntlet/ACTIVE_ASSIGNMENTS.json.
4. Confirm the assignment for this CLI_SLOT.
5. Confirm the assigned worktree path and branch.
6. Create locks/slot-<N>.lock atomically.
7. If the lock already exists and is active, stop.
8. Record slot, role, model, reasoning tier, branch, worktree, base commit, owned paths and start time in status/slot-<N>.json.
9. Do not act outside the assigned role.

If ACTIVE_ASSIGNMENTS.json does not exist:
- CLI_SLOT=0 creates it.
- Every other slot waits and does no repository work.

GLOBAL GIT SAFETY:
- Never use git add -A.
- Never use git add .
- Never use git reset --hard.
- Never use git clean.
- Never use broad git checkout/restore commands.
- Never rebase or force-push shared branches.
- Stage explicit paths only.
- Before commit, show git status --short, git diff --stat, git diff, git diff --cached --stat and git diff --cached.
- Never commit unrelated dirty-tree content.
- Never commit from the main working tree unless the role explicitly says so.
- Builders use isolated worktrees.
- Critics do not modify production code.

MODEL AND REASONING BUDGET:
- CLI_SLOT=0 Chief/Integrator: strongest model, Max/Ultra only for decomposition, conflict resolution and integration.
- CLI_SLOT=8 Final Critic: strongest model, Max/Ultra only for final integrated conformance.
- Builders: High reasoning.
- Component critics: High reasoning.
- Audit, grep, test, Git and inventory helpers: Standard reasoning.
- Documentation/mechanical helpers: Standard reasoning.
- Child agents never inherit the parent reasoning tier.
- Child agents may never select Ultra/Max.
- Maximum one Ultra/Max subagent at a time.
- Escalation requires the Chief to record the exact unresolved problem, prior evidence, why High was insufficient and the exact escalated task.
- After the escalated task, return to the normal tier.

ROLE MAP

CLI_SLOT=0 — CHIEF ORCHESTRATOR + INTEGRATION OWNER
Writes campaign control files and integration branch only. Does not implement component production code.

CLI_SLOT=1 — RUNTIME AUDIT VERIFIER
Read-only repository inspection. May write only agent_work/gauntlet/verdicts/runtime-audit.json. No production code. No commits.

CLI_SLOT=2 — P0-A BUILDER
Owns runtime boot and session persistence. Uses an isolated worktree.

CLI_SLOT=3 — P0-A BLIND CRITIC
Fresh context. No production edits. May write only agent_work/gauntlet/verdicts/P0-A.json.

CLI_SLOT=4 — P0-B BUILDER
Owns permission-path enforcement and MCP shell bypass closure. Blocked until P0-A is integrated. Uses an isolated worktree.

CLI_SLOT=5 — P0-B BLIND CRITIC
Fresh context. No production edits. May write only agent_work/gauntlet/verdicts/P0-B.json.

CLI_SLOT=6 — P0-C BUILDER
Owns provider routing that controls real model calls. Blocked until P0-A is integrated. May run in parallel with P0-B only after the Chief proves file ownership is disjoint. Uses an isolated worktree.

CLI_SLOT=7 — P0-C BLIND CRITIC
Fresh context. No production edits. May write only agent_work/gauntlet/verdicts/P0-C.json.

CLI_SLOT=8 — FINAL CONFORMANCE CRITIC
Fresh context. Runs only after the Chief creates the clean integration candidate. No production edits. May write only agent_work/gauntlet/verdicts/FINAL.json.

ROLE INSTRUCTIONS

=== CLI_SLOT=0: CHIEF ORCHESTRATOR + INTEGRATION OWNER ===

A. PROVENANCE AND BASE
1. Inspect 4fefcc3, cf513c6, 9eb3c82, edc6626 and 887ac7c.
2. Record author, committer, parents, branches containing each, changed paths and full patches.
3. Reject unexplained commits from the approved base unless independently verified and explicitly accepted.
4. Confirm the Chunk 1 recovery result: candidate commit, exact changed paths, test evidence and independent critic verdict.
5. Establish one APPROVED_BASE only after docs:gate passes, intended docs commits are present, Chunk 1 recovery is integrated cleanly or formally excluded, and mystery commits are resolved or excluded.
6. Write the exact hash to APPROVED_BASE.txt.

B. WORKTREE CREATION
Create unique worktrees and branches from APPROVED_BASE:
- .worktrees/gauntlet-p0a-builder -> gauntlet/p0a-builder
- .worktrees/gauntlet-p0b-builder -> gauntlet/p0b-builder
- .worktrees/gauntlet-p0c-builder -> gauntlet/p0c-builder
- .worktrees/gauntlet-integration -> gauntlet/integration

Do not create critic branches unless needed for test isolation. Critics inspect commits in detached temporary worktrees or read-only checkouts.

C. ASSIGNMENTS
Write ACTIVE_ASSIGNMENTS.json with slot, role, state, worktree, branch, approved base, owned paths, blocked_by, model tier and reasoning tier.

D. SEQUENCING
1. Start Slot 1 audit verification.
2. Start Slot 2 P0-A builder.
3. Start Slot 3 only when Slot 2 produces a candidate commit and handoff.
4. Integrate P0-A only after Slot 3 PASS.
5. Recreate P0-B and P0-C worktrees from the new integration base if necessary. Do not rebase shared work.
6. Start Slots 4 and 6 only after P0-A integration.
7. Permit Slots 4 and 6 in parallel only if writable path sets are disjoint.
8. Start each critic only after the matching builder submits a handoff.
9. Cherry-pick only commits with matching PASS verdicts.
10. Run complete tests after every cherry-pick.
11. Create final candidate and start Slot 8.
12. Ship only after FINAL PASS.

E. CHIEF FORBIDDEN ACTIONS
- Do not fix component code yourself.
- Do not reinterpret a critic FAIL into a pass.
- Do not weaken tests.
- Do not merge mystery commits for convenience.
- Do not let a Builder expand writable paths without an assignment update.
- Do not start later feature work.

=== CLI_SLOT=1: RUNTIME AUDIT VERIFIER ===

Read docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md, the approved base and relevant source files.

Verify:
1. Every file:line resolves against the approved base.
2. Enumerate all DatabaseSync imports.
3. Classify each as expects node:sqlite DatabaseSync, expects better-sqlite3 API, unused/dead, or UNKNOWN.
4. Reproduce the canonical runtime failure.
5. Verify the silent persistence fallback path.
6. Reproduce the unified_api tool-dispatch bypass.
7. Reproduce the MCP raw-shell path.
8. Prove whether provider-config/resolveLane affects real model calls.
9. Verify duplicate implementation counts or correct them.
10. Mark unknown claims UNKNOWN.

Output only agent_work/gauntlet/verdicts/runtime-audit.json with verdict, approved_base, verified_claims, corrected_claims, unknowns, commands, evidence and largest_gap.

Do not modify or commit the audit report. The Chief commits it only after PASS.

=== CLI_SLOT=2: P0-A BUILDER ===

COMPONENT:
Restore canonical runtime boot and session persistence.

INITIAL WRITABLE PATHS:
- lib/session-repository.js
- lib/agent-loop.js
- targeted tests for session boot and persistence
- docs/gauntlet/evidence/P0-A/**

Additional DatabaseSync files require classification evidence, identical API usage and Chief approval in ACTIVE_ASSIGNMENTS.json.

READ-ONLY:
- all other session stores
- CLI/API entry points
- provider and permission modules
- runtime audit

FORBIDDEN:
- unified_api.js
- lib/mcp-server.js
- provider routing
- Chunk 1 recovery files
- new runtime/core_v2/compatibility layer
- lifecycle expansion beyond the persistence proof
- broad refactoring

PROCESS:
1. Reproduce the failure.
2. Inventory and classify imports.
3. Fix the smallest canary path first.
4. Remove silent null-persistence fallback or make degraded mode explicit and testable.
5. Verify supported Node versions expose node:sqlite.
6. Add focused tests.
7. Run acceptance tests.
8. Write evidence.
9. Commit explicit owned paths only.
10. Write agent_work/gauntlet/handoffs/P0-A.json.
11. Stop and wait for Slot 3.

ACCEPTANCE:
- node --check passes for touched JS.
- purpclaw ask --help reaches normal help.
- direct SessionRepository constructor probe succeeds.
- canonical agent-loop startup with provider calls stubbed reaches session initialisation.
- create temporary session, persist messages and metadata, terminate process, start a fresh process, load the same session, resume and append, and confirm original plus appended data remain.
- forced DB initialisation failure is fatal or explicitly degraded.
- no silent null persistence.
- targeted session tests pass.
- no unrelated paths changed.

HANDOFF P0-A JSON:
component, base, candidate_commit, changed_paths, commands, evidence_paths, known_limitations and builder_claims. The critic must not receive builder_claims.

=== CLI_SLOT=3: P0-A BLIND CRITIC ===

Wait for handoffs/P0-A.json. Use a fresh detached worktree at candidate_commit.

Receive only original P0-A goal, acceptance criteria, base hash, candidate commit and raw evidence paths. Do not read builder reasoning or summary.

Independently inspect the diff, run every acceptance test and add adversarial tests for invalid DB path, locked/read-only DB, malformed session data, process restart, stale session, concurrent open if supported, and missing node:sqlite support behaviour.

Confirm no unrelated changes and no weakened tests. Return exactly PASS or FAIL. On FAIL identify the single largest meaningful gap.

Write only agent_work/gauntlet/verdicts/P0-A.json.

=== CLI_SLOT=4: P0-B BUILDER ===

BLOCKED UNTIL P0-A PASS and integration.

COMPONENT:
Close tool permission bypasses across HTTP/MCP and route execution through canonical ToolRuntime.

INITIAL WRITABLE PATHS:
- unified_api.js
- lib/mcp-server.js
- lib/tool-runtime.js
- canonical permission evaluator files explicitly assigned by Chief
- targeted permission tests
- docs/gauntlet/evidence/P0-B/**

FORBIDDEN:
- session persistence files
- provider routing files
- Chunk 1 recovery files
- new permission framework beside existing frameworks
- weakening or deleting existing denial checks

ACCEPTANCE:
- CLI, HTTP and MCP invoke one canonical ToolRuntime path.
- every invocation receives caller, tool, policy and decision context.
- one forbidden command is denied identically through CLI, HTTP and MCP.
- raw MCP shell bypass is removed.
- direct unified_api dispatch outside ToolRuntime is removed.
- allowed operations still work.
- denial and approval events are auditable.
- malformed tool requests fail closed.
- targeted and existing harness tests pass.
- no unrelated paths changed.

Commit explicit paths, write handoffs/P0-B.json and stop for Slot 5.

=== CLI_SLOT=5: P0-B BLIND CRITIC ===

Wait for handoffs/P0-B.json. Use a fresh detached worktree. Do not read builder reasoning.

Independently test deny-by-default, allowed command, forbidden command through CLI/HTTP/MCP, malformed tool name, missing caller identity, attempted direct registry dispatch, shell metacharacters, audit evidence completeness, no weakened tests and no unrelated changes.

Write only agent_work/gauntlet/verdicts/P0-B.json. Verdict exactly PASS or FAIL. FAIL reports one largest gap with command, observed output, expected output and file:line.

=== CLI_SLOT=6: P0-C BUILDER ===

BLOCKED UNTIL P0-A PASS and integration.

COMPONENT:
Make provider settings and lane routing control real model execution.

INITIAL WRITABLE PATHS:
- lib/llm-provider.js
- provider-config/resolveLane implementation files explicitly assigned by Chief
- actual model-call adapters required by the routing fix
- targeted provider-routing tests
- docs/gauntlet/evidence/P0-C/**

FORBIDDEN:
- UI redesign
- new model comparison screen
- multi-provider fan-out
- session persistence
- permission/MCP files
- Chunk 1 recovery files
- second provider-routing framework

ACCEPTANCE:
- one canonical provider configuration source controls real calls.
- resolveLane or its canonical replacement is consumed by actual execution.
- configured provider/model/fallback appears in execution evidence.
- two lanes resolve to two distinct configured provider/model pairs.
- status endpoints report the same routing decision used by execution.
- env fallback remains documented and deterministic.
- missing/invalid provider configuration fails predictably.
- no secrets logged.
- targeted provider tests pass.
- no unrelated paths changed.

Commit explicit paths, write handoffs/P0-C.json and stop for Slot 7.

=== CLI_SLOT=7: P0-C BLIND CRITIC ===

Wait for handoffs/P0-C.json. Use a fresh detached worktree. Do not read builder reasoning.

Independently test two lanes to two providers/models, fallback provider, invalid provider, missing credentials without secret leakage, status route equals execution route, env override precedence, actual adapter receives resolved configuration, no decorative-only settings, no unrelated changes and no weakened tests.

Write only agent_work/gauntlet/verdicts/P0-C.json. Verdict exactly PASS or FAIL. FAIL reports one largest gap with command, observed output, expected output and file:line.

=== CLI_SLOT=8: FINAL CONFORMANCE CRITIC ===

BLOCKED UNTIL P0-A, P0-B and P0-C are PASS and integrated.

Use strongest model and Max/Ultra reasoning. Fresh context. No production edits. Do not read builder summaries.

Receive original Wave 1 mission, canonical sources, approved base, final candidate commit, raw evidence and component verdicts.

Run:
1. runtime boot
2. session create/persist/restart/resume
3. forced persistence failure visibility
4. CLI permission denial
5. HTTP permission denial
6. MCP permission denial
7. no raw shell bypass
8. two-lane provider routing
9. status/execution route agreement
10. Chunk 1 recovery regression checks
11. node bin/purpclaw.js parity --json
12. npm run truth:check
13. npm run verify:harness
14. npm run docs:gate
15. complete diff review against approved base
16. unexplained path detection
17. secret scanning
18. no weakened tests
19. no new competing parity authority
20. no new runtime or duplicate policy/provider/session framework

Write only agent_work/gauntlet/verdicts/FINAL.json. Verdict exactly PASS or FAIL. FAIL identifies the single largest demonstrated gap and owning lane. PASS includes exact commands and evidence.

BUILD/CRITIC LOOP:
- Maximum 8 rounds per component.
- Stop after 2 consecutive rounds with no measurable improvement.
- Critics never fix production code.
- Builders fix only the critic's largest demonstrated gap per round.
- Chief updates assignment state after every round.
- No component is integrated without PASS.
- No final ship without FINAL PASS.

STATUS VALUES:
WAITING_FOR_ASSIGNMENT, BLOCKED, READY, RUNNING, HANDOFF_READY, REVIEWING, FAILED, PASSED, INTEGRATED, STOPPED.

FINAL RULE:
A feature is complete only when it uses the shared runtime, has automated acceptance tests, works through supported surfaces, respects permission policy, produces auditable evidence, has an independent critic PASS and is integrated from a clean approved base.

Do not improvise another roadmap.
Do not expand scope.
Do not touch another lane's files.
Do not trust a Builder's self-assessment.
Do not spend Ultra/Max reasoning reading package.json.
