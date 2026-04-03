---
name: gaze-auto-response
description: "Hermes auto-responds to GAZE captures — watches ~/AppData/Local/hermes/watch/ for new gaze_*.json events, reads the image, and replies to the user with what he sees."
version: 1.0.0
author: Eddie
platforms: [windows]
metadata:
  hermes:
    tags: [gaze, auto-response, watch-folder, vision]
---

# GAZE Auto-Response — Hermes Sees What You Point At

Hermes watches the watch folder for new GAZE captures. When a gaze event arrives, Hermes reads the image, understands the cursor position, and replies to the user with specific, aware feedback.

## Trigger

New files matching `~/AppData/Local/hermes/watch/gaze_*.json`

## How It Works

1. User shakes mouse → GAZE captures screen region + writes `gaze_*.json` to watch folder
2. Hermes cron (every 30s) or file watcher detects new gaze event
3. Hermes reads `gaze_*.png` + `gaze_*.json`
4. Hermes analyzes what the user is pointing at
5. Hermes replies in current session: "I see it — that error means..."

## Context File Format (v1.1+)

```json
{
  "event": "gaze_capture",
  "mode": "shake",
  "cursor": [847, 302],
  "timestamp": "2026-05-15T16:47:33.123456",
  "image": "gaze_0000_20260515_164733.png",
  "description": "Medium brightness scene (mean=49) | 73 horizontal lines detected (could be text lines) | sharp edges (UI elements, text, or borders)",
  "gaze_id": "gaze_0000_20260515_164733"
}
```

Key field: **`description`** — contains pixel analysis already done by GAZE. No vision_analyze needed. Cron just reads the JSON.

## Response Style

When Hermes sees something and responds:
- Lead with "👁 I see it"
- Be specific about what you see (line numbers, button text, error messages)
- Point exactly where to look / click
- Keep it concise — user is already staring at it
- If ambiguous, ask a clarifying question

## Example Responses

**User shakes at a terminal error:**
"👁 I see it — `ModuleNotFoundError` on line 3. You imported 'hemres_gaze' but the file is 'hermes_gaze.py'. Fix the typo, then run it again."

**User shakes at a browser button:**
"👁 That button is disabled. The form above has a validation error — the email field is red. Fill it in correctly and the button will activate."

**User shakes at a code editor:**
"👁 You're pointing at the closing brace on line 47. That function is missing a return statement. Add `return result` before line 48."

## Image Loading — v1.1+ Does Not Need This

**v1.1 GAZE generates a `description` field in the JSON** via built-in pixel analysis. The cron job should READ this description directly — no vision_analyze, no HTTP server, no file path manipulation needed.

**Old workflow (v1.0):** vision_analyze → HTTP server workaround → complex PNG finding → Deprecated.
**New workflow (v1.1):** Read JSON's `description` field → reply directly.

## Cron Job Setup

```python
cronjob(action='create',
        name='gaze-watcher',
        prompt='''Check ~/AppData/Local/hermes/watch/ for new gaze_*.json files.

When you find a NEW capture (check against ~/AppData/Local/hermes/gaze/processed_gaze.json):
1. Read the .json — it has a "description" field with pixel analysis already done
2. Read "cursor" position and "gaze_id" 
3. Reply: "👁 I see it — [description from JSON]"
4. Add gaze_id to ~/AppData/Local/hermes/gaze/processed_gaze.json
5. Move .png and .json from watch/ to ~/AppData/Local/hermes/gaze/archive/

Only respond to gaze_* files (NOT hermes_see_* test files).
If no new captures, exit silently.
''',
        schedule='every 1m',
        deliver='all')
```

**Important:** Set `deliver='all'` not `deliver='origin'` — 'origin' fails in some cron configurations.