# NVIDIA NIM Keeper List

Verified 2026-06-08. Use this as the **allowlist** for NIM models in
production. Anything not on this list is **not free-endpoint hosted** —
either license-restricted (non-commercial only) or simply not provisioned
for free-tier keys.

## Lane A — Hosted, NIM Free Endpoint

OpenAI-compatible · `https://integrate.api.nvidia.com/v1` · `NVIDIA_API_KEY`

| Role | Model | Notes |
|---|---|---|
| **Primary agentic brain** (tools) | `meta/llama-3.3-70b-instruct` | ✓ tool-calling works |
| **Heavy swarm / coding** | `qwen/qwen3-coder-480b-a35b-instruct` | 256K context |
| **Reasoning** | `openai/gpt-oss-20b` | alt reasoning tier |
| **Fast/cheap** | `meta/llama-3.1-8b-instruct` | quick agents |
| **Fast/cheap (alt)** | `nvidia/nvidia-nemotron-nano-9b-v2` | survivor mid-tier |
| **Code embeddings** | `nvidia/nv-embedcode-7b-v1` | 4096-dim, FAISS code search |
| **General embeddings** | `baai/bge-m3` | 1024-dim, memory spine |
| **Reranker** | `nvidia/rerank-qa-mistral-4b` | memory recall quality |

## Lane B — Local, ≤6GB VRAM (offline survivor)

Ollama-compatible · fully offline · `LLM_FALLBACK=ollama`

| Model | ~VRAM (4-bit) | Notes |
|---|---|---|
| `qwen2.5:3b` | ~2GB | current `LLM_FALLBACK_MODEL` |
| `llama-3.2-3b` | ~2GB | better offline brain |
| `phi-4-mini` (3.8B) | ~3GB | good reasoning per byte |
| `gemma-2-2b` | ~1.5GB | tiny/fast |
| `llama-3.2-1b` | ~1GB | tiny |
| `llama-3.1-8b` | ~5GB | tight — fits 6GB, little headroom |
| `nemotron-nano-9b` | ~5.5GB | tight |

## AVOID

| Model | Reason |
|---|---|
| `nv-embed-v1` | Non-Commercial Use Only (license risk) |
| `solar-10.7b` | Non-Commercial Use Only (license risk) |
| `deepseek-v4-pro` | Not on free endpoint (404/410 — downloadable only) |
| `gemma-3-4b` | Not on free endpoint (404) |
| `qwen2.5-coder-32b` | Not on free endpoint (410 Gone) |

**Trust nothing from `/models` alone** — the catalog over-reports. Always
probe-test with `purpclaw doctor --nim` or a real call.

## Survivor Cascade

When the primary dies, drop through this list. Two free hosted tiers +
one local offline tier = no paid path required.

```
1. nvidia / meta/llama-3.3-70b-instruct    (hosted, primary)
2. nvidia / meta/llama-3.1-8b-instruct     (hosted, fast fallback)
3. ollama  / qwen2.5:3b                    (local, offline)
4. fail (no further fallbacks)
```

## Recommended `.env` config

```sh
LLM_PROVIDER=nvidia
LLM_MODEL=meta/llama-3.3-70b-instruct
SWARM_PROVIDER=nvidia
SWARM_MODEL=qwen/qwen3-coder-480b-a35b-instruct
LLM_FALLBACK=ollama
LLM_FALLBACK_MODEL=qwen2.5:3b
NVIDIA_API_KEY=nvapi-...
# Embeddings
NVIDIA_EMBED_MODEL=baai/bge-m3
CODE_EMBED_MODEL=nvidia/nv-embedcode-7b-v1
```

## Rate-limit reality

Free endpoints throttle hard (RPM caps per model). NIM RPM counts
in SpendGate, not just tokens. Under heavy swarm fan-out, you'll hit
429 → that's when the cascade should drop to local `qwen2.5:3b`.

## Security note

Keys obtained through interactive use are burnable. Rotate the NVIDIA
API key at https://build.nvidia.com after wiring. Keep it in `.env`
(`NVIDIA_API_KEY=…`), never in code or a committed file. PurpClaw's
secret-redactor masks it in CLI output, but it can't unsend it from
a chat transcript.
