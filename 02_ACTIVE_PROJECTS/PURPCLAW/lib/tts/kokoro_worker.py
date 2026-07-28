#!/usr/bin/env python3
"""
kokoro_worker.py — persistent Kokoro TTS worker via stdin/stdout JSON IPC.

Run: python kokoro_worker.py
Stdin:  newline-delimited JSON commands
Stdout: newline-delimited JSON responses

Commands:
  {"cmd":"init"}                          → warm up Kokoro pipeline
  {"cmd":"speak","id":1,"text":"...","voice":"af_heart","wavPath":""}

Responses:
  {"ok":true}                             init success
  {"ok":false,"error":"..."}              init failure
  {"id":1,"ok":true,"ms":123}            speak success
  {"id":1,"ok":false,"error":"..."}       speak failure
"""
import sys, os, json, time, wave, tempfile, signal, glob
import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
HF_HOME = os.environ.get("HF_HOME", "C:/Users/Admin/AppData/Local/huggingface")
os.environ["HF_HOME"] = HF_HOME

PIPELINE = None
VOICE = os.environ.get("TTS_DEFAULT_VOICE", "af_heart")
SPEED = float(os.environ.get("TTS_SPEED", "1.0"))
VOLUME = float(os.environ.get("TTS_VOLUME", "1.0"))

# ── pygame setup ──────────────────────────────────────────────────────────────
try:
    import pygame
    pygame.mixer.init(frequency=24000, size=-16, channels=1, buffer=2048)
    pygame.mixer.music.set_volume(max(0.0, min(1.0, VOLUME)))
except Exception as e:
    print(json.dumps({"ok": False, "error": f"pygame mixer init failed: {e}"}), flush=True)
    sys.exit(1)

# ── stale WAV cleanup ─────────────────────────────────────────────────────────
try:
    for stale in glob.glob(os.path.join(tempfile.gettempdir(), "speak_kokoro_*.wav")):
        try:
            if time.time() - os.path.getmtime(stale) > 30:
                os.unlink(stale)
        except OSError:
            pass
except Exception:
    pass

# ── Kokoro init ──────────────────────────────────────────────────────────────
def init_kokoro():
    global PIPELINE
    try:
        from kokoro import KPipeline
        PIPELINE = KPipeline(lang_code="a", device="cpu")
        print(json.dumps({"cmd": "ready"}), flush=True)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)

# ── speak command ─────────────────────────────────────────────────────────────
def cmd_speak(msg_id, text, voice, wav_path):
    if PIPELINE is None:
        print(json.dumps({"id": msg_id, "ok": False, "error": "pipeline not initialized"}), flush=True)
        return
    if not text:
        print(json.dumps({"id": msg_id, "ok": False, "error": "empty text"}), flush=True)
        return
    t0 = time.time()
    try:
        if not wav_path:
            fd, wav_path = tempfile.mkstemp(prefix="kokoro_worker_", suffix=".wav")
            os.close(fd)
        gen = PIPELINE(text, voice=voice, speed=SPEED)
        audio_np = None
        for i, (gs, ps, audio) in enumerate(gen):
            if hasattr(audio, 'detach'):
                audio_np = audio.detach().cpu().numpy()
            else:
                audio_np = np.asarray(audio)
            audio_int16 = (audio_np * 32767).astype(np.int16)
            with wave.open(wav_path, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(24000)
                w.writeframes(audio_int16.tobytes())
            break
        else:
            raise RuntimeError("pipeline produced no audio")
    except Exception as e:
        print(json.dumps({"id": msg_id, "ok": False, "error": str(e)}), flush=True)
        return

    gen_ms = (time.time() - t0) * 1000

    # Play through pygame mixer (unless --no-play was passed via env)
    play = os.environ.get("TTS_NO_PLAY", "0") != "1"
    if play:
        try:
            pygame.mixer.music.load(wav_path)
            pygame.mixer.music.play()
            while pygame.mixer.music.get_busy():
                pygame.time.wait(50)
        except Exception as e:
            print(json.dumps({"id": msg_id, "ok": False, "error": f"playback failed: {e}"}), flush=True)
            return
        finally:
            try: os.unlink(wav_path)
            except OSError: pass
    else:
        print(f"[kokoro_worker] generated: {wav_path} ({gen_ms:.0f}ms)", file=sys.stderr)

    print(json.dumps({"id": msg_id, "ok": True, "ms": int(gen_ms)}), flush=True)

# ── IPC main loop ─────────────────────────────────────────────────────────────
def main():
    init_kokoro()
    buf = ""
    while True:
        chunk = sys.stdin.read(1)
        if not chunk:
            break
        buf += chunk
        if buf.endswith("\n"):
            line = buf.strip()
            buf = ""
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            cmd = msg.get("cmd", "")
            if cmd == "init":
                init_kokoro()
            elif cmd == "speak":
                cmd_speak(
                    msg_id=msg.get("id", 0),
                    text=msg.get("text", ""),
                    voice=msg.get("voice", VOICE),
                    wav_path=msg.get("wavPath", ""),
                )

if __name__ == "__main__":
    main()
