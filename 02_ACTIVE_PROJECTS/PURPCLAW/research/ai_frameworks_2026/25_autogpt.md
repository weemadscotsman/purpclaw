# 25 — AutoGPT

**Tier:** 8 (Autonomous / Full-Stack)  
**Vendor:** Significant Gravitas  
**License:** MIT  
**Initial release:** 2023 (the original viral agent)  
**Last major update:** 2025 (AutoGPT Platform, Forge)

---

## What it is
The framework that kicked off the autonomous-agent hype. Original AutoGPT demonstrated self-prompting loops. Now AutoGPT Platform offers managed agent building; **Forge** is the SDK.

## Core capabilities
- [x] Autonomous task loops
- [x] AutoGPT Platform (managed, web UI)
- [x] Forge SDK (self-hosted)
- [x] Benchmark suite (AGIQA, GAIA)
- [x] Agent Protocol compatibility
- [x] Marketplace for agents
- [x] Web browsing
- [x] Code execution

## Architecture
- Agent loop: think → act → observe
- Tool registry
- Memory (vector DB)

## Strengths
- Historical importance
- Platform UI nice for non-devs
- Benchmark suite

## Weaknesses
- Production stability weak
- Forge SDK under-maintained
- Platform vendor lock
- Loops easily derail

## Best use case
Experimentation, demos, research. Production: avoid.

## PURPCLAW fit: 2/10
- ROBOT tier D recommendation
- Avoid for production
- Historical reference only

## Integration sketch
```python
# Forge (deprecated-ish)
from forge.sdk import Agent
```

## Sources
- https://github.com/Significant-Gravitas/AutoGPT
- https://agpt.co/
- AutoGPT blog (2025)
