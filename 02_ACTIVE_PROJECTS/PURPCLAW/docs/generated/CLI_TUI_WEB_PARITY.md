> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# CLI / TUI / Web Parity Map

Generated during the 2026-06-19 routing/build documentation hardening pass.

## Surfaces

| Capability | CLI | TUI | Web |
|---|---|---|---|
| Chat | `purpclaw ask`, `purpclaw chat` | `purpclaw tui ask` -> `scripts/tui-ask.js` | `/mission` `CommandPanel`, `/api/chat` |
| Sessions | `/api/sessions*` via web; CLI direct command not yet first-class | Not yet mapped | Session sidebar in `/mission` |
| Trace logs | CLI commands print local output | TUI dashboard expected to show live status | `TraceTerminal`, `/api/trace/recent`, `/api/trace/stream` |
| Services | `purpclaw status`, `doctor`, `services`, `safe-start` | `purpclaw tui` -> `scripts/tui.js` | `/api/services`, cockpit header, system map |
| System map | `purpclaw architecture`, `ctx-viz`, docs | TUI dashboard partial | `/system-map`, `LiveSystemMap`, `/skyscraper` 3D view |
| Self-evolution | `purpclaw evolve`, `grow`, `autoresearch` | Dashboard status only unless implemented in TUI | `/evolution`, `/api/evolution/status` |
| Harness/jobs | `purpclaw harness`, `bigboss jobs list` | Dashboard job panels | `/mission/harness`, `/api/harness/*`, `/api/kernel/jobs` |
| Agents | `purpclaw roster`, `bigboss agents list` | Dashboard status | `/agents`, tower APIs/streams |
| Providers | `purpclaw llm`, provider status commands | Dashboard status | `/providers`, `/api/providers`, `/api/llm-status` |
| OMNI truth | `purpclaw ponytail`, OMNI commands | Not fully mapped | `/omni`, `/api/omni/*` |

## Known Gaps

| Gap | Current State | Follow-up |
|---|---|---|
| Saved sessions from CLI/TUI | Web has durable APIs; CLI/TUI session loader not confirmed | Add CLI session list/load/export wrappers if operator wants parity |
| TUI system map | CLI launches TUI scripts, but this pass did not visually verify TUI panels | Run TUI smoke in an interactive terminal |
| Bigboss reporting adapters | Prior audit found stale status/agents/memory adapters | Fix `lib/commands/bigboss.js` against canonical endpoints |
| Trace source completeness | Web trace aggregator exists; not every backend source emits normalized traces yet | Add emitters to tower/orchestrator/eventbus/harness as needed |
| `/command-center` | Folder exists without page route | Either wire a real page or remove from navigation references after approval |
| `/particle-viz` | Folder exists without page route | Same: wire or quarantine |

## Rule

Parity means the same capability is reachable and truthful from CLI, TUI, and Web. It does not mean every UI must look the same.
