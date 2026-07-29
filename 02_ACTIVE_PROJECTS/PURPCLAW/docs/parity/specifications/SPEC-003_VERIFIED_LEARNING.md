---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-003: Verified Learning Gate

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S3
**Source:** PURPCLAW original (the differentiator)
**References:** SPEC-001 (Verification Blocks)

## Purpose

Every lesson that enters trusted memory must be evidence-backed. A lesson observed once and a lesson verified across 10 contexts look identical in chat — but only one should be trusted. The Verified Learning Gate is the enforcement mechanism that separates confident wrongness from validated knowledge.

This spec covers:
1. How lessons flow from observation to trusted memory
2. The gate pipeline each lesson must pass
3. How confidence is scored and updated
4. How DECAYED lessons are handled

## The Learning Pipeline

```
[Lesson observed]
      ↓
  EMERGENT bucket
  (raw, unverified)
      ↓
  Gate 1: Repeatability check
  (≥3 successes in similar context?)
      ↓
  PROBATIONARY bucket
  (verified repeatable, falsifiable test exists)
      ↓
  Gate 2: Falsifiability check
  (test proves it wrong → reject; test proves it right → promote)
      ↓
  Gate 3: Human review (HIGH_STAKES only)
      ↓
  TRUSTED bucket
  (confident, verified, human-approved for high-stakes)
      ↓
  Decay monitoring
  (failures decrement confidence; TTL expiry → DECAYED)
```

## Status Lifecycle

| Status | Meaning | Reads |
|--------|---------|-------|
| `EMERGENT` | New; < 3 successful uses | Not trusted in agent loop |
| `PROBATIONARY` | Gate 1 passed; Gate 2 falsifiable | Advisory only |
| `TRUSTED` | Gates 1 + 2 passed (+ Gate 3 for HIGH_STAKES) | Used in agent loop |
| `DECAYED` | Confidence < threshold OR TTL expired | Read-only archive |

Transitions:
- `EMERGENT → PROBATIONARY`: 3+ successful applications in similar context
- `PROBATIONARY → TRUSTED`: Falsification test passed; human approved (HIGH_STAKES)
- `PROBATIONARY → EMERGENT`: Falsification test failed (reset counter)
- `TRUSTED → DECAYED`: Confidence drops below `MIN_CONFIDENCE` (default 0.2) OR TTL expired
- `DECAYED → EMERGENT`: Re-activated on new evidence

## Confidence Scoring

```javascript
{
  confidence: 0.0 - 1.0,   // start at 0.5 on PROBATIONARY entry
  success_count: N,
  failure_count: N,
  last_tested: ISO date,
  last_success: ISO date,
  context_hash: SHA256,      // fingerprints the context pattern
  decay_rate: 0.05          // confidence lost per week of disuse
}
```

Scoring rules:
- On success in similar context: `confidence += 0.1` (max 1.0)
- On failure: `confidence -= 0.3` (min 0)
- On week of disuse: `confidence -= decay_rate`
- On `confidence < 0.2`: status → DECAYED

## HIGH_STAKES Classification

A lesson is HIGH_STAKES if it affects:
- File system mutations (write, edit, delete, chmod, chown)
- Network operations (HTTP requests, SSH, port bindings)
- External service credentials or API keys
- Agent configuration (system prompt, tool permissions, provider settings)
- Process spawning or termination
- Other users' data or sessions

HIGH_STAKES lessons require explicit human approval before entering TRUSTED.

## Storage Schema

```javascript
// Stored in cognitive spine with type='lesson'
{
  id: 'vblk_<uuid>',
  type: 'lesson',
  status: 'EMERGENT | PROBATIONARY | TRUSTED | DECAYED',
  lesson: 'string — what was learned',
  context_pattern: 'string — when/where it applies',
  scope: 'session | project | user | app',
  confidence: 0.0 - 1.0,
  evidence: {
    successes: N,
    failures: N,
    last_tested: ISO date,
    test_proof: 'string — falsification test description'
  },
  stakes: 'HIGH | LOW',
  gate: {
    repeatability: 'PASS | FAIL | PENDING',
    falsifiability: 'PASS | FAIL | PENDING',
    human_review: 'PASS | FAIL | PENDING | SKIPPED'
  },
  created_at: ISO date,
  updated_at: ISO date,
  source: 'interaction | feedback | probe | session'
}
```

## Module Designation

New module: `lib/verification-gate.js`

```javascript
// Public API
const gate = require('./verification-gate');

// Submit a lesson for evaluation
gate.observe({ lesson, context, outcome, stakes });

// Check if a lesson should influence current action
gate.isTrusted(lesson_id); // → boolean

// Get trusted lessons for current context
gate.getTrusted(context_pattern, scope);

// Promote a lesson (called by probe or human review)
gate.promote(lesson_id, { test_proof, human_approval });

// Decay a lesson (called periodically or on failure)
gate.decay(lesson_id);

// Check lesson status
gate.status(lesson_id); // → { status, confidence, gate state }
```

## Integration Points

| Component | Integration |
|-----------|-------------|
| `lib/training-buffer.js` | Emits raw lessons → `verification-gate.observe()` |
| `lib/memory-client.js` | Stores verified lessons with scope and confidence |
| `lib/agent-loop.js` | Before acting: consult `verification-gate.isTrusted()` for relevant lessons |
| `lib/commands/ask.js` | After task: emit outcome → `verification-gate.observe()` |
| S1 Lifecycle hooks | `TaskCompleted` and `PostToolUse` events trigger observation |
| `lib/idle-engine.js` | Decay pass: scan for stale lessons, decrement confidence |

## Probe Definition

### Probe A: False lesson rejection

```
1. Plant false lesson (clearly wrong for the context)
2. Submit as EMERGENT
3. Simulate 3 failures in similar context
4. Assert: status → DECAYED or confidence < 0.2
5. Assert: isTrusted(lesson_id) → false
```

### Probe B: True lesson promotion

```
1. Plant true lesson with clear evidence
2. Simulate 3 successes in similar context
3. Assert: status → PROBATIONARY
4. Submit falsification test that proves it right
5. Assert: status → TRUSTED
6. Assert: isTrusted(lesson_id) → true
```

### Probe C: Confidence decay

```
1. Take TRUSTED lesson with confidence=0.8
2. Simulate 2 failures
3. Assert: confidence ≈ 0.2
4. Simulate 1 more failure
5. Assert: status → DECAYED
```

### Probe D: HIGH_STAKES requires human

```
1. Plant HIGH_STAKES lesson
2. Simulate 10 successes
3. Assert: status → PROBATIONARY (NOT TRUSTED — needs human)
4. Submit human approval
5. Assert: status → TRUSTED
```

### Probe E: Scope isolation

```
1. Lesson L1 in scope=project:P1, status=TRUSTED
2. Query getTrusted(context, scope=project:P2)
3. Assert: L1 NOT in results
```

## Anti-Patterns This Prevents

1. **Single-shot confidence:** Agent tries once, it works, it becomes trusted
2. **Confirmation bias:** Only successes recorded, failures ignored
3. **Confident wrongness:** Strong conclusions from insufficient evidence
4. **Lesson compounding:** New lessons built on top of unverified old ones
5. **Immortal mistakes:** Wrong lessons never decay or get corrected

## Open Questions

- [ ] What context_hash algorithm defines "similar context"?
- [ ] What is the MIN_CONFIDENCE threshold for DECAYED? (default: 0.2)
- [ ] Does DECAYED mean soft-delete (readable) or hard-delete (gone)?
- [ ] How is human approval captured? (dashboard? CLI? env var?)
- [ ] Can a DECAYED lesson be auto-reactivated by new evidence, or must it go through the full pipeline again?
