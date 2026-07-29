# AUDIT — Wave 1 / Priority 0 item 1: "One canonical agent runtime"

**This file replaces an earlier same-named audit (dated 2026-07-29, marked
SUPERSEDED) with a deeper, execution-verified pass.** The authoritative parity
roadmap remains
[`docs/parity/CANONICAL_PARITY_PRIORITY.md`](./CANONICAL_PARITY_PRIORITY.md);
this document only reports on §"Priority 0 → 1. One canonical agent runtime"
(lines 94–113 of that file).

Scope: **audit only**. No runtime code was moved, renamed, merged, refactored or
deleted. This document is the only file created. Nothing was committed.

Date: 2026-07-29. Repo: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW` @ `887ac7c`.

Every claim is labelled `verified-by-reading` or `verified-by-running <command>`.
Where a claim could not be established, it says **UNKNOWN**. Every path cited was
confirmed to exist.

---

## 0. Definition of done — PASS / FAIL / UNKNOWN

P0-1 requires: *"a session started in the CLI resumes unchanged in desktop and
web, with identical tools, permissions and history"*, and that every surface
shares one agent loop, tool registry, provider layer, session store, permission
engine, skills, hooks, memory and configuration.

| Criterion | Status | Evidence |
|---|---|---|
| Single agent loop | **FAIL (partial)** | `lib/agent-loop.js:382 runAgent` is the only real loop, but three different *entries* wrap it with different options: gateway (`lib/agent-gateway.js:219`), raw router (`unified_api.js:503`, `lib/commands/ask.js:671`), raw loop (`agent_tower.js:424`, `lib/core/work-engine.js:235`, `lib/chat-agent.js:68`). |
| Single tool registry | **FAIL** | Three registries: `lib/tools/index.js` (515 tools), `unified_api.js:1005` (70 hardcoded tools + `runTool` at `:1151`), `lib/mcp-server.js:210 handleBuiltinTool` (own `execSync` bash / `fs.writeFileSync`). |
| Single provider layer | **FAIL** | `lib/llm-provider.js:333 resolveConfig` (env-only) is what the agent loop actually uses; `lib/runtime/provider-router.js:71 resolveLane` (user-config aware) is used only by `/api/providers`, `/api/heartbeat`, `lib/system-manifest.js`, `lib/model-sentinel.js`, `scripts/heartbeat.js`. The settings UI does not steer the runtime. |
| Single session store | **FAIL** | Four stores, three with live data on disk (§3.1). |
| Single permission engine | **FAIL** | `lib/tool-runtime.js` is bypassed by `unified_api.js:1097 executeTool`, `lib/mcp-server.js:210`, `lib/chat-agent.js:41`. |
| Skills | **PASS (single)** | `lib/skill-registry.js` used by the gateway (`lib/agent-gateway.js:356`); `lib/tools/skills-registry.js` registers 380 Hermes skills *into the same* `lib/tools` registry — verified-by-running `node -e "require('./lib/tools')"` (prints `[SKILLS] Registered 380 Hermes skills as native tools`). |
| Hooks | **FAIL (two buses)** | `lib/hooks/lifecycle-bus` and `parity/hooks/engine` are both fired side by side from `lib/agent-loop.js:35-36`, `:641-643`. Surfaces that never enter the loop fire neither. |
| Memory | **UNKNOWN / at least two** | `lib/memory-client.js` (HTTP :7880) and `lib/scoped-memory.js` (SQLite) are both wired into `lib/agent-loop.js:60,42`. Whether they converge behind the spine service was not established — the spine is not running. |
| Configuration | **FAIL** | Read from `.env` (with and without `override:true`), PM2 `env:` blocks, `~/.purpclaw/provider-config.json`, `~/.purpclaw/config.json`, `purpclaw_policy.json`, `lib/runtime/settings-registry.js`. Precedence differs per reader (§4). |
| **Session started in CLI resumes in web with identical tools, permissions and history** | **FAIL** | (a) `purpclaw ask` and web `/api/chat` both currently throw at import (§1.1); (b) even when working, the store path is `process.cwd()`-relative, so a CLI run outside the repo writes a different DB; (c) `purpclaw session list` reads a different store entirely (§3.1); (d) tools and permission profiles differ per surface (§5). |

**Overall: FAIL.** A credible canonical runtime exists in design
(`AgentGateway` → `runAgentRouted` → `runAgent` → `ToolRuntime` → `lib/tools`)
and several surfaces are already correctly wired to it — but it is currently
**non-executable**, and three high-traffic surfaces bypass it.

---

## 1. Runtime entry points

### 1.1 BLOCKER — the canonical runtime is dead-on-require right now

`lib/session-repository.js:5`:

```js
const { DatabaseSync } = require('better-sqlite3');
```

`better-sqlite3@13.0.1` (`package.json` dependency `^13.0.1`) exports a
`Database` constructor function plus `SqliteError`. It has **no** `DatabaseSync`.
`DatabaseSync` is the **`node:sqlite`** builtin API.

- verified-by-running `node -p "Object.keys(require('better-sqlite3'))"` → `[ 'SqliteError' ]`
- verified-by-running `node -p "require('better-sqlite3/package.json').version"` → `13.0.1`
- verified-by-running `node -p "Object.keys(require('node:sqlite'))"` → `[ 'DatabaseSync', 'StatementSync', 'Session', 'constants', 'backup' ]`
- verified-by-running `node -e "require('./lib/agent-gateway')"` → `gateway FAILED: DatabaseSync is not a constructor`
- verified-by-running `node bin/purpclaw.js ask --help` → `[X] Unhandled error: DatabaseSync is not a constructor`

The same wrong import appears in **22 modules** — verified-by-running
`rg "DatabaseSync\} *= *require\(|DatabaseSync \} = require\("`:

`lib/session-repository.js:5`, `lib/session-state-service.js:1`,
`lib/agent-component.js:1`, `lib/a2a-runtime.js:2`, `lib/workflow-manager.js:2`,
`lib/attachment-manager.js:2`, `lib/artifact-manager.js:2`,
`lib/trace-manager.js:2`, `lib/cron-manager.js:4`, `lib/telemetry-manager.js:1`,
`lib/team-manager.js:2`, `lib/task-manager.js:1`, `lib/graph-runtime.js:1`,
`lib/goal-manager.js:1`, `lib/event-workflow.js:1`, `lib/event-ledger.js:1`,
`lib/eval-manager.js:2`, `lib/program-optimizer.js:1`,
`lib/invocation-manager.js:1`, `lib/index-manager.js:2`,
`lib/messaging-runtime.js:3`, `lib/scoped-memory.js:42`.

Consequence chain:

- `lib/agent-gateway.js:4` requires `session-repository` **unguarded** → every
  gateway consumer throws: `purpclaw ask`, `purpclaw tui ask`, ACP server, A2A /
  JSON-RPC gateway server, cron, delegation, messaging, and the default web
  `/api/chat` path.
- `lib/agent-loop.js:54` requires it **inside try/catch** → returns `null`, so
  the loop keeps running with **session persistence silently disabled**.
  verified-by-running
  `node -e "const S=(()=>{try{return require('./lib/session-repository')}catch{return null}})();console.log(S)"` → `null`.
- `lib/tool-runtime.js` and `lib/agent-router.js` still load. verified-by-running
  `node -e "new (require('./lib/tool-runtime').ToolRuntime)().catalog().length"` → `515`.

So today only the **bypass** paths function: `unified_api.js` chat SSE/JSON, and
the tower's direct `runAgent`. The canonical path is down.

No PM2 process was running at audit time — verified-by-running `pm2 jlist`
(empty). All HTTP-level claims below are therefore verified-by-reading unless
stated otherwise.

### 1.2 Entry point map

| # | Entry point | File:line | Started by | Port | Agent loop it ultimately calls | Verified |
|---|---|---|---|---|---|---|
| 1 | `purpclaw ask` | `bin/purpclaw.js:7504` → `lib/commands/ask.js` | user shell | — | `AgentGateway.submit` (`lib/commands/ask.js:634`) → `runAgentRouted` (`lib/agent-gateway.js:219`, runner set `:84`) → `runAgent` | by-running (`node bin/purpclaw.js ask --help` → throws, §1.1) |
| 1b | `purpclaw ask` legacy branch | `lib/commands/ask.js:671 runOneShotLegacy` | same file, alternate branch | — | `runAgentRouted` directly, no gateway, no permission profile | by-reading |
| 2 | `purpclaw tui ask` | `bin/purpclaw.js:4832 cmdTui` → `scripts/tui-ask.js:462,467` | user shell | — | `lib/gateway-singleton.js:1` → `AgentGateway.submit` | by-reading |
| 2b | `purpclaw tui ask` alt branch | `scripts/tui-ask.js:475-476` | same file | — | `lib/core/work-engine.js:235 runAgent` — raw loop, **different** session store | by-reading |
| 3 | `purpclaw chat` | `bin/purpclaw.js:3531 cmdChat`, spawn at `:3698` | user shell | client of :7784 | **none of the above** — spawns `scripts/nanoclaw.js`, which HTTP-POSTs `/api/orchestrate` on :7784 (`scripts/nanoclaw.js:148-150`) | by-reading |
| 4 | `purpclaw run "<task>"` | `bin/purpclaw.js:2249 cmdRun` | user shell | client of :7784 | orchestrator → `towerRequest('POST','/api/spawn')` (`orchestrator.js:1367`) → `agent_tower.js:424 runAgent` | by-reading |
| 5 | `purpclaw session …` | `bin/purpclaw.js:8668 cmdSession` | user shell | — | no loop; `lib/core/work-engine.js` → `lib/session-store.js` | by-running (`node bin/purpclaw.js session list` → `1 session(s)`) |
| 6 | `purpclaw serve` (JSON-RPC + A2A + OpenAI-compatible HTTP + WS) | `bin/purpclaw.js:7345 cmdServe` → `lib/agent-gateway-server.js:2` | PM2 `purpclaw-gateway-server`, `ecosystem.config.js:224-226`, args `serve --host 127.0.0.1 --port 9119` | 9119 | `AgentGateway` | by-reading |
| 7 | `purpclaw mcp-server` (stdio MCP) | `bin/purpclaw.js:7068` → `lib/mcp-server.js` | user shell / editor | stdio | **no agent loop** — own tool handler at `lib/mcp-server.js:210` | by-reading |
| 8 | Unified API — chat | `unified_api.js:402 handleChatStream`, SSE call at `:498-510`; JSON call at `:4418-4429` | PM2 `purpclaw-api`, `ecosystem.config.js:75-76` | 7780 | `runAgentRouted` → `runAgent`. **Gateway not used.** | by-reading |
| 8b | Unified API — tools | `unified_api.js:2497 tools/list`, `:2501 tools/call`, `:3521 /api/tool` + `/api/tools/call`, plus Xiaozhi cloud WS client | same process | 7780 / WS | `executeTool` (`:1097`) → `runTool` (`:1151`) → fallthrough `require('./lib/tools').invoke` — **no `ToolRuntime`** | by-reading |
| 9 | Agent Tower | `agent_tower.js` | PM2 `purpclaw-tower`, `ecosystem.config.js:104-105` | 7790 | `agent_tower.js:424 runAgent` direct; retry at `:464`; final fallback one-shot `llmComplete` at `:491`/`:500` | by-reading |
| 10 | Orchestrator | `orchestrator.js` | PM2 `purpclaw-orchestrator`, `ecosystem.config.js:333-334` | 7784 | no local loop — dispatches to tower (`:1367`) | by-reading |
| 11 | Swarm Coordinator | `swarm_coordinator.js` | PM2 `purpclaw-coordinator`, `ecosystem.config.js:479-480` | 7898 | dispatches to tower | by-reading |
| 12 | Next.js web UI chat | `app/api/chat/route.ts` | PM2 `purpclaw-nextjs`, `ecosystem.config.js:294-295` (`start -p 3030 -H 127.0.0.1`) | 3030 | default (`route.ts:137`): `gatewayChat` (`:58`) → `AgentGateway`. `PURPCLAW_LEGACY_CHAT=1`: proxy to `http://127.0.0.1:7780/api/chat` (`:31,153`). On upstream failure: `lib/chat-agent.js` (`:268,318`) | by-reading |
| 13 | Next.js sessions API | `app/api/sessions/route.ts:7` | same | 3030 | no loop; `lib/session-repository` | by-reading |
| 14 | ACP server (editor protocol) | `lib/acp-server.js:1` | manual / editor stdio | stdio | `AgentGateway` | by-reading |
| 15 | Messaging gateways | `lib/messaging-runtime.js:47`; adapters `lib/gateways/{telegram,discord,slack,email}.js`, `ecosystem.config.js:599-641` | PM2 | 7795 (telegram) | `AgentGateway` | by-reading |
| 16 | Cron | `lib/cron-manager.js:85` | in-process (`gateway.dispatch('cron.run')`) | — | `AgentGateway` | by-reading |
| 17 | Delegation / subagents | `lib/delegation-manager.js:68` | in-process | — | `AgentGateway` | by-reading |
| 18 | Harness service | `harness_service.js` | PM2 `purpclaw-harness`, `ecosystem.config.js:204-205` | 7798 | **UNKNOWN** — not traced | — |
| 19 | Worker service | `worker_service.js` | PM2 `purpclaw-workers`, `ecosystem.config.js:441-442` | 7897 | **UNKNOWN** | — |
| 20 | Cowork overlay | `lib/cowork-overlay.js` | PM2 `purpclaw-cowork`, `ecosystem.config.js:251-252` | — | **UNKNOWN** | — |
| 21 | Gatekeeper | `gatekeeper.js:24` | PM2 `purpclaw-gatekeeper`, `ecosystem.config.js:320-321` | 7791 | no loop — separate pre-merge review/policy service | by-reading |
| 22 | Support daemons: eventbus, state, voice, bridge, xiaozhi, goop, static, chorus, vision, metrics, drift-watcher, pool, context-bus, reasoning, voice-ingress, stt, cognitive, yolo, avatar, tts | `ecosystem.config.js:52,64,145,157,169,188,237,357,376,388,404,417,429,460,502,522,545,570,584,275` | PM2 | per `service_registry.js:4-39` | no agent loop | by-reading |

Ports are as declared in `service_registry.js:4-39` and `bin/purpclaw.js:114-125`.

---

## 2. Which surface calls which agent loop — the historical claims, verified

| Claim carried into this audit | Verdict | Evidence |
|---|---|---|
| "`lib/agent-loop.js` + `lib/agent-gateway.js` are the runtime" | **Confirmed as design, refuted as reality** | The gateway serves `ask`, TUI, ACP, gateway-server, cron, delegation, messaging and web `/api/chat`. It is **not** used by `unified_api.js` chat, the tower, `purpclaw chat`, `purpclaw run`, `purpclaw session`, or `lib/mcp-server.js`. And it currently throws (§1.1). |
| "`purpclaw ask` is genuinely agentic" | **Confirmed in code, refuted in execution** | `lib/commands/ask.js:634 gateway.submit` → `lib/agent-gateway.js:219 this.runner(...)` (runner = `runAgentRouted`, `:84`) → `lib/agent-router.js:97 runAgent` → real multi-turn loop with `toolRuntime.invoke` (`lib/agent-loop.js:627`), native tool-calling (`:355-364`), context compaction (`:525-536`). But verified-by-running `node bin/purpclaw.js ask --help` → hard error. |
| "`run`/swarm paths are one-shot `llmComplete` cosplay" | **Refuted (mostly)** | `agent_tower.js:418-451` runs the **real** `runAgent` loop with the full tool surface. `llmComplete` survives only as a last-resort fallback at `agent_tower.js:491` and `:500`, reached after the loop throws twice. verified-by-running `rg llmComplete` → hits only `agent_tower.js`, `docs/SYSTEM_TRUTH.md`, and one skill reference doc. |
| "`chat-agent.js` is dead-on-require" | **Refuted** | verified-by-running `node -e "require('./lib/chat-agent')"` → `chat-agent OK exports: chatWithTools,ToolExecutor,AGENT_TOOLS,READONLY_TOOLS AGENT_TOOLS: 515`. |

### 2.1 New defect: `lib/chat-agent.js` double-executes every tool, ungated

`chatWithTools` (`lib/chat-agent.js:53`) delegates to `runAgent`
(`:68`) — but `runAgent` has **already** invoked the tool through `ToolRuntime`
(`lib/agent-loop.js:627`) before it emits the `tool-call` event. `chat-agent.js`
then runs it a **second** time at `:83` via `executor.execute(...)` →
`TOOLS.invoke(...)` (`:41`), which bypasses `ToolRuntime` entirely: no permission
profile, no `path-security`, no approval, no checkpoint, no guardrails.

This is the web chat fallback path (`app/api/chat/route.ts:268,318`). Any
side-effecting tool (`write`, `edit`, `bash`) executes twice, and the second
execution is unpoliced.

Secondary: `opts.tools` and `opts.allow` passed into `runAgent` at
`lib/chat-agent.js:70` are not options `runAgent` reads — tool filtering there is
a no-op. `runAgent` filters only via `opts.toolRuntime` (`lib/agent-loop.js:403`,
`lib/tool-runtime.js:62`).

### 2.2 What each caller loses by bypassing the gateway

`lib/agent-gateway.js:193` builds `ToolRuntime` with `approvalCallback`,
`permissionProfile` (from `:192`), input/output guardrails and
`allowed/disallowed_tools`. `lib/agent-loop.js:403` falls back to
`new ToolRuntime()` when `opts.toolRuntime` is absent → `permissionProfile`
defaults to `'standard'` (`lib/tool-runtime.js:52`) and `approvalCallback` is
`null`.

| Caller | passes `toolRuntime`? | passes `sessionId`? | Effect |
|---|---|---|---|
| `lib/agent-gateway.js:221` | yes | yes | full policy + persistence + tracing |
| `unified_api.js:510` (chat SSE) | no | **no** | default `standard` profile; `lib/agent-loop.js:586 SESSIONS.saveSession` never fires |
| `unified_api.js:4429` (chat JSON) | no | yes | default profile; would persist if `session-repository` loaded |
| `agent_tower.js:428`, `:466` | no | no | default profile, no persistence — every tower agent, every swarm run |
| `lib/core/work-engine.js:235` | **UNKNOWN** | own store | separate persistence |
| `lib/chat-agent.js:70` | no | no | plus the double-execution above |

---

## 3. Duplicate implementations

**Count: 16 parallel implementations** across the five required subsystems —
4 session stores, 3 tool registries/executors, 3 provider-resolution paths,
4 permission/approval layers, 2 memory clients.

### 3.1 Session store — 4 implementations, 3 with live data

| # | Implementation | Storage | Used by | Live data |
|---|---|---|---|---|
| 1 | `lib/session-repository.js` — SQLite, FTS search, branch/fork | `.purpclaw/state.db`, path from `PURPCLAW_STATE_DIR` else `process.cwd()` (`:8-9`) | `AgentGateway` (`:4`), `agent-loop` (guarded, `:54`), `lib/commands/ask.js:27`, `app/api/sessions/route.ts:7`, `scripts/tui-ask.js:467` | **162 sessions** — verified-by-running `node -e "…node:sqlite… select source,count(*) from sessions group by source"` → `cli:63, test:65, acp:12, conformance:8, legacy-json:6, web:6, desktop:1, audit:1` |
| 2 | `lib/session-store.js` — JSON metadata + own SQLite, crash recovery / `resume_pending` / stuck-loop counter | `~/.purpclaw/sessions/` (`:29-31`) | `lib/core/work-engine.js:38`, `bin/purpclaw.js:8668 cmdSession`, and `lib/agent-loop.js:40` (only for `writeCleanShutdown`) | **40 `*.json`** — verified-by-running `ls ~/.purpclaw/sessions/*.json \| wc -l` |
| 3 | `lib/spine/session-store.js` — turn sidecar, `MAX_TURNS = 12` (`:34`) | `~/.purpclaw/sessions/spine/` (`:37`) | `unified_api.js` chat SSE + JSON (`appendTurn`/`getHistory`), `app/api/chat/route.ts` legacy path | **0 files** — verified-by-running `ls ~/.purpclaw/sessions/spine/*.json \| wc -l` |
| 4 | `lib/session-persistence.js` — suspend/branch metadata; **hardcoded absolute root** at `:13` | `.purpclaw/sessions/<id>/meta.json` | SPEC-012 suspend/resume | directories present — verified-by-running `ls .purpclaw/sessions/` (`_index.json`, `s12-3-fork-*`) |

Related but distinct: `lib/session-state-service.js` (scoped key/value in the
same `state.db`), `lib/agent-session.js` (in-memory cwd/mission session),
`lib/session-archiver.js`, `lib/session-portability.js`.

`lib/spine/session-store.js:6-11` documents itself as *"a thin shim — DO NOT add
new logic here"* that *"DELEGATES to lib/session-store.js"*. It does not: `:65-85`
writes its own sidecar file first and only then best-effort mirrors into the main
store inside a bare `try{}catch{}`.

**Consequences for the P0-1 done-criterion:**

- A CLI session (store 1) is invisible to `purpclaw session list` (store 2).
- A `unified_api` SSE chat turn writes to store 3 and writes **nothing** to store
  1 — `unified_api.js:510` passes no `sessionId`.
- Store 1's path is `process.cwd()`-relative. `purpclaw-nextjs` sets `cwd: './'`
  (`ecosystem.config.js:296`) = repo root, so web and a CLI run *from the repo
  root* agree — but a CLI invocation from anywhere else silently creates a fresh
  `.purpclaw/state.db`. `PURPCLAW_SESSION_DB` is set in **no** PM2 env block.

### 3.2 Tool registry / execution — 3 implementations

| # | Implementation | Count | Goes through `ToolRuntime`? | Reached from |
|---|---|---|---|---|
| 1 | `lib/tools/index.js` (+ `lib/tools-pc.js`, `lib/tools-gui.js`, `lib/tools-cli-anything.js`, `lib/tools-remotion.js`, `lib/tools/skills-registry.js`) | **515** — verified-by-running `node -e "new (require('./lib/tool-runtime').ToolRuntime)().catalog().length"` | yes, when reached via `lib/tool-runtime.js` | agent-loop, gateway, tower |
| 2 | `unified_api.js:1005 const TOOLS = [...]` + `:1097 executeTool` + `:1151 runTool` | 70 declared | **no** | MCP `tools/call` (`:2501`), Xiaozhi cloud WS, HTTP `/api/tool` and `/api/tools/call` (`:3521`) |
| 3 | `lib/mcp-server.js:210 handleBuiltinTool` | small subset | **no** | `purpclaw mcp-server` stdio — i.e. any editor/MCP client |

Registry 2 **falls through to registry 1** on "Unknown tool"
(`unified_api.js:1123-1136`: `require('./lib/tools')` → `registry.invoke(name, args)`),
so the full 515-tool surface is reachable over plain unauthenticated localhost
HTTP with **zero** permission evaluation.

Registry 3 implements `bash` as a bare `execSync(command)`
(`lib/mcp-server.js:216-219`) and `write_file` as a bare `fs.writeFileSync`
(`:232`) — no `lib/path-security.js`, no `lib/exec-policy.js`, no approval queue.

Direct `TOOLS.invoke` bypasses outside tests — verified-by-running
`rg "TOOLS\.invoke"`: `lib/chat-agent.js:41`, `lib/spinebus.js:115`.

### 3.3 Provider / model routing — 3 resolution paths

| # | Implementation | Precedence | Reads user config? | Consumers |
|---|---|---|---|---|
| 1 | `lib/llm-provider.js:333 resolveConfig` (+ `:385 resolvePooledConfig`, `:1428 streamChat`) | `LLM_PROVIDER`/`LLM_MODEL`/`LLM_API_KEY` env → per-provider alias env → `lib/credentials-store.js` → provider default | **no** | **every actual model call**, including `agent-loop` |
| 2 | `lib/runtime/provider-router.js:71 resolveLane` | user config (`~/.purpclaw/provider-config.json`, `lib/runtime/provider-config.js:24`) → env → lane default, then capability fallback to a provider with a usable key, ending at local Ollama (`:59-64`) | yes | `app/api/providers/route.ts:19`, `app/api/heartbeat/route.ts:30`, `lib/system-manifest.js:48`, `lib/model-sentinel.js:182`, `scripts/heartbeat.js:54` — verified-by-running `rg provider-router` |
| 3 | `lib/model-router.js` via `lib/agent-router.js:44-51` | prompt classification → lane model + NIM fallback chain (`lib/agent-router.js:51-62`) | no | all `runAgentRouted` consumers |

Plus: `lib/provider-registry.js:54 resolveRuntime` (env-only, `:55`) picks the
gateway's default provider at `lib/agent-gateway.js:80`; `lib/phase-router.js`
supplies a per-session model override consulted at `lib/agent-loop.js:513`; and
per-agent `provider`/`model` fields in the tower registry
(`agent_tower.js:105,110,114`) are consulted at `agent_tower.js:398-403`.

**Finding:** the settings UI (`/providers` → `provider-config.json`) writes into
path 2, which no model call reads. The chat brain resolves through path 1 (env
only). Changing a lane in the UI does not change what the agent loop calls.
verified-by-running `rg provider-router` — no `unified_api.js`, `lib/agent-*`, or
`lib/llm-provider.js` hit.

### 3.4 Permission / approval — 4 layers, no single decision point

| # | Layer | File | Scope |
|---|---|---|---|
| 1 | Profile evaluation (`plan`/`standard`/`trusted`/`autonomous`/`dangerous`) | `lib/permission-manager.js:2-10`, `evaluate()` at `:10` | consulted only by `lib/tool-runtime.js` |
| 2 | Governance + approval queue | `lib/governance.js` (policy file `purpclaw_policy.json`, `:27`), `lib/approval-queue.js`, `lib/tool-gate.js:22` (wrapper), `lib/approval-triage.js` | risk classification, `PURPCLAW_APPROVAL_MODE` (`lib/tool-gate.js:28-30`), `PURPCLAW_TRUSTED_PATHS` |
| 3 | Path + exec guards | `lib/path-security.js` (from `lib/tool-runtime.js:13`), `lib/exec-policy.js` (from `lib/tools/index.js:31`) | write/exec sandboxing |
| 4 | Gatekeeper service | `gatekeeper.js:24`, port 7791 | pre-merge code review; entirely separate policy vocabulary |

Layers 1–3 apply **only** when the call goes through `lib/tool-runtime.js`, which
§3.2 registries 2 and 3 do not. P0-3's "same policy decision from CLI, desktop,
scheduler, subagent or remote gateway" therefore already fails at the P0-1 level.

Default-profile drift: gateway sets `trusted` for operator-initiated CLI and
`autonomous` otherwise (`lib/agent-gateway.js:192`); a bare `ToolRuntime`
defaults to `standard` (`lib/tool-runtime.js:52`); `unified_api` and
`lib/mcp-server.js` apply nothing at all.

### 3.5 Memory — 2 clients in the same loop

`lib/agent-loop.js:60` loads `lib/memory-client.js` (HTTP :7880 cognitive spine),
`:42` loads `lib/scoped-memory.js` (local SQLite scope index — itself broken by
§1.1 at `lib/scoped-memory.js:42`). Both are written on tool results
(`lib/agent-loop.js:662-686`). Whether they converge behind the spine is
**UNKNOWN** — `purpclaw-cognitive` (`service_registry.js:30`) was not running.
Further memory surfaces exist (`lib/memory-tool.js`,
`lib/canonical-memory-sync.js`, `lib/memory-retention.js`,
`lib/memory-consistency.js`, `lib/context-bus.js`) and were not traced.

---

## 4. Configuration paths and precedence

| Source | Read by | Precedence note |
|---|---|---|
| `.env` via `dotenv.config({ override: true })` | `unified_api.js:15` | **overwrites** already-set process env — the file beats stale daemon env |
| `.env` via `dotenv.config()` (no override) | `lib/core/work-engine.js:34`, CLI paths | **daemon/shell env wins over the file** |
| PM2 `env:` blocks | `ecosystem.config.js:77-93` (api), `:107-131` (tower), `:336-343` (orchestrator), `:249-269` (cowork), `:275-291` (tts), `:171-178` (xiaozhi), `:190-193` (goop) | values are read from `.env` at *config-parse* time (`ecosystem.config.js:29-38`) and then frozen into the daemon |
| `~/.purpclaw/provider-config.json` (override `PROVIDER_CONFIG_PATH`) | `lib/runtime/provider-config.js:24` | beats env inside `resolveLane` (`lib/runtime/provider-router.js:78-80`) — but only for the 5 consumers in §3.3 |
| `~/.purpclaw/config.json` | `lib/agent-loop.js:75` (file-watcher target) | not traced further |
| Settings OS registry | `app/api/settings/route.ts:23` → `lib/runtime/settings-registry.js` | write target **UNKNOWN** |
| `purpclaw_policy.json` | `lib/governance.js:27` (rooted at `rootDir`) | approval policy |
| `~/.purpclaw/pocket/spend-config.json` | `lib/llm-provider.js` SpendGate (`:1494` region) | budget gate |
| Session DB path | `PURPCLAW_STATE_DIR` / `PURPCLAW_SESSION_DB` else `process.cwd()` — `lib/session-repository.js:8-9` | **cwd-dependent**; pinned nowhere |
| `PURP_DIR` | `lib/session-store.js:29`, `lib/agent-loop.js:73` | defaults to `~/.purpclaw`, but the cowork PM2 block sets it to the **repo root** (`ecosystem.config.js:259`) — two different meanings |
| Per-agent provider/model | `agent_tower.js:105,110,114`, `agent_routing_matrix.js` | applied at `agent_tower.js:398-403`; wins over global env for that agent |

### Places where daemon env can shadow file config

1. **Every PM2 block.** `ecosystem.config.js:29-38` parses `.env` **once**, when
   PM2 reads the config. A later `.env` edit never reaches a running daemon, and
   a `pm2 save`d environment survives restarts. Only `unified_api.js:15` defends
   against this with `override: true` — the comment there records exactly this
   incident (401/402 from a poisoned daemon env).
2. **`lib/core/work-engine.js:34`** calls `dotenv.config()` without `override`, so
   a stale `LLM_PROVIDER` in the daemon environment beats `.env` on that path.
3. **`ecosystem.config.js:118-120`** (tower) and **`:340-342`** (orchestrator)
   inject `LLM_PROVIDER: env.LLM_PROVIDER || ''`. An empty string is present in
   `process.env`, so a non-override `dotenv.config()` in the child will **not**
   replace it, and `lib/llm-provider.js:334` falls back to `'openai'` as the
   provider name. This is a live foot-gun on both services.

---

## 5. Shared vs divergent behaviour

| Question | Answer | Method |
|---|---|---|
| Does a session started in the CLI show up in web? | **Design yes / today no.** Both `lib/commands/ask.js:27` and `app/api/sessions/route.ts:7` use `lib/session-repository`, and `state.db` already holds `cli:63` and `web:6` rows in one table — so the wiring is right. But both surfaces currently throw (§1.1), and the DB path is cwd-relative. | verified-by-running `node -e "…node:sqlite… group by source"` + `node -e "require('./lib/agent-gateway')"` |
| Does it resume from web? | **UNKNOWN** — `session.resume` exists (`lib/agent-gateway.js:316-323`) and web passes `session_id` (`app/api/chat/route.ts:63`), but it could not be exercised: gateway throws, no services running. | — |
| Does `purpclaw session list` show those sessions? | **No.** It reads `lib/core/work-engine.js` → `lib/session-store.js` (`~/.purpclaw/sessions/`), a different store. | verified-by-running `node bin/purpclaw.js session list` → `1 session(s)`, `Untitled 0 msgs NaN-NaN-NaN NaN:NaN` |
| Does a `unified_api` SSE chat turn persist to the canonical store? | **No.** `unified_api.js:510` passes no `sessionId`, so `lib/agent-loop.js:586` is skipped; history goes to `lib/spine/session-store.js` only. | verified-by-reading |
| Do the same tools exist on every surface? | **No.** 515 via `lib/tools` (gateway, agent-loop, tower); 70 + fallthrough via `unified_api.js:1005`; a handful via `lib/mcp-server.js:210`. Names also differ (`read` vs `read_file`). | verified-by-running (515) + verified-by-reading (70, subset) |
| Same permission decisions? | **No.** `trusted`/`autonomous` (gateway `:192`), `standard` (bare `ToolRuntime` — tower, unified_api chat), **none** (unified_api `/api/tool`, `mcp-server`, `chat-agent`'s second execution). | verified-by-reading |
| Same provider/model resolution? | **No.** §3.3 — three paths, and the only user-configurable one is not on the execution path. | verified-by-reading + `rg provider-router` |
| Same hooks fire? | Only inside `lib/agent-loop.js`, which fires **both** buses (`:35-36`). Surfaces that never enter the loop (`/api/tool`, `mcp-server`) fire neither. | verified-by-reading |
| Same skills? | **Yes**, one registry — `lib/skill-registry.js` for gateway discovery, `lib/tools/skills-registry.js` merging 380 Hermes skills into `lib/tools`. | verified-by-running `node -e "require('./lib/tools')"` |
| Does desktop work at all? | **UNKNOWN** — one `source='desktop'` row exists in `state.db`; no desktop client was traced or exercised. | — |
| Is the stack currently running? | No. | verified-by-running `pm2 jlist` (empty) |

---

## 6. Smallest consolidation sequence

Principle: unbreak first, then **delete the duplicate and point callers at the
survivor**. No new abstraction, no new directory. Each step is independently
shippable and revertible with `git revert`.

| # | Step | Change | Blast radius | Reversible |
|---|---|---|---|---|
| **1** | **Fix the `DatabaseSync` import.** `require('better-sqlite3')` → `require('node:sqlite')` in the 22 files listed in §1.1. Nothing else. | 22 one-line edits | Everything touching `state.db` — but all of it is broken today, so the only direction is up. Residual risk: `node:sqlite` is flagged experimental on Node 22–24; `package.json` engines already pin `>=22 <25`. Consider whether `better-sqlite3` should be dropped from `dependencies` afterwards. | yes, one commit |
| **2** | **Pin the session DB.** Add an absolute `PURPCLAW_SESSION_DB` to the `purpclaw-api`, `purpclaw-nextjs`, `purpclaw-tower`, `purpclaw-orchestrator` and `purpclaw-gateway-server` env blocks in `ecosystem.config.js`; document the same for CLI use. | config only | Processes currently writing to a cwd-derived DB start writing to the pinned one. Rows in stray DBs stay behind (migration optional, separate). Check first: `state.db` holds 65 `source='test'` rows, so test runs have been hitting the production DB. | yes |
| **3** | **Give `unified_api` chat a session id.** `unified_api.js:510` — pass the in-scope `sessionId` (the JSON path at `:4429` already does) so `lib/agent-loop.js:586` persists. | one object literal | The SSE chat path starts writing to `state.db`. Additive, low risk. | yes |
| **4** | **Delete the double tool execution in `lib/chat-agent.js`.** Remove the `ToolExecutor` use at `:58` and `:83`; keep the allow-list as a filter only. | one file, ~20 lines | The web fallback path stops running `write`/`bash` twice unpoliced. Strictly a correctness fix. | yes |
| **5** | **Point `unified_api` tool dispatch at `ToolRuntime`.** In `unified_api.js:1097 executeTool`, replace the `require('./lib/tools').invoke` fallthrough with a module-level `new ToolRuntime({ permissionProfile: 'standard' })`. Leave the 70 hardcoded desktop/screen tools in `runTool` alone for now. | `unified_api.js` only | `/api/tool`, MCP `tools/call` and the Xiaozhi WS client become permission-gated. **Will start denying calls that previously succeeded** — ship behind `PURPCLAW_API_TOOL_GATE=1` for one release, then default on. | yes (flag) |
| **6** | **Point `lib/mcp-server.js` at `lib/tools` + `ToolRuntime`.** Delete `handleBuiltinTool` (`:210`+) and route `tools/call` through the registry as in step 5; keep the MCP-client passthrough at `:161`. | `lib/mcp-server.js` only | Editor/MCP clients gain the 515-tool surface and lose ungated `execSync`. Tool names change (`read_file` → `read`) — ship aliases in the same commit (see breaking-change list). | yes |
| **7** | **Give the tower a configured `ToolRuntime` + `sessionId`.** `agent_tower.js:428` and `:466` — pass `opts.toolRuntime` (profile driven by `PURPCLAW_APPROVAL_MODE`) and `opts.sessionId`. | `agent_tower.js` only | Tower/swarm agents become policy-governed and their transcripts land in `state.db`. Expect some tower tasks to start hitting the approval queue. | yes |
| **8** | **Delete `lib/spine/session-store.js`; point its callers at `lib/session-repository`.** Callers: `unified_api.js` chat SSE + JSON, `app/api/chat/route.ts` legacy path. | 3 files | Spine sidecar history is dropped — 0 files on disk today, so nothing is lost. `MAX_TURNS = 12` truncation disappears, so history windows lengthen; re-check token budgets. | yes |
| **9** | **Collapse `lib/session-store.js` into `lib/session-repository.js`.** Re-point `lib/core/work-engine.js:38`, `bin/purpclaw.js:8668 cmdSession`, `scripts/tui-ask.js:475`. **Port, do not delete**, `session-store`'s crash-recovery helpers (`writeCleanShutdown`, `resume_pending`, restart counters) onto the SQLite store. | 3 callers + one migration script | `purpclaw session list` finally shows CLI + web sessions. Requires a one-shot migration of 40 `~/.purpclaw/sessions/*.json` files. | yes, with migration |
| **10** | **Make `lib/llm-provider.js:333 resolveConfig` consult `lib/runtime/provider-config.js`,** respecting the documented precedence (env > user config > default). | `lib/llm-provider.js` | The settings UI starts steering real traffic. **Behaviour change by design** — any stale lane override in `~/.purpclaw/provider-config.json` takes effect immediately; audit that file first. | yes |
| **11** | **Route `purpclaw chat` and `purpclaw run` through the gateway.** `bin/purpclaw.js:3531 cmdChat` currently spawns `scripts/nanoclaw.js`; `:2249 cmdRun` drives the orchestrator over HTTP. | `bin/purpclaw.js`, possibly `orchestrator.js` | The largest UX change of the set — do it last, after the spine is proven. | yes |
| **12** | **Collapse the two hook buses** (`lib/hooks/lifecycle-bus` + `parity/hooks/engine`, both fired at `lib/agent-loop.js:35-36`). | `lib/agent-loop.js` + one bus | Any plugin registered on the deleted bus stops firing — inventory subscribers first. | yes |

### Cannot be consolidated without a breaking change

- **Tool names (step 6).** `lib/mcp-server.js` exposes
  `read_file`/`write_file`/`list_directory`; `lib/tools` uses `read`/`write`/`list`.
  Any editor or MCP client configured against the old names breaks unless
  aliases ship in the same commit.
- **Permission gating (step 5).** By definition, previously-ungated HTTP tool
  calls start being denied or queued. There is no non-breaking way to add policy
  to a surface that never had one; the flag only delays the break.
- **Session migration (step 9).** The stores have incompatible schemas
  (`{turns:[…]}` and `{messages:[…]}` JSON vs the SQLite `sessions`+`messages`
  tables). The 40 existing JSON sessions must be migrated or abandoned.
- **Provider precedence (step 10).** Making user config authoritative changes
  which model answers, on every surface, immediately.
- **`unified_api.js`'s 70 desktop/screen/browser/Playwright tools**
  (`unified_api.js:1005`) have **no equivalent** in `lib/tools`. They cannot be
  deleted as duplicates — they would have to be *ported into* `lib/tools`
  (new work, not consolidation) or left in place. Out of scope for a minimal
  sequence; step 5 gates the shared 515 without touching them.
- **`.purpclaw/state.db` path pinning (step 2)** orphans rows written under a
  different cwd.

### What is already correct and must not be touched

`AgentGateway` → `runAgentRouted` → `runAgent` → `ToolRuntime` → `lib/tools` is
the right spine. `ask`, TUI, ACP, `serve`/A2A, cron, delegation, messaging and
the default web `/api/chat` are already clients of it. The remaining work is
subtraction from the bypass paths, not construction of anything new.

---

## 7. Explicitly UNKNOWN

- What agent loop, if any, `harness_service.js` (:7798), `worker_service.js`
  (:7897) and `lib/cowork-overlay.js` use.
- Where `lib/runtime/settings-registry.js` persists settings, and whether it
  overlaps `provider-config.json`.
- Whether `lib/memory-client.js` and `lib/scoped-memory.js` converge behind the
  cognitive spine — the spine service was not running.
- Whether a desktop client exists beyond the single `source='desktop'` row in
  `state.db`.
- Whether the `DatabaseSync` breakage is a recent regression or long-standing.
  `git log -- package.json` shows no recent `better-sqlite3` bump; the wrong
  import is present throughout the checked-out tree. Not bisected.
- Runtime behaviour of every HTTP surface: no PM2 process was running
  (verified-by-running `pm2 jlist`) and this audit did not start any service.
- Whether `lib/commands/ask.js:671 runOneShotLegacy` is still reachable from any
  flag combination, or is dead code.
