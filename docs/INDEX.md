# PURPCLAW Documentation Index

Last verified: 2026-06-19

This file is the front door for the docs. Older docs still exist, but the
documents below are the canonical navigation layer for the current local stack.
If an older audit, root README, or STRESS note disagrees with these files, treat
the code and the canonical docs as the newer source until the old doc is updated.

## Start Here

| File | Use it for |
|---|---|
| [CANONICAL_MAP.md](CANONICAL_MAP.md) | One-page map of the current system and source-of-truth rules |
| [WHERE_THINGS_GO.md](WHERE_THINGS_GO.md) | Folder placement rules: what belongs where |
| [ROUTING_AND_BUILD_SPEC.md](ROUTING_AND_BUILD_SPEC.md) | Runtime routing, proxy policy, build, restart, and health commands |
| [ROUTE_INDEX.md](ROUTE_INDEX.md) | Current Next.js page/API route index |
| [SERVICE_RUNTIME_INDEX.md](SERVICE_RUNTIME_INDEX.md) | PM2 services, ports, scripts, health paths, and service ownership |

## Existing Reference Docs

| Folder/File | Status | Notes |
|---|---|---|
| [current/](current/) | Active reference | Narrative and troubleshooting docs. Some counts may lag the live stack. |
| [spec/](spec/) | Active reference | Stack, port, BIOS, and agent matrix specs. |
| [shipped/](shipped/) | Stable reference | Completed feature boards and shipped contracts. |
| [audit/](audit/) | Historical evidence | Useful for archaeology, not the current source of truth. |
| [experimental/](experimental/) | Aspirational | Ideas and debt lists, not guaranteed live behavior. |
| [../STRESS/](../STRESS/) | Audit log | Deep working notes and proof logs. Good evidence, noisy navigation. |
| [../README.md](../README.md) | Public overview | Marketing/project overview. Verify numbers against runtime docs. |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Root architecture | Useful longform overview. May duplicate newer docs. |
| [../purpclaw-service-map.md](../purpclaw-service-map.md) | Service sketch | Kept for quick reference; canonical service table is now in `SERVICE_RUNTIME_INDEX.md`. |

## Rule For Future Docs

New operational docs go in `docs/`. New evidence or one-off audit output goes
in `STRESS/` or `agent_work/`. New generated build/runtime artifacts do not go
in `docs/` unless they are intentionally curated.

