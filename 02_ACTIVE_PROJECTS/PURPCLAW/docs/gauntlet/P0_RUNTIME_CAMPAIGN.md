# PURPCLAW P0 Runtime Integrity — Gauntlet Campaign

**Started:** 2026-07-29
**Method:** Matt Shumer Gauntlet Loop (corrected per Eddie Cannon)
**Repository:** `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`
**Authority:** `docs/gauntlet/P0_RUNTIME_STATE.json` (JSON state is authoritative; this document is plan-only)

> ⚠️ This document is PLAN-ONLY. The JSON state file is the live authority.
> Do not use this document to determine campaign status — read `P0_RUNTIME_STATE.json` instead.

---

## Original Goal

> PURPCLAW P0 Runtime Integrity: boot, persistence, permissions and genuine provider routing.

Make PURPCLAW's canonical runtime genuinely bootable, persistent, permission-governed and controlled by its provider settings.

---

## Quality Bar (12 Acceptance Criteria)

1. `purpclaw ask --help` starts without a DatabaseSync failure.
2. A session can be created, persisted, process-restarted, loaded and resumed.
3. Persistence initialization failure is never silently swallowed.
4. CLI, HTTP, MCP and delegated-agent tool calls pass through the canonical ToolRuntime and permission evaluator.
5. The same forbidden operation is denied through CLI, HTTP and MCP with auditable evidence.
6. MCP performs no direct raw-shell bypass.
7. Provider and lane settings control actual model execution.
8. Two configured lanes can prove distinct provider/model resolution.
9. Existing CLI Chunk 1 behaviour remains working.
10. Repository truth, harness, parity and documentation gates pass.
11. A fresh final critic verifies the real diff, running behaviour and evidence against this original prompt.
12. Completion requires a clean integration commit containing only reviewed work.

---

## Wave Structure

```
Wave A  Runtime boot and session persistence
Wave B  ToolRuntime and permission enforcement
Wave C  Provider settings controlling real execution
Wave D  Cross-surface integration and conformance
```

**Dependency rule:** Wave A must pass and land before Waves B and C start.
Waves B and C may run concurrently ONLY if their file ownership is disjoint.
Wave D begins only after Waves A, B, C pass.

---

## Workstreams

| ID | Component | Owner | Worktree | Status | Critic |
|----|-----------|-------|----------|--------|--------|
| W-A1 | Runtime boot / DatabaseSync | builder-db | wt-gauntlet-db | PENDING | critic-db |
| W-B1 | ToolRuntime + permission enforcement | builder-perm | wt-gauntlet-perm | BLOCKED | critic-perm |
| W-C1 | Provider routing / lane resolution | builder-prov | wt-gauntlet-prov | BLOCKED | critic-prov |
| W-D1 | Integration + final conformance | integration-owner | wt-gauntlet-integration | BLOCKED | critic-final |

---

## Execution Rules (Eddie Cannon corrections to Shumer)

- Parallelise **independent** lanes only
- Serialise **coupled** runtime work
- One builder per worktree — **no shared files**
- One **fresh blind critic** per builder with separate CLI context
- Integration owner **never implements features**
- Builder **cannot grade itself**
- Maximum **8 build-review cycles** per component
- Stop after **2 consecutive cycles with no measurable improvement**
- Never `git add -A`, `git reset --hard`, `git clean`, or broad checkout
- Stage **explicit paths only**
- **Safety stop** on unexplained unrelated repository modification
- Do not start a new runtime, core_v2, compatibility runtime or replacement CLI

---

## Current State

**Campaign:** NOT STARTED
**Wave A:** PENDING
**Wave B:** BLOCKED by A
**Wave C:** BLOCKED by A
**Wave D:** BLOCKED by B+C

---

## Campaign Log

_(updated after each critic round)_
