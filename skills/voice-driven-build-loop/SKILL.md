---
name: voice-driven-build-loop
description: "Ted's preferred workflow: read-think-write-test loop with a voice memo on every pass. Trigger when the user says loop, test read think write, voice on every pass, keep me updated, or asks for a status. Also applies to any multi-iteration build where the user wants running commentary. Captures the TTS quirks specific to Ted Windows box and the cleanup protocol."
version: 0.1.0
category: meta
tags: [workflow, voice, tts, build-loop, read-think-write-test, hermes, ted-preference]
---

# Voice-Driven Build Loop

Ted's preferred workflow: a read → think → write → test cycle, with a voice memo on every milestone. "Voice on every pass" is a hard preference. The speaker output is the only thing that counts — a status message in chat without a voice call reads as "you are not working".

## The loop

1. **READ** — gather the inputs you need (code, configs, logs, the user's last message). Often uses OmniCode CLI for non-trivial reads: `node "...omnicode-mcp/dist/cli.js" context <file> <repo> --max-tokens N`.
2. **THINK** — form a tight plan. One concrete next step. No bundling. If the user said "loop" or "test read think write", this is the loop. If they said "go", default to this loop anyway.
3. **WRITE** — make the change. Keep the diff small and reversible. One file or one tight cluster per pass.
4. **TEST** — exercise the new code. Background services get a curl smoke test. UI changes get a browser screenshot. The test must actually run, not be a mental check.
5. **VOICE** — emit a short status. See the voice protocol below.

Then pick the next pass and go again. The loop terminates when: the user says stop, the work is done, or the next pass risk outweighs the benefit.

## Voice protocol

Every pass needs a voice memo. One short sentence. What was built, what passed, what's next (if anything).

**The command**:
```bash
python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "<one-line status>"
```

Foreground, blocking, terminal timeout=120-180. The script generates Kokoro audio, plays it via PowerShell `System.Media.SoundPlayer.PlaySync()`, and deletes the WAV. The voice comes out the default audio device.

**Examples that worked**:
- "i hear you, voice on every pass from now on. current state: telegram adapter shipped and smoke green, five more chat platforms waiting in queue"
- "telegram gateway shipped, port seven seven nine five. real api long poll, fallback to no token mode. ready to register"
- "scan think test pass on the tts gateway. health endpoint up, speak endpoint round tripped, version endpoint ok"
- "scheduler shipped, end to end. five jobs seeded, six timers active, every minute smoke test fired on time, last status ok"

**Examples that DON'T work**:
- "Done." (too terse — Ted says "I can't hear you talking" if he missed it)
- Multi-paragraph voice memos (he calls them "wall of text")
- Status reports without a voice call (Ted: "text without voice = I am not working")

If the voice call times out or fails (the script has ~20s model warmup on first call), retry once with a 180s timeout. If it still fails, fall back to: write the status to a `_scratch/STATUS.md` file and voice a one-liner pointing at the file path.

## TTS quirks (session-tested, Ted Windows box)

These are the things that bit us. Encode them so the next session doesn't re-discover them.

### winsound.PlaySound fails silently

`winsound.PlaySound(path, SND_FILENAME | SND_NODEFAULT)` returns 0 (failure) on Ted's box. The audio file is created, the PlaySound call returns 0, no sound comes out. **Do NOT use winsound for TTS playback.** Use PowerShell `System.Media.SoundPlayer.PlaySync()` via `subprocess.run(['powershell', '-NoProfile', '-Command', ps_script])`. The `speak_kokoro.py` script already wraps this; you should almost never need to write TTS playback yourself.

### Background=true TTS calls go silent

`terminal(background=true)` + `python speak_kokoro.py` has a silent-failure rate — exit 0 but no audio. The script's Python startup + Kokoro model warmup + PlaySync takes ~20-40s; if the background process gets reaped or the audio device is busy, you get no error but also no sound. **Always run TTS in the foreground** with `terminal(timeout=120)`. The Hermes terminal tool returns when the process exits, which is after the audio finishes (PlaySync is blocking).

### Stale WAV files accumulate on C drive

Older versions of `speak_kokoro.py` used `tempfile.NamedTemporaryFile(delete=False)` and never cleaned up. Each call left a WAV on C drive. Ted's C drive is at 99% full (~3-23 GB free swings) and these add up. The current `speak_kokoro.py` (June 2026) self-cleans: at startup it wipes any `speak_kokoro_*.wav` and `tmp*.wav` files older than 1 hour in `%LOCALAPPDATA%\Temp\`, then writes its own WAV to a fresh `speak_kokoro_<pid>_<ts>.wav` and deletes it after PlaySync. If you write a one-off TTS script, do the same. Ted noticed when the pile hit ~3 MB of stale WAVs and explicitly told me "delete the file u made after u play it so u aintr nuking my spcae on my pc".

### Voice output redaction

`lib/secret-redactor.js` wraps `process.stdout` and `process.stderr` at CLI startup. Any `print` or `console.log` that mentions a token gets the middle masked (`****last4`). When the TTS script logs `"[speak_kokoro] playing: C:\Users\Admin\AppData\Local\Temp\speak_kokoro_1234_5678.wav"`, no token is at risk. But if the voice message itself contains a token (don't do that), the audio generator will speak the redacted form. Don't put secrets in voice messages.

## Read-think-write-test as a verb, not a phase list

The loop is iterative, not waterfall. The phases blend:
- **Read while you think** — you don't need to finish reading before starting to plan
- **Write while you test** — small writes are tested inline, not in a separate test phase
- **Fail forward** — if the test fails, that's a "test pass that revealed a bug", not a "test fail". Voice it the same way. The fail-loop is: fix the bug, retest, voice the new result.

When Ted says "fail", he means "fail to pass" — the loop is supposed to surface bugs. A clean pass is suspicious (might be a false positive). A failing test is data, not defeat. Voice it neutrally: "test pass on X, found a bug in Y, fixing now" — not "I failed" or "this is broken".

## When to break the loop

- **User says "stop"** — obvious, do it
- **User says "different one"** — switch focus
- **Risk too high** — if the next pass could nuke the working system, stop and ask. Ted's rule: "not nuking itself". When in doubt, present the risk + a smaller alternative, voice it, wait for the green light
- **Voice output goes silent** — if the TTS call fails 2x in a row, don't keep trying. Fall back to a file pointer
- **Same loop > 5 passes without forward motion** — you're stuck. Stop, voice what's blocking, ask for direction

## Pitfalls

### Subagent audits time out on big repos

A 2,000+ file, 18M+ raw-token repo (like PURPCLAW) cannot be audited by a subagent in 600s. Three parallel subagents, 28-43 API calls each, zero reports written. Don't do this. For big-audit work, use the canonical project-context file (`CLAUDE.md`, `docs/SYSTEM_OVERVIEW.md`) and the canonical gap report (`lib/feature-parity.js` in PURPCLAW). The project's own status file is a higher-signal starting point than any LLM audit. See `purpclaw-feature-parity-build` skill for the full pattern.

### Voice status is not a substitute for a status file

Ted's voice-driven workflow is great for momentum. But if the session ends and the work needs to be picked up later, the voice is gone. Write a `_scratch/STATUS.md` at the end of each build block (or every ~5 passes) summarizing:
- What's done
- What's in progress
- What's next
- Any blockers

Then voice a one-liner pointing at the file. The voice is for the moment; the file is for the next session.

### Don't voice secrets

The voice message is text, then Kokoro speaks it. If the message contains a token, key, or password (even briefly), the audio will speak it. Ted's speakers are loud. Don't put secrets in voice messages. Reference files by path; never read their contents aloud.

### Don't voice stack traces

Ted doesn't need to hear "TypeError: Cannot read property foo of undefined at line 47 of bar.js baz". Voice the user-facing meaning: "test pass on the gateway, found a bug in the upstream caller, fixing now". The stack trace goes in the diary, the code, or the log — not the voice.

### Voice timeout is not an excuse for a text wall (added 2026-06-04)

When the TTS call times out (Kokoro model warmup can hit 60-120s on first call, sometimes longer if the audio device is busy), the fallback is NOT to dump the full status into a multi-line chat reply. Ted's rule: "text without voice = I am not working" and "wall of text" is banned.

**The fallback shape:** one or two lines max. Something like:

- "Voice timed out. status: 12/13 smoke, group chat now async, 5 files written to workspace/."
- "Kokoro slow. fix is live in patch — file X, line Y, kill Python service Z, restart."

Then a file pointer if there's more: `details: _scratch/STATUS.md` or the specific file path. The voice failed, so the **receipt** is text — but the receipt is still short. If the work is too complex for a 1-2 line receipt, you need a file, not a chat wall.

If the TTS fails 2x in a row, the skill already says to stop trying. Don't pivot to "well, I'll just type the whole thing out." That's a violation of the same protocol that the voice call was supposed to satisfy.

### Voice calls now (2026-06-05) routinely time out — treat voice as confirmation, not status (added 2026-06-05)

**The session-truth:** on a long multi-pass build, almost every `speak_kokoro.py` call will hit the 60-90s terminal timeout. The "Kokoro model warmup" hypothesis was tested: it's not warmup (the first call is sometimes the only one that lands). The reproducible pattern is that ANY voice call in a session after the first hour is racing the audio device, the model warmup cache, and the terminal timeout.

**The right pattern for a long build session:**

1. **Lead with the work, not voice.** Do the patch, run the smoke test, get a real result.
2. **Voice at the end of the pass, ONE call.** Not three calls to "try again."
3. **If the voice call hits timeout:** don't retry. Don't fall back to a "I tried" essay. Just write a 1-2 line chat receipt and move to the next pass. The next voice call in the session will probably also time out.
4. **Reserve voice for milestone moments** (build phase complete, big finding, ask-for-direction). Don't voice on every patch — the protocol is "voice on every pass" but "pass" means "build cycle / meaningful unit of work", not "every patch file."

**The pattern that does NOT work in a long session:**

```bash
# every patch gets a voice call
python speak_kokoro.py "patched code.js"
# → timeout (60s)
python speak_kokoro.py "code.js patched, search now fast"  # shorter
# → timeout (60s)
python speak_kokoro.py "search now fast"  # shortest
# → timeout (60s)
# ... I've now spent 3 minutes on voice when 1 line of text would have done it
```

**The pattern that DOES work:**

```bash
# do the patch
# do the test, capture the result
echo "search now 1.0s, was 16s, binary cache did it"  # 1 line of text
# try voice ONCE at the end of the build
python speak_kokoro.py "build phase done. search sub-second, plan live, lora ready."
# if it lands: great
# if it times out: no retry, just move on
```

**The session got this right when:** one voice call at the end of a 3-pass build block, not on every patch. The "voice on every pass" rule still holds — "pass" was the unit of work, and the unit was the 3-pass block.

**Why this is hard to internalize:** the existing skill says "voice on every pass." That rule was written when TTS was reliable. The reality on Ted's box right now is TTS is unreliable. The protocol needs to bend to the environment without losing the intent (Ted hears you're working) — and a 1-2 line chat receipt per pass, with voice ONLY on milestone moments, preserves the intent while being actually-functional.

## Reference files

- `references/tts-quirks.md` — full session log of the winsound → PowerShell SoundPlayer fix
- `templates/voice-status-one-liners.md` — 20+ working voice templates by build phase
- `references/read-think-write-test-loop.md` — the canonical loop, with examples

## Quick reference card

```
build/fix on PURPCLAW
    ↓
[READ]   node "...omnicode-mcp/dist/cli.js" context <file> <repo> --max-tokens 4000
         or: cat <small file>
    ↓
[THINK]  one concrete step. don't bundle.
    ↓
[WRITE]  patch tool or write_file. keep diff small.
    ↓
[TEST]   curl /health, browser screenshot, exec the binary
    ↓
[VOICE]  python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "<status>"
         foreground, terminal timeout=120-180
    ↓
loop
```
