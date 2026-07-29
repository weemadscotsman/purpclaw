---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-014: Consent-Tiered Device Control

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S14
**Source:** Codex

## Purpose

Device-level actions (screen capture, microphone, camera, filesystem, network) are tiered by consent level. Each tier requires explicit operator consent before the agent can act. Consent persists per-session or per-task, never silently.

## Consent Tiers

| Tier | Actions | Example |
|------|---------|---------|
| TIER0: OPEN | Default allowed | Read files in workspace, run shell commands |
| TIER1: ASK | Always confirm | Write outside workspace, delete files, network calls |
| TIER2: APPROVE | Explicit pre-auth | chmod, chown, rm -rf, kill process, port binding |
| TIER3: DENY | Never allowed | Raw disk access, /etc/passwd, kernel modules |

## Current State

PURPCLAW has a permission manager (`lib/permission-manager.js`) with TIER1 (ask) and TIER2 (approve). No explicit tier definitions, no consent persistence, no TIER3 enforcement.

## Target API

```javascript
// Set consent tier for session
device.setTier(session_id, TIER1);

// Check if action is allowed
device.can(action); // → { allowed: bool, tier, requires: 'ask'|'approve'|'deny' }

// Request consent
device.request({ action, args, tier, ttl_seconds });

// Pre-authorize pattern
device.preauthorize({ pattern: 'chmod 644 *', tier: TIER1 });
```

## Probe

```
1. Attempt TIER3 action (raw disk access) → assert: DENIED, no prompt
2. Set TIER1 for session
3. Attempt TIER1 write outside workspace → assert: queued for approval
4. Approve → assert: action executes
5. Attempt same action again within same session → assert: pre-authorized, no prompt
```

## Open Questions

- [ ] Is tier persisted per-user or per-session?
- [ ] Can a pattern be pre-authorized for TIER2? (e.g., always allow chmod on /tmp)
- [ ] Does TIER3 have any override? (emergency stop is TIER3:DENY but has bypass?)
