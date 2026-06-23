# 17 — Flowise

**Tier:** 5 (Visual / No-Code)  
**Vendor:** FlowiseAI (now Logto?)  
**License:** Apache 2.0  
**Initial release:** 2023  
**Last major update:** 2025 (Flowise 3.x, agentflows)

---

## What it is
Open-source drag-and-drop UI for building LLM apps and agents. Built on top of LangChain/LlamaIndex. No-code/low-code for non-developers. Exports to JSON/YAML.

## Core capabilities
- [x] Visual drag-and-drop builder
- [x] LangChain + LlamaIndex under the hood
- [x] Chatflows (single agent)
- [x] Agentflows (multi-agent v2)
- [x] 100+ nodes (LLMs, retrievers, tools)
- [x] API generation from flow
- [x] Embeddable chat widgets
- [x] Self-hostable
- [x] Marketplace for custom nodes
- [x] Credentials management

## Architecture
- Web app (React frontend, Node backend)
- Flows stored as JSON
- Export/import flows
- LangChain code auto-generated

## Strengths
- Lowest barrier to entry
- Visual debugging
- Export to code (escape hatch)
- Active community

## Weaknesses
- Visual abstraction limits complex logic
- LangChain coupling
- Performance overhead vs hand-coded
- Limited version control flow

## Best use case
Non-developer builders, rapid prototyping, internal tools, demo/MVP. Citizen developers.

## PURPCLAW fit: 4/10
- Niche use case (non-dev agent builders)
- Could enable "agent marketplace" in PURPCLAW for non-engineers
- Not for core engine work

## Integration sketch
```bash
# Self-host Flowise
docker run -d --name flowise -p 3000:3000 flowiseai/flowise
```

## Sources
- https://github.com/FlowiseAI/Flowise
- https://flowiseai.com/
- Flowise docs (2025)
