# Campaign State

Required by [`docs/AGENT_RESOURCE_POLICY.md`](../docs/AGENT_RESOURCE_POLICY.md).
Every spawned agent is recorded here: role, model, reasoning tier, task, and
escalation reason if any. Append; do not rewrite history.

## Current campaign: Wave 1 — canonical runtime

| # | Role | Model | Reasoning | Task | Status | Escalation |
|---|------|-------|-----------|------|--------|------------|
| 1 | Documentation agent | inherited (pre-policy) | inherited | Supersede 29 legacy parity docs, add index + authority gate | Done — `4fefcc3` | none |
| 2 | Architecture investigation | inherited (pre-policy) | inherited | Wave 1 unified-runtime audit, no-code no-commit | Done — report uncommitted | none |
| 3 | Component builder | inherited (pre-policy) | inherited | OpenClaude CLI parity Chunk 1 recovery | Running | none |
| 4 | Component critic (blind) | inherited (pre-policy) | inherited | Blind verification of runtime boot fix | Running | none |
| — | Chief (main session) | Opus 5 | session default | Orchestration, P0-A build | Ongoing | n/a |

Agents 1–4 were spawned before this policy existed, so they inherited the
chief's tier. That is the exact waste the policy forbids; recorded rather than
quietly omitted. Every spawn from now on carries an explicit model and a
RESOURCE BUDGET block.

## Commit contamination — 2026-07-29, both directions

The git root is `E:\god folder`, one level above this project, so every agent
on this machine shares ONE index. Two agents cannot stage or commit at the same
time. This is not theoretical; it happened twice in one hour:

- **`fd5af98` (chief) is contaminated.** It added 105 lines to
  `lib/agent-loop.js`; only ~14 are the degraded-runtime diagnostic its message
  describes. The rest is the Chunk 1 agent's repo-map injection plus other
  in-flight work, staged wholesale because `git add <tracked file>` takes the
  whole working-tree state, not the part you wrote. History not rewritten:
  `d3c954b` builds on it and the swept-in code is legitimate and tested by its
  author. Attribution is wrong; the tree is correct.
- **`5259be0`** committed the Chunk 1 agent's in-flight tree from another
  session before that agent was finished.
- The Chunk 1 agent's first commit attempt swallowed two chief files
  (`scripts/validate-docs.js`, `docs/PARITY_BLIND_CRITIC.md`) and undid it with
  `reset --soft`.

RULE GOING FORWARD: only one agent may hold the index at a time. Before staging,
check `git diff --cached --name-only` is empty or contains only your own paths.
Never `git add` a tracked file another agent may be editing — stage a synthetic
blob of HEAD-plus-your-change instead (`git hash-object` + `git update-index`),
which is what the parity cleanup agent did correctly.

## Known concurrency hazard

A second Chunk 1 recovery agent (`deleg_66df8b61`) was dispatched from a Hermes
session with the same brief and the same target files. A third Chunk 1 agent
(`deleg_657ed421`) also ran and completed. Both hit max_iterations. No live
Chunk 1 agent was found at time of addendum delivery — the scope addendum was
written to `.purpclaw/RECOVERY_ADDENDUM.txt` as a persistent pickup point.

## Completed work

| Commit | What | Verified by |
|--------|------|-------------|
| `4fefcc3` | Legacy parity docs superseded + authority gate | `npm run parity:check` |
| `cf513c6` | Track canonical roadmap; unbrittle marker; exempt superseded docs from GATE 8 | `npm run docs:gate` |
| `fd5af98` | Runtime boot: `DatabaseSync` from `node:sqlite` across 23 modules; loud degraded-runtime diagnostic | **VERIFIED PASS** — tests 1-7 all PASS. Session create/persist/restart/resume works via `ask --new`. Note: `session new` CLI command has a pre-existing structural gap (`lib/session-store.js` has no `createSession`; `work-engine.js:88` calls it). Separate from fd5af98. Not a blocker for P0-B/C. |

## 2026-07-29 mid-session record (main session)

| # | Role | Model | Reasoning | Task | Status |
|---|------|-------|-----------|------|--------|
| — | Chief (main session) | Opus 5 | session default | Orchestration, P0-A brief, parity docs recovery | Ongoing |
| 5 | P0-A verifier | Standard | High | End-to-end session persistence verification of fd5af98 | Running — `deleg_7f0e334b` |

Mystery commit provenance resolved: `9eb3c82`, `edc6626`, `887ac7c` are all authored by
`weemadscotsman` and appear on `docs/canonical-parity-cleanup`. The cleanup agent performed
them and disclaimed authorship. Content is legitimate parity cleanup. Branch
`canonical-parity-clean-v2` already has commits `4fefcc3` + `cf513c6` cherry-picked onto
`origin/main`; no further action needed on the merge question.

`docs/research/CHATGPT_CODEX_CAPABILITY_CANDIDATES.md` created as the single research
evidence repository. Self-review noted that the prior "Blind Critic" was not independent
(same session as the research). PARITY_AND_BEYOND.md and PARITY_BLIND_CRITIC.md already
carry SUPERSEDED banners from prior cleanup.

P0-A Builder brief written to `.purpclaw/P0A_BUILDER_BRIEF.md`.

Scope addendum (BLOCKED_BY_PREEXISTING_RUNTIME_DEFECT) delivered to recovery agent
context; written to `.purpclaw/SCOPE_ADDENDUM_WAVE1_BLOCKED.txt`.

Campaign state file updated by main session only. No Ultra/Max spawned.

## 2026-07-29 late-session record

| # | Role | Model | Reasoning | Task | Status |
|---|------|-------|-----------|------|--------|
| — | Chief (main session) | Opus 5 | session default | Orchestration, P0-A+AUDIT committed; P0-B builder running | Ongoing |
| 5 | P0-A verifier | Standard | High | End-to-end session persistence verification of fd5af98 | ✅ PASS — 4/4 tests |
| 6 | P0-A blind critic | Standard | High | 10-criterion acceptance review | ✅ PASS — all criteria met |
| 7 | Audit verifier | Standard | High | AUDIT_WAVE1_UNIFIED_RUNTIME.md claims vs live repo | ✅ PASS — §1.1 BLOCKER resolved, doc updated at 75b392a |
| 8 | P0-B builder | Standard | High | Close 3 execution-policy bypasses | ✅ PASS — Fix1+2 committed 9ea6ac1, Fix3 9181100, Fix2 corrected 13880a6 |
| 9 | P0-B blind critic | Standard | High | Blind review of P0-B commits | ✅ CONDITIONAL PASS → resolved: gate now default-on, 10/10 tests PASS |

P0-A: CONDITIONAL PASS (runtime works, commit contains bundled agent-loop changes). Audit doc updated: §1.1 BLOCKER → RESOLVED.

P0-B: OVERALL PASS ✅ — All 3 bypasses closed. chat-agent double-exec removed. executeTool gated by default. MCP execSync replaced with TOOLS.invoke.

P0-C: Routing-decisions.js committed at 8d73427 (another session). Chief found critical gap: routing-decisions.js ignored provider-config.json. Fixed in 9e70743 — 5/5 integration tests PASS. Critic running — deleg_99c8b80f.

## 2026-07-29 final session (main, this CLI)

| # | Role | Model | Reasoning | Task | Status |
|---|------|-------|-----------|------|--------|
| — | Chief (main session) | Opus 5 | session default | Orchestration, P0-A+B+C committed; docs gate PASSING | ✅ DONE |
| 10 | P0-A verifier (slot 1) | Standard | High | Runtime audit verification | ✅ PASS |
| 11 | P0-A builder (slot 2) | High | High | Session persistence — no code changes needed | ✅ PASS |
| 12 | Chief lane | High | High | Cleanup: PARITY docs deleted, authority-check .worktrees, SESSION_STORE CRITICAL, audit RESOLVED | ✅ PASS |
| — | Other session | High | High | P0-B bypasses closed (d2ccd1e, 9ea6ac1, 9181100) | ✅ PASS |
| — | Other session | High | High | P0-C routing (8d73427) | ✅ PASS |
| 13 | P0-B blind critic | High | High | Blind review of P0-B | Running — deleg_f6d54f82 |
| 14 | P0-C blind critic | High | High | Blind review of P0-C | Running — deleg_319e4c0a |

**GATE: PASSING** at d2ccd1e

Wave 1 canonical runtime: P0-A ✅ P0-B ✅ P0-C ✅ — final conformance critic next.


## Not started — do not begin without chief allocation

- **P0-B** Execution-policy bypasses: force every tool call through one
  `ToolRuntime`; remove direct 515-tool dispatch from `unified_api.js`; replace
  raw `execSync('bash …')` in `lib/mcp-server.js`; denial tests per surface.
- **P0-C** Provider settings: one config source; `resolveLane()` consumed by
  actual model execution; two lanes proven to route to two configured providers.
- Chunks 2–5 of the CLI parity work.
