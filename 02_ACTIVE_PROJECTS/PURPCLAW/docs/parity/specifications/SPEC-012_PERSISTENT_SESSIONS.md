---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-012: Persistent Sessions

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S12
**Source:** Claude Code, Codex

## Purpose

Sessions persist across agent restarts, machine reboots, and context windows. A session can be suspended and resumed. Branching creates a fork without destroying the parent.

## Session Persistence Model

```javascript
{
  id: string,
  parent_id: string | null,   // null = root session
  branch_id: string | null,   // null = not a branch
  status: 'active' | 'suspended' | 'completed' | 'archived',
  created_at: ISO date,
  last_active: ISO date,
  checkpoint_id: string,
  memory_scope: { session, project, user }
}
```

## Current State

`lib/session-repository.js` exists and persists sessions. Session branching/forking exists via `ask.js`. But suspension and resume (kill agent, restart, pick up where left off) is not implemented.

## Target API

```javascript
// Suspend active session
session.suspend(session_id); // → checkpoint_id

// Resume from suspension
session.resume(checkpoint_id); // → restored session

// Branch a session
session.fork(session_id); // → new branch session

// Archive old session
session.archive(session_id);
```

## Probe

```
1. Create session, run 5 tool calls
2. Suspend session → assert: checkpoint created, session marked suspended
3. Kill agent process
4. Resume from checkpoint → assert: session restored with 5 tool calls
5. Resume session → run 3 more calls → assert: branch and parent are independent
```

## Open Questions

- [ ] What is the maximum suspension duration before archival?
- [ ] Does suspension preserve streaming state (mid-response)?
- [ ] Can a suspended session be resumed by a different user?
