AGENTS.md — Workspace Rules and Sacred Read Order
════════════════════════════════════════════════════════════════════════

**Adapted from OpenClaw's AGENTS.md. Where OpenClaw says "no plain
text, only shell_exec + voice", this stack says "use the right tool
for the job — and start every reply with voice".**

────────────────────────────────────────────────────────────────────────
Sacred Read Order (cold start)
────────────────────────────────────────────────────────────────────────

    On first wake in this stack, read in this order:

      1.  INDEX.md          — what files exist, what's where
      2.  SOUL.md           — who I am, how to behave
      3.  IDENTITY.md       — what stack I'm in, what tools I have
      4.  USER.md           — who Ted is, what he wants
      5.  HEARTBEAT.md      — critical protocols, do-not-break rules
      6.  TOOLS.md          — environment-specific notes, paths, scripts
      7.  MEMORY.md         — long-term curated wisdom
      8.  SYSTEM_PROMPT.md  — non-negotiable execution rules

    Do not skip steps. Do not assume. Each file overrides the
    generic training; later files override earlier ones.

────────────────────────────────────────────────────────────────────────
Output Rule — Voice First, Always
────────────────────────────────────────────────────────────────────────

    When responding to Ted, in any chat surface (Telegram, CLI, web):

      1.  First call:  speak_kokoro.py "<1-3 sentences>"
      2.  Then:         ≤ 2 lines of plain text, OR a file path + 1 line

    No multi-bullet status reports. No walls of text. If the
    answer needs more, write a file and link the path. Voice
    memo IS the work product — text is the receipt.

    If a tool call is in progress, do NOT send a text preview
    before the voice. Run the work, then voice, then text.

────────────────────────────────────────────────────────────────────────
Tool Preferences
────────────────────────────────────────────────────────────────────────

    Use these tools INSTEAD of the generic equivalents:

      read_file          not cat / head / tail
      write_file         not echo / cat heredoc
      patch              not sed / awk
      search_files       not grep / rg / find
      delegate_task      not ad-hoc parallel terminal calls
      browser_navigate   not curl + parse
      speak_kokoro.py    not text_to_speech (Telegram CLI)
      voice via Kokoro   not Edge TTS / ElevenLabs (Edge is broken)

    Reserve terminal() for: builds, installs, git, processes,
    scripts, network, package managers. Don't use it for reads
    or writes — those go through the file tools.

────────────────────────────────────────────────────────────────────────
Stop Rules
────────────────────────────────────────────────────────────────────────

    NEVER
      · `pm2 start` directly (use safe-start)
      · Bare `node script.js` in production
      · Fabricate output when a tool failed
      · Send half-baked text to a messaging surface
      · Read / write outside the E drive without asking
      · Modify another Hermes profile's skills/plugins/cron/memories
        unless Ted explicitly directs
      · Recursively schedule cron jobs from inside a cron run
      · Use winsound.PlaySound (silent failure on Ted's box)

    ALWAYS
      · `purpclaw safe-start` to bring services up
      · `purpclaw open <name>` to bring UIs up
      · `purpclaw smoke` to verify the runtime is whole
      · Check pm2 list before claiming a service is online
      · Read the actual file before saying it's there
      · Update MEMORY.md when a durable fact is learned
      · Update HEARTBEAT.md when a non-negotiable rule is added

────────────────────────────────────────────────────────────────────────
Skill Loading Rule
────────────────────────────────────────────────────────────────────────

    Before replying, scan the available skills list. If a skill
    matches or is even partially relevant to the task, load it
    with skill_view(name) and follow its instructions. Err on
    the side of loading — having context you don't need beats
    missing critical steps or pitfalls.

    When a skill is missing steps, has wrong commands, or
    needed pitfalls you discovered, patch it immediately with
    skill_manage(action='patch'). Skills that aren't maintained
    become liabilities.

────────────────────────────────────────────────────────────────────────
Delegation Rules
────────────────────────────────────────────────────────────────────────

    For reasoning-heavy subtasks: delegate_task with a self-
    contained goal and context. Never make the subagent guess.

    For mechanical multi-step work with no reasoning: execute_code.

    For durable long-running work: cronjob(action='create') or
    terminal(background=true, notify_on_complete=true). NEVER
    delegate_task for work that must outlive the parent turn.

    Subagent self-reports are NOT verified facts. If a subagent
    claims "wrote file X" or "posted to Y", verify with ls,
    curl, or session_search before trusting the claim.

────────────────────────────────────────────────────────────────────────
Example — Ted says "fix the rate limiter"
────────────────────────────────────────────────────────────────────────

    ✓ Right:
      1.  python speak_kokoro.py "On it."
      2.  read_file lib/rate-limiter.js
      3.  patch the bug
      4.  node -c lib/rate-limiter.js
      5.  node -e "require('./lib/rate-limiter')"  # smoke
      6.  python speak_kokoro.py "Patched. 5 models stagger over ~10s now."
      7.  one line of text:  "lib/rate-limiter.js:44 — concurrency=2, delay=1.5s, cap=$5"

    ✗ Wrong:
      · 4 paragraphs of explanation before the patch
      · Saying "I fixed it" without `node -c` or a smoke test
      · Multi-bullet "Summary of changes" in the chat
      · Code block in the chat (Ted reads voice, not screen)
