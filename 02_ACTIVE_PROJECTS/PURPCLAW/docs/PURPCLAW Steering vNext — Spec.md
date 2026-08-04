# PURPCLAW Steering vNext — Implementation Spec

**Status:** Ready for implementation
**Audience:** Any agent picking up a work item (each item is self-contained and probe-gated)
**Context:** PURPCLAW core is ~99% built — CLI, TUI, Web UI, desktop, multi-provider routing, tool registry, skills, native workstation control. This milestone is not new surface area. It is the **steering layer**: memory, control loop, learning, and harness-grade behaviours, absorbing the strongest mechanisms from each competing harness and exceeding them.

---

## The one question

> Does PURPCLAW steer any model, on any surface, as well as the best dedicated harness steers its own model — and can it *prove* it?

Every work item below is judged against that question.

## Ground rules (apply to everything)

1. **One canonical steering protocol.** Codex, Claude Code, Kimi, MiniMax, Hermes and OpenClaw behaviours are implemented as *profiles and adapters* over one protocol — never four competing internal operating systems. One approval model, one task format, one event format, one session model, one memory model, one audit trail.
2. **Nothing ships without its probe passing.** Dashboards and status pages read probe results, never claims.
3. **Honesty labels.** Every capability is reported as Native, Adapted, Emulated, Degraded, Unsupported, or Untested. "Simulates the outcome differently" is Adapted or Emulated — not Native.
4. **No marketing-count updates until the probe passes.** Machines adore technically accurate lies. Do not feed them.

---

## Part 1 — Source lanes (what each harness does best, mid-2026)

Condensed from current docs, changelogs and independent trackers. Pin exact versions/commits in the registry when implementing.

**Codex (OpenAI).** Steer mode: mid-flight instruction injection with two priority lanes — interrupt immediately, or queue for next turn. Granular rejection *with feedback*: a denied tool call carries the reason, and the agent adjusts instead of blind-retrying. Guardian subagent: an AI reviewer triages approval requests before the human is pinged. Plan mode by default, goals mode, sandbox + approval tiers, worktree isolation, stable hooks, experimental memory. (OpenAI Codex docs and release notes, July 2026.)

**Claude Code (Anthropic).** The most complete lifecycle hook surface: interception points before and after tool use, at turn stop, session events, prompt submission, teammate idle, task completion, worktree create/remove, plus HTTP hooks. Auto-memories: the agent records and recalls as it works, with **scoped** memory frontmatter — user, project, or local. Agent teams with shared task lists; idle/completion events drive coordination. Skill hot-reload, context-budgeted skills, worktree isolation, phone-relay approvals via channels. Independent verdict: no longer a CLI calling an LLM — a harness with its own execution semantics. (Anthropic Claude Code changelog v2.1.x and docs, July 2026.)

**Kimi (Moonshot).** Swarm fanout at scale (up to ~100 sub-agents in beta) and genuinely strong vision-to-code. Lesson: fanout is easy, coordination stability is the hard part. (Kimi K2.5/Kimi Code materials, 2026.)

**MiniMax.** M2-class economics — a small fraction of premium-model price at high speed. Lesson: model choice per task phase is itself a steering decision. (Provider pricing/perf comparisons, 2026.)

**Hermes.** Extreme provider breadth, background sessions, voice, messaging gateways, personalities, local-first flexibility.

**OpenClaw.** Persistent gateway operation: channels, scheduled and proactive work, personal memory, device control, always-available behaviour.

---

## Part 2 — The steal list (15 work items)

Format for each: what it is, the PURPCLAW requirement, and the probe that proves it. Probes must be executable — code, not inspection.

### Tier 1 — The nervous system (build first, everything hangs off these)

**S1. Lifecycle event bus** — *Source: Claude Code hooks.*
Canonical events for: PreToolUse, PostToolUse, TurnStop, SessionStart, SessionEnd, PromptSubmit, TeammateIdle, TaskCompleted, WorktreeCreate, WorktreeRemove, MemoryWrite, ApprovalRequested, ApprovalResolved. Every event is user-hookable, deterministic, ordered, and logged to the audit trail.
*Probe:* register a hook on every event type, run a standard multi-tool task, assert all events fire in correct order with correct payloads.

**S2. Scoped memory model** — *Source: Claude Code auto-memories.*
Every memory record carries scope (user / project / local / session), source, timestamp, confidence, and TTL. Scope boundaries are enforced across projects.
*Probe:* write memories at each scope, run tasks in two different projects, assert visibility rules hold exactly.

**S3. Verified learning gate** — *Source: PURPCLAW original. This is the differentiator.*
No memory enters the trusted store until an evidence probe shows it helped. Records carry confidence scores and evidence links; unconfirmed or stale memories decay. Auto-learn, auto-evolve, auto-save — but nothing is *believed* without receipts.
*Probe A:* plant a false "lesson", run related tasks, assert it never reaches trusted scope.
*Probe B:* plant a true lesson, assert promotion after K successful applications, and assert decay after disuse.

### Tier 2 — The control loop

**S4. Priority steer channels** — *Source: Codex steer mode.*
During any active turn, the human can inject an instruction on two lanes: **interrupt now** (redirects the current turn) or **queue next** (applied at the next turn boundary). Available on CLI, TUI, Web and desktop.
*Probe:* start a long task, fire an interrupt, assert redirection within an agreed latency; queue a second instruction, assert it applies at the next boundary and not before.

**S5. Rejection with feedback** — *Source: Codex.*
A denied tool call carries the user's reason; the agent must incorporate it and must not blind-retry the same action.
*Probe:* scripted rejection with reason; assert the next proposed action differs materially and respects the stated constraint.

**S6. Delegated approval triage** — *Source: Codex guardian.*
A reviewer subagent vets approval requests against a policy file before the human is pinged: auto-approves low-risk, escalates the rest with a one-line summary and risk class.
*Probe:* 20 canned requests spanning risk classes; assert triage matches policy verdicts, and no high-risk request is auto-approved.

**S7. Session continuity through compaction** — *Source: Codex + Claude Code.*
Sessions resume coherently after compaction, restart, or provider failover — without re-asking the user for context already given.
*Probe:* long task, forced compaction mid-way, forced process kill and restart; assert continuation with state intact.

### Tier 3 — The economics and the swarm

**S8. Model-per-phase routing** — *Source: MiniMax economics.*
Task phases are classified (grunt / judgment / critical) and routed across cost tiers with failover. Routing decisions logged.
*Probe:* benchmark suite shows agreed cost reduction at equal-or-better pass rate versus a single-premium-model baseline.

**S9. Swarm with seatbelts** — *Source: Kimi swarm, corrected.*
Fanout to N worker agents — but every worker output passes deterministic verification before merge. Track coordination stability: conflict rate, rework rate.
*Probe:* 10 workers on a synthetic multi-file task; assert zero undetected merge conflicts and 100% verification-before-integration.

**S10. Team mode** — *Source: Claude Code agent teams.*
Lead/teammate roles with a shared task list; TeammateIdle and TaskCompleted events (from S1) drive reassignment.
*Probe:* multi-part task; assert lead decomposes, teammates claim work, idle agents get reassigned, and the shared list stays consistent under concurrency.

**S11. Vision-to-task lane** — *Source: Kimi.*
Screenshot or mockup → structured task spec + runnable scaffold.
*Probe:* feed a UI screenshot; assert a coherent task breakdown and a scaffold that builds.

### Tier 4 — The persistent presence

**S12. Background sessions and scheduling** — *Source: Hermes + OpenClaw.*
Persistent sessions, cron-style scheduled tasks, proactive triggers, unattended execution under the approval model.
*Probe:* schedule a task, kill the process, restart; assert session resumes and the task fires on schedule.

**S13. Messaging-gateway approvals** — *Source: OpenClaw + Claude channels.*
Approval requests relay to messaging (e.g. Telegram) with approve/deny from the phone, feeding the same audit trail.
*Probe:* trigger a gated action, approve remotely, assert execution continues and the decision is logged.

**S14. Device control with consent tiers** — *Source: OpenClaw.*
Native workstation/device control tiered by risk under the same approval model — not a side channel.
*Probe:* attempt a high-risk device action (gated, requires human), and a low-risk one (auto per policy); assert both behave and both are logged.

### Tier 5 — The truth layer (runs throughout)

**S15. Steering parity registry** — *Source: PURPCLAW observatory pattern.*
Every S-item gets a manifest entry: capability ID, source lane, pinned source version/commit, implementation status, supported providers, supported surfaces, honesty label, probe reference, last-verified date, known degradation. A scheduled job watches upstream releases; version bumps create drift candidates. CLI (`purpclaw steering status`, `purpclaw steering drift`) and Web/desktop dashboards render the *same* registry — no decorative interpretations of reality.
*Probe:* bump a pinned source version in a test fixture; assert a drift flag appears on the dashboard without manual edits.

---

## Part 3 — Build order and definition of done

**Order:** S1 first (the bus carries everything). Then S2 + S3 (memory and the truth gate — the edge). Then S4–S7 (control loop). Then S8–S11 (economics, swarm). Then S12–S14 (presence). S15 runs from day one and is never "finished" — it's the instrument panel.

**This milestone is done when:**
1. All fifteen probes are green on at least **two provider lanes** and at least **three surfaces** (CLI, TUI, Web).
2. The registry is live, honesty-labelled, and drift detection has demonstrably fired at least once (test fixture counts).
3. **The Steer Test (human, ungameable):** a person mid-task redirects an agent on one lane, queues a second correction, rejects a tool call with a reason, approves a third from their phone — and afterwards describes the experience as "it listened", not "it did a thing I had to fix." If they only comment on the architecture, the engineering passed and the steering didn't.

**Reporting format for any agent completing an item:** capability ID, probe output, honesty label, surfaces verified, providers verified, known degradations. No item is reported done without probe output attached.

---

*Built from current public docs and changelogs as of July 2026. Pin exact upstream versions in the registry at implementation time — this spec describes mechanisms, not version-locked feature lists.*
