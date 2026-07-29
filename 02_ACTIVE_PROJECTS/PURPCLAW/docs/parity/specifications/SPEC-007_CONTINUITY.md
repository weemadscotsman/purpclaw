---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-007: Continuity and Recovery

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S7
**Source:** Codex, Claude Code

## Purpose

Session state survives agent crashes, model timeouts, and operator disconnection. When the agent restarts mid-task, it must know where it left off, what was decided, and what remains.

## Continuity Targets

| Event | Required Recovery Data |
|-------|----------------------|
| Agent crash | Last checkpoint, current goal, pending tool calls |
| Model timeout | Partial response, tool calls in flight |
| Disconnection | Session ID, turn count, memory scope state |
| Context overflow | Compaction checkpoint, memory summary |

## Current State

- `lib/session-repository.js` persists sessions
- `lib/checkpoint-manager.js` provides file-level checkpoints
- No mid-turn crash recovery (agent-loop has no snapshot-on-tool-call)
- Context overflow: compaction exists but is not integrated into agent loop mid-turn

## Target API

```javascript
// Snapshot current turn state
agent.snapshot(); // → { turn_id, goal, checkpoint_id, pending_calls, memory_scope }

// Resume from snapshot
agent.resume(snapshot_id);

// Check continuity health
agent.continuityHealth(); // → { last_turn, last_checkpoint, memory_intact }
```

## Probe

```
1. Start long task (10+ tool calls)
2. Kill agent process at tool call 5
3. Restart agent
4. Assert: agent resumes at turn boundary (before tool call 5)
5. Assert: session state (memory, checkpoints) is intact
6. Assert: task completes successfully from resume point
```

## Open Questions

- [ ] Does snapshot capture in-flight streaming responses?
- [ ] What is the maximum gap between snapshot and crash (turn-level vs step-level)?
- [ ] How is memory scope state reconstructed on resume?
