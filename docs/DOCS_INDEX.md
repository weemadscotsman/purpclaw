# PURPCLAW Docs Index

> Version: 0.3.0 - Updated: 2026-06-29 - Verified against: local CLI audit - Status: CURRENT

This file is the documentation ownership map. If a doc is not listed here as CURRENT, treat it as reference until verified.

## Header Standard

Every current doc should start with:

```txt
> Version: <version> - Updated: <YYYY-MM-DD> - Verified against: <source> - Status: CURRENT | STALE | ARCHIVE
```

## Canonical Root Docs

| Doc | Purpose | Status |
|---|---|---|
| `README.md` | Entry point and current system shape | CURRENT |
| `ARCHITECTURE.md` | Current architecture | CURRENT |
| `STATUS.md` | Current operating status and known disconnects | CURRENT |
| `QUICKSTART.md` | First commands and operator workflow | CURRENT |
| `CHANGELOG.md` | Release history | CURRENT |
| `DOCS_INDEX.md` | Documentation ownership | CURRENT |
| `Router.md` | Division routing rules | CURRENT |
| `AGENTS.md` | Root agent rules | CURRENT |
| `CLAUDE.md` | Operator/agent context | NEEDS REVIEW |
| `SECURITY.md` | Security posture | NEEDS REVIEW |

## Current Architecture/Audit Docs

| Doc | Purpose | Status |
|---|---|---|
| `docs/audit/FOLDER_INTEGRATION_AUDIT_2026-06-29.md` | Folder-by-folder disconnect audit and repair plan | CURRENT |
| `docs/audit/SOUL_STUDIO_INSPECTION_2026-06-29.md` | Soul/Studio/Council inspection | CURRENT |
| `docs/audit/JS_PY_SOURCE_AUDIT_2026-06-29.md` | JS/Python syntax audit | CURRENT |
| `docs/spec/ORACLE_WEATHERMAN_WORKFLOW.md` | Operational layer workflow | CURRENT |
| `docs/spec/PURPCLAW_COUNCIL_MODE.md` | Council Mode contract | CURRENT |
| `docs/spec/PURPCLAW_BMAD_ORGANS_PLAN.md` | BMad organ transplant plan | CURRENT |
| `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/AGENT_RULES.md` | Binding UI work rules | CURRENT |

## Registry Truth

| Registry | Purpose |
|---|---|
| `registry/souls.json` | Soul identity truth |
| `registry/soul-interviews.json` | 21-question identity archive |
| `registry/studio-modes.json` | Studio behavioural environments |
| `registry/council-profiles.json` | Dynamic council attendance/chair rules |
| `registry/council-votes.json` | Council vote history |
| `registry/timeline.json` | Organisational event ledger |
| `registry/presence.json` | Room/presence state |
| `registry/residue.json` | Durable artifacts/residue |
| `registry/donor-artifacts.json` | Donor archaeology and feature provenance |
| `registry/workflows.json` | Workflow catalog |

## Docs That Need Reconciliation

These may still contain pre-0.3.0 numbers, service counts, or old positioning:

```txt
ARCHITECTURE_MAP.md
STACK_MAP.md
METRICS.md
CONTRIBUTING.md
PURPCLAW-USER-MANUAL.md
LAUNCH.md
docs/README.md
docs/ARCHITECTURE.md
docs/CHANGELOG.md
docs/QUICKSTART.md
docs/LAUNCH.md
docs/SYSTEM_TRUTH.md
docs/SERVICE_RUNTIME_INDEX.md
```

Do not trust numeric claims in those files until they are re-verified.

## Current Repair Plan

Use `docs/audit/FOLDER_INTEGRATION_AUDIT_2026-06-29.md` as the next work map.

Priority order:

1. Command truth and dispatch parity.
2. Project phase/context loader repair.
3. Runtime/API/CLI crosswalk.
4. API route ownership registry.
5. Active source vs quarantine classification.
6. Operational event spine.

## Rule

Do not move or delete folders from audit findings alone. First create ownership/crosswalk registries; then quarantine only what the registry proves is inactive.
