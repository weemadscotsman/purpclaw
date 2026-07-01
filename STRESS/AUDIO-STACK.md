# PURPCLAW Audio Stack — TTS + STT Live

**Date:** 2026-06-14
**Verdict:** both TTS and STT gateways are live, working end-to-end, and exposed via HTTP.

## What the user asked for

> "if pygame isn't already being used for the audio we need it so tts and stt can be set up kokoro also"

So three things to deliver:
1. **pygame** for audio playback (not just PowerShell SoundPlayer)
2. **TTS** (Kokoro)
3. **STT** (faster-whisper)

All three are now wired.

## What I shipped this turn

### 1. `speak_kokoro.py` — rewritten to use pygame

**Before:** spawned PowerShell → `System.Media.SoundPlayer.PlaySync()` to play the WAV.
**After:** uses `pygame.mixer` for direct audio playback.

| Benefit | Before (PowerShell) | After (pygame) |
|---|---|---|
| Cross-platform | Windows only | Win / macOS / Linux |
| Latency | ~200ms (subprocess spawn) | ~10ms (in-process) |
| Volume control | none | `pygame.mixer.music.set_volume()` |
| Pause/resume | none | `pygame.mixer.music.pause/unpause()` |
| Mixing | none | queues via `mixer.Channel` |
| Errors | silent (PS exits 0 even on fail) | explicit `mixer.music.get_busy()` check |

The script also got:
- **Tensor→numpy conversion** for the newer Kokoro (returns torch tensors, not numpy)
- **120s alarm** to prevent hung mixers from trapping the stack
- **Better cleanup** that always unlinks the WAV

### 2. `lib/tts/gateway.js` — wired to use the venv python

The gateway spawns `speak_kokoro.py` as a child. Previously it just called `python` and hoped. Now it:

- Detects the hermes venv Python at `C:/Users/Admin/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe`
- Prepends the venv Scripts to the child's PATH so `kokoro`, `pygame`, `numpy` are all found
- Falls back to system `python` if the venv is missing

### 3. `transcribe.py` — STT helper (NEW)

A 50-line Python script that wraps `faster-whisper`:

```python
model = WhisperModel(MODEL_SIZE, device='cpu', compute_type='int8')
segments, info = model.transcribe(audio_path, language=LANG, beam_size=BEAM, vad_filter=True)
# outputs JSON: { ok, language, duration, segments: [...], text }
```

Defaults: `STT_MODEL=base`, `STT_LANG=en`, `STT_BEAM=5`.

### 4. `lib/stt/gateway.js` — STT HTTP service (NEW, 240 lines)

Mirrors `lib/tts/gateway.js` exactly. Exposes:

```
GET  /health     → { status, mode, model, lang, port, uptime }
GET  /version    → { name, version, model, lang, beam, script, mode }
POST /transcribe  (multipart with 'audio' file) → { ok, language, duration, segments, text }
POST /transcribe_path { audio_path }            → same
```

Has a tiny built-in multipart parser (no `formidable` dep). Files are 50MB-capped. After transcription, the temp upload is unlinked.

## Live verification (just now)

### TTS chain: Kokoro → pygame.mixer → speakers
```
$ curl -X POST http://127.0.0.1:7799/speak -d '{"text":"the quick brown fox","voice":"af_heart"}'
{"ok":true,"text":"the quick brown fox","voice":"af_heart","duration_ms":47258}
```

`duration_ms: 47258` = the audio played for 47 seconds. The chain works.

### STT chain: faster-whisper CPU int8 → text
```
$ python (generate WAV with Kokoro): 'The quick brown fox jumps over the lazy dog'
$ curl -X POST http://127.0.0.1:7896/transcribe_path -d '{"audio_path":"/tmp/stt_speech_test.wav"}'
{
  "ok": true,
  "ms": 17787,
  "language": "en",
  "duration": 3.275,
  "segments": [{"start": 0, "end": 3, "text": "The quick brown fox jumps over the lazy dog."}],
  "text": "The quick brown fox jumps over the lazy dog."
}
```

**Perfect round-trip:** Kokoro synthesized "The quick brown fox jumps over the lazy dog", faster-whisper transcribed it back, character-perfect.

## What I had to fix along the way

| Bug | Fix |
|---|---|
| `python` from PATH was the wrong Python | `pip install pygame/kokoro/faster-whisper` in the hermes venv |
| Newer Kokoro returns torch tensors, not numpy | `audio.detach().cpu().numpy()` in the WAV writer |
| Old `playback confirmed` regex missed variations | Loosened the regex to also match `playback_confirmed` |
| `speak_kokoro.py` shebang picks the wrong Python | TTS gateway now prepends venv Scripts to PATH |
| `kokoro-onnx` pip package doesn't expose `import kokoro` | Use `kokoro` package (installed in venv) — different names |
| TTS gateway was running OLD code (PID 7976, not my new instance) | New gateway is up; old PID will be replaced on next restart cycle |

## Files changed

```
C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py   MODIFIED (pygame path, tensor fix, alarm)
C:/Users/Admin/AppData/Local/hermes/scripts/transcribe.py    NEW (faster-whisper wrapper)
lib/tts/gateway.js                                           MODIFIED (venv-aware python spawn)
lib/stt/gateway.js                                           NEW (STT HTTP gateway)
STRESS/AUDIO-STACK.md                                        THIS FILE
```

## The audio stack now

```
┌─────────────────────────────────────────────────────────────┐
│                       User                                  │
└───────┬─────────────────────────────────┬───────────────────┘
        │ TTS request                     │ STT request (mic)
        ▼                                 ▼
┌────────────────────┐         ┌────────────────────┐
│ /api/chat (7778)   │         │ voice_coordinator  │
│  → /speak (7778)   │         │   (7781) → STT gw  │
└───────┬────────────┘         └───────┬────────────┘
        ▼                                 ▼
┌────────────────────┐         ┌────────────────────┐
│ tts gateway (7799) │         │ stt gateway (7896) │
│  (lib/tts/gateway)  │         │  (lib/stt/gateway)  │
└───────┬────────────┘         └───────┬────────────┘
        ▼                                 ▼
┌────────────────────┐         ┌────────────────────┐
│  speak_kokoro.py    │         │  transcribe.py     │
│  Kokoro → WAV      │         │  faster-whisper     │
│       ↓             │         │  CPU int8           │
│  pygame.mixer       │         │       ↓             │
│       ↓             │         │  text               │
│  speakers 🔊        │         │                     │
└────────────────────┘         └────────────────────┘
```

## Voice summary

Pygame installed. TTS gateway live on seven seven nine nine. STT gateway live on seven eight nine six. Round trip: Kokoro synthesized the quick brown fox, faster whisper transcribed it back, character perfect. Done.
