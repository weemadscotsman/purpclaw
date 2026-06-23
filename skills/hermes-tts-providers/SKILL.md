---
name: hermes-tts-providers
description: TTS provider configuration for Hermès. Wired via tts.provider in config.yaml. Command-type providers, voice selection, local model wiring (Kokoro, Piper, Coqui, XTTS). When to use which provider and how to add a new local command provider.
origin: Ted Cannon / session 2026-05-28
---

# Hermès TTS Providers

## Active Provider (May 2026)

**Kokoro** is the active default TTS provider — local, no API key, fast after first load.

Config in `~/.hermes/config.yaml`:
```yaml
tts:
  provider: kokoro
  providers:
    kokoro:
      type: command
      command: "C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe C:/Users/Admin/AppData/Local/hermes/scripts/kokoro_tts.py {input_path} {output_path}"
```

## Adding a Command-Type TTS Provider

Hermès supports arbitrary TTS providers via `tts.providers.<name>.type: command`. The command must:
1. Read text from the file at `{input_path}` (UTF-8)
2. Write audio to `{output_path}` (any format Hermès supports: wav, mp3, ogg)
3. Print the output path to stdout on success

```yaml
tts:
  provider: my-tts
  providers:
    my-tts:
      type: command
      command: "/path/to/my_tts.py {input_path} {output_path}"
```

Supported placeholders: `{input_path}`, `{text_path}` (alias for input_path), `{output_path}`, `{format}`.

## Kokoro Setup (May 2026)

Installed: `pip install kokoro` → `C:/Users/Admin/AppData/Local/Programs/Python/Python311/Scripts/kokoro.exe`
Python package: `C:/Users/Admin/AppData/Local/Programs/Python/Python311/Lib/site-packages/kokoro/`
Model cached: `~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M/`
Voice used: `af_heart` (American female, warm)
Language: `a` (American English)
Speed: `1.1`
Sample rate: `24000 Hz, mono, 16-bit`

Key API call pattern:
```python
from kokoro import KPipeline
import numpy as np
pipeline = KPipeline(lang_code='a')  # 'a'=American, 'b'=British, etc.
for result in pipeline(text, voice='af_heart', speed=1.1):
    if result.audio is not None:
        audio_bytes = (result.audio.numpy() * 32767).astype(np.int16).tobytes()
        wf.writeframes(audio_bytes)  # wave file
```

PIPELINE CACHING: create `KPipeline` once and reuse — first call downloads model weights (~350MB, ~30s), subsequent calls are instant. Use a module-level singleton:
```python
_pipeline = None
def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = KPipeline(lang_code=LANG)
    return _pipeline
```

Environment vars to suppress noise:
```bash
TF_CPP_MIN_LOG_LEVEL=3
HF_HUB_DISABLE_SYMLINKS_WARNING=1
HF_HOME=C:/Users/Admin/AppData/Local/huggingface
```

## Available Voices (Kokoro)

| Code | Description |
|------|-------------|
| `af_heart` | American female, warm (current default) |
| `af_bella` | American female, bright |
| `af_sarah` | American female |
| `am_michael` | American male |
| `bf_emma` | British female |
| `bm_george` | British male |

Language codes: `a`=American English, `b`=British English, `h`=Hindi, `e`=Spanish, `f`=French, `i`=Italian, `p`=Portuguese, `j`=Japanese, `z`=Mandarin

## Other Local Providers (available)

| Provider | Config key | Voice | Notes |
|----------|-----------|-------|-------|
| Piper TTS | `piper` | `en_US-lessac-medium` | Windows: `C:/Users/Admin/AppData/Local/Programs/Python/Python311/Scripts/piper.exe` |
| Coqui/neutts | `neutts` | `neuphonic/neutts-air-q4-gguf` | CPU inference |
| Edge TTS | `edge` | `en-US-JennyNeural` | Cloud, requires network |
| ElevenLabs | `elevenlabs` | `pNInz6obpgDQGcFmaJgB` | API key required |
| OpenAI TTS | `openai` | `alloy` | API key required |
| Mistral | `mistral` | `c69964a6-ab8b-4f8a-9465-ec0925096ec8` | API key required |

## Switching Provider

Change `tts.provider` in `~/.hermes/config.yaml` to the provider key. Restart Hermès gateway to apply.

## Troubleshooting

**Provider returns empty audio**: check command placeholder substitution — `{input_path}` and `{output_path}` must both be present.

**Kokoro first call is slow**: normal — downloads ~350MB model on first `KPipeline()` call. Warm with `get_pipeline()` singleton pattern to keep alive.

**Model not found error**: set `HF_HOME` env var pointing to HuggingFace cache directory.
