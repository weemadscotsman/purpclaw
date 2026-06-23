# 22 — Browser-Use

**Tier:** 6 (Integration / Infrastructure)  
**Vendor:** Browser-Use  
**License:** MIT  
**Initial release:** 2024  
**Last major update:** 2025 (DOM-grounded actions, vision)

---

## What it is
Library that makes websites agent-friendly. Wraps Playwright and gives the LLM a structured view of the page (DOM + screenshot + interactive elements). Agents can click, type, navigate naturally.

## Core capabilities
- [x] DOM understanding (extracts interactive elements)
- [x] Screenshot vision
- [x] Click/type/scroll/navigate
- [x] Multi-tab
- [x] Form filling
- [x] File upload/download
- [x] Cookie/storage handling
- [x] Multi-LLM (OpenAI, Anthropic, Google, local)
- [x] Async API
- [x] Cloud version (managed browsers)

## Architecture
```python
from browser_use import Agent
agent = Agent(
    task="Find PURPCLAW on GitHub and star it",
    llm=ChatAnthropic(model="claude-sonnet-4.5"),
)
result = await agent.run()
```
- Playwright under the hood
- LLM sees structured page representation

## Strengths
- Strong DOM understanding
- Multi-modal (vision + DOM)
- Active development
- Pure Python

## Weaknesses
- Cloud browsers required for scale (or manage own)
- Can be flaky on complex sites
- Token-heavy (DOM dumps)

## Best use case
Web automation, scraping agents, browser-based research, form filling, anything needing to act on real websites.

## PURPCLAW fit: 7/10
- Excellent for PURPCLAW web tasks
- Use for research agents that need to visit sites
- Pair with LangGraph as a specialist worker

## Integration sketch
```python
from browser_use import Agent
from langchain_anthropic import ChatAnthropic

agent = Agent(
    task="Find latest AI agent frameworks",
    llm=ChatAnthropic(model="claude-sonnet-4.5"),
)
history = await agent.run()
```

## Sources
- https://github.com/browser-use/browser-use
- https://browser-use.com/
