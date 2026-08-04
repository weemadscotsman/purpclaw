# PURPCLAW Docs Index

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

This file owns documentation classification. Running behaviour, source, tests and generated truth still outrank prose.

## Header Standard

Current hand-written docs should use:

```text
> Version source: `package.json` · Updated: YYYY-MM-DD · Status: CURRENT | REFERENCE | STALE | ARCHIVE
```

Do not hard-code package versions or volatile registry counts unless the file is generated from their canonical source.

## Canonical Root Docs

| Document | Purpose | Status |
|---|---|---|
| `README.md` | Entry point and current system shape | CURRENT |
| `PRODUCT.md` | Product boundaries and stable capabilities | CURRENT |
| `ARCHITECTURE.md` | Runtime and organisation architecture | CURRENT |
| `STATUS.md` | Operational state and claim semantics | CURRENT |
| `QUICKSTART.md` | Operator workflow | CURRENT |
| `AGENT.md` | Repository authority, workspaces and agent rules | CURRENT |
| `SECURITY.md` | Security posture | CURRENT |
| `RELEASE_CHECKLIST.md` | Release gates | CURRENT |
| `CHANGELOG.md` | Append-only curated history | CURRENT |
| `DOCS_INDEX.md` | Documentation ownership map | CURRENT |
| `LAUNCH.md` | Release-copy rules | CURRENT |
| `MEMORY.md` | Compatibility pointer to canonical memory | CURRENT |
| `USER.md` | Public-safe operator collaboration pointer | CURRENT |
| `SOUL.md` | Product identity pointer and doctrine | CURRENT |
| `NEXT_FEATURES.md` | Non-authoritative queue constrained by canonical priority | CURRENT |

## Canonical Priority and Campaign Docs

| Document | Purpose | Status |
|---|---|---|
| `docs/parity/CANONICAL_PARITY_PRIORITY.md` | Only authority for parity ordering | CURRENT |
| `docs/parity/README.md` | Parity terminology and navigation | CURRENT |
| `docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md` | Wave 1 audit evidence | CURRENT when re-verified |
| `docs/parity/WAVE1_CAMPAIGN_GOVERNANCE.md` | Campaign governance | CURRENT |
| `docs/parity/WAVE1_MASTER_GOAL.md` | Wave 1 completion target | CURRENT |
| `agent_work/gauntlet/PURPCLAW_MULTI_CLI_GAUNTLET_BOOTSTRAP.md` | Executable multi-CLI campaign instructions | CURRENT for Wave 1 |

## Reference Material

`docs/reference/PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md` is behavioural design input for later work. It does not define current priority, authorise implementation or create a second runtime.

Any other legacy `*PARITY*` document is reference-only unless the canonical priority file explicitly promotes it.

## Generated Truth

- `public/showcase/truth-manifest.json` — registry and generated count truth.
- Generated route/service indexes — route and service-definition counts.
- Proof receipts and verification reports — strict-live claims.
- Runtime probes — healthy/running claims.

## Reconciliation Rule

When a document conflicts with a higher authority, mark it STALE or REFERENCE before editing implementation. Do not silently combine incompatible snapshots.

Do not move or delete folders from prose alone. Build ownership and route crosswalk evidence first, then quarantine only what the evidence proves inactive.
