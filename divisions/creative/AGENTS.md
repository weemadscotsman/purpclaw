# divisions/creative/AGENTS.md

## Creative Division

Generates content, lore, characters, and creative assets. The goop engine.

### Keywords
`content`, `generate`, `art`, `goop`, `lore`, `myth`, `character`, `world`, `story`, `copy`, `write`, `draft`, `narrative`, `persona`, `voice`

### Agents

| Agent | Role | Skill |
|---|---|---|
| goose | Creative chaos and rapid ideation | skills/execution.md |
| dragon | World-building and long-form lore | skills/execution.md |
| bunny | Quick copy and short-form content | skills/execution.md |
| penguin | Structured long-form output | skills/routing.md |

### Routing
- "quick" / "short" / "copy" / "caption" / "tweet" → bunny
- "lore" / "world" / "backstory" / "myth" → dragon
- "creative" / "ideate" / "brainstorm" → goose
- "structured document" / "report" / "article" → penguin

### Tools
- `lib/goop-playground/` — creative goop engine
- `lib/personality.js` — persona generation
- `lib/mochi.js` — companion personality

### Services Used
- Cognitive Spine (port 7880) — creative reasoning
- Companion Chorus (port 7797) — companion reactions
- Avatar Bridge (port 7777) — avatar personality

### Pickup
When user says "pickup" → read `memory/pickup-creative.md`

### Handoff
When user says "handoff" → write `memory/handoff-creative.md`

---

*Creative Division — built 2026-06-19*
