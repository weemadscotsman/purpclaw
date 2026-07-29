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
session with the same brief and the same target files. It is outside this
session's control and carries neither the runtime-defect scope addendum nor a
resource budget. Two writers on `lib/commands/provider.js`, `bin/purpclaw.js`
and `lib/feature-parity.js`.

## Completed work

| Commit | What | Verified by |
|--------|------|-------------|
| `4fefcc3` | Legacy parity docs superseded + authority gate | `npm run parity:check` |
| `cf513c6` | Track canonical roadmap; unbrittle marker; exempt superseded docs from GATE 8 | `npm run docs:gate` |
| `fd5af98` | Runtime boot: `DatabaseSync` from `node:sqlite` across 23 modules; loud degraded-runtime diagnostic | cross-process create/persist/load/resume; blind critic pending |

## Not started — do not begin without chief allocation

- **P0-B** Execution-policy bypasses: force every tool call through one
  `ToolRuntime`; remove direct 515-tool dispatch from `unified_api.js`; replace
  raw `execSync('bash …')` in `lib/mcp-server.js`; denial tests per surface.
- **P0-C** Provider settings: one config source; `resolveLane()` consumed by
  actual model execution; two lanes proven to route to two configured providers.
- Chunks 2–5 of the CLI parity work.
