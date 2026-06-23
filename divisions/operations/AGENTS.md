# divisions/operations/AGENTS.md

## Operations Division

Dispatches, orchestrates, and manages the execution of tasks and agent workflows.

### Keywords
`execution`, `task`, `agent`, `workflow`, `pipeline`, `run`, `orchestrate`, `spawn`, `dispatch`, `schedule`, `queue`

### Agents

| Agent | Role | Skill |
|---|---|---|
| orchestrator | Workflow engine and task routing | skills/execution.md |
| turtle | Long-running task execution | skills/execution.md |
| octopus | Parallel multi-agent fan-out | skills/routing.md |
| loop-operator | Recursive task loops | skills/execution.md |
| gan-planner | Goal achievement planning | skills/routing.md |

### Routing
- "run" / "execute" / "dispatch" → orchestrator
- "spawn multiple agents" / "parallel" → octopus
- "loop" / "repeat" / "recursive" → loop-operator
- "plan this" / "achieve goal" → gan-planner

### Tools
- `orchestrator.js` — workflow engine (port 7784)
- `agent_tower.js` — agent spawning (port 7790)
- `swarm_coordinator.js` — swarm dispatch (port 7898)

### Services Used
- Orchestrator (port 7784) — workflow engine
- Agent Tower (port 7790) — agent spawning
- Swarm Coordinator (port 7898) — multi-agent coordination
- EventBus (port 7782) — event publishing

### Pickup
When user says "pickup" → read `memory/pickup-operations.md`

### Handoff
When user says "handoff" → write `memory/handoff-operations.md`

---

*Operations Division — built 2026-06-19*
