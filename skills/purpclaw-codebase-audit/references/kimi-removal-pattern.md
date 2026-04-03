# Kimi Dependency Removal — Execution Path Consolidation (2026-06-06)

## What was done

Removed Kimi Code CLI (`kimi.exe`), KimiClient (`kimi_client.js`), and stub fallback from PURPCLAW's agent tower. All agent execution now routes through `llm-provider.js` (single provider gateway supporting OpenRouter, MiniMax, etc.).

## Files changed

| File | What changed | Lines |
|---|---|---|
| `agent_tower.js` | Removed Kimi CLI detection, fallback paths, KimiClient init, 3-way execution branch. Single call to `llm-provider.js::complete()`. | 172 → 35 |
| `unified_api.js` | Removed `kimi_client.js` require + `KIMI_API_KEY` init. | 18 → 2 |
| `digital_shaman.js` | `callAI()` rewritten from raw HTTPS requests to `LLM.chat()`. | 67 → 28 |
| `shaman_evaluator.js` | Constructor defaults changed from Moonshot/Kimi to `LLM_PROVIDER`/`LLM_MODEL`. `callAI()` → `LLM.complete()`. | 2 classes fixed |
| `kimi_client.js` | Archived (zero callers remaining). | — |

## Before: 3-way execution branch

```
agent_tower.js:
  1. Kimi CLI (spawn kimi.exe)  ─┐
  2. KimiClient (cloud API)     ─┤  3 separate paths,
  3. Node.js stub (lists files) ─┘  all Kimi-dependent
```

The stub was the worst — it pretended to be an agent by listing files in the work directory. Agent appeared "spawned" and "completed" but did zero cognitive work.

## After: 1 provider call

```
agent_tower.js:
  1. llm-provider.js::complete(prompt, opts, system)
     → routes through configured provider (OpenRouter/MiniMax/etc.)
```

## Before: Shaman layer hardcoded

```
digital_shaman.js:
  endpoint: 'https://api.moonshot.cn/v1/chat/completions'
  apiKey: process.env.KIMI_API_KEY
  model: 'kimi-k2-5'
  → raw HTTPS request via http.request()
```

## After: Shaman uses same provider layer

```
digital_shaman.js:
  provider: LLM_PROVIDER (from .env)
  model: LLM_MODEL (from .env)
  → routes through LLM.chat()
```

## Key pattern: Replace N execution paths with 1

When a system has multiple fallback paths that all do the same thing (execute an LLM prompt), consolidate them into a single provider call. The tower shouldn't care which provider runs the agent — it should pass the prompt and let the provider layer decide routing.

## Verification gates

| Test | Expected |
|---|---|
| Kimi not installed | ✅ agent still runs |
| KIMI_API_KEY missing | ✅ no crash |
| OpenRouter configured | ✅ agent completes |
| MiniMax configured | ✅ agent completes |
| bad provider key | ✅ clear auth error |
| no provider key | ✅ clear setup error |
| logs | ✅ show provider + model |
| mock stub | ✅ never used unless `--mock` has been explicitly passed as an option flag |
