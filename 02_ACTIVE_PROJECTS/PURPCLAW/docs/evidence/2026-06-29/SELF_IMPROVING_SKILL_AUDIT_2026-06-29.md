# Self-Improving Skill — PURPCLAW Integration Audit
**Date:** 2026-06-29
**Classification:** `ACTIVE_EVIDENCE / SELF_IMPROVING_LAYER`
**Source:** Self-Improving + Proactive Agent v1.2.16 skill files
**Comparison:** PURPCLAW live runtime (idle engine state, training buffer, smith-neo ledger)

---

## What the Skill Is

A tiered memory + learning system for agents:

```
~/self-improving/
├── memory.md          HOT: ≤100 lines, always loaded
├── index.md          Topic index
├── heartbeat-state.md Heartbeat markers
├── corrections.md    Last 50 corrections log
├── projects/         Per-project learnings
├── domains/          Domain-specific patterns
└── archive/         COLD: decayed patterns
```

Plus: learning mechanics, security boundaries, heartbeat rules, self-reflection log, scaling rules.

---

## What PURPCLAW Already Has

### ✅ Already Built — 7 of 8 components

| Skill Layer | PURPCLAW Equivalent | Status | Evidence |
|---|---|---|---|
| **HOT memory** | Memory ledger (various) | Partial | No unified HOT file |
| **Training buffer** | `lib/user-feedback.js` + `E:/training/user-feedback/` | **REAL** | 2026-06-09 to 2026-06-13 data files |
| **Corrections log** | `lib/user-feedback.js` (type: 'correction') | **REAL** | Captured in feedback records |
| **Heartbeat / maintenance** | `lib/idle-engine.js` | **REAL, ACTIVE** | 355 cycles, 927 sessions, 306 exports |
| **Reliability / ratchet** | `agent_work/smith-neo-ledger.json` (4329 lines) | **REAL** | Smith-Neo adversarial system |
| **Self-evaluation** | `agent_work/self-eval.json` + `harness_lessons.jsonl` (494 lines) | **REAL** | Per-mission lessons |
| **Pattern library** | `agent_work/harness_lessons.jsonl` | **REAL** | Domain + agent + success tracking |
| **Scaling / compaction** | Training export pipeline (`E:/training/`) | **REAL** | chatml/sharegpt/jsonl exports |

### ⚠️ Partially Built — needs doctrine layer

| Skill Layer | PURPCLAW State | Gap |
|---|---|---|
| **Security boundaries** | `SOUL.md` has safety rules, `boundaries.md` in skills | Not enforced in self-improving layer |
| **Self-reflection log** | `harness_lessons.jsonl` (lessons from missions) | Not surfaced as agent self-reflection |
| **Namespace isolation** | No per-project/per-domain correction namespaces | Flat correction structure |
| **Conflict resolution** | No explicit project > domain > global override system | Corrections applied flat |
| **Compaction** | Training buffer rotates by day | No HOT tier compaction rules |

### ❌ Not Built — new components

| Skill Layer | Notes |
|---|---|
| **HOT memory file** (`~/self-improving/memory.md`) | No unified HOT memory file for execution rules |
| **Corrections UI** | No UI showing correction history, promotions, confirmations |
| **Memory stats CLI** | No `purpclaw learning status` equivalent |
| **Heartbeat state UI** | Can't see idle engine status at a glance |
| **Deletion verification** | No "forget X" equivalent in CLI |
| **Conflict resolution UI** | No way to see/resolve pattern conflicts |

---

## Live Evidence — Idle Engine (ACTIVE)

```json
// agent_work/.idle_engine_state.json (as of 2026-06-27)
{
  "active": false,
  "lastActivityAt": "2026-06-27T07:23:29.896Z",
  "sessionCount": 927,
  "idleCycles": 355,
  "currentPhase": "idle",
  "lastIdleRun": "2026-06-27T07:28:29.899Z",
  "totalCorrectionsProcessed": 3,
  "totalDatasetsExported": 306,
  "totalTrainingRunsQueued": 193,
  "architectActions": 301,
  "goblinActions": 5,
  "goblinContained": 5,
  "goblinEscaped": 0
}
```

**This is not a spec. This is a running system.** 355 idle cycles, 306 dataset exports, 193 training runs queued, 5 goblin actions contained. Last ran 2026-06-27.

### Idle Engine Phases (lib/idle-engine.js)

```
Phase 1/6: Export personal dataset       ✅ (lib/user-feedback.js)
Phase 1.5/6: Anti-Goblin Gate Pipeline  ✅ (lib/gate-pipeline.js)
Phase 2/6: [memory consolidation]        ? (AutoDream)
Phase 3/6: [queue LoRA training]         ? (E:/training/train.py)
Phase 4/6: [system diagnostics]          ? (harness)
Phase 5/6: [self-optimize adapters]      ? (merge adapters)
Phase 6/6: [idle cleanup]               ✅ (heartbeat rules)
```

---

## Live Evidence — Training Buffer (ACTIVE)

```
E:/training/user-feedback/
├── 2026-06-09.ndjson
├── 2026-06-10.ndjson
├── 2026-06-11.ndjson
├── 2026-06-12.ndjson
└── 2026-06-13.ndjson

Capture schema (lib/user-feedback.js):
  - prompt       (every user message)
  - tool_call    (every tool invocation)
  - tool_result  (every tool result)
  - correction   (user rejects output)
  - edit         (user changes agent output)
  - preference   (repeated patterns, style)
  - workflow     (multi-step sequences)
```

**Every interaction captured locally. Zero telemetry out.**

---

## Live Evidence — Smith-Neo Adversarial (ACTIVE)

```
agent_work/smith-neo-ledger.json: 4329 lines
agent_work/reliability-ledger.json: 1309 lines
```

Smith = chaos injector. Neo = stabilizer. Every attack, every defense, every escape, every containment logged. This is the reliability ratchet.

```
Campaign types: output attacks, injection attempts, prompt stealing
Attacks logged: technique, severity, timestamp, target, result, corrupted output
Reliability: campaigns tracked with duration, results, escaped count
```

---

## What the Skill Adds — Doctrine Layer

PURPCLAW has the **infrastructure**. The skill adds the **doctrine**:

### 1. Security Boundaries (must never store)

| Category | Rule |
|---|---|
| Credentials | Never — API keys, tokens, SSH keys |
| Financial | Never — card numbers, bank accounts, crypto seeds |
| Medical | Never — diagnoses, medications |
| Biometric | Never — voice patterns, behavioral fingerprints |
| Third parties | Never — info about other people without consent |
| Location | Never — home/work addresses, routines |
| Access patterns | Never — what systems user has access to |

PURPCLAW already follows this (SOUL.md has `privacy-hard-rules`). The skill makes it **explicit and visible** as a boundaries doc.

### 2. Learning Signal Classification

| Signal | Action |
|---|---|
| "No, do X instead" | Log correction immediately |
| "I told you before..." | Flag as repeated, bump counter |
| "Always/Never do X" | Promote to preference |
| Same correction 3x | Ask: make permanent? |
| "For this project..." | Write to project namespace |

**Current gap:** PURPCLAW captures corrections (3 total per idle state) but doesn't classify them by type or trigger promotion flows.

### 3. Tiered Memory Mechanics

```
HOT (memory.md):       ≤100 lines, always loaded
  → Confirmed preferences, active patterns
  → Compacts automatically at limit

WARM (projects/, domains/): ≤200 lines each
  → Domain-specific rules, project overrides
  → Load on context match

COLD (archive/):      Unlimited
  → Decayed patterns, archived lessons
  → Load on explicit query only
```

**Current gap:** No HOT file, no compaction rules, no tier promotion/demotion.

### 4. Heartbeat Safety Rails

```
Rule: Most heartbeat runs should do nothing
Rule: Never delete data during heartbeat
Rule: Never reorganize outside ~/self-improving/
Rule: Prefer append/summarize over large rewrites
Rule: If scope is ambiguous, leave files untouched
```

**Current gap:** Idle engine has 355 cycles but no visible heartbeat state UI or heartbeat rules doc.

### 5. Conflict Resolution

```
Rule: Most specific wins (project > domain > global)
Rule: Most recent wins (same level)
Rule: If ambiguous → ask user
```

**Current gap:** No conflict detection or resolution system.

---

## The Doctrine That Fits PURPCLAW

From the skill's SKILL.md, three rules that should go on the wall:

```
No hidden state. No creepy learning. No silent profile building.

Self-improvement learns from correction, not from creepiness.

Most heartbeat runs should do nothing.
```

These complement the existing PURPCLAW doctrine:

```
Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed.
No deletion by confusion. No stubs as repairs. No feature amputation.
No synthetic evidence. No raw secrets in docs or patches.
```

---

## What to Build

### Quick wins (existing infrastructure + doctrine)

| # | What | Where | Effort |
|---|---|---|---|
| 1 | `purpclaw learning status` CLI | `lib/commands/learning.js` | 30 min |
| 2 | Self-improving HOT memory file | `agent_work/self-improving/memory.md` | 5 min |
| 3 | Idle engine status in CLI | extend `lib/commands/idle.js` or `purpclaw status` | 15 min |
| 4 | Corrections log UI page | `app/learning/page.tsx` | 1 hr |

### Medium effort

| # | What | Notes |
|---|---|---|
| 5 | Corrections namespace system | Project + domain scoped corrections |
| 6 | HOT tier compaction rules | Max 100 lines, auto-merge duplicates |
| 7 | Promotion flow | 3x correction → ask to make permanent |
| 8 | Conflict resolution | Project > domain > global override system |

### Not needed (already exists)

| Skill feature | PURPCLAW already has |
|---|---|
| Training buffer | `lib/user-feedback.js` + `E:/training/` |
| Heartbeat | `lib/idle-engine.js` (355 cycles!) |
| Reliability ledger | `agent_work/smith-neo-ledger.json` |
| Self-eval | `agent_work/harness_lessons.jsonl` |
| Security boundaries | `SOUL.md` privacy rules |
| Scaling | Training export pipeline |

---

## Corrected Architecture Map

```
PURPCLAW Memory System (what exists)
├── Timeline (session history)         ✅ session_store.js
├── Meeting Memory                     ✅ registry/meeting-memories.json
├── Soul Memory (agent knowledge)      ✅ souls.json + cognitive spine
├── Training Buffer (corrections)      ✅ lib/user-feedback.js + E:/training/
├── Idle Engine (heartbeat)            ✅ lib/idle-engine.js — 355 cycles
├── Smith-Neo (reliability ratchet)    ✅ smith-neo-ledger.json — 4329 lines
└── Harness Lessons (pattern library)  ✅ harness_lessons.jsonl — 494 entries

NEW — Execution Improvement Layer (skill doctrine)
├── HOT memory (memory.md)             ❌ missing — build
├── Corrections log (namespace)        ⚠️ partial — enhance
├── Self-reflection log                ⚠️ partial — harness_lessons exists
├── Learning CLI (`purpclaw learning`)  ❌ missing — build
├── Learning UI page                   ❌ missing — build
└── Heartbeat state UI                 ❌ missing — enhance idle engine CLI
```

---

## Bottom Line

```
The skill provides the DOCTRINE + UI.
PURPCLAW already has the INFRASTRUCTURE.

355 idle cycles. 306 datasets exported. 4329 smith-neo entries.
That's not a spec. That's a running system.

What's missing is:
1. The HOT memory file (execution rules, always loaded)
2. The corrections namespace system (project + domain scoped)
3. The CLI (`purpclaw learning status/corrections/patterns)
4. The UI page (visible corrections log, promotion flow)
5. The heartbeat state visibility (can't see idle engine status)

Build those 5 things and PURPCLAW has the full self-improving stack.
```

---

**Do not call it "Memory."**
Call it **Execution Improvement Layer**.
Memory is what happened. Improvement is what changed.
