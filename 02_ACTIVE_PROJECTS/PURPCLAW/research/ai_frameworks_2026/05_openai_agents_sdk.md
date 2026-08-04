# 05 — OpenAI Agents SDK

**Tier:** 2 (Open-Source Flagship)  
**Vendor:** OpenAI  
**License:** MIT  
**Initial release:** 2025 (replaces/extends experimental `swarm`)  
**Last major update:** Late 2025 (tracing UI, Realtime API integration)

---

## What it is
Lightweight, production-grade Python SDK for building multi-agent workflows. Successor to OpenAI's experimental `swarm` repo. Core primitives: **Agents** (LLM + instructions + tools), **Handoffs** (agent-to-agent delegation), **Guardrails** (input/output validation), **Sessions** (conversation memory), **Tracing** (built-in observability).

## Core capabilities
- [x] Agent primitive with tool use
- [x] Handoffs (agent-to-agent routing)
- [x] Function tools (Python → JSON schema)
- [x] Guardrails (parallel validation)
- [x] Session memory (auto)
- [x] Built-in tracing (dashboard)
- [x] MCP server support
- [x] Realtime API support (voice agents)
- [x] Structured outputs (Pydantic/Zod)
- [x] Streaming

## Architecture
```python
agent_a → handoff() → agent_b
   ↓
tool_a, tool_b
```
- Linear or delegated flows
- No explicit graph — control flow emerges from handoffs
- Tracing records every step

## Strengths
- Very low ceremony
- First-class tracing (free)
- OpenAI-native (best with GPT-4o/5)
- MCP support
- Realtime voice agents

## Weaknesses
- OpenAI model coupling (some abstraction but optimized for OpenAI)
- Less expressive than LangGraph for complex flows
- Handoffs can become spaghetti at scale

## Best use case
Quick OpenAI-native multi-agent prototypes and production agents with simple delegation patterns. Voice agents via Realtime API.

## PURPCLAW fit: 8/10
- Excellent for OpenAI-backed PURPCLAW agents
- Use alongside LangGraph (LangGraph for complex, OpenAI SDK for simple)
- Built-in tracing reduces observability boilerplate

## Integration sketch
```python
from agents import Agent, Runner

router = Agent(
    name="router",
    instructions="Route to specialist",
    handoffs=[specialist_agent],
)

result = await Runner.run(router, input="Audit the swarm")
```

## Sources
- https://github.com/openai/openai-agents-python
- https://openai.github.io/openai-agents-python/
- OpenAI DevDay 2025
