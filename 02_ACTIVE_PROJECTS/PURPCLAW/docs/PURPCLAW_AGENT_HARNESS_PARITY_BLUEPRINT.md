# PURPCLAW AGENT HARNESS PARITY BLUEPRINT

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md).
> This file is non-authoritative; it records notes and evidence and defines nothing.
## Canonical Implementation Checklist
### Build Order: Codex → Claude → Hermes → MiniMax Code

Version: 1.0
Purpose: Bring every PurpClaw coding harness up to the same operational standard without flattening their individual strengths.

---

# 0. NON-NEGOTIABLE PARITY CONTRACT

Every harness must implement the same eight-stage lifecycle:

1. Intake
2. Task Normalisation
3. Context Assembly
4. Planning
5. Execution
6. Verification
7. Packaging
8. Memory + Audit

Every harness must return the same result shape:

```json
{
  "taskId": "tsk_...",
  "projectId": "prj_...",
  "harness": "codex|claude|hermes|minimax",
  "status": "passed|partial|blocked|failed",
  "summary": "...",
  "filesRead": [],
  "filesChanged": [],
  "commandsRun": [],
  "artifacts": [],
  "verification": [],
  "errors": [],
  "nextAction": "..."
}
```

Every harness must accept the same task shape:

```json
{
  "taskId": "tsk_...",
  "projectId": "prj_...",
  "goal": "...",
  "repoPath": "...",
  "knownFiles": [],
  "constraints": [],
  "requiredOutputs": [],
  "acceptanceCriteria": [],
  "preferredHarness": "codex|claude|hermes|minimax|auto",
  "fallbackHarness": "..."
}
```

---

# 1. CANONICAL PURPCLAW DIRECTORY LAYOUT

```text
purpclaw/
├── apps/
│   ├── cli/
│   ├── tui/
│   └── web/
├── packages/
│   ├── harness-core/
│   ├── task-schema/
│   ├── result-schema/
│   ├── context-spine/
│   ├── verification-core/
│   ├── memory-audit/
│   ├── tool-registry/
│   ├── harness-codex/
│   ├── harness-claude/
│   ├── harness-hermes/
│   └── harness-minimax/
├── services/
│   ├── router/
│   ├── runner/
│   ├── artifact-store/
│   └── event-bus/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── parity/
│   └── smoke/
└── docs/
    ├── HARNESS_CONTRACT.md
    ├── PARITY_MATRIX.md
    └── RUNBOOK.md
```

---

# 2. PHASE ZERO — SHARED FOUNDATION

Do this before touching individual harnesses.

## 2.1 Shared task schema

- [ ] Create `packages/task-schema`
- [ ] Define required fields
- [ ] Add runtime validation
- [ ] Reject tasks with no goal
- [ ] Reject tasks with no output requirement
- [ ] Support optional repo path
- [ ] Support optional uploaded files
- [ ] Support explicit acceptance criteria
- [ ] Add task priority
- [ ] Add preferred and fallback harness fields

Acceptance gate: every harness receives the same valid task object.

## 2.2 Shared result schema

- [ ] Create `packages/result-schema`
- [ ] Define common statuses
- [ ] Define file read/write reporting
- [ ] Define command execution reporting
- [ ] Define artifact reporting
- [ ] Define verification reporting
- [ ] Define error and blocker reporting
- [ ] Define next-action field
- [ ] Add duration and token/cost metadata

Acceptance gate: CLI, TUI and Web render any harness result without harness-specific code.

## 2.3 Context spine

- [ ] Create `packages/context-spine`
- [ ] Add repo file search
- [ ] Add exact file read
- [ ] Add truth-document loading
- [ ] Add prior task memory loading
- [ ] Add project metadata loading
- [ ] Add recent git history
- [ ] Add tool availability snapshot
- [ ] Add context budget controls
- [ ] Add context provenance

Acceptance gate: every context item includes source, path, timestamp and confidence.

## 2.4 Verification core

- [ ] Create `packages/verification-core`
- [ ] Add syntax checks
- [ ] Add lint runner
- [ ] Add test runner
- [ ] Add build runner
- [ ] Add artifact existence checks
- [ ] Add screenshot/render checks
- [ ] Add acceptance-criteria evaluator
- [ ] Add verification evidence records

Acceptance gate: no harness can mark a task passed without verification evidence.

## 2.5 Memory and audit

- [ ] Create `packages/memory-audit`
- [ ] Write one task record per run
- [ ] Record all tool calls
- [ ] Record files changed
- [ ] Record verification outcomes
- [ ] Record failed attempts
- [ ] Record final disposition
- [ ] Support resume from last successful step
- [ ] Support task lineage and retries

Acceptance gate: interrupted runs resume without starting from zero.

---

# 3. CODEX PARITY IMPLEMENTATION

Codex establishes the baseline for repo surgery, patching and verification.

## 3.1 Adapter

- [ ] Create `packages/harness-codex`
- [ ] Implement shared task input
- [ ] Implement shared result output
- [ ] Add repo root detection
- [ ] Add file search
- [ ] Add file read
- [ ] Add patch apply
- [ ] Add file create/delete
- [ ] Add command runner
- [ ] Add git diff capture
- [ ] Add test result capture

## 3.2 Planning loop

- [ ] Parse objective
- [ ] Identify likely files
- [ ] Read only relevant files first
- [ ] Produce ordered edit plan
- [ ] Bind each step to an acceptance criterion
- [ ] Mark risky steps
- [ ] Stop and report when blocked by missing facts

## 3.3 Execution loop

- [ ] Edit one logical unit at a time
- [ ] Capture diff after every unit
- [ ] Run targeted tests after meaningful edits
- [ ] Revert failed edits automatically when safe
- [ ] Escalate to full relevant suite before completion
- [ ] Preserve unrelated user changes
- [ ] Never rewrite whole files unless justified

## 3.4 Verification

- [ ] Syntax passes
- [ ] Lint passes
- [ ] Targeted tests pass
- [ ] Full relevant suite passes
- [ ] Build passes
- [ ] Diff contains only intended scope
- [ ] Acceptance criteria explicitly checked

## 3.5 Result packaging

- [ ] Objective
- [ ] Plan completed
- [ ] Files read
- [ ] Files changed
- [ ] Patch summary
- [ ] Commands run
- [ ] Test results
- [ ] Final status
- [ ] Blockers
- [ ] Next action

## 3.6 Codex parity tests

- [ ] Single-file bug fix
- [ ] Multi-file refactor
- [ ] New feature with tests
- [ ] Failed build recovery
- [ ] Resume interrupted task
- [ ] Preserve unrelated local changes
- [ ] Produce clean patch summary

Codex parity gate: seven parity tests pass end to end.

---

# 4. CLAUDE PARITY IMPLEMENTATION

Claude parity adds deep context, architecture analysis and contradiction detection.

## 4.1 Adapter

- [ ] Create `packages/harness-claude`
- [ ] Implement shared task input
- [ ] Implement shared result output
- [ ] Add large-context assembler
- [ ] Add architecture-doc prioritisation
- [ ] Add truth-doc resolver
- [ ] Add cross-file contradiction scan
- [ ] Add assumptions ledger
- [ ] Add evidence-backed recommendation format

## 4.2 Context strategy

- [ ] Load architecture truth first
- [ ] Load implementation second
- [ ] Load tests third
- [ ] Load recent decisions fourth
- [ ] Tag conflicts between docs and code
- [ ] Separate facts from inference
- [ ] Separate current state from proposed state
- [ ] Compress repeated context

## 4.3 Reasoning workflow

- [ ] State what is true
- [ ] State what is inconsistent
- [ ] State what is missing
- [ ] Identify root cause
- [ ] Identify minimum viable correction
- [ ] Produce migration path
- [ ] Identify risk of each change
- [ ] Define validation strategy

## 4.4 Editing workflow

- [ ] Prioritise specs and architecture docs
- [ ] Produce refactor plans before code
- [ ] Make code changes through shared patch tooling
- [ ] Run shared verification core
- [ ] Re-check architecture after implementation
- [ ] Produce before/after system map

## 4.5 Result packaging

- [ ] Current truth
- [ ] Contradictions found
- [ ] Missing layers
- [ ] Root cause
- [ ] Recommended fix order
- [ ] Files changed
- [ ] Verification evidence
- [ ] Remaining assumptions
- [ ] Next architectural decision

## 4.6 Claude parity tests

- [ ] Architecture audit
- [ ] Duplicate subsystem detection
- [ ] Spec/code mismatch
- [ ] Large multi-folder reasoning task
- [ ] Refactor plan plus implementation
- [ ] Facts-versus-assumptions separation
- [ ] Migration document generation

Claude parity gate: every output cites file evidence and distinguishes facts from inference.

---

# 5. HERMES PARITY IMPLEMENTATION

Hermes parity adds orchestration, tool chaining, retries and artifact production.

## 5.1 Adapter

- [ ] Create `packages/harness-hermes`
- [ ] Implement shared task input
- [ ] Implement shared result output
- [ ] Connect canonical tool registry
- [ ] Add tool capability discovery
- [ ] Add tool sequence planner
- [ ] Add per-step state tracking
- [ ] Add retry logic
- [ ] Add fallback-tool logic
- [ ] Add artifact builder interface

## 5.2 Orchestration workflow

- [ ] Classify task by required tools
- [ ] Build ordered tool plan
- [ ] Validate required permissions
- [ ] Execute one step at a time
- [ ] Capture output after each step
- [ ] Check success before continuing
- [ ] Retry recoverable failures
- [ ] Route unrecoverable failures to fallback
- [ ] Preserve partial artifacts

## 5.3 State machine

Each step must record:

- [ ] Step ID
- [ ] Tool
- [ ] Input
- [ ] Expected output
- [ ] Actual output
- [ ] Status
- [ ] Retry count
- [ ] Error
- [ ] Recovery action

## 5.4 Artifact workflow

- [ ] Create artifact manifest
- [ ] Verify file exists
- [ ] Verify file opens
- [ ] Verify required dependencies exist
- [ ] Verify output format
- [ ] Capture preview where relevant
- [ ] Attach final artifact path
- [ ] Record checksum

## 5.5 Result packaging

- [ ] Tool plan
- [ ] Tools used
- [ ] Step-by-step outcome
- [ ] Retries
- [ ] Fallbacks
- [ ] Artifacts created
- [ ] Artifact verification
- [ ] Final status
- [ ] Remaining manual action

## 5.6 Hermes parity tests

- [ ] Multi-tool workflow
- [ ] Tool failure and retry
- [ ] Tool failure and fallback
- [ ] File transformation pipeline
- [ ] Artifact generation and validation
- [ ] Interrupted workflow resume
- [ ] Partial-success reporting

Hermes parity gate: no tool chain silently skips a failed step.

---

# 6. MINIMAX CODE PARITY IMPLEMENTATION

MiniMax parity adds rapid UI generation, component work and multimodal-aware coding.

## 6.1 Adapter

- [ ] Create `packages/harness-minimax`
- [ ] Implement shared task input
- [ ] Implement shared result output
- [ ] Add UI-project detection
- [ ] Add component-map loading
- [ ] Add design-token loading
- [ ] Add screenshot/reference intake
- [ ] Add rapid generation mode
- [ ] Add preview/smoke-test loop

## 6.2 Context strategy

- [ ] Load target component
- [ ] Load parent layout
- [ ] Load design tokens
- [ ] Load neighbouring components
- [ ] Load screenshot or reference image
- [ ] Load responsive constraints
- [ ] Load framework conventions
- [ ] Load existing state/data wiring

## 6.3 Generation workflow

- [ ] Generate component plan
- [ ] Identify placement
- [ ] Generate code
- [ ] Apply code
- [ ] Run syntax check
- [ ] Run app/build check
- [ ] Render preview
- [ ] Compare against style constraints
- [ ] Iterate once automatically if needed

## 6.4 UI safeguards

- [ ] No invented design system
- [ ] Reuse existing tokens
- [ ] Preserve routing
- [ ] Preserve state wiring
- [ ] Preserve accessibility
- [ ] Preserve mobile layout
- [ ] No giant file rewrites
- [ ] No placeholder data in production paths

## 6.5 Result packaging

- [ ] Components generated
- [ ] Components modified
- [ ] Placement
- [ ] Design tokens used
- [ ] Assumptions
- [ ] Preview result
- [ ] Build result
- [ ] Remaining visual issues
- [ ] Next iteration

## 6.6 MiniMax parity tests

- [ ] New component
- [ ] Existing component restyle
- [ ] Screenshot-to-component
- [ ] Responsive layout repair
- [ ] State-connected UI
- [ ] Failed build recovery
- [ ] Style-token compliance

MiniMax parity gate: generated UI builds, renders and matches the existing design language.

---

# 7. CROSS-HARNESS ROUTING

## Use Codex when

- precise repo surgery
- test-driven implementation
- patch generation
- debugging
- build repair

## Use Claude when

- architecture analysis
- contradiction detection
- large-context synthesis
- migration planning
- documentation-led refactors

## Use Hermes when

- multi-tool workflows
- artifact generation
- shell + browser + file orchestration
- retry-heavy execution
- cross-system operations

## Use MiniMax when

- rapid UI/component generation
- style-preserving frontend work
- screenshot/reference-driven builds
- multimodal coding tasks
- fast visual iterations

## Multi-harness sequences

- Architecture to implementation: Claude → Codex → Verification Core
- UI rebuild: Claude → MiniMax → Codex → Verification Core
- Artifact-heavy workflow: Claude → Hermes → Codex → Verification Core
- Full repo modernisation: Claude → Codex → MiniMax → Hermes → Verification Core

---

# 8. PARITY MATRIX

| Capability | Codex | Claude | Hermes | MiniMax |
|---|---:|---:|---:|---:|
| Shared task schema | Required | Required | Required | Required |
| Shared result schema | Required | Required | Required | Required |
| Repo search | Strong | Strong | Medium | Medium |
| File editing | Strong | Strong | Strong | Strong |
| Test execution | Strong | Required | Required | Required |
| Large-context reasoning | Medium | Strong | Medium | Medium |
| Tool orchestration | Medium | Medium | Strong | Medium |
| Artifact generation | Medium | Medium | Strong | Strong |
| UI generation | Medium | Medium | Medium | Strong |
| Resume state | Required | Required | Required | Required |
| Audit trail | Required | Required | Required | Required |
| Acceptance criteria | Required | Required | Required | Required |

---

# 9. RELEASE GATES

Do not call PurpClaw “at parity” until all gates pass.

## Gate A — Contract parity
- [ ] Same task schema
- [ ] Same result schema
- [ ] Same status vocabulary

## Gate B — Context parity
- [ ] Same truth-doc access
- [ ] Same memory access
- [ ] Same file provenance

## Gate C — Execution parity
- [ ] Every harness can act
- [ ] Every harness can stop
- [ ] Every harness can resume
- [ ] Every harness can report partial progress

## Gate D — Verification parity
- [ ] Every pass has evidence
- [ ] Every failure has error details
- [ ] Every artifact is validated

## Gate E — Presentation parity
- [ ] CLI renders all harnesses
- [ ] TUI renders all harnesses
- [ ] Web renders all harnesses
- [ ] No harness-specific result hacks

## Gate F — Audit parity
- [ ] Every run is logged
- [ ] Every edit is attributable
- [ ] Every verification is stored
- [ ] Every retry is traceable

---

# 10. FINAL BUILD ORDER

1. [ ] Shared task schema
2. [ ] Shared result schema
3. [ ] Context spine
4. [ ] Verification core
5. [ ] Memory + audit
6. [ ] Codex harness
7. [ ] Codex parity tests
8. [ ] Claude harness
9. [ ] Claude parity tests
10. [ ] Hermes harness
11. [ ] Hermes parity tests
12. [ ] MiniMax harness
13. [ ] MiniMax parity tests
14. [ ] Router
15. [ ] Multi-harness sequences
16. [ ] CLI/TUI/Web rendering parity
17. [ ] Full end-to-end parity suite
18. [ ] Freeze legacy harnesses
19. [ ] Migrate active workflows
20. [ ] Delete or archive duplicates

---

# 11. DEFINITION OF DONE

PurpClaw is at harness parity when:

- The same task can be routed to any harness.
- Every harness receives the same structured context.
- Every harness acts through the same core tools.
- Every harness verifies through the same verification layer.
- Every harness returns the same result contract.
- Every run is resumable and auditable.
- CLI, TUI and Web display results consistently.
- Individual harnesses keep their strengths without inventing separate operating systems.

Final doctrine:

One operating contract. Multiple specialised minds. No duplicated plumbing.
