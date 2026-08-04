# 36 — Agent Protocol

**Tier:** 3 (Specialized — emerging standard)
**Vendor:** LangChain-led community initiative
**License:** MIT
**Initial release:** 2024
**Last major update:** Q4 2025 (v2 spec, broader adoption)

---

## What it is
A standardized HTTP/WebSocket protocol for agent-to-client communication. Defines a uniform API contract that any agent framework can implement and any client (chat UI, mobile app, automation tool) can consume. Goal: stop every framework inventing its own chat API.

## Core capabilities
- [x] Standard HTTP endpoints for chat, run, history
- [x] Server-Sent Events for streaming
- [x] OpenAPI 3.1 schema
- [x] TypeScript + Python reference servers
- [x] Multi-framework adapters (LangGraph, OpenAI Agents, AutoGen, CrewAI)
- [x] Open-source chat UIs that work against any compatible server
- [x] OAuth-compatible auth extensions
- [x] Stateless request design (scales horizontally)

## Architecture
```
Client (any UI) → POST /runs { input, config } → Agent server (any framework)
                          ↓ SSE
                       streaming events
                          ↓
              GET /runs/{id} → final state
```
- REST + SSE
- Framework-agnostic
- Stateless server (state in URL or external store)

## Strengths
- Solves real fragmentation problem
- Backed by LangChain + major vendors
- Reference implementations in 4+ frameworks
- Free open-source clients exist (Open Chat UI)

## Weaknesses
- Still maturing — v2 has breaking changes from v1
- Limited adoption outside LangChain ecosystem
- Doesn't cover tool/MCP/auth standards (those are separate)
- Some endpoints ambiguous (run vs thread)

## Best use case
Teams that want a vendor-neutral chat UI / mobile app / integration surface that works with any agent framework backend. Reduces lock-in.

## PURPCLAW fit: 5/10 (Tier C — Evaluate)
- **Potentially useful as a future compatibility layer.** If anyone wants to connect a third-party UI to PURPCLAW, implementing the Agent Protocol spec on `lib/api-harness-kernel.js` would let them.
- **Pattern to learn:** the contract-first design. `lib/api-mega-list.js` could grow a `lib/api-spec.json` to formalize what we expose.
- **No action now.** Park for Q3 review.

## Integration sketch (concept)
- Implement the v2 endpoints on `unified_api.js`:
  - `POST /runs` → spawn agent job
  - `GET /runs/{id}` → job state
  - `GET /runs/{id}/stream` → SSE event stream
  - `GET /threads/{id}/history` → message log
- Existing `/api/chat` and `/api/agents/registry` already cover most of this — the work is naming, not building.

## PURPCLAW parity
| Agent Protocol concept | PURPCLAW equivalent |
|---|---|
| `POST /runs` | `POST /api/command` (single-shot) + `POST /api/spawn` (agent) |
| SSE streaming | `GET /api/stream` (already implemented) |
| Run state | `GET /api/agents/registry` + `GET /api/jobs` |
| History | `GET /api/logs` |
| Standardized schema | not implemented — gap |

## Sources
- https://github.com/langchain-ai/agent-protocol
- Agent Protocol v2 spec (Q4 2025)
- LangChain blog "Standardizing Agent APIs"
