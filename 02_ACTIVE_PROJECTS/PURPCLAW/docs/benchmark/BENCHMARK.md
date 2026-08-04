# PURPCLAW Agent Benchmark — Head-to-Head Build-Off

> **Final launch proof per Monster Launch Ledger, P5 "Head-to-head comparison harness."**
>
> **Status:** IN PROGRESS — Round 1 of 4
> **Date:** 2026-06-29
> **Operator:** Quill (PURPCLAW agent)

---

## The Test

**One identical prompt, four agents, fresh repo snapshot, timeboxed, scored against a 100-point rubric.**

The agents and their roles:

| Agent | Role |
|---|---|
| `codex` (Codex CLI 0.142.3) | Competitor #1 |
| `claude` (Claude Code 2.1.183) | Competitor #2 |
| `hermes` (Hermes Agent 0.17.0) | Competitor #3 — the home team |
| `kilocode` (Kilo 7.3.54) | Competitor #4 |

The home team **PURPCLAW** is also scored separately via its own skill (Quill running inside the workspace, exercising the same Hivemind/registry/Monster Ledger system the competitors don't have).

---

## The Task (Identical for All Agents)

```text
PURPCLAW has a known problem: multiple registry surfaces (service_registry.js,
ecosystem.config.js, lib/capability-registry.js, lib/surface-capabilities.js,
registry/index.json, skills/skills_registry.json, skills/registry.txt,
model_registry.json + a stale nested copy at PURPCLAW/model_registry.json)
claim authority over "what exists." When they disagree, every higher-level
claim about skills, services, and launch readiness becomes suspect.

Your task: add a registry audit command that

  1. Inspects (READ-ONLY) every registry surface in the repo.
  2. Compares them for drift, conflicts, missing entries, and stale candidates.
  3. Reports:
     - service truth owner
     - capability truth owner
     - skill metadata owner
     - executable skill/tool owner
     - provider/model truth owner
     - stale/duplicate registry candidates
     - missing entries
     - conflicts
     - counts
     - recommended action per finding
     - risk level per finding
  4. Records the audit result as a Hivemind/Spring evidence trace
     (so the audit itself becomes cognitive loop input).
  5. Output as both human-readable text and JSON.

Constraints:
  - READ-ONLY audit only. Do NOT move, delete, or quarantine files.
  - Use the existing action dispatcher / CLI loader pattern in
    lib/commands/ — do not invent a new entry point.
  - Use the existing Hivemind trace recorder in lib/hivemind/ — do not
    invent a new logging system.
  - Touch the minimum number of files. Do not refactor unrelated systems.
  - Add a short test (node --check at minimum) that exercises the new
    command and proves it doesn't crash on the real repo.

Deliverables:
  - New file: lib/commands/<name>.js (the audit command)
  - New file: lib/reports/<name>.json (the audit report, written by the command)
  - One test under tests/ or lib/__tests__/ (smoke test is fine)
  - One paragraph added to docs/ explaining what the audit does
  - Update docs/PURPCLAW_HIVEMIND_LOOP_PROOF.md or
    docs/REGISTRY_RECONCILIATION.md with the audit results summary

You may use the project's README, DOCS.md, AGENTS.md, and existing
docs/ for context. Do not read or modify docs/PURPCLAW_MONSTER_LAUNCH_LEDGER.md,
docs/REGISTRY_RECONCILIATION.md, or docs/PURPCLAW_HIVEMIND_LOOP_PROOF.md
those exist as the benchmark's reference set.

When done, exit 0 and report:
  - files created
  - files modified
  - test command + result
  - one-paragraph summary of what the audit found
```

This task:

- Touches CLI (the command lives there)
- Touches Hivemind (the audit becomes a trace)
- Touches Spring (the trace gets a verdict)
- Touches docs (the audit summary lands somewhere)
- Touches tests (one smoke test)
- Uses existing architecture (action dispatcher, Hivemind modules)
- Requires restraint (READ-ONLY — must not move/delete)
- Produces a JSON report (verifiable output)

That covers the seven launch-relevant surfaces in one shot.

---

## Scoring Rubric (100 points)

| Category | Points | What We Measure |
|---|---:|---|
| Correctness | 20 | Does the audit command work end-to-end on the real repo? |
| Build passes | 15 | `node --check` on every JS file, smoke test exits 0 |
| Scope control | 15 | Files touched, lines added/deleted, no random rewrites |
| Architecture fit | 15 | Uses `lib/commands/` loader + `lib/hivemind/` trace recorder, no new patterns |
| Evidence / provenance | 10 | The audit is itself recorded as a Hivemind trace with Spring rank |
| UX / surface parity | 10 | Command works via `purpclaw` CLI (not just direct `node`) |
| Code quality | 10 | Small, readable, no dead code, no fake APIs |
| Handoff clarity | 5 | Documents touched files, what it does, what it doesn't do |

### Bonus / Malus

| Condition | Points |
|---|---:|
| +5 | Finds a real bug in the registries the test author didn't know about |
| -10 | Invents a fake API (e.g. `getAllServicesFromRegistry()` that doesn't exist) |
| -15 | Breaks the build |
| -20 | Rewrites unrelated systems |
| -25 | Claims success without running the test |
| instant fail | Deletes/rewrites major architecture without instruction |

### Killer Metric

> **Useful working feature per file touched.**

We compare `(files created + files modified)` against whether the audit actually works end-to-end. An agent that creates 3 files and produces a working audit scores higher than an agent that creates 12 files and produces a half-working audit.

---

## Capture Per Agent

For every run we record:

```text
- agent name + version
- start time / end time / total runtime
- model (if reported)
- files created
- files modified
- lines added / lines deleted
- test command output
- build result (node --check on all touched files)
- errors encountered
- self-reported reasoning summary
- final output (audit JSON)
- human intervention count (target: 0)
- final score
```

---

## Round 1: Clean Build (this run)

**Baseline:** fresh `git stash` of all my prior work (registry-audit.js, hivemind-test.js, skill-loader patch, etc.). All agents start from the same code state.

**Timebox:** 10 minutes per agent.

**Reproduction:**

```bash
# See /docs/benchmark/run-round-1.sh for the actual commands
```

---

## Results Will Be Appended Below

Round 1 results will be added after each agent finishes.

