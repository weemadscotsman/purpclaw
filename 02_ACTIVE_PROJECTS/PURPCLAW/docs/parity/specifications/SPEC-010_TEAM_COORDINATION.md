---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-010: Team Coordination

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S10
**Source:** Claude Code team workflows

## Purpose

Multi-agent teams need structured coordination. Not just "delegate to agent A and B" — explicit role assignment, shared context broadcast, dependency tracking, and structured handoff between agents.

## Team Structure

```javascript
{
  roles: {
    architect: { agent: 'AGENT_ID', scope: 'design' },
    builder:   { agent: 'AGENT_ID', scope: 'implementation' },
    reviewer:  { agent: 'AGENT_ID', scope: 'verification' }
  },
  handoffs: [
    { from: 'architect', to: 'builder', trigger: 'design_complete' },
    { from: 'builder', to: 'reviewer', trigger: 'impl_complete' }
  ],
  shared_context: ['requirements', 'constraints', 'architecture'],
  broadcast: ['status_updates', 'blockers']
}
```

## Current State

PURPCLAW delegation (`lib/delegation-manager.js`) spawns agents with session isolation. No role assignment, no structured handoffs, no broadcast.

## Target API

```javascript
// Create a team
team.create({ roles, handoffs, shared_context });

// Assign work
team.assign(role, task);

// Handoff between roles
team.handoff(from_role, to_role, context);

// Broadcast to all roles
team.broadcast(message, tags);
```

## Probe

```
1. Create team with architect + builder + reviewer
2. Assign task to architect
3. Assert: handoff fires when architect signals design_complete
4. Assert: builder receives architect's design context (not raw messages)
5. Assert: reviewer receives only after builder handoff
6. Assert: broadcast reaches all 3 roles
```

## Open Questions

- [ ] Is shared context merged into each agent's session or broadcast as messages?
- [ ] Can a role have multiple agents (e.g., 3 builders in parallel)?
- [ ] What triggers handoff — explicit signal from agent, or parent evaluation?
