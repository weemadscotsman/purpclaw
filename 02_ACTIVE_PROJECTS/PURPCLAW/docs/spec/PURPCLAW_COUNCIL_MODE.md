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

## First Runtime Step

Add `purpclaw council "<question>" --json` as a wrapper that:

- reads `purpclaw weather --json`
- reads `purpclaw next --json`
- appends a council session to `podcast_studio/shared_log.json`
- returns a decision packet without executing Hermes by default

## Registered Workflows

- `council.review`
- `council.decide`
- `council.architecture`
- `council.ui-consolidation`
- `council.weather`
