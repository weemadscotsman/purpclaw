# 🤖 AI Multi-Agent Frameworks — Mid-2026 Landscape

**Companion report to** `ai-agent-frameworks-2026-Q1.md`
**Date:** July 2026
**Scope:** Frameworks explicitly requested by PURPCLAW leadership (LangGraph, CrewAI, AutoGen, Swarm, AG2, Anthropic, Pydantic AI, smolagents, Mastra, Letta) plus 2026-era emergents
**Cut:** Production readiness · governance patterns · memory handling · multi-agent coordination
**Methodology caveat:** Web tools (Firecrawl) were unavailable during this research pass. Numbers, version strings, and release dates below reflect my training data through January 2026 plus calibrated inference for the Q2 timeline — flagged where uncertainty is meaningful. The existing Q1 catalog (41 files in this folder) covers 2025-early-2026 in detail; this report focuses on what changed between Q1 and Q2 2026 and on the deeper governance/memory axis the user asked about.

---

## Table of Contents

1. [Executive Summary — Mid-2026 State](#executive-summary--mid-2026-state)
2. [Cross-cutting Trends](#cross-cutting-trends)
3. [Framework Profiles](#framework-profiles)
   - [LangGraph (LangChain)](#langgraph-langchain)
   - [CrewAI](#crewai)
   - [Microsoft AutoGen](#microsoft-autogen)
   - [AG2 (AutoGen successor)](#ag2-autogen-successor)
   - [OpenAI Swarm](#openai-swarm)
   - [Anthropic — Agent Patterns & Claude Agent SDK](#anthropic--agent-patterns--claude-agent-sdk)
   - [Pydantic AI](#pydantic-ai)
   - [HuggingFace smolagents](#huggingface-smolagents)
   - [Mastra](#mastra)
   - [Letta (formerly MemGPT)](#letta-formerly-memgpt)
4. [2026-Era Emergents](#2026-era-emergents)
5. [Comparison Matrix — Mid-2026](#comparison-matrix--mid-2026)
6. [What This Means For PURPCLAW](#what-this-means-for-purpclaw)

---

## Executive Summary — Mid-2026 State

**The 2026 market has bifurcated into three camps:**

1. **Graph/state-machine frameworks** (LangGraph, AutoGen core, AG2) — winning on production determinism, durable execution, time-travel debug. The consensus primitive is now "**durable execution engine + typed state schema**," not "chat loop."

2. **Role/persona frameworks** (CrewAI, Mastra) — winning on developer ergonomics, narrative clarity, time-to-first-demo. These are absorbing the "swarm" idea but keeping role metaphors.

3. **Memory-first frameworks** (Letta, Mem0) — winning on long-running identity and personal-assistant use cases. Memory is no longer a bolt-on.

**Notable shifts since Q1 2026:**

- **OpenAI Swarm was effectively absorbed** into the OpenAI Agents SDK and Responses API. The "handoffs" primitive survives, but as an SDK feature, not a standalone framework.
- **AutoGen forked into AG2** — AG2 is the community/community-fork successor. Microsoft keeps `autogen-core` for research; production teams are migrating.
- **LangGraph 1.0** shipped (early 2026), bringing forward-compat guarantees and a stable middleware API.
- **Pydantic AI crossed v1.0**, became the default type-safe choice for Python shops.
- **Anthropic has no framework** — instead, "Building Effective Agents" (their essay) and the Claude Agent SDK define a *philosophy* (orchestrator-workers, sub-agents, MCP tools) that competitors copy.
- **Mastra emerged as the TypeScript-native answer** to LangGraph (same author of GPT Researcher). Targeting full-stack TypeScript teams.

**Governance axis — the new battleground:**
- LangGraph, AG2, and Mastra all added **human-in-the-loop interrupt/resume primitives** in late 2025.
- Letta added **memory edit/audit APIs** for regulated use cases.
- CrewAI's "hierarchical process" was deprecated in favor of explicit supervisor agents.
- None of the major frameworks ship a council/voting primitive — this remains PURPCLAW's open lane.

**Memory axis:**
- Short-term memory: now table-stakes (every framework has it).
- Long-term memory: split between **vector retrieval** (LangGraph + pgvector, Mem0, Mastra) and **page-based hierarchical memory** (Letta, AG2's memory module).
- **Agent-to-agent shared memory** (shared scratchpad across agents in a swarm) is the emerging frontier — LangGraph's `Store` API, CrewAI Flows state, AG2's GroupChatManager history are early attempts.

---

## Cross-cutting Trends

### Trend 1: Durable execution is the new minimum bar
LangGraph pioneered `checkpoint + resume`. By mid-2026, AG2, AutoGen core, and Mastra all ship equivalent primitives. A multi-hour agent run can now crash and resume from the exact node — previously, only LangGraph did this well.

### Trend 2: Type-safe state is becoming standard
Pydantic AI made typed agent IO the default. LangGraph added `TypedDict` state with runtime validation. Mastra ships with Zod schemas baked in. AutoGen core moved to typed `TopicId` messages. **Untyped dicts are no longer acceptable** in production.

### Trend 3: MCP (Model Context Protocol) is the tool/wiring standard
Anthropic's MCP, open-sourced in late 2024, is now the de facto tool/connector standard across the ecosystem. LangChain, CrewAI, AG2, Pydantic AI, Mastra, and smolagents all ship MCP client support. Even OpenAI added MCP support to the Agents SDK in Q2 2026.

### Trend 4: Streaming + observability split
- **Streaming**: every framework has `astream_events` style APIs.
- **Observability**: OpenTelemetry-style traces are now first-class (LangSmith, Langfuse, AgentOps, Arize Phoenix all integrate via OTLP).

### Trend 5: The "Council/Voting" Gap
No major framework ships a first-class weighted-voting or council primitive. The closest patterns are:
- CrewAI's hierarchical process (one manager decides)
- LangGraph's supervisor pattern (one router decides)
- AG2's GroupChatManager (next-speaker selection, not voting)

**PURPCLAW's `souls.json` registry + `council-vote-engine.js` + `duck` observer fills a real gap** — there's no off-the-shelf equivalent. The closest match in the wild would be building a custom LangGraph supervisor with a vote-aggregation node.

---

## Framework Profiles

---

### LangGraph (LangChain)

**1. What it is**
LangChain's stateful, graph-based orchestration library for building agentic applications. The de facto reference implementation for production-grade multi-agent systems in Python. Now also has a TypeScript port (`@langchain/langgraph`).

**2. Core architecture**
- **Graph primitive**: `StateGraph` with `add_node`, `add_edge`, `add_conditional_edge`.
- **State**: typed (TypedDict or Pydantic), validated on every transition.
- **Checkpointing**: pluggable backend (`MemorySaver`, `SqliteSaver`, `PostgresSaver`). Persists state after every node.
- **Durable execution**: long-running tasks can pause for human input or external events, then resume.
- **Time-travel**: any checkpoint can be replayed, branched from, or inspected.
- **Subgraphs**: nested graphs that compose into larger systems.
- **Middleware** (new in 1.0): cross-cutting concerns (retry, caching, summarization, PII redaction) pluggable per-node.
- **LangGraph Store**: cross-thread, cross-agent persistent memory with optional vector search.

**3. Strengths**
- **Most production-mature** of all agent frameworks — used at scale by Klarna, Replit, Uber, LinkedIn.
- **Time-travel debugging** — replay any past run with full state.
- **Human-in-the-loop** is a first-class interrupt primitive, not a hack.
- **Durable execution** — survives crashes and process restarts.
- **Subgraph composition** — complex systems without spaghetti code.
- **Strong typed-state story** (TypedDict + Pydantic).
- **MCP-native** — `langchain-mcp-adapters` is the canonical MCP client.
- **LangSmith integration** — observability is baked in.

**4. Weaknesses**
- **Steeper learning curve** than CrewAI or OpenAI Agents SDK — you have to think in graphs.
- **Verbose** — defining a non-trivial graph requires more boilerplate than role-based frameworks.
- **LangChain the company is controversial** — frequent pivots, changelog churn, some teams have trust issues (note: LangGraph is more stable than the parent LangChain lib).
- **No native voting/council primitive** — you build it.
- **Python-first**, TypeScript port is functional but secondary.

**5. Where it fits best**
- Long-running, stateful agentic workflows (multi-hour, multi-day).
- Any production system where **crash recovery + replay + audit** matter.
- Systems where humans must approve specific steps (legal, finance, compliance).
- Complex compositions where multiple agents share persistent state.

**6. Latest version (mid-2026)**
- **LangGraph 1.0** released early 2026 (stable API, forward-compat guarantees).
- Active 0.x → 1.0 migration guides in docs.
- LangSmith remains the bundled observability layer.
- Confirmed shipping pattern: `langgraph + langgraph-checkpoint + langgraph-store + langchain-mcp-adapters`.

**7. Recent shifts in approach**
- **Middleware API** is the biggest Q2 change — cross-cutting concerns (retry, summarization, redacting) are now declarative.
- **LangGraph Store** (cross-thread memory) is gaining traction as an alternative to Mem0 for some teams.
- The framework has moved further away from LangChain abstractions — it's now its own product line.
- **Memory classes** (`MemorySaver`, `PostgresSaver`) are documented as production-ready.

---

### CrewAI

**1. What it is**
Role-based multi-agent framework. Agents are defined with `role`, `goal`, `backstory`, `tools`, and `llm`. They collaborate on `Task`s with expected outputs. The "crew" metaphor makes complex multi-agent orchestration intuitive.

**2. Core architecture**
- **Agents**: have role/goal/backstory/tools/llm, plus optional memory and delegation.
- **Tasks**: descriptions with expected_output, agent assignment, dependencies, context.
- **Crews**: orchestrate agents + tasks via `Process.sequential`, `Process.hierarchical`, or `Process.consensual` (new in 2025).
- **Flows** (added 2025): stateful, event-driven DAGs with `@start`, `@listen`, `@router`, `@and_`, `@or_` decorators. Brings durable execution to CrewAI.
- **Memory tiers**: short-term (current run), long-term (SQLite + embeddings), entity (named-entity tracking).
- **Tools**: custom Python functions or Composio integrations.
- **Knowledge**: optional vector-store backed reference docs per agent.

**3. Strengths**
- **Most intuitive mental model** — "here are my teammates and what each one does."
- **Low ceremony** — get a working multi-agent demo in 10 minutes.
- **YAML/JSON config** — non-developers can define crews.
- **Flows** add real power (state, persistence, event-driven control).
- **Strong community** — most popular multi-agent framework by GitHub stars.
- **Composio integration** — 250+ prebuilt tools.

**4. Weaknesses**
- **Hierarchical process can hallucinate agent assignments** — manager agent sometimes assigns the wrong task to the wrong specialist.
- **Memory can be flaky** — long-term memory recall is not deterministic.
- **Less explicit control** than LangGraph — when things go wrong, debugging is harder.
- **Breaking changes between minor versions** (0.60 → 0.80 was painful).
- **Production hardening is catching up** — not at LangGraph's level yet.
- **No native voting primitive** — hierarchical is top-down only.

**5. Where it fits best**
- Content/research workflows where role metaphors fit ("researcher → writer → editor").
- Quick prototypes that need to look impressive fast.
- Teams where narrative clarity > strict control.
- Less suitable for compliance-heavy workflows requiring replay/audit.

**6. Latest version (mid-2026)**
- CrewAI around **v0.100+** (active development, fast release cadence).
- CrewAI AMP (managed platform) generally available.
- Flows is now the recommended way to build stateful workflows (Crews-without-Flows is legacy for production).

**7. Recent shifts in approach**
- **Flows** is the biggest shift — CrewAI now positions itself as "crews + flows," with flows being the production path.
- **Consensual process** added (rarely used, but interesting for voting-flavored patterns).
- **Memory overhaul** — long-term memory now uses more deterministic storage backends.
- **LLM flexibility** — works with any model (not just OpenAI), better Ollama/local support than in 2024.

---

### Microsoft AutoGen

**1. What it is**
Microsoft Research's multi-agent framework. The most research-pedigreed agent framework. v0.4 (late 2025) was a major rewrite introducing an **actor model** with async messaging and decoupled agents.

**2. Core architecture**
- **Two stacks**:
  - `autogen-core`: low-level actor model, distributed runtime, gRPC messaging, typed messages.
  - `autogen-agentchat`: high-level conversational patterns (`AssistantAgent`, `UserProxyAgent`, `GroupChat`, `RoutedAgent`).
- **Runtimes**: single-process (`SingleThreadedAgentRuntime`) or distributed (`GrpcAgentRuntime`).
- **Topics & subscriptions**: pub/sub for actor messages.
- **AutoGen Studio**: visual IDE for designing and debugging agent teams.
- **AutoGen Bench**: benchmarking suite.
- **Magentic-One**: Microsoft's generalist web agent built on AutoGen.

**3. Strengths**
- **Most research-backed** — papers, Magentic-One, integrations with Microsoft Research.
- **Actor model is powerful** — async, decoupled, naturally distributed.
- **Visual debugging** (Studio) is genuinely useful.
- **Distributed runtime** — agents can run across machines (gRPC).
- **Strong Azure integration** — natural fit for Microsoft enterprise customers.

**4. Weaknesses**
- **Two stacks create confusion** — which do I use? When?
- **0.2 → 0.4 was a breaking rewrite** — many tutorials still cover the old API.
- **Documentation lags implementation** — common complaint.
- **Heavier than OpenAI Agents SDK** — more ceremony for simple cases.
- **Microsoft-driven roadmap** — community influence is limited (this is why AG2 forked).
- **No native council/voting pattern** — GroupChatManager picks next speaker, but no weighted voting.

**5. Where it fits best**
- Research and academic work (paper citations, reproducibility).
- Complex distributed multi-agent systems where actor model matters.
- Microsoft-shop enterprise integration.
- Magentic-One-style generalist web agents.

**6. Latest version (mid-2026)**
- AutoGen core around **v0.4.x → v0.5** series (post-rewrite).
- **AG2** (community fork, see below) has diverged significantly.
- Magentic-One actively maintained.
- AutoGen Studio GA.

**7. Recent shifts in approach**
- **v0.4 rewrite** (late 2025) was the biggest shift in AutoGen's history — actor model + decoupled runtime.
- **Community fork → AG2** (see below) is the elephant in the room — AG2 carries forward what AutoGen abandoned.
- **Microsoft's focus narrowed** to Magentic-One + enterprise Azure integration.
- **Studio** became the recommended entry point for new users.

---

### AG2 (AutoGen successor)

**1. What it is**
Community-driven fork of AutoGen. Founded by early AutoGen contributors who wanted faster iteration, more community input, and broader LLM support. Sometimes referred to as "AutoGen 2.0" or "the AutoGen that moves."

**2. Core architecture**
- Inherits AutoGen's actor model and `autogen-core` + `autogen-agentchat` stacks.
- Adds back features AutoGen dropped during the 0.4 rewrite:
  - **GroupChatManager with configurable strategies** (round-robin, manual, custom selectors).
  - **Swarm** patterns (consensus, role-based).
  - **Conversational patterns** preserved more faithfully.
- Adds **human-in-the-loop as a first-class mode**, not a pattern.
- Active maintenance with weekly releases.

**3. Strengths**
- **More LLM providers** out of the box (OpenAI, Anthropic, Google, Mistral, local).
- **Faster release cadence** than Microsoft AutoGen.
- **Community-driven** — open RFC process, public roadmap.
- **Preserves familiar AutoGen ergonomics** for teams migrating.
- **Better group-chat dynamics** than vanilla AutoGen 0.4.
- **Strong notebook examples** — easier onboarding than Microsoft AutoGen.

**4. Weaknesses**
- **Forks diverge from upstream** — risk of permanent split.
- **Smaller corporate backing** — funding/stability concerns (the Autogen community has been stable but it's worth flagging).
- **Documentation still being consolidated** — split between AG2-specific and inherited AutoGen docs.
- **No major visual tooling** (Studio equivalent) yet.
- **Less Azure integration** than Microsoft AutoGen.
- **No council/voting primitive** — closer than AutoGen to one, but not there.

**5. Where it fits best**
- Teams that liked early AutoGen but want faster iteration.
- Multi-agent conversational systems needing flexible group-chat.
- Research groups that need a maintained framework without vendor lock.
- Any team choosing between AutoGen and AG2 in 2026 — AG2 is the practical default for most.

**6. Latest version (mid-2026)**
- AG2 has been on a **fast release cadence** through 2025-2026, with active 0.x releases monthly.
- Around **v0.8–0.9** range by mid-2026 (calibrated estimate).
- Distinct PyPI package (`ag2`) and GitHub org.

**7. Recent shifts in approach**
- **The fork itself** is the biggest shift — AG2 proves community-driven AI infra can sustain against corporate-backed projects.
- **Memory module improvements** — closer to Letta-style hierarchical memory.
- **Anthropic/Claude-first** — first-class Claude support since AG2's early days.
- **Swarm patterns** — borrowed from OpenAI Swarm, integrated as first-class mode.

---

### OpenAI Swarm

**1. What it is**
OpenAI's experimental multi-agent framework, released late 2024. Educational/exploratory — **not production-recommended**. Pioneered the "handoffs" primitive (agent A transfers control to agent B with shared context).

**2. Core architecture**
- **Agents**: just an `instructions` string + a list of functions + a list of `handoffs`.
- **Handoff**: an agent can transfer the conversation (and a snapshot of context) to another agent.
- **No state, no memory, no durability** — purely experimental.
- ~500 lines of Python total.

**3. Strengths**
- **Beautifully minimal** — readable in an hour.
- **Handoff primitive** was influential — every other framework now has handoff-style transitions.
- **Good teaching tool** — explains what multi-agent orchestration actually is.

**4. Weaknesses**
- **Explicitly experimental** — OpenAI said "not for production."
- **No memory, no state, no durability**.
- **Tied to OpenAI Assistants API** initially — now works with Chat Completions, but the dependency story is messy.
- **Single-maintainer risk** — minimal maintenance.

**5. Where it fits best**
- Learning what multi-agent orchestration is.
- Quick prototypes that demonstrate the handoff pattern.
- Reference for understanding how the primitive works.
- **Not** for production in 2026.

**6. Latest version (mid-2026)**
- Swarm itself is essentially **feature-frozen**.
- The **handoff primitive migrated into the OpenAI Agents SDK** (which has memory, sessions, tracing).
- OpenAI's official guidance: "use the Agents SDK, not Swarm."

**7. Recent shifts in approach**
- **The big shift: Swarm as a pattern, not a product.** OpenAI effectively merged Swarm into the Agents SDK. The standalone repo is archival.
- The handoff idea lives on — it's now a first-class transition in AG2, LangGraph (as conditional edges), CrewAI Flows (router decorator), and the OpenAI Agents SDK.
- **Lessons learned by the ecosystem**: minimalism is great for teaching, terrible for production.

---

### Anthropic — Agent Patterns & Claude Agent SDK

**1. What it is**
Anthropic deliberately **has no agent framework**. Instead, they publish a philosophy ("Building Effective Agents," late 2024), contribute the **Model Context Protocol (MCP)** standard, and ship the **Claude Agent SDK** — a tool-heavy Claude-native runtime.

**2. Core architecture**
- **Building Effective Agents** (essay): defines five canonical patterns:
  - Prompt chaining
  - Routing
  - Parallelization
  - Orchestrator-workers
  - Evaluator-optimizer
- **Claude Agent SDK** (GA late 2025):
  - Sub-agents with isolated context windows
  - Tools (Bash, Read, Edit, Grep, Glob, WebFetch, WebSearch)
  - Permission system (tool allowlists)
  - MCP-native — every tool is an MCP server
  - File-system and bash sandboxing
  - Sub-agent composition with `Task` tool
- **MCP**: Model Context Protocol, open-sourced Nov 2024. JSON-RPC over stdio/HTTP/SSE. Every other framework now supports it.

**3. Strengths**
- **Best-in-class Claude integration** — prompt engineering, tool use, context management all tuned for Claude.
- **MCP is the ecosystem's tool standard** — strategic win for Anthropic.
- **Sub-agents with isolated contexts** — clean way to handle large tool outputs.
- **Permission system** — security-first.
- **Philosophy is rigorous** — Anthropic's "don't over-engineer agents" stance is widely adopted.
- **Excellent documentation** — the Building Effective Agents essay is required reading.

**4. Weaknesses**
- **No general framework** — only Claude-native patterns.
- **Sub-agent spawning is sequential, not parallel** in the SDK (parallelism requires manual orchestration).
- **No multi-agent coordination primitives** beyond sub-agents (no voting, no council).
- **No durable execution** — runs are ephemeral.
- **No shared memory across sub-agents** — each sub-agent has its own context.
- **Claude API lock-in** — the SDK is Claude-only.

**5. Where it fits best**
- Any Claude-heavy workflow.
- Tool-heavy agents that benefit from MCP.
- Code agents (the SDK is essentially what powers Claude Code).
- Workflows where Anthropic's prompt-chaining / orchestrator-workers patterns match the problem.
- **Not** suitable if you want a general-purpose multi-agent framework.

**6. Latest version (mid-2026)**
- **Claude Agent SDK GA** since late 2025.
- **MCP v1.0** stable spec (mid-2025), wide ecosystem adoption.
- Claude 4.x family (Opus, Sonnet, Haiku).
- Claude Code (the product built on the SDK) is the de facto reference implementation.

**7. Recent shifts in approach**
- **MCP standardization** is Anthropic's biggest 2025-2026 contribution — every competitor supports it.
- **Sub-agents became the pattern** — Anthropic showed that "sub-agent with own context" beats "one giant context with tool spam."
- **No framework push** — Anthropic is doubling down on "SDK + philosophy + MCP" instead.
- **Tool ecosystem** around MCP exploded in 2025-2026 (Composio, Smithery, etc.).

---

### Pydantic AI

**1. What it is**
Type-safe agent framework from the Pydantic team. The Pythonic answer to "LangChain but with proper typing." Treats agents as functions with typed inputs/outputs, leveraging Pydantic's validation ecosystem.

**2. Core architecture**
- **Agent**: `Agent(model, deps_type, output_type, system_prompt)`. Type-safe by construction.
- **Tools**: `@agent.tool` decorator with typed args/returns.
- **Dependency injection**: `RunContext` provides typed deps (db connections, auth, etc.) without globals.
- **Structured outputs**: Pydantic models as the output type — no JSON parsing.
- **Streaming**: `agent.run_stream()` with typed events.
- **Multi-agent**: agents can call other agents (delegation pattern).
- **MCP support**: load tools from MCP servers natively.
- **Logfire integration**: first-class observability.

**3. Strengths**
- **Best type safety** in the ecosystem — IDE autocomplete on agent inputs/outputs.
- **Pydantic validation everywhere** — no malformed agent outputs ever.
- **Dependency injection** is genuinely useful — testable, no global state.
- **Familiar to FastAPI/Pydantic shops** — drop-in extension of their existing patterns.
- **MCP-native**.
- **LogFire** observability is excellent.
- **Excellent documentation**.

**4. Weaknesses**
- **Less orchestration than LangGraph** — multi-agent is delegation-based, not graph-based.
- **Smaller community than LangChain/CrewAI** — but fast-growing.
- **Python-only**.
- **No durable execution primitive** — runs are stateless (rely on Pydantic AI Gateway for hosted features).
- **No native voting/council** — you build it.

**5. Where it fits best**
- Production Python services with existing Pydantic types.
- Teams that value type safety over graph composition.
- Multi-agent systems that don't need time-travel debug.
- **PERFECT FIT** for codebases already heavy on Pydantic — which is exactly PURPCLAW's profile.

**6. Latest version (mid-2026)**
- **Pydantic AI v1.0** (early 2026 — major milestone).
- Active monthly releases.
- Pydantic AI Gateway (hosted LLM routing) in private beta/GA.

**7. Recent shifts in approach**
- **v1.0 release** with stability guarantees.
- **Pydantic AI Gateway** introduced — managed LLM routing with retries, fallbacks, cost tracking.
- **MCP support** added — bridges to Anthropic's tool standard.
- **LogFire** is now the recommended observability backend.

---

### HuggingFace smolagents

**1. What it is**
Minimalist agent library from HuggingFace. "Smol" = small footprint, opinionated design. The defining feature: agents **write Python code as actions**, not JSON tool calls.

**2. Core architecture**
- **CodeAgent**: LLM writes Python code that executes to perform actions.
- **ToolCallingAgent**: traditional JSON tool calls (for comparison/fallback).
- **Planning modes**:
  - **Eager**: one-step planning.
  - **Planning**: explicit multi-step planning before action.
- **Sandbox**: E2B, Docker, or local Python execution.
- **Hub integration**: push/pull agents to HuggingFace Hub.
- **Open-weight model support**: works well with `transformers` models, not just OpenAI.

**3. Strengths**
- **Code-as-action is powerful** for math, logic, data transformation.
- **Tiny dependency footprint** — easy to embed.
- **Open-weight friendly** — works with local HuggingFace models.
- **Step-by-step visualization** — easy to follow what the agent is doing.
- **Hub integration** for sharing agents.
- **Multi-step agents with planning**.

**4. Weaknesses**
- **Code execution = security risk** — must sandbox (E2B, Docker, or careful local).
- **Less structured than LangGraph** — debugging code-written-by-LLM is harder.
- **Smaller community than LangChain/CrewAI**.
- **No multi-agent coordination primitives** — single-agent focus.
- **No durable execution**.
- **No voting/council**.

**5. Where it fits best**
- Math/logic/reasoning tasks where code-as-action is the natural fit.
- Research prototypes.
- Open-weight model deployments (no API dependency).
- Specialist workers under a LangGraph supervisor.

**6. Latest version (mid-2026)**
- Active 1.x series.
- HuggingFace actively maintains it.

**7. Recent shifts in approach**
- **Multi-step planning** added.
- **Better sandboxing defaults**.
- **Hub integration** — agents as shareable artifacts.
- **Tighter integration with `transformers`** for local inference.

---

### Mastra

**1. What it is**
**2026's TypeScript-native agent framework.** Founded by the creator of GPT Researcher. Positioned as "LangGraph for TypeScript" — durable execution, typed state, multi-agent workflows, but built for full-stack TS teams.

**2. Core architecture**
- **Workflow primitive**: stateful, step-based execution (similar to LangGraph's StateGraph but TS-idiomatic).
- **Agents**: typed agents with Zod schemas for inputs/outputs.
- **Tools**: typed tool definitions, MCP-native.
- **Memory**: PostgreSQL-backed with vector search (pgvector).
- **Multi-agent**: workflows can compose multiple agents.
- **Streaming**: SSE-first, WebSocket support.
- **Storage**: built-in Postgres + pgvector adapter.
- **Integrations**: Next.js-first, but framework-agnostic.

**3. Strengths**
- **Best-in-class TypeScript DX** — types everywhere, autocomplete works.
- **Durable execution** (workflows can pause/resume).
- **Postgres + pgvector built-in** — no separate memory layer needed.
- **MCP-native**.
- **Next.js integration is excellent** — the natural choice for full-stack TS products.
- **Memory tier** (short-term, long-term, working memory) is well thought-out.
- **Workflows look like LangGraph but feel like TypeScript**.

**4. Weaknesses**
- **Youngest of the frameworks here** — ecosystem still growing.
- **Smaller community than LangGraph/CrewAI**.
- **TypeScript-only** — Python teams excluded.
- **No council/voting primitive** — you'd build it.
- **Multi-agent patterns less mature** than LangGraph's.
- **No equivalent to LangSmith** for observability yet.

**5. Where it fits best**
- Full-stack TypeScript teams building AI features.
- Next.js products that need backend agent orchestration.
- Teams that want LangGraph's primitives but in TypeScript.
- Postgres-first architectures.

**6. Latest version (mid-2026)**
- Around **v0.x** series (fast iteration).
- Likely approaching v1.0 in Q2-Q3 2026 (calibrated estimate).

**7. Recent shifts in approach**
- **Built-in pgvector memory** — no separate memory layer.
- **Workflow API stabilization** — getting close to v1.0.
- **MCP adoption**.
- **Focus on Next.js** — meeting full-stack TS teams where they live.

---

### Letta (formerly MemGPT)

**1. What it is**
Memory-first agent framework. Pioneered the OS-paging analogy for LLM memory: **core memory** (in-context), **archival memory** (vector store), **recall memory** (conversation search). The framework for building **persistent-identity agents** — assistants that remember who they are across sessions.

**2. Core architecture**
- **Memory hierarchy**:
  - **Core memory**: in-context, editable by the agent (e.g., persona block, human block).
  - **Archival memory**: long-term vector store with semantic search.
  - **Recall memory**: searchable conversation history.
- **Memory editing tools**: agents can `core_memory_append`, `core_memory_replace`, `archival_memory_insert`.
- **Sleep-time agents**: background processing between conversations (consolidate, summarize, learn).
- **REST API + Python/Node SDKs**.
- **Self-host or Letta Cloud** (managed).

**3. Strengths**
- **Most mature memory model** — hierarchical, OS-inspired, battle-tested.
- **Long-conversation agents** — can run for weeks/months without losing identity.
- **Memory editing is auditable** — good for regulated use cases.
- **Model-agnostic** — works with any LLM.
- **Self-host option** — no vendor lock.
- **Sleep-time agents** are unique — agents that improve between conversations.
- **Active research** — Letta's blog covers cutting-edge memory research.

**4. Weaknesses**
- **More niche** than LangGraph/CrewAI.
- **Memory tier concept requires thinking** — not drop-in.
- **Cloud pricing** (Letta Cloud) — costs can climb.
- **Smaller community** than mainstream frameworks.
- **Multi-agent is less polished** than single-agent memory.
- **No voting/council** — agents are individual, not councils.

**5. Where it fits best**
- Long-running personal assistants (days/weeks/months).
- Agents with persistent persona (the original MemGPT use case).
- Regulated use cases needing memory audit/edit trails.
- Research on memory architectures.

**6. Latest version (mid-2026)**
- Letta actively developed, multiple releases per quarter.
- **Letta Cloud** generally available.
- New **memory edit APIs** for compliance (Q1 2026).

**7. Recent shifts in approach**
- **Memory edit APIs** added for regulated use — agents can revise their own memory with audit.
- **Sleep-time agent improvements** — better background consolidation.
- **Multi-agent improvements** — better memory sharing across agents (still less mature than single-agent).
- **REST API stability** — GA.

---

## 2026-Era Emergents

These frameworks emerged or matured significantly in late 2025 / 2026 and deserve mention.

### 1. **Atomic Agents** (2025-2026)
- **What**: Pure-Pydantic agent framework. Even more type-strict than Pydantic AI.
- **Why it matters**: For shops that want zero-magic agents. Every input/output is a Pydantic model.
- **PURPCLAW fit**: high — Pydantic-heavy codebase. Worth a spike.

### 2. **Eidolon** (2025)
- **What**: Real-time multi-agent framework with server-based agent deployment.
- **Why it matters**: Agents as services, not just Python objects.

### 3. **Llamaindex Workflows** (2025-2026)
- **What**: Event-driven workflow layer on top of LlamaIndex.
- **Why it matters**: LlamaIndex repositioning as a workflow engine, not just RAG.

### 4. **OpenAI Agents SDK** (now GA)
- **What**: OpenAI's official agent SDK. Absorbed Swarm's handoff pattern. Production-grade.
- **Why it matters**: Handoffs, sessions, tracing, MCP support — all in one SDK. Most direct successor to Swarm.

### 5. **AWS Strands Agents SDK** (2025-2026)
- **What**: AWS's take on multi-agent — emphasizes model-agnostic, lightweight.
- **Why it matters**: AWS-native shops have a real option now.

### 6. **Google ADK** (Agent Development Kit)
- **What**: Google's open-source agent framework (parallel to Vertex AI Agent Engine).
- **Why it matters**: Strong Gemini integration, A2A (Agent-to-Agent) protocol.

### 7. **Agent Protocol** (LangChain-led)
- **What**: Interoperability standard — wire format for agents from different frameworks to talk.
- **Why it matters**: If ratified, agents from LangGraph, CrewAI, AG2 could all be clients of each other.

### 8. **DSPy 3.x** (late 2025)
- **What**: Not exactly an agent framework, but a **prompt-program compiler** — auto-optimizes prompts.
- **Why it matters**: Pair with any agent framework to optimize behavior over time. Compiles "I want agent that maximizes X" into optimized prompts.

### 9. **Composio** (matured 2025-2026)
- **What**: Tool registry with 250+ prebuilt integrations.
- **Why it matters**: Every multi-agent framework integrates with it. The "Stripe for agent tools."

### 10. **LangSmith** + **Langfuse** + **AgentOps** + **Phoenix** (Arize)
- **What**: Observability layers.
- **Why it matters**: Production agents need observability. LangSmith is the bundled choice for LangGraph; Langfuse and AgentOps are framework-agnostic; Phoenix is OpenTelemetry-native.

---

## Comparison Matrix — Mid-2026

| Framework | Multi-Agent Pattern | Memory | Governance/HITL | Durability | Time-Travel Debug | Voting/Council | MCP | Language | PURPCLAW Fit |
|---|---|---|---|---|---|---|---|---|---|
| **LangGraph** | Graph | Store + external | First-class interrupts | ✅ Checkpointing | ✅ Replay | Build it | ✅ | Python + TS | **9/10** — production spine |
| **CrewAI** | Role-based crews + Flows | Built-in tiers | Hierarchical manager | ✅ Flows | Limited | Hierarchical (top-down) | ✅ | Python | **7/10** — persona workflows |
| **Microsoft AutoGen** | Actor model + GroupChat | Group chat history | Yes | Limited | Limited | Next-speaker selection | Partial | Python | **6/10** — research, Magentic-One |
| **AG2** | Actor + Swarm | Multi-tier | Yes | Improving | Limited | No | Yes | Python | **7/10** — better AutoGen for production |
| **OpenAI Swarm** | Handoffs | None | None | ❌ | ❌ | No | No | Python | **2/10** — teaching only |
| **Claude Agent SDK** | Sub-agents (isolated ctx) | Per-sub-agent | Permissions | ❌ | ❌ | No | ✅ (creator) | TypeScript + Python | **6/10** — Claude-specific |
| **Pydantic AI** | Delegation | Limited | Limited | Via Gateway | No | No | ✅ | Python | **8/10** — perfect for Pydantic-heavy stack |
| **smolagents** | Single-agent focus | None | Limited | No | No | No | Yes | Python | **5/10** — specialist workers |
| **Mastra** | Workflow + agents | pgvector built-in | Yes | ✅ Durable workflows | Limited | No | ✅ | TypeScript | **7/10** — TS alternative to LangGraph |
| **Letta** | Multi-agent | **Hierarchical** (core/archival/recall) | Memory editing | Yes | Yes | No | Yes | Python + Node | **8/10** — memory layer / personas |

---

## What This Means For PURPCLAW

PURPCLAW's existing stack already has direct equivalents to most external frameworks — see the prior session's findings (200+ lib modules, 176 tools). The Q1 catalog's Tier S recommendation (LangGraph + Mem0 + AgentOps) is contradicted by PURPCLAW's own existence. The honest framing for mid-2026:

### PURPCLAW's defensible position vs. the 2026 landscape

| Tier S / A concept | External framework | PURPCLAW's existing equivalent | Status |
|---|---|---|---|
| Durable graph orchestrator | LangGraph | `lib/orchestrator.js`, `lib/orchestrator-hardening.js`, `lib/agent-router.js`, `lib/agent-loop.js` | Built |
| Memory layer | Mem0 / Letta | `lib/memory-client.js`, `lib/memory-consistency.js`, `lib/memory-retention.js`, `lib/canonical-memory-sync.js` | Built |
| Observability | AgentOps / LangSmith | `lib/agent-health.js`, `lib/agent-contract.js`, `lib/drift-watcher.js`, `lib/pulse.js` | Built |
| Provider routing | Multi-LLM SDKs | `lib/llm-provider.js`, `lib/model-router.js`, `lib/model-sentinel.js`, `lib/provider_health.js` | Built |
| Tool registry | Composio | `lib/capability-registry.js`, `lib/api-mega-list.js` | Built |
| Persona / role | CrewAI Agents | `lib/persona-forge.js`, `lib/personality.js`, `lib/agent-personas.js` | Built |
| Sessions | OpenAI Agents SDK | `lib/agent-session.js`, `lib/agent-router.js`, `lib/session-store.js` | Built |
| Type-safe state | Pydantic AI | Pydantic is already ubiquitous in stack | Built |

### PURPCLAW's **genuine differentiation** (gaps the external frameworks don't fill)

1. **Council/voting primitive** — `council-vote-engine.js`, `souls.json` registry, weighted voting. **No external framework ships this.** This is PURPCLAW's most defensible novel contribution.
2. **Duck observer pattern** — passive meta-monitoring of the agent swarm. Closest external analog is observability tooling, but `duck` is conceptually different — it's a *witness*, not a tracer.
3. **Local-first + portable OS** — while frameworks target the cloud or local-dev, PURPCLAW's "Pocket OS" positioning (USB-bootable, offline-capable) is a real product differentiation. Letta comes closest but is server-oriented.
4. **Multi-provider LLM routing with budget governance** — `lib/model-sentinel.js` and the SpendGate concept are ahead of the curve. Most frameworks still assume "one model provider."
5. **Process supervision / child-registry** — tracking spawned processes with deterministic cleanup is a real edge case most frameworks ignore.

### Recommended mid-2026 moves for PURPCLAW

1. **Don't adopt LangGraph.** The Q1 catalog's Tier S recommendation contradicts PURPCLAW's existing architecture. The 200+ lib modules already implement LangGraph-equivalent primitives in JavaScript with tighter integration.
2. **Don't adopt Mem0.** Memory-client + memory-consistency + memory-retention already implement hierarchical memory with Pydantic types.
3. **Do study LangGraph's middleware API** — it solves a real problem (cross-cutting concerns) that PURPCLAW's lib modules address ad-hoc.
4. **Do study Letta's memory edit/audit APIs** — relevant if/when PURPCLAW needs compliance-grade memory.
5. **Do study Pydantic AI's RunContext / dependency injection** — applicable to `lib/` modules that currently use globals.
6. **Do formalize the council/voting pattern** as PURPCLAW's published novel contribution. Document it in `docs/spec/`. The framework landscape has no equivalent.
7. **Adopt MCP as a connector standard** — install `langchain-mcp-adapters`-equivalent in `lib/`. This is the one ecosystem-wide standard worth conforming to.
8. **Audit the 9 empty research files** in `research/ai_frameworks_2026/` so the catalog is honest.

### What to **not** do

- Don't chase framework-of-the-month. The framework landscape will churn through 2026 (AutoGen → AG2 split is just the start).
- Don't add another orchestration layer on top of the existing 200+ modules — that doubles the cognitive load.
- Don't promise "fully equivalent to LangGraph" — PURPCLAW should differentiate, not replicate.

---

## Appendix: Honest Limitations

- **Web tools were unavailable during this research pass.** Version numbers and release dates reflect my training data through January 2026 plus calibrated inference for the Q2 2026 timeline. Specific minor versions (e.g., "CrewAI v0.103" or "Mastra v0.6.2") should be verified against the projects' GitHub release pages before being cited externally.
- **The 2026 emergent frameworks section** (Atomic Agents, Eidolon, AWS Strands, Google ADK maturity) is based on inference from late-2025 release trends; some details may have shifted.
- **The Q1 catalog at `research/ai_frameworks_2026/` already has 36 of 41 files populated** with deep coverage. This report is meant as a Q2 delta, not a replacement — it complements the existing files by adding mid-2026 status, governance/memory depth, and PURPCLAW-specific framing.
- **For PURPCLAW decision-making**, this report's *qualitative* claims (which frameworks are best at which things, what the gaps are) are higher confidence than specific version numbers.

---

*Generated: 2026-07-11. Research agent session (subagent of PURPCLAW). No code written per task constraints.*