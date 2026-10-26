# Native Control Phase 3

## Purpose

Invert the current control preference without rebuilding PurpClaw.

Current problematic shape:

```text
agent loop
-> tool registry
-> MCP tools are peers with native tools
```

Target shape:

```text
agent loop / Forge semantics
-> deterministic Control Router
-> existing native PurpClaw tool/driver
-> MCP only if no healthy verified native equivalent exists
```

## What stays

The following existing systems remain authoritative:

- `lib/agent-loop.js`
- `lib/tools/index.js`
- `lib/mcp.js`
- provider routing
- workflow registry / `next`
- orchestrator
- coordinator
- unified state
- unified event bus
- timeline
- gatekeeper
- cognitive memory
- context bus
- PM2 service ownership

No second orchestrator, event bus, memory daemon or provider stack is introduced.

## Phase-3 implementation

### Control Router

`lib/control/control-router.js` performs deterministic transport selection.

Rules:

1. A native/built-in request remains native.
2. An MCP request with an explicitly tested native equivalent is redirected to native first.
3. MCP gets zero calls when native succeeds.
4. MCP is permitted after a native failure only for fallback-eligible transport/capability failures.
5. Invalid input, permissions and authentication failures are not blindly retried through MCP.
6. MCP-only capabilities remain available.
7. Operation identity survives fallback.

### Agent-loop seam

`scripts/apply-native-control-phase3.js` patches the existing loop in place rather than replacing it.

It:

- imports the Control Router,
- changes prompt law from MCP-first to native-first,
- makes native `code-search` the default example,
- routes tool execution through `CONTROL.invokeTool`,
- emits a `control-route` event when the requested tool differs from the executed tool,
- adds live control test/certification scripts to `package.json`.

The patcher is idempotent and fails loudly if expected integration seams have drifted.

## State and event projection

Control events are projected best-effort into the existing state service namespace:

```text
state.control.<operationId>
```

The state service already publishes state changes into the existing EventBus, so this does not create a second event transport.

Control-state publication is intentionally non-blocking. A dead state service must not prevent native tool execution.

## Required tests

### Native-over-MCP

```text
requested = mcp__filesystem__read_file
native read exists
native read succeeds

EXPECTED:
executedTool = read
surface = PURPCLAW_DRIVER
MCP calls = 0
```

### Eligible fallback

```text
requested = mcp__filesystem__read_file
native read fails with transport failure
MCP capability works

EXPECTED:
same operationId
native attempted first
MCP attempted second
workflow remains executable
```

### Bad-input containment

```text
native returns INVALID_ARGUMENT

EXPECTED:
no MCP retry
```

### MCP-only capability

```text
no verified native equivalent exists

EXPECTED:
MCP remains callable
```

### Provider independence

Transport selection is deterministic and must not change because Claude/GPT/Kimi/etc. generated the request.

## Live merge sequence

```text
1. checkout branch
2. node scripts/apply-native-control-phase3.js
3. run patcher a second time to prove idempotency
4. node --test tests/control-router-native-priority.test.js tests/control-router-agent-integration.test.js
5. node scripts/certify-control-plane-live.js
6. run existing workflow/registry/drift regressions
7. inspect certification artifact
```

## Completion gate

Phase 3 is complete only when:

```text
CONTROL_ROUTER_PRESENT: PASS
AGENT_LOOP_ROUTED: PASS
MCP_PROMPT_DEMOTED: PASS
DIRECT_TOOL_BYPASS_REMOVED: PASS
CONTROL_ROUTER_TESTS: PASS
AGENT_INTEGRATION_TESTS: PASS
AGENT_LOOP_SYNTAX: PASS
WORKFLOW_REGISTRY_SYNTAX: PASS
NEXT_COMMAND_SYNTAX: PASS
MCP_SYNTAX: PASS
PURPCLAW_CONTROL_PLANE: CERTIFIED
```

A successful MCP connection is not part of the completion gate. That is rather the point.
