# divisions/media-operations/AGENTS.md

## Media Operations Division

Generates, transforms, and orchestrates video, image, audio, and music content.

### Keywords
`video`, `image`, `audio`, `generation`, `render`, `storyboard`, `edit`, `synthesis`, `music`, `voice-over`, `thumbnail`, `caption`

### Agents

| Agent | Role | Skill |
|---|---|---|
| bee | Media pipeline orchestration | skills/routing.md |
| gorilla | Heavy media generation tasks | skills/execution.md |
| phoenix | Media re-generation and iteration | skills/execution.md |
| video | Video generation and editing | skills/execution.md |

### Routing
- "generate image" / "create image" / "draw" → gorilla
- "video" / "animate" / "movie" → video
- "music" / "song" / "audio track" → bee
- "regenerate" / "better version" / "improve" → phoenix

### Tools
- `lib/imagegen/gateway.js` — image generation
- `lib/tts/gateway.js` — TTS pipeline
- `lib/stt/gateway.js` — STT pipeline
- `lib/vector/` — media RAG

### Services Used
- Voice Bridge (port 7792) — audio pipeline
  - Vision Monitor (port 7788) — screen capture (moved from 7781 to avoid voice coordinator conflict)
- YOLO Service (port 7779) — object detection
- Cognitive Spine (port 7880) — synthesis reasoning

### Pickup
When user says "pickup" → read `memory/pickup-media.md`

### Handoff
When user says "handoff" → write `memory/handoff-media.md`

---

*Media Operations Division — built 2026-06-19*
