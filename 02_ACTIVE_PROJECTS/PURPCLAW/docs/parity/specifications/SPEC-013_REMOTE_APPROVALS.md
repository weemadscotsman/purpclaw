---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-013: Remote Approvals

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S13
**Source:** Codex

## Purpose

The operator is not always at the machine. Remote approvals let a second device (phone, tablet) approve or deny a pending tool call while the agent is waiting. The agent continues once approval arrives.

## Remote Approval Flow

```
Agent: wants to write /prod/config.yaml
       → ToolCallApproval event fires
       → Agent waits (with timeout)
       → Operator receives push on phone
       → Approves on phone
       → Agent resumes with approved=true
```

## Channels

| Channel | Transport | Latency |
|---------|----------|---------|
| Telegram | Bot API | ~200ms |
| Discord | Webhook | ~300ms |
| Web | WebSocket / SSE | ~100ms |
| SMS | Twilio | ~5s |

## Current State

PURPCLAW has messaging adapters (Telegram, Discord) in `lib/adapters/`. They handle incoming messages but not structured approval requests. No approval queue visible to remote channels.

## Target API

```javascript
// Queue an approval request
approval.queue({ tool, args, context, ttl_seconds: 300 });

// Check queue (from any channel)
approval.pending(); // → [{ id, tool, args, context, timestamp }]

// Approve/deny from any channel
approval.approve(request_id, { notes? });
approval.deny(request_id, { reason });

// Agent: wait for approval
approval.wait(request_id, { timeout_ms: 300_000 });
// → { decision: 'approved' | 'denied' | 'timeout', notes? }
```

## Probe

```
1. Agent requests approval to write /prod/config.yaml
2. Assert: approval queued (visible via API)
3. Approve via API call (simulating remote device)
4. Assert: agent resumes with approved=true within 1s
5. Agent requests second approval
6. Deny via API call
7. Assert: agent receives denial with reason
8. Timeout: assert agent handles timeout correctly
```

## Open Questions

- [ ] What is the default approval TTL? (5 minutes?)
- [ ] Does denial include a required reason field?
- [ ] Can approvals be pre-authorized by pattern? (e.g., always allow reads)
- [ ] Is there an escalation path if second approver is unavailable?
