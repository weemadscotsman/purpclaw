---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-004: Priority Steer Channels

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S4
**Source:** Codex steer mode

## Purpose

During an active turn, the operator must be able to redirect the agent mid-flight without waiting for the current action to complete. Two channels: `interrupt now` and `queue next`. Both must be enforceable at the harness level, not just the model level.

## Channels

### Channel 1: `interrupt now`

Interrupts the current turn at the next safe point (between tool calls, not during). The interrupt fires before the next tool call or at turn boundary.

```
User: fix the auth bug
Agent: starts reading files...
User: stop, use the session token approach instead
→ interrupt fires
→ agent abandons current file-reading plan
→ adopts session token approach immediately
```

Probe: Start long task, fire interrupt, assert:
- Current action terminates within `interrupt_max_latency_ms`
- New directive is adopted within `redirect_max_latency_ms`
- No partial state from the interrupted action is left in agent loop

### Channel 2: `queue next`

Queues a directive to apply at the next turn boundary. Does not interrupt mid-turn.

```
Agent: (mid-task on bug fix)
User: before you finish, also add logging
→ directive queued
→ applies after current turn completes
→ user sees "queued: add logging" confirmation
```

Probe: Queue a directive, assert:
- It does NOT execute before the current turn ends
- It executes as the first action of the next turn
- Multiple queued directives execute in FIFO order

## Implementation

### Existing: Nothing built

`lib/agent-loop.js` has no interrupt or queue mechanism.

### Target API

```javascript
// Interrupt the active turn
agent.interrupt(reason);

// Queue for next turn
agent.queueNext(directive);

// Check queue state
agent.steerStatus(); // → { interrupting: bool, queue: Directive[] }
```

## Probe Definition

### Probe A: interrupt fires during long task

```
1. Start task with 10 sequential file reads (long enough to observe)
2. Fire interrupt at t=2s
3. Assert: interrupt fires within interrupt_max_latency_ms (default 500ms)
4. Assert: current action fully terminated within 2x interrupt_max_latency_ms
5. Assert: agent is in idle/idle-with-queued state
6. Submit new directive
7. Assert: new directive executes as next turn
```

### Probe B: queue respects turn boundary

```
1. Start task with 5 tool calls
2. Queue directive D1
3. Queue directive D2
4. Assert: neither D1 nor D2 executes during current turn
5. Let turn complete
6. Assert: D1 executes first in next turn
7. Assert: D2 executes second in next turn
```

### Probe C: interrupt during tool call (safe point only)

```
1. Start task that calls a 3s-running tool (e.g., ping or sleep)
2. Fire interrupt while tool is running
3. Assert: interrupt fires at tool completion, not during
4. Assert: tool completes and returns (not killed mid-execution)
5. Assert: redirect applies after tool returns
```

## Anti-Patterns This Prevents

1. **Zombie turns:** Interrupt fired but agent completes full turn anyway
2. **Mid-tool interruption:** Tool killed mid-execution, leaving partial state
3. **Queue bleed:** Queued directive executing in same turn (should be next)
4. **Queue inversion:** D2 runs before D1 despite FIFO ordering
5. **Interrupt lost:** Interrupt fires but agent ignores it

## Open Questions

- [ ] What is the default interrupt_max_latency_ms? (500ms?)
- [ ] Can interrupt fire during a streaming response before first tool call?
- [ ] Is there an "emergency stop" that's faster than interrupt? (kill current process)
- [ ] What happens to in-flight HTTP requests on interrupt? (complete? abort?)
- [ ] Does queueNext stack or replace? (FIFO queue vs single next)
