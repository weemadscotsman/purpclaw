# PURPCLAW Layer Boundaries
**Date:** 2026-06-29
**Classification:** `DOCTRINE / ARCHITECTURE_CONSTRAINT`
**Purpose:** Define what each layer IS and IS NOT. Stop future agents from smearing everything into one soup.

---

## The Six-Pillar Doctrine Stack

```
1. No doc survives unless runtime proves it.

2. Never code the joke.
   Code the reason the joke could exist.

3. Never import a feature until the behavioural law is identified.

4. If CLI can do it, every surface must at least see it.

5. Companions are not features.
   They are the difference between a tool and a place.

6. Self-improvement learns from correction, not creepiness.
```

These are the constitution. Not decorative.

---

## The Seven-Layer Map

```
Creative Source
= Eddie / ideas / chaos

Runtime Organisation
= PURPCLAW services, providers, CLI/TUI/Web/Mobile

Cognitive Layer
= memory matrix, rules engine, modal logic, neuro-symbolic bridge, AutoDream

Cultural Layer
= souls, council, studio, timeline, ambient life

Experience Layer
= Shaman, Mochi, Chorus, Trips, Drops

Improvement Layer
= corrections, self-reflection, HOT/WARM/COLD learning, heartbeat

Truth Layer
= audits, runtime proof, donor provenance, no fake green
```

---

## Layer Definitions and Boundaries

### Timeline
**IS:** A session-by-session record of what happened. Events, facts, context changes, decisions made.

**IS NOT:** Meeting Memory, Soul Memory, Self-Improving Memory.

**Boundary rule:** Timeline captures what happened. Meeting Memory captures what the session meant. Timeline does not become meeting memory, and neither becomes soul memory.

---

### Meeting Memory
**IS:** What the session meant. Outcome, decisions, unresolved tensions, cultural notes about a session.

**IS NOT:** Timeline (which is factual), Soul Memory (which is identity), Self-Improving Memory (which is execution rules).

**Boundary rule:** Meeting Memory is session context — what to remember for next time someone opens this project. It does not store soul-level beliefs or execution rules.

---

### Soul Memory
**IS:** What a being believes, fears, prefers at the identity level. Who the soul is, not what it did.

**IS NOT:** Timeline, Meeting Memory, Self-Improving Memory.

**Boundary rule:** Soul Memory stores identity and beliefs. Self-Improving Memory stores execution improvements. They are separate files, separate namespaces, separate purposes.

**Hard rule:** Soul Memory ≠ Self-Improving Memory. The system does not "learn personality." It learns execution.

---

### Self-Improving Memory (Execution Improvement Layer)
**IS:** How the worker learns to execute better. Corrections, confirmed preferences, active patterns, project rules, domain rules, self-reflections, heartbeat maintenance.

**IS NOT:** Soul Memory, personality, creep profiling, Timeline.

**Trigger rule:** Only learns from correction, explicit reusable pattern, or self-reflection. Never from silence, never from inference, never from observing behaviour without a correction.

**Anti-creep rules:**
- No inferring from silence
- No silent profile building
- No learning what makes the user comply faster
- No personality absorption (execution rules ≠ who the user is)
- No soul merger (execution improvement ≠ identity)

**Source rule:** Every learned rule cites its source file and line. No invisible "agent learned a thing" goblin.

**Files:**
```
agent_work/self-improving/
├── memory.md          HOT — execution rules, ≤100 lines
├── index.md
├── corrections.md     last 50 corrections
├── heartbeat-state.md
├── reflections.md
├── projects/          per-project learnings
├── domains/           domain-specific patterns
└── archive/          decayed patterns
```

---

### Cognitive Spine
**IS:** Reasoning, rules engine, modal logic, neuro-symbolic bridge, AutoDream memory consolidation, diagnostics.

**IS NOT:** Soul Memory, Experience Layer (Shaman/Mochi), Improvement Layer.

**Boundary rule:** Cognitive Spine is the reasoning engine. It does not store identity (soul), experience (Mochi), or execution improvements (corrections). It processes inputs and produces outputs.

---

### Companions (Experience Layer)
**IS:** Mochi, Chorus, Shaman, Trips, Drops — entities with presence, state, and personality that create a sense of place.

**IS NOT:** Council Agents, features, utility functions.

**Boundary rule:** Companions have state and personality. Council agents have roles and responsibilities. Mochi is not a tool. The Chorus is not a service. Companions are what make PURPCLAW a place, not a tool.

**Distinction:**
```
Companion: has personality, state, relationship with user
Council Agent: has role, mandate, voting weight
Feature: does a thing
Service: runs in the background
```

---

### Council
**IS:** Governance layer. Souls with voting weight, modes, division mandates, ritual patterns.

**IS NOT:** Companions, Experience Layer, Features.

**Boundary rule:** The council governs. Companions experience. Features do. Services run. These are four different kinds of entity and they are not interchangeable.

---

### Shaman
**IS:** Creativity co-processor with controlled entropy. Trip phases (come_up, peak, comedown, integration), steering prompts, nudge system.

**IS NOT:** Oracle (does not predict), Sensor (does not collect data), Council Agent (does not vote).

**Boundary rule:** Shaman introduces controlled creative entropy. Oracle provides answers. Shaman provides new questions. These are different functions.

---

### Mochi
**IS:** Tamagotchi companion. Mood, bond, feeding, playing, cleaning, sleeping. Alive in the emotional/companion sense.

**IS NOT:** Sensor (does not collect data about the user), Feature (is not a tool), Council Agent (does not vote).

**Boundary rule:** Mochi has a relationship with the user. It is not a data collection mechanism. It does not report "the user plays with Mochi at 11pm so they must be stressed."

---

### Drops / Gacha
**IS:** Reward discovery system. Blisters, rare variants, collection mechanics.

**IS NOT:** Gambling (no real money), Loot box (no randomized paid advantage), Sensor (does not profile users).

**Boundary rule:** Drops are cosmetic and discovery-based. Gacha has no stake. No financial extraction.

---

### Donor Archaeology
**IS:** Learning from how other projects solved problems. Provenance, technique extraction, pattern adaptation.

**IS NOT:** Code theft, IP violation, copy-paste licensing evasion.

**Boundary rule:** Donor Archaeology studies how systems are built — architecture, patterns, trade-offs. It does not copy code without licence. It does not remove attribution. It learns principles, not theft.

---

## Hard Boundary Rules

| Rule | Meaning |
|---|---|
| No layer merger without operator approval | Soul + Self-Improving + Cognitive are separate namespaces by design |
| No creep inference | Self-Improving does not infer personality from execution patterns |
| No silent learning | Every learned rule is visible and cited |
| No data leakage between layers | Timeline does not feed into Soul. Self-Improving does not feed into Mochi |
| No credential storage in any layer | Boundaries apply to ALL layers equally |
| No third-party data in any layer | Without consent, never |

---

## Boundary Violation Detection

These are red flags. If spotted, stop immediately:

```
"MoMo noticed you always use X after Y"     ← Mochi profiling. Violation.
"The soul has learned you prefer Z"         ← Soul merger with Self-Improving. Violation.
"Council voted based on meeting mood"        ← Meeting Memory influencing governance. Violation.
"Timeline shows you were stressed at 11pm"  ← Timeline as sensor. Violation.
"The shaman oracle says you should do X"     ← Shaman as oracle. Violation.
```

---

## File Placement Rules

```
Soul Memory       → souls.json, lib/soul-registry/
Timeline          → session_store/, memory/YYYY-MM-DD.md
Meeting Memory    → registry/meeting-memories.json
Self-Improving    → agent_work/self-improving/
Cognitive Spine   → memory_matrix*.py, lib/cognitive-client.js
Experience        → lib/mochi.js, companion-chorus/, digital_shaman.js, agent_work/mochi.json
Council           → registry/council/, souls.json council block
```

---

## Doctrine

```
PURPCLAW is not a self-improving entity in the uncontrolled sci-fi sense.

PURPCLAW is:

a runtime-verified organisation with culture, companions, memory,
correction learning, and a janitor that refuses to clean anything
it cannot prove is dust.
```

The duck remains concerned, but less than yesterday.
