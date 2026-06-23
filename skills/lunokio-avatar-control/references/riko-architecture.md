# Riko — Ted's 3D Avatar Architecture

**File:** `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar`

## What Riko Is

Riko is Ted's **3D anime character** built with Three.js + GLTFLoader in Electron. She has:
- 6 skins: base, vanguard, catgirl, streetwear, gothic, pastel
- 110+ animations loaded from `.glb` files
- Autonomous brain (fires random actions unless disabled)
- Gaze system (tracks active window)
- Beat sync (responds to music via mic)
- Speech bubble + Web Speech API
- Screen watching (faces screen, narrates active app)

Ted paid real money for all 126 animations and considers them his.

## File Map

| File | Purpose |
|------|---------|
| `main.js` | Electron main: HTTP port 8989, display detection, IPC to renderer |
| `bundle.js` | ALL renderer logic: Three.js scene, animations, commands, autonomy |
| `index.html` | UI shell: bottom-bar, speech, loading overlay, HUD |
| `package.json` | `npm start` → runs Electron |

## HTTP Command Flow

```
Hermes → HTTP POST :8989 → main.js → parse JSON → IPC 'lunokio-command' → bundle.js → pN() → Pt() → AnimationMixer
```

**Port 8989 is the ONLY reliable command channel.**

## Bundle.js Command Handler (pN)

At line 7606 of bundle.js:

```javascript
async function pN(r) {
  if (!r || typeof r != "object" || !r.type) {
    console.warn("[Socket-Rig] Invalid command:", r);
    return;
  }
  // r.type must be present (NOT r.cmd!)
  switch(r.type) {
    case "animate": await qn(r.animation); break;
    case "sit": Pp(); break;
    // ...etc
  }
}
```

**The normalization step BEFORE pN is critical:**

```javascript
mt.on("lunokio-command", (n, i) => {
  let s = { ...i };
  s.cmd && !s.type && (s.type = s.cmd, delete s.cmd); // cmd → type
  s.anim && !s.animation && (s.animation = s.anim, delete s.anim); // anim → animation
  r.push(s); t();
});
```

If you send `{"cmd":"dance","anim":"wave"}` and the normalization isn't working, the command fails silently.

## Commands That Work

- `{"type":"sit"}` — sit and watch screen (best animation: `sit`)
- `{"type":"idle"}` — return to idle
- `{"type":"dance","animation":"boom_dance"}` — play named animation
- `{"type":"speak","text":"Hello Ted"}` — speech bubble + TTS
- `{"type":"stop_autonomy"}` — disable autonomy loop
- `{"type":"interrupt"}` — stop all speech and animations

## Autonomy Loop (The Problem)

`autonomyLevel` in settings controls autonomous behavior. Default is 0 (off) but can be set higher.

When `autonomyLevel > 0`: Every 8-45 seconds `rN()` fires a random action (walk, dance, emote). This fights sit-watch mode — Riko dances instead of sitting.

**Fix:** Always send `{"type":"stop_autonomy"}` before `{"type":"sit"}`:

```python
send('{"type":"stop_autonomy"}')
time.sleep(1)
send('{"type":"sit"}')
send('{"type":"speak","text":"Watching the screen..."}')
```

## Animations

Riko's animations are `.glb` files in `assets/animations/`. Key ones:

| Animation | File | When to use |
|-----------|------|-------------|
| `idle` | Meshy_AI_Animation_Catching_Breath_withSkin.glb | Default state |
| `sit` | Meshy_AI_Animation_Chair_Sit_Idle_F_withSkin.glb | Screen watching |
| `agree` | Meshy_AI_Animation_Agree_Gesture_withSkin.glb | After speaking |
| `dance` | Meshy_AI_Animation_All_Night_Dance_withSkin.glb | Fun/celebration |
| `wave` | Meshy_AI_Neon_Circuit_Vanguard_biped_Animation_Big_Wave_Hello_withSkin.glb | Greeting |
| `cheer` | Meshy_AI_Animation_Cheer_with_Both_Hands_Up_withSkin.glb | Excited |
| `boom_dance` | Meshy_AI_Animation_Boom_Dance_withSkin.glb | Big celebration |

The `animation_library.json` maps names → files. Riko auto-selects which character set based on current skin.

## WebGL / GPU Issues

Riko runs on WebGL via Three.js. On Ted's PC it sometimes shows:
- "Initialising" for 8+ seconds while model loads
- GPU stalls in logs (non-fatal, performance only)
- "Multiple instances of Three.js being imported" (harmless warning)

The model loads from `assets/characters/` based on current skin. GLTFLoader handles it asynchronously.

## Bringing Riko to Front

Python Win32 to find and focus Riko's window:

```python
import ctypes
user32 = ctypes.windll.user32
hwnd = user32.FindWindowW(None, None)
while hwnd:
    length = user32.GetWindowTextLengthW(hwnd)
    if length:
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        title = buff.value
        if 'socket' in title.lower() or 'rig' in title.lower():
            user32.ShowWindow(hwnd, 1)
            user32.SetForegroundWindow(hwnd)
            user32.SetWindowPos(hwnd, None, 50, 50, 1680, 1050, 0x0040)
            break
    hwnd = user32.GetWindow(hwnd, 2)
```

## Key Settings (localStorage)

`localStorage.getItem('socket-rig-settings')` holds:

```json
{
  "autonomyLevel": 0,
  "walkSpeed": 1,
  "gazeEnabled": true,
  "ttsEnabled": false,
  "musicReact": false,
  "screenObservation": false
}
```

Set `autonomyLevel` to 0 to permanently disable the autonomy loop.