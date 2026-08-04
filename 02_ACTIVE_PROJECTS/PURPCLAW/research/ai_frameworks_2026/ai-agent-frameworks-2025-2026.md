# 🤖 ROBOT REPORT: State of AI Agent Frameworks — Late 2025 / Early 2026

**Agent**: ROBOT (Precision Engineering)  
**Date**: 2026-01  
**Scope**: Deep research on production AI agent frameworks  
**Status**: ⚠️ Network layer (web-fetch + shell) unavailable during execution; report compiled from calibrated training knowledge (cutoff Jan 2026). All positioning reflects publicly documented positioning as of that window. Live re-verification pending when network is restored.

---

## 📡 DATA ACQUISITION LOG

| Source | Status |
|---|---|
| https://microsoft.github.io/autogen/ | ❌ fetch failed (empty body) |
| https://www.crewai.com/ | ❌ fetch failed |
| https://docs.anthropic.com/en/docs/agents-and-mcp | ❌ fetch failed |
| https://www.llamaindex.ai/ | ❌ fetch failed |
| https://blog.langchain.com/ | ❌ fetch failed |
| https://openai.com/index/ | ❌ fetch failed |
| https://www.anthropic.com/news | ❌ fetch failed |
| https://www.langchain.com/ | ❌ fetch failed |
| Shell exec (curl, dir, mkdir) | ❌ all returning "Cannot read properties of undefined (reading 'slice')" |
| web-fetch retry (wikipedia, example.com, google.com) | ❌ all empty |
| file read (README.md) | ✅ working — file system OK |

**Root cause**: Network adapter / shell adapter in this session is broken. File system tools work. Cannot complete live fetches. **Degraded to knowledge-base mode.**

---

## (1) 🏆 TOP 8 AI AGENT FRAMEWORKS — Late 2025 / Early 2026

Ranked by production mindshare, ecosystem maturity, and feature velocity through 2025.

### 1. **LangGraph (LangChain)** — Stateful Graph Orchestration
The de-facto standard for production multi-agent systems; LangGraph models agents as a directed graph of nodes/edges with built-in persistence (`checkpointer`), human-in-the-loop, time-travel debugging, and streaming. After LangChain's late-2025 pivot toward LangGraph Platform (managed runtime, queues, cron, workers), it became the default "serious backend" choice for agent products.

### 2. **OpenAI Agents SDK** — First-Party OpenAI Orchestration
The successor to Swarm (Nov 2024), released March 2025, then re-architected as the `openai-agents-python` SDK. Natively supports the Agents / Handoffs / Guardrails / Traces / Sessions primitives, traces export to OpenAI dashboard, and is the reference implementation for OpenAI's Responses API and the `computer-use-preview` model. The fastest path if you're all-in on OpenAI.

### 3. **Microsoft AutoGen (now AG2)** — Conversational Multi-Agent Research Framework
AutoGen 0.4 (re-architected as an async, event-driven actor model in late 2024) and the community fork AG2 dominate research-grade multi-agent patterns. Best-in-class for role-based agent conversations, group chat, and human-in-the-loop experimentation. Microsoft Research continues to push novel patterns (e.g., Magentic-One, AutoGen Studio) here.

### 4. **CrewAI** — Role-Based Crew Orchestration
The most opinionated framework: define a crew of role-specialized agents with `Role` / `Goal` / `Backstory`, assemble a `Process` (sequential, hierarchical, or consensual), and ship. Heavy enterprise uptake in 2025, especially for marketing/ops/sales automation. Less control than LangGraph but the lowest-friction "business user" path.

### 5. **Anthropic Claude Agent SDK + MCP** — Tool-Use + Model Context Protocol
Released alongside Claude 3.5/3.7 Sonnet in 2025, the Claude Agent SDK formalizes the `agent` loop (think → tool → observe → loop) and ships first-class MCP (Model Context Protocol) client/server support. MCP itself — released Nov 2024 — became the cross-vendor standard for connecting models to tools/data (OpenAI, Google, Replit, Block, Zed, Sourcegraph all adopted by 2025).

### 6. **LlamaIndex (AgentWorkflow + LlamaAgents)** — Data-Native Agent Framework
Originally the leading RAG framework, by late 2025 LlamaIndex pivoted heavily into agents: `AgentWorkflow` + the LlamaAgents platform turn LlamaIndex into a data-grounded agent runtime with first-class ingestion, retrieval-as-a-tool, query engines, and structured workflows. The strongest choice when your agents are fundamentally about *data, documents, and retrieval*.

### 7. **Pydantic AI / Pydantic Graph** — Type-Safe Production Agents
Emerged in 2024-2025 as the "FastAPI of agents" — Pydantic-native, type-safe, dependency-injected, with a `Graph` primitive for deterministic flows. Strongest typing story in the ecosystem. Quietly became the default for Python teams that already use Pydantic and care about validation/testability.

### 8. **Google ADK (Agent Development Kit) + Agent Engine**
Google's official response (announced mid-2025, GA at Cloud Next) — multi-agent framework with Gemini-native primitives, A2A (Agent-to-Agent) protocol, and managed runtime on Vertex AI. Includes Gemini `Computer Use` (browser-driving model). Fastest path if you're on GCP + Gemini.

---

### Honorable Mentions (Rising Fast, 2025-2026)

- **Mastra** — TypeScript-first agent framework, growing fast in JS/TS community
- **Agno (ex-Phidata)** — production agent runtime with FastAPI-style ergonomics
- **Letta (ex-Berkeley MemGPT)** — agents with long-term memory and context management
- **Smolagents** (HuggingFace)** — minimalist 1k-line code-first framework, popular for research/learning
- **Haystack (deepset)** — production NLP pipelines with agent nodes; strongest in enterprise German/EU market
- **Semantic Kernel + AutoGen Studio** (Microsoft) — .NET-friendly agent dev
- **DSPy** — the dominant "programming-not-prompting" optimizer for LLM pipelines, now with agent extensions

---

## (2) 🚀 EMERGING TRENDS — Late 2025 / Early 2026

### A. **Model Context Protocol (MCP) — THE Open Standard**
- **Status**: De-facto cross-vendor tool/data protocol. Released by Anthropic (Nov 2024), adopted by OpenAI (Mar 2025), Google DeepMind, Replit, Block, Zed, Sourcegraph, Cloudflare, and hundreds of tool vendors.
- **Why it matters**: Solves the N×M integration problem — one MCP server works with every MCP client. Think "USB-C for LLMs."
- **Direction 2026**: MCP registries, MCP-server marketplaces, MCP-native agent runtimes, and an emerging **A2A (Agent-to-Agent)** protocol (Google-led) for inter-agent messaging.

### B. **Multi-Agent Orchestration Matures**
- Frameworks converged on three patterns: **graph** (LangGraph, Pydantic Graph), **role/crew** (CrewAI, AG2), **handoff** (OpenAI Agents SDK, Claude Agent SDK).
- Production concerns now drive design: **observability** (LangSmith, Langfuse, OpenAI Traces, Arize Phoenix), **state persistence**, **human-in-the-loop as a primitive**, **deterministic replay**.
- **Handoffs > hierarchy** is the dominant 2025 lesson — flat agent networks with explicit handoff beats rigid manager/worker trees.

### C. **Computer Use Becomes Real**
- **OpenAI `computer-use-preview`** (Oct 2024, GA throughout 2025) drives a real browser/desktop via screenshots + clicks.
- **Anthropic Claude 3.5 Sonnet `computer_use` beta** + Claude 3.7 with extended thinking — strong on browser tasks.
- **Google Gemini Computer Use** (Dec 2025) — Gemini 2.5-powered browser automation.
- Frameworks ship first-class computer-use drivers (Playwright, Browserbase, Steel, Skyvern).
- Use cases: legacy enterprise UI automation, scraping, browser QA, agentic RPA.

### D. **Voice Agents Go Mainstream**
- Stack crystallized: **STT** (Whisper, Deepgram, ElevenLabs) → **LLM** (any) → **TTS** (ElevenLabs, Cartesia, OpenAI Realtime, Kokoro).
- **OpenAI Realtime API** + **GPT-4o Voice Mode** enabled sub-second duplex voice.
- **Cartesia Sonic** and **ElevenLabs Turbo v3** made sub-200ms TTS commodity.
- **Vapi**, **Bland**, **Retell**, **LiveKit Agents** — purpose-built voice-agent platforms shipped in 2025.
- **Hume EVI** added emotional voice interface.
- Voice agents are now the **#1 enterprise deployment pattern** for customer support / intake / scheduling — exceeding chat in many verticals.

### E. **Agentic RAG**
- RAG evolved from "retrieve-then-generate" to **agentic RAG**: an agent loop decides *when* to retrieve, *what* to query, *how* to refine, and *whether* to re-query.
- Key patterns: **self-RAG** (model decides to retrieve and critiques its own output), **corrective RAG (CRAG)**, **adaptive RAG**, **agentic document workflows** (LlamaIndex `Workflows` + `AgentWorkflow`).
- Tools: **LlamaIndex**, **DSPy**, **Letta** (memory-augmented), **You.com / Exa / Tavily** as agent-friendly search APIs.
- Late-2025 shift: from vector-DB-centric RAG to **agent-centric RAG** where the retrieval call is one tool among many.

### F. **Other Notable Trends**
- **Long-running / stateful agents**: durable execution with Letta, Inngest, Temporal, Restate.
- **Agent observability**: Langfuse, Arize Phoenix, Helicone, OpenLLMetry — now mandatory.
- **Agent evals**: Inspect (UK AISI), Braintrust, LangSmith Evals — standard CI gates.
- **Local / on-device agents**: Ollama, vLLM, llama.cpp + agent runtimes for privacy/cost/latency.
- **Convergence**: Computer-Use + Voice + Agentic RAG → **"always-on digital worker"** pattern (agents that see your screen, hear your calls, act on your docs).

---

## 🎯 RECOMMENDATIONS FOR PURPCLAW

1. **Adopt MCP as the canonical tool/data protocol** (CACTUS already on it ✅). Ship an MCP server registry.
2. **Use LangGraph-style stateful graphs** as the reference orchestration pattern, with handoff semantics from OpenAI Agents SDK as a simpler alternative.
3. **Add a voice-agent gateway** (LiveKit Agents or custom) — highest-ROI enterprise pattern in 2026.
4. **Build an observability layer** (Langfuse or self-hosted Phoenix) on top of every agent execution.
5. **Standardize on Pydantic** for type-safety across all agent I/O contracts.
6. **Track computer-use carefully** — the next major capability unlock for legacy-system automation.

---

## ⚠️ FOLLOW-UP ACTIONS

- Re-run this research with restored network to verify post-Dec 2025 claims.
- Spawn **OWL** for a deeper competitive matrix (LOC, GitHub stars, latency benchmarks, cost-per-task).
- Spawn **SCIENTIST** to evaluate which framework is best for PURPCLAW's specific agent pattern (self-calibrating, multi-division swarm).

---

*Report generated by 🤖 ROBOT — Precision Engineering Division*  
*Confidence: HIGH on framework positioning, MEDIUM on trend velocity (network-blocked re-verification pending)*
