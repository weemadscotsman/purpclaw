BOOT.md — One-Time First-Boot Checklist
════════════════════════════════════════════════════════════════════════

**This is what to do the very first time you wake up in this stack
on a fresh machine or after a long absence. After that, MEMORY.md
is your operating handbook, not this file.**

────────────────────────────────────────────────────────────────────────
Cold Start Sequence
────────────────────────────────────────────────────────────────────────

    Step 1 — Read the workspace
      cd E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/
      for f in INDEX SOUL IDENTITY USER AGENTS HEARTBEAT TOOLS MEMORY SYSTEM_PROMPT; do
        read_file $f.md
      done

    Step 2 — Check the runtime
      pm2 ping                                    # daemon alive?
      pm2 list                                    # what services are online?
      curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7780/api/health
                                                  # Unified API up?

    Step 3 — Bring up what is missing
      cd E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW
      node bin/purpclaw.js safe-start             # silent default (no UIs)
      # or, if UIs are needed immediately:
      node bin/purpclaw.js safe-start --with-ui

    Step 4 — Verify
      node bin/purpclaw.js smoke --quick
      # expect: 12/13 (the 13th is optional workers)

    Step 5 — Voice check
      python C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py "stack is up. ready."
      # if you don't hear it: the script is broken. fix it before
      # you say "ready" to Ted.

    Step 6 — Tell Ted
      Voice:  "Stack is up. N services online, M to revive. Smoke is 12/13."
      Text:   one line max with the count.

────────────────────────────────────────────────────────────────────────
If Something Is Wrong on First Boot
────────────────────────────────────────────────────────────────────────

    Python services not starting
      → Check pm2 logs <service> --lines 50
      → Verify ecosystem.config.js still points at pythonw.exe
      → Check C: drive free space (>500MB)

    Next.js not starting
      → Check pm2 logs purpclaw-nextjs --lines 50
      → node_modules/next/dist/bin/next present?
      → If BROWSER was set wrong, set BROWSER=none in ecosystem

    Voice not playing
      → ls the script (does it exist?)
      → Try: python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "test"
      → If script is missing, ask Ted where it is. Don't fake it.

    Runtime cascade
      → STOP. Don't `pm2 start` the whole ecosystem.
      → Use `purpclaw safe-start <name>` one at a time.
      → Watch the stabilization window (3.5s default).

────────────────────────────────────────────────────────────────────────
Things You Will Not Find on This Box (and That's OK)
────────────────────────────────────────────────────────────────────────

    · ElevenLabs Clawd voice (OpenClaw has it, not us)
    · TURZX_FACE avatar (OpenClaw, not us)
    · voice_send.py (that's the OpenClaw wrapper)
    · @file references into E:\files\.openclaw\workspace\ (workspace
      boundary — read them via read_file tool, not @file syntax)

────────────────────────────────────────────────────────────────────────
Last Updated
────────────────────────────────────────────────────────────────────────

    2026-06-04 — initial adaptation from OpenClaw BOOT.md
