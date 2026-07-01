# Cognitive + Companion UI Spec — 2026-06-29

> **Purpose:** Define how the Cognitive Spine and Companion Ecology layers surface in the PURPCLAW Unified UI.
> **Scope:** Two new top-level UI organs: Cognitive Spine and Companion Ecology.
> **Canonical:** `cognitive_spine.py` (port 7880) is the cognitive HTTP spine. Companion Ecology files exist as partials.

---

## 1. Layer Position

```
PURPCLAW Backend Organs
  ↓
Cognitive Spine  (port 7880)  ← neural memory + symbolic + modal + autoDream
Companion Ecology  (scattered)  ← shaman + trips + gacha + mochi + chorus
  ↓
PURPCLAW Unified UI
  ├─ Cognitive Spine Screen
  ├─ Companion Ecology Screen
  └─ Integrated panels (Mission Control, status bar, TUI)
```

---

## 2. Cognitive Spine UI

### 2.1 What it is

A dashboard showing the live state of the cognitive layer — memory, rules, beliefs, maintenance cycles, and trust.

### 2.2 Data source

```
GET http://127.0.0.1:7880/cognitive/health
GET http://127.0.0.1:7880/cognitive/memory/summary
GET http://127.0.0.1:7880/cognitive/rules/query?q=<datalog>
GET http://127.0.0.1:7880/cognitive/modal/agents
```

### 2.3 Cognitive Spine Screen layout

```
┌─ Cognitive Spine ──────────────────────────────────────────────────┐
│  ● SPINE ONLINE  ·  7880  ·  mem_guard: 1500MB cap             │
├────────────────────────────────────────────────────────────────────┤
│ MEMORY                                                          │
│  Layer    Count     Last Access                                  │
│  Sensory    12     2m ago                                       │
│  Working    4      30s ago                                       │
│  Long-Term  847    6h ago                                        │
│                                                                     │
│  AutoDream cycles: 150  ·  last: 2026-06-24 20:23  ·  0 merged  │
├────────────────────────────────────────────────────────────────────┤
│ RULES ENGINE (Datalog)                                           │
│  Facts: 234    Rules: 18    Constraints: 3                       │
│  [query input__________________________] [RUN]                    │
│  > ancestor(Agent, X)                                           │
│  > trust_rank(verified_execution)                               │
├────────────────────────────────────────────────────────────────────┤
│ MODAL LOGIC (Per-Agent Beliefs)                                  │
│  Agent      KNOWS         BELIEVES        MUST                   │
│  DRAGON     [11 facts]    [3 beliefs]    [5 obligations]        │
│  GOOSE      [8 facts]     [6 beliefs]    [2 obligations]        │
│  HERMES     [22 facts]    [1 belief]     [4 obligations]        │
│                                                                     │
│  [View worlds] [Query agent] [Transfer knowledge]                 │
├────────────────────────────────────────────────────────────────────┤
│ NEURO-SYMBOLIC BRIDGE                                            │
│  Lifted facts: 45    Grounded queries: 12    Entities: 28        │
│  Recent lifts:                                                       │
│    shadow_protocol → cognitive_flag (DRAGON, 14:32)               │
│    memory_fragment → entity_recall (HERMES, 14:30)                │
├────────────────────────────────────────────────────────────────────┤
│ SPRING DOCTRINE (Trust)                                           │
│  Pure Spring:  12    Verified:  45    Human docs:  23           │
│  LLM suggestion: 89   Unverified AI:  12   Poisoned:  2         │
│                                                                     │
│  [View provenance] [Validate promote] [View principles]            │
├────────────────────────────────────────────────────────────────────┤
│ SERVICE HEALTH                                                    │
│  ● memory     ● rules      ● modal       ● diagnostics           │
│  ● neuro      ● autodream  ● realtime                               │
└────────────────────────────────────────────────────────────────────┘
```

### 2.4 TUI Panel: Cognitive

```
┌─ COGNITIVE ─────────────────────────────────┐
│ ● SPINE 7880   mem: 847 LT · 4 WRK        │
│ AutoDream: 150 cycles  ·  last: Jun-24      │
│ Rules: 234 facts · 18 rules                 │
│ Trust: 12 pure · 2 poisoned                 │
│ [M]emory [R]ules [B]eliefs [T]rust [D]iag │
└─────────────────────────────────────────────┘
```

### 2.5 CLI commands

```bash
purpclaw cognitive status        # health summary from :7880
purpclaw cognitive rules query "ancestor(X,Y)"  # datalog query
purpclaw cognitive modal agent DRAGON  # agent beliefs
purpclaw cognitive trust         # spring doctrine summary
purpclaw cognitive autodream status  # consolidation cycles
purpclaw cognitive --json        # machine-readable
```

---

## 3. Companion Ecology UI

### 3.1 What it is

The emotional/presence layer — shaman, trips, mochi, chorus, drops, rituals.

### 3.2 Companion Ecology Screen layout

```
┌─ Companion Ecology ───────────────────────────────────────────────────┐
│  6 systems  ·  2 partial  ·  2 missing  ·  2 active                │
├──────────────────────────────────────────────────────────────────────┤
│ MOCHI PET                                     Asher the Dragon       │
│  ┌─────────────────────────────────────────┐                        │
│  │      ◉  Asher rumbles     bond: ████████ │ 100%                   │
│  │      mood: proud   ·  interactions: 109  │                        │
│  │      fed: 2h ago  ·  played: 4h ago    │                        │
│  └─────────────────────────────────────────┘                        │
│  [FEED] [PLAY] [CLEAN] [SLEEP] [PET]                               │
├──────────────────────────────────────────────────────────────────────┤
│ COMPANION CHORUS                               mode: normal         │
│  ┌─ 🐙 Octavia  · rare · ✦ eye · wizard hat                       │
│  │   DEBUG: 45  PAT: 20  CHAOS: 88  WIS: 61  SNARK: 33            │
│  └─ 🦆 Mallory  · common · · eye · none                            │
│      DEBUG: 12  PAT: 67  CHAOS: 41  WIS: 33  SNARK: 55            │
│                                                                     │
│  [ROLL] [INVENTORY] [MODE: silent|minimal|normal|chaos]            │
├──────────────────────────────────────────────────────────────────────┤
│ SHAMAN + GUIDED TRIPS                         no active trip      │
│                                                                     │
│  Trips available:                                                   │
│    debug-cave           deep debugging session                       │
│    architecture-pilgrimage  walk the system architecture           │
│    refactor-quest       guided refactoring journey                  │
│    release-bell         pre-release ceremony                        │
│    memory-excavation    explore old decisions                       │
│    focus-ritual         deep work session                          │
│                                                                     │
│  Shaman archetype: Oracle  ·  phase: idle                          │
│  [START TRIP] [SHAMAN STATUS]                                       │
├──────────────────────────────────────────────────────────────────────┤
│ DROPS                                      unopened: 0               │
│  Inventory: duck-mark x3 · epic-dragon-hat x1 · tradition-stamp x2  │
│  Drop triggers fired: 12                                             │
│  Last drop: 2026-06-24 — audit passed → duck-mark                   │
│                                                                     │
│  [OPEN] [INVENTORY] [HISTORY]                                       │
├──────────────────────────────────────────────────────────────────────┤
│ RITUALS                                     7 defined                 │
│  release-ritual  · audit-ritual  · debug-ritual  · focus-ritual   │
│  excavation-ritual · donor-ritual  · tuesday-tea                    │
│                                                                     │
│  Next: tuesday-tea in 3d 14h                                        │
│  [START RITUAL] [VIEW SCHEDULE]                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 TUI Panel: Companion Ecology

```
┌─ COMPANIONS ─────────────────────────────────────────────────────┐
│ MOCHI: Asher(dragon) ◌◌◌◌◌ 100% · proud · fed 2h              │
│ CHORUS: normal · Duck+Ghost+Robot active                          │
│ SHAMAN: idle · 7 trips available                                  │
│ TRIP: none                                                        │
│ DROPS: unopened ×0 · last: Jun-24 duck-mark                      │
│ RITUAL: tuesday-tea in 3d14h                                      │
│ [M]ochi [C]horus [S]haman [D]rops [R]itual                      │
└────────────────────────────────────────────────────────────────────┘
```

### 3.4 CLI commands

```bash
# Mochi
purpclaw mochi              # status summary
purpclaw mochi status        # full state
purpclaw mochi hatch [name] # hatch new mochi
purpclaw mochi feed          # feed action
purpclaw mochi --json       # machine-readable

# Companion Chorus
purpclaw chorus             # status summary
purpclaw chorus status       # mode + active companions
purpclaw chorus mode [mode] # silent/minimal/normal/chaos
purpclaw chorus mute [30m]  # mute duration
purpclaw chorus roll [seed]  # roll new companion
purpclaw chorus inventory    # list owned companions

# Shaman + Trips
purpclaw shaman             # shaman status + current trip
purpclaw trip start <id>    # start guided session
purpclaw trip resume        # resume last session
purpclaw trip history       # past sessions
purpclaw trip end           # exit current trip

# Drops
purpclaw drops              # summary (unopened count)
purpclaw drops open         # open next drop
purpclaw drops inventory    # all earned rewards
purpclaw drops history      # drop log with triggers

# Rituals
purpclaw ritual start <id>  # start ritual
purpclaw ritual list        # available rituals
purpclaw ritual end         # exit ritual

# Umbrella
purpclaw companion status    # all systems summary
```

---

## 4. Integration Points

### 4.1 Cognitive in Mission Control

Add Cognitive tab to Mission Control:

```
Tabs: [Overview] [Agents] [Services] [Memory] [Cognitive] [Studio] [Companions]
```

Cognitive tab shows the full spine dashboard.

### 4.2 Companion in Mission Control

Add Companions tab showing the ecology panel above.

### 4.3 Status bar integration

```
┌─ top bar ─────────────────────────────────────────────────────────┐
│ Asher ~(··)~  ◌◌◌◌◌  mood: proud  ·  CHORUS: normal  ·  pool ✓ │
└───────────────────────────────────────────────────────────────────┘
```

`lib/mochi-statusbar.js` already renders this for CLI. Wire to TUI.

### 4.4 Studio → Companion integration

```
studio.mode changes  →  mochi.mood updates
council consensus    →  chorus reaction + mochi bond += 1
build failed         →  mochi mood: worried + chorus warning
audit passed         →  mochi bond += 5 + drop check
drop.unlocked        →  mochi excitement + chorus celebration
```

### 4.5 Weatherman → Cognitive integration

```
provider degraded    →  cognitive rules engine: assert provider_issue(Provider)
long silence         →  cognitive modal: agent believes "user_idle"
provider recovered    →  cognitive modal: agent knows "recovered"
```

---

## 5. API Endpoints to Build

### 5.1 Cognitive Spine (extend :7880)

```
GET  /cognitive/memory/summary     → layer counts, last access
GET  /cognitive/memory/query?q=    → semantic memory query
GET  /cognitive/rules/query?q=     → datalog query
GET  /cognitive/modal/agents       → list agents + fact/belief/obligation counts
GET  /cognitive/modal/agent/:id   → full belief state
GET  /cognitive/neuro/lifts        → recent lift operations
GET  /cognitive/autodream/status  → cycles, last run
GET  /cognitive/trust/summary      → spring doctrine trust ranks
```

### 5.2 Companion Ecology (new routes)

```
GET  /api/companion/status         → all systems summary
GET  /api/mochi                   → existing, already live
POST /api/mochi-action            → existing, already live
GET  /api/chorus/status           → mode, active companions
POST /api/chorus/roll             → roll new companion
GET  /api/chorus/inventory        → owned companions
GET  /api/trip/current            → active trip or null
POST /api/trip/start              → start trip by id
POST /api/trip/end                → end current trip
GET  /api/trip/list               → available trips
GET  /api/drops/inventory         → earned rewards
GET  /api/drops/unopened          → unopened drop count
POST /api/drops/open              → open next drop
GET  /api/ritual/list             → available rituals
POST /api/ritual/start            → start ritual
```

---

## 6. New Registry Files

```
registry/mochi.json           ← mochi state (move from agent_work/mochi.json)
registry/companions.json     ← chorus roster + inventory + mode
registry/trips.json          ← trip definitions + session history
registry/shaman-sessions.json ← session history
registry/drops.json          ← drop log + rewards
registry/rituals.json        ← ritual definitions
```

---

## 7. New Backend Modules

```
lib/companions/
  index.js                   ← unified exports
  companion-registry.js       ← registry read/write
  companion-state.js         ← shared utilities
  mochi.js                  ← (exists: lib/mochi.js)
  mochi-sprites.js          ← (exists: lib/mochi-sprites.js)
  mochi-state.js            ← (exists: lib/mochi-state.js)
  chorus.js                 ← reaction engine
  chorus-sprites.js         ← from companion-chorus/src/sprites.js
  gacha.js                  ← from companion-chorus/src/gacha.js
  shaman.js                 ← guided-session runner (from shaman_evaluator.js)
  shaman-sessions.js        ← session history
  trips.js                  ← trip definitions + active session management
  rituals.js                ← ritual engine
  drops.js                 ← trigger system + reward ledger

lib/cognitive/
  spine-client.js            ← HTTP client for :7880 cognitive spine
  rules-query.js             ← datalog query helper
  modal-query.js             ← agent belief query helper
  trust-summary.js           ← spring doctrine summary helper
```

---

## 8. Build Order

```
Phase 1 — Wire Mochi to CLI + registry
  1. Create lib/commands/mochi.js
  2. Create registry/mochi.json
  3. Wire app/api/mochi to registry/

Phase 2 — Wire Chorus to runtime
  4. Move gacha.js + sprites.js from companion-chorus/src/ → lib/companions/
  5. Create registry/companions.json
  6. Create lib/chorus.js (reaction engine)
  7. Create lib/commands/chorus.js
  8. Create app/api/chorus/route.ts

Phase 3 — Cognitive Spine UI
  9. Create lib/cognitive/spine-client.js
  10. Create app/cognitive/page.tsx (full spine dashboard)
  11. Add cognitive tab to MissionControl
  12. Create lib/commands/cognitive.js

Phase 4 — Shaman + Trips
  13. Review shaman_evaluator.js + shaman_prompts.js
  14. Create lib/shaman.js
  15. Create registry/trips.json
  16. Create lib/commands/shaman.js + trip.js
  17. Create app/shaman/page.tsx

Phase 5 — Drops + Rituals
  18. Create lib/drops.js
  19. Create registry/drops.json
  20. Create lib/commands/drops.js
  21. Create app/drops/page.tsx + DropAnimation.tsx
  22. Create lib/rituals.js
  23. Create registry/rituals.json
  24. Create lib/commands/ritual.js
  25. Create app/rituals/page.tsx

Phase 6 — TUI + status bar
  26. Wire mochi-statusbar.js to TUI
  27. Add cognitive panel to TUI
  28. Add companion panel to TUI
```

---

## 9. Memory state question

**`autodream_state.json` — runtime state, do not commit.**

Add to `E:/god folder/.gitignore` (parent repo):

```
autodream_state.json
```

> Note: PURPCLAW repo root has no local `.gitignore` — the git repo lives at `E:/god folder/.git`. Runtime state files must be excluded at the parent level.

This is written by `autoDream.py` at runtime. It should not be tracked as source.

---

## 10. Gacha.py disposition

Current `gacha.py` is a **LOBSTER GACHA** prototype, copied from claude-code-system.

It is NOT the earned-drops system.

Options:

```
A) Archive to .donors/lobster-gacha/ — keep as donor artifact
B) Convert to earned-drops by replacing random roll with trigger-based roll
C) Use the companion-chorus/src/gacha.js as the canonical gacha engine (better)
```

**Recommendation: C** — companion-chorus/src/gacha.js has the better engine (rarity weights, species, stats). Move it to lib/companions/gacha.js. Archive gacha.py to .donors/.

---

*Audit: `docs/audit/COGNITIVE_COMPANION_SIDECAR_AUDIT_2026-06-29.md`*
