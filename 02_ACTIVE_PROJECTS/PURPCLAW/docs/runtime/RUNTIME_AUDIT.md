# Wave 1 — Unified Runtime Audit
**Status:** audit-only pass complete · consolidation sequencing TBD
**Canonical parity authority:** [docs/parity/CANONICAL_PARITY_PRIORITY.md](../parity/CANONICAL_PARITY_PRIORITY.md)

---

## 1. Every Runtime Entry Point

The entry points and which agent loop they drive:

| Entry point | Service name | Agent loop used | Lines | Purpose |
|---|---|---|---|---|
| `bin/purpclaw.js` | — (CLI binary) | `agent-loop.js` via `agent-router.js` (`runAgentRouted`) | 1400+ | CLI front door: `ask`, `chat`, `run`, `serve` |
| `unified_api.js` | `purpclaw-api` (port 7780) | `agent-loop.js` via `agent-router.js` (`runAgentRouted`) | 5070 | REST/WebSocket API hub |
| `agent_tower.js` | `purpclaw-tower` (port 7788) | `agent-loop.js` directly (imports `lib/agent-loop`) | 1282 | Agent Tower swarm UI |
| `orchestrator.js` | `purpclaw-orchestrator` | unclear — grep shows no `runAgent` call in the file itself | 2439 | Task orchestration |
| `harness_service.js` | `purpclaw-harness` | unclear — imports `agent-loop`? | 285 | Test harness |
| `lib/agent-gateway-server.js` | `purpclaw-gateway-server` (port 9119) | `agent-gateway.js` → `agent-router.js` → `agent-loop.js` | — | A2A/JSON-RPC gateway |
| `lib/agent-gateway.js` | (used by gateway-server) | `runAgentRouted` | — | Gateway-side agent runner |
| `lib/chat-agent.js` | (used by deep-research-group, crew) | `agent-loop.js` directly (`runAgent`) | 99 | Provider-agnostic chat+tools |
| `lib/agent-router.js` | (shared by all above) | `agent-loop.js` (`runAgent`) | 147 | Routing wrapper (model/NIM fallback) |
| `lib/agent-loop.js` | **CORE** — the loop itself | — | 757 | The Claude Code-style turn loop |

**Findings:**
- **One real loop:** `lib/agent-loop.js` (`runAgent` export). All surfaces call it, either directly or via `agent-router.js`'s `runAgentRouted` wrapper.
- `orchestrator.js` (2439 lines) and `harness_service.js` (285 lines) do NOT call `runAgent` or `runAgentRouted` in the first-pass grep. They may orchestrate sub-agents via a different mechanism (spawned processes, message passing).
- The "kernel" (`lib/kernel.js`, 5 lines — tiny `KernelBuilder` + `ServiceCollection`) is **not** the agent loop kernel. It's a plugin/service-container used by `api-harness-kernel.js` for the API harness layer, not the agent loop itself.

---

## 2. Which Surfaces Call Which Agent Loop

```
bin/purpclaw.js (CLI)
    └─ requires agent-router.js
           └─ requires agent-loop.js
                  └─ requires llm-provider.js (streamChat)

unified_api.js (API server :7780)
    ├─ route /api/chat       → agent-router.js → agent-loop.js
    ├─ route /api/agent/*    → runAgentRouted (same path)
    └─ direct streamChat calls (llm.streamChat) in non-agent routes

agent_tower.js (Tower :7788)
    ├─ requires lib/agent-loop (direct)
    └─ calls runAgent directly

lib/agent-gateway-server.js (Gateway :9119)
    └─ requires agent-gateway.js
           └─ requires agent-router.js
                  └─ requires agent-loop.js

lib/chat-agent.js
    └─ requires agent-loop.js directly

lib/deep-research-group.js
    └─ requires chat-agent.js (chatWithTools)

lib/crew.js
    └─ requires agent-loop.js? (grep showed no direct call — confirm)

orchestrator.js, harness_service.js
    └─ UNKNOWN — no runAgent call found in grep. Confirm whether they spawn
       child processes, call llm.streamChat directly, or are truly separate systems.
```

---

## 3. Duplicate Session / Tool / Provider Implementations

### Session

| File | Approach | Storage |
|---|---|---|
| `lib/session-store.js` | Hermes-port: JSON metadata + SQLite transcripts | `PURP_DIR/sessions/sessions.json` + `state.db` |
| `lib/session-archiver.js` | ? | ? |
| `lib/session-state-service.js` | ? | ? |
| `lib/session-persistence.js` | ? | ? |
| `lib/session-repository.js` | ? | ? |
| `lib/session-portability.js` | ? | ? |

**Risk:** 6 session-related files. `session-store.js` is the well-documented one (lines 1–112 visible). Others may be dead, partially implemented, or in-use. All need a line-level read to determine which is canonical and which are superseded.

### Tools

| File | Scope |
|---|---|
| `lib/tools/index.js` | Full tools registry — all tools |
| `lib/tools-parity.js` | Tool parity tracking |
| `lib/agent-tools-file.js` | File-specific tool helpers |
| `lib/code-tools.js` | Code-mode tools |
| `lib/tools/` | Directory — contents unknown |

**Risk:** `tools/index.js` is the canonical registry. Others may be subsets or legacy wrappers. `lib/tools-parity.js` may be one of the legacy parity docs being superseded.

### LLM Providers

| File | Scope |
|---|---|
| `lib/llm-provider.js` | **1684 lines. Single canonical provider router.** Handles OpenAI, Anthropic, Gemini, MiniMax, OpenRouter, NVIDIA NIM, Groq, etc. Three `streamChat` variants: `streamChatOpenAI`, `streamChatAnthropic`, `streamChatGemini` + main `streamChat` dispatcher. |
| `lib/providers/` | Subdir with: `registry.js`, `types.ts`, `hermes-cli.js`, `openai-responses.js`, `anthropic-messages.js` — partial providers? |
| `lib/provider-registry.js` | Provider registry — separate from llm-provider? |
| `lib/provider_health.js` | Health checking — separate concern |
| `lib/runtime/provider-router.js` | Runtime-level routing (LANES + defaultModel) |
| `lib/runtime/provider-config.js` | Runtime config |

**Risk:** `llm-provider.js` is the canonical. The `providers/` subdir and `provider-registry.js` may be partial mirrors or the "old way." They need line-level reads to determine if they're dead weight or have unique logic.

---

## 4. Configuration Paths

| Concern | File | Path |
|---|---|---|
| Project root resolution | `bin/purpclaw.js` | `resolveProjectRoot()` checks E: path first |
| Provider config | `lib/llm-provider.js` | `PROVIDERS` object inside file |
| Runtime lane routing | `lib/runtime/provider-router.js` | `LANES` object |
| Lane defaults | `bin/model-sync.js` | Writes to `llm-provider.js` + `provider-router.js` |
| Agent config | `lib/AGENT.md.js` | Loads `AGENT.md` |
| Skills registry | `skills/registry.txt` | Skill index |
| Secrets | `lib/secrets.js` | API keys |
| PM2 services | `ecosystem.config.js` | 26 named services |
| Spend gate | `~/.purpclaw/pocket/spend-config.json` | Spend caps |

**Finding:** Provider config lives in TWO places (`llm-provider.js` + `provider-router.js`) and is written by `model-sync.js`. This is a duplication risk — they can drift.

---

## 5. Shared vs Divergent Behaviour

### Shared (canonical, used everywhere)
- `lib/llm-provider.js` — all streaming goes through `streamChat`
- `lib/agent-loop.js` — all agent turns go through `runAgent`
- `lib/agent-router.js` — model routing + NIM fallback (all HTTP-driven surfaces)
- `lib/tools/index.js` — single tool registry

### Partially shared (bridge/gateway adds a layer)
- `lib/agent-gateway.js` → `agent-router.js` → `agent-loop.js` (gateway adds allow-listing)
- `lib/chat-agent.js` → `agent-loop.js` (chat-agent adds `ToolExecutor` + read-only subset)

### Potentially divergent or orphaned
- `orchestrator.js` — 2439 lines, no `runAgent` found. May have its own task dispatch.
- `harness_service.js` — 285 lines, unclear relationship to agent loop
- `lib/crew.js` — crew of agents, may have its own loop variant
- `lib/autonomy-runner.js` — autonomy loop, may be standalone
- `lib/reasoning-loop.js` — reasoning-specific loop
- `lib/self-evolution-loop.js` — evolution-specific loop
- `lib/kernel.js` — not the agent loop; a plugin container (legitimate separate concern)

---

## 6. The Smallest Consolidation Sequence

### Phase A — Verify (before any move)

1. **Confirm orchestrator.js's agent loop** — grep all 2439 lines for `runAgent`, `streamChat`, `spawn`, `child_process`. If it only dispatches tasks to the API server (`:7780`), it's a thin orchestrator and needs no loop merge.
2. **Confirm harness_service.js** — same grep. If it's a test runner that calls `runAgent` indirectly via API, also thin.
3. **Read all 6 session files** to identify which is the active one. `session-store.js` is documented; the other 5 may be dead imports.
4. **Read `lib/providers/` contents** — `registry.js`, `types.ts`, `hermes-cli.js`, `openai-responses.js`, `anthropic-messages.js` — determine if they supplement or duplicate `llm-provider.js`.
5. **Confirm crew.js, autonomy-runner.js, reasoning-loop.js, self-evolution-loop.js** — are these independent loops or do they call `agent-loop.js`?

### Phase B — Deduplication (no architecture changes)

1. Kill `lib/tools-parity.js` — it's a parity doc, not a tool, and should be in the legacy archive.
2. Standardize provider config to ONE file (`llm-provider.js`). `provider-router.js` should READ from `llm-provider.js`, not maintain its own `LANES` copy.
3. Collapse `agent-gateway.js`'s `ToolExecutor` into the main tools layer — there's no reason the gateway's allow-list executor is different from `chat-agent.js`'s `ToolExecutor`. They do the same thing.

### Phase C — Structural (after Phase B verified)

1. If `orchestrator.js` and `harness_service.js` don't need their own loops: leave them as API clients to `unified_api.js`. No change.
2. If `orchestrator.js` does need its own loop: extract its task-dispatch logic into `lib/task-dispatch.js` and call `runAgent` from there.
3. Move all session logic to `session-store.js` as the single implementation. Archive or delete the other 5 files.
4. Extract `lib/providers/` logic into `llm-provider.js` if it adds unique behavior.

### Phase D — The "Do Not Move" List

**Never move these to a `core_v2_final_real/` folder:**
- `lib/agent-loop.js` — the loop IS the runtime; don't rename it
- `lib/agent-router.js` — routing is a first-class concern here
- `lib/llm-provider.js` — 1684 lines of provider logic, single canonical file
- `lib/tools/index.js` — tool registry
- `lib/session-store.js` — session lifecycle
- `bin/purpclaw.js` — CLI entry
- `unified_api.js` — API entry
- `agent_tower.js` — Tower entry

The consolidation is primarily a **deduplication + verification** job, not a file-move job. The existing structure with `agent-loop.js` as the canonical center is sound. The risk is **dead code living alongside live code**, not a broken architecture.

---

## 7. Open Questions (require grep/reads to answer)

| Question | Priority |
|---|---|
| Does `orchestrator.js` have its own agent loop or does it call `unified_api.js`? | P0 |
| Do `crew.js`, `autonomy-runner.js`, `reasoning-loop.js`, `self-evolution-loop.js` call `agent-loop.js` or have independent loops? | P0 |
| Are any of the 6 session files dead imports? | P1 |
| Does `lib/providers/` add unique logic or mirror `llm-provider.js`? | P1 |
| Is `provider-router.js` drifting from `llm-provider.js` on lane defaults? | P1 |
| Does `harness_service.js` need the agent loop? | P2 |
| Is `lib/kernel.js` used anywhere beyond `api-harness-kernel.js`? | P2 |

---

*Audit complete. Map above. Consolidation sequence starts at Phase A — verify before touching.*
