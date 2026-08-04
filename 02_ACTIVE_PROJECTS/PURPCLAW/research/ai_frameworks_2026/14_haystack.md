# 14 — Haystack Agents

**Tier:** 3 (Specialized)  
**Vendor:** deepset  
**License:** Apache 2.0  
**Initial release:** 2020  
**Last major update:** 2025 (Haystack 2.x, AI Components, deepset Cloud)

---

## What it is
Production framework for building custom LLM applications, especially RAG and search. Originated at deepset. Components are composable pipelines. Agents built on top of component graph.

## Core capabilities
- [x] Pipeline-based composition
- [x] 100+ components (retrievers, rankers, generators)
- [x] Agent primitive (ReAct, conversational)
- [x] Multi-agent (experimental)
- [x] Hybrid retrieval (BM25 + dense)
- [x] Multiple vector DBs
- [x] Document stores (Elasticsearch, Weaviate, etc.)
- [x] deepset Cloud (managed)
- [x] Streaming
- [x] Production-grade (used by Siemens, Meta, etc.)

## Architecture
```python
pipeline.add_component("retriever", retriever)
pipeline.add_component("prompt_builder", pb)
pipeline.add_component("llm", llm)
pipeline.connect("retriever.documents", "prompt_builder.documents")
pipeline.connect("prompt_builder.prompt", "llm.prompt")
```
- Graph-of-components
- Strong typing via component contracts

## Strengths
- Battle-tested in enterprise
- Excellent retrieval ecosystem
- Clean component model
- Strong documentation
- Multi-language (Python primary)

## Weaknesses
- Heavier than minimalist frameworks
- Agent support is good but not flagship
- Component version coupling
- Less "AI native" feel than LangGraph

## Best use case
Enterprise RAG systems, document search at scale, hybrid retrieval pipelines. Companies needing production-grade search.

## PURPCLAW fit: 6/10
- Strong for PURPCLAW's RAG/knowledge agents
- Good alternative to LlamaIndex for retrieval-heavy work
- Use for specialized search agents

## Integration sketch
```python
from haystack import Pipeline
from haystack.components.agents import Agent
from haystack.components.generators import OpenAIGenerator

agent = Agent(
    generator=OpenAIGenerator(model="gpt-4o"),
    tools=[search_tool],
)
result = agent.run(query="Find PURPCLAW docs on agent telemetry")
```

## Sources
- https://github.com/deepset-ai/haystack
- https://haystack.deepset.ai/
- deepset blog
