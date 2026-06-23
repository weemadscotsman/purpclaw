# 12 — LlamaIndex Agents

**Tier:** 3 (Specialized)  
**Vendor:** LlamaIndex (run-llama)  
**License:** MIT  
**Initial release:** 2023 (as GPT Index), renamed 2023  
**Last major update:** 2025 (Workflows, multi-agent, LlamaParse)

---

## What it is
Originally a data framework for connecting LLMs to private data (RAG). Now a full agent platform with **Workflows** (event-driven orchestration), **AgentWorkflow** (multi-agent), and rich RAG tooling (LlamaParse, LlamaHub).

## Core capabilities
- [x] RAG-first (100+ data connectors)
- [x] LlamaParse (PDF → structured)
- [x] AgentWorkflow (multi-agent)
- [x] Workflows (event-driven, async)
- [x] Function-calling agents
- [x] Query engines (sub-question, multi-step)
- [x] Structured outputs
- [x] LlamaHub (tool/integrations library)
- [x] Open-source + LlamaCloud (managed)
- [x] Multi-model

## Architecture
```python
Workflow(start → step_1 → step_2 → ...)
AgentWorkflow(supervisor_agent, worker_agent_1, worker_agent_2)
```
- Workflows = event-driven async
- Agents = LLM + tools + state

## Strengths
- Best RAG tooling in the ecosystem
- Workflows event model is clean
- LlamaParse best-in-class for PDF
- Strong enterprise features

## Weaknesses
- RAG-centric (less general than LangGraph)
- LlamaCloud = vendor pull
- Multi-agent still maturing
- Some API churn

## Best use case
Document-heavy agents, enterprise search, anything needing deep RAG. PDF processing, knowledge bases.

## PURPCLAW fit: 7/10
- Great for PURPCLAW's document knowledge agents
- LlamaParse for ingesting technical docs
- Workflows good alternative to LangGraph for RAG-centric flows

## Integration sketch
```python
from llama_index.core.agent.workflow import AgentWorkflow
from llama_index.llms.anthropic import Anthropic

workflow = AgentWorkflow.from_tools_or_functions(
    tools=[search_tool, parse_tool],
    llm=Anthropic(model="claude-sonnet-4.5"),
    system_prompt="You are PURPCLAW's doc agent...",
)
response = await workflow.run(user_msg="Find X in docs")
```

## Sources
- https://github.com/run-llama/llama_index
- https://docs.llamaindex.ai/
- LlamaIndex blog (2025)
