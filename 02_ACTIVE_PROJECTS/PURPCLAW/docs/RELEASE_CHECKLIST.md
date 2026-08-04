# PurpClaw Release Checklist

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

## Source and Documentation Gates

- [ ] `package.json`, tag, release notes and package contents agree on version.
- [ ] `npm run docs:gate` passes.
- [ ] `npm run truth:check` reports no drift.
- [ ] `npm run docs:sync` produces no unexplained changes.
- [ ] `npm run docs:check` passes.
- [ ] No hand-written doc contains stale generated counts presented as current truth.
- [ ] No new competing parity authority exists.

## Runtime and Harness Gates

- [ ] Clean dependency installation succeeds using the repository's supported lockfile workflow.
- [ ] `npm run verify:harness` passes.
- [ ] `npm run verify:parity` passes.
- [ ] `npm run build` passes.
- [ ] `purpclaw safe-start --core`, `doctor`, `health --verbose`, `bughunt` and smoke checks pass.
- [ ] One configured provider completes an end-to-end real `ask` request.
- [ ] Mission Control loads on loopback and critical flows work.
- [ ] Optional lanes claimed in release notes are probed individually.

## Wave 1 Conformance Gates

- [ ] P0-A independent critic PASS.
- [ ] P0-B independent critic PASS.
- [ ] P0-C independent critic PASS.
- [ ] Final conformance critic PASS from a clean integration candidate.
- [ ] Persistence failure is visible and tested.
- [ ] CLI, HTTP and MCP permission decisions agree.
- [ ] Provider status and actual execution route agree.

## Workspace and Diff Gates

- [ ] No unregistered worktrees or slot folders remain.
- [ ] Campaign workspaces are marked integrated or abandoned and removed.
- [ ] No unrelated dirty-tree content is committed.
- [ ] No secrets, personal data, machine-specific paths or generated runtime state are included.
- [ ] Complete diff against approved base has been reviewed.
- [ ] Tests were not weakened to manufacture green output.

## Claim Rules

- Registry counts come from `public/showcase/truth-manifest.json`.
- Route and service-definition counts come from generated indexes.
- “Live,” “healthy” and “working” require current probes.
- Adapter presence does not imply credentials, quota or successful calls.
- A registered agent is not strict-live without proof-ladder evidence.

Publishing is a separate explicit action. Passing this checklist does not publish anything automatically.
