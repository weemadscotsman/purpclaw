# 32 — SGLang

**Tier:** 6 (Infrastructure)  
**Vendor:** LMSYS (UC Berkeley)  
**License:** Apache 2.0  
**Initial release:** 2024  
**Last major update:** 2025 (v0.4+, RadixAttention, agent support)

---

## What it is
High-performance LLM serving framework with structured generation. **Not an agent framework** — it's inference runtime. Included here because agents often deploy via SGLang.

## Core capabilities
- [x] High-throughput LLM serving
- [x] RadixAttention (prefix caching)
- [x] Structured generation (JSON, regex, grammar)
- [x] Multi-model serving
- [x] OpenAI-compatible API
- [x] Speculative decoding
- [x] Continuous batching
- [x] Agent primitives (functions, glue)

## Architecture
- Runtime (Python + CUDA)
- RadixAttention tree for prefix sharing
- Structured generation via constraint decoders

## Strengths
- Fast (often faster than vLLM for structured gen)
- Great for agents (structured outputs critical)
- LMSYS pedigree
- OpenAI-compatible

## Weaknesses
- Inference engine, not agent framework
- GPU required
- Newer than vLLM

## Best use case
Self-hosted LLM serving for agent workloads, structured output generation.

## PURPCLAW fit: 5/10
- Relevant if PURPCLAW self-hosts models
- vLLM alternative for agent workloads
- Not directly an agent framework

## Integration sketch
```bash
python -m sglang.launch_server --model meta-llama/Llama-3.1-70B --port 30000
```

## Sources
- https://github.com/sgl-project/sglang
- SGLang paper (2024)
