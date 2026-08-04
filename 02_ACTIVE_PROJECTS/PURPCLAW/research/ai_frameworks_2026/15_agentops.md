# 15 — AgentOps

**Tier:** 4 (Observability / Operations)  
**Vendor:** AgentOps AI  
**License:** MIT (SDK), SaaS (dashboard)  
**Initial release:** 2024  
**Last major update:** 2025 (multi-framework, eval suite)

---

## What it is
Observability and evaluation platform built specifically for AI agents. SDK instruments any agent framework, captures every LLM call, tool call, and decision. Dashboard shows traces, costs, latency, errors. Includes evaluation suite for regression testing.

## Core capabilities
- [x] Auto-instrumentation for major frameworks
- [x] LLM call tracking (cost, latency, tokens)
- [x] Tool call tracking
- [x] Session/thread visualization
- [x] Cost analytics
- [x] Error tracking
- [x] Evaluation suite (regression tests)
- [x] Replay sessions
- [x] Multi-framework support
- [x] Self-host option

## Architecture
```python
import agentops
agentops.init(api_key="...")

@agentops.track_agent(name="my_agent")
def my_agent(...): ...
```
- SDK records events to dashboard
- Framework-specific auto-instrumentation

## Strengths
- Purpose-built for agents (not generic LLM)
- Auto-instrumentation = minimal code
- Cost tracking
- Eval suite for CI/CD

## Weaknesses
- SaaS dependency (self-host available)
- Pricing scales with events
- Vendor-specific format

## Best use case
Production agent deployments needing observability, cost control, and eval-driven development.

## PURPCLAW fit: 10/10 🏆
- ROBOT's Tier S recommendation
- Perfect for PURPCLAW's quality culture
- Cost tracking critical for multi-agent swarms
- Eval suite aligns with PURPCLAW's precision engineering

## Integration sketch
```python
import agentops
from agentops import track_agent

agentops.init(api_key=os.environ["AGENTOPS_API_KEY"])

@track_agent(name="purpclaw_router")
async def router_agent(state):
    ...
```

## Sources
- https://github.com/AgentOps-AI/agentops
- https://agentops.ai/
- AgentOps docs (2025)
