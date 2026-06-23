# Model Hot-Reload Layer (2026-06-06)

Architecture for runtime-swappable provider/model routing without stack restarts.

## Single Config Source: `model_registry.json`

One file maps job types to preferred backends:

```json
{
  "routing": {
    "chat":    { "provider": "{{LLM_PROVIDER}}", "model": "{{LLM_MODEL}}" },
    "code":    { "provider": "openrouter",  "model": "anthropic/claude-sonnet-4" },
    "local":   { "provider": "ollama",      "model": "qwen2.5:3b" },
    "swarm":   { "provider": "{{SWARM_PROVIDER}}", "model": "{{SWARM_MODEL}}" },
    "creative":{ "provider": "openrouter",  "model": "anthropic/claude-3.5-haiku" },
    "vision":  { "provider": "gemini",      "model": "gemini-2.5-flash" },
    "tts":     { "provider": "kokoro",      "model": "af_heart" },
    "video":   { "provider": "moneyprinter","model": "default" }
  }
}
```

Template vars (`{{LLM_PROVIDER}}`) resolve to `process.env` at read time.

## CLI Commands

| Command | What it does |
|---|---|
| `purpclaw model list` | Show all 17 providers, mark active/swarm |
| `purpclaw model use <p>/<m>` | Hot-swap: writes .env, sets process.env, no restart |
| `purpclaw model reload` | Blast .env into process.env (for manual edits) |
| `purpclaw model current` | Show full per-job routing table from model_registry.json |
| `purpclaw model test "..."` | Quick ping to active model, returns raw response |
| `purpclaw models` | Alias for model |
| `purpclaw show` | Includes `🧠 ACTIVE MODEL: deepseek / deepseek-v4-pro` |

## Runtime Behavior Rules

- No restart for provider switch — `process.env.LLM_PROVIDER` changed in place
- No stack crash if model unavailable — `llm-provider.js` returns clear error
- Bad key gives `401 Unauthorized` or `[provider] Error: <message>`
- Agents use the same active model via `llm-provider.js::complete()`
- Swarm can override model per role via `options.model`
- Every call logs provider/model in `[TOWER] dragon completed via openrouter/deepseek`

## Wiring Points

| Surface | Reads from |
|---|---|
| CLI (`purpclaw ask`) | `llm-provider.js` which reads `process.env` |
| TUI | `llm-provider.js` same as CLI |
| WebUI | `unified_api.js` → `llm-provider.js` |
| Agent Tower | `llm-provider.js::complete()` |
| Swarm | `llm-provider.js::chat()` |
| Shaman | `llm-provider.js::chat()` |
| Cognitive Spine health | `GET /cognitive/health` (read-only) |

## Job-to-Provider Routing Rules

| Job | Preferred | Why |
|---|---|---|
| Fast chat | MiniMax / OpenRouter free | Low latency, cheap |
| Code reasoning | OpenRouter coder model | Best code quality |
| Local/offline | Ollama | Zero API cost |
| Swarm agents | Default swarm provider | Configurable via SWARM_PROVIDER |
| Creative/shaman | OpenRouter creative model | High temperature, associative |
| Vision/image | Gemini | Native vision API |
| TTS | Kokoro | Local, fast, no API calls |
| Video | MoneyPrinterTurbo | External tool on :8080 |

## Pitfalls

- **Process.env doesn't propagate to already-running PM2 processes.** The `model use` command updates the current shell's env, but PM2-managed services continue using the env they were started with. Restart the target PM2 service after switching.
- **model_registry.json uses `{{LLM_PROVIDER}}` template syntax** — the `model current` command resolves these. If a template var isn't in process.env, the raw name (e.g. `LLM_PROVIDER`) appears instead.
- **`model test` uses `llm-provider.js::complete()`** which may not reach all provider types. Vision and TTS providers aren't tested by this command.
