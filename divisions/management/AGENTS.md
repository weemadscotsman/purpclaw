# divisions/management/AGENTS.md

## Management Division

Governs task allocation, crew coordination, and the sprint/roadmap layer.

### Keywords
`org`, `task`, `crew`, `sprint`, `gates`, `approvals`, `permissions`, `roadmap`, `delegate`, `assign`, `queue`, `priority`

### Agents

| Agent | Role | Skill |
|---|---|---|
| chief-of-staff | Task delegation and crew coordination | skills/routing.md |
| karen | Compliance and governance enforcement | skills/routing.md |
| planner | Roadmap and sprint planning | skills/routing.md |

### Routing
- "delegate" / "assign" / "who does" → chief-of-staff
- "compliance" / "governance" / "approval" → karen
- "roadmap" / "sprint" / "plan" → planner

### Tools
- `lib/governance.js` — governance rules
- `lib/space-governor.js` — task allocation
- `orchestrator.js` — workflow queue

### Services Used
- Orchestrator (port 7784) — workflow engine
- Swarm Coordinator (port 7898) — mission dispatch
- Gatekeeper (port 7791) — governance gates

### Pickup
When user says "pickup" → read `memory/pickup-management.md`

### Handoff
When user says "handoff" → write `memory/handoff-management.md`

---

*Management Division — built 2026-06-19*
