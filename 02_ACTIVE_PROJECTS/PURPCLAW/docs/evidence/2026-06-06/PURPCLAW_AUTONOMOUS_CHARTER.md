# PURPCLAW — Autonomous Agent Stack Charter

**Date:** 2026-05-23
**Status:** Active design target
**One-line truth:** PURPCLAW is not a CLI tool with agents. It is a resident operational intelligence with a CLI front door.

---

## The honest baseline

Claude Code and Codex are **single-turn assistants**. They exist for the duration of one conversation, observe nothing on their own, initiate nothing on their own, remember nothing between sessions, and cannot repair themselves. They are tools shaped like agents.

PURPCLAW gets to be different because it owns **live services that don't go away**. That is the only architectural advantage that matters, and it has to be exploited end-to-end.

---

## The five-layer design

```
┌─────────────────────────────────────────────────────────┐
│  1. PERCEPTION                          always running   │
│     screen-look scheduler · workspace-awareness          │
│     service-health monitor · user-presence detector      │
│     git/calendar/mail watchers                           │
└──────────────────────────┬──────────────────────────────┘
                           │ writes observations
┌──────────────────────────▼──────────────────────────────┐
│  2. KNOWLEDGE POOL :7880                open, queryable  │
│     skills · agents · routing matrix                     │
│     memories · preferences · failures                    │
│     workspace state · goals · jobs · sessions            │
│     service health · metrics · governance ledger         │
└──────────────────────────▲──────────────────────────────┘
                           │ reads everything
┌──────────────────────────▼──────────────────────────────┐
│  3. REASONING                          proactive brain   │
│     goal-generator · opportunity-scanner                 │
│     self-diagnostics · reflection-engine (dream)         │
│     decides: what should the stack do RIGHT NOW          │
└──────────────────────────┬──────────────────────────────┘
                           │ creates jobs
┌──────────────────────────▼──────────────────────────────┐
│  4. EXECUTION                                  doing      │
│     orchestrator · agent_tower                           │
│     job_contract · verification gates                    │
└──────────────────────────┬──────────────────────────────┘
                           │ verifies + writes back to pool
┌──────────────────────────▼──────────────────────────────┐
│  5. GOVERNANCE                              the leash    │
│     approval gates · risk classification                 │
│     rollback · audit log · policy                        │
└─────────────────────────────────────────────────────────┘
```

Every layer reads from and writes to the **knowledge pool**. The pool is the spine. Without it, the layers are just isolated services.

---

## What "autonomous" actually means

Not: "decides everything by itself with no boundaries"
Yes: **"keeps working when the user is not looking"**

Concrete behaviors that count as autonomous:

| Behavior | Without autonomy | With autonomy |
|---|---|---|
| **Service crashed at 3am** | User finds it broken at 9am | Self-diagnostics detected within 60s, restarted, logged, ready to explain |
| **YOLO failing intermittently** | User notices after 4 missed jobs | Pattern detected at failure #3, diagnostic job spawned, fix proposed, approval requested |
| **Memory matrix 90% full** | Throws errors | Reflection engine consolidates duplicates, prunes stale, reports delta |
| **User had been debugging a deploy for an hour** | PURPCLAW doesn't know | Workspace-awareness saw it, related skill loaded into pool, offered to help on next interaction |
| **Pool indexes stale** | Searches return wrong results | Indexer re-runs after every git commit + on file-watcher events |
| **User asks "what's left on this branch"** | Cold start, has to research | Knowledge pool already has the answer indexed; sub-100ms reply |
| **Idle time** | Sits doing nothing | Opportunity-scanner identifies low-risk maintenance, queues with governance gate |

Autonomous ≠ untethered. Every action that touches real state still goes through governance. The difference is **who initiates**.

---

## Layer-by-layer status & build order

### Layer 1 — Perception (mostly exists, needs a scheduler)

**Have:**
- `lib/screen-look.js` — multi-monitor screen capture + LLM vision
- `lib/workspace-awareness.js` — monitor role memory
- `vision_monitor.js` (PM2 service, optional) — continuous vision
- `purpclaw look` CLI verb

**Missing:**
- Scheduled tick — nothing fires perception on a timer
- File-system watcher (chokidar) on the active project dirs
- Git event listener (post-commit hooks → push to pool)
- User presence / idle detector (Win32: GetLastInputInfo)

**Build:**
- `lib/perception-scheduler.js` — interval tick, configurable cadence, writes observations to pool
- Wire chokidar watcher on `agent_work/` and the project dir under focus
- New PM2 service: `purpclaw-perception`

---

### Layer 2 — Knowledge Pool (does not exist yet, P0)

**Have:**
- `memory_matrix_v2.py` (port 7880, separate Python service, not used by Node side)
- 200+ `skills/*/SKILL.md` files sitting on disk
- `agents/*.md` Codex-style specialist files
- `agent_routing_matrix.js` (Node, already used by decomposer)
- Scattered JSON state files in `agent_work/`

**Missing:**
- Single queryable surface for all of the above
- Anyone-can-write contribution endpoints
- In-memory index for fast skill search
- SQLite for append-only failures / preferences / sessions

**Build (first slice ≈ 250 LOC):**
- `pool_service.js` — Express server (own PM2 service, port TBD — propose **7881** to keep `memory_matrix_v2` separate or **replace it** by absorbing its role; recommend replacement once parity proven)
- Indexes built on boot from `skills/`, `agents/`, `agent_routing_matrix.js`
- Read endpoints: `/pool/skills/search`, `/pool/skills/<name>`, `/pool/memory/recall`, `/pool/agents/<name>`, `/pool/routing/for-task`, `/pool/failures/similar`, `/pool/workspace/current`
- Write endpoints: `/pool/memory/append`, `/pool/failures/record`, `/pool/preferences/set`
- `lib/pool-client.js` (Node) + `pool_client.py` (Python) — client libraries every layer uses

This is the single highest-value piece. It unlocks 200 dead skills, gives every agent a brain to query, and makes the next three layers possible.

---

### Layer 3 — Reasoning (mostly missing, the core of "proactive")

**Have:**
- `lib/proactive-maintenance.js` — proposes maintenance jobs but nothing schedules it
- `autonomous_diagnostics.py` — exists as optional service, not wired in

**Missing:**
- Tick loop that runs the reasoning every N seconds (default 30s)
- Goal store (different from job queue — long-lived objectives)
- Opportunity-scanner (when idle, what's worth doing?)
- Reflection / dream engine (consolidate memory, learn from failures)

**Build:**
- `lib/reasoning-loop.js` — interval-driven, queries pool, decides:
  - Are any services unhealthy? → spawn diagnostic
  - Are any approvals pending too long? → ping user
  - Has memory grown past threshold? → consolidate
  - Has the user touched a project we have skills for? → preload knowledge
  - Is the workspace idle? → run opportunity scan
- `agent_work/goals.jsonl` — append-only goal store
- New PM2 service: `purpclaw-reasoning`

All proposed actions still route through governance. Reasoning **proposes**; governance **approves**.

---

### Layer 4 — Execution (already solid)

**Have:**
- `orchestrator.js` (workflow engine, port 7784)
- `agent_tower.js` (spawning, port 7790)
- `lib/job-contract.js` (typed jobs + gates)
- `task_decomposer.js` (work breakdown)

**Missing (small gaps):**
- Spawned agents don't have a `POOL_URL` env var yet → can't query pool
- Agent prompt templates don't include "query the pool when uncertain" instruction
- Verification gate results don't get written back to the pool

**Build:**
- Add 5 lines to spawn code: `POOL_URL=http://localhost:7881` into child env
- Update prompt template: one paragraph about pool usage
- On job complete: orchestrator POSTs result + learnings to pool

---

### Layer 5 — Governance (already strong)

**Have:**
- `lib/governance.js` — risk classification, approval ledger, policy enforcement
- `purpclaw_policy.json` — configurable
- CLI: `purpclaw approve`, `purpclaw policies`

**Missing:**
- Prefix-allowlist (Codex-style `prefix_rule`) — eliminate approval-fatigue for repeated safe commands
- Rollback engine — currently just a placeholder
- Time-bounded auto-approvals (e.g. "approve all low-risk maintenance for the next hour")

**Build (after pool exists):**
- Extend governance.js with prefix-allowlist read from `rules/default.rules`
- `lib/rollback.js` — snapshot manifest per approved job, restore on failure (real, not theatre)
- `purpclaw approve --window=1h --risk=low` for batch approvals

---

## What runs at boot

```
1. PM2 daemon starts (on Windows boot or user login via pm2 startup)
2. PM2 starts the harness profile:
   - eventbus, state, api, tower, orchestrator, gatekeeper, metrics, nextjs
   - PLUS: pool, perception, reasoning
3. Each service registers with the pool
4. Reasoning loop ticks every 30s, perception every 5s, indexer on file events
5. CLI is now a *client* to the running stack — not the thing that boots it
```

`purpclaw start` becomes "ensure the stack is running" — idempotent. If it's already up, no-op. If anything is missing, bring it up.

For "its own PC": add a Windows scheduled task or `pm2 startup` to auto-launch on boot. The stack lives on the box; the user can come and go.

---

## How the user experience changes

**Before (current PURPCLAW + Claude Code + Codex):**
> User opens terminal → types command → tool runs once → tool dies → user closes terminal → nothing persists.

**After (PURPCLAW autonomous):**
> User opens browser → Mission Control is already running → it shows: "while you were away, 3 services restarted, memory consolidated, 1 approval pending, your last project's CI went green". User clicks "approve" → action executes → user closes browser → stack keeps watching.

The CLI is for power use and debugging. The default interface is **the stack noticing things and surfacing them**.

---

## Concrete build order (each piece independently shippable)

1. **Pool service (skills index only)** — 1 day. Proves the open-pool pattern.
2. **Wire spawned agents to use the pool** — 2 hours. 200 dead skills become usable mid-task.
3. **Extend pool to memories + failures + routing** — 1 day. Self-improving runbook lives here.
4. **Perception scheduler** — half day. Workspace state continuously refreshed.
5. **Reasoning loop (minimal)** — 1 day. Service-health watcher + memory-consolidator only at first.
6. **PM2 startup script** — 1 hour. Boots with the OS.
7. **Mission Control "while you were away" panel** — 1 day. Surfaces what the reasoning layer did.
8. **Reasoning loop (opportunity scanner)** — 1 day. Idle-productive behavior.
9. **Prefix-allowlist for governance** — half day. Kills approval-fatigue.
10. **Rollback engine** — 1-2 days. Real recovery, not theatre.

Total: ~10 working days to go from "CLI that boots a swarm" → "resident operational intelligence with a CLI front door".

---

## What this is not

- **Not Skynet.** Every state-changing action still passes governance.
- **Not generic AGI.** Scoped to: developer workstation operations, project assistance, self-maintenance.
- **Not magic.** The model behind each agent is still an LLM with limits. The system architecture is what makes it more useful than a one-shot chat.

---

## The single sentence that justifies all this

> A harness that needs the human to babysit is a chatbot in a trench coat. A harness that observes, reasons, acts, and reports while the human is asleep is infrastructure.

PURPCLAW gets to be the second thing.
