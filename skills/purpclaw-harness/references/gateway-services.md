# PURPCLAW Gateway Services — The Family Pattern

All PURPCLAW "gateway" services follow the same shape: a standalone Node.js
HTTP service that bridges an external system (chat platform, TTS engine,
image-gen backend, etc.) to the PURPCLAW core. Each is a single file in
`lib/<kind>/<service>.js` (chat goes in `lib/gateways/`, media in
`lib/tts/`, `lib/imagegen/`).

This reference documents the family pattern, the variations per category,
and the safety constraints Ted enforces.

## The canonical file shape (every gateway follows this)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Header docstring  — wire model + env vars + safety notes                │
│  Config block     — read env, build token names at RUNTIME              │
│  Logger           — wrap stdout/stderr through lib/secret-redactor.js   │
│  http(s)Request   — stdlib-only request helper, returns {status,text}    │
│  platform API     — one function that posts to the external system      │
│  core bridge      — function that calls PURPCLAW core (chat/tts/api)    │
│  shapeReply       — extracts a human-readable line from the response    │
│  pollLoop / hook  — receives from external, dispatches via bridge        │
│  startHealth      — /health + /version HTTP server, own port             │
│  main             — wires it all together, graceful no-op when unconfigured │
└──────────────────────────────────────────────────────────────────────────┘
```

## Variations per category

| Category  | File location      | Ports | Bridge target          | What it ships this session |
|-----------|--------------------|-------|------------------------|------------------------------|
| Chat      | `lib/gateways/`    | 7795–7799 | `unified_api:7780 /api/chat` | Telegram, Discord, Slack, Email |
| TTS       | `lib/tts/`         | 7799 | local `speak_kokoro.py` | `gateway.js` (Kokoro + PowerShell) |
| Image gen | `lib/imagegen/`    | 7800 | any A1111-compatible backend | `gateway.js` (configurable URL) |
| Scheduler | `lib/scheduler/`   | 7801 | local job runner | `calendar.js` + `runner.js` |

The chat-gateway category is covered by the dedicated
`purpclaw-chat-gateway` skill — it has its own pitfalls (long-poll
patterns, per-platform reply-length caps, env-mangling) and shouldn't be
re-merged with the others.

## TTS gateway pattern (`lib/tts/gateway.js`)

Wraps an on-box TTS engine (currently Kokoro via `speak_kokoro.py`).
Service contract:

```
GET  /health                  → { status, mode: 'configured'|'not_configured', default_voice, ... }
GET  /version                 → { name, version }
GET  /voices                  → { voices: [string, ...] }
POST /speak   { text, voice? } → { ok, duration_ms, text, voice }
POST /synthesize { ... }      → 501 (play-and-delete cycle means we can't return bytes)
```

Critical bits:
- Probe mode with **soft-fail** — a slow/failing Python import shouldn't
  brick the gateway. If the script file exists, trust it.
- `subprocess.run([...powershell, -NoProfile, -Command, '...PlaySync...'])`
  via `capture_output=True` is the only reliable audio path on Ted's
  host. See `voice-first-protocol` for the full winsound-fails-on-Ted's-box
  story.
- The Kokoro script is `C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py`.
  `KOKORO_SCRIPT` env var overrides for testing.

## Image-gen gateway pattern (`lib/imagegen/gateway.js`)

Wraps any Stable Diffusion / image-gen backend. Service contract:

```
GET  /health     → { mode: 'configured'|'not_configured'|'backend_unreachable', backend_url, backend_kind, ... }
GET  /backends   → { configured, kind, url, defaults }
GET  /samplers   → { samplers: [string, ...] }
POST /generate   { prompt, width?, height?, steps?, seed?, negative_prompt?, sampler? }
                 → { ok, image_b64, mime, bytes, duration_ms, params }
```

Critical bits:
- `IMAGEGEN_BACKEND_URL` env var (e.g. `http://127.0.0.1:7860`)
- `IMAGEGEN_BACKEND_KIND`: `autodetect` (default — heuristic: 8181/8188 = comfy,
  anything else = a1111) | `a1111` | `comfy`
- A1111 adapter POSTs `{prompt, ...}` to `${BACKEND}/sdapi/v1/txt2img` and
  parses `images[0]` (base64 PNG).
- Comfy adapter is a stub — returns 501 with a clear message. Wire
  ComfyUI's HTTP API when needed.
- Returned image is `image_b64` in JSON. The caller decodes; the gateway
  does NOT proxy the raw PNG (caller can ask for that via a future
  endpoint if they need streaming).

## Scheduler service pattern (`lib/scheduler/`)

Not a "gateway" in the strict sense (no external system), but uses the same
single-file-service shape. Two files:

- `calendar.js` — JSON-backed job store at `agent_work/cron-jobs.json`.
  Seeded with default jobs on first run. Exposes `list/get/add/update/
  remove/enable` and a `nextFire(cron)` matcher.
- `runner.js` — port 7801, setTimeout-based scheduler. Loads jobs,
  schedules each via setTimeout (with `.unref()` so it doesn't keep the
  loop alive), fires on time, records status, hot-reloads every 30s.

Service contract:

```
GET    /health           → { jobs_total, jobs_enabled, timers_active }
GET    /jobs             → { jobs: [...] }
POST   /jobs             body: { name, schedule, action } → 201
DELETE /jobs/{id}        → { ok: true }
POST   /reload           → re-schedule everything from disk
GET    /version
```

Default jobs seeded on first run (computed `schedule_cron` at seed time):
- `autodream-nightly` — 3am daily → `python autoDream.py`
- `diagnostics-hourly` — top of every hour → `python autonomous_diagnostics.py`
- `skill-forge-weekly` — Sun 4am → `node lib/evolution/skill-forge.js`
- `evolution-mutator-weekly` — Wed 3am → `node lib/evolution/mutator.js`
- `tts-keepalive-5min` — heartbeat (no-op)

Action kinds supported by `runAction`:
- `{ kind: 'exec',   command, args, cwd?, env? }` → spawn process
- `{ kind: 'chat',   message, source? }`         → POST /api/chat
- `{ kind: 'speak',  text, voice? }`              → POST TTS gateway
- `{ kind: 'http',   method, url, body?, headers? }` → direct HTTP
- `{ kind: 'noop' }`                             → mark fired (testing/heartbeat)

CLI: `node lib/scheduler/calendar.js [list|add|remove|enable|disable|show]`

## The universal safety rules (apply to every gateway)

1. **No edits to existing services.** New gateways live in new files. Ted
   wires PM2 himself.
2. **`lib/secret-redactor.js` is mandatory** for all log output. Token
   names in the source code (env var lookups) MUST be built at runtime
   from parts — see `purpclaw-chat-gateway` pitfalls for the
   `process.env.X_TOKEN` redactor gotcha.
3. **Health endpoint in not_configured mode returns 200**, not 503. The
   service is alive, just lacks credentials. The gap report and
   monitoring depend on this.
4. **Don't `process.exit(1)` on first network error.** Catch, log,
   retry with backoff. The `stopping` flag is for clean shutdown only.
5. **Single source of truth for ports** — see the port allocation
   table above. New gateways pick the next free port ≥ 7802.
6. **Update `lib/feature-parity.js`** with a new check pointing at the
   new file. Run `node _scratch/gap-report.js` to confirm `live`.

## What goes in `lib/feature-parity.js` for a new gateway

```js
// under the appropriate target section (gateway-surfaces for chat, web-browser-control for tts, etc.)
{ label: 'MyThing gateway', type: 'file', path: 'lib/<kind>/mything.js' },
```

The check is just "does this file exist?" — `live` if yes, `missing` if
no. If you need a runtime health probe, add a `type: 'service'` check
with `optional: true` so it shows as `partial` when offline rather than
hard-failing the section.

## Why gateways are NOT under PM2 by default

Ted's pattern (per the "defined but dark" cluster note in CLAUDE.md):
- The service is BUILT and INDEXED in feature-parity
- It runs as a plain Node process on its own port when Ted decides
- PM2 entry is created on Ted's schedule, with `windowsHide: true` and
  `max_memory: '128MB'`
- Waking with `purpclaw safe-start <name>` (NOT `pm2 start` — that
  triggers the Windows cmd-window cascade that's frozen Ted's PC before)

This means: the gateway exists, can be smoke-tested, shows in the gap
report, and is one `safe-start` call away from being live. Zero blast
radius until Ted explicitly enables it.
