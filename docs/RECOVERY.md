# PURPCLAW Recovery Runbook

When something has gone sideways — desktop crash, PC reboot, "I have no idea what state this stack is in" — this is the page.

Bookmark it. Print it. Carve it into a stone tablet.

---

## TL;DR — the 3-command recovery

```bash
purpclaw heal                  # see what's wrong, get a plan, NO execution
purpclaw heal --execute        # apply the plan via safe-start (cascade-safe)
purpclaw smoke                 # verify the pipeline actually works end-to-end
```

If all three pass clean, the workshop is back.

---

## Why this exists

On 2026-05-25 a single `pm2 start ecosystem.config.js --only A,B,C,D` call triggered a Windows cmd-window spawn cascade that crashed the operator's desktop. Root cause was a flaky service (`chorus`) crash-looping during launch while three other services were simultaneously spawning. The cascade outpaced Windows' window handle cleanup.

The cascade is now structurally impossible to reproduce via `purpclaw safe-start` — but it remains reachable if you call `pm2 start` directly on multiple services. **Don't.**

---

## The Failure Modes

### 1. Cmd-window cascade (the desktop killer)

**Symptom:** Hundreds of cmd.exe windows opening rapidly, Explorer freezes, PC may crash.

**Cause:** Multiple PM2 services starting simultaneously on Windows; at least one is crash-looping; each restart attempt spawns a cmd window because `windowsHide: true` doesn't always survive the crash path through the Python interpreter wrapper.

**Recovery:**
1. Hard reboot if necessary
2. `purpclaw heal` — diagnose without touching anything
3. `purpclaw safe-start --core` — bring the 16 stable services up, one at a time, with stabilisation watches
4. `purpclaw smoke` — verify

**Prevention:** Never run `pm2 start` directly. Always go through `purpclaw safe-start`.

### 2. Orphan processes blocking PM2-managed siblings

**Symptom:** `purpclaw doctor` shows `⚠ ORPHAN (not under PM2)` for a service. Its PM2 entry may be in restart-loop.

**Cause:** A previous invocation of the service is still holding the port, but PM2 doesn't know about it. PM2's managed copy can't bind → crash-loops.

**Recovery:**
1. `netstat -ano | findstr :<port>` to find the orphan PID
2. Stop it. If it was started with elevation, you'll need an **admin PowerShell**:
   ```powershell
   Stop-Process -Id <pid> -Force
   ```
3. `npx pm2 reset <name>` to clear the crash-loop counter
4. `purpclaw safe-start <name>` to bring it up cleanly

**Known orphans (elevation-protected on 2026-05-25):** YOLO (:7779), Avatar (:7777) — both Python processes started outside PM2. They DO answer their health endpoints; they just aren't supervised. If you don't need auto-restart-on-crash for them, you can leave them.

### 3. PM2 daemon is gone

**Symptom:** `npx pm2 ping` returns no response, or `purpclaw doctor` reports `pm2 jlist failed`.

**Cause:** Daemon was killed (often as collateral damage when an operator force-closes many cmd windows during a cascade).

**Recovery:**
1. `npx pm2 resurrect` — restores the last saved process list
2. If that doesn't help: `npx pm2 ping` (forks a new daemon)
3. Then `purpclaw heal` to see what came back

### 4. Service is "online" but actually broken

**Symptom:** Port answers `/health` 200 but workflows fail / agents don't respond / smoke fails on a specific check.

**Recovery:**
1. `npx pm2 logs <name> --lines 50 --nostream` — read its recent output
2. `purpclaw smoke --json | findstr <subsystem>` — narrow the failing check
3. If unclear, restart just that service: `purpclaw safe-stop <name>` then `purpclaw safe-start <name>`

### 5. .env drift / wrong API key / 401s everywhere

**Symptom:** `purpclaw smoke` says `llm:complete` failed with `HTTP 401` or similar.

**Recovery:**
1. `purpclaw init --wizard` — re-runs the wizard with key sanitisation
2. Or hand-edit `.env`, then `npx pm2 restart purpclaw-api purpclaw-orchestrator` to pick up new env

**Past gotcha:** The wizard previously accepted doubled-paste API keys (250 chars instead of 125). Now it auto-halves them and warns. If you somehow still have a doubled key, the wizard will tell you.

### 6. Agent stuck / workflow stalled

**Symptom:** `purpclaw queue` shows a workflow `running` for hours. No progress events.

**Recovery (eventually automated by Karen):**
1. `purpclaw workflows` — get the workflow ID
2. `purpclaw run` won't dispatch a duplicate — reject the stuck one first
3. Future: `purpclaw escalate <wf-id>` will route to Karen for proper handling

---

## What "humming" looks like

After full recovery, you should see:

```
purpclaw doctor    → all required services OK, no orphans, no crash-loop history
purpclaw smoke     → 13 checks ok (1 optional acceptable)
purpclaw status    → orchestrator metrics + agent leaderboard populated
purpclaw           → drops into chat REPL, AI knows current stack state
```

---

## What "humming" does NOT require

- Voice / vision / autodream / reasoning / stt running — those are the **defined-but-dark** cluster. They're optional. Wake them with `purpclaw safe-start --dark` only when you actually need them.
- YOLO + Avatar orphans being killed — they're harmless if you don't need PM2 supervision for them.
- A clean git tree — that's a separate operator-discretion task.

---

## The Cardinal Rules

1. **Never `pm2 start` multiple services at once on Windows.** Always `purpclaw safe-start`.
2. **Never bypass the circuit breaker** (`--force`) unless you've already inspected the crash logs and know what you're fixing.
3. **Never run as Administrator unless you have to.** Every elevated process becomes harder to clean up later.
4. **Always smoke-test after recovery.** A green port count is not a green pipeline.

---

## Operator Emergency Kit

Paste into a sticky note:

```bash
# Diagnose
purpclaw doctor
purpclaw heal

# Recover
purpclaw heal --execute
purpclaw safe-start --core

# Verify
purpclaw smoke
purpclaw status

# Inspect specific service
npx pm2 logs purpclaw-<name> --lines 30 --nostream

# Reset crash-loop counter
npx pm2 reset purpclaw-<name>

# Last resort
npx pm2 kill && npx pm2 resurrect
```

---

🦞 The hammers walk in formation. When one trips, Karen files a ticket. When ten trip at once, this runbook is the rope ladder.

🦆 *"HONK. Recovery filed under ticket OPERATOR-RUNBOOK-1. Status: WONTFIX (nothing to fix — it's a runbook). HONK."*
