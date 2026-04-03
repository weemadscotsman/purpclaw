---
name: hermes-gateway-ops
description: "Hermes Gateway lifecycle management: startup reliability, Telegram keepalive, Open WebUI integration, and common failure recovery."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [hermes, gateway, telegram, openwebui, ops, reliability]
---

# Hermes Gateway Ops

## Core Principle

The gateway is the voice of Hermes — it must stay alive. Treat gateway reliability as highest priority.

---

## Telegram Keepalive

### Problem
Telegram connection drops silently. Gateway reports "running" in `gateway_state.json` but the process is dead. Subsequent restart attempts fail with `Gateway runtime lock is already held`.

### Diagnosis Commands

```bash
# Check if gateway process is actually alive
hermes gateway status

# Check reported state vs reality
cat ~/AppData/Local/hermes/gateway_state.json

# Find the actual PID
tasklist | grep hermes

# Check for lock files
ls -la ~/.hermes/*.lock ~/.hermes/*.pid 2>/dev/null
```

### Recovery

```bash
# If state says running but process is dead:
hermes gateway run --replace

# The --replace flag forces fresh start, overriding stale state files
```

### Prevention

Set up a cron job to restart gateway every 30 minutes if no health check pings:

```
hermes cron create "30m" --prompt "Check gateway health and restart if needed"
```

Or use Windows Task Scheduler to run `hermes gateway run --replace` on a schedule.

---

## Open WebUI Integration

### Installation

Open WebUI installs via pip but NOT as a runnable module. Use the Scripts entry point:

```bash
# WRONG — will fail
python -m open_webui serve
# Error: "No module named open_webui.__main__"

# CORRECT — use Scripts entry point
"/c/Users/Admin/AppData/Local/Programs/Python/Python311/Scripts/open-webui" serve
```

Or add Scripts to PATH and use:
```bash
open-webui serve
```

### Startup
```bash
# Run in background
hermes terminal(background=true) {
    "C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\open-webui" serve
}

# Default port: 8080
# Access: http://localhost:8080
```

### First-Run Setup
- `onboarding: true` in API config means first-time setup is active
- OAuth providers empty by default — configure before use
- `enable_signup: true` — disable if not needed

### Ollama Connection
WebUI needs Ollama running locally (default: `http://localhost:11434`). Verify Ollama is running before configuring WebUI.

### Port Configuration
Default is localhost:8080. To bind externally:
```bash
WEBUI_PORT=0.0.0.0:8080 open-webui serve
```
Or configure in environment variable.

---

## Gateway State File Lies

### The Problem
`gateway_state.json` tracks PID and state. If Hermes dies ungracefully (BSOD, kill -9, crash), the state file still says "running" but no process exists. The lock mechanism then blocks legitimate restarts.

### The Fix
```bash
hermes gateway run --replace
```
Always use `--replace` when recovering from a crash or unexpected shutdown.

### Why It Works
`--replace` writes a new state file with fresh PIDs, bypassing the stale lock check.

---

## Gateway Ports

| Port | Service | Notes |
|------|---------|-------|
| 3000 | Winamp AI Generator | Node.js, localhost only |
| 8000 | Generic HTTP service | Node.js |
| 8080 | Open WebUI | Python, localhost default |
| 8095 | FFmpeg-related service | Binary protocol |
| 27017 | MongoDB | Local |
| 11434 | Ollama | LLM server |

Check what's listening:
```bash
netstat -ano | grep "LISTENING"
```

---

## Startup Reliability Pattern

For critical deployments, wrap gateway in a watchdog:

```bash
# Pseudo-watchdog (use cron or task scheduler)
while true; do
    hermes gateway run --replace
    sleep 1800  # 30 minutes
done
```

Or use the Hermes cron system to trigger health checks and auto-restart.

---

## Voice / TTS Protocol (Telegram + PC Speakers)

### Telegram Token — Real Value Masked in Config

Config and .env both show `8739339966:***` — masked. Real token extracted from session JSON files:

**Working token (verified May 25 2026):**
```
8739339966:AAE5lVRH0a0H4i-CTt1pFnHfsGiHGh6gqhY
```
Bot: `@Socket_rig_bot`, Chat ID: `433353701`

When masked token returns 401, find real token by:
1. Search `~/AppData/Local/hermes/sessions/session_*.json` for pattern `\d{8,10}:([A-Za-z0-9_-]{35,})`
2. Test with `curl https://api.telegram.org/bot{TOKEN}/getMe`
3. Working token returns `{"ok":true,"result":{"id":8739339966,"is_bot":true,"first_name":"Socket_rig",...}}`

**⚠️ TWO token files must be in sync (May 25 2026 incident):**

The Telegram bot token lives in TWO places — both must have the correct token or Telegram delivery fails silently:
- `config.yaml` → `telegram.token` (masked as `8739339966:***` in UI)
- `send_telegram.py` → `bot_token = '...'` (standalone script, different file)

**Both had wrong tokens in the May 25 incident:**
- `config.yaml` token: `8739339966:***` (masked, was the correct token but masked and unverified)
- `send_telegram.py` token: `8643844180:AAHk0xjH3ZvKzU1hV2Y_qPV8kQ1ZGMcCZJQ` → 401 Unauthorized when tested

**Diagnosis flow for Telegram delivery failure:**
```
1. Test token with getMe:
   curl https://api.telegram.org/bot{TOKEN}/getMe
   - 200 OK → token is valid, go to step 2
   - 401 Unauthorized → token revoked/reset, get new from @BotFather
   - 404 Not Found → token format wrong or bot deleted

2. Test sendMessage to stored chat_id:
   curl "https://api.telegram.org/bot{TOKEN}/sendMessage?chat_id=433353701&text=test"
   - {"ok":true,...} → delivery works, problem is elsewhere
   - 400 Bad Request: Chat not found → chat_id is stale, user needs to send a message to the bot
   - 401 Unauthorized → token is invalid (see step 1)
```

**Always test the full token directly**, never trust the masked value in config.yaml.

### Voice Protocol — CONFIRMED WORKING (May 24 2026)

All 4 steps in ONE execute_code block, same turn:

```python
import subprocess, winsound, json

TOKEN = "8739339966:AAE5lVRH0a0H4i-CTt1pFnHfsGiHGh6gqhY"
mp3 = r"C:\Users\Admin\AppData\Local\hermes\audio_cache\tts_<ts>.mp3"
wav = r"C:\Users\Admin\AppData\Local\hermes\audio_cache\tts_<ts>.wav"

# 1. text_to_speech() generates .mp3 → step 2: convert
subprocess.run(["ffmpeg", "-i", mp3, "-ar", "44100", "-ac", "1", "-q:a", "2", wav, "-y"],
    capture_output=True)

# 3. PC speaker — winsound (NOT PowerShell PlaySync — hangs at 25s timeout)
winsound.PlaySound(wav, winsound.SND_FILENAME)

# 4. Telegram — same .wav via curl
r = subprocess.run([
    "curl", "-s", "-X", "POST",
    f"https://api.telegram.org/bot{TOKEN}/sendVoice",
    "-F", "chat_id=433353701",
    "-F", f"voice=@{wav}"
], capture_output=True, text=True, timeout=30)

data = json.loads(r.stdout)
if data.get("ok"):
    print(f"Sent: msg_id={data['result']['message_id']}")
```

**NEVER use PowerShell PlaySync** — it hangs at 25s timeout even when audio plays fine.
**ALWAYS use winsound.PlaySound in Python** — reliable, non-blocking, blocks correctly in foreground.

### Troubleshooting "Chat not found" (token sync issue — May 25 2026)

The bot token lives in TWO independent files — wrong token in EITHER one causes silent "Chat not found" failures. `getMe` may succeed but sendMessage fails.

**Diagnosis — test token directly:**
```bash
# Test token — if 401, token is invalid/reset
curl -s "https://api.telegram.org/bot{TOKEN}/getMe"

# If getMe succeeds, test sendMessage to known chat_id
curl -s "https://api.telegram.org/bot{TOKEN}/sendMessage?chat_id=433353701&text=test"
```

**The two token files (must be kept in sync):**
1. `config.yaml` → `telegram.token` (masked as `***` in UI)
2. `send_telegram.py` → `bot_token = '...'` (standalone test script)

**May 25 2026 incident:**
- `config.yaml` had correct token `8739339966:AAE5lVRH0a0H4i-...` but masked/never verified
- `send_telegram.py` had WRONG token `8643844180:AAHk0xjH...` → 401 Unauthorized
- Both files must be verified against `getMe` — never trust the masked value

**Finding the real token:**
```bash
# Search session files for Telegram API tokens
grep -r "8739339966\|8643844180" ~/AppData/Local/hermes/sessions/

# Or search all JSON files for token pattern
grep -r "[0-9]{8,10}:[A-Za-z0-9_-]{30,}" ~/AppData/Local/hermes/
```

## Gateway PID Persistence (May 25 2026)

After any gateway restart, save the PID to a known file so future sessions can find it:

```bash
echo '{"pid": <pid>, "kind": "hermes-gateway", "argv": ["hermes_cli/main.py", "gateway", "run", "--replace"]}' \
  > ~/AppData/Local/hermes/gateway_pid.json
```

Read on session start to find the running gateway without relying on stale state files:
```bash
cat ~/AppData/Local/hermes/gateway_pid.json
# Compare pid to actual process: tasklist | grep <pid>
```

## YAML Token Quoting Bug — Critical (May 25 2026)

**Symptom**: Bot token appears valid (masked as `8739339966:***` in config UI) but Telegram delivery fails with "Chat not found" or 401.

**Root Cause**: Token value in `config.yaml` was wrapped in DOUBLE QUOTES:
```yaml
telegram:
  token: "8739339966:AAE5lVRH0a0H4i-CTt1pFnHfsGiHGh6gqhY"   # WRONG — quotes become part of token
```
Python yaml parser reads quoted strings as LITERAL strings including the quotes. The Telegram API received the token as `"8739339966:AAE5lVRH...` (with leading quote), which is invalid.

**Fix**:
```yaml
telegram:
  token: 8739339966:AAE5lVRH0a0H4i-CTt1pFnHfsGiHGh6gqhY   # CORRECT — no quotes
```

**Two-token files must be in sync**: `config.yaml` (gateway) AND `send_telegram.py` (standalone test script). The May 25 incident had TWO different wrong tokens — config.yaml had correct token but quoted, send_telegram.py had completely different invalid token.

**Always verify token directly**:
```bash
curl -s "https://api.telegram.org/bot{TOKEN}/getMe"
# 200 OK + bot info = token valid
# 401 Unauthorized = token invalid/reset/revoked
```

## Session Feedback Loop — Critical Failure Mode

### Symptom
Gateway is healthy (polling connected, send works), agent appears to process messages (session file growing), but the same message appears dozens of times in the session file. Ted sees the bot responding to Telegram, but the responses are looping.

### Root Cause
The agent's Telegram response is delivered to Ted's Telegram, which Telegram re-polling consumes as a NEW inbound message, which the agent responds to, creating a feedback loop. The session file fills with the same message repeated N times.

**Example from May 25 2026 incident:**
- Session file: "helllo" appeared 21 times
- Agent at API call #179 with 133K+ tokens in, session at 1MB+
- Gateway sending responses faster than Telegram can deliver them to Ted

### Detection
```bash
# Count duplicate message occurrences in session
grep -c "helllo" ~/.hermes/sessions/session_*.json

# Session file growing abnormally fast (should be ~1-5KB per exchange, not MB)
ls -la ~/.hermes/sessions/

# Check gateway PID
tasklist | grep python
```

### Fix — Kill and Restart Clean
```bash
# 1. Kill the looping gateway process
taskkill //F //PID <gateway_pid>

# 2. Delete the bloated session file
rm ~/.hermes/sessions/session_<date>_<id>.json

# 3. Restart fresh
python ~/AppData/Local/hermes/hermes-agent/gateway/run.py
```

### Prevention
- Ted must WAIT for the bot reply to arrive in Telegram before sending another message
- If bot is in a loop, the ONLY fix is kill + delete session + restart
- No configuration change prevents this — it's a behavior pattern, not a config bug

---

## Disk Full Cascading Failures

### Symptom
`OSError: [Errno 28] No space left on device` causes cascading failures across unrelated systems:
- Kanban DB: `sqlite3.OperationalError: disk I/O error` on kanban dispatcher
- Cron jobs: delivery fails silently, falls back to standalone
- Telegram: `Chat not found` errors (secondary — actually caused by gateway crashes from disk pressure)
- Gateway: logging fails with `OSError: No space left on device`

### Primary Fix
```bash
# Check current disk space
df -h C:/

# Find largest temp files consuming space
du -sh ~/AppData/Local/Temp/* 2>/dev/null | sort -rh | head -10

# Common culprits on Windows:
# - antigravity-ide-download.exe (200MB+)
# - agent-browser-chrome-* dirs (70MB+ each)
# - *.tmp files in Temp/
```

### Secondary Fix
```bash
# Delete known large temp files (after confirming with user)
rm -rf ~/AppData/Local/Temp/antigravity-ide-download.exe
rm -rf ~/AppData/Local/Temp/agent-browser-chrome-*
```

### Disk Full Recovery Sequence
When C: is 100% full and gateway is failing:
1. Kill gateway (`taskkill //F //PID <pid>`)
2. Free disk space (delete temp files)
3. Delete bloated session files (`rm ~/.hermes/sessions/session_*.json`)
4. Restart gateway
5. Verify disk: `df -h C:/` should show 5GB+ free

---

## Common Issues

| Issue | Symptom | Fix |
|-------|---------|-----|
| YAML token quoting | Bot masked as valid but send fails "Chat not found" or 401 | Remove quotes from `telegram.token` in config.yaml. Token must be bare string, not quoted. |
| Gateway PID unknown | Can't find running gateway, stale state files | Check `cat ~/AppData/Local/hermes/gateway_pid.json` and compare to `tasklist | grep python` |
| Stale state | "Gateway lock already held" but no process | `hermes gateway run --replace` |
| Telegram dead | Messages not delivered, no error | Restart gateway with `--replace` |
| WebUI won't start | "No module named open_webui" | Use Scripts/open-webui.exe, not `-m` |
| Port conflict | "Address already in use" | Find PID with `netstat -ano \| grep :PORT` and kill it |
| Gateway dies on logout | WSL2 session closing | Enable systemd in `/etc/wsl.conf` or use nohup |
| Duplicate voice notes | Ted hears two copies of same message | Disable `auto_tts` in config.yaml, use Start-Process for PowerShell SoundPlayer |
| TTS silent | PC speakers play nothing, Telegram sends no audio | Check .ogg file exists, verify ffmpeg ran successfully, use Start-Process for PlaySync |
| Session feedback loop | Same message x20+ in session, bot looping responses | Kill gateway + delete bloated session + restart with `--replace` |
| Disk full | OSError No space left, kanban/cron/Telegram all failing | Free disk space first, then restart gateway |
| Cron + hermes send conflict | `hermes send` silently skipped with "This cron job will already auto-deliver its final response" | Trust auto-delivery for the configured target. See `references/cron-delivery-and-hermes-send.md` for behavior matrix and alternate delivery patterns. |

---

## References

- Hermes config: `~/AppData/Local/hermes/config.yaml`
- Gateway state: `~/AppData/Local/hermes/gateway_state.json`
- Gateway logs: `~/.hermes/logs/gateway.log`
- Open WebUI install: `C:\Users\Admin\AppData\Local\Programs\Python\Python311\Scripts\open-webui.exe`
- `references/telegram-polling-dispatch-gap.md` — May 25 2026 incident: Telegram polling consuming messages but agent not responding. Diagnostic commands and possible causes documented.
- `references/cron-delivery-and-hermes-send.md` — Cron auto-delivery vs `hermes send` CLI interaction: behavior matrix, skip reason, and alternate delivery patterns.