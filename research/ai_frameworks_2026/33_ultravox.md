# 33 — Ultravox

**Tier:** 9 (Emerging / Niche)  
**Vendor:** Fixie.ai  
**License:** MIT  
**Initial release:** 2024  
**Last major update:** 2025

---

## What it is
Multimodal model that processes audio directly (no separate ASR step). Real-time voice agents with one model. Open-source ultravox models + SDK.

## Core capabilities
- [x] Audio → text direct (no ASR)
- [x] Real-time voice agents
- [x] Tool use during voice calls
- [x] Open weights (Ultravox v0.4+)
- [x] Low latency

## Architecture
- Multimodal LLM (audio + text)
- Streaming inference
- Function calling

## Strengths
- One model for voice (simpler)
- Low latency
- Open weights

## Weaknesses
- Niche (voice only)
- Quality below GPT-4o realtime
- Smaller ecosystem

## Best use case
Voice-first agents, real-time phone agents, voice assistants.

## PURPCLAW fit: 4/10
- Voice-only niche
- PURPCLAW voice gateway could use
- Track but don't prioritize

## Integration sketch
```python
from ultravox_client import UltravoxClient
client = UltravoxClient(model="fixie-ai/ultravox-v0.4")
response = await client.transcribe_and_respond(audio_bytes, tools=[...])
```

## Sources
- https://github.com/fixie-ai/ultravox
- https://www.ultravox.ai/
