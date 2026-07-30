# AUDIT - Wave 1 / Priority 0 item 1: One canonical agent runtime

Canonical authority:
[`docs/parity/CANONICAL_PARITY_PRIORITY.md`](./CANONICAL_PARITY_PRIORITY.md).
This file is non-authoritative audit evidence for Priority 0 item 1
(`docs/parity/CANONICAL_PARITY_PRIORITY.md:94`).

**Current verdict: FAIL.**

## Evidence basis

The original version declared Git snapshot `887ac7c`, but most of its cited
runtime files were untracked at that commit. The audit was later added by
commit `34f985e` despite its own no-commit statement. Those facts made the
original evidence irreproducible from the declared commit.

This revision makes no claim about the contents of `887ac7c`. It is bound to the
current working tree by
`docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME_EVIDENCE.json`, generated with:

```powershell
npm run audit:runtime-evidence
```

The sidecar records the audit hash, Git HEAD and branch, tracking and dirty
state, full-file SHA-256, and cited-line SHA-256 for every fully qualified
`file:line` citation. The repository is being edited concurrently, so the
sidecar, not a stale prose SHA, identifies the exact audited content.

## Definition of done

The canonical requirement says every surface must use the same agent loop,
tool registry, provider layer, session store, permission engine, skills, hooks,
memory, and configuration. A CLI session must resume unchanged in desktop and
web with identical tools, permissions, and history
(`docs/parity/CANONICAL_PARITY_PRIORITY.md:96`,
`docs/parity/CANONICAL_PARITY_PRIORITY.md:111`).

| Criterion | Status | Current evidence |
|---|---|---|
| Agent loop | **FAIL** | The CLI default uses `AgentGateway` (`lib/commands/ask.js:950`, `lib/commands/ask.js:1032`), but a legacy CLI branch calls `runAgentRouted` directly (`lib/commands/ask.js:1049`, `lib/commands/ask.js:1069`). Unified API calls `runAgentRouted` directly (`unified_api.js:503`, `unified_api.js:4411`), and Agent Tower calls `runAgent` directly (`agent_tower.js:281`). |
| Tool registry and permission engine | **FAIL** | Canonical gateway execution constructs a `ToolRuntime` (`lib/agent-gateway.js:192`, `lib/agent-gateway.js:193`). Unified API still has dynamic-skill execution before the gate (`unified_api.js:1143`), an opt-out legacy path (`unified_api.js:1177`), and a large direct-dispatch fallback list (`unified_api.js:1121`, `unified_api.js:1165`). Read-only chat filtering is not enforced (Finding B). |
| Provider layer | **PARTIAL** | Routed agents share `routing-decisions` and `llm-provider`; explicit providers now win (`lib/agent-router.js:52`, `lib/llm-provider.js:1191`, `lib/llm-provider.js:1337`). A second provider-router remains for status/settings surfaces (`lib/runtime/provider-router.js:71`, `app/api/providers/route.ts:29`) and is not the execution router. |
| Session store | **FAIL** | Gateway and CLI ask use `session-repository` (`lib/agent-gateway.js:4`, `lib/commands/ask.js:27`). The web sessions route uses `session-store` (`app/api/sessions/route.ts:8`), while chat history also uses the spine sidecar (`app/api/chat/route.ts:222`, `lib/spine/session-store.js:36`). |
| Skills | **PARTIAL** | The main agent path exposes its registry through `ToolRuntime.catalog` (`lib/tool-runtime.js:36`), but Unified API can execute separately loaded dynamic skills before `ToolRuntime` (`unified_api.js:1143`). |
| Hooks | **FAIL** | The agent loop emits to two independent buses (`lib/agent-loop.js:35`, `lib/agent-loop.js:36`) and bypass paths do not gain gateway-level behavior. |
| Memory | **FAIL / UNKNOWN convergence** | The loop independently wires scoped memory, cognitive client, and memory client (`lib/agent-loop.js:42`, `lib/agent-loop.js:74`, `lib/agent-loop.js:75`). No proof establishes one canonical memory contract across every surface. |
| Configuration | **FAIL** | Runtime routing reads provider configuration (`lib/routing-decisions.js:55`, `lib/routing-decisions.js:348`), while provider resolution also reads environment/config directly (`lib/llm-provider.js:322`), PM2 declares per-process environment (`ecosystem.config.js:75`), governance reads a project policy file (`lib/governance.js:27`), and Settings OS persists multiple scopes (`lib/runtime/settings-registry.js:12`). |
| CLI -> desktop/web resume unchanged | **FAIL** | CLI ask persists through `session-repository`; the web sessions API lists and saves through `session-store`. A repository-level restart/resume probe passes, but it is not cross-surface proof. No desktop client was exercised in this audit. |

The canonical runtime is executable, but it is not yet canonical across
surfaces. A successful module load or a 20/20 sprint label does not satisfy the
cross-surface definition of done.

## A. Current entry-point map

| Surface | Current path | Conformance |
|---|---|---|
| `purpclaw ask` | `AgentGateway.submit` (`lib/commands/ask.js:1032`) -> routed agent -> `runAgent` | Canonical path |
| `PURPCLAW_LEGACY_AGENT=1 purpclaw ask` | `runOneShotLegacy` (`lib/commands/ask.js:948`) -> `runAgentRouted` (`lib/commands/ask.js:1069`) | Gateway bypass |
| TUI ask | shared gateway submit (`scripts/tui-ask.js:467`) | Canonical path |
| Unified API chat | direct `runAgentRouted` for SSE and JSON (`unified_api.js:503`, `unified_api.js:4411`) | Gateway bypass |
| Agent Tower | direct `runAgent` (`agent_tower.js:281`) | Router and gateway bypass |
| Next.js web chat | proxy to Unified API (`app/api/chat/route.ts:31`, `app/api/chat/route.ts:116`); network failure falls back to `chat-agent` (`app/api/chat/route.ts:211`, `app/api/chat/route.ts:214`) | Both paths bypass gateway |
| Next.js sessions API | direct `session-store` (`app/api/sessions/route.ts:8`) | Different store from CLI ask |
| MCP server | tools go through `ToolRuntime` (`lib/mcp-server.js:37`, `lib/mcp-server.js:245`); no conversational agent loop | Tool-only surface |
| ACP server | `AgentGateway` client (`lib/acp-server.js:1`) | Canonical path by reading; not exercised here |

## B. Permission findings

### Fixed and independently probed

`ToolRuntime.invoke` evaluates the selected permission profile before execution
(`lib/tool-runtime.js:63`). The permission evaluator now checks explicit rules
before wildcard fallbacks (`lib/permission-manager.js:165`,
`lib/permission-manager.js:173`). MCP aliases are
normalized, checked, and sent through `ToolRuntime`
(`lib/mcp-server.js:231`, `lib/mcp-server.js:234`,
`lib/mcp-server.js:245`).

The focused permission test passes:

```text
node scripts/test-permission-manager.js
permission manager: OK
```

### Still open

1. Unified API executes `loadedSkills[name]` before entering its
   `ToolRuntime` branch (`unified_api.js:1143`, `unified_api.js:1149`).
2. `PURPCLAW_API_TOOL_GATE=0` restores direct `runTool` dispatch
   (`unified_api.js:1177`).
3. The sanctioned direct-dispatch list includes effectful operations such as
   keyboard, mouse, browser, HTTP, download, process kill, and service control
   (`unified_api.js:1124`, `unified_api.js:1131`,
   `unified_api.js:1136`).
4. `chatWithTools` passes `opts.tools` into `runAgent`
   (`lib/chat-agent.js:70`), but `runAgent` selects tools from
   `opts.toolRuntime` or a new default runtime (`lib/agent-loop.js:419`,
   `lib/agent-loop.js:440`). Callers requesting `READONLY_TOOLS` therefore do
   not constrain execution.

The historical double-execution defect in `chat-agent` is fixed: it now
consumes `tool-result` emitted after `ToolRuntime.invoke`
(`lib/chat-agent.js:58`, `lib/chat-agent.js:76`,
`lib/agent-loop.js:676`).

## C. Provider findings

Runtime routing now applies user provider settings and preserves explicit
overrides:

- User lane settings are loaded and applied in
  `lib/routing-decisions.js:55` and `lib/routing-decisions.js:348`.
- Explicit lane provider overrides win in `lib/routing-decisions.js:370`.
- The agent router passes the resolved provider to `runAgent`
  (`lib/agent-router.js:92`, `lib/agent-router.js:100`).
- Both non-streaming and streaming provider calls honor `opts.provider`
  (`lib/llm-provider.js:1191`, `lib/llm-provider.js:1337`).
- Automatic provider fallback can be disabled with
  `LLM_NO_AUTO_FALLBACK=1` (`lib/llm-provider.js:1058`).

The routing acceptance suite passes 33 tests:

```text
node --test lib/__tests__/routing-decisions.test.js
tests 33
pass 33
fail 0
```

This is meaningful repair evidence, but not proof that every surface shares one
provider policy. `lib/runtime/provider-router.js` remains a separate resolver
used by provider/status APIs rather than agent execution.

## D. Session findings

The session layer remains the decisive blocker:

1. `AgentGateway` creates and saves sessions through `session-repository`
   (`lib/agent-gateway.js:133`, `lib/agent-gateway.js:163`).
2. CLI ask resumes and saves through that same repository
   (`lib/commands/ask.js:892`, `lib/commands/ask.js:1067`).
3. The web sessions API lists and saves through `session-store`
   (`app/api/sessions/route.ts:20`, `app/api/sessions/route.ts:35`).
4. Unified API chat and the Next.js fallback use `spine/session-store`
   (`unified_api.js:410`, `app/api/chat/route.ts:222`).
5. The spine store writes a separate sidecar before best-effort mirroring to
   the main store (`lib/spine/session-store.js:65`,
   `lib/spine/session-store.js:76`).

Two separate Node processes successfully created, reopened, appended to, and
reloaded one `session-repository` session. That proves local restart persistence
only. It does not prove the canonical CLI -> web -> desktop acceptance path.

## E. Executable probes

These probes were run from the project root on 2026-07-29:

| Probe | Result |
|---|---|
| `node -e "require('./lib/agent-gateway')"` | PASS |
| `node bin/purpclaw.js ask --help` | PASS, exit 0 |
| `node scripts/test-permission-manager.js` | PASS |
| `node --test lib/__tests__/routing-decisions.test.js` | PASS, 33/33 |
| `npm run audit:runtime-evidence` | PASS, all fully qualified citations resolved |
| `npm run docs:gate` | PASS, exactly one canonical parity authority |

PM2 state and tool counts are deliberately not treated as stable audit facts.
They can change while other lanes are working.

## F. Required builder order

1. **Session adapter first.** Make CLI ask, web sessions, Unified API chat,
   gateway, and desktop use one session contract and one pinned storage target.
2. **Cross-process acceptance test.** Create in CLI, terminate the process,
   resume through web/API, compare ordered history and metadata, then exercise
   the desktop client or mark desktop unavailable.
3. **Close permission bypasses.** Route dynamic skills and every effectful
   Unified API tool through `ToolRuntime`; remove the production opt-out.
4. **Enforce read-only tool scopes.** Construct a filtered `ToolRuntime` for
   `chat-agent` callers rather than passing ignored `opts.tools`.
5. **Converge entry points.** Move Unified API, Agent Tower, and the web fallback
   behind `AgentGateway`, then remove the legacy CLI branch.
6. **Unify hooks, memory, and configuration.** Do this after session and tool
   identity are stable so migration tests have a single behavioral target.

## Explicitly unknown

- Desktop runtime path and whether a usable desktop client is currently
  installed.
- End-to-end CLI -> web -> desktop continuity under real services.
- Whether all memory clients converge behind one durable backend.
- Whether every sanctioned Unified API fallback has a canonical registry
  equivalent.

These unknowns block conformance. They are not inferred as passes from file
presence, registration counts, or sprint status.
