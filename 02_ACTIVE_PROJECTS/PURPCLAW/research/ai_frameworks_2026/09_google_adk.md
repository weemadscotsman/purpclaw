# 09 — Google Agent Development Kit (ADK)

**Tier:** 3 (Specialized)  
**Vendor:** Google  
**License:** Apache 2.0  
**Initial release:** 2025 (Cloud Next)  
**Last major update:** 2025 (A2A protocol, Agent Garden)

---

## What it is
Open-source Python framework (sister to Vertex AI Agent Engine) for building, evaluating, and deploying agents. Designed as code-first alternative to LangGraph. Native A2A protocol support. Works locally or deploys to Agent Engine.

## Core capabilities
- [x] Agent primitive (LLM + instructions + tools)
- [x] Multi-agent (sub_agents, sequential, parallel, loop)
- [x] Custom tools (FunctionTool, OpenAPI, MCP)
- [x] Built-in tools (Search, Code Exec, Vertex AI Search)
- [x] Session management
- [x] Memory service
- [x] Callbacks (lifecycle hooks)
- [x] A2A protocol (Agent-to-Agent over HTTP/JSON-RPC)
- [x] Agent evaluation framework
- [x] Agent Garden (template library)

## Architecture
```python
root_agent = LlmAgent(
    name="coordinator",
    sub_agents=[researcher, analyst],
    tools=[search_tool],
)
```
- Hierarchical agent trees
- Workflow agents for orchestration
- A2A for inter-agent communication across processes

## Strengths
- Clean code-first API
- A2A is the future of interop
- Free + open source (Engine optional)
- Strong Google tooling integration

## Weaknesses
- Gemini-optimized (though model-agnostic)
- Younger ecosystem than LangGraph
- Some docs still in flux
- Agent Engine still new

## Best use case
GCP-native agent development, A2A-aware agents, anything needing a code-first alternative to LangGraph with Google's tooling.

## PURPCLAW fit: 6/10
- Worth tracking for A2A adoption
- Use if PURPCLAW expands to GCP
- ADK's clean API is appealing

## Integration sketch
```python
from google.adk.agents import LlmAgent, SequentialAgent

researcher = LlmAgent(name="researcher", model="gemini-2.5-pro", instruction="...")
writer = LlmAgent(name="writer", model="gemini-2.5-pro", instruction="...")

pipeline = SequentialAgent(name="pipeline", sub_agents=[researcher, writer])
```

## Sources
- https://github.com/google/adk-python
- https://google.github.io/adk-docs/
- Google Cloud Next 2025
