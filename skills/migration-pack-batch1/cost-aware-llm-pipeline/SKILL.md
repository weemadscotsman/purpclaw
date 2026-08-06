---
name: cost-aware-llm-pipeline
description: Cost optimization patterns for LLM API usage — model routing by task complexity, budget tracking, retry logic, and prompt caching.
when_to_use: Optimizing API spend, routing tasks to the right model, or adding budget controls.
purpclaw_wiring: lib/llm-provider.js, model_registry.json
---

# Cost-Aware LLM Routing

| Job | Preferred | Cost |
|---|---|---|
| Fast chat | MiniMax / OpenRouter free | ~$0.001 |
| Code | OpenRouter coder | ~$0.01 |
| Local | Ollama | Free |