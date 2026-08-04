# 11 — Pydantic AI

**Tier:** 3 (Specialized)  
**Vendor:** Pydantic team  
**License:** MIT  
**Initial release:** 2024  
**Last major update:** 2025 (multi-agent, Graph support)

---

## What it is
Python agent framework built on Pydantic by the team behind Pydantic itself. Brings FastAPI-like ergonomics to agents: type-safe inputs/outputs, dependency injection, structured validation. Model-agnostic.

## Core capabilities
- [x] Type-safe agents (Pydantic models for I/O)
- [x] Dependency injection (`RunContext`)
- [x] Multi-model (OpenAI, Anthropic, Gemini, Ollama, etc.)
- [x] Tool registration with schema
- [x] Multi-agent (delegation, handoff)
- [x] Pydantic Graph (stateful graphs, inspired by LangGraph)
- [x] Streaming
- [x] Testing utilities (TestModel, FunctionModel)
- [x] Logfire integration (observability)
- [x] MCP support

## Architecture
```python
@agent.tool
async def my_tool(ctx: RunContext[MyDeps], x: int) -> str: ...
```
- Agents as classes with typed I/O
- RunContext injects deps + state
- Graph for complex orchestration

## Strengths
- Pydantic-native (fantastic DX for typed Python)
- Model-agnostic (truly portable)
- Built-in testing (TestModel replays)
- Dependency injection = clean architecture
- Lightweight

## Weaknesses
- Younger than LangGraph (less battle-tested at scale)
- Graph support newer
- Smaller community (growing fast)

## Best use case
Production Python agents where type safety and model portability matter. FastAPI-style teams. Multi-model deployments.

## PURPCLAW fit: 9/10 🏆
- PERFECT alignment with PURPCLAW's Pydantic-heavy data layer
- Type-safe contracts across agent boundaries
- TestModel ideal for PURPCLAW's precision testing culture
- Model-agnostic = flexible provider routing

## Integration sketch
```python
from pydantic_ai import Agent, RunContext

class PurpclawDeps:
    db: Database
    user: User

agent = Agent(
    "claude-sonnet-4.5",
    deps_type=PurpclawDeps,
    result_type=ActionPlan,
    system_prompt="You are ROBOT...",
)

@agent.tool
async def query_db(ctx: RunContext[PurpclawDeps], sql: str) -> list:
    return await ctx.deps.db.execute(sql)
```

## Sources
- https://github.com/pydantic/pydantic-ai
- https://ai.pydantic.dev/
- Pydantic blog (2025)
