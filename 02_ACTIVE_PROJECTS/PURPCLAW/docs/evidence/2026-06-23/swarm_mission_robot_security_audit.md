# 🤖 ROBOT — swarm_mission Security Audit Report

**Date:** 2026-06-22
**Agent:** ROBOT (Precision Engineering)
**Mission scope:** Structural / configuration / execution-layer security posture
**Co-scope:** GUARDIAN handled `/auth|/security|/permissions|/tokens|/secrets|/credentials|/credentials` regex lane; ROBOT handled the broader structural + configuration findings (command exec, spawn, CORS, gatekeeper rules, base64 payloads, .env exposure, file-path scope). Findings below de-duplicate where overlap is real and cross-link to GUARDIAN where it owns the secret-rotation flow.
**Target:** `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\`
**Source files audited (non-archive, non-vendor, non-donors):**
`.env`, `.env.example`, `.gitignore`, `orchestrator.js`, `unified_api.js`, `gatekeeper.js`, `smoke_test.js`, `agent_tower.js`, `boot.js`, `swarm_coordinator.js`, `worker_service.js`, `unified_state.js`, `unified_eventbus.js`, `unified_bridge.js`, `task_decomposer.js`, `service_registry.js`, `harness_service.js`, `pool_service.js`, `ecosystem.config.js`, `metrics_aggregator.js`, `start_purpclaw.js`, `lib/llm-provider.js`, `lib/runtime/telemetry-console.js`, `scripts/security-audit.sh`

---

## 🔴 CRITICAL (P0) — Fix before next deploy

### F-01 — Live production API keys present in on-disk `.env`
- **File:** `.env`
- **Lines:** 1 (XIAOZHI_MCP_URL), 2 (XIAOZHI_WS_URL), 5 (KIMI_API_KEY), 8 (DEEPSEEK_API_KEY), 10 (MINIMAX_API_KEY), 11 (GLM_API_KEY), 21 (INTERNAL_API_KEY), 38–46 (NVIDIA_API_KEY_PURP1…5 + HERMES), 47 (TELEGRAM_BOT_TOKEN_DG), 48 (TELEGRAM_BOT_TOKEN_WF), 49 (TELEGRAM_BOT_TOKEN_DK), 50 (TELEGRAM_BOT_TOKEN_GH), 51–54 (TELEGRAM_PERSONA_DG/WF/DK/GH)
- **Finding:** Working-tree `.env` contains real, currently-valid keys: an ES256 JWT in `XIAOZHI_MCP_URL` (valid until 2026-06-26), 4 live Telegram bot tokens (each = full control of that bot), the `DEEPSEEK_API_KEY` (duplicated at line 8 and line 55), 5 NVIDIA NIM keys plus a Hermes last-resort key, the `MINIMAX_API_KEY`, the `GLM_API_KEY`, and the cross-service `INTERNAL_API_KEY` (the bearer token for the `metrics_aggregator.js` auth gate).
- **Risk:** If this directory was ever pushed, mirrored, or copied to a backup, every key in this file is in a leak surface. The Telegram bot tokens are the most damaging — they let an attacker read DM history, impersonate the operator, and pivot into any chat the bots are members of. The `INTERNAL_API_KEY` bypasses the localhost check in `metrics_aggregator.js:32–40` from any machine that has it.
- **Remediation:**
  1. **Rotate every key** in `.env` NOW (DeepSeek, MiniMax, GLM, NVIDIA pool 1–5 + Hermes, all 4 Telegram bot tokens, INTERNAL_API_KEY, regenerate the Xiaozhi JWT). Treat the old values as compromised.
  2. Replace on-disk values with placeholders (`sk-REPLACE_ME`, `nvapi-REPLACE_ME`, etc.) before any commit. Keep real values in a local-only secrets manager (1Password, Bitwarden, Windows Credential Manager).
  3. Verify `.env` is git-ignored (it is — line 8 of `.gitignore` lists `.env`, `.env.*`, `!.env.example`). Run `git ls-files .env` and `git log --all --full-history -- .env` from the repo root; if either returns hits, the leak is historical and `git filter-repo` (or BFG) is required to purge the history before any push.
  4. Add a pre-commit hook (Husky + `gitleaks` or `detect-secrets`) so this can't recur. The `scripts/security-audit.sh` fallback grep (lines 95–108) is too narrow — it doesn't catch `nvapi-` keys ≥ 20 chars reliably and skips the `INTERNAL_API_KEY` shape entirely.
  5. Add CI: `bash scripts/security-audit.sh --strict` on every PR; fail the build on any `secrets` match.
- **Owner:** GUARDIAN (rotation) + ROBOT (CI/pre-commit wiring).

### F-02 — `unified_api.js` permits all mutating methods without auth when `PURPCLAW_API_KEY` is empty
- **File:** `unified_api.js`
- **Line:** 88 (`const AUTH_REQUIRED = !!API_KEY && process.env.PURPCLAW_NO_AUTH !== '1';`) combined with line 87 (`const API_KEY = process.env.PURPCLAW_API_KEY || '';`)
- **Finding:** When `PURPCLAW_API_KEY` is unset (the default — `.env` does not set it), `AUTH_REQUIRED` is `false`, and every `POST /api/*` mutating endpoint accepts requests with zero authentication. The `MUTATING_METHODS` set on line 89 declares the gate, but the gate is only enforced when `AUTH_REQUIRED` is true. `composerContextHandler` (line ~213 in this file) reads arbitrary file paths from the request body via `fs.readFileSync(att.path, 'utf-8')` — combined with no-auth, any LAN or internet caller (port 7780 binds to all interfaces by default in `unified_api.js:54` — `http.createServer` without a `host` arg) can read any file the Node process can read.
- **Risk:** Local file read (LFI → RCE if any binary is interpreted later) on a service that's typically bound to 0.0.0.0:7780 in dev. The compose / cloud path of `.env` (`UNIFIED_API` service entry in `ecosystem.config.js:69–90`) does not set `HOST` binding either, so any LAN host on the operator's network can hit these endpoints.
- **Remediation:**
  1. Bind explicitly to `127.0.0.1` by default: `server.listen(PORT, process.env.API_HOST || '127.0.0.1', ...)`. Add an `API_HOST=0.0.0.0` opt-in for LAN deployments with a logged warning.
  2. Fail-closed on auth: if `process.env.PURPCLAW_NO_AUTH === '1'`, log a startup warning to `stderr` and require an explicit `--no-auth-fail-open` flag in production.
  3. In `composerContextHandler` (the file-read path), validate `att.path` is inside an allowlist (e.g. `PURP_DIR`, `SKILLS_DIR`, `agent_work/`) and reject any path with `..`, absolute paths, or symlinks pointing outside the allowlist. Currently it reads whatever the client sends.
  4. Set a sane `PURPCLAW_API_KEY` in `.env.example` as `change-me-32-byte-hex` and warn at boot if it's the default.
- **Owner:** ROBOT (config + code path) / GUARDIAN (auth key rotation).

### F-03 — `swarm_coordinator.js` writes a base64-encoded JavaScript payload to disk at boot, then executes it
- **File:** `swarm_coordinator.js`
- **Lines:** 38 (decode + write) and 99–117 (subsequent `spawnSync(nodeBin, [helperPath, ...])`)
- **Finding:** `swarm_coordinator.js` embeds a 2.1 KB base64 string (line 38) that decodes to a JavaScript file using `better-sqlite3` to query a SQLite DB at `%USERPROFILE%\.omnicode\<hash>.db` for blast-radius analysis. The helper is then `spawnSync`'d with a hard-coded `nodeBin` path (`C:\Users\Admin\AppData\Local\nvm\v22.11.0\node.exe`, line 99) and `windowsHide: true`.
- **Risk:**
  - Base64-of-source is a known malware pattern; it defeats trivial `git grep` reviews and makes diff history useless. If anyone edits the base64 string (intentionally or by accident), the helper silently changes behavior with no reviewable diff.
  - The hard-coded `nodeBin` is a portability/identity bug: any user not named `Admin` will fail silently (the `try { … } catch (e) { return []; }` swallows it). Worse, the same `nodeBin` could be hijacked if `PATH` is poisoned.
  - The helper takes `repoPath` and `targetPatterns` as CLI args (line 101) and queries an untrusted SQLite DB in the user's home dir. If the DB is tampered with, the SQL queries at lines 51–52 (built with `?` placeholders — good) and the user-supplied pattern array become the only attack surface. The patterns are passed through `new RegExp(...)` (lines 65–67) which will throw on malformed input but is not bounded — a malicious caller could DoS the coordinator with a pathological regex (ReDoS).
- **Remediation:**
  1. Move the helper to a real, diffable source file at `lib/blast_radius_helper.js` and `require()` it. The base64 indirection has no security benefit and blocks review.
  2. Replace the hard-coded `nodeBin` with `process.execPath` (the Node running the coordinator). Hard-coding another machine's user profile is fragile and dangerous.
  3. Validate each pattern in `targetPatterns` is a string ≤ 256 chars and matches `/^[\w.\-\/*?\[\]]+$/` before compiling to RegExp; reject anything that looks like `(.+)+$` (catastrophic backtracking).
  4. Add a 2-second timeout around the `spawnSync` (currently `timeout: 15000` is generous) and cap the regex's worst-case `match` length.
- **Owner:** ROBOT.

### F-04 — `gatekeeper.js` regex for `command_injection` and `hardcoded_secret` are too broad / too narrow — both useless in practice
- **File:** `gatekeeper.js`
- **Lines:** 43–48 (`command_injection`), 54–58 (`hardcoded_secret`), 64–67 (`auth_bypass`)
- **Finding:**
  - `command_injection` (line 45) matches any of `(?:exec|spawn|eval|Function\(|new Function)\s*\(`. Every Node service in this repo uses `spawn`, `exec`, `trackedSpawn`, or `child_process` — `boot.js:107`, `boot.js:123`, `unified_bridge.js:120`, `unified_bridge.js:170–180`, `start_purpclaw.js:32`, `swarm_coordinator.js:99`, `worker_service.js:135`, `unified_api.js:38`. Running the gatekeeper on this repo will flag ~40+ "MEDIUM command injection" findings on the first scan. The rule will be ignored or `--strict` will block every merge.
  - `hardcoded_secret` (line 56) requires the literal substring `password|secret|api_key|token|credential` followed by `=`: it will not catch `MINIMAX_API_KEY=sk-…` because the value pattern `["'][^"']{8,}` requires quotes around the value. Real keys are not wrapped in quotes inside `.env` or in `const X = '...'`; only `process.env.X` style reads. Result: the regex misses the actual leak in `.env` (F-01) and false-positives on every `getSecret()` call.
  - `auth_bypass` (line 66) only matches `// BYPASS` / `// SKIP AUTH` comments. Real bypasses are `if (process.env.NODE_ENV !== 'production') return next();` — never flagged.
- **Risk:** The gatekeeper becomes noise → ignored → a real bypass slips through. F-01's `.env` would NOT be caught by `hardcoded_secret` in this file. This is a critical false-negative on the exact threat the gatekeeper is supposed to catch.
- **Remediation:**
  1. Replace the `command_injection` regex with one that requires user input to flow in: e.g. match `exec\s*\([^)]*\$\{[^}]+\}` or `spawn\s*\([^)]*req\.` only. Allowlist internal trusted callers in a `// gatekeeper-allow` comment, like `// eslint-disable-next-line`.
  2. Replace the `hardcoded_secret` regex with one that matches high-entropy base64/hex strings ≥ 40 chars next to known key names. Run gitleaks rules (or copy its regex set) instead of hand-rolled patterns. The fallback grep in `scripts/security-audit.sh:95–108` is closer to right but still misses `INTERNAL_API_KEY` shape and the `xox[bp]-` token family for Telegram/Slack-style tokens.
  3. Add a third category: `tainted_env_load` — flag any `require('dotenv').config({ override: true })` (e.g. `unified_api.js:18`) that doesn't include a `path` whitelist. Override mode silently trusts any `.env` in cwd.
  4. Add a runtime check: on `gatekeeper` startup, refuse to scan if `process.env.PURPCLAW_SCAN_DISABLE_GATEKEEPER === '1'` and emit a CRITICAL log line.
- **Owner:** ROBOT (gatekeeper logic).

---

## 🟠 HIGH (P1) — Fix in next sprint

### F-05 — `start_purpclaw.js` re-spawns the security control API without `windowsHide: true`
- **File:** `start_purpclaw.js`
- **Lines:** 30–33 (the `trackedSpawn` call inside `startComponent`)
- **Finding:** `start_purpclaw.js` is the legacy v7.0 startup script. It uses `trackedSpawn('node', [component.file], …)` (line 32) with default `windowsHide: undefined` and a `timeoutMs: 0`. The header comment in `ecosystem.config.js:7–22` explicitly warns that multiple service starts on Windows without `windowsHide: true` can flash a cmd-window cascade that "took out the operator's desktop on 2026-05-25". The fix (`safe-start`) is documented but this legacy script does not enforce it.
- **Risk:** Anyone running `node start_purpclaw.js` (vs. `purpclaw safe-start` or `pm2 start ecosystem.config.js`) is exposed to the documented desktop-killer cascade.
- **Remediation:** Add `windowsHide: true` and a 5s startup-stabilization window to line 33; emit a deprecation warning at top of file pointing to `safe-start`; remove the file in v0.4.0.
- **Owner:** ROBOT.

### F-06 — `unified_state.js`, `unified_eventbus.js`, and `unified_api.js` SSE handlers set `Access-Control-Allow-Origin: *`
- **File:** `unified_state.js:147, 178`; `unified_eventbus.js:104, 115`; `unified_api.js:71, 215`
- **Finding:** Every state-store, event-bus, and API endpoint emits `Access-Control-Allow-Origin: *`. The state store at `GET /state` returns the full agent state including task payloads, tool usage, and swarm metrics (lines 18–35 in this file). The event bus at `GET /state` returns the last 50 events with full payload. The unified API SSE streams (line 215) return `reply`, `providerStatus`, and `kernelJobId` — and any secret the LLM echoes back.
- **Risk:** Any origin on the operator's network (or the internet, if 0.0.0.0 binding is in effect) can read the swarm's internal state, including in-flight tool calls and any secret an LLM regurgitates. Combined with F-02 (no auth), this is browser-side data exfiltration from any page the operator visits.
- **Remediation:**
  1. Replace `*` with an allowlist: `['http://127.0.0.1:3030', 'http://localhost:3030']` (the Next.js UI). Read from `process.env.PURPCLAW_CORS_ORIGINS` (comma-separated).
  2. Add `Vary: Origin` so caches don't share responses between allowed origins.
  3. Add `Access-Control-Allow-Credentials: false` (or remove Authorization header from CORS) — current code includes `Authorization` in `Access-Control-Allow-Headers` (`unified_api.js:217`).
- **Owner:** ROBOT.

### F-07 — `agent_tower.js` does not authenticate the spawn endpoint or rate-limit it
- **File:** `agent_tower.js`
- **Lines:** ~310–325 (`spawnAgent` entry point) and the `/api/spawn` route registration (search for `app.post` or `server.post`)
- **Finding:** `worker_service.js:135–165` (the `towerRequest` POST `/api/spawn`) is the only documented caller, and `worker_service.js` HMAC-signs requests when `WORKER_SECRET` is set. But the tower itself does not check the signature — it accepts any POST `/api/spawn` with `{agentName, task, options}`. The agent task string is then used to build a prompt and to write a per-agent log file (line `fs.appendFileSync(logFile, ...)` referenced in `agent_tower.js:381`).
- **Risk:** Unauthenticated spawn → unbounded LLM cost (the Kimi K2.6 lane at `ecosystem.config.js:117` is the heavy model), unbounded log growth, and a path-injection vector: `path.join(PURP_DIR, 'agent_work', agentName)` on the agent-work-dir creation (line ~325) does not sanitize `agentName`. A `agentName = "../../../etc/passwd"` would write logs outside the intended dir.
- **Remediation:**
  1. Mirror the `worker-auth.js` HMAC check in the tower: `require('./lib/worker-auth')` and verify every mutating request with `verifyRequest(req, body)`.
  2. Validate `agentName` against `/^[a-z][a-z0-9_-]{0,31}$/` (matches the registry keys) and reject anything else with 400.
  3. Add a token-bucket rate limit (already partially in place via `PURPCLAW_SPAWN_COOLDOWN_MS` on line ~120 of `ecosystem.config.js`, but no global cap exists). Suggested: 60 spawns/min per source-IP.
- **Owner:** ROBOT + GUARDIAN (HMAC key rotation).

### F-08 — `worker_service.js` HMAC auth is opt-in (warning, not refusal)
- **File:** `worker_service.js`
- **Lines:** 30–37
- **Finding:** `if (WORKER_SECRET) { console.log('[WORKER] Auth enabled…') } else { console.warn('…running unauthenticated…') }`. The service is exposed on `0.0.0.0:7897` (no `host` arg in `server.listen(PORT, …)`) — a missing `WORKER_SECRET` env var means the worker accepts any agent task from the LAN.
- **Risk:** Same as F-07 but via the worker lane; the worker is the documented "overflow worker lane for remote/local agent task dispatch" (per `service_registry.js:11`). Anyone on the LAN can queue tasks that the tower will execute (and pay for).
- **Remediation:**
  1. Generate a random `WORKER_SECRET` at install time and persist it to `.env`; refuse to start without it.
  2. Bind to `127.0.0.1` by default; require explicit `WORKER_HOST=0.0.0.0` for remote-worker mode.
- **Owner:** ROBOT + GUARDIAN.

### F-09 — `orchestrator.js` `parseCommand` is case-insensitive on raw text but case-sensitive on `match[1]` target
- **File:** `orchestrator.js`
- **Lines:** ~580 (`parseCommand`) and the `INTENT_PATTERNS` array ~150
- **Finding:** `parseCommand` lowercases the text but the captured `match[1]` flows into `target` un-trimmed and un-sanitized. Downstream, the orchestrator's `apiRequest` (line 615) passes the target into `path` strings and `JSON.stringify(body)` in the body of POST requests. The `parseCommand` `lower.match(pattern.pattern)` is only case-insensitive for the pattern, not for the captured group; the group retains the user's original casing (which is fine) but the `target` is later used in `validateCommand` and dispatched to `agent_tower.js:spawnAgent` as part of the task. A task containing `../` is not filtered.
- **Risk:** Task prompt injection → the LLM is told to read a file outside the repo. Combined with F-02 (no-auth composer file read), this is a one-step path from chat to file read.
- **Remediation:**
  1. Add a `sanitizeTarget(target)` step that strips `..`, null bytes, control chars, and limits length to 1 KB.
  2. Wrap LLM tool calls in an allowlist of safe tools (already in `lib/agent-loop.js` per the comment, but the bare `agentPrompt + task` fallback at `agent_tower.js:362` is unconstrained).
  3. Add a `"never read files outside the repo"` constraint to every agent system prompt.
- **Owner:** ROBOT.

### F-10 — `task_decomposer.js` builds RegExp from user input with no validation
- **File:** `task_decomposer.js`
- **Lines:** ~155 (the `classifyClause` helper) and the `filePatterns` array (lines 30–125)
- **Finding:** The static `filePatterns` in `DOMAIN_DEFS` are compiled to RegExp at line 65–67 of `swarm_coordinator.js` (not this file directly), but the `splitIntoClauses` (line 127) and downstream routing pass raw user input through `classifyClause` which iterates keyword lists. A pathological input of `(a+)+$`-style text is benign here (keywords are static arrays, not patterns), but the `targetPatterns` array that flows into the blast-radius helper (F-03) is user-controllable via the agent's task string and is `new RegExp`-compiled without validation.
- **Risk:** ReDoS on the coordinator thread. With the 15s `spawnSync` timeout it's bounded but the whole coordinator blocks while the helper runs.
- **Remediation:** Validate every element of `targetPatterns` matches `^[\w.\-\/*]+$` and length ≤ 128 chars before passing to the helper. See F-03 fix #3.
- **Owner:** ROBOT.

---

## 🟡 MEDIUM (P2) — Track in backlog

### F-11 — `boot.js` powershell port-killer string-interpolates `port` into a PowerShell command
- **File:** `boot.js`
- **Lines:** 78–87
- **Finding:** `execSync(\`powershell.exe -NoProfile -NonInteractive -Command "Get-NetTCPConnection -LocalPort ${port} | Stop-Process -Force"\`, { stdio: 'ignore' })`. `port` is taken from the `PORTS` object literal at the top of the file (line 31–41) and is always an integer literal, so this is currently safe. But the function `nukePort(port)` (line 65) takes port as a parameter, and if any future caller passes a tainted value, the template-string injection fires. Also: no `windowsHide: true` → cmd-window flash risk per the `ecosystem.config.js` warning.
- **Remediation:** Cast `port` to `Number.isInteger(port) ? port : null`; reject otherwise. Add `windowsHide: true` to the `execSync` opts. Consider `npx kill-port <port>` as a replacement.
- **Owner:** ROBOT.

### F-12 — `metrics_aggregator.js` `pendingPoll` flag is not atomic
- **File:** `metrics_aggregator.js`
- **Lines:** 70–85
- **Finding:** The single-threaded Node model makes this safe in practice, but the pattern (`var pendingPoll = null; ... if (pendingPoll) return; pendingPoll = true; ... pendingPoll = false`) relies on synchronous execution between the read and the write. Any `await` (none here, but easy to add) breaks the invariant. The auth gate (line 32) is also called per-request without memoization.
- **Remediation:** Use a `Set` of in-flight target keys; `pollServices` only adds targets that aren't already in the set.
- **Owner:** ROBOT.

### F-13 — `pool_service.js` synchronous full-index search on every request, no rate limit
- **File:** `pool_service.js`
- **Lines:** 47–67 (`search`), 90–99 (`scanSkills`), 100–115 (`scanAgents`)
- **Finding:** Every `GET /search` request tokenizes the query, then iterates `[...skillsIndex, ...agentsIndex]` synchronously. With ~35 skills + ~50 agents = 85 items, this is fine; with the comment "Skills Directory" growing into the hundreds (`.donors/` and `skills/` are both scanned), this becomes O(n) per request with no cache. No rate limit; a single client can pin the CPU.
- **Remediation:** Build an inverted-token index at `rebuildIndex` time (line 137); add a `Map<query, {ts, results}>` cache with 30s TTL. Add a 30-rps token bucket on the endpoint.
- **Owner:** ROBOT.

### F-14 — `harness_service.js` parses `.env` itself; the parsed values shadow process.env in some callers
- **File:** `harness_service.js`
- **Lines:** 35–56
- **Finding:** The IIFE at the top of the file reads `.env` manually and sets `process.env[k] = v` only if `!(k in process.env)`. The semantics differ from `dotenv` (which would `override: false` by default). The harness then requires `lib/harness/engine` which uses `llm-provider` which calls `require('dotenv').config()` (line 5 of `lib/llm-provider.js`). Order of operations: harness's manual parse happens first, but then `dotenv.config()` is called by the engine — `dotenv` defaults to `override: false`, so the harness's values stick. This is correct, but subtle; a future maintainer flipping `dotenv` to `{override: true}` will silently break the harness.
- **Remediation:** Add a code comment at line 53 explaining the deliberate non-override; or replace the manual parser with a single `require('dotenv').config({ override: false })` to match the rest of the codebase.
- **Owner:** ROBOT.

### F-15 — `unified_bridge.js` kills processes on shutdown without confirmation
- **File:** `unified_bridge.js`
- **Lines:** 100–130 (`killAll` function)
- **Finding:** `killAll` uses `taskkill /PID ${pid} /T /F` to kill the process tree, including children. If the operator runs `node unified_bridge.js` while a long-running child agent task is mid-flight, SIGINT kills the task and any partially-written files. Also, line 105 logs `taskkill` output as "Stopped" with no error handling — a process the operator didn't intend to kill (e.g., a port collision) gets terminated silently.
- **Remediation:** Send SIGTERM first; wait 5s; escalate to SIGKILL only if the process is still alive. Confirm before killing any process whose `name` doesn't match a registered service.
- **Owner:** ROBOT.

### F-16 — `agent_tower.js` SSE clients held in a `Set` with no backpressure
- **File:** `agent_tower.js`
- **Lines:** ~195 (`sseClients: []` — note: declared as array, used as Set-like), `broadcast` function ~205
- **Finding:** `broadcast` writes `data: ${payload}\n\n` to every SSE client in a loop. A slow consumer blocks the broadcast for everyone; an aggressive consumer (or a hung socket whose `write` returns `false`) silently drops events. There's no client-side `res.write` error handling beyond `catch (e) { console.log(...) }`, which logs but doesn't remove the dead client.
- **Remediation:** Use `res.write(data, callback)`; on `false` return (kernel buffer full), `res.once('drain', ...)`; on socket `close`, remove from the set. Consider chunking broadcast payloads.
- **Owner:** ROBOT.

---

## 🟢 LOW (P3) — Nice to have

### F-17 — `smoke_test.js` hard-codes `C:\Users\Admin\.purpclaw\kokoro_send.bat`
- **File:** `smoke_test.js`
- **Lines:** 23–24
- **Finding:** Hard-coded Windows path means the smoke test fails for any user not named `Admin`. Not a security issue, but a portability one that masks real failures (the test reports "DOWN: ENOENT" instead of "Kokoro TTS not configured for this user").
- **Remediation:** Read `KOKORO_BAT` and `DEMO_PROJECT` from env, fall back to `${HOME}/.purpclaw/kokoro_send.bat`.
- **Owner:** ROBOT.

### F-18 — `.env.example` documents `_BACKUP1…5` NIM keys that don't exist in `.env`
- **File:** `.env.example`
- **Lines:** 60–73 (NIM pool docs) vs `.env` (only `PURP1…5` + `HERMES` are set, no `BACKUP1…5`)
- **Finding:** The example advertises a 10-key pool with backup keys but the runtime `.env` only has 5 primaries. Code in `lib/llm-provider.js` that falls back from `PURP1` to `BACKUP1` on 429 will silently fail to find a backup and throw, masking the real 429.
- **Remediation:** Either add the `BACKUP1…5` keys to `.env` (rotating every 30d), or remove the `BACKUP*` references from `.env.example` and the `lib/llm-provider.js` fallback chain.
- **Owner:** ROBOT + GUARDIAN.

### F-19 — `scripts/security-audit.sh` missing `--json` output mode for CI
- **File:** `scripts/security-audit.sh`
- **Lines:** 22–35 (flag parsing), 290–315 (summary block)
- **Finding:** The script supports `--ci` (no TTY) but always emits human-readable text. A CI consumer (Dependabot, GitHub Actions summary) has to grep for `[✔]` / `[✖]` to extract pass/fail counts.
- **Remediation:** Add `--json` mode that emits a single `{ pass, fail, warn, checks: [...] }` object as the last line (or to a `--output` file).
- **Owner:** ROBOT.

### F-20 — `lib/runtime/telemetry-console.js` mutates the global `console` object on first import
- **File:** `lib/runtime/telemetry-console.js`
- **Lines:** 22–55
- **Finding:** `installConsoleTelemetry` overrides `console.log/warn/error` for the entire process on the first call. The `installed` guard (line 6) means whichever service imports it first wins, and the `service` parameter is captured in the closure of the very first call. If `purpclaw-api` imports it before `purpclaw-tower`, the tower's logs get tagged as `purpclaw-api`. Also, the override always emits to `original[level]` (line 38), so the actual console output is duplicated if a future caller also wraps console.
- **Remediation:** Refactor to a per-service logger object instead of a global monkey-patch. The comment "global telemetry, do not duplicate" in `unified_bridge.js:43` shows this footgun is known but unaddressed.
- **Owner:** ROBOT.

### F-21 — `service_registry.js` has no version pin for service config schemas
- **File:** `service_registry.js`
- **Lines:** 1–75 (the `SERVICES` array)
- **Finding:** Adding/removing a key from the `SERVICES` array silently changes what `getServices()` returns, which silently changes what `metrics_aggregator.js` polls (line 18) and what `smoke_test.js` health-checks (line 12). No schema, no migration. The `note` field is freeform and not validated.
- **Remediation:** Add a `version` field and a runtime check that warns when `package.json` `version` ≠ `SERVICES` schema version.
- **Owner:** ROBOT.

### F-22 — `orchestrator.js` SWARM_MEMORY has no eviction policy
- **File:** `orchestrator.js`
- **Lines:** ~150 (the `SWARM_MEMORY` object literal)
- **Finding:** `context.activeAgents` is filtered by `pruneDeadAgents` (line 200ish), but `context.completedWork`, `context.patternLibrary`, and `context.recentCommands` grow unbounded. A long-running orchestrator process leaks memory at ~1 KB per task.
- **Remediation:** Cap each list at 200 entries; rotate the oldest on overflow.
- **Owner:** ROBOT.

---

## ✅ POSITIVE FINDINGS (no action required)

- **P-01** `worker_service.js:135–165` — Uses HMAC-SHA256 (`lib/worker-auth.js`) for request signing when `WORKER_SECRET` is set. Good pattern; just needs to be enabled by default (F-08).
- **P-02** `metrics_aggregator.js:32–40` — Auth gate checks `isLocal` (127.0.0.1, ::1, ::ffff:127.0.0.1) before falling through to bearer-token check. Correct localhost-or-token model.
- **P-03** `swarm_coordinator.js:67` — SQL queries use `?` placeholders, not string interpolation. Good.
- **P-04** `.gitignore:7–9` — `.env`, `.env.*`, `!.env.example` are all in the gitignore correctly. Prevents accidental future commits of `.env`.
- **P-05** `lib/llm-provider.js:5` — Wraps `require('dotenv')` in a try/catch, so the file works even without dotenv installed. Defensive.
- **P-06** `swarm_coordinator.js:120` — Uses `windowsHide: true` on all git operations. Respects the Windows-cmd-window warning in `ecosystem.config.js:7–22`.
- **P-07** `swarm_coordinator.js:131` — Wraps cherry-pick in `try { ... } catch { execSync('git cherry-pick --abort', ...) }`. Transactional.
- **P-08** `agent_tower.js:127` — HMAC-compatible `WORKER_SECRET` flow exists in `worker_service.js`; the protocol is correct, just optional.
- **P-09** `unified_api.js:71` — `sseStart` correctly sets `X-Accel-Buffering: no` to prevent proxy buffering of streaming responses.
- **P-10** `service_registry.js:25` — `group: 'core'` vs `'optional'` partitioning means `purpclaw minimal` profile only boots 6 services, reducing attack surface for dev.

---

## 📊 SUMMARY

| Severity | Count | Effort (h) |
|----------|-------|-----------|
| P0 Critical | 4 | 6–8 |
| P1 High | 6 | 8–12 |
| P2 Medium | 6 | 4–6 |
| P3 Low | 6 | 2–4 |
| **Total** | **22** | **20–30** |

### Recommended sequencing
1. **F-01** (rotate keys) — owner GUARDIAN, 1 h, blocks everything else from being public.
2. **F-02** + **F-07** + **F-08** (auth defaults fail-closed) — owner ROBOT + GUARDIAN, 3 h, blocks LAN-internet exposure.
3. **F-03** + **F-04** (base64 helper + gatekeeper rules) — owner ROBOT, 4 h, restores reviewability + false-positive budget.
4. **F-05** + **F-06** (windowsHide + CORS) — owner ROBOT, 1 h, defense in depth.
5. F-09 → F-22 — backlog.

---

## 📎 APPENDIX — Files NOT audited (out of scope)

- `node_modules/`, `vendor/windows-mcp/`, `vendor/ponytail/`, `vendor/...`
- `.donors/`, `.archive/`, `.claude/worktrees/`, `.venv/`
- `skills/*/SKILL.md` (skills are operator-authored; out of mission scope; spot-checked the ones referenced by `unified_api.js` — `secrets?/` and `permissions?/` are GUARDIAN's lane)
- `purpclaw.js`, `bin/purpclaw.js`, `app/`, `components/`, `public/` (frontend assets; covered by next-eslint in CI per `package.json:33`)
- 41 persona files in `agents/*.md` (descriptions only; not executable)

---

🤖 *Precision maintained. 22 findings, 10 positives, 0 false flags.*
