# TUI v2 Architecture (blessed-based cockpit)

Three terminal surfaces coexist in PURPCLAW:

| command | surface | framework | features |
|---|---|---|---|
| `purpclaw tui` | ANSI cockpit | raw ANSI | read-only dashboard, 6 tabs, service health |
| `purpclaw tui ask` | ANSI chat | raw ANSI | streaming agent, 70/30 split, token stats |
| `purpclaw tui ng` | blessed cockpit v2 | `blessed` | Mochi sprites, live panels, slash commands |

## TUI v2 (`scripts/tui-ng.js`)

A `blessed`-based terminal dashboard with:
- Top bar: provider · model · svc · agents · mcp · tokens · saved · tools · turns · ready/thinking
- Right panel (30%): SERVICES · AGENTS · TOOLS · TOKENS (prompt/completion/total/saved/calls) · ACTIONS · poll age
- Left panel (70%): streaming chat log with tool call display
- Bottom bar: shortcuts + running token totals
- Mochi avatar: real sprite engine (18 species, 3-frame animation, eye expressions)
- Input box: slash commands wired to real APIs

### Dependencies
`blessed` (already installed). Stacked `blessed.box` widgets. No `blessed-contrib`.

### Key patterns
1. Mochi rendered via real sprites from `lib/mochi-sprites.js`, not emoji
2. `setMochiMood()` maps moods to eye expressions + anim toggle:
   - idle → · (static frame)
   - happy → ✦ (static)
   - thinking → ◉ (400ms animation cycle, frames 0→1→2)
   - sad → ° (static)
   - alert → @ (static)
3. Poll loop every 5s for API/tower/orchestrator health
4. Slash commands update Mochi mood: happy on spawn success, sad on failure, idle after 2s timeout
5. Token tracking: `state.tokens.completion` accumulates per-run, OmniCode savings estimated as `mcpCalls * 2000`

### Slash commands (wired to real APIs)
| command | API call |
|---|---|
| `/spawn duck "task"` | POST `/api/agents/spawn` |
| `/provider deepseek` | updates `state.provider` + top bar |
| `/model deepseek-v4-pro` | updates `state.model` + top bar |
| `/agents` | shows `state.agents` counts |
| `/help /clear /quit` | local |

### Mochi sync with API bridge
Polls `GET /api/mochi` on startup to load species, hat, and mood from agent_work/mochi.json. The Chrome extension POSTs updates to the same endpoint. One pet across all surfaces.
