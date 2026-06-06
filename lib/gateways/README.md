# PURPCLAW Chat-Platform Gateways

Isolated adapters that bridge the unified PURPCLAW chat API (`:7780 /api/chat`)
to external messaging platforms. Each gateway is a standalone Node.js
service with its own `/health` endpoint. Add to `ecosystem.config.js` when
ready, and wake with `purpclaw safe-start <name>`.

## Why a folder per adapter

The pattern is identical for every platform:

1. Receive a message from the platform
2. POST it to `http://127.0.0.1:7780/api/chat`
3. Shape the response and send it back

Each adapter is one file, one PM2 entry, one feature-parity check.

## Built so far

| Platform | File | Port | Status |
|----------|------|------|--------|
| Telegram | `telegram.js` | 7795 | live (no token → no-op) |

## Adding a new adapter

1. Copy `telegram.js` to `discord.js` (or `slack.js`, etc.)
2. Swap the long-poll + sendMessage with the platform's transport
3. Update the `feature-parity.js` check to point at the new file
4. Add a new PM2 entry in `ecosystem.config.js` (off by default)
5. Wake with `purpclaw safe-start <pm2-name>`

## Configuration

Each adapter reads its own token from env (e.g. `TELEGRAM_BOT_TOKEN`).
Tokens are never logged — all output is wrapped through `lib/secret-redactor.js`.

If a token is missing, the adapter boots in `not_configured` mode: `/health`
returns 200 with `mode: not_configured`, no polling happens. This means
you can register and start the service before you have credentials.

## No webhook required

Adapters use long-polling, which means:
- No public-internet surface (no inbound port needed)
- No domain / TLS cert required
- Works behind any NAT

Switch to webhooks later if scale demands it.
