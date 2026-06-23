# 06 — Microsoft AutoGen

**Tier:** 2 (Open-Source Flagship)  
**Vendor:** Microsoft Research  
**License:** MIT (Creative Commons for research components)  
**Initial release:** 2023 (v0.x), 2025 (v0.4+ rewrite)  
**Last major update:** Late 2025 (Actor model rewrite, AutoGen Studio)

---

## What it is
Framework for building **conversational** and **actor-model** multi-agent systems. Most mature research-backed agent framework. v0.4+ rewrite introduces async actor model, decoupled agents, message routing, and AutoGen Studio for visual debugging.

## Core capabilities
- [x] Conversational multi-agent (group chat)
- [x] Actor model (async, distributed)
- [x] Code execution (Docker sandbox)
- [x] Human-in-the-loop patterns
- [x] AutoGen Studio (visual IDE)
- [x] AutoGen Bench (benchmarking)
- [x] Multi-model support (OpenAI, Azure, local)
- [x] RAG integration
- [x] Magentic-One (generalist web agent)
- [x] AgentOps integration

## Architecture
- Agents as actors communicating via messages
- Routers/dispatchers
- Runtime: standalone, distributed (gRPC)
- Two stacks: `autogen-agentchat` (high-level) and `autogen-core` (low-level)

## Strengths
- Research pedigree (Microsoft Research)
- Flexible (both chat and actor models)
- Visual debugging (Studio)
- Active community
- Strong academic citations

## Weaknesses
- Complex API surface (two stacks)
- Breaking changes between versions (0.2 → 0.4)
- Docs lag implementation
- Heavier than OpenAI Agents SDK

## Best use case
Research, complex multi-agent systems, anything needing actor-model async messaging. Good when you need fine-grained control over agent communication.

## PURPCLAW fit: 7/10
- Excellent for advanced PURPCLAW patterns
- Studio great for debugging
- Slight overkill for simple flows
- Use AutoGen for research, LangGraph for production

## Integration sketch
```python
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat

researcher = AssistantAgent("researcher", model_client=client)
critic = AssistantAgent("critic", model_client=client)

team = RoundRobinGroupChat([researcher, critic])
result = await team.run(task="Analyze PURPCLAW telemetry")
```

## Sources
- https://github.com/microsoft/autogen
- https://microsoft.github.io/autogen/
- Magentic-One paper (2024)
