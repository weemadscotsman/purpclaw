# PURPCLAW Provider Routing Doctrine (v2 — drift fix)

**Date:** 2026-06-14
**Module:** `lib/runtime/provider-router.js`
**Status:** Drift fixed. All 10 lanes route to providers with working keys.

## Changes from v1

- **kimi**: REMOVED (key expired, done with it)
- **CODE**: was deepseek (no key) → now **nvidia** with `deepseek-coder-6.7b-instruct` (free)
- **REASONING**: was deepseek (no key) → now **nvidia** with `meta/llama-3.1-70b-instruct`
- **FALLBACK**: was openrouter (no key) → now **nvidia** with `meta/llama-3.1-8b-instruct`
- **Removed**: github-models (key expired), kimi (key expired)

## The 10 Lanes — all working

| Lane | Provider | Env Key | Default Model | Used For |
|---|---|---|---|---|
| `PRIMARY_CHAT` | minimax | `LLM_PROVIDER` | MiniMax-M2.7 | user_chat, bigboss_command, user_facing_response |
| `PRIMARY_TOOL` | minimax | `LLM_PROVIDER` | MiniMax-M2.7 | tool_call, function_call, agent_task |
| `PRIMARY_DELEGATION` | minimax | `LLM_PROVIDER` | MiniMax-M2.7 | agent_pick, task_routing, mission_assign |
| `SWARM` | nvidia | `NVIDIA_API_KEY_PURP3` | meta/llama-3.1-8b-instruct | swarm_dispatch, parallel_research, model_comparison |
| `DIVISION` | nvidia | `NVIDIA_API_KEY_PURP1` | meta/llama-3.1-70b-instruct | division_agent, content_gen, creative_brief |
| `CODE` | nvidia | `NVIDIA_API_KEY_PURP2` | deepseek-ai/deepseek-coder-6.7b-instruct | code_patch, code_review, eval_scoring |
| `REASONING` | nvidia | `NVIDIA_API_KEY_PURP1` | meta/llama-3.1-70b-instruct | reasoning, analysis, plan_review |
| `FALLBACK` | nvidia | `NVIDIA_API_KEY_HERMES` | meta/llama-3.1-8b-instruct | fallback, overflow, strange_task |
| `LOCAL` | ollama | `OLLAMA_BASE_URL` | qwen2.5:3b | local_run, private_task, cheap_tool_loop |
| `PRIVATE_MODE` | ollama | `OLLAMA_BASE_URL` | qwen2.5:3b | airgapped, no_cloud |

## DeepSeek status (2026-06-14)

The DeepSeek direct API key in `.env` is **temporary and untopped** by the operator.
It stays in `.env` as a backup lane but is **not** the default route.

| What | Status |
|---|---|
| DeepSeek direct API key | present, temp, untopped |
| **DEEPSEEK (NVIDIA HOSTED)** —  | **primary, free, working** |
| **DEEPSEEK (NVIDIA HOSTED)** —  | **available, free, working** |
| DeepSeek direct (api.deepseek.com) | backup, not main |

So even without a topped-up direct key, the CODE and REASONING lanes
still get DeepSeek-quality inference through NVIDIA NIM, which is on
the operator's free 1-year tier.

## Routing priority

1. **Privacy level** — `airgapped` → PRIVATE_MODE (always)
2. **Explicit override** — `forcedLane: 'CODE'` → CODE
3. **Task type** — `code_patch` → CODE, etc.
4. **Unknown task** — FALLBACK (nvidia free)

## Key rotation

All 4 NVIDIA keys are still used per-lane:
- `purp1` (default) → DIVISION, REASONING
- `purp2` (evals) → CODE
- `purp3` (swarm) → SWARM
- `hermes` (fallback) → FALLBACK

## What got removed (deprecated)

- `kimi` provider (key expired, no longer needed)
- `github-models` provider (key expired)
- `deepseek` from CODE/REASONING lanes (no direct key) — replaced with nvidia-hosted deepseek-coder
- `openrouter` from FALLBACK lane (no direct key) — replaced with nvidia-hosted llama

## Files
- `lib/runtime/provider-router.js` — updated lanes
- `lib/llm-provider.js` — removed kimi block
- `STRESS/PROVIDER-ROUTING-DOCTRINE.md` — this doc
