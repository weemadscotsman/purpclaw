# PURPCLAW

> Version: 0.3.0 - Updated: 2026-06-29 - Verified against: local CLI audit - Status: CURRENT

PURPCLAW is a local-first AI workstation OS.

It is not just a chatbot, an agent list, or a dashboard. It is a terminal-first system that combines provider routing, agents, workflows, memory, Studio/Council sessions, operational weather, and a governed self-evolution loop.

## Current Shape

PURPCLAW now has six connected layers:

| Layer | Purpose | Current truth |
|---|---|---|
| Identity | Souls, interviews, values, fears, goals, relationships | `registry/souls.json`, `registry/soul-interviews.json` |
| Governance | Oracle, Council, dynamic chairs, votes, reputation | `purpclaw council`, `registry/council-profiles.json` |
| Workflow | Discovery, planning, solutioning, implementation, runtime | `purpclaw next`, `purpclaw workflow` |
| Studio | Council, radio, arena, emergency, after-hours, commentary | `lib/studio.js`, `registry/studio-modes.json` |
| Ecology | Timeline, Presence, Residue, meeting memory, ambient life | `purpclaw timeline`, `presence`, `residue` |
| Evolution | AutoResearch, Auto-Evolve, donor archaeology, proposal gates | `purpclaw autoresearch`, `purpclaw evolve`, `purpclaw donor` |

## What Changed In 0.3.0

- Canonical soul registry: 95 souls plus 95 interviews.
- Studio modes: 11 operational behavioural environments.
- Dynamic Council Mode: Oracle no longer hard-chairs every meeting; domain chairs and relevant specialists are selected by profile.
- Timeline: persistent organisational event ledger.
- Presence: rooms can expose occupancy, atmosphere, objects, recent visitors, and traditions.
- Residue: meetings and incidents leave durable traces.
- Donor Archaeology: harvested ideas are stored as behavioural laws with provenance and rejected mechanics.
- Auto-Evolve bridge: donor findings queue into the existing mutator proposal path instead of creating a second evolution engine.
- AutoResearch front door: `purpclaw autoresearch` and `purpclaw auto-research` route to the existing `E:/training` orchestrator.
- Folder integration audit: every top-level folder has been mapped with repair batches.

## Quick Start

```bash
npm install
node bin/purpclaw.js help
node bin/purpclaw.js status
```

Core discovery commands:

```bash
node bin/purpclaw.js next --json
node bin/purpclaw.js workflow --json
node bin/purpclaw.js registry audit --json
node bin/purpclaw.js feature --verify --json
```

Council and Studio commands:

```bash
node bin/purpclaw.js council "Should we consolidate the provider router?"
node bin/purpclaw.js studio modes
node bin/purpclaw.js timeline recent 10
node bin/purpclaw.js presence tea_room
node bin/purpclaw.js residue tea_room
```

Evolution commands:

```bash
node bin/purpclaw.js autoresearch status
node bin/purpclaw.js evolve status
node bin/purpclaw.js donor
node bin/purpclaw.js donor evolve ambient_tension_from_environment
```

## Canonical Docs

- `STATUS.md` - current operating status.
- `ARCHITECTURE.md` - current architecture.
- `DOCS_INDEX.md` - documentation ownership and status.
- `CHANGELOG.md` - release history.
- `docs/audit/FOLDER_INTEGRATION_AUDIT_2026-06-29.md` - folder-by-folder disconnect audit.
- `docs/audit/SOUL_STUDIO_INSPECTION_2026-06-29.md` - soul/studio subsystem inspection.
- `docs/spec/ORACLE_WEATHERMAN_WORKFLOW.md` - operational workflow model.
- `docs/spec/PURPCLAW_COUNCIL_MODE.md` - Council Mode contract.

## Development Rules

- Files are the brain. State lives in registries, memory files, logs, and handoffs.
- Read `Router.md` before choosing a division.
- Read the relevant division pickup before work.
- Write the relevant handoff after work.
- Do not move folders from audit findings alone. Create ownership/crosswalk registries first, then move only what is proven inactive.
- For UI work, read `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/AGENT_RULES.md` first.

## Current Repair Priorities

1. Route or classify loose command modules.
2. Fix `purpclaw next` so it detects the live project phase correctly.
3. Add runtime crosswalk: service -> capability -> surface -> API -> CLI.
4. Add API route ownership registry.
5. Wire Registry Audit, Bughunt, AutoResearch, Auto-Evolve, Studio, Donor, and Weatherman into one operational event spine.

PURPCLAW is now best understood as an organisation simulator for local AI work: specialists with identity, shared memory, governance, operational weather, and an evolution loop.
