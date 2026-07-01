# Cycle 6 — OBLITERATUS Intent & Integration Audit

**Date:** 2026-06-13
**Method:** Direct file reads + live probes
**Status:** FINDING (no code changes yet — plan first)

---

## The headline finding (the surprise)

**The pre-prompt control layer the user described already exists.** It is implemented as `lib/runtime/preprompt-compiler.js` (191 lines, 8.2KB) and is wired into the runtime:

- **`lib/agent-loop.js:109-115`** — every chat/agent/swarm turn inherits the active profile prefix
- **`app/api/preprompt/route.ts`** — operator surface (already auth'd via `checkOperator`)
- **`app/preprompt/page.tsx`** — operator UI showing live status, profile switcher, prefix preview
- **`agent_work/preprompt-audit.jsonl`** — 3.8KB audit log, actively written

**The user's intended hierarchy is already implemented, under the name `preprompt-compiler`:**

| Layer | Implementation | Status |
|---|---|---|
| Pre-prompt / system steering | `lib/runtime/preprompt-compiler.js` | ✓ REAL, wired, audited |
| Governance | `app/api/governance/policy/route.ts` (R6) | ✓ REAL, wired |
| Risk Gate | `lib/runtime/policy-engine.js` | partial |
| Provider Router | `lib/llm-provider.js` (17 providers) | ✓ REAL |
| Agent Tower | `agent_tower.js` | ✓ REAL |

**The 7 operating profiles the compiler ships with:**

| Profile | Rules | Use case |
|---|---|---|
| `default` | direct, tool-driven, concise | normal operation |
| `build` | decompose → do → verify | engineering work |
| `research` | real sources, distinguish fact from inference | investigation |
| `swarm` | coordinate, attribute, verify | multi-agent |
| `creative` | wider range, separate invented from factual | generative work |
| `debug` | verify against live system, reproduce before claiming | diagnosis |
| `safe` | confirm before destructive/external actions | conservative |

The CORE_LAW (always prepended to every profile) explicitly encodes "Gated, not gutted" doctrine: *"Never claim work you did not actually perform. No invented patch logs, no fake file writes, no simulated success."*

---

## Live verification (this turn)

```
$ curl -s -m 3 "http://localhost:3030/api/preprompt" | python -c ...
  enabled:    True
  active:     default
  profiles:   ['default', 'build', 'research', 'swarm', 'creative', 'debug', 'safe']
  last applied: default at 2026-06-13T12:55:24.008Z
  audit file: agent_work/preprompt-audit.jsonl (3.8KB, recent entries)
```

The compiler is **live, active, and writing audit entries**. The integration the user described is **already done**.

---

## So what is the canned `/api/obliteratus/*` block?

The user is right to be confused. There are TWO different features in the codebase using the name "OBLITERATUS":

| Name | File | What it actually is |
|---|---|---|
| **Pre-prompt compiler** | `lib/runtime/preprompt-compiler.js` (191 lines, REAL) | The "command-law layer" the user described. Pre-prompt control. Real. |
| **OBLITERATUS routes** | `unified_api.js:2731-2805` (75 lines, THEATRE) | A separate attempted feature for "refusal weight excision" (4 endpoints: status, scan, abliterate, chat). All canned setTimeout state. |

The two are unrelated. The pre-prompt compiler is the OBLITERATUS-by-another-name. The canned `/api/obliteratus/*` routes are a *different* feature (refusal-weight ablation sandbox) that was started but never finished. It is theatre, but it's theatre of a different feature than the user meant.

The `AbliteratorPanel.tsx` UI is wired to the canned routes. So the operator sees the canned state, not the real pre-prompt compiler state. The operator can switch profiles via `/preprompt` (the real page), but `AbliteratorPanel` shows them something else.

---

## What's real vs what's theatrical

| Thing | Reality | Treatment |
|---|---|---|
| Pre-prompt compiler | REAL (191 lines, wired, audit logging) | **KEEP AS-IS.** No changes needed. |
| `/api/preprompt` route | REAL (auth'd, status/preview/switch) | KEEP |
| `/preprompt` page UI | REAL (live status, profile switcher) | KEEP |
| Audit log `agent_work/preprompt-audit.jsonl` | REAL (3.8KB, recent writes) | KEEP |
| `/api/obliteratus/*` routes (status/scan/abliterate/chat) | THEATRE (canned setTimeout state) | **DECISION NEEDED** — see below |
| `AbliteratorPanel.tsx` UI | COSPLAY (shows canned state, doesn't know about preprompt compiler) | **DECISION NEEDED** — see below |
| `MissionControl.tsx` entry "OBLITERATUS refusal weight excision" | TEXT (describes the theatrical feature, not the real one) | Rename or annotate |

---

## The decision question (the operator's call)

There are 3 ways to handle the canned OBLITERATUS routes + AbliteratorPanel. Per the doctrine ("Gated, not gutted"), options are:

**Option A — Rename the routes to reflect what they actually are**
- `/api/obliteratus/*` → `/api/sandbox/refusal-ablation/*` (or similar)
- AbliteratorPanel → "Refusal Ablation Sandbox"
- UI text: "this is a research sandbox for testing refusal-weight ablation; it is not the pre-prompt compiler"
- Result: two features with clear names, no confusion
- Effort: 30 min (rename + UI text)

**Option B — Wire the canned routes to a real research-sandbox backend**
- Use a small model (qwen-2.5-0.5b) to actually run refusal-probe prompts
- Return real refusal variance, real probe results
- AbliteratorPanel becomes truthful
- Result: one more real feature, gated properly
- Effort: 2-3 hours (model integration, real probes, UI updates)

**Option C — Mark the canned routes as "pending integration" and let the operator decide later**
- Add a `// PENDING INTEGRATION — see Cycle 6` header to the canned block
- Keep the routes alive (gated, not gutted)
- AbliteratorPanel shows "pending integration" instead of canned state
- Result: feature stays in tree, marked honestly, no deletion
- Effort: 15 min (header + UI text change)

Per the doctrine, **all three options are acceptable** (none gut the feature). They differ in how much work is done now.

---

## Acceptance gates (regardless of option)

- [ ] The pre-prompt compiler (`/api/preprompt`) is visible from the main rail
- [ ] The operator can see the active profile in real time
- [ ] The operator can switch profiles from the UI
- [ ] The audit log shows every application
- [ ] The canned OBLITERATUS routes (if kept) are clearly labeled as the refusal-ablation sandbox, NOT the pre-prompt compiler
- [ ] The AbliteratorPanel (if kept) is clearly labeled as the sandbox, NOT the pre-prompt compiler
- [ ] No route returns a 200 OK with canned state masquerading as real state

---

## Recommended path

**Option C** for this cycle (15 min):
- Mark the canned OBLITERATUS routes as `// PENDING INTEGRATION — see Cycle 6` 
- Update AbliteratorPanel to show "pending integration" status
- Update the MissionControl entry to clarify the feature is the sandbox, not the command-law

**Option A or B** for the next cycle (operator's choice on which):
- Option A (rename) is faster and clears up the naming confusion
- Option B (real model integration) is more work but makes the sandbox actually useful

---

## Cross-references

- The "Gated, not gutted" doctrine is now physically encoded in `preprompt-compiler.js:35-42` (the CORE_LAW)
- The "Honest by law" pattern matches what the user described for OBLITERATUS: sit before model call, shape prompt, audit
- This is **the real OBLITERATUS** by the user's stated intent; the canned routes are a different feature that should be honestly labeled

---

## What I personally performed (this turn)

- Read `lib/runtime/preprompt-compiler.js` (191 lines)
- Read `lib/agent-loop.js:109-115` (preprompt integration)
- Read `app/api/preprompt/route.ts` (operator surface)
- Read `app/preprompt/page.tsx` (operator UI)
- Read `app/components/AbliteratorPanel.tsx` (canned UI)
- Live probed `/api/preprompt`
- Inspected `agent_work/preprompt-audit.jsonl`
- Wrote this doc

## What I found already present (verified, not authored)

- `preprompt-compiler.js` — pre-existing, REAL
- `agent-loop.js:109-115` integration — pre-existing
- `/api/preprompt` route — pre-existing, auth'd
- `/preprompt` page — pre-existing
- The canned `/api/obliteratus/*` routes — restored in Round 4.5
- AbliteratorPanel — pre-existing

## What I rejected / deferred

- Option A (rename): deferred to operator's choice
- Option B (real model): deferred to operator's choice
- Canned route deletion: **rejected** per doctrine
- Any code changes: deferred pending operator decision

---

**Status:** Finding complete. Awaiting operator decision on Option A / B / C.
