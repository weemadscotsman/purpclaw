---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-009: Swarm Verification

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S9
**Source:** Codex

## Purpose

When multiple agents produce outputs on the same task (parallel agents, competing implementations), a verification pass must compare outputs, score correctness, and surface disagreements without the human doing the comparison.

## Swarm Verification Flow

```
[Agent A: produces output OA]
[Agent B: produces output OB]
      ↓
  Verifier Agent (V)
      ↓
  V.compare(OA, OB) → { score, disagreements: [], winner }
      ↓
  If disagreements > 0: escalate with diff summary
  If disagreements = 0: accept winner
```

## Current State

PURPCLAW delegation (`lib/delegation-manager.js`) spawns agents but has no built-in verification pass. Multiple agents can run but their outputs are compared by the parent agent manually.

## Target API

```javascript
// Register a swarm result
swarm.verify({ task_id, outputs: [{agent, output, cost}], criteria });

// Get verification result
swarm.result(task_id); // → { winner, score, disagreements, summary }

// Trigger re-verification if output changed
swarm.reverify(task_id);
```

## Probe

```
1. Spawn Agent A and Agent B for same task
2. Assert: both outputs are registered in swarm
3. Run verification
4. Assert: winner selected with confidence score
5. Assert: disagreements surfaced with specific diff
6. If winner rejected: assert: re-verification triggered
```

## Open Questions

- [ ] Who is the verifier? (third agent? human? rule-based comparison?)
- [ ] What is the scoring algorithm for output comparison?
- [ ] Does swarm verification require same model or cross-model?
