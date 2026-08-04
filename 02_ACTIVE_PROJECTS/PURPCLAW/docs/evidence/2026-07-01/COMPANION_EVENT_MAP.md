# Companion Event Map

> How PURPCLAW events become pet reactions.
> Fun only. No enforcement.

## Event → Reaction Table

| Event | Pet Mood | Example Message |
|-------|----------|----------------|
| `job.started` | excited | "Ooh, something is happening!" |
| `job.finished` | happy | "Job done! I am spiritually fed. 😋" |
| `job.failed` | sad | "Aw no. That did not go to plan. 😢" |
| `agent.spawned` | excited | "The swarm grows." |
| `agent.finished` | normal | "Agent finished its mission." |
| `agent.failed` | sad | "An agent went down. 😢" |
| `flow.called` | thinking | "Something is being planned..." |
| `flow.stopped` | normal | "Flow stopped." |
| `system.startup` | happy | "PURPCLAW is awake! ☀️" |
| `system.error` | sad | "Uh oh. Something broke. 😬" |
| `provider.verified` | happy | "Provider online!" |
| `provider.failed` | sad | "Provider hiccup. Trying again..." |
| `build.started` | excited | "Build in progress! 🏗️" |
| `build.passed` | celebrating | "Build passed! I demand a biscuit." |
| `build.failed` | sad | "Build failed. The worst notification." |
| `idle.cycle.start` | tired | "Still breathing. Still loyal. 🐾" |

## Mood → Animation

| Mood | Animation | ASCII |
|------|-----------|-------|
| normal | idle | `(◕ᴥ◕)` |
| happy | happy | `(◕‿◕)` |
| celebrating | celebrating | `(✧ᴥ✧)` |
| excited | excited | `(◕ᴗ◕)!` |
| sad | sad | `(◕︵◕)` |
| tired | tired | `(◔‸◔)` |
| sleeping | sleeping | `(-ᴥ-)` |
| confused | confused | `(◕_◕)?` |
| thinking | thinking | `(◕.◕)` |
| sick | sick | `(@_@)` |

## Stat Decay (every 5 minutes)

| Stat | Change | Trigger |
|------|--------|---------|
| hunger | +3 | every tick |
| energy | -2 | every tick |
| happiness | -1 | every tick |

## Action Effects

| Action | Primary Effect | Secondary |
|--------|---------------|-----------|
| feed | hunger +35, happiness +10 | eating animation (8 ticks) |
| pet | happiness +15, affection +5 | love animation |
| play | happiness +20, energy -10 | playing animation (6 ticks) |
| sleep | energy +30 | sleeping action (4 ticks) |
| wake | energy +30, happiness +10 | normal mood |
| clean | cleanliness +80 | bathing animation (10 ticks) |
| heal | health +30, happiness +15 | happy mood |

## Pending Actions

When a pending action is active, the animation overrides mood:

- `eating` — shows food emoji, cycles eating frames
- `playing` — shows toy emoji, cycles play frames
- `bathing` — shows 🛁, cycles bathing frames
- `sleeping` — shows 💤, sleeping frames

## Session Indicators

The pet shows extra emoji in the status bar based on session activity:

| Condition | Indicator |
|-----------|-----------|
| session updates > 200 | 🔥 |
| session updates > 100 | 💪 |
| updates at 50/100/150 | ✨ |
| hunger < 20 | 🍖 |
| energy < 20 | 💤 |

## Event Source

Events are read from `lib/events.js` (PURPCLAW EventBus). The companion subscribes to:

- `job.*` — job lifecycle
- `agent.*` — agent lifecycle  
- `flow.*` — flow lifecycle
- `system.*` — system events
- `provider.*` — provider events
- `build.*` — build events

No enforcement. No violations. No blocking.
