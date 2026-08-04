# AWAKEN — Specification
**Date:** 2026-06-29
**Classification:** `DESIGN_SPEC / AWAKEN_FEATURE`
**Status:** Runtime verified (tested 2026-06-29)

---

## What AWAKEN Is

The Big Red Button.

A pressable runtime contract that wakes the entire PURPCLAW civilisation, runs preflight truth checks, scans all layers, executes safe actions, logs evidence, and reports back with receipts.

It is not:
- A self-modifying AI
- A passive dashboard
- A settings panel

It is:
- A living system with ethics
- A governance loop made theatrical
- A haunted arcade machine with a compliance department

**Doctrine:** "The Big Red Button does not remove governance. It makes governance theatrical."

---

## The Four Modes

| Mode | Badge | Colour | Reads | Safe Writes | Research | Patch Docs | Companion Reactions |
|------|-------|--------|-------|-------------|----------|------------|---------------------|
| watch | 🟢 | green | ✓ | ✗ | ✗ | ✗ | minimal |
| work | 🟡 | yellow | ✓ | ✓ | ✗ | ✓ | full |
| monster | 🔴 | red | ✓ | ✓ | ✓ | ✓ | full |
| ritual | ⚫ | magenta | ✓ | ✓ | ✗ | ✗ | full + shaman |

**All modes:** No silent destructive writes, no code mutation without approval, no fake status.

---

## The Loop

```
1. Preflight truth check
   → 10 checks: files, Node.js, git, disk space, service health, training data, evidence dir, evolution loop, idle engine, awaken state
   → Refuses to fake green — shows UNKNOWN if it cannot prove truth

2. Start run id
   → Format: awaken-<timestamp>-<5-char-id>

3. Snapshot world state
   → Agent leaderboard, idle engine state, evolution log, evolve proposals, training data, workflows, awaken history

4. Scan layers (83 items)
   → docs drift, git untracked, provider health, service outages, evidence file count, smith-neo reliability, failed workflows

5. Badge classification
   → 🟢 CLEAN | 🟡 WARNING | 🔴 ERROR | ⚫ UNKNOWN | 🦆 SUSPICIOUS

6. Companion reactions
   → Mochi wakes, Chorus enters mode, Weatherman reports pressure, Duck watches (30% chance)

7. Execute safe actions
   → Write report.md, write evidence.json, queue evolve proposals (monster only)

8. Write timeline event (via events stream)

9. Report to operator
```

---

## File Outputs

```
agent_work/awaken/
  events.jsonl                    ← every event, append-only
  awaken-state.json               ← lightweight run markers
  evidence/
    <run_id>_findings.json       ← all scan findings
  runs/
    <run_id>/
      report.md                   ← human-readable report
      snapshot.json               ← world state snapshot
```

---

## CLI Commands

```bash
purpclaw awaken                  # run with default mode (work)
purpclaw awaken --mode watch     # read-only monitoring
purpclaw awaken --mode work     # safe writes (default)
purpclaw awaken --mode monster  # autonomous research + proposals
purpclaw awaken --mode ritual   # Shaman-led guided session
purpclaw awaken status          # show current state
purpclaw awaken stop            # abort active run
purpclaw awaken events          # show recent events
purpclaw awaken preflight       # preflight check only
```

---

## Permission Tiers

### Always blocked (regardless of mode)
- Delete secrets or credentials
- Patch credentials
- Apply code without operator approval
- Remove audit trail

### Risk levels
| Risk | Requires Approval | Example |
|------|-----------------|---------|
| safe | never | write_report, write_evidence |
| low | never | patch_docs, queue_update |
| medium | recommended | propose_evolve, auto_research |
| high | always | patch_code, apply_evolve, delete_files |

---

## Preflight Checks

| Check | Pass Condition |
|-------|---------------|
| workspace/SOUL.md | exists |
| workspace/AGENTS.md | exists |
| lib/awaken/ | exists |
| agent_work/ | exists |
| Node.js | running |
| git | clean (warns if dirty) |
| E: drive space | > 500 MB |
| service health (sample) | ≥1 port responding |
| training data | user-feedback present |
| awaken/evidence/ | writeable |
| self-evolution-loop | loads |
| idle-engine | state file present |
| awaken state | readable |

---

## Companion Reactions

| Trigger | Mochi | Chorus | Weatherman | Duck |
|---------|-------|--------|------------|------|
| Awaken starts (watch) | wakes | minimal hum | pressure report | 30% chance |
| Awaken starts (work) | wakes | work hum | pressure report | 30% chance |
| Awaken starts (monster) | stretches | monster hum | HIGH pressure | 30% chance |
| Errors found | angry | — | — | — |
| Clean run | happy | hum | NORMAL | tilts head |
| Monster findings | concerned | — | — | — |

---

## Architecture

```
lib/awaken/
  awaken-state.js          ← run markers (lightweight)
  awaken-permissions.js   ← mode permissions + risk tiers
  awaken-events.js         ← append-only event stream (standalone)
  awaken-preflight.js      ← 10 truth checks
  awaken-loop.js           ← core AWAKEN loop

lib/commands/
  awaken.js               ← CLI handler

bin/purpclaw.js          ← registered as 'awaken' command

agent_work/awaken/
  events.jsonl
  awaken-state.json
  evidence/
  runs/
```

---

## Key Design Decisions

1. **Eventbus optional:** `awaken-events.js` is fully standalone — does not require port 7782 eventbus. Falls back to local JSONL.

2. **HTTP errors non-fatal:** All HTTP probes (services, orchestrator) use explicit `req.on('error')` handlers. ECONNREFUSED cannot crash the loop.

3. **No fake green:** If preflight fails, the loop still runs but reports warnings honestly. AWAKEN REFUSES TO WAKE is shown only if core structure is missing.

4. **Git dirty is a warning, not a block:** AWAKEN proceeds even with uncommitted changes.

5. **Permission model:** Monster mode can propose and research but still cannot silently patch code. That line never moves.

6. **Run id format:** `awaken-<timestamp>-<5-char-id>` for traceability.

---

## Anti-Creep Rules

- AWAKEN does not profile users
- AWAKEN does not infer emotional states from scan data
- AWAKEN does not store credentials or secrets
- AWAKEN does not learn from silence — only from corrections and self-reflection
- AWAKEN does not modify Soul Memory or Timeline
- AWAKEN companion reactions are logged events, not autonomous personality changes

---

## UI Placement

| Surface | Implementation |
|---------|---------------|
| CLI | `purpclaw awaken` (done) |
| TUI | Awaken panel in MissionControl |
| Web UI | Big Red Button on home screen |
| Mobile | Hold-to-awaken with confirmation |

---

## Not Built Yet

- [ ] Monster mode: auto_research, donor candidate creation, evolve proposal generation
- [ ] Ritual mode: Shaman-led guided session hooks
- [ ] Web UI button (MissionControl integration)
- [ ] TUI awaken panel
- [ ] Mobile hold-to-awaken
- [ ] Interval/scheduled runs (watch mode every 5 min, work every 15 min)
- [ ] Approval queue for high-risk actions
- [ ] `purpclaw awaken --mode monster` → trigger evolve proposals for errors found

---

## Doctrine

> **If AWAKEN cannot see it, it is not part of the living stack.**

This is the test of the whole stack. If a system cannot participate in AWAKEN, it is either not wired, not canonical, not safe, or not real.
