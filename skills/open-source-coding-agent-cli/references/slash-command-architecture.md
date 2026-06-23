# Slash Command Architecture

13 slash commands in `lib/commands/ask.js` `SLASH_COMMANDS`. Each has `{ description, run(args, ctx) }`.

## Context object (`ctx`)

```js
ctx = { provider, model, history, maxTurns, _tokens, lastSlashResult }
```

## Command table

| command | type | what it does | ANSI |
|---|---|---|---|
| `/bigboss <cmd> [args]` | async | delegates to `lib/commands/bigboss.js` | — |
| `/model [name]` | sync | shows current or switches (name in ctx.model) | — |
| `/provider [name]` | sync | validates against 17 providers, switches | — |
| `/tools` | sync | color-coded: built-in (cyan) / G0DM0D3 (magenta) / MCP (green) | inline `\x1b[36m` etc. |
| `/mcp` | async | `mcp.loadServers()` → list servers + tool counts | `\x1b[32m` for server names |
| `/agents` | async | reads `skills/` dirs, groups by division from AGENT.md | `\x1b[35m` for division names |
| `/save [name]` | sync | persists ctx to `~/.purpclaw/sessions/<name>.json` | — |
| `/load [name]` | sync | restores ctx from saved session file | — |
| `/clear` | sync | `ctx.history.length = 0` | `\x1b[33m` yellow |
| `/cost` | sync | reads `ctx._tokens` accumulator | `\x1b[33m` |
| `/help` | sync | full command list + alias table | cyan/`\x1b[90m` for aliases |
| `/quit /exit` | sync | `process.exit(0)` | — |

## Bash compatibility

git-bash on Windows path-expands `/foo` → `C:/Program Files/Git/foo`. All commands work without leading `/` via `SLASH_ALIASES`:

```js
const SLASH_ALIASES = {
  'model': '/model', 'provider': '/provider', 'tools': '/tools',
  'mcp': '/mcp', 'clear': '/clear', 'help': '/help',
  'quit': '/quit', 'exit': '/exit', 'cost': '/cost',
  'save': '/save', 'load': '/load', 'agents': '/agents',
};
```

## ANSI color constants

`FG_CYAN`, `FG_GREEN`, `FG_MAGENTA`, etc. are NOT available in `lib/commands/ask.js` scope. Use inline `\x1b[36m`, `\x1b[32m`, etc. with manual `RESET` (`\x1b[0m`). The constants only exist in `scripts/tui.js` and `scripts/tui-ask.js`. Do NOT use template literals with FG_ constants in ask.js — they will throw ReferenceError.

## Slash command resolution

```js
function resolveSlashCommand(prompt) {
  if (prompt.startsWith('/')) {
    const [cmd] = prompt.split(/\s+/);
    return SLASH_COMMANDS[cmd] ? cmd : null;
  }
  // No-slash alias — for git-bash compat
  const [cmd] = prompt.split(/\s+/);
  return SLASH_ALIASES[cmd] || null;
}
```

Called at the top of `runOneShot()` and in `scripts/tui-ask.js` `submitInput()` to short-circuit the agent loop. The TUI's version uses `text.match(/^[\/]?([a-z][a-z0-9_-]*)/)` for both forms.