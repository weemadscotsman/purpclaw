# Telegram Polling + Dispatch Gap — May 25 2026 Incident

## What Happened

Gateway connected to Telegram (polling mode), send worked (confirmed via `sendMessage` API returning `{"ok":true}`), but inbound messages were not reaching the agent. Ted's Telegram messages triggered no agent response.

## Symptoms

1. Gateway log showed "Connected to Telegram (polling mode)"
2. `curl sendMessage` to Ted's chat_id worked — bot could send
3. Ted's Telegram messages to the bot were consumed (getUpdates offset advanced) but agent never responded
4. Session file was growing (agent was processing), but the processing was driven by background cron jobs, not Telegram inbound
5. Session feedback loop eventually developed: agent's Telegram responses → consumed as new inbound → agent responded again → session filled with repeated messages

## Root Cause

**Primary**: Gateway was consuming Telegram updates via long-polling but NOT dispatching them to the agent. The `getUpdates` call was returning updates (Ted's messages), but the handler that forwards them to the agent was not firing. Likely a previous gateway instance's polling offset was ahead of the current instance's — the old instance had already consumed Ted's messages before this instance started polling.

**Secondary**: No `--replace` flag was used on restart, so the gateway reused the stale polling offset from the crashed/killed previous instance.

**Tertiary**: The feedback loop developed because (a) gateway was consuming messages without dispatching, AND (b) when the agent DID eventually respond (after the `--replace` restart), the responses fed back into Telegram, which were re-consumed, creating the loop.

## Diagnosis Commands

```bash
# Check if gateway is actually consuming Telegram updates (offset advances)
curl -s "https://api.telegram.org/bot{TOKEN}/getUpdates?offset=-1&limit=1&timeout=0"
# Returns {"ok":true,"result":[]} = 0 pending = offset is current, no new messages being consumed
# Returns updates array = messages being consumed but not dispatched

# Check gateway process
tasklist | grep python
# Compare PID to gateway_pid.json

# Check session file size (should be 5-50KB per exchange, not MB)
ls -lh ~/AppData/Local/hermes/sessions/session_*.json

# Check gateway log for polling activity
tail -50 ~/AppData/Local/hermes/logs/gateway.log | grep -i "telegram\|poll\|message\|dispatch"
```

## The Fix

```bash
# 1. Kill the gateway
taskkill //F //PID <pid>

# 2. Delete the bloated session
rm ~/AppData/Local/hermes/sessions/session_<bloated>.json

# 3. Restart with --replace for clean polling offset
cd ~/AppData/Local/hermes
python -m hermes_cli.main gateway run --replace

# 4. Save new PID
echo '{"pid": <new_pid>, "kind": "hermes-gateway", "argv": ["hermes_cli/main.py", "gateway", "run", "--replace"]}' \
  > ~/AppData/Local/hermes/gateway_pid.json
```

## Prevention

- Always restart gateway with `--replace` after a crash or kill
- If Telegram messages are not triggering agent responses, check session file size immediately — bloated session = feedback loop started
- Kill + restart before the session grows too large

## Cron Job Telegram Failures (Separate Issue)

Cron jobs `48ac265e8f27` and `456be098be67` were also failing "Chat not found" — this is a DIFFERENT issue from the polling gap. The cron scheduler uses a stored `chat_id` for delivery. If that `chat_id` is stale (user changed Telegram account, bot was blocked, etc.), delivery fails. The cron delivery error is: `live adapter send to telegram:433353701 failed (Chat not found)`. This means the stored chat_id in the cron job config is no longer valid for the bot's conversation with the user.

Fix for cron delivery: the user needs to send a message to the bot to refresh the chat_id, or update the cron job's target explicitly.
