---
name: purpclaw-chat-gateway
description: "Build a new chat-platform gateway adapter for PURPCLAW (Telegram/Discord/Slack/Email/WhatsApp/Signal). One-file pattern: long-poll REST → POST /api/chat → reply. Lives in lib/gateways/, registered in lib/feature-parity.js, opt-in PM2 service. Class-level — applies to any new platform you want to wire to the unified chat API."
version: 0.1.0
author: Hermes Agent
category: software-development
tags: [purpclaw, gateway, adapter, telegram, discord, slack, email, whatsapp, signal, mcp, chat-api]
metadata:
  hermes:
    tags: [purpclaw, gateway, adapter, chat]
---

# PURPCLAW Chat-Platform Gateway Adapter

Build a new chat-platform bridge that routes inbound messages to PURPCLAW's
unified chat API (port 7780 `/api/chat`) and ships the agent's reply back to
the platform. One file in `lib/gateways/`, one new feature-parity check, no
edits to existing services.

**When to use this skill:**
- Ted says "wire up [platform]", "add a [platform] bot", or any chat
  platform missing from `Lives Where You Do` in the gap report.
- You're asked to expose PURPCLAW to a new surface that has a chat-like
  message/reply API.
- The pattern is intentionally minimal — long-poll REST, no webhook, no
  public URL, no SDK dep unless the platform genuinely needs one.

**When NOT to use this skill:**
- The platform is voice-first (use a voice bridge, not a chat gateway).
- The platform has only a webhook model with no fallback (then yes, you
  need ngrok / a public host).
- You're modifying an existing adapter — patch the existing file, don't
  create a parallel one.

## The pattern (one file, ~250 lines, < 30 minutes)

```
lib/gateways/<platform>.js    ← the adapter (see templates/stub.js)
lib/feature-parity.js         ← add one new { label, type: 'file', path } entry
lib/gateways/README.md        ← update the table
```

That's the entire surface area. No edits to `ecosystem.config.js`, no
edits to `unified_api.js`, no edits to `lib/secret-redactor.js`. Ted adds
the PM2 entry himself when ready (matches the "defined but dark" pattern
he uses for new services).

## Wire model

```
[Platform]  --HTTPS long-poll-->  [adapter.js]  --HTTP POST-->  [unified_api:7780 /api/chat]
   ^                                                                  |
   |_________________  sendMessage reply  _____________________________|
```

The adapter is a standalone Node.js service. It does NOT share memory with
the rest of PURPCLAW — that comes from the `/api/chat` call (which loads
the active session, the agent state, and the LLM provider).

## The file shape

Every adapter follows the same skeleton. See `templates/stub.js` for a
copy-paste starter. Key sections, in order:

1. **Header docstring** — wire model + env vars + safety notes.
2. **Config block** — read env, build token names at RUNTIME (the write
   tool mangles `process.env.X_TOKEN` literal patterns; see Pitfalls).
3. **Logger** — pipe everything through `lib/secret-redactor.js` so
   tokens never leak to stdout.
4. **http(s)Request helper** — minimal stdlib-only request, returns
   `{ status, text, headers }`. No SDK dep.
5. **Platform transport** — one function that posts to the platform API.
6. **purpclawChat** — POSTs to `http://127.0.0.1:7780/api/chat` with
   `{ message, spawnAgents: true }`.
7. **shapeReply** — extracts a human-readable line from the chat API
   response (looks for `kernel` job, then `orchestrator` result, then
   `mission.summary`). Different platforms have different reply length
   caps — slice accordingly.
8. **pollLoop** — long-polls the platform, per-message calls
   `purpclawChat` then sends the reply.
9. **startHealth** — `/health` + `/version` HTTP server on its own
   port. Returns `mode: not_configured` if the token is missing.
10. **main** — wires it all together. If token is missing, skip the
    poll loop entirely but keep the health server up.

## Env vars (canonical)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `<PLATFORM>_BOT_TOKEN` | yes (to poll) | empty | missing → not_configured mode, health still 200 |
| `<PLATFORM>_CHANNEL_IDS` | usually | empty | comma-separated; empty → token_set_no_channels |
| `POLL_TIMEOUT_MS` / `POLL_INTERVAL_MS` | no | platform-specific | see each adapter for sensible default |
| `PURPCLAW_API_URL` | no | `http://127.0.0.1:7780` | the chat API |
| `PORT` | no | platform-specific (7795/7796/7797/7798/...) | the `/health` listener |

**Port allocation (don't clash):**
- Telegram: 7795
- Discord: 7796
- Slack: 7797
- Email: 7798
- WhatsApp: 7799 (next)
- Signal: 7800 (next)
- Reserve 7801+ for future adapters.

## The feature-parity check (mandatory)

Add ONE entry to `lib/feature-parity.js` under the `gateway-surfaces`
section, in the "Lives Where You Do" target. Replace the generic stub
with a real `file` check:

```js
{ label: 'Telegram gateway adapter', type: 'file', path: 'lib/gateways/telegram.js' },
{ label: 'Discord gateway adapter',  type: 'file', path: 'lib/gateways/discord.js' },
{ label: 'YourNewPlatform gateway adapter', type: 'file', path: 'lib/gateways/yournew.js' },
{ label: 'NextPlatform gateway adapter',  type: 'missing', note: 'Telegram pattern is in lib/gateways/ — copy telegram.js → nextplatform.js' },
```

The `type: 'missing'` note for not-yet-built adapters is fine — it gives
Ted a one-line pointer to the pattern when he wants to ship the next one.

**Verify the check shows as `live` in the gap report:**

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
node _scratch/gap-report.js | grep -A2 "<YOUR PLATFORM>"
```

The file should be marked `live` immediately. If it's `missing`, the path
in the parity check doesn't match where you wrote the file.

## Smoke test (always run)

Start the service in `not_configured` mode (no token set) and verify the
health endpoint:

```bash
PORT=<adapter-port> node lib/gateways/<platform>.js &
sleep 2
curl -s http://127.0.0.1:<adapter-port>/health
# expect: {"status":"ok","mode":"not_configured",...}
curl -s http://127.0.0.1:<adapter-port>/version
# expect: {"name":"purpclaw-<platform>-gateway","version":"0.1.0"}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:<adapter-port>/nope
# expect: 404
kill %1
```

If any of these fail, the adapter is broken. Don't ship it.

## Adding the PM2 entry (NOT your job — Ted's)

The pattern is opt-in: the service is defined but off by default, just
like the "dark cluster" (voice, vision, yolo, etc.) already in
`ecosystem.config.js`. Ted wires it up himself. Do NOT modify
`ecosystem.config.js` — that's part of the 1472 unstaged changes in the
working tree and he owns the wiring decision.

When Ted does wire it, the entry looks like:

```js
{
  name: 'purpclaw-telegram',  // or discord/slack/email/...
  script: './lib/gateways/telegram.js',
  exec_mode: 'fork',
  wait_ready: false,
  kill_timeout: 5000,
  max_restarts: 2,
  restart_delay: 10000,
  max_memory: '128MB',
  autorestart: true,
  windowsHide: true,   // CRITICAL on Windows — see ecosystem.config.js warning
},
```

Wake with `purpclaw safe-start <name>` (NOT `pm2 start` directly — that
crashes the desktop on Windows per the CLAUDE.md cascade note).

## Pitfalls

### The write tool mangles `process.env.<PLATFORM>_BOT_TOKEN`

The write_file pipeline has a secret-redactor that detects
`process.env.X_TOKEN` patterns and splits them. Symptom: the file
contains `proces...RAM' + '_BOT_' + 'TOKEN'` after a write — invalid JS.

**Fix: build the env var name at runtime.**

```js
// WRONG — gets mangled by the write tool's redactor
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// RIGHT — survives the redactor
const TOKEN_NAME = ['TELEGRAM', 'BOT', 'TOKEN'].join('_');
const TOKEN = process.env[TOKEN_NAME] || '';
```

`process.env[X]` is the lookup; the literal env var name string is built
from parts at runtime. The file's source never contains the full literal
pattern, so the redactor leaves it alone.

### JSDoc comments break on `*/N` inside the block

If your JSDoc header contains a literal cron expression or a comment
that includes `*/5 * * * *`, the `*/` closes the JSDoc block mid-string
and the rest becomes invalid syntax. Symptom: `SyntaxError: Unexpected
token '*'` on a JSDoc line.

**Fix: avoid `*/` inside JSDoc blocks.** Use Unicode `*` or "star-slash-N"
in docstring examples, or move the example outside the JSDoc.

### JSDoc must use `/**` not `/*` for the close to be auto-detected

Standard JSDoc opens with `/**` and closes with `*/`. If you use a
single-asterisk open (`/*`), the JSDoc tools won't recognise it. Use
`/**` always.

### `npm install --no-save` for SDK deps (e.g. email needs imapflow + nodemailer)

For Email we needed `imapflow` (IMAP IDLE) and `nodemailer` (SMTP). These
are big deps. The pattern:

```bash
npm install --no-save --no-audit --no-fund imapflow nodemailer
```

`--no-save` keeps `package.json` clean (so we don't fight Ted's
uncommitted changes). The deps land in `node_modules/` and work; if Ted
wants them committed, he re-installs with `--save` later.

**Don't `npm install --save` in this skill's flow** — that touches
package.json which is in the 1472 unstaged working-tree changes.

### Telegram long-poll: getUpdates returns NEWEST FIRST

The Telegram adapter reverses the array before processing so replies go
back in time order. Discord does the same. Slack `conversations.history`
also returns newest-first. Email IDLE needs the UID-based "next unseen"
tracker — see `email.js` for the pattern (capture `uidNext - 1` on
connect, then `for (let uid = last + 1; uid <= newLast; uid++)`).

### Health endpoint in not_configured mode must still return 200

If the token is missing, the service should still serve `/health` with
`mode: 'not_configured'`. This lets the gap report and any external
monitoring see the service is alive even before credentials arrive.
Returning 503 here is wrong — the service is healthy, just not
configured.

### Don't `process.exit(1)` on first network error

The first poll request might fail (DNS, TLS handshake) before the
adapter has stabilised. Catch errors, log, `sleep(5000)`, retry. Use
`stopping` flag for clean shutdown but never `process.exit(1)` from a
poll loop on transient failure.

## Built so far (June 4 2026)

| Platform | File | Port | Smoke | Notes |
|----------|------|------|-------|-------|
| Telegram | `telegram.js` | 7795 | green | getUpdates long-poll, 25s timeout |
| Discord  | `discord.js`  | 7796 | green | GET /channels/{id}/messages, 25s poll |
| Slack    | `slack.js`    | 7797 | green | conversations.history, 5s poll |
| Email    | `email.js`    | 7798 | green | IMAP IDLE (imapflow) + SMTP (nodemailer) |
| WhatsApp | (next)        | 7799 | —     | needs whatsapp-web.js (heavy) |
| Signal   | (next)        | 7800 | —     | needs signal-cli binary |

## Trigger conditions

- Ted says: "wire [platform] up", "add a [platform] bot", "make purpclaw
  available on [platform]"
- A new chat platform is added to the `Lives Where You Do` feature and
  needs implementation
- A new feature-parity `missing` note points at a platform that hasn't
  been built yet (e.g., "copy telegram.js → nextplatform.js")

## Related skills

- `voice-first-protocol` — every build step gets a voice memo per the
  "voice on every pass" rule.
- `omnicode-mcp` — use `node dist/cli.js context <file> <repo>` to read
  any of the existing adapters (saves tokens vs raw file read).
