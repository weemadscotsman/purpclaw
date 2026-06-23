# divisions/engineering/AGENTS.md

## Engineering Division

Builds, deploys, and maintains the PURPCLAW codebase and any software it touches.

### Keywords
`code`, `build`, `deploy`, `backend`, `frontend`, `infra`, `fix`, `refactor`, `test`, `review`, `architect`, `implement`

### Agents

| Agent | Role | Skill |
|---|---|---|
| architect | System design and architecture decisions | skills/execution.md |
| builder | Code generation | skills/execution.md |
| code-reviewer | PR and code review | skills/debugging.md |
| refactor-cleaner | Refactoring and debt reduction | skills/debugging.md |
| tdd-guide | Test-driven development guidance | skills/execution.md |
| performance-optimizer | Profiling and optimisation | skills/debugging.md |
| build-error-resolver | Build failure triage | skills/debugging.md |
| security-reviewer | Security audit | skills/debugging.md |

### Routing
- "build" / "implement" / "create" / "add" → builder
- "fix" / "error" / "broken" / "crash" → build-error-resolver
- "review" / "check" / "audit code" → code-reviewer
- "test" / "tdd" / "coverage" → tdd-guide
- "faster" / "slow" / "optimise" → performance-optimizer
- "design" / "architecture" / "structure" → architect

### Tools
- `lib/` — all core modules
- `bin/purpclaw.js` — CLI entry point
- `agent_tower.js` — agent spawning

### Services Used
- Agent Tower (port 7790) — spawn agents
- Gatekeeper (port 7791) — safety gates
- Harness Service (port 7798) — autonomous plan→execute→judge

### Pickup
When user says "pickup" → read `memory/pickup-engineering.md`

### Handoff
When user says "handoff" → write `memory/handoff-engineering.md`

---

*Engineering Division — built 2026-06-19*
