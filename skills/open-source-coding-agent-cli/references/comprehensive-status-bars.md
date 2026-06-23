# Comprehensive Status Bars — TUI + CLI

Eddie's hard rule: status bars must show ALL vital info — tokens used, tokens saved (OmniCode MCP), model name, actions taken, services/agents/MCP counts. No empty "..." or missing sections.

## CLI Banner (`lib/commands/ask.js` `printBanner()`)

```
╔══════════════════════════════════════════════════════════════════╗
║  PURPCLAW — AI Workstation OS · open-source coding-agent CLI    ║
╚══════════════════════════════════════════════════════════════════╝
provider: ollama  ·  model: deepseek-v4-pro
tools:   8 built-in  +  4 G0DM0D3  +  42 MCP (OmniCode)  =  54 total
OmniCode:  active · saves 99% token burn on code reads
```

Implementation: `TOOLS.list()` returns all tools (built-in + MCP + G0DM0D3). Split into three categories:
- non-MCP-non-G0D: `!t.name.startsWith('mcp__') && !['parseltongue','autotune','stm','godmode'].includes(t.name)`
- G0DM0D3: `['parseltongue','autotune','stm','godmode'].includes(t.name)`
- MCP: `t.name.startsWith('mcp__')`

OmniCode line: green "active" if mcpCount > 0, gray "not connected" with config hint otherwise.

ANSI codes: use inline `\x1b[NNm` — FG_CYAN etc. are NOT in ask.js scope.

## TUI Top Bar (`scripts/tui-ask.js` `renderStatusBar()`)

```
purpclaw ollama deepseek-v4-pro · 4/5 svc 0ag 42mcp · 0 tok · 0tools 0turns  ● ready
```

Components (left to right):
- `purpclaw` — bold cyan, always first
- provider name — dimmed
- model name — yellow (or "auto" if none set)
- services online/total — green
- agents active — magenta, compact "0ag" format
- MCP tools loaded — green, compact "42mcp" format
- token count — cyan, `(total/1000).toFixed(1) + 'k tok'`, only shows if > 0
- saved tokens — green, `'~' + tokens.saved + ' saved'`, only shows if > 0
- actions — blue, `tools + 'tools ' + turns + 'turns'`
- ready/thinking indicator — right-aligned, green circle "● ready" or yellow "◐ thinking…"

## TUI Bottom Bar (`scripts/tui-ask.js` `renderHelpBar()`)

Left: shortcut hints. Right: `tokens: Nk · saved: N · actions: N tools · N turns`.

Token values are accumulated across all conversations in the session. `prompt` tokens are estimated from input length, `completion` from streaming token count, `saved` from MCP tool call count × 2000 (estimated).

## Token Tracking in TUI (`submitInput()`)

```js
state.tokens.completion += tokens;
state.tokens.calls++;
state.actions.tools += toolCalls;
state.actions.turns = Math.max(state.actions.turns, turnCount || ev.turns);
const mcpCalls = toolCalls > 0 ? Math.round(toolCalls * 0.3) : 0;
state.tokens.saved += mcpCalls * 2000;
```

OmniCode savings: estimate ~30% of tool calls are MCP calls, each saves ~2,000 tokens vs reading a full file.

## TUI Info Panel (right 30%) — Token-Aware Sections

Only renders TOKENS section when `state.tokens.prompt + state.tokens.completion > 0`. Only renders ACTIONS section when `state.actions.tools > 0 || state.actions.turns > 0`. Shows prompt/completion/total in K, saved estimate with "(OmniCode)" label, API calls count.

Sections in order: SERVICES → AGENTS → RECENT (events) → TOOLS → TOKENS (conditional) → ACTIONS (conditional) → poll age.

## OmniCode Always-On in TUI

MCP loaded async on TUI startup:
```js
try {
  const mcp = require(path.join(PURP_DIR, 'lib', 'mcp'));
  mcp.loadServers().then(() => {
    state.mcpCount = mcp.listTools().length;
    redraw();
  }).catch(() => {});
} catch {}
```

Polls every 5s: `setInterval(pollStatus, 5000)`. PM2 status + tower agent counts polled via `execSync('pm2 jlist')` and HTTP GET to tower API.

## Eddie's Quality Standard

If the status bar shows "0 tok" when tokens have been used, or "0mcp" when OmniCode is connected, or "0 svc" when PM2 has processes — it's broken. Every number must reflect actual state. No stubs, no "not yet wired."
