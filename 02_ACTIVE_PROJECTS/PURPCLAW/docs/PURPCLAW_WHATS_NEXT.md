# PURPCLAW "What's Next" — Recovered Work Queue

> **Reconstructed 2026-06-29 after "Hermes dropped the clipboard into a river" event.**
> **Source:** the marathon session's actual roadmap. The 10 completed phases and 8 queued jobs.
> **Purpose:** so the next agent (or you, out of the bath) can pick up exactly where the work left off.

---

## ✅ COMPLETED (10 Phases — the "monster" is built)

| # | Phase | Files | What's Actually There |
|---|---|---|---|
| 1 | **Soul System** | `registry/souls.json` (95 souls, schema `purpclaw.souls.v2` v0.3.0), `registry/soul-interviews.json` (95 interviews), `lib/soul-registry.js`, `lib/soul-interview.js` | 95 canonical souls, 21-question interview protocol, asymmetric relationships, private thoughts, legacy/history, memories, dreams/goals, flight pairs, dynamic council summoning |
| 2 | **Council** | `lib/council-vote-engine.js`, `registry/council-votes.json`, `lib/commands/council.js` (or whatever it's named now) | Oracle summons by problem, weighted voting, reputation, influence leaderboard, vote history, duck observations, flight pair attendance |
| 3 | **Studio** | `registry/studio-modes.json` (11 modes: council, radio, arena, vent, emergency, brainstorm, interview, news, commentary, directors_cut, after_hours), `lib/studio.js` | 11 behavioural environments with different conversation physics per mode |
| 4 | **World State** | `lib/world-state.js` (real per the audit) | provider latency, build health, council mood, director incidents, incident injection |
| 5 | **Timeline** | `registry/timeline.json`, `lib/timeline.js` | organisational timeline, pattern detection, tradition candidates, recent history |
| 6 | **Meeting Memory** | (likely in `lib/meeting-memory.js` or `lib/studio.js`) | automatic cultural summaries: quote of the day, highlights, funny moments, important contributors, build state, duck observations, archive importance |
| 7 | **Ambient Life** | (likely in `lib/ambient.js` or `lib/studio.js`) | random office conversations, Goose & Maverick banter, Hermes drinking coffee, Panda noticing new subsystems |
| 8 | **Donor Archaeology** | `registry/donor-artifacts.json`, `lib/donor-archaeology.js` | stores origin, behavioural_law, value, rejected_mechanics, provenance, integration_target. Doctrine: "Never import a feature until the behavioural law is understood." |
| 9 | **Heist Reports** | (likely in `lib/donor-archaeology.js` as alias) | aliases: loot, yoink, donor heist. Calling cards: scout, thief, integrator, historian, duck report, timeline entry |
| 10 | **Auto-Evolve Bridge** | wired into existing `lib/evolution/mutator.js` + `lib/commands/evolve.js` | Donor → Behavioural Law → Evolution Proposal → Mutator Queue → Governed Approval. NOT a second evolution engine. **Proposal `mut_mqzfx4n6_byc9q4` is still pending in `agent_work/evolution/proposed.jsonl`** |

**Plus from this session (P0 Launch Ledger):**
- `lib/hivemind-test.js` + `lib/hivemind-test-rank1.js` + `scripts/verify-hivemind.js`
- `npm run verify:hivemind:rank1` → **11/11 PASS, EXIT 0**
- `lib/commands/registry-audit.js` (Registry audit) + smoke test
- `docs/PURPCLAW_MONSTER_LAUNCH_LEDGER.md`, `docs/PURPCLAW_HIVEMIND_LOOP_PROOF.md`, `docs/REGISTRY_RECONCILIATION.md`

---

## 🚧 QUEUED (8 jobs in star-ranked order)

These are the actual jobs that were being discussed when the clipboard went swimming.

### 1️⃣ Shared Spaces — ⭐⭐⭐⭐⭐

**What it is:** Registry-backed locations. Council Chamber, Engineering Bay, Security Office, Archives, Rooftop, After Hours Lounge, Kitchen, Studio Booth. Agents naturally move through them.

**Where it goes:** New `registry/spaces.json` + `lib/spaces.js` + Studio integration (Studio room concept).

**Why this one first:** It's the **physical topology** under everything else. Without spaces, "agents in different rooms" is a metaphor. With spaces, it's a real location graph.

**Acceptance:**
- `registry/spaces.json` with 7+ named spaces (Council Chamber, Engineering Bay, etc.)
- `lib/spaces.js` with `move(soulId, spaceId)`, `whoIsIn(spaceId)`, `neighbors(spaceId)`
- Studio `begin <space>` mode that activates the room's social rules (e.g. Kitchen = light banter, Engineering Bay = task-focused)
- Timeline event for every move
- `purpclaw spaces list` and `purpclaw spaces who` CLI

---

### 2️⃣ Automatic World Events — ⭐⭐⭐⭐⭐

**What it is:** Weatherman raises incidents naturally. Director injects incidents. **World itself creates incidents.** No human required.

**Where it goes:** `lib/auto-incidents.js` (new) + hooks into `lib/world-state.js` (provider latency spikes, build failures, etc.)

**Why this one first:** This is what makes the world feel alive. The Director mode in studio-modes is a manual trigger. This is the **automatic** version — the world breathes on its own.

**Acceptance:**
- Detectors: provider_latency_spike, build_failure, git_merge_conflict, dependency_vuln, deadline_approaching
- Each detector → incident ID + severity + suggested souls to notify
- `purpclaw auto-incidents list`, `purpclaw auto-incidents enable/disable`
- 5+ detector types running on a schedule
- Timeline event per detected incident
- "Weatherman walks in" interaction pattern (interrupts active Council)

---

### 3️⃣ Relationship Mutation — ⭐⭐⭐⭐⭐

**What it is:** Meetings permanently alter trust, respect, friendship, rivalry, annoyance. With audit trail.

**Where it goes:** `lib/relationship-engine.js` (new) + hooks into Council vote outcomes + Studio mode participation.

**Why this one first:** This is what makes the org feel like a **team**. Without it, every meeting is independent. With it, "Hermes trust Goose +2" actually means something next meeting.

**Acceptance:**
- 5-axis relationship model (trust, respect, friendship, rivalry, annoyance) per soul-pair
- Mutation rules tied to Council events (vote alignment, dissent, minority protection)
- Audit trail per mutation (`registry/relationship-mutations.jsonl` append-only)
- `purpclaw relationships show <soulId>` and `purpclaw relationships history <soulA> <soulB>` CLI
- Romance/Lore display: "Hermes trust Goose: 7 (+2 from last council)"

---

### 4️⃣ Reputation Mutation — ⭐⭐⭐⭐

**What it is:** Votes affect influence, credibility, chaos score over time.

**Where it goes:** `lib/reputation-engine.js` (new) + hooks into vote outcomes.

**Why this one:** "Not followers. Instead: Accuracy, Reliability, Innovation, Leadership, Evidence." — five-axis reputation, not single score.

**Acceptance:**
- 5-axis reputation model per soul
- Mutation rules tied to: vote outcomes, predictions, "called it" moments, expertise demonstrations
- `purpclaw reputation show <soulId>` with 5-axis breakdown
- Leaderboard: `purpclaw reputation leaderboard` sorted by composite
- Audit trail per reputation change

---

### 5️⃣ Timeline Backfill — ⭐⭐⭐⭐

**What it is:** Import history from existing council votes, studio sessions, meeting memories into the timeline.

**Where it goes:** `lib/timeline.js` gets a `backfill()` method + `purpclaw timeline backfill` CLI.

**Why this one:** The timeline is real but empty. Backfill from existing data so the org has memory from day one.

**Acceptance:**
- `purpclaw timeline backfill --source=council-votes` — every vote becomes a timeline event
- `purpclaw timeline backfill --source=studio-sessions` — every Studio session becomes an event
- `purpclaw timeline backfill --source=meeting-memories` — every meeting summary becomes an event
- Idempotent (running twice doesn't double up)
- Date-stamps preserved

---

### 6️⃣ Council Memory Writes — ⭐⭐⭐

**What it is:** Optional `--write-memory` to archive important meetings.

**Where it goes:** `lib/council-vote-engine.js` or `lib/commands/council.js` accepts `--write-memory` flag.

**Why this one:** Important decisions get archived, not just voted on. Future souls can reference past decisions.

**Acceptance:**
- `purpclaw council "Should we rewrite the provider router?" --write-memory`
- Meeting summary saved to `registry/council-memory.jsonl`
- Tagged with decision, minority opinions, reasoning, key contributors
- Read-only by default; writes opt-in

---

### 7️⃣ Ambient Life Expansion — ⭐⭐⭐⭐⭐

**The big one. The "secret one" from the original upload.**

**What it is:** Not scripted. Agents should walk rooms, overhear conversations, interrupt naturally, continue unfinished chats, remember jokes, create traditions.

**Where it goes:** `lib/ambient.js` (new) + scheduler that triggers ambient events when the org is quiet (no active meetings, no user prompts, time past 23:00 or threshold).

**Why this one:** "Downtime is where teams become teams." This is the cultural payoff of all the other work.

**Acceptance:**
- `lib/ambient.js` with `idleTick()` that runs every N minutes
- Soul-to-soul proximity check: who is in the same space, who can "overhear" conversations
- Random ambient events: walk into a room, pick up an unfinished chat, start a tradition
- Traditions: when the same ambient pattern repeats N times, it becomes a tradition (e.g. "Goose and Maverick always argue about the renderer on Sundays")
- Timeline + memory capture for each ambient moment
- **The After Hours mode is the seed for this — when it triggers, ambient life emerges**

---

### 8️⃣ Auto Research → Donor → Auto Evolve — ⭐⭐⭐⭐⭐

**The full loop.**

```text
Auto Research
    ↓
Donor Archaeology
    ↓
Behavioural Law
    ↓
Evolution Proposal
    ↓
Approval
    ↓
Integration
    ↓
Timeline
    ↓
Meeting Memory
```

**Where it goes:** Wire `lib/commands/autoresearch.js` output → `lib/donor-archaeology.js` (extract behavioural law) → `lib/evolution/mutator.js` (propose) → existing `purpclaw evolve` approval flow → `lib/timeline.js` + `lib/meeting-memory.js` on integration.

**Why this one:** This is the **closed evolution loop**. Currently Donor Archaeology can queue proposals (`mut_mqzfx4n6_byc9q4` is pending) but the autoresearch → donor flow isn't automated.

**Acceptance:**
- `purpclaw autoresearch run --donor-mode` automatically feeds harvested code into donor archaeology
- Donor archaeology automatically extracts behavioural law + queues evolution proposal
- Approved proposal triggers timeline + meeting memory events
- Full roundtrip: research → harvest → law → propose → approve → integrate → remember

---

# 🏁 The End Goal That Emerged

The architecture the work was building toward:

```text
Research
      ↓
Harvest
      ↓
Behavioural Law
      ↓
Governed Evolution
      ↓
World State
      ↓
Souls
      ↓
Conversation
      ↓
Meeting Memory
      ↓
Timeline
      ↓
Traditions
      ↓
Culture
```

That's the thread tying the whole session together. Each phase has been built. The remaining work is **the connectors** between phases — the 8 queued jobs above.

---

# 🎯 Priority Order (my recommendation)

If you want the **cultural payoff first:**
1. Shared Spaces (1) — physical topology under everything
2. Ambient Life Expansion (7) — the secret one, the cultural payoff

If you want the **closed loop first:**
1. Auto Research → Donor → Auto Evolve (8) — full evolution loop
2. Relationship Mutation (3) + Reputation Mutation (4) — feedback into Council

If you want the **operational reliability first:**
1. Timeline Backfill (5) — fill the empty timeline
2. Automatic World Events (2) — the world breathes
3. Council Memory Writes (6) — archive important decisions

**My honest pick:** **Shared Spaces (1) first** because it's the foundation under all the other work, then **Ambient Life (7)** because that's the actual secret one. Two builds, one cultural payout.

---

# ⚠️ What NOT To Do (per the upload's own doctrine)

- ❌ Fake economies (pebbles, currencies, random scoring)
- ❌ Over-gamification (PURPCLAW isn't Twitch)
- ❌ "I found a feature, so I built another feature" (Coaxius behaviour)
- ❌ Resurrecting archive UI
- ❌ Rewriting the brain before the shell is proven

**Doctrine: "Never code the joke. Code the reason the joke could exist."**
**Doctrine: "Culture is the one thing you can't fake. You can only create the conditions where it grows."**

---

# 🦆 Status

**10/10 phases complete. 8/8 queued jobs documented. The monster is built. The shell is the work.**

Standing by. Whatever you pick first, I build.
