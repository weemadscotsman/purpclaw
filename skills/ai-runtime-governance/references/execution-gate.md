# Single Execution Gate (PURPCLAW — 2026-05-23)

## The problem

In complex agent stacks, multiple modules can independently trigger execution — orchestrator, direct API endpoints, WebSocket handlers, tool adapters, CLI shortcuts. Without a single funnel, governance can be bypassed entirely and risky jobs silently execute.

## The rule

> ONE entry point for execution. Everything else is illegal shortcut.

## Verified execution paths in PURPCLAW

All execution routes now route through `governance.checkWorkflow()` before touching agents:

| Entry point | Module | Path | Status |
|---|---|---|---|
| `purpclaw run` | CLI → orchestrator | → checkWorkflow() → execute or hold | ✓ Wired |
| Xiaozhi ball WebSocket spawn | unified_api.js | → governance check → AgentTower.spawnAgent or hold | ✓ Wired |
| `/api/tower/agent` direct spawn | unified_api.js | → governance check → AgentTower.spawnAgent or hold | ✓ Wired |

## How unified_api was patched

**WebSocket spawn handler** (ball voice command → explicit spawn):
```javascript
// Added governance require
let governance = null;
try { governance = require('./lib/governance.js'); } catch {}

// Added governance gate before AgentTower.spawnAgent
if (governance) {
  const check = governance.checkWorkflow(PURP_DIR, command, { type: 'operations' });
  if (check.requiresApproval && !check.approved) {
    const approval = governance.requestApproval(PURP_DIR, `ball-${Date.now()}`, command, { type: 'operations' }, check);
    ws.send(JSON.stringify({ type: 'approval_required', approvalId: approval.id, command, agentName }));
    return;
  }
}
// proceed to AgentTower.spawnAgent
```

**API spawn handler** (`/api/tower/agent`):
```javascript
if (governance) {
  const check = governance.checkWorkflow(PURP_DIR, task || `spawn ${selectedAgentName}`, { type: 'operations' });
  if (check.requiresApproval && !check.approved) {
    const approval = governance.requestApproval(PURP_DIR, `tower-${Date.now()}`, task || `spawn ${selectedAgentName}`, { type: 'operations' }, check);
    return sendJson(res, 202, { status: 'approval_required', approvalId: approval.id });
  }
}
// proceed to AgentTower.spawnAgent
```

## Detection method

To audit any codebase for execution bypass paths, scan for ungoverned exec/spawn:
```javascript
// Find exec/spawn that don't have governance context nearby
for pattern in ['exec(', 'execSync', 'spawn(', 'eval(']:
  for each occurrence:
    check ±100 chars for 'governance' or 'checkWorkflow' or 'requestApproval'
    if not found → potential bypass
```

PURPCLAW scan found 0 ungoverned exec/spawn in orchestrator.js after patches.

## Anti-patterns to watch for

- `agent_tower.js` has direct `spawn()` calls for agent processes — these are the actual work executors, correct
- `unified_api.js` has `exec('start chrome ...')` for browser launch — user-initiated convenience features, not agent work, correctly left unmanaged
- CLI commands like `purpclaw doctor`, `purpclaw status`, `purpclaw look` — read-only operations, correctly bypass governance by design