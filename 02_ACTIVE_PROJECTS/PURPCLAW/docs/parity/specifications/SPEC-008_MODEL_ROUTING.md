---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-008: Model-Per-Phase Routing

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S8
**Source:** Codex, Claude Code

## Purpose

Different phases of a task need different models. Planning = slow + deep (o4, Sonnet 4). Execution = fast + cheap (Haiku, MiniMax). Verification = careful + exhaustive (o4, Opus 4). The routing table is explicit, operator-controlled, and probeable.

## Routing Table

```javascript
{
  phase: {
    planning:   { provider: 'openai', model: 'o4-mini', cost_budget: 0.50 },
    execution:  { provider: 'minimax', model: 'MiniMax-M3', cost_budget: 0.05 },
    verification:{ provider: 'openai', model: 'o4-mini', cost_budget: 0.20 },
    reflection: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', cost_budget: 0.10 },
  },
  fallback: { provider: 'minimax', model: 'MiniMax-M3' },
  max_cost_per_task: 5.00
}
```

## Current State

PURPCLAW has multi-provider routing via `lib/llm-provider.js` but no phase-based routing. The provider is set per-request via env var or body field, not per-phase.

## Target API

```javascript
// Route current phase
route.getModel('planning', context); // → { provider, model }

// Override for this task
route.override('execution', { provider: 'deepseek', model: 'deepseek-chat' });

// Cost tracking per phase
route.costReport(task_id); // → { planning: $0.12, execution: $0.03, ... }
```

## Probe

```
1. Start planning phase → assert: routed to planning model (not default)
2. Switch to execution phase → assert: routed to execution model (not planning model)
3. Set cost_budget=$0.01 on execution → assert: execution phase respects budget
4. Exhaust budget → assert: phase routed to fallback model
5. Verify phase outputs differ (planning ≠ execution ≠ verification)
```

## Open Questions

- [ ] How is a task's phase determined? (explicit from operator? auto-detected from context?)
- [ ] Can phase routing be overridden per-task? per-session?
- [ ] Is the routing table editable at runtime or fixed at startup?
