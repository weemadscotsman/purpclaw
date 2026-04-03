# Hermes Send — Cron Auto-Delivery Interaction

**Date:** 2026-05-25  
**Signal:** `hermes send --to telegram` returned `"Skipped send_message to telegram:433353701. This cron job will already auto-deliver its final response to that same target."`

---

## The Rule

When a cron job's `deliver` param targets a specific platform/chat (e.g. `deliver: 'telegram:433353701'`), the **built-in `hermes send` CLI command will silently skip sending** to that same target.

The reason: the system's cron delivery handler already sends the final response there. Sending again would be a duplicate.

---

## Behavior Matrix

| Scenario | `hermes send --to telegram:433353701` | Cron auto-deliver |
|---|---|---|
| Cron job deliver=Telegram home | **Skipped** (no-op, exit 0) | ✅ Delivers final response |
| Cron job deliver=origin (current chat) | ✅ Sends via `hermes send` | ❌ No auto-deliver |
| Different target (e.g. `telegram:123456`) | ✅ Sends normally | ❌ Only the configured target |

---

## Practical Implication

For **cron job report delivery** — do NOT attempt to also call `hermes send` to the same Telegram chat the cron is configured to auto-deliver to. The system handles it. Just produce the final response content; the delivery is automatic.

If you need to send an **additional message** beyond the cron job's auto-delivered response, use a **different target**:
- A different Telegram chat ID
- A different platform (e.g. Discord)
- Or use `deliver: 'origin'` on the cron and `hermes send -t telegram` for an explicit secondary destination

---

## Verifying Delivery Targets

```bash
# List known Telegram targets
hermes send --list telegram
# Output: telegram:COMPOUND MONSTER  [433353701]

# Check cron job's configured deliver target
hermes cron list
```

---

## Key Takeaway for Future Sessions

When a task says "deliver to Telegram" — if it's coming from a cron job that already has `deliver: 'telegram:433353701'` configured, the correct behavior is **silence from `hermes send`** and **trust the auto-delivery**. Do not attempt a secondary send; the system correctly skips it and the final response goes out via the cron delivery mechanism.

If explicit delivery is needed as a separate action from the cron auto-deliver, ensure the cron uses `deliver: 'origin'` and use `hermes send -t telegram` for the programmatic send.