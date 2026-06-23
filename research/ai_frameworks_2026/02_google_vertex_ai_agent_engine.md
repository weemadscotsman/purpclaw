# 02 — Google Vertex AI Agent Engine

**Tier:** 1 (Enterprise / Hyperscaler)  
**Vendor:** Google Cloud  
**License:** Proprietary (managed) + open-source ADK  
**Initial release:** 2024 (Agentspace preview), GA 2025  
**Last major update:** 2025 (Agent Engine GA + Agent Development Kit)

---

## What it is
Managed runtime + developer toolkit for building, deploying, and operating AI agents on Google Cloud. Pairs **Agent Development Kit (ADK)** — open-source Python framework — with **Agent Engine** — fully managed deployment/scaling/observability. Integrates tightly with Gemini models, Vertex AI Search, BigQuery, and Cloud SQL.

## Core capabilities
- [x] Open-source ADK (code-first)
- [x] Managed runtime (Agent Engine)
- [x] Multi-agent orchestration (sequential, parallel, loop)
- [x] Long-running operations (hours/days)
- [x] Built-in memory store
- [x] Built-in observability (Cloud Trace, Cloud Logging)
- [x] Gemini-native + open models
- [x] A2A (Agent-to-Agent) protocol support
- [x] Tool ecosystem (Search, Code Exec, Function Calling)
- [x] Agent Garden (templates)

## Architecture
- ADK = local dev framework (similar to LangGraph)
- Agent Engine = production runtime (managed)
- Sessions in Cloud SQL / Spanner
- Memory via Vertex AI Memory Bank
- Tools via Function Calling or MCP

## Strengths
- Clean separation between dev (ADK) and prod (Engine)
- Excellent Gemini integration
- Strong enterprise features (private endpoints, CMEK)
- A2A protocol forward-looking
- Google-quality observability

## Weaknesses
- GCP lock-in (Engine)
- ADK still maturing (vs LangGraph)
- Smaller community than LangChain ecosystem
- Pricing complexity

## Best use case
GCP-first enterprises building production agents at scale. Particularly good for long-running, stateful workflows (multi-day processes, customer journeys).

## PURPCLAW fit: 7/10
- Good if multi-cloud GCP is on the roadmap
- ADK is genuinely code-first and worth evaluating
- Less relevant for desktop-local deployment

## Integration sketch
```python
from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner

agent = Agent(
    name="purpclaw_researcher",
    model="gemini-2.5-pro",
    instruction="Research AI agent frameworks",
    tools=[search_tool, file_tool],
)
runner = InMemoryRunner(agent=agent)
```

## Sources
- https://cloud.google.com/blog/products/ai-machine-learning/announcing-vertex-ai-agent-engine
- https://google.github.io/adk-docs/
- https://github.com/google/adk-python
