# PURPCLAW Folder Inventory

Generated during the 2026-06-19 routing/build documentation hardening pass.

## Scope Rules

Excluded from active ownership decisions: `node_modules/`, `.next/`, `build/`, `dist/`, `out/`, `coverage/`, `__pycache__/`, binary media, archives, vendor snapshots, and generated run logs unless explicitly named.

## Active Core

| Folder | Role | Action |
|---|---|---|
| `app/` | Next.js cockpit pages, components, and same-origin API adapters | Keep; page/API guidance added |
| `bin/` | CLI entry scripts | Keep; command guidance added |
| `lib/` | Runtime libraries, providers, tools, memory clients, command modules | Keep; existing guidance retained, command guidance added |
| `scripts/` | Validators, TUI launch targets, operational helpers | Keep; guidance added |
| `config/` | Static config lane | Keep; guidance added |
| `agents/` | Agent/persona definitions | Keep; existing guidance present |
| `divisions/` | Agent division grouping | Keep |
| `docs/` | Current docs and generated reports | Keep; generated reports added |
| `STRESS/` | Audit proof and long-form verification records | Keep |
| `eval/` | Benchmark/eval harness | Keep |
| `tests/` | Test lane | Keep |

## Capability/Registry Lanes

| Folder | Role | Action |
|---|---|---|
| `skills/` | Hermes skills and skill metadata | Keep; legacy subtrees are quarantine/reference |
| `registry/` | Registry data | Keep |
| `schemas/` | Data contracts | Keep |
| `prompts/` | Prompt assets | Keep |
| `contexts/` | Context presets | Keep |
| `components/`, `hooks/` | Older/shared React helper lanes outside `app/` | Keep; do not confuse with `app/components` |
| `mochi/` | Mochi companion assets/runtime | Keep |
| `pocket/` | Pocket/mobile/offline support | Keep |

## Generated or Operational State

| Folder | Role | Action |
|---|---|---|
| `agent_work/` | Historical and active agent job output | Do not use as source-of-truth docs; preserve |
| `logs/` | Runtime logs | Preserve; do not hand-edit |
| `reports/`, `trip_logs/` | Output lanes | Preserve |
| `_scratch/`, `.purpclaw/`, `.omnicode/`, `.claude/`, `.kiro/` | Tool/cache/work state | Do not document as active architecture |

## Quarantine / Reference / Vendor

| Folder | Role | Action |
|---|---|---|
| `vendor/` | Third-party snapshots | Do not edit for PURPCLAW contamination cleanup |
| `.archive/`, `app/_archive/`, `docs/legacy/` | Historical reference | Allowed stale references if clearly historical |
| `skills/_legacy/` | Migration/reference skills | Quarantined legacy |
| `_api-mega-list/`, `.donors/` | Donor/reference datasets | Do not treat as product routes |
| `no-spaghett/`, `puzzle-stream/`, `companion-chorus/`, `podcast_studio/`, `DreamTask/` | Nested or side projects | Do not let their docs/build errors block PURPCLAW app validation |

## Page Inventory

Full pages currently present: `/agents`, `/bridge`, `/cockpit`, `/dash`, `/evolution`, `/inline`, `/memory`, `/mission`, `/mochi`, `/omni`, `/pipeline`, `/preprompt`, `/providers`, `/settings`, `/skyscraper`, `/swarm`, `/system-map`. `/voice` is not an active page in the current tree.

Known non-page folders under `app/`: `_archive`, `api`, `command-center`, `components`, `hooks`, `particle-viz`, `public`, `ui`.

## Immediate Documentation Boundary

New `AGENT.md` files were added only where they improve routing/build ownership: root, `bin/`, `lib/commands/`, `app/api/`, `app/components/`, `scripts/`, and `config/`.
