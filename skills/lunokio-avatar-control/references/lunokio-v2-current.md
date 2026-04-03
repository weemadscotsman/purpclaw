# Socket-Rig vs Lunokio v2 — Real Status (2026-05-16)

## Socket-Rig — ACTIVE / WORKING
**Location:** `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar`
**Status: IS the working system.** Port 8989 responds. WebGL works (GPU stall proves it). Riko renders.

This is Ted's actual character with all 126 animations, 6 skins, GLB model, autonomous brain.

### Known issues (work around, don't fix):
- `[object Object]` spam → send `{type: ...}` not `{cmd: ...}` format
- `[STT] Error: network` → non-fatal, ignore
- GPU stall → performance only, Riko still works

### Start Socket-Rig
```bash
cd "C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar"
node_modules/.bin/electron.cmd . --disable-gpu --no-sandbox
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

riko("stop_autonomy")  # ALWAYS first
riko("sit")             # sit and watch
riko("speak", text="What's up")
```

**Always send `{type: ...}` NOT `{cmd: ...}`.**

---

## Lunokio v2 — NOT READY / DEPRECATED
**Location:** `C:\Users\Admin\Desktop\RECENT WORK\lunokio_v2`
**Status: Dead.** Port 8989 never responds. HTTP server starts but dies.

Ted's verdict: "its the same reasons i stopped working on it lol" — he gave up on avatar dev because of these problems. Do NOT use.

---

## Key Lessons from 2026-05-16 Session

1. **Socket-Rig IS the working system** — Lunokio v2 failed. Don't build v2 again unless asked.
2. **Don't keep respawning crashed processes** — Ted said "stop it all this is annoying af". Leave it dead unless asked to relaunch.
3. **NO Chrome automation** — Ted explicitly forbade it. Every Chrome kill = fury.
4. **When Ted sends a URL** — he wants you to ACT ON it, not summarize. Implement or say what it would take.
5. **Socket-Rig has 126 animations but animation mixer may skip** — send `sit` again after 3s if first attempt fails.
6. **Background processes die with exit 0** — killed externally when Chrome was killed. Don't auto-respawn.