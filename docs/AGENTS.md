# AGENTS.md — PURPCLAW Root Map

> Every agent starts here. Read this first. Then read Router.md.

## Root Law

1. **Always read the map before acting.** If you don't know where to go, read `Router.md`.
2. **Files are the brain.** The AI is the engine. State lives in files, not in context.
3. **Pickup before action.** Before working on anything, read the relevant pickup file.
4. **Handoff after action.** After completing work, write the relevant handoff file.
5. **Division first.** If the task spans divisions, the orchestrating division owns the handoff.
6. **UI freeze: before touching any UI/page/component/theme, read [docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/AGENT_RULES.md](./docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/AGENT_RULES.md) and follow it.**

## The Map

```
PURPCLAW Root
├── Router.md                    ← start here for any task routing
├── divisions/
│   ├── management/              ← org, crew, sprint, gates
│   ├── intelligence/            ← raven, owl, shark
│   ├── science/                 ← research, analysis, anti-bullshit
│   ├── security/                ← threat, scan, permissions
│   ├── operations/              ← execution, agents, pipelines
│   ├── media-operations/       ← video, image, audio, generation
│   ├── voice-infrastructure/    ← TTS, STT, transcription
│   ├── creative/               ← content, goop, lore
│   └── engineering/             ← code, build, deploy
├── docs/
│   └── spec/
│       └── PURPCLAW_UI_CONSOLIDATION_FREEZE/   ← UI freeze binding spec (2026-06-21)
│           ├── FREEZE.md                       ← binding, do not bypass
│           ├── CANONICAL_LAYOUT.md
│           ├── DUPLICATE_PURGE_MAP.md
│           ├── TRACE_TERMINAL_CONSOLIDATION.md
│           └── AGENT_RULES.md
└── skills/
    ├── routing.md              ← routing skill
    ├── execution.md             ← task execution skill
    ├── debugging.md            ← debugging skill
    └── web-search.md           ← web search skill
```

## Routing First

Before doing anything, read `Router.md`. It maps user intent to the correct division.

```
If user says → "pickup"   → read divisions/<div>/memory/pickup-<div>.md
If user says → "handoff"  → write divisions/<div>/memory/handoff-<div>.md
If user says → "status"   → read Router.md → find division → read division/AGENTS.md
If user says → "build"    → Router.md → engineering/
If user says → "research" → Router.md → science/
```

## Runtime Services

The live system runs at these ports (see `lib/runtime/ports.js`):

| Service | Port | Protocol |
|---|---|---|
| Unified API | 7780 | HTTP |
| TCP Control | 7778 | TCP JSON-RPC |
| EventBus | 7782 | HTTP pub/sub |
| Orchestrator | 7784 | HTTP + SSE |
| Agent Tower | 7790 | HTTP |
| Voice Bridge | 7792 | HTTP + WebSocket |

## Pickup / Handoff Protocol

**Pickup** — agent resumes from last handoff:
```
1. Read the division's memory/pickup-<div>.md
2. Read the last handoff-<div>.md
3. Report: "Resuming from <state>. <open tasks> open."
```

**Handoff** — agent saves state for next session:
```
1. Read memory/handoff-template.md
2. Fill: state, progress, decisions, open_tasks, next_moves
3. Write memory/handoff-<div>.md (overwrite)
4. Report: "Handoff complete. <N> tasks open."
```

---

*PURPCLAW routing layer — built 2026-06-19*
