# Accuracy Fish — PurpClaw Claim Integrity Engine

Public/commercial name: **Claim Integrity Engine**
Internal/lore name: **Accuracy Fish**
Created: 2026-05-27

## Canonical Placement

| System            | Role |
|------------------|------|
| **PurpClaw**     | Main agent harness |
| **YAAH Core**    | Execution engine |
| **Agent Tower**  | Visual control layer |
| **HER**          | Recursive improvement auditor |
| **Accuracy Fish**| Claim integrity / anti-bullshit layer |
| **GOTHAM**       | Clean intelligence platform — receives only verified outputs |

## Stage Flow

```
Agent generates output
        ↓
Fish extracts claims
        ↓
Fish checks evidence (file evidence, tool output, logs, web source, test result, repo diff)
        ↓
Fish labels certainty (Proven / Likely / Inferred / Speculative / Metaphor / Unsupported)
        ↓
Fish slaps if needed
        ↓
Final output ships
```

## Fish Verdict Levels

| Verdict          | Meaning                                                     |
|-----------------|--------------------------------------------------------------|
| **Wet Nod**    | Claim is supported by evidence                               |
| **Gentle Slap** | Mostly right, wording too strong                            |
| **Hard Slap**   | Claim not proven                                            |
| **Red Slap**    | Dangerous: legal, financial, security, or medical overclaim |
| **Tank Mode**   | Output held until evidence is attached                      |
| **Release Mode**| Output approved for user / buyer / report                   |

## Buyer-Safe Wording

> **PurpClaw includes a claim-integrity layer that audits agent outputs against available evidence, downgrades unsupported certainty, and prevents unverified claims from being published as fact.**

## Internal Architecture

| Module                  | Purpose                                       |
|------------------------|-----------------------------------------------|
| **Claim Extractor**    | Finds claims inside agent output               |
| **Evidence Matcher**  | Links claims to proof                         |
| **Fish Verdict Engine**| Assigns slap level and confidence             |
| **Correction Router** | Sends bad claims back to the agent            |
| **Audit Memory**      | Stores every slap, fix, and final approved claim |

## What It Prevents

- "production-ready" when it is only wired
- "secure" when no auth is enforced
- "immutable" when it is only append-only
- "autonomous" when it still needs human approval
- "tested" when nobody ran the smoke test
- "conscious" when DeepSeek got a bit dramatic again
- "buyer-ready" when the thing still has a goblin in the vents

## The Question It Asks

> Prove it, you damp little cathedral builder.

## Current Status

- `accuracy_fish/claim_extractor.js` — written, 146 lines
- `accuracy_fish/__tests__/claim_extractor.test.js` — 7 tests, all passing
- Remaining modules: evidence_matcher.js, fish_verdict.js, correction_router.js, audit_memory.js, fish_cli.js
- PM2 entry: `purpclaw-fish` (not yet registered in ecosystem.config.js)
- Orchestrator wiring: `fish.audit()` not yet wired in completeWorkflow()
