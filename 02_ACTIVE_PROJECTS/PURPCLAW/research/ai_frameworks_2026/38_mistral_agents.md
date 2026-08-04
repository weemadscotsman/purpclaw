# 38 — Mistral Agents

**Tier:** 2 (Vendor flagship, model-coupled)
**Vendor:** Mistral AI
**License:** Apache 2.0 (SDK), proprietary (models)
**Initial release:** Late 2024 (Mistral Agents API); Python SDK Q1 2025
**Last major update:** Q4 2025 (multi-agent, tool streaming)

---

## What it is
Mistral AI's official agent SDK + managed deployment. Tightly integrated with Mistral models (Mistral Large, Codestral, Pixtral, etc.). Provides a Python SDK for building agents and a managed runtime (similar to Vertex AI Agent Engine but on Mistral's infrastructure).

## Core capabilities
- [x] Python SDK (sync + async)
- [x] Agent primitive (model + instructions + tools)
- [x] Function tool calling
- [x] JSON-mode structured outputs
- [x] Streaming (SSE)
- [x] Multi-agent delegation
- [x] Vision via Pixtral
- [x] Code via Codestral
- [x] Managed deployment (Mistral Cloud)
- [x] MCP support (Q4 2025)

## Architecture
```
Agent (Mistral Large 2) → tool call → observation → final answer
       ↓
   tool_1, tool_2, tool_3
```
- Linear ReAct loop
- Multi-agent via delegation calls

## Strengths
- Best-in-class Mistral model access
- Strong vision (Pixtral)
- Strong code (Codestral)
- EU data residency (Mistral is French)
- Open weights available for some models

## Weaknesses
- Mistral model coupling (less flexible than OpenAI/Anthropic APIs)
- Smaller ecosystem than LangChain
- Managed runtime is Mistral Cloud only
- No on-prem equivalent
- Smaller developer community than US-based alternatives

## Best use case
Teams in EU needing data residency. Code generation tasks. Vision-heavy agents. Anyone already on Mistral infrastructure.

## PURPCLAW fit: 6/10 (Tier B — Selective)
- **Pattern to learn:** Mistral's approach to multi-vendor agent SDKs (model-coupled but well-designed) is worth comparing to PURPCLAW's `lib/llm-provider.js` (vendor-agnostic).
- **No integration value** — PURPCLAW already routes to any provider via LiteLLM-style abstraction.
- **EU residency** is a real differentiator if you have EU customers.
- **Action:** add Mistral to the provider list in `lib/llm-provider.js` (likely already there) and `lib/usage-governor.js` key detection.

## Integration sketch (concept)
```python
from mistralai import Mistral

client = Mistral(api_key="...")
agent = client.agents.create(
    model="mistral-large-latest",
    instructions="Audit the swarm and report",
    tools=[{"type": "function", "function": {"name": "list_jobs"}}]
)
response = client.agents.run(agent_id=agent.id, input="audit")
```

## PURPCLAW parity
| Mistral concept | PURPCLAW equivalent |
|---|---|
| Mistral SDK | `lib/llm-provider.js` (21 providers, Mistral one of them) |
| Mistral Cloud runtime | none — self-hosted only (matches our model) |
| Vision (Pixtral) | not yet exposed as agent capability |
| Code (Codestral) | not yet exposed |
| MCP support | `lib/mcp.js` (active) |

## Sources
- https://docs.mistral.ai/capabilities/agents/
- https://github.com/mistralai/client-python
- Mistral blog Q4 2025
- "Mistral Agents" launch announcement
