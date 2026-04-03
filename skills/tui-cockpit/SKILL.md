---
name: tui-cockpit
description: How to build PurpClaw terminal user interfaces (TUI) — both pure ANSI and blessed-based. Status bars with token tracking, live polling, Mochi sprite integration, slash commands, chat log, info panels. Covers scripts/tui.js, tui-ask.js, and tui-ng.js.
when_to_use: Building or modifying any PurpClaw TUI surface; adding status bars, chat input, info panels, or Mochi sprites to a terminal UI; debugging TUI rendering on Windows git-bash
---

# TUI Cockpit — Building PurpClaw Terminal Interfaces

PurpClaw has three TUI surfaces:

| command | file | type | features |
|---|---|---|---|
| `purpclaw tui` | `scripts/tui.js` | pure ANSI | read-only dashboard, 6 tabs, service health |
| `purpclaw tui ask` | `scripts/tui-ask.js` | pure ANSI | streaming agent chat, slash commands, 70/30 split |
| `purpclaw tui ng` | `scripts/tui-ng.js` | blessed | Mochi sprites, live panels, animated |

## Architecture principles

1. **No external deps for ANSI TUIs.** `tui.js` and `tui-ask.js` use raw ANSI escape codes — zero npm deps, zero build step.
2. **blessed for widget-based TUIs.** `tui-ng.js` uses the `blessed` package (already installed) for box widgets, scrolling, and tags.
3. **Always require TTY.** Every TUI must check `process.stdin.isTTY` at startup and bail gracefully if not. No crashes in CI.
4. **Live polling, not push.** Status data (PM2 health, agent counts, service states) is polled every 5s via `setInterval`. SSE subscriptions are optional for events.
5. **Mochi sprites, not emoji.** Use the real `lib/mochi-sprites.js` engine (18 species, 3 frames, eye expressions). Never recreate Mochi with simple emoji.

## Status bar requirements

Every TUI must show in its top status bar:
- **provider name** (e.g., ollama, deepseek)
- **model name** (e.g., deepseek-v4-pro, auto)
- **services online count** (e.g., 4/5 svc)
- **agents active** (e.g., 0ag)
- **MCP tools loaded** (e.g., 42mcp)
- **token usage** (prompt + completion in K, e.g., 0.6k tok)
- **token savings** from OmniCode (estimated, e.g., ~240 saved)
- **tool calls + turns** (e.g., 2tools 3turns)
- **ready/thinking indicator**

Bottom bar must show: shortcuts + running totals of tokens/saved/actions.

## ANSI TUI pattern (`tui-ask.js` reference)

```
Layout (top to bottom):
  1. Status bar     (provider · model · services · agents · tools · tokens · actions · ready)
  2a. Chat log      (user prompts, agent text, tool calls/results) [70% width]
  2b. Info panel    (SERVICES, AGENTS, TOOLS, TOKENS, ACTIONS, poll age) [30%, side-by-side]
  3. Input box      (Enter=submit, Esc=clear, Ctrl+C=exit)
  4. Help bar       (shortcuts left, token/action totals right)
```

**Key implementation details:**
- Use raw ANSI escape codes only — no `chalk`, no `colors`, no blessed.
- Color constants as inline `\x1b[NNm` strings, not module-scope variables (they're fragile).
- Chat rendering: `wrapText()` for word-wrap respecting ANSI codes. Tool calls: magenta `⚡ toolname`. Tool results: green `← ok` / red `← error`.
- `pollStatus()` runs `pm2 jlist` + `http.get('localhost:7790/tower/status')` every 5s.
- `redraw()` uses `POS(row, col)` for efficient selective redraw, not full clear.
- Chat + info panel rendered side by side: iterate `chatHeight` rows, rendering chat line (padded to 70%) + info line for each row.

**Token tracking (ANSI):**
```js
// On each 'done' event from the agent loop:
state.tokens.completion += tokens;
state.tokens.calls++;
state.actions.tools += toolCalls;
state.actions.turns = Math.max(state.actions.turns, turnCount);
// OmniCode savings: estimate ~2k tokens saved per MCP call
state.tokens.saved += Math.round(toolCalls * 0.3) * 2000;
```

## Blessed TUI pattern (`tui-ng.js` reference)

**Screen setup:**
```js
const screen = blessed.screen({ smartCSR: true, title: 'PurpClaw TUI v2', fullUnicode: true });
screen.key(['C-c'], () => process.exit(0));
```

**Widget hierarchy:**
- `topBar` (box, height 1) — provider/model/services/agents/tokens/actions/ready
- `mochiBox` (box, height 1, right: 0) — real Mochi sprite from `lib/mochi-sprites.js`
- `chatLog` (log, width 70%, scrollable) — scrolling chat with color tags
- `rightPanel` (box, width 30%) — parent for stacked panels
  - `svcBox` — services list
  - `agtBox` — agent counts
  - `tlsBox` — tool counts
  - `tokBox` — token breakdown
  - `actBox` — action counts
  - `pllBox` — poll age
- `statusBar` (box, bottom 2) — real Mochi statusbar integration
- `inputBox` (textbox, bottom 1) — user input
- `helpLine` (box, bottom 0) — shortcuts

**Mochi sprite integration (blessed):**
```js
const MOCHI_SPRITES = require('./lib/mochi-sprites');
let mochiFrame = 0, mochiSpecies = 'axolotl', mochiEye = '✦';
let mochiAnimInterval = null;

function renderMochi() {
  const lines = MOCHI_SPRITES.renderSprite({ species: mochiSpecies, eye: mochiEye, hat: 'none' }, mochiFrame);
  return lines[Math.floor(lines.length/2)].trim();
}

function setMochiMood(mood) {
  const eyeMap = { idle: '·', happy: '✦', thinking: '◉', sad: '°', alert: '@' };
  mochiEye = eyeMap[mood] || '·';
  mochiBox.setContent(renderMochi());
  screen.render();
  if (mood === 'thinking') {
    if (!mochiAnimInterval) mochiAnimInterval = setInterval(() => { mochiFrame = (mochiFrame + 1) % 3; mochiBox.setContent(renderMochi()); screen.render(); }, 400);
  } else {
    if (mochiAnimInterval) { clearInterval(mochiAnimInterval); mochiAnimInterval = null; }
  }
}
```

## Pitfalls

1. **`shell: true` doesn't work with `.cmd` files.** On Windows, `exec('pm2.cmd', ...)` fails with EINVAL unless `shell: true`. The fix is to use the underlying Node.js script: `exec('node', ['path/to/pm2/bin/pm2', ...])`.

2. **TTY detection must come first.** If `process.stdin.isTTY` is false, bail immediately with a helpful message. Non-TTY tests will still pass gracefully.

3. **ANSI color constants must be inline.** `FG_CYAN`, `RESET` etc. are NOT defined in `lib/commands/ask.js` scope. Use raw `\x1b[36m` etc.

4. **Chat rendering performance.** Redraw only on state change, not every frame. Throttle token re-renders (every 32 tokens vs every token) in ANSI TUIs.

5. **Never recreate Mochi.** The real sprite engine at `lib/mochi-sprites.js` has 18 species, 3 frames, eye expressions, and hats. Use it. Don't use emoji.

## Testing TUIs

- Non-TTY test: `timeout 3 node scripts/tui-ask.js` should print "requires a TTY" and exit 0.
- Blessed test: `node --check scripts/tui-ng.js` must pass.
- Both TUI surfaces must be wired in `bin/purpclaw.js` case 'tui': `tui` for cockpit, `tui ask` for ANSI chat, `tui ng` for blessed.
