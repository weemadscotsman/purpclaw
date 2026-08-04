# Soul and Studio Inspection - 2026-06-29

## Scope

Inspected the new PURPCLAW organisation-simulator layer:

- `registry/souls.json`
- `registry/soul-interviews.json`
- `registry/studio-modes.json`
- `registry/studio-world-state.json`
- `registry/studio-memory.json`
- `registry/studio-session-log.json`
- `registry/council-votes.json`
- `registry/timeline.json`
- `registry/presence.json`
- `registry/residue.json`
- `registry/donor-artifacts.json`
- `lib/soul-registry.js`
- `lib/soul-interview.js`
- `lib/council-vote-engine.js`
- `lib/studio.js`
- `lib/timeline.js`
- `lib/presence.js`
- `lib/residue.js`
- `lib/donor-archaeology.js`
- `bin/purpclaw.js`

## Findings

- The soul registry is the canonical identity layer: `purpclaw.souls.v2`, version `0.3.0`, with 95 souls.
- The interview registry is complete against the soul count: `purpclaw.soul-interviews.v1`, with 95 interviews.
- Studio modes are real behavioral environments, not just labels. Runtime now exposes 11 modes: council, radio, arena, vent, emergency, brainstorm, interview, news, commentary, directors_cut, and after_hours.
- Council votes, reputation, and leaderboard data are present and callable.
- Dynamic council summons are already wired through `purpclaw council`.
- No second soul registry is needed. New work should extend `registry/souls.json` and its readers, not create parallel files.
- The timeline is now the first ecology layer. It records organisational events, detects repeated patterns, and marks tradition candidates once repeated behavior reaches the configured confidence threshold.
- Presence is now the first spatial residue layer. It projects room state from Timeline and Studio world state, so empty rooms can still show recent visitors, atmosphere, objects, traditions, and recent events.
- Residue is now the first durable artifact layer. It records what remains in rooms after meetings and incidents: notes, mugs, risk markers, burn marks, ambient traces, and tradition candidates.
- Donor Archaeology is now the provenance layer for harvested ideas. It records behavioural laws, origin projects, rejected project-specific mechanics, and integration rationale without importing raw code.

## Changes Made

- Fixed `purpclaw council leaderboard/history/vote/tally` dispatch so vote subcommands route to `lib/council-vote-engine.js`.
- Added richer soul inspection surfaces:
  - `purpclaw souls --json`
  - `purpclaw souls --detail`
  - `purpclaw souls matrix`
  - `purpclaw souls summon "<problem>" --json`
- Promoted `after_hours` into `registry/studio-modes.json` so Studio registry truth matches runtime behavior.
- Added `registry/timeline.json` and `lib/timeline.js`.
- Added `purpclaw timeline` CLI:
  - `purpclaw timeline`
  - `purpclaw timeline recent [n]`
  - `purpclaw timeline patterns`
  - `purpclaw timeline backfill --dry-run`
  - `purpclaw timeline backfill --write`
  - `purpclaw timeline add "<event>"`
  - `purpclaw timeline --json`
- Wired Studio session start/end, Director incident injection, and council vote casting into the timeline.
- Seeded the timeline with the origin event: `Soul interview protocol established: Solid Crew to 21 Seconds to 21 Questions to the Soul Registry`.
- Backfilled timeline from existing `registry/council-votes.json` and `registry/studio-session-log.json`.
- Added `registry/presence.json` and `lib/presence.js`.
- Added `purpclaw presence`, with aliases `purpclaw rooms` and `purpclaw spaces`.
- Added six initial rooms:
  - Council Chamber
  - Tea Room
  - Studio
  - Archive
  - War Room
  - Roof
- Presence snapshots derive:
  - current occupants
  - recent visitors
  - atmosphere
  - objects
  - traditions
  - recent events
- Persisted a derived presence snapshot with `purpclaw presence --write`.
- Added `registry/residue.json` and `lib/residue.js`.
- Added `purpclaw residue`, with alias `purpclaw artifacts`.
- Residue derives durable artifacts from Timeline, Presence, Studio world state, and Studio session conversations.
- Persisted a derived residue snapshot with `purpclaw residue --write`.
- Initial residue observed:
  - Tea Room: duck concern tradition, ambient trace, Hermes coffee mug, Goose tea bag, Memory reference marker, Phoenix burn mark, Smith risk note, Hermes open notebook.
  - Council Chamber: vote notes and provider outage notes.
  - Studio: build failure marker and provider outage note.
- Added `registry/donor-artifacts.json` and `lib/donor-archaeology.js`.
- Added `purpclaw donor`, with aliases `purpclaw donors`, `purpclaw archaeology`, and `purpclaw loot`.
- Added heist/calling-card reports:
  - `purpclaw donor heist <artifact_id>`
  - `purpclaw donor yoink <artifact_id>`
- Added donor-to-Auto-Evolve feed:
  - `purpclaw donor evolve <artifact_id>`
  - `purpclaw donor feed <artifact_id>`
- Added donor integration gate:
  - `purpclaw donor integrate <artifact_id> validation:"..."`
  - `purpclaw donor promote <artifact_id> validation:"..."`
  - candidate artifacts cannot move to `integrated` unless they have `behavioural_law`, `integrated_into`, `rejected_mechanics`, a validation note, and a Timeline event.
- Repaired missing CLI routes for the existing evolution/research front doors:
  - `purpclaw evolve`
  - `purpclaw autoresearch`
  - `purpclaw auto-research`
- Seeded donor artifacts:
  - Token Wars: competitive conversation with explicit victory conditions.
  - MLM Hero: environmental tension.
  - Token Wars: relationship-driven interruptions.
- Donor doctrine: never import a feature until the underlying behavioural law is identified.
- Donor promotion doctrine: no artifact moves from candidate to integrated without behavioural law, destination, rejected mechanics, validation note, and timeline provenance.
- Created first heist report from `ambient_tension_from_environment`. The report records Scout, Goose, Hermes, Memory, calling card text, rejected mechanics, and duck observation.
- Queued `ambient_tension_from_environment` into the existing Auto-Evolve mutator path as low-risk proposal `mut_mqzfx4n6_byc9q4`.
- Exact auto-research entrypoint confirmed:
  - CLI wrapper: `lib/commands/autoresearch.js`
  - Orchestrator: `E:/training/lib/autoresearch-orchestrator.js`
  - Root command: `purpclaw autoresearch` / `purpclaw auto-research`
- AutoResearch remains a local LLM optimization loop. Donor Archaeology is now a governed proposal feed into Auto-Evolve, not a replacement engine.

## Validation

- `node --check bin\purpclaw.js`
- `node --check lib\soul-registry.js`
- `node --check lib\soul-interview.js`
- `node --check lib\council-vote-engine.js`
- `node --check lib\studio.js`
- `node --check lib\timeline.js`
- `node --check lib\presence.js`
- `node --check lib\residue.js`
- `node --check lib\donor-archaeology.js`
- `node --check lib\commands\autoresearch.js`
- `node --check lib\evolution\mutator.js`
- Parsed all inspected JSON registries.
- `node bin\purpclaw.js souls --json`
- `node bin\purpclaw.js souls matrix`
- `node bin\purpclaw.js souls --detail`
- `node bin\purpclaw.js souls summon "Should we rewrite the provider router?" --json`
- `node bin\purpclaw.js council leaderboard 3`
- `node bin\purpclaw.js council history 1`
- `node bin\purpclaw.js council "Should we rewrite the provider router?" --json`
- `node bin\purpclaw.js studio modes`
- `node bin\purpclaw.js studio status`
- `node bin\purpclaw.js studio world`
- `node bin\purpclaw.js timeline --json`
- `node bin\purpclaw.js timeline recent 5`
- `node bin\purpclaw.js timeline patterns`
- Temp-file timeline pattern test: three repeated events become a tradition candidate at 42% confidence.
- `node bin\purpclaw.js timeline backfill --dry-run`
  - first run: 24 candidates, 21 add, 3 skip.
- `node bin\purpclaw.js timeline backfill --write`
  - wrote 21 missing historical events.
- `node bin\purpclaw.js timeline backfill --dry-run`
  - second run: 24 candidates, 0 add, 24 skip.
- `node bin\purpclaw.js timeline --json`
  - returned 34 events and 14 observed patterns after backfill.
- `node -e "JSON.parse(require('fs').readFileSync('registry/presence.json','utf8')); console.log('presence-json-ok')"`
- `node bin\purpclaw.js presence tea_room`
  - Tea Room showed empty occupancy, recent visitors from after-hours sessions, crisis residue, objects, traditions, and recent after-hours events.
- `node bin\purpclaw.js presence --json`
  - returned schema `purpclaw.presence.snapshot.v1`, 6 rooms.
- `node bin\purpclaw.js presence --write`
- `node -e "JSON.parse(require('fs').readFileSync('registry/residue.json','utf8')); console.log('residue-json-ok')"`
- `node bin\purpclaw.js residue tea_room`
  - Tea Room showed 8 artifacts, including `duck concern in the room` as a tradition candidate.
- `node bin\purpclaw.js residue --json`
  - returned schema `purpclaw.residue.snapshot.v1`.
- `node bin\purpclaw.js residue --write`
- `node -e "JSON.parse(require('fs').readFileSync('registry/donor-artifacts.json','utf8')); console.log('donor-json-ok')"`
- `node bin\purpclaw.js donor`
  - returned 3 donor artifacts and doctrine text.
- `node bin\purpclaw.js donor report "MLM Hero"`
  - returned environmental tension as recovered/candidate and rejected MLM-specific mechanics.
- `node bin\purpclaw.js donor --json`
  - returned schema `purpclaw.donor-artifacts.v1`.
- `node bin\purpclaw.js donor heist ambient_tension_from_environment`
  - created a `purpclaw.heist-report.v1` report for Environmental tension.
- `node bin\purpclaw.js donor evolve ambient_tension_from_environment`
  - queued Auto-Evolve proposal `mut_mqzfx4n6_byc9q4` through `lib/evolution/mutator.js`.
- `node bin\purpclaw.js donor integrate competitive_conversation_victory_conditions validation:"reviewed"`
  - correctly failed with `Cannot integrate donor artifact. Missing: rejected_mechanics`.
- Temp-file DonorArchaeology integration test with stubbed timeline writer:
  - status became `integrated`
  - timeline event id was required/returned
  - validation note persisted
- `node bin\purpclaw.js evolve status`
  - confirmed 1 pending mutator proposal and showed the donor archaeology proposal.
- `node bin\purpclaw.js autoresearch status`
  - confirmed the existing AutoResearch front door reaches `E:/training` and reports prior local optimization results.
- `node bin\purpclaw.js auto-research queue`
  - confirmed the alias lists the curated hypothesis queue from `E:/training/program.md`.
- `node bin\purpclaw.js timeline recent 5`
  - confirmed `donor.heist_reported` was recorded in Timeline.

## Needed Next

1. Add stable synthetic timestamps for legacy Studio sessions that do not have original timestamps.
2. Add donor scouting that reads quarantined donor/reference folders and proposes behavioural laws, then queues them through `purpclaw donor evolve <artifact_id>` for Auto-Evolve governance.
3. Add decay/persistence rules for residue so some artifacts fade and others become traditions.
4. Backfill Presence from older Studio memories once timestamp normalization is done.
5. Add automatic world-generated incidents so Director mode can force incidents, while Weatherman can raise real ones.
