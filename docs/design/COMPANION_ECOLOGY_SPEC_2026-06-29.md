# PURPCLAW Companion Ecology — Design Spec 2026-06-29

> **Purpose:** Define the canonical architecture for the Companion Ecology layer.
> **Scope:** Mochi Pet, Companion Chorus, Shaman, Guided Trips, Gacha/Drops, Rituals.
> **Doctrine:** Companion Ecology sits between Culture and the PURPCLAW Unified UI. It is the "coding-with-you" layer — not worker agents, not decision governance. The little friends.

---

## 1. Layer Position

```
Runtime
  ↓
World State
  ↓
Souls / Agents
  ↓
Culture (traditions, history, oral memory)
  ↓
Companion Ecology         ← THIS LAYER
  ↓
PURPCLAW Unified UI
```

## Why it sits here:

```
Souls = who the beings are
Agents = what does the work
Culture = what happened before
Companion Ecology = who is with you while you work  ← emotional/presence layer
PURPCLAW Unified UI = how you see everything
```

---

## 2. Mochi Pet

### 2.1 What it is

A persistent companion entity that lives in the bottom-right of the UI, reacts to world state, and tracks its own care needs.

**Not a mascot.** A stateful entity with mood, energy, bond, and care interactions.

### 2.2 State schema

```typescript
interface Mochi {
  // Identity
  seed: string;
  name: string;           // e.g. "Asher"
  species: string;        // e.g. "dragon"
  eye: string;           // e.g. "✦"
  hat: string;            // e.g. "tinyduck" | "none"
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  shiny: boolean;
  tone: string;           // e.g. "imperious, occasionally tender"
  verb: string;           // e.g. "rumbles"

  // Lifecycle
  hatchedAt: string;      // ISO timestamp

  // Stats (decay over time)
  interactions: number;
  bond: number;           // 0-100, grows with positive interactions
  mood: string;          // curious | proud | worried | idle | offline

  // Care needs (decay-based)
  lastFedAt: string | null;
  lastPlayedAt: string | null;
  lastCleanedAt: string | null;
  lastSleptAt: string | null;

  // World-state driven mood
  worldMood?: string;     // from pool health, build status, etc.
}
```

### 2.3 Mood derivation

```
Mood is computed, not stored. Formula:

if (pool offline)        → mood = "offline"
elif (required services down) → mood = "worried"
elif (mochi.interactions > 50) → mood = "curious"
elif (bond > 80)         → mood = "proud"
else                      → mood = "idle"
```

### 2.4 Backend architecture

```
agent_work/mochi.json     ← state file (runtime data, not committed)
        ↑
lib/mochi-state.js        ← hatch/load/save (1027 LOC total across mochi system)
lib/mochi-sprites.js      ← ASCII sprite renderer (421 LOC)
lib/mochi-statusbar.js     ← CLI status bar (222 LOC)
lib/mochi.js              ← LLM reply + pool context (291 LOC)
        ↑
bin/purpclaw.js           ← loads mochi module at startup
        ↓
app/api/mochi/route.ts    ← GET /api/mochi (identity + mood)
app/api/mochi-action/     ← POST actions (feed/play/clean/sleep/pet/name)
        ↓
app/mochi/page.tsx        ← Full Tamagotchi UI (493 lines)
app/components/MochiWidget.tsx ← Floating bottom-right pet
app/components/MochiAvatar.tsx  ← 3D avatar with speech bubble
```

### 2.5 Surface parity map

| Surface | Implementation | Status |
|---|---|---|
| Backend | `lib/mochi.js` + `mochi-state.js` + `mochi-sprites.js` | ✅ LIVE |
| API | `GET /api/mochi` + `POST /api/mochi-action` | ✅ LIVE |
| CLI | Loaded by `bin/purpclaw.js` — no dedicated command | ⚠️ PARTIAL |
| TUI | `lib/mochi-statusbar.js` — CLI only, no TUI panel | ❌ MISSING |
| Web UI | `app/mochi/page.tsx` + `MochiWidget` + `MochiAvatar` | ✅ LIVE |
| Mobile Web | Not responsive | ❌ MISSING |
| Soul | `registry/souls.json` — mochi soul exists | ✅ LIVE |
| Registry | `agent_work/mochi.json` — not a formal registry | ⚠️ MOVE TO `registry/mochi.json` |

### 2.6 CLI command spec (to build)

```bash
purpclaw mochi              # status summary
purpclaw mochi status        # full state
purpclaw mochi hatch [name]  # hatch new mochi (resets state)
purpclaw mochi feed          # feed action
purpclaw mochi play          # play action
purpclaw mochi clean         # clean action
purpclaw mochi sleep         # sleep action
purpclaw mochi pet           # pet action
purpclaw mochi rename <name> # rename
purpclaw mochi --json        # machine-readable output
```

---

## 3. Companion Chorus

### 3.1 What it is

Ambient multi-voice companion layer — small reactions, tiny nudges, "coding with friends" atmosphere.

**Not the same as Council.** Council is decision governance. Chorus is atmosphere and morale.

### 3.2 Species and gacha

The 18 species (same as Mochi sprite system):

```
duck, goose, blob, cat, dragon, octopus, owl,
penguin, turtle, snail, ghost, axolotl, capybara,
cactus, robot, rabbit, mushroom, chonk
```

Rarity distribution:
```
common:     60%
uncommon:   25%
rare:       10%
epic:        4%
legendary:   1%
```

Stats per companion:
```
DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK
(rarity-scaled floors)
```

### 3.3 Modes

```
silent      — no reactions
minimal     — rare, high-significance only
normal      — standard ambient reactions
chaos       — frequent, all events
bath mode   — calm, soothing reactions only
```

### 3.4 Event triggers

```
audit started      → small reaction
audit passed       → celebration
build failed       → concern/warning
long silence       → nudge
provider degraded  → warning
new tradition      → recognition
drop unlocked      → excitement
trip completed     → congratulation
```

### 3.5 Surface parity map

| Surface | Implementation | Status |
|---|---|---|
| Backend | `companion-chorus/main.js` (standalone) | ⚠️ NOT INTEGRATED |
| Gacha engine | `companion-chorus/src/gacha.js` | ✅ EXCELLENT |
| Sprites | `companion-chorus/src/sprites.js` | ✅ EXCELLENT |
| Bridge to EventBus | `companion-chorus/bridge.js` | ⚠️ PARTIAL |
| Registry | MISSING | ❌ |
| CLI | No `purpclaw chorus` command | ❌ |
| TUI | MISSING | ❌ |
| Web UI | MISSING | ❌ |
| Soul | MISSING | ❌ |
| Mode control | No unified control surface | ❌ |

### 3.6 Integration plan

```
1. Move gacha.js + sprites.js from companion-chorus/src/ → lib/companions/
2. Create registry/companions.json (companion roster + inventory)
3. Create lib/chorus.js (chorus reaction engine)
4. Create lib/commands/chorus.js (CLI: chorus status/mode/mute)
5. Wire chorus events to world-state changes
6. Add chorus panel to the PURPCLAW Unified UI right drawer
7. Create companion Chorus soul in souls.json
```

### 3.7 CLI command spec (to build)

```bash
purpclaw chorus              # status summary
purpclaw chorus status        # current mode + active companions
purpclaw chorus mode [mode]   # set mode: silent/minimal/normal/chaos
purpclaw chorus mute [30m]    # mute for duration
purpclaw chorus roll [seed]   # roll a new companion
purpclaw chorus inventory     # list owned companions
purpclaw chorus --json        # machine-readable
```

---

## 4. Shaman

### 4.1 What it is

Ritual guide / session conductor / transition agent.

**Not a coder.** Not a normal council member. Shaman runs structured guided sessions: debug caves, architecture walks, focus rituals, release ceremonies.

### 4.2 Soul already exists

```json
"shaman": {
  "name": "Shaman",
  "species": "Shaman",
  "spirit": "wandering",
  "role": "guide, philosopher, truth-teller",
  "purpose": "guided-session conductor, ritual lead, truth excavation",
  "methods": ["ceremony", "guided-session", "silence"]
}
```

### 4.3 What exists (legacy files, not wired)

| File | What it is | Action |
|---|---|---|
| `shaman_evaluator.js` | Shaman session evaluation | Review for reusable logic |
| `shaman_prompts.js` | Shaman prompt templates | Review for reusable prompts |

### 3. What to build

```
lib/shaman.js              ← NOT NEEDED — digital_shaman.js (614 LOC) IS the engine
lib/commands/shaman.js     ← CLI: shaman status / trip start / trip end / history
registry/shaman-sessions.json  ← trip session history (digital_shaman writes to trip_logs/)
registry/trips.json        ← guided trip definitions (predefined trip configs)
app/shaman/page.tsx       ← guided session UI (immersive mode)
```

> **Correction:** `digital_shaman.js` (614 LOC) is the canonical Shaman engine — it wraps `shaman_evaluator.js` and `shaman_prompts.js`. It is already imported by `unified_api.js` at boot with 8 live API routes. The only missing pieces are: CLI command, web UI, and the `shaman_state.json` + `trip_logs/` directories that the engine tries but fails to create.

### 4.5 Guided session schema

```typescript
interface GuidedSession {
  id: string;
  title: string;           // "Debug Cave", "Architecture Pilgrimage"
  guide: string;           // "shaman"
  currentStep: number;
  totalSteps: number;
  mood: string;            // "focused", "tense", "calm"
  goal: string;
  evidencePath: string;   // what artifacts the session produces
  steps: SessionStep[];
  startedAt: string;
  exitCondition: string;   // "all tests pass", "root cause found"
  resumeState: Record<string, any>;
}
```

### 4.6 Predefined trips

```
debug-cave           — deep debugging session with Shaman as guide
architecture-pilgrimage — walk through system architecture
refactor-quest        — guided refactoring journey
release-bell          — pre-release ceremony and checklist
memory-excavation     — explore old decisions and their traces
provider-storm-walk   — navigate provider issues with Shaman
burnout-cooldown      — step back, reorient, small wins
donor-heist           — guided donor archaeology trip
focus-ritual          — deep work session, minimal interruption
```

### 4.7 CLI command spec (to build)

```bash
purpclaw shaman               # shaman status + current trip
purpclaw trip start <trip-id>  # start a guided session
purpclaw trip resume          # resume last session
purpclaw trip history         # past sessions
purpclaw trip end             # exit current trip
purpclaw trip --json         # machine-readable
```

---

## 5. Gacha / Drops

### 5.1 What it is

Earned reward system. **Not gambling.** Triggered by real achievements, not purchases.

**Core rule:** No randomness in reward *eligibility*. Randomness only in *which companion/cosmetic you get*.

### 5.2 Drop triggers

```
audit passed                          → guaranteed drop
lie killed in status                  → guaranteed drop
provider recovered                    → guaranteed drop
council decision reached consensus    → possible drop
timeline tradition emerged            → possible drop
donor artifact promoted               → possible drop
release shipped                       → big drop
first successful mission              → drop
100% on capability test               → drop
```

### 5.3 Drop types

```
companion      — new species roll (gacha)
cosmetic       — hat, eye, accessory for existing mochi
badge          — audit pass badge, lie-killer badge
tradition-stamp — proof of triggered tradition
sound-bite     — short audio clip
room-object    — small object for ambient room
```

### 5.4 Surface parity map

| Surface | Implementation | Status |
|---|---|---|
| Gacha engine | `companion-chorus/src/gacha.js` | ✅ EXCELLENT |
| Trigger system | MISSING | ❌ |
| Reward ledger | MISSING | ❌ |
| CLI | MISSING | ❌ |
| UI | MISSING | ❌ |
| Mochi cosmetic wiring | MISSING (mochi has hat/eye fields) | ❌ |

### 5.5 CLI command spec (to build)

```bash
purpclaw drops             # summary (unopened count, latest)
purpclaw drops open         # open next drop with animation
purpclaw drops inventory    # all earned rewards
purpclaw drops history     # drop log with triggers
purpclaw drops --json      # machine-readable
```

---

## 6. Rituals

### 6.1 What it is

Structured ceremony flows for significant events: release, audit, recovery, debug, focus.

**Distinction from Traditions:**
```
Traditions = ambient triggers (crisis_pool fires when 3+ services down)
Rituals   = structured ceremonies (Release Bell, Audit Ceremony)
```

### 6.2 Ritual definitions (to build)

```
release-ritual     — pre-release ceremony: test → audit → sign-off → ship
audit-ritual       — full system audit with ceremony framing
debug-ritual       — debug session opening ceremony
focus-ritual       — entering deep work mode
recovery-ritual    — post-failure recovery ceremony
excavation-ritual  — memory/shaman deep-dive ceremony
donor-ritual       — integrating a donor artifact with ceremony
```

### 6.3 Ritual schema

```typescript
interface Ritual {
  id: string;
  name: string;
  description: string;
  steps: RitualStep[];
  duration: string;        // "10m", "30m"
  guide: string;            // "shaman" | "hermes" | "goose"
  mood: string;              // "ceremonial", "tense", "focused"
  exits: RitualExit[];      // possible outcomes
}

interface RitualStep {
  order: number;
  action: string;           // "read", "speak", "run", "decide"
  instruction: string;
  evidence?: string;
}
```

---

## 7. Registry Design

### 7.1 New registry files needed

```
registry/mochi.json           ← mochi state (move from agent_work/mochi.json)
registry/companions.json      ← chorus roster + inventory
registry/trips.json           ← guided trip definitions
registry/shaman-sessions.json ← session history
registry/drops.json           ← drop log + inventory
registry/rituals.json         ← ritual definitions
```

### 7.2 Companion state hierarchy

```
registry/souls.json       ← WHO they are (species, name, spirit, role)
registry/mochi.json       ← pet state (mood, bond, care needs)
registry/companions.json  ← chorus roster + inventory + mode
registry/trips.json       ← trip definitions + session history
registry/drops.json       ← drop triggers + rewards
registry/rituals.json     ← ritual definitions
```

---

## 8. Backend Module Structure

```
lib/companions/
  index.js                  ← unified exports
  companion-registry.js      ← registry read/write for all companion types
  companion-state.js        ← shared state utilities

  mochi.js                  ← mochi-specific: mood derivation, care decay
  mochi-sprites.js         ← sprite rendering (421 LOC, already exists)
  mochi-state.js            ← hatch/load/save (93 LOC, already exists)

  chorus.js                 ← chorus reaction engine, event subscription
  chorus-sprites.js         ← chorus-specific sprites (from companion-chorus/src/sprites.js)
  gacha.js                  ← roll engine (from companion-chorus/src/gacha.js)

  shaman.js                 ← guided-session state machine + trip runner
  shaman-sessions.js        ← session history management

  trips.js                  ← trip definitions + active session management
  rituals.js                ← ritual engine
  drops.js                  ← drop trigger system + reward ledger
```

---

## 9. CLI Command Structure

```
purpclaw mochi [status|hatch|feed|play|clean|sleep|pet|rename]
purpclaw chorus [status|mode|mute|roll|inventory]
purpclaw trip [start|resume|history|end]
purpclaw shaman [status|start|resume]
purpclaw drops [open|inventory|history]
purpclaw ritual [start|list|end]
purpclaw companion [status]   ← umbrella status command
```

---

## 10. TUI Panel Design

Right panel additions:

```
┌─ Companions ─────────────────┐
│ MOCHI: Asher (dragon) ◌◌◌◌◌ │
│ mood: proud  bond: 100      │
│ last fed: 2h ago            │
│                                │
│ CHORUS: normal               │
│ active: Duck, Ghost, Robot   │
│ muted: until 15:30           │
│                                │
│ TRIP: debug-cave             │
│ step 3/7 — find root cause   │
│                                │
│ DROPS: unopened ×2           │
│ latest: epic Dragon hat       │
└────────────────────────────────┘
```

---

## 11. Web UI Placement

### 11.1 Desktop PURPCLAW Unified UI

```
Right Claw Drawer:
  ├─ Mochi (pet dock)
  ├─ Chorus (companion strip)
  ├─ Shaman (current trip)
  ├─ Drops (unopened + inventory)
  └─ Rituals (start ritual)
```

### 11.2 Mobile PURPCLAW Unified UI

```
Bottom dock addition:
  Ask | Council | Studio | Mochi | Pulse

Swipe-up companion tray:
  ├─ Mochi card (expandable)
  ├─ Chorus mode toggle
  ├─ Active trip status
  ├─ Drop notification badge
  └─ Ritual shortcuts
```

---

## 12. Build Priority

### Phase 1 — Wire Mochi to CLI (P1)
```
1. Create lib/commands/mochi.js
2. Create registry/mochi.json (move state)
3. Verify app/api/mochi + MochiWidget already working
4. Add purpclaw mochi status CLI
```

### Phase 2 — Wire Chorus to Runtime (P1)
```
1. Move gacha.js + sprites.js → lib/companions/
2. Create registry/companions.json
3. Create lib/chorus.js (reaction engine)
4. Create lib/commands/chorus.js
5. Create app/api/chorus/route.ts
```

### Phase 3 — Cognitive Spine UI (P2)
```
1. Create lib/cognitive/spine-client.js
2. Create app/cognitive/page.tsx (full spine dashboard)
3. Add cognitive tab to MissionControl
4. Create lib/commands/cognitive.js
```

### Phase 3b — Shaman UI + State Persistence (P2)
```
1. Create trip_logs/ directory (digital_shaman.js needs this)
2. Create shaman_state.json seed (digital_shaman.js needs this)
3. Create lib/commands/shaman.js (routes to /api/shaman/*)
4. Create registry/trips.json (predefined trip definitions)
5. Create app/shaman/page.tsx (immersive trip UI — consumes SSE shaman_phase_change events)
```

> digital_shaman.js (614 LOC) IS the Shaman engine — already wired to unified_api.js with 8 API routes. Do NOT build lib/shaman.js. Only add the CLI, UI, and missing directories.

### Phase 4 — Drops System (P2)
```
1. Create lib/drops.js (trigger engine)
2. Create registry/drops.json (reward ledger)
3. Create lib/commands/drops.js
4. Wire drops to: audit events, build events, council events
5. Create app/drops/page.tsx + app/components/DropAnimation.tsx
```

### Phase 5 — Rituals Engine (P3)
```
1. Create registry/rituals.json (ritual definitions)
2. Create lib/rituals.js
3. Create lib/commands/ritual.js
4. Create app/rituals/page.tsx
5. Wire rituals to studio + council
```

---

## 13. Mochi + Studio Integration

Mochi should react to studio events:

```
studio.mode = "council"    → mochi mood = "attentive"
studio.mode = "arena"      → mochi mood = "excited"
studio.mode = "after_hours" → mochi mood = "relaxed"
council.consensus reached   → mochi bond += 1
build failed               → mochi mood = "worried"
audit passed               → mochi bond += 5
drop.unlocked             → mochi reacts with excitement
```

---

## 14. Key Constraints

```
NO predatory loot-box mechanics. Drops are earned, not bought.
NO companion that interrupts every keystroke. Mochi is a pet, not a keyboard logger.
NO random companion spam. Chorus has modes including "silent."
NO second soul system. Mochi and Shaman use existing souls.json.
NO duplication of gacha engine. companion-chorus/src/gacha.js is canonical.
NO Companion Chorus as separate package. It becomes lib/companions/chorus.js.
NO companion state in agent_work/. Move to registry/.
```

---

*Spec complete. Audit: `docs/audit/COMPANION_ECOLOGY_AUDIT_2026-06-29.md`*
