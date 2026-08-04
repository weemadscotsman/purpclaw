# 16 — Helicone

**Tier:** 4 (Observability / Operations)  
**Vendor:** Helicone  
**License:** MIT (self-host), SaaS  
**Initial release:** 2023  
**Last major update:** 2025 (sessions, agents, observability 2.0)

---

## What it is
LLM observability platform. Sits between your app and LLM providers as a proxy. Logs every request/response, tracks cost, latency, quality, and supports experiments + evals. Framework-agnostic.

## Core capabilities
- [x] Request/response logging
- [x] Cost tracking (per-request, per-user)
- [x] Latency tracking
- [x] Quality scoring (custom metrics)
- [x] Sessions (group related calls)
- [x] Agents support (multi-LLM-call grouping)
- [x] Experiments (A/B prompts/models)
- [x] Evals (CI/CD)
- [x] Caching
- [x] Rate limiting
- [x] Self-host option
- [x] Multi-provider (OpenAI, Anthropic, etc.)

## Architecture
- Proxy: replace `https://api.openai.com` with `https://oai.helicone.ai`
- Headers for user tracking
- Or use SDK/drop-in client

## Strengths
- Zero-code-change instrumentation (just change base URL)
- Self-host option
- Framework-agnostic
- Cost + quality + latency unified

## Weaknesses
- Proxy adds latency (small)
- Self-host has operational cost
- Less agent-specific than AgentOps

## Best use case
Any app using LLMs that needs observability without rewriting code. Cost optimization experiments.

## PURPCLAW fit: 7/10
- Excellent LLM call visibility
- Pairs well with AgentOps (LLM-level + agent-level)
- Cost tracking valuable for PURPCLAW's local-first + cloud hybrid

## Integration sketch
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://oai.helicone.ai/v1",
    default_headers={"Helicone-Auth": f"Bearer {HELICONE_KEY}"},
)
response = client.chat.completions.create(...)
```

## Sources
- https://github.com/Helicone/helicone
- https://www.helicone.ai/
- Helicone docs (2025)
