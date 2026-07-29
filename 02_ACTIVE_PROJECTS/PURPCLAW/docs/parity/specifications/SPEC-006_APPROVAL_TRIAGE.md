---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-006: Delegated Approval Triage

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S6
**Source:** Codex guardian

## Purpose

When a delegated child agent requests approval, triage the request before bothering the human. If the parent can auto-resolve it (same decision made 3+ times before), auto-approve. If the decision is novel, escalate with full context.

## Triage States

```
PENDING → AUTO_APPROVED | ESCALATED | DENIED
```

| Decision | Trigger |
|----------|---------|
| AUTO_APPROVED | Same (tool, args_hash, context_hash) resolved identically 3+ times |
| ESCALATED | Novel combination, or confidence < threshold |
| DENIED | Dangerous pattern detected, or repeated rejections for same pattern |

## API

```javascript
// Submit approval request
triage.submit({ tool, args, context, session_id });

// Check status
triage.status(request_id); // → { state, decision, reason }

// Auto-resolve (internal)
triage.resolve(request_id, { auto: bool, decision, reason });
```

## Current State

S1 lifecycle hooks have `ToolCallApproval` and `ToolCallRejected` events. Approval triage is not implemented.

## Probe

```
1. Delegate a task with a novel approval request → assert: ESCALATED
2. Delegate same (tool, args) 3 times, auto-approve each → assert: 4th same request → AUTO_APPROVED
3. Deny the same request 3 times → assert: next same request → DENIED
4. Escalated request: approve it → next same → AUTO_APPROVED
```

## Open Questions

- [ ] What is the context_hash algorithm? (tool + args + file_affected + session_goal?)
- [ ] Does the human approval decision get cached for future triage?
- [ ] What danger patterns trigger immediate DENIED?
