# Hyperframes on Windows — Setup Notes

## Environment Check (Windows)

```bash
node --version    # v24.x works fine
npm --version    # v11.x
ffmpeg -version  # gyan.dev builds work on Windows
```

## ffprobe Not Found

Windows builds of FFmpeg from gyan.dev or BtbN don't include ffprobe by default. This is fine — `hyperframes render` still works. It only affects `hyperframes doctor` checks and media duration probing.

If you need ffprobe: install from https://ffmpeg.org/download.html (Windows builds → essentials build includes ffprobe).

## Chrome-headless-shell Caching

On Windows: `C:\Users\<user>\.cache\puppeteer\chrome-headless-shell\win64-*\chrome-headless-shell.exe`

If render hangs at 120s: run `npx puppeteer browsers install chrome-headless-shell` from the project directory.

Fallback: `export PRODUCER_FORCE_SCREETSHOT=true` — renders via screenshots instead of beginFrame protocol.

## Node.js 24.x on Windows

Works fine with hyperframes 0.6.x. No known issues.

## NPM Global Installs

Global installs go to `C:\Users\<user>\AppData\Roaming\npm\node_modules\hyperframes\`. Add to PATH if `npx hyperframes` fails: `C:\Users\<user>\AppData\Roaming\npm` (already in typical Windows PATH).

## FFmpeg on Windows

Tested working: `ffmpeg version 7.1-essentials_build-www.gyan.dev`. Essentials build is sufficient — not all builds include all codecs.

## Track Overlap Rule

Hyperframes on Windows (and all platforms) enforces: **no two clips on the same track can have overlapping time ranges**. Each clip on a track must end before the next one starts.

Workaround: assign each clip its own track index, or use sequential non-overlapping time ranges per track.

## Prompt-Safe Characters on Windows CLI

When passing prompts with special characters via Windows CLI, use double-quotes not single-quotes:
```
npx hyperframes render --output "C:\path\file.mp4"
```
Single quotes in PowerShell/MSYS2 are treated literally, not as string delimiters.
