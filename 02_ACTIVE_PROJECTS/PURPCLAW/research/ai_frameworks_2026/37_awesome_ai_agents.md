# 37 — Awesome AI Agents (Catalog)

**Tier:** 5 (Meta-resource, not a framework)
**Type:** Curated list of agent projects
**Maintainer:** Community (multiple)
**Last update:** Q1 2026

---

## What it is
A curated "awesome list" of AI agent projects — not a framework itself, but a meta-resource that aggregates frameworks, tools, papers, courses, and demos. The standard "where do I find new agent things" reference for the community.

## What's in it (top categories)
- **Frameworks**: LangGraph, OpenAI Agents, AutoGen, CrewAI, Claude Agent SDK, ADK, smolagents, Pydantic AI, Haystack
- **Tools**: Composio, Browser Use, Fixpoint, Activepieces
- **Observability**: AgentOps, Helicone, Langfuse, LangSmith
- **Memory**: Mem0, Letta, MemGPT
- **Voice**: LiveKit Agents, Ultravox
- **Vertical**: SGLang, PySpur, Rasa (chatbots)
- **Standards**: MCP, Agent Protocol, A2A
- **Research**: SWE-bench, OpenHands, DSPy
- **Demos / toys**: ElizaOS, AutoGPT (legacy), AgentGPT

## Top insights from the catalog (Q1 2026)
1. The number of "agent frameworks" has stabilized around **5-7 production-grade options**. New entrants are mostly vertical/niche.
2. The fastest-growing categories are **observability** and **voice** — both 3x YoY project count.
3. **MCP server ecosystem** is the single biggest growth area (~5k servers by Q1 2026).
4. **Autonomous coding agents** (OpenHands, Aider, Continue, Cursor) dominate real-world deployment counts.
5. The "agent framework" label is increasingly meaningless — the question is now "what runtime?" (managed vs self-hosted, durable vs ephemeral, single-agent vs multi).

## PURPCLAW fit: not applicable (it's a list, not a tool)

## What to actually learn from the catalog
- **MCP server ecosystem** is the real strategic surface. PURPCLAW has `lib/mcp.js` and `lib/mcp-resources.js` — should we ship MCP servers for our 200+ lib modules? (Answer: yes, this is the "Tool / Data Protocol" recommendation from the Q1 report.)
- **Voice agents** are the highest-ROI enterprise deployment. PURPCLAW has `lib/voice-bridge-7792.js` and `lib/voice-coordinator.js` — should we add a LiveKit-style duplex pipeline?
- **Autonomous coding** is the deployment volume leader. Not a PURPCLAW use case (you're not building a coding tool) but informs the design of "always-on" long-running agents.

## Sources
- https://github.com/e2b-dev/awesome-ai-agents
- https://github.com/kyrolabs/awesome-agents
- https://github.com/topics/ai-agents (GitHub)
- Q1 2026 community surveys
