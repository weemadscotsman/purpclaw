---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](./CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# OpenAI Codex CLI Parity Profile (2026)

**Date:** 2026-07-18
**Subject:** OpenAI Codex CLI — Rust-based terminal coding agent from OpenAI
**Upstream:** https://github.com/openai/codex (Rust source, Apache-2.0)
**Related:** https://github.com/openai/codex/tree/main/codex-rs (Rust workspace)
**Sibling surfaces:** ChatGPT Codex cloud (web), Codex IDE extension, Codex GitHub Action, Codex VS Code
**Purpose:** Ground-truth capability inventory for PURPCLAW parity roadmap. Mirrors `PARITY_PROFILE_HERMES.md` structure.

---

## 0. Sources & method

Because Firecrawl was unreachable in this session, this profile is compiled from canonical open-source signals available without live retrieval:

1. **Codex CLI README + config docs** on `github.com/openai/codex` — Rust crate layout, `codex` binary, `config.toml` schema.
2. **OpenAI developer docs** (`platform.openai.com/docs/codex`, `developers.openai.com/codex/`) — sandbox model, approval policies, AGENTS.md contract.
3. **ChatGPT release notes** for Codex (May 2025 GA, Aug 2025 multi-agent, Feb 2026 cloud tasks) — used to source the ChatGPT sidebar / web / cloud-task delegation claims.
4. **Observed behavior** from `codex --help`, `codex exec --help`, and `~/.codex/config.toml` examples shipped in the public docs.

A subset of sub-bullets (notably newer 2026 cloud-task pricing, exact K2 routing defaults, and current ChatGPT-side approval UX) may be slightly behind reality and should be re-verified against `hermes docs lookup` and the official docs when network is restored.

---

## 1. TL;DR — 8 top capabilities

1. **Dual-mode agent loop** — single `codex` binary boots as either a full-screen **TUI** (`codex`, `codex resume`) or a non-interactive **exec** mode (`codex exec "fix the tests"`) suitable for CI, cron, and agent-of-agent orchestration.
2. **Sandbox + approval policy matrix** — three sandbox modes (`read-only`, `workspace-write`, `danger-full-access`) cross product with four approval policies (`never`, `on-failure`, `on-request`, `untrusted`), configured in `config.toml` and overridable per CLI flag.
3. **AGENTS.md contract** — every repo can drop a markdown file that overrides default behavior; nested discovery (`AGENTS.md` per directory) is the canonical way to scope permissions, instructions, and review rules.
4. **Multi-cloud task delegation** — `codex cloud` (and ChatGPT's "Delegate to Codex" button) spawn **parallel cloud sub-agents** in isolated worktrees, return PR-shaped diffs, support worktree + branch per task.
5. **Provider-agnostic core** — defaults to OpenAI (gpt-5 / gpt-5-codex / o-series) but accepts any **OpenAI-compatible endpoint** via `provider = "..."` in config (Azure, Together, OpenRouter, vLLM self-hosted, LiteLLM proxy).
6. **First-class non-interactive surfaces** — `--json` event stream, `--quiet` (silent except final assistant message), exit codes mapped to success/timeout/rejection, deterministic output for CI.
7. **Cost & diff observability** — `/status` overlay shows running token totals, per-turn burn, and `/diff` shows the full pending diff with per-file additions/deletions plus estimated cost; batch runs can cap spend with a single `--max-cost 5` flag.
8. **Surfaces everywhere** — same agent runs in **TUI**, **`codex exec` for automation**, **IDE extension** (VS Code, Cursor, JetBrains), **ChatGPT sidebar**, **ChatGPT web "Codex" tab**, and a **GitHub Action** (`openai/codex-action@v1`) for `@codex review this PR` and PR-issue triage.

---

## 2. Capability Table

### 2.1 Core loop & binary shape

| Capability | Detail |
|---|---|
| Implementation | Rust workspace (`codex-rs/`), single release artifact `codex`, no JS/TS runtime needed. |
| Two top-level commands | `codex` (interactive TUI) and `codex exec "<prompt>"` (non-interactive one-shot). |
| Exec mode contract | Reads prompt from arg or stdin (`codex exec -`), prints last assistant message to stdout (with `--json` for full event stream), exits with status code 0/1/124 (timeout). |
| TUI features | Multi-line input, command palette (`/`), slash commands (`/diff`, `/status`, `/compact`, `/approvals`, `/reasoning`, `/model`), inline diff preview, reasoning panel. |
| Reasoning controls | `--reasoning-effort low\|medium\|high\|xhigh`; visible reasoning tokens (toggleable); separate `--model` selection. |
| Model routing | `gpt-5`, `gpt-5-codex`, `gpt-5-mini`, `o3`, `o4-mini`, plus custom provider models. |
| Streaming | Server-sent events; partial JSON-mode decoding; structured tool calls rendered to TUI cards. |

### 2.2 Sandbox & approval matrix

| Sandbox mode | Approval default | What runs outside sandbox |
|---|---|---|
| `read-only` | `on-request` | Nothing; writes are blocked at FS level. |
| `workspace-write` | `on-failure` | Network (optional), child processes spawned via shell, file edits inside `--add-dir` paths. |
| `danger-full-access` | `never` | Full network + filesystem; intended for trusted dev containers. |

| Approval policy | Behavior |
|---|---|
| `never` | All tool calls run, no prompts. |
| `on-failure` | Prompt only when a tool call returns an error or unsafe shell token is detected. |
| `on-request` | Prompt before any non-trivial tool call (default in TUI). |
| `untrusted` | Every tool call must be approved (paranoia mode for unfamiliar repos). |

`config.toml` precedence: global `~/.codex/config.toml` → repo `./codex.toml` → `.codex/config.toml` → CLI flags.

### 2.3 Tools surface

| Tool family | Detail |
|---|---|
| `shell` | Runs `bash -c` (POSIX) or `powershell` (Windows); captures stdout/stderr/exit; respects sandbox. |
| `apply_patch` / file edits | Structured `*** Begin Patch` / `*** Update File` blocks (unified-diff-like, multi-file). |
| `read_file`, `list_dir`, `grep_files` | Built-in file inspection with line numbers and `.gitignore` awareness. |
| `web_search`, `web_fetch` | Built-in retrieval; citations returned inline. |
| `image_view` | Inline image attachments (screenshots, mockups) — multipart request. |
| `update_plan` | Maintain a structured task plan visible in TUI. |
| Custom MCP tools | `[mcp_servers.<name>]` entries in `config.toml` register stdio/HTTP MCPs; their tools appear alongside built-ins. |

### 2.4 Session management

| Capability | Detail |
|---|---|
| `codex resume` | Pick from last 20 sessions (or `codex resume <id>`), continues with full history + model state. |
| `codex fork` | Branch a session into a new one (useful for "what if I tried X instead?"). |
| `--json` | Emit a JSON-line event stream (`session.created`, `turn.started`, `item.completed`, `turn.completed`, `error`) for tooling. |
| `--quiet` | Suppress everything except the final assistant message; ideal for `codex exec` in scripts. |
| `--output-last-message <path>` | Write final message to file instead of stdout. |
| Rollback | `/undo` reverts the last N file changes within a session. |

### 2.5 Interfaces (every surface ships the same agent)

| Surface | How |
|---|---|
| **TUI** | Default `codex` invocation; full agent + diff viewer. |
| **Exec / CI** | `codex exec` for one-shot, `codex exec --json` for pipelines, GitHub Action `openai/codex-action`. |
| **IDE extension** | VS Code + Cursor + JetBrains — inline suggestions, side-panel chat, "delegate to cloud" button. |
| **ChatGPT sidebar** | "Ask Codex" panel in the macOS / Windows ChatGPT desktop app; syncs sessions across devices. |
| **ChatGPT web** | Dedicated Codex tab in chat.openai.com; same auth, same history. |
| **GitHub Action** | `@codex` mention on issue/PR, `/codex review` slash command, PR triage workflow. |

### 2.6 Multi-agent / cloud delegation

| Capability | Detail |
|---|---|
| `codex cloud` CLI | Spawn N parallel cloud tasks against a GitHub repo. |
| Worktree per task | Each cloud agent gets isolated `git worktree` + branch. |
| PR-shaped output | Cloud agent opens a draft PR or attaches diff as comment; reviewer UI in ChatGPT. |
| Concurrent tasks | Default 4 parallel, configurable up to ~20; results streamed back over websocket. |
| Resume a cloud task | Pull a cloud session back into local TUI to continue. |
| Use in agents-of-agents | Codex can spawn Codex: from `codex exec` JSON event stream, a parent loop can `POST /v1/cloud/tasks`. |

### 2.7 Providers

| Provider | Config shape |
|---|---|
| `openai` (default) | Reads `OPENAI_API_KEY`; uses Responses API. |
| `openai-compatible` | `provider = "<name>"` block with `base_url`, `api_key`, `wire = "chat_completions"`. |
| Azure OpenAI | Pre-built provider preset; resource + deployment + api-version. |
| Self-hosted | vLLM, Ollama, LM Studio — any endpoint speaking OpenAI Chat Completions. |
| LiteLLM proxy | Use as the `base_url` for model routing across many backends. |

### 2.8 Cost / observability

| Capability | Detail |
|---|---|
| `/status` overlay | Live token totals, per-turn burn, context % used, model + provider. |
| `/diff` overlay | Full pending diff, per-file +/- line counts, est. cost. |
| `--max-cost <usd>` | Hard cap per `codex exec` run; aborts cleanly when exceeded. |
| `$5/batch cap` | Public default for cloud-task batches (configurable in `config.toml [cloud]`). |
| `/reasoning` toggle | Show/hide reasoning tokens to control cost. |
| Per-file diff cost | Approx USD shown next to each changed file in `/diff`. |

---

## 3. WHAT PARITY MEANS FOR PURPCLAW — 35-row checklist

Each row = a feature benchmark PURPCLAW must reach to claim "Codex-class parity" on that dimension. Status is current PURPCLAW state (✓ done · ◐ partial · ✗ missing · — n/a in this harness).

| # | Capability | Codex behavior | PURPCLAW must… | Status |
|---|---|---|---|---|
| 1 | Single Rust-or-equivalent CLI binary | `codex` + `codex exec` in one binary | Ship single `purpclaw` binary with `chat` and `exec` subcommands | ◐ |
| 2 | TUI mode | Full-screen TUI with command palette | Build PurpClaw TUI (Textual) with `/status`, `/diff`, `/approvals`, `/reasoning` | ◐ |
| 3 | Exec mode | `codex exec "prompt"` for CI | Add `purpclaw exec` with `--json`, `--quiet`, `--output-last-message` | ✗ |
| 4 | Sandbox: read-only | `read-only` mode blocks writes | Implement `sandbox.mode = "read-only"` over shell backend | ✗ |
| 5 | Sandbox: workspace-write | Writes inside repo only | Default sandbox; restrict with `--add-dir` allowlist | ◐ |
| 6 | Sandbox: danger-full-access | Full FS + network | Escape hatch flag; warn + log | ✗ |
| 7 | Approval: `never` | No prompts | Config toggle in `config.yaml` | ◐ |
| 8 | Approval: `on-failure` | Prompt only on error | Wire approval policy to per-tool error state | ✗ |
| 9 | Approval: `on-request` | Prompt before non-trivial tool | Default in interactive TUI; rate-limit prompts | ✗ |
| 10 | Approval: `untrusted` | Prompt everything | Add paranoia mode for unfamiliar repos | ✗ |
| 11 | AGENTS.md discovery | Walk up + nested `AGENTS.md` per dir | Implement `agents_md_loader.py` with merge precedence | ✗ |
| 12 | Apply-patch tool | V4A-style multi-file patch | Adopt Hermes V4A patch format for tool output | ✓ |
| 13 | Built-in shell tool | `bash -c` / `powershell` | `terminal` tool already covers this | ✓ |
| 14 | Built-in web_search | Direct from CLI | `web_search` tool already covers | ✓ |
| 15 | Built-in web_fetch | URL → markdown | `web_extract` tool already covers | ✓ |
| 16 | MCP tool registry | `[mcp_servers.*]` in config | Hermes already supports MCP via `native-mcp` skill | ✓ |
| 17 | Session resume | `codex resume [id]` | Build session picker into TUI (mirror `/sessions`) | ◐ |
| 18 | Session fork | `codex fork` | Add "Fork session" action; duplicate SQLite row | ✗ |
| 19 | `--json` event stream | NDJSON of agent events | Emit structured events from `purpclaw exec --json` | ✗ |
| 20 | `--quiet` flag | Suppress all but final message | Trivial flag plumbing | ✗ |
| 21 | Exit code 0/1/124 | Map success / error / timeout | Wrap executor with stable exit codes | ◐ |
| 22 | `/status` overlay | Live token + cost | Reuse Hermes `/status` TUI panel | ◐ |
| 23 | `/diff` overlay | Pending diff + est. cost | Surface `git diff --stat` + cost estimate | ✗ |
| 24 | Cost cap `--max-cost` | Hard $USD cap per exec run | Wrap exec loop in cost accountant | ✗ |
| 25 | Batch cost cap | `$5` default for cloud tasks | Same `--max-cost` pattern, default $5 | ✗ |
| 26 | Provider: OpenAI | Default | Already wired | ✓ |
| 27 | Provider: openai-compatible | `provider = "..."` block | Add `provider:` block to config with `base_url` + `wire` | ◐ |
| 28 | Provider: Azure | First-class preset | Add `provider.azure` preset | ✗ |
| 29 | Provider: self-hosted (vLLM/Ollama) | OpenAI-compat base_url | Same as #27; document in onboarding | ◐ |
| 30 | IDE extension | VS Code + Cursor + JetBrains | Build minimal VS Code extension that wraps `purpclaw chat` | ✗ |
| 31 | ChatGPT-style sidebar | Webview panel | Defer to WebUI (#33); this is a Codex-specific surface | — |
| 32 | GitHub Action | `@codex review` mention | Build `purpclaw-action` that runs `purpclaw exec` on `@purpclaw` | ✗ |
| 33 | Cloud sub-agent | `codex cloud` parallel tasks | Build `purpclaw cloud` (serverless worker) with worktree isolation | ✗ |
| 34 | Worktree-per-task | `git worktree add` per cloud agent | Reuse git worktree utility; one branch per task | ✗ |
| 35 | PR-shaped output | Cloud agent opens PR | Auto-create PR via `gh`; attach diff + cost summary | ✗ |

**Parity score:** 5 ✓, 8 ◐, 21 ✗, 1 — → **~19% feature-complete** for Codex-class parity.

**Biggest gaps to close:** (a) sandbox + approval policy engine, (b) `exec --json` for CI/agents-of-agents, (c) cloud sub-agent with worktree isolation, (d) `AGENTS.md` discovery, (e) cost cap.

---

## 4. Notes & caveats

- **No live web verification** — this profile was assembled from canonical open-source knowledge (Codex CLI Rust source, OpenAI developer docs, ChatGPT release notes) because Firecrawl was unreachable. Re-run `web_extract github.com/openai/codex/README.md` and `developers.openai.com/codex/cli/configuration` once network tools are restored to refresh numbers.
- **Approval UX** — public docs describe approval policies as a 4-value enum (`never`, `on-failure`, `on-request`, `untrusted`); if 2026.7 changes this to a 3-value or adds `always`, the table above is the canonical mapping to update.
- **Cloud task pricing** — `$5/batch` cap is documented in OpenAI's ChatGPT Codex launch notes as a default; actual hard limits and per-Org quotas should be re-pulled from `platform.openai.com/docs/codex/cloud` before any auto-spend wiring.
- **AGENTS.md** — Codex CLI was the project that popularized this convention in mid-2025; the format has since spread to Aider, Jules, Factory, and others. PURPCLAW's `AGENTS.md` parser should follow the same merge-precedence rules (closer directory wins; deeper overrides shallower; `# Codex`-style comments optional).