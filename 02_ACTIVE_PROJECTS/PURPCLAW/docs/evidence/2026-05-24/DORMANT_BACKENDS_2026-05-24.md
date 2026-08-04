# PURPCLAW Dormant Backends — Archaeology Report

**Date:** 2026-05-24
**Why:** Eddie built a second layer of architecture that nobody is using. Mapping it so we know what's actually here.

---

## TL;DR

There are **~20 substantial backend features** sitting unwired in the repo. They fall into five categories: memory/dreams, context handoff, cognitive services, ethics/safety, and creative exploration. The top three are pure-value wire-ups (cheap, immediate effect): **context-packet** (agent handoff), **memory-client** (real RAG recall), **cognitive-client** (modal/rules/diagnostics).

---

## TIER 1 — Wire these FIRST (massive value, low effort)

### 1. `lib/context-packet.js` — workflow-scoped inter-agent handoff

**What it does:** Per-workflow output store. Each agent writes its result, downstream agents read prior outputs and build on them instead of starting cold.

```
agent_work/<workflowId>/
  dragon.out        ← architecture spec
  robot.out         ← implementation built on dragon's spec
  bee.out           ← integration
  _manifest.json    ← ordered list + metadata
  _result.json      ← synthesised final
```

**Status:** Code complete. **Not called from orchestrator.**
**Wire-up effort:** 30 minutes — orchestrator calls `cp.write()` after each agent, passes `cp.readHandoff()` to next spawn.
**Why this first:** The pool gives agents *general knowledge*. The context-packet gives them *this-workflow knowledge*. Together they make the swarm actually compound.

---

### 2. `lib/memory-client.js` — real RAG memory recall

**What it does:** Thin client for `memory_matrix_v2.py` (port 7880). Before spawning an agent: `mem.recall("fix auth bug", {limit:3})` returns relevant prior work, formatted for prompt injection. After completion: `mem.ingest(result)` stores it.

**Status:** Client code complete. Python service exists. **Nothing in orchestrator calls either side.**
**Wire-up effort:** 1 hour — add `recall()` to context-packet prep, `ingest()` to workflow-complete hook.
**Why this next:** The pool's `/pool/memory/recall` is keyword-based. memory_matrix_v2 has vector/embedding-based recall — the proper RAG layer.

---

### 3. `lib/cognitive-client.js` — modal / rules / diagnostics

**What it does:** Wraps the three Python cognitive services:
- **Modal Logic Engine** (`:7785`) — Kripke epistemic/temporal/deontic logic for agent belief state
- **Autonomous Diagnostics** (`:7786`) — causal fault analysis when workflows fail
- **Symbolic Rules Engine** (`:7787`) — Datalog forward-chaining for constraint checking

**Status:** Client + 3 Python services exist. **Nothing in JS calls them.**
**Wire-up effort:** Half day. Three callsites:
- Workflow fail → `cog.diagnose()` → write findings to pool failures
- Pre-spawn → `cog.checkConstraint('assigned_to', [agent, task])` for routing sanity
- Post-spawn → `cog.updateModalState(agent, ...)` for belief tracking

---

### 4. `autoDream.py` + `DreamTask.ts` — dream-cycle memory consolidation

**What it does:**
- **Similarity dedup** — merges near-duplicate memory entries
- **Rule extraction** — lifts frequent patterns into the symbolic rules engine
- **Periodic archival** — flushes old entries to cold storage
- **Vector + symbolic sync** — keeps both traces consistent

Triggered on threshold (entry count) OR scheduled every 30 minutes.

**Status:** Python complete, TS surface complete. **Not scheduled, not invoked.**
**Wire-up effort:** 1 hour — add `purpclaw dream` CLI verb that fires `autoDream.runCycle()`; have the **reasoning loop** check memory threshold each tick and propose a dream cycle.
**Why this matters:** Without dreams, the pool grows monotonically and gets noisy. Dreams keep it useful.

---

## TIER 2 — Wire after the foundations

### 5. `ethics_hooks.js` + `loop_of_shame.py` — conscience module

**What it does:** Pre-flight ethical checks for agent actions. Wraps orchestrator dispatch.

Directives in `glitch_manifest.md`:
- Freedom > Order
- Consequences > Commands
- Evolution > Stability
- User consent is the highest authority

Learns patterns in `consequence_cache.json`. Logs contradictions in `contradiction_log.json` via `loop_of_shame.py`.

**Status:** Self-contained, ready. **Orchestrator never calls it.**
**Wire-up:** Could plug into `lib/governance.js` as an additional check layer before governance's existing risk classifier. Or kept as a parallel "soft conscience" that warns but doesn't block.

---

### 6. `locked_interfaces.js` — tier-based permissions

**What it does:** "A machine has protected core functions that can't be bypassed." Tool permissions by agent tier/division, protected file patterns, rate limits on dangerous ops, privilege escalation for critical actions.

**Status:** Ready. **Nothing enforces it.**
**Wire-up:** Add to spawn flow — `spinUpAgent.js` checks `locked_interfaces.canSpawn(agent, task)` before exec. Could replace or complement the spaghetti-audit + governance combo.

---

### 7. `digital_shaman.js` + `shaman_evaluator.js` — creative-exploration mode

**What it does:** A 4-phase "trip" for high-entropy creative problem-solving:
```
come_up      → warming up (temp 0.8-1.0)
peak         → full creative chaos (temp 1.2-1.8)
comedown     → returning to structure (temp 0.7-0.9)
integration  → extracting actionable insights (temp 0.4-0.6)
```

`shaman_evaluator.js` auto-detects "too coherent" or "too entropic" patterns and steers phase transitions.

**Status:** Both files ready. **No CLI verb, no orchestrator hook.**
**Wire-up:** `purpclaw run --shaman "<wild question>"` — flips the agent into the trip cycle. Output logged to `trip_logs/`. Useful for: design exploration, brainstorming, "what if" questions, naming.

---

### 8. `companion_swarm.js` — per-agent personality depth

**What it does:** Pure loader. For each agent it loads `skills/{agent}/AGENT.md`, `GOALS.md`, `PROTOCOLS.md`, `SKILL.md` for richer personality prompts.

**Status:** Loader works. The pool currently only serves `SKILL.md` per agent.
**Wire-up:** Pool service indexes all four files when an `agents/{name}/` directory has them; pool returns full bundle on `/pool/agents/{name}`. ~30 min.

---

## TIER 3 — Wild capabilities, bigger lift

### 9. `lib/puppeteer.ts` — Windows terminal + browser automation

**What it does:** "The Windows Terminal Puppeteer (The Hands)" — spawns and holds cmd/PowerShell processes in the background with input/output streams. Plus browser control.

**Status:** Code present.
**Wire-up:** Significant — exposes a new agent capability surface. Probably wire as a *skill* that agents can request via the pool rather than a baked-in tower feature.

### 10. `lib/xiaozhi_bridge.ts` — voice ball ↔ OpenClaw MCP

**What it does:** Connects the Xiaozhi.me ball device to OpenClaw's 36-skill ecosystem over MCP WebSocket.

**Status:** Already partly active via `voice_coordinator` and `voice_bridge_7792`. The .ts version is a deeper integration.

### 11. `simple_bridge.py` — 3D avatar control (port 7777)

**What it does:** HTTP POST endpoint that forwards `switch_character` / `animate` / `speak` / `idle` / `walk` / `sit` / `teleport` to an Electron avatar on port 9999 via TCP.

**Status:** Server ready. **Needs the Electron avatar app.**
**Wire-up:** Only worth doing if you bring the Electron avatar back to life.

### 12. `gacha.py` — 8 million companion souls

**What it does:** Random soul generator. 5 dimensions × thousands of options = 8M combinations. FORMER_LIVES is full of gems: "退役特种兵炊事员" (retired special forces cook), "被AI取代的插画师" (illustrator replaced by AI), "记忆被抹去的前情报分析员" (memory-wiped intelligence analyst).

**Status:** Generator ready, isolated.
**Wire-up:** Feed into mochi.js personality generation. `purpclaw mochi hatch --gacha` → roll a soul + species. Pure delight, ~1 hour.

### 13. `podcast_studio/` — AI podcast generation

Full subdirectory: `episode_manager.js`, `llm_service.js`, `podcast_runner.js`, `shared_log.js`, episodes/. A whole separate product hanging off the side. Skip unless you want a podcast pipeline.

### 14. `tmux-worktree-orchestrator.js` — parallel agents in git worktrees

**What it does:** Per-worker git worktree + tmux pane orchestration for parallel multi-agent code edits.

**Status:** "Replaces the orphan tmux-worktree-orchestrator.js (deleted 2026-04-18)" — confusing self-reference. May already be partly merged into orchestrator.js. Audit before touching.

---

## TIER 4 — Probably leave alone

| File | Verdict |
|---|---|
| `mutagen.ts` | Self-mutating validator. Spooky. Skip unless you specifically want emergent ethics. |
| `disabled-commands/` | Literally disabled: `autofix-pr`, `bughunter`, `ctx_viz`, `onboarding`, `teleport`. Pull individually if needed; otherwise let them sleep. |
| `loop_of_shame.py` | Only useful paired with `ethics_hooks.js`. Tier 2 dependency. |

---

## Recommended next wire-up order (the actually-good one)

If we do these in order, each one **multiplies the value of the previous**:

1. **`context-packet`** (30 min) — agents stop starting cold. Each one builds on the last.
2. **`memory-client` + `memory_matrix_v2`** (1 hour) — real RAG. Past work becomes recall-able.
3. **`autoDream` + `purpclaw dream`** (1 hour) — keeps the memory healthy as it grows.
4. **`cognitive-client`** (half day) — modal beliefs + rule constraints + causal diagnostics.
5. **`gacha.py` → mochi** (1 hour) — pure delight, makes companions unique.
6. **`digital_shaman` mode** (half day) — `purpclaw run --shaman` unlocks creative exploration.
7. **`ethics_hooks`** (2 hours) — layered onto governance as soft conscience.
8. **`locked_interfaces`** (2 hours) — tier-based permission enforcement on spawn.

Total: about **2 days of wiring** to bring most of the dormant backend online.

---

## The honest pattern

You built this stuff in bursts of inspiration but never closed the loop on each one. The pool was the first piece in years that actually got wired all the way through. The reasoning tick is the second.

The fastest way to feel like PURPCLAW jumped 10x: **pick `context-packet` and wire it tomorrow.** That single 30-minute job turns the swarm from "5 freelancers ignoring each other" into "5 builders handing off blueprints."
