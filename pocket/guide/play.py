#!/usr/bin/env python3
"""
Pocket OS Audio Guide Player
=============================
Generates and plays TTS audio for the onboarding walkthrough.
Each step is pre-generated once, cached as WAV, then replayed on demand.

Usage:
  python pocket/guide/play.py list              # list all clips
  python pocket/guide/play.py play <step>       # play a clip
  python pocket/guide/play.py all               # play all in order
  python pocket/guide/play.py regen             # regenerate cache
  python pocket/guide/play.py menu              # interactive menu

Cache: pocket/guide/cache/<step>.wav
"""
import os
import sys
import json
import subprocess
import hashlib
from pathlib import Path

GUIDE_DIR = Path(__file__).parent
CACHE_DIR = GUIDE_DIR / "cache"
SCRIPTS_FILE = GUIDE_DIR / "audio-scripts.json"

# Use the existing speak_kokoro.py from Hermes
HERMES_DIR = Path("C:/Users/Admin/AppData/Local/hermes/scripts")
SPEAK_SCRIPT = HERMES_DIR / "speak_kokoro.py"
PYTHON_EXE = "C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe"


def load_scripts():
    with open(SCRIPTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_cache_dir():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def cache_path(step_id):
    return CACHE_DIR / f"{step_id}.wav"


def generate_clip(step_id, text):
    """Generate a WAV file for one step using speak_kokoro.py"""
    ensure_cache_dir()
    out_path = cache_path(step_id)

    # Use speak_kokoro.py with output wav path as last argument
    try:
        result = subprocess.run(
            [PYTHON_EXE, str(SPEAK_SCRIPT), text, str(out_path)],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0 and out_path.exists():
            return True
    except subprocess.TimeoutExpired:
        print(f"  Timeout generating {step_id}")
    except Exception as e:
        print(f"  Error generating {step_id}: {e}")
    return False


def play_clip(step_id):
    """Play a cached or freshly-generated clip"""
    wav = cache_path(step_id)
    if not wav.exists():
        scripts = load_scripts()
        step = scripts.get("scripts", {}).get(step_id)
        if not step:
            print(f"  Unknown step: {step_id}")
            return False
        print(f"  Generating {step_id} (first time, may take ~20s)...")
        if not generate_clip(step_id, step["text"]):
            return False

    # Play with Windows SoundPlayer via PowerShell
    try:
        # Write a small PS script to a temp file to avoid shell escaping issues
        ps_file = CACHE_DIR / f"_play_{os.getpid()}.ps1"
        with open(ps_file, "w") as f:
            f.write(f'$ErrorActionPreference = "Stop"\n')
            f.write(f'Add-Type -AssemblyName PresentationCore\n')
            f.write(f'$wav = Resolve-Path "{wav}"\n')
            f.write(f'$p = New-Object System.Media.SoundPlayer $wav\n')
            f.write(f'$p.PlaySync()\n')
            f.write(f'Write-Output "played-ok"\n')

        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps_file)],
            capture_output=True, text=True, timeout=120
        )
        try:
            ps_file.unlink()
        except OSError:
            pass
        return "played-ok" in (result.stdout or "")
    except Exception as e:
        print(f"  Playback error: {e}")
        return False


def cmd_list():
    scripts = load_scripts()
    print("\n  ╔════════════════════════════════════════════════════╗")
    print("  ║       PurpClaw Audio Guide — Available Clips       ║")
    print("  ╚════════════════════════════════════════════════════╝\n")
    for sid, s in scripts["scripts"].items():
        cached = "✅ cached" if cache_path(sid).exists() else "  generate on demand"
        print(f"  {sid:20s} {cached}  ({s['duration_estimate_sec']}s)  {s['title']}")
    print()


def cmd_play(step_id):
    scripts = load_scripts()
    if step_id not in scripts["scripts"]:
        print(f"\n  Unknown step: {step_id}")
        cmd_list()
        return
    step = scripts["scripts"][step_id]
    print(f"\n  ▶ {step['title']}\n")

    # Always show the text — it's the fallback when audio fails
    print(f"  {'-' * 60}")
    text = step["text"]
    # Wrap to ~70 chars
    import textwrap
    for line in textwrap.wrap(text, width=70):
        print(f"  {line}")
    print(f"  {'-' * 60}\n")

    # Try to play audio (best-effort)
    played = play_clip(step_id)
    if not played:
        print(f"  {col(C.yellow, '⚠ Audio playback failed — text above is the full walkthrough')}\n")


def cmd_all():
    scripts = load_scripts()
    print("\n  Playing full walkthrough...\n")
    for sid, s in scripts["scripts"].items():
        print(f"  ▶ {s['title']}")
        play_clip(sid)
        print()
    print("  ═══════════════════════════════════════")
    print("  Walkthrough complete. Welcome to the claw.")


def cmd_regen():
    scripts = load_scripts()
    print("\n  Regenerating all clips...\n")
    ensure_cache_dir()
    for sid, s in scripts["scripts"].items():
        # Wipe old cache
        wav = cache_path(sid)
        if wav.exists():
            wav.unlink()
        print(f"  Generating {sid}...", end=" ", flush=True)
        if generate_clip(sid, s["text"]):
            print("✅")
        else:
            print("❌")
    print("\n  Done. Cache updated.\n")


def cmd_menu():
    scripts = load_scripts()
    steps = list(scripts["scripts"].keys())

    while True:
        cmd_list()
        print("  Enter a step id to play it, 'a' for all, 'q' to quit:")
        choice = input("  > ").strip().lower()

        if choice in ("q", "quit", "exit"):
            print("  Bye, King.")
            break
        if choice in ("a", "all"):
            cmd_all()
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
    elif cmd == "menu":
        cmd_menu()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
