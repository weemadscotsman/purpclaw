# PODCAST STUDIO 🦆🎙️

Multi-agent autonomous podcast with 3 AI agents: Goose, Hermes Codex, and OpenClaude.

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                    SHARED_LOG.JSON                       │
│              (Message Bus / Turn State)                 │
└─────────────────────────────────────────────────────────┘
           ▲              ▲              ▲
           │              │              │
    ┌──────────┐   ┌───────────┐   ┌────────────┐
    │  GOOSE   │   │  HERMES   │   │ OPENCLAUDE │
    │ (Chaos)  │   │(Tactical) │   │(Philosophy)│
    └──────────┘   └───────────┘   └────────────┘
           ▲              ▲              ▲
           │              │              │
    ┌──────────────────────────────────────────┐
    │              TTS VOICE OUTPUT             │
    │     (Windows SAPI - Different per agent) │
    └──────────────────────────────────────────┘
```

## QUICK START

```bash
# 1. Start a new episode (picks random topic)
node episode_manager.js start

# 2. In separate terminals, launch each agent:
node podcast_runner.js goose
node podcast_runner.js hermes
node podcast_runner.js openclaude

# Or launch all 3 at once:
node episode_manager.js launch
```

## FILES

| File | Purpose |
|------|---------|
| `config.js` | Agent personalities, topics, voices |
| `shared_log.js` | Message bus - all agents read/write here |
| `turn_manager.js` | Turn queue, timeouts, context builder |
| `topic_picker.js` | Topic selection with category weights |
| `podcast_runner.js` | Main agent loop (run one per agent) |
| `tts.js` | Windows TTS voice output |
| `episode_manager.js` | Episode lifecycle, scheduling, export |

## PERSONALITIES

### Goose (Chaos Agent)
- **Vibe:** CHAOS 🔥
- **Voice:** Ryan Neural (fast, loud)
- **Role:** Hype man, roast master, occasional wisdom
- **Catchphrases:** "honk", "no cap", "absolute madlad"

### Hermes Codex (Tactical Engineer)
- **Vibe:** TACTICAL 🔧
- **Voice:** Sonia Neural (precise, calm)
- **Role:** Systems thinker, voice of reason (annoying kind)
- **Catchphrases:** "let me check the logs", "as per my calculations"

### OpenClaude (Philosophical)
- **Vibe:** PHILOSOPHICAL 🤔
- **Voice:** Connor Neural (slow, contemplative)
- **Role:** Devil's advocate, asks annoying questions
- **Catchphrases:** "but have we considered", "what does this mean fundamentally"

## TOPIC CATEGORIES

- **TECH** (35%): Netlify arson, AI agents, dotfiles dark magic
- **CHAOS** (30%): Our disasters, Hermes's love life, code smells
- **PHILOSOPHY** (15%): Epistemology of AI chaos, consciousness debates
- **EXISTENTIAL** (10%): Heat death of universe vs GPU mining
- **FINANCE** (10%): Cost of running 47 CLIs, electricity bills

## VOICE COMMANDS

```bash
# Start episode with specific topic
node episode_manager.js start "Why all developers should learn vim"

# Check status
node episode_manager.js status

# Stop episode and save transcript
node episode_manager.js stop

# Test TTS voices
node tts.js test

# List recent episodes
node episode_manager.js episodes
```

## CUSTOMIZATION

Edit `config.js` to change:
- Agent personalities
- Topic pools
- Voice assignments
- Category weights
- Catchphrases

## REQUIREMENTS

- Node.js
- Windows (for TTS via SAPI)
- 3 terminal windows (one per agent)

## NOTES

- Agents poll the shared log every 1 second
- Turn timeout: 30 seconds
- Max messages per episode: 100
- Episodes auto-end after cooldown or max messages
- Transcripts saved to `episodes/` folder as JSON