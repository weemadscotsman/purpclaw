> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# Hermes Parity Architecture

Reference baseline: official `NousResearch/hermes-agent` documentation and source, shallow-cloned to `E:/tmp/hermes-agent-reference` on 2026-07-12. This is a behavioral and architectural reference only; PURPCLAW keeps its own implementation and identity.

## Target invariant

CLI, TUI, web, desktop, automation, and messaging must drive one PURPCLAW agent core. A capability is not parity-complete until every applicable surface receives the same session state, tool events, approvals, failures, and final result through a shared protocol.

## Reference architecture distilled

1. One agent loop owns prompt assembly, provider resolution, tool dispatch, interruption, compression, persistence, callbacks, and fallback.
2. Rich clients use a JSON-RPC gateway over stdio or WebSocket. HTTP/SSE is a compatibility surface, not the desktop's private backend.
3. Sessions are durable, searchable, branchable, compressible, profile-scoped, and shared across surfaces.
4. Tools self-register in a central registry and expose availability checks, approval policy, normalized errors, progress, and environment backends.
5. Prompt tiers are stable identity/tool/skill context, session-frozen memory and profile context, project context files, then volatile timestamp/platform context.
6. Providers resolve through one runtime contract: provider, model, API mode, base URL, credentials, source, and isolated fallback chain.
7. Plugins can register tools, lifecycle hooks, CLI commands, slash commands, and specialized memory/context/provider implementations.
8. Long-running gateway adapters normalize inbound messages, authorization, session keys, delivery, hooks, scheduling, and maintenance.

## PURPCLAW gap map

| Layer | Existing PURPCLAW assets to preserve | Gap to close |
|---|---|---|
| Agent core | `lib/agent-loop.js`, `lib/agent-router.js`, `lib/llm-provider.js` | Several surfaces bypass or wrap the loop differently |
| Protocol | SSE routes, REST routes, EventBus | No canonical JSON-RPC method/event contract |
| Sessions | `lib/session-store.js`, web session routes, spine store | JSON files, duplicated stores, no branch/search/compression contract |
| Tools | `lib/tools/`, MCP adapters, governance | Registry exists; availability, approval, and event semantics vary by surface |
| Prompt/context | agent prompt builder, SOUL/USER/MEMORY, cognitive clients | No explicit stable/context/volatile tier contract |
| Providers | provider modules and routing | Multiple overlapping resolvers and truth surfaces |
| Clients | CLI, Blessed TUI, Next web UI, Electron packaging | They do not all consume one live-session protocol |
| Automation | scheduler, harness, workflows, tower | Jobs can report accepted/done without execution proof |
| Extensions | skills, commands, MCP, hooks | No single plugin context spanning tools/hooks/commands |
| Remote/security | gateways, gatekeeper, approvals | No one authenticated remote-agent boundary |

## Migration order

1. Canonical agent gateway protocol and lifecycle events.
2. Durable SQLite session repository with migration from existing JSON sessions.
3. Move CLI chat/run onto the gateway; then TUI and web chat.
4. Formal prompt tiers and context compression.
5. Consolidate provider resolution behind one adapter interface.
6. Normalize tool registry, approvals, cancellation, and background processes.
7. Add profiles, branching, search, checkpoints, goals, and recovery contracts.
8. Add plugin/hook contract and dynamic reload.
9. Unify cron, delegation, messaging, and remote authenticated backends.
10. Desktop shell consumes the same gateway; parity tests become release gates.

## Definition of done

Parity is evidence-based. Every row requires automated protocol tests, a real execution proof, session resumption proof, interruption/approval failure tests, and client-level verification. File presence and route counts do not count.

## Verified implementation status (2026-07-12)

| Capability | Status | Evidence |
|---|---|---|
| Canonical agent core/protocol | Verified | `lib/agent-gateway.js`; gateway contract test |
| SQLite persistence/search/branch/compress | Verified | repository/context tests; live MiniMax recall across two CLI processes |
| CLI on shared gateway | Verified | live MiniMax marker `VIOLET-ANCHOR-712`; explicit `--session` resume |
| Web chat on shared gateway | Verified | isolated per-request session; live MiniMax two-turn recall marker `WEB-RECALL-714` |
| HTTP/WebSocket and OpenAI-compatible API | Verified | gateway server contract test |
| ACP transport | Verified | ACP contract test |
| Tools, cancellation, approvals | Verified at protocol level | tool runtime contract; approval events exposed remotely |
| Profiles, goals, checkpoints | Verified at contract level | state-control tests |
| Plugins/hooks | Verified at contract level | plugin manager test |
| Cron | Verified for persistence/lifecycle | next-run calculation, atomic claim, stale recovery, server scheduler |
| Desktop shell | Production build verified | Electron/Vite/React build; shared WebSocket gateway; session resume UI |
| MCP | Partially verified | shared list/reload/tools API and duplicate-process fix; configured servers not live-tested |
| Messaging adapters | Contract verified | Telegram, Discord, Slack and email share durable channel sessions, allowlists and deduplication |
| Rich artifact preview/attachments | Verified | SHA-addressed attachments, artifact discovery/events, desktop picker and live preview |
| Goal auto-continuation judge | Verified at contract level | strict DONE/CONTINUE/WAIT judge with evidence contracts and safe pause behavior |
| MCP tools/resources/prompts | Verified | real stdio MCP contract server exercises connect/call/read/prompt/shutdown |
| Desktop packaged runtime | Verified | source Electron E2E and packaged `PURPCLAW.exe` E2E both pass |
| Durable workflow graphs | Verified | SQLite node checkpoints, condition/parallel/loop/interrupt/resume contract |
| Typed outputs/guardrails/tracing | Verified | schema, tripwire and durable trace/span contracts |
| Evaluation/variant selection | Verified at contract level | deterministic scorer and winning-variant contract; live provider eval remains opt-in because it incurs model cost |
| Full client E2E | Verified for current MiniMax provider | live CLI and web persistence plus source and packaged desktop process tests |

This table is intentionally conservative. PURPCLAW must not claim Hermes parity while any applicable row remains partial or unverified.
