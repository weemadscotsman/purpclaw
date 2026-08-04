# EXEC MODE DECISION — `purpclaw exec`

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md). This file records one implementation decision and cannot redefine parity or claim completion.

**Date:** 2026-07-29
**Author:** PARITY-A
**Decision:** Full Agent Loop Batch Mode — Option B

---

## Context

`purpclaw exec --` is the non-interactive, one-shot agent execution command. Before writing any code, the architecture must be chosen:

- **Option A — Lightweight Single-Call Mode:** One provider API call, no tool loop, `max_tokens` bound, returns result. Fast and stateless.
- **Option B — Full Agent Loop Batch Mode:** Runs the full tool-capable agent loop without streaming, collects all tool calls, returns final result. Slower but tool-capable.

---

## Analysis

PURPCLAW is a **coding agent**. Its primary use cases include:

- Running git operations (`git commit`, `git push`, `git branch`)
- Reading and writing files
- Running tests (`npm test`, `pytest`, etc.)
- Executing shell commands for code exploration
- Invoking linters, formatters, and build tools

These are not natural outputs of a single LLM API call. A coding agent needs to:

1. Read a file to understand the codebase
2. Decide what changes are needed
3. Write/modify files
4. Run tests to verify
5. Loop until the task is complete

This requires a **tool loop** — the agent calls tools, gets results, and continues reasoning.

### Why Option A Fails for a Coding Agent

- `max_tokens` cannot anticipate how much output a complex task requires
- A stateless single call cannot handle multi-step workflows (read → think → write → test → fix)
- No ability to invoke git, file I/O, or shell commands
- Cannot recover from errors mid-task
- No checkpointing or session persistence

Option A is appropriate for simple Q&A, translation, summarization — **not** for a coding agent doing real development work.

### Why Option B Is Correct

The full agent loop batch mode:

- Uses the same `agent-loop` that powers `purpclaw ask` interactively
- Supports all built-in tools (read, write, edit, glob, bash, git, etc.)
- Supports MCP server tools
- Handles multi-step tasks with error recovery
- Streams can be suppressed (no `--stream` flag = batch mode), collecting all output until done
- Preserves session history for audit/replay

### Performance Concern

Option B is slower because it runs multiple LLM calls (one per agent turn). Mitigation:

- Use a fast/cheap model for exec when possible (`LLM_FALLBACK=ollama` for local fast responses)
- Limit max turns via `--max-turns=N` (default 50)
- Implement timeout: `--timeout-sec=N`
- Option B with suppressed streaming collects output in a buffer and returns it all at once — suitable for CI/CD and scripts

---

## Decision

**Use Option B: Full Agent Loop Batch Mode.**

`purpclaw exec --` will:

1. Accept a task prompt and optional flags (`--model`, `--provider`, `--max-turns`, `--timeout-sec`)
2. Boot the agent loop (same engine as interactive `purpclaw ask`)
3. Run to completion (or until max-turns/timeout), suppressing streaming output
4. Return the final agent message as structured JSON or plain text

---

## Implementation Plan

The exec command is built as `lib/commands/exec.js`, added to the CLI dispatch table in `bin/purpclaw.js`.

```bash
purpclaw exec -- "fix the auth bug in lib/auth.js"
purpclaw exec -- --model ollama --max-turns 20 -- "run the test suite"
```

---

## Vision-Capable Providers (for `--image` flag, rank 5)

The `--image` flag requires a vision-capable model. Not all providers support image input. The following are known to support vision:

| Provider    | Model(s) with Vision | Notes |
|-------------|---------------------|-------|
| openai      | gpt-4o, gpt-4o-mini | Full vision support |
| anthropic   | claude-3-5-sonnet, claude-3-5-haiku | Full vision via Messages API |
| gemini      | gemini-2.5-flash, gemini-1.5-pro | Full vision via `image` parts |
| minimax     | MiniMax-M2.7 (this model) | Vision confirmed |
| nvidia      | Various (via NIM) | Depends on specific model |
| openrouter  | Many (routed models) | Check specific model capabilities |

**Vision detection logic:**

1. When `--image <path>` is passed, read the image file and base64-encode it
2. Check the active provider/model combination
3. If provider supports vision natively (Anthropic, Gemini, OpenAI, Minimax), pass as `image_url` data URL in the message content array
4. If provider does not support vision, return an error explaining the limitation and suggesting a vision-capable alternative
5. Document this in exec.js with the table above

---

## Exec Mode Flag Summary

| Flag | Description | Default |
|------|-------------|---------|
| `--model <m>` | Override model | auto |
| `--provider <p>` | Override provider | auto |
| `--max-turns <n>` | Hard cap on agent turns | 50 |
| `--timeout-sec <n>` | Hard timeout in seconds | 300 |
| `--image <path>` | Attach image (vision-capable models only) | none |
| `--json` | Output final result as JSON | false |

---

## Related Decisions

- `purpclaw ask --image` (rank 5) uses the same vision pipeline and is unblocked after this decision.
- The agent loop in `lib/agent-loop.js` already supports non-streaming batch mode — the exec command is a thin wrapper.
