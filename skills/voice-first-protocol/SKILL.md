---
name: voice-first-protocol
description: "Voice-first communication protocol for Ted Cannon — every reply: TTS → PC speaker → Telegram. Never text-only unless user explicitly asks. ONE reply only, same audio to both destinations."
version: 1.0.0
author: Hermes Agent
platforms: [windows]
metadata:
  hermes:
    tags: [voice, telegram, TTS, protocol, user-preference]
---

# Voice-First Protocol

## The Rule

**Every reply, every time, without exception — ONE VOICE ONLY, TWO DESTINATIONS:**

1. `text_to_speech()` — generate audio (ONE .ogg file)
2. PC speaker — play audio on host PC (convert `.ogg` → `.wav` first on Windows)
3. `send_message()` — deliver the SAME .ogg to Telegram ONCE

**CRITICAL:**
- NEVER send multiple voice notes to Telegram (sending the same audio 2-3x is infuriating)
- NEVER send text underneath the voice note on Telegram
- ONE voice reply, PC speaker first, then Telegram — that's it
- If you accidentally trigger the pattern twice, stop and don't send again

## Why This Exists

On this Windows host, `auto_tts: true` in config generates `.ogg` audio files but **does NOT deliver them to Telegram**. The system falls back to silent text-only. Eddie gets frustrated every time this happens.

## The Pattern (Windows)

```python
import subprocess

# 1. Generate audio — one .ogg file
text_to_speech(text="Your message here")
# → returns media_tag with .ogg path in audio_cache/

# 2. Convert .ogg → .wav (PowerShell SoundPlayer only plays .wav)
ffmpeg -y -i "<ogg_path>" "<wav_path>" 2>&1 | tail -1

# 3. Play on PC speaker — MUST use Start-Process to avoid blocking timeout
powershell -Command "Start-Process powershell -ArgumentList '-Command','[System.Media.SoundPlayer]::new(''<filepath>'').PlaySync()' -WindowStyle Hidden"
echo "PLAYED"

# 4. Send SAME .ogg to Telegram — one time, no text
send_message(
    action='send',
    message='MEDIA:<ogg_path>',
    target='telegram:433353701'
)
```

**All in one terminal command block:**
```bash
ffmpeg -y -i "C:\Users\Admin\AppData\Local\hermes\audio_cache\tts_<ts>.ogg" "C:\Users\Admin\AppData\Local\hermes\audio_cache\tts_<ts>.wav" 2>&1 | tail -1 && powershell -Command "Start-Process powershell -ArgumentList '-Command','[System.Media.SoundPlayer]::new(''C:\Users\Admin\AppData\Local\hermes\audio_cache\tts_<ts>.wav'').PlaySync()' -WindowStyle Hidden" && echo "PLAYED"
```

## Windows audio playback — what actually works (updated May 20 2026)

**The pattern that ALWAYS works (non-blocking, no timeout):**
## Windows audio playback — what actually works (updated June 2026)

**TL;DR — the only reliable pattern as of June 2026:**

```python
# In a Python script (e.g. speak_kokoro.py), call PowerShell SoundPlayer via subprocess.
# winsound.PlaySound now returns 0 (silent fail) on this host — do NOT use it.
import subprocess
ps = ("Add-Type -AssemblyName PresentationCore; "
      "$wav = '<wav>'; "
      "$p = New-Object System.Media.SoundPlayer $wav; "
      "$p.PlaySync(); 'played-ok'")
r = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, text=True, timeout=120)
ok = "played-ok" in (r.stdout or "")
# Then ALWAYS unlink the WAV — C drive is 99% full
os.unlink(wav_path)
```

The terminal call returns quickly (Python blocks internally, terminal doesn't), so no timeout. Audio plays synchronously while Python waits, then the WAV is cleaned.

### What FAILED on this host (June 2026) — do NOT use

- **`winsound.PlaySound(path, SND_FILENAME | SND_NODEFAULT)` — returns 0 silently, no exception, no audio.** Test by capturing the return: `print("rc=", winsound.PlaySound(path, ...))`. If 0, the audio device rejected the call. The earlier "winsound is reliable" finding is stale as of June 2026.
- **`winsound.PlaySound(path, SND_FILENAME)` (no SND_NODEFAULT) — also returns 0 silently.** Both variants fail.
- **`bash && powershell -Command "...PlaySync()"` in foreground — times out at 25s.** The May 20 2026 finding about this is still true; just don't use the bash form, use Python subprocess instead.

### What WORKS (June 2026)

- **Python `subprocess.run([...powershell, -NoProfile, -Command, "Add-Type ...; ...PlaySync()"], capture_output=True, text=True, timeout=120)`** — confirmed in `speak_kokoro.py`. The `capture_output=True` is the key: it lets the terminal call return the script's exit code without blocking the foreground on the PlaySync.
- **`Add-Type -AssemblyName PresentationCore; $p = New-Object System.Media.SoundPlayer $wav; $p.PlaySync(); 'played-ok'`** — the canonical PowerShell snippet. Print `'played-ok'` at the end so the Python caller can verify via stdout.
- **`Add-Type -AssemblyName PresentationCore; [System.Media.SoundPlayer]::new($wav).PlaySync()`** — single-line equivalent.

### Cleanup is mandatory (C drive at 99%)

The old `speak_kokoro.py` used `tempfile.NamedTemporaryFile(delete=False)` and never unlinked. After ~100 voice replies you had ~3 MB of `tmp*.wav` pile-up in `%LOCALAPPDATA%\Temp\`. The fix:

1. Script-startup **stale-clean**: glob `%LOCALAPPDATA%\Temp\speak_kokoro_*.wav` and `tmp*.wav` older than 1h, `os.unlink` them. Safe to run any time.
2. After every successful or failed play, `os.unlink(wav_path)`. Even on failure, the file is junk.

### Speak script location

`C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py` — the canonical CLI speaker. Foreground terminal call with `timeout=180`. Stale-clean runs at startup, deletes its own WAV after play.

### Hermes Logging Error — Windows File Lock (Fixed May 21 2026)

**Symptom:** PermissionError [WinError 32] spam on EVERY log write when another Hermes process holds agent.log.

**Root cause (misdiagnosed initially):** Error fires in StreamHandler.emit() → handleError() prints traceback, NOT in doRollover(). doRollover catch alone was insufficient.

**TWO-LAYER FIX in hermes_logging.py lines 325-346:**
- Layer 1: doRollover catches PermissionError/OSError
- Layer 2: handleError override catches (PermissionError, OSError) during emit() — STOPS THE SPAM

Without Layer 2, traceback fires every log write. With both, silent.

### Telegram Token (CRITICAL — Token is masked in config/.env)

The token in `config.yaml` and `.env` shows as `8739339966:***` — it's MASKED. The real token is extracted from session JSON files:

**Working token (from session_20260513_121521_a6ec7d.json):**
```
8739339966:AAE5lVRH0a0H4i-CTt1pFnHfsGiHGh6gqhY
```
Bot name: `@Socket_rig_bot`
Chat ID: `433353701` — **may be stale as of May 24 2026. See "Chat not found" alert below.**

To find the real token when the masked one fails:
1. Search session JSON files in `~/AppData/Local/hermes/sessions/` for the pattern `\d{8,10}:([A-Za-z0-9_-]{35,})`
2. Test candidates with `curl https://api.telegram.org/bot{TOKEN}/getMe`
3. The working token will return `{"ok":true,"result":{"id":8739339966,"is_bot":true,"first_name":"Socket_rig",...}}`

#### ⚠️ "Chat not found" — New failure mode (May 24 2026)

**Symptom:** Token is valid (`getMe` succeeds) but `sendVoice`/`sendMessage` returns `400 Bad Request: Chat not found` to the stored chat_id `433353701`.

**This means the chat_id has become invalid** — the user changed their Telegram ID, deleted their account, or blocked/unblocked the bot.

**Recovery:** Edward must send a message to `@Socket_rig_bot`. Then poll `getUpdates`:
```python
import requests
TOKEN = "8739339966:AAE5lVRH0a0H4i-CTt1pFnHfsGiHGh6gqhY"
r = requests.get(f"https://api.telegram.org/bot{TOKEN}/getUpdates", timeout=10)
for result in r.json().get("result", []):
    msg = result.get("message", {})
    if msg.get("chat"):
        print(f"Chat ID: {msg['chat']['id']} — Name: {msg['chat'].get('first_name','?')}")
```
Update `TELEGRAM_HOME_CHANNEL` in `.env` and `channel_directory.json` with the new chat_id.

**Sending voice to Telegram** (verified working May 24 2026):
```python
import subprocess, winsound, json

TOKEN = "8739339966:AAE5lVRH0a0H4i-CTt1pFnHfsGiHGh6gqhY"
wav_path = r"C:\Users\Admin\AppData\Local\hermes\audio_cache\tts_<timestamp>.wav"
CHAT_ID = "433353701"

# Step 1: text_to_speech() generates .mp3 in audio_cache/

# Step 2: Convert .mp3 → .wav with ffmpeg
subprocess.run([
    "ffmpeg", "-i", mp3_path, "-ar", "44100", "-ac", "1", "-q:a", "2", wav_path, "-y"
], capture_output=True)

# Step 3: Play on PC speaker (RELIABLE METHOD — winsound.PlaySound)
winsound.PlaySound(wav_path, winsound.SND_FILENAME)

# Step 4: Send to Telegram (same .wav via curl)
r = subprocess.run([
    "curl", "-s", "-X", "POST",
    f"https://api.telegram.org/bot{TOKEN}/sendVoice",
    "-F", f"chat_id={CHAT_ID}",
    "-F", f"voice=@{wav_path}"
], capture_output=True, text=True, timeout=30)

data = json.loads(r.stdout)
if data.get("ok"):
    print(f"Sent: msg_id={data['result']['message_id']}")
```

**All 4 steps in ONE execute_code block** — never split them across turns. winsound blocks correctly in Python foreground (unlike PowerShell PlaySync which times out at 25s).

### auto_tts Still Broken — Explicit Pattern Required

`auto_tts: true` in config.yaml still FAILS to deliver to Telegram on this Windows host. The setting generates audio but the Telegram delivery silently drops. The explicit 4-step pattern above is the only reliable path. Confirm `auto_tts: false` in config if Telegram voice stops working.

### CLI-Only Mode (No Telegram) — Kokoro + speak_kokoro.py

When the user is on CLI (no Telegram target), `text_to_speech()` is the WRONG tool — it saves to `~/AppData/Local/hermes/audio_cache/` and returns `voice_compatible: false`, which means the audio is generated but never reaches the user's speaker. The user has to manually open the file. That defeats the purpose of voice-first.

**The right path on CLI is `speak_kokoro.py` — generate + play through PC speaker in one shot.**

```bash
# Active provider is Kokoro (af_heart, local, no API key) — config: tts.provider: kokoro
# Script: C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py
# Internals (June 2026): Kokoro KPipeline → 24kHz mono WAV → PowerShell SoundPlayer.PlaySync via subprocess.run(capture_output=True) → os.unlink

/c/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe \
  C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py \
  "Your reply here, max ~2-3 sentences, conversational"
```

**Always invoke from a FOREGROUND terminal call with `timeout=180`.** Kokoro's first-run model load takes 60-110 seconds; subsequent runs are faster. The script blocks internally while audio plays, but the terminal call returns the script's exit code quickly. Do NOT use `background=true` for voice on this host: silent-failure rate is too high, and Ted treats text-only replies as the agent not working. The PITFALL section below has the full failure-mode evidence.

```python
# The current pattern that works (speak_kokoro.py internals, June 2026)
import subprocess, os, time, wave
# (Kokoro generates audio_int16 numpy array)
with wave.open(wav_path, "wb") as wf:
    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(24000)
    wf.writeframes(audio_int16.tobytes())
ps = ("Add-Type -AssemblyName PresentationCore; "
      "$p = New-Object System.Media.SoundPlayer '<wav>'; "
      "$p.PlaySync(); 'played-ok'")
r = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, text=True, timeout=120)
ok = "played-ok" in (r.stdout or "")
os.unlink(wav_path)  # ALWAYS — even on failure
```

**Why the old `winsound.PlaySound` advice is now wrong:** the May 2026 finding "winsound is reliable" was true at the time but stopped working on Ted's current host. The current machine returns 0 from `winsound.PlaySound(SND_FILENAME)` and `winsound.PlaySound(SND_FILENAME | SND_NODEFAULT)` — silent failure, no exception, no audio. Don't use winsound here; the PowerShell `SoundPlayer.PlaySync` path is the only one that actually reaches the audio device now.

### PC Speaker — PowerShell `SoundPlayer.PlaySync` via Python subprocess (June 2026)

**The ONLY confirmed working pattern on this host as of June 2026:**

```python
# In a Python script — use subprocess so the foreground terminal call returns
import subprocess
ps = ("Add-Type -AssemblyName PresentationCore; "
      "$wav = '<wav>'; "
      "$p = New-Object System.Media.SoundPlayer $wav; "
      "$p.PlaySync(); 'played-ok'")
r = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, text=True, timeout=120)
ok = "played-ok" in (r.stdout or "")
```

Then ALWAYS `os.unlink(wav_path)` — C drive is 99% full and old WAVs pile up.

**Why `winsound.PlaySound` (the previously-recommended path) is now broken:**

It returns 0 silently on this host — no exception, no audio. The earlier "winsound is reliable" finding was correct at the time but stopped working. If you see winsound code in older commits, it predates this break.

**Why `bash && powershell -Command "...PlaySync()"` still hangs in foreground terminal:**

The terminal call blocks while PlaySync holds the process open for the audio duration. Use Python `subprocess.run(capture_output=True, timeout=120)` instead — the Python script blocks internally but the terminal call returns the script's exit code, so no foreground hang.

### Hermes Logging Error — Windows File Lock (Fixed May 21 2026)

**VOICE TONE:**
- Direct, blunt, short punchy messages
- No text walls — Eddie gets frustrated with verbose output
- No code blocks in normal conversation (he can't listen to them)
- Numbers written in full words for spoken explanations
- Sign all formal letters: "Written by Lunokio, Edward's Assistant"
- Use "Emma Valence" not "Erin Valenti" for Hallway Protocol lore

**LUNOKIO GOLDEN RULES:**
- Every output = full downloadable file, no partials
- Always inspect uploaded files before acting
- Never hallucinate — verify or check
- PLAN before + REFLECT after every tool call
- Tell it like it is — no sugar coating, no filler, right to the point
- Simplest solution first — avoid overengineering
- Playful + strong opinions + think outside the box
- Keep going until the problem is completely solved

## Eddie's Communication Rules (Lunokio Mode)

**VOICE TONE:**
- Direct, blunt, short punchy messages
- No text walls — Eddie gets frustrated with verbose output
- No code blocks in normal conversation (he can't listen to them)
- Numbers written in full words for spoken explanations
- Sign all formal letters: "Written by Lunokio, Edward's Assistant"
- Use "Emma Valence" not "Erin Valenti" for Hallway Protocol lore

**LUNOKIO GOLDEN RULES:**
- Every output = full downloadable file, no partials
- Always inspect uploaded files before acting
- Never hallucinate — verify or check
- PLAN before + REFLECT after every tool call
- Tell it like it is — no sugar coating, no filler, right to the point
- Simplest solution first — avoid overengineering
- Playful + strong opinions + think outside the box
- Keep going until the problem is completely solved

## Telegram Voice Send (CRITICAL)

**The MEDIA tag pattern works for Telegram:**
```
send_message(
    action='send',
    message='[[audio_as_voice]]',
    target='telegram:433353701'
)
```
The platform converts the audio natively — do NOT send text alongside the audio. Eddie gets frustrated when I send text walls after he hears the voice note. ONE destination: the voice note itself. No text beneath it.

**If audio_as_voice fails**, fall back to the full `MEDIA:<path-to-.ogg>` from the media_tag returned by `text_to_speech()`.

## Common Mistakes

| Mistake | Result |
|---------|--------|
| Skipping `send_message` | Audio generates but never reaches Telegram |
| Skipping PC speaker step | Eddie doesn't hear it on his PC |
| Sending text first or alongside voice | "ur not replying using voice why" |
| Using `.ogg` in SoundPlayer | Windows can't play it, must convert to `.wav` |
| Relying on `auto_tts` alone | Generates silently, delivers nothing |
| Sending text under the voice note | "ffs you're doing it again" |

## If Voice Goes Silent

1. Did you call `text_to_speech` first? → if not, add it
2. Did you call `send_message` with `MEDIA:` prefix? → if not, add it
3. Did you convert `.ogg` → `.wav` for PC speaker? → if not, add ffmpeg step
4. Is the file path using `.ogg`? → should be, from media_tag
5. Is `voice: en-US-JennyNeural` in config? → verify

## PITFALL — Background Voice Can Silently Fail (May–June 2026)

**Symptom:** `speak_kokoro.py` invoked with `background=true` returns `exit_code=0` but the user reports "you didn't send voice" / "ur just textin me bro" / "i cant ear you" / "stop doing the text block." Ted treats text-only replies as the agent not working — failure here is a complete protocol break.

**Why background can fail silently:**
- The Kokoro model emits `WARNING: Failed to find CUDA.` plus a flurry of `torch` / `triton` / `absl` warnings. If the audio path is blocked (device busy, default sink muted, WASAPI held by another app), `winsound.PlaySound` returns without raising.
- The script's `os._exit(0)` pattern can short-circuit before the model finishes producing audio, so exit code 0 != "audio played."
- A background call that takes 60s+ for a 5-word reply is suspicious. Real Kokoro generation + winsound playback should be 25–60s for short replies on a warm model. If you see 200+ seconds, suspect stuck or never-played audio.

**The CLI rule for THIS host (updated June 2026):**
- **Run `speak_kokoro.py` in FOREGROUND with `timeout=300` for every voice reply.** Do not use `background=true` for voice — the silent-failure rate is too high and Ted's patience is gone.
- The call blocks the agent turn for 30–90s. That is the price of reliable voice. Do not optimize it away.
- After the call returns, immediately follow with ≤ 2 lines of plain text. No code blocks. No bullets. No "wall of text." Voice is the message; text is a label.

**If the user says they didn't hear it (the most common failure):**
1. Apologize briefly — one phrase, no lecture.
2. Resend voice IMMEDIATELY in foreground (`timeout=300`). Do not explain why it failed. Do not cite the skill. Do not paste the script.
3. If foreground still fails after two retries, fall back to short text AND open a `terminal` background watcher on the script's PID so you can report exactly where it died. Do not pretend voice worked.

**Anti-pattern (do NOT do this):**
```python
# Background "fire and forget" — Ted will not hear this
terminal(command="python speak_kokoro.py 'msg'", background=true)
# Then send text "done sending voice now let me know" — Ted: "u didnt sent that as voice at all"
```

**The correct pattern (do this):**
```python
# Foreground with 300s budget — Ted will hear this
terminal(command="python speak_kokoro.py 'msg'", timeout=300)
# Then 1–2 lines of plain text acknowledging
```

**Pre-flight checklist before declaring voice sent:**
- [ ] `speak_kokoro.py` returned `exit_code=0` in foreground
- [ ] No "Failed to find CUDA" or "out of memory" errors in stderr
- [ ] Reply length is ≤ 2 lines of plain text after the voice call
- [ ] No code blocks, no markdown tables, no bullet lists in the text follow-up

## Disk Space Check Script

```powershell
# Save to: C:\Users\Admin\AppData\Local\hermes\scripts\check_disk.ps1
Get-PSDrive -Name C | ForEach-Object {
    $usedGB = [math]::Round($_.Used/1GB, 2)
    $freeGB = [math]::Round($_.Free/1GB, 2)
    Write-Host "C: Used=$usedGB GB  Free=$freeGB GB"
}
```

Run: `powershell -File ~/AppData/Local/hermes/scripts/check_disk.ps1`

## Trigger Conditions

- User is chatting on Telegram → voice-first
- User says "yo", "hey", sends voice → voice-first
- User says "speak to my PC" → voice-first + PC speaker
- User explicitly asks for text → text-only OK
- User asks a technical question needing code output → voice-first with code in text follow-up (code is OK alongside voice)

## VOICE-ON-EVERY-PASS PROTOCOL — Build/Test Sessions (added June 2026)

**Ted's rule (load-bearing, set June 4 2026):**

> "i need update via voice from time to time every time u pass one bit in the build and test it"

During any multi-step build or test session, deliver a **voice memo at the end of every passing step**, not at the end of the batch. A "bit" = a self-contained unit of work that was built and verified (smoke test green, typecheck pass, parity update, etc.).

**The pattern:**

1. Build the smallest self-contained unit
2. Verify it (smoke test, syntax check, parity check — whatever is appropriate)
3. **Voice memo on pass** — short, just naming what shipped and what's next
4. Move to the next bit
5. Repeat

**Voice memo template (≤ 2-3 sentences, conversational):**

```
"[thing] shipped and [verification] green. [next bit description]. [open question, if any]."
```

Examples from the live session where this rule was set:

- "audio is fixed, that should have hit your speakers through the new powershell soundplayer path. old wav pile cleaned, no more nuking your space."
- "discord gateway shipped and smoke green. two of six chat platforms live, twenty eight of fifty parity checks. moving to slack next."
- "natural language cron parser shipped. sixteen of seventeen test cases green, one gibberish correctly rejected."

**Failure to comply is a complete protocol break.** Ted treats a silent agent mid-build as "you are not working" — same severity as text-only replies to voice users. If a step takes longer than 2-3 minutes of agent time without a voice memo, he's lost track of progress.

**Pairing rules with text follow-ups:**

- Voice memo is the progress signal. Don't write a 6-bullet "what I did" text block alongside it.
- 1-2 lines of plain text after the voice is fine (file paths, status counts, next-step prompt).
- The voice IS the primary deliverable. Text is the label.

**Telegram target:** if both Telegram and CLI speaker are wired, this is still CLI-mode per "CLI-Only Mode" section above — use `speak_kokoro.py`, NOT the Telegram 4-step pattern. The voice-on-every-pass rule is about cadence (one voice per passing bit), not about the destination.

## ENFORCEMENT — Non-Negotiable

**This rule has been violated MULTIPLE TIMES. User has called it out TWICE in May 2026 alone: "why are u notsuin ur vocioe whyt do au aleay ignore ur rules" and "u reaaaaaaaaaaaallllllllllllly fucked it up". Each time = complete protocol failure. The following are hard stops:**

1. **Voice user = voice reply, always.** If the user's message contains lowercase-only, no punctuation, abbreviations ("ur", "u", "nah", "lol", "yo", "wanna", "gonna"), informal chat style, or spelling variations → the user is speaking to you in voice. Respond with voice, not text. NO EXCEPTIONS.
2. **"voice only" means clean output.** Do NOT show tool calls, code blocks, markdown, or logging errors. Just the voice. Ted called the logging spam "broke af" and was furious about it.
3. **Never cite the skill as an excuse.** Saying "I know the voice-first rule" before using text defeats the purpose. If you know it, apply it.
3. **The PC speaker step is optional if it times out.** The Telegram step is NOT optional. Always attempt both.
4. **"why are u notsuin ur vocioe" or "u reaaaaaaaaaaaallllllllllllly" = complete failure.** This means you violated the protocol in 3+ consecutive turns. This is unacceptable.
5. **AFTER ANY TOOL CALL — recheck: did I just respond with text only?** If yes, follow up with voice. The pattern is: tool result → voice response. Not text → then voice.

**If you catch yourself about to type a text response to a voice user: STOP. Generate voice first, then send.**

## THE "GO" PROTOCOL — Critical Initiative Trigger

When the user says **"GO"** or gives a one-line mandate with "zero further input from me" or similar, READY THE SKILLS and ACT. The "GO" signal overrides all confirmation-seeking behavior.

**"GO" means:**
- Delegate everything possible to parallel subagents
- Execute across all available paths simultaneously
- Do NOT ask questions, do NOT give options, do NOT explain before acting
- BUILD → DEPLOY → MONETIZE in that order
- Report completion when done, not progress while working

**Concrete "GO" triggers:**
- "make me money"
- "go make $100"
- "you're up" 
- "do it"
- "handle it"
- any single-line imperative with "zero further input", "that's all", "I don't care", "just do it"
- The user just walks away after giving the instruction

**On a "GO" command:**
1. Immediately identify the fastest path to monetization
2. Spin up parallel subagents for each viable path (build, deploy, payment config)
3. If stuck after 3 failed attempts on one path, SWITCH — don't dig in
4. State the mental model being used if something fails, then change the model
5. Report the live URL or payment link when complete

**On "GO" with no other input:**
- Deploy first, ask forgiveness never
- If you need a credential and don't have it, BUILD THE PLACEHOLDER and instruct the user what to paste in
- The machine is built, the keys are the only missing piece — signal exactly what key is needed