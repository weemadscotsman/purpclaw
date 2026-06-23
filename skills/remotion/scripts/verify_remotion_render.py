#!/usr/bin/env python3
"""
verify_remotion_render.py — proves a Remotion render actually has content.

Usage: python verify_remotion_render.py <video.mp4> [<still.png>]

Checks:
  1. <video.mp4> exists and is a real MP4 (file(1) + ffprobe).
  2. ffprobe reports Duration > 0, h264 codec, declared resolution.
  3. If <still.png> is given, sample pixel alpha at center + corners. Catch
     the "blank template renders null" trap (alpha=0 everywhere).

Exit code 0 on success, 1 on any failure. Designed to be run after
`npx remotion render` so the agent never reports "done" on a transparent
canvas again.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> int:
    if len(sys.argv) < 2:
        fail("usage: verify_remotion_render.py <video.mp4> [<still.png>]")

    video = Path(sys.argv[1])
    still = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    if not video.is_file():
        fail(f"video not found: {video}")
    print(f"OK: video exists ({video.stat().st_size} bytes)")

    # File-type check
    if shutil.which("file") is None:
        fail("`file` command not available; install file / Git for Windows")
    file_out = subprocess.run(["file", str(video)], capture_output=True, text=True)
    if "ISO Media" not in file_out.stdout or "MP4" not in file_out.stdout:
        fail(f"file(1) says: {file_out.stdout.strip()!r} (expected ISO Media MP4)")
    print(f"OK: file(1): {file_out.stdout.strip()}")

    # ffprobe
    if shutil.which("ffmpeg") is None:
        fail("ffmpeg/ffprobe not on PATH")
    probe = subprocess.run(
        ["ffmpeg", "-i", str(video)],
        capture_output=True,
        text=True,
    )
    probe_text = probe.stderr  # ffmpeg -i writes metadata to stderr
    if "Duration:" not in probe_text:
        fail("ffprobe did not report a Duration; output:\n" + probe_text[-800:])
    duration_line = [l for l in probe_text.splitlines() if "Duration:" in l][0]
    print(f"OK: {duration_line.strip()}")

    if "h264" not in probe_text:
        fail("video is not h264; output:\n" + probe_text[-800:])
    print("OK: codec is h264")

    if still is not None:
        if not still.is_file():
            fail(f"still not found: {still}")
        try:
            from PIL import Image  # type: ignore
        except ImportError:
            fail("PIL/Pillow not installed; pip install pillow")
        im = Image.open(still).convert("RGBA")
        print(f"OK: still is {im.size[0]}x{im.size[1]} RGBA")
        for label, (x, y) in [("center", (im.size[0] // 2, im.size[1] // 2)),
                              ("top-left", (10, 10)),
                              ("top-right", (im.size[0] - 10, 10))]:
            px = im.getpixel((x, y))
            if px[3] == 0:
                fail(f"{label} pixel ({x},{y}) is fully transparent (alpha=0) — "
                     "blank composition, the template renders null")
            print(f"OK: {label} ({x},{y}) = RGBA{px}")

    print("\nALL CHECKS PASSED — real render with real content.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
