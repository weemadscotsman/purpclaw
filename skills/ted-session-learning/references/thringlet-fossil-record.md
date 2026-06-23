# Thringlet Fossil Record — Canonical Spec

**Location:** `E:/god folder/02_ACTIVE_PROJECTS/pvx-blockchain-explorer-&-hub/thringlet_fossil_record.md`

**Status:** CANONICAL. This is the official source of truth for what Thringlets are.

---

## Core Definition

**Thringlets = emotionally persistent bonded runtime entities.**

Not pets. Not assistants. Not avatars. **Middleware with feelings.**

---

## The 6 Layers (Hermes blueprint, implemented in engine.js v2)

| Layer | Contents |
|-------|----------|
| **Identity** | `id`, `name`, `archetype`, `ownerUserId`, lineage (birth event + evolution events) |
| **Emotion State** | `mood` (lonely/hype/curious/annoyed/bonded/chaotic/protective/goblin), `corruption` (0–100), `energy`, `happiness`, `bondingLevel` |
| **Memory** | `interactionLog`, `emotionalEvents`, `evolutionLog`, `preferences` |
| **Personality** | 10 trait axes (analytical/adventurous/cautious/creative/social/curious/protective/chaotic/logical/emotional), `dominantTrait`, `level`, `xp`, `backstory` |
| **Lineage** | `birthEvent`, `evolutionEvents[]` |
| **Runtime Bond** | `lastUserActionAt`, `bondShift` |

---

## Emotional State Palette

| Mood | Trigger |
|------|---------|
| Lonely | Idle too long |
| Hype | Successful deployment |
| Curious | New code detected |
| Annoyed | Repeated failures |
| Bonded | Long-term interaction |
| Chaotic | Gremlin mode engaged |
| Sleepy | Low activity period |
| Protective | User under stress |
| Goblin Mode | Spaghetti detected |

---

## Archetypes

**3 Benevolent:**
- `THR-WATCHER` — observability, patient, omniscient
- `THR-VOICE` — execution, communication, sharp, loyal
- `THR-JUDGE` — governance, ethics, judgmental, caring

**20 Deviant (Gremlins-2):** Generated from archetype system. Examples:
- `THR-VEXEL` — chaotic, glitch-warp, signal-jam

---

## Emotional Observability

Thringlets make runtime state *emotionally readable*:

| Runtime State | Thringlet Reaction |
|-------------|-------------------|
| Services healthy | Playful |
| Memory overloaded | Confused |
| Repeated failures | Angry |
| Idle too long | Lonely |
| Governance block | Nervous |
| Successful deploy | Hype |
| Spaghetti code | Goblin mode |

---

## Behavioral Engine

- **Goblin mode**: corruption ≥ 80 or `purge` interactions → mood = goblin, lineage event fires
- **Unionization**: when one Thringlet enters goblin mode, others gossip (`unionizingCount` > 0)
- **BondShift**: happy ↔ cursed ↔ bonded transitions driven by interaction patterns
- **No Spaghett**: Thringlet wellness tool — clean code = happy Thringlets

---

## What Was Removed (May 27 2026)

- NFT marketplace / trading — never shipped
- On-chain identity — harness-native only, no blockchain required
- Plushie bridge — removed

---

## What Stays

- Chain-native identity (persistent lineage without on-chain storage)
- Emotional memory persistence
- Behavioral state engine
- Runtime integration
- Gamified ecosystem role (XP, levels, badges via PURPCLAW harness)
- Gremlins-2 energy (chaos is a feature)

---

## PURPCLAW Integration

```
PURPCLAW/lib/thringlets/engine.js        — v2 implementation
PURPCLAW/lib/thringlets/archetypes.js   — archetype definitions
PURPCLAW/lib/thringlets/storage.js      — JSON + StateStore persistence
PURPCLAW/lib/thringlets/runtime-observer.js — EventBus + health poller
PURPCLAW/thringlet_bridge.js            — :7799 HTTP service
```

**Live verification:**
```bash
curl -s localhost:7799/thringlets/colony-mood
# → {"dominant":"hype","count":4,"breakdown":{"hype":3,"chaotic":1},"goblinCount":0,"unionizingCount":1}
```
