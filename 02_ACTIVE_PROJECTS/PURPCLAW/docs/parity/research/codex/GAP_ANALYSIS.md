---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# Codex Gap Analysis

> Phase 5 output. Evidence-backed classification of each capability.

## Classification Legend

| Status | Meaning |
|---|---|
| **Native** | Exists in PURPCLAW, behaviour matches or exceeds |
| **Partial** | Exists but behaviour differs or is incomplete |
| **Adapter Needed** | Exists in harness, needs adapter layer in PURPCLAW |
| **Missing** | Not implemented anywhere in PURPCLAW |
| **Rejected** | Deliberately not implementing — reason documented |

---

## CAP-001: Sandboxed Shell Execution

| Field | Value |
|---|---|
| Codex | Deny-list blocks dangerous commands at spawn |
| PURPCLAW | `lib/shell.js` — OS-level sandbox only, no deny-list |
| **Status** | Partial |
| **Evidence** | PURPCLAW has no `rm -rf /` or fork-bomb protection |
| **Action** | Add deny-list to `lib/shell.js` — low effort, high safety value |

---

## CAP-002: Task Decomposition

| Field | Value |
|---|---|
| Codex | Implicit — model decides, sequential chain |
| PURPCLAW | `lib/task_decomposer.js` + `lib/swarm_coordinator.js` — explicit pipeline |
| **Status** | Native |
| **Evidence** | PURPCLAW's approach is more structured, not less capable |
| **Action** | None — mark as Native and move on |

---

## CAP-003: Verification Blocks

| Field | Value |
|---|---|
| Codex | `verify` block in SDK: exit-code-driven, retry on fail |
| PURPCLAW | No equivalent inline verification |
| **Status** | Missing |
| **Evidence** | No `verify` keyword in any PURPCLAW source |
| **Action** | **Implement — Phase 6 spec: SPEC-001** |

---

## CAP-004: Planning Mode

| Field | Value |
|---|---|
| Codex | `--plan` flag: plan → approve → execute |
| PURPCLAW | `skills/plan.md` skill exists, not a native CLI mode |
| **Status** | Partial |
| **Evidence** | `purpclaw plan` is a skill, not `purpclaw --plan` |
| **Action** | Wire `--plan` flag in `bin/purpclaw.js` calling the existing plan skill |

---

## CAP-005: Repository Context

| Field | Value |
|---|---|
| Codex | `.codexignore` exclusion, git context, file tree |
| PURPCLAW | `lib/context-engine.js` — no exclusion file |
| **Status** | Partial |
| **Evidence** | `.codexignore` has no PURPCLAW equivalent |
| **Action** | Add `.purpclawignore` support in `lib/context-engine.js` |

---

## CAP-006: Screenshot Tool

| Field | Value |
|---|---|
| Codex | `screenshot` tool, base64 PNG, 1024px max |
| PURPCLAW | No inline screenshot tool in agent loop |
| **Status** | Missing |
| **Evidence** | No screenshot tool registration in `lib/tools/registry.js` |
| **Action** | Implement as optional tool in `lib/tools/` — not critical path |

---

## CAP-007: Per-Command Approval

| Field | Value |
|---|---|
| Codex | Interactive mode: `y/n/y-all/n-all/edit` per command |
| PURPCLAW | `lib/approval-prompt.js` — reactive approval for destructive ops |
| **Status** | Partial |
| **Evidence** | Approval exists but not the full interactive `y-all`/`n-all`/`edit` flow |
| **Action** | Extend `lib/approval-prompt.js` with full interactive keyboard controls |

---

## CAP-008: Model Selection

| Field | Value |
|---|---|
| Codex | `--model` flag, per-invocation override |
| PURPCLAW | `LLM_MODEL` env + per-call `model` body field + `PROVIDER_MODEL_MAP` |
| **Status** | Native |
| **Evidence** | Multi-provider + per-call override is strictly more capable |
| **Action** | None |

---

## CAP-009: Sub-Agent Spawning

| Field | Value |
|---|---|
| Codex | `doses.subtask()` in SDK — child agent loops |
| PURPCLAW | `lib/agent_tower.js` + `lib/agent_harness.js` + `agent_tower.py` |
| **Status** | Native |
| **Evidence** | PURPCLAW has richer subagent architecture with shared memory spine |
| **Action** | None |

---

## CAP-010: Session Resume

| Field | Value |
|---|---|
| Codex | `codex --resume session-id` replays context |
| PURPCLAW | Session IDs exist (`session-xxx`), logs stored, resume not documented as feature |
| **Status** | Partial |
| **Evidence** | `session-xxx` IDs visible in output but no `--resume` CLI flag |
| **Action** | Add `--resume` flag in `bin/purpclaw.js` loading session log |

---

## CAP-011: Destructive Command Protection

| Field | Value |
|---|---|
| Codex | Proactive deny-list at shell spawn |
| PURPCLAW | No proactive block — reactive approval only |
| **Status** | Missing |
| **Evidence** | No deny-list in `lib/shell.js` |
| **Action** | **Implement — Phase 6 spec: SPEC-002** |

---

## CAP-012: Multi-turn Streaming

| Field | Value |
|---|---|
| Codex | SSE token streaming, real-time display |
| PURPCLAW | `response_stream` in `lib/agent-loop.js` |
| **Status** | Partial |
| **Evidence** | Streaming exists, token-level real-time UX not confirmed |
| **Action** | Verify real-time token display in CLI output |

---

## Gap Summary

| # | Capability | Status | Action |
|---|---|---|---|
| CAP-001 | Sandboxed shell | Partial | Add deny-list |
| CAP-002 | Task decomposition | Native | — |
| CAP-003 | Verification blocks | **Missing** | SPEC-001 |
| CAP-004 | Planning mode | Partial | Wire --plan |
| CAP-005 | Repository context | Partial | Add .purpclawignore |
| CAP-006 | Screenshot tool | Missing | Implement as optional |
| CAP-007 | Per-command approval | Partial | Extend approval-prompt |
| CAP-008 | Model selection | Native | — |
| CAP-009 | Sub-agent spawning | Native | — |
| CAP-010 | Session resume | Partial | Add --resume flag |
| CAP-011 | Destructive protection | **Missing** | SPEC-002 |
| CAP-012 | Multi-turn streaming | Partial | Verify UX |

**Immediate actions**:
1. SPEC-001: Verification blocks
2. SPEC-002: Deny-list shell protection
3. Wire `--plan` flag (small)
4. Add `--resume` flag (small)
5. Add `.purpclawignore` support (small)
