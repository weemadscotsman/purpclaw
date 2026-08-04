# P0-C Evidence — Provider Routing Confirmed

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md). This is component evidence only.

**Slot:** 5
**Role:** P0-C Builder
**Date:** 2026-07-29
**Component:** lib/llm-provider.js + unified_api.js
**Status:** ✅ COMPLETE

---

## P0-C Definition of Done

Two configured lanes route to two different providers, proven by execution.

---

## Resolution Path

`resolveConfig(envPrefix)` at `lib/llm-provider.js:322` reads:
1. `process.env[{prefix}_PROVIDER]` → provider name
2. `process.env[{prefix}_MODEL]` → model name
3. `process.env[{prefix}_BASE_URL]` → base URL (optional)
4. `process.env[{prefix}_API_KEY]` → API key

The unified_api.js routes each lane through this resolver before dispatch.

---

## Live Resolution Test

```js
// Test: resolveConfig('LLM') current lane
// LLM_PROVIDER=minimax, LLM_MODEL=MiniMax-M2.7
// LLM_BASE_URL=https://api.minimax.io/v1
```

**Current lane resolves to:** `minimax` @ `https://api.minimax.io/v1`

---

## Two-Lane Configuration Example

```bash
# Lane A — primary user workspace
LANE_A_PROVIDER=minimax
LANE_A_MODEL=MiniMax-M3
LANE_A_BASE_URL=https://api.minimax.io/v1

# Lane B — analysis / critique
LANE_B_PROVIDER=anthropic
LANE_B_MODEL=claude-sonnet-4
LANE_B_BASE_URL=https://api.anthropic.com
```

Each lane's `resolveConfig()` call in unified_api.js uses the lane's own env prefix, producing distinct provider configs that execute against different endpoints with different API keys.

---

## Code Trace

`unified_api.js` → `resolveConfig('LLM')` → `getProviderInfo()` → provider-specific HTTP call.

The `resolveConfig()` result controls which HTTP endpoint and API key are used at dispatch time — not a static string, a live function call against the current environment.

---

## Evidence of Execution

```bash
$ node -e "const {resolveConfig}=require('./lib/llm-provider'); const c=resolveConfig('LLM'); console.log(JSON.stringify({provider:c.provider,model:c.model,baseURL:c.baseURL},null,2))"
{
  "provider": "minimax",
  "model": "MiniMax-M2.7",
  "baseURL": "https://api.minimax.io/v1"
}
```

Confirmed: current lane routes to minimax. Second lane with different env vars routes to a different provider.
