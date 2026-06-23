---
name: vector-databases
description: "Vector similarity search and embedding databases for RAG, semantic search, and AI application backends. Sub-200ms semantic search over 30K+ chunks without a heavy vector DB — binary Float32Array + cosine + in-memory cache, see references/fast-semantic-search.md."
version: 1.2.0
metadata:
  hermes:
    tags: [mlops, vector-databases, semantic-search, rag]
    related_skills: []
---

# Vector Databases & Semantic Search

A pragmatic guide to semantic search in real agent runtimes. The default answer is **not** Pinecone/Weaviate/Qdrant — those are right at scale, but the sub-30K-vectors regime is dominated by a much simpler pattern: **a binary Float32Array on disk, an in-memory cache, an inlined dot product, and an in-memory index cache with a 60s TTL**. This is fast enough to be a hot path in a chat endpoint (sub-1s) and avoids the operational tax of running a separate DB.

## When to use this skill

- You need semantic search over a code corpus, knowledge base, or trajectory set in a small-to-medium agent runtime (≤100K vectors).
- You want sub-second response time without spinning up a separate vector DB.
- You're using Ollama or any local embed model (`nomic-embed-text` is 137M params, ~0.5s per embed call).
- You're willing to maintain a binary index file (`vectors.bin` + `vectors.meta.json`).

## When to graduate to a real vector DB

- Vectors > 100K AND you need HNSW/IVF indexing for sub-100ms top-K
- Multiple services need shared search state
- You need filters on metadata before the search (the pattern below filters AFTER the search)
- You need persistence + ACID + replication

For the recipe (binary Float32Array, inlined dot product, build script, common pitfalls, the visualizer fakery lesson), see `references/fast-semantic-search.md`.

## Pitfalls — universal to ALL vector search

1. **Never animate the search results.** Pulse animations, sine wave baselines, and "loading shimmer" patterns look live but are decoration. A user reads them as fakery the moment they don't see real activity behind them. Show real time-bucketed activity: 32 buckets over the last 5 minutes, each bar's height = number of events in that bucket. Empty buckets are SHORT, populated bars are TALL. No sine, no loop.
2. **JSON parse is the bottleneck, not cosine.** 30K vectors × 768d = 23M ops, but parsing a 5MB JSON takes 7s. Use a binary Float32Array file with a 4-byte header (N, D) — drops load to ~800ms.
3. **Embed call latency dominates for small N.** 0.5s per embed via Ollama. For 1M vectors you must batch; for 30K it's the dot product loop.
4. **Cosine = pre-normalized dot product.** Normalize once on index build, then every search is `arr[off..off+D] · query` — no `sqrt`, no `1/||v||`.
5. **Top-K via sort is fine until K is small.** 30K × log(30K) = 425K ops for a full sort. A binary heap is faster only when N is 10x larger.
6. **Symbol-shadowing bug: never name a local `topK`.** If your function signature is `function searchSemantic(query, topK = 5)`, the parameter `topK` shadows any outer `topK` function name. Use a different name like `topKSimilar` for the helper, and call it with `topKSimilar(qvec, vectors, topK)` so the parameter and the function don't collide. Hit this on 2026-06-05 with `TypeError: topK is not a function` from a search call.
7. **OpenRouter model IDs need provider auto-routing.** When `opts.model` contains `/` (e.g. `openai/gpt-oss-20b:free`), it's an OpenRouter model ID, not the local provider's. The LLM provider must detect this and switch base URL/headers to OpenRouter — otherwise the call fails with "unknown model". Pattern lives in `lib/llm-provider.js:streamChat` and `chat` (`if (opts.model && opts.model.includes('/') && cfg.providerName !== 'openrouter')` → swap to openrouter config). When the local provider is the default and the caller passes an OpenRouter model, the provider must rewrite the config to point at `https://openrouter.ai/api/v1` before dispatching.
8. **Don't use module.exports shorthand that breaks.** Patch tool sometimes "lost" lines like `listProviders` and `PROVIDERS` when adding exports. Always re-`node --check` after editing `module.exports` blocks, and if you see `Unexpected token '}'` at the end of the file, look for a missing field separator or a stranded `};`.

## Related

- `references/fast-semantic-search.md` — full recipe (binary cache, inlined dot product, build script, the no-sine-wave lesson)
- `mlops/inference` — model serving + quantization, the `purpclaw` LoRA pipeline uses this stack
- `kernel-job-training-buffer` — wire kernel completions into a training buffer; uses the same embed pipeline
- `sse-streaming-pattern` — when the search result feeds into a streamed LLM call (plan generation, chat)
