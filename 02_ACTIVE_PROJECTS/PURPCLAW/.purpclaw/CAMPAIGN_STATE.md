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
