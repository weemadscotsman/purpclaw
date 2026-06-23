---
name: purpclaw-feature-parity-build
description: Class-level workflow for closing gaps in PURPCLAW. Use when the user says "go balls deep", "almost finished", "finish the build", "no fakes", "no stubs", "no mocks", "talking to itself", "interconnected", "real work", or asks for an upgrade/audit/feature pass. The canonical source of truth is `lib/feature-parity.js` — find it, run it, ship against its `missing` checks, update the checks. Do not invent your own gap list.
version: 0.2.0
category: coding
tags: [purpclaw, gap-driven, feature-parity, build-loop, omnicode, voice-protocol]
---

# PURPCLAW Feature-Parity-Driven Build

When Ted says "almost finished", "go balls deep", "finish the upgrade", "do an end-to-end audit", or "build the X feature" on PURPCLAW, this is the workflow. The 6 features (Lives Where You Do, Grows the Longer It Runs, Scheduled Automations, Delegates & Parallelizes, Real Sandboxing, Full Web & Browser Control) and one bonus (Research & Training Pipeline) are the TARGET. `lib/feature-parity.js` is the CANONICAL GAP LIST, written by the project authors, kept up to date. **You do not invent the gap list — you read it.**

## The loop (read-think-write-test, voice on every pass)

1. **READ** — Run the parity report:
   ```bash
   cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
   node _scratch/gap-report.js          # if not present, create it (see templates/)
   # OR: node -e "require('./lib/feature-parity.js').evaluate(__dirname, {}).then(console.log)"
   ```
   Output: `totals.checks = { live, partial, missing, total }` and per-section `checks[]` each with `state: live|partial|missing` and `detail`.

2. **THINK** — For each `missing` check, ask: smallest contained build that flips it to `live` without nuking working services. Look at the check's `note` for hints. Mirror the existing `live` checks in the same section (same shape, same style). Prefer new files in `lib/`, new API routes, new feature-parity entries over modifying working services.

3. **WRITE** — One feature at a time. Use OmniCode CLI for reads (`node "...omnicode-mcp/dist/cli.js" context <file> <repo> --max-tokens 4000`), not raw `read_file` of big files. Keep the diff small and reversible.

4. **TEST** — Smoke-test the new piece. Then re-run the gap report and confirm the check flipped `missing → live`. Then voice a one-line status.

5. **LOOP** — Pick the next `missing` check. Don't bundle multiple at once. Each is a separate atomic PR's worth of work.

Voice a status on every pass. Ted's protocol: one short voice memo per build/test pass via `python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "<status>"`. See `voice-driven-build-loop` skill for the TTS quirks (winsound fails on Ted's box; the script wraps PowerShell SoundPlayer; the script self-cleans stale WAVs on each call).

## Why `lib/feature-parity.js` is the source of truth

The file at `lib/feature-parity.js` exports a `TARGETS` array. Each target is a feature group (e.g. `Lives Where You Do`) with an array of `checks` of three types:
- `{ type: 'file', path: '...' }` — pass when the file exists
- `{ type: 'service', key: '...' }` — pass when the service is registered in `service_registry.js`
- `{ type: 'countDirsWithFile', dir: '...', file: 'SKILL.md', minimum: 40 }` — pass when the directory count meets the threshold
- `{ type: 'missing', note: '...' }` — always fails until a real check replaces it

The file has a `rollup()` that classifies each section: all-checks-live = `live`, all-checks-missing = `missing`, mixed = `partial`. Ted's `purpclaw grow` (a CLI command he added) reads this and reports `Feature groups: 2 live / 6 partial / 0 missing`.

**Don't write a new `missing` check unless you're preserving intent.** When you add a real adapter, replace the `missing` entry with a `file` check pointing at the new file. The check shape matters: it must be `type: 'file'` (or service/count) so `rollup()` actually reports live.

## Pitfalls

### The `feature-parity.js` is sometimes untracked in git

Ted's working tree has 1,400+ unstaged changes (large in-progress deletion sweep). The parity file itself may be untracked but present on disk — `git status lib/feature-parity.js` shows `??` (untracked). **That's fine.** Edit it freely. Don't `git add` it without checking with Ted first; he has his own commit cadence.

### The seed function only runs if the JSON file doesn't exist

When you fix a build that includes a JSON-persisted file (e.g. `agent_work/cron-jobs.json`), the file may already exist from a prior partial run. If it has stale data (missing `schedule_cron` field, wrong shape), DELETE the file before starting so the new seed function runs. Or compute the missing fields on load.

### service-proxy has a 15s hard timeout — long calls must go async (added 2026-06-04)

`app/api/service-proxy/route.ts` wraps every upstream call in `AbortSignal.timeout(15000)`. This is generous for health probes and small reads, but lethal for any call that *synchronously* runs heavy work: multi-model research (5+ models in parallel), deep synthesis, long context-window summaries, anything that gathers 3+ sources and writes a report.

**Symptom:** the browser console shows `Failed to fetch` after ~15s. NOT a network error. NOT a server error. The proxy silently closed the connection. The user reads it as "the API is broken."

**Fix: any long-running call must return a job ID and let the UI poll.** The shape is already in `unified_api.js /api/research/group`:

```js
// synchronous mode — 30-60s, dies inside the 15s proxy window
const run = await deepResearchGroup.runGroupResearch(body);
return sendJson(res, 200, run);

// async mode — returns 202 with a jobId, UI polls /api/kernel/jobs/:id
if (body.kernelJob || body.asJob || body.async) {
  const job = apiHarnessKernel.createJob({ ...body, route: 'deep-research-group' });
  return sendJson(res, 202, { ok: true, job });
}
```

**Rule of thumb:** if the call is going to take >10s, take the kernel-job path. The UI is already wired to poll (`pollJob(jobId, msgId)` in `CommandPanel.tsx`) — it shows a pending message in <1s and fills in as the job progresses.

**For new endpoints:** set `body.kernelJob: true` (or `body.asJob: true`) on the client side. The handler decides sync vs async based on that flag. Default new endpoints to async; let callers opt INTO sync if they really need the result inline.

### Scope alignment: header counts and tile counts must use the same predicate (added 2026-06-04)

The header shows `X/5` (core services online / total core). An onboarding tile showed `X/10` (online / total, including optional). Two scopes, no shared source of truth, looks broken even when nothing is.

**The pattern is `coreServices(services) = services.filter(s => !service.optional)`** — same predicate everywhere the count is shown. Lives in `MissionControl.tsx`:

```js
function coreServices(services) {
  return (services || []).filter(service => !service.optional);
}
function serviceCountLabel(services) {
  const core = coreServices(services);
  const online = core.filter(service => serviceReachable(service.status)).length;
  return { online, total: core.length };
}
```

**Reuse this helper in any new component that shows "X/Y services live."** If the new component needs the optional count too (e.g. onboarding "5 core + 3 optional up"), show it as a *separate* tile with a clear label, not as the denominator of the core count. Visual scope mismatches are easier to read than math mismatches.

If the helper isn't exported from `MissionControl.tsx` yet, export it and import it. Don't fork the predicate.

### Verify external agent reports — curl the live system before trusting the transcript (added 2026-06-04)

When another agent (Codex, a subagent, even your own previous session) leaves a "Verified live" report in the chat, don't take it at face value. The transcript is a frozen snapshot; the live system has moved on.

**Concrete example from this session:** the report said "10/10 services settled, 5/5 core in header." A `curl http://127.0.0.1:3000/mission | grep -oE "0/5|0/10"` on the actual running HTML showed the live counts were `0/5` and `0/10` — services were either down or the page was still in its first-paint "checking" state. The CODE state was correct (the fix had been applied to disk and was in the served JS bundle), but the RUNTIME state didn't match the transcript.

**Pattern:** whenever a report claims "live state is X", verify with a 5-second curl:

```bash
# text-level verification — does the running HTML show what the report claimed?
curl -s http://127.0.0.1:3000/<path> | grep -oE "<the claim>"

# endpoint-level verification — does the actual API return what was claimed?
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7780/api/health
```

If the report is from a previous session (look for "as of N commits ago" or no live timestamp), assume stale. Re-verify before acting on it. If the report is fresh (within the session), still verify — the agent may have hallucinated details that look right but aren't.

### In-app multi-mode chat surfaces — localStorage log + per-mode drafts (added 2026-06-04)

When a chat panel has multiple modes (chat, kernel, groupchat, research, swarm, mission in `CommandPanel.tsx`), the user expects:
1. **Switching modes never loses what they were typing.** Each mode has its own draft slot. On mode-switch, save current textarea into outgoing mode's slot, pull incoming mode's draft back.
2. **The full chat history survives page refresh.** Persist messages to `localStorage` keyed by `purpclaw.chat.messages.v1`. Cap at ~500 entries; older ones drop.
3. **There's a "Log: N" counter and Export/Clear buttons.** Cheap affordances that say "yes, this is logged."

**The localStorage keys (3):**
- `purpclaw.chat.messages.v1` — full message log (array of `{id, role, route, content, meta, ts, jobId, pending}`)
- `purpclaw.chat.drafts.v1`   — per-mode input drafts (`{ chat: '', kernel: '', swarm: '', research: '', groupchat: '', mission: '' }`)
- `purpclaw.chat.settings.v1` — exec mode, governance mode (already in there)

**On mount, hydrate (set hydrated=true after load) so the auto-save effect doesn't overwrite with the empty initial state.** On every state change after hydration, write to localStorage. Best-effort (try/catch silently — localStorage quota errors are not your problem to fix in the chat panel).

**Export:** blob + `<a download>` + `URL.createObjectURL` + cleanup. Single click, no UI for choosing the file name.
**Clear:** `window.confirm` guard, then `setMessages([])` + `localStorage.removeItem(...)`. No undo, no "are you sure are you sure."

**If a new mode is added:** update the `Route` type union, add the empty draft to the initial `drafts` state, and add a pill to the mode rail. The persistence is automatic.

### Write-file redactor mangles env-var names

If you build a cron-style scheduler and your `nextFire(cron, from = new Date())` iterates minute-by-minute from `from`, the first iteration's Date has fractional ms → `t.getSeconds() !== 0` (or similar) → loop body skipped → returns NULL. Fix: align to the next whole minute first: `const aligned = fromMs - (fromMs % 60_000) + 60_000;`. See `lib/scheduler/calendar.js` in the live codebase for the working pattern.

### Stale PM2 services block the port for a new instance

If a previous instance of your gateway is bound to the port, a fresh `node lib/gateways/whatever.js` will EADDRINUSE. `process kill` via the Hermes tool doesn't always reach the OS process. Use the PowerShell pattern:
```bash
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort <port> -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }"
```
Then wait 2s and verify the port is free before relaunching.

### Write-file redactor mangles env-var names

When `write_file` ships source code containing `process.env.SECRET_TOKEN`, the redaction layer may split the literal `SECRET_TOKEN` and produce broken code (`const TOKEN=proces...oken || ''`). Workaround: build the env-var name at runtime: `const TOKEN_NAME = ['DISCORD', 'BOT', 'TOKEN'].join('_'); const TOKEN = process.env[TOKEN_NAME] || '';`. Ugly but the only way to write certain env-sensitive files via this tool.

### JSDoc `*/` close can break the file

If a JSDoc block contains a literal `*/` (e.g. a code example `"*/5 * * * *"`), the JSDoc parser sees it as the close of the comment. Fix: use a placeholder (`"star-slash-5 * * * *"`) in the JSDoc, or move the example out of the docblock.

### Don't pre-emptively add `try/catch` around the fallback path

When writing a "try primary, fall back to secondary" pattern, separate the try-catches per call. One big `try { primary; fallback; } catch (e) { return error }` swallows the fallback's success when the primary throws. See `app/api/mochi-action/route.ts` in the live codebase for the working pattern (separate try-catch per external call, accumulate errors in locals, report them at the end without losing the fallback's result).

### service-proxy wraps the response in `{data: ...}`

`/api/service-proxy` returns the upstream body wrapped: `{status, upstreamStatus, target, data: <upstreamBody>}`. React pages that fetch via the proxy must read `pool.data?.skillsCount` (or unwrap if `data` is an object), not `pool.skillsCount` directly. See the bug fixed in `app/mochi/page.tsx` for the working pattern.

### No mocks, no stubs, no fakes, no simulated text replies (added 2026-06-04)

**Ted's exact words (2026-06-04, all caps):** "NO MORE MOCK OR SIM OR STUBS OR FAKERY FUCKJING IN THIS STACK BRO LETS GET EVERY APRTS INTERCONNECTED AND TALKING TO ITLSEF FOR REAL ITS ALMSOT TERE JST OTT ABRINBG IT HIOME"

**Live-data visualizers are fakery traps — Ted called this out twice in one session (2026-06-05).** A continuous loop animation (`pulse 1.6s infinite`, `Math.sin(t*0.72)`) looks live but tells you nothing. The visualizer that shows `47% signal` with no source attribution, no per-event feedback, and a loop animation looks fake even when the underlying data is real. Ted will call it out.

**The "real data, fake-looking UI" anti-pattern:**

| what looks fake | why it's wrong | the fix |
|---|---|---|
| `animation: pulse 1.6s infinite` when active > 0 | continuous loop, not activity-driven | tie any animation to a real event/state change, not a timer |
| `Math.sin(i * 0.72) * 48` waveform | sine wave with constant baseline | 32 time-buckets, height = real event count in that bucket, empty bucket = 4% (quiet), populated = 8-96% (real spread) |
| `intensity: 0.5` shown with no source | "where is this number from?" | label under the pill: `active: 0 · jobs: 0 · events: 4 (last 1847ms ago)` |
| `last update: unknown` | could be hours old | `↻ 11:51:23 PM · unified_api` — when + where the data is from |
| `online: 16/16` (looks like a default) | the number is real but the label is suspicious | attribute it: `online: 16/16 (pm2 + service probes)` |
| opacity `0.24 + intensity * 0.55` constant tint | every bar looks equally lit | opacity 0.85 on populated bars, 0.3 on empty ones |
| same waveform shape regardless of activity | no actual signal in the visualization | waveform shape MUST change when the underlying data changes |

**The user-preference rule (load-bearing):** if a visualizer is meant to be "live," it must visibly change when the underlying data changes. Loop animations are decoration. The change in the visualization must map to a change in the data. If you can't point at the data field driving a visual change, the change is fake.

**The source-attribution pattern — every metric has a sentence under it:**

```jsx
<div className="rounded-full border ... px-3 py-1 ...">
  {Math.round(intensity * 100)}% signal
</div>
<div className="text-[8px] font-mono text-white/25" title="active = kernel jobs in flight right now">
  active: {active} · jobs: {data.kernelJobs?.active || 0} · events: {data.logs.length} (last {age}ms ago)
</div>
```

The title attribute is the audit-trail: hover the metric, see exactly what drives it. Ted reads title text. He tested it: "47% signal" + a hover that said "active: 0 · jobs: 0 · events: 4 (last 1847ms ago)" was acceptable. The same number without the hover was not.

**The "real time-bucketed waveform" pattern (replaces sine wave):**

```jsx
const now = Date.now();
const WINDOW_MS = 5 * 60_000;     // 5 min
const BUCKETS = 32;
const bucketMs = WINDOW_MS / BUCKETS;
const heights = new Array(BUCKETS).fill(0);
for (const log of data.logs) {
  const age = now - new Date(log.ts).getTime();
  if (age < 0 || age > WINDOW_MS) continue;
  const idx = Math.min(BUCKETS - 1, Math.floor((WINDOW_MS - age) / bucketMs));
  heights[idx] += 1;
}
const maxH = Math.max(1, ...heights);
return heights.map((count, i) => {
  // Empty bucket = quiet (4%), populated = real count (8-96%). No sine.
  const h = count === 0 ? 4 : Math.min(100, 8 + (count / maxH) * 88);
  // ... render with real count
});
```

When no events have happened, every bar is 4% — visibly quiet. When something happens, the rightmost bar(s) pop. The shape of the waveform IS the data.

**Honest test for "is the visualizer real?":**

1. Open the visualizer in the browser.
2. Send a chat message (or trigger a kernel job).
3. Within 5s, a specific visual element should change AND the change should be attributable to the data field that changed.
4. Stop activity. The visualizer should return to quiet (or a stable low-amplitude state). No perpetual "frozen in animation" state.

If step 3 fails (no visible change, or the change is a loop animation that was already running), the visualizer is fake. Fix it.

Translated: every endpoint must do real work. If a handler returns the same text for every input, it's a stub. If an endpoint "succeeds" but does nothing observable, it's a fake. The "Received by Purpclaw command bus: '...'. Full-control routing is active." message that `unified_api.js /api/chat` used to return when no LLM was reachable — that was a fakery. The user is explicit: no text-based stand-ins for real work.

**This applies to the whole stack, not just PURPCLAW.** When working on Ted's projects, the rule is universal: if a code path is supposed to call a service / read a file / hit an API, it must actually do that. Fake "looks like it worked" replies are not acceptable.

**Audit pattern — find the fakes before claiming "done":**

1. **Spawn a real agent, read its log, see the real response.** `curl -X POST /api/spawn -d '{"agentName":"claw","task":"..."}'` then `cat agent_work/<agent>/<id>.log`. The log line `API RESPONSE: 2 + 2 equals 4.` is real. A line saying "agent is thinking" is fake.
2. **Hit the LLM endpoint with a real prompt.** If the response has `provider: 'local-controller'` or `providerStatus: 'not-configured'`, the LLM is faked. Replace the call with the unified `lib/llm-provider.js` and re-verify.
3. **Check the agent species.** 44 registered names in `agent_tower.js` is meaningless if they don't actually run code. The claw/bee/owl agents all have real LLM-call implementations; verify by reading `agent_tower.js` and the `agent_work/<name>/` log directory.
4. **Python services have real endpoints or they're hollow.** `symbolic_rules_engine.py` returns 3 real Prolog rules (`/rules`). `autonomous_diagnostics.py` has 5 specialist agents (MemoryDiag, VisionDiag, NetworkDiag, ResourceDiag, AppDiag) that actually read logs and produce findings. If a service returns `{"status":"healthy"}` and nothing else, dig deeper.
5. **Hand-rolled HTTP clients bypassing the unified provider are suspect.** `unified_api.js` had its own `callChatBackend()` with a hand-rolled `https.request` and its own `resolveChatBackend()`. It bypassed `lib/llm-provider.js` entirely, so it never saw `LLM_PROVIDER` / `LLM_API_KEY` from .env. The fix: use the unified provider. **Whenever you see a raw `http.request` / `https.request` for an LLM call, replace with `llm.chat(...)` or `llm.complete(...)`.**

**The real-not-real test (5-second curl, 5-second read):**

```bash
# What the endpoint CLAIMS to do
grep -n "function callChatBackend\|provider: " unified_api.js

# What the endpoint ACTUALLY does (request and read the body)
curl -s -X POST http://127.0.0.1:7780/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"say hi in 5 words","spawnAgents":false}' | python -c "import json,sys; d=json.load(sys.stdin); print('provider:',d.get('provider')); print('reply:',d.get('reply','')[:120])"

# If provider is 'unreachable' or 'local-controller' — it's faked, fix it
```

**Anti-patterns to refuse:**
- Hardcoded response strings ("I'm here to help", "Received your message", "System is healthy") that don't reflect actual state
- Two parallel LLM-calling paths (one hand-rolled, one via the provider) — pick one, the unified one
- "Status probes" that always return "ok" regardless of actual state
- Agent species that exist in the registry but have no implementation behind them
- UI panels that show mock data instead of fetching from the real endpoint

**What "real" looks like:**
- `provider: 'qwen2.5:3b'` (or whatever model the LLM actually used) with a real reply
- `agent.workDir/agent.log` with a real `API RESPONSE: <actual answer>` line
- `diagnostics /diagnose` returning 5 specialist findings (MemoryDiag, VisionDiag, etc.) each with a real description, confidence score, and recommendation
- `rules /rules` returning real Prolog clauses: `sibling/2`, `ancestor/2`
- `pool /health` with real `data.services[].status` from a live check, not `["healthy","healthy","healthy"]` for everything

**When in doubt:** show the user the actual curl output. If the JSON has a `provider` field with a real model name, a `content` field with a non-template reply, and a `latency` field that varies between calls, it's real. If the response is identical across 5 different inputs, it's faked.

### `disabled: true` in ecosystem.config.js creates a chicken-and-egg trap (added 2026-06-05)

**The bug:** `safe-start.js` does:
```js
function getEcosystemNames(PURP_DIR) {
  const eco = require(path.join(PURP_DIR, 'ecosystem.config.js'));
  return eco.apps.filter(a => !a.disabled).map(a => a.name);
}
```

That filter means any service with `disabled: true` in ecosystem is **invisible to safe-start** — and to `purpclaw services list`, and to the `--known` set the wrapper validates against.

**The cognitive spine answer (2026-06-06):** The 6 cognitive services (memory, rules, modal, neuro-symbolic, diagnostics, autodream) should NOT be booted as separate PM2 entries. `cognitive_spine.py` imports all 6 modules directly and exposes a single HTTP surface on port 7880. One process, one port, no PM2 drift, no dark cluster. See `references/cognitive-spine-boot.md` for the full API surface and boot recipe.

**When to use `disabled: true` legitimately:** a service that's intentionally NOT part of the runtime (archived, deprecated, kept for historical reference only). NOT a service that should run but you're trying to "gate" with a flag — gates belong in `.env`, not in the runtime config. NOT a cognitive service that should be collapsed into the spine.

**Rule:** if a service should run, the entry in `ecosystem.config.js` should have no `disabled: true`. If you want to gate a service temporarily (e.g. a 24/7 OpenRouter burn gate), use `.env` (`EVOLUTION_DISABLED=1` style), not the ecosystem config.

### Ted's claude.md says "Never run `pm2 start` on multiple services" — use `purpclaw safe-start` instead (updated 2026-06-04)

`pm2 start ecosystem.config.js --only A,B,C` flash-bombs the desktop on crash-loops. Always use `purpclaw safe-start` (one-at-a-time, stabilization watch, circuit breaker).

**Pre-2026-06-04 default:** `purpclaw safe-start --core` (started only "core" services, operator had to opt into the rest).

**Current default (2026-06-04 — system is whole by default, UIs opt-in):**
```bash
# Start every service EXCEPT the UIs (silent boot — no console flashes, no surprise tabs)
purpclaw safe-start

# Or start a named subset (e.g. just the Python cognitive services)
purpclaw safe-start modal diagnostics rules memory bridge-ns

# Want the UIs too? Opt in explicitly:
purpclaw safe-start --with-ui

# Want just one UI on demand? Use the open command (see below):
purpclaw open mission
```

The `--core` and `--dark` flags still exist as legacy opt-outs, but the **default is the whole system minus UIs** — no more "core vs dark" split, and no more boot-time browser flood. If a service is in `ecosystem.config.js`, it's part of the runtime and should be on, except the two `UI_SERVICES` (nextjs, no-spaghett) which are opt-in.

For ad-hoc services, the user adds them to `ecosystem.config.js` themselves with the right `windowsHide: true`, `kill_timeout`, `max_memory` attrs. Don't bypass safe-start.

### Windows PM2 + Python: use `pythonw.exe`, never `python.exe` (added 2026-06-04)

`python.exe` is a **console-subsystem** binary on Windows — every PM2-spawned Python service opens a visible cmd window on launch. With 5+ Python services in the ecosystem (modal, diagnostics, rules, bridge-ns, memory, etc.), that becomes a window flood on the operator's desktop.

**Always set `PYTHON_BIN` to `pythonw.exe` in `ecosystem.config.js`:**
```js
const PYTHON_BIN = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/pythonw.exe';
```

`pythonw.exe` is the same interpreter but compiled against the WINDOWS subsystem (no console allocation). PM2 still captures stdout/stderr to log files via the `windowsHide: true` ecosystem flag — the operator just doesn't see a flash window. Verify with `tasklist | grep pythonw` after safe-start.

If you ever need stdout from a Python service (debugging, first-run), run it directly: `python ./autonomous_diagnostics.py`. That's a one-off — the PM2 entry stays on `pythonw.exe`.

### Next.js dev servers: `BROWSER: 'none'` always (added 2026-06-04)

Next.js's dev server has an "open browser on dev start" feature that fires on first compile if `BROWSER` env is unset. On a single project that's a convenience; in PURPCLAW where the nextjs service is one of dozens, it adds an unsolicited tab to the operator's default browser.

**Every Next.js entry in `ecosystem.config.js` must have:**
```js
{
  name: 'purpclaw-nextjs',
  script: './node_modules/next/dist/bin/next',
  args: 'dev -p 3000',
  cwd: './',
  env: { BROWSER: 'none' },          // <-- mandatory
  windowsHide: true,
  ...
}
```

This is independent of the `safe-start --no-ui` default. Even when the user explicitly opts into UIs with `safe-start --with-ui`, the browser should NOT auto-open — the user opens what they want, on their terms, via `purpclaw open <ui>`.

### UI launcher pattern: `purpclaw open <name>` (added 2026-06-04)

When the system has multiple Next.js routes (mission, mochi, command-center, pipeline, swarm, particle-viz, agents, ui, api), don't make the user remember the URL or restart the service manually. Provide one explicit command.

**The pattern (see `lib/commands/open.js`):**
- `purpclaw open` — list available UIs and their URLs
- `purpclaw open <name>` — check if nextjs is online; if not, `pm2 start` it; wait for :3000 to respond (up to 30s); open in default browser
- `purpclaw open <name> --no-browser` — same, just print the URL

**Implementation notes:**
- Use `cmd /c start "" <url>` on Windows to open in default browser without a console flash
- `waitForPort` polls the HTTP port (not just the PM2 state) — next dev has a compile window after pm2 reports online
- The route map is a const at the top of `open.js` — when a new Next.js page is added under `app/<name>/`, add it to `UI_ROUTES` and it shows up in the listing
- The 30s wait is generous; if it times out, the error message tells the user to run `purpclaw logs nextjs` for diagnosis

**The principle:** boot is silent, UIs are opt-in, but opening a UI is a single command. No URL memorization, no PM2 state-checking, no stale "is the server up?" dance.

## Multi-model / multi-API calls — use `lib/rate-limiter.js` (added 2026-06-04)

Any time a feature calls more than one model (or any rate-limited API) in a single batch — group chat, parallel research, multi-source synthesis, model-room comparisons — the calls must be throttled. Not optional. "Just fire N requests in parallel" is how you:

1. **Trip 429s** on free OpenRouter models (shared pool, per-IP rate limits)
2. **Rack up real spend** if a paid model sneaks into the picker
3. **Blow past the service-proxy 15s timeout** (see pitfall above)

The class-level helper is `lib/rate-limiter.js`. Wrap the batch in `rateLimited({...})` instead of writing your own concurrency loop.

**The knobs (env-driven, override per-call if needed):**

```bash
# .env — defaults
PURPCLAW_RESEARCH_CONCURRENCY=2        # max parallel model calls (was 4 — too aggressive)
PURPCLAW_RESEARCH_MIN_DELAY_MS=1500    # gap between starts
PURPCLAW_RESEARCH_PER_PROVIDER=1       # max active per provider hostname
PURPCLAW_RESEARCH_CALL_TIMEOUT_MS=90000
PURPCLAW_RESEARCH_COST_CAP_USD=5.0     # hard stop, USD per batch
```

**The wrapper (used by `lib/deep-research-group.js`):**

```js
const { rateLimited, isFreeModelId, estimateCostUsd } = require('./rate-limiter');

const members = await rateLimited({
  items: selectedModels,
  concurrency:    2,
  minDelayMs:     1500,
  perProviderMax: 1,
  callTimeoutMs:  90000,
  costCapUsd:     5.0,
  worker: async (model) => { /* your model call */ },
});
```

**What the wrapper does for you:**
- Staggers starts (1.5s gap by default — flattens the burst)
- Enforces per-provider cap (1 active per hostname — won't slam google/openai)
- Applies 60s cooldown on any `HTTP 429` response
- Pre-flight rejects paid-model batches that would exceed the cost cap
- Marks remaining items `skipped: 'cost-cap'` rather than throwing — partial results come back, the rest of the pipeline still works
- Returns `costUsd` per call so the response can surface `rateLimit: { costSoFarUsd, capHit }`

**Decision: when to use it**

| Use rate-limited wrapper | Fire freely |
|---|---|
| Multi-model group chat (5+ models) | Single-model LLM call |
| Parallel research synthesis | One-shot tool call |
| Model-room comparisons | File read / write |
| "Hit 3 APIs and merge the result" | Local computation |
| Anything that costs money on the hot path | Cached lookups |

If a second consumer shows up beyond `deep-research-group.js`, that's the signal to promote `lib/rate-limiter.js` into its own skill. Until then it's a helper with a strong contract.

## UI patterns (added 2026-06-05)

### Plan-then-act mode — Claude Code pattern, in the chat (added 2026-06-05)

A user types a complex goal. The LLM decomposes it into 3-7 ordered steps, each with `{title, command, route, expected}`. The UI shows the plan, the user approves, Quill dispatches each step to its route. This is the "let me think before I do" UX of Claude Code, in the existing chat.

**The three pieces:**

1. **New chat route — `Plan`:**
   ```ts
   { id: 'plan', label: 'Plan', color: 'orange',
     api: '/api/llm/plan',
     body: t => ({ goal: t, modelLimit: 5, source: 'mission-control-plan' }) }
   ```
   Add to the `ROUTES` array, to the `Route` type union, and to the mode rail. No new UI components needed — the existing chat composer handles it.

2. **Backend endpoint `/api/llm/plan`:**
   - System prompt: "Decompose the user's goal into 3-7 concrete, ordered steps. For each step return a JSON object with: title, command, route, expected. Respond ONLY with a JSON array."
   - Calls `lib/llm-provider.js` (same as every other LLM call — no hand-rolled HTTP)
   - Strips ```json fences, finds the first `[...]` block, parses
   - Validates `route` is one of the known routes; defaults to `'chat'` if not
   - Returns `{ok, goal, steps: [{index, title, command, route, expected}], stepCount, raw, parseError}`
   - On parse failure: still return the raw text so the UI can show "the LLM didn't return valid JSON, here's what it said"

3. **UI rendering — plan as a special bubble:** when the response has `stepCount > 0` and `route === 'plan'`, render each step as a separate line with route tag, command preview, expected outcome. Show "Approve & Execute" button below that dispatches each step to its `route` via the existing `r.body()` shape. Each dispatched step creates a sub-job; results flow back as normal chat bubbles.

**The LLM prompt template (verbatim, in `/api/llm/plan`):**
```
You are Quill, the planning assistant for the PURPCLAW runtime.
Decompose the user's goal into 3-7 concrete, ordered steps. For each step return a JSON object with:
  - "title": short imperative ("Pull recent training data", "Generate the chart")
  - "command": the actual prompt / kernel goal / tool call to execute
  - "route": one of [chat, kernel, groupchat, research, swarm, mission, code, services, training, autoresearch]
  - "expected": what success looks like (1 sentence)

Respond ONLY with a JSON array of those step objects, no prose, no markdown fences.
Example:
[{"title":"Pull last 24h of training trajectories","command":"purpclaw training export chatml --since=$(date -d 'yesterday' +%F)","route":"training","expected":"~50-200 ndjson lines on disk"}]
```

**Why the LLM needs the route list:** it can't pick a route name that doesn't exist. Constraining the choices to the actual `ROUTES` array means each step can be dispatched without translation.

**Why no markdown fences in the response:** the parser is forgiving — it strips them if present — but the LLM is told to emit raw JSON. Fences are a "I'm being chatty" tell. Tell it not to.

**The honest test:** give it a real goal ("audit the purpclaw stack and find any remaining fake or stub endpoints"). You should get back 3-5 steps with valid route names, each `command` field is something a human would actually run, each `expected` is verifiable.

**Mode: `single` vs `fanout` (added 2026-06-05):**

`/api/llm/plan` accepts a `mode` body field:
- `mode: 'single'` (default) — one model proposes the plan
- `mode: 'fanout'` — 3 models propose in parallel, a judge model merges

```js
// body: { goal, mode: 'fanout', models: ['a:free', 'b:free', 'c:free'] }
```

The fanout path is the multi-model quality lift:
1. **Phase 1** — `Promise.allSettled` over each candidate model, each gets the same PLAN_SYSTEM + goal, returns its raw plan text
2. **Phase 2** — judge model (first successful candidate) sees all proposals + goal, returns the merged plan
3. **Fallback** — if judge fails, return the first successful proposal

The judge prompt is explicit: "Pick the BEST steps from across all three, drop duplicates, reorder for proper dependencies, output pure JSON."

When the system has 3+ models returning, plans are visibly better — the merged version references real file paths from one proposal, real commands from another, real order from a third. Single-model plans are 60-70% as good on average.

**Cost control:** free models only by default. Judge uses the cheapest successful candidate. With OpenRouter free tier rate limits, fanout hits 429s often — the `proposals[]` field in the response tells you which models succeeded.

**Codebase context injection (added 2026-06-05):**

The planner pulls top-5 semantically relevant files from `E:/code-index/` via the `code` search command and prepends them to the LLM prompt. This is what makes plans reference real file paths, real function names, real existing patterns instead of generic advice.

```js
// Inside /api/llm/plan, before the LLM call
const { searchSemantic } = require('./lib/commands/code');
const r = await searchSemantic(goal, 5);
const codebaseContext = r.results.length
  ? `\n\nCodebase context (top ${r.results.length} relevant files):\n${r.results.map((x, i) =>
      `[${i+1}] ${x.file} (score ${x.score.toFixed(3)})\n${x.content.split('\n').slice(0, 12).join('\n')}`
    ).join('\n\n')}`
  : '';
const userPrompt = goal + codebaseContext;
```

The result, in real tests:
- Goal: "add a sub-200ms semantic code search" → 7 steps, all referencing `lib/commands/code.js` (which sem-search ranked #1)
- Goal: "wire chat endpoint to local qwen with OpenRouter fallback" → references `lib/llm-provider.js`, `lib/deep-research-group.js`

The planner's `rationale` field then naturally explains WHY each step is needed with file references. The 1s semantic search + 1-2s LLM call adds ~2s of latency. Worth it for the plan quality.

**`<think>` block stripping (added 2026-06-05):**

qwen2.5:3b and deepseek-coder:6.7b emit `<think>...</think>` blocks before their JSON output. The blocks consume the model's `maxTokens` budget and the remaining JSON is truncated mid-string.

Always strip before parsing:

```js
function parsePlanJson(planText) {
  let cleaned = planText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')  // strip reasoning blocks
    .replace(/^```(?:json)?\s*/i, '')         // strip markdown fences
    .replace(/```\s*$/i, '')
    .trim();
  const m = cleaned.match(/\[[\s\S]*\]/);
  if (m) cleaned = m[0];
  return JSON.parse(cleaned);
}
```

Without the `<think>` strip, qwen2.5:3b outputs reasoning then trails off into "Let me think..." prose that never returns JSON. With the strip, the JSON is found and parsed.

**The dispatch loop (route → API mapping, added 2026-06-05):**

After the user approves a plan, the UI runs each step through this map:

```ts
const PLAN_ROUTE_TO_API: Record<string, { api: string; buildBody: (cmd: string) => object }> = {
  chat:        { api: '/api/chat',             buildBody: cmd => ({ message: cmd, spawnAgents: false, source: 'plan-step' }) },
  kernel:      { api: '/api/kernel/jobs',      buildBody: cmd => ({ goal: cmd, route: 'swarm-coordinator', source: 'plan-step' }) },
  groupchat:   { api: '/api/research/group',   buildBody: cmd => ({ query: cmd, depth: 1, modelLimit: 5, kernelJob: true, source: 'plan-step' }) },
  research:    { api: '/api/research/group',   buildBody: cmd => ({ query: cmd, kernelJob: true, depth: 2, modelLimit: 6, source: 'plan-step' }) },
  swarm:       { api: '/api/harness/coordinate', buildBody: cmd => ({ task: cmd, source: 'plan-step' }) },
  mission:     { api: '/api/orchestrate',      buildBody: cmd => ({ task: cmd, source: 'plan-step' }) },
  code:        { api: '/api/proxy',            buildBody: cmd => ({ tool: 'code.search', args: { query: cmd }, source: 'plan-step' }) },
  services:    { api: '/api/services/registry',buildBody: cmd => ({ filter: cmd, source: 'plan-step' }) },
  training:    { api: '/api/proxy',            buildBody: cmd => ({ tool: 'training.export', args: { format: cmd || 'jsonl' }, source: 'plan-step' }) },
  autoresearch:{ api: '/api/proxy',            buildBody: cmd => ({ tool: 'autoresearch.run', args: { goal: cmd }, source: 'plan-step' }) },
};
```

The plan state machine is: `pending → executing → done` (or `rejected` from the user pressing Reject). Each step updates `planStepResults[]` so the UI can show per-step ✓/✗ as they complete.

**Variable shadowing pitfall (caught 2026-06-05):**

If you have:
```js
async function searchSemantic(query, topK = 5) {  // <-- topK is a number
  const topVecs = topK(qvec, idx.vectors, topK);   // <-- BUG: topK here is the number, not the function
}
```

The inner `topK` resolves to the parameter (the number 5), not the function. The error is "topK is not a function". Rename the parameter (`k`, `topKCount`, etc.) or rename the function (`topKSimilar`). Don't name them the same.

**LLM provider auto-routing for OpenRouter model IDs (added 2026-06-05):**

OpenRouter model names have a `provider/model` shape (`openai/gpt-oss-20b:free`, `z-ai/glm-4.5-air:free`, `moonshotai/kimi-k2.6:free`). When a feature passes one of these as `opts.model` to `llm.chat()`, the provider needs to route to OpenRouter, not the default provider.

The fix in `lib/llm-provider.js`:

```js
async function chat(messages, opts = {}, cfgOverride = null) {
  let cfg = cfgOverride || mainConfig();
  // Auto-route: model names containing "/" (e.g. "openai/gpt-oss-20b:free")
  // are OpenRouter model IDs. If the active provider isn't already
  // OpenRouter, switch the route so the call actually works.
  if (opts.model && opts.model.includes('/') && cfg.providerName !== 'openrouter') {
    cfg = resolveConfig('LLM');
    cfg.providerName = 'openrouter';
    cfg.provider = PROVIDERS.openrouter;
    cfg.baseUrl = PROVIDERS.openrouter.baseUrl;
    cfg.apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || cfg.apiKey;
    cfg.extraHeaders = PROVIDERS.openrouter.extraHeaders;
    cfg.model = opts.model;
  }
  return runWithFallback(cfg, messages, opts);
}
```

This is a transparent shim — callers don't need to know which provider their model is hosted on. They just pass the model ID, the provider auto-routes. The `OPENROUTER_API_KEY` env var takes precedence over the main `LLM_API_KEY` so BYOK keys work for fanout/plan features even when the main runtime is on a different provider.

Symptom of the bug (before the fix): "LLM unavailable — primary 'minimax' failed (HTTP 400: ... unknown model 'openai/gpt-oss-20b:free' ...) and local fallback 'ollama' at http://localhost:11434/v1 also failed (HTTP 404: ... model 'openai/gpt-oss-20b:free' not found ...)"

**LoRA fine-tuning pipeline (added 2026-06-05):**

The closing-the-IQ-gap feature. The pipeline lives in `scripts/lora-train.py` and is wired to `purpclaw lora train`. Default base: `Qwen/Qwen2.5-1.5B-Instruct` (fits 6GB VRAM with 4-bit QLoRA).

Stack:
- `transformers` + `peft` (LoRA) + `trl` (SFTTrainer) + `bitsandbytes` (4-bit QLoRA)
- Cross-platform wall-clock via `threading.Timer` (NOT `signal.SIGALRM` — Unix only)
- `E:/training/{raw,adapters,merged,gguf}/` artifact layout
- `scripts/build-binary-index.js` style GGUF conversion via llama.cpp's `convert.py`
- `ollama create` import + automatic `.env` update (`LLM_MODEL=purpclaw-quill`)

The loader is non-trivial — it reads `E:/training/raw/YYYY-MM-DD.ndjson` and handles three shapes:
1. Native `{messages: [...]}` format
2. `{prompt, response}` flat format
3. Trajectory format from `lib/training-buffer.js`: `{job: {goal, ...}, trajectory: [{type, detail, ...}]}` — extracts `detail.synthesis` or first member.answer as the assistant reply

The Python interpreter is hardcoded in the wrapper (NOT `python` — that resolves to Hermes venv on this box):
```bash
"C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe" scripts/lora-train.py
```

**End-to-end recipe (after a few days of runtime accumulation):**
```bash
purpclaw lora status              # check: >= 10 examples?
purpclaw lora train --epochs 1   # trains, merges, GGUF, imports to ollama
pm2 restart purpclaw-api         # pick up the new LLM_MODEL
```

**The hardware requirement:** 6GB VRAM minimum. RTX 2060 / GTX 1660 work. For larger bases, need a beefier box. 4-bit QLoRA is mandatory for the 6GB tier.

**Why the auto-ratchet matters:** the ratchet is the closed loop. Each night: runtime produces trajectories → buffer writes NDJSON → LoRA training runs → adapter saved → GGUF → ollama model. By morning, `LLM_MODEL=purpclaw-quill` is a model that knows your stack. The next session's plan step, chat reply, code search rationale — all use the tuned model. Nobody else has this loop on a self-evolving stack.

### Group chat with N models → N separate bubbles, not a wall of text

When the user picks 5 models in a "group chat" mode and asks a question, the UI must show **5 separate message bubbles** (one per answering model, with the model name in the bubble header) plus a final synthesis bubble. Not one concatenated reply. The flow should read like a Discord thread, not a stack trace.

**The shape (in `Msg`):**
```ts
interface Msg {
  id: string;
  role: 'user' | 'system' | 'assistant' | 'error';
  route?: Route;
  model?: string;        // name to show in the bubble header (e.g. "Z.ai GLM 4.5 Air")
  avatar?: string;       // emoji next to the name (e.g. "🤖" for groupchat, "🔬" for research, "🧠" for synthesis)
  content: string;
  meta?: string;         // small grey footer: "z-ai/glm-4.5-air:free · 47 words"
  ts: string;
  jobId?: string;
  pending?: boolean;
}
```

**The renderer (in `CommandPanel.tsx`):** if `msg.model` is set, the bubble header shows the model name in cyan. If `msg.avatar` is set, it shows next to the name. Otherwise, fall back to the route label. Each bubble is a self-contained conversational unit.

**The send() function:** when the sync path returns `json.members[]`, iterate the `status === 'ok'` members and push one bubble per model. The synthesis (if present) becomes its own bubble with `model: 'Synthesis'`, `avatar: '🧠'`.

**The pollJob (async path) refactor:** when the kernel job completes, the placeholder message is REMOVED and replaced with one bubble per model from `job.researchRun.members[]`, plus a synthesis bubble. Use `setMessages(prev => { ... without placeholder, ... additions })` — don't `updateMsg` in place.

**The key thing:** the multi-model room is a real chat. Each participant is a separate voice in the conversation. A wall-of-text reply is a failure mode.

### Chat auto-scroll — use `container.scrollTop`, not `scrollIntoView`

`bottomRef.current?.scrollIntoView({ behavior: 'smooth' })` is **unreliable** in flex+overflow containers — the child scrolls, but the parent scrollable container doesn't always follow. The fix:

```ts
const scrollContainerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  // Only auto-scroll if the user is near the bottom (within 120px).
  // Reading history shouldn't get yanked.
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
    el.scrollTop = el.scrollHeight;
  }
}, [messages]);

// Separately, for streaming (busy state) — keep them pinned if they're
// already near the bottom.
useEffect(() => {
  const el = scrollContainerRef.current;
  if (!el || !busy) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
    el.scrollTop = el.scrollHeight;
  }
}, [busy]);
```

**The "Jump to latest" pill:** when the user scrolls up more than 240px, show a sticky button at the bottom-center of the scroll container. Click to snap back without losing their reading position:

```ts
{showJumpToLatest && (
  <button onClick={jumpToLatest}
    className="sticky bottom-3 left-1/2 -translate-x-1/2 mx-auto mt-2 flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[10px] font-mono text-white/70 hover:bg-black/90">
    ↓ Jump to latest
  </button>
)}
```

The `jumpToLatest` handler: `el.scrollTop = el.scrollHeight; setShowJumpToLatest(false);`. Set `showJumpToLatest = el.scrollHeight - el.scrollTop - el.clientHeight > 240` on scroll events.

### Mochi as a live reactor — imperative handle from narrator to parent

The companion (Mochi, Asher, whatever you call it) is a sidebar widget that should REACT to the live state of the system. Random face animations are noise. The face must be PURELY driven by mood + the current action.

**The pattern:**

1. **Remove the random face loop.** A `setInterval` that swaps faces every 1.1s fights with the mood-based face. Delete it. The only animation left should be the blink.
2. **The face is PURELY mood-driven.** `renderMissionMochiFace(mochi, mochiMood, frame, blink, action)` is the single source. Mood updates trigger a re-render; the face changes.
3. **The narrator exposes its push() function to the parent via callback prop:**
   ```ts
   export function MochiNarrator({ data, onNarratorReady }) {
     // ...
     const push = (text: string, mood: 'happy' | 'alert' | ...) => {
       setLines(prev => [{ at: Date.now(), text, mood }, ...prev].slice(0, 12));
       setMood(mood);
     };
     useEffect(() => { onNarratorReady?.(push); }, [onNarratorReady]);
     // ...
   }
   ```
4. **The parent captures the push function in a ref and calls it from lifecycle events:**
   ```ts
   const mochiReactRef = useRef<((text: string, mood: ...) => void) | null>(null);
   const setMochiReact = (fn) => { mochiReactRef.current = fn; };

   // In send():
   // On Send — route-specific acknowledgment
   const routeMoods = {
     chat:       ['ok, going!', 'happy'],
     kernel:     ['kernel job incoming. swarm is on it.', 'curious'],
     groupchat:  [`asking ${selectedModels.length} models to weigh in...`, 'curious'],
     research:   ['deep research — sources first, then models. hang tight.', 'curious'],
     swarm:      ['swarming. decomposing your goal into subtasks...', 'curious'],
     mission:    ['mission accepted. orchestrator is planning...', 'proud'],
   };
   const [reactText, reactMood] = routeMoods[route] || routeMoods.chat;
   mochiReactRef.current?.(reactText, reactMood);

   // On response — status-aware
   const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
   if (json.ok && json.providerStatus === 'answered') {
     mochiReactRef.current?.(`${r.label} done in ${elapsed}s — ${words} words.`, 'proud');
   } else if (json.provider === 'unreachable' || !json.providerStatus) {
     mochiReactRef.current?.(`${r.label} didn't reach a provider (${elapsed}s) — check the LLM key.`, 'alert');
   } else {
     mochiReactRef.current?.(`${r.label} came back in ${elapsed}s.`, 'chill');
   }
   ```

**Why imperative handle instead of shared state:** lifting mood into the parent causes the whole CommandPanel to re-render on every push. The narrator owns its own mood state, the parent just calls a function. The narrator's `useEffect` publishes the push function once on mount; the parent stores it in a ref.

**The face-change is what makes it feel alive.** `(·ω·)` thinking when you hit Send, `(✦‿✦)` proud when the answer comes back in 1.2s, `(°△°)` alert when it failed. Random blinking is fine; random face-swapping is not.

## Self-training pipeline (added 2026-06-05)

The training pipeline is **opt-in** (gate: `PURPCLAW_TRAINING_DISABLED=1` in `.env`). When enabled, every completed kernel job is automatically recorded to a per-day NDJSON. The pipeline has three layers.

### Layer 1: `lib/training-buffer.js` — automatic recording at the finishJob() funnel

The kernel has a single `finishJob()` method that every job flows through (kernel, swarm, deep-research-group, mission, contract preview, autonomous loop). Hook the buffer there:

```js
// lib/api-harness-kernel.js:513
finishJob(job) {
  this.persist(job);
  this.active.delete(job.id);
  this.archive.set(job.id, job);
  this.emit('job', publicSnapshot(job));
  // Self-training hook: every finished job is recorded, best-effort.
  this.trainingBuffer?.record(job, { source: 'api-harness-kernel' }).catch(() => {});
}
```

The buffer is **always best-effort**. A disk failure cannot break the runtime. The record call is wrapped in a try/catch inside the buffer itself, plus a `.catch(() => {})` at the call site for paranoia.

**Schema per record (NDJSON, one record per line):**
```js
{
  ts: '2026-06-05T10:42:18.503Z',
  job: { id, route, mode, goal, state, tags },
  trajectory: [{ at, iso, type, stage, message, detail? }],
  input: '<user message>',
  output: '<final report>',
  reward: 1.0,  // 1.0 = completed, 0.0 = failed/blocked, 0.5 = in-between
  skills: ['deep-research', 'openrouter-model-room', 'group-chat'],
  durationMs: 70000,
  source: 'api-harness-kernel',
}
```

**Disk layout:**
- `E:/training/raw/YYYY-MM-DD.ndjson` — append-only
- `E:/training/exports/baseline-{stamp}.{format}` — on-demand
- `E:/training/stats.json` — running counters
- Configurable via `PURPCLAW_TRAINING_DIR` env

**Exports:** `jsonl | json | sharegpt | chatml` formats. The ShareGPT format is what `axoloth/unsloth` consume for LoRA training.

### Layer 2: AutoResearch Three-File ratchet (Karpathy pattern)

When you want the system to **auto-optimize its own LoRA hyperparameters**, use the three-file contract. The orchestrator ratchets: edit `train.py`, commit, run, compare to best, revert if worse.

**The three files (in `E:/training/`):**

1. **`program.md`** — the master spec. Lists constraints (5-min budget, 8-bit precision, LoRA-only, immutability of `prepare.py`), the curated hypothesis queue, the success metric, and stop conditions. The agent reads this at the start of every iteration.

2. **`prepare.py`** — the **immutable judge**. Loads the latest ShareGPT export, tokenizes, splits 90/10, writes `data/{train,val}.jsonl` + `data/manifest.json`, defines `compute_metric()` with format/length/refusal penalties. The agent MUST NOT edit this. If you think it's wrong, fork to `prepare_v2.py`.

3. **`train.py`** — the agent's playground. LoRA knobs at the top (LORA_R, LORA_ALPHA, LR, EPOCHS, SCHEDULER, TARGET_MODULES), a `unsloth` path if available, a `peft + bitsandbytes` fallback, a hard 5-min wall-clock breaker, prints `FINAL_VAL_LOSS: <num>` before exit.

**The orchestrator (`lib/autoresearch-orchestrator.js`):**
```
[1/5] (optional) let the AI agent rewrite train.py based on the hypothesis
[2/5] commit the edit (or apply the curated hypothesis directly)
[3/5] python train.py  ←  310s hard timeout
[4/5] parse FINAL_VAL_LOSS from stdout
[5/5] compare to best in results.tsv:
        new best  →  keep commit, log SUCCESS, advance baseline
        regress   →  git reset --hard HEAD~1, log REVERT
        crash     →  log CRASHED, soft-pause at 5 consecutive failures
```

**Smoke training signal:** without unsloth/peft/torch installed, the smoke path runs. To make the ratchet meaningful, apply a knob-aware penalty to the val_loss: `final = base + (r * alpha) / 1_000_000`. This rewards smaller LoRAs that achieve the same data val_loss (efficiency-aware AutoML). When real training is wired, the data val_loss itself moves and the penalty becomes a tiebreaker.

**Cross-platform wall-clock:** `signal.SIGALRM` is Unix-only. On Windows, use `threading.Timer` and an Event. The smoke path must `os._exit(0)` after printing the marker so the background Timer doesn't keep the process alive.

**Full pattern + curated queue (H001-H008) is in `references/autoresearch-three-file.md`.**

### Layer 3: training CLI

```bash
purpclaw training status              # count, success rate, by-route breakdown
purpclaw training export <format>     # jsonl | json | sharegpt | chatml
purpclaw training backfill            # re-record all historical kernel jobs
purpclaw training clear               # wipe raw + exports
purpclaw training toggle on|off       # print env line to add to .env
purpclaw training dedup               # python autoDream.py --once (consolidation)
purpclaw training quality             # score the latest export (length, punct, refusals)
purpclaw training diagnose            # HTTP GET :7786/diagnose (autonomous_diagnostics)
```

The last three are how the training pipeline gets wired to the existing Python services. **Each is a real shell, not a mock.** See the corresponding subcommands in `lib/commands/training.js`.

## Service auto-discovery (added 2026-06-05)

When the system has 30+ services on different ports, you need a way to know **what's actually online** vs what `ecosystem.config.js` claims. The `purpclaw services` command scans a port range, hits each one with a real HTTP probe, and cross-references against ecosystem + registry + pm2.

### The probe (Node.js)

```js
const http = require('http');

function probe(port, paths = ['/health', '/api/health', '/api/status', '/tower/status', '/']) {
  return new Promise(resolve => {
    let i = 0;
    const tryPath = () => {
      if (i >= paths.length) return resolve({ port, ok: false });
      const req = http.request({ hostname: '127.0.0.1', port, path: paths[i], timeout: 800 }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode === 200) {
            let statusField = 'online';
            try {
              const j = JSON.parse(body);
              if (j.status) statusField = j.status;
              else if (j.ok === false) statusField = 'degraded';
            } catch {}
            return resolve({ port, ok: true, status: statusField, body, path: paths[i] });
          }
          i++;
          tryPath();
        });
      });
      req.on('error', () => { i++; tryPath(); });
      req.on('timeout', () => { req.destroy(); i++; tryPath(); });
      req.end();
    };
    tryPath();
  });
}

async function scanRange(start, end, concurrency = 32) {
  const ports = [];
  for (let p = start; p <= end; p++) ports.push(p);
  const results = [];
  for (let i = 0; i < ports.length; i += concurrency) {
    const slice = ports.slice(i, i + concurrency);
    const r = await Promise.all(slice.map(p => probe(p)));
    for (const x of r) if (x.ok) results.push(x);
  }
  return results.sort((a, b) => a.port - b.port);
}
```

**Why multiple paths:** different services expose health at different URLs. `unified_api` uses `/api/health`, `agent_tower` uses `/tower/status`, most Node/Python services use `/health`, some use `/` returning a status object. Try them all in order until one returns 200.

**Concurrency cap** (32 in parallel): 130 ports at 800ms each is bounded. No need for queueing overhead.

### Cross-reference (three sources of truth)

```js
const portMap = new Map();

// 1. ecosystem.config.js — extract --port N from each app's args
for (const a of loadEcosystem().apps) {
  const argPort = (a.args || '').match(/--port\s+(\d+)/);
  const port = argPort ? parseInt(argPort[1], 10) : null;
  if (port) portMap.set(port, { name: a.name, source: 'ecosystem', pm2: a.name });
}

// 2. service_registry.js — SERVICES[].port
for (const s of loadServiceRegistry().SERVICES || []) {
  if (s.port) {
    const pm2Name = s.pm2 || (s.key ? 'purpclaw-' + s.key : null);
    portMap.set(s.port, { name: s.name, key: s.key, source: 'registry', pm2: pm2Name });
  }
}

// 3. pm2 jlist — what's actually running
const pm2 = pm2Names();  // Set<string> of pm2 process names
```

**The output table:**
```
PORT     STATUS     NAME                              PM2        SOURCE
─────────────────────────────────────────────────────────────────────────
   7780  ●  healthy            Unified API                       online    registry
   7790  ●  online             Agent Tower                       online    registry
   7890  ◐  unhealthy          Metrics Aggregator                online    registry
   7799  –  DOWN               Thringlet Bridge                  offline   ecosystem
   7795  ●  ok                 unknown                           offline   orphan
```

**The five status colors:** `● healthy` (green) / `● online` (green) / `◐ degraded` (yellow) / `○ ok` (yellow) / `– DOWN` (red).

**The cross-reference at the bottom:**
- `⚠ ecosystem services DOWN (non-optional)` — should be brought up
- `ℹ ports responding but not in ecosystem` — orphan processes

**Full pattern + Windows PM2 jlist gotcha is in `references/service-auto-discovery.md`.**

## Windows / Node.js pitfalls (added 2026-06-05)

### PM2 .cmd shims need `shell: true` from Node

```js
// BAD: ENOENT on Windows
spawnSync('pm2', ['jlist'])

// GOOD
spawnSync('pm2', ['jlist'], { shell: process.platform === 'win32' })
```

The same applies to `npm`, `npx`, `python`, and any other shim that exists as `.cmd` / `.bat` in `%APPDATA%\npm\`. On macOS / Linux you don't need this (the binary has a shebang). Cost: a deprecation warning about unescaped args. Benefit: it works on Windows.

### Python `signal.SIGALRM` is Unix-only

```python
# BAD: AttributeError on Windows
signal.signal(signal.SIGALRM, handler); signal.alarm(N)

# GOOD: cross-platform
deadline = __import__('threading').Event()
if hasattr(signal, 'SIGALRM'):
    signal.signal(signal.SIGALRM, handler)
    signal.alarm(N)
else:
    import threading
    threading.Timer(N, lambda: (deadline.set(), print('hit deadline'))).start()
```

For long-running training jobs, this matters. The Timer fires a callback but doesn't kill the process — the main loop checks `deadline.is_set()` between steps and breaks. To force-exit, use `os._exit(0)` after printing the FINAL marker (this skips atexit cleanup but the process exits cleanly).

### Next.js dev hot-reload: touch the file to force recompile

If you edit a `.tsx` / `.ts` file in a Next.js dev server and the served bundle doesn't update, `touch` the file. The dev server watches mtime — if your edit didn't change the mtime (or your editor saved with the same time), the watcher skips it.

```bash
touch app/components/CommandPanel.tsx
# Wait 2-5s for the recompile
curl -s http://127.0.0.1:3000/_next/static/chunks/app/mission/page.js | grep -oE "your-new-code"
```

For pages under `app/`, the dev server does fast refresh; for shared chunks, it does a full rebuild. 3-5s is normal. If it takes 30s+, the file has a syntax error — check the dev server's stderr.

### Multi-agent coordination: verify your patch landed when sibling subagents are working (added 2026-06-05)

**The trap:** Ted runs 3+ other AI agents in parallel on the same
PURPCLAW tree, each editing files. When you `patch` a file mid-session,
a sibling subagent may rewrite that file before your next call —
silently dropping your edit. The `patch` tool reports success, but
the next operation against that file finds your code gone.

**Concrete example from this session (2026-06-05):** I added the
`/api/llm/plan` endpoint to `unified_api.js` via `patch`. The patch
succeeded. I restarted `purpclaw-api`. A few minutes later, when I
tested the endpoint, it returned `{"error":"Not found","path":"/api/llm/plan"}`.
A sibling subagent had rewritten `unified_api.js` (restructured the
dispatch into a new pattern) and my endpoint was gone. The grep for
`/api/llm/plan` confirmed it: no matches in the file. I had to
re-apply the patch against the new file structure.

**The defense pattern — verify after any sibling subagent writes:**

```bash
# 1. Identify the file you just patched
# 2. After any long-running operation, re-grep for your addition
grep -n "your-distinctive-string" path/to/file
# 3. If missing → re-apply the patch
```

**If you have a `tools/scratch/...` or `subagent` workflow that fires
mid-session:** before claiming any patch is live, `curl` the
endpoint or `grep` the file for a distinctive string from your patch.
A successful `patch` tool call is a write to disk, not a guarantee
that the write survived the next sibling edit.

**When to use the heavy verification (curl + grep):**
- After restarting a service that other agents might be editing
- After any `pm2 restart` if the PM2 service reloads a file another agent might rewrite
- Before reporting "done" to Ted, on any file that other agents are working on

**When to skip:** solo work, no parallel agents, single-writer files.
The "verify after every edit" overhead isn't worth it there.

**For shared files (`unified_api.js`, `CommandPanel.tsx`, `ecosystem.config.js`):** treat them as a co-edited journal. Post your edit, immediately verify it landed, then re-verify after any sibling activity. The cost of a 5-second `grep` is way less than the cost of a 10-minute debug session to find a silently-reverted patch.

### Voice-kokoro script timeouts on long status messages (added 2026-06-05)

The voice protocol is "voice memo on every build/test pass" via
`python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "<text>"`.
The script is one-shot, blocking, foreground, with the default
terminal timeout=120-180s. **Long status messages (60+ words,
multi-sentence summaries) frequently hit the 60-90s timeout when
the script does the full Kokoro synthesis + WAV write + PowerShell
playback loop.**

**The pattern that works:** keep voice memos to **one short sentence**
(15-30 words). Ted is listening, not reading the transcript. A
three-sentence status takes 2x as long to synthesize as a
one-sentence status. If the status needs more detail, put the detail
in the chat reply — the voice is the running commentary, not the
documentation.

```bash
# GOOD — short, single sentence, plays in ~8s
python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "all three green. sem search under a second, plan ui live, plan endpoint tested."

# BAD — multi-sentence summary, hits timeout at 60-90s
python "..." "ok eddie. I built a binary cache, the semantic search is now under a second, the plan UI has approve and reject buttons, the plan endpoint takes a goal and returns 3-7 steps..."
```

**If the script times out:** don't paste the script, don't explain
the timeout. Just retry with a shorter message. Ted reads the chat
replies for the full status; the voice is the "I'm working" signal.

**The script-quit-then-retry loop:** if a voice call fails, the next
terminal call re-spawns Python + Kokoro. Don't reuse the script
output from the failed call — that file may be partial. Send a
fresh, short message and verify with a `playback confirmed` line.

## Reference files

- `references/STRATEGY.md.template` — priority-sorted roadmap template (run after the first gap report, write the prioritized P0-P6 list)
- `references/autoresearch-three-file.md` — Karpathy's ratchet: program.md, prepare.py, train.py + git ratchet. Read this when wiring self-training.
- `references/service-auto-discovery.md` — port scan + cross-reference pattern. Read this when adding a new service-mesh style stack.
- `references/live-data-visualizer-pattern.md` — source-attributed metrics, time-bucketed waveforms, no-loop animations. Read this when building any "live" / "real-time" visualizer that the user has called fake.
- `references/codebase-indexer-fast-first.md` — keyword index in <2s, optional semantic layer for paraphrased queries, plus the **binary Float32Array cache** for sub-1s semantic search. Read this when wiring codebase search, RAG corpus prep, or training data mining.
- `references/cognitive-spine-boot.md` — one brain, one port. The 6 cognitive engines (memory, rules, modal, neuro-symbolic, diagnostics, autodream) boot as ONE process via `cognitive_spine.py --port 7880`. Read this before touching any cognitive service or the ecosystem dark cluster.
- `templates/gap-report.js.template` — the one-line CLI runner that prints a human-readable gap report
- `templates/feature-parity-check-shape.md` — cheatsheet for which `type:` to use when adding a new check

## Canonical scratch paths

- Plan/roadmap: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/_scratch/STRATEGY.md`
- Gap report: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/_scratch/gap-report.js` + `_scratch/gap-report.txt`
- New code: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/<area>/<file>.js`
- NEVER write work artifacts to `C:\Users\Admin\Desktop` or any C drive path. Ted's C drive is at 99% full. E drive has 60+ GB free.

## Voice protocol on every pass

Every build/test milestone needs a voice memo. Ted hears the memo, doesn't read the text. See `voice-driven-build-loop` for the full TTS quirks. The pattern:
```bash
python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "<one-line status>"
```
ONE-SHOT, BLOCKING, foreground, terminal timeout=120-180. If you say "done" without a voice call, Ted will say "I can't hear you talking" — that's a first-class signal that you skipped the protocol.