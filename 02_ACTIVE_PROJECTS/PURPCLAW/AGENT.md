# PurpClaw Repository Working Map

Last updated: 2026-07-29.

Treat this repository as a running local-first AI workstation OS. Preserve
existing user work and avoid generated caches, archives, vendor snapshots, and
imported reference packs unless explicitly in scope.

## Authority

1. Running behavior and probes.
2. `service_registry.js`, `ecosystem.config.js`, route source, and registries.
3. Tests, proof receipts, and generated truth reports.
4. Current canonical docs.
5. Historical/design/reference material.

Parity work has exactly one authority: `docs/parity/CANONICAL_PARITY_PRIORITY.md`.
Do not redefine "parity" from any other `*PARITY*` doc -- they are historical input.

Spawning agents is governed by `docs/AGENT_RESOURCE_POLICY.md`. Child agents do
NOT inherit the parent's model or reasoning tier; pick the cheapest sufficient
tier and record the spawn in `.purpclaw/CAMPAIGN_STATE.md`.

## Workspace rule — one tree

Work in THIS repository. Do not clone it, do not create a worktree, do not make
a `*-slot-N` sibling folder, and do not create a long-lived branch.

On 2026-07-31 fifteen unregistered worktrees were found nested inside this
project. Every one held zero unique commits, and agents had been reading them as
if they were live — auditing a stale `unified_api.js`, "fixing" ghosts, and
filing contradictory architecture reports from copies of the same file.

If a task genuinely needs isolation, register it in `.purpclaw/workspaces.json`
with agent, task, branch, path, created_at, expires_at, status — and delete the
worktree when the task ends. An unregistered worktree is abandoned by
definition and may be pruned without warning.

Before assuming a file is broken, confirm the path you are reading is under this
directory and not a copy.

Counts come from `public/showcase/truth-manifest.json`, not copied prose.
"Registered," "executor-backed," "strict-live," "PM2-defined," and "healthy" are
different claims.

## Main Surfaces

- CLI: `bin/purpclaw.js`, `lib/commands/`.
- Agent runtime: `lib/agent-loop.js`, `lib/agent-gateway.js`.
- Tools/policy: `lib/tools/index.js`, `lib/tool-runtime.js`.
- Services: `service_registry.js`, `ecosystem.config.js`.
- Web: `app/`.
- Identity/context: `workspace/`.
- Documentation: `docs/INDEX.md` and generated indexes.

## Validation

Use the smallest relevant checks, then report evidence plainly:

```powershell
npm run truth:check
npm run docs:sync
npm run docs:check
npm run verify:harness
npm run verify:parity
```

Do not claim a service, page, provider, tool, or agent is live from file presence.

