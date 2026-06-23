#!/usr/bin/env python3
"""kokoro_tts.py — Kokoro TTS wrapper for Hermès command provider.
Reads text from {input_path}, writes WAV to {output_path}.
Usage as Hermès command provider:
  python C:/Users/Admin/AppData/Local/hermes/scripts/kokoro_tts.py {input_path} {output_path}
"""
import sys, os, wave, argparse

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HOME", "C:/Users/Admin/AppData/Local/huggingface")

sys.path.insert(0, "C:/Users/Admin/AppData/Local/Programs/Python/Python311/Lib/site-packages")

import numpy as np
from kokoro import KPipeline

VOICE = "af_heart"
LANG = "a"
SPEED = 1.1

_pipeline = None

def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = KPipeline(lang_code=LANG)
    return _pipeline

def synthesize(text: str, output_path: str = None) -> str:
    if not text.strip():
        raise ValueError("Empty text")
    if output_path is None:
        import time
        output_path = f"C:/Users/Admin/AppData/Local/hermes/audio_cache/kokoro_{int(time.time()*1000)}.wav"
    pipeline = get_pipeline()
    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        count = 0
        for result in pipeline(text, voice=VOICE, speed=SPEED):
            if result.audio is not None:
                audio_bytes = (result.audio.numpy() * 32767).astype(np.int16).tobytes()
                wf.writeframes(audio_bytes)
                count += 1
    if count == 0:
        raise RuntimeError("Kokoro produced no audio")
    return output_path

if __name__ == "__main__":
    # Hermès command provider: positional {input_path} {output_path}
    if len(sys.argv) >= 3:
        input_path = os.path.expanduser(sys.argv[1])
        output_path = os.path.expanduser(sys.argv[2])
        text = open(input_path, "r", encoding="utf-8").read()
        out = synthesize(text, output_path)
        print(out)
    else:
        # Fallback: --text arg
        parser = argparse.ArgumentParser()
        parser.add_argument("--text", required=True)
        parser.add_argument("output", nargs="?", help="output wav path")
        args = parser.parse_args()
        out = synthesize(args.text.strip(), args.output)
        print(out)
