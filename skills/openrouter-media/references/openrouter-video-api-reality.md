# OpenRouter Video API — What Actually Works

**Date:** 2026-05-17  
**Key finding:** Video models shown on OpenRouter website are NOT accessible via API.

## The Problem

OpenRouter lists video models on their website:
- `kling-v3.0-std`, `kling-v3.0-pro`, `kling-video-o1` (by kwaivgi)
- `veo-3.1-lite`, `veo-3.1-fast`, `veo-3.1` (by google)
- `hailuo-2.3` (by minimax)
- `wan-2.6`, `wan-2.7` (by alibaba)
- `seedance-2.0-fast`, `seedance-2.0` (by bytedance)
- `sora-2-pro` (by openai)

These models **do not appear in the `/api/v1/models` endpoint response**. They are website-only integrations.

Every API call to these model IDs returns:
- `500 Internal Server Error` — OpenRouter's servers can't route the request
- `404 Not Found` — guardrail blocking before routing
- `400 Bad Request` — wrong model ID format

## What OpenRouter's API Actually Has

The `/api/v1/models` API returns only these model categories:

| Type | Models in API |
|------|---------------|
| Text | 350+ (including free: deepseek-v4-flash, qwen3-coder, llama-3.3-70b, etc.) |
| Image | `google/gemini-2.5-flash-image` (confirmed working — returns base64 PNG) |
| Embeddings | 25 models |

**No video models in the API response. Zero.**

## Actual Video Generation Paths

For real video generation, use one of:

1. **Muapi (`api.muapi.ai`)** — Ted's Open Generative AI desktop app runs this. Direct access needs `muapi_key` from muapi.ai. This is the GPU rendering layer. The $29-70/month plans are for GPU compute, not model markup.

2. **Open Generative AI desktop app** — already installed v1.0.9. Runs Muapi pipeline. Use this as the video generation UI for now.

3. **Direct provider APIs** — Google Veo direct, Kling direct (need separate accounts/keys at provider level).

## Guardrail Settings (for when video API DOES work)

When OpenRouter eventually exposes video via API, guardrail config matters:

- **Allowed Providers** must include: `Google`, `Alibaba Cloud Int.`, `ByteDance`
- **Zero Data Retention** should be ON for video model routing
- **Non-frontier** toggle affects which endpoints are selected

Current eligibility shows 7 providers, 15 models available — but the video models still 500 because they're not in the API at all, not a routing issue.

## bytedance-seed models through OpenRouter

`bytedance-seed/seed-1.6-flash` and `bytedance-seed/seed-2.0-mini` ARE in the API and cost $0. But they return **text descriptions of videos**, not video files. They are text-to-text models that describe what a video would look like. Do not use them if you need an actual video file.

## Fix Attempted

Updated `openrouter-media` skill to reflect this reality. CANN.ON.AI integration should route video requests to Muapi, not OpenRouter.