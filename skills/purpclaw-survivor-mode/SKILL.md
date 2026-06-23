---
name: purpclaw-survivor-mode
description: PURPCLAW provider failover and process watchdog system. Provider health registry, Mallory memory leash, survivor router. Applies to PURPCLAW orchestrator.js wiring or any agent harness needing runtime resilience.
origin: SLAY-2026-05-28-CODEX-QUOTA incident
---

# PURPCLAW Survivor Mode

Built after Codex quota wall + Mallory RAM goblin took down the entire stack.

## Files

```
PURPCLAW/lib/
  provider_health.js   — live provider state registry
  survivor_router.js  — reroutes around dead providers
  mallory/
    index.js          — process memory watchdog
```

## Provider Health Registry (provider_health.js)

Tracks every model/provider. Handles quota detection, auth failure, timeout, rate limit.

```javascript
const { markProviderUp, markProviderDown, getFallback, isProviderAvailable, statusTable } = require('./lib/provider_health');
```

Key states:
- `available` — ready to use
- `quota_dead` — hit usage limit (e.g. Codex until May 31 2026 14:06)
- `auth_failed` — bad token
- `rate_limited` — temporary
- `timeout` — connection died
- `unavailable` — dead, no fallback found

On any call failure:
```javascript
markProviderDown('codex', 'quota', new Error('429 usage limit'));
```

On success:
```javascript
markProviderUp('deepseek', { ts: Date.now() });
```

Check before routing:
```javascript
if (isProviderAvailable('minimax')) { ... }
```

## Mallory Leash (mallory/index.js)

Memory watchdog. Scans `tasklist`, kills processes above threshold.

Thresholds (MB):
| Type          | Alert | Kill |
|-------------|-------|------|
| node         | 400   | 800  |
| python       | 300   | 600  |
| orchestrator | 768   | 1536 |
| tower        | 400   | 800  |
| goop         | 200   | 400  |
| default      | 150   | 350  |

```javascript
const { malloryTick, malloryStatus } = require('./lib/mallory');
const result = await malloryTick();
// result: { killed: [{pid, name, mb}], warned: [...], malloryActive: bool }
console.log(malloryStatus(result));
```

Logs: `PURPCLAW/logs/mallory-kills.jsonl` and `mallory-alerts.jsonl`.

## Survivor Router (survivor_router.js)

Wraps provider calls with automatic failover.

```javascript
const { survivorRoute } = require('./lib/survivor_router');

const { success, result, reroutedTo, deadProvider } = await survivorRoute({
  primaryProvider: 'codex',
  makeCall: async (providerId) => {
    if (providerId === 'codex') return callCodex();
    if (providerId === 'minimax') return callMiniMax();
    if (providerId === 'deepseek') return callDeepSeek();
    throw new Error('unknown provider');
  },
});
```

Fallback chain:
```
codex → minimax → deepseek → hermes → local → null
```

## Wiring into Orchestrator

In orchestrator.js `spawnAgent()` before the provider call:

```javascript
const { isProviderAvailable } = require('./lib/provider_health');
// Before making an agent call:
const provider = isProviderAvailable('codex') ? 'codex' : (isProviderAvailable('minimax') ? 'minimax' : 'deepseek');
```

In `completeWorkflow()` after running diagnostics:

```javascript
const { malloryTick, malloryStatus } = require('./lib/mallory');
const malloryResult = await malloryTick();
if (malloryResult.malloryActive) {
  console.log(malloryStatus(malloryResult));
  // Terminal Fly warning fires here
}
```

## Canon (SLAY-2026-05-28-CODEX-QUOTA)

- Mallory: the runaway process that eats the swarm — now leashed
- Gary: causes chaos
- Mallory: consumes memory
- The Fly: spots it
- The Fish: verifies it
- The Goose: files the ticket
- Luno: keeps the blade out
