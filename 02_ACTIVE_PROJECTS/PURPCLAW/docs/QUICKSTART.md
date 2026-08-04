# PURPCLAW Quick Start

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

## Install

```bash
npm install
node bin/purpclaw.js --version
```

For a clean release environment, use the package manager and lockfile expected by the repository and confirm it through `RELEASE_CHECKLIST.md`.

## First Checks

```bash
node bin/purpclaw.js status
node bin/purpclaw.js doctor
node bin/purpclaw.js registry audit --json
npm run truth:check
```

## Safe Runtime Start

```bash
node bin/purpclaw.js safe-start --core --dry-run
node bin/purpclaw.js safe-start --core
node bin/purpclaw.js health --verbose
```

A service definition is not evidence that the service is running. Read probe output.

## Basic Operator Flow

```bash
node bin/purpclaw.js help
node bin/purpclaw.js providers
node bin/purpclaw.js ask "Inspect the current project and report evidence"
node bin/purpclaw.js memory status
```

## Organisation Features

```bash
node bin/purpclaw.js council "Should this change enter the canonical runtime?"
node bin/purpclaw.js studio modes
node bin/purpclaw.js timeline recent 10
node bin/purpclaw.js presence tea_room
node bin/purpclaw.js residue tea_room
```

## Evolution Features

```bash
node bin/purpclaw.js donor
node bin/purpclaw.js evolve status
node bin/purpclaw.js autoresearch status
```

Donor Archaeology proposes behavioural laws and provenance. It does not apply code automatically. Auto-Evolve and AutoResearch remain separate governed paths.

## Before Editing

Read, in order:

```text
AGENT.md
docs/parity/CANONICAL_PARITY_PRIORITY.md
DOCS_INDEX.md
STATUS.md
```

For campaign work, also read the campaign's explicit authoritative-source list and `ACTIVE_ASSIGNMENTS.json`.

## Workspace Safety

Use the canonical tree by default. Do not create clones, slot folders or unregistered worktrees. A campaign-approved temporary worktree must be registered, path-owned, expiring and cleaned up.

Never use broad destructive Git commands. Stage explicit paths and inspect the complete staged diff before committing.

## Verification Before Claiming Done

```bash
npm run docs:gate
npm run truth:check
npm run verify:harness
npm run verify:parity
npm run build
```

Run the smallest relevant checks first, then the full required gate. Report commands and observed evidence, not optimism wearing a lanyard.
