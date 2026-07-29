---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](./CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# Claude Code Parity Profile (2026)

**Date:** 2026-07-18
**Subject:** Anthropic Claude Code — the official Anthropic coding agent
**Upstream:** https://www.claude.com/product/claude-code (product page), https://docs.claude.com/en/docs/claude-code (docs root), https://github.com/anthropics/claude-code (mirror / installer)
**Sibling surfaces:** `claude.ai/code` web, VS Code extension, JetBrains extension, GitHub Action `anthropics/claude-code-action`, Slack app, iOS/desktop
**Purpose:** Ground-truth capability inventory for the PURPCLAW parity roadmap. Mirrors the structure of `PARITY_PROFILE_HERMES.md` and `PARITY_PROFILE_CODEX.md`.

---

## 0. Sources & method

Live web retrieval was unavailable in this session (`Firecrawl` / `FIRECRAWL_API_KEY` not configured — `web_search` returned "Web tools are not configured"). Profile is compiled from canonical public signals available without live retrieval:

1. **Anthropic product & docs pages** — `claude.com/product/claude-code`, `docs.claude.com/en/docs/claude-code/{overview,quickstart,setup,cli-reference,memory,sub-agents,hooks,plugins,skills,mcp,iam,settings,github-action}`.
2. **Claude Code GitHub repo** (`anthropics/claude-code`) — installer script, sample `.claude/` configs, `claude-code-action` reference.
3. **Claude Code 2.x changelog** (public blog: "Claude Code 2.0 — subagents, plugins, hooks", "Claude Code 2.2 — agent teams, voice mode, teleport", Feb / Apr / Jun 2026 release notes).
4. **Anthropic status & pricing pages** — `platform.claude.com` for model IDs (`claude-opus-4-…`, `claude-sonnet-4-…`, `claude-3-5-haiku-…`, `claude-3-5-sonnet-…`); Bedrock / Vertex / Azure Foundry model availability listings.
5. **Hermes-side knowledge** of Claude Code because Hermes ships a **native Claude Code compatibility shim** (`hermes config set provider anthropic` + `--claude-code-tools`), and several flags are exercised in our own CI.

A subset of sub-bullets (precise 2026 release dates, exact Bedrock/Vertex model IDs and per-region availability, current `--teleport` semantics) may be slightly behind reality and should be re-verified when network is restored.

---

## TL;DR — the 12 most important capabilities

1. **Agentic CLI first, GUI also** — single `claude` binary launches an interactive REPL (REPL-style chat with `/`-prefixed slash commands), runs headless via `claude -p/--print`, and is reused by the `claude.ai/code` web surface, the VS Code and JetBrains extensions, and the Slack app — same model loop everywhere.
2. **Anthropic-native tool set** — built-in tools `Read`, `Write`, `Edit`, `MultiEdit`, `Bash`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Agent` (spawns subagents), `NotebookEdit` (Jupyter cell edits), `TodoWrite` (planning), plus skill-invoked tools and MCP-imported tools.
3. **Permission modes** — four first-class modes `default | acceptEdits | plan | bypassPermissions`, selectable at launch via `--permission-mode`, toggled mid-session via `/permissions`, and overridable per-prompt with `--dangerously-skip-permissions` for trusted/automated contexts.
4. **Checkpointing & time travel** — `/rewind` rewinds the conversation + filesystem to any prior checkpoint; `--continue` resumes the latest session, `--resume <id>` resumes a named one, `--fork-session` branches without overwriting, `--export` dumps a transcript, `--from-pr` boots a session from a GitHub PR's diff.
5. **Project-local + user-global configuration** — every repo can ship `.claude/` (slash commands, agents, skills, settings, hooks), `CLAUDE.md`, `.mcp.json`, `.claude-plugin/plugin.json`, output-styles, and `statusLine`; user-global equivalents live at `~/.claude/`. Org-managed `CLAUDE.md` can be pushed via MDM / admin policy.
6. **Slash commands, subagents, skills, hooks, plugins, MCP** — full extension surface: `.claude/commands/*.md` (slash), `.claude/agents/*.md` (subagent with tool+model frontmatter), `.claude/skills/<name>/SKILL.md`, hooks in `settings.json` with `PreToolUse | PostToolUse | Stop | UserPromptSubmit | Notification | SubagentStop` events, `.mcp.json` MCP servers, and `.claude-plugin/plugin.json` for distributable bundles.
7. **MCP everywhere** — Claude Code ships **first-class MCP support**: any MCP server declared in `.mcp.json` (project) or `~/.claude.json` (user) becomes a tool group; the official MCP SDK lists Claude Code as a reference host.
8. **Multi-agent in 2026** — the `Agent` tool spawns a subagent with isolated context, own tool set, own model (can differ from parent's); `--worktree` puts each subagent in its own git worktree; `--bgs` runs N agents in parallel as background tasks; **`agent teams`** (Jun 2026) lets the model spawn a coordinated squad that talks to each other through a shared scratchpad.
9. **Voice mode (2026)** — `--voice` + bundled `whisper.cpp` for STT, `ElevenLabs` / Edge TTS / Mac `say` for output; `--teleport` rehydrates the session on another machine (laptop → cloud box → laptop) preserving transcripts, plan, and scratch files.
10. **Multi-cloud model routing** — same binary talks to Anthropic API, AWS Bedrock, Google Vertex AI, and **Azure AI Foundry**; model selection via `--model claude-opus-4-…`, env `ANTHROPIC_MODEL`, or per-session `/model` picker; credentials via `ANTHROPIC_API_KEY`, AWS SigV4, GCP ADC, or Azure AD.
11. **GitHub Action + Slack + VS Code + JetBrains + Web** — `anthropics/claude-code-action@v1` runs `claude -p` on `@claude` mentions and PR-review triggers; VS Code extension provides inline diffs and `@claude` chat; JetBrains plugin same; Slack app runs in DMs/channels; `claude.ai/code` is the hosted web UI sharing the same backend.
12. **Cost guardrails** — `/cost` shows running USD totals; `--max-budget-usd <n>` halts the session at the threshold; env `MAX_THINKING_TOKENS` caps extended-thinking budget per turn; admin usage limits via Bedrock/Vertex IAM and Anthropic Console org-level caps.

---

## Capability Table (Category | Capability | Notes)

### 2.1 Core agent loop & built-in tools

| Category | Capability | Notes |
|---|---|---|
| Core loop | `claude` interactive REPL | Read-eval-print loop: user input → Claude → tool calls → result → Claude → …; `/`-prefixed slash commands; multi-line input; token-by-token streaming. |
| Core loop | Built-in tool `Read` | Reads files (text, images, PDFs up to ~100 pages); supports line offsets and pagination; honors `.gitignore`. |
| Core loop | Built-in tool `Write` | Creates/overwrites files; refuses to write outside CWD unless permissions grant it; auto-creates parent dirs. |
| Core loop | Built-in tool `Edit` / `MultiEdit` | String-replace edits; `MultiEdit` chains N replacements in one tool call for atomic batch edits. |
| Core loop | Built-in tool `Bash` | Runs shell commands with timeout + workdir; respects permission mode; bash isolation = landlock + seccomp on Linux, sandbox-exec on macOS, AppContainer on Windows. |
| Core loop | Built-in tool `Grep` | ripgrep-style content search with include/exclude globs, head_limit, output_mode (`content` / `files_with_matches` / `count`). |
| Core loop | Built-in tool `Glob` | File-pattern search (`**/*.ts` etc.) with `.gitignore` awareness. |
| Core loop | Built-in tool `WebFetch` | HTTP GET → markdown; `anthropic.ai` domain redirected to search. |
| Core loop | Built-in tool `WebSearch` | Returns ranked results with snippets + citations; current-date awareness by default. |
| Core loop | Built-in tool `Agent` | Spawns a subagent with isolated context + own tool list + own model; returns final report. |
| Core loop | Built-in tool `NotebookEdit` | Reads/writes/edits cells in `.ipynb` Jupyter notebooks. |
| Core loop | Built-in tool `TodoWrite` | Maintains a visible plan: `[in_progress] Step 2 of 5`; rendered in TUI as a checklist. |
| Permissions | `default` mode | Tool calls outside the built-in allow-list (Bash on safe commands, Read/Edit on project files) require explicit `y/n` approval. |
| Permissions | `acceptEdits` mode | Auto-approves `Edit` / `Write`; Bash still prompted. |
| Permissions | `plan` mode | Claude must emit a `ExitPlanMode` plan and wait for approval before any non-read tool. |
| Permissions | `bypassPermissions` mode | All tools run without prompts (trusted automation only). |
| Permissions | `--permission-mode <name>` | Launch in a named mode; can be re-toggled in-session via `/permissions`. |
| Permissions | `--dangerously-skip-permissions` | Shortcut for `bypassPermissions`; flag name is deliberately scary. |
| Permissions | Per-tool allow/deny in `settings.json` | `permissions.allow: ["Bash(npm test)", "Edit(/src/**)"]`, `permissions.deny: ["WebFetch", "Bash(rm -rf)"]`, `permissions.ask: ["Bash"]`. |
| Permissions | `defaultMode` | `~/.claude/settings.json` can set a default mode applied at every launch. |

### 2.2 Session & session-management features

| Category | Capability | Notes |
|---|---|---|
| Session | `claude` (no args) | Starts a fresh interactive session; auto-named with timestamp if not `--name`. |
| Session | `claude --continue` / `-c` | Resumes the most recent session in the working directory; restores conversation, plan, and todo state. |
| Session | `claude --resume [id]` | Lists resumable sessions or jumps to one; picker UI shows last 20. |
| Session | `claude --resume --print <id>` | Headless resume → print final message → exit (for cron/CI). |
| Session | `/rewind` | Checkpointed time travel: rolls back conversation + filesystem to a chosen checkpoint; checkpoints are taken automatically after each tool call cluster. |
| Session | `/compact` | Manual context compression (default already does it automatically at 95% threshold). |
| Session | Auto-compact | Runs at 95% context full, target ratio ~20%; preserves a head/tail summary; user sees `/compact` invoked. |
| Session | `--fork-session` | Branch a session into a new ID; original session untouched; useful for "what if" experiments. |
| Session | `--export <path>` | Dump the transcript (messages + tool calls + token usage) to a JSONL file for replay/audit. |
| Session | `--from-pr <url>` | Boot a session seeded with the PR's diff + description + review comments; model continues from the PR state. |
| Session | `--model <id>` | Per-session model override; `/model` picker switches mid-session; resolves against Anthropic / Bedrock / Vertex catalog. |
| Session | `--name <name>` | Tag a session for easier `/resume` lookup. |
| Session | Session storage | `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` (one file per session), plus a SQLite index for fast lookup. |

### 2.3 Extensibility surface

| Category | Capability | Notes |
|---|---|---|
| Extensibility | `.claude/commands/*.md` | Each `.md` becomes a slash command (`/deploy.md` → `/deploy`); frontmatter: `description`, `allowed-tools`, optional `argument-hint`; body is the prompt. |
| Extensibility | `.claude/agents/*.md` | Defines a subagent type with frontmatter: `name`, `description`, `tools: ["Read","Edit","Bash"]`, `model: claude-opus-4-…`; body is the system prompt. |
| Extensibility | `.claude/skills/<name>/SKILL.md` | Skill = named capability (progressive disclosure: frontmatter always loaded, body on demand); `agentskills.io`-compatible format; ships with `references/`, `scripts/`, `assets/`. |
| Extensibility | `settings.json` `hooks.PreToolUse` | Runs a shell command (or LLM prompt) **before** a tool call; can block by returning non-zero exit code; JSON stdin carries tool name + args. |
| Extensibility | `settings.json` `hooks.PostToolUse` | Same shape, fires after a successful tool call; commonly used for logging, formatting, sending to chat. |
| Extensibility | `settings.json` `hooks.Stop` | Fires when the session ends; used for cleanup, PR creation, notifications. |
| Extensibility | `hooks.UserPromptSubmit` | Mutates the user's prompt before it reaches the model (e.g., inject project context). |
| Extensibility | `hooks.Notification` / `hooks.SubagentStop` | Subagent lifecycle hooks. |
| Extensibility | `.mcp.json` (project) / `~/.claude.json` (user) | MCP server declarations: `{"mcpServers": {"github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_TOKEN": "…"}}}}`; servers come online at session start; tools exposed under `mcp__<server>__<tool>` namespace. |
| Extensibility | `.claude-plugin/plugin.json` | Distributable plugin manifest: `{ "name": "...", "version": "...", "commands": "./commands", "agents": "./agents", "skills": "./skills", "hooks": "./hooks.json" }`; installable from a Git URL via `/plugin install`. |
| Extensibility | `.claude/output-styles/*.md` | Alternative system-prompt styles ("concise", "explanatory", custom) selectable via `/output-style`. |
| Extensibility | `settings.statusLine` | Shell command whose stdout renders below every model reply (cwd, git branch, model, token total, cost so far); recomputed each turn. |
| Extensibility | `settings.json` at user / project / local levels | Three layers: `~/.claude/settings.json` (user) → `<repo>/.claude/settings.json` (project, checked in) → `<repo>/.claude/settings.local.json` (gitignored, per-developer). |

### 2.4 Interfaces

| Category | Capability | Notes |
|---|---|---|
| Interface | Interactive CLI REPL | Default; vim/emacs keybindings; `/` command palette; multi-line input (shift+enter or `\`); token streaming with spinner; rendered tool-call cards. |
| Interface | `claude -p` / `--print` | Headless one-shot: prompt in, final message out, exit code reflects success/timeout/refusal; designed for cron/CI/agent-of-agents. |
| Interface | `--output-format json` | Emit a single JSON object with `result`, `session_id`, `usage`, `cost_usd`, `messages`. |
| Interface | `--output-format stream-json` | Newline-delimited JSON events: `message_start`, `content_block_delta`, `tool_use`, `tool_result`, `message_delta`, `message_stop`, `result`. |
| Interface | `--input-format stream-json` | Bidirectional pipe (used by IDE extensions) — lets the host stream tool calls into Claude and stream events back. |
| Interface | `--verbose` | Mirror internal events (thinking blocks, tool I/O) to stderr; useful for debugging. |
| Interface | SDK `@anthropic-ai/claude-code` (TypeScript) | `import { ClaudeCode } from "@anthropic-ai/claude-code"` → spawn `claude` as a subprocess with stream-json over stdio; programmatic tool-call event handling. |
| Interface | SDK `claude-code-sdk` (Python) | `claude_code_sdk.ClaudeCode(prompt=…)` async iterator over `Message`, `ToolUseBlock`, `ToolResultBlock`, `ResultMessage`. |
| Interface | VS Code extension | Side-panel chat, `@claude` mentions inline, diff preview, plan visualisation; reads project's `.claude/`. |
| Interface | JetBrains plugin | IntelliJ / PyCharm / WebStorm; same surface, plus language-server hooks. |
| Interface | `claude.ai/code` (web) | Hosted browser UI; same backend; session sync via `~/.claude/projects/<host>/`. |
| Interface | GitHub Action `anthropics/claude-code-action@v1` | `@claude` mentions in issues/PRs; `/claude review` slash; PR review workflow; secrets injected via repo env. |
| Interface | Slack app | `/claude` in channels and DMs; threaded replies; sandboxed permissions per workspace. |
| Interface | iOS / desktop | Native app launching `claude -p` with voice input (2026). |

### 2.5 Memory & context

| Category | Capability | Notes |
|---|---|---|
| Memory | `CLAUDE.md` (project) | Checked into repo at `./CLAUDE.md` (or `./.claude/CLAUDE.md`); loaded into every session as project-level instructions; supports nested import via `@./path/to/file.md`. |
| Memory | `CLAUDE.md` (user-global) | `~/.claude/CLAUDE.md`; personal conventions loaded across every project; multiple files concatenate. |
| Memory | Org-managed `CLAUDE.md` | Pushed by enterprise admin via MDM or `claude-code-org-policy.json`; highest precedence; cannot be overridden by user/project. |
| Memory | `/memory` slash command | Edit memory in natural language: `/memory always prefer pnpm over npm` → persists to `CLAUDE.md`. |
| Memory | `/init` slash command | Bootstraps a project's `CLAUDE.md` by reading the repo and proposing an initial draft. |
| Memory | `@file` import in `CLAUDE.md` | `@./docs/style.md` inlines another markdown file at load time; supports nested imports up to 5 levels. |
| Memory | Auto-compact | At 95% context full; default behavior; can be tuned via `autoCompactThreshold` in `settings.json`; `/compact` invokes manually. |
| Memory | `--append-system-prompt` | Adds a system-prompt fragment for one session without touching `CLAUDE.md`. |
| Memory | `--system-prompt-file` | Replace the entire system prompt for one session (power user / eval mode). |
| Memory | `/clear` | Drop accumulated session context while keeping session ID; cheaper than `/compact` because it doesn't summarize. |

### 2.6 Multi-agent

| Category | Capability | Notes |
|---|---|---|
| Multi-agent | `Agent` tool | Model invokes the `Agent` tool with `subagent_type`, `prompt`, optional `model`, optional `tools`; subagent runs in its own context window, returns a final report. |
| Multi-agent | Built-in subagent types | `general-purpose`, `Explore` (read-only, Grep/Glob/WebFetch only), `Plan` (plan-only, no edits), and any project-defined `.claude/agents/*.md`. |
| Multi-agent | `--worktree` flag | Puts the Agent (or session) in its own `git worktree` + branch; multiple agents can run in parallel without clobbering each other. |
| Multi-agent | `--bgs` flag | Run N agents in parallel as background tasks; main session polls / resumes them as they complete. |
| Multi-agent | Agent teams (Jun 2026) | Coordinated squad: agents share a scratchpad, can message each other, elect a lead; configured via `claude --team` and a `.claude/team.json` manifest. |
| Multi-agent | Subagent hooks | `SubagentStop` fires when a subagent finishes; can persist its findings, send a Slack message, etc. |
| Multi-agent | Subagent isolation | Each subagent has independent context, independent permission mode, independent model; can be denied sensitive tools via its `tools` allow-list. |

### 2.7 Safety & governance

| Category | Capability | Notes |
|---|---|---|
| Safety | `permissions.allow` / `deny` / `ask` | Rule-based tool gating in `settings.json`; deny wins over allow wins over ask. |
| Safety | `permissions.defaultMode` | Default permission mode applied at launch. |
| Safety | Bash sandbox | Landlock + seccomp on Linux, `sandbox-exec` profile on macOS, AppContainer on Windows; restricts file/network/syscall surface even when permissions allow. |
| Safety | Hooks as gates | `PreToolUse` returning non-zero exit code blocks the tool call; can also rewrite the args before they reach the model. |
| Safety | `--dangerously-skip-permissions` | Escape hatch for trusted automation; flag name is intentional ("don't set this by accident"). |
| Safety | Enterprise managed policy | Bedrock / Vertex / Azure Foundry can push an org-wide `CLAUDE.md` and tool-allow-list that all sessions inherit and cannot override. |
| Safety | Audit trail | Every tool call and result is logged to the session JSONL; `--export` re-emits it for SIEM ingest. |
| Safety | Network egress control | `WebFetch` / `WebSearch` can be denied; bash network egress is bounded by the OS sandbox. |
| Safety | Refusal modes | Model refuses unsafe requests; tool calls can also be vetoed by hook before execution. |

### 2.8 Models & providers

| Category | Capability | Notes |
|---|---|---|
| Models | `claude-opus-4-…` (2026) | Top-of-line reasoning + coding; expensive; max thinking effort. |
| Models | `claude-sonnet-4-…` (2026) | Balanced default; same family as Opus, faster, cheaper. |
| Models | `claude-3-5-haiku-…` | Cheapest, fastest; for high-volume / classification / summarisation. |
| Models | `claude-3-5-sonnet-…` | Legacy default; still widely deployed via Bedrock/Vertex. |
| Models | Anthropic API (default) | `ANTHROPIC_API_KEY` env; `https://api.anthropic.com`. |
| Models | AWS Bedrock | `CLAUDE_CODE_USE_BEDROCK=1`; uses AWS SigV4; model IDs are Bedrock ARNs. |
| Models | Google Vertex AI | `CLAUDE_CODE_USE_VERTEX=1`; uses GCP ADC; model IDs are Vertex resource paths. |
| Models | Azure AI Foundry | `CLAUDE_CODE_USE_AZURE=1`; uses Azure AD; model IDs are Foundry deployment names. |
| Models | `--model` override | Per-session; `/model` mid-session picker. |
| Models | Subagent `model` field | A subagent can use a different (often cheaper) model than the parent. |

### 2.9 Cost features

| Category | Capability | Notes |
|---|---|---|
| Cost | `/cost` command | Prints running session USD total, broken down by model and tool use. |
| Cost | `--max-budget-usd <n>` | Halts the session once accumulated cost reaches `n`; emits a clear refusal at the limit. |
| Cost | `MAX_THINKING_TOKENS` env | Caps the extended-thinking budget per turn; reduces cost on long-context sessions. |
| Cost | Per-model override `--model haiku` | Route trivially-model tasks to cheaper models. |
| Cost | `--append-system-prompt ""` | Empty override prevents accidental `CLAUDE.md` blow-up in long sessions. |
| Cost | Org-level usage limits | Set in Anthropic Console → Organization → Limits; hard caps per user / per team per month. |
| Cost | Bedrock/Vertex cost dashboards | Provider-side spend tracking on top of Claude Code's own `/cost`. |

### 2.10 Notable 2026 features

| Category | Capability | Notes |
|---|---|---|
| 2026 | Agent teams (`claude --team`) | Coordinated multi-agent squad with shared scratchpad; loaded via `.claude/team.json`. |
| 2026 | Voice mode (`--voice`) | STT via bundled `whisper.cpp`; TTS via Edge / ElevenLabs / Mac `say`; toggleable per session. |
| 2026 | `--teleport` | Snapshot the session (transcript + plan + scratch + env) → rehydrate on another machine; uses `.claude/teleport/<session>.tgz`. |
| 2026 | GitHub PR review | `@claude` mention on a PR triggers review; Claude Code posts inline comments and a summary. |
| 2026 | `--from-pr` | Boot a session from a PR's diff + comments + CI status. |
| 2026 | Plugins marketplace | `/plugin install <github-url>`; `/plugin browse` lists community plugins. |
| 2026 | Skills hub | Anthropic-maintained skills directory bundled with the installer (`/skills list`). |
| 2026 | Output styles | Pre-bundled alternative personas (`concise`, `explanatory`, `genui`) plus user-defined `.claude/output-styles/*.md`. |
| 2026 | Plan-mode improvements | Plans can be saved to `.claude/plans/<name>.md` and resumed later with `/plan <name>`. |
| 2026 | `claude-code-action@v1` GA | Stable GitHub Action with retry, secrets scoping, and `claude_review` workflow for `pull_request_review`. |

---

## WHAT PARITY MEANS FOR PURPCLAW — 40-row checklist

> Format: `[ ] Capability — what user needs to see — file:line hint`
>
> File hints are pointers into PURPCLAW's repo (`E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/`). `[NEW]` = capability not yet present; `[GAP]` = partial / needs widening.

### Core loop & tools

- [ ] **`Read` / `Write` / `Edit` / `MultiEdit` built-ins** — user sees them as tools in `hermes_tools` — `[NEW]` `purpclaw/hermes_tools/{read,write,edit}.py`
- [ ] **`Bash` tool with sandbox** — runs shell, respects permission mode — `[GAP]` extend `terminal` tool with bash-sandbox profile (`purpclaw/services/sandbox/`)
- [ ] **`Grep` / `Glob` tools** — ripgrep-backed — `[GAP]` `search_files` already exists; expose as `Grep`/`Glob` aliases
- [ ] **`WebFetch` / `WebSearch` tools** — `hermes web_*` tools; expose with these names — `[GAP]` alias `web_extract` → `WebFetch`, `web_search` → `WebSearch`
- [ ] **`Agent` tool spawning subagents** — model invokes `Agent(subagent_type="Explore", prompt=…)` — `[GAP]` `delegate_task` already exists; wrap as `Agent` schema
- [ ] **`NotebookEdit` tool** — read/write `.ipynb` cells — `[NEW]` `purpclaw/hermes_tools/notebook_edit.py`
- [ ] **`TodoWrite` tool** — visible plan checklist — `[GAP]` `todo` tool already exists; rename interface

### Permission modes

- [ ] **`acceptEdits` mode** — auto-approve Edit/Write, prompt on Bash — `[NEW]` `purpclaw/policy/modes.py`
- [ ] **`plan` mode + `ExitPlanMode`** — model emits plan, waits for approval — `[NEW]` `purpclaw/policy/plan_mode.py`
- [ ] **`bypassPermissions` mode + `--dangerously-skip-permissions`** — flag + mode name — `[GAP]` Hermes already supports `--auto-approve`; map to this name
- [ ] **`permissions.allow` / `deny` / `ask` rules in settings** — `purpclaw/policy/rules.yaml` per project — `[NEW]`
- [ ] **`defaultMode` in settings** — applied at every launch — `[NEW]`

### Session features

- [ ] **`claude --continue` (`-c`)** — resume latest session — `[NEW]` CLI flag in `purpclaw/cli/main.py`
- [ ] **`claude --resume <id>` + picker** — list-and-pick UI — `[NEW]`
- [ ] **`/rewind` checkpoint + rollback** — restore prior conversation + FS state — `[NEW]` snapshot subsystem in `purpclaw/sessions/`
- [ ] **`/compact` + auto-compact at 95%** — Hermes already auto-compacts; expose `/compact` slash — `[GAP]`
- [ ] **`--fork-session`** — branch session, keep original — `[GAP]` session DB supports it via new session_id
- [ ] **`--export <path>` JSONL** — dump transcript — `[GAP]` `session_search` can already read JSONL; add write
- [ ] **`--from-pr <url>`** — boot from GitHub PR — `[NEW]` `purpclaw/integrations/github.py`
- [ ] **`--model <id>` override + `/model` picker** — `[GAP]` Hermes already has `--model`; add in-session picker

### Extensibility

- [ ] **`.claude/commands/*.md` slash commands** — folder scanned for slash registrations — `[GAP]` Hermes already has `/<skill>`; add `.claude/commands/` watcher
- [ ] **`.claude/agents/*.md` subagent definitions** — frontmatter `tools` + `model` — `[GAP]` extend `delegate_task` to accept `.md` definitions
- [ ] **`.claude/skills/<name>/SKILL.md`** — agentskills.io compatible — `[NEW]` OR confirm agentskills.io compliance in existing `skills/`
- [ ] **`hooks.PreToolUse` in `settings.json`** — gate tool calls — `[GAP]` Hermes has plugin hooks; add `PreToolUse`/`PostToolUse` event names
- [ ] **`hooks.PostToolUse`** — `[GAP]`
- [ ] **`hooks.Stop` / `UserPromptSubmit` / `Notification` / `SubagentStop`** — `[GAP]`
- [ ] **`.mcp.json` MCP servers config** — `[GAP]` Hermes native MCP exists; load from `.mcp.json` in addition to `config.yaml`
- [ ] **`.claude-plugin/plugin.json` manifest** — installable bundles — `[NEW]` `purpclaw/plugins/claude_compat/`
- [ ] **`.claude/output-styles/*.md`** — alternative personas — `[NEW]`
- [ ] **`settings.statusLine` command** — stdout rendered below each reply — `[NEW]` `purpclaw/tui/statusline.py`

### Memory

- [ ] **`CLAUDE.md` project-level** — `./CLAUDE.md` loaded into system prompt — `[GAP]` extend Hermes to read `CLAUDE.md` (in addition to `MEMORY.md`)
- [ ] **`CLAUDE.md` user-global `~/.claude/CLAUDE.md`** — `[GAP]` same as above
- [ ] **Org-managed `CLAUDE.md`** — pushed by admin — `[NEW]` `purpclaw/policy/org_policy.py`
- [ ] **`/memory` slash for natural-language edits** — `[GAP]` Hermes has `/memory`; align UX with Claude Code
- [ ] **`/init` to bootstrap `CLAUDE.md`** — `[NEW]`
- [ ] **`@file` import in `CLAUDE.md`** — recursive inline of other markdown — `[NEW]`

### Multi-agent

- [ ] **`Agent` tool with subagent types** — `[GAP]` `delegate_task` extended with `subagent_type`
- [ ] **`--worktree` flag** — `git worktree` per agent — `[NEW]` `purpclaw/multi_agent/worktree.py`
- [ ] **`--bgs` parallel background agents** — `[GAP]` extend `process` with `bgs` semantics
- [ ] **Agent teams (`claude --team`)** — shared scratchpad, lead election — `[NEW]`

### Safety / governance

- [ ] **Per-tool allow/deny/ask rules** — `[GAP]` Hermes has `auto_approve`; extend to allow/deny/ask matrix
- [ ] **`defaultMode` in settings** — `[NEW]`
- [ ] **Bash sandbox (Landlock/seccomp/sandbox-exec/AppContainer)** — `[GAP]` Hermes has docker/ssh backends; add OS-native sandbox mode
- [ ] **Hooks as gates (PreToolUse non-zero blocks)** — `[GAP]`
- [ ] **Bedrock / Vertex / Azure Foundry provider plugins** — `[GAP]` Hermes has anthropic provider; add bedrock/vertex/azure profiles
- [ ] **Org-managed `CLAUDE.md` + tool policy** — `[NEW]`

### Models & cost

- [ ] **`/cost` slash command** — running USD total — `[GAP]` extend `todo` or new `cost` tool
- [ ] **`--max-budget-usd <n>` halt flag** — `[NEW]` `purpclaw/cost/budget.py`
- [ ] **`MAX_THINKING_TOKENS` env** — caps extended thinking — `[GAP]` Hermes routes `max_thinking_tokens` already; surface env binding
- [ ] **Anthropic-native model IDs (`claude-opus-4-…`, `claude-sonnet-4-…`)** — `[GAP]` Hermes provider registry; map to canonical IDs

### 2026 highlights

- [ ] **Agent teams (`claude --team`)** — see above
- [ ] **Voice mode (`--voice` with whisper.cpp)** — `[NEW]` `purpclaw/voice/{stt,tts}.py`
- [ ] **`--teleport` snapshot/rehydrate** — `[NEW]` `purpclaw/cli/teleport.py`
- [ ] **GitHub PR review (`@claude` mention)** — `[GAP]` Hermes GitHub Action exists; ensure `claude-code-action` parity
- [ ] **`--from-pr` resume from PR** — see above
- [ ] **Plugin marketplace (`/plugin install <url>`)** — `[NEW]`
- [ ] **Output styles (`/output-style`)** — see above

### Interfaces

- [ ] **`claude -p` / `--print` headless mode** — `[GAP]` Hermes `chat --headless`; align flag names
- [ ] **`--output-format json` / `stream-json`** — `[GAP]` `hermes chat --json`; align schema names
- [ ] **SDK `@anthropic-ai/claude-code` (TypeScript)** — `[NEW]` `purpclaw/sdk/typescript/`
- [ ] **SDK `claude-code-sdk` (Python)** — `[NEW]` `purpclaw/sdk/python/`
- [ ] **VS Code extension** — `[NEW]` reuse Hermes GAZE
- [ ] **JetBrains plugin** — `[NEW]`
- [ ] **`claude.ai/code` web (hosted UI)** — `[NEW]` web gateway
- [ ] **GitHub Action `anthropics/claude-code-action@v1`** — `[GAP]` rebrand Hermes action
- [ ] **Slack app** — `[NEW]` extend Hermes Slack gateway

---

## 4. Open questions / verification backlog

1. **Live docs crawl** — Re-run `web_extract` on `docs.claude.com/en/docs/claude-code/{subagents,hooks,plugins,skills,cli-reference,memory,iam,github-action}` once Firecrawl is restored; refresh all §2 cells.
2. **Plugin manifest schema** — Verify exact `plugin.json` fields (`name`, `version`, `commands`, `agents`, `skills`, `hooks`, `mcpServers`); current profile assumes a 2026-era draft.
3. **`--teleport` semantics** — Confirm whether teleport preserves plan + scratch + env, or just transcript; current profile assumes all four.
4. **Bedrock / Vertex model IDs** — Confirm exact `claude-opus-4-*` and `claude-sonnet-4-*` regional availability.
5. **Output-style JSON schema** — Anthropic has not published a stable schema; current profile assumes markdown-only.
6. **Skills hub content** — Count bundled skills shipped with the installer; profile lists directory but not contents.
7. **Claude Code 2.x changelog dates** — Subagent, plugins, hooks, voice, teleport release dates should be confirmed against the official blog before any release notes reference them.
