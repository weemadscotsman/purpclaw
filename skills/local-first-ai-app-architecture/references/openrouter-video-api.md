# OpenRouter Video Generation — API Transport Reference

## The Problem (What Tripped Up a Session)

Spent ~90 minutes trying `/chat/completions` for video. 500 errors, 404s, guardrail errors — all because the video generation API is a completely separate async endpoint from text/chat.

## The Correct Flow

Video generation on OpenRouter uses an **async job pipeline**, NOT the chat endpoint.

### Step 1 — Submit the job

```
POST https://openrouter.ai/api/v1/videos
Authorization: Bearer {OPENROUTER_API_KEY}
Content-Type: application/json
```

Request body:
```json
{
  "model": "google/veo-3.1-lite",
  "prompt": "cinematic scene description",
  "duration": 4,
  "aspect_ratio": "16:9",
  "resolution": "720p"
}
```

Duration constraints vary by model:
- `google/veo-3.1-lite`: 4, 6, or 8 seconds only (not 5)
- `google/veo-3.1-fast`: 4-8 seconds
- `kwaivgi/kling-v3.0-pro`: 3-15 seconds
- `kwaivgi/kling-v3.0-std`: 3-15 seconds
- `bytedance/seedance-2.0`: 10 seconds
- `bytedance/seedance-2.0-fast`: shorter

Response:
```json
{
  "id": "etMeWfQNuL3deRY2ww70",
  "polling_url": "https://openrouter.ai/api/v1/videos/etMeWfQNuL3deRY2ww70",
  "status": "pending"
}
```

### Step 2 — Poll until complete

```
GET https://openrouter.ai/api/v1/videos/{id}
Authorization: Bearer {OPENROUTER_API_KEY}
```

Poll every 3-5 seconds. Status values: `pending` → `processing` → `completed` | `failed`.

### Step 3 — Download when complete

```json
{
  "id": "etMeWfQNuL3deRY2ww70",
  "status": "completed",
  "unsigned_urls": [
    "https://openrouter.ai/api/v1/videos/etMeWfQNuL3deRY2ww70/content?index=0"
  ],
  "usage": { "cost": 0.198, "is_byok": false }
}
```

Download: `GET {unsigned_urls[0]}` with the same Authorization header.

## Model IDs (Website vs API)

The website lists video models with display names that differ from API IDs:

| Website Display Name | API Model ID |
|---------------------|--------------|
| Kling Video v3 Pro | `kwaivgi/kling-v3.0-pro` |
| Kling Video v3 Standard | `kwaivgi/kling-v3.0-std` |
| Kling Video O1 | `kwaivgi/kling-video-o1` |
| Veo 3.1 Lite | `google/veo-3.1-lite` |
| Veo 3.1 Fast | `google/veo-3.1-fast` |
| Veo 3.1 | `google/veo-3.1` |
| Seedance 2.0 | `bytedance/seedance-2.0` |
| Seedance 2.0 Fast | `bytedance/seedance-2.0-fast` |
| Hailuo 2.3 | `minimax/hailuo-2.3` |
| Wan 2.7 | `alibaba/wan-2.7` |
| Wan 2.6 | `alibaba/wan-2.6` |
| Sora 2 Pro | `openai/sora-2-pro` |

**Always use the API model ID**, not the website display name.

## Guardrails / 404 Errors

If you get `"No endpoints available matching your guardrail restrictions"`:
- The provider is blocked in the user's guardrail settings
- Add the provider (Google, ByteDance, Alibaba Cloud Int., etc.) to Allowed Providers in https://openrouter.ai/settings/guardrails
- Providers must be added separately from models

## Credit Costs (Rough)

| Model | Cost |
|-------|------|
| `google/veo-3.1-lite` | ~$0.05/sec → $0.20 for 4s |
| `google/veo-3.1-fast` | ~$0.10/sec → $0.40 for 4s |
| `kwaivgi/kling-v3.0-std` | ~$0.126/sec → $1.26 for 10s |
| `kwaivgi/kling-v3.0-pro` | ~$0.168/sec → $1.68 for 10s |
| `bytedance/seedance-2.0` | ~$7/M tokens (variable duration) |
| `bytedance/seedance-2.0-fast` | ~$5.60/M tokens |
| `alibaba/wan-2.6` | ~$0.04/sec |

Monitor credits: `GET https://openrouter.ai/api/v1/credits`

## Image-to-Video

Some models support image input for i2v. Pass the image as a base64 data URL:
```json
{
  "model": "kwaivgi/kling-v3.0-pro",
  "prompt": "scene description",
  "image_url": "data:image/jpeg;base64,{base64_string}",
  "duration": 10
}
```

Requires sufficient credits (i2v costs more than t2v).

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 500 Internal Server Error | Provider servers down OR invalid model ID in API | Check model ID matches API, not website name |
| 404 Not Found | Wrong endpoint | Must use `/videos` not `/chat/completions` |
| 404 "No endpoints available" | Provider blocked in guardrails | Add provider in settings |
| 402 Payment Required | Credits exhausted | Check balance first |
| Duration not supported | Wrong duration for model | Check model's supported durations |

## Key Insight for Debugging

When stuck on a provider/API issue: stop retrying the same approach, read the actual API docs (`https://openrouter.ai/docs/guides/overview/multimodal/video-generation`), and verify the model IDs exist in the API response, not just on the website.

## Session Transcript Learning

Ted Cannon's session (May 17, 2026):
- Spent ~90 minutes trying chat/completions for video
- The fix was reading the OpenRouter docs page for video generation
- Key insight from Ted: "think around the issue not through it" / "top-down, blueprint view"
- Image gen worked on first try, video took 30+ attempts because of transport layer ignorance
- Lesson: when hitting repeated 500s with same approach, stop and read the docs for the correct API architecture