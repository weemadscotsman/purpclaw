# ⚠️ DEPRECATED — 2026-06-29

**This spec is historical.** `podcast_studio/` is now deprecated (see `docs/STUDIO_CANONICAL.md`).
The canonical Studio engine is `lib/studio.js`. Council Mode is implemented there, not via
`podcast_studio/`.

Retained as evidence of design evolution only.

---

# PURPCLAW Council Mode

Built: 2026-06-29

Council Mode is the project-governance evolution of `podcast_studio/`. It should use the existing persistent room, shared log, turn manager, identities, and dashboard shape, but the output must include a decision object and action plan, not only an entertainment episode.

Product naming stays human-facing:

- Podcast Studio = interface
- Council Chamber = internal room model
- Council Mode = decision protocol
- Workflow Registry = what the chamber can do
- Oracle = chair
- Weatherman = status feed
- Hermes = execution
- Smith/Neo = red-team and verification

## Current Asset

`podcast_studio/` already has useful council primitives:

- `shared_log.json` as the room memory/message bus
- `turn_manager.js` as the speaking order controller
- `episode_manager.js` as session lifecycle
- `llm_service.js` as model access
- `index.html` as the visible room
- `podcast_runner.js` and `run_episode.py` as runners

## Council Seats

| Seat | Job |
|---|---|
| Oracle | Chair, accepts the question, resolves conflicts, decides |
| Weatherman | Reports system weather, risk, drift, provider/build health |
| Architect | Structure, boundaries, refactors, contracts |
| PM | Scope, priority, sprint shape, acceptance |
| UX | Flow, accessibility, consistency, UI freeze guard |
| Smith | Red team, attacks assumptions and weak plans |
| Neo | Verifies evidence and confirms reality |
| Memory | Recalls prior decisions and prevents repeats |
| Hermes | Executes only approved action plans |

## Conversation Style

Council Mode must not flatten agents into sterile report generators. The Podcast Studio style is useful when banter, interruption, teasing, and odd reactions reveal working heuristics. The hard part is permanent worldview, not one-off comedy:

- Goose values speed, experimentation, fun, intuition, and shipping.
- Hermes values stability, evidence, architecture, maintenance, and recoverability.
- OpenClaude values assumptions, ethics, meaning, long-term effects, and coherence.
- Smith values failure discovery, attack surface, and edge cases.
- Neo values verification, proof, tests, and observed reality.

- Goose mocking over-engineering is a pressure test against ceremony.
- Hermes demanding logs is a pressure test against reckless action.
- Smith attacking an assumption is risk discovery.
- Neo refusing to verify without evidence is reality control.
- Memory calling out repeated arguments is institutional learning.

Functional banter is allowed and desirable when it exposes assumptions, broadens the search space, forces justification, or helps a participant change position. Scripted comedy that does not advance reasoning should be treated as noise.

## Session Flow

1. User asks a decision question.
2. Oracle accepts and scopes the question.
3. Weatherman reports current project conditions.
4. Oracle invites only the needed seats.
5. Seats respond in bounded turns.
6. Smith lists failure modes.
7. Neo verifies evidence.
8. Seats vote.
9. Oracle returns the decision.
10. Hermes receives an executable action plan.
11. Memory records the decision, votes, evidence, and next command.

The conversation is part of the algorithm. The decision packet is the artifact, but disagreement, personality, and revision are the search process that produces it.

## Decision Object

```json
{
  "schema": "purpclaw.council-decision.v1",
  "question": "Should we rebuild the Web UI or consolidate?",
  "decision": "consolidate",
  "confidence": 0.82,
  "weather": {},
  "votes": [
    { "seat": "architect", "vote": "consolidate", "reason": "duplicate routes increase migration risk" }
  ],
  "risks": [],
  "action_plan": [],
  "next_command": "purpclaw workflow solution.architecture-validate",
  "memory_write": true
}
```

## Boundaries

- Council Mode is not roleplay-only output.
- Council Mode should be read-only until Hermes is explicitly invoked.
- Podcast Studio may remain as the visual/running substrate, but governance sessions must be named Council sessions.
- UI changes must obey the PURPCLAW UI consolidation freeze before touching pages, components, themes, or routes.

## Runtime Step 1

`purpclaw council "<question>" --json` is the first callable Council layer. It is terminal-first and read-only:

- reads `purpclaw weather --json`
- reads `purpclaw next --json`
- reads git status as external stimulus
- reads recent `podcast_studio/shared_log.json` / episode memory as callback context
- returns a decision packet without executing Hermes by default
- does not run TTS
- does not publish to Telegram
- does not touch the dashboard
- does not write Studio memory yet

This keeps the first runtime slice boring and reliable while preserving the Studio as the later voice/dashboard interface.

## Dynamic Summons

Council Mode is not a fixed cast. It is a committee summons:

1. Oracle receives the question.
2. The summons layer classifies the meeting type.
3. A chair is selected from the domain, not always Oracle.
4. Relevant seats are invited from `registry/council-profiles.json`.
5. Subscribed specialists may interrupt when their trigger appears.
6. The meeting produces a decision, actions, and a next command.
7. The meeting dissolves.

Example chair rules:

- Engineering: Hermes chairs.
- Funding: Finance chairs.
- Creative: Lore chairs.
- Security incident: Smith chairs.
- Operations/weather: Weatherman chairs.
- Game development: Game Director chairs.
- Oracle observes and escalates only when ownership is unclear or consensus fails.

The point is not eighty agents talking. It is eighty agents available, five to eight summoned, then back to work.

## Agent Profiles

Every Council-capable agent should have a profile:

```json
{
  "id": "hermes",
  "skills": ["architecture", "coding", "debugging", "systems"],
  "personality": {
    "humour": 40,
    "confidence": 90,
    "curiosity": 80,
    "patience": 95
  },
  "attendance": ["engineering", "architecture", "incident"],
  "subscriptions": ["architecture", "provider", "runtime"],
  "relationships": {
    "goose": "friendly_rivalry",
    "smith": "professional_respect",
    "oracle": "reports_to"
  }
}
```

The current registry is `registry/council-profiles.json`.

## Interrupts

Meetings are alive. Attendance can change when a trigger appears:

- Weatherman can enter on provider latency, build health, drift, or incident.
- Finance can enter on spend, budget, subscription, grant, or pricing.
- Smith can enter on risk, security, failure, or edge cases.
- Memory can enter when a prior decision or repeated argument matters.
- Goose can enter when the meeting is getting too ceremonial. This is not always productive, but it is often useful.

## Drift Prevention

Long Council sessions must not become closed loops. The Council should periodically receive external stimuli:

- git diff/status
- bug reports
- user feature requests
- build telemetry
- provider outages
- latest commit
- Weatherman report
- SpendGate report
- selected external discussion only when explicitly requested

The goal is ambient cognition with fresh evidence, not a self-reinforcing room.

## Registered Workflows

- `council.review`
- `council.decide`
- `council.architecture`
- `council.ui-consolidation`
- `council.weather`
