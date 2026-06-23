---
name: sticky-finger-testing
description: Eddie's testing methodology — systematic destructive testing like "a drunk raccoon with admin privileges and a jam sandwich." Touch every surface, touch it wrong, touch it while another thing is touching it, see what catches fire. Used to find the Neo regex bugs, path mismatches, and memory corruption this session.
when_to_use: Running chaos campaigns; testing new features or CLI surfaces; auditing the stack for mismatches; finding real bugs in production code; any time the user says "audit everything" or "test it like a user"
---

# Sticky Finger Testing Methodology

Eddie's testing philosophy: "Touch everything. Touch it twice. Touch it wrong. Touch it while another thing is touching it. Then see what catches fire."

This is NOT structured QA. It's releasing a gremlin into the ventilation system and seeing what breaks. The most dangerous bugs are never found by careful people — they're found by absolute goblins.

## The methodology

1. **Touch every surface**: CLI commands, TUI screens, WebUI pages, slash commands, BigBoss, tools, API endpoints. Every single one.
2. **Touch it wrong**: invalid provider, empty prompt, 10K char prompt, missing file, recursive tool request
3. **Touch it while another thing is touching it**: 20 tabs open, SSE reconnect spam, flood event bus, resize terminal every second
4. **See what catches fire**: log every error, every crash, every silent failure

## Attack surfaces

| surface | what to break |
|---|---|
| CLI | invalid provider, invalid model, missing file, huge file, empty prompt, 10K token prompt, recursive tool request, tool returns garbage |
| TUI | resize terminal every second, disconnect network, kill provider mid-stream, spam slash commands, open 5 chats simultaneously, flood event bus |
| WebUI | 20 tabs open, reconnect SSE repeatedly, invalid websocket messages, stale sessions, browser sleep/wake, kill backend mid-poll |
| Memory | duplicate facts, contradictory facts, future timestamps, impossible timelines, memory loops, self-references |
| Swarm | planner refuses, builder hallucinates, auditor lies, researcher times out → see if synthesis survives |
| Services | port=0 entries, wrong health paths, services marked optional:false but offline, port conflicts |

## Raccoon campaign results (2026-06-06)

This session found 3 real regex bugs in Neo's reorder detection by testing with code-like text containing method calls:
1. Only first call per line: `line.match()` → changed to `line.matchAll()`
2. Capture group index: `um[2]` → `um[1]` (non-capturing groups don't count)
3. Method calls missed: `api.start()` not caught → added `(\w+)\.\w+\s*\()` pattern

Also found 14 service config mismatches through systematic path sweeping (port:0 → -1, optional:false → true for dark services).

## Integration with Smith+Neo

Smith's job isn't "break the system" — it's "discover attack classes Neo doesn't know exist." The day Smith finds attack #9 before Neo does is the day the ledger gets interesting.

Every raccoon campaign feeds the reliability ledger. Attack → detect → explain → persist. The organism develops an immune system through systematic abuse.
