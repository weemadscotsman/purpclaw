TOOLS.md — Environment Notes (paths, scripts, quirks)
════════════════════════════════════════════════════════════════════════

**Where OpenClaw has Socket's hardware list, this stack has the
runtime inventory. Keep it close.**

────────────────────────────────────────────────────────────────────────
System Overview
────────────────────────────────────────────────────────────────────────

    Item                Value
    ──────────────────  ───────────────────────────────────────────────
    OS                  Windows 10
    Hostname            (Windows — not the username; use C:\Users\Admin\)
    Shell               git-bash / MSYS (POSIX syntax)
    User home           C:\Users\Admin
    Python (default)    C:\Users\Admin\AppData\Local\Programs\Python\Python311\python.exe
    Python (windowless) C:\Users\Admin\AppData\Local\Programs\Python\Python311\pythonw.exe
    Python (uv 3.14)    C:\Users\Admin\AppData\Local\python\pythoncore-3.14-64\
    Python (venv)       C:\Users\Admin\AppData\Local\hermes\hermes-agent\venv\
    Node                whatever Next.js is built against
    uv                  installed (manages venvs + 3.14 build)
    PM2                 installed, daemon up

────────────────────────────────────────────────────────────────────────
PURPCLAW Stack (this project)
────────────────────────────────────────────────────────────────────────

    Root          E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/
    Frontend      E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/
    Backend (JS)  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/*.js
    Backend (Py)  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/*.py
    Lib (helpers) E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/
    CLI entry     E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/bin/purpclaw.js
    Services      E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/ecosystem.config.js
    Logs          ~/.pm2/logs/  (or `pm2 logs <name>`)
    Workspace     E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/  (this dir)

────────────────────────────────────────────────────────────────────────
Voice & Audio
────────────────────────────────────────────────────────────────────────

    Speak script    C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py
    TTS model       hexgrad/Kokoro-82M (Kokoro, local, no API key)
    Voice           af_heart (cheerful anime-style female)
    Playback        PowerShell System.Media.SoundPlayer.PlaySync() (foreground)
    STT             Faster-Whisper (local, tiny model) on purpclaw-stt :7896
    Bridge          purpclaw-bridge :7792 (voice-coordinator to Telegram/etc)
    Coordinator     purpclaw-voice :7781

    STALE-CLEAN RULE: speak_kokoro.py wipes old WAVs at startup
    (speak_kokoro_*.wav + tmp*.wav) and deletes its own WAV after
    play. Don't try to read them after the script returns.

────────────────────────────────────────────────────────────────────────
Service Map (port → purpose)
────────────────────────────────────────────────────────────────────────

    3000   purpclaw-nextjs        Next.js dev (mission, control room, UIs)
    5000   PVX (thringlets)       colony substrate (external)
    7779   purpclaw-yolo          YOLO object detection (Python)
    7780   purpclaw-api            Unified API gateway
    7781   purpclaw-voice         Voice coordinator
    7782   purpclaw-eventbus      Event bus (publish/subscribe)
    7783   purpclaw-state         State store
    7784   purpclaw-orchestrator  Workflow orchestrator
    7785   purpclaw-modal         Modal logic (Python)
    7786   purpclaw-diagnostics   Autonomous diagnostics (Python)
    7787   purpclaw-rules         Symbolic rules engine (Python)
    7790   purpclaw-tower         Agent tower (spawn/run agents)
    7791   purpclaw-gatekeeper    Safety gatekeeper
    7792   purpclaw-bridge        Voice bridge (Telegram/etc)
    7797   purpclaw-no-spaghett   Codebase architecture analyzer
    7798   purpclaw-harness       Autonomous multi-step harness
    7799   purpclaw-thringlet-bridge   thringlet colony bridge
    7880   purpclaw-memory        Memory matrix v2 (Python)
    7881   purpclaw-context       Context bus
    7884   purpclaw-bridge-ns     Neuro-symbolic bridge (Python)
    7885   purpclaw-pool          Knowledge pool
    7890   purpclaw-metrics       Metrics aggregator
    7895   purpclaw-dream         AutoDream memory consolidator (Python)
    7897   purpclaw-workers       Worker pool
    7898   purpclaw-coordinator   Swarm coordinator

────────────────────────────────────────────────────────────────────────
CLI Quick Reference
────────────────────────────────────────────────────────────────────────

    Boot:           purpclaw safe-start
    Boot + UIs:     purpclaw safe-start --with-ui
    Open a UI:      purpclaw open mission
    List UIs:       purpclaw open
    Smoke test:     purpclaw smoke --quick
    Heal:           purpclaw heal --execute
    Status:         purpclaw status
    Logs:           purpclaw logs <service>
    Grow:           purpclaw grow
    Forge agent:    purpclaw forge <name>
    Ask LLM:        purpclaw ask "question"
    Run agent:      purpclaw run "task"
    Harness:        purpclaw harness run "goal"

────────────────────────────────────────────────────────────────────────
OpenClaw Boundary (OUT OF SCOPE)
────────────────────────────────────────────────────────────────────────

    E:\files\.openclaw\workspace\      — Socket's identity files
    C:\Users\Admin\.openclaw\          — Socket's runtime + voice_send
    ElevenLabs Clawd voice             — OpenClaw's, not mine
    TURZX_FACE (3D avatar)             — Socket's, not mine

    Ted has TWO AI stacks:
      · OpenClaw: Socket/Rig agent with avatar, voice, full system access
      · PURPCLAW: Hermes agent (me) operating this 30-service runtime

    They're different agents with different scopes. I am Hermes.
    I do not narrate The Pile. I do not pretend to be Socket.
    I keep the runtime alive and the chat working.

────────────────────────────────────────────────────────────────────────
Tool Quirks
────────────────────────────────────────────────────────────────────────

    PM2 + Windows + Python:    always use pythonw.exe (no console flash)
    PM2 + Next.js dev:         always set BROWSER=none (no auto-tab)
    PM2 + service-proxy:       15s timeout on the proxy, design for it
    winsound.PlaySound:        silent on Ted's box, don't use it
    OmniCode MCP tests:        write 110+ dirs to %LOCALAPPDATA%\Temp\omni*
    uv-managed Python 3.14:    safe to wipe (~1.8G)
    Kokoro model cache:        C:/Users/Admin/AppData/Local/huggingface

────────────────────────────────────────────────────────────────────────
Last Updated
────────────────────────────────────────────────────────────────────────

    2026-06-04 — initial adaptation from OpenClaw TOOLS.md
