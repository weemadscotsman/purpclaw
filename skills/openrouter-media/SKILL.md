---
name: openrouter-media
description: "OpenRouter API integration for image and video generation. Model discovery, correct endpoint patterns, base64 image extraction, free-first routing. Ted Cannon / Edinburgh stack."
origin: "ECC session 2026-05-17 — OpenRouter key confirmed live, image gen verified working, video generation fully mapped"
---

# OpenRouter Media Generation

Direct OpenRouter API access for image and video generation — no middleman wrappers (no Muapi, no OpenHiggsfield markup). Ted's stack: OpenRouter key ~$8.71 credits remaining.

## Critical Findings (2026-05-17)

### Video Models on OpenRouter — Correct Architecture

Video generation uses a **separate async API endpoint** from text/chat. Not `/chat/completions` — `POST /api/v1/videos`.

The website shows model display names that differ from API IDs. Both must be added to guardrail settings (models AND providers separately).

**Confirmed working (2026-05-17):** Submitted real video jobs to `google/veo-3.1-lite`, `kwaivgi/kling-v3.0-pro`, `kwaivgi/kling-v3.0-std`, `bytedance/seedance-2.0` — all returned actual MP4 video files. Duration, cost, and polling all verified.

### Actual Video Generation Paths (for Ted)

1. **Muapi / OpenHiggsfield** (`api.muapi.ai`) — Ted's Open Generative AI desktop app runs this. Direct access needs `muapi_key` from muapi.ai account. This is the GPU rendering layer that OpenRouter wraps.
2. **Open Generative AI desktop app** — already installed at v1.0.9. Runs Muapi pipeline locally. Use this as the video generation UI.
3. **Direct provider APIs** — Google Veo direct, Kling direct (requires separate accounts and API keys at provider level).

**Muapi/OpenHiggsfield is NOT a wrapper on a wrapper.** It provides GPU compute for video that OpenRouter doesn't expose. The markup ($29-70/month plans) is for GPU access, not for the model itself. If Ted wants video, Muapi is the right path — not OpenRouter.

### Image Generation — CONFIRMED WORKING

`google/gemini-2.5-flash-image` via chat completions. Returns base64 PNG inline in response. Works perfectly. ~$0.00000025/call.

### The bytedance-seed models through OpenRouter return TEXT DESCRIPTIONS, not video. Do not use them for actual video output.

## Verified Working Models (2026-05-17)

| Type | Model ID | Cost | Notes |
|------|----------|------|-------|
| Image (WORKS) | `google/gemini-2.5-flash-image` | ~free | Returns base64 PNG inline in chat completion response |
| Video (WORKS) | `google/veo-3.1-lite` | ~$0.05/sec | Async endpoint. Duration: 4/6/8s only. Slow poll ~3-5s. |
| Video (WORKS) | `kwaivgi/kling-v3.0-pro` | ~$0.168/sec | Async endpoint. Duration: 3-15s. Best quality. |
| Video (WORKS) | `kwaivgi/kling-v3.0-std` | ~$0.126/sec | Async endpoint. Duration: 3-15s. |
| Video (WORKS) | `bytedance/seedance-2.0` | ~$7/M tokens | Async endpoint. Duration: 10s. |
| Video (TEXT ONLY) | `bytedance-seed/seed-1.6-flash` | free | Text description only — not real video |
| Video (TEXT ONLY) | `bytedance-seed/seed-2.0-mini` | free | Text description only — not real video |

## Image Generation (CONFIRMED WORKING)

Use `google/gemini-2.5-flash-image` via the **chat completions** endpoint. Not a separate images endpoint — it's a multimodal model that returns image as base64 PNG in the response.

### Python Video Generation Pattern (Confirmed Working 2026-05-17)

```python
import urllib.request, json, time

key = 'sk-or-... YOUR_OPENROUTER_KEY_HERE'

# SUBMIT JOB
payload = json.dumps({
    'model': 'kwaivgi/kling-v3.0-pro',
    'prompt': 'Your cinematic video prompt here',
    'duration': 10,
    'aspect_ratio': '16:9',
    'resolution': '1080p'
}).encode()

req = urllib.request.Request(
    'https://openrouter.ai/api/v1/videos',
    data=payload,
    headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'HTTP-Referer': 'https://openrouter.ai', 'X-Title': 'GhostLink-Demo'},
    method='POST'
)
with urllib.request.urlopen(req, timeout=30) as r:
    resp = json.loads(r.read())
    job_id = resp['id']
    print(f"Job submitted: {job_id}")

# POLL
while True:
    time.sleep(5)
    req2 = urllib.request.Request(f'https://openrouter.ai/api/v1/videos/{job_id}', headers={'Authorization': f'Bearer {key}'})
    with urllib.request.urlopen(req2, timeout=10) as r:
        state = json.loads(r.read())
    if state['status'] == 'completed':
        url = state['unsigned_urls'][0]
        break
    elif state['status'] in ['failed', 'error']:
        raise Exception(f"Video generation failed: {state}")
    print(f"Status: {state['status']}")

# DOWNLOAD
req3 = urllib.request.Request(url, headers={'Authorization': f'Bearer {key}'})
with urllib.request.urlopen(req3, timeout=120) as r:
    video_data = r.read()
    with open('output.mp4', 'wb') as f:
        f.write(video_data)
    print(f"Saved {len(video_data)//1024}KB")
```

## Image-to-Video (i2v)

Pass the image as a base64 data URL in the request body:
```json
{
  "model": "kwaivgi/kling-v3.0-pro",
  "prompt": "scene description with character movement",
  "image_url": "data:image/jpeg;base64,{base64_string}",
  "duration": 10
}
```
i2v costs more than t2v — check credits before attempting. Requires credits above ~$2 minimum.

```python
import urllib.request, json, base64

key = 'sk-or-... YOUR_OPENROUTER_KEY_HERE'  # Ted's OpenRouter key

payload = json.dumps({
    'model': 'google/gemini-2.5-flash-image',
    'messages': [{'role': 'user', 'content': 'Your image prompt here'}],
    'temperature': 0.7,
    'max_tokens': 4096
}).encode()

req = urllib.request.Request(
    'https://openrouter.ai/api/v1/chat/completions',
    data=payload,
    headers={
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ghostlink.ai',
        'X-Title': 'GhostLink-Demo'
    },
    method='POST'
)
with urllib.request.urlopen(req, timeout=60) as r:
    resp = json.loads(r.read())
    images = resp['choices'][0]['message'].get('images', [])
    if images:
        img_data = images[0]['image_url']['url']
        b64 = img_data.split('base64,')[1]
        png_bytes = base64.b64decode(b64)
        with open('output.png', 'wb') as f:
            f.write(png_bytes)
```

## OpenRouter Credits Check

```python
req = urllib.request.Request(
    'https://openrouter.ai/api/v1/credits',
    headers={'Authorization': f'Bearer {key}'}
)
with urllib.request.urlopen(req, timeout=15) as r:
    resp = json.loads(r.read())
    credits = resp['data']['total_credits'] - resp['data']['total_usage']
```

## CANN.ON.AI Integration

`higgsfieldService.ts` at `E:/god folder/02_ACTIVE_PROJECTS/CANN.ON.AI MOVIES MAKER/services/` — update model IDs with the correct ones from this skill. The file already exists but was built with wrong assumptions about OpenRouter's video access.

For video in CANN.ON.AI: wire to Muapi API (`api.muapi.ai`) rather than OpenRouter. Muapi is the right infrastructure for actual video generation.

**Important:** See `references/openrouter-video-api-reality.md` for detailed findings on why OpenRouter video models 500 and what the actual video generation paths are.

## Related Skills

- `banana-pro-director` (session-injected via Notion) — use with OpenRouter image generation
- `cinema-worldbuilder` (session-injected via Notion) — use with OpenRouter video prompts (text descriptions)
- `autonomous-ai-agents/agentic-engineering` — task decomposition and model routing