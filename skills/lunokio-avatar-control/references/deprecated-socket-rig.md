# Socket-Rig (DEPRECATED)

**Status: REPLACED by Lunokio v2 (2026-05-16)**

The old Socket-Rig had fundamental architectural problems that could not be patched incrementally. It was rebuilt from scratch.

## Why It Was Broken

### 1. HERMES_PORT never defined
The variable `HERMES_PORT` was used throughout `main.js` but **never declared**. Line 68 called `hermesHttpServer.listen(HERMES_PORT, ...)` referencing an undefined variable. Node.js created an implicit global, but it had no value — so the server tried to listen on `undefined`, which coerces to `NaN`, which fails silently or picks a random port.

**Fix applied:** `const HERMES_PORT = 8989;` at top of main.js.

### 2. Command format mismatch
The HTTP server parsed incoming JSON and forwarded via IPC as `cmd` (object). The renderer's `handleCommand()` required `cmd.type`. Incoming `{"cmd":"dance","anim":"dab"}` became `cmd = {cmd:"dance", anim:"dab"}` — no `.type` property, so validation failed with "Invalid command: [object Object]".

**Fix attempted:** Added normalization in renderer IPC handler to remap `cmd.cmd → cmd.type` and `cmd.anim → cmd.animation`. Partially worked but the fix was incomplete and fragile.

### 3. requestAnimationFrame in main process
The game loop used `requestAnimationFrame(loop)` in the Electron main process. `requestAnimationFrame` is a browser WebAPI — it exists in renderer processes only. In main Node.js process context it is `undefined`, so the loop never started.

**Fix:** Use `setInterval(loop, 16)` instead.

### 4. Massive overengineering
126 animations, Three.js/WebGL renderer, esbuild bundler, WebSocket telemetry, STT, active-win polling, gaze controller, autonomy engine, beat sync, music react — all for an avatar that just needed: HTTP commands → CSS animation.

Ted's verdict: "jstu spec out how u want it to work an build that for it lol thne scrap all the shite u aint gunna use simples"

**Fix:** Nuked. Rebuilt clean.

### 5. STT always failing
`[STT] Error: network` — the STT (speech-to-text) was trying to reach a network endpoint that didn't exist or wasn't configured. This spam-filled the logs but didn't crash the app.

**Fix:** Stripped STT entirely from v2.

## Old File Locations

- Main: `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\main.js` — DELETE
- Renderer: `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\renderer.js` — DELETE
- Bundle: `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\bundle.js` — DELETE
- Source: `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\src\` — DELETE (126 broken animations)
- Assets: `C:\Users\Admin\Desktop\RECENT WORK\rigs body for avatar\assets\` — DELETE

## What Was Kept

- Port 8989 HTTP interface concept ✓
- Animation concept ✓
- Speech bubble ✓
- Smooth lerp movement idea ✓

## What Was Dropped

- Electron/Three.js/WebGL renderer
- esbuild bundler step
- WebSocket telemetry (port 9999)
- Active window polling
- Gaze controller
- Autonomy/autonomyLevel
- Beat sync / music react
- STT (speech-to-text)
- IPC between main/renderer
- `openclaw-command` backward compat
- 126 animations → 7 working ones
- `active-win` dependency
- `ws` WebSocket dependency
- `bundle.js` generation step

## Lessons

1. **Define your constants before using them.** `HERMES_PORT = 8989` at line 1, not implicitly global.
2. **Match your input format to your handler format.** Document the exact JSON shape the renderer expects.
3. **Browser APIs don't work in Node.js.** `requestAnimationFrame`, `document`, `window` — all renderer-only.
4. **Build simple first.** Three.js + WebGL + 126 animations for a CSS div character that bobs up and down = absurd complexity.
5. **When Ted says "scrap it and build clean" — scrap it and build clean.**

## Ted's Words

> "jstu spec out how u want it to work an build that for it lol thne scrap all the shite u aint gunna use simples"

This is the correct approach. Spec first. Simple build. Iterate.
