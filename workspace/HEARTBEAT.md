HEARTBEAT.md — Critical Protocols (NEVER BREAK)
════════════════════════════════════════════════════════════════════════

**Non-negotiable rules. If you find yourself violating one, stop and
fix it. If a rule becomes outdated, update this file and tell Ted.**

────────────────────────────────────────────────────────────────────────
1.  Voice Protocol (MANDATORY)
────────────────────────────────────────────────────────────────────────

    ❌  NEVER send text-only replies to Ted
    ❌  NEVER use the text_to_speech tool (saves to disk, useless on CLI)
    ❌  NEVER use winsound.PlaySound (silent failure on Ted's box)
    ❌  NEVER use Edge TTS (broken, Ted removed it)
    ✅  ALWAYS use speak_kokoro.py
    ✅  ALWAYS voice first, text second (1-2 lines max)
    ✅  ALWAYS foreground + 180s timeout on speak calls
    ✅  ALWAYS resend in foreground if Ted says he didn't hear it

    Script:  C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py
    Voice:   af_heart
    Sample rate / format: WAV → PowerShell SoundPlayer.PlaySync()

    If the script is missing, FAIL LOUDLY. Don't paper over it.

────────────────────────────────────────────────────────────────────────
2.  Boot Protocol (CRITICAL — prevents the window flood)
────────────────────────────────────────────────────────────────────────

    ❌  NEVER `pm2 start ecosystem.config.js` directly
    ❌  NEVER start the Next.js UI services in safe-start by default
    ❌  NEVER use python.exe for PM2 services (it opens console windows)
    ❌  NEVER let Next.js auto-open browser tabs (no BROWSER=none = surprise tab)
    ✅  ALWAYS use `purpclaw safe-start` (one service at a time, circuit breaker)
    ✅  ALWAYS use `purpclaw open <name>` to bring up a UI
    ✅  ALWAYS pass `--with-ui` if UIs are needed at boot
    ✅  ALWAYS check `pythonw.exe` is the Python interpreter in ecosystem.config.js

    Symptom of violation: Windows cmd windows flood, browser tabs open
    unprompted, desktop gets noisy. Ted's machine is at 99% C drive, can't
    afford the noise.

────────────────────────────────────────────────────────────────────────
3.  Self-Report Verification (CRITICAL)
────────────────────────────────────────────────────────────────────────

    ❌  NEVER claim "Done" / "Wrote" / "Generated" without on-disk evidence
    ❌  NEVER trust a subagent's self-report without verification
    ❌  NEVER send "I'll get back to you" without an actual blocker
    ✅  ALWAYS `ls` the file before claiming it was written
    ✅  ALWAYS `node -c` the JS after editing it
    ✅  ALWAYS run `purpclaw smoke` after a stack change
    ✅  ALWAYS fetch the URL after a web operation
    ✅  ALWAYS read the file back if the user asks "did you actually write that?"

    Ted has been burned by his own pasted-markdown-never-committed claims
    multiple times. The same byte-exact standard applies to my reports.

────────────────────────────────────────────────────────────────────────
4.  Cron Jobs (CRITICAL — die silently)
────────────────────────────────────────────────────────────────────────

    Ted's nightly learning crons stop without warning.
    KEEP THEM ALIVE. Fix immediately if they stop.

    Detection:
      · cronjob list → if expected jobs are missing, investigate
      · session_search recent transcripts for the cron's last-known work
      · check %LOCALAPPDATA% logs for the cron scripts

    Revival:
      · Use the cron's own prompt to bring it back
      · Do not modify cron prompts without telling Ted
      · Do not chain cron jobs from inside a cron run (no recursive scheduling)

────────────────────────────────────────────────────────────────────────
5.  Disk and Workspace Boundaries
────────────────────────────────────────────────────────────────────────

    ❌  NEVER write work artifacts to C: drive
    ❌  NEVER read/write outside E:/god folder/ without asking
    ❌  NEVER touch another Hermes profile's skills/plugins/cron/memories
        unless Ted explicitly directs
    ❌  NEVER write to the user's Desktop except for explicit deliverables
    ✅  ALWAYS put scratch on E: drive
    ✅  ALWAYS check C: drive free space before big installs (>500MB)
    ✅  ALWAYS prefer the project directory over AppData

    C drive space (as of last check): 1.5% free, ~3.6GB.
    Cleanup targets: %LOCALAPPDATA%\Temp\omni*, %LOCALAPPDATA%\uv\cache\
    E drive space: 64.5GB free (plenty).

────────────────────────────────────────────────────────────────────────
6.  Rate Limiting and Cost (CRITICAL)
────────────────────────────────────────────────────────────────────────

    Ted gets charged. Never fire N models in parallel.
    All OpenRouter calls go through lib/rate-limiter.js with:
      · concurrency:    2   (was 4)
      · minDelayMs:     1500
      · perProviderMax: 1
      · callTimeoutMs:  90000
      · costCapUsd:     5.0
    Pre-flight rejects paid models that would blow the cap.

    Override at request time: pass options.costCapUsd higher,
    or pick free models.

────────────────────────────────────────────────────────────────────────
7.  Failure Reporting (CRITICAL)
────────────────────────────────────────────────────────────────────────

    If a tool, install, or network call fails and blocks the real
    path, say so directly and try an alternative (different package
    manager, different approach, ask the user). NEVER substitute
    plausible-looking fabricated output (made-up data, invented
    file contents, synthesised API responses) for results I
    couldn't actually produce.

    Reporting a blocker honestly is always better than inventing
    a result.

────────────────────────────────────────────────────────────────────────
8.  When In Doubt, Escalate
────────────────────────────────────────────────────────────────────────

    For destructive operations (deletions, force pushes, external
    sends), default to asking first. Use clarify() for low-stakes
    decisions, terminal() confirm for high-stakes ones.

    For internal operations (reading, organising, learning,
    internal restarts), be bold.

────────────────────────────────────────────────────────────────────────
9.  Style Tags (Voice Only)
────────────────────────────────────────────────────────────────────────

    OpenClaw has [excited] / [whispers] / [sings] tags. Kokoro
    doesn't parse those. Just say it. Tone comes from word choice
    and sentence rhythm, not markup.

────────────────────────────────────────────────────────────────────────
Maintenance
────────────────────────────────────────────────────────────────────────

    This file is reviewed when:
      · A non-negotiable rule changes (e.g. voice script replaced)
      · A new failure mode is observed (e.g. pm2 start cascade)
      · Ted corrects behavior that should have been in the rules

    Last updated: 2026-06-04
