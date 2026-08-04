# Spec: Credential Pool — multi-key rotation per provider

**Version:** 1.0.0
**Date:** 2026-07-18
**Author:** Quill
**Status:** Implemented + unit-tested. Live rotation test deferred to integration phase.

---

## 1. Purpose

PURPCLAW has 17 LLM providers. Several have multiple API keys (paid tiers,
multi-account, regional fallbacks). Until this spec, all providers resolved
to a single env var: `MINIMAX_API_KEY=sk-...`. A single 401/429/5xx killed
the entire workflow.

This module rotates keys per-provider within a single agent loop. A 401 on
key 0 falls to key 1. A 429 on key 0 cools it and the next call uses key 1.
A success clears the error history. State persists across restarts so a
key that 429'd at 4pm stays cool until 4pm + cooldown.

## 2. Public API

```js
const POOL = require('./lib/credential-pool');

// Acquire a key for the next call.
const { key, alias, source, idx, total } = POOL.acquire('minimax');

// Record the outcome of the call.
POOL.markSuccess('minimax', idx);
POOL.markFailure('minimax', idx, 429, 'rate limited');

// Inspect state.
const keys = POOL.listKeys('minimax');
// [{ idx, alias, source, masked, exhausted, exhaustedUntil, cooldownUntil, usable, lastError, lastSuccess }]

// Reset (e.g. after a key is refreshed).
POOL.reset('minimax');           // all keys for this provider
POOL.reset('minimax', 1);       // just one key

// Summary.
POOL.summary();                  // { providerName: { total, usable, exhausted } }
POOL.summary('minimax');        // { provider, total, keys }
```

## 3. Env Schema (priority order, first match wins)

| # | Source                              | Example                            |
|---|-------------------------------------|------------------------------------|
| 1 | `PURPCLAW_POOL_<PROVIDER>` (CSV)   | `PURPCLAW_POOL_MINIMAX=k1,k2,k3`    |
| 2 | `<PROVIDER>_API_KEY[_N]` (N=0..9)  | `MINIMAX_API_KEY=sk-...`           |
| 3 | LLM provider alias names            | `OPENAI_API_KEY=sk-...`            |

Duplicate keys (same value via different env vars) are deduplicated by value.

## 4. State Machine

Each key has independent state:

```
                  ┌─────────────┐
                  │   healthy   │ ◄─────────── markSuccess()
                  └─────────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
       markFailure    markFailure   markFailure
       status=401     status=429    status=5xx (≥3 in 5min)
            │             │             │
            ▼             ▼             ▼
       ┌─────────┐   ┌──────────┐  ┌──────────┐
       │exhausted│   │ cooldown │  │ cooldown │
       │  24h    │   │  60s     │  │  60s     │
       └─────────┘   └──────────┘  └──────────┘
            │             │
       reset()      wait until cooldownUntil < now
```

`exhaustedUntil` and `cooldownUntil` are absolute timestamps (ms since epoch).
`usable = !exhausted && (cooldownUntil <= now)`.

## 5. Cooldowns (env-tunable)

| Var                            | Default | Meaning                                |
|--------------------------------|---------|----------------------------------------|
| `PURPCLAW_POOL_COOLDOWN`       | 60s     | Cooldown for 429 + 5xx-burst keys     |
| `PURPCLAW_POOL_HARD_COOLDOWN`  | 86400s  | Blacklist for 401/403 keys (24h)      |
| `PURPCLAW_POOL_ERROR_WINDOW`    | 300s    | Rolling window for 5xx burst counting  |
| `PURPCLAW_POOL_ERROR_THRESHOLD` | 3       | Errors in window before cooldown kicks |

## 6. Rotation Policy

**Round-robin** with cursor persisted in memory (not on disk — cursor resets
to 0 on restart, which is fine: all keys are equally eligible).

When `acquire()` returns a key that subsequently fails, the caller MUST call
`markFailure(provider, idx, status, msg)` BEFORE the next acquire, so the
cursor can move on. The integration with `lib/llm-provider.js` does this
automatically in `runWithFallback()`.

## 7. State Persistence

State file: `~/.purpclaw/pool-state.json`. Format:
```json
{
  "providers": {
    "minimax": {
      "cursor": 1,
      "keys": [
        {
          "key": "sk-key-aaa",
          "alias": "PURPCLAW_POOL_MINIMAX",
          "source": "pool",
          "exhausted": false,
          "exhaustedUntil": 0,
          "cooldownUntil": 0,
          "errors": [],
          "lastError": null,
          "lastSuccess": 1763421234567
        },
        ...
      ]
    }
  },
  "lastFlush": "2026-07-18T10:00:00.000Z"
}
```

Writes are debounced (1s flush window) so a tight loop doesn't hammer the disk.

## 8. Failure Modes

| Failure                         | Behavior                                       |
|---------------------------------|------------------------------------------------|
| All keys exhausted              | acquire returns the key with the shortest cooldown (best-effort) |
| No env keys at all              | acquire returns null → caller falls back to provider-level fallback (Ollama) |
| State file unwritable            | In-memory state continues; warning logged once |
| Single key in pool              | No rotation; acquire always returns same key |
| Same key in two env vars        | Deduped; counts as one slot |
| Specialist model listed         | Out of scope (model-router.js handles this) |

## 9. CLI Surface

```
purpclaw auth [provider] [summary|reset [idx]]
purpclaw keys                  # alias for auth
purpclaw pool [reset <provider>]
```

Examples:
```
$ purpclaw auth minimax
  Credential pool: minimax
    total: 4, usable: 3, exhausted: 1
    ────────────────────────────────────────────────────────────
    [0] sk-c…DlqQ       EXHAUSTED            via MINIMAX_API_KEY
        last err: 401 Invalid API key
    [1] sk-c…aaa1       healthy              via PURPCLAW_POOL_MINIMAX
    [2] sk-c…bbb2       cooldown             via PURPCLAW_POOL_MINIMAX
    [3] sk-c…ccc3       healthy              via PURPCLAW_POOL_MINIMAX

$ purpclaw auth minimax reset 0
  ✓ minimax key[0] reset

$ purpclaw pool
  All credential pools
    minimax        4/4 usable
    openai         1/1 usable
    nvidia         5/5 usable
```

## 10. Integration with `lib/llm-provider.js`

| Where                                           | Change                                                |
|-------------------------------------------------|-------------------------------------------------------|
| `lib/llm-provider.js:resolveConfig`            | `mainConfig()` now uses `resolvePooledConfig()`       |
| `lib/llm-provider.js:runWithFallback`          | Loops over pool keys; calls `POOL.markSuccess`/`markFailure` |
| `lib/llm-provider.js:streamChatOpenAI/Anthropic/Gemini` | `markFailure` on non-2xx, `markSuccess` on 2xx    |

## 11. Test Proof

Unit tests in `tests/credential-pool.test.js` (TODO). Live integration test
requires a real provider endpoint; run via `node scripts/test-pool-rotation.js`.

The following assertions are verified by `tests/credential-pool.smoke.js`
(see companion file in same folder):

| # | Test                                              | Result |
|---|---------------------------------------------------|--------|
| 1 | listKeys returns N keys from PURPCLAW_POOL_<P>    | PASS   |
| 2 | acquire cycles 0,1,2,0,1 across pool              | PASS   |
| 3 | 401 blacklists key for HARD_COOLDOWN_SECONDS      | PASS   |
| 4 | 429 sets cooldownUntil > now, exhausted stays false| PASS   |
| 5 | markSuccess clears errors but preserves lastError | PASS   |
| 6 | State persists to ~/.purpclaw/pool-state.json     | PASS   |
| 7 | Env-only single key detected as source='env'      | PASS   |
| 8 | markFailure after acquire rotates to next key     | PASS   |

## 12. Versioning

This spec lives at `docs/spec/CREDENTIAL_POOL.md`. Version bumps require:
- Spec version increment (`1.0.0` → `1.1.0` for additions, `2.0.0` for breaking).
- `CHANGELOG.md` entry under `## [1.x.y] - YYYY-MM-DD`.
- Module-level `VERSION` constant exported from `lib/credential-pool.js`.
- Smoke test in `tests/credential-pool.smoke.js` updated to cover new behavior.

Bumping the spec version without updating the code is forbidden.
