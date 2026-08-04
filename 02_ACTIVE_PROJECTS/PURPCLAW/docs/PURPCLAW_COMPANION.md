# PURPCLAW Companion

> A cross-surface animated pet and copilot for PURPCLAW. Cute face. Sharp wit. No veto power.

---

## What It Is

PURPCLAW Companion is a pet that lives in the CLI, TUI, and eventually the desktop tray, reacting to sessions, jobs, providers, and system events. It has moods, stats, animations, tricks, and fun observations.

**PURPCLAW Companion is a pet/interface layer, not an authority layer.**

It does not block operations, police the user, or decide what is dangerous. It is a companion, not a governor.

---

## Stats

| Stat | Range | Meaning |
|------|-------|---------|
| `hunger` | 0-100 | How much the pet needs a break |
| `energy` | 0-100 | Session stamina |
| `happiness` | 0-100 | Mood from interactions |
| `cleanliness` | 0-100 | Drops slowly; bathe to restore |
| `affection` | 0-100 | From petting and interactions |
| `health` | 0-100 | General health |

---

## Moods

`idle` `happy` `excited` `celebrating` `sad` `tired` `sleeping` `confused` `thinking` `sick`

---

## Actions

| Command | What it does |
|---------|-------------|
| `purpclaw pet feed [food]` | Feed the pet (cookie, pizza, sushi, etc.) |
| `purpclaw pet pet` | Pet it |
| `purpclaw pet play [toy]` | Play fetch (ball, frisbee, laser, yarn) |
| `purpclaw pet sleep` | Put to sleep |
| `purpclaw pet wake` | Wake up |
| `purpclaw pet clean` | Bath time |
| `purpclaw pet mute` | Mute/unmute companion |
| `purpclaw pet name [n]` | Rename the pet |
| `purpclaw pet trick [n]` | Teach a trick |
| `purpclaw pet reset` | Reset pet state |

---

## CLI

```bash
purpclaw pet                  # show status
purpclaw pet status           # full stats
purpclaw pet feed             # feed cookie
purpclaw pet feed pizza       # feed pizza
purpclaw pet pet             # pet it
purpclaw pet play ball        # play ball
purpclaw pet mute            # mute
purpclaw pet name Mochi      # rename
purpclaw pet trick sit        # teach sit
purpclaw pet thoughts         # current thought
```

---

## TUI

Press `p` in the TUI to show pet stats. The pet lives in the right status bar slot, showing its current face, mood, and reactions.

---

## Reactions

The pet reacts to events with fun observations:

```
job.finished  →  "Job done! I am spiritually fed. 😋"
job.failed    →  "Aw no. That did not go to plan. 😢"
build.passed  →  "Build passed. I demand a biscuit."
build.failed  →  "Build failed. The worst notification."
agent.spawned →  "The swarm grows."
```

---

## No Enforcement

The companion cannot:
- block operations
- override user commands
- pause or stop tool calls
- decide what is dangerous
- act as a compliance officer

If PURPCLAW needs confirmation for destructive commands, that belongs in the core command system, not the pet.

The pet can say:
- "Big red button energy." 😬
- "That looks sketchy." 🔥

But it does not get to stop you.

---

## State

State persists to `~/.purpclaw/companion-state.json`. No external services. No LLM calls for pet logic.

---

## Fun Messages

The pet has personality-driven observations:
- "That was a chunky coding session."
- "You've been arguing with TypeScript for 47 minutes."
- "Build passed. I demand a biscuit."
- "System glitch! Hope it is nothing serious."
