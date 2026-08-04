# PURPCLAW: Path to Fully Working End-to-End

> Active goal (set 2026-06-01 by Ted Cannon): make PURPCLAW fully working and looping end to end.
> Spec: `Downloads/deep-research-report (2).md` (Best-in-Show Sovereign AI Operating System).
> This file is the working plan. It will be updated as work ships.

## Definition of Done

PURPCLAW is "fully working and looping end to end" when:

1. **Boot is reproducible** — `purpclaw safe-start --core` brings all services up, no stale Desktop paths, ports declared once.
2. **Agent loop accepts a prompt and dispatches tools** — without manual intervention, with structured tool-call events (no regex-after-the-fact).
3. **Provider drivers emit structured events** — at minimum OpenAI Responses + Anthropic Messages, normalised through `lib/providers/types.ts`.
4. **SpendGate is enforced on every path** — both `chat()` and `streamChat()` block when over budget.
5. **Tool aliases resolve** — `delegate_task`, `agent_spawn`, `spawn_agent` all resolve to `spawn` end to end.
6. **All ports come from one registry** — feature code imports from `lib/runtime/ports.js`.
7. **All external egress goes through GOOP** — no direct API POST bypasses.
8. **Approval modes work** — read-only / workspace-write / danger-full-access.
9. **MCP tooling is unified** — CLI, TUI, web, API all see the same tool inventory.
10. **The system stays up under load** — basic test scaffold + smoke test passes.

## The 9-Step Plan (from the report)

| # | Step | Status | File(s) |
|---|---|---|---|
| 1 | Create provider driver layer | **Done** — types + 3 drivers + registry + llm-provider wire-up | `lib/providers/types.ts`, `lib/providers/{openai-responses,anthropic-messages,hermes-cli,registry}.js` |
| 2 | Refactor `lib/llm-provider.js` into a registry | **Done** — new `streamChatViaDriver()` exports | `lib/llm-provider.js` |
| 3 | Replace prompt-regex tool loop with structured events | **Done** — mid-stream extractor + `tool-call` events | `lib/agent-loop.js` |
| 4 | Unify MCP bootstrapping | **Not started** | `lib/runtime/bootstrap-tools.ts`, `lib/commands/ask.js`, `app/api/chat/route.ts`, `unified_api.js` |
| 5 | Activate tool aliases | **Done** — verified end to end | `lib/tools/index.js` |
| 6 | Enforce SpendGate on streaming | **Done** — both paths protected | `lib/llm-provider.js` |
| 7 | Centralise ports | **Done** — registry file done, smoke test uses it | `lib/runtime/ports.js` + selective sweep |
| 8 | All external APIs through GOOP | **Done** — direct POST in `app/api/api-mega-list/route.ts` now returns 403 | `app/api/api-mega-list/route.ts` |
| 9 | Approval + capability policies | **Done** — read-only / workspace-write / danger-full-access | `lib/runtime/policy-engine.js` |
| — | Test scaffolding (release gates) | **Partial** — `scripts/smoke-test.js` written and passing 9/9 | `scripts/smoke-test.js` |

## Execution Order (highest leverage first)

### Batch A — Provider drivers (next)
The structured-events work in `agent-loop.js` is consumer-side. The new `tool-call` event type needs producers. Build:
- `lib/providers/openai-responses.ts` — `/v1/responses` with `function_call` events
- `lib/providers/anthropic-messages.ts` — `/v1/messages` with `tool_use` / `tool_result` events
- `lib/providers/chatgpt-mcp.ts` — stub for now (uses MCP tool surface)
- `lib/providers/hermes-cli.ts` — stub for now

These are the producer side. After they ship, the agent loop's `tool-call` events will be triggered by real provider events, not just buffer scans.

### Batch B — Refactor llm-provider.js into a registry
Once drivers exist, `llm-provider.js` becomes a thin dispatcher that picks the right driver based on `cfg.format`. This is a behaviour-preserving refactor.

### Batch C — Feature-code port sweep
Grep all `lib/`, `app/`, `bin/`, `unified_*.js`, `agent_tower.js`, `orchestrator.js` for hard-coded `127.0.0.1:NNNN` and `:NNNN` literals. Replace with `getServiceUrl()` / `getPort()` from `lib/runtime/ports.js`. This is grunt work — can be delegated to a subagent.

### Batch D — Unify MCP bootstrap
Create `lib/runtime/bootstrap-tools.ts` that loads MCP tools once. Have CLI, TUI, web, and API all call it. Add snapshot test that asserts CLI tool list === web tool list.

### Batch E — GOOP enforcement
Delete direct POST in `app/api/api-mega-list/route.ts`. Route everything through GOOP. Add a "no direct egress" lint rule or runtime check.

### Batch F — Approval + capability policies
Add `lib/runtime/policy-engine.ts` with read-only / workspace-write / danger-full-access modes. Wire into the agent loop. Add per-tool approval classes.

### Batch G — Test scaffolding
Add `tests/` directory with vitest. Smoke tests for boot, alias resolution, SpendGate enforcement, port registry. Use `scripts/run-smoke.sh` as the entry point. Wire to release gates.

### Batch H — End-to-end verification
Run `purpclaw safe-start --core`. Submit a real prompt. Watch the agent loop dispatch a real tool. Verify SpendGate blocks when over budget. Verify aliases resolve. Confirm system stays up.

## Risks and Watchouts

- **Better-sqlite3 native build** failed in the OmniCode E drive move. The same gotcha could hit here.
- **PM2 dump.pm2 has stale paths** from old `C:\Users\Admin\Desktop\PURPCLAW\`. The boot fix is `npx pm2 kill && purpclaw safe-start --core`.
- **Tower at :7784 is up** but other services were down at the start. Need to re-probe.
- **No MCP server is currently registered with Hermes** for PURPCLAW-specific tools (the OmniCode MCP is separate).
- **Truth-drift is real** — multiple files have conflicting port numbers. The port registry is the fix; the sweep is the rollout.

## Definition of "Looping"

The system is "looping" when the agent loop can take a multi-turn task with several tool calls and complete it without operator intervention. The smoke test is:

1. Boot PURPCLAW (`purpclaw safe-start --core` or equivalent).
2. Submit a prompt that requires 2+ tool calls.
3. Watch the agent loop dispatch the tools, get results, and produce a final answer.
4. Verify the system stays up after the task completes.
5. Verify SpendGate blocks if the task would exceed budget.
6. Verify aliases work (`delegate_task` resolves to `spawn`).

If all 6 pass, PURPCLAW is fully working and looping end to end.
