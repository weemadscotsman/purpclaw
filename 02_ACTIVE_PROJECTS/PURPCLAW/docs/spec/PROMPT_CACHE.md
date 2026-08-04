# Spec: Prompt Cache Discipline

**Version:** 1.0.0
**Date:** 2026-07-18
**Author:** Quill
**Status:** Implemented + unit-tested. Provider-side caching requires live API call to verify hit/miss.

---

## 1. Purpose

PURPCLAW's agent loop rebuilds the full system prompt + first user message
on EVERY turn, then ships it wholesale to the provider. On long sessions
this costs the same input tokens turn after turn even though the prefix
(`system instructions` + `tool descriptions` + `agent identity` + `initial
task`) hasn't changed.

Anthropic charges **90% less** for cache reads vs fresh input. OpenAI
auto-caches prefixes ≥1024 tokens. Gemini has an explicit `cachedContent`
endpoint. Hermes implements this. PURPCLAW did not. Eddie audit ask
2026-07-17: "prompt caching — saves cost on long prompts."

This module tags the stable prefix so the provider's cache can hit on
subsequent turns. Anthropic sees `cache_control: { type: 'ephemeral' }`.
OpenAI needs no marker (auto-caches). Gemini gets a separate
`cachedContent` body fragment.

## 2. Architecture

```
messages = [
  { role: 'system', content: '<tool descriptions + agent identity>' },  ← stable
  { role: 'user',   content: 'fix the auth bug' },                     ← stable
  { role: 'assistant', content: '...' },                                ← tail
  { role: 'tool',   content: '...' },                                   ← tail
  { role: 'assistant', content: '...' },                                ← tail
]
```

Stable prefix = everything up to (and including) the first user message.
Tail = everything after. The cut point is determined by the FIRST
`assistant` or `tool` role encountered.

The stable prefix gets:
- `cache_control: { type: 'ephemeral' }` on Anthropic
- nothing explicit on OpenAI (provider auto-caches ≥1024-token prefixes)
- a separate `cachedContent` body field on Gemini

## 3. Public API (`lib/prompt-cache.js`)

```js
const PC = require('./lib/prompt-cache');

// Split messages into stable + tail.
const split = PC.split(messages, { providerName: 'anthropic', format: 'anthropic' });
// { stable: [...], tail: [...], fingerprint: 'sha256:...', tokenEstimate: 5138 }

// Mark the LAST stable message with Anthropic cache_control.
PC.markStableAnthropic(messages, split);
// mutates messages; messages[stable.length - 1].cache_control = { type: 'ephemeral' }

// Provider-aware dispatcher.
const { messages, split: s2, cachedContent } = PC.mark(messages, cfg, split);
// For Anthropic: returns marked messages + cachedContent: null
// For Gemini:    returns marked messages + cachedContent: {...}
// For OpenAI:    returns marked messages (no-op marker) + cachedContent: null

// Build a Gemini cachedContent body fragment.
PC.buildGeminiCachedContent(split);
// { model, contents, ttl } — POST to /v1beta/cachedContents

// Record cache hit/miss after a model call.
PC.record(split.fingerprint, {
  provider: 'anthropic',
  hit: true,                  // came from cache?
  cachedTokens: 5000,         // from usage.cache_read_input_tokens
  freshTokens: 0,             // input_tokens - cached
});

// Stats.
PC.summary();
// { fingerprints, totalHits, totalMisses, totalCachedTokens, totalFreshTokens,
//   hitRate, estimatedSavingsUsd }

// Reset.
PC.reset();
```

## 4. Stable Prefix Selection Algorithm

```
1. Walk messages in order.
2. Add to stable: every `system` and `user` role.
3. Stop at the first `assistant` or `tool` role. That role and everything after
   goes in tail.
4. Edge case: no assistant/tool — entire array is stable (first turn).
```

Why stop at assistant? Because tool_use and tool_result messages change every
turn. If we cached them, the cache would never hit. Only system + initial
user turn are stable across the session.

## 5. Threshold

`PURPCLAW_CACHE_MIN_TOKENS` (default 1024). Below this, the cache marker is
NOT attached. Rationale:
- Anthropic's minimum cacheable prefix is 1024 tokens.
- Below the threshold, attaching cache_control adds request bytes without
  ever yielding a cache hit. Pure overhead.

## 6. Provider Differences

| Provider    | Marker shape                                   | When it applies |
|-------------|------------------------------------------------|-----------------|
| Anthropic   | `{ type: 'ephemeral' }` on last stable block   | Always (subject to threshold) |
| OpenAI      | None (auto-caches ≥1024-token prefixes)        | Provider-side |
| Gemini      | Separate `cachedContent` body field           | Caller POSTs to /v1beta/cachedContents |

For Gemini the integration is split: this module builds the fragment,
the caller (or a future Gemini adapter) registers it with the cache endpoint
once and references it on subsequent calls. We don't make the registration
call automatically because it adds latency and lifetime management that
the caller might want to control.

## 7. Stats Persistence

In-memory only (Map keyed by fingerprint). Resets on process restart.
For cross-process stats, persist via `cost-ledger.js` (TODO: hook
`PC.record` into `cost-ledger.record`).

CLI: `purpclaw cache [reset]` — prints summary.
Programmatic: `PC.summary()` returns the same shape.

## 8. Integration

| File                                        | Change                                    |
|---------------------------------------------|-------------------------------------------|
| `lib/prompt-cache.js`                       | NEW (this module)                         |
| `lib/llm-provider.js` chatAnthropic         | Mark + record cache hit/miss              |
| `lib/llm-provider.js` streamChatAnthropic   | Mark stable prefix                        |
| `bin/purpclaw.js` cmdCache                 | Display + reset stats                     |
| `cost-ledger.js` (TODO)                    | Persist cache hits as cost-line item      |

## 9. Test Proof

`tests/prompt-cache.smoke.js` covers:
1. `split()` separates system + first user from tail
2. Split handles edge cases: empty array, single user message, all-system
3. `fingerprintMessages` is stable across repeated calls
4. Token estimate is within reasonable range of char-length/4
5. `markStableAnthropic` attaches cache_control to the LAST stable message
6. `markStableAnthropic` is a no-op when stable is empty
7. Below threshold: marker NOT attached (cost-saving)
8. Above threshold: marker IS attached
9. `record()` increments hit/miss counters correctly
10. `summary()` returns totalHits/totalMisses/totalCachedTokens correctly
11. End-to-end mock: simulated response with cache_read_input_tokens > 0
    increments hit counter; cached_tokens appears in returned usage

## 10. Limitations

- Stats are in-memory only. Process restart loses history.
- Gemini adapter doesn't yet auto-register cachedContent (manual integration).
- Doesn't track per-call cost; that's still cost-ledger.js's job.
- Doesn't fall through to Anthropic's `cache_control: { type: 'persistent' }`
  (5-min TTL vs ephemeral's 5-min TTL with longer keepalive). Add later if
  long-tail sessions need it.
- No automatic re-keying on Anthropic's invalidation events.

## 11. Versioning

| Version | Change                                                      |
|---------|-------------------------------------------------------------|
| 1.0.0   | Initial prompt cache discipline (Eddie 2026-07-18)         |

Spec lives at `docs/spec/PROMPT_CACHE.md`. Bump requires version increment +
`CHANGELOG.md` entry + `lib/prompt-cache.js` `VERSION` + smoke tests.
