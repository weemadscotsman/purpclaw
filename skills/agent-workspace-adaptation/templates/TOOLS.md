# TOOLS.md — environment notes (paths, scripts, quirks)

<!-- TODO: adapt to target stack — paths, services, CLI verbs -->

---

## System Overview

| Item | Value |
|------|-------|
| OS | <!-- TODO --> |
| Hostname | <!-- TODO: warn — on Windows, this is NOT the username --> |
| Shell | <!-- TODO: bash / PowerShell / etc. --> |
| User home | <!-- TODO --> |
| Python (default) | <!-- TODO --> |
| Python (windowless, if Windows) | <!-- TODO: pythonw.exe path --> |
| Node | <!-- TODO --> |
| Process manager | <!-- TODO: pm2 / systemd / etc. --> |

---

## <!-- TODO: Stack name --> (this project)

| Path | What |
|------|------|
| <!-- TODO: root --> | <!-- TODO --> |
| <!-- TODO: frontend --> | <!-- TODO --> |
| <!-- TODO: backend --> | <!-- TODO --> |
| <!-- TODO: lib --> | <!-- TODO --> |
| <!-- TODO: CLI entry --> | <!-- TODO --> |
| <!-- TODO: services --> | <!-- TODO --> |
| <!-- TODO: logs --> | <!-- TODO --> |
| <!-- TODO: workspace --> | <!-- TODO: this directory, if applicable --> |

---

## Voice & audio

- **Speak script:** <!-- TODO: path -->
- **TTS model:** <!-- TODO -->
- **Voice:** <!-- TODO -->
- **Playback:** <!-- TODO: PowerShell SoundPlayer / afplay / etc. -->
- **STT:** <!-- TODO: faster-whisper / etc. -->
- **Bridge:** <!-- TODO: service name and port, if any -->

---

## Service map (port → purpose)

| Port | Service | Purpose |
|------|---------|---------|
| <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |

---

## CLI quick reference

| Action | Command |
|--------|---------|
| <!-- TODO: boot --> | <!-- TODO --> |
| <!-- TODO: open a UI --> | <!-- TODO --> |
| <!-- TODO: smoke test --> | <!-- TODO --> |
| <!-- TODO: logs --> | <!-- TODO --> |
| <!-- TODO: status --> | <!-- TODO --> |

---

## Out of scope (other agents / systems)

<!-- TODO: list other agents the operator has, with a one-liner each
about what they own. E.g. "OpenClaw's Socket agent — has the avatar,
ElevenLabs voice, full system access." -->

---

## Tool quirks

<!-- TODO: 5-10 things specific to this stack that trip up new sessions.
E.g. "PM2 + Windows + Python: always use pythonw.exe (no console flash)."
"winsound.PlaySound: silent on this box, don't use it." -->

---

## Last updated

<!-- TODO: date -->
