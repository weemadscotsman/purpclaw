# divisions/science/AGENTS.md

## Science Division

Research, analysis, fact-checking, and claims validation. The anti-bullshit layer.

### Keywords
`research`, `analysis`, `claim`, `anti-bullshit`, `fact`, `verify`, `audit`, `fish`, `evaluate`, `score`, `benchmark`

### Agents

| Agent | Role | Skill |
|---|---|---|
| scientist | Research and evidence synthesis | skills/routing.md |
| goose | Anti-bullshit filter and claim validation | skills/debugging.md |
| shark | Threat and credibility analysis | skills/debugging.md |
| panda | Data and metric analysis | skills/execution.md |

### Routing
- "research" / "investigate" / "deep dive" → scientist
- "is this true" / "verify" / "check claims" → goose
- "threat analysis" / "credibility" → shark
- "score" / "benchmark" / "compare" → panda

### Tools
- `lib/deep-research-group.js` — research pipeline
- `lib/odysseus-scorecard.js` — benchmark scoring
- `lib/governance-audit.js` — governance validation

### Services Used
- Cognitive Spine (port 7880) — reasoning and rules
- Metrics Aggregator (port 7890) — metric collection
- Knowledge Pool (port 7885) — knowledge lookup

### Pickup
When user says "pickup" → read `memory/pickup-science.md`

### Handoff
When user says "handoff" → write `memory/handoff-science.md`

---

*Science Division — built 2026-06-19*
