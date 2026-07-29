---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-001: Verification Blocks

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S3 (Verified Learning Gate)
**Source:** Codex CAP-003

## Purpose

Verification blocks prevent false lessons from entering trusted memory. A lesson
requires evidence before it is trusted. Without verification, confident mistakes
compound — the agent learns its errors and repeats them.

## Definition

A verification block is a structured record of a learned behaviour with evidence
that the behaviour is correct. The block must survive three gates before entering
trusted memory:

```
[Lesson observed]
      ↓
  Gate 1: Repeatability
  "Has this worked in similar contexts before?"
      ↓
  Gate 2: Falsifiability
  "Is there a test that would prove this wrong?"
      ↓
  Gate 3: Human review (for high-stakes lessons)
  "Does a human agree this is correct?"
      ↓
[Enter trusted memory]
```

## Block Schema

```json
{
  "id": "vblk_<uuid>",
  "lesson": "string — what was learned",
  "context": "string — when/where it applies",
  "evidence": {
    "successes": "number — times this worked",
    "failures": "number — times this failed",
    "last_tested": "ISO date",
    "test_proof": "string — description of falsification test"
  },
  "gate": {
    "repeatability": "PASS | FAIL | PENDING",
    "falsifiability": "PASS | FAIL | PENDING",
    "human_review": "PASS | FAIL | PENDING | SKIPPED"
  },
  "status": "EMERGENT | PROBATIONARY | TRUSTED | DECAYED",
  "created_at": "ISO date",
  "updated_at": "ISO date",
  "source": "interaction | feedback | probe | session"
}
```

## Gate Definitions

### Gate 1 — Repeatability

A lesson is repeatable if it has succeeded in 3+ similar contexts without failure.
Evidence required:
- At least 3 successful uses
- 0 failures in similar contexts
- Last success within 30 days

### Gate 2 — Falsifiability

A lesson is falsifiable if there exists a test that could prove it wrong. This
prevents unfalsifiable beliefs from entering trusted memory.

Evidence required:
- A test description exists
- The test has been run and passed
- The test would fail if the lesson were wrong

### Gate 3 — Human Review

For lessons classified as HIGH_STAKES (affects file system, network, external
services, or agent configuration), human review is required.

Evidence required:
- Human explicitly approved the lesson
- Approval recorded with timestamp
- Scope of approval documented

## Status Lifecycle

```
EMERGENT  →  PROBATIONARY  →  TRUSTED
   ↑              ↓              ↓
   └────────  DECAYED  ←←←←←←←←←←┘
```

- **EMERGENT:** New lesson, fewer than 3 successful uses
- **PROBATIONARY:** 3+ successes, falsification test exists and passes
- **TRUSTED:** Human approved (for high-stakes) or 10+ successful uses (low-stakes)
- **DECAYED:** 3+ failures since last success, or falsification test fails

## Integration Points

- **Lesson source:** `lib/training-buffer.js` emits raw lessons
- **Verification engine:** `lib/verification-engine.js` (new module)
- **Memory write:** Only `TRUSTED` or `PROBATIONARY` lessons write to long-term memory
- **Dashboard:** `purpclaw learning status` shows block count and gate pass rates
- **Probe:** `tests/verification-block.probe.js` verifies all gates fire correctly

## Anti-Patterns This Prevents

1. **Single-shot learning:** Agent tries something once, it works, it becomes "trusted"
2. **Confirmation bias:** Agent only records successes, never records failures
3. **Confident wrongness:** Agent draws strong conclusions from insufficient data
4. **Lesson compounding:** Agent builds new lessons on top of incorrect old ones

## Open Questions

- [ ] What is the threshold for EMERGENT → PROBATIONARY? (default: 3 successes)
- [ ] How long does a lesson stay PROBATIONARY before requiring human review?
- [ ] Does DECAYED mean the lesson is deleted or just flagged as unreliable?
- [ ] How is "similar context" defined for repeatability checking?
