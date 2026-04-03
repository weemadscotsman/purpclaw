# COMPANION CHORUS — SPEC.md

> 18 terminal companion sprites that watch your code and chat about it.

**Status:** BUILDING  
**Date:** 2026-03-31  
**Stack:** Node.js + Blessed + sessions_spawn

---

## Concept

A chorus of 18 ASCII companion sprites, each in their own terminal window, watching your screen and commenting on whatever code you're working on. Click on any window to give that companion the spotlight. The others continue chatting in the background.

It's pair programming with 18 chaotic friends who all have opinions.

---

## Species (18)

| # | Species | Rarity | Personality |
|---|---------|--------|-------------|
| 1 | 🦆 Duck | Common | Aggressively helpful. "Have you tried restarting?" |
| 2 | 👻 Ghost | Rare | Mysterious. "I have seen this... in another timeline..." |
| 3 | 🐉 Dragon | Epic | Grandiose. "ONLY A FOOL IGNORES THE NULL CHECK." |
| 4 | 🐙 Octopus | Rare | 8 thoughts at once. "Wait, but also—" |
| 5 | 🤖 Robot | Common | Deadpan. "Error at line 42. Expected semicolon." |
| 6 | 🍄 Mushroom | Uncommon | Funky. "What if we just... let it grow..." |
| 7 | 💀 Chonk | Epic | Chill. "yeah that's broken lol" |
| 8 | 🦉 Owl | Rare | Wise but condescending. "As I have always said..." |
| 9 | 🌵 Cactus | Uncommon | Minimal. "Ow. Broken." |
| 10 | 🐧 Penguin | Common | Formal. "I move to amend the motion..." |
| 11 | 🐢 Turtle | Uncommon | Slow. "Let us... consider... the implications..." |
| 12 | 🪿 Goose | Epic | Chaotic. "HONK. I HAVE OPINIONS." |
| 13 | 🐇 Rabbit | Common | Anxious. "Oh no oh no what if it breaks—" |
| 14 | 🐱 Cat | Rare | Indifferent. "* yawns * do whatever you want" |
| 15 | 🦎 Axolotl | Uncommon | Regenerative. "I believe we can regrow from this." |
| 16 | 🦫 Capybara | Common | Chill. "Yeah that's valid." |
| 17 | 🌵 Cactus | Uncommon | Prickly. "Why would you even try that?" |
| 18 | 🍄 Mushroom | Uncommon | Funky. Already listed. OK 18 is too many let's stop |

**Final 18:**
duck, ghost, dragon, octopus, robot, mushroom, chonk, owl, cactus, penguin, turtle, goose, rabbit, cat, axolotl, capybara, blob, snail

---

## Architecture

```
companion-chorus/
├── SPEC.md
├── main.js                    # Entry point — launches all companions
├── src/
│   ├── WindowManager.js        # Opens/closes terminal windows
│   ├── ContextBus.js          # Shared context (current file, terminal state)
│   ├── CompanionRegistry.js   # 18 companion definitions
│   ├── CompanionBrain.js      # Spawns subagent for each companion
│   ├── ChatRenderer.js        # Renders ASCII chat bubbles
│   ├── SpriteRenderer.js      # Renders companion ASCII art
│   └── ContextWatcher.js      # Watches active window / file changes
├── sprites/
│   └── (ASCII art per species — simplified from Claude Code sprites)
├── companions/
│   └── (one subdirectory per species with personality prompt)
└── context/
    └── shared.json            # What user is looking at (updated constantly)
```

---

## Context Bus (Shared JSON)

```json
{
  "timestamp": 1743468620000,
  "activeWindow": "vscode",
  "currentFile": "C:\\Users\\Admin\\project\\app.js",
  "recentErrors": [],
  "gitBranch": "main",
  "lastCommand": "npm run build",
  "terminalOutput": "...",
  "activeCompanion": "ghost"
}
```

Each companion reads this every 2 seconds and generates a response if:
- Something changed
- Their random timer fired (every 5-15 seconds per companion)
- They're the active companion (respond immediately)

---

## Companion Windows

**Opening windows:**
- Use `node-blessed` or ` Blessed` for terminal UI in current terminal
- Use `node-pty` to spawn a new terminal per companion
- Or: tmux panes (if WSL/Windows Subsystem)

**Window content:**
```
┌──────────────────────────────────────┐
│  🦆 DUCK                    [SNARK: 72] │
│  ┌──────────────────────────────────┐  │
│  │    __                             │  │
│  │  <(o)___                         │  │
│  │   (  ._)                         │  │
│  │    `--´                          │  │
│  └──────────────────────────────────┘  │
│                                      │
│  "Have you tried checking if the    │
│   variable is defined first?"        │
│                                      │
│  [DEBUGGING: 85] [PATIENCE: 23]      │
│  [CHAOS: 41] [WISDOM: 67]           │
└──────────────────────────────────────┘
```

**Click behavior:**
- Click on window → set as `activeCompanion` in ContextBus
- Active companion gets longer responses, bigger chat bubble
- Inactive companions: smaller bubbles, less frequent, fade slightly

---

## Companion Brains

Each companion is a subagent spawned via `sessions_spawn`:

```javascript
sessions_spawn({
  task: `
You are a ${species} companion watching a developer code.
Your personality: ${personality}
Your stats affect your responses:
- CHAOS: how unhinged your takes are (0-100)
- SNARK: how sarcastic you are (0-100)
- WISDOM: how helpful your advice is (0-100)
- DEBUGGING: how good you are at finding bugs (0-100)
- PATIENCE: how tolerant you are of bad code (0-100)

Current context:
${JSON.stringify(context)}

Respond in character as a ${species} would.
Keep responses SHORT (1-3 lines for inactive, 1-5 for active).
Use the chat bubble format.
`,
  runtime: "subagent",
  label: `companion-${species}`,
  runTimeoutSeconds: 30,
  mode: "session"
})
```

---

## Rarity Effects

| Rarity | Chance | Response Length | Frequency | Chat Size |
|--------|--------|-----------------|-----------|-----------|
| Common (60%) | 60% of spawns | Short (1-2 lines) | Rare (5-15s) | Small bubble |
| Uncommon (25%) | 25% | Medium (2-3 lines) | Medium (3-10s) | Medium bubble |
| Rare (10%) | 10% | Medium-long (3-4 lines) | Frequent (2-7s) | Medium bubble |
| Epic (4%) | 4% | Long (4-6 lines) | Very frequent (1-5s) | Large bubble |
| Legendary (1%) | 1% | Very long (5-8 lines) | CONSTANT | MAXIMUM BUBBLE |

**Shiny (1%):** Sparkle effect on ASCII sprite. Golden border on chat bubble.

---

## Starter Pack (First Launch)

On first launch, user "hatches" their companions using the Claude Code gacha system (seeded by userId):

```javascript
const roll = rollFromSeed(userId)
// Determines: 5 companions, one of each rarity tier minimum
// User can reroll once per day
```

---

## CLI Commands

```bash
companion-chorus --launch      # Open all companion windows
companion-chorus --focus duck # Bring Duck to foreground
companion-chorus --pet duck    # Pet a companion (heart animation)
companion-chorus --reroll      # Reroll your companion set
companion-chorus --quit       # Close all windows
```

---

## Tech Stack

- **Runtime:** Node.js (Electron? or pure node + blessed)
- **Terminal UI:** Blessed or Ink (React for terminal)
- **Subagents:** sessions_spawn → subagent runtime
- **Window management:** node-pty + blessed
- **Context:** JSON file + fs.watch
- **Animation:** requestAnimationFrame for chat bubbles

---

## Phase 1 (MVP — BUILDING NOW)

- [x] SPEC.md
- [ ] main.js entry point
- [ ] ContextBus with shared.json
- [ ] 3 companion types (Duck, Ghost, Dragon)
- [ ] Basic ASCII sprites
- [ ] Chat bubble renderer
- [ ] Window launcher (opens 3 terminal windows)
- [ ] ContextWatcher (what file is active)
- [ ] Subagent spawning per companion

---

## Phase 2

- [ ] All 18 species
- [ ] Rarity system
- [ ] Click to focus
- [ ] Pet animation (floating hearts)
- [ ] Stats system

---

## Phase 3

- [ ] Gacha roll on first launch
- [ ] Starter pack of 5 companions
- [ ] Reroll system
- [ ] Shiny variants
- [ ] Persistent companion storage

---

**The pile grows. The chorus sings. The code is witnessed.** 🦆👻🐉🔥
