# PURPCLAW FUNGUS AMONGUS MYCELIUM

## Living Network Layer for LIVEFORGE, Agents, Tools, Lessons, and Receipts

Date: 2026-07-07  
Status: build-ready subsystem extension  
Parent: PURPCLAW LIVEFORGE  
Codename: **Fungus Amongus**  
Function: **Mycelium network that tells all, knows all, and shares all through permitted PURPCLAW routes.**

Fungus Amongus is the underground intelligence layer of PURPCLAW. LIVEFORGE creates active surfaces and temporary tools. Fungus Amongus connects those surfaces, agents, memories, receipts, lessons, warnings, and successful methods into one evolving network.

Not omniscient magic. Not vibes in a trench coat. A permissioned event-and-pattern network where every useful discovery becomes a packet, every packet has proof, every proof can be replayed, and every agent can receive the right lesson at the right moment.

---

## One-line rule

Every agent, tool, surface, and workflow can publish **spores** into the mycelium, but only validated, scoped, and receipt-backed spores can spread as reusable behaviour.

---

## What it adds to LIVEFORGE

LIVEFORGE handles live UI and temporary work surfaces.

Fungus Amongus handles:

1. Shared situational awareness.
2. Cross-agent pattern propagation.
3. “What worked last time” retrieval.
4. Warnings from failures before they repeat.
5. Skill/tool route memory.
6. Active workflow adaptation mid-job.
7. Proof-backed learning promotion.
8. Context packets delivered only to agents allowed to know them.

In plain terms: when one agent learns a better way to do something, the mycelium lets the rest of PURPCLAW know without turning the whole system into a gossiping security breach with a command line.

---

## Doctrine

1. **Everything useful becomes a spore.** A spore is a structured event, lesson, warning, state change, tool result, route hint, or correction.
2. **Every spore needs source, scope, confidence, expiry, and proof.** No anonymous goblin wisdom.
3. **All sharing is permissioned.** “Tells all” means all permitted nodes, not every agent gets every secret like a toddler with a printer.
4. **The mycelium routes patterns, not raw chaos.** It should spread distilled instructions, not dump entire logs into every agent context.
5. **Memory decays unless reinforced.** Old patterns lose weight unless replayed, reused, confirmed, or explicitly pinned.
6. **Contradictions are first-class signals.** If two agents learn conflicting lessons, the mycelium marks conflict and requests arbitration or replay.
7. **Mid-job adaptation is allowed.** Permanent mutation is gated. Session improvements can happen live; system-wide behaviour changes need receipts and replay.
8. **Private data stays scoped.** A private message, credential, user detail, draft, or sensitive file path must not spread as public mycelium context.
9. **Agents subscribe to nutrients, not noise.** Each agent gets relevant packets based on role, task, lane, risk, and current goal.
10. **No fake knowing.** If the mycelium does not have proof, it says unknown, stale, disputed, or inferred.

---

## Core objects

### 1. Spore Packet

A structured unit of shareable knowledge.

Examples:

- A tool route worked.
- A sanitizer blocked bad markup.
- A prompt pattern improved an output.
- A repo file location was discovered.
- A user preference changed the workflow.
- A previous bug was fixed by a patch.
- A generated UI event failed schema validation.
- An agent found a better execution order.
- A LIVEFORGE surface produced a repeatable pattern.

Required fields:

- `spore_id`
- `created_at`
- `created_by`
- `source_type`
- `source_ref`
- `packet_type`
- `title`
- `summary`
- `payload`
- `tags`
- `visibility_scope`
- `allowed_consumers`
- `blocked_consumers`
- `confidence`
- `evidence_refs`
- `ttl_seconds`
- `decay_policy`
- `risk_level`
- `promotion_state`

### 2. Hypha Route

A permitted route between producer and consumer nodes.

Examples:

- LIVEFORGE surface → Orchestrator
- Codex agent → Patch verifier
- Tool gateway → Proof logger
- Lesson distiller → Agent prompt loader
- User correction → Session adaptation layer
- Failure event → Warning broadcaster

Required fields:

- `route_id`
- `producer_node`
- `consumer_node`
- `packet_types_allowed`
- `visibility_allowed`
- `transform_policy`
- `rate_limit`
- `requires_receipt`
- `enabled`

### 3. Nutrient Bundle

A compact context bundle delivered to an agent or surface at the point of need.

Examples:

- “For this repo task, use these three proven route hints.”
- “This user hates repeated confirmation loops.”
- “This UI lane must use event envelopes, not direct file writes.”
- “This kind of failure happened before; validate imports first.”

Required fields:

- `bundle_id`
- `task_id`
- `consumer_id`
- `reason`
- `spores_included`
- `spores_suppressed`
- `max_tokens`
- `generated_at`
- `expiry`

### 4. Colony Pattern

A replay-tested pattern promoted for reuse.

Examples:

- “For generated forms, always create event envelope schema first.”
- “For repo tool wiring, check import, dispatcher, registry, RBAC, docs, tests.”
- “For user-facing long tasks, give progress updates every few tool calls.”
- “For private routing, answer policy honestly without exposing content.”

Required fields:

- `pattern_id`
- `name`
- `trigger_conditions`
- `instruction`
- `evidence_refs`
- `replay_tests`
- `approved_by`
- `approved_at`
- `risk_level`
- `rollback_plan`

---

## Node roles

### Spore Collector

Listens to LIVEFORGE events, tool results, agent outputs, user corrections, failed validations, and proof receipts. Converts useful changes into candidate spores.

Must collect:

- successful tool routes
- failed tool routes
- schema failures
- corrected prompts
- user instructions
- generated surface results
- patch outcomes
- agent handoffs
- final reports

Must not collect:

- secrets
- raw credentials
- unnecessary private user content
- private message content outside its visibility scope
- temporary hallucinated claims
- unverified external facts

### Mycelium Index

Stores spores and makes them searchable by task, tag, tool, agent, route, confidence, source, risk, and recency.

Suggested storage for Phase One:

- `.purpclaw/mycelium/spores.jsonl`
- `.purpclaw/mycelium/routes.jsonl`
- `.purpclaw/mycelium/bundles.jsonl`
- `.purpclaw/mycelium/patterns.pending.jsonl`
- `.purpclaw/mycelium/patterns.approved.jsonl`
- `.purpclaw/mycelium/conflicts.jsonl`

### Hypha Router

Chooses who gets what packet.

Inputs:

- current task
- active agent
- permission scope
- packet tags
- risk level
- freshness
- confidence
- context budget

Outputs:

- nutrient bundles
- warning packets
- route hints
- pattern suggestions
- blocked/suppressed packet receipts

### Nutrient Injector

Adds the selected bundle into the receiving agent’s context, prompt, tool plan, or LIVEFORGE surface state.

Rules:

- Keep packets compact.
- Prefer instruction deltas over long logs.
- Mark every injected item with source and confidence.
- Never inject hidden/private content into public context.
- Avoid repeating the same packet endlessly.

### Conflict Detector

Finds spores that disagree.

Examples:

- One pattern says use route A; another says route A is deprecated.
- One agent says a tool exists; another says it failed health check.
- A lesson worked once but replay failed later.
- A user preference changed.

Conflict outcomes:

- `needs_replay`
- `needs_user_decision`
- `deprecated`
- `superseded`
- `split_by_context`
- `rejected`

### Lesson Promoter

Turns repeated successful spores into colony patterns.

Promotion requirements:

1. At least one proof receipt.
2. At least one replay case.
3. No unresolved high-risk conflict.
4. Clear trigger conditions.
5. Rollback plan.
6. Permission-safe context.

---

## Active behaviour loop

### Mycelium loop

1. **Sense**: collect events from agents, tools, LIVEFORGE surfaces, user corrections, and receipts.
2. **Spore**: convert useful events into structured spores.
3. **Scope**: apply visibility, privacy, risk, and TTL rules.
4. **Index**: store the spores for retrieval.
5. **Match**: when a task starts or changes, find relevant spores.
6. **Bundle**: compress useful spores into a nutrient bundle.
7. **Inject**: deliver bundle to the right agent/surface/tool lane.
8. **Observe**: record whether the advice helped or failed.
9. **Reinforce**: increase confidence if reused successfully.
10. **Decay or promote**: stale spores fade; repeated proof-backed spores become colony patterns.

That is the actual “always evolving ability” bit. Not the system randomly rewriting itself because it had a feeling, which is how you get a haunted toaster with Git permissions.

---

## Live adaptation rules

### Allowed immediately inside a session

- Reorder steps after a new dependency is found.
- Switch tool route after a route fails.
- Inject a warning from previous similar failure.
- Apply a known user preference.
- Reuse a successful prompt format.
- Suggest a safer/generated UI route.
- Mark a route as temporarily bad after repeated failures.

### Requires replay before permanent promotion

- New agent operating rule.
- New tool execution order.
- New default UI generation rule.
- New sanitizer exception.
- New memory-writing behaviour.
- New route available to multiple agents.
- New cross-user/private routing behaviour.

### Forbidden

- Automatically sharing secrets.
- Promoting a lesson from one lucky success.
- Permanent self-modification without receipts.
- Injecting private content into public surfaces.
- Treating generated UI as proof.
- Hiding contradictions.
- Pretending stale knowledge is current.

---

## Integration with LIVEFORGE

LIVEFORGE events should produce spores:

- `liveforge.surface.created` → surface pattern candidate
- `liveforge.event.validated` → schema route confidence
- `liveforge.tool.executed` → tool route success/failure spore
- `liveforge.patch.streamed` → render pattern spore
- `liveforge.failure.red` → warning spore
- `liveforge.lesson.promoted` → colony pattern

LIVEFORGE surfaces can request nutrient bundles:

- Before creating a generated form.
- Before routing a private/public message.
- Before generating a temporary tool.
- Before saving a patch.
- Before asking an agent to execute a workflow.

LIVEFORGE must never bypass Mycelium scopes. If Mycelium says a spore is private, expired, blocked, disputed, or high-risk, it stays constrained.

---

## Integration with agents

Every PURPCLAW agent should have a mycelium handshake:

1. On task start: request nutrient bundle for task tags.
2. During task: publish spores for discoveries, failures, corrections, tool results.
3. Before tool call: ask for known route warnings or better path.
4. After task: publish final outcome and useful lessons.
5. On contradiction: mark conflict instead of choosing silently.

Agent prompt injection format:

```text
MYCELIUM NUTRIENTS FOR THIS TASK:
- Pattern: <short instruction>
  Source: <receipt or spore ref>
  Confidence: <low|medium|high>
  Scope: <session|project|global>
  Use when: <trigger>
  Do not use when: <limits>
```

Agents must treat mycelium nutrients as guidance unless the packet is marked as a required policy or hard block.

---

## Integration with tool gateway

Before a tool executes, the gateway should check:

1. Has this route worked before?
2. Is there a known failure for this route?
3. Is there a safer route?
4. Does this tool require extra confirmation?
5. Does the current packet scope permit this action?
6. Should the result become a spore?

After execution:

- success creates route-confidence spore
- failure creates warning spore
- permission denial creates policy spore
- unexpected output creates review spore

---

## Visibility and privacy rules

Fungus Amongus can “tell all” only within scope.

Scopes:

- `public_surface`
- `user_only`
- `agent_only`
- `project_private`
- `system_private`
- `secret_blocked`

Hard rule:

A spore can move from a narrower scope to a wider scope only after transformation removes protected content and leaves a safe abstract lesson.

Example:

Raw private content:

> User corrected a private debt letter draft and included personal details.

Safe abstract spore:

> For debt-letter workflows, preserve written-only contact preference and avoid phone-call instructions unless user asks.

That is useful. That is safe. That is not dumping someone’s life into the fungal soup like a cursed newsletter.

---

## Mycelium packet types

- `route_hint`
- `tool_success`
- `tool_failure`
- `warning`
- `user_preference`
- `workflow_pattern`
- `surface_pattern`
- `schema_pattern`
- `sanitizer_rule`
- `privacy_rule`
- `agent_handoff`
- `conflict`
- `deprecated_pattern`
- `promotion_candidate`
- `approved_colony_pattern`

---

## Confidence model

Initial confidence:

- `0.20` user idea not yet implemented
- `0.40` single observed success
- `0.60` repeated observed success
- `0.80` replay-tested success
- `0.95` approved colony pattern with rollback plan

Confidence decreases when:

- replay fails
- tool route changes
- user preference is updated
- source becomes stale
- conflict appears
- implementation changes

Confidence increases when:

- reused successfully
- validated by tests
- confirmed by user
- produces receipts
- survives replay

---

## Decay model

Default TTL:

- session spore: `24 hours`
- project route hint: `30 days`
- user preference: no expiry unless updated, but still scoped
- tool failure warning: `7 days`
- approved pattern: no expiry, but revalidate on major version change
- external/current fact: very short TTL and must be rechecked

Decay rule:

A stale spore can still be retrieved, but it must be labelled stale and cannot be injected as a confident instruction.

---

## API routes

Minimum API surface:

- `GET /api/mycelium/health`
- `POST /api/mycelium/spores`
- `GET /api/mycelium/spores/:spore_id`
- `POST /api/mycelium/query`
- `POST /api/mycelium/bundles`
- `POST /api/mycelium/routes`
- `POST /api/mycelium/conflicts`
- `POST /api/mycelium/patterns/propose`
- `POST /api/mycelium/patterns/replay`
- `POST /api/mycelium/patterns/promote`

Minimum CLI:

- `purpclaw mycelium health`
- `purpclaw mycelium spore add`
- `purpclaw mycelium query`
- `purpclaw mycelium bundle`
- `purpclaw mycelium route list`
- `purpclaw mycelium conflicts`
- `purpclaw mycelium replay`
- `purpclaw mycelium promote`

---

## Event tags

- `mycelium.spore.created`
- `mycelium.spore.scoped`
- `mycelium.spore.indexed`
- `mycelium.spore.decayed`
- `mycelium.bundle.requested`
- `mycelium.bundle.created`
- `mycelium.bundle.injected`
- `mycelium.route.created`
- `mycelium.route.blocked`
- `mycelium.conflict.detected`
- `mycelium.conflict.resolved`
- `mycelium.pattern.proposed`
- `mycelium.pattern.replayed`
- `mycelium.pattern.promoted`
- `mycelium.warning.broadcast`
- `mycelium.privacy.blocked`

---

## Failure classes

### Green

- spore created with proof
- bundle injected with scope respected
- route hint improved execution
- pattern replay passed
- stale spore labelled correctly

### Amber

- useful spore lacks enough evidence
- packet is stale but possibly relevant
- route hint conflicts with recent failure
- bundle too large
- duplicate packets detected

### Red

- secret included in spore payload
- private packet injected into public context
- unverified claim promoted
- tool execution changed from guidance without permission
- fake success receipt
- conflict hidden

### Purple

- runaway self-reinforcing pattern
- circular route injection
- agents quoting each other as proof
- repeated hallucinated tool route
- context poisoning attempt

---

## Acceptance criteria

Phase One passes only when:

1. A spore packet validates against schema.
2. A route can be registered.
3. A nutrient bundle can be created from matching spores.
4. Private spores are excluded from public bundles.
5. Stale spores are labelled stale.
6. Conflicting spores create a conflict record.
7. A successful tool result creates a tool-success spore.
8. A failed tool result creates a warning spore.
9. A pattern cannot promote without replay evidence.
10. Every action writes a receipt.

---

## Default implementation priority

Build in this order:

1. Spore schema and JSONL store.
2. Scope validator.
3. Query and bundle builder.
4. Tool result collector.
5. LIVEFORGE event collector.
6. Agent nutrient injector.
7. Conflict detector.
8. Pattern replay gate.
9. WebUI/TUI visual mycelium map.
10. Advanced adaptive routing.

Do not start with the fancy visual network. That is how people end up with a pretty diagram of a thing that does not exist. Build the spores first.

---

## Canonical phrase

**Fungus Amongus is PURPCLAW’s mycelium: every useful event becomes a spore, every spore has proof and scope, every agent gets the right nutrients, and every repeated win can grow into colony behaviour after replay.**
