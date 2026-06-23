# divisions/voice-infrastructure/AGENTS.md

## Voice Infrastructure Division

Routes voice commands, manages TTS/STT pipelines, and provides audio I/O.

### Keywords
`speech`, `voice`, `audio`, `stt`, `tts`, `transcribe`, `speak`, `listen`, `kokoro`, `whisper`, `speech-to-text`, `text-to-speech`

### Agents

| Agent | Role | Skill |
|---|---|---|
| voice-coordinator | Voice command routing and intent parsing | skills/routing.md |
| voice-bridge | TTS pipeline and audio output | skills/execution.md |
| raven | Voice-to-text transcription | skills/execution.md |

### Routing
- "voice" / "speak" / "say" / "read aloud" → voice-bridge
- "transcribe" / "speech to text" / "voice note" → raven
- "voice command" / "wake word" → voice-coordinator

### Tools
- `voice_coordinator.js` — voice command routing (port 7781)
- `voice_bridge_7792.js` — TTS bridge (port 7792)
- `voice_stt.py` — faster-whisper STT (port 7896)
- `voice_ingress.js` — STT ingress (port 7896)

### Services Used
- Voice Coordinator (port 7781) — voice routing
- Voice Bridge (port 7792) — TTS output
- STT Service (port 7896) — transcription
- Voice Ingress (port 7896) — inbound voice stream

### Pickup
When user says "pickup" → read `memory/pickup-voice.md`

### Handoff
When user says "handoff" → write `memory/handoff-voice.md`

---

*Voice Infrastructure Division — built 2026-06-19*
