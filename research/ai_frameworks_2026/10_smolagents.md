# 10 — HuggingFace smolagents

**Tier:** 3 (Specialized)  
**Vendor:** HuggingFace  
**License:** Apache 2.0  
**Initial release:** 2024  
**Last major update:** 2025 (multi-step agents, planning)

---

## What it is
Minimalist agent library from HuggingFace. "Smol" = small footprint, opinionated design. Core abstraction: agents that **write Python code** as actions (not JSON tool calls). Two flavors: `CodeAgent` (writes code) and `ToolCallingAgent` (traditional JSON tool use).

## Core capabilities
- [x] CodeAgent (LLM writes Python to act)
- [x] ToolCallingAgent (JSON tool calls)
- [x] Eager (planning) vs planning modes
- [x] Multi-step agents
- [x] Custom tools (@tool decorator)
- [x] Sandboxed execution (E2B, Docker, local)
- [x] Hub integration (push/pull agents)
- [x] Streaming + step visualization
- [x] Open-weight model friendly

## Architecture
```python
@tool
def my_tool(x: int) -> int: return x * 2

agent = CodeAgent(tools=[my_tool], model=HfApiModel())
agent.run("Compute...")
```
- Agent loops: think → write code → execute → observe
- Code execution is the action space

## Strengths
- Code-as-action is powerful for math/logic
- Tiny dependency footprint
- HuggingFace ecosystem alignment
- Open-weight model support

## Weaknesses
- Code execution = security risk (must sandbox)
- Less structured than LangGraph
- Younger project
- Debugging code-written-by-LLM is harder

## Best use case
Math/logic/reasoning tasks, research prototypes, anything benefiting from code execution as a tool. Open-weight model deployments.

## PURPCLAW fit: 6/10
- Good for specialized reasoning agents
- Sandbox it carefully (E2B or Docker)
- Use as a specialist worker under LangGraph supervisor

## Integration sketch
```python
from smolagents import CodeAgent, HfApiModel, tool

@tool
def search_docs(query: str) -> str:
    return "..."

agent = CodeAgent(tools=[search_docs], model=HfApiModel())
result = agent.run("Find PURPCLAW documentation on X")
```

## Sources
- https://github.com/huggingface/smolagents
- https://huggingface.co/docs/smolagents
- HF blog (2024)
