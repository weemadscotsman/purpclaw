# Engineering Handoff

## State
Batch 1 registry truth reconciliation is implemented for agents. The Oracle + Weatherman operating workflow has also been captured as an architecture spec at `docs/spec/ORACLE_WEATHERMAN_WORKFLOW.md`.

JS/Python source syntax was audited on 2026-06-29. Final result: 485 JavaScript files and 164 Python files checked in owned source scope, with zero syntax failures after two narrow fixes. Audit artifact: `docs/audit/JS_PY_SOURCE_AUDIT_2026-06-29.md`.

The first BMad-organ transplant is implemented as a read-only Oracle next-step/workflow registry layer. `purpclaw next` now classifies task scale, inspects known planning artifacts, determines the current phase, and returns one concrete next command. `purpclaw workflow` lists the typed planning/runtime workflow catalog without changing the existing `purpclaw workflows` live-orchestrator command. The catalog now includes Council Mode workflow IDs, but not the runtime council runner.

Podcast Studio has been treated as a real subsystem, not a toy. Its agent config now includes permanent worldview fields so Goose/Hermes/OpenClaude disagree from stable values rather than one-off scripted banter. The LLM prompt path, turn manager context, Telegram runner, and Python fallback runner now feed those worldviews into conversation.

`purpclaw council "<question>"` now exists as the first terminal-first Council runtime slice. It is read-only and does not launch TTS, Telegram, dashboard, or Studio processes. It composes Weatherman, workflow/next-step state, git status, and recent Studio memory into a Council session with Oracle, Weatherman, Hermes, Goose, OpenClaude, Smith, Neo, and a decision/next command.

Council is now dynamic rather than fixed-cast. `registry/council-profiles.json` defines meeting types, chairs, skills, attendance tags, subscriptions, personalities, relationships, interrupt priorities, and default lines. `purpclaw council` classifies the question, selects a domain chair, summons 5-8 relevant seats, allows subscribed interrupts, emits actions, and dissolves the meeting.

PURPCLAW now has a canonical generated agent registry at `agents/AGENT_REGISTRY.json`, with a human index at `agents/AGENTS_INDEX.md`. The live distinct roster is 85 agents:

- 41 persona agents from `agents/*.md`
- 44 swarm agents after dedupe
- source inputs observed by the generator: 41 persona files, 45 swarm profiles, 35 tower runtime entries, 44 routing matrix entries, and 34 division table mappings
- exhaustive agent-like source audit currently sees 1,530 files, classified into canonical, generated, division, documentation/reference, runtime output, archive/vendor, and other buckets

Runtime consumers now use `lib/agent-registry.js` instead of directly assuming `agent_profiles.json` is the whole roster.

## Progress
- Replaced `scripts/sync-agents.js` with a canonical generator that scans:
  - `agents/*.md`
  - `agent_profiles.json`
  - `agent_tower.js`
  - `agent_routing_matrix.js`
  - `divisions/*/AGENTS.md`
  - repository-wide agent-like source paths, excluding only `.git`, `.next`, and `node_modules`
- Added `lib/agent-registry.js` as the shared reader for generated registry data, with generator fallback.
- Rewired `lib/system-manifest.js` agent output to read the canonical registry.
- Rewired `lib/mcp-resources.js` `purpclaw://agents` and `purpclaw://agent/{id}` to read the canonical registry. This fixes the old object-vs-`{agents: []}` mismatch that could report zero agents.
- Updated `lib/commands/roster.js` to report the canonical registry first, keeping the old tower/persona comparison as fallback.
- Extended `lib/commands/registry-audit.js` with an `agents` audit domain, `buildReport()` compatibility export, and generated/live/index drift fields.
- Added `npm run sync:agents`.
- Regenerated:
  - `agents/AGENT_REGISTRY.json`
  - `agents/AGENTS_INDEX.md`
  - `registry/index.json`
  - `lib/reports/registry-audit.json`
- Added `docs/spec/ORACLE_WEATHERMAN_WORKFLOW.md`, adapting the BMad-style greenfield workflow into PURPCLAW's Discovery, Planning, Solutioning, Implementation, and Operational Layer model.
- Added `docs/audit/JS_PY_SOURCE_AUDIT_2026-06-29.md`.
- Fixed JS parse errors in:
  - `docs/legacy/root-cleanup-2026-06-06/gen_api.js`
  - `skills/purpclaw-chat-gateway/templates/stub.js`
- Added `registry/workflows.json` with 6 task-complexity levels and 20 typed workflows across discovery, planning, solutioning, implementation, runtime, and council protocol.
- Added `lib/workflow-registry.js` for registry reads, artifact-state detection, task scale classification, phase detection, and next-step report generation.
- Added `lib/commands/next.js` for `purpclaw next [task] [--json]`.
- Added `lib/commands/workflow.js` for `purpclaw workflow [id] [--json]`.
- Wired `bin/purpclaw.js` with `next`, `helpme`, and singular `workflow` dispatch plus help entries.
- Added `next-step` and `council-mode` to `lib/surface-capabilities.js`.
- Added `docs/spec/PURPCLAW_BMAD_ORGANS_PLAN.md`.
- Added `docs/spec/PURPCLAW_COUNCIL_MODE.md`, defining Podcast Studio as the future Council Mode substrate.
- Added Council workflow IDs:
  - `council.review`
  - `council.decide`
  - `council.architecture`
  - `council.ui-consolidation`
  - `council.weather`
- Updated `docs/spec/PURPCLAW_COUNCIL_MODE.md` with the internal naming split:
  - Podcast Studio = interface
  - Council Chamber = internal room model
  - Council Mode = decision protocol
  - Workflow Registry = what it can do
  - Oracle = chair
  - Weatherman = status feed
  - Hermes = execution
  - Smith/Neo = red-team and verification
- Added Council conversation guidance: banter, disagreement, interruption, and odd reactions are valid when they expose assumptions, force justification, broaden search, or change a participant's position. Scripted comedy that does not advance reasoning is noise.
- Added permanent worldviews to `podcast_studio/config.js`:
  - Goose: speed, experimentation, fun, intuition, shipping
  - Hermes: stability, evidence, architecture, maintenance, recoverability
  - OpenClaude: assumptions, ethics, meaning, long-term effects, coherence
- Added `COUNCIL_WORLDVIEWS` and `describeWorldview()` to the Studio config.
- Updated `podcast_studio/llm_service.js` to include worldview text in the system prompt and to treat functional banter as reasoning pressure.
- Updated `podcast_studio/podcast_runner.js` and `podcast_studio/podcast_telegram.js` to pass the full agent profile into LLM generation.
- Updated `podcast_studio/turn_manager.js` to include worldview in built context.
- Updated `podcast_studio/run_episode.py` with matching worldview fields and prompt guidance.
- Updated `podcast_studio/README.md` with worldview/Council Mode semantics.
- Removed hardcoded Podcast Studio MiniMax and Telegram secrets from the active Studio JS/Python paths; they now read from environment variables.
- Added `lib/commands/council.js` for `purpclaw council "<question>" [--json]`.
- Wired `bin/purpclaw.js` with `council` and `decide` dispatch plus help entry.
- Updated `lib/surface-capabilities.js` so `council-mode` points at the real terminal command.
- Updated `docs/spec/PURPCLAW_COUNCIL_MODE.md` to mark Runtime Step 1 as callable and document drift-prevention stimuli.
- Added `registry/council-profiles.json` with 20 Council-capable profiles and meeting types:
  - engineering chaired by Hermes
  - funding chaired by Finance
  - creative chaired by Lore
  - security chaired by Smith
  - operations chaired by Weatherman
  - game chaired by Game Director
- Updated `lib/commands/council.js` so attendance is query-like instead of fixed:
  - classify question tags
  - pick workflow
  - classify meeting type
  - select chair
  - invite default and scored specialists
  - allow interrupts from subscribed specialists
  - keep meetings bounded to the configured attendee cap
  - emit per-agent actions

## Decisions
- Do not collapse persona agents and swarm agents into one runtime format yet. They serve different roles: persona prompts are dispatchable specialist behavior, while swarm profiles are the animal workforce metadata.
- The canonical registry dedupes by lowercase key/name and preserves all contributing sources in `sources` plus duplicate source types in `also`.
- `agent_profiles.json` remains a swarm input, not the complete roster.
- `.kiro/agents/` no longer exists in this checkout; no duplicate mirror was moved.
- The source sweep records docs, translations, vendor/archive, and runtime output as audit evidence, but only runtime/persona/profile/tower/routing/division sources contribute to the 85-agent roster.
- `node_modules`, `.git`, and `.next` are skipped by the source sweep to avoid dependency/generated noise and pathological scan cost.
- The workflow registry is a planning catalog, not the active orchestrator workflow ledger. Keep `purpclaw workflow` singular for catalog lookups and `purpclaw workflows` plural for active/recent live workflows.
- Council Mode is documented, surfaced as a capability, and callable through the terminal-first `purpclaw council` runner. It is not yet wired to Studio TTS/Telegram/dashboard.
- The next-step engine is intentionally read-only. It recommends commands but does not execute Hermes, mutate artifacts, or write decisions.
- Keep the product vibe as Podcast Studio, but treat its governance use internally as Council Chamber/Council Mode. Do not rename the visible studio unless the UI/product layer explicitly asks for it.
- Podcast Studio visible identity should remain intact. Council Chamber is the internal governance model; the same runtime can host funny personality episodes or decision episodes depending on topic.
- Functional banter is part of the reasoning engine when it exposes a worldview, critiques a blind spot, or forces another agent to justify itself. Do not strip personality out while making Council Mode more useful.
- Studio runtime credentials are now expected via `MINIMAX_API_KEY`, optional `MINIMAX_MODEL`, `PODCAST_TELEGRAM_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN`, and `PODCAST_TELEGRAM_CHAT_ID` or `TELEGRAM_CHAT_ID`.
- The first Council runner intentionally injects external stimuli to prevent echo-chamber drift: Weatherman, workflow next-step state, git status, and Studio memory.
- Oracle is no longer always the meeting chair. Oracle observes/escalates unless the meeting has no better domain chair.
- Goose may interrupt architecture/ceremony meetings, but the command keeps attendance bounded by replacing the weakest nonessential attendee when full.

## Validation
- `node --check scripts\sync-agents.js`
- `node --check lib\agent-registry.js`
- `node --check lib\system-manifest.js`
- `node --check lib\mcp-resources.js`
- `node --check lib\commands\roster.js`
- `node --check lib\commands\registry-audit.js`
- `node scripts\sync-agents.js --check`
  - registry has 85, live build 85
- `node scripts\sync-registry.js --check`
  - skills drift +0, agents drift +0
- `node tests\registry-audit.test.js`
  - passed; surfaces=12, findings=1, conflicts=0, high_risk=0
- `node -e "const m=require('./lib/system-manifest'); const a=m.getAgents(); console.log(a.length)"`
  - 85
- `node lib\drift-watcher.js --json`
  - registry ok, capability ok, docs ok, liveweb skipped because web not reachable
  - only remaining drift is version/build stamp: 9 files changed since build #11
- JS/Python syntax audit:
  - `node --check` across 485 owned-scope `.js` files: 0 failures
  - `python -m py_compile` across 164 owned-scope `.py` files: 0 failures
- `node --check lib\workflow-registry.js`
- `node --check lib\commands\next.js`
- `node --check lib\commands\workflow.js`
- `node --check bin\purpclaw.js`
- `node --check lib\surface-capabilities.js`
- `node -e "const r=require('./lib/workflow-registry'); console.log(r.listWorkflows().length); console.log(r.nextStep('I finished architecture what now').next_command)"`
  - 15 workflows
  - next command currently resolves to `purpclaw workflow discovery.brainstorm` because no project brief artifact is present in the known paths
- `node bin\purpclaw.js next --json`
  - passed; returns schema `purpclaw.next-step.v1`
- `node bin\purpclaw.js workflow --json`
  - passed; originally returned 15 workflows; after Council entries it returns 20 workflows
- `node bin\purpclaw.js workflow list`
  - passed; prints the workflow catalog via the singular registry command
- `node bin\purpclaw.js workflow runtime.council --json`
  - passed; returns the Council Decision Session workflow
- `node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('registry/workflows.json','utf8')); console.log(r.workflows.length); for (const id of ['council.review','council.decide','council.architecture','council.ui-consolidation','council.weather']) console.log(id, !!r.workflows.find(w=>w.id===id));"`
  - 20 workflows
  - all five requested Council IDs present
- `node bin\purpclaw.js workflow council.review --json`
  - passed
- `node bin\purpclaw.js workflow council.decide --json`
  - passed
- `node bin\purpclaw.js workflow council.ui-consolidation --json`
  - passed
- `node bin\purpclaw.js capabilities --verify --json`
  - passed; 22 capabilities checked, validation ok
- `node bin\purpclaw.js help | Select-String -Pattern "purpclaw next|purpclaw workflow"`
  - passed; both help entries are visible
- `node --check lib\commands\council.js`
- `node --check bin\purpclaw.js`
- `node --check lib\surface-capabilities.js`
- `node bin\purpclaw.js council "Should we consolidate the UI?" --json`
  - passed; returns schema `purpclaw.council-session.v1`
  - routes UI questions to `council.ui-consolidation`
  - returns next command `purpclaw workflow council.ui-consolidation`
  - reports `execution.tts=false`, `execution.telegram=false`, `execution.dashboard=false`, `execution.writes_memory=false`
- `node bin\purpclaw.js council "Should Oracle become the default router?"`
  - passed; prints terminal Council turns and decision
- `node bin\purpclaw.js capabilities --verify --json`
  - passed after Council command metadata update
- `node bin\purpclaw.js help | Select-String -Pattern "purpclaw council"`
  - passed
- `node -e "const p=require('./registry/council-profiles.json'); console.log(p.schema); console.log(p.profiles.length); console.log(Object.keys(p.meeting_types).join(','));"`
  - schema `purpclaw.council-profiles.v1`
  - 20 profiles
  - meeting types: engineering, funding, creative, security, operations, game
- `node bin\purpclaw.js council "Should we rewrite the provider router?" --json`
  - passed; meeting `engineering`, chair `hermes`, 8 attendees: hermes, oracle, smith, weatherman, architect, neo, memory, goose
- `node bin\purpclaw.js council "Should we apply for grant funding?" --json`
  - passed; meeting `funding`, chair `finance`, 7 attendees: finance, oracle, analytics, grant-writer, brand, marketing, memory
- `node bin\purpclaw.js council "The game needs better audio and QA" --json`
  - passed; meeting `game`, chair `game-director`, 8 attendees: game-director, oracle, art, audio, engine, qa, lore, memory
- `node bin\purpclaw.js council "Provider latency doubled" --json`
  - passed; meeting `operations`, chair `weatherman`, 8 attendees
- `node -e "JSON.parse(require('fs').readFileSync('registry/council-profiles.json','utf8')); console.log('council-profiles-ok')"`
  - passed
- `node --check podcast_studio\config.js`
- `node --check podcast_studio\llm_service.js`
- `node --check podcast_studio\podcast_runner.js`
- `node --check podcast_studio\podcast_telegram.js`
- `node --check podcast_studio\turn_manager.js`
- `python -m py_compile podcast_studio\run_episode.py`
- `node -e "const c=require('./podcast_studio/config'); console.log(c.PODCAST_AGENTS.map(a => [a.id, a.councilSeat, a.worldview.values.length].join(':')).join('\n')); console.log(c.describeWorldview(c.PODCAST_AGENTS[0]).includes('PRESSURE TEST'))"`
  - confirmed all three current Studio agents have council seats and worldview values
- `node -e "const llm=require('./podcast_studio/llm_service'); llm.generateChatCompletion([{role:'user', content:'ping'}]).then(r => { console.log(r === null ? 'missing-key-ok' : 'unexpected-response'); })"`
  - passed; missing `MINIMAX_API_KEY` is handled predictably
- `rg -n "sk-cp-|8935779439|AAESo|433353701" podcast_studio`
  - no matches in `podcast_studio`
- Attempted to read `divisions/engineering/memory/handoff-template.md`; it does not exist, so this handoff follows the existing engineering handoff structure.

## Open Tasks
- Decide whether to run `npm run stamp` for the version manifest. I did not stamp automatically.
- If implementing the Oracle + Weatherman workflow, start with phase-aware Oracle output fields and read-only workflow artifact checks. Do not make Oracle or Weatherman mutate files.
- Wire `purpclaw next` into `lib/oracle.js` report output as the phase/current-work recommendation.
- Add git status, latest test evidence, and truth snapshot checks to `artifactState()`.
- Next Council step: optionally add `--write-memory` to append a Council session artifact to Studio memory. Keep default read-only.
- Later Council step: bridge the Council decision topic into the existing Podcast Studio TTS/Telegram pipeline without replacing it.
- Future Council hardening: learn subscriptions and relationships from the canonical 85-agent registry instead of keeping all profile metadata manually curated.
- Rotate any real MiniMax or Telegram credentials that were previously present in Studio files before using the public or shared repo.
- Implement export packs only after canonical planning artifact paths are settled.
- For JS/Python cleanup, next step is a dependency-aware root-file quarantine pass. Do not blindly delete root service files; many are active runtime entrypoints.
- Batch 2: steering/context loader.
- Batch 3: task system separation.
- Batch 4: stress/evidence integration.
- Batch 5: podcast/studio/media capability.
- Batch 6: skill/tool provenance.
- Batch 7: archive/donor quarantine.
- Real Photon endpoint validation is still pending until Photon API base URL/key and exact send/status paths are provided.
- Real Raft endpoint validation is still pending until Raft API base URL/key and exact status/dispatch paths are provided.

## Next Moves
If continuing Batch 1, the next useful hardening step is to add a focused unit test for `lib/agent-registry.js` and `scripts/sync-agents.js` model/source normalization.

Otherwise move to Batch 2: steering/context loader.
