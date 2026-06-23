# DeepSeek Provider Configuration (2026-06-06)

DeepSeek deprecated `deepseek-chat` and `deepseek-reasoner` models (sunset 2026-07-24).
Replace with `deepseek-v4-flash` (non-thinking) and `deepseek-v4-pro` (thinking mode).

## Provider config block (lib/llm-provider.js)

```js
deepseek: {
  baseUrl      : 'https://api.deepseek.com',  // NOT /v1 — the SDK appends it
  defaultModel : 'deepseek-v4-pro',
  authHeader   : 'Bearer',
  format       : 'openai',
},
```

The baseUrl `https://api.deepseek.com` (without `/v1`) is intentional — the
OpenAI-compatible SDK layer appends `/v1/chat/completions` automatically.

## Environment variables

- `DEEPSEEK_API_KEY=***` — new format API key from console.deepseek.com
- Old keys ending in `****bd28` are stale
- **Windows gotcha:** System environment variables take precedence over `.env`.
  If `DEEPSEEK_API_KEY` is set in Windows System Environment, it overrides the
  `.env` file value. Override per-session:
  ```powershell
  $env:DEEPSEEK_API_KEY="sk-..."     # PowerShell (session-only)
  setx DEEPSEEK_API_KEY sk-...        # permanent
  ```

## Anthropic-compatible format

DeepSeek also supports Anthropic API format at `https://api.deepseek.com/anthropic`.
Usable by setting `format: 'anthropic'` in the provider config block.

## Verified (2026-06-06)

```
$ purpclaw ask --provider deepseek "Hello! Respond in one sentence."
Hello! I'm ready to help—just tell me what you need.
─── done in 1 turn(s), 52 tokens streamed, 0 tool call(s) ───
```

## Models table

| model | status | notes |
|---|---|---|
| `deepseek-v4-flash` | ✅ current | non-thinking, fast |
| `deepseek-v4-pro` | ✅ current | thinking mode, high reasoning_effort |
| `deepseek-chat` | ⚠ deprecated | maps to v4-flash non-thinking, sunset 2026-07-24 |
| `deepseek-reasoner` | ⚠ deprecated | maps to v4-flash thinking, sunset 2026-07-24 |
