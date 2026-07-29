> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PURPCLAW Honest Gap Analysis
**Date:** 2026-07-16
**Against:** Claude Code (primary), not spreadsheet competitors

---

## What the 88/88 Audit Actually Measures

The parity audit compares PURPCLAW against LangGraph, CrewAI, AutoGen, Semantic Kernel — **framework libraries**, not CLI products. Claude Code is a terminal-first coding agent with a polished UX. PURPCLAW's audit says 88/88 because it's winning a race against other Python libraries, not a desktop tool.

---

## Critical Gaps vs Claude Code

### 1. ❌ No Git Operations
Claude Code ships `git diff`, `git commit`, `git branch`, `git status` as first-class tools. PURPCLAW has **zero git files** on disk.
**Impact:** Can't version-control its own work without external git.

---

### 2. ❌ No Sandbox / Filesystem Isolation
Claude Code sandboxes file operations. A coding agent writing to the filesystem needs containment. PURPCLAW has no sandbox layer.
**Impact:** A bad agent instruction can wipe or corrupt anywhere on the filesystem.

---

### 3. ❌ No Per-Task Cost Accounting
Claude Code shows cost-per-task, tokens used, and provider spend in real-time. PURPCLAW has no cost tracker.
**Impact:** No visibility into what's costing what. Eddie gets surprised by API bills.

---

### 4. ❌ No Workspace Context Model
Claude Code maintains a workspace model — it auto-reads relevant files for a task, tracks what's been read, and uses that to guide tool selection. PURPCLAW has no workspace context manager.
**Impact:** Agents work with stale or missing context. No "read these files before you touch anything."

---

### 5. ❌ No PTY Terminal
Claude Code uses `node-pty` for real terminal emulation (bash, zsh, ssh). PURPCLAW's shell tool is a basic spawn — no PTY, no interactive sessions, no SSH.
**Impact:** Interactive terminals, SSH sessions, and curses-based tools don't work.

---

### 6. ❌ No Permission Approval Queue
Claude Code queues permission requests (file writes, shell commands) and shows the user exactly what's about to happen. PURPCLAW has no approval queue.
**Impact:** Tools execute without user visibility. No "I'm about to delete 50 files, OK?"

---

### 7. ❌ No Execution Guardrails
Claude Code has safety guardrails for `rm -rf`, destructive operations, and network calls. PURPCLAW has no execution guard layer.
**Impact:** A prompt injection or bad instruction can execute destructive commands silently.

---

### 8. ❌ No Config File
Claude Code reads `.clauderc` for settings, model preferences, allowed tools, and workspace rules. PURPCLAW has no config file — only `.env`.
**Impact:** No per-project settings, no user preferences file, no `.purpclawrc`.

---

### 9. ❌ No Tab Completion
Claude Code ships shell tab completion for its CLI. PURPCLAW has a `completion` command mentioned but no actual completion implementation.
**Impact:** Poor CLI UX. Users can't tab-complete `purpclaw ask`, `purpclaw run`, etc.

---

### 10. ❌ No Task Progress Persistence
Claude Code persists multi-step task progress. If it dies mid-task, it resumes from where it left off. PURPCLAW has no task progress state.
**Impact:** Long tasks die completely on crash. No recovery.

---

## What PURPCLAW Actually Has That Claude Code Doesn't

- **153 agents** vs Claude Code's single-agent model
- **22 LLM providers** vs Claude Code's Anthropic-only
- **380 skills** for domain-specific tasks
- **A2A protocol** for multi-agent communication
- **Event ledger** for audit trails
- **Cognitive memory** with vector search
- **Knowledge pool** for RAG
- **Multi-agent orchestration** (swarm, coordinator, tower)
- **TUI + WebUI + desktop app** vs Claude Code's terminal-only

---

## Verdict

**PURPCLAW wins as an agent *platform*. Claude Code wins as a *coding agent*.**

The 88/88 audit is real but measures the wrong race. The gap to Claude Code is not in features — it's in execution quality, safety, and UX polish. A user who wants to code would reach for Claude Code. A user who wants to *orchestrate a swarm of coding agents* would reach for PURPCLAW.

These are different products. The gap to close is making PURPCLAW's coding agents as safe and ergonomic as Claude Code, not adding more framework features to the audit.

---

## Priority Order to Close Gaps

1. **Git operations** — immediate utility, easy win
2. **Permission approval queue** — safety critical
3. **Execution guardrails** — safety critical
4. **Cost accounting** — financial visibility
5. **Workspace context model** — quality of agent output
6. **Sandbox** — filesystem safety
7. **PTY terminal** — interactive tool support
8. **Config file** — UX polish
9. **Task progress persistence** — reliability
