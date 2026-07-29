---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# Codex CLI — Capability Inventory

> Phase 2 output. Each capability extracted with ID, behaviour, evidence, PURPCLAW mapping.

---

## CAP-001: Sandboxed Shell Execution

**Category**: Execution  
**Purpose**: Run arbitrary shell commands in an isolated subprocess with deny-list protection.  
**Why it exists**: Agents need to execute code, run tests, interact with the filesystem — they need a live shell.  
**User value**: "The agent can actually run things, not just describe what it would do."  
**Dependencies**: None (core runtime)  
**Surface**: CLI only  
**Provider**: OpenAI only  
**Priority**: Critical  

**Behaviour**:
- Every invocation: `bash -c "command"` in a spawned subprocess
- Deny-list blocks: `rm -rf /`, fork bombs, interactive prompts
- Timeout per command (default 60s), streamed output
- Exit code checked — non-zero treated as failure
- Interactive mode: confirmation prompt before each command

**Edge cases**:
- `SIGINT` (Ctrl+C): graceful termination of child process tree
- `sudo` commands: require TTY, fail in sandbox
- Piped commands: fully supported (no TTY required)
- Large output: streamed, not buffered to memory

**PURPCLAW mapping**: `lib/shell.js` + `bin/purpclaw.js` shell tool. PURPCLAW has no deny-list — relies on OS permissions + approval-prompt. **Partial: missing deny-list.**

---

## CAP-002: Task Decomposition

**Category**: Planning / Execution  
**Purpose**: Break a complex prompt into sequential subtasks, execute each, accumulate results.  
**Why it exists**: Complex goals don't fit one prompt — the agent needs to sequence steps.  
**User value**: "Tell it a big goal, it figures out the steps itself."  
**Dependencies**: Model capability (reasoning), shell execution  
**Surface**: CLI, SDK  
**Provider**: OpenAI only  
**Priority**: High  

**Behaviour**:
- Implicit decomposition — model decides internally
- Subtasks run sequentially in a shared context
- Failure in any subtask halts the chain
- No automatic retry unless `--retry` specified
- `doses.subtask()` in SDK for explicit child tasks

**Edge cases**:
- 10+ subtasks: context window pressure, no automatic batching
- Circular dependency: detected by failure, no formal cycle detection
- Subtask writes to same file: last-write-wins, no locking

**PURPCLAW mapping**: `lib/task_decomposer.js` + `lib/swarm_coordinator.js` + `lib/agent_tower.js`. PURPCLAW's decomposition is explicit pipeline (not implicit model decision). **Native: PURPCLAW wins.**

---

## CAP-003: Verification Blocks

**Category**: Quality / Reliability  
**Purpose**: Define pass/fail criteria that run after task completion.  
**Why it exists**: Agents can claim success but be wrong — verification provides evidence.  
**User value**: "I know it actually worked, not just that it finished."  
**Dependencies**: Shell execution, test framework  
**Surface**: SDK (not in CLI directly)  
**Provider**: OpenAI only  
**Priority**: High  

**Behaviour**:
```python
Task("fix the login bug")
  .verify(lambda: run("tests/login_test.py"))
```
- Exit 0 = pass, non-zero = fail
- Fail triggers retry (up to `max_retries`, default 3)
- Verification output shown to user

**Edge cases**:
- Verification script missing: silently skipped
- Slow tests: no timeout override at block level (uses shell timeout)
- False positives: verification script can itself be buggy

**PURPCLAW mapping**: No equivalent. Test files exist but no inline `verify` block in agent loop. **Gap: Missing.**

---

## CAP-004: Planning Mode

**Category**: UX / Safety  
**Purpose**: Two-phase execution — generate plan, user approves, then execute.  
**Why it exists**: For risky or complex operations, users want to review before commitment.  
**User value**: "I can see what it plans to do before it does it."  
**Dependencies**: Model reasoning, streaming output  
**Surface**: CLI (`--plan` flag)  
**Provider**: OpenAI only  
**Priority**: High  

**Behaviour**:
- `codex --plan "migrate database to postgres"`
- Agent outputs a markdown plan (not executable)
- User reviews, can edit plan text, can approve
- On approval: executes the plan
- On rejection: exits

**Edge cases**:
- Ambiguous plan: model may output "TBD" for uncertain steps
- Plan references files not in context: execution may fail
- Plan is not executable code: it's prose + shell commands

**PURPCLAW mapping**: `purpclaw plan` skill exists but not a built-in CLI mode. Not wired as `--plan` equivalent in `bin/purpclaw.js`. **Gap: Partial — skill exists but not native mode.**

---

## CAP-005: Repository Context Injection

**Category**: Context / Intelligence  
**Purpose**: Inject git status, file tree, recent commits, and custom instructions into every prompt.  
**Why it exists**: Agents need project context to make relevant changes.  
**User value**: "It already knows about my project without me explaining it."  
**Dependencies**: Git, filesystem, `.codexignore`  
**Surface**: CLI, SDK  
**Provider**: OpenAI only  
**Priority**: Critical  

**Behaviour**:
- On startup: `git branch`, `git status`, recent `git log --oneline -10`
- File tree: walks project root, respects `.codexignore`
- Custom instructions: `.codex` JSON config file
- Token budget: context truncated if over limit

**`.codex` config schema**:
```json
{
  "model": "gpt-4o",
  "system_prompt": "You are...",
  "tools": ["bash", "read", "edit"],
  "max_tokens": 16000
}
```

**Edge cases**:
- Non-git repo: lists current directory files instead
- Large repo: file tree truncated at ~1000 entries
- Binary files in tree: excluded automatically

**PURPCLAW mapping**: `lib/context-engine.js`. `.codexignore` → no direct equivalent (PURPCLAW has no context exclusion file). `.codex` config → `purpclaw.json` / profile settings. **Partial: context engine is richer but lacks exclusion file.**

---

## CAP-006: Screenshot / Visual Capture

**Category**: Verification  
**Purpose**: Capture terminal or screen state as image input for the model.  
**Why it exists**: Verify UI changes visually, capture error states, document progress.  
**User value**: "It can see what I see."  
**Dependencies**: Screenshot tool, image encoding  
**Surface**: CLI (`--screenshot`), SDK  
**Provider**: OpenAI only  
**Priority**: Medium  

**Behaviour**:
- `screenshot` tool in agent toolkit
- Captures current terminal/display state
- Resizes to 1024px wide max
- Sends as base64 PNG to model with text prompt

**Edge cases**:
- Headless environment: tool fails gracefully (no display)
- Large image: downscaled to fit model token budget
- Rapid screenshots: no rate limit, user responsibility

**PURPCLAW mapping**: No inline screenshot tool in PURPCLAW agent loop. Hermes `computer_use` provides this for desktop. **Gap: Missing from PURPCLAW native loop.**

---

## CAP-007: Per-Command Approval

**Category**: Safety / Governance  
**Purpose**: Interactive confirmation before each shell command executes.  
**Why it exists**: Prevent destructive commands from running without oversight.  
**User value**: "I can catch bad commands before they run."  
**Dependencies**: TTY, streaming output  
**Surface**: CLI (`-i` / `--interactive`)  
**Provider**: OpenAI only  
**Priority**: High  

**Behaviour**:
```
$ codex -i "delete old logs"
? Run: rm -rf logs/*.log  [y/n/y-all/n-all/edit]
```
- `y`: approve one command
- `n`: skip command, continue to next
- `y-all`: approve remaining without asking
- `n-all`: skip all remaining
- `edit`: opens command in editor for modification

**Edge cases**:
- `CI=1` env var: bypasses all prompts (batch/CI mode)
- Timeout: 60s to respond, defaults to `n`
- Long command: paginated in terminal

**PURPCLAW mapping**: `lib/approval-prompt.js` — approves destructive/expensive operations, not per-command. **Partial: approval exists but not full interactive mode.**

---

## CAP-008: Configurable Model Selection

**Category**: Provider / Flexibility  
**Purpose**: Override the default model per invocation or per config.  
**Why it exists**: Different tasks benefit from different models (fast vs capable).  
**User value**: "I can use o1 for reasoning and 4o for fast edits."  
**Dependencies**: OpenAI API, multiple model keys  
**Surface**: CLI (`--model`), SDK, `.codex` config  
**Provider**: OpenAI only  
**Priority**: Medium  

**Behaviour**:
- `codex --model o1 "complex reasoning task"`
- `codex --model gpt-4o-mini "quick fix"`
- Model baked into API call, not runtime-switched mid-session
- `.codex` config sets default model for all runs

**Edge cases**:
- Model not available: API error, no fallback
- Rate limits vary by model: no automatic fallback
- Cost: no budget tracking per model

**PURPCLAW mapping**: `LLM_MODEL` env var + per-call `model` field via body. Provider abstraction makes this richer in PURPCLAW. **Native: PURPCLAW wins.**

---

## CAP-009: Sub-Agent Spawning (SDK)

**Category**: Orchestration  
**Purpose**: Spawn child agents with their own loops, pass results back to parent.  
**Why it exists**: Divide and conquer complex tasks across specialist agents.  
**User value**: "It can delegate to other agents automatically."  
**Dependencies**: `doses.subtask()`, shared API key  
**Surface**: SDK only (not in CLI)  
**Provider**: OpenAI only  
**Priority**: High  

**Behaviour**:
```python
sub = subtask("write the tests", model="gpt-4o")
result = sub.run()
```
- Child agent has its own full agent loop
- Can use different model from parent
- Results serialised back to parent
- No shared memory between subtasks

**Edge cases**:
- 10+ simultaneous subtasks: API rate limits hit fast
- Subtask crashes: parent notified, chain halts
- Cost: each subtask = separate API call, costs multiply

**PURPCLAW mapping**: `lib/agent_tower.js` + `lib/agent_harness.js` + `agent_tower.py` (Python). Full subagent spawning with shared memory via `memory_matrix_v2`. **Native: PURPCLAW wins.**

---

## CAP-010: Session State / Resume

**Category**: Persistence  
**Purpose**: Resume a previous task after interruption.  
**Why it exists**: Long tasks get interrupted; users need to continue without restarting.  
**User value**: "I can pick up where I left off."  
**Dependencies**: Session store, filesystem  
**Surface**: CLI  
**Provider**: OpenAI only  
**Priority**: Medium  

**Behaviour**:
- Sessions stored in `~/.codex/sessions/`
- `codex --resume session-id` replays context
- Tool outputs from previous turns included in new context
- Manual: user identifies which session to resume

**Edge cases**:
- Session expiry: no automatic TTL, manual cleanup
- Large session: token limit hit fast on resume
- Concurrent resumes: no locking, last-write-wins

**PURPCLAW mapping**: Session IDs exist in PURPCLAW (`session-xxx`) and session logs are stored. Full resume capability not explicitly documented as a user-facing feature. **Partial: session IDs exist but resume UX is unclear.**

---

## CAP-011: Destructive Command Protection

**Category**: Safety  
**Purpose**: Deny-list blocks commands that would destroy the system.  
**Why it exists**: Autonomous agents can issue destructive commands; some guardrails are needed.  
**User value**: "It won't accidentally wipe my system."  
**Dependencies**: Command parser, deny-list  
**Surface**: CLI (sandbox)  
**Provider**: OpenAI only  
**Priority**: High  

**Behaviour**:
- Blocked patterns: `rm -rf /`, `mkfs`, `:(){:|:&};:`, interactive `vim`/`nano`
- Block happens at shell spawn, not at model output
- Blocked command returns error: `Blocked command: rm -rf /`

**Edge cases**:
- Allowlisted subdirectories: `rm -rf /tmp` allowed
- Variants: `rm -rf /*` blocked, `rm -rf /home` allowed (not `/`)
- Path traversal: blocked

**PURPCLAW mapping**: No deny-list. `lib/approval-prompt.js` handles destructive ops reactively (not proactively). **Gap: Missing deny-list.**

---

## CAP-012: Multi-turn Streaming

**Category**: UX  
**Purpose**: Stream model output token-by-token for real-time visibility.  
**Why it exists**: Transparency — users see the agent thinking in real time.  
**User value**: "I can watch it work instead of waiting blind."  
**Dependencies**: SSE streaming, terminal rendering  
**Surface**: CLI  
**Provider**: OpenAI only  
**Priority**: High  

**Behaviour**:
- All output streamed via SSE (`text/event-stream`)
- Terminal renders tokens as they arrive
- Tool calls shown with `...` during execution, result after
- Interruption (`Ctrl+C`) terminates mid-stream

**Edge cases**:
- Terminal doesn't support ANSI: falls back to buffered output
- Very long output: auto-scrolls, can scroll up to review
- Network interruption: partial output preserved, retry available

**PURPCLAW mapping**: `lib/agent-loop.js` streams output via `response_stream` mechanism. Not confirmed if raw token streaming is exposed to user in real-time. **Partial: streaming exists but token-level visibility unclear.**

---

## Summary: PURPCLAW Gap Status

| ID | Capability | Status |
|---|---|---|
| CAP-001 | Sandboxed shell + deny-list | Partial (no deny-list) |
| CAP-002 | Task decomposition | Native (PURPCLAW wins) |
| CAP-003 | Verification blocks | **Missing** |
| CAP-004 | Planning mode | Partial (skill exists, not native) |
| CAP-005 | Repository context | Partial (no exclusion file) |
| CAP-006 | Screenshot tool | **Missing** |
| CAP-007 | Per-command approval | Partial (approval exists, not per-command) |
| CAP-008 | Model selection | Native (PURPCLAW wins) |
| CAP-009 | Sub-agent spawning | Native (PURPCLAW wins) |
| CAP-010 | Session resume | Partial (IDs exist, resume UX unclear) |
| CAP-011 | Destructive command protection | **Missing** |
| CAP-012 | Multi-turn streaming | Partial (streaming exists, token-level unclear) |

**High-priority gaps**: CAP-003 (verification blocks), CAP-011 (deny-list), CAP-004 (native planning mode)
