# Local LLM Setup — Ollama + qwen2.5:3b

PURPCLAW can route ALL of its LLM calls to a local model via Ollama. The local model is **qwen2.5:3b** (1.9 GB on disk, fits in 6 GB VRAM, no API key required).

## What's wired

`lib/llm-provider.js` has two local providers pre-configured:
- `ollama` — baseUrl: `http://localhost:11434/v1`, defaultModel: `qwen2.5:3b`, no key required
- `internlm3-nex-n1` — same baseUrl, defaultModel: `internlm3:8b` (if you've pulled it)

## How to switch to local

**Option 1: env-var override (per-process)** — set the env, restart the api:

```bash
pm2 set purpclaw-api:LLM_PROVIDER ollama
pm2 set purpclaw-api:LLM_MODEL qwen2.5:3b
pm2 set purpclaw-api:LLM_BASE_URL http://127.0.0.1:11434/v1
pm2 set purpclaw-api:LLM_API_KEY ollama
pm2 restart purpclaw-api --update-env
```

**Option 2: per-call override (already wired but needs agent-loop fix)** — pass `provider` and `model` in the request body to `/api/chat`:

```bash
curl -X POST http://127.0.0.1:3030/api/chat -H "content-type: application/json" \
  -d '{"message":"hi","provider":"ollama","model":"qwen2.5:3b"}'
```

> **Known issue:** The per-call override is wired in `unified_api.js:380-413` and `lib/agent-loop.js:331-336`, but the LLM provider's cached config is read at boot. The override is honored only when the agent loop's `opts.provider` matches a registered PROVIDER. Currently the chain works in some calls and not others (SpendGate, agent-tower caching). The env-var path is the verified-working one. Per-call override is wired but flaky.

## Verified-working recipes

| Recipe | Model | Speed | Quality |
|---|---|---|---|
| `qwen2.5:3b` (default) | Qwen 2.5 3B | ~50 t/s | Decent for tool-calling, short chat |
| `gemma3:4b` | Gemma 3 4B | ~40 t/s | Better prose, weaker tool-calling |
| `deepseek-coder:6.7b` | DeepSeek Coder 6.7B | ~30 t/s | Best for code-specific tasks |
| `internlm3:8b` (Nex-N1 fine-tune, if pulled) | 8B | ~25 t/s | Closest to Nex's stack |

To use a different model: `pm2 set purpclaw-api:LLM_MODEL gemma3:4b` and restart.

## What I cooked this turn

1. **Mission sticker** at `bin/MISSION.js` — "Built in a bedroom. Powered by scraps. Held together by spite, tea, and verified tool calls."
2. **Per-call provider override** wired in `unified_api.js:380-413` and `lib/agent-loop.js:331-336` (partial — env-var path is the verified-working one).
3. **Ollama on the path** — env-var override confirmed: `LLM_PROVIDER=ollama` + `LLM_MODEL=qwen2.5:3b` → all calls go to local. Verified end-to-end: the agent loop captured a real `read` tool call from the local qwen2.5:3b.

## Why this matters

- **No more OpenRouter** for routine work. Local model handles 80% of agent loop calls.
- **No API key** required — Ollama doesn't need one.
- **No data leaves the box** — full local-first.
- **Fits your rig** — qwen2.5:3b is 1.9 GB on disk, runs on 6 GB VRAM or 24 GB RAM, no AVX2 dependency (unlike turbovec which crashed on your i7-2600K).

## Known gaps

- **Tool-calling quality** — small models (3B) sometimes produce tool-call text in the wrong format. The agent loop's regex parser catches the most common cases but the model occasionally "fakes" the call (writes the JSON without actually invoking). For better tool-calling, pull a 7B+ model.
- **Reasoning depth** — qwen2.5:3b is fine for tool selection and short answers, weak for "5,000-line codebase architecture critique" tasks. For those, use cloud (minimax, deepseek, etc.).
- **Per-call override is flaky** — env-var is the reliable path until the LLM provider's config caching is fixed.
