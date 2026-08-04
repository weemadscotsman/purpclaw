# PURPCLAW Dark Cluster Decision

Canonical live root: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`.
Canonical UI: `http://127.0.0.1:3030/mission`.

The dark cluster is defined-but-not-canonical runtime capacity. Do not count it as live product truth unless PM2 and a health probe both prove it is online.

Keep dark unless explicitly needed:
- `purpclaw-voice` / `voice_coordinator.js` on `7781`
- `purpclaw-bridge` / `voice_bridge_7792.js` on `7792`
- `purpclaw-thringlet` / `thringlet_bridge.js` on `7799`
- `purpclaw-vision` / `vision_monitor.js` on `7889`
- `purpclaw-reasoning` / `lib/reasoning-loop.js` on `7892`
- `purpclaw-stt` / `voice_stt.py` on `7896`
- `purpclaw-yolo` / `yolo_service.py` on `7779`
- `purpclaw-avatar` / `simple_bridge.py` on `7777`
- `purpclaw-telegram` / `lib/gateways/telegram.js` on `7795`

Reason: these services are optional, higher-risk, or hardware/config dependent. The product UI should show them as optional/dark, not inflate service counts or pretend they are live.

Canonical cognitive layer is `cognitive_spine.py` on `7880`. The old split ports `7785`, `7786`, `7787`, `7884`, and `7895` are historical references only unless a deliberate migration reactivates them.
