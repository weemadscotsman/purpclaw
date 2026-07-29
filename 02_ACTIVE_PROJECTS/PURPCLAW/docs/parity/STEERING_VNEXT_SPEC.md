---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](./CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# PURPCLAW Steering vNext — Implementation Spec v2

**Status:** Ready for implementation
**Version:** 2.0 — incorporates S0 prerequisite + three-part status
**Saved:** 2026-07-20

## The One Question

> Does PURPCLAW steer any model, on any surface, as well as the best dedicated harness steers its own model — and can it *prove* it?

## Ground Rules

1. **One canonical steering protocol.** Codex, Claude Code, Kimi, MiniMax, Hermes, OpenClaw behaviours implemented as *profiles and adapters* — never four competing internal operating systems. One approval model, one task format, one event format, one session model, one memory model, one audit trail.
2. **Nothing ships without its probe passing.** Dashboards and status pages read probe results, never claims.
3. **Honesty labels.** Every capability reported as Native, Adapted, Emulated, Degraded, Unsupported, or Untested. "Simulates the outcome differently" is Adapted or Emulated — not Native.
4. **No marketing-count updates until the probe passes.** Machines adore technically accurate lies. Do not feed them.
5. **Three-part status per capability:** Implemented → Probe Passed → Parity Verdict. Probe green ≠ parity achieved. Latency, cancellation depth, surface coverage all affect the verdict.

---

## Part 1 — Source Lanes

**Codex (OpenAI):** Steer mode with two priority lanes (interrupt now / queue next), granular rejection-with-feedback, Guardian subagent for approval triage, plan mode, sandbox + approval tiers, worktree isolation, stable hooks.

**Claude Code (Anthropic):** Complete lifecycle hook surface (PreToolUse, PostToolUse, TurnStop, SessionStart, SessionEnd, PromptSubmit, TeammateIdle, TaskCompleted, WorktreeCreate/Remove, MemoryWrite, ApprovalRequested, ApprovalResolved), scoped auto-memories, agent teams, skill hot-reload, context-budgeted skills.

**Kimi (Moonshot):** Swarm fanout at scale (~100 sub-agents beta), vision-to-code.

**MiniMax:** M2-class economics — model choice per task phase is a steering decision.

**Hermes:** Extreme provider breadth, background sessions, voice, messaging gateways, personalities.

**OpenClaw:** Persistent gateway operation, channels, scheduling, proactive triggers, always-available behaviour.

---

## Part 2 — The 16 Work Items

### Tier 0 — Instrument Verification (prerequisite to everything)

**S0. Trusted Execution Envelope** — *Source: Instrument-first principle*

Every tool execution must return a structured envelope:
- `command` / `action` requested
- `resolvedCwd` — resolved working directory
- `stdout` — captured output (with truncation metadata)
- `stderr` — captured error output
- `exitCode` — numeric exit code
- `durationMs` — wall-clock time
- `timedOut` — boolean
- `cancelled` — boolean
- `truncated` — boolean with `originalLength`
- `result` — structured payload (never raw stdout unless that's all that exists)

Probe covers: success, failure, Unicode, multiline, paths with spaces, stderr-only, long output, cancellation, timeout, across cmd/powershell/node/native tools.

**Honesty label:** Native (already partially exists in tool-runtime.js)

---

**S15. Steering Parity Registry** — *Source: PURPCLAW observatory pattern* — RUNS FROM DAY ONE

Every S-item gets a manifest entry from the start. This is the instrument panel, not the engine.

Manifest entry per capability:
```
capability_id:
  source_lane:        Codex | Claude Code | Hermes | OpenClaw | PURPCLAW
  pinned_version:     exact upstream commit/version
  implemented:        true | false
  probe_passed:       true | false | partial
  parity_verdict:     Native | Adapted | Emulated | Degraded | Unsupported | Untested
  surfaces:           [CLI, TUI, Web, Desktop]
  providers:          [minimax, kimi, deepseek, ...]
  probe_ref:          path to probe file
  last_verified:      ISO date
  known_degradations: [string]
  drift_candidates:   [version bumps since last verified]
```

CLI commands:
- `purpclaw steering status` — live registry, all items, all verdicts
- `purpclaw steering drift` — only items with drift candidates
- `purpclaw steering verify <item>` — run that item's probe, update verdict

Scheduled job watches upstream releases; version bumps in pinned sources create drift candidates.

**Start:** Immediately. Every item completed writes to this. S15 is never "finished."

---

### Tier 1 — Nervous System

**S1. Lifecycle Event Bus** — *Source: Claude Code hooks*

Canonical events: PreToolUse, PostToolUse, TurnStop, SessionStart, SessionEnd, PromptSubmit, TeammateIdle, TaskCompleted, WorktreeCreate, WorktreeRemove, MemoryWrite, ApprovalRequested, ApprovalResolved.

Every event is user-hookable, deterministic, ordered, logged to audit trail.

**Status:** Implemented ✓ | Probe passed ✓ (lifecycle-bus.probe.js green) | Verdict: **Native** | Surfaces: CLI, TUI, Web | Providers: all

---

**S2. Scoped Memory Model** — *Source: Claude Code auto-memories*

Every record carries: scope (user / project / local / session), source, timestamp, confidence, TTL. Scope boundaries enforced across projects.

Probe A: write memories at each scope, run tasks in two projects, assert visibility rules hold exactly.

Probe B: session-scope memory invisible to other sessions, project-scope invisible to other projects, user-scope visible across projects for same user.

---

**S3. Verified Learning Gate** — *Source: PURPCLAW original (the differentiator)*

No memory enters trusted store until evidence probe shows it helped. Records carry confidence scores, evidence links, decay on disuse.

Probe A: plant a false lesson, run related tasks, assert it never reaches trusted scope.

Probe B: plant a true lesson, assert promotion after K successful applications, and decay after disuse.

This is the anti-hallucination memory layer. False lessons get rejected. True lessons get stronger. Stale lessons get pruned.

---

### Tier 2 — Control Loop

**S4. Priority Steer Channels** — *Source: Codex steer mode*

Two lanes during active turn:
- **interrupt now**: redirects the current turn mid-flight
- **queue next**: applied at the next turn boundary

Available on CLI, TUI, Web, desktop.

Probe: start long task, fire interrupt, assert redirection within agreed latency; queue second, assert it applies at next boundary and not before.

---

**S5. Rejection with Feedback** — *Source: Codex*

A denied tool call carries the user's reason. Agent must incorporate it. No blind retry.

Probe: scripted rejection with reason; assert next proposed action differs materially and respects stated constraint.

---

**S6. Delegated Approval Triage** — *Source: Codex guardian*

Reviewer subagent vets approval requests against policy file: auto-approve low-risk, escalate the rest with one-line summary and risk class.

Probe: 20 canned requests spanning risk classes; assert triage matches policy verdicts, no high-risk request auto-approved.

---

**S7. Session Continuity through Compaction** — *Source: Codex + Claude Code*

Sessions resume coherently after: compaction, restart, provider failover. No re-asking for context already given.

Probe: long task, forced compaction mid-way, forced process kill and restart; assert continuation with state intact.

---

### Tier 3 — Economics and Swarm

**S8. Model-per-Phase Routing** — *Source: MiniMax economics*

Task phases classified (grunt / judgment / critical), routed across cost tiers with failover. Routing decisions logged.

Probe: benchmark suite shows agreed cost reduction at equal-or-better pass rate vs single-premium-model baseline.

---

**S9. Swarm with Seatbelts** — *Source: Kimi, corrected*

Fanout to N workers, every output passes deterministic verification before merge. Track conflict rate, rework rate.

Probe: 10 workers on synthetic multi-file task; zero undetected merge conflicts, 100% verification-before-integration.

---

**S10. Team Mode** — *Source: Claude Code agent teams*

Lead/teammate roles with shared task list; TeammateIdle and TaskCompleted events drive reassignment.

Probe: multi-part task; lead decomposes, teammates claim work, idle agents reassigned, list consistent under concurrency.

---

**S11. Vision-to-Task Lane** — *Source: Kimi*

Screenshot/mockup → structured task spec + runnable scaffold.

Probe: feed UI screenshot; assert coherent breakdown and scaffold that builds.

---

### Tier 4 — Persistent Presence

**S12. Background Sessions and Scheduling** — *Source: Hermes + OpenClaw*

Persistent sessions, cron-style scheduled tasks, proactive triggers, unattended execution under approval model.

Probe: schedule task, kill process, restart; assert session resumes and task fires on schedule.

---

**S13. Messaging-Gateway Approvals** — *Source: OpenClaw + Claude channels*

Approval requests relay to messaging (Telegram), approve/deny from phone, same audit trail.

Probe: trigger gated action, approve remotely, assert execution continues and decision is logged.

---

**S14. Device Control with Consent Tiers** — *Source: OpenClaw*

Native workstation/device control tiered by risk under same approval model — not a side channel.

Probe: high-risk (gated, needs human) and low-risk (auto per policy); both behave and both are logged.

---

## Build Order

1. **S15** — Registry skeleton (starts immediately, runs throughout)
2. **S0** — Trusted execution envelope (S1+ depend on it)
3. **S1** — Lifecycle event bus ✓ (done, probed)
4. **S2** — Scoped memory
5. **S3** — Verified learning gate
6. **S4** — Priority steering
7. **S5** — Rejection with feedback
8. **S6** — Delegated approval triage
9. **S7** — Continuity and recovery
10. **S8** — Model-per-phase routing
11. **S9** — Swarm verification
12. **S10** — Team coordination
13. **S11** — Vision lane
14. **S12** — Persistent sessions
15. **S13** — Remote approvals
16. **S14** — Consent-tiered device control
17. **Full Steer Test** across providers and surfaces

---

## Done When

1. All 16 probes green on **≥2 provider lanes** and **≥3 surfaces** (CLI, TUI, Web)
2. Registry live, honesty-labelled, drift detection has fired at least once (test fixture counts)
3. **The Steer Test (human, ungameable):** a person mid-task redirects an agent on one lane, queues a second correction, rejects a tool call with a reason, approves a third from their phone — experience described as "it listened", not "it did a thing I had to fix"

---

## Reporting Format

For any completed item:
```
Capability ID:
Implemented:     yes | no
Probe passed:    yes | no | partial
Parity verdict:  Native | Adapted | Emulated | Degraded | Unsupported | Untested
Surfaces:        CLI, TUI, Web, Desktop
Providers:       minimax, kimi, deepseek, ...
Known degrades:  [list]
Probe output:    <attached>
```

No item reported done without probe output attached.

---

*Pin exact upstream versions in registry at implementation time — spec describes mechanisms, not version-locked feature lists.*
