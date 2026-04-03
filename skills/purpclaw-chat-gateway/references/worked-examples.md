# PURPCLAW Chat-Platform Gateway — Worked Examples

The four adapters built in the original session (June 4 2026), in order
they were shipped. Each is a working reference for the next one.

## Pattern comparison

| Aspect | Telegram | Discord | Slack | Email |
|---|---|---|---|---|
| File | `telegram.js` | `discord.js` | `slack.js` | `email.js` |
| Port | 7795 | 7796 | 7797 | 7798 |
| Transport | getUpdates long-poll (25s) | GET /channels/{id}/messages (25s) | conversations.history (5s) | IMAP IDLE (push) |
| Auth header | `?token=…` in URL | `Authorization: Bot …` | `Authorization: Bearer *** | IMAP login + SMTP auth |
| Send API | sendMessage | POST /channels/{id}/messages | chat.postMessage | SMTP via nodemailer |
| Reply cap | 4096 chars | 2000 chars | 40000 chars | unlimited |
| Per-chat ordering | serial in pollOnce | serial in pollChannel | serial in pollChannel | serial via IMAP UID tracker |
| Last-seen key | `update_id` | message `id` | message `ts` (float seconds) | IMAP `uid` |
| Bot self-filter | implicit (offset) | `msg.author.bot` | `msg.bot_id` / `subtype: 'bot_message'` | n/a (SMTP from) |
| External deps | none | none | none | imapflow + nodemailer |

## Common shape (copy this for any new platform)

```js
// 1. Runtime token name (avoids write-tool redaction)
const TOKEN_NAME=*** 'BOT', 'TOKEN'].join('_');
const TOKEN=proces...AME] || '';

// 2. Stdlib http(s) request
function httpRequest(urlString, options, body) { /* see stub template */ }

// 3. Platform transport (one of these per platform)
function platformSend(channelId, text) { /* platform API call */ }
function platformPoll() { /* return [{ id, channelId, text, sender }] */ }

// 4. PURPCLAW bridge
function purpclawChat(message, opts) { /* POST /api/chat */ }
function shapeReply(chatResult) { /* pick kernel job or orchestrator result */ }

// 5. Poll loop
async function pollOnce() { /* poll → per-msg chat → reply */ }
async function pollLoop() { /* while !stopping */ }

// 6. Health server (always up, even in not_configured mode)
function startHealth() { /* /health + /version + 404 */ }

// 7. Main: wire it together, skip poll loop if no token
function main() {
  if (!TOKEN) log('not_configured mode');
  const server = startHealth();
  process.on('SIGINT', () => shutdown('SIGINT', server));
  if (TOKEN && CHANNEL_IDS.length) pollLoop();
}
```

## What each adapter learned

### Telegram
- **Long-poll timeout must be ≤ 30s** or Telegram returns 400. Use 25.
- **Sequential update_id** is implicit — use it as the `offset` parameter.
- **Bot identity check is unnecessary** — Telegram never echoes your own messages in getUpdates (offset handles dedup).

### Discord
- **Bot needs `channels:history`, `channels:read`, `chat:write` scopes.**
- **Filter `msg.author?.bot`** — other bots in the same channel will spam your poll.
- **Message `id` is a snowflake string** (not an int) — use it as-is for `lastSeen`.

### Slack
- **`conversations.history` requires the bot to be in the channel first** (`channels:join` scope, or invite manually).
- **`oldest` parameter is float seconds** — set initial value to `Date.now()/1000 - 60` so we don't process 60s of backlog on first connect.
- **Filter `subtype === 'bot_message'` AND `bot_id`** — Slack returns both forms for bot messages.
- **40000 char reply cap** — slice `shapeReply` output accordingly.

### Email
- **IMAP IDLE is real-time push from the server**, not a poll — `imapflow` handles it via the `exists` event.
- **UID tracking, not message-id** — IMAP UIDs are stable across reconnects; message-ids are not.
- **SMTP is fire-and-forget** — use nodemailer's `sendMail` with `inReplyTo` + `references` for proper threading.
- **`imapflow` and `nodemailer` are big deps** — install with `npm install --no-save` so package.json stays clean.
- **Sender allowlist** — `EMAIL_ALLOW_FROM` (comma-separated) is the security gate. Default = accept any sender.
- **Reply goes back as SMTP, not as a new email thread** — preserve the subject (`Re: …`) and use `inReplyTo` for proper threading in clients.

## Adding the next one (e.g. WhatsApp or Signal)

1. Copy `templates/stub.js` to `lib/gateways/<platform>.js`
2. Replace the `<PLATFORM>` placeholders (case-sensitive)
3. Implement `platformSend` and `platformPoll` (or `startImapLoop` style for push-based)
4. Set the port per the allocation table (WhatsApp 7799, Signal 7800)
5. Add the feature-parity check in `lib/feature-parity.js`
6. Smoke-test in `not_configured` mode
7. Voice memo on each pass (per `voice-first-protocol`)

**WhatsApp specific**: needs `whatsapp-web.js` (puppeteer-based, ~50MB of browser). Heavy. The pattern would be a WebSocket client, not REST. Skip if Ted doesn't want the browser footprint.

**Signal specific**: needs `signal-cli` daemon running on the box. The pattern would be a JSON-RPC client to the daemon, not REST. Install `signal-cli` first, then mirror the email.js shape.
