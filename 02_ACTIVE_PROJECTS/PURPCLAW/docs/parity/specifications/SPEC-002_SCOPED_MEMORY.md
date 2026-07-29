---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-002: Scoped Memory Model

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S2
**Source:** Claude Code auto-memories

## Purpose

Memory records must be readable only within their scope. A session-scope record from project A must not influence project B. A user-scope record (preferences, habits) must be accessible to all of that user's projects but not to other users. Scope boundaries are enforced at the memory layer, not at the application layer.

## Scope Levels

Four levels, ordered from narrowest to broadest:

| Level | Symbol | Visibility | Lifetime | Storage |
|-------|--------|-----------|----------|---------|
| session | `session:<id>` | Current session only | Until session ends | `session-state-service.js` (SQLite) |
| project | `project:<id>` | Same project across sessions | Until project deleted | `lib/memory-client.js` → cognitive spine |
| user | `user:<id>` | All projects for same user | Until user deleted | `lib/memory-client.js` → cognitive spine |
| app | `app:<id>` | All users on same installation | Until app reset | `session-state-service.js` (SQLite) |

Every record carries: `scope`, `source`, `timestamp`, `confidence`, `ttl`.

## Current State

### Already implemented: `lib/session-state-service.js`

Four scopes: `app`, `user`, `session`, `temp`. SQLite-backed. Works for ephemeral state (preferences, session context). Covers GATE 1 (session scope) and GATE 2 (app/user scopes within a single session).

Gaps:
- No project-level scope (multiple projects not isolated)
- No TTL enforcement (records never expire)
- No confidence field
- No long-term storage path (cognitive spine not scope-aware)

### Not implemented: project-scope, TTL, confidence, long-term scope isolation

## Target State

```
memory.ingest({ content, source, scope, ttl, confidence, ... })
memory.recall({ query, scope_filter, ... })
```

Scope is set at write time, enforced at read time. The cognitive spine stores `scope` as a first-class field. Recall queries are filtered by scope.

## Public API

### `lib/memory-client.js`

```javascript
// Existing: ingest({ content, source, importance, valence, type, metadata })
// New: ingest gains optional scope fields
ingest({ content, source, scope = 'session', ttl, confidence = 1.0, ... })

// New: recall gains scope_filter
recall({ query, limit, emotional_filter, scope_filter })

// New: explicit scope delete
clearScope(scope, owner)
```

### `lib/session-state-service.js`

```javascript
// Existing: set(raw, value, ctx), get(raw, ctx)
// New: TTL-aware entries, confidence field
set(raw, value, ctx, { ttl, confidence })
get(raw, ctx) // returns { value, ttl_expired, confidence }

// New: scope management
clearScope(scope, owner)
listScopes(owner) // returns all scope levels for owner
```

## Integration Points

| Component | Integration |
|-----------|-------------|
| `lib/agent-loop.js` | Sets current project/session scope on each turn via LIFECYCLE (S1) |
| `lib/commands/ask.js` | Passes session/project/user context to memory writes |
| `cognitive_spine.py` | Store and filter by `scope` field; enforce TTL on recall |
| `lib/session-state-service.js` | Already scope-aware; expose TTL and confidence |
| `lib/memory-client.js` | Thread scope through to cognitive spine |

## Probe Definition

### Probe A: Session isolation

```
1. Write record R1 with scope=session:S1
2. Write record R2 with scope=session:S2
3. Recall with session:S1 context → must find R1, must NOT find R2
4. Recall with session:S2 context → must find R2, must NOT find R1
```

### Probe B: Project and user cross-visibility

```
1. User U1 creates project P1, writes record R_user with scope=user:U1
2. User U1 creates project P2, recalls with user:U1 scope → must find R_user
3. User U2 creates project P3, recalls with user:U2 scope → must NOT find R_user
4. Project P1 writes R_proj with scope=project:P1
5. Same user U1 in project P2 recalls with project:P1 → must NOT find R_proj
```

### Probe C: TTL enforcement

```
1. Write record with ttl=1 second
2. Immediately recall → record present
3. Wait 2 seconds
4. Recall → record absent (TTL expired)
```

### Probe D: Confidence decay (future)

```
1. Write record with confidence=0.3
2. Record starts in probationary scope
3. 3 successful re-inforcements → confidence += 0.2
4. 3 failures → confidence -= 0.2
5. confidence < 0.1 → record flagged as DECAYED
```

## Anti-Patterns This Prevents

1. **Session bleed:** Session A's memory influencing Session B's responses
2. **Project bleed:** Project P1's lessons appearing in unrelated Project P2
3. **Cross-user contamination:** User U1's habits influencing User U2's agent
4. **Infinite memory:** Records accumulating forever with no TTL or decay
5. **Confidence-free learning:** Lessons stored without confidence scores

## Implementation Order

1. **Phase 1:** Add `scope` field to cognitive spine ingest/recall (database migration)
2. **Phase 2:** Add TTL enforcement to cognitive spine recall
3. **Phase 3:** Add confidence field and initial scoring
4. **Phase 4:** Wire scope context from agent-loop into memory writes
5. **Phase 5:** Probe and verify

## Open Questions

- [ ] What is the default TTL for session vs project vs user scope?
- [ ] How is `project:<id>` created and destroyed? (auto from working dir? explicit registration?)
- [ ] Does scope inheritance work? (project inherits user scope by default?)
- [ ] How is cross-project user recall filtered — by default or opt-in?
- [ ] Is scope mutable after write, or immutable?
