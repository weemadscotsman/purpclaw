# Context Bus Implementation — PURPCLAW

Built: May 24, 2026. Service lives at `lib/context-bus.js`. PM2 name: `purpclaw-context`. Port: 7881.

## Architecture

```
EventBus (:7782)  →  context-bus (:7881)  →  shared.json
    poll every 2s      HTTP API              persistent state
                      /context/stats
                      /context/agent/:name
                      /context/team/:intent
                      /context/workflows
                      /context/lock
```

Context-bus listens to EventBus for `agent.spawned`, `agent.completed`, `agent.failed`, `workflow.started`, `workflow.completed`, `workflow.failed` events. When it receives one, it updates its in-memory state and persists to `shared.json`.

Agents can also call the HTTP API directly to register state or query other agents.

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{"status":"healthy","service":"context-bus","port":7881}` |
| GET | `/context/stats` | Agent/workflow/lock counts + aggregate stats |
| GET | `/context/agent/:name` | Full agent state snapshot |
| GET | `/context/team/:intent` | All agents with matching `currentIntent` |
| GET | `/context/workflows` | All workflow states |
| POST | `/context/lock` | `{"resourceId","agentId","ttlMs"}` → acquire lock |

## Key Implementation Decisions

### EventBus Polling (not subscribe)

Context-bus polls EventBus every 2 seconds rather than subscribing as an EventBus client. Reason: context-bus needs to aggregate state over time, not just relay events. Polling gives it time to compute deltas and update state atomically.

```javascript
setInterval(async () => {
  const events = await pollEventBus('/events');
  for (const event of events) {
    if (event.type === 'agent.spawned') {
      state.agents[event.agentId] = { status: 'active', ... };
    }
    // ...
  }
  saveState();
}, 2000);
```

### Lock TTL Pattern

Locks expire after `ttlMs`. Lock holder is `agentId`. `acquireLock()` returns `{ success: true }` if acquired, `{ success: false, lockedBy: agentId }` if held by another. Lock release is automatic on TTL expiry (checked on every poll cycle).

### shared.json Persistence

State is written to `agent_work/shared.json` on every mutation (agent update, workflow state change, lock acquire/release). Atomic write via temp file + rename. Loads on startup.

## Build Log (May 24 2026)

- `lib/context-bus.js` created (13,963 bytes)
- Added to `ecosystem.config.js` as `purpclaw-context` entry (fork mode, max_restarts: 2)
- Added to `service_registry.js` (key: `context-bus`, group: `core`, port: 7881)
- `cmdContext()` added to `bin/purpclaw.js` — `purpclaw context stats/team/agent/workflows/lock`
- `CTX_PORT` + `ctxGet()` moved to module scope in `bin/purpclaw.js` — **critical fix** (ctxGet was local to cmdContext, not accessible from cmdStatus)

## ctxGet Scope Bug (Critical — Do Not Repeat)

**Symptom**: `purpclaw status` threw `ReferenceError: ctxGet is not defined`. KNOWLEDGE POOL section skipped entirely.

**Root cause**: `ctxGet()` was defined inside `cmdContext()` function body (line ~108581 in bin/purpclaw.js), but called from `cmdStatus()` which appears earlier in the file. Local functions are not hoisted across separate top-level function definitions.

**Fix applied**:
```javascript
// MODULE SCOPE (before any cmdX functions)
const CTX_PORT = parseInt(process.env.CONTEXT_PORT || '7881', 10);
function ctxGet(path) {
  return new Promise(resolve => {
    http.get({ hostname: '127.0.0.1', port: CTX_PORT, path }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// IN cmdStatus, call it with path only:
const ctx = await ctxGet('/context/stats');  // NOT full URL
```

**Rule**: All shared helpers (HTTP wrappers, constants, formatters) must be at module scope in a single-file CLI. If you add a helper inside `cmdContext`, add it to module scope too.

## Verification Commands

```bash
# Health check
curl http://localhost:7881/health

# Stats
curl http://localhost:7881/context/stats

# CLI command (requires ctxGet at module scope)
node bin/purpclaw.js context stats

# PM2
pm2 list | grep context
pm2 logs purpclaw-context --nostream --lines 20
```