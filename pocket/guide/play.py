#!/usr/bin/env python3
"""
Pocket OS Audio Guide Player — v2 (clean architecture)
=======================================================
Generate WAVs with speak_kokoro.py, but ONLY use it as a generator.
Play WAVs ourselves with platform-native tools. Never trust the
generator's exit code — validate the artifact instead.

Generator: speak_kokoro.py text output.wav
Player:
  Windows: PowerShell System.Media.SoundPlayer (with forced exit)
  Linux:   aplay / paplay / ffplay (whichever is available)
  macOS:   afplay

Cache: pocket/guide/cache/<step>.wav

Usage:
  python pocket/guide/play.py list                # list clips + status
  python pocket/guide/play.py play <step>         # play one
  python pocket/guide/play.py all                 # play all in order
  python pocket/guide/play.py regen               # regenerate cache
  python pocket/guide/play.py gen <step>          # generate one only
  python pocket/guide/play.py menu                # interactive
"""
import os
import sys
import json
import shutil
import struct
import subprocess
import time
from pathlib import Path

GUIDE_DIR = Path(__file__).parent
CACHE_DIR = GUIDE_DIR / "cache"
SCRIPTS_FILE = GUIDE_DIR / "audio-scripts.json"

# Generator script
HERMES_DIR = Path("C:/Users/Admin/AppData/Local/hermes/scripts")
SPEAK_SCRIPT = HERMES_DIR / "speak_kokoro.py"
PYTHON_EXE = "C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe"

# Sanity checks for a valid WAV file
MIN_WAV_BYTES = 5000  # Less than this and it's not a real TTS clip
WAV_HEADER_MAGIC = b'RIFF'


def load_scripts():
    with open(SCRIPTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_cache_dir():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def cache_path(step_id):
    return CACHE_DIR / f"{step_id}.wav"


# ── Artifact validation ────────────────────────────────────

def is_valid_wav(path):
    """Check that path is a real WAV file (RIFF header + size)."""
    try:
        if not path.exists():
            return False, "file does not exist"
        size = path.stat().st_size
        if size < MIN_WAV_BYTES:
            return False, f"file too small ({size} bytes)"
        with open(path, "rb") as f:
            header = f.read(12)
        if not header.startswith(WAV_HEADER_MAGIC):
            return False, "missing RIFF header"
        if header[8:12] != b'WAVE':
            return False, "missing WAVE format"
        return True, f"valid ({size:,} bytes)"
    except Exception as e:
        return False, f"validation error: {e}"


# ── Generation (uses speak_kokoro.py) ─────────────────────

def generate_clip(step_id, text, timeout_sec=180):
    """
    Generate a WAV file by calling speak_kokoro.py.
    Returns (ok, message). The exit code of speak_kokoro.py is UNRELIABLE
    on Windows — we validate the output file instead.

    Writes a sidecar .sha256 file alongside the WAV containing the
    text_checksum used at generation time. On play, we verify the WAV's
    text_checksum matches what we're about to display — ensures audio
    and text fallback stay in sync.
    """
    ensure_cache_dir()
    out_path = cache_path(step_id)

    # If valid WAV already exists, skip
    valid, msg = is_valid_wav(out_path)
    if valid:
      return True, f"already cached ({msg})"

    # Delete any partial file from a previous attempt
    if out_path.exists():
        try:
            out_path.unlink()
        except OSError:
            pass

    # Compute checksum of the text we're about to generate audio for
    import hashlib
    text_checksum = hashlib.sha256(text.encode("utf-8")).hexdigest()

    # Call speak_kokoro.py: <text> <output.wav>
    try:
        result = subprocess.run(
            [PYTHON_EXE, str(SPEAK_SCRIPT), text, str(out_path)],
            capture_output=True, text=True, timeout=timeout_sec,
        )
        # Ignore returncode — speak_kokoro.py doesn't return cleanly.
    except subprocess.TimeoutExpired:
        valid, msg = is_valid_wav(out_path)
        if valid:
            # Write sidecar before returning success
            try:
                with open(out_path.with_suffix('.sha256'), 'w') as f:
                    f.write(text_checksum)
            except OSError:
                pass
            return True, f"timeout but {msg} (using it)"
        return False, f"timeout after {timeout_sec}s and no valid WAV"
    except Exception as e:
        return False, f"generator error: {e}"

    valid, msg = is_valid_wav(out_path)
    if valid:
        # Write sidecar with the text checksum
        try:
            with open(out_path.with_suffix('.sha256'), 'w') as f:
                f.write(text_checksum)
        except OSError:
            pass
        return True, f"generated ({msg})"
    return False, f"generator returned but no valid WAV: {msg}"


# ── Playback (NEVER through speak_kokoro.py) ──────────────

def play_wav(wav_path):
    """
    Play a WAV file using platform-native tools.
    Returns True on success, False on failure.
    """
    wav_path = Path(wav_path)
    if not wav_path.exists():
        return False

    system = sys.platform

    if system == "win32":
        return play_wav_windows(wav_path)
    elif system == "darwin":
        return play_wav_macos(wav_path)
    else:
        return play_wav_linux(wav_path)


def play_wav_windows(wav_path):
    """Windows: PowerShell SoundPlayer with timeout + forced exit."""
    # Write a PS script to a file to avoid shell escaping issues
    ps_file = CACHE_DIR / f"_play_{os.getpid()}.ps1"
    try:
        with open(ps_file, "w") as f:
            f.write(f'$ErrorActionPreference = "Stop"\n')
            f.write(f'Add-Type -AssemblyName PresentationCore\n')
            f.write(f'$wav = Resolve-Path "{wav_path}"\n')
            f.write(f'$p = New-Object System.Media.SoundPlayer $wav\n')
            f.write(f'$p.PlaySync()\n')
            f.write(f'Write-Output "played-ok"\n')

        # Run with timeout. The PlaySync call blocks until done, so
        # we need a hard kill mechanism. We use the timeout argument
        # in subprocess.run — if it times out, we kill the process.
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps_file)],
            capture_output=True, text=True, timeout=180,
        )
        return "played-ok" in (result.stdout or "")
    except subprocess.TimeoutExpired:
        # PowerShell hung. Kill it.
        try:
            subprocess.run(["taskkill", "/F", "/IM", "powershell.exe"],
                           capture_output=True, timeout=5)
        except OSError:
            pass
        return False
    except Exception:
        return False
    finally:
        try: ps_file.unlink()
        except OSError: pass


def play_wav_macos(wav_path):
    """macOS: afplay."""
    try:
        result = subprocess.run(["afplay", str(wav_path)],
                               capture_output=True, timeout=300)
        return result.returncode == 0
    except Exception:
        return False


def play_wav_linux(wav_path):
    """Linux: try aplay, paplay, ffplay in that order."""
    for cmd in (["aplay", str(wav_path)],
                ["paplay", str(wav_path)],
                ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", str(wav_path)]):
        if shutil.which(cmd[0]):
            try:
                result = subprocess.run(cmd, capture_output=True, timeout=300)
                if result.returncode == 0:
                    return True
            except Exception:
                continue
    return False


# ── CLI commands ──────────────────────────────────────────

def cmd_list():
    scripts = load_scripts()
    print("\n  +--------------------------------------------------+")
    print("  |     PurpClaw Audio Guide - Available Clips       |")
    print("  +--------------------------------------------------+\n")
    for sid, s in scripts["scripts"].items():
        valid, msg = is_valid_wav(cache_path(sid))
        if valid:
            status = f"[OK] {msg}"
            color = "\033[32m"  # green
        else:
            status = "[generate on demand]"
            color = "\033[33m"  # yellow
        reset = "\033[0m"
        print(f"  {sid:20s} {color}{status}{reset}  ({s['duration_estimate_sec']}s)  {s['title']}")
    print()


def cmd_play(step_id):
    scripts = load_scripts()
    if step_id not in scripts["scripts"]:
        print(f"\n  Unknown step: {step_id}")
        cmd_list()
        return

    step = scripts["scripts"][step_id]
    print(f"\n  > {step['title']}\n")

    # Always show text first (works even if audio fails)
    print(f"  {'-' * 60}")
    import textwrap
    for line in textwrap.wrap(step["text"], width=70):
        print(f"  {line}")
    print(f"  {'-' * 60}\n")

    # Generate if needed
    wav = cache_path(step_id)
    if not is_valid_wav(wav)[0]:
        print("  Generating audio (first time may take ~30s)...")
        ok, msg = generate_clip(step_id, step["text"])
        if not ok:
            print(f"  [!] Generation failed: {msg}")
            print("  Text above is the full walkthrough.\n")
            return
        print(f"  [OK] {msg}")

    # Verify text integrity: the WAV's sidecar should match the text we're showing
    import hashlib as _hl
    actual_checksum = _hl.sha256(step['text'].encode('utf-8')).hexdigest()
    sidecar_path = wav.with_suffix('.sha256')
    if sidecar_path.exists():
        try:
            sidecar_checksum = sidecar_path.read_text().strip()
            if sidecar_checksum != actual_checksum:
                print(f"  [!] CHECKSUM MISMATCH: WAV was generated from different text")
                print(f"      expected: {actual_checksum[:16]}...")
                print(f"      WAV was:  {sidecar_checksum[:16]}...")
                print(f"      Showing new text anyway. Audio may be out of sync.\n")
        except OSError:
            pass
    # Pre-sidecar WAV (legacy) — still play, no warning

    # Play using native tools (not speak_kokoro.py)
    valid, msg = is_valid_wav(wav)
    if not valid:
        print(f"  [!] Cache invalid: {msg}")
        print("  Text above is the full walkthrough.\n")
        return

    print(f"  Playing {msg}...")
    if play_wav(wav):
        print("  [OK] Playback complete\n")
    else:
        print("  [!] Playback failed - text above is the full walkthrough\n")


def cmd_all():
    scripts = load_scripts()
    print("\n  Playing full walkthrough...\n")
    for sid, s in scripts["scripts"].items():
        print(f"  > {s['title']}")
        cmd_play(sid)
        print()
    print("  ========================================")
    print("  Walkthrough complete. Welcome to the claw.")


def cmd_regen():
    scripts = load_scripts()
    print("\n  Regenerating all clips...\n")
    ensure_cache_dir()
    for sid, s in scripts["scripts"].items():
        wav = cache_path(sid)
        if wav.exists():
            try: wav.unlink()
            except OSError: pass
        print(f"  Generating {sid}...", end=" ", flush=True)
        ok, msg = generate_clip(sid, s["text"])
        print(f"[OK] {msg}" if ok else f"[FAIL] {msg}")
    print("\n  Done.\n")


def cmd_gen(step_id):
    scripts = load_scripts()
    if step_id not in scripts["scripts"]:
        print(f"\n  Unknown step: {step_id}\n")
        return
    s = scripts["scripts"][step_id]
    print(f"  Generating {step_id}...", end=" ", flush=True)
    ok, msg = generate_clip(step_id, s["text"])
    print(f"[OK] {msg}" if ok else f"[FAIL] {msg}")


def cmd_menu():
    scripts = load_scripts()
    steps = list(scripts["scripts"].keys())
    while True:
        cmd_list()
        print("  Enter a step id to play, 'a' for all, 'g <id>' to generate, 'q' to quit:")
        choice = input("  > ").strip().lower()
        if choice in ("q", "quit", "exit"):
            print("  Bye, King.")
            break
        if choice in ("a", "all"):
            cmd_all()
            continue
        if choice.startswith("g "):
            cmd_gen(choice[2:].strip())
            continue
        if choice in steps:
            cmd_play(choice)
        else:
            print(f"  Unknown: {choice}")


def main():
    if len(sys.argv) < 2:
        cmd_menu()
        return
    cmd = sys.argv[1].lower()
    if cmd == "list":
        cmd_list()
    elif cmd == "play" and len(sys.argv) >= 3:
        cmd_play(sys.argv[2])
    elif cmd == "all":
        cmd_all()
    elif cmd == "regen":
        cmd_regen()
    elif cmd == "gen" and len(sys.argv) >= 3:
        cmd_gen(sys.argv[2])
    elif cmd == "menu":
        cmd_menu()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
