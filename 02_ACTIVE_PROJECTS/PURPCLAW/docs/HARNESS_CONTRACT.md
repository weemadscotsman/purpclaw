# HARNESS_CONTRACT.md

**PURPCLAW Agent Harness Parity Contract**
Version 1.0 — 2026-08-04

---

## Core Doctrine

One operating contract. Multiple specialised minds. No duplicated plumbing.

Every harness must:
1. Accept the same task input shape
2. Return the same result output shape
3. Follow the same eight-stage lifecycle
4. Produce verifiable evidence for every claim
5. Log every action to the shared audit trail

---

## Task Input Schema (packages/task-schema)

Every harness receives this shape:

```json
{
  "taskId":           "tsk_...",
  "projectId":        "prj_...",
  "goal":             "fix the auth bug in lib/api.js",
  "repoPath":         "/path/to/repo",
  "knownFiles":       ["lib/api.js", "tests/api.test.js"],
  "constraints":      ["don't rewrite whole files", "preserve git history"],
  "requiredOutputs":  ["lib/api.js"],
  "acceptanceCriteria": ["build passes", "tests pass"],
  "preferredHarness": "codex",
  "fallbackHarness":  "claude",
  "priority":         1,
  "schema":           "PURPCLAW_TASK_SCHEMA_v1"
}
```

**Validation rules:**
- `taskId` required, alphanumeric+hyphen+underscore
- `goal` required, min 3 chars
- `repoPath` optional, defaults to cwd
- `preferredHarness` must be one of: codex, claude, hermes, minimax, auto

---

## Result Output Schema (packages/result-schema)

Every harness returns this shape:

```json
{
  "taskId":          "tsk_...",
  "projectId":       "prj_...",
  "harness":         "codex",
  "status":          "passed",
  "summary":         "fixed auth bug in 2 files",
  "filesRead":       ["lib/api.js"],
  "filesChanged":    ["lib/api.js", "tests/api.test.js"],
  "commandsRun":     ["npm run lint", "npm run test"],
  "artifacts":       [{ "path": "...", "checksum": "abc123", "verified": true }],
  "verification":    [{ "criterion": "lint passes", "passed": true, "evidence": "..." }],
  "errors":          [],
  "nextAction":      "review the test coverage increase",
  "durationMs":       4521,
  "tokensUsed":       12000,
  "costUsd":         0.004,
  "schema":          "PURPCLAW_RESULT_SCHEMA_v1"
}
```

**Status values:** `passed` | `partial` | `blocked` | `failed`

---

## Eight-Stage Lifecycle

```
INTAKE → TASK NORMALISATION → CONTEXT ASSEMBLY → PLANNING
  → EXECUTION → VERIFICATION → PACKAGING → MEMORY + AUDIT
```

### Stage 1: Intake
Receive raw goal string or task object. Validate against task-schema.

### Stage 2: Task Normalisation
Normalise to canonical task-schema shape. Apply routing hints.

### Stage 3: Context Assembly (packages/context-spine)
- Repo file search (fast-glob)
- Exact file reads
- Truth-document loading (AGENTS.md, README.md, ARCHITECTURE.md)
- Prior task memory loading
- Project metadata
- Git history
- Tool availability snapshot
- Context budget controls
- Context provenance on every item

### Stage 4: Planning
- Parse objective
- Identify likely files
- Produce ordered edit plan
- Bind each step to acceptance criterion
- Mark risky steps
- Stop and report when blocked

### Stage 5: Execution
- Edit one logical unit at a time
- Capture diff after every unit
- Run targeted tests after meaningful edits
- Revert failed edits when safe
- Escalate to full suite before completion

### Stage 6: Verification (packages/verification-core)
- syntax gate
- lint gate
- build gate
- test gate
- artifact-exists gate
- acceptance-criteria gate
- No harness marks a task passed without verification evidence.

### Stage 7: Packaging
- Objective summary
- Plan completed
- Files read/changed
- Commands run
- Verification results
- Final status
- Blockers
- Next action

### Stage 8: Memory + Audit (packages/memory-audit)
- Write one record per run (JSONL)
- Record all tool calls
- Record files changed
- Record verification outcomes
- Record failed attempts
- Support resume from last successful step
- Support task lineage and retries

---

## Harness Routing Table

| Use when... | Harness |
|---|---|
| precise repo surgery, TDD, patch generation | **codex** |
| architecture analysis, contradiction detection | **claude** |
| tool orchestration, retries, artifact production | **hermes** |
| rapid UI generation, component work, multimodal | **minimax** |

**Multi-harness sequences:**
- Architecture → Implementation: Claude → Codex → Verification
- UI rebuild: Claude → MiniMax → Codex → Verification
- Artifact-heavy workflow: Claude → Hermes → Codex → Verification

---

## CLI Commands

```bash
purpclaw harness run "<goal>"    # Run a goal
purpclaw harness parity           # Check parity status
purpclaw harness list             # List past jobs
purpclaw harness show <id>       # Show job detail
```

---

## API Endpoints

```
GET  /api/harness/parity    # Parity status (Gate E)
GET  /api/harness/jobs      # List jobs
GET  /api/harness/jobs/:id  # Job detail
POST /api/harness/run       # Run a goal
```

---

## Parity Gates (from §9 of PARITY_BLUEPRINT)

| Gate | Name | Requirement |
|---|---|---|
| A | Contract | Same task/result schema, same status vocabulary |
| B | Context | Same truth-doc, memory, and file provenance access |
| C | Execution | Every harness can act, stop, resume, report partial |
| D | Verification | Every pass has evidence, every failure has details |
| E | Presentation | CLI, TUI, Web render results consistently |
| F | Audit | Every run logged, every edit attributable |
