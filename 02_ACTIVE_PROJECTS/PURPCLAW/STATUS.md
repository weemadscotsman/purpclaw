# PURPCLAW Status

> Version: 0.3.0 - Updated: 2026-06-29 - Verified against: local CLI audit - Status: CURRENT

## Current State

PURPCLAW has crossed from agent framework into organisation runtime.

The live project state now includes:

- 95 canonical souls in `registry/souls.json`.
- 95 soul interviews in `registry/soul-interviews.json`.
- 11 Studio modes in `registry/studio-modes.json`.
- Dynamic Council profiles and vote history.
- Timeline, Presence, Residue, Studio memory, private conversations, and world state registries.
- Donor Archaeology with provenance and candidate-to-integrated gates.
- Auto-Evolve proposal queue bridged from donor findings.
- AutoResearch CLI routed to the existing `E:/training` orchestrator.
- Folder integration audit completed with repair batches.

## Verified Commands

```bash
node bin\purpclaw.js feature --verify --json
node bin\purpclaw.js action council-mode --dry-run --json
node bin\purpclaw.js registry audit --json
node bin\purpclaw.js next --json
node bin\purpclaw.js evolve status
node bin\purpclaw.js autoresearch status
node bin\purpclaw.js auto-research queue
```

Registry JSON parse checks passed for every `registry/*.json` file.

## Important Known Disconnects

These are the current integration repair targets:

1. Some command modules exist but are not cleanly routed from `bin/purpclaw.js`.
2. `purpclaw next` under-detects project maturity and can report Discovery when runtime/architecture evidence exists.
3. Runtime truth is split across PM2 service names, service registry IDs, capability keys, surface capabilities, API routes, and CLI commands.
4. `app/api` has 76 routes and needs an ownership map.
5. Root service scripts need classification before any folder moves.
6. Timeline, Presence, Residue, Studio, Donor, Auto-Evolve, AutoResearch, and Weatherman need one operational event contract.

See:

```txt
docs/audit/FOLDER_INTEGRATION_AUDIT_2026-06-29.md
```

## Current Auto-Evolve State

Pending proposal:

```txt
mut_mqzfx4n6_byc9q4
source: donor-archaeology
risk: low
kind: append_planner_hint
artifact: ambient_tension_from_environment
```

It has not been approved automatically.

## Current Doctrine

- Donor Archaeology harvests behavioural laws, not code.
- Heist/loot/yoink language is only a CLI personality wrapper.
- No donor artifact moves from candidate to integrated unless it has:
  - `behavioural_law`
  - `integrated_into`
  - `rejected_mechanics`
  - validation note
  - Timeline event
- Do not move folders from audit alone. Build ownership/crosswalk registries first.

## Next Repair Batch

Start with:

1. Command truth and dispatch parity.
2. Project phase/context loader repair.
3. Runtime/API/CLI crosswalk.

These three make PURPCLAW able to answer:

```txt
What exists?
What is callable?
What phase are we in?
What should happen next?
```
