# mimi_speak.py — Local Kokoro TTS for PurpClaw voice output
# Usage: python mimi_speak.py "Hello Eddie" output.wav

import sys
import warnings
import io
import soundfile as sf

warnings.filterwarnings("ignore")

async def speak(text: str, output_path: str = "mimi_output.wav", voice: str = "am_puck", speed: float = 1.1):
    from kokoro import KPipeline

    print(f"Loading Kokoro model...", flush=True)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")

    print(f"Synthesizing: {text[:80]}...", flush=True)
    segments = list(pipeline(text.strip(), voice=voice, speed=speed))

    combined_audio = []
    for segment in segments:
        audio_numpy = segment.audio.detach().cpu().numpy()
        combined_audio.extend(audio_numpy)

    buffer = io.BytesIO()
    sf.write(buffer, combined_audio, 24000, format="WAV")
    audio_bytes = buffer.getvalue()

    with open(output_path, "wb") as f:
        f.write(audio_bytes)

    size_kb = len(audio_bytes) // 1024
    print(f"Done. Saved {size_kb}KB to {output_path}", flush=True)
    return output_path

if __name__ == "__main__":
    import asyncio
    text = sys.argv[1] if len(sys.argv) > 1 else "Hello Eddie, this is Mimi."
    output = sys.argv[2] if len(sys.argv) > 2 else "mimi_output.wav"
    voice = sys.argv[3] if len(sys.argv) > 3 else "am_puck"
    asyncio.run(speak(text, output, voice))