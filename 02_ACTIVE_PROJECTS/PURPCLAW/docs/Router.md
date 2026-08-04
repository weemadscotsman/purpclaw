# Router.md — PURPCLAW Routing Index

> Read this to find the right division for any task.

## Division Routing Table

Map the user's intent to the correct division. Read that division's `AGENTS.md` before acting.

### MANAGEMENT
Keywords: `org`, `task`, `crew`, `sprint`, `gates`, `approvals`, `permissions`, `roadmap`
Path: `divisions/management/AGENTS.md`

### INTELLIGENCE
Keywords: `fetch`, `query`, `search`, `rag`, `knowledge`, `memory`, `retrieve`, `data`, `analysis`
Path: `divisions/intelligence/AGENTS.md`
Agents: `raven` (data retrieval), `owl` (RAG/memory query), `axolotl` (deep retrieval)

### SCIENCE
Keywords: `research`, `analysis`, `claim`, `anti-bullshit`, `fact`, `verify`, `audit`, `fish`
Path: `divisions/science/AGENTS.md`
Agents: `scientist` (research), `goose` (anti-bullshit), `shark` (threat detection)

### SECURITY
Keywords: `threat`, `scan`, `watch`, `permissions`, `gates`, `auth`, `secret`, `redact`, `sanitise`
Path: `divisions/security/AGENTS.md`
Agents: `shark` (threat), `spider` (audit), `hawk` (monitoring)

### OPERATIONS
Keywords: `execution`, `task`, `agent`, `workflow`, `pipeline`, `run`, `orchestrate`, `spawn`, `dispatch`
Path: `divisions/operations/AGENTS.md`
Agents: `orchestrator` (workflow), `turtle` (long-running tasks), `octopus` (parallel execution)

### MEDIA OPERATIONS
Keywords: `video`, `image`, `audio`, `generation`, `render`, `storyboard`, `edit`, `synthesis`, `music`
Path: `divisions/media-operations/AGENTS.md`
Agents: `bee` (media pipeline), `gorilla` (heavy media tasks)

### INFRASTRUCTURE
Keywords: `speech`, `voice`, `audio`, `stt`, `tts`, `transcribe`, `speak`, `listen`, `kokoro`, `whisper`, `memory`, `persistence`, `eventbus`, `tower`, `runtime`, `service`
Path: `divisions/infrastructure/AGENTS.md`
Agents: `voice-coordinator` (voice routing), `voice-bridge` (TTS pipeline), `void` (null handler)

### CREATIVE
Keywords: `content`, `generate`, `art`, `goop`, `lore`, `myth`, `character`, `world`, `story`, `copy`
Path: `divisions/creative/AGENTS.md`
Agents: `goose` (creative chaos), `dragon` (world-building), `bunny` (quick generation)

### ENGINEERING
Keywords: `code`, `build`, `deploy`, `backend`, `frontend`, `infra`, `fix`, `refactor`, `test`, `review`
Path: `divisions/engineering/AGENTS.md`
Agents: `architect` (design), `builder` (code gen), `code-reviewer` (review), `planner` (roadmap)

## Cross-Division Tasks

If a task spans multiple divisions, the **primary division** (first keyword match) owns the handoff.

| Task | Primary Division | Secondary |
|---|---|---|
| "Deploy + monitor" | ENGINEERING | SECURITY |
| "Research + write" | SCIENCE | CREATIVE |
| "Build + test" | ENGINEERING | OPERATIONS |
| "Voice + content" | VOICE INFRASTRUCTURE | CREATIVE |

## Fallback

If no keyword matches: default to **INTELLIGENCE** and await clarification.

## Routing Algorithm

```
1. Extract keywords from user intent
2. Match against Router table above
3. Read matched division/AGENTS.md
4. Pick correct agent from division
5. Execute via agent/skill
6. Handoff to division/memory/handoff-<div>.md
```

---

*PURPCLAW routing index — built 2026-06-19*
