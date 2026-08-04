# PURPCLAW Canonical Replacement Set

Generated: 2026-08-04

## What this pack fixes

- One version authority: `package.json`.
- One generated-count authority: `public/showcase/truth-manifest.json`.
- One parity-order authority: `docs/parity/CANONICAL_PARITY_PRIORITY.md`.
- One default workspace: the canonical repository tree.
- One explicit exception: registered, expiring temporary worktrees for approved concurrent write campaigns.
- One Wave 1 scope: P0-A, P0-B and P0-C, followed by final independent conformance.
- External harness work is reference-only until Wave 1 passes and canonical priority authorises it.

## Replacement map

Copy the root files over the matching repository root files:

```text
README.md
PRODUCT.md
ARCHITECTURE.md
STATUS.md
QUICKSTART.md
DOCS_INDEX.md
AGENT.md
SECURITY.md
RELEASE_CHECKLIST.md
CHANGELOG.md
LAUNCH.md
MEMORY.md
NEXT_FEATURES.md
SOUL.md
USER.md
```

Copy campaign/reference files to:

```text
agent_work/gauntlet/PURPCLAW_MULTI_CLI_GAUNTLET_BOOTSTRAP.md
docs/reference/PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md
```

If the old harness blueprint currently lives elsewhere, replace it with the reference version or leave a one-line pointer to the path above. Do not leave two active copies claiming authority.

## Safe application

Run `APPLY_REPLACEMENTS.ps1` from the extracted pack and pass the repository root. The script creates a timestamped backup before copying. Review the diff and run the repository gates before committing.
