# PURPCLAW Intelligence Spine

PurpClaw must address Graph RAG, chunking, quantization, guardrails, inference, KV cache, context window, and context cache as first-class runtime concerns.

This is not a separate brain. It is the intelligence policy layer under the same supervisor, router, governance checks, and context packet model.

## Command Surface

```bash
purpclaw intelligence
purpclaw intelligence --json
purpclaw intelligence graph "memory governance routing"
purpclaw intelligence graph "memory governance routing" --json
purpclaw intelligence chunk --source docs/CANONICAL_OVERVIEW.md
purpclaw intelligence budget --source docs/CANONICAL_OVERVIEW.md
```

## Layers

| Layer | Runtime responsibility | Current surface |
| --- | --- | --- |
| Graph RAG | Build a retrieval graph from Memory Matrix, Knowledge Pool memories, skills, and routing hints. | `lib/intelligence-spine.js`, `purpclaw intelligence graph` |
| Chunking | Split content into deterministic overlapping chunks with content hashes. | `chunkText()` |
| Quantization | Track selected quantization mode from env or model naming. | `PURPCLAW_QUANTIZATION_MODE` |
| Guardrails | Enforce governance checks, job contracts, approval holds, and rate limits. | `lib/governance.js`, `lib/job-contract.js`, `lib/rate-limit.js` |
| Inference | Route model calls through the provider layer instead of per-agent model drift. | `lib/llm-provider.js` |
| KV Cache | Track whether KV cache control is provider-managed or local-runtime controlled. | `PURPCLAW_KV_CACHE_MODE` |
| Context Window | Budget context with a reserved response allowance. | `buildContextBudget()` |
| Context Cache | Reuse memory recall and context packet continuity. | `lib/memory-client.js`, `lib/context-packet.js` |

## Configuration

```env
PURPCLAW_CONTEXT_WINDOW_TOKENS=128000
PURPCLAW_RESPONSE_RESERVE_TOKENS=8000
PURPCLAW_CHUNK_TOKENS=900
PURPCLAW_CHUNK_OVERLAP_TOKENS=120
PURPCLAW_GRAPH_RAG_LIMIT=24
PURPCLAW_QUANTIZATION_MODE=
PURPCLAW_KV_CACHE_MODE=provider-managed
PURPCLAW_CONTEXT_CACHE_TTL_MS=30000
```

## Runtime Notes

Graph RAG is live when Knowledge Pool and Memory Matrix are reachable. If one recall surface is offline, the graph command still uses the reachable surfaces and reports source availability.

Quantization and KV cache are policy-aware today. They become fully local-control layers when the selected inference backend exposes direct quantization and KV cache controls.

Context window budgeting is always active. It ranks context items, reserves output tokens, drops low-ranked items that do not fit, and reports the remaining budget.

The feature parity audit includes this spine:

```bash
purpclaw parity --health
```
