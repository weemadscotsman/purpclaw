---
name: sse-streaming-pattern
description: Server-Sent Events (SSE) streaming pattern for PURPCLAW endpoints that need to emit real-time tokens, phase updates, and progress. Used for /api/chat, /api/llm/plan, and any future endpoint that should feel responsive like Claude Code.
when_to_use: Adding streaming to a new endpoint; replacing a JSON-blob endpoint with progressive updates; wiring LLM token streams to the UI
version: 1.1.0
---

# SSE Streaming Pattern — PURPCLAW

Real-time, token-level streaming for LLM-backed endpoints. Same UX as Claude Code / Codex — the user sees tokens appear character-by-character instead of waiting for a blob.

## The Three Pieces

### 1. Backend: `sseStart` / `sseEvent` / `sseComment` helpers
Lives in `unified_api.js` near `parsePlanJson`. Use these for every SSE endpoint.

```js
function sseStart(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',     // disable nginx buffering if any
  });
  if (res.flushHeaders) res.flushHeaders();
}
function sseEvent(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
}
function sseComment(res, text) {
  try { res.write(`: ${text}\n\n`); } catch {}  // keeps connection warm
}
```

### 2. LLM provider: `streamChat(messages, opts)`
Lives in `lib/llm-provider.js`. Returns an async iterator of `{ content, done, model, usage? }` chunks. Auto-routes OpenRouter model IDs. Wired to OpenAI-compatible `stream: true` SSE. No fallback (callers handle errors so partial responses survive).

```js
for await (const chunk of llm.streamChat(messages, { model: 'z-ai/glm-4.5-air:free' })) {
  if (chunk.content) process.stdout.write(chunk.content);
  if (chunk.done) break;
}
```

### 3. Endpoint handler pattern
Every streaming endpoint follows the same shape:

```js
if (pathname === '/api/<endpoint>' && method === 'POST') {
  if ((req.headers['accept'] || '').includes('text/event-stream')) {
    return handleMyStream(req, res);
  }
  // ... existing JSON path
}

async function handleMyStream(req, res) {
  const body = await parseBody(req);
  // ... validate
  sseStart(res);
  sseEvent(res, 'phase', { phase: 'received' });
  try {
    for await (const chunk of llm.streamChat(messages, opts)) {
      if (chunk.content) sseEvent(res, 'token', { content: chunk.content, model: chunk.model });
      else if (chunk.done) break;
    }
    sseEvent(res, 'done', { result });
  } catch (e) {
    sseEvent(res, 'error', { error: e.message });
  }
  return res.end();
}
```

### 4. Frontend: `streamPlanSend` in CommandPanel
Reads the SSE stream via `fetch(...).body.getReader()`, parses `\n\n`-delimited events, calls `updateMsg(id, patch)` on each event. Token events append to a live buffer; phase events update the meta line; merged events set the plan steps.

```js
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf('\n\n')) !== -1) {
    const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
    if (block.startsWith(':')) continue;
    let ev = 'message', data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
    }
    if (!data) continue;
    try { onEvent(ev, JSON.parse(data)); } catch {}
  }
}
```

## Event Vocabulary (stick to these names)

| event | when | data |
|---|---|---|
| `phase` | lifecycle milestone | `{ phase: 'received'\|'search'\|'propose'\|'merge'\|'thinking'\|'done'\|'error' }` |
| `context` | sem-search results found | `{ sources: [{file, score}], count }` |
| `token` | LLM token arrived | `{ content, model }` |
| `proposal` | one fan-out model finished | `{ model, ok, elapsed, length?, error? }` |
| `merged` | final plan ready | `{ steps, judge, mode, contextSources }` |
| `done` | stream complete | `{ ok, stepCount, reply?, model? }` |
| `error` | any failure | `{ error: string }` |

Frontend: keep meta short. 1 emoji + 1 short verb is enough ("🔍 searching…", "🧠 proposing…", "📡 z-ai: ✓ 4523ms").

## Pitfalls (learned the hard way)

1. **Buffer flush.** Always set `flushHeaders()` after `writeHead` so the browser gets the headers immediately, not on first `write`.
2. **Try/catch around every `res.write`.** The client can disconnect mid-stream; a throw kills the handler.
3. **SSE comments (`:` prefix) are warm-pings.** Use them to keep the connection alive through reverse proxies.
4. **OpenRouter streams emit `data: [DONE]\n\n` as terminator.** Handle it explicitly; the iterator must yield a final `{done: true}` chunk.
5. **qwen2.5 / deepseek emit `<think>...</think>` blocks.** Strip them with `parsePlanJson`'s regex if the output is JSON; show them in the chat (or also strip, depending on UX).
6. **`X-Accel-Buffering: no`** disables nginx response buffering; without it, events don't reach the browser until the response ends.
7. **Don't call `res.end()` before the stream finishes.** A early `end()` cuts off the tokens.
8. **`/api/service-proxy` buffers responses — it CANNOT stream SSE.** The proxy at `app/api/service-proxy/route.ts` does `await upstream.json()` / `await upstream.text()` and wraps in `{status, data}`. This works for JSON, breaks for SSE. **Bypass it for streaming endpoints**: have the client call the upstream directly (e.g. `http://127.0.0.1:7780/api/chat` from a Next.js client) instead of going through `/api/service-proxy?port=...&path=...`. The proxy is fine for everything else; just route streaming around it. The error message when you don't realize this is "stream fails after 200 OK" or "the response is empty" — the proxy collected all the bytes before sending them.
8. **OpenRouter model IDs need provider auto-routing.** The local `llm.streamChat` helper must detect model names with `/` and swap to OpenRouter config before dispatching. Otherwise the call fails with "unknown model" — the OpenRouter free models (e.g. `z-ai/glm-4.5-air:free`, `openai/gpt-oss-20b:free`) won't resolve against the local provider's base URL. Pattern:
   ```js
   if (opts.model && opts.model.includes('/') && cfg.providerName !== 'openrouter') {
     cfg = resolveConfig('LLM');
     cfg.providerName = 'openrouter';
     cfg.baseUrl = PROVIDERS.openrouter.baseUrl;
     cfg.apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || cfg.apiKey;
     cfg.extraHeaders = PROVIDERS.openrouter.extraHeaders;
   }
   ```
9. **No fallback in streaming path.** `runWithFallback` (used by the non-streaming `chat()`) retries against Ollama on failure. Streaming `streamChat()` deliberately doesn't — callers want partial responses to surface, not be hidden behind a silent fallback. Catch errors at the endpoint and emit an `error` SSE event.
10. **Rate limits on free models throttle the fanout.** When the SSE plan endpoint hits `mode: fanout` with 3 free OpenRouter models, expect 1-2 to come back `HTTP 429` rate-limited. The `proposal` event reports per-model success; the `judge` falls back to the first successful proposal. Don't fake the failed ones — emit them as `ok: false, error: '...'` and let the frontend show "📡 openai: ✗ rate-limited".
11. **Windows / git-bash munges `/foo` args to file paths.** When the user runs `node bin/purpclaw.js ask /tools`, the shell expands `/tools` to `C:/Program Files/Git/tools` (the Git builtin). The user gets a confused LLM response instead of the slash command. **Fix**: support both `/foo` and `foo` forms in any CLI. The ask.js pattern: register slash commands with `/name` AND a no-slash alias map. Both work. The first form is canonical; the second is for environments where bash mungs leading slashes. Quote-with-double-quotes is also a workaround, but is fragile — users forget.
12. **Provider override must reset model, not just baseUrl.** When the user passes `--provider ollama` but the env has `LLM_MODEL=MiniMax-M3`, the override block in `chat()` / `streamChat()` sets `cfg.baseUrl` to ollama's URL but leaves `cfg.model` as the env's `MiniMax-M3`. Then ollama gets asked for a model it doesn't have and returns 404. **Fix**: when `opts.provider` is explicitly set AND the caller didn't pass `opts.model`, use the new provider's `defaultModel`. Pattern:
   ```js
   if (opts.provider && PROVIDERS[opts.provider]) {
     const p = PROVIDERS[opts.provider];
     cfg.baseUrl = p.baseUrl;
     cfg.apiKey  = ...;
     cfg.model   = opts.model || p.defaultModel;  // <-- THIS LINE
   }
   ```
   The caller-controlled `opts.model` wins when they pass it; the new provider's default takes over otherwise. Without this, switching providers is silently broken.
13. **Patch tool mangles `\r\n` in regex/string literals.** When the file-patching tool converts a `new RegExp('\r\n')` or a regex with literal `\r\n` in it, the `\r` gets rendered as a literal newline. Result: `new RegExp('\\` newline `\\n|\\n|\\` newline `')` — a broken regex with a literal newline in it, which Node rejects as `Invalid regular expression: missing /`. **Fix**: use `String.fromCharCode(10)` for `\n` and `String.fromCharCode(13)` for `\r` in any regex or string literal. The patch tool doesn't mangle those. Example: `new RegExp(String.fromCharCode(13) + String.fromCharCode(10))` for CRLF. Also: when writing a multi-line string in a comment, use the patch tool carefully — comments with literal `\r\n` in them get the same mangling and the resulting file has a syntax error.

## Verification

```bash
# Live test: plan stream (with semantic context + multi-model)
curl -N -X POST http://127.0.0.1:7780/api/llm/plan \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"goal":"test","mode":"fanout","models":["z-ai/glm-4.5-air:free","openai/gpt-oss-20b:free"]}'

# Live test: chat stream
curl -N -X POST http://127.0.0.1:7780/api/chat \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"explain plan-then-act in 30 words"}'
```

You should see `event:`/`data:` lines appearing in real-time, not all at once at the end. If everything arrives at once after the response ends, the buffering is wrong — re-check `X-Accel-Buffering: no` and `flushHeaders()`.

## Where It's Already Wired

- `lib/llm-provider.js:streamChat` — async iterator, OpenAI-compatible
- `unified_api.js:handleChatStream` — `/api/chat` with `Accept: text/event-stream`
- `unified_api.js:handlePlanStream` — `/api/llm/plan` with SSE
- `app/components/CommandPanel.tsx:streamPlanSend` — frontend SSE consumer
- `app/components/CommandPanel.tsx:route 'plan'` — calls `streamPlanSend` on user message
