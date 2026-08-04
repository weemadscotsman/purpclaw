# GAUNTLET P0 Findings

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md). This file is evidence input only and cannot redefine parity or mark a capability complete.

**Date:** 2026-07-29
**Slot 0 — Chief + Integration Owner**

---

## P0-A: Broken Session Construction + Silent Persistence Fallback

### Description
Session construction and persistence operations fail silently rather than throwing or logging explicit warnings. The session subsystem catches errors internally and either returns empty/false values or swallows exceptions entirely, making it impossible for callers to know a failure occurred.

### Evidence

**File: `lib/agent-session.js`**
- **Lines 162–186** — `gitStatus()`, `gitDiff()`, `gitBranch()`:
  ```js
  async gitStatus() {
    try {
      const status = execSync('git status --porcelain', { ... });
      return status;
    } catch {
      return '';   // ← silent empty string on any failure (perm, not found, etc.)
    }
  }
  ```
  Any git failure (permissions, missing binary, not a repo) returns `''` with no warning logged.

**File: `lib/session-persistence.js`**
- **Lines 29–31** — `loadMeta()`:
  ```js
  function loadMeta(sessionId) {
    try {
      return JSON.parse(fs.readFileSync(metaPath(sessionId), 'utf8'));
    } catch {
      return null;   // ← disk read failure returns null, no log
    }
  }
  ```
- **Lines 45–58** — `suspend()` / `saveMeta()`: If `loadMeta()` returns `null`, `suspend()` merges with an empty object and never throws. Caller cannot distinguish "no session" from "corrupted on disk."
- `lib/agent-session.js` lines 46–57: `useSession()` calls `sessions.get(sessionId)` — if the session was constructed but never stored (constructor failure silently skipped), it throws `Session not found`, masking the real issue.

### Proposed Fix Direction
1. Replace all bare `catch {}` in session operations with either:
   - `catch (e) { console.warn(\`[SESSION] gitStatus failed: ${e.message}\`); return ''; }` (explicit warning), OR
   - `catch (e) { throw new Error(\`Session gitStatus failed: ${e.message}\`); }` (hard failure)
2. `loadMeta()` should log a warning when returning `null` due to a catch-all.
3. `suspend()`/`resume()` should check whether loaded metadata is structurally valid and throw if it appears corrupted.
4. Add integration test: simulate disk read failure, verify warning or throw (not silent null).

---

## P0-B: HTTP/MCP Permission Bypasses

### Description
Tools that make outbound HTTP requests (`web-fetch`) and MCP tool invocations bypass the `exec-policy.js` permission engine entirely. There is no call to `checkNetwork()` or `checkCommand()` before these calls execute.

### Evidence

**File: `lib/tools/index.js`**
- **Lines 615–639** — `web-fetch` tool:
  ```js
  registry.register({
    name: 'web-fetch',
    execute: async ({ url }) => {
      const https = require('https');
      const http  = require('http');
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 15_000, ... }, res => { ... });
      // ← NO checkNetwork() call against exec-policy.js
    }
  });
  ```
  The raw `http`/`https` module is called directly with no policy evaluation. A user can configure `exec-policy` to deny all network access, then still use `web-fetch` to make arbitrary outbound requests.

- **Lines 911, 987, 1026** — Additional `fetch('http://localhost:...')` calls in other tools, same pattern.

**File: `lib/mcp.js`**
- `grep -n "exec-policy\|checkCommand\|checkNetwork" lib/mcp.js` returns no results.
- MCP tool invocation (`opts.servers`, `entries.filter()`) has no `checkNetwork()` call before establishing connections to MCP servers.

**Contrast with `lib/tools/index.js` lines 238–243** — the `terminal` tool correctly calls `execPolicy.checkCommand()`:
```js
const policyResult = execPolicy.checkCommand(args.join(' '));
if (!policyResult.allowed) {
  return { error: `Command denied by exec-policy: matched "${policyResult.matched}"` };
}
```
`web-fetch` and MCP tools should use the same pattern.

### Proposed Fix Direction
1. `web-fetch` tool (and any other HTTP outbound tool) must call `execPolicy.checkNetwork(target)` before making requests. If denied, return an error object instead of making the call.
2. MCP connection establishment must call `checkNetwork()` for the server host/port before connecting.
3. Add integration test: set `exec-policy` to deny all network, attempt `web-fetch`, verify it returns a blocked error (not a network response).
4. `exec-policy.js`'s `checkNetwork()` already exists and is fully implemented — it's simply not being called.

---

## P0-C: Provider Settings Not Controlling Real Execution

### Description
The `LLM_PROVIDER` environment variable and per-call `opts.provider` do not reliably control which provider is actually called at runtime. The routing layer has multiple hardcoded fallbacks that override the configured provider without the caller knowing.

### Evidence

**File: `lib/llm-provider.js`**

- **Line 323–324** — `resolveConfig()`:
  ```js
  const providerName = (process.env[`${envPrefix}_PROVIDER`] || 'openai').toLowerCase();
  const provider     = PROVIDERS[providerName] || PROVIDERS.openai;
  ```
  If `LLM_PROVIDER=deepseek` is set but the env var isn't read (e.g., `.env` not loaded), it silently falls back to `'openai'`. The fallback to `PROVIDERS.openai` when the provider name is unrecognized masks misconfiguration entirely.

- **Lines 1130–1131** — `chat()` per-call override logic:
  ```js
  if (opts.provider && PROVIDERS[opts.provider]) {
    cfg = resolveConfig('LLM');   // ← re-reads env! loses opts.provider
    cfg.providerName = opts.provider;
  ```
  When a caller passes `opts.provider = 'deepseek'`, the code then calls `resolveConfig('LLM')` which re-reads the `LLM_PROVIDER` env var and ignores the passed `opts.provider` for baseUrl/apiKey resolution. Only `cfg.providerName` is set; `cfg.baseUrl` and `cfg.apiKey` still come from `LLM_` env vars, which may be the wrong provider's credentials.

- **Lines 1080–1118** — `runWithFallback()` automatic failover:
  ```js
  if (!fb || fb.providerName === cfg.providerName) throw primaryErr;
  // falls back to local fallback (ollama)
  // then falls back to global provider
  ```
  Even when `LLM_PROVIDER=deepseek` is correctly set, a network timeout on DeepSeek automatically triggers fallback to Ollama without any configuration instructing it to. This makes it impossible to get a deterministic "provider not available" error when the user explicitly configured DeepSeek only.

### Proposed Fix Direction
1. `resolveConfig()` should throw if `LLM_PROVIDER` is set to an unrecognized provider name, not silently fall back to `openai`.
2. In `chat()`, when `opts.provider` is set, use `PROVIDERS[opts.provider]` directly to build `cfg` rather than calling `resolveConfig('LLM')` which re-reads env vars and can override the explicit per-call choice.
3. The automatic fallback chain should respect a `LLM_NO_AUTO_FALLBACK=1` flag so callers can opt out of silent rerouting.
4. Add integration test: set `LLM_PROVIDER=deepseek` and `LLM_API_KEY=invalid`, verify the error returned mentions DeepSeek (not a fallback to OpenAI or Ollama).
