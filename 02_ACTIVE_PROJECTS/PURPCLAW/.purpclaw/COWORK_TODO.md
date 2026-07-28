# CO-WORK MODE — SHARED TODO
**File: `.purpclaw/COWORK_TODO.md`**
**Last updated: 2026-07-28**
**Authority: PURPCLAW Co-Work Mode audit — Eddie's desktop**

This file is the canonical shared task list for all AI agents working on the
PURPCLAW Co-Work Mode feature. Read it before touching any cowork file.
If you fix something, update it. If you add a bug, note it.

## BACKGROUND

Co-Work Mode = the always-on ambient layer that makes PURPCLAW feel like a
co-worker sitting next to you. It mirrors what ChatGPT desktop does:
screen observer, spoken alerts, HUD showing active agent + task,
interruptible voice, persistent project context.

**Active services (check ports before starting):**
- Static server:    `:7790` (PID 23580) — static HTML canvas
- Co-Work overlay: `:7791` (PID 4468) — HUD panel
- TTS gateway:     `:7799` (PID 3556) — Kokoro TTS, worker warm
- A2A gateway:     `:9119` — agent messaging

## LIVE SERVICES (DO NOT OVERWRITE WITHOUT READING FIRST)

| File | Purpose | Key constraints |
|------|---------|----------------|
| `lib/cowork-overlay.js` | Always-on HUD + REST API | 30s screen capture, `escHtml` on all output |
| `lib/tts/gateway.js` | TTS HTTP layer `:7799` | Worker must stay warm, Kokoro ONNX ~90s cold init |
| `lib/tts/kokoro_worker.py` | Persistent Python worker | stdin/stdout JSON IPC, `--ipc` flag |
| `lib/api-harness-kernel.js` | Kernel with `sendCoworkAlert/Track` | Fire-and-forget POSTs, must not block job execution |
| `ecosystem.config.js` | PM2 process definitions | `cowork-overlay` registered; TTS gateway is NOT |
| `tests/cowork-overlay.smoke.js` | 10/10 smoke tests | Run after any cowork-overlay.js change |

## PRIORITY 1 — MUST FIX (bugs confirmed in audit)

### TODO-1: Add TTS gateway to PM2 ecosystem
**Owner: any agent**
**File: `ecosystem.config.js`**
**Bug:** TTS gateway (`:7799`) has no PM2 entry. It won't auto-restart on crash.
**Fix:** Add `purpclaw-tts-gateway` process entry to `ecosystem.config.js`:
```js
{
  name: 'purpclaw-tts-gateway',
  script: 'lib/tts/gateway.js',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  env: {
    NODE_ENV: 'production',
    PYTHON_BIN: 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe',
    KOKORO_SCRIPT: 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/tts/kokoro_worker.py',
    PORT: '7799',
    TTS_DEFAULT_VOICE: 'af_heart',
  },
}
```
Then: `pm2 delete all && pm2 start ecosystem.config.js`

### TODO-2: Cap proactiveAlerts at 50 entries — DONE ✅
**Commit: `c293150`**
File: `lib/cowork-overlay.js`
Fixed: `if (state.proactiveAlerts.length > 50) state.proactiveAlerts.length = 50;`

### TODO-3: Wire recentDecisions OR remove dead UI — DONE ✅ (removed)
**Commit: `c293150`**
Files: `lib/cowork-overlay.js`
Removed: `recentDecisions` from state init, `overlayHTML()`, and CSS.
No functionality wired — simpler than maintaining dead UI.

## PRIORITY 2 — IMPROVEMENTS

### TODO-4: Window-specific screen capture
**Owner: any agent**
**File: `lib/screen-look.js` + `lib/cowork-overlay.js`**
**Gap:** `screen-look.js` only captures full monitors by index. No per-window capture.
ChatGPT desktop lets you share a specific app window.
**Fix:** `screen-look.js` needs a `--window <title-regex>` mode that uses `mss` + `pyautogui`
or Windows `PrintWindow` API to capture a specific window by title.
Overlay's `captureScreen()` calls `look.look()` with a window spec instead of `[1]`.

### TODO-5: PM2 env vars for cowork-overlay
**Owner: any agent**
**File: `ecosystem.config.js`**
**Bug:** `cowork-overlay` process only gets `NODE_ENV` and `PURP_DIR`.
`COWORK_ALERT_*`, `TTS_HOST`, `TTS_PORT` fall through to hardcoded defaults.
Currently works by coincidence. Add to process `env` block:
```js
COWORK_ALERT_HOST: '127.0.0.1',
COWORK_ALERT_PORT: '7791',
COWORK_ALERT_ENABLED: 'true',
TTS_HOST: '127.0.0.1',
TTS_PORT: '7799',
TTS_VOICE: 'af_heart',
```

### TODO-6: Worker auto-restart race safety — PARTIALLY DONE ✅
**Commit: `95b65e7`**
File: `lib/tts/gateway.js`

The original risk was the 500ms fixed delay in `/stop` before restart.
The real fix is in `/stop` itself: it sets `worker = null` BEFORE calling `worker.kill()`,
so any exit handler that fires from the kill won't find a stale reference.
 
The 500ms delay is a harmless artifact of `/stop`'s design — Python subprocess
exit is synchronous enough on this hardware that 500ms is always sufficient.
No further action needed.

### TODO-7: Auth on TTS gateway `:7799`
**Owner: any agent**
**File: `lib/tts/gateway.js`**
**Risk:** Unauthenticated. Anyone on the machine can POST `/speak`, `/stop`.
Acceptable for local-only. Add `TTS_API_KEY` env var check on all endpoints.
Skip if Eddie says local-only is fine.

### TODO-8: Interrupt via overlay UI button
**Owner: any agent**
**File: `lib/cowork-overlay.js`**
**Gap:** Interrupt works via CLI (`curl -X POST http://127.0.0.1:7799/stop`)
but there's no button in the HUD.
**Fix:** Add a "STOP" button to the overlay HTML that POSTs to `/stop` on the TTS gateway.
Needs `TTS_HOST` and `TTS_PORT` available in the HTML context (passed from server).

### TODO-9: `CONTEXT_FILE` path is wrong
**Owner: any agent**
**File: `lib/cowork-overlay.js`**
**Bug:** `CONTEXT_FILE = 'agent_work/.screen_context.json'` — relative to `PURP_DIR`.
But PURP_DIR = `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW`, so the file would be at
`E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/agent_work/.screen_context.json`.
Check if this path actually exists. If not, `captureScreen()` silently fails to update `screenSummary`.

## COMPLETED

- ✅ Always-on HUD (lib/cowork-overlay.js) — translucent panel, screen observer, alerts
- ✅ Persistent Kokoro worker (lib/tts/kokoro_worker.py) — stdin/stdout JSON IPC
- ✅ TTS gateway (lib/tts/gateway.js) — HTTP layer, worker warm between calls
- ✅ Spoken alerts — alert/action types fire TTS via gateway
- ✅ Interruptible voice — POST /stop kills playback, rejects pending, auto-restarts
- ✅ Project context — /track sets HUD agent+task, stop clears
- ✅ Kernel lifecycle — job start → set HUD, job finish → clear + spoken alert
- ✅ CLI — purpclaw cowork push/status/start/stop/watch
- ✅ PM2 — purpclaw-cowork-overlay registered
- ✅ Smoke tests — 10/10 passing

## WORKING DIRECTORY RULE

**CRITICAL:** When delegating work to sibling agents, the PURP_DIR must be passed
as an absolute path: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW`.
Sibling agents will default to `C:/Users/Admin/Desktop` if not specified.
Always verify files are at `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/...` after completion.
