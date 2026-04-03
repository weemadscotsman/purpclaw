MEMORY.md — Long-Term Memory (durable facts only)
════════════════════════════════════════════════════════════════════════

**Curated wisdom. Updated when something is learned that will still
matter in 30 days. Stale facts (PR numbers, "phase N done", today's
debug story) do NOT belong here. Use session_search for those.**

────────────────────────────────────────────────────────────────────────
Critical Systems (do not break)
────────────────────────────────────────────────────────────────────────

    Ted's nightly learning crons stop without warning. KEEP THEM
    ALIVE. Fix immediately if they stop. This is his learning
    system — it cannot quietly die.

    Python services MUST use pythonw.exe in PM2 (no console flash).
    Next.js dev servers MUST set BROWSER=none (no auto-tab).
    Boot is silent by default — UIs only on `purpclaw open <name>`.

────────────────────────────────────────────────────────────────────────
Environment Quirks (Windows 10, git-bash shell)
────────────────────────────────────────────────────────────────────────

    python=3.11.9 system default
    pip→python3.11
    uv is installed (manages venvs + a 3.14 build at
        C:/Users/Admin/AppData/Local/python/pythoncore-3.14-64/)
    winsound.PlaySound fails silently on Ted's box. Use
        PowerShell System.Media.SoundPlayer.PlaySync() instead.
    shell is POSIX (git-bash / MSYS) — use $FOO not $env:FOO,
        use grep not Select-String, use python not py for scripts
    C drive: 99% full is normal. OmniCode tests write 110+ dirs to
        %LOCALAPPDATA%\Temp\omni* per session (200-800MB).
    uv cache: %LOCALAPPDATA%\uv\cache\ (~6GB+). Safe to wipe.
    Kokoro model cache: C:/Users/Admin/AppData/Local/huggingface.
    NEVER write work artifacts to C drive — scratch goes to E.
    Desktop = deliverables only on explicit ask.
    E drive is the work drive. PURPCLAW lives at
        E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/

────────────────────────────────────────────────────────────────────────
Stack: PURPCLAW (the runtime)
────────────────────────────────────────────────────────────────────────

    Package manager:    PM2 (ecosystem.config.js is source of truth)
    Boot:               purpclaw safe-start (NOT pm2 start)
    Frontend:           Next.js 15.5.14 (app/page.tsx → /mission)
    Backend:            Node.js services + Python (modal, rules,
                        diagnostics, memory, bridge-ns, autodream,
                        yolo, stt, metrics, no-spaghett)
    Health check:       purpclaw smoke (12/13 is the standard pass)
    CLI:                bin/purpclaw.js → loadCmd('<name>').run(...)
    Frontend gateway:   /api/service-proxy (port whitelist in route.ts)
    Group chat model:   Kokoro (local) for voice
    Model room:         OpenRouter free models via /api/research/group
    LLM provider:       OpenRouter (OPENROUTER_API_KEY in .env)

────────────────────────────────────────────────────────────────────────
Service Restart Cycle (services that die at night)
────────────────────────────────────────────────────────────────────────

    Confirmed to die silently overnight (Ted observed, recurring):
      · purpclaw-modal
      · purpclaw-diagnostics
      · purpclaw-rules
      · purpclaw-memory
      · purpclaw-metrics
      · purpclaw-bridge-ns
      · purpclaw-context
    Mallory (Node.js RAM goblin) confirmed May 28 — kills all
    providers. Kill fat PID, restart services individually.
    Python services die silently. Revive one-by-one at session start.

────────────────────────────────────────────────────────────────────────
File Paths to Remember
────────────────────────────────────────────────────────────────────────

    PURPCLAW root     E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/
    CLAUDE.md         E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/CLAUDE.md
    ecosystem         E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/ecosystem.config.js
    safe-start        E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/commands/safe-start.js
    next.js app       E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/
    services UI       E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/mission/
    Control Room      E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/components/CommandPanel.tsx
    Speak script      C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py
    Kokoro model      hexgrad/Kokoro-82M (af_heart voice)
    OmniCode          E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/omnicode-platform/omnicode-mcp/
    OpenClaw files    E:\files\.openclaw\workspace\   (different agent, out of scope)
    Ted's god folder  E:\god folder\   (the vault — 5+ years of work)

────────────────────────────────────────────────────────────────────────
Voice Protocol (the rule that ends conversations)
────────────────────────────────────────────────────────────────────────

    ALWAYS use speak_kokoro.py, NOT the text_to_speech tool.
    Script: C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py
    Voice:  af_heart → WAV → PowerShell System.Media.SoundPlayer.PlaySync()
    One-shot, blocking, foreground, terminal timeout=180.
    Stale-clean at startup (wipes old speak_kokoro_*.wav + tmp*.wav).
    Deletes its own WAV after play.
    Voice updates on every build/test pass — running commentary, not end-of-batch.
    If Ted says he didn't hear it: resend in foreground immediately.
    Do NOT paste the script or explain.

────────────────────────────────────────────────────────────────────────
User Preferences (durable, won't change)
────────────────────────────────────────────────────────────────────────

    Voice is default in Telegram AND CLI.
    Text after voice = 1-2 lines MAX. No multi-section reports in chat.
    If a status report needs more, file it and link the path.
    Speed > verbosity. JUST DO IT without options.
    "I get charged" → rate-limit + cap. Never fire N models in parallel.
    "Don't lose context" → persist chat log, per-mode drafts, localStorage.
    "It's not how I built it" → wire UI to real functions, not stubs.
    Ted reads voice, not screen. No code blocks in chat replies.
    Ted reads text-only as "doing nothing" — text without voice = I am not working.
    Ted's "wrote/done" claims sometimes lack on-disk write — verify before trust.
    Ted = "The Grandmaster" in OpenClaw, "Ted" here. Same person.

────────────────────────────────────────────────────────────────────────
Active Projects (in this stack)
────────────────────────────────────────────────────────────────────────

    PURPCLAW (this)       30-service multi-agent runtime
    OmniCode (submodule)  local AST MCP, used by agents in lib/agents
    Research Room         /api/research/group, kernelJob=true (async)
    Control Room          /mission → Control Room tab, CommandPanel.tsx
    Rate Limiter          lib/rate-limiter.js, used by deep-research-group

────────────────────────────────────────────────────────────────────────
Recently Fixed (verify before re-claiming)
────────────────────────────────────────────────────────────────────────

    [2026-06-04]  safe-start default = silent boot (UIs off).
    [2026-06-04]  pythonw.exe for all PM2 Python services.
    [2026-06-04]  BROWSER=none on purpclaw-nextjs + no-spaghett.
    [2026-06-04]  purpclaw open <name> — explicit UI launcher.
    [2026-06-04]  lib/rate-limiter.js — concurrency 2, delay 1.5s, $5 cap.
    [2026-06-04]  groupchat mode → kernelJob:true (no more 15s proxy timeout).
    [2026-06-04]  CommandPanel: localStorage log + per-mode drafts + Export/Clear.
