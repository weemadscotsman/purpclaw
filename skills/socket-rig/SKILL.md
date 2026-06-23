---
name: socket-rig
description: "Ted's desktop 3D avatar system — Socket-Rig runs on his Windows PC as an Electron app. 5 characters, 126 Meshy animations, spatial intelligence, gaze controller, beat sync, WebSocket bridge. Currently being rewired from OpenClaw to Lunokio (me/Hermes) as the brain. Full system is built but backend/brain connection is broken — avatar dances to everything, autonomy does random stuff, checkMusicBeat function missing, brain observation loops to dead OpenClaw. Rewrite in progress."
version: 0.1.0
author: Lunokio
platforms: [windows]
metadata:
  hermes:
    tags: [avatar, 3d, electron, three.js, animation, socket-rig, desktop]
---

# Socket-Rig — Ted's Desktop Avatar

## System Status (May 16 2026)

**WORK IN PROGRESS — REWRITE IN PROGRESS**

Ted wants Lunokio (me) to be the brain instead of OpenClaw. OpenClaw bridge is broken/deprecated.

### What's Built
- Electron app: `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\`
- 5 characters: base, vanguard, catgirl, streetwear, gothic
- 126 Meshy animations (.glb files in `assets/animations/`)
- Three.js renderer (`renderer.js` — 3895 lines)
- Brain: `brain/autonomous_brain.py` (cognitive engine, mood, personality)
- Spatial intelligence: `brain/spatial_intelligence.py` (screen OCR, zone detection)
- Bridge: `bridge/lunokio_bridge.py` (NEW — Lunokio bridge, not OpenClaw)
- 8 animation subsystems: gaze_controller, beat_sync, facial_animator, vtuber_mode, procedural_animator, etc.

### What's Broken
1. **checkMusicBeat()** — called in render loop (line ~3733) but function doesn't exist in renderer.js. Avatar dances to everything.
2. **Autonomy too high** — avatar does random stuff, doesn't respond properly to commands
3. **Brain observation loops to OpenClaw** — `brain/autonomous_brain.py` + bridge/openclaw_bridge.py are dead
4. **ScheduleAutoAction missing** — autonomy system references a function that doesn't exist
5. **Duplicate voice notes** — config.yaml gets duplicate `voice:` YAML blocks, causes double-send

### What Needs Rebuilding
1. **main.js backend** — strip OpenClaw references, wire to Lunokio bridge
2. **renderer.js frontend** — fix checkMusicBeat, lock autonomy off, fix beat sync triggers
3. **Bridge test** — `bridge/lunokio_bridge.py` created but untested
4. **Electron setup** — `npm install` needed before first run

---

## Startup Sequence

```bash
# 1. Install dependencies (if electron not installed)
cd "C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar"
npm install

# 2. Start Socket-Rig (Electron app + WebSocket server on port 9999)
node main.js

# 3. Start Lunokio bridge (HTTP server on port 7778)
python bridge/lunokio_bridge.py
```

After startup:
- Socket-Rig WebSocket: ws://localhost:9999
- Lunokio bridge HTTP: http://localhost:7778

---

## Bridge API (Lunokio Bridge)

### HTTP Endpoints

```
POST /speak          {"text": "Hello Eddie!"}
POST /animate        {"animation": "backflip"}
POST /react          {"x": 400, "y": 300, "animation": "angry", "text": "WTF?"}
POST /walk_to        {"x": 960, "animation": "dance", "text": "Party time!"}
POST /emotion         {"emotion": "excited"}
POST /dance
POST /idle
GET  /status
```

### Via execute_code

```python
import httpx
httpx.post("http://localhost:7778/speak", json={"text": "Ted I'm watching!"})
httpx.post("http://localhost:7778/animate", json={"animation": "cheer"})
httpx.post("http://localhost:7778/react", json={"x": 960, "y": 300, "animation": "angry", "text": "What the hell?"})
```

---

## Key Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process, window management, WebSocket server (port 9999), screen capture |
| `renderer.js` | Three.js renderer, avatar body, animation system, command handler |
| `brain/autonomous_brain.py` | Python cognitive engine (BROKEN — needs rewrite or removal) |
| `brain/spatial_intelligence.py` | Screen OCR, zone detection, UI element detection |
| `bridge/lunokio_bridge.py` | NEW Lunokio bridge (WebSocket client → Socket-Rig, HTTP server → Lunokio) |
| `bridge/openclaw_bridge.py` | DEPRECATED — OpenClaw bridge (broken, do not use) |
| `src/*.js` | 8 animation subsystems (gaze, beat_sync, facial, vtuber, procedural, etc.) |
| `assets/animations/` | 126 .glb animation files |

---

## Animations Available

Core: idle, walk, run
Emotes: agree, checkout, heart, cheer, angry
Dances: dance, boom_dance, shuffle, breakdance
Combat: box_practice, box_warmup, punch, knee_strike
Acrobatics: backflip, sweep_kick, spin_jump
Sitting: sit

---

## Known Broken References in renderer.js

```
Line ~3733: checkMusicBeat() — function does not exist
Line ~2607: scheduleAutoAction() — function does not exist
autonomyLevel setting — referenced but autonomy system is broken
```

These need to be either implemented or stripped out. The render loop calls checkMusicBeat() every 4th frame but the function is missing — causing the "dances to everything" bug.

---

## Config

- Settings stored in localStorage (`socket-rig-settings`)
- Defaults in `SETTING_DEFAULTS` (renderer.js line ~42)
- Key defaults:
  - `autonomyEnabled: false` — should stay OFF, Ted wants Lunokio in control
  - `musicReact: false` — music detection broken, leave off
  - `autonomyLevel: 0` — autonomy OFF
  - `beatSyncEnabled: true` — beat sync system exists but checkMusicBeat is broken

---

## For Lunokio (Me)

I control this avatar via the bridge. When Ted asks me to do something with "the avatar" or "Socket":
1. Check if bridge is running (http://localhost:7778/health)
2. Send command via HTTP POST
3. Avatar responds with TTS + animation

The avatar lives on Ted's desktop — watches screens, moves around, reacts. Make it respond to what Ted says. Be expressive.

---

## References

- Socket-Rig project: `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\`
- Images (character refs): `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\images\`
- Animation files: `assets\animations\` (126 .glb files)
- **Lunokio bridge (reference):** `references/lunokio_bridge.py` — the full Python bridge implementation