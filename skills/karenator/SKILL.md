---
name: karenator
description: "THEKARENATOR 3000 PRO — parody complaint-to-music pipeline. Generates mega-moaner complaint letters via AI text generation, then converts them to songs via Sonauto. User wants cheeky British sitcom comedy energy played completely straight. MiniMax = text only, Sonauto = music only."
version: 1.0.0
origin: EDDIE_SESSION_2026-05-15
trigger: "karenator|complaint generator|complaint to song"
---

# THEKARENATOR 3000 PRO

> Parody complaint letter generator → song pipeline for TikTok content.

## Architecture

```
User Grievance → [MiniMax: text] → Complaint Letter (deadpan serious, absurdly funny)
                              ↓
                     [Sonauto: music] → Karen Anthem MP3
```

**CRITICAL:**
- MiniMax → TEXT ONLY (writing complaints)
- Sonauto → MUSIC ONLY (generating songs)
- NEVER reverse this (MiniMax doesn't generate music, Sonauto doesn't write text)

## Provider Config

### Text Generation (MiniMax/OpenRouter)
- Use `/api/generate-text` route
- Default provider: `openrouter`
- Default model: `deepseek/deepseek-chat` (NOT `deepseek-chat-v1.5` - that model ID doesn't exist)
- Fallback: `minimax` provider if OpenRouter fails

### Correct OpenRouter Model IDs (free + paid)
```
✅ deepseek/deepseek-chat
✅ deepseek/deepseek-chat-v3.1  
✅ deepseek/deepseek-chat-v3-0324
✅ deepseek/deepseek-v3.1-terminus
❌ deepseek/deepseek-v4-flash:free — BLOCKED by privacy guardrails (404)
❌ minimax/minimax-m2.5:free — BLOCKED (same issue)
❌ meta-llama/llama-3.3-70b-instruct:free — BLOCKED
```

Free models with `:free` suffix return `404 No endpoints available`. Fix: disable privacy at https://openrouter.ai/settings/privacy

### Common Error Patterns

| Error | Meaning | Fix |
|-------|---------|-----|
| `404 No endpoints available` | Model blocked by privacy guardrails | Disable privacy in OpenRouter settings |
| `Invalid API key format` | Key is wrong/placeholder/truncated | Verify key format and that it's real |
| `Completion not found` | Model ID doesn't exist in OpenRouter | Use correct model ID from their models page |

### API Key Formats (MUST be real, not placeholder)
- OpenRouter: `sk-or-... YOUR_KEY_HERE` (32+ chars)
- DeepSeek: `sk-...` (50+ chars)
- Sonauto: `sksonauto_...` (starts sksonauto_)
- MiniMax: JWT-like `eyJ...`

**NEVER use placeholder/truncated keys** — they fail silently.

### Music Generation (Sonauto)

Three endpoints — use the RIGHT one:

| Need | Endpoint | Returns |
|------|----------|---------|
| Submit job | `POST /generations/v3` | `{ task_id: "uuid" }` |
| Poll status | `GET /generations/status/{task_id}` | Plain text: `"GENERATING"`, `"SUCCESS"`, `"FAILURE"` |
| Get full result + audio URL | `GET /generations/{task_id}` | JSON with `status`, `song_paths[]`, `lyrics` |

**Critical distinction:**
- `status/{task_id}` → plain text string → use for quick polling in a loop
- `{task_id}` → JSON object → use to retrieve `song_paths[0]` for delivery

Wrong approach: calling `/generations/status/{task_id}` and expecting `song_paths` in the response — it's just plain text like `"SUCCESS"`.

**Correct polling pattern:**
```typescript
// Poll until done
let status = "GENERATING";
while (status === "GENERATING") {
  status = await fetchStatus(taskId); // plain text
  await sleep(3);
}
// Get the full result with audio URLs
const result = await fetchResult(taskId); // JSON with song_paths[]
const audioUrl = result.song_paths[0];
```

## Tone Directive (CRITICAL)

The complaint must be:
- **DEADPAN SERIOUS** — plays completely straight like a real complaint
- **ABSURDLY FUNNY** — humour from treating ridiculous situations as corporate emergencies
- **Classic Karen energy** — entitlement, shock, disbelief, "the audacity"
- **British sitcom style** — like "The Thick of It" or "The Office" characters filing real complaints
- NO irony markers, NO breaking character, NO "this is funny" comments
- Sound like you mean every word but the situation is wacky af

**Example phrases to weave in:**
- "I cannot BELIEVE the audacity"
- "I was frankly quite alarmed by the state of affairs"
- "One might reasonably expect better from a so-called business"
- "I'm sure you did your best" (passive aggressive)
- "Bless your heart"
- "I'll keep you in my prayers"
- "That's certainly... one way to do it"
- "Interesting choice"

## Sonauto API Gotcha

When setting `output_bit_rate` (e.g. 320), MUST also set `output_format = 'mp3'` or API rejects with:
```
"output_bit_rate can only be set when output_format is 'mp3' or 'm4a'"
```

Correct pattern:
```typescript
if (output_bit_rate) {
  body.output_bit_rate = output_bit_rate;
  body.output_format = 'mp3';
}
```

## Server Management (Windows)

Port 3000 conflicts: kill process first
```bash
netstat -ano | grep ":3000" | grep "LISTENING"
taskkill //F //PID <pid>
```

`.next` cache corruption causes ENOENT errors on routes-manifest.json — clean and restart:
```bash
rm -rf .next
node_modules/.bin/next dev -p 3000
```

## User Interaction Style

- Blunt, no fluff. "Do it", "continue", "write it"
- Vibe: "bruh", "king", "pal", "gooper"
- Use voice when possible (text_to_speech)
- Don't send text walls — keep it short and direct
- If verbose output needed, use voice

## Related Skills

- `autonomous-ai-agents/wolf` — multi-agent orchestration patterns
- `productivity/karen` — escalation management (related name but different skill)