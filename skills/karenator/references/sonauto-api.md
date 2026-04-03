# Sonauto API Reference

## Endpoints

### Generate (v3)
```
POST https://api.sonauto.ai/v1/generations/v3
Authorization: Bearer {SONAUTO_API_KEY}
Content-Type: application/json

Body:
{
  "prompt": "song description",
  "lyrics": "optional song lyrics",
  "enable_streaming": true,
  "stream_format": "mp3",
  "output_bit_rate": 320,  // MUST set output_format: 'mp3' when using this
  "output_format": "mp3"
}
```

Returns: `{ "task_id": "uuid" }`

### Status Check
```
GET https://api.sonauto.ai/v1/generations/status/{task_id}
Authorization: Bearer {SONAUTO_API_KEY}
```

Returns plain text string: `"GENERATING"`, `"SUCCESS"`, `"FAILURE"`, etc.

With `?include_alignment=true` → returns JSON `{ "status": "...", "alignment_status": "..." }`

### Get Result (use THIS for audio URL)
```
GET https://api.sonauto.ai/v1/generations/{task_id}
Authorization: Bearer {SONAUTO_API_KEY}
```

**Returns FULL JSON with `song_paths[]` audio URLs:**
```json
{
  "id": "66f0ff9b-68ff-4886-8662-956f4f86f351",
  "status": "SUCCESS",
  "created_at": "2026-05-15T17:08:36.956994+00:00",
  "model_version": "v3-preview",
  "song_paths": [
    "https://cdn.sonauto.ai/pubapi/generations3/audio_66f0ff9b-68ff-4886-8662-956f4f86f351_0.mp3"
  ],
  "lyrics": "[Verse 1]...",
  "alignment_status": null,
  "error_message": null
}
```

**The audio URL lives at `song_paths[0]`** — extract this for playback/delivery.

> ⚠️ The `/generations/status/{task_id}` endpoint does NOT return audio URLs — it returns plain text only. Use the full result endpoint to get the actual audio file path.

### Streaming (v3 only)
URL: `https://api-stream.sonauto.ai/stream/{task_id}`

Requires `enable_streaming: true` in generation request. Status must be `GENERATING_STREAMING_READY` before connecting.

---

## Common Errors

### output_bit_rate requires output_format
```
❌ {"output_bit_rate": 320}
✅ {"output_bit_rate": 320, "output_format": "mp3"}
```
Error: `output_bit_rate can only be set when output_format is 'mp3' or 'm4a'`

### Invalid API key
```
{"detail":"Invalid API key format"}
```
→ Check your API key format is `sksonauto_...` not truncated

---

## Status Flow
```
RECEIVED → PROMPT → TASK_SENT → GENERATE_TASK_STARTED → BEGINNING_GENERATION → GENERATING → GENERATING_STREAMING_READY → DECOMPRESSING → SAVING → SUCCESS
```

`GENERATING_STREAMING_READY` = ready to stream
`FAILURE` = no credits deducted, retry