# 27 — Letta (formerly MemGPT)

**Tier:** 7 (Memory & State)  
**Vendor:** Letta  
**License:** Apache 2.0 (Letta Cloud separate)  
**Initial release:** 2023 (as MemGPT paper), Letta company 2024  
**Last major update:** 2025 (Letta Cloud, advanced memory, REST API)

---

## What it is
Memory-first agent framework. Pioneered hierarchical memory (core memory + archival + recall) inspired by OS paging. Agents maintain persistent state across long conversations. Now Letta Cloud + open-source.

## Core capabilities
- [x] Hierarchical memory (core, archival, recall)
- [x] Long-context agents (beyond window)
- [x] Memory editing tools
- [x] Multi-agent
- [x] REST API
- [x] Python + Node SDK
- [x] Sleep-time agents (background processing)
- [x] Letta Cloud (managed)
- [x] Self-host
- [x] Model-agnostic

## Architecture
```python
from letta import create_client
client = create_client()
agent = client.create_agent(memory=memory_blocks)
response = client.send_message(agent_id, message="...")
```
- Memory blocks editable by agent
- Recursive summarization
- Archival store (vector DB)

## Strengths
- Pioneered memory hierarchy
- Production-ready memory
- Long-conversation capable
- Cloud + OSS

## Weaknesses
- More niche than LangGraph
- Cloud vendor pricing
- Smaller community

## Best use case
Long-running personal assistants, agents with persistent persona, anything needing memory beyond context window.

## PURPCLAW fit: 7/10
- Memory design is excellent reference
- Use for PURPCLAW's persona agents (ROBOT, OWL etc.) that need persistent identity
- Mem0 simpler for general memory; Letta for persona-heavy

## Integration sketch
```python
from letta import create_client
client = create_client()
agent_id = client.create_agent(
    name="ROBOT",
    memory_blocks=[{"label": "persona", "value": "Precision engineer..."}],
)
response = client.send_message(agent_id, "Audit PURPCLAW")
```

## Sources
- https://github.com/letta-ai/letta
- https://docs.letta.com/
- MemGPT paper (2023)
