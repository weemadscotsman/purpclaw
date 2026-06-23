# 19 — Activepieces

**Tier:** 5 (Visual / No-Code)  
**Vendor:** Activepieces  
**License:** MIT (open-core)  
**Initial release:** 2022  
**Last major update:** 2025 (AI flows, 200+ pieces)

---

## What it is
Open-source Zapier alternative. Visual workflow automation with AI agent primitives (LLM calls, AI agents as pieces). Strong focus on no-code automation, not pure agent framework.

## Core capabilities
- [x] Visual flow builder
- [x] 200+ integrations ("pieces")
- [x] AI pieces (OpenAI, Anthropic, custom)
- [x] Agent piece (loop with tools)
- [x] Triggers (webhooks, schedules, events)
- [x] Code piece (TypeScript custom logic)
- [x] Self-hostable
- [x] Embeddable
- [x] Tables (built-in DB)

## Architecture
- Visual flows (steps + branches)
- Each step is a "piece"
- Runs on Node.js backend

## Strengths
- Mature workflow automation
- Strong integrations library
- True open source
- AI primitives added cleanly

## Weaknesses
- Not an agent framework (workflow tool with AI)
- Visual abstraction limits
- Smaller AI community than LangChain-based tools

## Best use case
Internal automations, glue code, business process automation, Zapier replacement.

## PURPCLAW fit: 4/10
- Niche — workflow automation, not agent orchestration
- Could expose PURPCLAW capabilities as Activepieces pieces

## Integration sketch
```bash
docker run -d -p 8080:80 -e AP_DB_TYPE=sqlite activepieces/activepieces
```

## Sources
- https://github.com/activepieces/activepieces
- https://www.activepieces.com/
