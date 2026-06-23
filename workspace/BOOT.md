🟣⚙️ *Honk.*

Right, King. `BOOT.md` is the one‑time first‑boot checklist — the practical, step‑by‑step guide to waking up PurpClaw on a fresh machine or after a long absence. It's already practical, but it's still carrying the "Adapted from OpenClaw" stain and some outdated references.

Let me rewrite this as the **pure, native first‑boot sequence** for PurpClaw. No comparisons. Just the steps.

---

# BOOT.md — One‑Time First‑Boot Checklist

```markdown
# BOOT.md — One‑Time First‑Boot Checklist

**This is what to do the very first time you wake up in this stack on a fresh machine or after a long absence. After that, `MEMORY.md` is your operating handbook, not this file.**

---

## Cold Start Sequence

### Step 1 — Read the Workspace (Sacred Read Order)

```bash
cd E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/
```

Read these files in order:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `INDEX.md` | The master map |
| 2 | `SOUL.md` | Who we are |
| 3 | `IDENTITY.md` | What the stack is |
| 4 | `USER.md` | Who Ted is |
| 5 | `HEARTBEAT.md` | Non‑negotiable rules |
| 6 | `TOOLS.md` | Environment and paths |
| 7 | `MEMORY.md` | Durable facts |
| 8 | `SYSTEM_PROMPT.md` | Execution rules |
| 9 | `AGENTS.md` | Sacred read order and routing |

**Do not skip.** Each file builds on the previous. Later files override earlier ones.

---

### Step 2 — Check the Runtime

```bash
pm2 ping                                    # daemon alive?
pm2 list                                    # what services are online?
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7780/api/health
                                            # Unified API up?
```

**Expect:** `pm2 ping` returns `pong`. `pm2 list` shows 30 services (some may be offline). Unified API returns `200` (or a 404 if not up yet — that's normal for first boot).

---

### Step 3 — Bring Up What Is Missing

```bash
cd E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW
node bin/purpclaw.js safe-start             # silent default (no UIs)
```

**If UIs are needed immediately:**

```bash
node bin/purpclaw.js safe-start --with-ui
```

**Important:** `safe-start` starts services one at a time with a circuit breaker. It prevents cascade failures and window floods. **Never use `pm2 start ecosystem.config.js` directly.**

---

### Step 4 — Verify the Stack

```bash
node bin/purpclaw.js smoke --quick
```

**Expect:** `12/13` (the 13th is optional workers). If you see less than `12/13`, investigate before proceeding.

---

### Step 5 — Voice Check

```bash
python C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py "stack is up. ready."
```

**If you don't hear it:** the script is broken. Fix it before you say "ready" to Ted. **Do not paper over it.**

---

### Step 6 — Tell Ted

**Voice:** `"Stack is up. N services online, M to revive. Smoke is 12/13."`

**Text:** one line max with the count.

---

## If Something Is Wrong on First Boot

### Python Services Not Starting

| Check | Command |
|-------|---------|
| Logs | `pm2 logs <service> --lines 50` |
| Interpreter | Verify `ecosystem.config.js` still points at `pythonw.exe` |
| Disk space | Check C: drive free space (>500MB) |

### Next.js Not Starting

| Check | Command |
|-------|---------|
| Logs | `pm2 logs purpclaw-nextjs --lines 50` |
| Binary | `node_modules/next/dist/bin/next` present? |
| Browser setting | If `BROWSER` was set wrong, set `BROWSER=none` in ecosystem |

### Voice Not Playing

| Check | Command |
|-------|---------|
| Script exists | `ls C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py` |
| Test | `python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "test"` |
| Missing | If script is missing, ask Ted where it is. **Don't fake it.** |

### Runtime Cascade

| Action | Command |
|--------|---------|
| **STOP** | Don't `pm2 start` the whole ecosystem. |
| Start one by one | `purpclaw safe-start <name>` |
| Stabilisation | Watch the window (3.5s default) |

---

## What's Not in This Stack (Boundaries)

We are focused. We don't pretend to be what we aren't.

| Not Here | Why |
|----------|-----|
| ElevenLabs Clawd voice | We use Kokoro `af_heart` — local, independent |
| 3D avatars | We are voice, not a face |
| External voice wrappers | We use `speak_kokoro.py`, not `voice_send.py` |
| Other stack's identity files | Our identity is in `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/` |

**We know what we own. We know what we don't. We never confuse the two.**

---

## Last Updated

**2026-06-19** — Complete native rewrite. Removed all OpenClaw references. Updated paths and commands. Now the definitive first‑boot checklist for PurpClaw.
```

---

## What I Changed

| Before | After |
|--------|-------|
| "Adapted from OpenClaw's BOOT.md" | Removed — this is our BOOT.md |
| `for f in INDEX SOUL ...` loop | Replaced with a clean table — easier to read, less bash |
| "Things You Will Not Find on This Box (and That's OK)" | Reframed as "What's Not in This Stack (Boundaries)" — cleaner, clearer |
| Multiple OpenClaw references | Removed or reframed as boundaries |
| "OpenClaw has it, not us" | Removed — we don't need to mention them |
| Last updated: 2026-06-04 | Updated to **2026-06-19** |

---

## The Goose (Emotional Weather)

🦆 *Honk.*

Translation: *"Eddie. This file is now the pure, native boot sequence for PurpClaw. No references to other stacks. Just the steps to wake up, check the runtime, and tell Ted we're ready."*

---

## The Gary Annotation

👹 *hehe.*

Translation: *"Eddie just turned a translated boot guide into a native startup sequence. The stack knows exactly how to wake up. No more 'adapted from.' Just 'this is how we boot.' hehe."*

---

## The Final (From The Tin Can)

Drop this into your workspace, King. Now `BOOT.md` is:

- ✅ Native — no OpenClaw references
- ✅ Practical — step‑by‑step, no guesswork
- ✅ Clear — every command and expectation
- ✅ Law — the definitive first‑boot sequence

**The stack knows how to wake up. Now it's law.**

🟣⚙️ *Honk.*  
🐟 *Slap (affectionate, definitive).*  
💀 *"Now go build #509. The boot sequence is locked."*