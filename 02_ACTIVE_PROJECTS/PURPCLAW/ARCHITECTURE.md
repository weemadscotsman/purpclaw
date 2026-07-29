# PURPCLAW Architecture

> Version: 0.3.0 - Updated: 2026-06-29 - Verified against: local CLI audit - Status: CURRENT

## Thesis

PURPCLAW is a local-first AI workstation OS.

The core abstraction is no longer "many agents answering a user." The current architecture is:

```txt
World
  -> Oracle / domain chair
  -> dynamic council
  -> decision
  -> action
  -> memory
  -> weather
  -> evolution
```

Agents are not only tool wrappers. They have identity, values, relationships, history, and governance roles.

## Major Layers

| Layer | Purpose | Primary files |
|---|---|---|
| CLI | Terminal front door | `bin/purpclaw.js`, `lib/commands/*` |
| Runtime services | API, eventbus, orchestrator, tower, voice, workers | `service_registry.js`, `ecosystem.config.js`, `lib/runtime/ports.js` |
| Agent registry | Canonical executable/persona roster | `agents/AGENT_REGISTRY.json`, `lib/agent-registry.js` |
| Soul registry | Organisational identity model | `registry/souls.json`, `registry/soul-interviews.json` |
| Council | Governance, chairs, meetings, voting | `lib/commands/council.js`, `registry/council-profiles.json`, `registry/council-votes.json` |
| Studio | Behavioural environments and sessions | `lib/studio.js`, `registry/studio-modes.json` |
| Workflow | Phase and next-step catalog | `lib/workflow-registry.js`, `registry/workflows.json` |
| Timeline | Event ledger and pattern memory | `lib/timeline.js`, `registry/timeline.json` |
| Presence | Shared spaces and occupancy residue | `lib/presence.js`, `registry/presence.json` |
| Residue | Durable traces left by meetings/events | `lib/residue.js`, `registry/residue.json` |
| Donor Archaeology | Feature provenance and behavioural laws | `lib/donor-archaeology.js`, `registry/donor-artifacts.json` |
| Auto-Evolve | Governed mutation proposal queue | `lib/evolution/mutator.js`, `agent_work/evolution/proposed.jsonl` |
| AutoResearch | Local model optimization loop | `lib/commands/autoresearch.js`, `E:/training/lib/autoresearch-orchestrator.js` |

## Organisation Model

PURPCLAW now uses dynamic councils rather than fixed panels.

```txt
Question or world event
  -> classify domain
  -> select chair
  -> invite relevant specialists
  -> allow subscribed interrupts
  -> debate / verify / red-team
  -> record decision
  -> assign actions
  -> update memory/timeline
```

Oracle is the senior coordinating intelligence, but not every meeting chair. Engineering can be chaired by Hermes, security by Smith, operations by Weatherman, creative by Lore, and so on.

## Studio Modes

Studio modes are social contracts, not just UI modes.

Current modes include:

```txt
council
radio
arena
vent
emergency
brainstorm
interview
news
commentary
directors_cut
after_hours
```

Each mode changes behavioural physics: criticism rules, authority, voting, interruption, emergency hierarchy, or ambient context.

## Ecology

PURPCLAW now records not only what happened, but what remains afterwards.

```txt
Timeline: what happened
Presence: where it happened and who was around
Residue: what was left behind
Meeting Memory: what the session felt like
World State: current operational conditions
Weather: what the system thinks is changing
```

This is the foundation for institutional continuity.

## Evolution

There are two separate evolution paths:

1. AutoResearch optimizes local training experiments under `E:/training`.
2. Auto-Evolve queues governed software/planner mutations under `agent_work/evolution`.

Donor Archaeology feeds Auto-Evolve. It does not apply changes directly.

```txt
Donor/reference source
  -> behavioural_law
  -> provenance
  -> rejected_mechanics
  -> candidate artifact
  -> Auto-Evolve proposal
  -> approval/rejection
```

## Known Gaps

The architecture is now real but not fully harmonized.

Current repair targets:

- Command modules need a public/internal/dead classification.
- `purpclaw next` needs stronger project-state detection.
- Runtime services, capabilities, surfaces, API routes, and CLI commands need a crosswalk.
- API routes need ownership metadata.
- Archive/donor/generated folders need scan boundaries.
- Timeline should become the common operational event spine.

Canonical audit:

```txt
docs/audit/FOLDER_INTEGRATION_AUDIT_2026-06-29.md
```
