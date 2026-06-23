# divisions/intelligence/AGENTS.md

## Intelligence Division

Retrieves, queries, and synthesises information. The knowledge backbone of PURPCLAW.

### Keywords
`fetch`, `query`, `search`, `rag`, `knowledge`, `memory`, `retrieve`, `data`, `analysis`, `find`

### Agents

| Agent | Role | Skill |
|---|---|---|
| raven | Data retrieval and web search | web-search.md |
| owl | RAG and memory query | rag-query.md |
| axolotl | Deep retrieval and long-context synthesis | deep-search.md |

### Routing
- "search the web" / "find" / "fetch" → raven
- "what do we know about" / "memory" / "rag" → owl
- "deep dive" / "comprehensive" / "full analysis" → axolotl

### Tools
- `lib/tools/` — search, file read, memory matrix query
- `lib/runtime/ports.js` — service ports
- `lib/vector/` — RAG embeddings

### Services Used
- Cognitive Spine (port 7880) — Memory Matrix
- Knowledge Pool (port 7885) — knowledge routing
- Context Bus (port 7881) — inter-service context

### Pickup
When user says "pickup" → read `memory/pickup-intelligence.md`

### Handoff
When user says "handoff" → write `memory/handoff-intelligence.md`

---

*Intelligence Division — built 2026-06-19*
