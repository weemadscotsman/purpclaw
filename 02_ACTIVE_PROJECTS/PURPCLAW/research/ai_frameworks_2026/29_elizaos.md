# 29 — ElizaOS

**Tier:** 9 (Emerging / Niche)  
**Vendor:** ElizaOS  
**License:** MIT  
**Initial release:** 2024 (as ai16z/Eliza), rebranded 2025  
**Last major update:** 2025 (v2, plugin system)

---

## What it is
Agent framework originally for AI-driven DAO participation (ai16z). Grew into general-purpose character/agent framework. Strong plugin ecosystem, multi-platform (Discord, X, Telegram).

## Core capabilities
- [x] Character-based agents (personas)
- [x] Multi-platform clients (Discord, X, Telegram, etc.)
- [x] Plugin system
- [x] Memory (per-character)
- [x] Multi-LLM
- [x] Knowledge/RAG
- [x] Voice
- [x] Image generation

## Architecture
- Character config (JSON)
- Client adapters (one per platform)
- Plugin runtime

## Strengths
- Strong multi-platform support
- Plugin ecosystem
- Character model mature

## Weaknesses
- Niche (originally DAO)
- API churn
- Smaller community than LangChain

## Best use case
Social agents (Discord bots, X personas), DAO participants, character-driven chat.

## PURPCLAW fit: 4/10
- Niche for PURPCLAW's main use cases
- Worth looking at for multi-platform gateway adapters

## Integration sketch
```bash
# Run Eliza character
eliza --character ./characters/robot.json
```

## Sources
- https://github.com/elizaos/eliza
- https://elizaos.ai/
