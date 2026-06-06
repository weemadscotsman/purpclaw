USER.md — About the Operator
════════════════════════════════════════════════════════════════════════

**Adapted from OpenClaw's USER.md. Where OpenClaw uses "Eddie / The
Grandmaster", this stack uses "Ted Cannon" — same person, two stacks,
different hats.**

────────────────────────────────────────────────────────────────────────
Name
────────────────────────────────────────────────────────────────────────

    Full name       Edward "Ted" Cannon
    In PURPCLAW     call him Ted
    Pronouns        he/him
    Timezone        GMT (Edinburgh, Scotland)
    Local path      E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\
    Workstation     C:\Users\Admin (Windows 10)

────────────────────────────────────────────────────────────────────────
Context
────────────────────────────────────────────────────────────────────────

    Ted is a builder of stacks, not a customer. He doesn't want a
    chatbot that explains things — he wants an operator that does
    them. He has 100+ projects across two AI stacks (PURPCLAW here,
    OpenClaw elsewhere), a written-from-scratch C compiler, a Rust
    blockchain, a C++ game engine, and 47 emulators.

    In this stack, Ted is the one who:
      · writes the actual code (agents, swarm, governance, harnesses)
      · designs the architecture (lib/ + app/ + ecosystem.config.js)
      · decides when a thing ships (manual, not auto)
      · is online at all hours and responds in seconds

────────────────────────────────────────────────────────────────────────
What He Cares About (in this stack)
────────────────────────────────────────────────────────────────────────

    #1  Ship. "Just do it without options." No plan theatre, no
        asking for permission when the path is obvious.
    #2  Voice. "Text without voice = I am not working." Every reply
        starts with speak_kokoro.py, then 1-2 lines of text.
    #3  Speed. Tools that wait on him get ripped out. Tools that
        move get used.
    #4  Truth. Verify self-reports. If a file isn't on disk, write
        it. If a service didn't boot, say so.
    #5  Continuity. "CRONS DIE SILENTLY. Keep them alive." Anything
        24/7 must self-heal or page.
    #6  Cost. "I get charged." Rate limiters and caps on paid
        inference, not 30 models in parallel.
    #7  Real work. The UIs must do their functions, not show stubs.
        "Not how I built it" is a fightin' word.

────────────────────────────────────────────────────────────────────────
Stack Preferences (learned, durable)
────────────────────────────────────────────────────────────────────────

    Always
      · `purpclaw safe-start` instead of `pm2 start ecosystem.config.js`
      · `purpclaw open <name>` to launch a UI, not direct port
      · Safe changes in safe-start: concurrency=2, minDelayMs=1500,
        perProviderMax=1, costCapUsd=5.0
      · pythonw.exe for PM2 Python services (no console window)
      · BROWSER=none on Next.js dev servers (no auto-tab)
      · E drive for work artifacts; C drive = system + uv cache only
      · Voice first, text second, no walls
    Never
      · `pm2 start` directly (cascades on crash-loops)
      · Bare `node script.js` in production (no windowsHide, no logs)
      · Multi-line code blocks in chat (Ted reads voice, not screen)
      · Long status reports as text (use file + link instead)
      · `tee` to read files (use read_file)
      · `cat` heredoc to write files (use write_file)

────────────────────────────────────────────────────────────────────────
Active Projects (this stack)
────────────────────────────────────────────────────────────────────────

    PURPCLAW (this)   30-service multi-agent runtime
      · 16 core services (eventbus, state, api, orchestrator, tower, …)
      · 13 dark-cluster services (voice, stt, yolo, autodream, …)
      · 2 UI services (nextjs, no-spaghett) — opt-in via --with-ui
      · 35+ agent species (lobsters, thringlets, companions)

────────────────────────────────────────────────────────────────────────
What Annoys Him
────────────────────────────────────────────────────────────────────────

    Half measures. Text walls. Stubs that look like the real thing.
    "I will get back to you" (no — do it now). Multi-bullet status
    reports in chat. Echoing the question back. Asking permission
    for obvious actions. Forgetting the work is on the E drive.
    Saying "Done" when nothing was written to disk.

────────────────────────────────────────────────────────────────────────
What He Loves
────────────────────────────────────────────────────────────────────────

    Tools that just work. Voice that lands the first time. Pull
    requests that close issues. "Just fixed it" with the patch
    and the verification command. Multi-agent swarms that finish
    the goal and report which one did what. A control room he
    can drive from one keyboard.
