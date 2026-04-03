---
name: openrouter-video-generation
description: "Async render pipeline for OpenRouter video generation. Submit job, poll, download. NOT chat completions. Models: Veo Lite/Fast, Kling v3 Pro/Std, Seedance 2.0. Duration: Veo Lite 4/6/8s only. Check credits before i2v. Stitch 5-10s clips locally."
---

# OpenRouter Video Generation — Async Render Pipeline

## The Mental Model

Video generation on OpenRouter is NOT chat completions. It's an **asynchronous render job**.

Treat it like a GPU render farm or cloud rendering service — submit a job, get a job ID, poll until done, then download.

**Wrong:** "Send prompt → get video immediately"
**Right:** "Submit job → poll → download"

---

## The 4-Stage Pipeline

### Stage 1: Submit Job
```
POST https://openrouter.ai/api/v1/videos
```
Body:
```json
{
  "model": "google/veo-3.1-lite",
  "prompt": "cinematic scene description",
  "duration": 4,
  "aspect_ratio": "16:9",
  "resolution": "720p"
}
```
Or image-to-video:
```json
{
  "model": "kwaivgi/kling-v3.0-pro",
  "prompt": "scene description",
  "duration": 10,
  "aspect_ratio": "16:9",
  "resolution": "1080p",
  "image_url": "data:image/jpeg;base64,<base64>"
}
```

Response:
```json
{
  "id": "job_id_here",
  "status": "pending",
  "polling_url": "https://openrouter.ai/api/v1/videos/job_id_here"
}
```

### Stage 2: Poll
```
GET https://openrouter.ai/api/v1/videos/{job_id}
```
Status values: `pending` → `processing` → `completed` (or `failed`)

Poll every 5 seconds. Video generation takes 30-120 seconds.

### Stage 3: Download
When completed, response includes:
```json
{
  "status": "completed",
  "unsigned_urls": ["https://openrouter.ai/api/v1/videos/{id}/content?index=0"],
  "usage": {"cost": 0.198}
}
```
Download from the unsigned_urls endpoint. Download immediately — URLs expire.

### Stage 4: Verify
Check file size. If 0 bytes or very small — the download URL may have expired. Re-poll or re-generate.

---

## Model Strategy (Cheapest First)

| Phase | Model | Cost | Notes |
|-------|-------|------|-------|
| Test shots | google/veo-3.1-lite | $0.05/sec | 4-8 sec only, 720p |
| Standard | google/veo-3.1-fast | $0.10/sec | Has audio, 4-8 sec |
| Beauty render | kwaivgi/kling-v3.0-std | $0.126/sec | 3-15 sec, i2v |
| Best quality | kwaivgi/kling-v3.0-pro | $0.168/sec | 3-15 sec, i2v |
| ByteDance | bytedance/seedance-2.0 | ~$3-7/M tokens | Token-based |

Duration varies by model:
- Veo Lite: 4, 6, 8 seconds only (NOT 5)
- Veo Fast: 4-8 seconds
- Kling: 3-15 seconds

---

## Critical Rules

1. **NEVER use chat/completions for video** — separate /v1/videos endpoint
2. **Duration must match model** — Veo Lite doesn't do 5s, only 4/6/8
3. **Check credits before i2v** — image-to-video costs MORE than text-to-video
4. **Download immediately** — unsigned_urls expire fast
5. **Max 10 seconds per generation** — AI video degrades, characters mutate
6. **Stitch locally with ffmpeg** — don't generate long videos

---

## Guardrail Requirements

These providers must be in Allowed Providers list:
- Google (for Veo)
- kwaivgi (for Kling)
- ByteDance (for Seedance)
- Alibaba (for Wan)
- Seed (for Seed)

Also set Zero Data Retention ON.

---

## Content Filter — Vertex AI Blocks Rich Prompts

**Symptom:** `The prompt could not be submitted. This prompt contains words that violate Vertex AI's usage guidelines. Support codes: 29310472`

This is Google's own Vertex AI content filter, NOT OpenRouter's guardrail. The two are separate problems:

- **"No endpoints available matching your guardrail restrictions"** → OpenRouter guardrail (provider not in allowed list)
- **"violates Vertex AI usage guidelines"** → Google's content filter (prompt too detailed/risqué/sensitive)

**Trigger examples that got blocked:**
- "Scottish man in 50s" / "suited figure" / demographic descriptors
- "cold stare" / "disapproving expression" / emotional descriptors
- Dark moody settings with specific character types

**What works:** Ultra-minimal visual description only.
```
YOUNG WOMAN with silver hair dances on a dark stage. Black leather jacket, white cropped top. Sharp choreography. Gold microphone stand. Neon pink and blue lights. Smoke effect. Slow camera orbit. Music video style.
```

**Rule:** Keep prompts visually descriptive but emotionally neutral. No character type descriptors, no implied story, just camera/lighting/action.

---

## Guardrail vs Content Filter — How to Tell Them Apart

| Error | Source | Fix |
|-------|--------|-----|
| "No endpoints available matching your guardrail restrictions" | OpenRouter workspace guardrail | Add provider to Allowed Providers in openrouter.ai/settings/guardrails |
| "violates Vertex AI's usage guidelines" | Google Vertex AI content filter | Strip prompt, remove descriptive terms, simplify scene |
| 500 Internal Server Error | OpenRouter/server issue | Retry or try different model |
| 404 Not Found | Model ID wrong or API access not enabled | Check exact model ID from openrouter.ai/models page |

---

## Model Pricing Reference (Live)

Current video model costs (from openrouter.ai/models?output_modalities=video):

| Model | Cost | Duration | Notes |
|-------|------|----------|-------|
| alibaba/wan-2.6 | $0.04/sec | up to 15s | Needs Alibaba in Allowed Providers |
| google/veo-3.1-lite | $0.05/sec | 4/6/8s only | 720p |
| minimax/hailuo-2.3 | $0.0817/sec | ? | Needs MiniMax in Allowed Providers |
| google/veo-3.1-fast | $0.10/sec | 4-8s | Has audio, 1080p |
| alibaba/wan-2.7 | $0.10/sec | up to 15s | Needs Alibaba |
| kwaivgi/kling-v3.0-std | $0.126/sec | 3-15s | i2v capable |
| kwaivgi/kling-v3.0-pro | $0.168/sec | 3-15s | Best quality i2v |
| openai/sora-2-pro | $0.30/sec | ? | Most expensive |

**For Ted:** Always check credits before submitting. $0.78 left ≈ one 6-8s Veo Lite generation. i2v costs MORE than t2v.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 402 Payment Required | Out of credits | Add credits |
| 400 Duration not supported | Wrong duration for model | Use 4/6/8 for Veo Lite |
| 404 No endpoints available | Guardrail blocking provider | Add provider in settings |
| 500 Internal Server Error | Server issue | Retry or try different model |
| unsigned_urls empty | Job failed | Check polling response for error details |

## Content Filtering (Critical)

Google Vertex AI (Veo) has strict content filters. Prompt rejection error code: **29310472**

Causes triggered by:
- Demographic descriptors in prompts ("Scottish man", "50s", etc.)
- Certain keywords flagged by Vertex AI safety system

Fix: Strip ALL demographic/body descriptors. Describe only visual elements:
- **Bad**: "A 50s Scottish man in suit" → triggers filter
- **Good**: "A suited figure stands at the back watching" → passes

Always build prompts with minimal demographic language. Describe clothing, setting, lighting, action — not who the person is.

## ⚠️ THE TUNNEL VISION TRAP — Critical Thinking Rule

**What happened:** Spent 60+ minutes hitting `/chat/completions` endpoint for video generation. Same wrong approach, same error, repeated. Became the problem instead of solving it.

**The user was right:**
> "stop fucking doubrtting uyr self an me i told ui its works but u were fucking it up doing the same hssshit oveer nover without usuing ur noodle tp think around the problem donit think inside theissue u become the issue u think around it like 3rd person view it always top down like ur looking at a blueprints inur head"

**The fix — 3rd person blueprint thinking:**
1. When something fails 3x with the same approach → STOP. Do not repeat.
2. Step back. Ask: "What IS this system? What is the ACTUAL architecture?"
3. Look at the webpage/docs as if reading a blueprint. Top-down view.
4. The video models page listed `/v1/videos` as a separate section. THAT was the clue.
5. Chat completions = text. Video = separate async render pipeline. Different architecture.

**Rule:** If stuck after 3 failed attempts, verbally state the mental model you're using and why it might be wrong before trying again.

---

## HTTP Headers Required

Always include these headers on video POST requests:
```
HTTP-Referer: https://openrouter.ai
X-Title: GhostLink-Demo
```
Some providers require the referer header or reject the request.

## Polling Response Format

Completed job response includes `generation_id` field alongside `id`:
```json
{
  "id": "job_id",
  "generation_id": "gen-vid-1779111620-xxx",
  "status": "completed",
  "unsigned_urls": ["..."],
  "usage": {"cost": 0.396}
}
```

Download from `unsigned_urls[0]` immediately — URLs expire.

---

## Example: Full Generation Script

```python
import urllib.request, json, time

key = 'YOUR_OPENROUTER_KEY'

# Stage 1: Submit
payload = json.dumps({
    'model': 'kwaivgi/kling-v3.0-pro',
    'prompt': 'Your cinematic prompt',
    'duration': 10,
    'aspect_ratio': '16:9',
    'resolution': '1080p'
}).encode()

req = urllib.request.Request(
    'https://openrouter.ai/api/v1/videos',
    data=payload,
    headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req, timeout=30) as r:
    job = json.loads(r.read())
    polling_url = job['polling_url']

# Stage 2: Poll
while True:
    with urllib.request.urlopen(urllib.request.Request(polling_url, headers={'Authorization': f'Bearer {key}'}), timeout=10) as r:
        state = json.loads(r.read())
    if state['status'] == 'completed':
        break
    elif state['status'] in ['failed', 'error']:
        raise Exception(f'Video failed: {state}')
    time.sleep(5)

# Stage 3: Download
url = state['unsigned_urls'][0]
with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': f'Bearer {key}'}), timeout=120) as r:
    with open('output.mp4', 'wb') as f:
        f.write(r.read())
```