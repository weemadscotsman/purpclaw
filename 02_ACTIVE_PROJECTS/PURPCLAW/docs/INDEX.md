# PurpClaw Documentation

Last updated: 2026-07-29.

This is the canonical documentation front door. Runtime code and live probes
outrank prose. Generated indexes outrank copied counts.

## Start Here

| Document | Purpose |
|---|---|
| [`../README.md`](../README.md) | Product overview and first start |
| [`../PRODUCT.md`](../PRODUCT.md) | Product boundaries and differentiators |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Current architecture contract |
| [`../STATUS.md`](../STATUS.md) | Audited counts, proof semantics, known gaps |
| [`INSTALL.md`](INSTALL.md) | Detailed installation |
| [`FIRST_RUN.md`](FIRST_RUN.md) | First-run workflow |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Common recovery paths |
| [`CANONICAL_MAP.md`](CANONICAL_MAP.md) | Authority and repository map |
| [`WHERE_THINGS_GO.md`](WHERE_THINGS_GO.md) | Placement rules |
| [`ROUTING_AND_BUILD_SPEC.md`](ROUTING_AND_BUILD_SPEC.md) | Routing/build rules |
| [`parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md) | Canonical parity priority list and completion definition |

## Generated Truth

| Document | Generated from |
|---|---|
| [`ROUTE_INDEX.md`](ROUTE_INDEX.md) | `app/**/page.tsx`, `app/api/**/route.ts` |
| [`SERVICE_RUNTIME_INDEX.md`](SERVICE_RUNTIME_INDEX.md) | service registry and PM2 ecosystem |
| [`DOC_CATALOG.md`](DOC_CATALOG.md) | all repository Markdown/MDX files |
| [`AGENT_TRUTH_AUDIT.md`](AGENT_TRUTH_AUDIT.md) | agent/tool/provider truth audit |

Run `npm run docs:sync`, `npm run docs:check`, and `npm run truth:check` after
relevant changes.

## Lifecycle Classes

- `docs/current/` is current supporting narrative.
- `docs/design/` and `docs/spec/` describe contracts; implementation proof still wins.
- `docs/audit/`, dated root audits, `STRESS/`, and `agent_work/` are evidence snapshots.
- `docs/generated/` contains generated/historical reports.
- `docs/archive/` and `docs/legacy/` are non-canonical history.
- Translation folders are snapshots and may lag the English canon.
- Imported API lists and vendor/reference packs are external material.

Historical wording is retained for provenance; it is not silently rewritten into
present tense.


