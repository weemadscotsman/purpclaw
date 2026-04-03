---
name: hermes-gaze
description: "GAZE — turn your mouse into Hermes's eyes. Shake to capture what you're pointing at. No screenshots, no cloud. Local pipe from mouse to brain."
version: 1.0.0
author: Eddie + Hermes
platforms: [windows]
metadata:
  hermes:
    tags: [gaze, mouse, vision, capture, eyes, shake, pynput, mss]
---

# HERMES GAZE — Mouse as Eyes

Shake your mouse. Hermes sees what you're pointing at. No screenshots. No cloud. Just eyes on the prize.

## Quick Start

```bash
cd ~/AppData/Local/hermes/gaze

# SHAKE MODE (default — shake mouse to capture)
python hermes_gaze.py

# ALWAYS MODE (continuous capture every 3s)
python hermes_gaze.py --mode always

# BRIEF MODE (single capture right now)
python hermes_gaze.py --mode brief

# With HTTP receiver (for Hermes to poll)
python hermes_gaze.py --server
```

## How It Works

| Action | Trigger | What Happens |
|--------|---------|-------------|
| **Shake** | 3 rapid left-right mouse movements | Captures 320x320 region around cursor, sends to Hermes watch folder |
| **Always** | Runs continuously | Captures cursor region every 3 seconds, sends to Hermes |
| **Brief** | Single command | Captures what you're pointing at right now |

## Shake Detection Logic

```
3 direction reversals within 0.5s = SHAKE
debounce: 1 second between captures
min horizontal movement: 80px per beat
```

## Output Locations

```
~/AppData/Local/hermes/gaze/         ← local captures (gaze_*.png)
~/AppData/Local/hermes/watch/        ← Hermes watches this (gaze_*.png + gaze_*.json)
~/AppData/Local/hermes/gaze/gaze.http.json  ← HTTP receiver state
```

## Cron Job Monitor Workflow

A cron job monitors `watch/` for new `gaze_*.png` files. When found:

1. Checks `processed_gaze.json` (in `gaze/`) — skip if already marked
2. Reads `gaze_*.json` from the archive (or reconstructs from PNG if needed)
3. Sends reply with description
4. Marks gaze_id in `processed_gaze.json`
5. Moves PNG and JSON from `watch/` to `gaze/archive/`

**Python env note for cron:** The hermes-agent venv (`hermes-agent/venv/Scripts/python`) lacks `numpy` and `Pillow`. Use system Python instead:
```
/c/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe
```
This Python has Pillow. For numpy-based analysis, the `analyze_image_fast` algorithm must be replicated inline (see Pixel Analysis section).

**Older archive JSONs lack description:** Archives from before v1.1 pixel-analysis was added only contain `event`, `cursor`, `mode`, `timestamp`, `image` fields — no `description`. When encountering these, regenerate the description by running the pixel analysis algorithm on the PNG directly.

## CRITICAL LIMITATION — Delivery Requires Active Session

The watch folder + cron integration has one hard constraint: **Eddie must already be in an active conversation with Hermes when the shake happens.**

Why: cron jobs are headless — no active conversation context. `deliver=origin` and `deliver=telegram` both fail when the gateway has no live session for the user. The cron fires, sees the watch folder, but has nowhere to send the reply.

**WORKAROUND — Always Works:**
1. Open Hermes (TUI, Telegram, or any channel)
2. Send a message (even "hi")
3. Now shake — Hermes will respond mid-conversation
4. Works every time, no setup needed

**GAZE Works As-Designed When:** Eddie messages Hermes first, then shakes. The watch folder triggers, cron fires, Hermes is alive in the conversation, reply goes through.

**GAZE Fails Silently When:** Eddie shakes while Hermes is not being talked to. Cron fires, capture is processed, but no delivery target resolves.

If Telegram delivery is needed when Eddie is away, the gateway must be running with an active Telegram bot session. Without that, the workaround above is the only reliable path.

## Hermes Integration

When GAZE lands in `watch/`, Hermes sees:
- `gaze_*.png` — the screenshot
- `gaze_*.json` — context: `{"event": "gaze_capture", "cursor": [x, y], "timestamp": "...", "mode": "shake"}`

Hermes should have a cron or watcher that monitors this folder and responds when captures arrive.

### Cron Delivery (IMPORTANT — PITFALL)

The gaze-watcher cron job MUST target the specific Telegram chat ID, not just `"telegram"`.

**WRONG:** `deliver: "telegram"` — fails with "no delivery target resolved"

**CORRECT:** `deliver: "telegram:433353701"` — resolves to the user's DM

To find the chat ID:
```bash
cat ~/AppData/Local/hermes/channel_directory.json
```
Look for the user's `id` under `platforms.telegram`.

Always verify the gateway state shows Telegram as `"state": "connected"` before relying on cron delivery.

## Dependencies

```
mss         — fast screenshot (pip install mss)
pynput      — mouse listener (pip install pynput)
Pillow      — image handling (pip install Pillow)
pyautogui   — cursor position (pip install pyautogui)
flask       — optional HTTP receiver (pip install flask)
requests    — HTTP POST to receiver (pip install requests)
```

## Settings

Edit the CONFIG block at the top of `hermes_gaze.py`:
- `REGION_SIZE` — capture size (default 320px)
- `SHAKE_THRESHOLD` — direction reversals to trigger (default 3)
- `SHAKE_WINDOW` — time window for shake detection (default 0.5s)
- `SHAKE_DEBOUNCE` — min seconds between captures (default 1.0s)
- `RECEIVER_PORT` — HTTP receiver port (default 9393)

## Files

```
~/AppData/Local/hermes/gaze/
  hermes_gaze.py    ← main script (all modes)
  gaze.py           ← legacy version (keep for compatibility)
  GAZE.bat          ← double-click launcher
  gaze_trigger.py   ← folder watcher for Hermes
```

## Architecture (v1.1+)

**v1.1 introduced built-in pixel analysis** — no AI/vision tool needed at capture time.

When GAZE captures, it now:
1. Captures 320x320 region around cursor using `mss`
2. Runs fast pixel analysis (numpy) to generate a text description
3. Writes the description directly into the `gaze_*.json` as the `description` field
4. Copies both `.png` and `.json` to the watch folder

The JSON's `description` field contains:
```
"Medium brightness scene (mean=49) | moderate contrast | 
colorful image (223 colors) | 73 horizontal lines (could be text lines) | 
sharp edges (UI elements, text, or borders)"
```

This means the cron job only needs to READ the JSON, not analyze the image. No vision_analyze, no HTTP server workaround needed.

## Files

```
~/AppData/Local/hermes/gaze/
  hermes_gaze.py    ← main script (v1.1, all modes)
  gaze.py           ← legacy version
  GAZE.bat          ← double-click launcher
  gaze_trigger.py   ← folder watcher
  processed_gaze.json ← tracks what's been replied to

~/AppData/Local/hermes/watch/
  gaze_*.png + gaze_*.json ← capture events

~/AppData/Local/hermes/gaze/archive/
  ← captures archived after cron responds
```

## Pixel Analysis (what v1.1 generates)

The `analyze_image_fast()` function produces these description elements:
- `Dark/Bright/Medium brightness scene` — overall luminance
- `high/moderate/low contrast` — std deviation of pixels
- `colorful image (N colors)` — unique RGB values
- `N horizontal lines detected` — variance rows (likely text)
- `N vertical features` — variance cols (likely code/multi-column)
- `sharp edges` — diff between adjacent pixels (UI/text)
- `⚠ PROBABLE CODE EDITOR OR TERMINAL` — detected from line+col pattern
- `has dark border/title bar (window)` — dark pixels on edges
- `large light area (browser, document, or white background)` — light pixels