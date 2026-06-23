# Provider Unification — Replacing Hardcoded API Endpoints with llm-provider.js

> Added: 2026-06-06. Pattern for removing hardcoded provider dependencies from agent execution paths.

## The problem

Agent execution had THREE fallback paths, all dependent on a single vendor (Kimi/Moonshot):

1. **Kimi CLI** (`kimi.exe` subprocess) — spawns a local binary that may not be installed
2. **KimiClient** (`kimi_client.js` with `KIMI_API_KEY`) — cloud API call to `api.moonshot.cn`
3. **Node.js stub** — lists files in the work directory and exits. **Silent no-op. No cognitive work happened.**

When Kimi wasn't available, agents showed as "completed" but did nothing — the worst kind of failure.

Additionally, the Shaman Layer and ShamanEvaluator hardcoded `api.moonshot.cn` and `kimi-k2-5` model strings in three separate files, bypassing the user's configured provider.

## The fix

All provider routing now goes through `lib/llm-provider.js` — the single provider gateway that supports 17 providers (OpenRouter, MiniMax, Anthropic, OpenAI, DeepSeek, etc).

### Files changed

| File | Before | After |
|---|---|---|
| `agent_tower.js` | 172 lines of Kimi detection + 3-way execution branch | 35 lines: single `llmComplete()` call |
| `unified_api.js` | `require('./kimi_client.js')` + Moonshot config pass-through | Removed Kimi import, removed Moonshot backend config |
| `digital_shaman.js` | Constructor + `callAI()` hardcoded `api.moonshot.cn`, `KIMI_API_KEY`, `kimi-k2-5` | Constructor reads `LLM.getProviderInfo()`, `callAI()` uses `LLM.chat()` |
| `shaman_evaluator.js` | Two classes with Moonshot defaults + raw HTTPS `callAI()` | Both classes use `LLM_PROVIDER`/`LLM_MODEL` env vars, `callAI()` uses `LLM.complete()` |
| `kimi_client.js` | Full KimiClient class | Archived (zero callers) |

### The tower execution path (before)

```
agent execution requested
├── Kimi CLI installed? → spawn kimi.exe subprocess
├── KIMI_API_KEY set? → call api.moonshot.cn via KimiClient
└── neither → spawn Node.js stub: list files, print "Stub complete."
              (agent reports success, did nothing)
```

### The tower execution path (after)

```
agent execution requested
└── call llm-provider.js::complete(agentPrompt, {temperature, maxTokens})
    ├── OpenRouter configured? → route through OpenRouter
    ├── MiniMax configured? → route through MiniMax
    ├── Anthropic configured? → route through Anthropic
    └── no provider configured → clear error: "[provider] Error: 401/setup needed"
```

### Verification gates

| Test | Before | After |
|---|---|---|
| Kimi not installed | Falls to stub (silent no-op) | Routes through configured provider |
| `KIMI_API_KEY` missing | Stub or crash | Clear provider error |
| OpenRouter configured | Never used for agents | Agents use OpenRouter |
| No provider configured | Stub runs (looks like success) | Clear setup error |
| Logs show provider | No | `[TOWER] dragon completed via openrouter/deepseek-v4-pro` |

### The Shaman `callAI()` method (before vs after)

Before: 70 lines of raw HTTPS request construction, hardcoded endpoint, manual JSON parsing, timeout management, error handling.

After: 15 lines wrapped in `LLM.chat()` — provider selection, auth, retries, and error handling delegated to the unified layer.

## Don'ts

- Do NOT add a new direct provider call (`fetch('https://api.X.com/...')`) in agent_tower.js, digital_shaman.js, shaman_evaluator.js, or any other execution path. Route through `llm-provider.js`.
- Do NOT import `kimi_client.js` or reference `KIMI_API_KEY` in agent execution code.
- Do NOT build fallback logic that silently succeeds without doing real work. A stub that "completes" without executing cognitive logic is worse than a clear error.
- Do NOT hardcode provider URLs in constructor defaults. Read from `llm-provider.js` or env vars.

## Related

- `lib/llm-provider.js` — the single provider gateway (17 providers)
- `ecosystem.config.js` — runtime config for which provider to use
- `references/cognitive-cluster-wake.md` — booting the cognitive spine that the provider layer talks to
