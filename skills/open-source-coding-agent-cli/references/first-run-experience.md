# First-Run Experience — Launch Menu System

## Overview
Added 2026-06-06 as part of v0.1.3+. When a user installs purpclaw and runs it with no arguments, they get:
1. Auto-detection of API keys from .env and process.env
2. Provider count display (✅ ready / 🆓 free / ❌ needs key)
3. A 7-option launch menu
4. Immediate launch of the chosen surface

## Implementation

In `bin/purpclaw.js`, the no-args handler (line ~3754) was replaced:

```js
if (!command) {
    const setup = require(path.join(PURP_DIR, 'lib', 'commands', 'setup'));
    const found = setup.scanForKeys();
    const ready = Object.keys(found).length;

    // Show provider status
    console.log(col(C.green, `✅ ${ready} provider(s) detected:`));

    // Show launch menu
    console.log(col(C.cyan, `1. CLI chat`) + col(C.gray, '(purpclaw ask)'));
    console.log(col(C.cyan, `2. TUI cockpit`) + col(C.gray, '(purpclaw tui)'));
    console.log(col(C.cyan, `3. TUI ask`) + col(C.gray, '(full-screen chat)'));
    console.log(col(C.cyan, `4. WebUI`) + col(C.gray, '(mission control)'));
    console.log(col(C.cyan, `5. Setup wizard`) + col(C.gray, '(configure providers)'));
    console.log(col(C.cyan, `6. Guided tour`) + col(C.gray, '(TTS walkthrough)'));
    console.log(col(C.cyan, `7. Help`) + col(C.gray, '(all commands)'));

    // Read choice via readline
    // Map choices to commands in the dispatcher
}
```

## Menu Options

| choice | command dispatched | what happens |
|---|---|---|
| 1 | `command = 'ask'` | Interactive CLI chat with agent loop |
| 2 | `command = 'tui'` | Full-screen ANSI dashboard cockpit |
| 3 | `command = 'tui'; args = ['ask']` | Full-screen ANSI chat TUI |
| 4 | `exec('start http://localhost:3000')` | Opens browser to Mission Control |
| 5 | `command = 'setup'` | Interactive onboarding wizard |
| 6 | `command = 'tour'` | TTS-narrated guided walkthrough |
| 7 | `command = 'help'` | Show all commands |

## Key implementation details

1. The readline question is async — a setInterval polls for `command` to be set before dispatching
2. Option 4 (WebUI) calls `process.exit(0)` after opening browser — no further command dispatch
3. The setup and tour modules are loaded from `lib/commands/setup.js` and `lib/commands/tour.js`
4. Provider detection uses the same `scanForKeys()` from the setup wizard

## Personalized Tour (`lib/commands/tour.js`)

The tour (v0.1.4+) asks for user's name/nickname and interests before starting:

```js
async function getUserInfo() {
  const name = await ask('Your name or nickname: ');
  const interests = await ask('What kind of work do you do? ');
  return { name: name || 'friend', interests };
}
```

Every section uses `${user.name}` in greetings and TTS narration. Interest-based tips are shown for code-related work. The tour covers 11 sections: welcome, surfaces, providers, tools, agents, memory, immune system, voice, vision, ratchet, quickstart.

## Pitfalls

- The readline question blocks — use the setInterval polling pattern to detect when `command` is set
- WebUI option must `process.exit(0)` after browser open, not dispatch a command
- Provider detection from `setup.scanForKeys()` uses the same provider list as `llm-provider.js` — keep them in sync