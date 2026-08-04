# 10 — Smolagents

**Tier:** 3 (Specialized / Niche)
**Vendor:** HuggingFace
**License:** Apache 2.0
**Initial release:** 2025
**Last major update:** Q4 2025 (multi-agent, planning improvements)

---

## What it is
Minimalist (~1k lines of core code) code-first agent framework from HuggingFace. Built around the philosophy that "agents are just LLMs calling tools in a loop" — keeps the entire framework to roughly 1,000 lines of Python so you can read the whole thing in an afternoon. Includes both a `CodeAgent` (writes Python to act) and a `ToolCallingAgent` (emits JSON tool calls).

## Core capabilities
- [x] Two agent types: CodeAgent (writes Python) and ToolCallingAgent (JSON)
- [x] ~1k lines of core code (auditable in one sitting)
- [x] Tool decorator with auto schema generation
- [x] Multi-agent orchestration (managed agent pattern)
- [x] Planning step (optional, off by default)
- [x] LiteLLM integration (any model)
- [x] Streaming output
- [x] OpenAI-compatible, Anthropic, HuggingFace Inference, local Transformers
- [x] Hub tool sharing (HF Spaces)

## Architecture
```
User prompt → Manager agent (planning)
                  ↓
            Step 1: code/tool call → observation
            Step 2: code/tool call → observation
            ...
            Final answer
```
- No graph, no state schema — just a ReAct loop with optional planning
- CodeAgent executes generated Python in a sandboxed subprocess

## Strengths
- Tiny codebase, fully auditable
- CodeAgent is genuinely novel (executes real Python, not just JSON)
- LiteLLM integration is one of the cleanest
- Great for learning and research

## Weaknesses
- No durable execution / checkpointing
- No built-in observability (relies on external)
- No HITL primitives
- Limited production hardening
- CodeAgent sandboxing has had security advisories

## Best use case
Research, education, prototypes where you want to see every line of the framework. Lightweight production agents that don't need durable execution or complex orchestration.

## PURPCLAW fit: 4/10 (Tier D — Monitor only)
- Research value only. The "1000 lines" philosophy is a useful check on framework bloat.
- **Do not adopt as a dependency.** PURPCLAW already has its own `lib/agent-loop.js` (~370 LOC) doing the same job without an extra dep.
- **Pattern to learn:** the "auditable in one sitting" principle — if any of our lib modules grow past 2k LOC, they should be split or rewritten.

## Integration sketch (concept)
```python
from smolagents import CodeAgent, HfApiModel, tool

@tool
def get_weather(city: str) -> str:
    """Returns weather for a city."""
    return f"Sunny in {city}"

agent = CodeAgent(tools=[get_weather], model=HfApiModel())
result = agent.run("What's the weather in Tokyo?")
```

## PURPCLAW parity
| Smolagents concept | PURPCLAW equivalent |
|---|---|
| CodeAgent / ToolCallingAgent | `lib/agent-loop.js` (ReAct loop with native tool calls) |
| Tool decorator | `lib/capability-registry.js` (capability-as-tool model) |
| LiteLLM integration | `lib/llm-provider.js` (21 providers) |
| Manager agent | `lib/agent-router.js` (routing by intent) |

## Sources
- https://github.com/huggingface/smolagents
- https://huggingface.co/docs/smolagents
- HuggingFace blog, 2025 launches
