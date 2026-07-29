---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# Codex CLI — Architecture Research

> Lane 1 of 4. Research phase only. No implementation.

## What It Is

OpenAI's official CLI coding agent. Built on the OpenAI Agents SDK (`agents`). Designed for terminal-first, repository-centric autonomous coding. Ships as a single CLI binary (`codex`) with optional language server integration.

## Core Architecture

```
OpenAI Agents SDK (agents)
├── model: GPT-4o / o1 / o3 / o4-mini (OpenAI API only)
├── tool execution layer
│   ├── bash (sandboxed subprocess)
│   ├── file read/write/edit
│   ├── glob / search
│   ├── web search
│   └── image capture (screenshots)
├── doses: task decomposition
│   ├── task: top-level job
│   └── subtask: child task with own loop
├── verify: result checking
├── model_settings: per-task model override
└── agent: configurable agent type
```

**Key design**: The SDK is framework-agnostic but Codex CLI is the reference harness. Agents can be composed via SDK in any Node.js or Python project.

## Provider Model

- **Only OpenAI models** — no multi-provider abstraction
- Model selection: `--model gpt-4o`, `--model o1`, `--model o3`
- Streaming: SSE by default
- API key: `OPENAI_API_KEY` env var
- Endpoint: `https://api.openai.com/v1` (configurable)

## Capability Surface

### 1. Task Decomposition (`doses`)

**What it does**: Breaks a prompt into subtasks, executes each in sequence, verifies results.

**Behaviour**:
- `codex --prompt "fix all TypeScript errors in src/"`
- Agent receives full task, decomposes into subtasks internally
- Subtasks run sequentially with result accumulation
- Final output is cumulative

**Edge cases**:
- Subtask failure: halts the chain, returns error state
- Partial success: returns completed subtasks + failed ones
- No automatic retry — explicit `--retry` flag triggers re-run

**vs PURPCLAW**: PURPCLAW's `task_decomposer.js` + `swarm_coordinator.js` + `agent_tower.js` provide equivalent task fan-out. The Codex approach is implicit decomposition; PURPCLAW's is explicit pipeline with named stages.

---

### 2. Bash / Shell Execution

**What it does**: Runs arbitrary shell commands in a sandboxed subprocess.

**Behaviour**:
- Every command is approved by default in non-interactive mode
- Interactive mode: confirmation prompt per command
- Working directory: project root (auto-detected from git)
- Timeout: configurable per invocation, default 60s

**Edge cases**:
- `rm -rf /`: blocked by sandbox (denylist)
- Long-running commands: streamed output, Ctrl+C interrupts
- Exit code != 0: treated as failure, halts task

**vs PURPCLAW**: PURPCLAW has `shell` tool in `bin/purpclaw.js` with `subprocess` execution. Sandbox/allowlist model is less restrictive in PURPCLAW — relies on OS permissions and tool-level governance.

---

### 3. File Operations

**What it does**: Read, write, edit files with full project context.

**Behaviour**:
- `read_file`: full file or line range
- `write_file`: atomic overwrite
- `edit`: patch-based edit (find/replace)
- Auto-create: missing files/dirs created on write
- Encoding: UTF-8 assumed, binary files handled gracefully

**Context awareness**:
- Project context injected as system prompt (file tree, git branch, recent diff)
- `.codexignore` similar to `.gitignore` for context exclusion

**Edge cases**:
- Large files: streamed with line limits (500 lines default)
- Binary files: rejected with error
- Concurrent edits: last-write-wins (no locking)

**vs PURPCLAW**: PURPCLAW's `write_file`, `patch`, `read_file` tools map 1:1. The `.codexignore` concept has no direct PURPCLAW equivalent — context filtering is implicit in prompt construction.

---

### 4. Repository Context

**What it does**: Injects git context into every prompt.

**Behaviour**:
- Git branch, uncommitted changes, recent commit messages
- File tree (respects `.codexignore`)
- Diff of staged changes
- Custom instructions via `.codex` config file

**Config file** (`.codex`):
```json
{
  "model": "gpt-4o",
  "system_prompt": "You are a senior engineer...",
  "tools": ["bash", "read", "edit"],
  "max_tokens": 16000
}
```

**Edge cases**:
- Non-git directory: falls back to current directory listing
- Large repos: context truncated to fit token budget
- Private `.codex` settings: never sent to API (local only)

**vs PURPCLAW**: PURPCLAW's `lib/context-engine.js` provides equivalent context injection. The `.codex` config file maps to `purpclaw.json` or `.purpclaw/` profile settings. No `.codexignore` equivalent exists in PURPCLAW.

---

### 5. Image / Screenshot Input

**What it does**: Captures screenshots and sends as base64 image input.

**Behaviour**:
- `--screenshot` flag captures current terminal state
- Tool: `screenshot` tool in agent toolkit
- Format: PNG base64, 1024px wide max
- Used for visual verification of UI changes

**Edge cases**:
- No display: fails gracefully (headless detection)
- Large image: downscaled before sending

**vs PURPCLAW**: No equivalent in PURPCLAW. The `desktop_automation` / `computer_use` tools in Hermes provide screenshot capability, but not as a Codex-style inline tool.

---

### 6. Verification Loop

**What it does**: Runs a verification check after task completion.

**Behaviour**:
- `verify` block in task: defines pass/fail criteria
- Exit code 0 = pass, non-zero = fail
- Fails trigger implicit retry (up to `max_retries`)

**Example**:
```
Task: fix the login bug
Verify: run tests/login_test.py
  - exit 0 → task complete
  - exit 1 → retry
```

**Edge cases**:
- Verification script missing: skips verification
- Infinite loop prevention: `max_retries` cap (default 3)

**vs PURPCLAW**: No equivalent explicit `verify` block. Error-level assertions in tests provide indirect verification. This is a gap worth examining.

---

### 7. Planning Mode

**What it does**: Explicit planning phase before execution.

**Behaviour**:
- `--plan` flag: generates a plan first, user approves, then executes
- Two-phase: PLAN → EXECUTE
- Plan is a markdown document output by the model

**Edge cases**:
- Plan rejection: user can modify plan text, agent re-runs planning
- Complex tasks: plan may be partial, execution fills gaps

**vs PURPCLAW**: No explicit two-phase plan-then-execute in CLI. The `plan` skill exists in PURPCLAW's skill library but is not a built-in CLI mode. Gap: Partial.

---

### 8. Approvals / Interactive Confirmation

**What it does**: Per-command confirmation in interactive mode.

**Behaviour**:
- `codex --interactive` (or `codex -i`)
- Every bash command prints confirmation prompt
- User: `y/n/y-all/n-all/edit`
- `y-all`: auto-approves remaining commands in session

**Edge cases**:
- Long output: paginated, user can scroll
- Silent mode: `CI=1 codex` disables all prompts (batch mode)
- Timeout: 60s to respond, then default to `n`

**vs PURPCLAW**: `lib/approval-prompt.js` provides interactive approval for destructive/expensive operations. Not per-command by default. Gap: Partial.

---

## Commands

```bash
codex [OPTIONS] [PROMPT]           # Run a task
codex --plan PROMPT                 # Plan only
codex --interactive PROMPT          # Interactive confirm mode
codex --model MODEL PROMPT          # Model override
codex --config PATH                 # Custom config file
codex --eval SCRIPT                 # Run eval script
OPENAI_API_KEY=xxx codex PROMPT     # API key via env
```

## Key Strengths (to extract patterns from)

1. **Repository context injection** — `.codexignore`, git diff, file tree
2. **Verification blocks** — explicit pass/fail criteria per task
3. **Planning mode** — two-phase plan-then-execute
4. **Simple CLI interface** — one binary, minimal config
5. **Sandboxed bash** — deny list for dangerous commands

## Observable Gaps vs PURPCLAW

| Capability | Codex | PURPCLAW | Status |
|---|---|---|---|
| Task decomposition | SDK-level | task_decomposer + swarm | Partial |
| Repository context | .codexignore | context-engine | Partial |
| Verification blocks | Explicit verify+retry | Test assertions | Missing |
| Planning mode | Built-in --plan | Skill only | Missing |
| Per-command approval | -i interactive | approval-prompt.js | Partial |
| Screenshot tool | Built-in | computer_use (Hermes) | Missing |
| Multi-provider | No | Yes | PURPCLAW wins |
| Skills system | No | 380 skills | PURPCLAW wins |
| Agent memory | No (stateless) | Full memory layer | PURPCLAW wins |

## Evidence Sources

- Training data: OpenAI Agents SDK documentation, Codex CLI GitHub, user reports
- Last verified: 2026-07-20 (training cutoff)
