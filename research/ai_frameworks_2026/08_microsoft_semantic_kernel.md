# 08 — Microsoft Semantic Kernel

**Tier:** 2 (Open-Source Flagship)  
**Vendor:** Microsoft  
**License:** MIT  
**Initial release:** 2023  
**Last major update:** 2025 (Agent Framework GA, multi-agent orchestration)

---

## What it is
Enterprise-grade SDK for building AI applications and agents in .NET, Python, and Java. Originally LLM orchestration, now a full agent framework with Microsoft Agent Framework (merging Semantic Kernel + AutoGen). Strong in .NET ecosystems.

## Core capabilities
- [x] Multi-language SDK (.NET, Python, Java)
- [x] Function calling / plugins
- [x] Planners (now Agents)
- [x] Memory connectors (many vector DBs)
- [x] Multi-agent orchestration (handoff, group chat, concurrent)
- [x] Microsoft Agent Framework (combined with AutoGen)
- [x] Process framework (durable workflows)
- [x] Azure AI Foundry integration
- [x] MCP support
- [x] OpenAPI tool generation

## Architecture
- Kernel = central orchestrator
- Plugins = tools/functions
- Filters = middleware
- Agents = LLM + instructions + plugins
- Process Framework = durable stateful workflows

## Strengths
- First-class .NET support (rare)
- Strong enterprise patterns (DI, middleware, filters)
- Multi-language consistency
- Tight Azure integration
- Mature memory abstractions

## Weaknesses
- Heavier than minimalist frameworks
- .NET ecosystem bias
- Some Python ergonomics rough
- Microsoft Agent Framework still settling

## Best use case
Enterprise .NET shops, Azure-first deployments, anything needing battle-tested patterns with strong typing. Durable processes.

## PURPCLAW fit: 6/10
- Strong if PURPCLAW ships .NET components
- Otherwise, less relevant than Python-native options
- Process Framework worth watching for durable workflows

## Integration sketch
```python
from semantic_kernel import Kernel
from semantic_kernel.agents import ChatCompletionAgent

kernel = Kernel()
agent = ChatCompletionAgent(kernel=kernel, name="ROBOT", instructions="...")
response = await agent.get_response(messages=["..."])
```

## Sources
- https://github.com/microsoft/semantic-kernel
- https://learn.microsoft.com/en-us/semantic-kernel/
- Microsoft Build 2025
