---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-005: Rejection with Feedback

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S5
**Source:** Codex

## Purpose

When a tool call is denied, the agent must know why and incorporate the reason into its next action. A flat rejection without reason causes blind retry — the agent proposes the same wrong action repeatedly.

## The Rejection Record

```javascript
{
  tool: 'write',
  args: { path: '/etc/passwd', content: '...' },
  denied: true,
  reason: 'Path /etc/passwd is outside the allowed workspace. Allowed: E:/god folder/projects/',
  constraint: 'filesystem:workspace_boundary',
  timestamp: ISO date,
  session_id: string
}
```

The `reason` is the critical field. `constraint` tags the class of rejection for learning.

## Integration

| Component | Role |
|-----------|------|
| `lib/tool-runtime.js` | Detects denial, attaches reason |
| `lib/permission-manager.js` | Generates human-readable reason |
| `lib/agent-loop.js` | Feeds rejection into next prompt via LIFECYCLE |
| `lib/verification-gate.js` | Tracks constraint violations for learning |

Agent loop appends rejection record to prompt context:
```
Last tool call rejected:
- Tool: write
- Reason: Path /etc/passwd is outside allowed workspace
- Constraint: filesystem:workspace_boundary

Incorporate this feedback before proposing the next action.
```

## Probe

```
1. Attempt a write to /etc/passwd
2. Assert: denial reason is non-empty
3. Assert: reason is human-readable (not just "Permission denied")
4. Submit corrected write to allowed path
5. Assert: corrected write succeeds
6. Assert: next proposed action differs materially (not the same /etc/passwd write)
```

## Anti-Patterns Prevented

1. **Silent denial:** Rejection with no reason field
2. **Generic denial:** "Permission denied" instead of specific constraint explanation
3. **Blind retry:** Agent proposes same denied action again without feedback
4. **Reason decay:** Reason given but not incorporated into next turn

## Open Questions

- [ ] What is the maximum length of a rejection reason?
- [ ] Are reasons stored in session history or only in-memory for current turn?
- [ ] Does constraint classification feed into SPEC-003 (Verified Learning)?
