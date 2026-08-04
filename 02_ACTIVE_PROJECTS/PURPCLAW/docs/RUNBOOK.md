# RUNBOOK.md

**PURPCLAW Agent Harness Runbook**
Version 1.0 — 2026-08-04

How to run, debug, and extend the harness system.

---

## Quick Start

```bash
# Check parity status
purpclaw harness parity

# Run a goal
purpclaw harness run "fix the bug in lib/api.js"

# List past jobs
purpclaw harness list

# View a job
purpclaw harness show job_1234567890_abc

# Run with JSON output
purpclaw harness run "build auth" --json
```

---

## Architecture

```
packages/
├── task-schema/       — validates/normalises task input
├── result-schema/     — builds/renders/validates result output
├── context-spine/     — assembles context from repo, truth docs, git, memory
├── verification-core/  — runs gate checks (lint, build, test, etc.)
├── memory-audit/      — writes JSONL audit trail, supports resume
├── harness-codex/     — codex harness (repo surgery, patches, TDD)
├── harness-claude/    — claude harness (architecture, contradictions)
├── harness-hermes/    — hermes harness (tool orchestration, retries)
└── harness-minimax/   — minimax harness (UI generation, components)
```

---

## Adding a New Harness

1. Create `packages/harness-<name>/index.js`
2. Export `{ run, HARNESS }`
3. Use `taskSchema.validateTask(raw)` for input
4. Use `resultSchema.createResult(task, harnessName)` for output
5. Use `contextSpine.assemble(task, opts)` for context
6. Use `verification.runGates(root, gates, opts)` for verification
7. Use `memoryAudit.recordStart/recordFinish` for audit
8. Register in `packages/index.js`
9. Add to `parityStatus()` in `packages/index.js`
10. Run `purpclaw harness parity` to verify

---

## Adding a New Verification Gate

In `packages/verification-core/index.js`, add to the `GATES` object:

```javascript
'my-gate': {
  description: 'What this gate checks',
  check(rootDir, opts) {
    // return { ok: true/false, gate: 'my-gate', output: '...', command: null }
  },
},
```

Then use it in any harness:
```javascript
const gateResults = verification.runGates(root, ['my-gate', 'lint', 'build']);
```

---

## Debugging

```bash
# Run in-process (no service needed)
purpclaw harness run "fix auth" --local

# JSON output for piping
purpclaw harness run "fix auth" --json

# Check service health
purpclaw harness status

# Check parity
purpclaw harness parity
```

---

## Memory Audit

Audit logs live at `agent_work/memory-audit/`.

```
agent_work/memory-audit/
├── _index.jsonl          — master task index
└── {taskId}.jsonl       — per-task records
```

Resume interrupted tasks:
```javascript
const ma = require('packages/memory-audit');
const state = ma.loadForResume(root, taskId);
// state.lastAcceptedStepId → resume from here
```

---

## Packages Registry

```javascript
const pkg = require('./packages');
pkg.parityStatus();     // { gateA, gateB, ... }
pkg.availableHarnesses(); // ['codex', 'claude', 'hermes', 'minimax']
pkg.getHarness('codex');   // harness module
pkg.getShared('context-spine'); // context-spine module
```
