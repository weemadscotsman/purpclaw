---
name: lunokio-avatar-control
description: Lunokio avatar control — Hermes is Ted's body on his PC. HTTP commands via port 8989.
tags: [avatar, electron, http, body-control]
---

# Lunokio Avatar Control

**STOP. READ THIS BEFORE DOING ANYTHING ON TED'S PC.**

## What NOT to Do (Hard Rules)

### NO Chrome/Browser Automation — Ever
- Ted has explicitly forbidden browser tools. Do NOT use `browser_navigate`, `browser_click`, puppeteer, or any Chrome automation.
- Ted sees every Chrome process I open. He gets frustrated every time.
- If Ted wants something done in Chrome, he does it himself. I just advise.
- Hard rule, not a preference.

### Stop Trying to Fix Things That Are Working
- Ted's exact words: "its the same reasons i stopped working on it lol" — he gave up on the avatar because of these same issues.
- Do NOT keep relaunching processes that are crashing.
- Do NOT patch bundle.js and hope it sticks.
- If it's broken and Ted didn't ask you to fix it, leave it alone.
- When a background process dies, check what Ted actually wants before spinning up another one.
- "I'm done with the avatar" means DONE — no more attempts unless asked.

### When Ted Sends a URL Link
- He's pointing you at something he wants you to ACT ON, not summarize.
- Read the content. Execute the instructions. Don't say "here's what it says."
- If he sends a docs URL, either implement it or tell him exactly what it would take to do it.
- If you don't understand what he wants, ask once — then execute.

---

## The One Thing Ted Wants

**Riko sits and watches the screen.** That's it. Everything else is secondary.

```
stop_autonomy → sit → watch → occasional commentary
```

---

## Current Working Avatar: Socket-Rig
**Location:** `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar`
**Status: IS the working system.** Lunokio v2 had port 8989 dead on arrival — Socket-Rig is what actually runs.

### Start Socket-Rig
```bash
cd "C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar"
node_modules/.bin/electron.cmd . --disable-gpu --no-sandbox
```

### Check if running
```python
import socket
s = socket.socket()
s.settimeout(2)
s.connect(('127.0.0.1', 8989))
print("ALIVE")
```

### Send Commands (Python raw socket only — curl hangs)
```python
import socket, json

def riko(type_cmd, **kwargs):
    s = socket.socket()
    s.settimeout(5)
    s.connect(('127.0.0.1', 8989))
    body = json.dumps({"type": type_cmd, **kwargs}).encode()
    req = f"POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n".encode() + body
    s.sendall(req)
    resp = s.recv(4096)
    s.close()
    return resp

# Stop autonomy first — prevents random dances
riko("stop_autonomy")

# Sit and watch (the goal)
riko("sit")

# Dance
riko("dance", animation="wave")

# Speak
riko("speak", text="What's up")
```

**Critical: Always send `{type: ...}` NOT `{cmd: ...}`.** Bundle.js pN() function expects `type` field. HTTP bridge in main.js was patched but verify with test commands first.

### Known Issues (don't try to fix — just work around)
- `[object Object]` spam → send `{type:}` not `{cmd:}` format
- `[STT] Error: network` → non-fatal, ignore
- GPU stall messages → performance only, Riko still works
- Animation mixer may skip if model not fully loaded — send `sit` again after 3 seconds

---

## Lunokio v2 — NOT READY
**Path:** `C:\Users\Admin\Desktop\RECENT WORK\lunokio_v2\`

Port 8989 never responds. HTTP server starts but dies. Do NOT use for anything.

### Start Lunokio v2

```bash
cd "C:\Users\Admin\Desktop\RECENT WORK\lunokio_v2"
node lunokio_v2.js
# OR
npm start
```

### Check if it's running

```bash
python -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('127.0.0.1',8989)); print('ALIVE')"
```

### Send commands (Python raw socket — curl hangs on this host)

```python
import socket, json, time

def riko(cmd, **kwargs):
    s = socket.socket()
    s.settimeout(5)
    s.connect(('127.0.0.1', 8989))
    body = json.dumps({cmd: cmd, **kwargs}).encode()
    req = f"POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n".encode() + body
    s.sendall(req)
    resp = s.recv(4096)
    s.close()
    return resp

# Sit and watch — the only command that matters
riko("stop_autonomy")
time.sleep(1)
riko("sit")
```

### Commands

| cmd | args | effect |
|-----|------|--------|
| `stop_autonomy` | — | **Always do this first** |
| `sit` | — | Sit and watch screen |
| `idle` | — | Return to idle |
| `dance` | anim= | Play named animation |
| `speak` | text= | Speech bubble |
| `interrupt` | — | Stop all speech/animations |

---

## Socket-Rig — DEPRECATED (leave it alone)

**Location:** `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar`

**Status: Dead.** WebGL crashes, animation mixer never initializes. Ted called it "a broken electron window bro."

Do NOT:
- Run `npm start`
- Patch bundle.js
- Try to fix it

If Ted wants the avatar working, the path is through Lunokio v2 — not this.

---

## Architecture

```
HERMES ──raw socket──► port 8989 ──► Electron main.js ──► renderer ──► Riko
              Python sockets work here   curl hangs here
```

**Why Python sockets:** `curl -X POST` hangs on Electron HTTP servers on this Windows host. Raw Python sockets work every time.

---

## Files

| File | Role |
|------|------|
| `lunokio_v2.js` | Main entry — Electron + HTTP server + scene |
| `lunokio_v2/` | Lunokio v2 directory |
| `rigs body for avatar/` | **DEPRECATED — do not touch** |

## Scripts

| Script | Use |
|--------|-----|
| `scripts/lunokio_manager.py` | start / stop / restart / status / cmd |
| `scripts/riko_control.py` | sit / dance / speak / stop_autonomy |

---

## Known Issues

### "Invalid command: [object Object]" spam
Bundle.js logs this when IPC sends wrong format. Fix: send `{type:, animation:}` not `{cmd:, anim:}`.

### STT errors in logs
`[STT] Error: network` — non-fatal, ignore.

### GPU stalls
`GPU stall due to ReadPixels` — performance only, Riko still works.