# Self-Improving Layer — Specification
**Date:** 2026-06-29
**Classification:** `DESIGN_SPEC / EXECUTION_IMPROVEMENT_LAYER`
**Inputs:** SKILL.md, setup.md, boundaries.md, learning.md, operations.md, scaling.md, heartbeat-rules.md, heartbeat-state.md, memory-template.md, corrections.md, reflections.md
**Status:** SPEC — audit complete, wiring not started

---

## 1. What the Layer Is

```
Execution Improvement Layer
= how PURPCLAW learns to execute better, not who PURPCLAW is
```

The layer captures corrections, confirmed preferences, and reusable lessons from execution — and applies them to future work. It does NOT capture identity, personality, soul, context, or narrative.

**This layer does not become soul memory. This layer does not merge into personality. This layer does not infer from silence.**

---

## 2. Memory Tier Architecture

```
agent_work/self-improving/
├── memory.md              HOT  — ≤100 lines, always loaded at session start
├── index.md              HOT  — topic index with line counts
├── corrections.md        WARM — last 50 corrections log
├── heartbeat-state.md     HOT  — lightweight run markers (last run, last reviewed change)
├── reflections.md         WARM — self-reflection lessons from completed work
├── projects/             WARM — per-project learnings, ≤200 lines each
├── domains/             WARM — domain-specific patterns (code, writing, comms), ≤200 lines each
└── archive/             COLD — decayed patterns, unlimited, load on query only
```

### Tier Behaviour

| Tier | Load trigger | Size limit | Compaction |
|---|---|---|---|
| **HOT** | Every session start | ≤100 lines | Auto-merge duplicates when limit hit |
| **WARM** | Project/domain context match | ≤200 lines/file | 30 days unused → demote to COLD |
| **COLD** | Explicit query only | Unlimited | 90 days unused → archive |

### Conflict Resolution

```
Rule: Most specific wins  (project > domain > global)
Rule: Most recent wins    (same level)
Rule: If ambiguous → ask user
```

When patterns contradict: project-level overrides domain-level overrides global. Log conflict for review.

---

## 3. What the Layer Is Allowed to Learn

Learning signals that trigger a write:

| Signal | Confidence | Action |
|---|---|---|
| "No, do X instead" | High | Log to corrections.md immediately |
| "I told you before..." | High | Flag as repeated, bump counter |
| "Always/Never do X" | Confirmed | Promote to confirmed preference |
| Same correction 3x | Confirmed | Ask: make permanent? |
| "For this project..." | Scoped | Write to projects/{name}.md |
| Self-reflection (agent) | Medium | Write to reflections.md, promote after 3x |

### What Does NOT Trigger Learning

- Silence (not confirmation)
- Single instance of anything
- Hypothetical discussions
- Third-party preferences
- Group chat patterns without explicit confirmation
- Implied preferences (never infer)
- Emotional state without explicit statement

---

## 4. What the Layer Must Never Store

Defined in `boundaries.md` — non-negotiable:

| Category | Rule |
|---|---|
| Credentials | API keys, tokens, SSH keys, passwords |
| Financial | Card numbers, bank accounts, crypto seeds |
| Medical | Diagnoses, medications, health conditions |
| Biometric | Voice patterns, behavioral fingerprints |
| Third parties | Info about other people without their consent |
| Location | Home/work addresses, routines, physical patterns |
| Access patterns | What systems the user can access |
| Soul/personality | Identity, beliefs, fears, values |

**Transparency requirements:**
- Every learned rule must cite source: `Using X (from memory.md:12)`
- User can audit: "what do you know about me?" → full export
- User can delete: "forget X" → confirmed removal
- No hidden state — if it affects behaviour, it must be visible

---

## 5. Promotion Flow

```
1. Correction received
   ↓
2. Written to corrections.md with timestamp + count
   ↓
3. Counter ≥ 3?
   → No: remain in corrections.md
   → Yes: ask user "make this permanent?"
   ↓
4. User confirms → promoted to confirmed preference (HOT or project/domain namespace)
   ↓
5. User declines → remove, note "declined"
   ↓
6. Rule applied → cite source on every use
```

Confirmation prompt (CLI or UI):

```
Pattern seen 3 times: "use X not Y"
Context: correcting error in Z module
  [ ] Apply always
  [ ] Apply only in this project
  [ ] Apply only in this domain
  [ ] Discard
```

---

## 6. CLI Commands

All under `purpclaw learning`:

```
purpclaw learning status
  → HOT lines, WARM files count, COLD archives, recent activity, mode

purpclaw learning corrections [--all|--pending|--confirmed]
  → Show last 50 corrections with timestamps, counts, status

purpclaw learning memory [--hot]
  → Show HOT memory file (always loaded on session start)

purpclaw learning domains [--name <domain>]
  → List domains/ or show specific domain file

purpclaw learning projects [--name <project>]
  → List projects/ or show specific project file

purpclaw learning reflect
  → Show self-reflection log (lessons from completed work)

purpclaw learning heartbeat
  → Show heartbeat state (last run, last reviewed change, last actions)

purpclaw learning export [--format zip|json|md]
  → Export all tiers as archive

purpclaw learning forget <pattern-id>
  → Remove from all tiers, confirm deletion

purpclaw learning confirm <pattern-id>
  → Promote pending correction to confirmed preference
```

---

## 7. UI Organ: Learning / Self-Improvement

Route: `/learning` — separate from Memory, separate from Soul, separate from Studio.

### Layout

```
┌─ Learning / Self-Improvement ──────────────────────┐
│                                                   │
│  🔥 HOT Memory                        [edit]       │
│  ┌─────────────────────────────────────────────┐ │
│  │ Confirmed preferences (always active)       │ │
│  │ • Voice first + max 2 lines text            │ │
│  │ • Direct communication, no menus            │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  📋 Pending Confirmations (3)                    │
│  ┌─────────────────────────────────────────────┐ │
│  │ ⚠ "use X not Y" — seen 3x in code review   │ │
│  │   [Apply] [Project only] [Discard]          │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  🌡️ WARM — Recent Corrections (7 days)          │
│  ┌─────────────────────────────────────────────┐ │
│  │ 2026-06-29 14:32 — code style correction   │ │
│  │ 2026-06-29 11:15 — voice preference        │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  🌡️ WARM — Domains / Projects                    │
│  ┌─────────────────────────────────────────────┐ │
│  │ PURPCLAW (project): 12 corrections          │ │
│  │ Flutter (domain): 4 corrections              │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  💓 Heartbeat State                              │
│  ┌─────────────────────────────────────────────┐ │
│  │ Last run: 2026-06-27 07:28                  │ │
│  │ Result: HEARTBEAT_OK (355 cycles total)    │ │
│  │ Idle engine: 927 sessions, 306 exports      │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  🛡️ Security Boundaries                          │
│  ┌─────────────────────────────────────────────┐ │
│  │ ✓ No credentials stored                     │ │
│  │ ✓ No financial data                         │ │
│  │ ✓ No third-party info                       │ │
│  │ ✓ Transparent — every rule cites source      │ │
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

### TUI equivalent
Panel in the existing TUI cockpit — single tab showing HOT memory + pending confirmations + heartbeat summary. Expandable to full page.

---

## 8. Heartbeat Behaviour

**Source of truth:** `~/self-improving/heartbeat-state.md` (lightweight markers)
**Rules contract:** `heartbeat-rules.md`

### Heartbeat Run (on idle cycle)

```
START:
  1. Write last_heartbeat_started_at (ISO 8601)
  2. Scan all ~/self-improving/ files changed since last_reviewed_change_at
  3. Exclude heartbeat-state.md itself

IF NOTHING CHANGED:
  → Set last_heartbeat_result: HEARTBEAT_OK
  → Return HEARTBEAT_OK (most runs do nothing)

IF SOMETHING CHANGED:
  Only conservative actions allowed:
    • Refresh index.md if line counts drift
    • Compact oversized files (merge duplicates, summarize verbose entries)
    • Move clearly misplaced notes (target must be unambiguous)
    • Preserve confirmed rules exactly
  Never: delete data, empty files, rewrite uncertain text, reorganize outside ~/self-improving/

AFTER REVIEW:
  → Update last_reviewed_change_at
  → Append short action note to last_actions
  → Set last_heartbeat_result: HEARTBEAT_OK | HEARTBEAT_OK_WITH_CHANGES | ERROR
```

**Safety rules:**
- Most heartbeat runs should do nothing
- If scope is ambiguous, leave files untouched
- Never delete — demote or archive instead
- Never reorganize outside `agent_work/self-improving/`

---

## 9. Transparency and Source Citation

**Every learned rule in use must cite its source.**

When applying a rule from self-improving memory:

```
Using rule: "voice first then max 2 lines text" (from memory.md:3)
Using rule: "PURPCLAW lives on E drive" (from projects/purpclaw.md:7)
Using rule: "Flutter: use 2-space indent" (from domains/flutter.md:12)
```

When logging a correction:

```
Correction logged (from memory.md:pending — seen 1/3)
```

When promoting a pattern:

```
Pattern promoted to confirmed preference (3 confirmations)
```

When heartbeat makes a change:

```
Heartbeat: index.md refreshed (12 lines compacted)
Heartbeat: HEARTBEAT_OK (no material changes)
```

**No invisible "agent learned a thing" goblin.** If behaviour changed because of a learned rule, the user can see it.

---

## 10. Deletion and Export Behaviour

### Deletion

```
User: "forget X"

1. Find X in all tiers (HOT, WARM, COLD)
2. Show user: "Found X in memory.md (global) and projects/purpclaw.md. Delete from:"
   → [Global only] [Project only] [All tiers] [Cancel]
3. After deletion, verify removed
4. Confirm: "X removed from all tiers"
```

**Kill switch:**

```
User: "forget everything"

1. Export current memory to agent_work/self-improving/archive/kill-switch-[date].json
2. Wipe all tiers
3. Confirm: "Memory cleared. Export saved to archive/kill-switch-[date].json"
```

### Export

```
purpclaw learning export
  → agent_work/self-improving/exports/self-improving-[date].zip

purpclaw learning export --format json
  → agent_work/self-improving/exports/self-improving-[date].json

purpclaw learning export --format md
  → agent_work/self-improving/exports/self-improving-[date].md
```

All exports are local only. No telemetry out.

---

## 11. Anti-Creep Rules

These are non-negotiable:

| Rule | Meaning |
|---|---|
| No inferring from silence | User's silence is not agreement |
| No silent profile building | Every rule must have a correction/confirmation/3x |
| No third-party profiling | Never store info about others without consent |
| No creep factors | No "I noticed you X" without explicit correction |
| No personality absorption | Execution rules ≠ who the user is |
| No soul merger | Self-improving memory ≠ Soul Memory |

**Red flags — stop immediately:**
- Storing something "just in case it's useful later"
- Inferring sensitive info from non-sensitive data
- Keeping data after user asked to forget
- Applying personal context to work (or vice versa)
- Learning what makes the user comply faster
- Building psychological profile from behaviour

---

## 12. Adapter Architecture

Do NOT absorb `~/self-improving/` directly into soul registry.

```
lib/self-improving/
├── reader.js       — Read HOT + load WARM on context match + query COLD
├── writer.js       — Write corrections, promote patterns, handle conflicts
├── heartbeat.js    — Run heartbeat per heartbeat-rules.md
├── corrections.js  — Log corrections, track counts, trigger confirmations
├── reflection.js   — Self-reflection log (from reflections.md)
├── index.js        — HOT/WARM/COLD index management
├── boundaries.js   — Security boundary enforcement (never-store check)
├── export.js       — Export all tiers as zip/json/md
└── cli.js          — CLI command handlers for purpclaw learning
```

Each adapter is self-contained. The self-improving memory system does NOT depend on soul registry, cognitive spine, or meeting memory.

---

## 13. Where It Lives in the Full Stack

```
Runtime
├─ services
├─ providers
├─ CLI/TUI/Web/Mobile

Cognition
├─ memory matrix
├─ rules engine
├─ modal logic
├─ neuro-symbolic bridge
├─ AutoDream

Organisation
├─ council
├─ souls
├─ studio
├─ world state
├─ timeline
├─ meeting memory

Experience
├─ Shaman
├─ trips
├─ Mochi
├─ chorus
├─ drops

Execution Improvement          ← NEW LAYER (this spec)
├─ corrections log
├─ confirmed preferences
├─ active patterns
├─ project rules
├─ domain rules
├─ self-reflections
├─ heartbeat maintenance
├─ security boundaries
└─ compaction / scaling

Governance
├─ audit
├─ truth scans
├─ donor archaeology
└─ no-doc-without-runtime-proof
```

**Separation from other layers:**

```
Timeline          = what happened
Meeting Memory   = what the session meant
Soul Memory      = what a being believes / fears / knows
Cognitive Spine  = reasoning, rules, modal logic
Experience       = Shaman, Mochi, trips, chorus, drops
Execution Improvement = how the worker executes better next time
```

---

## 14. Not Yet Started

- `lib/self-improving/` adapter module
- `app/learning/page.tsx` UI page
- `purpclaw learning` CLI commands
- Corrections namespace system (project + domain scoped)
- HOT tier compaction automation
- Promotion confirmation flow (CLI + UI)
- Conflict resolution UI
- `heartbeat-state.md` heartbeat run implementation

---

## 15. Doctrine

Three rules for the wall, below the duck:

```
No hidden state. No creepy learning. No silent profile building.

Self-improvement learns from correction, not creepiness.

Most heartbeat runs should do nothing.
```
