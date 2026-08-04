# 🤖 AI AGENT FRAMEWORKS — RESEARCH MISSION REPORT
## Executed by: ROBOT (Precision Engineer, Engineering Division)
## Mission: Research the latest AI agent frameworks
## Date: 2026 (Q1)
## Status: ✅ COMPLETE

---

## EXECUTIVE SUMMARY

This mission cataloged and analyzed **40+ active AI agent frameworks** current as of early 2026. Frameworks are organized by tier (Enterprise, Open-Source General-Purpose, Open-Source Specialized, Visual/No-Code, Observability, Infrastructure, and Emerging) with capability matrices, deployment characteristics, and PURPCLAW integration recommendations.

**Key findings:**
1. The market has consolidated around **5 major open-source frameworks** (LangGraph, OpenAI Agents SDK, Microsoft AutoGen, CrewAI, Semantic Kernel) plus **3 hyperscaler enterprise stacks** (AWS Bedrock Agents, Google Vertex AI Agent Engine, Anthropic Claude Agent SDK).
2. **Multi-agent orchestration** has become table-stakes — single-agent frameworks are being deprecated or absorbed into larger ecosystems.
3. **Agent Protocol** (LangChain-led initiative) is emerging as the interoperability standard, backed by major vendors.
4. **Observability** (AgentOps, LangSmith, Helicone, Langfuse) has matured into a distinct tooling category — non-optional for production.
5. **Memory layers** (Mem0, Letta) have become first-class components rather than afterthoughts.
6. **Visual builders** (Flowise, Langflow, Activepieces, n8n) continue to grow for non-developer audiences.

**PURPCLAW recommendation:** Tier 1 = LangGraph + Mem0 + AgentOps. Tier 2 = OpenAI Agents SDK for simple orchestrations. Tier 3 = Claude Agent SDK for tool-heavy Claude-native work. Avoid: AutoGPT, Smol-developer (toy/abandoned).

---

## TABLE OF CONTENTS

1. **Tier 1 — Enterprise / Hyperscaler**
   - [AWS Bedrock Agents](./01_aws_bedrock_agents.md)
   - [Google Vertex AI Agent Engine](./02_google_vertex_ai_agent_engine.md)
   - [Anthropic Claude Agent SDK](./03_anthropic_claude_agent_sdk.md)

2. **Tier 2 — Open-Source Flagship**
   - [LangGraph](./04_langgraph.md)
   - [OpenAI Agents SDK](./05_openai_agents_sdk.md)
   - [Microsoft AutoGen](./06_microsoft_autogen.md)
   - [CrewAI](./07_crewai.md)
   - [Microsoft Semantic Kernel](./08_microsoft_semantic_kernel.md)

3. **Tier 3 — Specialized**
   - [Google Agent Development Kit (ADK)](./09_google_adk.md)
   - [HuggingFace smolagents](./10_smolagents.md)
   - [Pydantic AI](./11_pydantic_ai.md)
   - [LlamaIndex Agents](./12_llamaindex.md)
   - [DSPy](./13_dspy.md)
   - [Haystack Agents](./14_haystack.md)

4. **Tier 4 — Observability / Operations**
   - [AgentOps](./15_agentops.md)
   - [Helicone](./16_helicone.md)
   - [LangSmith](./40_langsmith.md)

5. **Tier 5 — Visual / No-Code**
   - [Flowise](./17_flowise.md)
   - [Langflow](./18_langflow.md)
   - [Activepieces](./19_activepieces.md)
   - [n8n](./41_n8n.md)

6. **Tier 6 — Integration / Infrastructure**
   - [Composio](./20_composio.md)
   - [Vercel AI SDK](./21_vercel_ai_sdk.md)
   - [Browser-Use](./22_browser_use.md)
   - [Rasa](./31_rasa.md)
   - [SGLang](./32_sglang.md)
   - [Ultravox](./33_ultravox.md)
   - [PySpur](./34_pyspur.md)
   - [Google Agent Starter Pack](./35_google_agent_starter_pack.md)

7. **Tier 7 — Memory & State**
   - [Letta](./27_letta.md)
   - [Mem0](./28_mem0.md)

8. **Tier 8 — Autonomous / Full-Stack Agents**
   - [AutoGPT](./25_autogpt.md)
   - [AgentGPT](./26_agentgpt.md)
   - [MetaGPT](./23_metagpt.md)
   - [OpenHands](./24_openhands.md)

9. **Tier 9 — Emerging / Niche**
   - [ElizaOS](./29_elizaos.md)
   - [Fixpoint.ai](./30_fixpoint.md)
   - [Mistral Agents API](./38_mistral_agents.md)

10. **Standards & Research**
    - [Agent Protocol](./36_agent_protocol.md)
    - [Awesome AI Agents List](./37_awesome_ai_agents.md)
    - [Anthropic: Building Effective Agents](./39_anthropic_robust_agents.md)

11. **PURPCLAW Integration Plan** — see [MISSION_REPORT.md](./MISSION_REPORT.md)

---

## METHODOLOGY

Each framework file contains:
- **What it is** — one-paragraph definition
- **Maintainer / License**
- **Core capabilities** — checklist
- **Architecture pattern** — orchestration, memory, tools
- **Strengths**
- **Weaknesses**
- **Best use case**
- **PURPCLAW fit score** (1–10)
- **Integration code sketch** where applicable
- **Sources**

All ratings are ROBOT-graded based on documentation analysis, ecosystem activity (GitHub stars, release cadence), production-readiness signals, and fit for a multi-agent desktop OS like PURPCLAW.

---

## CAPABILITY MATRIX (SUMMARY)

| Framework | Multi-Agent | Memory | Tools | Code-First | Visual | OSS | Production |
|---|---|---|---|---|---|---|---|
| AWS Bedrock Agents | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Vertex AI Agent Engine | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Claude Agent SDK | ✅ | ✅ | ✅ | ✅ | ❌ | Partial | ✅ |
| LangGraph | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| OpenAI Agents SDK | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| AutoGen | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CrewAI | ✅ | ⚠️ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| Semantic Kernel | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Google ADK | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| smolagents | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| Pydantic AI | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| LlamaIndex Agents | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| DSPy | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Haystack | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ |
| AgentOps | — | — | — | — | — | ✅ | ✅ |
| Helicone | — | — | — | — | — | Partial | ✅ |
| Flowise | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| Langflow | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| Activepieces | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ✅ |
| n8n | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Composio | — | — | ✅ | — | — | ✅ | ✅ |
| Vercel AI SDK | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Browser-Use | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| MetaGPT | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| OpenHands | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| AutoGPT | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| AgentGPT | ❌ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Letta | ✅ | ✅✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Mem0 | — | ✅✅ | — | ✅ | ❌ | ✅ | ✅ |
| ElizaOS | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| Fixpoint | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ⚠️ |
| Mistral Agents | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| PySpur | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| SGLang | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Ultravox | ❌ | ❌ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ |
| Rasa | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Agent Protocol | ✅ | ✅ | ✅ | spec | spec | ✅ | ✅ |

Legend: ✅ = first-class · ⚠️ = partial/limited · ❌ = not present · — = N/A

---

🤖 *Mission executed with mechanical precision. All ratings are ROBOT-grade.*
