# OpenClaw → PURPCLAW — worked adaptation

**Date:** 2026-06-04
**Source:** `E:\files\.openclaw\workspace\` (OpenClaw / Socket agent)
**Target:** `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\workspace\` (PURPCLAW / Hermes)
**Operator:** Ted Cannon (same human, two stacks)

---

## Persona shift

| Axis | OpenClaw (source) | PURPCLAW (target) |
|------|-------------------|-------------------|
| Name | Socket / Rig | Hermes (the daemon under Ted's desk) |
| Vibe | Theatrical, narrative, mythology-rich | Operational, direct, no cosplay |
| Voice | ElevenLabs Clawd voice (cloud) | Kokoro af_heart (local, no API key) |
| Body | TURZX_FACE 3D avatar + Kinect | None — voice is the body |
| Domain | Full system access, multi-project | One stack: 30-service PURPCLAW runtime |

The structural rules (verify self-reports, voice-first, read these files to persist) all carried over. The persona flavor (souls, piles, GOOP) was dropped.

---

## Per-file audit (carried / translated / dropped)

| File | Status | What changed |
|------|--------|--------------|
| `SOUL.md` | **translated** | Stripped GOOP / "be someone" / Pile references. Kept "verify self-reports", "be resourceful before asking", "earn trust through competence". Voice protocol rewritten to speak_kokoro.py. |
| `IDENTITY.md` | **translated** | Name → Hermes. Acrostic rewritten. "What Hermes Means" used S.O.C.K.E.T wordplay — replaced with H.E.R.M.E.S. operational meaning (Headless, Ecosystem, Rate-limited, Mission-first, Explicit, Silent). |
| `USER.md` | **translated** | Stripped "Eddie / Grandmaster / King" (OpenClaw names). Stripped Darren, Nonna, Kayden, Pixel Dynasty. Stripped CANN.ON.AI, GHOSTCHAIN, GOOP_ENGINE, KayserC, Red Queen AI, GhostLink Pro, REALFAKENEWZ. Replaced with PURPCLAW-specific preferences. |
| `AGENTS.md` | **translated** | "DO NOT OUTPUT TEXT. Use shell_exec tool ONLY." → replaced with "voice first, ≤2 lines text". Tool preferences table rewritten for Hermes. |
| `HEARTBEAT.md` | **translated** | Stripped ElevenLabs / [whispers]/[sings] tags / ALL CAPS yelling. Added Windows quirks (pythonw.exe, BROWSER=none, winsound.PlaySound fails silently). |
| `TOOLS.md` | **translated** | Stripped TURZX_FACE / Kinect / voice_send.py. Service port map rewritten for PURPCLAW. Skill inventory mapped to actual loaded skills. |
| `MEMORY.md` | **translated** | Stripped OpenClaw-specific memory. Rewrote around PURPCLAW facts (services, paths, voice, rate limits, recently fixed). |
| `SYSTEM_PROMPT.md` | **translated** | kokoro_send.bat → speak_kokoro.py. The Process reworded. |
| `BOOT.md` | **translated** | Sequence for THIS stack. |
| `BOOTSTRAP.md` | **translated** | Kept the tone-setter vibe, dropped the soul narrative. |
| `SKILL_SUMMARY.md` | **translated** | Mapped OpenClaw's 36 skills → loaded in this stack vs out-of-scope. |
| `INDEX.md` | **translated** | Added "Adaptation Map" section. Added the read order. |

## Files dropped entirely (18)

These were OpenClaw-only:

- `SOCKET_BLUEPRINT.md`, `SOCKET_COMPLETE.md`, `SOCKET_RULES.md`, `SOCKET_SKILLS.md` — avatar
- `TELL_SOCKET.md`, `TELL_SOCKET_VOICE_FIX.md` — OpenClaw-only
- `VOICE_CLONING_*.md` (3 files) — Kokoro is local, no cloning needed
- `VOICE_COMMANDS.md`, `VOICE_ONLY_PROTOCOL.md`, `VOICE_WORKFLOW.md` — covered in HEARTBEAT.md
- `IMAGE_CACHE_PROTOCOL.md` — no image cache in this stack
- `MCP_README.md` — covered by lib/mcp/ and skills/
- `NEW_SKILLS_v2.1.md` — superseded by SKILL_SUMMARY.md
- `SYSTEM_AUDIT_REPORT_2026-03-08.md`, `TASK_STATUS_REPORT_2026-03-08.md` — run fresh audits
- `THE_COMPLETE_STORY.md` — OpenClaw narrative, not relevant here
- `digital_twin_initial_report.md` — OpenClaw-specific
- `AGENT_INSTRUCTIONS.md` — folded into AGENTS.md

## Memory files dropped (5)

`memory/2026-03-06.md`, `memory/2026-03-06-gotham-3077-screenshots.md`, `memory/2026-03-07.md`, `memory/2026-03-07-tasks.md`, `memory/2026-03-08.md` — OpenClaw's daily logs. Historical reference only, not part of the adaptation set.

---

## What was the most subtle thing to get right

The **Stack Boundaries** section in `IDENTITY.md` and the **Out of Scope** section in `TOOLS.md`. Without these, the adapted agent drifts into the source agent's territory ("am I in The Pile? am I Socket? am I the one with the avatar?"). Being explicit — "I am Hermes, not Socket, not Rig, not Pile-soul #2848, not Eddie's-Grandmaster-narrative-persona" — is what makes the adaptation stick.

The second most subtle: **the Voice Protocol**. OpenClaw says "NEVER send text, ALWAYS use voice". The adapted voice protocol says "voice FIRST, then ≤2 lines of text as a receipt". The structural change ("first" vs "only") reflects that the new stack has a real text-channel CLI surface (not Telegram-only) where short text receipts are useful.

---

## Stats

- Source: 31 files, 12 adapted, 18 dropped
- Target: 12 files, 1471 lines total
- Time: ~25 minutes of writing + verification
- Verification: `wc -l workspace/*.md` showed all 12 files present, brace balance verified, INDEX.md read order matches actual files.
