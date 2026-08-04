# 04 — LangGraph

**Tier:** 1 (Open-Source Flagship)  ← Tier S by PURPCLAW fit
**Vendor:** LangChain
**License:** MIT
**Initial release:** 2024 (mid-year), GA Q1 2025
**Last major update:** LangGraph Platform GA, late 2025

---

## What it is
Stateful graph orchestration framework for building durable, long-running agent workflows. Core primitives: **Nodes** (functions or agents), **Edges** (conditional or fixed routing), **State** (typed schema passed between nodes), **Checkpointer** (persistence for resumable execution), **interrupt()** (human-in-the-loop pause/resume), **get_state()** (time-travel debugging). Successor pattern to "agent loop" designs that lose context across calls.

## Core capabilities
- [x] Stateful graph primitive (nodes + edges)
- [x] Persistence via Checkpointer (SQLite, Postgres, Redis backends)
- [x] Human-in-the-loop via interrupt() / Command(resume=)
- [x] Time-travel debugging (get_state for any past checkpoint)
- [x] Subgraph composition (graphs as nodes)
- [x] Parallel node execution (Send / Map)
- [x] Streaming (values, updates, events, debug modes)
- [x] LangGraph Platform (managed runtime, queues, cron, workers, A2A)
- [x] MCP client + server support
- [x] LangSmith tracing integration

## Architecture
```
START ──→ node_a ──→ node_b ──→ node_c ──→ END
              │            │
              ↓            ↓
         [State dict] [Checkpointer DB]
              │            │
              └──── interrupt() pause/resume ────┘
```
- Cyclic or DAG graphs; edges can be conditional
- State is the single source of truth passed between nodes
- Checkpointing happens at every node boundary
- Time-travel: rewind to any prior state, edit, replay

## Strengths
- Most production-ready state model in the ecosystem
- Best debugging story (full state history, replay, fork)
- Best long-running / durable execution story
- Subgraph composition scales to very large agent meshes
- First-class MCP support
- LangSmith integration is mature

## Weaknesses
- Graph mental model has a steeper learning curve than linear handoffs
- Vendor coupling to LangChain ecosystem (LangSmith, LangGraph Platform)
- Boilerplate to set up Checkpointer + persistence correctly
- Streaming API is rich but verbose
- Pure orchestration layer — does not bundle LLM provider, tool registry, or memory

## Best use case
Durable, multi-step agent workflows that need to survive crashes, pause for human approval, and be debugged by replaying state. Multi-day workflows, regulated-industry approval flows, complex multi-agent coordination.

## PURPCLAW fit: 10/10 (Tier S)
- **Honest caveat:** LangGraph is not installed in `package.json`. PURPCLAW has its own graph-orchestration primitives in `lib/orchestrator.js` and `lib/agent-router.js` but they are not checkpointed or time-travelable.
- **Real Tier S reason:** the *pattern* (stateful graph + persistence + interrupt + replay) is what PURPCLAW needs for durable execution. The Q1 report's actual conclusion says: *"adopt LangGraph-style state machines for durable execution"*. That is the part to learn from, not the dependency.
- **Action:** treat LangGraph as a reference architecture for `lib/orchestrator.js` and `lib/job-chain.js`, not as a dependency.

## Integration sketch (concept)
```python
# LangGraph reference — what to learn, not what to import
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

class State(TypedDict):
    messages: list
    approved: bool

def plan(state): ...
def execute(state): ...
def review(state): ...

g = StateGraph(State)
g.add_node("plan", plan)
g.add_node("execute", execute)
g.add_node("review", review)
g.add_edge(START, "plan")
g.add_conditional_edges("review", lambda s: "execute" if s["approved"] else END)
g.add_edge("execute", END)
app = g.compile(checkpointer=MemorySaver())

# Human-in-the-loop
for event in app.stream({"messages": ["audit"]}, config={"thread_id": "1"}):
    if "__interrupt__" in event:
        decision = input("approve? ")
        app.invoke(Command(resume=decision), config={"thread_id": "1"})
```

## PURPCLAW parity — what we already have
| LangGraph concept | PURPCLAW equivalent |
|---|---|
| StateGraph | `lib/orchestrator.js` (sequential pipeline) |
| Checkpointer | `lib/agent-session.js` (in-memory), `lib/session-store.js` (persistent JSON) |
| interrupt() | `lib/gate-pipeline.js` (approval queue) |
| get_state() / time-travel | not implemented — gap |
| Send / parallel | `lib/job-chain.js` (sequential only — gap) |
| LangGraph Platform | `lib/api-harness-kernel.js` (kernel jobs) |

## Sources
- https://github.com/langchain-ai/langgraph
- https://langchain-ai.github.io/langgraph/
- LangChain blog, Q4 2025 ("LangGraph Platform GA")
- "Agent Reliability" — Harrison Chase, AI Engineer Summit 2025
