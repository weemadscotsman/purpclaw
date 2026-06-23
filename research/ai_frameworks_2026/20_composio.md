# 20 — Composio

**Tier:** 6 (Integration / Infrastructure)  
**Vendor:** ComposioHQ  
**License:** MIT  
**Initial release:** 2024  
**Last major update:** 2025 (250+ integrations, managed auth)

---

## What it is
Integration platform for AI agents. 250+ pre-built tool integrations (GitHub, Slack, Gmail, Notion, HubSpot, Linear, Salesforce, etc.) with managed OAuth, API keys, and rate-limiting. Drop-in tools for LangChain, CrewAI, AutoGen, OpenAI SDK, etc.

## Core capabilities
- [x] 250+ integrations (apps)
- [x] Managed OAuth flows
- [x] Managed API keys
- [x] Multi-framework adapters
- [x] Custom tools (define your own)
- [x] Triggers (webhook events)
- [x] Actions (typed operations)
- [x] Multi-tenant (per-user app connections)
- [x] SDK (Python, JS)
- [x] Open source (with managed cloud option)

## Architecture
```python
from composio_crewai import ComposioToolSet, App
tools = ComposioToolSet().get_tools(apps=[App.GITHUB, App.SLACK])
```
- Managed tool registry
- Authentication abstracted
- Per-user/per-org connections

## Strengths
- Massive integration library (vs hand-rolling each)
- OAuth handled
- Framework-agnostic
- Open source SDK

## Weaknesses
- Pricing for managed tier
- Some integrations basic (1-2 actions only)
- Vendor coupling for managed auth

## Best use case
Agents needing real-world app integrations. SaaS tools. Multi-tenant agent platforms.

## PURPCLAW fit: 9/10 🏆
- ROBOT's Tier A recommendation
- Massive leverage for PURPCLAW's tool ecosystem
- Wrap legacy PURPCLAW tools as Composio toolkits
- Use managed OAuth for user-facing integrations

## Integration sketch
```python
from composio_openai import ComposioToolSet, Action
from openai import OpenAI

tools = ComposioToolSet().get_tools(actions=[Action.GITHUB_CREATE_ISSUE])
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    tools=tools,
    messages=[{"role": "user", "content": "File a bug on PURPCLAW repo"}],
)
```

## Sources
- https://github.com/ComposioHQ/composio
- https://docs.composio.dev/
- Composio blog (2025)
