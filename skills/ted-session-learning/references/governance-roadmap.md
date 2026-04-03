# Governance Layer Roadmap (Phase 2-4)
**Session:** May 18 2026 — after importing 1043 convs into ted_history.db

## What We Discussed

### Phase 1 (COMPLETED)
Import + normalize everything. Done: ted_history.db with 1043 convs, 49108 msgs, FTS5.

### Phase 2 (Next)
Semantic search — not keyword. Vector embeddings per conversation.
- Want: "show me every time I discussed decentralized governance tied to DreamForge"
- Not: "find word governance"
- Tech: sqlite-vss for vector similarity on top of existing FTS5

### Phase 3
Timeline stitching — projects as living organisms:
- birth → mutation → abandonment → resurrection → integration
- See project arcs across years, not isolated sessions

### Phase 4
Behavior engine — operational intelligence:
- Detect overload periods
- Surface abandoned high-value projects
- Identify execution windows
- Detect repeated failure loops
- "Ted historically finishes more when he narrows from 50 projects to 5"
- NOT predicting Ted — understanding operational patterns

### Governance Monsters to Address
| Monster | What it does |
| Context drift | agents slowly stop behaving consistently |
| Dependency hell | tiny updates break unrelated systems |
| Recursive spaghetti | every subsystem orchestrates every other |

### Architecture Direction
- External observation layer (not coupled to core Hermes)
- Self-correcting via capability audit
- Explicit contracts between modules
- Capability boundaries — finance skill can't invoke meme skill

## Key Quote
"We're building long-term cognition" — the goal is persistent AI continuity, not chatbot memory.