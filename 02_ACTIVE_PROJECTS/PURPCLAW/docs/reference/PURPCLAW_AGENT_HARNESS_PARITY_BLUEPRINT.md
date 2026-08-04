# PURPCLAW AGENT HARNESS PARITY BLUEPRINT
## Reference Implementation Checklist
### Behavioural order: Codex → Claude Code → Hermes → MiniMax Code

> Version source: `package.json` · Updated: 2026-08-04 · Status: REFERENCE

## Authority and Scope

This document is design input only. It does not reorder `docs/parity/CANONICAL_PARITY_PRIORITY.md`, authorise Wave 1 implementation or create a second runtime.

Do not execute this blueprint until P0-A, P0-B and P0-C have independent PASS verdicts and the final integrated conformance critic passes.

Do not create additional parity roadmaps, task/result frameworks, permission systems, provider routers, session stores or proof ledgers. Map every behavioural improvement onto the existing canonical runtime.

## Shared Harness Contract

Every external-harness profile must use:

```text
request
  -> shared task normalisation
  -> AgentGateway
  -> shared context and session state
  -> shared planning/execution loop
  -> ToolRuntime permissions
  -> shared verification and proof
  -> shared result envelope
  -> durable session, memory and audit
```

A profile may change prompting, context strategy, planning style, tool selection and presentation. It may not bypass the shared execution spine.

## Shared Result Envelope

Each profile must return, using the existing pipeline/proof structures or their canonical replacement:

- task and project identity
- harness/profile used
- final status: passed, partial, blocked or failed
- concise summary
- files read and changed
- commands and tools run
- artifacts produced
- verification evidence
- errors and blockers
- next action

No profile may mark a task passed without verification evidence.

# 1. CODEX BEHAVIOURAL PROFILE

Purpose: precise repository surgery, controlled patches and test-led completion.

## Implementation checklist

- [ ] Route Codex requests through `AgentGateway`.
- [ ] Use canonical session and context loading.
- [ ] Detect repository root without scanning stale copies.
- [ ] Search and read the smallest relevant file set first.
- [ ] Produce an ordered edit plan bound to acceptance criteria.
- [ ] Apply one logical patch at a time through governed file tools.
- [ ] Preserve unrelated user changes.
- [ ] Capture diff after each logical unit.
- [ ] Run targeted tests after meaningful edits.
- [ ] Run the full relevant verification gate before PASS.
- [ ] Return a clean patch summary and exact evidence.
- [ ] Support stop, resume and failure visibility through shared persistence.

## Behavioural acceptance tests

- [ ] Single-file bug fix.
- [ ] Multi-file refactor.
- [ ] New feature with tests.
- [ ] Failed-build recovery.
- [ ] Interrupted-task resume.
- [ ] Unrelated-change preservation.
- [ ] Clean diff and verification report.

Codex profile gate: all seven tests pass without a second patching or persistence framework.

# 2. CLAUDE CODE BEHAVIOURAL PROFILE

Purpose: large-context synthesis, architecture reasoning and contradiction detection.

## Implementation checklist

- [ ] Route Claude Code requests through the same gateway and sessions.
- [ ] Prioritise architecture and canonical truth documents.
- [ ] Load implementation, tests and recent decisions after authority sources.
- [ ] Tag doc/code and claim/evidence conflicts.
- [ ] Separate facts, inference, assumptions and proposals.
- [ ] State current truth before recommending changes.
- [ ] Identify root cause and minimum viable correction.
- [ ] Produce migration order and risk notes.
- [ ] Apply edits only through shared governed tools.
- [ ] Re-check architecture after implementation.
- [ ] Return file evidence for material conclusions.

## Behavioural acceptance tests

- [ ] Architecture audit.
- [ ] Duplicate-subsystem detection.
- [ ] Spec/code mismatch analysis.
- [ ] Large multi-folder reasoning task.
- [ ] Refactor plan followed by implementation.
- [ ] Facts-versus-assumptions separation.
- [ ] Before/after system map.

Claude profile gate: conclusions are evidence-backed and implementation still uses the shared runtime.

# 3. HERMES BEHAVIOURAL PROFILE

Purpose: multi-tool orchestration, retries, recovery and artifact workflows.

## Implementation checklist

- [ ] Route Hermes through the canonical tool registry and ToolRuntime.
- [ ] Discover only tools permitted for the caller and task.
- [ ] Build an ordered tool plan with expected outputs.
- [ ] Execute one stateful step at a time.
- [ ] Record step ID, tool, input, expected output, actual output and status.
- [ ] Retry only recoverable failures with bounded counts.
- [ ] Use an explicit fallback tool only when policy allows it.
- [ ] Preserve partial artifacts and report partial success honestly.
- [ ] Verify artifact existence, format, dependencies and checksum.
- [ ] Record every tool decision and outcome in shared evidence.
- [ ] Resume from the last successful persisted step.

## Behavioural acceptance tests

- [ ] Multi-tool workflow.
- [ ] Tool failure and retry.
- [ ] Tool failure and fallback.
- [ ] File transformation pipeline.
- [ ] Artifact generation and verification.
- [ ] Interrupted workflow resume.
- [ ] Partial-success reporting.

Hermes profile gate: a failed step can never be silently skipped or relabelled successful.

# 4. MINIMAX CODE BEHAVIOURAL PROFILE

Purpose: rapid component generation, visual iteration and style-preserving frontend work.

## Implementation checklist

- [ ] Route MiniMax through the shared gateway, tools and sessions.
- [ ] Load target component, parent layout and neighbouring patterns.
- [ ] Load existing design tokens and framework conventions.
- [ ] Accept screenshot or reference context without treating it as authority over code constraints.
- [ ] Produce a component and placement plan.
- [ ] Generate and apply code through governed file tools.
- [ ] Preserve routing, state wiring, accessibility and responsive behaviour.
- [ ] Run syntax, build and smoke checks.
- [ ] Render or capture a preview when the environment supports it.
- [ ] Compare the result against existing style constraints.
- [ ] Perform at most the configured bounded automatic correction loop.
- [ ] Return assumptions, changed components and visual/build evidence.

## Behavioural acceptance tests

- [ ] New component.
- [ ] Existing component restyle.
- [ ] Screenshot-to-component task.
- [ ] Responsive layout repair.
- [ ] State-connected UI.
- [ ] Failed-build recovery.
- [ ] Design-token compliance.

MiniMax profile gate: output builds, renders and follows the existing design language without inventing another component system.

# 5. CROSS-PROFILE ROUTING

Use behavioural routing, not identity theatre:

- Codex for precise repo edits, debugging, patches and tests.
- Claude Code for architecture, long-context synthesis and migration planning.
- Hermes for tool chains, retries and artifact-heavy workflows.
- MiniMax Code for rapid UI and reference-driven component work.

Recommended sequences:

```text
Architecture to implementation: Claude -> Codex -> shared verification
UI rebuild: Claude -> MiniMax -> Codex -> shared verification
Artifact workflow: Claude -> Hermes -> Codex -> shared verification
Repository modernisation: Claude -> Codex -> MiniMax -> Hermes -> final verification
```

# 6. RELEASE GATES

- [ ] Same session and task identity across profiles.
- [ ] Same permission decisions across profiles and surfaces.
- [ ] Same proof and status vocabulary.
- [ ] Stop, resume and partial progress work for every profile.
- [ ] CLI, TUI and Web render the same result envelope.
- [ ] Behavioural benchmark records correctness, latency, cost and evidence quality.
- [ ] No duplicate runtime, registry, session store, permission layer or provider router was introduced.
- [ ] Canonical priority file explicitly marks the work complete.

## Definition of Done

One operating contract. Multiple specialised behavioural profiles. No duplicated plumbing.
