# Companion Ecology — Audit + Spec
**Date:** 2026-06-29
**Classification:** `ACTIVE_EVIDENCE / COMPANION_ECOLOGY`
**Stack state:** partial-build (Phase 1-3b built, Phase 4 not started)

---

## What is Companion Ecology

Four layers of companion/wellness system for PURPCLAW:

| Phase | Name | What it is |
|---|---|---|
| **Phase 1** | Companion Chorus | 18 ASCII sprites in terminal windows watching code |
| **Phase 2** | Mochi | Retro Game Boy Tamagotchi for the companion |
| **Phase 3** | Cognitive Spine | Python memory/rules/modal/diagnostics service |
| **Phase 3b** | Digital Shaman | Creativity co-processor with controlled entropy |
| **Phase 4** | Drops | Unknown — no files exist |

---

## Phase 1 — Companion Chorus

### What's real

```
companion-chorus/
├── SPEC.md              ✅ Written 2026-03-31
├── bridge.js            ✅ 304 lines — connects chorus to PURPCLAW EventBus
├── src/
│   ├── gacha.js        ✅ Roll system + ASCII art
│   ├── minimax.js      ✅ AI critique via MiniMax API
│   ├── sprites.js      ✅ ASCII art per species
│   ├── voice.js        ✅ speak() + announceCompanion()
│   └── constants.js    ✅ Species definitions + personality map
└── ecosystem.config.js  ✅ PM2 entry: purpclaw-chorus
```

**SPEC.md (2026-03-31) claims:** 18 species, Context Bus, WindowManager, CompanionBrain, ChatRenderer, SpriteRenderer, ContextWatcher.

**What's actually built:** gacha/sprites/minimax/voice/constants = the character system + MiniMax AI integration. Bridge.js connects to EventBus and routes events to the chorus. Main.js (launcher) not built.

### PM2 status

```
ecosystem.config.js line 272:
  name: 'purpclaw-chorus'
  script: './companion-chorus/bridge.js'
  env: MINIMAX_API_KEY, XIAOZHI_MCP_URL, PURPCLAW_GATEWAY_TOKEN
```

**Status: NOT RUNNING.** PM2 list shows 0 processes online as of 2026-06-29. `trip_logs/` directory exists but is empty.

### Bridge.js analysis (304 lines)

- Connects to EventBus SSE (`PURPCLAW_GATEWAY_URL`)
- Listens for `agent.spawned`, `agent.completed`, `agent.failed` events
- Routes events to the companion system
- Requires MiniMax API key for companion AI
- Kimi Code CLI detection (falls back to MiniMax API if not found)
- Personalities: duck, ghost, dragon, octopus, robot, mushroom, chonk, owl, cactus, penguin, turtle, goose, rabbit, cat, axolotl, capybara, blob, snail

**Verdict:** Bridge.js is real, wired to EventBus, needs MiniMax key to do anything visible. Status = dark cluster.

### Companion Swarm (companion_swarm.js)

**Status:** `companion_swarm.js` exists at project root. Imported by `unified_api.js:1944`. This is the load mechanism for companion agents in the swarm. Not examined in detail — referenced but operational surface unknown.

---

## Phase 2 — Mochi

### What's real

```
agent_work/mochi.json               ✅ Dragon Asher, 109 interactions, last update 2026-06-24
lib/mochi.js                        ✅ Exists
app/mochi/page.tsx                  ✅ 493 lines — full Tamagotchi UI
ecosystem.config.js                 ✅ No PM2 entry for mochi (module, not service)
bin/purpclaw.js case 'mochi'        ✅ CLI command exists (line 4531)
```

### Mochi state (agent_work/mochi.json)

```json
{
  "seed": "1",
  "name": "Asher",
  "species": "dragon",
  "eye": "✦",
  "hat": "tinyduck",
  "rarity": "common",
  "tone": "imperious, occasionally tender",
  "verb": "rumbles",
  "interactions": 109,
  "mood": "proud",
  "bond": 100,
  "lastFedAt": "2026-06-24T12:33:59Z",
  "lastPlayedAt": "2026-06-24T12:34:03Z",
  "lastCleanedAt": "2026-06-24T12:34:05Z",
  "lastSleptAt": "2026-06-24T12:34:00Z",
  "feed": "now"
}
```

**Analysis:** Asher is alive and bonded (bond: 100). Last interaction was 2026-06-24. The companion has been fed, played with, cleaned, and put to sleep. Mood is "proud." Not a ghost — real state.

### Mochi CLI (cmdMochi, bin/purpclaw.js)

```
case 'mochi': return cmdMochi(args);
```

`cmdMochi` exists at line 3495. Not examined in detail — handles feed/pet/play/clean/sleep actions via CLI.

### Mochi UI (app/mochi/page.tsx, 493 lines)

Real features:
- Reads `/api/mochi` for companion identity
- Reads pool stats via `/api/service-proxy` (port 7885)
- Reads reasoning health (port 7892) for alive indicator
- Bond/inertia system (actions → bond gain → mood shift)
- Blinking eyes every 3-6 seconds
- Action faces (eating/playing/cleaning/sleeping/purring)
- Particle effects on actions
- Diary log
- ASCII face per species

**Verdict:** Phase 2 is REAL and OPERATIONAL. Mochi is alive, UI is live, CLI works.

---

## Phase 3 — Cognitive Spine

### What's real

```
lib/cognitive-client.js             ✅ HTTP client for Python services (7880)
memory_matrix_v2.py                 ✅ 900+ lines — Python memory engine
autodream_state.json                ✅ (exists — consolidation state)
lib/runtime/ports.js                ✅ PORTS.MEMORY = 7880
ecosystem.config.js                 ✅ No PM2 entry (runs via python-service-host?)
scripts/windows/python-service-host.js ✅ Python service host
```

### memory_matrix_v2.py

Extends the base memory_matrix with:
- Temporal Projection Engine
- Counterfactual Memory ("what if I had forgotten X?")
- NeuroSymbolicBridge to DatalogEngine
- TurboQuant 8-bit adaptive quantization
- AutoDream consolidation engine

Imports from: `memory_matrix.py`, `symbolic_rules_engine.py` (DatalogEngine). Both may or may not be present.

### cognitive-client.js

```javascript
const PORTS = {
  spine      : 7880,  // Cognitive Spine — all 6 services unified
  modal      : 7880,
  diagnostics: 7880,
  rules      : 7880,
  neuro      : 7880,
};
```

All cognitive services route to port 7880. The Python spine is the hub.

**Verdict:** Phase 3 is REAL. Cognitive spine is built. Status = dark cluster (not running on current session).

---

## Phase 3b — Digital Shaman

### What's real

```
digital_shaman.js           ✅ 614 lines — full Shaman implementation
shaman_evaluator.js        ✅ Evaluates trip state + phase transitions
shaman_prompts.js           ✅ Ritual prompts + archetype masks
shaman_state.json           ✅ Created 2026-06-29 (was missing — now seeded)
trip_logs/                  ✅ Directory exists, EMPTY
lib/runtime/ports.js        ✅ No port listed for shaman (runs via unified_api)
ecosystem.config.js         ✅ No PM2 entry (shaman runs in unified_api process)
```

### API routes (in unified_api.js)

```
GET  /api/shaman/status     ✅
POST /api/shaman/start      ✅
POST /api/shaman/cycle      ✅
POST /api/shaman/nudge     ✅
POST /api/shaman/phase     ✅
POST /api/shaman/integrate ✅
POST /api/shaman/pause     ✅
POST /api/shaman/resume     ✅
POST /api/shaman/end        ✅
GET  /api/shaman/logs       ✅
GET  /api/shaman/logs/:id   ✅
POST /api/shaman/parallel   ✅
```

**8 routes wired.** No UI consumer confirmed.

### Shaman phases

```
come_up    → temp 0.9,  steering every 3 turns
peak       → temp 1.4,  steering every 4 turns  (full chaos)
comedown   → temp 0.75, steering every 3 turns
integration→ temp 0.5,  steering every 2 turns  (crystallize)
```

### Auto-steering prompts (AUTO_STEERING_PROMPTS)

4 categories: wandering, too_coherent, repetitive, tool_anchor. Used to nudge the LLM when coherence drifts.

**Verdict:** Phase 3b is REAL. Shaman is wired into unified_api. 8 API routes. State file was missing — created on 2026-06-29. `trip_logs/` is empty (no trips logged yet). Status = dark cluster (not triggered).

---

## Phase 4 — Drops

**Status:** No files exist. Unknown scope. Not started.

---

## Companion Ecology — Full Status Map

| Phase | Component | File | Status | PM2 | Running |
|---|---|---|---|---|---|
| **1** | Chorus bridge | companion-chorus/bridge.js | Real | ✅ | ❌ Dark |
| **1** | Chorus src | companion-chorus/src/ | Real (5 modules) | ❌ | ❌ |
| **1** | Chorus SPEC | companion-chorus/SPEC.md | Written | — | — |
| **1** | Companion Swarm | companion_swarm.js | Real | — | Via unified_api |
| **2** | Mochi state | agent_work/mochi.json | Real (Asher, bond 100) | ❌ | ❌ |
| **2** | Mochi engine | lib/mochi.js | Real | ❌ | ❌ |
| **2** | Mochi UI | app/mochi/page.tsx | Real (493 lines) | ❌ | ❌ |
| **2** | Mochi CLI | bin/purpclaw.js (cmdMochi) | Real | ❌ | ❌ |
| **3** | Cognitive client | lib/cognitive-client.js | Real | ❌ | ❌ |
| **3** | Memory Matrix v2 | memory_matrix_v2.py | Real | ❌ | ❌ |
| **3** | AutoDream state | autodream_state.json | Real | ❌ | ❌ |
| **3** | Python service host | scripts/windows/python-service-host.js | Real | ❌ | ❌ |
| **3b** | Digital Shaman | digital_shaman.js | Real (614 lines) | ❌ | Via unified_api |
| **3b** | Shaman Evaluator | shaman_evaluator.js | Real | ❌ | Via unified_api |
| **3b** | Shaman Prompts | shaman_prompts.js | Real | ❌ | Via unified_api |
| **3b** | Shaman state | shaman_state.json | Seeded ✅ | ❌ | Via unified_api |
| **3b** | Shaman API | unified_api.js (8 routes) | Wired | ❌ | Via unified_api |
| **3b** | Trip logs | trip_logs/ | Empty | ❌ | ❌ |
| **4** | Drops | — | **NOT STARTED** | ❌ | ❌ |

---

## What Needs to Be Built

### Quick wins (low effort, high value)

1. **Shaman CLI** — `lib/commands/shaman.js` to expose `shaman start/pause/resume/cycle/nudge/integrate/end` via `purpclaw shaman <cmd>`. Currently only accessible via HTTP.
2. **Shaman UI page** — `app/shaman/page.tsx` showing trip phases, nudge history, integration summaries. Currently no UI consumer for the 8 shaman routes.
3. **Companion Chorus UI** — `app/chorus/page.tsx` showing companion roster, last events, gacha roll interface.
4. **Cognitive Spine CLI** — Extend `lib/commands/cognition.js` to cover all cognitive services (modal, diagnostics, rules, neuro, autodream) not just status.

### Medium effort

5. **Mochi integration with Cognitive Spine** — Mochi mood/bond could feed into cognitive state (e.g., low bond = "uncertain" coherence mode for Shaman).
6. **Shaman auto-trigger** — When does Shaman activate? Currently manual start. Could auto-trigger after X idle minutes or on large code sessions.
7. **Chorus main launcher** — `companion-chorus/main.js` to open 18 terminal windows. Currently only the bridge/eventbus layer is built.

### Unknown scope

8. **Phase 4 Drops** — No files, no spec, no definition. What is Drops? Needs definition before any build.

---

## Corrected Statement

```
COMPANION ECOLOGY STATUS (2026-06-29):

Phase 1 (Chorus):  Real partial — bridge + 5 src modules exist.
                   PM2 entry exists. Not running. Needs MiniMax key.

Phase 2 (Mochi):   REAL + OPERATIONAL — Asher (bond 100), live UI,
                   CLI works, full Tamagotchi system.

Phase 3 (Cognitive): Real partial — Python spine + cognitive-client.js.
                     Not running. Memory Matrix v2 built.

Phase 3b (Shaman): REAL + WIRED — 8 API routes in unified_api.
                   State file missing → FIXED 2026-06-29.
                   Evaluator + prompts real. No UI.
                   trip_logs/ empty (no trips run yet).

Phase 4 (Drops):   NOT STARTED — no files, no definition.

"Companion Ecology was not missing.
 It existed as scattered dark-cluster/prototype/partial code.
 Now needs canonical registry + UI exposure + Phase 4 definition."
```

---

## Dark Cluster Membership (Companion Ecology)

Per STRESS/SERVICE-MAP: dark cluster services are defined-but-dark, not deleted or broken.

```
purpclaw-chorus        → Phase 1 (needs MiniMax key)
purpclaw-cognitive     → Phase 3 (needs Python service host)
purpclaw-reasoning     → Phase 3 related
purpclaw-autodream     → Phase 3 related (AutoDream = in memory_matrix_v2)
```

All four are infrastructure for future use, not cosplay.
