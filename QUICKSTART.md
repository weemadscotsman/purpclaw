# PURPCLAW Quick Start

> Version: 0.3.0 - Updated: 2026-06-29 - Verified against: local CLI audit - Status: CURRENT

## Install

```bash
npm install
```

Full live setup instructions are in `docs/INSTALL.md`. That file is derived from the current CLI, setup command, service registry, PM2 ecosystem, and `.env.example`.

For local development, run commands through Node from the project root:

```bash
node bin/purpclaw.js help
```

## First Checks

```bash
node bin/purpclaw.js status
node bin/purpclaw.js registry audit --json
node bin/purpclaw.js feature --verify --json
```

## Project Guidance

```bash
node bin/purpclaw.js next --json
node bin/purpclaw.js workflow --json
node bin/purpclaw.js workflow council.decide
```

Note: `purpclaw next` currently needs a phase-detection repair. It may under-report this repo as Discovery because formal brief/PRD files are missing even though runtime architecture exists.

## Council

```bash
node bin/purpclaw.js council "Should we rewrite the provider router?"
node bin/purpclaw.js council "Should we rewrite the provider router?" --json
node bin/purpclaw.js council leaderboard 5
```

Council Mode selects relevant seats instead of forcing every soul into every meeting.

## Studio And Ecology

```bash
node bin/purpclaw.js studio modes
node bin/purpclaw.js studio world
node bin/purpclaw.js timeline recent 10
node bin/purpclaw.js presence tea_room
node bin/purpclaw.js residue tea_room
```

Studio is the conversational interface. Timeline, Presence, and Residue are the institutional memory layers around it.

## Donor Archaeology

```bash
node bin/purpclaw.js donor
node bin/purpclaw.js donor report "MLM Hero"
node bin/purpclaw.js donor evolve ambient_tension_from_environment
```

Promotion is gated:

```bash
node bin/purpclaw.js donor integrate <artifact_id> validation:"validated by tests/review"
```

An artifact cannot become `integrated` without behavioural law, destination, rejected mechanics, validation note, and Timeline event.

## Evolution

```bash
node bin/purpclaw.js evolve status
node bin/purpclaw.js autoresearch status
node bin/purpclaw.js auto-research queue
```

Auto-Evolve and AutoResearch are different:

- Auto-Evolve governs code/planner mutation proposals.
- AutoResearch runs local training experiments under `E:/training`.

## Runtime Services

The runtime service map is still owned by:

```txt
service_registry.js
ecosystem.config.js
lib/runtime/ports.js
```

Boot commands depend on your local environment. Prefer safe startup when in doubt:

```bash
node bin/purpclaw.js profiles
node bin/purpclaw.js safe-start --core
node bin/purpclaw.js start --profile=voice
node bin/purpclaw.js services
node bin/purpclaw.js doctor
```

Mission Control is served on `http://127.0.0.1:3030/mission`.

## Before Editing

Read:

```txt
Router.md
divisions/engineering/AGENTS.md
divisions/engineering/memory/pickup-engineering.md
```

For UI work, also read:

```txt
docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/AGENT_RULES.md
```
