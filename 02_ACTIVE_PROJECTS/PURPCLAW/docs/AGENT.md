# PurpClaw Repository Working Map

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

Treat this repository as a running local-first AI workstation OS. Preserve existing user work and avoid generated caches, archives, vendor snapshots and imported reference packs unless explicitly in scope.

## Authority

1. Running behaviour and probes.
2. `service_registry.js`, `ecosystem.config.js`, route source and registries.
3. Tests, proof receipts and generated truth reports.
4. Current canonical docs.
5. Historical, design and reference material.

Parity work has exactly one authority: `docs/parity/CANONICAL_PARITY_PRIORITY.md`. Other parity documents are input or reference unless that file explicitly promotes them.

Agent spawning is governed by `docs/AGENT_RESOURCE_POLICY.md`. Child agents do not inherit the parent's model or reasoning tier. Select the cheapest sufficient tier and record the spawn in `.purpclaw/CAMPAIGN_STATE.md`.

## Workspace Rule

The canonical tree is the default workspace.

Do not clone the repository, create sibling slot folders, create long-lived branches or create unregistered worktrees.

A temporary worktree is permitted only when all of the following are true:

1. An explicit campaign requires concurrent write isolation.
2. The campaign names the worktree, branch, owner and writable paths.
3. The workspace is registered in `.purpclaw/workspaces.json` before use.
4. The entry includes agent, task, branch, path, creation time, expiry and status.
5. The worktree is created from the recorded approved base.
6. It is removed immediately after integration or abandonment.

The Wave 1 multi-CLI gauntlet is an approved temporary-worktree campaign. Unregistered worktrees remain abandoned by definition and may be pruned.

Before reporting a defect, confirm the path belongs to the canonical repository or a currently registered campaign workspace.

## Truth and Claim Rules

- Package version comes from `package.json`.
- Counts come from `public/showcase/truth-manifest.json` or generated indexes.
- “Registered,” “executor-backed,” “strict-live,” “PM2-defined” and “healthy” are different claims.
- Do not claim a service, page, provider, tool or agent is live from file presence.
- Builder summaries are not independent evidence.

## Main Surfaces

- CLI: `bin/purpclaw.js`, `lib/commands/`.
- Agent runtime: `lib/agent-loop.js`, `lib/agent-gateway.js`.
- Tools and policy: `lib/tools/index.js`, `lib/tool-runtime.js`.
- Services: `service_registry.js`, `ecosystem.config.js`.
- Web: `app/`.
- Identity and context: `workspace/`.
- Documentation: `DOCS_INDEX.md`, `docs/INDEX.md` and generated indexes.

## Global Git Safety

- Never use `git add -A` or `git add .`.
- Never use `git reset --hard` or `git clean`.
- Never use broad checkout or restore commands.
- Never force-push or rebase shared branches.
- Stage explicit paths only.
- Inspect working, unstaged and staged diffs before commit.
- Never commit unrelated dirty-tree content.
- Critics do not modify production code.

## Current Campaign Order

1. Establish approved base and provenance.
2. Verify runtime audit.
3. Close P0-A persistence.
4. Close P0-B permissions and MCP bypass.
5. Close P0-C provider-routing truth.
6. Integrate only independently passed components.
7. Run final conformance.
8. Begin later feature or harness work only after final PASS.

## Validation

```bash
npm run truth:check
npm run docs:sync
npm run docs:check
npm run verify:harness
npm run verify:parity
npm run build
```

Use the smallest relevant checks first, then the required full gate. Report exact commands and evidence.
