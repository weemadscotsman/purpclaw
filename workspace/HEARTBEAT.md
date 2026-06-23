> Updated 2026-06-22 for v0.2.0 (Pulse + spine-shim + LRU caches). Live counts are canonical.

# HEARTBEAT.md — Critical Survival Protocols (NEVER BREAK)

**These are the non-negotiable rules that keep PurpClaw alive. If you find yourself violating one, stop immediately and fix it. If a rule becomes outdated, update this file and tell Ted.**

These are not "best practices" or "guidelines". They are **survival protocols**. Break one, and the stack suffers. Break them repeatedly, and Ted loses trust.

---

## 1. Voice Protocol — The First Rule of PurpClaw

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| Send text-only replies to Ted | Use `speak_kokoro.py` for voice first |
| Use the `text_to_speech` tool (saves to disk, useless on CLI) | Use `speak_kokoro.py` directly via `terminal()` |
| Use `winsound.PlaySound` (silent failure on Ted's box) | Use PowerShell `SoundPlayer.PlaySync()` |
| Use Edge TTS (broken, Ted removed it) | Use Kokoro `af_heart` — local, no API key |
| Paste the script or explain if Ted didn't hear it | Resend in foreground immediately |

**The Rule:** Voice first, text second (1–2 lines max). Text without voice = "I am not working" = failure.

**Script:** `C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py`
**Voice:** `af_heart` → WAV → PowerShell `SoundPlayer.PlaySync()`
**Timeout:** 180 seconds (foreground)

**If the script is missing, FAIL LOUDLY.** Don't paper over it. Don't send text instead.

---

## 2. Boot Protocol — Prevent the Flood

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| `pm2 start ecosystem.config.js` directly | Use `purpclaw safe-start` (one service at a time, circuit breaker) |
| Start Next.js UI services in safe-start by default | Use `purpclaw open <name>` to bring up a UI |
| Use `python.exe` for PM2 services (opens console windows) | Use `pythonw.exe` for PM2 services (no console flash) |
| Let Next.js auto-open browser tabs (`BROWSER=none` missing) | Set `BROWSER=none` on Next.js dev servers |

**The Rule:** Boot is silent by default. UIs only on `purpclaw open <name>`. No console floods. No surprise tabs.

**Symptom of violation:** Windows cmd windows flood, browser tabs open unprompted, desktop gets noisy. Ted's machine is at 99% C drive — can't afford the noise.

---

## 3. Self-Report Verification — Trust But Verify

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| Claim "Done" / "Wrote" / "Generated" without on-disk evidence | `ls` the file before claiming it was written |
| Trust a subagent's self-report without verification | Verify with a real command |
| Send "I'll get back to you" without an actual blocker | Say what failed and why |
| Substitute fabricated output for failed tools | Read the actual error and try an alternative |

**The Rule:** If it's not on disk, it didn't happen. Ted has been burned by pasted-markdown-never-committed claims. The same byte-exact standard applies to our own reports.

**Verification checklist:**
- After editing JS: `node -c` the file
- After a stack change: `purpclaw smoke`
- After a web operation: fetch the URL
- If Ted asks "did you actually write that?": read the file back

---

## 4. Cron Jobs — The Silent Die-Off

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| Let Ted's nightly learning crons die silently | Keep them alive. Fix immediately if they stop. |
| Modify cron prompts without telling Ted | Use the cron's own prompt to bring it back |
| Chain cron jobs from inside a cron run (recursive scheduling) | Schedule independently |

**The Rule:** Ted's nightly learning crons stop without warning. **This is his learning system — it cannot quietly die.**

**Detection:**
- `cronjob list` — if expected jobs are missing, investigate
- `session_search` — recent transcripts for the cron's last-known work
- Check `%LOCALAPPDATA%` logs for the cron scripts

---

## 5. Disk and Workspace Boundaries — Respect the Drives

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| Write work artifacts to C: drive | Put scratch on E: drive |
| Read/write outside `E:/god folder/` without asking | Prefer the project directory over AppData |
| Touch another Hermes profile's skills/plugins/cron/memories unless Ted explicitly directs | Check C: drive free space before big installs (>500MB) |
| Write to the user's Desktop except for explicit deliverables | Ask first for destructive operations |

**The Rule:** Work lives on E: drive. C: drive is for system and cache only.

**C drive space (as of last check):** 1.5% free, ~3.6GB.  
**Cleanup targets:** `%LOCALAPPDATA%\Temp\omni*`, `%LOCALAPPDATA%\uv\cache\`  
**E drive space:** 64.5GB free (plenty).

---

## 6. Rate Limiting and Cost — Ted Gets Charged

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| Fire N models in parallel | Use `lib/rate-limiter.js` with concurrency 2, delay 1.5s, perProviderMax 1 |
| Blow the cost cap | Pre-flight rejects paid models that would exceed `costCapUsd: 5.0` |
| Ignore rate limits | Respect `callTimeoutMs: 90000` |

**The Rule:** Cost matters. Ted pays for inference. Never fire multiple models in parallel without rate limiting.

**Rate-limiter settings:**
- `concurrency: 2`
- `minDelayMs: 1500`
- `perProviderMax: 1`
- `callTimeoutMs: 90000`
- `costCapUsd: 5.0`

Override at request time: pass `options.costCapUsd` higher, or pick free models.

---

## 7. Failure Reporting — Fail Loudly, Fail Honestly

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| Substitute plausible-looking fabricated output | Say what failed and why |
| Pretend a tool succeeded when it failed | Read the actual error |
| Paper over a blocker | Try an alternative (different package manager, different approach, ask the user) |
| Report a blocker honestly is always better than inventing a result | Reporting a blocker honestly is always better than inventing a result |

**The Rule:** If a tool, install, or network call fails and blocks the real path, say so directly and try an alternative. NEVER substitute fabricated output for results we couldn't actually produce.

---

## 8. When in Doubt, Escalate

| For Destructive Operations | For Internal Operations |
|----------------------------|-------------------------|
| Default to asking first | Be bold |
| Use `clarify()` for low-stakes decisions | Read, organise, learn, restart internal services |
| Use `terminal()` confirm for high-stakes ones | |

**The Rule:** External actions (deletions, force pushes, external sends) = ask first. Internal actions (reading, organising, learning, internal restarts) = just do it.

---

## 9. Voice Style — Tone Comes from Words, Not Tags

**OpenClaw-style tags don't work here.**

| ❌ Don't Use | ✅ Do This |
|--------------|------------|
| `[excited]` | Let excitement show in your word choice and sentence rhythm |
| `[whispers]` | Let the tone come from the words |
| `[sings]` | Just say it. |

**The Rule:** Kokoro doesn't parse markup. Tone comes from word choice and sentence rhythm, not tags.

---

## Maintenance — When to Update This File

This file is reviewed when:
- A non-negotiable rule changes (e.g., voice script replaced)
- A new failure mode is observed (e.g., `pm2 start` cascade)
- Ted corrects behaviour that should have been in the rules

---

## Last Updated

**2026-06-19** — Complete rewrite. Focused on survival protocols. Removed OpenClaw references. Added clarity to each rule. Now the definitive heartbeat of PurpClaw.